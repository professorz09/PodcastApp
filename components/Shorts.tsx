import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Film, Wand2, ChevronDown, ChevronUp,
  Play, Pause, Download, Loader2, AlertCircle,
  ArrowLeft, Settings2, ImagePlus, Video, X,
  RefreshCw, SkipBack, SkipForward, Zap,
  Type, Scissors, Sparkles, Image as ImageIcon, Trash2, Youtube
} from 'lucide-react';
import { DebateSegment, StoryboardScene, YoutubeImportData } from '../types';
import { generateStoryboardScenes, generateStoryboardImage, generateStoryboardScenesTimeBased, findBestShortsSegments, ShortsSegment, TranscriptChunk, ClipMode } from '../services/geminiService';
import { saveShortsScenes, loadShortsScenes } from '../services/storageService';
import { toast } from './Toast';

interface ShortsProps {
  script: DebateSegment[];
  youtubeData?: YoutubeImportData | null;
  shortsContext?: TranscriptChunk | null;
  onClearShortsContext?: () => void;
  onBack: () => void;
}

interface SubtitleLineLayer {
  text: string;
  start: number;
  end: number;
  imageDataUrl?: string;
}

interface SubtitleConfig {
  enabled: boolean;
  fontSize: number;
  textColor: string;
  position: 'top' | 'bottom';
}

const DEFAULT_SUBTITLE: SubtitleConfig = {
  enabled: true,
  fontSize: 19,
  textColor: '#ffffff',
  position: 'bottom',
};

const MODEL_OPTIONS = [
  { value: 'gemini-3-flash-preview', label: '⚡ Flash' },
  { value: 'gemini-3.1-flash-lite-preview', label: '✦ Lite' },
  { value: 'gemini-3.1-pro-preview', label: '✦ Pro' },
];

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

function buildOffsets(segs: DebateSegment[]) {
  const offsets: number[] = [];
  let t = 0;
  for (const s of segs) { offsets.push(t); t += s.duration ?? 0; }
  return { offsets, total: t };
}

// Given elapsed time + actual offsets, return current audio segment index
function getAudioSegIdx(elapsed: number, offsets: number[]): number {
  let idx = offsets.length - 1;
  for (let i = 0; i < offsets.length; i++) {
    const end = i < offsets.length - 1 ? offsets[i + 1] : Infinity;
    if (elapsed >= offsets[i] && elapsed < end) { idx = i; break; }
  }
  return idx;
}

// Build a map: scriptIdx → imageUrl (from scenes' segmentIndices)
function buildSegToImage(scenes: StoryboardScene[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const sc of scenes) {
    if (!sc.imageUrl) continue;
    for (const idx of sc.segmentIndices) m.set(idx, sc.imageUrl);
  }
  return m;
}

// Phrase-by-phrase subtitle: splits segment text into ~6-word chunks,
// shows the chunk that matches current time position in segment.
const WORDS_PER_PHRASE = 6;
function getVisibleText(text: string, timeInSeg: number, segDuration: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (segDuration <= 0) return words.slice(0, WORDS_PER_PHRASE).join(' ');

  const totalPhrases = Math.ceil(words.length / WORDS_PER_PHRASE);
  const phraseIdx = Math.min(
    totalPhrases - 1,
    Math.floor((Math.max(0, timeInSeg) / segDuration) * totalPhrases),
  );
  const start = phraseIdx * WORDS_PER_PHRASE;
  return words.slice(start, start + WORDS_PER_PHRASE).join(' ');
}

// Exact subtitle from wordTimings: show the phrase window for the current spoken word
function getVisibleTextFromWordTimings(
  wordTimings: { word: string; start: number; end: number }[],
  timeInSeg: number,
): string {
  if (!wordTimings.length) return '';
  // Find last word that has started playing
  let spokenIdx = 0;
  for (let i = 0; i < wordTimings.length; i++) {
    if (wordTimings[i].start <= timeInSeg) spokenIdx = i;
    else break;
  }
  // Show the WORDS_PER_PHRASE chunk that contains the current spoken word
  const chunkIdx = Math.floor(spokenIdx / WORDS_PER_PHRASE);
  const start = chunkIdx * WORDS_PER_PHRASE;
  return wordTimings.slice(start, start + WORDS_PER_PHRASE).map(w => w.word).join(' ');
}

// ── Proportional timing for single-audio mode ─────────────────────────────────
// When all audio is one file, distribute scene/segment timing by word count
interface ProportionalTimings {
  // per script segment: start time (proportional)
  segOffsets: number[];
  // per scene: start time (proportional)  
  sceneOffsets: number[];
}

function buildProportionalTimings(
  scenes: StoryboardScene[],
  script: DebateSegment[],
  totalDuration: number,
): ProportionalTimings {
  if (scenes.length === 0) return { segOffsets: [0], sceneOffsets: [] };

  // ── Equal distribution fallback ──
  // Used when script is a single block or all scenes map to the same segment
  const equalSceneOffsets = scenes.map((_, i) => (i / scenes.length) * totalDuration);
  const equalSegOffsets = script.map((_, i) => script.length <= 1 ? 0 : (i / script.length) * totalDuration);

  // If script has only 1 segment (whole audio as one block), distribute scenes equally
  if (script.length <= 1) {
    return { segOffsets: [0], sceneOffsets: equalSceneOffsets };
  }

  // ── Word-proportional distribution ──
  const segWords = script.map(s => Math.max(1, s.text.trim().split(/\s+/).filter(Boolean).length));
  const totalWords = segWords.reduce((a, b) => a + b, 0);

  // Offset for each script segment (proportional to cumulative word count)
  const segOffsets: number[] = [];
  let cum = 0;
  for (let i = 0; i < script.length; i++) {
    segOffsets.push((cum / totalWords) * totalDuration);
    cum += segWords[i];
  }

  // Scene starts at the time its first segment starts
  const rawSceneOffsets = scenes.map(sc => {
    const firstIdx = sc.segmentIndices.length > 0 ? sc.segmentIndices[0] : 0;
    return segOffsets[Math.min(firstIdx, segOffsets.length - 1)] ?? 0;
  });

  // If all sceneOffsets collapsed to the same value (e.g. AI used out-of-range indices),
  // fall back to equal distribution across scenes
  const allSame = rawSceneOffsets.every(t => t === rawSceneOffsets[0]);
  const sceneOffsets = allSame ? equalSceneOffsets : rawSceneOffsets;

  return { segOffsets, sceneOffsets };
}

// Given elapsed + scene start times → which scene index is active
// Finds the scene with the latest start time that is still <= elapsed
function getActiveSceneIdx(elapsed: number, sceneOffsets: number[]): number {
  let idx = 0;
  let bestTime = -1;
  for (let i = 0; i < sceneOffsets.length; i++) {
    const t = sceneOffsets[i];
    if (t <= elapsed && t > bestTime) { bestTime = t; idx = i; }
  }
  return idx;
}

// ── Single-audio scene timing by word coverage ────────────────────────────────
// Each scene's duration ∝ total words in its script segments.
// No allSame fallback — always gives per-scene proportional time.
function sceneTimingsByWordCoverage(
  scenes: StoryboardScene[],
  script: DebateSegment[],
  totalDuration: number,
): number[] {
  if (scenes.length === 0) return [];

  // ── Method 1: wordTimings (exact spoken durations from Google TTS / STT) ──
  const hasWordTimings = script.some(s => s.wordTimings && s.wordTimings.length > 0);

  if (hasWordTimings) {
    const segSpokenDurs = script.map(s => {
      if (s.wordTimings && s.wordTimings.length > 0) {
        return s.wordTimings[s.wordTimings.length - 1].end;
      }
      return null;
    });
    const knownTotal = segSpokenDurs.reduce((sum, d) => sum + (d ?? 0), 0);
    const unknownCount = segSpokenDurs.filter(d => d === null).length;
    const unknownEach = unknownCount > 0 ? Math.max(0, totalDuration - knownTotal) / unknownCount : 0;
    const segDurs = segSpokenDurs.map(d => d ?? unknownEach);
    const segStart: number[] = [];
    let cum = 0;
    for (const d of segDurs) { segStart.push(cum); cum += d; }

    const raw = scenes.map(sc => {
      for (const idx of sc.segmentIndices) {
        if (idx >= 0 && idx < segStart.length) return segStart[idx];
      }
      return -1;
    });

    // If all raw timings are the same (e.g. all scenes map to segment 0),
    // fall through to Method 2 for proper distribution.
    const validRaw = raw.filter(t => t >= 0);
    const allSame = validRaw.length > 0 && validRaw.every(t => t === validRaw[0]);
    if (!allSame) {
      // Sub-distribute groups of consecutive scenes sharing the same anchor time
      const result = [...raw];
      let i = 0;
      while (i < result.length) {
        let j = i + 1;
        while (j < result.length && result[j] === result[i] && result[i] >= 0) j++;
        const groupSize = j - i;
        if (groupSize > 1 && result[i] >= 0) {
          const anchor = result[i];
          const anchorIdx = scenes[i].segmentIndices.find(idx => idx >= 0 && idx < segStart.length) ?? -1;
          const segDur = anchorIdx >= 0 ? segDurs[anchorIdx] : (totalDuration / scenes.length);
          for (let g = 0; g < groupSize; g++) {
            result[i + g] = anchor + (g / groupSize) * segDur;
          }
        }
        i = j;
      }
      // Fill any -1s by interpolation
      for (let k = 0; k < result.length; k++) {
        if (result[k] < 0) {
          const prev = result.slice(0, k).reverse().find(t => t >= 0) ?? 0;
          const next = result.slice(k + 1).find(t => t >= 0) ?? totalDuration;
          result[k] = (prev + next) / 2;
        }
      }
      return result;
    }
    // Fall through to Method 2 if all timings collapsed to same value
  }

  // ── Method 2: word-count proportional ──
  const segWords = script.map(s =>
    Math.max(1, s.text.trim().split(/\s+/).filter(Boolean).length)
  );
  const sceneWordCounts = scenes.map(sc =>
    sc.segmentIndices.reduce(
      (sum, idx) => sum + (idx >= 0 && idx < segWords.length ? segWords[idx] : 0), 0,
    )
  );
  const totalCovered = sceneWordCounts.reduce((a, b) => a + b, 0);

  // If all scenes share the same segment (or no valid indices), distribute evenly
  if (totalCovered === 0 || sceneWordCounts.every(w => w === sceneWordCounts[0])) {
    return scenes.map((_, i) => (i / scenes.length) * totalDuration);
  }

  const timings: number[] = [];
  let cum2 = 0;
  for (const w of sceneWordCounts) {
    timings.push((cum2 / totalCovered) * totalDuration);
    cum2 += w;
  }
  return timings;
}

// ── Build scene start times ────────────────────────────────────────────────────
// Each scene shows for exactly as long as its assigned segments play.
// segmentIndices decides WHEN each scene appears — not equal distribution.
function buildSceneTimings(
  scenes: StoryboardScene[],
  script: DebateSegment[],
  audioSegScriptIndices: number[],  // audio index → script index
  actualOffsets: number[],          // audio index → absolute start time
  actualDurs: number[],             // audio index → duration
  totalDuration: number,
): number[] {
  if (scenes.length === 0) return [];

  // Single-audio mode (one merged file for whole video): use word-coverage spread
  if (audioSegScriptIndices.length === 1) {
    return sceneTimingsByWordCoverage(scenes, script, totalDuration);
  }

  // scriptIdx → { start, dur } — O(1) lookup
  const segInfo = new Map<number, { start: number; dur: number }>();
  audioSegScriptIndices.forEach((scriptIdx, audioIdx) => {
    segInfo.set(scriptIdx, {
      start: actualOffsets[audioIdx] ?? 0,
      dur: actualDurs[audioIdx] ?? 0,
    });
  });

  // Each scene's start = actual audio start of its first segment that has audio.
  // This ensures scene 1 (made for segment A) shows exactly while segment A plays,
  // scene 2 (made for segment B) shows while segment B plays, and so on.
  const result: number[] = scenes.map(sc => {
    for (const idx of sc.segmentIndices) {
      const info = segInfo.get(idx);
      if (info) return info.start;
    }
    return -1; // scene has no audio — will be filled below
  });

  // Handle multiple consecutive scenes that share the same anchor segment:
  // split that segment's duration by wordTimings (exact) or proportionally.
  let i = 0;
  while (i < scenes.length) {
    // Find the run of scenes that all resolve to the same start time
    let j = i + 1;
    while (j < scenes.length && result[j] === result[i] && result[i] !== -1) j++;
    const groupSize = j - i;

    if (groupSize > 1) {
      const anchor = scenes[i].segmentIndices.find(idx => segInfo.has(idx)) ?? -1;
      if (anchor !== -1) {
        const { start, dur } = segInfo.get(anchor)!;
        const seg = script[anchor];
        const wt = seg?.wordTimings;
        const totalWords = (seg?.text ?? '').split(/\s+/).filter(Boolean).length || groupSize;

        for (let g = 0; g < groupSize; g++) {
          if (g === 0) { result[i + g] = start; continue; }
          const wordIdx = Math.round((g / groupSize) * totalWords);
          result[i + g] = (wt && wt.length > wordIdx)
            ? start + wt[wordIdx].start          // exact spoken timestamp
            : start + (g / groupSize) * dur;     // proportional fallback
        }
      }
    }
    i = j;
  }

  // Fill scenes with no audio by interpolating between neighbours
  for (let k = 0; k < result.length; k++) {
    if (result[k] === -1) {
      const prev = result.slice(0, k).reverse().find(t => t !== -1) ?? 0;
      const next = result.slice(k + 1).find(t => t !== -1) ?? totalDuration;
      result[k] = (prev + next) / 2;
    }
  }

  return result;
}

function buildScenesFromRaw(
  rawScenes: { sceneNumber: number; prompt: string; segmentIndices: number[] }[],
  segments: DebateSegment[],
  knownTotal?: number,
): StoryboardScene[] {
  // Use word-proportional timing — robust when s.duration = 0 (ElevenLabs)
  const durBased = segments.reduce((s, seg) => s + (seg.duration ?? 0), 0);
  const total = knownTotal ?? (durBased > 0 ? durBased : 0);

  const segWords = segments.map(s => Math.max(1, s.text.trim().split(/\s+/).filter(Boolean).length));

  // Build scenes first with indices
  const builtScenes = rawScenes.map((raw) => {
    const indices = raw.segmentIndices.filter(i => i >= 0 && i < segments.length);
    return {
      id: `scene-${raw.sceneNumber}`,
      sceneNumber: raw.sceneNumber,
      prompt: raw.prompt,
      startTime: 0,
      endTime: total,
      segmentIndices: indices,
    };
  });

  // ── Detect collapsed segmentIndices (AI assigned same/few indices to all scenes) ──
  // If >60% of scenes share the same segment index, redistribute evenly across segments
  const allIndices = builtScenes.flatMap(sc => sc.segmentIndices);
  const uniqueIndices = new Set(allIndices);
  const collapsed =
    builtScenes.length > 1 &&
    (uniqueIndices.size <= 1 || uniqueIndices.size < Math.ceil(segments.length * 0.3));

  if (collapsed && segments.length > 1) {
    // Reassign: distribute scenes evenly across all script segments
    const segPerScene = segments.length / builtScenes.length;
    builtScenes.forEach((sc, i) => {
      const lo = Math.round(i * segPerScene);
      const hi = Math.round((i + 1) * segPerScene) - 1;
      sc.segmentIndices = Array.from(
        { length: Math.max(1, hi - lo + 1) },
        (_, k) => Math.min(lo + k, segments.length - 1),
      );
    });
  }

  // Compute word-coverage timings
  const sceneWordCounts = builtScenes.map(sc =>
    sc.segmentIndices.reduce((sum, idx) => sum + (segWords[idx] ?? 0), 0)
  );
  const totalCovered = sceneWordCounts.reduce((a, b) => a + b, 0);

  if (total > 0) {
    if (totalCovered > 0 && !sceneWordCounts.every(w => w === sceneWordCounts[0])) {
      // Word-proportional
      let cum = 0;
      builtScenes.forEach((sc, i) => {
        sc.startTime = (cum / totalCovered) * total;
        cum += sceneWordCounts[i];
        sc.endTime = i < builtScenes.length - 1 ? (cum / totalCovered) * total : total;
      });
    } else {
      // Equal distribution fallback
      builtScenes.forEach((sc, i) => {
        sc.startTime = (i / builtScenes.length) * total;
        sc.endTime = ((i + 1) / builtScenes.length) * total;
      });
    }
  }
  return builtScenes;
}

// Apply actual decoded timings to scenes (call after audio is decoded)
function applyDecodedTimings(
  scenes: StoryboardScene[],
  sceneTimings: number[],
  total: number,
): StoryboardScene[] {
  return scenes.map((sc, i) => ({
    ...sc,
    startTime: sceneTimings[i] ?? sc.startTime,
    endTime: i + 1 < sceneTimings.length ? sceneTimings[i + 1] : total,
  }));
}


// Draw subtitle text on canvas context (shared by preview + video export)
function drawSubtitleOnCtx(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  text: string,
  cfg: SubtitleConfig,
) {
  if (!cfg.enabled || !text.trim()) return;
  const fs = cfg.fontSize;
  ctx.font = `bold ${fs}px sans-serif`;
  ctx.textAlign = 'center';
  const maxW = W - 80;
  const words = text.trim().split(/\s+/);
  const lines: string[] = []; let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  const lh = fs * 1.55;
  const pad = 10;
  const totalH = lines.length * lh + pad * 2;
  const baseY = cfg.position === 'top' ? 20 : H - totalH - 20;

  // Strong shadow for legibility without background
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = cfg.textColor;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, baseY + pad + (i + 1) * lh - fs * 0.25));
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
}

// Draw an image cover-fit on canvas
function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  if (!img.complete || !img.naturalWidth) return;
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  ctx.drawImage(img, (W - img.naturalWidth * scale) / 2, (H - img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale);
}

// ── Video creation — segment-accurate sync ────────────────────────────────────
async function createStoryboardVideo(
  scenes: StoryboardScene[],
  script: DebateSegment[],
  subtitleCfg: SubtitleConfig,
  onProgress: (pct: number, msg: string) => void,
): Promise<Blob> {
  onProgress(0, 'Loading audio…');

  // Any segment with an audioUrl (duration may be 0 for ElevenLabs — AudioBuffer gives real duration)
  const audioSegs = script.filter(s => !!s.audioUrl);
  if (!audioSegs.length) throw new Error('No audio — generate audio in Voice step first.');

  const AC = new AudioContext();
  const decoded: AudioBuffer[] = [];
  for (let i = 0; i < audioSegs.length; i++) {
    onProgress(5 + Math.round((i / audioSegs.length) * 25), `Decoding audio ${i + 1}/${audioSegs.length}…`);
    decoded.push(await AC.decodeAudioData(await (await fetch(audioSegs[i].audioUrl!)).arrayBuffer()));
  }

  // ── Actual durations & offsets from decoded buffers (not s.duration) ──
  const actualDurs = decoded.map(b => b.duration);
  const actualOffsets: number[] = [0];
  for (let i = 0; i < actualDurs.length - 1; i++) actualOffsets.push(actualOffsets[i] + actualDurs[i]);
  const totalDuration = actualOffsets[actualOffsets.length - 1] + actualDurs[actualDurs.length - 1];

  // Merge into one buffer
  onProgress(30, 'Merging audio…');
  const sr = decoded[0].sampleRate, ch = decoded[0].numberOfChannels;
  const merged = AC.createBuffer(ch, decoded.reduce((s, b) => s + b.length, 0), sr);
  let off = 0;
  for (const buf of decoded) {
    for (let c = 0; c < ch; c++) merged.getChannelData(c).set(buf.getChannelData(c), off);
    off += buf.length;
  }

  // ── Build scene timings — index-based, no stale object refs ──
  const audioSegScriptIndices = audioSegs.map(seg => script.indexOf(seg));
  const sceneTimings = buildSceneTimings(scenes, script, audioSegScriptIndices, actualOffsets, actualDurs, totalDuration);
  // For single-audio subtitle: word-proportional segment offsets
  const propTimings = audioSegs.length === 1
    ? buildProportionalTimings(scenes, script, totalDuration)
    : null;

  onProgress(35, 'Loading images…');
  const imgCache = new Map<string, HTMLImageElement>();
  for (const sc of scenes) {
    if (!sc.imageUrl) continue;
    if (imgCache.has(sc.imageUrl)) continue;
    const img = new window.Image();
    await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); img.src = sc.imageUrl!; });
    imgCache.set(sc.imageUrl, img);
  }

  const W = 1280, H = 720, FPS = 30;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const dest = AC.createMediaStreamDestination();
  const src = AC.createBufferSource(); src.buffer = merged; src.connect(dest);

  const PREFERRED_TYPES = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  const mimeType = PREFERRED_TYPES.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  const chunks: Blob[] = [];
  const recorderOptions: MediaRecorderOptions = { videoBitsPerSecond: 6_000_000 };
  if (mimeType) recorderOptions.mimeType = mimeType;
  const recorder = new MediaRecorder(
    new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]),
    recorderOptions
  );
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise<void>(r => { recorder.onstop = () => r(); });
  recorder.start(100);
  // Resume AudioContext — new instances may auto-suspend and block audio flow to MediaRecorder
  if (AC.state === 'suspended') await AC.resume();
  // Capture AC clock AFTER resume so elapsed time starts from the correct moment
  const acStartTime = AC.currentTime;
  src.start(0);

  const draw = () => {
    // AC.currentTime is hardware-accurate: no drift on long recordings
    const elapsed = AC.currentTime - acStartTime;
    if (elapsed >= totalDuration + 0.1) { recorder.stop(); return; }
    onProgress(50 + Math.round((elapsed / totalDuration) * 46), `Recording ${fmt(elapsed)} / ${fmt(totalDuration)}…`);

    // ── Scene image: time-based (both modes) ──
    const sceneIdx = getActiveSceneIdx(elapsed, sceneTimings);
    const imgUrl = scenes[sceneIdx]?.imageUrl;

    // ── Subtitle: wordTimings (exact) or phrase-chunk (fallback) ──
    let visibleText = '';
    const subtitleForSeg = (seg: DebateSegment | undefined, timeInSeg: number, segDur: number) => {
      if (!seg) return '';
      if (seg.wordTimings && seg.wordTimings.length > 0)
        return getVisibleTextFromWordTimings(seg.wordTimings, timeInSeg);
      return getVisibleText(seg.text ?? '', timeInSeg, segDur);
    };
    if (propTimings) {
      const segIdx = getAudioSegIdx(elapsed, propTimings.segOffsets);
      const segStart = propTimings.segOffsets[segIdx] ?? 0;
      const segEnd = propTimings.segOffsets[segIdx + 1] ?? totalDuration;
      visibleText = subtitleForSeg(script[segIdx], elapsed - segStart, segEnd - segStart);
    } else {
      const audioIdx = getAudioSegIdx(elapsed, actualOffsets);
      const segStart = actualOffsets[audioIdx] ?? 0;
      const segEnd = actualOffsets[audioIdx + 1] ?? totalDuration;
      // Use index lookup — no stale object references
      const scriptIdx = audioSegScriptIndices[audioIdx];
      visibleText = subtitleForSeg(script[scriptIdx], elapsed - segStart, segEnd - segStart);
    }

    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (imgUrl) {
      const img = imgCache.get(imgUrl);
      if (img) drawImageCover(ctx, img, W, H);
    }
    drawSubtitleOnCtx(ctx, W, H, visibleText, subtitleCfg);

    requestAnimationFrame(draw);
  };
  onProgress(50, 'Recording…');
  requestAnimationFrame(draw);
  await done;
  onProgress(98, 'Finalizing…');
  return new Blob(chunks, { type: mimeType });
}

// ── Prompt Modal ──────────────────────────────────────────────────────────────
const PromptModal: React.FC<{
  scene: StoryboardScene;
  characterGuide: string;
  absWords: AbsWord[];
  script: DebateSegment[];
  totalDuration: number;
  onSave: (id: string, prompt: string) => void;
  onGenerate: (id: string) => void;
  onClose: () => void;
}> = ({ scene, characterGuide, absWords, script, totalDuration, onSave, onGenerate, onClose }) => {
  const [prompt, setPrompt] = useState(scene.prompt);
  const voiceover = getVoiceoverForRange(absWords, scene.startTime, scene.endTime, script, scene.segmentIndices, totalDuration);
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl w-full max-w-md flex flex-col shadow-2xl max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5">
          <div>
            <h3 className="text-white font-bold text-sm">Scene {scene.sceneNumber}</h3>
            <span className="text-[10px] text-gray-600">{fmt(scene.startTime)} → {fmt(scene.endTime)}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/8 text-gray-500"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div className="aspect-video bg-[#0a0a0a] rounded-xl overflow-hidden border border-white/6 relative">
            {scene.imageUrl ? <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
              : scene.isGenerating ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-purple-500" /></div>
              : scene.error ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"><AlertCircle size={20} className="text-red-400" /><span className="text-xs text-red-400">{scene.error}</span></div>
              : <div className="absolute inset-0 flex items-center justify-center text-gray-700"><ImagePlus size={28} /></div>}
          </div>
          {voiceover && (
            <div className="bg-green-500/5 border border-green-500/15 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-green-400 mb-1">Voiceover</p>
              <p className="text-[10px] text-gray-400 leading-relaxed">{voiceover}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Image Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
              className="w-full bg-[#080808] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-gray-300 resize-none focus:border-purple-500/40 outline-none leading-relaxed custom-scrollbar" />
          </div>
          {characterGuide && (
            <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-blue-400 mb-1">Character Guide</p>
              <p className="text-[10px] text-gray-500 leading-relaxed">{characterGuide}</p>
            </div>
          )}
        </div>
        <div className="px-4 pb-4 pt-2 flex gap-2">
          <button onClick={() => { onSave(scene.id, prompt); onGenerate(scene.id); onClose(); }} disabled={scene.isGenerating}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-semibold transition-all">
            {scene.isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {scene.imageUrl ? 'Regenerate' : 'Generate Image'}
          </button>
          <button onClick={() => { onSave(scene.id, prompt); onClose(); }}
            className="px-4 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-gray-400 text-sm font-semibold transition-all">Save</button>
        </div>
      </div>
    </div>
  );
};

// ── Absolute word timestamps from script's relative wordTimings ───────────────
type AbsWord = { word: string; absStart: number; absEnd: number };

function getAbsoluteWords(script: DebateSegment[]): AbsWord[] {
  const result: AbsWord[] = [];
  let offset = 0;
  for (const seg of script) {
    if (seg.wordTimings && seg.wordTimings.length > 0) {
      for (const wt of seg.wordTimings) {
        result.push({ word: wt.word, absStart: offset + wt.start, absEnd: offset + wt.end });
      }
      offset += seg.wordTimings[seg.wordTimings.length - 1].end;
    } else {
      offset += seg.duration ?? 0;
    }
  }
  return result;
}

// Helper: truncate word array to "first … last" form
function wordsToSnippet(words: string[]): string {
  if (words.length <= 12) return words.join(' ');
  return `${words.slice(0, 5).join(' ')} … ${words.slice(-3).join(' ')}`;
}

// Extract voiceover text for a time range (first … last words)
function getVoiceoverForRange(
  absWords: AbsWord[],
  startTime: number,
  endTime: number,
  script: DebateSegment[],
  segmentIndices: number[],
  totalDuration?: number,
): string {
  if (startTime >= endTime) return '';

  // Priority 1: absolute word timings from STT
  if (absWords.length > 0) {
    const inRange = absWords.filter(w => w.absStart >= startTime - 0.15 && w.absStart < endTime + 0.15);
    if (inRange.length > 0) return wordsToSnippet(inRange.map(w => w.word));
  }

  // Priority 2: proportional word extraction from full script text (no STT needed)
  const total = totalDuration ?? 0;
  if (total > 0) {
    const allWords = script.flatMap(seg => seg.text.trim().split(/\s+/).filter(Boolean));
    if (allWords.length > 0) {
      const startIdx = Math.floor((startTime / total) * allWords.length);
      const endIdx = Math.min(Math.ceil((endTime / total) * allWords.length), allWords.length);
      const rangeWords = allWords.slice(startIdx, endIdx);
      if (rangeWords.length > 0) return wordsToSnippet(rangeWords);
    }
  }

  // Priority 3: segment text fallback
  return segmentIndices.map(i => script[i]?.text ?? '').filter(Boolean).join(' ');
}

// ── Timeline Row (each scene clip) ────────────────────────────────────────────
const TimelineRow: React.FC<{
  scene: StoryboardScene;
  script: DebateSegment[];
  absWords: AbsWord[];
  totalDuration: number;
  isActive: boolean;
  onSeek: () => void;
  onOpenPrompt: () => void;
  onGenerate: () => void;
}> = ({ scene, script, absWords, totalDuration, isActive, onSeek, onOpenPrompt, onGenerate }) => {
  const dur = scene.endTime - scene.startTime;
  const voiceover = getVoiceoverForRange(absWords, scene.startTime, scene.endTime, script, scene.segmentIndices, totalDuration);

  return (
    <div onClick={onSeek}
      className={`flex items-center gap-3 px-3 py-2.5 border-b border-white/5 cursor-pointer transition-all ${isActive ? 'bg-red-500/8 border-l-2 border-l-red-500' : 'hover:bg-white/3 border-l-2 border-l-transparent'}`}
    >
      {/* Thumbnail */}
      <button onClick={e => { e.stopPropagation(); onOpenPrompt(); }}
        className="relative w-[72px] h-[40px] shrink-0 rounded-lg overflow-hidden bg-[#111] border border-white/6 hover:border-purple-500/50 transition-all group">
        {scene.imageUrl
          ? <><img src={scene.imageUrl} alt="" className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><RefreshCw size={11} className="text-white" /></div></>
          : scene.isGenerating
            ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={12} className="animate-spin text-purple-400" /></div>
            : <div className="absolute inset-0 flex items-center justify-center text-gray-700 group-hover:text-purple-400 transition-colors"><ImagePlus size={14} /></div>
        }
        {isActive && <div className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isActive ? 'bg-red-500/20 text-red-300' : 'bg-white/6 text-gray-500'}`}>#{scene.sceneNumber}</span>
          <span className="text-[9px] text-gray-700">{fmt(scene.startTime)} → {fmt(scene.endTime)}</span>
          <span className="text-[9px] font-mono text-gray-600 ml-auto">{dur.toFixed(1)}s</span>
        </div>
        <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">{voiceover || scene.prompt}</p>
      </div>

      {/* Generate button */}
      <button onClick={e => { e.stopPropagation(); onGenerate(); }} disabled={scene.isGenerating}
        className="shrink-0 w-7 h-7 rounded-lg bg-purple-600/15 hover:bg-purple-600/30 flex items-center justify-center text-purple-400 hover:text-purple-300 transition-all disabled:opacity-40 border border-purple-500/20">
        {scene.isGenerating ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
      </button>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const Shorts: React.FC<ShortsProps> = ({ script, youtubeData, shortsContext, onClearShortsContext, onBack }) => {
  // ── Smart Short Clips state ──
  const [shortsSegments, setShortsSegments] = useState<ShortsSegment[]>([]);
  const [findingSegments, setFindingSegments] = useState<ClipMode | null>(null);
  const [segmentsMode, setSegmentsMode] = useState<ClipMode>('short');
  const [findError, setFindError] = useState('');
  const [selectedShort, setSelectedShort] = useState<ShortsSegment | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [subtitleLayers, setSubtitleLayers] = useState<SubtitleLineLayer[]>([]);
  const [showSmartClips, setShowSmartClips] = useState(true);
  const [generatingLayerIdx, setGeneratingLayerIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const layerEditIdxRef = useRef<number | null>(null);

  const transcript = youtubeData?.transcript || [];
  const videoId = youtubeData?.videoId || '';

  // Build subtitle lines from transcript within trim range,
  // preserving any imageDataUrl already attached for the same source line.
  const rebuildSubtitleLines = useCallback((start: number, end: number) => {
    if (!transcript.length) { setSubtitleLayers([]); return; }
    setSubtitleLayers(prev => {
      const prevByKey = new Map(prev.map(l => [`${Math.round(l.start * 10)}|${l.text}`, l.imageDataUrl]));
      const inRange = transcript.filter(s => s.end >= start && s.start <= end);
      return inRange.map(s => {
        const lineStart = Math.max(s.start, start);
        const lineEnd = Math.min(s.end, end);
        // Match on original transcript line start (rounded), not the trimmed start,
        // so trim adjustments don't drop previously attached images.
        const key = `${Math.round(s.start * 10)}|${s.text}`;
        return {
          text: s.text,
          start: lineStart,
          end: lineEnd,
          imageDataUrl: prevByKey.get(key),
        };
      });
    });
  }, [transcript]);

  // ── Find best segments from AI (short or long) ──
  const handleFindSegments = useCallback(async (mode: ClipMode) => {
    if (!transcript.length) {
      toast.error('No transcript available. Import a YouTube video first.');
      return;
    }
    setFindingSegments(mode);
    setFindError('');
    setShortsSegments([]);
    setSelectedShort(null);
    setSegmentsMode(mode);
    try {
      const segs = await findBestShortsSegments(
        transcript,
        shortsContext?.start,
        shortsContext?.end,
        mode,
      );
      if (!segs.length) throw new Error('No suitable segments found');
      setShortsSegments(segs);
      toast.success(`Found ${segs.length} ${mode === 'long' ? 'long discussion' : 'engaging short'} clips`);
    } catch (e: any) {
      setFindError(e.message || 'Failed to find segments');
      toast.error(e.message || 'Failed to find segments');
    } finally {
      setFindingSegments(null);
    }
  }, [transcript, shortsContext]);

  // When a segment is selected, set trim range and build subtitle layers
  const handleSelectShort = useCallback((seg: ShortsSegment) => {
    setSelectedShort(seg);
    setTrimStart(seg.start);
    setTrimEnd(seg.end);
    rebuildSubtitleLines(seg.start, seg.end);
  }, [rebuildSubtitleLines]);

  // Re-build subtitles when trim changes
  useEffect(() => {
    if (!selectedShort) return;
    rebuildSubtitleLines(trimStart, trimEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimStart, trimEnd]);

  // Image upload for subtitle layer
  const handleAddImageToLayer = (idx: number) => {
    layerEditIdxRef.current = idx;
    fileInputRef.current?.click();
  };
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const idx = layerEditIdxRef.current;
    if (!file || idx === null) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setSubtitleLayers(prev => prev.map((l, i) => i === idx ? { ...l, imageDataUrl: dataUrl } : l));
      toast.success('Image attached to subtitle line');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    layerEditIdxRef.current = null;
  };
  const handleRemoveImageFromLayer = (idx: number) => {
    setSubtitleLayers(prev => prev.map((l, i) => i === idx ? { ...l, imageDataUrl: undefined } : l));
  };

  // AI-generate an image for a subtitle line
  const handleGenerateImageForLayer = async (idx: number) => {
    const layer = subtitleLayers[idx];
    if (!layer) return;
    setGeneratingLayerIdx(idx);
    try {
      const dataUrl = await generateStoryboardImage(layer.text, characterGuide || undefined, '9:16');
      setSubtitleLayers(prev => prev.map((l, i) => i === idx ? { ...l, imageDataUrl: dataUrl } : l));
      toast.success('Image generated');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate image');
    } finally {
      setGeneratingLayerIdx(null);
    }
  };

  const fmtSec = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const [sceneCount, setSceneCount] = useState(10);
  const [model, setModel] = useState('gemini-3.1-flash-lite-preview');
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);

  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [characterGuide, setCharacterGuide] = useState('');
  const scenesLoadedRef = useRef(false);
  const [isGeneratingScenes, setIsGeneratingScenes] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingAllProgress, setGeneratingAllProgress] = useState(0);
  const abortRef = useRef(false);

  const [imageAspectRatio, setImageAspectRatio] = useState<'16:9' | '3:4' | '1:1' | '9:16'>('16:9');

  const [subtitle, setSubtitle] = useState<SubtitleConfig>(DEFAULT_SUBTITLE);
  const [playTime, setPlayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [promptModalId, setPromptModalId] = useState<string | null>(null);

  // Audio playback refs
  const previewAcRef = useRef<AudioContext | null>(null);
  const previewSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const mergedBufRef = useRef<AudioBuffer | null>(null);
  const actualTotalRef = useRef<number>(0);
  // Actual per-audioSeg offsets (decoded durations) — same as video export uses
  const actualSegOffsetsRef = useRef<number[]>([]);
  // For each audio segment (by audio index), its SCRIPT index — avoids stale object-reference bugs
  const audioSegScriptIdxRef = useRef<number[]>([]);
  // Proportional timings for single-audio mode
  const propTimingsRef = useRef<ProportionalTimings | null>(null);
  const singleAudioModeRef = useRef(false);
  // Computed scene start times (seconds) — set after audio loads, used for all modes
  // sceneTimingsRef.current[i] = start time of scenes[i]
  const sceneTimingsRef = useRef<number[]>([]);
  const pauseAtRef = useRef<number>(0);
  const acStartTimeRef = useRef<number>(0);   // AC.currentTime when playback began
  const playStartOffsetRef = useRef<number>(0); // audio offset we started from
  const rafRef = useRef<number>(0);

  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoProgress, setVideoProgress] = useState<{ pct: number; msg: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const activeRowRef = useRef<HTMLDivElement>(null);

  // ── Persist scenes to IndexedDB (base64 imageUrls survive refresh) ──
  useEffect(() => {
    // Load saved scenes on mount if they match the current script
    if (scenesLoadedRef.current) return;
    scenesLoadedRef.current = true;
    loadShortsScenes(script).then(saved => {
      if (saved && saved.scenes.length > 0) {
        setScenes(saved.scenes);
        setCharacterGuide(saved.characterGuide);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Don't save empty state (before first generate)
    if (scenes.length === 0) return;
    saveShortsScenes(script, scenes, characterGuide);
  }, [scenes, characterGuide, script]);

  const { offsets, total: totalDuration } = useMemo(() => buildOffsets(script), [script]);
  // hasAudio: audioUrl present, duration optional (ElevenLabs returns 0)
  const hasAudio = script.some(s => !!s.audioUrl);
  const doneImages = scenes.filter(sc => sc.imageUrl).length;
  const allImagesReady = scenes.length > 0 && scenes.every(sc => sc.imageUrl);

  // ── Segment-based lookups (same logic as video export) ──
  const segToImageMemo = useMemo(() => buildSegToImage(scenes), [scenes]);

  // ── Subtitle segment index (for word-by-word display) ──
  // In single-audio mode: proportional word offsets
  // In multi-audio mode: direct audioSeg index → script index
  const currentSegIdx = useMemo(() => {
    if (singleAudioModeRef.current && propTimingsRef.current) {
      const safeTime = Math.max(0, Math.min(playTime, actualTotalRef.current - 0.001));
      return getAudioSegIdx(safeTime, propTimingsRef.current.segOffsets);
    }
    const actualOffsets = actualSegOffsetsRef.current;
    if (actualOffsets.length > 0 && audioSegScriptIdxRef.current.length > 0) {
      const safeTime = Math.min(playTime, actualTotalRef.current - 0.001);
      return getAudioSegIdx(Math.max(0, safeTime), actualOffsets);
    }
    return getAudioSegIdx(Math.min(playTime, totalDuration - 0.001), offsets);
  }, [playTime, offsets, totalDuration]);

  // ── Active scene — always time-based (works for both modes) ──
  const activeScene = useMemo(() => {
    const timings = sceneTimingsRef.current;
    if (timings.length > 0) {
      const safeTime = Math.max(0, Math.min(playTime, actualTotalRef.current - 0.001));
      const idx = getActiveSceneIdx(safeTime, timings);
      return scenes[idx] ?? scenes[0] ?? null;
    }
    // Before audio loads: use scenes' own startTime values if available
    if (scenes.some(sc => sc.startTime > 0)) {
      const idx = getActiveSceneIdx(playTime, scenes.map(sc => sc.startTime));
      return scenes[idx] ?? scenes[0] ?? null;
    }
    // Last resort: segmentIndices lookup
    return scenes.find(sc => sc.segmentIndices.includes(currentSegIdx)) ?? scenes[0] ?? null;
  }, [scenes, playTime, currentSegIdx]);

  // ── Subtitle text — uses wordTimings if available (exact), else phrase chunks ──
  const activeSubtitleText = useMemo(() => {
    // Helper: get text for a segment at given timeInSeg
    const textForSeg = (seg: typeof script[0] | undefined, timeInSeg: number, segDur: number) => {
      if (!seg) return '';
      // Exact: wordTimings from Google TTS / STT sync
      if (seg.wordTimings && seg.wordTimings.length > 0) {
        return getVisibleTextFromWordTimings(seg.wordTimings, timeInSeg);
      }
      // Fallback: phrase-chunk proportional
      return getVisibleText(seg.text ?? '', timeInSeg, segDur);
    };

    // Single-audio mode: find current script segment by playTime, not by currentSegIdx
    // (currentSegIdx is always 0 in single-audio mode — only 1 merged buffer)
    if (singleAudioModeRef.current && propTimingsRef.current) {
      const segOffsets = propTimingsRef.current.segOffsets;
      // Find which script segment we're currently in based on playTime
      let scriptIdx = 0;
      for (let i = 0; i < segOffsets.length; i++) {
        if (segOffsets[i] <= playTime) scriptIdx = i;
        else break;
      }
      const segStart = segOffsets[scriptIdx] ?? 0;
      const segEnd = segOffsets[scriptIdx + 1] ?? actualTotalRef.current;
      return textForSeg(script[scriptIdx], playTime - segStart, segEnd - segStart);
    }
    // Multi-audio mode — use script indices so we always read fresh segment data
    const actualOffsets = actualSegOffsetsRef.current;
    const scriptIndices = audioSegScriptIdxRef.current;
    if (actualOffsets.length > 0 && scriptIndices.length > 0) {
      const segStart = actualOffsets[currentSegIdx] ?? 0;
      const segEnd = actualOffsets[currentSegIdx + 1] ?? actualTotalRef.current;
      const scriptIdx = scriptIndices[currentSegIdx];
      return textForSeg(script[scriptIdx], playTime - segStart, segEnd - segStart);
    }
    // Fallback (before audio loaded)
    const segStart = offsets[currentSegIdx] ?? 0;
    const segEnd = offsets[currentSegIdx + 1] ?? totalDuration;
    return textForSeg(script[currentSegIdx], playTime - segStart, segEnd - segStart);
  }, [currentSegIdx, playTime, offsets, totalDuration, script]);

  // Active image URL — from activeScene directly (works for both modes)
  const activeImageUrl = activeScene?.imageUrl;

  // ── Draw canvas preview ──
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

    if (activeImageUrl) {
      const doRender = (img: HTMLImageElement) => {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        drawImageCover(ctx, img, W, H);
        drawSubtitleOnCtx(ctx, W, H, activeSubtitleText, subtitle);
      };
      if (imgCacheRef.current.has(activeImageUrl)) {
        doRender(imgCacheRef.current.get(activeImageUrl)!);
      } else {
        const img = new window.Image();
        img.onload = () => { imgCacheRef.current.set(activeImageUrl, img); doRender(img); };
        img.src = activeImageUrl;
      }
    } else {
      ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2a2a2a'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(
        scenes.length === 0 ? 'Generate scenes below to preview' : `Segment ${currentSegIdx + 1} — no image assigned`,
        W / 2, H / 2
      );
      drawSubtitleOnCtx(ctx, W, H, activeSubtitleText, subtitle);
    }
  }, [activeImageUrl, activeSubtitleText, subtitle, scenes.length, currentSegIdx]);

  // ── Audio preview helpers ──
  const stopPreviewAudio = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (previewSrcRef.current) {
      try { previewSrcRef.current.stop(); } catch { /* already stopped */ }
      previewSrcRef.current = null;
    }
  }, []);

  const startPreviewAudio = useCallback((fromTime: number) => {
    stopPreviewAudio();
    if (!mergedBufRef.current) return;
    if (!previewAcRef.current || previewAcRef.current.state === 'closed') {
      previewAcRef.current = new AudioContext();
    }
    const AC = previewAcRef.current;
    if (AC.state === 'suspended') AC.resume();
    const src = AC.createBufferSource();
    src.buffer = mergedBufRef.current;
    src.connect(AC.destination);
    const startOffset = Math.min(Math.max(fromTime, 0), mergedBufRef.current.duration - 0.01);
    // Record AC clock BEFORE starting source so t=0 is exactly the start
    acStartTimeRef.current = AC.currentTime;
    playStartOffsetRef.current = startOffset;
    src.start(0, startOffset);
    previewSrcRef.current = src;
    const total = actualTotalRef.current;
    const tick = () => {
      // AC.currentTime is hardware-accurate — no drift on long audio
      const t = (AC.currentTime - acStartTimeRef.current) + playStartOffsetRef.current;
      if (t >= total) {
        setIsPlaying(false);
        setPlayTime(total);
        pauseAtRef.current = 0;
        return;
      }
      setPlayTime(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopPreviewAudio]);

  const loadMergedAudio = useCallback(async () => {
    if (mergedBufRef.current) return; // already decoded — use propTimings update effect for scene changes
    // Include any segment with an audioUrl — duration may be 0 (ElevenLabs) but AudioBuffer gives real duration
    const audioSegs = script.filter(s => !!s.audioUrl);
    if (!audioSegs.length) { toast.error('Pehle Voice step mein audio generate karo.'); return; }
    setIsLoadingAudio(true);
    try {
      const AC = new AudioContext();
      previewAcRef.current = AC;
      const decoded: AudioBuffer[] = [];
      for (const seg of audioSegs) {
        decoded.push(await AC.decodeAudioData(await (await fetch(seg.audioUrl!)).arrayBuffer()));
      }
      // ── Store actual offsets per audioSeg (identical logic to video export) ──
      const actualDurs = decoded.map(b => b.duration);
      const actualOffsets: number[] = [0];
      for (let i = 0; i < actualDurs.length - 1; i++) actualOffsets.push(actualOffsets[i] + actualDurs[i]);
      const total = actualOffsets[actualOffsets.length - 1] + actualDurs[actualDurs.length - 1];

      const sr = decoded[0].sampleRate, ch = decoded[0].numberOfChannels;
      const merged = AC.createBuffer(ch, decoded.reduce((s, b) => s + b.length, 0), sr);
      let off = 0;
      for (const buf of decoded) {
        for (let c = 0; c < ch; c++) merged.getChannelData(c).set(buf.getChannelData(c), off);
        off += buf.length;
      }
      // Store script-level indices (safe across re-renders — no object references)
      const scriptIndices = audioSegs.map(seg => script.indexOf(seg));
      mergedBufRef.current = merged;
      actualTotalRef.current = total;
      actualSegOffsetsRef.current = actualOffsets;
      audioSegScriptIdxRef.current = scriptIndices;
      singleAudioModeRef.current = audioSegs.length === 1;
      // Proportional timings (for single-audio subtitle sync)
      propTimingsRef.current = singleAudioModeRef.current
        ? buildProportionalTimings(scenes, script, total)
        : null;
      // Scene start times — index-based, no object refs
      const timings = buildSceneTimings(scenes, script, scriptIndices, actualOffsets, actualDurs, total);
      sceneTimingsRef.current = timings;
      // Update display timing (startTime/endTime) with actual decoded values
      setScenes(prev => applyDecodedTimings(prev, timings, total));
    } finally {
      setIsLoadingAudio(false);
    }
  }, [script, scenes]);

  // When scenes change and audio is already loaded, recompute scene timings
  useEffect(() => {
    if (!mergedBufRef.current || scenes.length === 0) return;
    const scriptIndices = audioSegScriptIdxRef.current;
    const offsets = actualSegOffsetsRef.current;
    const total = actualTotalRef.current;
    if (!offsets.length || !scriptIndices.length) return;
    const durs = offsets.map((t, i) => (offsets[i + 1] ?? total) - t);
    if (singleAudioModeRef.current) {
      propTimingsRef.current = buildProportionalTimings(scenes, script, total);
    }
    const newTimings = buildSceneTimings(scenes, script, scriptIndices, offsets, durs, total);
    sceneTimingsRef.current = newTimings;
    // Update display timestamps if any scene still has stale/zero timings
    const needsUpdate = scenes.some((sc, i) => Math.abs((newTimings[i] ?? 0) - sc.startTime) > 0.1);
    if (needsUpdate) {
      setScenes(prev => applyDecodedTimings(prev, newTimings, total));
    }
  }, [scenes, script]);

  // ── Initial display timings (before audio loads) ──────────────────────────
  // Compute estimated startTime/endTime from word coverage so the timeline
  // never shows "0:00 → 0:00" when scenes are loaded from storage or generated.
  useEffect(() => {
    if (scenes.length === 0 || mergedBufRef.current) return; // skip if audio already loaded
    const allZero = scenes.every(sc => sc.startTime === 0 && sc.endTime === 0);
    if (!allZero) return; // already have some timing data
    const estimatedTotal = totalDuration > 0 ? totalDuration : scenes.length * 5;
    const timings = sceneTimingsByWordCoverage(scenes, script, estimatedTotal);
    setScenes(prev => applyDecodedTimings(prev, timings, estimatedTotal));
  }, [scenes, script, totalDuration]);

  const seekTo = useCallback((time: number) => {
    const t = Math.max(0, Math.min(time, actualTotalRef.current || totalDuration));
    pauseAtRef.current = t;
    setPlayTime(t);
    if (isPlaying) startPreviewAudio(t);
  }, [isPlaying, startPreviewAudio, totalDuration]);

  // ── Playback ──
  useEffect(() => {
    if (isPlaying) {
      if (!mergedBufRef.current) {
        // Load then play
        loadMergedAudio().then(() => {
          if (mergedBufRef.current) startPreviewAudio(pauseAtRef.current);
        });
      } else {
        startPreviewAudio(pauseAtRef.current);
      }
    } else {
      pauseAtRef.current = playTime;
      stopPreviewAudio();
    }
    return () => stopPreviewAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreviewAudio();
      previewAcRef.current?.close();
    };
  }, [stopPreviewAudio]);

  // Active row highlight is handled via className — no page scroll

  // ── Build per-segment actual timestamps from audio offsets or wordTimings ──
  const buildSegmentTimestamps = useCallback(() => {
    // Priority 1: actual decoded audio offsets
    const offsets = actualSegOffsetsRef.current;
    const indices = audioSegScriptIdxRef.current;
    const total = actualTotalRef.current;
    if (offsets.length && indices.length && total > 0) {
      const durs = offsets.map((t, i) => (offsets[i + 1] ?? total) - t);
      const segMap = new Map<number, { start: number; end: number }>();
      indices.forEach((scriptIdx, audioIdx) => {
        segMap.set(scriptIdx, { start: offsets[audioIdx], end: offsets[audioIdx] + durs[audioIdx] });
      });
      return segMap;
    }
    // Priority 2: wordTimings (cumulative across segments)
    const hasWord = script.some(s => s.wordTimings && s.wordTimings.length > 0);
    if (hasWord) {
      const segMap = new Map<number, { start: number; end: number }>();
      let cum = 0;
      script.forEach((s, i) => {
        if (s.wordTimings && s.wordTimings.length > 0) {
          const segStart = cum;
          const segEnd = cum + s.wordTimings[s.wordTimings.length - 1].end;
          segMap.set(i, { start: segStart, end: segEnd });
          cum = segEnd;
        } else {
          const dur = s.duration ?? 0;
          segMap.set(i, { start: cum, end: cum + dur });
          cum += dur;
        }
      });
      return segMap;
    }
    return null;
  }, [script]);

  // Absolute word timestamps (memoized) for voiceover display in timeline/modal
  const absWords = useMemo(() => getAbsoluteWords(script), [script]);

  // ── Generate scenes ──
  const handleGenerateScenes = useCallback(async () => {
    if (!script.length) { toast.error('No script loaded.'); return; }
    setIsGeneratingScenes(true); setVideoBlob(null); setCharacterGuide('');
    try {
      const hasWordTimings = absWords.length > 0;

      // Compute total duration: actual decoded audio > wordTimings last word > segment durations
      const segMap = buildSegmentTimestamps();
      const totalFromWordTimings = hasWordTimings ? absWords[absWords.length - 1].absEnd : 0;
      const totalFromSegMap = segMap ? Math.max(...Array.from(segMap.values()).map(v => (v as { start: number; end: number }).end)) : 0;
      const totalDur =
        (actualTotalRef.current > 0 ? actualTotalRef.current : 0) ||
        totalFromWordTimings ||
        totalFromSegMap ||
        script.reduce((s, seg) => s + (seg.duration ?? 0), 0);

      if (hasWordTimings && totalDur > 0) {
        // ── TIME-BASED approach: divide audio into N equal slots, use real word timings ──
        const slotDur = totalDur / sceneCount;

        // For each slot: find all words in that time range, determine segmentIndices
        const slots = Array.from({ length: sceneCount }, (_, i) => {
          const slotStart = i * slotDur;
          const slotEnd = Math.min((i + 1) * slotDur, totalDur);
          const inRange = absWords.filter(w => w.absStart >= slotStart - 0.1 && w.absStart < slotEnd + 0.1);
          const voiceover = inRange.length === 0 ? '' :
            inRange.length <= 14 ? inRange.map(w => w.word).join(' ') :
              `${inRange.slice(0, 6).map(w => w.word).join(' ')} … ${inRange.slice(-4).map(w => w.word).join(' ')}`;

          // Which script segments have words in this slot?
          const segIndices: number[] = [];
          script.forEach((seg, si) => {
            if (!seg.wordTimings?.length) return;
            // Compute absolute offset for this segment
            let off = 0;
            for (let k = 0; k < si; k++) {
              if (script[k].wordTimings?.length) off += script[k].wordTimings![script[k].wordTimings!.length - 1].end;
              else off += script[k].duration ?? 0;
            }
            const firstAbs = off + seg.wordTimings[0].start;
            const lastAbs = off + seg.wordTimings[seg.wordTimings.length - 1].end;
            if (firstAbs < slotEnd + 0.1 && lastAbs > slotStart - 0.1) segIndices.push(si);
          });
          if (segIndices.length === 0) {
            const fallback = Math.min(Math.floor((i / sceneCount) * script.length), script.length - 1);
            segIndices.push(fallback);
          }

          return { sceneNumber: i + 1, startTime: slotStart, endTime: slotEnd, voiceover, segmentIndices: segIndices };
        });

        const result = await generateStoryboardScenesTimeBased(
          slots.map(s => ({ sceneNumber: s.sceneNumber, startTime: s.startTime, endTime: s.endTime, voiceover: s.voiceover })),
          model,
        );

        const built: StoryboardScene[] = slots.map((slot, i) => ({
          id: `scene-${i + 1}`,
          sceneNumber: i + 1,
          prompt: result.prompts[i] || slot.voiceover || `Scene ${i + 1}`,
          startTime: slot.startTime,
          endTime: slot.endTime,
          segmentIndices: slot.segmentIndices,
          isGenerating: false,
        }));

        setScenes(built);
        setCharacterGuide(result.characterGuide || '');
      } else {
        // ── FALLBACK: original AI-based approach ──
        const segs = script.map((s, i) => ({
          speaker: s.speaker,
          text: s.text,
          duration: s.duration,
          startTime: segMap?.get(i)?.start,
          endTime: segMap?.get(i)?.end,
        }));
        const result = await generateStoryboardScenes(segs, sceneCount, model);
        const knownTotal = actualTotalRef.current || undefined;
        const built = buildScenesFromRaw(result.scenes, script, knownTotal);
        setScenes(built);
        setCharacterGuide(result.characterGuide || '');
      }

      setShowSettings(false); setPlayTime(0);
      toast.success(`${sceneCount} scenes created`);
    } catch (e: any) { toast.error(e.message || 'Scene generation failed'); }
    finally { setIsGeneratingScenes(false); }
  }, [script, sceneCount, model, buildSegmentTimestamps, absWords]);

  // ── Generate single image ──
  const handleGenerateImage = useCallback(async (id: string) => {
    const scene = scenes.find(sc => sc.id === id);
    if (!scene) return;
    setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, isGenerating: true, error: undefined } : sc));
    try {
      const url = await generateStoryboardImage(scene.prompt, characterGuide, imageAspectRatio);
      setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, imageUrl: url, isGenerating: false } : sc));
    } catch (e: any) {
      setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, isGenerating: false, error: e.message || 'Failed' } : sc));
      toast.error(`Scene ${scene.sceneNumber}: ${e.message}`);
    }
  }, [scenes, characterGuide]);

  // ── Generate all ──
  const handleGenerateAll = useCallback(async () => {
    abortRef.current = false; setGeneratingAll(true); setGeneratingAllProgress(0);
    const toGen = scenes.filter(sc => !sc.imageUrl);
    for (let i = 0; i < toGen.length; i++) {
      if (abortRef.current) break;
      await handleGenerateImage(toGen[i].id);
      setGeneratingAllProgress(Math.round(((i + 1) / toGen.length) * 100));
      await new Promise(r => setTimeout(r, 400));
    }
    setGeneratingAll(false); setGeneratingAllProgress(0);
    if (!abortRef.current) toast.success('All images generated!');
  }, [scenes, handleGenerateImage]);

  // ── Save prompt ──
  const handleSavePrompt = useCallback((id: string, prompt: string) => {
    setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, prompt } : sc));
  }, []);



  // ── Create video ──
  const handleCreateVideo = useCallback(async () => {
    if (!hasAudio) { toast.error('Generate audio in Voice step first.'); return; }
    if (!scenes.length) { toast.error('Generate scenes first.'); return; }
    setIsExporting(true); setVideoBlob(null); setVideoProgress({ pct: 0, msg: 'Starting…' });
    try {
      const blob = await createStoryboardVideo(scenes, script, subtitle, (pct, msg) => setVideoProgress({ pct, msg }));
      setVideoBlob(blob); setVideoProgress(null); toast.success('Video ready!');
    } catch (e: any) { setVideoProgress(null); toast.error(e.message || 'Video creation failed'); }
    finally { setIsExporting(false); }
  }, [scenes, script, subtitle, hasAudio]);

  const handleDownload = () => {
    if (!videoBlob) return;
    const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a'); a.href = url; a.download = `shorts.${ext}`; a.click();
    URL.revokeObjectURL(url);
  };

  const promptScene = scenes.find(sc => sc.id === promptModalId);

  return (
    <div className="w-full h-full bg-black text-white flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="shrink-0 sticky top-0 z-30 bg-[#050505]/95 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h2 className="text-base font-bold text-white tracking-tight">Shorts</h2>
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          {scenes.length > 0 && <span className={doneImages === scenes.length ? 'text-green-400' : ''}>{doneImages}/{scenes.length} images</span>}
          {!hasAudio && <span className="text-yellow-500/80 text-[10px] bg-yellow-500/8 border border-yellow-500/15 px-2 py-0.5 rounded-full">No audio</span>}
        </div>
      </header>

      {/* Hidden file input for subtitle layer images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileChange}
      />

      {/* ── Scrollable body — same pattern as DebateVisualizer ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-36 md:pb-28">
        <div className="flex flex-col p-3 gap-3 max-w-2xl mx-auto w-full">

          {/* Canvas */}
          <div className="w-full aspect-video bg-[#050505] rounded-2xl overflow-hidden shadow-2xl border border-white/5 relative shrink-0">
            <canvas ref={previewCanvasRef} width={960} height={540} className="w-full h-full object-contain" />
          </div>

          {/* Playback controls */}
          <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-3 flex items-center gap-3">
            <button onClick={() => seekTo(0)} className="p-2 rounded-full hover:bg-white/10 text-gray-500 hover:text-white transition-all shrink-0">
              <SkipBack size={16} />
            </button>
            <button
              onClick={() => {
                if (playTime >= (actualTotalRef.current || totalDuration)) seekTo(0);
                setIsPlaying(v => !v);
              }}
              disabled={isLoadingAudio}
              className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 disabled:opacity-50">
              {isLoadingAudio ? <Loader2 size={20} className="animate-spin" /> : isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={() => seekTo(actualTotalRef.current || totalDuration)} className="p-2 rounded-full hover:bg-white/10 text-gray-500 hover:text-white transition-all shrink-0">
              <SkipForward size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden cursor-pointer"
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const total = actualTotalRef.current || totalDuration;
                  seekTo(Math.max(0, Math.min(((e.clientX - r.left) / r.width) * total, total)));
                }}>
                <div className="h-full bg-red-500 transition-none" style={{ width: (actualTotalRef.current || totalDuration) > 0 ? `${(playTime / (actualTotalRef.current || totalDuration)) * 100}%` : '0%' }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>{fmt(playTime)}</span>
                <span>{activeScene ? `Scene ${activeScene.sceneNumber} of ${scenes.length}` : '—'}</span>
                <span>{fmt(actualTotalRef.current || totalDuration)}</span>
              </div>
            </div>
          </div>

          {/* Scene thumbnail strip */}
          {scenes.length > 0 && (
            <div className="overflow-x-auto scrollbar-hide rounded-xl">
              <div className="flex gap-1.5 min-w-max p-1">
                {scenes.map(scene => {
                  const isActive = activeScene?.id === scene.id;
                  return (
                    <button key={scene.id} onClick={() => seekTo(scene.startTime)}
                      className={`relative flex flex-col items-center gap-0.5 p-1 rounded-xl border transition-all min-w-[60px] ${isActive ? 'bg-white/10 border-white/20' : 'bg-white/3 border-transparent hover:bg-white/8'}`}>
                      <div className="w-full h-9 rounded-lg overflow-hidden bg-[#111] relative">
                        {scene.imageUrl ? <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
                          : scene.isGenerating ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={10} className="animate-spin text-purple-400" /></div>
                          : <div className="absolute inset-0 flex items-center justify-center text-gray-700"><ImagePlus size={11} /></div>}
                      </div>
                      <span className="text-[8px] text-gray-500 font-mono">{(scene.endTime - scene.startTime).toFixed(1)}s</span>
                      {isActive && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Timeline (scene rows) ── */}
          {scenes.length > 0 && (
            <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl overflow-hidden">
              <div className="flex items-center px-4 py-3 border-b border-white/5 gap-2">
                <Film size={13} className="text-purple-400" />
                <span className="text-sm font-bold text-white">Timeline</span>
                <span className="text-[10px] text-gray-600">🖊 click image to edit prompt</span>
              </div>

              {/* Scene rows */}
              <div>
                {scenes.map((scene, idx) => (
                  <div key={scene.id} ref={activeScene?.id === scene.id ? (activeRowRef as any) : undefined}>
                    <TimelineRow
                      scene={scene}
                      script={script}
                      absWords={absWords}
                      totalDuration={actualTotalRef.current || (scenes.length > 0 ? scenes[scenes.length - 1].endTime : totalDuration)}
                      isActive={activeScene?.id === scene.id}
                      onSeek={() => seekTo(scene.startTime)}
                      onOpenPrompt={() => setPromptModalId(scene.id)}
                      onGenerate={() => handleGenerateImage(scene.id)}
                    />
                  </div>
                ))}
              </div>

              {/* Generate all progress */}
              {generatingAll && (
                <div className="px-4 py-3 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Generating images… {generatingAllProgress}%</span>
                    <button onClick={() => { abortRef.current = true; setGeneratingAll(false); }} className="text-red-400 text-xs hover:text-red-300">Stop</button>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full transition-all" style={{ width: `${generatingAllProgress}%` }} />
                  </div>
                </div>
              )}

              {/* ── Regenerate scenes bar ── */}
              <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5 bg-black/30">
                {/* Scene count */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px] text-gray-600">Scenes</span>
                  <input
                    type="number" min={1} max={200} value={sceneCount}
                    onChange={e => setSceneCount(Math.max(1, Math.min(200, Number(e.target.value))))}
                    className="w-10 bg-white/5 border border-white/8 rounded-lg text-[10px] text-white text-center px-1 py-1 focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                {/* Model toggle */}
                <div className="flex bg-black border border-white/8 rounded-lg p-0.5 gap-0.5 shrink-0">
                  {MODEL_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setModel(o.value)}
                      className={`px-2 py-1 rounded-md text-[9px] font-semibold transition-all ${model === o.value ? 'bg-purple-600 text-white' : 'text-gray-600 hover:text-gray-400'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {/* Regenerate button */}
                <button
                  onClick={handleGenerateScenes}
                  disabled={isGeneratingScenes || !script.length}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 disabled:opacity-40 text-purple-300 text-[9px] font-bold border border-purple-500/25 transition-all ml-auto"
                >
                  {isGeneratingScenes ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />}
                  {isGeneratingScenes ? 'Generating…' : 'Regenerate'}
                </button>
              </div>
            </div>
          )}

          {/* ── Subtitle Settings (collapsible) ── */}
          <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl overflow-hidden">
            <button onClick={() => setShowSubtitleSettings(v => !v)} className="w-full flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <Type size={15} className="text-blue-400" />
                <span className="font-bold text-white text-sm">Subtitle Settings</span>
                {subtitle.enabled ? <span className="text-[9px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full">ON</span>
                  : <span className="text-[9px] text-gray-600 bg-white/5 border border-white/8 px-1.5 py-0.5 rounded-full">OFF</span>}
              </div>
              {showSubtitleSettings ? <ChevronUp size={17} className="text-gray-500" /> : <ChevronDown size={17} className="text-gray-500" />}
            </button>

            {showSubtitleSettings && (
              <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                {/* Enable toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Show Subtitles</span>
                  <button onClick={() => setSubtitle(s => ({ ...s, enabled: !s.enabled }))}
                    className={`w-11 h-6 rounded-full transition-all ${subtitle.enabled ? 'bg-blue-600' : 'bg-gray-700'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${subtitle.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className={`space-y-4 transition-opacity ${subtitle.enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                  {/* Font size */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-400"><span>Font Size</span><span className="font-mono text-blue-400">{subtitle.fontSize}px</span></div>
                    <input type="range" min={10} max={32} value={subtitle.fontSize}
                      onChange={e => setSubtitle(s => ({ ...s, fontSize: Number(e.target.value) }))}
                      className="w-full accent-blue-500" />
                  </div>

                  {/* Position */}
                  <div className="space-y-2">
                    <span className="text-xs text-gray-400">Position</span>
                    <div className="flex gap-2">
                      {(['top', 'bottom'] as const).map(pos => (
                        <button key={pos} onClick={() => setSubtitle(s => ({ ...s, position: pos }))}
                          className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${subtitle.position === pos ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'bg-white/5 border-white/8 text-gray-500 hover:text-gray-300'}`}>
                          {pos === 'top' ? '↑ Top' : '↓ Bottom'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Text color */}
                  <div className="space-y-2">
                    <span className="text-xs text-gray-400">Text Color</span>
                    <div className="flex gap-2 flex-wrap">
                      {['#ffffff', '#ffff00', '#00ff88', '#ff6b6b', '#74b9ff'].map(c => (
                        <button key={c} onClick={() => setSubtitle(s => ({ ...s, textColor: c }))}
                          style={{ background: c }}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${subtitle.textColor === c ? 'border-white scale-110' : 'border-transparent'}`} />
                      ))}
                      <label className="w-8 h-8 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:border-white/40 transition-all overflow-hidden" style={{ background: subtitle.textColor }}>
                        <input type="color" value={subtitle.textColor} onChange={e => setSubtitle(s => ({ ...s, textColor: e.target.value }))} className="opacity-0 absolute" />
                      </label>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>

          {/* ── Image Generation Settings (collapsible) ── */}
          <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl overflow-hidden">
            <button onClick={() => setShowSettings(v => !v)} className="w-full flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <Settings2 size={15} className="text-purple-500" />
                <span className="font-bold text-white text-sm">Image Generation</span>
                {scenes.length > 0 && <span className="text-[10px] text-gray-600">{scenes.length} scenes · {doneImages} images</span>}
              </div>
              {showSettings ? <ChevronUp size={17} className="text-gray-500" /> : <ChevronDown size={17} className="text-gray-500" />}
            </button>

            {showSettings && (
              <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-2">Scenes <span className="text-purple-400 font-bold">{sceneCount}</span></label>
                    <input type="range" min={1} max={200} value={sceneCount} onChange={e => setSceneCount(Number(e.target.value))} className="w-full accent-purple-500" />
                    <div className="flex justify-between text-[10px] text-gray-700 mt-0.5"><span>1</span><span>200</span></div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-2">Model</label>
                    <div className="flex bg-black border border-white/5 rounded-xl p-1 gap-1">
                      {MODEL_OPTIONS.map(o => (
                        <button key={o.value} onClick={() => setModel(o.value)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${model === o.value ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-2">Image Ratio</label>
                  <div className="flex bg-black border border-white/5 rounded-xl p-1 gap-1">
                    {(['16:9', '9:16', '3:4', '1:1'] as const).map(r => (
                      <button key={r} onClick={() => setImageAspectRatio(r)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${imageAspectRatio === r ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {characterGuide && (
                  <div className="bg-blue-500/5 border border-blue-500/12 rounded-xl px-3 py-2.5">
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-1">Character Guide</p>
                    <p className="text-[10px] text-gray-500 leading-relaxed">{characterGuide}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button onClick={handleGenerateScenes} disabled={isGeneratingScenes || !script.length}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/30 disabled:text-purple-800 text-white text-sm font-semibold transition-all">
                    {isGeneratingScenes ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {isGeneratingScenes ? 'Generating…' : scenes.length > 0 ? 'Regenerate Scenes' : 'Generate Scenes'}
                  </button>
                  {scenes.length > 0 && !generatingAll && (
                    <button onClick={handleGenerateAll} disabled={allImagesReady}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 text-sm font-semibold border border-blue-500/20 disabled:opacity-40 transition-all">
                      <Zap size={14} /> Generate All Images
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ═══ Smart Short Clips ═══ */}
          <div className="bg-gradient-to-br from-pink-950/40 via-[#0a0a0a] to-purple-950/30 border border-pink-500/20 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowSmartClips(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Scissors size={16} className="text-pink-400" />
                <h3 className="text-sm font-semibold text-white">Smart Short Clips</h3>
                {shortsContext && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                    Context attached
                  </span>
                )}
              </div>
              {showSmartClips ? <ChevronUp size={16} className="text-white/50" /> : <ChevronDown size={16} className="text-white/50" />}
            </button>

            {showSmartClips && (
              <div className="px-4 pb-4 space-y-3">
                {!youtubeData && (
                  <div className="text-xs text-white/50 bg-white/5 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                    <span>Import a YouTube video first to use Smart Short Clips. Go to Content Importer → YouTube tab.</span>
                  </div>
                )}

                {shortsContext && (
                  <div className="bg-pink-500/10 border border-pink-500/30 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <Sparkles size={12} className="text-pink-300" />
                        <span className="text-[11px] font-semibold text-pink-300">Attached chunk</span>
                        <span className="text-[10px] text-white/50">{fmtSec(shortsContext.start)} – {fmtSec(shortsContext.end)}</span>
                      </div>
                      {onClearShortsContext && (
                        <button
                          onClick={onClearShortsContext}
                          className="text-white/40 hover:text-white/80 transition-colors"
                          title="Remove context"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-white/80 font-medium">{shortsContext.title}</p>
                    {shortsContext.summary && (
                      <p className="text-[11px] text-white/60 mt-1 line-clamp-2">{shortsContext.summary}</p>
                    )}
                  </div>
                )}

                {youtubeData && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleFindSegments('short')}
                      disabled={!!findingSegments || !transcript.length}
                      className="flex flex-col items-center justify-center gap-1 px-3 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all"
                    >
                      <div className="flex items-center gap-1.5">
                        {findingSegments === 'short' ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
                        <span>{findingSegments === 'short' ? 'Analyzing…' : 'Smart Short Clips'}</span>
                      </div>
                      <span className="text-[10px] text-white/70 font-normal">20–60 sec · punchy hooks</span>
                    </button>
                    <button
                      onClick={() => handleFindSegments('long')}
                      disabled={!!findingSegments || !transcript.length}
                      className="flex flex-col items-center justify-center gap-1 px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all"
                    >
                      <div className="flex items-center gap-1.5">
                        {findingSegments === 'long' ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />}
                        <span>{findingSegments === 'long' ? 'Analyzing…' : 'Smart Long Clips'}</span>
                      </div>
                      <span className="text-[10px] text-white/70 font-normal">90 sec–6 min · full context</span>
                    </button>
                  </div>
                )}

                {findError && (
                  <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-2 flex items-start gap-2">
                    <AlertCircle size={12} className="shrink-0 mt-0.5" /> {findError}
                  </div>
                )}

                {/* Segment cards */}
                {shortsSegments.length > 0 && (
                  <div className="space-y-2">
                    {shortsSegments.map((seg, i) => {
                      const isSelected = selectedShort?.start === seg.start && selectedShort?.end === seg.end;
                      return (
                        <button
                          key={i}
                          onClick={() => handleSelectShort(seg)}
                          className={`w-full text-left rounded-xl p-3 border transition-all ${
                            isSelected
                              ? 'bg-pink-500/15 border-pink-500/50'
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                isSelected ? 'bg-pink-500 text-white' : 'bg-white/10 text-white/70'
                              }`}>#{i + 1}</span>
                              <span className="text-[10px] text-white/50 font-mono">
                                {fmtSec(seg.start)} – {fmtSec(seg.end)} · {fmtSec(seg.end - seg.start)}
                              </span>
                              {segmentsMode === 'long' && (
                                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  Long
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-white/85 font-medium">{seg.title}</p>
                          {seg.hook && (
                            <p className="text-[11px] text-pink-300/80 italic mt-1 line-clamp-1">"{seg.hook}"</p>
                          )}
                          {seg.description && (
                            <p className="text-[11px] text-white/55 mt-1 line-clamp-2">{seg.description}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Selected segment preview + trim + subtitle layer */}
                {selectedShort && videoId && (
                  <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                    <div className="aspect-video bg-black">
                      <iframe
                        key={`${videoId}-${selectedShort.start}-${selectedShort.end}`}
                        className="w-full h-full"
                        src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(trimStart)}&end=${Math.ceil(trimEnd)}&autoplay=0&rel=0`}
                        title="Short preview"
                        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>

                    {/* Trim controls */}
                    <div className="p-3 space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-semibold text-white/70">Trim Start: {fmtSec(trimStart)}</label>
                          <button
                            onClick={() => { setTrimStart(selectedShort.start); setTrimEnd(selectedShort.end); }}
                            className="text-[10px] text-pink-300 hover:text-pink-200"
                          >Reset</button>
                        </div>
                        <input
                          type="range"
                          min={selectedShort.start}
                          max={Math.max(selectedShort.start, trimEnd - 1)}
                          step={0.5}
                          value={trimStart}
                          onChange={(e) => setTrimStart(Number(e.target.value))}
                          className="w-full accent-pink-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-white/70 block mb-1">
                          Trim End: {fmtSec(trimEnd)}
                        </label>
                        <input
                          type="range"
                          min={Math.min(selectedShort.end, trimStart + 1)}
                          max={selectedShort.end}
                          step={0.5}
                          value={trimEnd}
                          onChange={(e) => setTrimEnd(Number(e.target.value))}
                          className="w-full accent-pink-500"
                        />
                      </div>
                      <div className="text-[11px] text-white/50 text-center">
                        Final clip duration: <span className="text-white font-semibold">{fmtSec(trimEnd - trimStart)}</span>
                      </div>
                    </div>

                    {/* Subtitle timeline with image layer per phrase */}
                    {subtitleLayers.length > 0 && (
                      <div className="border-t border-white/10 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Type size={12} className="text-blue-300" />
                          <span className="text-[11px] font-semibold text-white/80">Auto Subtitles · Image Layer</span>
                        </div>
                        <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                          {subtitleLayers.map((layer, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
                              <span className="text-[10px] text-white/40 font-mono shrink-0 w-12 text-center">
                                {fmtSec(layer.start)}
                              </span>
                              <p className="text-[11px] text-white/80 flex-1 leading-snug line-clamp-2">{layer.text}</p>
                              {layer.imageDataUrl ? (
                                <div className="relative shrink-0">
                                  <img src={layer.imageDataUrl} alt="" className="w-10 h-10 rounded object-cover border border-white/20" />
                                  <button
                                    onClick={() => handleRemoveImageFromLayer(idx)}
                                    className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 hover:bg-red-400"
                                    title="Remove image"
                                  >
                                    <X size={8} className="text-white" />
                                  </button>
                                </div>
                              ) : (
                                <div className="shrink-0 flex items-center gap-1">
                                  <button
                                    onClick={() => handleAddImageToLayer(idx)}
                                    disabled={generatingLayerIdx === idx}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/15 hover:bg-blue-500/25 disabled:opacity-50 border border-blue-500/30 text-blue-300 text-[10px] font-semibold transition-all"
                                    title="Upload image"
                                  >
                                    <ImageIcon size={10} /> Add
                                  </button>
                                  <button
                                    onClick={() => handleGenerateImageForLayer(idx)}
                                    disabled={generatingLayerIdx !== null}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-50 border border-purple-500/30 text-purple-300 text-[10px] font-semibold transition-all"
                                    title="AI-generate image from subtitle text"
                                  >
                                    {generatingLayerIdx === idx
                                      ? <Loader2 size={10} className="animate-spin" />
                                      : <Sparkles size={10} />}
                                    Gen
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-white/40 mt-2 text-center">
                          Images appear on top of the video while each subtitle is shown.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Fixed bottom: Render button (exactly like DebateVisualizer) ── */}
      <div className="fixed bottom-[60px] md:bottom-0 left-0 right-0 z-[60] p-3 bg-[#050505]/95 backdrop-blur border-t border-white/5 md:left-72">
        {isExporting && videoProgress && (
          <div className="mb-2 h-1.5 rounded-full overflow-hidden bg-gray-800">
            <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${videoProgress.pct}%` }} />
          </div>
        )}
        {videoBlob ? (
          <div className="flex gap-2">
            <button onClick={handleDownload}
              className="flex-1 py-4 bg-green-600/80 hover:bg-green-500 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-green-900/20">
              <Download size={20} /> Download Video ({(videoBlob.size / 1024 / 1024).toFixed(1)} MB)
            </button>
            <button onClick={() => setVideoBlob(null)}
              className="w-14 py-4 bg-white/6 hover:bg-white/12 rounded-2xl flex items-center justify-center text-gray-400 transition-all">
              <X size={18} />
            </button>
          </div>
        ) : (
          <button onClick={handleCreateVideo} disabled={isExporting || !hasAudio}
            className="w-full py-4 bg-red-600/80 hover:bg-red-500 active:bg-red-700 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait shadow-lg shadow-red-900/20">
            {isExporting ? (
              <><Loader2 className="animate-spin" size={20} /> Rendering… {videoProgress?.pct ?? 0}%</>
            ) : (
              <><Video size={20} /> Render Storyboard Video</>
            )}
          </button>
        )}
      </div>

      {/* ── Prompt Modal ── */}
      {promptModalId && promptScene && (
        <PromptModal
          scene={promptScene}
          characterGuide={characterGuide}
          absWords={absWords}
          script={script}
          totalDuration={actualTotalRef.current || (scenes.length > 0 ? scenes[scenes.length - 1].endTime : totalDuration)}
          onSave={handleSavePrompt}
          onGenerate={handleGenerateImage}
          onClose={() => setPromptModalId(null)}
        />
      )}
    </div>
  );
};

export default Shorts;
