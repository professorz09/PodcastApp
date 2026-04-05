import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Film, Wand2, ChevronDown, ChevronUp,
  Play, Pause, Download, Loader2, AlertCircle,
  ArrowLeft, Settings2, ImagePlus, Video, X,
  RefreshCw, SkipBack, SkipForward, ZoomIn, ZoomOut,
  Zap, Scissors
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

const fmtMs = (s: number) => `${fmt(s)}.${Math.floor((s % 1) * 10)}`;

function buildOffsets(segs: DebateSegment[]) {
  const offsets: number[] = [];
  let t = 0;
  for (const s of segs) { offsets.push(t); t += s.duration ?? 0; }
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
    return {
      id: `scene-${raw.sceneNumber}`,
      sceneNumber: raw.sceneNumber,
      prompt: raw.prompt,
      startTime: Math.max(0, start),
      endTime: Math.max(start + 0.1, end),
      segmentIndices: indices,
    };
  });
}

// ── Video creation ─────────────────────────────────────────────────────────────
async function createStoryboardVideo(
  scenes: StoryboardScene[],
  script: DebateSegment[],
  onProgress: (pct: number, msg: string) => void,
): Promise<Blob> {
  onProgress(0, 'Loading audio…');
  const audioSegs = script.filter(s => s.audioUrl && (s.duration ?? 0) > 0);
  if (audioSegs.length === 0) throw new Error('No audio — generate audio in Voice step first.');

  const AC = new AudioContext();
  const decoded: AudioBuffer[] = [];
  for (let i = 0; i < audioSegs.length; i++) {
    onProgress(5 + Math.round((i / audioSegs.length) * 25), `Decoding audio ${i + 1}/${audioSegs.length}…`);
    const ab = await AC.decodeAudioData(await (await fetch(audioSegs[i].audioUrl!)).arrayBuffer());
    decoded.push(ab);
  }

  onProgress(30, 'Merging audio…');
  const sr = decoded[0].sampleRate, ch = decoded[0].numberOfChannels;
  const merged = AC.createBuffer(ch, decoded.reduce((s, b) => s + b.length, 0), sr);
  let off = 0;
  for (const buf of decoded) {
    for (let c = 0; c < ch; c++) merged.getChannelData(c).set(buf.getChannelData(c), off);
    off += buf.length;
  }
  const totalDuration = merged.duration;

  onProgress(35, 'Loading images…');
  const imgMap = new Map<string, HTMLImageElement>();
  const withImg = scenes.filter(sc => sc.imageUrl);
  for (let i = 0; i < withImg.length; i++) {
    onProgress(35 + Math.round((i / withImg.length) * 15), `Loading image ${i + 1}/${withImg.length}…`);
    const img = new window.Image();
    await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); img.src = withImg[i].imageUrl!; });
    imgMap.set(withImg[i].id, img);
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
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(
    new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]),
    { mimeType, videoBitsPerSecond: 6_000_000 }
  );
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise<void>(r => { recorder.onstop = () => r(); });

  // Build subtitle map
  const { offsets } = buildOffsets(script);

  recorder.start(100); src.start(0);
  const startWall = performance.now();

  const draw = () => {
    const elapsed = (performance.now() - startWall) / 1000;
    if (elapsed >= totalDuration + 0.1) { recorder.stop(); return; }
    onProgress(50 + Math.round((elapsed / totalDuration) * 46), `Recording ${fmt(elapsed)} / ${fmt(totalDuration)}…`);

    // Active scene
    const active = scenes.slice().reverse().find(sc => elapsed >= sc.startTime) ?? scenes[0];
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (active?.imageUrl) {
      const img = imgMap.get(active.id);
      if (img?.complete && img.naturalWidth > 0) {
        const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      }
    }

    // Subtitle
    let subText = '';
    for (let i = offsets.length - 1; i >= 0; i--) {
      if (elapsed >= offsets[i]) { subText = script[i]?.text ?? ''; break; }
    }
    if (subText) {
      ctx.font = 'bold 28px sans-serif';
      const maxW = W - 80;
      const words = subText.split(' ');
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
        else line = test;
      }
      if (line) lines.push(line);
      const lineH = 38, pad = 16;
      const boxH = lines.length * lineH + pad * 2;
      const boxY = H - boxH - 30;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.beginPath();
      ctx.roundRect(40, boxY, W - 80, boxH, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, W / 2, boxY + pad + (i + 1) * lineH - 8));
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
  currentSceneId: string;
  onPick: (sceneId: string, imageUrl: string) => void;
  onClose: () => void;
  onGenerate: (id: string) => void;
  characterGuide: string;
}> = ({ scenes, currentSceneId, onPick, onClose, onGenerate, characterGuide }) => {
  const current = scenes.find(s => s.id === currentSceneId);
  const [editPrompt, setEditPrompt] = useState(current?.prompt ?? '');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-white font-bold text-sm">Scene {current?.sceneNumber} — Image</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/8 text-gray-500 transition-all"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* Current image */}
          <div className="aspect-video bg-[#0a0a0a] rounded-xl overflow-hidden border border-white/6 relative">
            {current?.imageUrl ? (
              <img src={current.imageUrl} alt="" className="w-full h-full object-cover" />
            ) : current?.isGenerating ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 size={28} className="animate-spin text-purple-500" />
                <span className="text-xs text-gray-500">Generating…</span>
              </div>
            ) : current?.error ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <AlertCircle size={20} className="text-red-400" />
                <span className="text-xs text-red-400">{current.error}</span>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-700">
                <ImagePlus size={28} />
                <span className="text-xs">No image yet</span>
              </div>
            )}
          </div>

          {/* Prompt editor */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Image Prompt</label>
            <textarea
              value={editPrompt}
              onChange={e => setEditPrompt(e.target.value)}
              rows={4}
              className="w-full bg-[#080808] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-gray-300 resize-none focus:border-purple-500/40 outline-none leading-relaxed custom-scrollbar"
            />
          </div>

          {/* Character guide preview */}
          {characterGuide && (
            <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-blue-400 mb-1">Character Guide (auto-included)</p>
              <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-3">{characterGuide}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (current) {
                  // update prompt then generate
                  onPick(current.id, current.imageUrl ?? '');
                  onGenerate(current.id);
                }
              }}
              disabled={current?.isGenerating}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-sm font-semibold transition-all border border-purple-500/20 disabled:opacity-40"
            >
              {current?.isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {current?.imageUrl ? 'Regenerate' : 'Generate Image'}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-sm font-semibold transition-all">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const Storyboard: React.FC<StoryboardProps> = ({ script, onBack }) => {
  const [sceneCount, setSceneCount] = useState(10);
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [showSettings, setShowSettings] = useState(true);
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [characterGuide, setCharacterGuide] = useState('');
  const [isGeneratingScenes, setIsGeneratingScenes] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingAllProgress, setGeneratingAllProgress] = useState(0);
  const abortRef = useRef(false);

  const [playTime, setPlayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [pickerSceneId, setPickerSceneId] = useState<string | null>(null);

  const [zoom, setZoom] = useState(80); // px per second
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoProgress, setVideoProgress] = useState<{ pct: number; msg: string } | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sceneId: string; startX: number; origEnd: number; origNextStart: number; nextId: string | null } | null>(null);

  const { offsets, total: totalDuration } = useMemo(() => buildOffsets(script), [script]);
  const hasAudio = script.some(s => s.audioUrl && (s.duration ?? 0) > 0);
  const doneImages = scenes.filter(sc => sc.imageUrl).length;
  const allImagesReady = scenes.length > 0 && scenes.every(sc => sc.imageUrl);

  // Active scene at playTime
  const activeScene = useMemo(() => {
    return scenes.slice().reverse().find(sc => playTime >= sc.startTime) ?? scenes[0] ?? null;
  }, [playTime, scenes]);

  // Active subtitle at playTime
  const activeSubtitle = useMemo(() => {
    for (let i = offsets.length - 1; i >= 0; i--) {
      if (playTime >= offsets[i]) return script[i]?.text ?? '';
    }
    return '';
  }, [playTime, offsets, script]);

  // Draw preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

    const drawSubtitle = () => {
      if (!activeSubtitle) return;
      ctx.font = 'bold 20px sans-serif';
      const maxW = W - 60;
      const words = activeSubtitle.split(' ');
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
        else line = test;
      }
      if (line) lines.push(line);
      const lineH = 28, pad = 12;
      const boxH = lines.length * lineH + pad * 2;
      const boxY = H - boxH - 20;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.beginPath();
      ctx.roundRect(30, boxY, W - 60, boxH, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, W / 2, boxY + pad + (i + 1) * lineH - 6));
    };

    if (activeScene?.imageUrl) {
      const url = activeScene.imageUrl;
      const draw = (img: HTMLImageElement) => {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        drawSubtitle();
      };
      if (imgCacheRef.current.has(url)) {
        draw(imgCacheRef.current.get(url)!);
      } else {
        const img = new window.Image();
        img.onload = () => { imgCacheRef.current.set(url, img); draw(img); };
        img.src = url;
      }
    } else {
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2a2a2a';
      ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(activeScene ? `Scene ${activeScene.sceneNumber} — no image yet` : 'No scenes', W / 2, H / 2);
      drawSubtitle();
    }
  }, [activeScene, activeSubtitle]);

  // Playback timer
  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setPlayTime(t => {
          if (t >= totalDuration) { setIsPlaying(false); return totalDuration; }
          return Math.min(t + 0.05, totalDuration);
        });
      }, 50);
    } else {
      if (playRef.current) clearInterval(playRef.current);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, totalDuration]);

  // Scroll playhead into view on play
  useEffect(() => {
    if (isPlaying && timelineScrollRef.current) {
      const scrollEl = timelineScrollRef.current;
      const playX = playTime * zoom;
      const { scrollLeft, clientWidth } = scrollEl;
      if (playX < scrollLeft || playX > scrollLeft + clientWidth - 100) {
        scrollEl.scrollLeft = playX - clientWidth / 3;
      }
    }
  }, [playTime, zoom, isPlaying]);

  // ── Generate scenes ──
  const handleGenerateScenes = useCallback(async () => {
    if (script.length === 0) { toast.error('No script loaded.'); return; }
    setIsGeneratingScenes(true);
    setVideoBlob(null);
    setCharacterGuide('');
    try {
      const result = await generateStoryboardScenes(
        script.map(s => ({ speaker: s.speaker, text: s.text, duration: s.duration })),
        sceneCount, model,
      );
      const built = buildScenesFromRaw(result.scenes, script);
      setScenes(built);
      setCharacterGuide(result.characterGuide || '');
      setShowSettings(false);
      setPlayTime(0);
      toast.success(`${built.length} scenes created`);
    } catch (e: any) {
      toast.error(e.message || 'Scene generation failed');
    } finally {
      setIsGeneratingScenes(false);
    }
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
    abortRef.current = false;
    setGeneratingAll(true);
    setGeneratingAllProgress(0);
    const toGen = scenes.filter(sc => !sc.imageUrl);
    for (let i = 0; i < toGen.length; i++) {
      if (abortRef.current) break;
      await handleGenerateImage(toGen[i].id);
      setGeneratingAllProgress(Math.round(((i + 1) / toGen.length) * 100));
      await new Promise(r => setTimeout(r, 400));
    }
    setGeneratingAll(false);
    setGeneratingAllProgress(0);
    if (!abortRef.current) toast.success('All images generated!');
  }, [scenes, handleGenerateImage]);

  // ── Timeline drag-resize (right edge) ──
  const onDragStart = (e: React.MouseEvent, sceneId: string) => {
    e.stopPropagation();
    const idx = scenes.findIndex(s => s.id === sceneId);
    const scene = scenes[idx];
    const next = scenes[idx + 1] ?? null;
    dragRef.current = {
      sceneId,
      startX: e.clientX,
      origEnd: scene.endTime,
      origNextStart: next?.startTime ?? scene.endTime,
      nextId: next?.id ?? null,
    };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  };

  const onDragMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const delta = (e.clientX - d.startX) / zoom;
    setScenes(prev => {
      const minDur = 0.2;
      return prev.map(sc => {
        if (sc.id === d.sceneId) {
          const newEnd = Math.max(sc.startTime + minDur, Math.min(d.origEnd + delta, totalDuration));
          return { ...sc, endTime: newEnd };
        }
        if (sc.id === d.nextId) {
          const newStart = Math.max(prev.find(x => x.id === d.sceneId)!.startTime + minDur, Math.min(d.origNextStart + delta, totalDuration - minDur));
          return { ...sc, startTime: newStart };
        }
        return sc;
      });
    });
  }, [zoom, totalDuration]);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  }, [onDragMove]);

  // ── Auto-reset scene times from audio ──
  const handleAutoSet = () => {
    if (scenes.length === 0) { toast.error('Generate scenes first.'); return; }
    const rebuilt = buildScenesFromRaw(
      scenes.map(sc => ({ sceneNumber: sc.sceneNumber, prompt: sc.prompt, segmentIndices: sc.segmentIndices })),
      script,
    );
    setScenes(prev => rebuilt.map((rb, i) => ({ ...rb, imageUrl: prev[i]?.imageUrl, isGenerating: prev[i]?.isGenerating, error: prev[i]?.error })));
    toast.success('Durations reset from audio.');
  };

  // ── Create video ──
  const handleCreateVideo = useCallback(async () => {
    if (!hasAudio) { toast.error('No audio. Generate audio in Voice step first.'); return; }
    setVideoBlob(null);
    setVideoProgress({ pct: 0, msg: 'Starting…' });
    try {
      const blob = await createStoryboardVideo(scenes, script, (pct, msg) => setVideoProgress({ pct, msg }));
      setVideoBlob(blob);
      setVideoProgress(null);
      toast.success('Video ready!');
    } catch (e: any) {
      setVideoProgress(null);
      toast.error(e.message || 'Video creation failed');
    }
  }, [scenes, script, hasAudio]);

  const handleDownload = () => {
    if (!videoBlob) return;
    const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a'); a.href = url; a.download = `storyboard.${ext}`; a.click();
    URL.revokeObjectURL(url);
  };

  // Timeline playhead x position
  const playheadX = playTime * zoom;
  const totalW = Math.max(totalDuration * zoom, 200);

  // Ruler ticks
  const tickInterval = zoom >= 60 ? 5 : zoom >= 30 ? 10 : 30; // seconds between ticks
  const ticks: number[] = [];
  for (let t = 0; t <= totalDuration + tickInterval; t += tickInterval) ticks.push(t);

  return (
    <div className="flex flex-col h-full bg-[#050505] select-none">
      {/* ── Header ── */}
      <div className="shrink-0 bg-[#050505]/95 backdrop-blur-xl border-b border-white/5 px-5 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/8 text-gray-500 hover:text-white transition-all">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-purple-900/40 rounded-xl flex items-center justify-center">
            <Film size={16} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-white font-bold text-sm leading-none">Storyboard</h2>
            <p className="text-gray-600 text-[10px] mt-0.5">Script → Images → Timeline → Video</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-gray-500">
          {scenes.length > 0 && <span>{doneImages}/{scenes.length} images</span>}
          {!hasAudio && <span className="text-yellow-500/70 text-[10px] bg-yellow-500/8 border border-yellow-500/15 px-2 py-0.5 rounded-full">No audio</span>}
        </div>
      </div>

      {/* ── Settings (collapsible) ── */}
      <div className="shrink-0 border-b border-white/5">
        <button onClick={() => setShowSettings(v => !v)}
          className="w-full flex items-center gap-2 px-5 py-3 hover:bg-white/3 transition-all text-left">
          <Settings2 size={13} className="text-purple-400" />
          <span className="text-xs font-semibold text-gray-400">Scene Settings</span>
          {scenes.length > 0 && !showSettings && <span className="ml-2 text-[10px] text-gray-700">{scenes.length} scenes · {doneImages} images</span>}
          {showSettings ? <ChevronUp size={13} className="ml-auto text-gray-600" /> : <ChevronDown size={13} className="ml-auto text-gray-600" />}
        </button>
        {showSettings && (
          <div className="px-5 pb-4 space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-2">Scenes <span className="text-purple-400 font-bold ml-1">{sceneCount}</span></label>
                <input type="range" min={1} max={200} value={sceneCount} onChange={e => setSceneCount(Number(e.target.value))} className="w-full accent-purple-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">Model</label>
                <div className="flex bg-[#0a0a0a] border border-white/5 rounded-xl p-1 gap-1">
                  {MODEL_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setModel(o.value)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${model === o.value ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                      {o.value.includes('flash') ? '⚡' : '✦'} {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleGenerateScenes} disabled={isGeneratingScenes || !script.length}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/40 disabled:text-purple-700 text-white text-sm font-semibold transition-all">
                {isGeneratingScenes ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                {isGeneratingScenes ? 'Generating…' : scenes.length > 0 ? 'Regenerate Scenes' : 'Generate Scenes'}
              </button>
              {scenes.length > 0 && !generatingAll && (
                <button onClick={handleGenerateAll} disabled={allImagesReady}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 text-sm font-semibold border border-blue-500/20 disabled:opacity-40 transition-all">
                  <Zap size={14} /> Generate All Images
                </button>
              )}
              {generatingAll && (
                <button onClick={() => { abortRef.current = true; setGeneratingAll(false); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600/15 text-red-300 text-sm font-semibold border border-red-500/20">
                  Stop ({generatingAllProgress}%)
                </button>
              )}
              {scenes.length > 0 && hasAudio && (
                <button onClick={handleAutoSet}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-sm font-semibold transition-all">
                  <Scissors size={14} /> Auto-set Durations
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

      {/* ── Main area ── */}
      {scenes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-purple-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Film size={28} className="text-purple-500/40" />
            </div>
            <h3 className="text-white font-semibold mb-2">No Scenes Yet</h3>
            <p className="text-gray-600 text-sm">Open settings above → Generate Scenes</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">

          {/* ── Preview + Export (top 60%) ── */}
          <div className="flex-1 min-h-0 flex gap-0">

            {/* Preview canvas area */}
            <div className="flex-1 min-w-0 flex flex-col items-center justify-center p-4 gap-3">
              <div className="relative bg-black rounded-xl overflow-hidden w-full max-w-2xl shadow-2xl">
                <canvas ref={previewCanvasRef} width={960} height={540} className="w-full aspect-video" />
              </div>

              {/* Character guide */}
              {characterGuide && (
                <div className="w-full max-w-2xl bg-blue-500/5 border border-blue-500/12 rounded-xl px-3 py-2 flex items-start gap-2">
                  <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mt-0.5 shrink-0">Guide</span>
                  <p className="text-[10px] text-gray-500 leading-relaxed">{characterGuide}</p>
                </div>
              )}

              {/* Playback controls */}
              <div className="flex items-center gap-3 w-full max-w-2xl">
                <button onClick={() => setPlayTime(0)} className="p-2 rounded-xl hover:bg-white/8 text-gray-600 hover:text-white transition-all"><SkipBack size={15} /></button>
                <button onClick={() => {
                  if (playTime >= totalDuration) setPlayTime(0);
                  setIsPlaying(v => !v);
                }} className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-500 flex items-center justify-center text-white transition-all shadow-lg shadow-purple-900/30">
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button onClick={() => setPlayTime(totalDuration)} className="p-2 rounded-xl hover:bg-white/8 text-gray-600 hover:text-white transition-all"><SkipForward size={15} /></button>
                <span className="text-xs text-gray-500 font-mono">{fmtMs(playTime)}</span>
                <span className="text-gray-700 text-xs">/</span>
                <span className="text-xs text-gray-600 font-mono">{fmt(totalDuration)}</span>
                {activeScene && (
                  <span className="ml-auto text-[10px] text-gray-600 bg-white/5 px-2 py-1 rounded-lg">
                    Scene {activeScene.sceneNumber} · {(activeScene.endTime - activeScene.startTime).toFixed(1)}s
                  </span>
                )}
              </div>
            </div>

            {/* Export sidebar */}
            <div className="w-56 shrink-0 border-l border-white/5 p-4 flex flex-col gap-4">
              <p className="text-xs font-semibold text-gray-500">Export</p>

              <div className="space-y-2 text-[11px] text-gray-600">
                <div className="flex justify-between"><span>Scenes</span><span>{scenes.length}</span></div>
                <div className="flex justify-between"><span>Images ready</span><span className={doneImages === scenes.length ? 'text-green-400' : 'text-yellow-400'}>{doneImages}/{scenes.length}</span></div>
                <div className="flex justify-between"><span>Audio</span><span className={hasAudio ? 'text-green-400' : 'text-red-400'}>{hasAudio ? 'Ready' : 'Missing'}</span></div>
                <div className="flex justify-between"><span>Duration</span><span>{fmt(totalDuration)}</span></div>
              </div>

              {videoProgress ? (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400">{videoProgress.msg}</p>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full transition-all" style={{ width: `${videoProgress.pct}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-600">{videoProgress.pct}%</p>
                </div>
              ) : videoBlob ? (
                <div className="space-y-2">
                  <button onClick={handleDownload}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600/20 hover:bg-green-600/30 text-green-300 text-xs font-semibold transition-all border border-green-500/20">
                    <Download size={13} /> Download<br />{(videoBlob.size / 1024 / 1024).toFixed(1)} MB
                  </button>
                  <button onClick={() => setVideoBlob(null)} className="w-full py-1.5 rounded-xl text-xs text-gray-600 hover:text-gray-400 transition-colors">Clear</button>
                </div>
              ) : (
                <button onClick={handleCreateVideo} disabled={!hasAudio}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-600 text-white text-xs font-semibold transition-all shadow-lg shadow-purple-900/20">
                  <Video size={13} /> Create Video
                </button>
              )}

              {/* Zoom control */}
              <div className="mt-auto space-y-2">
                <p className="text-[10px] text-gray-600">Timeline Zoom</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setZoom(z => Math.max(10, z - 20))} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-500 transition-all"><ZoomOut size={12} /></button>
                  <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-600/50 rounded-full transition-all" style={{ width: `${((zoom - 10) / 190) * 100}%` }} />
                  </div>
                  <button onClick={() => setZoom(z => Math.min(200, z + 20))} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-500 transition-all"><ZoomIn size={12} /></button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Timeline (bottom 40%) ── */}
          <div className="shrink-0 h-52 border-t border-white/8 flex flex-col bg-[#030303]">
            {/* Timeline header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 shrink-0">
              <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Timeline</span>
              <span className="text-[10px] text-gray-700">Click image to change · Drag right edge to resize · Auto-set resets from audio</span>
            </div>

            {/* Scrollable timeline */}
            <div ref={timelineScrollRef} className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative">
              <div style={{ width: totalW + 120, position: 'relative', height: '100%' }}>

                {/* Ruler */}
                <div className="absolute top-0 left-0 right-0 h-7 bg-[#0a0a0a] border-b border-white/5 pointer-events-none">
                  {ticks.map(t => (
                    <div key={t} style={{ position: 'absolute', left: t * zoom }} className="flex flex-col items-center">
                      <div className="w-px h-3 bg-white/10 mt-1" />
                      <span className="text-[9px] text-gray-700 mt-0.5 ml-1">{fmt(t)}</span>
                    </div>
                  ))}
                </div>

                {/* Scene clips track */}
                <div className="absolute top-7 left-0 right-0 bottom-0 flex items-stretch px-0 py-2">
                  {scenes.map((scene, idx) => {
                    const clipW = Math.max(8, (scene.endTime - scene.startTime) * zoom);
                    const clipX = scene.startTime * zoom;
                    const isSelected = selectedSceneId === scene.id;
                    const isActive = activeScene?.id === scene.id;

                    return (
                      <div
                        key={scene.id}
                        style={{ position: 'absolute', left: clipX, width: clipW, top: 0, bottom: 0 }}
                        className={`rounded-lg overflow-hidden border transition-all cursor-pointer group flex flex-col
                          ${isActive ? 'border-purple-500 ring-1 ring-purple-500/30' : isSelected ? 'border-blue-500/60' : 'border-white/8 hover:border-white/20'}`}
                        onClick={() => { setSelectedSceneId(scene.id); setPlayTime(scene.startTime); setIsPlaying(false); }}
                      >
                        {/* Image fill */}
                        <div className="flex-1 relative overflow-hidden bg-[#111]">
                          {scene.imageUrl ? (
                            <img src={scene.imageUrl} alt="" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                          ) : scene.isGenerating ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-purple-900/20">
                              <Loader2 size={14} className="animate-spin text-purple-400" />
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <button
                                onClick={e => { e.stopPropagation(); setPickerSceneId(scene.id); setSelectedSceneId(scene.id); }}
                                className="p-1.5 rounded-lg bg-white/10 hover:bg-purple-500/30 text-gray-500 hover:text-purple-300 transition-all"
                              >
                                <ImagePlus size={12} />
                              </button>
                            </div>
                          )}

                          {/* Click to change image */}
                          {scene.imageUrl && (
                            <button
                              onClick={e => { e.stopPropagation(); setPickerSceneId(scene.id); setSelectedSceneId(scene.id); }}
                              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <RefreshCw size={12} className="text-white" />
                            </button>
                          )}

                          {/* Scene badge */}
                          <div className={`absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${isActive ? 'bg-purple-500 text-white' : 'bg-black/70 text-gray-300'}`}>
                            #{scene.sceneNumber}
                          </div>

                          {/* Duration badge */}
                          {clipW > 50 && (
                            <div className="absolute bottom-1 left-1 text-[8px] text-gray-400 bg-black/60 px-1 py-0.5 rounded">
                              {(scene.endTime - scene.startTime).toFixed(1)}s
                            </div>
                          )}
                        </div>

                        {/* Right drag handle */}
                        <div
                          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 10 }}
                          className="bg-transparent hover:bg-purple-500/40 transition-colors flex items-center justify-center"
                          onMouseDown={e => { e.stopPropagation(); onDragStart(e, scene.id); }}
                        >
                          {clipW > 20 && <div className="w-0.5 h-4 bg-white/20 rounded-full" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Playhead */}
                <div
                  style={{ position: 'absolute', left: playheadX, top: 0, bottom: 0, width: 2, zIndex: 20, pointerEvents: 'none' }}
                  className="bg-red-500"
                >
                  <div className="w-3 h-3 bg-red-500 rounded-full -ml-[5px] -mt-0" />
                </div>

                {/* Clickable timeline for seeking */}
                <div
                  style={{ position: 'absolute', left: 0, top: 0, width: totalW, height: 28 }}
                  className="cursor-pointer"
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    setPlayTime(Math.max(0, Math.min(x / zoom, totalDuration)));
                    setIsPlaying(false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Image Picker Modal ── */}
      {pickerSceneId && (
        <ImagePickerModal
          scenes={scenes}
          currentSceneId={pickerSceneId}
          onPick={(id, _url) => { setPickerSceneId(null); }}
          onClose={() => setPickerSceneId(null)}
          onGenerate={handleGenerateImage}
          characterGuide={characterGuide}
        />
      )}
    </div>
  );
};

export default Storyboard;
