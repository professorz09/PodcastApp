import { get, set, del } from 'idb-keyval';
import { AppState, DebateSegment, StoryboardScene, ThumbnailState, YoutubeImportData } from '../types';
import * as cloud from './cloudSync';

const STORE_KEY = 'autovid_state';
const SCENES_KEY = 'autovid_scenes';
const SHORTS_SCENES_KEY = 'autovid_shorts_scenes';
const LAST_SYNC_KEY = 'autovid_last_sync';

interface StoredSegment extends DebateSegment {
  audioBlob?: Blob | null;
}

interface StoredState {
  appState: AppState;
  script: StoredSegment[];
  thumbnailState?: ThumbnailState;
  youtubeData?: YoutubeImportData | null;
}

// Local cache stores the actual image bytes (Blob), never the imageUrl string
// as-is — when scenes come from the cloud, imageUrl is a session-scoped
// blob: URL that dies on reload, so caching that string verbatim would leave
// the local fallback pointing at nothing.
interface StoredScene extends Omit<StoryboardScene, 'imageUrl'> {
  imageBlob?: Blob | null;
}

interface StoredScenes {
  scriptSignature: string;
  scenes: StoredScene[];
  characterGuide: string;
}

interface LoadedState {
  appState: AppState;
  script: DebateSegment[];
  thumbnailState?: ThumbnailState;
  youtubeData?: YoutubeImportData | null;
}

interface LoadedScenes {
  scenes: StoryboardScene[];
  characterGuide: string;
}

// Script signature — unique identifier for a given script (join of segment IDs)
export const getScriptSignature = (script: DebateSegment[]): string =>
  script.map(s => s.id).join('|');

// ── Last-sync marker ─────────────────────────────────────────────────────────
// project_state is one row with one updated_at — a single marker (the last
// updated_at we know we're caught up with) is enough to cheaply decide
// whether ANY of app state / storyboard / shorts changed on another device,
// without downloading the row (and every asset in it) on every check.
const getLastSyncMarker = async (): Promise<string | null> => {
  try { return (await get<string>(LAST_SYNC_KEY)) ?? null; } catch { return null; }
};
const setLastSyncMarker = async (iso: string | undefined | null): Promise<void> => {
  if (!iso) return;
  try { await set(LAST_SYNC_KEY, iso); } catch { /* ignore */ }
};
const cloudIsNewer = async (): Promise<boolean> => {
  const remote = await cloud.fetchProjectUpdatedAt();
  if (!remote) return false;
  const local = await getLastSyncMarker();
  if (!local) return true;
  return new Date(remote).getTime() > new Date(local).getTime();
};

// ── Cloud push debouncing ────────────────────────────────────────────────────
// The app calls save*() on every edit (script text, scene image, etc). Local
// IndexedDB writes are cheap and stay immediate; cloud pushes are debounced so
// rapid edits collapse into one network round trip instead of spamming Supabase.
const CLOUD_PUSH_DEBOUNCE_MS = 1200;

function makeDebouncedPush<Args extends any[]>(push: (...args: Args) => Promise<string>, label: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      push(...args).then(setLastSyncMarker).catch(e => console.error(`Cloud sync (${label}) failed`, e));
    }, CLOUD_PUSH_DEBOUNCE_MS);
  };
  schedule.cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  return schedule;
}

const scheduleMainStatePush = makeDebouncedPush(cloud.pushMainState, 'state');
const scheduleScenesPush = makeDebouncedPush(cloud.pushStoryboardScenes, 'storyboard');
const scheduleShortsScenesPush = makeDebouncedPush(cloud.pushShortsScenes, 'shorts');

// ── Scene persistence (shared by Storyboard + Shorts, separate IndexedDB keys) ─

let _activeStoryboardBlobUrls: string[] = [];
let _activeShortsBlobUrls: string[] = [];

const saveScenesToKey = async (key: string, script: DebateSegment[], scenes: StoryboardScene[], characterGuide: string): Promise<void> => {
  const scenesToStore: StoredScene[] = await Promise.all(scenes.map(async sc => {
    let imageBlob: Blob | null = null;
    if (sc.imageUrl) {
      try { imageBlob = await (await fetch(sc.imageUrl)).blob(); } catch (e) { console.error('Failed to fetch scene image for storage', e); }
    }
    const { imageUrl, ...rest } = sc;
    return { ...rest, imageBlob };
  }));
  await set(key, { scriptSignature: getScriptSignature(script), scenes: scenesToStore, characterGuide });
};

const readLocalScenes = async (key: string, script: DebateSegment[], blobUrls: string[]): Promise<LoadedScenes | null> => {
  const stored = await get<StoredScenes>(key);
  if (!stored) return null;
  if (stored.scriptSignature !== getScriptSignature(script)) return null;

  blobUrls.forEach(u => URL.revokeObjectURL(u));
  blobUrls.length = 0;

  const scenes: StoryboardScene[] = stored.scenes.map(sc => {
    let imageUrl: string | undefined;
    if (sc.imageBlob) {
      imageUrl = URL.createObjectURL(sc.imageBlob);
      blobUrls.push(imageUrl);
    }
    const { imageBlob, ...rest } = sc;
    return { ...rest, imageUrl } as StoryboardScene;
  });
  return { scenes, characterGuide: stored.characterGuide };
};

const readCloudScenes = async (
  column: 'storyboard' | 'shorts_scenes',
  key: string,
  script: DebateSegment[],
  blobUrls: string[],
): Promise<LoadedScenes | null> => {
  const row = await cloud.fetchProjectRow();
  const stored = row?.[column];
  if (!stored || stored.scriptSignature !== getScriptSignature(script)) return null;

  blobUrls.forEach(u => URL.revokeObjectURL(u));
  blobUrls.length = 0;

  const scenes: StoryboardScene[] = await Promise.all(stored.scenes.map(async sc => {
    const imageUrl = await cloud.remoteToBlobUrl(sc.imageUrl);
    if (imageUrl) blobUrls.push(imageUrl);
    return { ...sc, imageUrl, isGenerating: false };
  }));

  // Cache locally so the next load on this device is instant.
  saveScenesToKey(key, script, scenes, stored.characterGuide).catch(() => {});
  if (row) await setLastSyncMarker(row.updated_at);

  return { scenes, characterGuide: stored.characterGuide };
};

export const saveScenes = async (
  script: DebateSegment[],
  scenes: StoryboardScene[],
  characterGuide: string,
): Promise<void> => {
  try {
    await saveScenesToKey(SCENES_KEY, script, scenes, characterGuide);
  } catch (e) {
    console.error('Failed to save scenes', e);
  }
  scheduleScenesPush(script, scenes, characterGuide);
};

// Instant local-first load — falls back to cloud only when nothing is cached
// locally yet (e.g. a fresh device). Pair with syncScenesFromCloudIfNewer for
// picking up changes made on another device without blocking this call.
export const loadScenes = async (script: DebateSegment[]): Promise<LoadedScenes | null> => {
  try {
    const local = await readLocalScenes(SCENES_KEY, script, _activeStoryboardBlobUrls);
    if (local) return local;
  } catch (e) {
    console.error('Failed to load scenes locally', e);
  }
  try {
    return await readCloudScenes('storyboard', SCENES_KEY, script, _activeStoryboardBlobUrls);
  } catch (e) {
    console.error('Cloud load (storyboard) failed', e);
    return null;
  }
};

export const syncScenesFromCloudIfNewer = async (script: DebateSegment[]): Promise<LoadedScenes | null> => {
  try {
    if (!(await cloudIsNewer())) return null;
    return await readCloudScenes('storyboard', SCENES_KEY, script, _activeStoryboardBlobUrls);
  } catch (e) {
    console.error('Background cloud sync (storyboard) failed', e);
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
    await saveScenesToKey(SHORTS_SCENES_KEY, script, scenes, characterGuide);
  } catch (e) { console.error('Failed to save shorts scenes', e); }
  scheduleShortsScenesPush(script, scenes, characterGuide);
};

export const loadShortsScenes = async (script: DebateSegment[]): Promise<LoadedScenes | null> => {
  try {
    const local = await readLocalScenes(SHORTS_SCENES_KEY, script, _activeShortsBlobUrls);
    if (local) return local;
  } catch (e) {
    console.error('Failed to load shorts scenes locally', e);
  }
  try {
    return await readCloudScenes('shorts_scenes', SHORTS_SCENES_KEY, script, _activeShortsBlobUrls);
  } catch (e) {
    console.error('Cloud load (shorts) failed', e);
    return null;
  }
};

export const syncShortsScenesFromCloudIfNewer = async (script: DebateSegment[]): Promise<LoadedScenes | null> => {
  try {
    if (!(await cloudIsNewer())) return null;
    return await readCloudScenes('shorts_scenes', SHORTS_SCENES_KEY, script, _activeShortsBlobUrls);
  } catch (e) {
    console.error('Background cloud sync (shorts) failed', e);
    return null;
  }
};

export const clearShortsScenes = async (): Promise<void> => {
  scheduleShortsScenesPush.cancel();
  try { await del(SHORTS_SCENES_KEY); } catch { /* ignore */ }
};

// ── Main state persistence ─────────────────────────────────────────────────────

let _activeStateBlobUrls: string[] = [];

const saveLocalMainState = async (
  appState: AppState,
  script: DebateSegment[],
  thumbnailState?: ThumbnailState,
  youtubeData?: YoutubeImportData | null,
): Promise<void> => {
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
};

export const saveState = async (
  appState: AppState,
  script: DebateSegment[],
  thumbnailState?: ThumbnailState,
  youtubeData?: YoutubeImportData | null,
) => {
  try {
    await saveLocalMainState(appState, script, thumbnailState, youtubeData);
  } catch (error) {
    console.error("Failed to save state to IndexedDB", error);
  }
  scheduleMainStatePush(appState, script, thumbnailState, youtubeData);
};

const readLocalMainState = async (): Promise<LoadedState | null> => {
  const stored = await get<StoredState>(STORE_KEY);
  if (!stored) return null;

  _activeStateBlobUrls.forEach(u => URL.revokeObjectURL(u));
  _activeStateBlobUrls = [];

  const loadedScript: DebateSegment[] = stored.script.map(seg => {
    let audioUrl = seg.audioUrl;
    if (seg.audioBlob) {
      audioUrl = URL.createObjectURL(seg.audioBlob);
      _activeStateBlobUrls.push(audioUrl);
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
};

const readCloudMainState = async (): Promise<LoadedState | null> => {
  const row = await cloud.fetchProjectRow();
  if (!row || !(row.script?.length || row.youtube_data)) return null;

  _activeStateBlobUrls.forEach(u => URL.revokeObjectURL(u));
  _activeStateBlobUrls = [];

  const loadedScript: DebateSegment[] = await Promise.all(row.script.map(async seg => {
    const audioUrl = await cloud.remoteToBlobUrl(seg.audioUrl);
    if (audioUrl) _activeStateBlobUrls.push(audioUrl);
    if (!seg.visualConfig?.backgroundUrl) return { ...seg, audioUrl };
    const backgroundUrl = await cloud.remoteToBlobUrl(seg.visualConfig.backgroundUrl);
    if (backgroundUrl) _activeStateBlobUrls.push(backgroundUrl);
    return { ...seg, audioUrl, visualConfig: { ...seg.visualConfig, backgroundUrl } };
  }));

  let thumbnailState = row.thumbnail_state ?? undefined;
  if (thumbnailState?.thumbnailUrl) {
    const thumbnailUrl = await cloud.remoteToBlobUrl(thumbnailState.thumbnailUrl);
    if (thumbnailUrl) _activeStateBlobUrls.push(thumbnailUrl);
    thumbnailState = { ...thumbnailState, thumbnailUrl: thumbnailUrl ?? null };
  }

  const result: LoadedState = {
    appState: row.app_state as AppState,
    script: loadedScript,
    thumbnailState,
    youtubeData: row.youtube_data ?? null,
  };

  // Cache locally so the next load/refresh on this device is instant.
  saveLocalMainState(result.appState, result.script, result.thumbnailState, result.youtubeData).catch(() => {});
  await setLastSyncMarker(row.updated_at);

  return result;
};

// Instant local-first load. Only hits the network (and downloads every
// audio/image asset in the project) when nothing is cached on this device
// yet — a normal refresh on a device that's used the app before returns
// straight from IndexedDB with no network round trip at all.
export const loadState = async (): Promise<LoadedState | null> => {
  try {
    const local = await readLocalMainState();
    if (local) return local;
  } catch (error) {
    console.error("Failed to load state from IndexedDB", error);
  }
  try {
    return await readCloudMainState();
  } catch (error) {
    console.error("Cloud load (state) failed", error);
    return null;
  }
};

// Call once after the initial render (local or cloud) — cheaply checks
// whether another device pushed something newer and, only if so, does the
// full re-fetch. Never blocks the first paint.
export const syncStateFromCloudIfNewer = async (): Promise<LoadedState | null> => {
  try {
    if (!(await cloudIsNewer())) return null;
    return await readCloudMainState();
  } catch (error) {
    console.error("Background cloud sync (state) failed", error);
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
    await del(LAST_SYNC_KEY);
    _activeStateBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _activeStateBlobUrls = [];
    _activeStoryboardBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _activeStoryboardBlobUrls = [];
    _activeShortsBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _activeShortsBlobUrls = [];
  } catch (error) {
    console.error("Failed to clear state", error);
  }
  try {
    await cloud.resetProjectCloud();
  } catch (error) {
    console.error("Failed to clear cloud project state", error);
  }
};
