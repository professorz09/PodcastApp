import { get, set, del } from 'idb-keyval';
import { AppState, DebateSegment, StoryboardScene, ThumbnailState, YoutubeImportData } from '../types';
import * as cloud from './cloudSync';

const STORE_KEY = 'autovid_state';
const SCENES_KEY = 'autovid_scenes';
const SHORTS_SCENES_KEY = 'autovid_shorts_scenes';

interface StoredSegment extends DebateSegment {
  audioBlob?: Blob | null;
}

interface StoredState {
  appState: AppState;
  script: StoredSegment[];
  thumbnailState?: ThumbnailState;
  youtubeData?: YoutubeImportData | null;
}

interface StoredScenes {
  scriptSignature: string;
  scenes: StoryboardScene[];
  characterGuide: string;
}

// Script signature — unique identifier for a given script (join of segment IDs)
export const getScriptSignature = (script: DebateSegment[]): string =>
  script.map(s => s.id).join('|');

// ── Cloud push debouncing ────────────────────────────────────────────────────
// The app calls save*() on every edit (script text, scene image, etc). Local
// IndexedDB writes are cheap and stay immediate; cloud pushes are debounced so
// rapid edits collapse into one network round trip instead of spamming Supabase.
const CLOUD_PUSH_DEBOUNCE_MS = 1200;

function makeDebouncedPush<Args extends any[]>(push: (...args: Args) => Promise<void>, label: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      push(...args).catch(e => console.error(`Cloud sync (${label}) failed`, e));
    }, CLOUD_PUSH_DEBOUNCE_MS);
  };
  schedule.cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  return schedule;
}

const scheduleMainStatePush = makeDebouncedPush(cloud.pushMainState, 'state');
const scheduleScenesPush = makeDebouncedPush(cloud.pushStoryboardScenes, 'storyboard');
const scheduleShortsScenesPush = makeDebouncedPush(cloud.pushShortsScenes, 'shorts');

// ── Scene persistence ──────────────────────────────────────────────────────────

export const saveScenes = async (
  script: DebateSegment[],
  scenes: StoryboardScene[],
  characterGuide: string,
): Promise<void> => {
  try {
    const stored: StoredScenes = {
      scriptSignature: getScriptSignature(script),
      scenes,
      characterGuide,
    };
    await set(SCENES_KEY, stored);
  } catch (e) {
    console.error('Failed to save scenes', e);
  }
  scheduleScenesPush(script, scenes, characterGuide);
};

export const loadScenes = async (
  script: DebateSegment[],
): Promise<{ scenes: StoryboardScene[]; characterGuide: string } | null> => {
  const signature = getScriptSignature(script);

  try {
    const row = await cloud.fetchProjectRow();
    if (row?.storyboard && row.storyboard.scriptSignature === signature) {
      const scenes = await Promise.all(row.storyboard.scenes.map(async sc => ({
        ...sc,
        imageUrl: await cloud.remoteToBlobUrl(sc.imageUrl),
        isGenerating: false,
      })));
      return { scenes, characterGuide: row.storyboard.characterGuide };
    }
  } catch (e) {
    console.error('Cloud load (storyboard) failed, falling back to local', e);
  }

  try {
    const stored = await get<StoredScenes>(SCENES_KEY);
    if (!stored) return null;
    if (stored.scriptSignature !== signature) return null;
    return { scenes: stored.scenes, characterGuide: stored.characterGuide };
  } catch (e) {
    console.error('Failed to load scenes', e);
    return null;
  }
};

export const clearScenes = async (): Promise<void> => {
  scheduleScenesPush.cancel();
  try { await del(SCENES_KEY); } catch { /* ignore */ }
};

// ── Shorts scene persistence (separate key) ────────────────────────────────────

export const saveShortsScenes = async (
  script: DebateSegment[],
  scenes: StoryboardScene[],
  characterGuide: string,
): Promise<void> => {
  try {
    await set(SHORTS_SCENES_KEY, { scriptSignature: getScriptSignature(script), scenes, characterGuide });
  } catch (e) { console.error('Failed to save shorts scenes', e); }
  scheduleShortsScenesPush(script, scenes, characterGuide);
};

export const loadShortsScenes = async (
  script: DebateSegment[],
): Promise<{ scenes: StoryboardScene[]; characterGuide: string } | null> => {
  const signature = getScriptSignature(script);

  try {
    const row = await cloud.fetchProjectRow();
    if (row?.shorts_scenes && row.shorts_scenes.scriptSignature === signature) {
      const scenes = await Promise.all(row.shorts_scenes.scenes.map(async sc => ({
        ...sc,
        imageUrl: await cloud.remoteToBlobUrl(sc.imageUrl),
        isGenerating: false,
      })));
      return { scenes, characterGuide: row.shorts_scenes.characterGuide };
    }
  } catch (e) {
    console.error('Cloud load (shorts) failed, falling back to local', e);
  }

  try {
    const stored = await get<StoredScenes>(SHORTS_SCENES_KEY);
    if (!stored) return null;
    if (stored.scriptSignature !== signature) return null;
    return { scenes: stored.scenes, characterGuide: stored.characterGuide };
  } catch (e) { console.error('Failed to load shorts scenes', e); return null; }
};

export const clearShortsScenes = async (): Promise<void> => {
  scheduleShortsScenesPush.cancel();
  try { await del(SHORTS_SCENES_KEY); } catch { /* ignore */ }
};

// ── Main state persistence ─────────────────────────────────────────────────────

export const saveState = async (
  appState: AppState,
  script: DebateSegment[],
  thumbnailState?: ThumbnailState,
  youtubeData?: YoutubeImportData | null,
) => {
  try {
    const scriptToStore = await Promise.all(script.map(async (seg) => {
      let audioBlob = null;
      if (seg.audioUrl) {
        try {
          const res = await fetch(seg.audioUrl);
          audioBlob = await res.blob();
        } catch (e) {
          console.error("Failed to fetch blob for storage", e);
        }
      }
      return { ...seg, audioBlob, audioUrl: undefined };
    }));

    const thumbnailStateToStore = thumbnailState
      ? { ...thumbnailState, referenceImage: null }
      : thumbnailState;

    await set(STORE_KEY, { appState, script: scriptToStore, thumbnailState: thumbnailStateToStore, youtubeData: youtubeData ?? null });
  } catch (error) {
    console.error("Failed to save state to IndexedDB", error);
  }
  scheduleMainStatePush(appState, script, thumbnailState, youtubeData);
};

let _activeBlobUrls: string[] = [];

export const loadState = async (): Promise<{ appState: AppState, script: DebateSegment[], thumbnailState?: ThumbnailState, youtubeData?: YoutubeImportData | null } | null> => {
  // Cloud is the source of truth (syncs across devices) — try it first.
  try {
    const row = await cloud.fetchProjectRow();
    if (row && (row.script?.length || row.youtube_data)) {
      _activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
      _activeBlobUrls = [];

      const loadedScript: DebateSegment[] = await Promise.all(row.script.map(async seg => {
        const audioUrl = await cloud.remoteToBlobUrl(seg.audioUrl);
        if (audioUrl) _activeBlobUrls.push(audioUrl);
        if (!seg.visualConfig?.backgroundUrl) return { ...seg, audioUrl };
        const backgroundUrl = await cloud.remoteToBlobUrl(seg.visualConfig.backgroundUrl);
        if (backgroundUrl) _activeBlobUrls.push(backgroundUrl);
        return { ...seg, audioUrl, visualConfig: { ...seg.visualConfig, backgroundUrl } };
      }));

      let thumbnailState = row.thumbnail_state ?? undefined;
      if (thumbnailState?.thumbnailUrl) {
        const thumbnailUrl = await cloud.remoteToBlobUrl(thumbnailState.thumbnailUrl);
        if (thumbnailUrl) _activeBlobUrls.push(thumbnailUrl);
        thumbnailState = { ...thumbnailState, thumbnailUrl: thumbnailUrl ?? null };
      }

      return {
        appState: row.app_state as AppState,
        script: loadedScript,
        thumbnailState,
        youtubeData: row.youtube_data ?? null,
      };
    }
  } catch (error) {
    console.error("Cloud load (state) failed, falling back to local", error);
  }

  try {
    const stored = await get<StoredState>(STORE_KEY);
    if (!stored) return null;

    _activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _activeBlobUrls = [];

    const loadedScript: DebateSegment[] = stored.script.map(seg => {
      let audioUrl = seg.audioUrl;
      if (seg.audioBlob) {
        audioUrl = URL.createObjectURL(seg.audioBlob);
        _activeBlobUrls.push(audioUrl);
      }
      const { audioBlob, ...rest } = seg;
      return { ...rest, audioUrl } as DebateSegment;
    });

    return {
      appState: stored.appState,
      script: loadedScript,
      thumbnailState: stored.thumbnailState,
      youtubeData: stored.youtubeData ?? null,
    };
  } catch (error) {
    console.error("Failed to load state from IndexedDB", error);
    return null;
  }
};

export const clearState = async () => {
  scheduleMainStatePush.cancel();
  scheduleScenesPush.cancel();
  scheduleShortsScenesPush.cancel();
  try {
    await del(STORE_KEY);
    await del(SCENES_KEY);
    await del(SHORTS_SCENES_KEY);
    _activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _activeBlobUrls = [];
  } catch (error) {
    console.error("Failed to clear state", error);
  }
  try {
    await cloud.resetProjectCloud();
  } catch (error) {
    console.error("Failed to clear cloud project state", error);
  }
};
