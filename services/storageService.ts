import { get, set, del } from 'idb-keyval';
import { AppState, DebateSegment, StoryboardScene, ThumbnailState, YoutubeImportData } from '../types';

const STORE_KEY = 'autovid_state';
const SCENES_KEY = 'autovid_scenes';

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
};

export const loadScenes = async (
  script: DebateSegment[],
): Promise<{ scenes: StoryboardScene[]; characterGuide: string } | null> => {
  try {
    const stored = await get<StoredScenes>(SCENES_KEY);
    if (!stored) return null;
    // Only restore if script matches
    if (stored.scriptSignature !== getScriptSignature(script)) return null;
    return { scenes: stored.scenes, characterGuide: stored.characterGuide };
  } catch (e) {
    console.error('Failed to load scenes', e);
    return null;
  }
};

export const clearScenes = async (): Promise<void> => {
  try { await del(SCENES_KEY); } catch { /* ignore */ }
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

    await set(STORE_KEY, { appState, script: scriptToStore, thumbnailState, youtubeData: youtubeData ?? null });
  } catch (error) {
    console.error("Failed to save state to IndexedDB", error);
  }
};

let _activeBlobUrls: string[] = [];

export const loadState = async (): Promise<{ appState: AppState, script: DebateSegment[], thumbnailState?: ThumbnailState, youtubeData?: YoutubeImportData | null } | null> => {
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
  try {
    await del(STORE_KEY);
    await del(SCENES_KEY);
    _activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _activeBlobUrls = [];
  } catch (error) {
    console.error("Failed to clear state", error);
  }
};
