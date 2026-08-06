// Server-side (Supabase) persistence for the app's single active project.
// storageService.ts is the only caller — it writes through to both IndexedDB
// (instant local cache, offline fallback) and here (source of truth, synced
// across devices). Every function here is best-effort: callers wrap calls in
// try/catch so a flaky connection never breaks the local-first experience.
import { supabase, ASSETS_BUCKET, PROJECT_ROW_ID } from './supabaseClient';
import { AppState, DebateSegment, StoryboardScene, ThumbnailState, YoutubeImportData } from '../types';

interface StoredScenesShape {
  scriptSignature: string;
  scenes: StoryboardScene[];
  characterGuide: string;
}

interface ProjectRow {
  id: string;
  app_state: string;
  script_style: string | null;
  audio_voices: Record<string, string> | null;
  script: DebateSegment[];
  thumbnail_state: ThumbnailState | null;
  youtube_data: YoutubeImportData | null;
  storyboard: StoredScenesShape | null;
  shorts_scenes: StoredScenesShape | null;
  updated_at: string;
}

// project-assets is a PRIVATE bucket gated by RLS to the one logged-in owner —
// so assets are addressed by a marker (not a fetchable URL) and always moved
// through the authenticated SDK (upload/download), never a bare fetch().
const ASSET_MARKER_PREFIX = 'sbasset://';

const dataUrlToBlob = (url: string): Blob => {
  const [header, b64] = url.split(',');
  const contentType = header.slice(5, header.indexOf(';')) || 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
};

// Same in-memory blob:/data: URL never needs uploading twice in one session —
// autosave re-runs pushMainState/pushScenes on every edit, and without this
// cache each keystroke would re-upload every unchanged audio/image blob again.
const uploadCache = new Map<string, string>();

// Uploads a data:/blob: URL to Storage at `path` and returns an `sbasset://`
// marker. Already-remote values (previous marker, or some other external URL)
// are returned unchanged — no redundant re-upload.
export const uploadAsset = async (url: string | undefined | null, path: string): Promise<string | undefined> => {
  if (!url) return undefined;
  if (!url.startsWith('data:') && !url.startsWith('blob:')) return url;

  const cached = uploadCache.get(url);
  if (cached) return cached;

  const blob = url.startsWith('data:') ? dataUrlToBlob(url) : await (await fetch(url)).blob();
  const { error } = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: true });
  if (error) throw error;

  const marker = `${ASSET_MARKER_PREFIX}${path}`;
  uploadCache.set(url, marker);
  return marker;
};

// Downloads an `sbasset://` marker through the authenticated client (respects
// RLS — only works for the logged-in owner) and hands back a local blob: URL.
// Components already know how to use blob: URLs (same pattern local IndexedDB
// playback used), so no consumer needs to change.
export const remoteToBlobUrl = async (url: string | undefined | null): Promise<string | undefined> => {
  if (!url) return undefined;
  if (!url.startsWith(ASSET_MARKER_PREFIX)) return url; // not one of ours (data:/blob:/other) — pass through
  const path = url.slice(ASSET_MARKER_PREFIX.length);
  const { data, error } = await supabase.storage.from(ASSETS_BUCKET).download(path);
  if (error || !data) return undefined;
  return URL.createObjectURL(data);
};

// ── Project row read/write ──────────────────────────────────────────────────

export const fetchProjectRow = async (): Promise<ProjectRow | null> => {
  const { data, error } = await supabase
    .from('project_state')
    .select('*')
    .eq('id', PROJECT_ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return data as ProjectRow | null;
};

// Cheap poll used to decide whether a full row fetch (which downloads every
// changed asset) is even worth doing — see storageService's local-first load.
export const fetchProjectUpdatedAt = async (): Promise<string | null> => {
  const { data, error } = await supabase
    .from('project_state')
    .select('updated_at')
    .eq('id', PROJECT_ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return data?.updated_at ?? null;
};

export const pushMainState = async (
  appState: AppState,
  script: DebateSegment[],
  thumbnailState?: ThumbnailState,
  youtubeData?: YoutubeImportData | null,
): Promise<string> => {
  const scriptForCloud = await Promise.all(script.map(async seg => {
    const audioUrl = await uploadAsset(seg.audioUrl, `audio/${seg.id}`);
    if (!seg.visualConfig?.backgroundUrl) return { ...seg, audioUrl };
    const backgroundUrl = await uploadAsset(seg.visualConfig.backgroundUrl, `background/${seg.id}`);
    return { ...seg, audioUrl, visualConfig: { ...seg.visualConfig, backgroundUrl } };
  }));

  const thumbnailForCloud = thumbnailState
    ? { ...thumbnailState, referenceImage: null, thumbnailUrl: await uploadAsset(thumbnailState.thumbnailUrl ?? undefined, 'thumbnail/main') ?? null }
    : null;

  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from('project_state').upsert({
    id: PROJECT_ROW_ID,
    app_state: appState,
    script: scriptForCloud,
    thumbnail_state: thumbnailForCloud,
    youtube_data: youtubeData ?? null,
    updated_at: updatedAt,
  });
  if (error) throw error;
  return updatedAt;
};

const pushSceneSet = async (
  column: 'storyboard' | 'shorts_scenes',
  folder: string,
  script: DebateSegment[],
  scenes: StoryboardScene[],
  characterGuide: string,
): Promise<string> => {
  const scenesForCloud = await Promise.all(scenes.map(async sc => ({
    ...sc,
    imageUrl: await uploadAsset(sc.imageUrl, `${folder}/${sc.id}`),
  })));
  const payload: StoredScenesShape = {
    scriptSignature: script.map(s => s.id).join('|'),
    scenes: scenesForCloud,
    characterGuide,
  };
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from('project_state').upsert({
    id: PROJECT_ROW_ID,
    [column]: payload,
    updated_at: updatedAt,
  });
  if (error) throw error;
  return updatedAt;
};

export const pushStoryboardScenes = (script: DebateSegment[], scenes: StoryboardScene[], characterGuide: string) =>
  pushSceneSet('storyboard', 'storyboard', script, scenes, characterGuide);

export const pushShortsScenes = (script: DebateSegment[], scenes: StoryboardScene[], characterGuide: string) =>
  pushSceneSet('shorts_scenes', 'shorts', script, scenes, characterGuide);

// ── Reset ────────────────────────────────────────────────────────────────

export const resetProjectCloud = async (): Promise<void> => {
  const folders = ['audio', 'storyboard', 'shorts', 'thumbnail', 'background'];
  for (const folder of folders) {
    const { data: files } = await supabase.storage.from(ASSETS_BUCKET).list(folder);
    if (files?.length) {
      await supabase.storage.from(ASSETS_BUCKET).remove(files.map(f => `${folder}/${f.name}`));
    }
  }
  const { error } = await supabase.from('project_state').delete().eq('id', PROJECT_ROW_ID);
  if (error) throw error;
  uploadCache.clear();
};
