import { get, set, del } from 'idb-keyval';
import { AppState, DebateSegment, StoryboardScene, ThumbnailState, YoutubeImportData } from '../types';

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

// Local cache stores the actual image bytes (Blob), never the imageUrl string
// as-is — imageUrl is a session-scoped blob: URL that dies on reload, so
// caching that string verbatim would leave the reload pointing at nothing.
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
};

export const loadScenes = async (script: DebateSegment[]): Promise<LoadedScenes | null> => {
  try {
    return await readLocalScenes(SCENES_KEY, script, _activeStoryboardBlobUrls);
  } catch (e) {
    console.error('Failed to load scenes locally', e);
    return null;
  }
};

export const clearScenes = async (): Promise<void> => {
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
};

export const loadShortsScenes = async (script: DebateSegment[]): Promise<LoadedScenes | null> => {
  try {
    return await readLocalScenes(SHORTS_SCENES_KEY, script, _activeShortsBlobUrls);
  } catch (e) {
    console.error('Failed to load shorts scenes locally', e);
    return null;
  }
};

export const clearShortsScenes = async (): Promise<void> => {
  try { await del(SHORTS_SCENES_KEY); } catch { /* ignore */ }
};

// ── Main state persistence ─────────────────────────────────────────────────────

let _activeStateBlobUrls: string[] = [];

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
};

export const loadState = async (): Promise<LoadedState | null> => {
  try {
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
  } catch (error) {
    console.error("Failed to load state from IndexedDB", error);
    return null;
  }
};

export const clearState = async () => {
  try {
    await del(STORE_KEY);
    await del(SCENES_KEY);
    await del(SHORTS_SCENES_KEY);
    _activeStateBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _activeStateBlobUrls = [];
    _activeStoryboardBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _activeStoryboardBlobUrls = [];
    _activeShortsBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _activeShortsBlobUrls = [];
  } catch (error) {
    console.error("Failed to clear state", error);
  }
};
