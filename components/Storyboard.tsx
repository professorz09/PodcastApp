import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Film, Wand2, ChevronDown, ChevronUp,
  Play, Pause, Download, Loader2, AlertCircle,
  ArrowLeft, Settings2, ImagePlus, Video, X,
  RefreshCw, SkipBack, SkipForward, Zap,
  Type
} from 'lucide-react';
import { DebateSegment, StoryboardScene } from '../types';
import { generateStoryboardScenes, generateStoryboardImage } from '../services/geminiService';
import { toast } from './Toast';

interface StoryboardProps {
  script: DebateSegment[];
  onBack: () => void;
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

// Word-by-word subtitle: returns the visible portion of text
function getVisibleText(text: string, timeInSeg: number, segDuration: number): string {
  if (segDuration <= 0) return text;
  const words = text.trim().split(/\s+/);
  const count = Math.max(1, Math.ceil((timeInSeg / segDuration) * words.length));
  return words.slice(0, count).join(' ');
}

function buildScenesFromRaw(
  rawScenes: { sceneNumber: number; prompt: string; segmentIndices: number[] }[],
  segments: DebateSegment[],
): StoryboardScene[] {
  const { offsets, total } = buildOffsets(segments);
  return rawScenes.map((raw) => {
    const indices = raw.segmentIndices.filter(i => i >= 0 && i < segments.length);
    const start = indices.length > 0 ? offsets[indices[0]] : 0;
    const lastIdx = indices.length > 0 ? indices[indices.length - 1] : 0;
    const end = (lastIdx < segments.length - 1)
      ? offsets[lastIdx] + (segments[lastIdx].duration ?? 0)
      : total;
    return { id: `scene-${raw.sceneNumber}`, sceneNumber: raw.sceneNumber, prompt: raw.prompt, startTime: Math.max(0, start), endTime: Math.max(start + 0.5, end), segmentIndices: indices };
  });
}


// Draw subtitle text on canvas context (shared by preview + video export)
function drawSubtitleOnCtx(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  text: string,
  cfg: SubtitleConfig,
) {
  if (!cfg.enabled || !text) return;
  const fs = cfg.fontSize;
  ctx.font = `bold ${fs}px sans-serif`;
  ctx.textAlign = 'center';
  // Text shadow for legibility without background
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
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
  const totalH = lines.length * lh;
  const baseY = cfg.position === 'top' ? 32 : H - totalH - 24;
  ctx.fillStyle = cfg.textColor;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, baseY + (i + 1) * lh - fs * 0.35));
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
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

  // Only segments WITH audio (in script order)
  const audioSegs = script.filter(s => s.audioUrl && (s.duration ?? 0) > 0);
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

  // ── scriptIdx → imageUrl map (from scene.segmentIndices) ──
  const segToImg = buildSegToImage(scenes);

  onProgress(35, 'Loading images…');
  const imgCache = new Map<string, HTMLImageElement>();
  for (const url of new Set(segToImg.values())) {
    const img = new window.Image();
    await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); img.src = url; });
    imgCache.set(url, img);
  }

  const W = 1280, H = 720, FPS = 30;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const dest = AC.createMediaStreamDestination();
  const src = AC.createBufferSource(); src.buffer = merged; src.connect(dest);

  const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ? 'video/mp4;codecs=avc1' : 'video/webm;codecs=vp9';
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(
    new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]),
    { mimeType, videoBitsPerSecond: 6_000_000 }
  );
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise<void>(r => { recorder.onstop = () => r(); });
  recorder.start(100); src.start(0);
  const startWall = performance.now();

  const draw = () => {
    const elapsed = (performance.now() - startWall) / 1000;
    if (elapsed >= totalDuration + 0.1) { recorder.stop(); return; }
    onProgress(50 + Math.round((elapsed / totalDuration) * 46), `Recording ${fmt(elapsed)} / ${fmt(totalDuration)}…`);

    // ── Segment-accurate image lookup ──
    const audioIdx = getAudioSegIdx(elapsed, actualOffsets);
    const scriptIdx = script.indexOf(audioSegs[audioIdx]);
    const imgUrl = segToImg.get(scriptIdx);
    const timeInSeg = elapsed - actualOffsets[audioIdx];
    const segDur = actualDurs[audioIdx];

    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (imgUrl) {
      const img = imgCache.get(imgUrl);
      if (img) drawImageCover(ctx, img, W, H);
    }

    // ── Word-by-word subtitle ──
    const rawText = audioSegs[audioIdx]?.text ?? '';
    const visibleText = getVisibleText(rawText, timeInSeg, segDur);
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
  onSave: (id: string, prompt: string) => void;
  onGenerate: (id: string) => void;
  onClose: () => void;
}> = ({ scene, characterGuide, onSave, onGenerate, onClose }) => {
  const [prompt, setPrompt] = useState(scene.prompt);
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl w-full max-w-md flex flex-col shadow-2xl max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5">
          <h3 className="text-white font-bold text-sm">Scene {scene.sceneNumber}</h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/8 text-gray-500"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div className="aspect-video bg-[#0a0a0a] rounded-xl overflow-hidden border border-white/6 relative">
            {scene.imageUrl ? <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
              : scene.isGenerating ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-purple-500" /></div>
              : scene.error ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"><AlertCircle size={20} className="text-red-400" /><span className="text-xs text-red-400">{scene.error}</span></div>
              : <div className="absolute inset-0 flex items-center justify-center text-gray-700"><ImagePlus size={28} /></div>}
          </div>
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

// ── Timeline Row (each scene clip) ────────────────────────────────────────────
const TimelineRow: React.FC<{
  scene: StoryboardScene;
  isActive: boolean;
  onSeek: () => void;
  onOpenPrompt: () => void;
  onGenerate: () => void;
}> = ({ scene, isActive, onSeek, onOpenPrompt, onGenerate }) => {
  const dur = scene.endTime - scene.startTime;

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
        <p className="text-[10px] text-gray-500 line-clamp-1 leading-relaxed">{scene.prompt}</p>
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
const Storyboard: React.FC<StoryboardProps> = ({ script, onBack }) => {
  const [sceneCount, setSceneCount] = useState(10);
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);

  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [characterGuide, setCharacterGuide] = useState('');
  const [isGeneratingScenes, setIsGeneratingScenes] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingAllProgress, setGeneratingAllProgress] = useState(0);
  const abortRef = useRef(false);

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
  const pauseAtRef = useRef<number>(0);
  const wallStartRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoProgress, setVideoProgress] = useState<{ pct: number; msg: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const activeRowRef = useRef<HTMLDivElement>(null);

  const { offsets, total: totalDuration } = useMemo(() => buildOffsets(script), [script]);
  const hasAudio = script.some(s => s.audioUrl && (s.duration ?? 0) > 0);
  const doneImages = scenes.filter(sc => sc.imageUrl).length;
  const allImagesReady = scenes.length > 0 && scenes.every(sc => sc.imageUrl);

  // ── Segment-based lookups (same logic as video export) ──
  const segToImageMemo = useMemo(() => buildSegToImage(scenes), [scenes]);

  // Current segment index based on playTime + script offsets
  const currentSegIdx = useMemo(
    () => getAudioSegIdx(Math.min(playTime, totalDuration - 0.001), offsets),
    [playTime, offsets, totalDuration]
  );

  // Active scene = the scene that covers currentSegIdx
  const activeScene = useMemo(
    () => scenes.find(sc => sc.segmentIndices.includes(currentSegIdx)) ?? scenes[0] ?? null,
    [scenes, currentSegIdx]
  );

  // Word-by-word subtitle for preview
  const activeSubtitleText = useMemo(() => {
    const rawText = script[currentSegIdx]?.text ?? '';
    const segStart = offsets[currentSegIdx] ?? 0;
    const segEnd = offsets[currentSegIdx + 1] ?? totalDuration;
    const segDur = segEnd - segStart;
    const timeInSeg = playTime - segStart;
    return getVisibleText(rawText, timeInSeg, segDur);
  }, [currentSegIdx, playTime, offsets, totalDuration, script]);

  // Active image URL from segment lookup
  const activeImageUrl = useMemo(
    () => segToImageMemo.get(currentSegIdx),
    [segToImageMemo, currentSegIdx]
  );

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
    src.start(0, startOffset);
    previewSrcRef.current = src;
    wallStartRef.current = performance.now() - startOffset * 1000;
    const total = actualTotalRef.current;
    const tick = () => {
      const t = (performance.now() - wallStartRef.current) / 1000;
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
    if (mergedBufRef.current) return; // already loaded
    const audioSegs = script.filter(s => s.audioUrl && (s.duration ?? 0) > 0);
    if (!audioSegs.length) { toast.error('Pehle Voice step mein audio generate karo.'); return; }
    setIsLoadingAudio(true);
    try {
      const AC = new AudioContext();
      previewAcRef.current = AC;
      const decoded: AudioBuffer[] = [];
      for (const seg of audioSegs) {
        decoded.push(await AC.decodeAudioData(await (await fetch(seg.audioUrl!)).arrayBuffer()));
      }
      const sr = decoded[0].sampleRate, ch = decoded[0].numberOfChannels;
      const total = decoded.reduce((s, b) => s + b.duration, 0);
      const merged = AC.createBuffer(ch, decoded.reduce((s, b) => s + b.length, 0), sr);
      let off = 0;
      for (const buf of decoded) {
        for (let c = 0; c < ch; c++) merged.getChannelData(c).set(buf.getChannelData(c), off);
        off += buf.length;
      }
      mergedBufRef.current = merged;
      actualTotalRef.current = total;
    } finally {
      setIsLoadingAudio(false);
    }
  }, [script]);

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

  // ── Scroll active row into view ──
  useEffect(() => {
    if (isPlaying) activeRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeScene?.id, isPlaying]);

  // ── Generate scenes ──
  const handleGenerateScenes = useCallback(async () => {
    if (!script.length) { toast.error('No script loaded.'); return; }
    setIsGeneratingScenes(true); setVideoBlob(null); setCharacterGuide('');
    try {
      const result = await generateStoryboardScenes(script.map(s => ({ speaker: s.speaker, text: s.text, duration: s.duration })), sceneCount, model);
      const built = buildScenesFromRaw(result.scenes, script);
      setScenes(built); setCharacterGuide(result.characterGuide || '');
      setShowSettings(false); setPlayTime(0);
      toast.success(`${built.length} scenes created`);
    } catch (e: any) { toast.error(e.message || 'Scene generation failed'); }
    finally { setIsGeneratingScenes(false); }
  }, [script, sceneCount, model]);

  // ── Generate single image ──
  const handleGenerateImage = useCallback(async (id: string) => {
    const scene = scenes.find(sc => sc.id === id);
    if (!scene) return;
    setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, isGenerating: true, error: undefined } : sc));
    try {
      const url = await generateStoryboardImage(scene.prompt, characterGuide);
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
    const a = document.createElement('a'); a.href = url; a.download = `storyboard.${ext}`; a.click();
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
        <h2 className="text-base font-bold text-white tracking-tight">Storyboard</h2>
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          {scenes.length > 0 && <span className={doneImages === scenes.length ? 'text-green-400' : ''}>{doneImages}/{scenes.length} images</span>}
          {!hasAudio && <span className="text-yellow-500/80 text-[10px] bg-yellow-500/8 border border-yellow-500/15 px-2 py-0.5 rounded-full">No audio</span>}
        </div>
      </header>

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
                    <button key={scene.id} onClick={() => { seekTo(scene.startTime); setIsPlaying(false); }}
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
                      isActive={activeScene?.id === scene.id}
                      onSeek={() => { seekTo(scene.startTime); setIsPlaying(false); }}
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
          onSave={handleSavePrompt}
          onGenerate={handleGenerateImage}
          onClose={() => setPromptModalId(null)}
        />
      )}
    </div>
  );
};

export default Storyboard;
