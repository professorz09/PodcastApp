import { get, set, del } from 'idb-keyval';
import { AppState, DebateSegment, ThumbnailState, YoutubeImportData } from '../types';

const STORE_KEY = 'autovid_state';

interface StoredState {
  appState: AppState;
  script: DebateSegment[];
  thumbnailState?: ThumbnailState;
  youtubeData?: YoutubeImportData | null;
}

export const saveState = async (
  appState: AppState,
  script: DebateSegment[],
  thumbnailState?: ThumbnailState,
  youtubeData?: YoutubeImportData | null,
) => {
  try {
    // Convert audioUrls to Blobs for storage
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
      return {
        ...seg,
        audioBlob,
        audioUrl: undefined // Don't store the blob URL
      };
    }));

    await set(STORE_KEY, { appState, script: scriptToStore, thumbnailState, youtubeData: youtubeData ?? null });
  } catch (error) {
    console.error("Failed to save state to IndexedDB", error);
  }
};

// Track blob URLs created from loadState so we can revoke them on the next load
let _activeBlobUrls: string[] = [];

export const loadState = async (): Promise<{ appState: AppState, script: DebateSegment[], thumbnailState?: ThumbnailState, youtubeData?: YoutubeImportData | null } | null> => {
  try {
    const stored = await get<StoredState>(STORE_KEY);
    if (!stored) return null;

    // Revoke any blob URLs from the previous load to free memory
    _activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _activeBlobUrls = [];

    // Convert Blobs back to audioUrls
    const loadedScript: DebateSegment[] = stored.script.map(seg => {
      let audioUrl = seg.audioUrl;
      if (seg.audioBlob) {
        audioUrl = URL.createObjectURL(seg.audioBlob);
        _activeBlobUrls.push(audioUrl);
      }
      
      const { audioBlob, ...rest } = seg;
      return {
        ...rest,
        audioUrl
      } as DebateSegment;
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
    // Revoke any active blob URLs to free memory
    _activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _activeBlobUrls = [];
  } catch (error) {
    console.error("Failed to clear state", error);
  }
};
