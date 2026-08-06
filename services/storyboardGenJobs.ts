// Runs Storyboard's "Generate All" image loop outside any single component's
// lifecycle, so navigating away from the Storyboard screen (or the whole app
// backgrounding) doesn't kill an in-progress batch — it only stops when the
// user explicitly hits Stop, or it finishes. The Storyboard component just
// subscribes to whatever job is running for the current script and mirrors
// its state into local UI state; if no component is mounted to look at it,
// the job keeps going and persists each image straight to storage itself.
import { DebateSegment, StoryboardScene } from '../types';
import { generateStoryboardImage, StoryboardImageStyle } from './geminiService';
import { saveScenes } from './storageService';

export interface GenJobSnapshot {
  running: boolean;
  progress: number; // 0-100
  status: string;
  scenes: StoryboardScene[];
}

type AspectRatio = '16:9' | '3:4' | '1:1' | '9:16';

interface Job {
  scriptSignature: string;
  script: DebateSegment[];
  characterGuide: string;
  aspectRatio: AspectRatio;
  imageStyle: StoryboardImageStyle;
  scenes: StoryboardScene[];
  abort: boolean;
  running: boolean;
  progress: number;
  status: string;
  listeners: Set<(s: GenJobSnapshot) => void>;
}

let currentJob: Job | null = null;

function snapshot(job: Job): GenJobSnapshot {
  return { running: job.running, progress: job.progress, status: job.status, scenes: job.scenes };
}

function notify(job: Job) {
  const snap = snapshot(job);
  job.listeners.forEach(l => l(snap));
}

const isQuotaError = (e: any) => /RESOURCE_EXHAUSTED|429|quota exceeded/i.test(e?.message || '');

// Sliding-window rate limiter shared across every attempt this module makes
// (not per-scene) — at most MAX_PER_WINDOW generation attempts started in
// any trailing WINDOW_MS. Vertex's quota for this image model is tight
// enough that even "one at a time" wasn't safe; this caps it explicitly.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 2;
const recentAttempts: number[] = [];

async function throttle(abort: () => boolean): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (recentAttempts.length && now - recentAttempts[0] >= WINDOW_MS) recentAttempts.shift();
    if (recentAttempts.length < MAX_PER_WINDOW) { recentAttempts.push(Date.now()); return; }
    if (abort()) return;
    const waitMs = WINDOW_MS - (now - recentAttempts[0]) + 50;
    for (let waited = 0; waited < waitMs && !abort(); waited += 500) {
      await new Promise(r => setTimeout(r, Math.min(500, waitMs - waited)));
    }
  }
}

async function generateImageWithRetry(
  prompt: string, guide: string | undefined, ratio: AspectRatio, imageStyle: StoryboardImageStyle,
): Promise<string> {
  try {
    return await generateStoryboardImage(prompt, guide, ratio, imageStyle);
  } catch (e: any) {
    if (!isQuotaError(e)) throw e;
    await new Promise(r => setTimeout(r, 4000));
    return await generateStoryboardImage(prompt, guide, ratio, imageStyle);
  }
}

export function subscribeGenJob(scriptSignature: string, listener: (s: GenJobSnapshot) => void): () => void {
  if (currentJob && currentJob.scriptSignature === scriptSignature) {
    currentJob.listeners.add(listener);
    listener(snapshot(currentJob));
  }
  return () => { currentJob?.listeners.delete(listener); };
}

export function getGenJobSnapshot(scriptSignature: string): GenJobSnapshot | null {
  return currentJob && currentJob.scriptSignature === scriptSignature ? snapshot(currentJob) : null;
}

export function isGenJobRunning(scriptSignature: string): boolean {
  return !!currentJob && currentJob.scriptSignature === scriptSignature && currentJob.running;
}

export function stopGenJob(scriptSignature: string): void {
  if (currentJob && currentJob.scriptSignature === scriptSignature) currentJob.abort = true;
}

const QUOTA_RETRY_WAIT_MS = 60_000;
const MAX_QUOTA_RETRIES_PER_SCENE = 5;

export function startGenJob(
  script: DebateSegment[],
  scriptSignature: string,
  scenes: StoryboardScene[],
  characterGuide: string,
  aspectRatio: AspectRatio,
  imageStyle: StoryboardImageStyle = 'ms_paint',
): void {
  if (currentJob && currentJob.running && currentJob.scriptSignature === scriptSignature) return; // already running

  const job: Job = {
    scriptSignature, script, characterGuide, aspectRatio, imageStyle,
    scenes: scenes.map(s => ({ ...s })),
    abort: false, running: true, progress: 0, status: '',
    listeners: new Set(),
  };
  currentJob = job;

  const setScene = (id: string, patch: Partial<StoryboardScene>) => {
    const idx = job.scenes.findIndex(sc => sc.id === id);
    if (idx >= 0) job.scenes[idx] = { ...job.scenes[idx], ...patch };
  };

  (async () => {
    const toGen = job.scenes.filter(sc => !sc.imageUrl);
    const total = toGen.length;
    for (let i = 0; i < toGen.length && !job.abort; i++) {
      const scene = toGen[i];
      let attempt = 0;
      while (!job.abort) {
        job.status = attempt === 0
          ? `Scene ${scene.sceneNumber}: generating…`
          : `Scene ${scene.sceneNumber}: quota-limited, waited a minute — retrying (${attempt}/${MAX_QUOTA_RETRIES_PER_SCENE})…`;
        notify(job);

        await throttle(() => job.abort);
        if (job.abort) break;

        setScene(scene.id, { isGenerating: true, error: undefined });
        notify(job);

        let result: 'success' | 'quota' | 'other';
        try {
          const url = await generateImageWithRetry(scene.prompt, job.characterGuide, job.aspectRatio, job.imageStyle);
          setScene(scene.id, { imageUrl: url, isGenerating: false });
          result = 'success';
        } catch (e: any) {
          const quota = isQuotaError(e);
          const raw = e.message || 'Failed';
          const msg = quota ? `${raw} — hit Retry Failed in a minute, or check billing.` : raw;
          setScene(scene.id, { isGenerating: false, error: msg });
          result = quota ? 'quota' : 'other';
        }
        try { await saveScenes(job.script, job.scenes, job.characterGuide); } catch { /* best-effort */ }
        notify(job);

        if (result !== 'quota' || attempt >= MAX_QUOTA_RETRIES_PER_SCENE) break;
        attempt++;
        job.status = `Scene ${scene.sceneNumber}: quota-limited — waiting a minute before retry (${attempt}/${MAX_QUOTA_RETRIES_PER_SCENE})…`;
        notify(job);
        for (let waited = 0; waited < QUOTA_RETRY_WAIT_MS && !job.abort; waited += 500) {
          await new Promise(r => setTimeout(r, Math.min(500, QUOTA_RETRY_WAIT_MS - waited)));
        }
      }
      job.progress = Math.round(((i + 1) / total) * 100);
      notify(job);
    }
    job.running = false;
    job.status = job.abort ? 'Stopped.' : 'All images generated!';
    notify(job);
    if (currentJob === job) currentJob = null;
  })();
}
