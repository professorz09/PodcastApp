import { get, set, del } from 'idb-keyval';
import { AppState, DebateSegment, PhoneStudioSourceClip, StoryboardScene, ThumbnailState, YoutubeImportData } from '../types';
import { toast } from '../components/Toast';

const STORE_KEY = 'autovid_state';
const SCENES_KEY = 'autovid_scenes';
const SHORTS_SCENES_KEY = 'autovid_shorts_scenes';
const ENGLISH_VIDEO_VISUALS_KEY = 'autovid_english_video_visuals';

interface StoredSegment extends DebateSegment {
  audioBlob?: Blob | null;
}

interface StoredState {
  appState: AppState;
  script: StoredSegment[];
  thumbnailState?: ThumbnailState;
  youtubeData?: YoutubeImportData | null;
  // Phone Studio's uploaded source video + selected clip ranges — File objects
  // are structured-cloneable, so IndexedDB stores them directly (no separate
  // blob/name juggling needed like the audio/image blobs above).
  phoneSourceClips?: PhoneStudioSourceClip[];
  phoneVideoFile?: File | null;
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
  phoneSourceClips?: PhoneStudioSourceClip[];
  phoneVideoFile?: File | null;
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

// ── English Video visuals (speaker avatars, per-speaker backgrounds, Narrator
// avatar, global background) ─────────────────────────────────────────────────
// These live purely as HTMLImageElement React state inside EnglishVideoMaker —
// nothing wrote them to IndexedDB, so a refresh silently lost every uploaded/
// AI-generated image even though the script/audio itself survived. Stored
// keyed by script signature (same pattern as Storyboard/Shorts scenes above).

export interface EnglishVideoVisualsData {
  speakerImages: (HTMLImageElement | null)[];
  speakerBackgroundImages: (HTMLImageElement | null)[];
  narratorImage: HTMLImageElement | null;
  background: HTMLImageElement | null;
  backgroundColor?: string;
}

interface StoredEnglishVideoVisuals {
  scriptSignature: string;
  speakerImageBlobs: (Blob | null)[];
  speakerBackgroundBlobs: (Blob | null)[];
  narratorImageBlob: Blob | null;
  backgroundBlob: Blob | null;
  backgroundColor?: string;
}

let _englishVideoVisualsBlobUrls: string[] = [];

const imageToBlob = async (img: HTMLImageElement | null): Promise<Blob | null> => {
  if (!img?.src) return null;
  try {
    const res = await fetch(img.src);
    return await res.blob();
  } catch (e) {
    console.error('Failed to convert image to blob for storage', e);
    return null;
  }
};

const blobToImage = (blob: Blob | null, blobUrls: string[]): Promise<HTMLImageElement | null> => {
  if (!blob) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

export const saveEnglishVideoVisuals = async (
  script: DebateSegment[],
  data: EnglishVideoVisualsData,
): Promise<void> => {
  try {
    const [speakerImageBlobs, speakerBackgroundBlobs, narratorImageBlob, backgroundBlob] = await Promise.all([
      Promise.all(data.speakerImages.map(imageToBlob)),
      Promise.all(data.speakerBackgroundImages.map(imageToBlob)),
      imageToBlob(data.narratorImage),
      imageToBlob(data.background),
    ]);
    await set(ENGLISH_VIDEO_VISUALS_KEY, {
      scriptSignature: getScriptSignature(script),
      speakerImageBlobs, speakerBackgroundBlobs, narratorImageBlob, backgroundBlob,
      backgroundColor: data.backgroundColor,
    } as StoredEnglishVideoVisuals);
  } catch (e) {
    console.error('Failed to save English Video visuals', e);
  }
};

export const loadEnglishVideoVisuals = async (script: DebateSegment[]): Promise<EnglishVideoVisualsData | null> => {
  try {
    const stored = await get<StoredEnglishVideoVisuals>(ENGLISH_VIDEO_VISUALS_KEY);
    if (!stored) return null;
    if (stored.scriptSignature !== getScriptSignature(script)) return null;

    _englishVideoVisualsBlobUrls.forEach(u => URL.revokeObjectURL(u));
    _englishVideoVisualsBlobUrls = [];

    const [speakerImages, speakerBackgroundImages, narratorImage, background] = await Promise.all([
      Promise.all(stored.speakerImageBlobs.map(b => blobToImage(b, _englishVideoVisualsBlobUrls))),
      Promise.all(stored.speakerBackgroundBlobs.map(b => blobToImage(b, _englishVideoVisualsBlobUrls))),
      blobToImage(stored.narratorImageBlob, _englishVideoVisualsBlobUrls),
      blobToImage(stored.backgroundBlob, _englishVideoVisualsBlobUrls),
    ]);

    return { speakerImages, speakerBackgroundImages, narratorImage, background, backgroundColor: stored.backgroundColor };
  } catch (e) {
    console.error('Failed to load English Video visuals', e);
    return null;
  }
};

// ── Main state persistence ─────────────────────────────────────────────────────

let _activeStateBlobUrls: string[] = [];

// Guards against out-of-order writes: script updates fire in quick succession
// while audio generates segment-by-segment, each kicking off an async
// saveState() that fetches every segment's blob before writing. Without this,
// an earlier (less-complete) call can resolve after a later (more-complete)
// one and clobber it in IndexedDB — segments that had audio look "missing"
// after a refresh. Only the most recently started call is allowed to persist.
let _saveSeq = 0;

// Re-fetching + re-converting every segment's full audio Blob on EVERY save
// (saveState fires on every script change) adds up to a lot of redundant
// IndexedDB write volume for a multi-segment script — on space-constrained
// browsers (iOS Safari's IndexedDB quota especially) that made the whole
// set() call silently fail, so a save from BEFORE audio/sync finished stuck
// around and looked like "audio/sync disappeared after refresh". Caching
// already-converted blobs by their (stable, per-segment) audioUrl means only
// genuinely new/changed audio gets re-fetched each save.
let _audioBlobCache = new Map<string, Blob>();
let _quotaWarned = false;

export const saveState = async (
  appState: AppState,
  script: DebateSegment[],
  thumbnailState?: ThumbnailState,
  youtubeData?: YoutubeImportData | null,
  phoneSourceClips?: PhoneStudioSourceClip[],
  phoneVideoFile?: File | null,
) => {
  const mySeq = ++_saveSeq;
  try {
    const nextCache = new Map<string, Blob>();
    const scriptToStore = await Promise.all(script.map(async (seg) => {
      let audioBlob: Blob | null = null;
      if (seg.audioUrl) {
        const cached = _audioBlobCache.get(seg.audioUrl);
        if (cached) {
          audioBlob = cached;
        } else {
          try {
            const res = await fetch(seg.audioUrl);
            audioBlob = await res.blob();
          } catch (e) {
            console.error("Failed to fetch blob for storage", e);
          }
        }
        if (audioBlob) nextCache.set(seg.audioUrl, audioBlob);
      }
      return { ...seg, audioBlob, audioUrl: undefined };
    }));

    // A newer saveState() call started while this one was still fetching
    // blobs — it will write the fresher snapshot, so abandon this stale one.
    if (mySeq !== _saveSeq) return;

    const thumbnailStateToStore = thumbnailState
      ? { ...thumbnailState, referenceImage: null }
      : thumbnailState;

    await set(STORE_KEY, {
      appState, script: scriptToStore, thumbnailState: thumbnailStateToStore, youtubeData: youtubeData ?? null,
      phoneSourceClips: phoneSourceClips ?? [], phoneVideoFile: phoneVideoFile ?? null,
    });
    _audioBlobCache = nextCache; // prune to only what's still in the current script
    _quotaWarned = false;
  } catch (error) {
    console.error("Failed to save state to IndexedDB", error);
    // This used to fail silently — the browser had already discarded a save
    // (commonly a storage-quota limit) and the user had no way to know their
    // audio/sync progress wasn't actually persisted until a refresh "lost" it.
    if (!_quotaWarned) {
      _quotaWarned = true;
      const isQuota = (error as any)?.name === 'QuotaExceededError';
      toast.error(isQuota
        ? 'Storage full ho gaya — naya progress save nahi ho raha. Kuch purane projects clear karo ya video jaldi render/export kar lo.'
        : 'Progress save fail ho gaya. Refresh se pehle video render/export kar lo taki kaam na khoye.');
    }
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
      phoneSourceClips: stored.phoneSourceClips ?? [],
      phoneVideoFile: stored.phoneVideoFile ?? null,
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
