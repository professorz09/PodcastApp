import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Youtube,
  Scissors,
  Download,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  ChevronRight,
  Play,
  Zap,
  ArrowRight,
} from 'lucide-react';
import {
  generateVideoClipsFromTranscript,
  type ShortsSegment,
  type ClipDurationMode,
  type ClipRatio,
  type VideoClipGeneratorConfig,
} from '../services/geminiService';
import type { YoutubeImportData } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  duration: number;
}

type ProcessStep = 'idle' | 'fetching_transcript' | 'analyzing' | 'downloading' | 'done' | 'error';

interface Props {
  onUseTranscript: (data: YoutubeImportData) => void;
  onSendToShorts: (clips: ShortsSegment[], data: YoutubeImportData) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (text.trimStart().startsWith('<')) {
      throw new Error('Server returned HTML. Please start the Flask Server workflow.');
    }
    throw new Error(text.slice(0, 200) || 'Invalid server response');
  }
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const StepIndicator: React.FC<{
  step: ProcessStep;
  currentStep: ProcessStep;
  label: string;
  sub?: string;
}> = ({ step, currentStep, label, sub }) => {
  const order: ProcessStep[] = ['fetching_transcript', 'analyzing', 'downloading', 'done'];
  const myIdx = order.indexOf(step);
  const curIdx = order.indexOf(currentStep);
  const isDone = curIdx > myIdx || currentStep === 'done';
  const isActive = step === currentStep;
  const isPending = !isDone && !isActive;

  return (
    <div className="flex items-center gap-3">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
        isDone ? 'bg-emerald-500/20 text-emerald-400' :
        isActive ? 'bg-purple-500/20 text-purple-400' :
        'bg-white/5 text-gray-600'
      }`}>
        {isDone ? <CheckCircle2 size={14} /> :
         isActive ? <Loader2 size={14} className="animate-spin" /> :
         <div className="w-2 h-2 rounded-full bg-current opacity-40" />}
      </div>
      <div>
        <p className={`text-sm font-medium ${
          isDone ? 'text-emerald-400' : isActive ? 'text-white' : 'text-gray-600'
        }`}>{label}</p>
        {sub && isActive && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const DURATION_OPTIONS: { mode: ClipDurationMode; label: string; sub: string }[] = [
  { mode: 'auto',      label: 'Auto',    sub: 'Best segments' },
  { mode: 'under1min', label: '< 1 min', sub: '20 – 60s' },
  { mode: '2min',      label: '2 min',   sub: '1 – 2 min' },
  { mode: '5min',      label: '5 min',   sub: '2 – 5 min' },
  { mode: '8min',      label: '8 min',   sub: '5 – 8 min' },
  { mode: '15min',     label: '15 min',  sub: '8 – 15 min' },
  { mode: 'custom',    label: 'Custom',  sub: 'Set duration' },
];

const VideoClipImporter: React.FC<Props> = ({ onUseTranscript, onSendToShorts }) => {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [url, setUrl] = useState('');
  const [ratio, setRatio] = useState<ClipRatio>('9:16');
  const [durationMode, setDurationMode] = useState<ClipDurationMode>('auto');
  const [customMinutes, setCustomMinutes] = useState('2');
  const [clipCount, setClipCount] = useState(3);

  // ── Process state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<ProcessStep>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [downloadSub, setDownloadSub] = useState('');

  // ── Results ────────────────────────────────────────────────────────────────
  const [clips, setClips] = useState<ShortsSegment[]>([]);
  const [youtubeData, setYoutubeData] = useState<YoutubeImportData | null>(null);
  const [downloadedFilename, setDownloadedFilename] = useState('');

  // ── Download polling ───────────────────────────────────────────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startDownloadPoll = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/youtube/download/status/${jobId}`);
        const data = await safeJson(res);
        if (data.status === 'downloading') {
          const parts: string[] = [];
          if (typeof data.progress === 'number') parts.push(`${Math.round(data.progress)}%`);
          if (data.speed) parts.push(data.speed);
          if (data.eta) parts.push(`ETA ${data.eta}`);
          setDownloadSub(parts.join('  ·  '));
        } else if (data.status === 'done') {
          clearInterval(pollRef.current!);
          setDownloadedFilename(data.filename);
          setDownloadSub('');
          setStep('done');
        } else if (data.status === 'error') {
          clearInterval(pollRef.current!);
          setErrorMsg(data.error || 'Download failed');
          setStep('error');
        }
      } catch {
        // network glitch — keep polling
      }
    }, 1500);
  }, []);

  // ── Main generate flow ─────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!url.trim()) return;
    setStep('fetching_transcript');
    setErrorMsg('');
    setClips([]);
    setDownloadedFilename('');

    let transcript: TranscriptSegment[] = [];
    let fullText = '';
    let videoId = '';
    let videoTitle = '';
    let videoDescription = '';

    // 1. Fetch transcript
    try {
      const res = await fetch('/api/youtube/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Transcript fetch failed');
      transcript = data.segments;
      fullText = data.full_text;
      videoId = data.video_id || '';
      videoTitle = data.title || '';
      videoDescription = data.description || '';
    } catch (e: any) {
      setErrorMsg(e.message?.includes('fetch')
        ? 'Could not connect to Flask server. Please start the Flask Server workflow.'
        : (e.message || 'Failed to fetch transcript'));
      setStep('error');
      return;
    }

    // 2. Analyze with Gemini
    setStep('analyzing');
    const config: VideoClipGeneratorConfig = {
      ratio,
      durationMode,
      customDurationSeconds: durationMode === 'custom' ? parseFloat(customMinutes) * 60 : undefined,
      clipCount,
    };

    let generatedClips: ShortsSegment[] = [];
    try {
      generatedClips = await generateVideoClipsFromTranscript(transcript, config);
      setClips(generatedClips);
    } catch (e: any) {
      setErrorMsg(e.message || 'Gemini analysis failed');
      setStep('error');
      return;
    }

    // Build youtube data object (transcript connected to import section)
    const ytData: YoutubeImportData = {
      url: url.trim(),
      videoId,
      transcript,
      fullText,
      videoTitle,
      videoDescription,
    };
    setYoutubeData(ytData);

    // 3. Start video download
    setStep('downloading');
    try {
      const res = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), quality: '720p' }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Download start failed');
      if (data.status === 'done') {
        setDownloadedFilename(data.filename);
        setStep('done');
      } else {
        startDownloadPoll(data.job_id);
      }
    } catch (e: any) {
      // Download failure is non-fatal — clips are already generated
      setDownloadedFilename('');
      setStep('done');
    }
  };

  const isRunning = ['fetching_transcript', 'analyzing', 'downloading'].includes(step);
  const canGenerate = url.trim().length > 0 && !isRunning;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full w-full max-w-3xl mx-auto px-4 py-10 space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-xl bg-red-500/15 flex items-center justify-center">
            <Scissors size={16} className="text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Clip Generator</h1>
        </div>
        <p className="text-gray-500 text-sm">
          Paste a YouTube link, set your options, and let AI find the best clips automatically.
        </p>
      </div>

      {/* ── URL Input ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">YouTube URL</label>
        <div className="flex gap-2.5">
          <div className="relative flex-1">
            <Youtube size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canGenerate && handleGenerate()}
              placeholder="https://youtube.com/watch?v=..."
              disabled={isRunning}
              className="w-full bg-[#0f0f0f] border border-white/8 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 focus:bg-[#111] transition-all disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {/* ── Options Grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

        {/* Ratio */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Format</label>
          <div className="flex flex-col gap-2">
            {(['9:16', '16:9'] as ClipRatio[]).map(r => (
              <button
                key={r}
                onClick={() => setRatio(r)}
                disabled={isRunning}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all disabled:opacity-40 ${
                  ratio === r
                    ? 'bg-purple-500/10 border-purple-500/40 text-white'
                    : 'bg-[#0f0f0f] border-white/8 text-gray-400 hover:border-white/15 hover:text-gray-300'
                }`}
              >
                {/* Aspect ratio icon */}
                <div className={`shrink-0 rounded border-2 flex items-center justify-center ${
                  ratio === r ? 'border-purple-400' : 'border-gray-600'
                } ${r === '9:16' ? 'w-5 h-8' : 'w-8 h-5'}`} />
                <div>
                  <p className="text-sm font-semibold">{r === '9:16' ? 'Short' : 'Long'}</p>
                  <p className="text-[10px] text-gray-600">{r}</p>
                </div>
                {ratio === r && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Avg Clip Duration</label>
          <div className="flex flex-col gap-1.5">
            {DURATION_OPTIONS.map(opt => (
              <button
                key={opt.mode}
                onClick={() => setDurationMode(opt.mode)}
                disabled={isRunning}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-left transition-all disabled:opacity-40 ${
                  durationMode === opt.mode
                    ? 'bg-purple-500/10 border-purple-500/40 text-white'
                    : 'bg-[#0f0f0f] border-white/6 text-gray-400 hover:border-white/12 hover:text-gray-300'
                }`}
              >
                <span className="text-sm font-medium">{opt.label}</span>
                <span className="text-[10px] text-gray-600">{opt.sub}</span>
              </button>
            ))}
            {durationMode === 'custom' && (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min="0.5"
                  max="60"
                  step="0.5"
                  value={customMinutes}
                  onChange={e => setCustomMinutes(e.target.value)}
                  disabled={isRunning}
                  className="w-20 bg-[#0f0f0f] border border-white/8 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all disabled:opacity-50 text-center"
                />
                <span className="text-xs text-gray-500">minutes</span>
              </div>
            )}
          </div>
        </div>

        {/* Clip count */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">No. of Clips</label>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setClipCount(n)}
                disabled={isRunning}
                className={`aspect-square rounded-xl text-sm font-bold border transition-all disabled:opacity-40 ${
                  clipCount === n
                    ? 'bg-purple-500/15 border-purple-500/50 text-white shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                    : 'bg-[#0f0f0f] border-white/8 text-gray-400 hover:border-white/15 hover:text-gray-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Select how many clips AI should extract from the video.
          </p>
        </div>
      </div>

      {/* ── Generate Button ────────────────────────────────────────────────── */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-sm bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white shadow-lg shadow-purple-900/30 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {isRunning ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <Zap size={17} />
            Generate Clips
          </>
        )}
      </button>

      {/* ── Processing Panel ───────────────────────────────────────────────── */}
      {(isRunning || step === 'done' || step === 'error') && (
        <div className="bg-[#0a0a0a] border border-white/6 rounded-2xl p-5 space-y-3.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Progress</p>
          <StepIndicator step="fetching_transcript" currentStep={step} label="Fetching transcript" sub="Connecting to Flask server…" />
          <StepIndicator step="analyzing" currentStep={step} label="Analyzing with Gemini" sub="Finding best moments…" />
          <StepIndicator step="downloading" currentStep={step} label="Downloading video" sub={downloadSub || 'Starting download…'} />
          {step === 'error' && (
            <div className="flex items-start gap-2.5 bg-red-500/5 border border-red-500/15 rounded-xl px-3.5 py-3 mt-2">
              <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-300/80 text-xs leading-relaxed">{errorMsg}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {clips.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              {clips.length} Clip{clips.length !== 1 ? 's' : ''} Generated
            </p>
            {step === 'done' && youtubeData && (
              <div className="flex items-center gap-2">
                {downloadedFilename && (
                  <a
                    href={`/api/files/${downloadedFilename}`}
                    download
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 border border-white/6 transition-all"
                  >
                    <Download size={12} />
                    Video
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {clips.map((clip, i) => (
              <div
                key={i}
                className="bg-[#0a0a0a] border border-white/6 rounded-2xl p-4 space-y-2.5 hover:border-white/10 transition-all"
              >
                {/* Clip header */}
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-purple-400">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white leading-snug">{clip.title}</h3>
                    {clip.description && (
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{clip.description}</p>
                    )}
                  </div>
                </div>

                {/* Timestamp + duration badges */}
                <div className="flex items-center gap-2 flex-wrap pl-10">
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-400 bg-white/4 rounded-md px-2.5 py-1">
                    <Play size={9} className="text-purple-400" />
                    {fmtTime(clip.start)} → {fmtTime(clip.end)}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-400 bg-white/4 rounded-md px-2.5 py-1">
                    <Clock size={9} />
                    {fmtDuration(clip.end - clip.start)}
                  </span>
                  <span className="text-[11px] text-gray-600 bg-white/4 rounded-md px-2.5 py-1">
                    {ratio}
                  </span>
                </div>

                {/* Hook */}
                {clip.hook && (
                  <div className="ml-10 pl-3 border-l-2 border-purple-500/20">
                    <p className="text-xs text-gray-500 italic leading-relaxed">"{clip.hook}"</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Action buttons */}
          {youtubeData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => onSendToShorts(clips, { ...youtubeData, downloadedFilename: downloadedFilename || undefined })}
                className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-purple-600 hover:bg-purple-500 text-white transition-all active:scale-[0.98] shadow-lg shadow-purple-900/20"
              >
                <Scissors size={16} />
                Open in Shorts
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => onUseTranscript(youtubeData)}
                className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-white/6 hover:bg-white/10 text-gray-200 border border-white/8 hover:border-white/15 transition-all active:scale-[0.98]"
              >
                <ArrowRight size={16} />
                Use Transcript in Import
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoClipImporter;
