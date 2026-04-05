import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Film, Wand2, Copy, Check, ChevronDown, ChevronUp,
  Play, Pause, Download, Loader2, AlertCircle, Layers, Clock, ArrowLeft,
  Zap, Settings2, ImagePlus, Video, Mic2, X, RefreshCw, Image as ImageIcon,
  SkipBack, SkipForward
} from 'lucide-react';
import { DebateSegment, StoryboardScene } from '../types';
import { generateStoryboardScenes, generateStoryboardImage } from '../services/geminiService';
import { toast } from './Toast';

interface StoryboardProps {
  script: DebateSegment[];
  onBack: () => void;
}

const MODEL_OPTIONS = [
  { value: 'gemini-3-flash-preview', label: 'Flash' },
  { value: 'gemini-3.1-pro-preview', label: 'Pro' },
];

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

// ── Build cumulative time offsets ─────────────────────────────────────────────
function buildOffsets(segments: DebateSegment[]) {
  const offsets: number[] = [];
  let t = 0;
  for (const seg of segments) { offsets.push(t); t += seg.duration ?? 0; }
  return { offsets, total: t };
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
    return { id: `scene-${raw.sceneNumber}`, sceneNumber: raw.sceneNumber, prompt: raw.prompt, startTime: start, endTime: end, segmentIndices: indices };
  });
}

// Build initial segment→image mapping from scenes
function buildSegmentImages(scenes: StoryboardScene[], segCount: number): Record<number, string> {
  const m: Record<number, string> = {};
  for (const sc of scenes) {
    if (!sc.imageUrl) continue;
    for (const idx of sc.segmentIndices) {
      if (idx >= 0 && idx < segCount) m[idx] = sc.imageUrl;
    }
  }
  return m;
}

// ── Video creation ────────────────────────────────────────────────────────────
async function createStoryboardVideo(
  segmentImages: Record<number, string>,
  script: DebateSegment[],
  onProgress: (pct: number, msg: string) => void,
): Promise<Blob> {
  onProgress(0, 'Loading audio…');
  const audioSegs = script.filter(s => s.audioUrl && s.duration && s.duration > 0);
  if (audioSegs.length === 0) throw new Error('No audio found — generate audio first in Voice step.');

  const AC = new AudioContext();
  const decoded: AudioBuffer[] = [];
  for (let i = 0; i < audioSegs.length; i++) {
    onProgress(5 + Math.round((i / audioSegs.length) * 25), `Decoding audio ${i + 1}/${audioSegs.length}…`);
    const resp = await fetch(audioSegs[i].audioUrl!);
    const ab = await AC.decodeAudioData(await resp.arrayBuffer());
    decoded.push(ab);
  }

  onProgress(30, 'Merging audio…');
  const totalSamples = decoded.reduce((s, b) => s + b.length, 0);
  const sr = decoded[0].sampleRate;
  const ch = decoded[0].numberOfChannels;
  const merged = AC.createBuffer(ch, totalSamples, sr);
  let off = 0;
  for (const buf of decoded) {
    for (let c = 0; c < ch; c++) merged.getChannelData(c).set(buf.getChannelData(c), off);
    off += buf.length;
  }
  const totalDuration = merged.duration;

  // Build per-segment time ranges
  const { offsets } = buildOffsets(script);

  onProgress(35, 'Loading images…');
  const imgMap = new Map<string, HTMLImageElement>();
  const uniqueUrls = Array.from(new Set(Object.values(segmentImages)));
  for (let i = 0; i < uniqueUrls.length; i++) {
    onProgress(35 + Math.round((i / uniqueUrls.length) * 15), `Loading image ${i + 1}/${uniqueUrls.length}…`);
    const url = uniqueUrls[i];
    const img = new window.Image();
    await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); img.src = url; });
    imgMap.set(url, img);
  }

  onProgress(50, 'Recording…');
  const W = 1280, H = 720, FPS = 30;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const dest = AC.createMediaStreamDestination();
  const src = AC.createBufferSource();
  src.buffer = merged; src.connect(dest);

  const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ? 'video/mp4;codecs=avc1'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const recorder = new MediaRecorder(new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]), { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise<void>(r => { recorder.onstop = () => r(); });

  recorder.start(100); src.start(0);
  const startWall = performance.now();

  const draw = () => {
    const elapsed = (performance.now() - startWall) / 1000;
    if (elapsed >= totalDuration + 0.1) { recorder.stop(); return; }
    onProgress(50 + Math.round((elapsed / totalDuration) * 46), `Recording ${fmt(elapsed)} / ${fmt(totalDuration)}…`);

    // Find active segment
    let activeSegIdx = script.length - 1;
    for (let i = 0; i < offsets.length; i++) {
      const end = i < offsets.length - 1 ? offsets[i + 1] : totalDuration;
      if (elapsed >= offsets[i] && elapsed < end) { activeSegIdx = i; break; }
    }
    const imgUrl = segmentImages[activeSegIdx];
    const img = imgUrl ? imgMap.get(imgUrl) : undefined;

    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (img && img.complete && img.naturalWidth > 0) {
      const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  await done;
  onProgress(98, 'Finalizing…');
  return new Blob(chunks, { type: mimeType });
}

// ── Image Picker Modal ────────────────────────────────────────────────────────
const ImagePickerModal: React.FC<{
  scenes: StoryboardScene[];
  onPick: (imageUrl: string) => void;
  onClose: () => void;
  segmentText: string;
}> = ({ scenes, onPick, onClose, segmentText }) => {
  const withImages = scenes.filter(sc => sc.imageUrl);
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h3 className="text-white font-bold text-sm">Choose Image</h3>
            <p className="text-gray-600 text-xs mt-0.5 line-clamp-1">{segmentText}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/8 text-gray-500 transition-all">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {withImages.length === 0 ? (
            <div className="text-center py-12 text-gray-600 text-sm">
              No images generated yet. Generate images first.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {withImages.map(sc => (
                <button
                  key={sc.id}
                  onClick={() => onPick(sc.imageUrl!)}
                  className="group relative aspect-video rounded-xl overflow-hidden border border-white/8 hover:border-purple-500/60 transition-all"
                >
                  <img src={sc.imageUrl!} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-bold">Use Scene {sc.sceneNumber}</span>
                  </div>
                  <span className="absolute bottom-1.5 left-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-md font-bold">#{sc.sceneNumber}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-white/5">
          <button
            onClick={() => onPick('')}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Clear image for this segment
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Preview Canvas ────────────────────────────────────────────────────────────
const PreviewCanvas: React.FC<{
  segmentImages: Record<number, string>;
  script: DebateSegment[];
  totalDuration: number;
  offsets: number[];
  playTime: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (t: number) => void;
  onPrev: () => void;
  onNext: () => void;
  currentSegIdx: number;
}> = ({ segmentImages, script, totalDuration, offsets, playTime, isPlaying, onPlayPause, onSeek, onPrev, onNext, currentSegIdx }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const activeUrl = segmentImages[currentSegIdx] ?? '';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!activeUrl) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#333';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Segment ${currentSegIdx + 1} — No image assigned`, canvas.width / 2, canvas.height / 2);
      return;
    }

    const draw = (img: HTMLImageElement) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    };

    if (imgCache.current.has(activeUrl)) {
      draw(imgCache.current.get(activeUrl)!);
    } else {
      const img = new window.Image();
      img.onload = () => { imgCache.current.set(activeUrl, img); draw(img); };
      img.src = activeUrl;
    }
  }, [activeUrl, currentSegIdx]);

  const pct = totalDuration > 0 ? (playTime / totalDuration) * 100 : 0;
  const seg = script[currentSegIdx];

  return (
    <div className="flex flex-col gap-3">
      {/* Canvas */}
      <div className="relative bg-black rounded-xl overflow-hidden">
        <canvas ref={canvasRef} width={1280} height={720} className="w-full aspect-video" />
        {!activeUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <ImagePlus size={32} className="text-gray-700 mx-auto mb-2" />
              <p className="text-gray-700 text-xs">No image assigned to this segment</p>
            </div>
          </div>
        )}
      </div>

      {/* Segment info */}
      {seg && (
        <div className="bg-[#0e0e0e] border border-white/5 rounded-xl px-4 py-2.5 flex items-start gap-3">
          <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md mt-0.5 shrink-0">{seg.speaker}</span>
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 flex-1">{seg.text}</p>
          <span className="text-[10px] text-gray-600 shrink-0 mt-0.5">{fmt(offsets[currentSegIdx])} · {(seg.duration ?? 0).toFixed(1)}s</span>
        </div>
      )}

      {/* Scrubber */}
      <div className="space-y-2">
        <div className="relative group cursor-pointer" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - rect.left) / rect.width) * totalDuration);
        }}>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] text-gray-600">
          <span>{fmt(playTime)}</span>
          <span>{fmt(totalDuration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={onPrev} className="p-2 rounded-xl hover:bg-white/8 text-gray-500 hover:text-white transition-all">
          <SkipBack size={16} />
        </button>
        <button onClick={onPlayPause} className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-500 flex items-center justify-center text-white transition-all shadow-lg shadow-purple-900/30">
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button onClick={onNext} className="p-2 rounded-xl hover:bg-white/8 text-gray-500 hover:text-white transition-all">
          <SkipForward size={16} />
        </button>
        <span className="text-[10px] text-gray-600 ml-2">Seg {currentSegIdx + 1}/{script.length}</span>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const Storyboard: React.FC<StoryboardProps> = ({ script, onBack }) => {
  // Settings
  const [sceneCount, setSceneCount] = useState(10);
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [showSettings, setShowSettings] = useState(true);

  // Scenes library
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [characterGuide, setCharacterGuide] = useState('');
  const [isGeneratingScenes, setIsGeneratingScenes] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingAllProgress, setGeneratingAllProgress] = useState(0);
  const abortRef = useRef(false);

  // Timeline: segment → imageUrl assignment
  const [segmentImages, setSegmentImages] = useState<Record<number, string>>({});

  // Picker modal
  const [pickerSegIdx, setPickerSegIdx] = useState<number | null>(null);

  // Preview playback
  const [playTime, setPlayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Video export
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoProgress, setVideoProgress] = useState<{ pct: number; msg: string } | null>(null);

  // Active tab: timeline | library
  const [activeTab, setActiveTab] = useState<'timeline' | 'library'>('timeline');

  const { offsets, total: totalDuration } = useMemo(() => buildOffsets(script), [script]);
  const hasAudio = script.some(s => s.audioUrl && (s.duration ?? 0) > 0);
  const doneImages = scenes.filter(sc => sc.imageUrl).length;
  const allImagesReady = scenes.length > 0 && scenes.every(sc => sc.imageUrl);

  // Current segment based on playTime
  const currentSegIdx = useMemo(() => {
    let idx = script.length - 1;
    for (let i = 0; i < offsets.length; i++) {
      const end = i < offsets.length - 1 ? offsets[i + 1] : totalDuration;
      if (playTime >= offsets[i] && playTime < end) { idx = i; break; }
    }
    return idx;
  }, [playTime, offsets, totalDuration, script.length]);

  // Playback ticker
  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setPlayTime(t => {
          if (t >= totalDuration) { setIsPlaying(false); return totalDuration; }
          return t + 0.1;
        });
      }, 100);
    } else {
      if (playRef.current) clearInterval(playRef.current);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, totalDuration]);

  // When playTime changes, scroll active segment into view
  const timelineRef = useRef<HTMLDivElement>(null);
  const segRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (isPlaying) {
      segRowRefs.current[currentSegIdx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentSegIdx, isPlaying]);

  // Update segmentImages whenever a scene image changes
  useEffect(() => {
    if (scenes.length === 0) return;
    setSegmentImages(prev => {
      const next = { ...prev };
      for (const sc of scenes) {
        if (!sc.imageUrl) continue;
        for (const idx of sc.segmentIndices) {
          if (!(idx in next)) next[idx] = sc.imageUrl;
        }
      }
      return next;
    });
  }, [scenes]);

  // Generate scenes
  const handleGenerateScenes = useCallback(async () => {
    if (script.length === 0) { toast.error('No script loaded.'); return; }
    setIsGeneratingScenes(true);
    setVideoBlob(null);
    setCharacterGuide('');
    setSegmentImages({});
    try {
      const result = await generateStoryboardScenes(
        script.map(s => ({ speaker: s.speaker, text: s.text, duration: s.duration })),
        sceneCount, model,
      );
      const built = buildScenesFromRaw(result.scenes, script);
      setScenes(built);
      setCharacterGuide(result.characterGuide || '');
      setShowSettings(false);
      toast.success(`${built.length} scenes created`);
    } catch (e: any) {
      toast.error(e.message || 'Scene generation failed');
    } finally {
      setIsGeneratingScenes(false);
    }
  }, [script, sceneCount, model]);

  // Generate single image
  const handleGenerateImage = useCallback(async (id: string) => {
    setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, isGenerating: true, error: undefined } : sc));
    const scene = scenes.find(sc => sc.id === id);
    if (!scene) return;
    try {
      const url = await generateStoryboardImage(scene.prompt, characterGuide);
      setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, imageUrl: url, isGenerating: false } : sc));
      // Auto-assign to segments that don't have an image yet
      setSegmentImages(prev => {
        const next = { ...prev };
        for (const idx of scene.segmentIndices) {
          if (!next[idx]) next[idx] = url;
        }
        return next;
      });
    } catch (e: any) {
      setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, isGenerating: false, error: e.message || 'Failed' } : sc));
      toast.error(`Scene ${scene.sceneNumber}: ${e.message}`);
    }
  }, [scenes, characterGuide]);

  // Generate all
  const handleGenerateAll = useCallback(async () => {
    abortRef.current = false;
    setGeneratingAll(true);
    setGeneratingAllProgress(0);
    const toGen = scenes.filter(sc => !sc.imageUrl);
    let done = 0;
    for (const sc of toGen) {
      if (abortRef.current) break;
      await handleGenerateImage(sc.id);
      done++;
      setGeneratingAllProgress(Math.round((done / toGen.length) * 100));
      await new Promise(r => setTimeout(r, 400));
    }
    setGeneratingAll(false);
    setGeneratingAllProgress(0);
    if (!abortRef.current) toast.success('All images generated!');
  }, [scenes, handleGenerateImage]);

  // Assign image to segment
  const assignImage = (segIdx: number, imageUrl: string) => {
    setSegmentImages(prev => {
      const next = { ...prev };
      if (imageUrl) next[segIdx] = imageUrl;
      else delete next[segIdx];
      return next;
    });
    setPickerSegIdx(null);
  };

  // Navigation
  const goPrev = () => { if (currentSegIdx > 0) setPlayTime(offsets[currentSegIdx - 1]); };
  const goNext = () => { if (currentSegIdx < script.length - 1) setPlayTime(offsets[currentSegIdx + 1]); };

  // Create video
  const handleCreateVideo = useCallback(async () => {
    if (!hasAudio) { toast.error('No audio. Generate audio in Voice step first.'); return; }
    const assignedCount = Object.keys(segmentImages).length;
    if (assignedCount === 0) { toast.error('No images assigned to any segment.'); return; }
    setVideoBlob(null);
    setVideoProgress({ pct: 0, msg: 'Starting…' });
    try {
      const blob = await createStoryboardVideo(segmentImages, script, (pct, msg) => setVideoProgress({ pct, msg }));
      setVideoBlob(blob);
      setVideoProgress(null);
      toast.success('Video created!');
    } catch (e: any) {
      setVideoProgress(null);
      toast.error(e.message || 'Video creation failed');
    }
  }, [segmentImages, script, hasAudio]);

  const handleDownload = () => {
    if (!videoBlob) return;
    const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = url; a.download = `storyboard.${ext}`; a.click();
    URL.revokeObjectURL(url);
  };

  const assignedCount = Object.values(segmentImages).filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-[#050505]">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-[#050505]/95 backdrop-blur-xl border-b border-white/5 px-5 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/8 text-gray-500 hover:text-white transition-all">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-purple-900/40 rounded-xl flex items-center justify-center">
            <Film size={16} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-white font-bold text-sm leading-none">Storyboard</h2>
            <p className="text-gray-600 text-[10px] mt-0.5 leading-none">Script → Scenes → Timeline → Video</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><Layers size={11} /> {script.length} segs</span>
          <span className="flex items-center gap-1"><Clock size={11} /> {fmt(totalDuration)}</span>
          {scenes.length > 0 && <span className="flex items-center gap-1"><ImageIcon size={11} /> {doneImages}/{scenes.length} imgs</span>}
          {!hasAudio && <span className="text-yellow-500/70 text-[10px] bg-yellow-500/8 border border-yellow-500/15 px-2 py-0.5 rounded-full">No audio</span>}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">

        {/* ── Settings (collapsible) ── */}
        <div className="border-b border-white/5">
          <button
            onClick={() => setShowSettings(v => !v)}
            className="w-full flex items-center gap-2 px-5 py-3 hover:bg-white/3 transition-all text-left"
          >
            <Settings2 size={14} className="text-purple-400" />
            <span className="text-xs font-semibold text-gray-400">Scene Settings</span>
            {scenes.length > 0 && <span className="ml-2 text-[10px] text-gray-600">{scenes.length} scenes · {doneImages} images</span>}
            {showSettings ? <ChevronUp size={14} className="ml-auto text-gray-600" /> : <ChevronDown size={14} className="ml-auto text-gray-600" />}
          </button>

          {showSettings && (
            <div className="px-5 pb-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Scene Count */}
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-2">
                    Scenes <span className="text-purple-400 font-bold ml-1">{sceneCount}</span>
                  </label>
                  <input type="range" min={1} max={200} value={sceneCount}
                    onChange={e => setSceneCount(Number(e.target.value))}
                    className="w-full accent-purple-500 cursor-pointer" />
                  <div className="flex justify-between text-[10px] text-gray-700 mt-1"><span>1</span><span>200</span></div>
                </div>
                {/* Model Toggle */}
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Model</label>
                  <div className="flex bg-[#0a0a0a] border border-white/5 rounded-xl p-1 gap-1">
                    {MODEL_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setModel(o.value)}
                        className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${model === o.value ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
                        {o.value.includes('flash') ? '⚡ ' : '✦ '}{o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={handleGenerateScenes} disabled={isGeneratingScenes || script.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/40 disabled:text-purple-700 text-white text-sm font-semibold transition-all shadow-lg shadow-purple-900/20">
                  {isGeneratingScenes ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                  {isGeneratingScenes ? 'Generating…' : scenes.length > 0 ? 'Regenerate Scenes' : 'Generate Scenes'}
                </button>
                {scenes.length > 0 && !generatingAll && (
                  <button onClick={handleGenerateAll} disabled={allImagesReady}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 text-sm font-semibold transition-all border border-blue-500/20 disabled:opacity-40">
                    <Zap size={14} /> Generate All Images
                  </button>
                )}
                {generatingAll && (
                  <button onClick={() => { abortRef.current = true; setGeneratingAll(false); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600/15 text-red-300 text-sm font-semibold border border-red-500/20">
                    Stop ({generatingAllProgress}%)
                  </button>
                )}
              </div>
              {generatingAll && (
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full transition-all" style={{ width: `${generatingAllProgress}%` }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Character Guide ── */}
        {characterGuide && (
          <div className="border-b border-white/5 px-5 py-3 flex items-start gap-3 bg-blue-500/4">
            <Mic2 size={13} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Character Guide · </span>
              <span className="text-[11px] text-gray-400 leading-relaxed">{characterGuide}</span>
            </div>
          </div>
        )}

        {/* ── Main: empty state or split layout ── */}
        {scenes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-purple-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Film size={28} className="text-purple-500/50" />
              </div>
              <h3 className="text-white font-semibold mb-2">No Scenes Yet</h3>
              <p className="text-gray-600 text-sm max-w-xs">Open Scene Settings above and click <strong className="text-gray-400">Generate Scenes</strong></p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">

            {/* ── LEFT: Timeline + Library (tabs) ── */}
            <div className="flex-1 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-white/5 lg:max-w-[55%]">

              {/* Tabs */}
              <div className="flex border-b border-white/5 shrink-0">
                {(['timeline', 'library'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-3 text-xs font-semibold transition-all ${activeTab === tab ? 'text-white border-b-2 border-purple-500' : 'text-gray-600 hover:text-gray-400'}`}>
                    {tab === 'timeline' ? `Timeline (${script.length} segments)` : `Image Library (${doneImages} images)`}
                  </button>
                ))}
              </div>

              {/* Timeline Tab */}
              {activeTab === 'timeline' && (
                <div ref={timelineRef} className="flex-1 overflow-y-auto custom-scrollbar">
                  {/* Progress bar */}
                  {assignedCount > 0 && (
                    <div className="px-4 py-2 border-b border-white/4 flex items-center gap-2 text-[10px] text-gray-600">
                      <span>{assignedCount}/{script.length} segments assigned</span>
                      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full" style={{ width: `${(assignedCount / script.length) * 100}%` }} />
                      </div>
                    </div>
                  )}
                  {script.map((seg, idx) => {
                    const imgUrl = segmentImages[idx];
                    const isActive = idx === currentSegIdx;
                    const dur = seg.duration ?? 0;
                    return (
                      <div
                        key={idx}
                        ref={el => { segRowRefs.current[idx] = el; }}
                        onClick={() => setPlayTime(offsets[idx])}
                        className={`flex items-stretch gap-0 border-b border-white/4 cursor-pointer transition-all ${isActive ? 'bg-purple-500/8 border-l-2 border-l-purple-500' : 'hover:bg-white/3 border-l-2 border-l-transparent'}`}
                      >
                        {/* Image thumbnail */}
                        <button
                          onClick={e => { e.stopPropagation(); setPickerSegIdx(idx); setPlayTime(offsets[idx]); }}
                          className="relative w-20 shrink-0 aspect-video bg-[#0a0a0a] flex items-center justify-center overflow-hidden group m-2 mr-0 rounded-lg border border-white/6 hover:border-purple-500/40 transition-all"
                        >
                          {imgUrl ? (
                            <>
                              <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <RefreshCw size={12} className="text-white" />
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-gray-700 group-hover:text-purple-500 transition-colors">
                              <ImagePlus size={14} />
                            </div>
                          )}
                        </button>

                        {/* Content */}
                        <div className="flex-1 px-3 py-2.5 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isActive ? 'bg-purple-500/30 text-purple-300' : 'bg-white/6 text-gray-500'}`}>#{idx + 1}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${seg.speaker === 'Narrator' ? 'text-yellow-400 bg-yellow-500/10' : 'text-blue-400 bg-blue-500/10'}`}>{seg.speaker}</span>
                            <span className="ml-auto text-[10px] text-gray-700">{fmt(offsets[idx])} · {dur.toFixed(1)}s</span>
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{seg.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Library Tab */}
              {activeTab === 'library' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                  {doneImages === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-3">
                      <ImagePlus size={28} className="text-gray-700" />
                      <p className="text-gray-600 text-sm">No images yet</p>
                      <button onClick={() => setShowSettings(true)} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">Open settings to generate →</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {scenes.map(sc => (
                        <div key={sc.id} className="bg-[#0a0a0a] border border-white/6 rounded-xl overflow-hidden flex flex-col">
                          <div className="relative aspect-video bg-[#080808] flex items-center justify-center">
                            {sc.imageUrl ? (
                              <img src={sc.imageUrl} alt="" className="w-full h-full object-cover" />
                            ) : sc.isGenerating ? (
                              <Loader2 size={20} className="animate-spin text-purple-500" />
                            ) : sc.error ? (
                              <AlertCircle size={18} className="text-red-400" />
                            ) : (
                              <ImagePlus size={18} className="text-gray-700" />
                            )}
                            <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">#{sc.sceneNumber}</span>
                          </div>
                          <div className="p-2 flex gap-1.5">
                            <button onClick={() => handleGenerateImage(sc.id)} disabled={sc.isGenerating}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-purple-600/15 hover:bg-purple-600/25 text-purple-300 text-[10px] font-semibold transition-all disabled:opacity-40 border border-purple-500/15">
                              {sc.isGenerating ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                              {sc.imageUrl ? 'Regen' : 'Generate'}
                            </button>
                            <button onClick={() => {
                              navigator.clipboard.writeText(sc.prompt);
                              toast.success('Prompt copied');
                            }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-500 transition-all">
                              <Copy size={10} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── RIGHT: Preview + Export ── */}
            <div className="lg:w-[45%] shrink-0 flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
              <div className="p-4 space-y-4">

                {/* Preview */}
                {totalDuration > 0 ? (
                  <PreviewCanvas
                    segmentImages={segmentImages}
                    script={script}
                    totalDuration={totalDuration}
                    offsets={offsets}
                    playTime={playTime}
                    isPlaying={isPlaying}
                    onPlayPause={() => { if (playTime >= totalDuration) setPlayTime(0); setIsPlaying(v => !v); }}
                    onSeek={setPlayTime}
                    onPrev={goPrev}
                    onNext={goNext}
                    currentSegIdx={currentSegIdx}
                  />
                ) : (
                  <div className="aspect-video bg-[#0a0a0a] rounded-xl flex items-center justify-center">
                    <p className="text-gray-700 text-xs">No audio — preview unavailable</p>
                  </div>
                )}

                {/* Export */}
                <div className="bg-[#0e0e0e] border border-white/6 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-400">Export Video</p>
                  <div className="text-[11px] text-gray-600 space-y-1">
                    <div className="flex justify-between"><span>Segments with image</span><span className={assignedCount === script.length ? 'text-green-400' : 'text-yellow-400'}>{assignedCount}/{script.length}</span></div>
                    <div className="flex justify-between"><span>Audio</span><span className={hasAudio ? 'text-green-400' : 'text-red-400'}>{hasAudio ? 'Ready' : 'Missing'}</span></div>
                  </div>

                  {videoProgress ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">{videoProgress.msg}</span>
                        <span className="text-gray-600">{videoProgress.pct}%</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full transition-all" style={{ width: `${videoProgress.pct}%` }} />
                      </div>
                    </div>
                  ) : videoBlob ? (
                    <div className="flex gap-2">
                      <button onClick={handleDownload}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600/20 hover:bg-green-600/30 text-green-300 text-sm font-semibold transition-all border border-green-500/20">
                        <Download size={14} /> Download ({(videoBlob.size / 1024 / 1024).toFixed(1)} MB)
                      </button>
                      <button onClick={() => setVideoBlob(null)} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-500 transition-all"><X size={14} /></button>
                    </div>
                  ) : (
                    <button onClick={handleCreateVideo} disabled={!hasAudio || assignedCount === 0}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-600 text-white text-sm font-semibold transition-all shadow-lg shadow-purple-900/20">
                      <Video size={14} /> Create Video
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Image Picker Modal ── */}
      {pickerSegIdx !== null && (
        <ImagePickerModal
          scenes={scenes}
          onPick={url => assignImage(pickerSegIdx, url)}
          onClose={() => setPickerSegIdx(null)}
          segmentText={script[pickerSegIdx]?.text ?? ''}
        />
      )}
    </div>
  );
};

export default Storyboard;
