import React, { useState, useRef, useCallback } from 'react';
import {
  Film, Wand2, Image, Copy, Check, ChevronDown,
  Play, Download, Loader2, AlertCircle, Layers, Clock, ArrowLeft,
  Zap, Settings2, ImagePlus, Video, Mic2
} from 'lucide-react';
import { DebateSegment, StoryboardScene } from '../types';
import { generateStoryboardScenes, generateStoryboardImage } from '../services/geminiService';
import { toast } from './Toast';

interface StoryboardProps {
  script: DebateSegment[];
  onBack: () => void;
}

const MODEL_OPTIONS = [
  { value: 'gemini-3-flash-preview', label: 'Gemini Flash (Fast)' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini Pro (Best)' },
];

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

function buildScenesFromRaw(
  rawScenes: { sceneNumber: number; prompt: string; segmentIndices: number[] }[],
  segments: DebateSegment[],
): StoryboardScene[] {
  // Build cumulative time offsets
  const offsets: number[] = [];
  let t = 0;
  for (const seg of segments) {
    offsets.push(t);
    t += seg.duration ?? 0;
  }
  const totalDuration = t;

  return rawScenes.map((raw) => {
    const indices = raw.segmentIndices.filter(i => i >= 0 && i < segments.length);
    const start = indices.length > 0 ? offsets[indices[0]] : 0;
    const lastIdx = indices.length > 0 ? indices[indices.length - 1] : 0;
    const end = (lastIdx < segments.length - 1)
      ? offsets[lastIdx] + (segments[lastIdx].duration ?? 0)
      : totalDuration;

    return {
      id: `scene-${raw.sceneNumber}`,
      sceneNumber: raw.sceneNumber,
      prompt: raw.prompt,
      startTime: start,
      endTime: end,
      segmentIndices: indices,
    };
  });
}

// ── Video creation from storyboard scenes + audio ───────────────────────────
async function createStoryboardVideo(
  scenes: StoryboardScene[],
  script: DebateSegment[],
  onProgress: (pct: number, msg: string) => void,
): Promise<Blob> {
  onProgress(0, 'Loading audio segments…');

  // 1. Collect all audioUrls in order
  const audioSegments = script.filter(s => s.audioUrl && s.duration && s.duration > 0);
  if (audioSegments.length === 0) throw new Error('No audio found. Generate audio first in the Voice step.');

  const AC = new AudioContext();

  // 2. Decode each audio segment
  const decoded: AudioBuffer[] = [];
  for (let i = 0; i < audioSegments.length; i++) {
    onProgress(5 + Math.round((i / audioSegments.length) * 25), `Decoding audio ${i + 1}/${audioSegments.length}…`);
    const url = audioSegments[i].audioUrl!;
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    const ab = await AC.decodeAudioData(buf);
    decoded.push(ab);
  }

  // 3. Concatenate into single AudioBuffer
  onProgress(30, 'Merging audio…');
  const totalSamples = decoded.reduce((s, b) => s + b.length, 0);
  const sr = decoded[0].sampleRate;
  const channels = decoded[0].numberOfChannels;
  const merged = AC.createBuffer(channels, totalSamples, sr);
  let offset = 0;
  for (const buf of decoded) {
    for (let c = 0; c < channels; c++) {
      merged.getChannelData(c).set(buf.getChannelData(c), offset);
    }
    offset += buf.length;
  }

  const totalDuration = merged.duration;
  onProgress(35, 'Preparing canvas…');

  // 4. Pre-load images
  const imgMap: Map<string, HTMLImageElement> = new Map();
  const validScenes = scenes.filter(sc => sc.imageUrl);
  for (let i = 0; i < validScenes.length; i++) {
    onProgress(35 + Math.round((i / validScenes.length) * 15), `Loading images ${i + 1}/${validScenes.length}…`);
    const sc = validScenes[i];
    const img = new window.Image();
    await new Promise<void>((res) => {
      img.onload = () => res();
      img.onerror = () => res();
      img.src = sc.imageUrl!;
    });
    imgMap.set(sc.id, img);
  }

  onProgress(50, 'Recording video…');

  // 5. Canvas setup
  const W = 1280, H = 720, FPS = 30;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 6. Audio → destination stream
  const dest = AC.createMediaStreamDestination();
  const src = AC.createBufferSource();
  src.buffer = merged;
  src.connect(dest);

  // 7. Combined stream
  const videoStream = canvas.captureStream(FPS);
  const audioStream = dest.stream;
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioStream.getAudioTracks(),
  ]);

  // 8. MediaRecorder
  const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
    ? 'video/mp4;codecs=avc1'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });

  recorder.start(100);
  src.start(0);

  // 9. Animation loop
  let startWall = performance.now();
  const draw = () => {
    const elapsed = (performance.now() - startWall) / 1000;
    if (elapsed >= totalDuration + 0.1) {
      recorder.stop();
      return;
    }

    onProgress(50 + Math.round((elapsed / totalDuration) * 45), `Recording… ${formatTime(elapsed)} / ${formatTime(totalDuration)}`);

    // Find active scene
    const active = scenes.find(sc => elapsed >= sc.startTime && elapsed < sc.endTime) ?? scenes[scenes.length - 1];

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (active) {
      const img = imgMap.get(active.id);
      if (img && img.complete && img.naturalWidth > 0) {
        // Cover-fill
        const scaleX = W / img.naturalWidth;
        const scaleY = H / img.naturalHeight;
        const scale = Math.max(scaleX, scaleY);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } else {
        // Placeholder
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#444';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Scene ${active.sceneNumber}`, W / 2, H / 2);
      }

      // Scene number overlay (top-left corner)
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(16, 16, 100, 32);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Scene ${active.sceneNumber}`, 24, 37);
    }

    requestAnimationFrame(draw);
  };
  startWall = performance.now();
  requestAnimationFrame(draw);

  await done;
  onProgress(97, 'Finalizing…');

  return new Blob(chunks, { type: mimeType });
}

// ── Scene Card ───────────────────────────────────────────────────────────────
const SceneCard: React.FC<{
  scene: StoryboardScene;
  voiceoverText: string;
  onPromptChange: (id: string, p: string) => void;
  onGenerate: (id: string) => void;
}> = ({ scene, voiceoverText, onPromptChange, onGenerate }) => {
  const [copied, setCopied] = useState(false);
  const [voiceExpanded, setVoiceExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(scene.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="bg-[#0e0e0e] border border-white/6 rounded-2xl overflow-hidden flex flex-col group">
      {/* Image preview */}
      <div className="relative aspect-video bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
        {scene.imageUrl ? (
          <img src={scene.imageUrl} alt={`Scene ${scene.sceneNumber}`} className="w-full h-full object-cover" />
        ) : scene.isGenerating ? (
          <div className="flex flex-col items-center gap-2 text-gray-600">
            <Loader2 size={28} className="animate-spin text-purple-500" />
            <span className="text-xs text-gray-500">Generating…</span>
          </div>
        ) : scene.error ? (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <AlertCircle size={22} className="text-red-400" />
            <span className="text-xs text-red-400">{scene.error}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-700">
            <ImagePlus size={28} />
            <span className="text-xs">No image yet</span>
          </div>
        )}

        {/* Scene badge */}
        <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1.5">
          <span className="text-white text-xs font-bold">#{scene.sceneNumber}</span>
        </div>

        {/* Time badge */}
        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 text-gray-300 text-[10px]">
          <Clock size={10} />
          {formatTime(scene.startTime)} – {formatTime(scene.endTime)}
          <span className="text-gray-500 ml-0.5">({(scene.endTime - scene.startTime).toFixed(1)}s)</span>
        </div>

        {/* Generate button overlay on hover */}
        {!scene.isGenerating && (
          <button
            onClick={() => onGenerate(scene.id)}
            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-semibold text-sm"
          >
            <Wand2 size={18} />
            {scene.imageUrl ? 'Regenerate' : 'Generate Image'}
          </button>
        )}
      </div>

      {/* Voiceover Text */}
      {voiceoverText && (
        <div className="border-t border-white/5">
          <button
            onClick={() => setVoiceExpanded(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/4 transition-all"
          >
            <Mic2 size={11} className="text-blue-400 shrink-0" />
            <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest">Voiceover</span>
            <ChevronDown size={10} className={`ml-auto text-gray-600 transition-transform ${voiceExpanded ? 'rotate-180' : ''}`} />
          </button>
          {voiceExpanded && (
            <div className="px-3 pb-3">
              <p className="text-xs text-gray-400 leading-relaxed bg-[#080808] border border-white/4 rounded-lg p-2.5 italic">
                {voiceoverText}
              </p>
            </div>
          )}
          {!voiceExpanded && (
            <p className="px-3 pb-2 text-[11px] text-gray-600 leading-relaxed line-clamp-2">
              {voiceoverText}
            </p>
          )}
        </div>
      )}

      {/* Prompt editor */}
      <div className="p-3 flex-1 flex flex-col gap-2 border-t border-white/5">
        <div className="flex items-center gap-1.5 mb-1">
          <ImagePlus size={10} className="text-purple-400" />
          <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-widest">Image Prompt</span>
        </div>
        <textarea
          value={scene.prompt}
          onChange={(e) => onPromptChange(scene.id, e.target.value)}
          rows={3}
          className="w-full bg-[#080808] border border-white/5 rounded-lg px-3 py-2 text-xs text-gray-300 resize-none focus:border-purple-500/40 outline-none leading-relaxed custom-scrollbar"
          placeholder="Image generation prompt…"
        />
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs transition-all border border-white/5"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={() => onGenerate(scene.id)}
            disabled={scene.isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs transition-all border border-purple-500/20 disabled:opacity-40"
          >
            {scene.isGenerating
              ? <Loader2 size={12} className="animate-spin" />
              : <Wand2 size={12} />
            }
            {scene.isGenerating ? 'Generating…' : scene.imageUrl ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const Storyboard: React.FC<StoryboardProps> = ({ script, onBack }) => {
  const [sceneCount, setSceneCount] = useState(10);
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [isGeneratingScenes, setIsGeneratingScenes] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingAllProgress, setGeneratingAllProgress] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoProgress, setVideoProgress] = useState<{ pct: number; msg: string } | null>(null);
  const abortRef = useRef(false);

  const hasAudio = script.some(s => s.audioUrl && s.duration && s.duration > 0);
  const totalDuration = script.reduce((s, seg) => s + (seg.duration ?? 0), 0);
  const allImagesReady = scenes.length > 0 && scenes.every(sc => sc.imageUrl && !sc.isGenerating);
  const anyImageReady = scenes.some(sc => sc.imageUrl);

  const maxScenes = 200;

  // ── Generate scenes list ──
  const handleGenerateScenes = useCallback(async () => {
    if (script.length === 0) { toast.error('No script loaded. Go back and generate a script first.'); return; }
    setIsGeneratingScenes(true);
    setVideoBlob(null);
    try {
      const raw = await generateStoryboardScenes(
        script.map(s => ({ speaker: s.speaker, text: s.text, duration: s.duration })),
        sceneCount,
        model,
      );
      const built = buildScenesFromRaw(raw, script);
      setScenes(built);
      toast.success(`${built.length} scenes created`);
    } catch (e: any) {
      toast.error(e.message || 'Scene generation failed');
    } finally {
      setIsGeneratingScenes(false);
    }
  }, [script, sceneCount, model]);

  // ── Generate single image ──
  const handleGenerateImage = useCallback(async (id: string) => {
    setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, isGenerating: true, error: undefined } : sc));
    const scene = scenes.find(sc => sc.id === id);
    if (!scene) return;
    try {
      const url = await generateStoryboardImage(scene.prompt);
      setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, imageUrl: url, isGenerating: false } : sc));
    } catch (e: any) {
      setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, isGenerating: false, error: e.message || 'Failed' } : sc));
      toast.error(`Scene ${scene.sceneNumber}: ${e.message || 'Image generation failed'}`);
    }
  }, [scenes]);

  // ── Generate all images ──
  const handleGenerateAll = useCallback(async () => {
    abortRef.current = false;
    setGeneratingAll(true);
    setGeneratingAllProgress(0);
    let done = 0;
    const toGenerate = scenes.filter(sc => !sc.imageUrl);
    for (const scene of toGenerate) {
      if (abortRef.current) break;
      await handleGenerateImage(scene.id);
      done++;
      setGeneratingAllProgress(Math.round((done / toGenerate.length) * 100));
      // Small delay to avoid rate limit
      await new Promise(r => setTimeout(r, 400));
    }
    setGeneratingAll(false);
    setGeneratingAllProgress(0);
    if (!abortRef.current) toast.success('All images generated!');
  }, [scenes, handleGenerateImage]);

  const handleStopAll = () => { abortRef.current = true; setGeneratingAll(false); };

  // ── Update prompt ──
  const handlePromptChange = useCallback((id: string, prompt: string) => {
    setScenes(prev => prev.map(sc => sc.id === id ? { ...sc, prompt } : sc));
  }, []);

  // ── Create video ──
  const handleCreateVideo = useCallback(async () => {
    if (!allImagesReady) { toast.error('Generate all images first.'); return; }
    if (!hasAudio) { toast.error('No audio found. Generate audio first in the Voice step.'); return; }
    setVideoBlob(null);
    setVideoProgress({ pct: 0, msg: 'Starting…' });
    try {
      const blob = await createStoryboardVideo(
        scenes,
        script,
        (pct, msg) => setVideoProgress({ pct, msg }),
      );
      setVideoBlob(blob);
      setVideoProgress(null);
      toast.success('Video created!');
    } catch (e: any) {
      setVideoProgress(null);
      toast.error(e.message || 'Video creation failed');
    }
  }, [scenes, script, allImagesReady, hasAudio]);

  const handleDownloadVideo = () => {
    if (!videoBlob) return;
    const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard-video.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doneImages = scenes.filter(sc => sc.imageUrl).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
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
            <p className="text-gray-600 text-[10px] mt-0.5 leading-none">Script → Scenes → Images → Video</p>
          </div>
        </div>

        {/* Stats */}
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Layers size={12} /> {script.length} segments
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} /> {formatTime(totalDuration)}
          </span>
          {!hasAudio && (
            <span className="text-yellow-500/80 text-[10px] bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full">
              No audio yet
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">

        {/* Settings Card */}
        <div className="bg-[#0e0e0e] border border-white/6 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 size={15} className="text-purple-400" />
            <h3 className="text-white font-semibold text-sm">Scene Settings</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Scene Count */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">
                Number of Scenes
                <span className="ml-2 text-purple-400 font-bold">{sceneCount}</span>
              </label>
              <input
                type="range"
                min={1}
                max={maxScenes}
                value={sceneCount}
                onChange={e => setSceneCount(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-700 mt-1">
                <span>1</span>
                <span>{maxScenes}</span>
              </div>
              <input
                type="number"
                min={1}
                max={maxScenes}
                value={sceneCount}
                onChange={e => {
                  const v = Math.min(maxScenes, Math.max(1, Number(e.target.value)));
                  setSceneCount(v);
                }}
                className="mt-2 w-full bg-[#080808] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white text-center outline-none focus:border-purple-500/40"
              />
            </div>

            {/* Model Toggle */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">Script Analysis Model</label>
              <div className="flex bg-[#080808] border border-white/5 rounded-xl p-1 gap-1">
                {MODEL_OPTIONS.map(o => {
                  const isActive = model === o.value;
                  return (
                    <button
                      key={o.value}
                      onClick={() => setModel(o.value)}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      {o.value.includes('flash') ? '⚡ Flash' : '✦ Pro'}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-600 mt-2">
                {model.includes('flash') ? 'Fast · lower cost' : 'Best quality · slower'}
              </p>
              <p className="text-[10px] text-gray-600 mt-1 flex items-center gap-1">
                <ImagePlus size={9} />
                Images: MS Paint style (auto)
              </p>
            </div>
          </div>

          {/* Generate button */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleGenerateScenes}
              disabled={isGeneratingScenes || script.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/40 disabled:text-purple-700 text-white text-sm font-semibold transition-all shadow-lg shadow-purple-900/20"
            >
              {isGeneratingScenes
                ? <Loader2 size={15} className="animate-spin" />
                : <Wand2 size={15} />
              }
              {isGeneratingScenes ? 'Generating Scenes…' : scenes.length > 0 ? 'Regenerate Scenes' : 'Generate Scenes'}
            </button>

            {script.length === 0 && (
              <p className="text-xs text-yellow-500/80 self-center">Go back and generate a script first</p>
            )}
          </div>
        </div>

        {/* Scene Grid */}
        {scenes.length > 0 && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Image size={13} />
                <span>{doneImages} / {scenes.length} images ready</span>
                {doneImages > 0 && (
                  <div className="h-1.5 w-24 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full transition-all"
                      style={{ width: `${(doneImages / scenes.length) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="ml-auto flex gap-2">
                {generatingAll ? (
                  <button
                    onClick={handleStopAll}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 text-xs font-semibold transition-all border border-red-500/20"
                  >
                    Stop ({generatingAllProgress}%)
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateAll}
                    disabled={scenes.every(sc => sc.imageUrl)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold transition-all border border-blue-500/20 disabled:opacity-40"
                  >
                    <Zap size={13} />
                    Generate All Images
                  </button>
                )}

                {hasAudio && (
                  <button
                    onClick={handleCreateVideo}
                    disabled={!allImagesReady || !!videoProgress}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-purple-900/40 disabled:to-blue-900/40 disabled:text-gray-600 text-white text-xs font-semibold transition-all shadow-lg shadow-purple-900/20"
                  >
                    {videoProgress
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Video size={13} />
                    }
                    {videoProgress ? `${videoProgress.pct}% – ${videoProgress.msg}` : 'Create Video'}
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar for generate-all */}
            {generatingAll && (
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full transition-all"
                  style={{ width: `${generatingAllProgress}%` }}
                />
              </div>
            )}

            {/* Video progress */}
            {videoProgress && (
              <div className="bg-[#0e0e0e] border border-purple-500/20 rounded-xl p-4 flex items-center gap-3">
                <Loader2 size={18} className="animate-spin text-purple-400 shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-white font-medium mb-1">{videoProgress.msg}</div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full transition-all"
                      style={{ width: `${videoProgress.pct}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-gray-500">{videoProgress.pct}%</span>
              </div>
            )}

            {/* Video download */}
            {videoBlob && !videoProgress && (
              <div className="bg-[#0e0e0e] border border-green-500/20 rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
                  <Play size={18} className="text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm font-semibold">Video Ready!</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {(videoBlob.size / 1024 / 1024).toFixed(1)} MB · {videoBlob.type.includes('mp4') ? 'MP4' : 'WebM'}
                  </p>
                </div>
                <button
                  onClick={handleDownloadVideo}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600/20 hover:bg-green-600/30 text-green-300 text-sm font-semibold transition-all border border-green-500/20"
                >
                  <Download size={15} />
                  Download
                </button>
              </div>
            )}

            {/* Scene Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {scenes.map(scene => {
                const voiceoverText = scene.segmentIndices
                  .map(i => script[i])
                  .filter(Boolean)
                  .map(seg => `${seg.speaker}: ${seg.text}`)
                  .join('\n');
                return (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    voiceoverText={voiceoverText}
                    onPromptChange={handlePromptChange}
                    onGenerate={handleGenerateImage}
                  />
                );
              })}
            </div>
          </>
        )}

        {/* Empty state */}
        {scenes.length === 0 && !isGeneratingScenes && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-purple-900/20 rounded-2xl flex items-center justify-center mb-4">
              <Film size={28} className="text-purple-500/60" />
            </div>
            <h3 className="text-white font-semibold mb-2">No Scenes Yet</h3>
            <p className="text-gray-600 text-sm max-w-xs">
              Configure the settings above and click <strong className="text-gray-400">Generate Scenes</strong> to create your storyboard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Storyboard;
