import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Film, Wand2, ChevronDown, ChevronUp,
  Play, Pause, Download, Loader2, AlertCircle,
  ArrowLeft, Settings2, ImagePlus, Video, X,
  RefreshCw, SkipBack, SkipForward, Zap, Scissors,
  ZoomIn, ZoomOut
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

// ── Video creation ──────────────────────────────────────────────────────────────
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
    decoded.push(await AC.decodeAudioData(await (await fetch(audioSegs[i].audioUrl!)).arrayBuffer()));
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
  const { offsets } = buildOffsets(script);

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
  const recorder = new MediaRecorder(new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]), { mimeType, videoBitsPerSecond: 6_000_000 });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise<void>(r => { recorder.onstop = () => r(); });
  recorder.start(100); src.start(0);
  const startWall = performance.now();
  const draw = () => {
    const elapsed = (performance.now() - startWall) / 1000;
    if (elapsed >= totalDuration + 0.1) { recorder.stop(); return; }
    onProgress(50 + Math.round((elapsed / totalDuration) * 46), `Recording ${fmt(elapsed)} / ${fmt(totalDuration)}…`);
    const active = scenes.slice().reverse().find(sc => elapsed >= sc.startTime) ?? scenes[0];
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (active?.imageUrl) {
      const img = imgMap.get(active.id);
      if (img?.complete && img.naturalWidth > 0) {
        const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        ctx.drawImage(img, (W - img.naturalWidth * scale) / 2, (H - img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale);
      }
    }
    // Subtitle
    let sub = '';
    for (let i = offsets.length - 1; i >= 0; i--) { if (elapsed >= offsets[i]) { sub = script[i]?.text ?? ''; break; } }
    if (sub) {
      ctx.font = 'bold 26px sans-serif';
      const maxW = W - 80, words = sub.split(' ');
      const lines: string[] = []; let line = '';
      for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
      if (line) lines.push(line);
      const lh = 36, pad = 14, boxH = lines.length * lh + pad * 2, boxY = H - boxH - 28;
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.beginPath(); ctx.roundRect(40, boxY, W - 80, boxH, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, W / 2, boxY + pad + (i + 1) * lh - 8));
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  await done;
  onProgress(98, 'Finalizing…');
  return new Blob(chunks, { type: mimeType });
}

// ── Prompt Editor Modal ─────────────────────────────────────────────────────────
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
      <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl w-full max-w-md flex flex-col shadow-2xl max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-white font-bold text-sm">Scene {scene.sceneNumber}</h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/8 text-gray-500"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div className="aspect-video bg-[#0a0a0a] rounded-xl overflow-hidden border border-white/6 relative">
            {scene.imageUrl ? (
              <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
            ) : scene.isGenerating ? (
              <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-purple-500" /></div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-700"><ImagePlus size={24} /></div>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Image Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
              className="w-full bg-[#080808] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-gray-300 resize-none focus:border-purple-500/40 outline-none leading-relaxed custom-scrollbar" />
          </div>
          {characterGuide && (
            <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl px-3 py-2">
              <p className="text-[10px] font-bold text-blue-400 mb-1">Character Guide</p>
              <p className="text-[10px] text-gray-500 leading-relaxed">{characterGuide}</p>
            </div>
          )}
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <button onClick={() => { onSave(scene.id, prompt); onGenerate(scene.id); onClose(); }}
            disabled={scene.isGenerating}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-semibold transition-all">
            {scene.isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {scene.imageUrl ? 'Regenerate' : 'Generate'}
          </button>
          <button onClick={() => { onSave(scene.id, prompt); onClose(); }}
            className="px-4 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-gray-400 text-sm font-semibold transition-all">
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const Storyboard: React.FC<StoryboardProps> = ({ script, onBack }) => {
  const [sceneCount, setSceneCount] = useState(10);
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [showSettings, setShowSettings] = useState(true);
  const [showExport, setShowExport] = useState(true);

  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [characterGuide, setCharacterGuide] = useState('');
  const [isGeneratingScenes, setIsGeneratingScenes] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingAllProgress, setGeneratingAllProgress] = useState(0);
  const abortRef = useRef(false);

  const [playTime, setPlayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [promptModalId, setPromptModalId] = useState<string | null>(null);

  // Timeline zoom (px/sec)
  const [zoom, setZoom] = useState(60);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sceneId: string; startX: number; origEnd: number; origNextStart: number; nextId: string | null } | null>(null);

  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoProgress, setVideoProgress] = useState<{ pct: number; msg: string } | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const { offsets, total: totalDuration } = useMemo(() => buildOffsets(script), [script]);
  const hasAudio = script.some(s => s.audioUrl && (s.duration ?? 0) > 0);
  const doneImages = scenes.filter(sc => sc.imageUrl).length;
  const allImagesReady = scenes.length > 0 && scenes.every(sc => sc.imageUrl);

  const activeScene = useMemo(
    () => scenes.slice().reverse().find(sc => playTime >= sc.startTime) ?? scenes[0] ?? null,
    [playTime, scenes]
  );

  const activeSubtitle = useMemo(() => {
    for (let i = offsets.length - 1; i >= 0; i--) {
      if (playTime >= offsets[i]) return script[i]?.text ?? '';
    }
    return '';
  }, [playTime, offsets, script]);

  // ── Draw preview ──
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

    const drawSub = () => {
      if (!activeSubtitle) return;
      ctx.font = 'bold 19px sans-serif';
      const maxW = W - 60, words = activeSubtitle.split(' ');
      const lines: string[] = []; let line = '';
      for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
      if (line) lines.push(line);
      const lh = 27, pad = 10, boxH = lines.length * lh + pad * 2, boxY = H - boxH - 16;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.beginPath(); ctx.roundRect(30, boxY, W - 60, boxH, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, W / 2, boxY + pad + (i + 1) * lh - 7));
    };

    if (activeScene?.imageUrl) {
      const url = activeScene.imageUrl;
      const draw = (img: HTMLImageElement) => {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        ctx.drawImage(img, (W - img.naturalWidth * scale) / 2, (H - img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale);
        drawSub();
      };
      if (imgCacheRef.current.has(url)) draw(imgCacheRef.current.get(url)!);
      else { const img = new window.Image(); img.onload = () => { imgCacheRef.current.set(url, img); draw(img); }; img.src = url; }
    } else {
      ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#222';
      ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(scenes.length === 0 ? 'Generate scenes to preview' : `Scene ${activeScene?.sceneNumber ?? 1} — no image`, W / 2, H / 2);
      drawSub();
    }
  }, [activeScene, activeSubtitle, scenes.length]);

  // ── Playback timer ──
  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setPlayTime(t => { if (t >= totalDuration) { setIsPlaying(false); return totalDuration; } return Math.min(t + 0.05, totalDuration); });
      }, 50);
    } else { if (playRef.current) clearInterval(playRef.current); }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, totalDuration]);

  // ── Auto-scroll timeline playhead ──
  useEffect(() => {
    if (isPlaying && timelineScrollRef.current) {
      const el = timelineScrollRef.current;
      const px = playTime * zoom;
      if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth - 80) {
        el.scrollLeft = px - el.clientWidth / 3;
      }
    }
  }, [playTime, zoom, isPlaying]);

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

  // ── Timeline drag resize ──
  const onDragStart = (e: React.MouseEvent, sceneId: string) => {
    e.stopPropagation();
    const idx = scenes.findIndex(s => s.id === sceneId);
    const scene = scenes[idx], next = scenes[idx + 1] ?? null;
    dragRef.current = { sceneId, startX: e.clientX, origEnd: scene.endTime, origNextStart: next?.startTime ?? scene.endTime, nextId: next?.id ?? null };
    window.addEventListener('mousemove', onDragMove as any);
    window.addEventListener('mouseup', onDragEnd as any);
  };

  const onDragMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current; if (!d) return;
    const delta = (e.clientX - d.startX) / zoom;
    setScenes(prev => prev.map(sc => {
      if (sc.id === d.sceneId) return { ...sc, endTime: Math.max(sc.startTime + 0.2, Math.min(d.origEnd + delta, totalDuration)) };
      if (sc.id === d.nextId) return { ...sc, startTime: Math.max(prev.find(x => x.id === d.sceneId)!.startTime + 0.2, Math.min(d.origNextStart + delta, totalDuration - 0.2)) };
      return sc;
    }));
  }, [zoom, totalDuration]);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onDragMove as any);
    window.removeEventListener('mouseup', onDragEnd as any);
  }, [onDragMove]);

  // ── Auto-set durations ──
  const handleAutoSet = () => {
    if (!scenes.length) return;
    const rebuilt = buildScenesFromRaw(scenes.map(sc => ({ sceneNumber: sc.sceneNumber, prompt: sc.prompt, segmentIndices: sc.segmentIndices })), script);
    setScenes(prev => rebuilt.map((rb, i) => ({ ...rb, imageUrl: prev[i]?.imageUrl, isGenerating: prev[i]?.isGenerating, error: prev[i]?.error })));
    toast.success('Durations reset from audio.');
  };

  // ── Create video ──
  const handleCreateVideo = useCallback(async () => {
    if (!hasAudio) { toast.error('No audio. Generate audio in Voice step first.'); return; }
    setVideoBlob(null); setVideoProgress({ pct: 0, msg: 'Starting…' });
    try {
      const blob = await createStoryboardVideo(scenes, script, (pct, msg) => setVideoProgress({ pct, msg }));
      setVideoBlob(blob); setVideoProgress(null); toast.success('Video ready!');
    } catch (e: any) { setVideoProgress(null); toast.error(e.message || 'Video creation failed'); }
  }, [scenes, script, hasAudio]);

  const handleDownload = () => {
    if (!videoBlob) return;
    const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a'); a.href = url; a.download = `storyboard.${ext}`; a.click();
    URL.revokeObjectURL(url);
  };

  const totalW = Math.max(totalDuration * zoom, 300);
  const playheadX = playTime * zoom;
  const tickStep = zoom >= 60 ? 5 : zoom >= 30 ? 10 : 30;
  const ticks: number[] = [];
  for (let t = 0; t <= totalDuration + tickStep; t += tickStep) ticks.push(t);

  const promptScene = scenes.find(sc => sc.id === promptModalId);

  return (
    <div className="w-full h-full bg-black text-white flex flex-col overflow-hidden select-none">
      {/* ── Header ── */}
      <header className="shrink-0 sticky top-0 z-30 bg-[#050505]/95 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h2 className="text-base font-bold text-white tracking-tight">Storyboard</h2>
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          {scenes.length > 0 && <span>{doneImages}/{scenes.length}</span>}
          {!hasAudio && <span className="text-yellow-500/80 text-[10px] bg-yellow-500/8 border border-yellow-500/15 px-2 py-0.5 rounded-full">No audio</span>}
        </div>
      </header>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-8">
        <div className="flex flex-col p-3 gap-3 max-w-2xl mx-auto w-full">

          {/* ── Canvas Preview ── */}
          <div className="w-full aspect-video bg-[#050505] rounded-2xl overflow-hidden shadow-2xl border border-white/5 relative">
            <canvas ref={previewCanvasRef} width={960} height={540} className="w-full h-full object-contain" />
          </div>

          {/* ── Playback Controls ── */}
          <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-3 flex items-center gap-3">
            <button onClick={() => setPlayTime(0)} className="p-2 rounded-full hover:bg-white/10 text-gray-500 hover:text-white transition-all">
              <SkipBack size={16} />
            </button>
            <button
              onClick={() => { if (playTime >= totalDuration) setPlayTime(0); setIsPlaying(v => !v); }}
              className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
            >
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={() => setPlayTime(totalDuration)} className="p-2 rounded-full hover:bg-white/10 text-gray-500 hover:text-white transition-all">
              <SkipForward size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <div
                className="h-1.5 bg-gray-800 rounded-full overflow-hidden cursor-pointer"
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setPlayTime(Math.max(0, Math.min(((e.clientX - r.left) / r.width) * totalDuration, totalDuration)));
                }}
              >
                <div className="h-full bg-red-500 transition-all" style={{ width: totalDuration > 0 ? `${(playTime / totalDuration) * 100}%` : '0%' }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>{fmt(playTime)}</span>
                <span>{activeScene ? `Scene ${activeScene.sceneNumber}` : ''}</span>
                <span>{fmt(totalDuration)}</span>
              </div>
            </div>
          </div>

          {/* ── Horizontal Timeline Strip (scene thumbnails) ── */}
          {scenes.length > 0 && (
            <div className="overflow-x-auto scrollbar-hide rounded-xl">
              <div className="flex gap-1.5 min-w-max p-1">
                {scenes.map(scene => {
                  const isActive = activeScene?.id === scene.id;
                  const dur = (scene.endTime - scene.startTime).toFixed(1);
                  return (
                    <button key={scene.id}
                      onClick={() => { setPlayTime(scene.startTime); setIsPlaying(false); }}
                      className={`relative flex flex-col items-center gap-0.5 p-1 rounded-xl border transition-all min-w-[60px] ${isActive ? 'bg-white/10 border-white/20' : 'bg-white/3 border-transparent hover:bg-white/8'}`}
                    >
                      <div className="w-full h-9 rounded-lg overflow-hidden bg-[#111] relative">
                        {scene.imageUrl ? (
                          <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : scene.isGenerating ? (
                          <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={11} className="animate-spin text-purple-400" /></div>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-gray-700"><ImagePlus size={12} /></div>
                        )}
                      </div>
                      <span className="text-[8px] text-gray-500 font-mono">{dur}s</span>
                      {isActive && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── NLE Timeline ── */}
          {scenes.length > 0 && totalDuration > 0 && (
            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden">
              {/* Timeline toolbar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
                <Film size={13} className="text-purple-400" />
                <span className="text-xs font-semibold text-gray-400">Timeline</span>
                <span className="text-[10px] text-gray-700 ml-1">Click to seek · Drag right edge to resize</span>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => setZoom(z => Math.max(10, z - 20))} className="p-1 rounded-lg hover:bg-white/8 text-gray-600"><ZoomOut size={13} /></button>
                  <span className="text-[10px] text-gray-700 w-8 text-center">{zoom}px</span>
                  <button onClick={() => setZoom(z => Math.min(200, z + 20))} className="p-1 rounded-lg hover:bg-white/8 text-gray-600"><ZoomIn size={13} /></button>
                </div>
              </div>

              {/* Scrollable NLE area */}
              <div ref={timelineScrollRef} className="overflow-x-auto overflow-y-hidden" style={{ height: 110 }}>
                <div style={{ width: totalW + 80, position: 'relative', height: '100%' }}>
                  {/* Ruler */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24 }} className="bg-[#050505] border-b border-white/5">
                    {ticks.map(t => (
                      <div key={t} style={{ position: 'absolute', left: t * zoom }}>
                        <div className="w-px h-3 bg-white/10 mt-1" />
                        <span className="absolute text-[8px] text-gray-700 ml-1" style={{ top: 4 }}>{fmt(t)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Clips */}
                  <div style={{ position: 'absolute', top: 24, left: 0, right: 0, bottom: 0 }}>
                    {scenes.map(scene => {
                      const clipW = Math.max(6, (scene.endTime - scene.startTime) * zoom);
                      const clipX = scene.startTime * zoom;
                      const isActive = activeScene?.id === scene.id;
                      return (
                        <div key={scene.id}
                          style={{ position: 'absolute', left: clipX, width: clipW, top: 4, bottom: 4 }}
                          onClick={() => { setPlayTime(scene.startTime); setIsPlaying(false); }}
                          className={`rounded-lg overflow-hidden border cursor-pointer group transition-all ${isActive ? 'border-red-500 ring-1 ring-red-500/30' : 'border-white/8 hover:border-white/20'}`}
                        >
                          {/* Image fill */}
                          <div className="absolute inset-0 bg-[#111]">
                            {scene.imageUrl ? (
                              <img src={scene.imageUrl} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            ) : scene.isGenerating ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-purple-900/20"><Loader2 size={12} className="animate-spin text-purple-400" /></div>
                            ) : null}
                          </div>
                          {/* Click to edit */}
                          <button
                            onClick={e => { e.stopPropagation(); setPromptModalId(scene.id); }}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          ><RefreshCw size={12} className="text-white" /></button>
                          {/* Badge */}
                          <div className={`absolute top-1 left-1 text-[8px] font-bold px-1 py-0.5 rounded ${isActive ? 'bg-red-500 text-white' : 'bg-black/70 text-gray-300'}`}>#{scene.sceneNumber}</div>
                          {/* Duration */}
                          {clipW > 40 && <div className="absolute bottom-1 left-1 text-[7px] text-gray-400 bg-black/60 px-1 py-0.5 rounded">{(scene.endTime - scene.startTime).toFixed(1)}s</div>}
                          {/* Resize handle */}
                          <div
                            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 10 }}
                            className="hover:bg-red-500/40 transition-colors flex items-center justify-center"
                            onMouseDown={e => { e.stopPropagation(); onDragStart(e, scene.id); }}
                          ><div className="w-0.5 h-4 bg-white/20 rounded-full" /></div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Playhead */}
                  <div style={{ position: 'absolute', left: playheadX, top: 0, bottom: 0, width: 2, zIndex: 20, pointerEvents: 'none' }} className="bg-red-500">
                    <div className="w-3 h-3 bg-red-500 rounded-full -ml-[5px]" />
                  </div>

                  {/* Ruler seek click area */}
                  <div style={{ position: 'absolute', left: 0, top: 0, width: totalW, height: 24, zIndex: 5, cursor: 'pointer' }}
                    onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPlayTime(Math.max(0, Math.min((e.clientX - r.left) / zoom, totalDuration))); setIsPlaying(false); }} />
                </div>
              </div>
            </div>
          )}

          {/* ── Image Generation Settings (collapsible) ── */}
          <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl overflow-hidden">
            <button onClick={() => setShowSettings(v => !v)}
              className="w-full flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <Settings2 size={15} className="text-purple-500" />
                <span className="font-bold text-white text-sm">Image Generation</span>
                {scenes.length > 0 && <span className="text-[10px] text-gray-600 ml-1">{scenes.length} scenes · {doneImages} images</span>}
              </div>
              {showSettings ? <ChevronUp size={17} className="text-gray-500" /> : <ChevronDown size={17} className="text-gray-500" />}
            </button>

            {showSettings && (
              <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                {/* Scene count + model */}
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
                          {o.value.includes('flash') ? '⚡ ' : '✦ '}{o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Character guide */}
                {characterGuide && (
                  <div className="bg-blue-500/5 border border-blue-500/12 rounded-xl px-3 py-2.5">
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-1">Character Guide</p>
                    <p className="text-[10px] text-gray-500 leading-relaxed">{characterGuide}</p>
                  </div>
                )}

                {/* Action buttons */}
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

                  {generatingAll && (
                    <button onClick={() => { abortRef.current = true; setGeneratingAll(false); }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600/15 text-red-300 text-sm font-semibold border border-red-500/20">
                      Stop ({generatingAllProgress}%)
                    </button>
                  )}

                  {scenes.length > 0 && hasAudio && (
                    <button onClick={handleAutoSet}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-sm font-semibold transition-all">
                      <Scissors size={13} /> Auto-set Durations
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                {generatingAll && (
                  <div className="space-y-1.5">
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full transition-all" style={{ width: `${generatingAllProgress}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-600">{generatingAllProgress}% — generating images…</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Export Panel (collapsible) ── */}
          <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl overflow-hidden">
            <button onClick={() => setShowExport(v => !v)}
              className="w-full flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <Video size={15} className="text-blue-400" />
                <span className="font-bold text-white text-sm">Export Video</span>
              </div>
              {showExport ? <ChevronUp size={17} className="text-gray-500" /> : <ChevronDown size={17} className="text-gray-500" />}
            </button>

            {showExport && (
              <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex justify-between bg-white/3 rounded-xl px-3 py-2.5"><span className="text-gray-500">Scenes</span><span className="text-white font-semibold">{scenes.length}</span></div>
                  <div className="flex justify-between bg-white/3 rounded-xl px-3 py-2.5"><span className="text-gray-500">Images</span><span className={`font-semibold ${doneImages === scenes.length && scenes.length > 0 ? 'text-green-400' : 'text-yellow-400'}`}>{doneImages}/{scenes.length}</span></div>
                  <div className="flex justify-between bg-white/3 rounded-xl px-3 py-2.5"><span className="text-gray-500">Audio</span><span className={`font-semibold ${hasAudio ? 'text-green-400' : 'text-red-400'}`}>{hasAudio ? 'Ready' : 'Missing'}</span></div>
                  <div className="flex justify-between bg-white/3 rounded-xl px-3 py-2.5"><span className="text-gray-500">Duration</span><span className="text-white font-semibold">{fmt(totalDuration)}</span></div>
                </div>

                {videoProgress ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-gray-400">{videoProgress.msg}</span><span className="text-gray-600">{videoProgress.pct}%</span></div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full transition-all" style={{ width: `${videoProgress.pct}%` }} />
                    </div>
                  </div>
                ) : videoBlob ? (
                  <div className="flex gap-2">
                    <button onClick={handleDownload}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600/20 hover:bg-green-600/30 text-green-300 font-semibold transition-all border border-green-500/20">
                      <Download size={15} /> Download ({(videoBlob.size / 1024 / 1024).toFixed(1)} MB)
                    </button>
                    <button onClick={() => setVideoBlob(null)} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-500 transition-all"><X size={15} /></button>
                  </div>
                ) : (
                  <button onClick={handleCreateVideo} disabled={!hasAudio || scenes.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-600 text-white font-semibold transition-all shadow-lg shadow-purple-900/20">
                    <Video size={15} /> Create Video
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
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
