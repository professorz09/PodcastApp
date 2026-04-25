import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Youtube,
  Scissors,
  Download,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Play,
  Zap,
  ArrowRight,
  ChevronRight,
  Smartphone,
  Monitor,
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

interface TranscriptSegment { text: string; start: number; end: number; duration: number; }
type ProcessStep = 'idle' | 'fetching_transcript' | 'analyzing' | 'downloading' | 'done' | 'error';

interface Props {
  onUseTranscript: (data: YoutubeImportData) => void;
  onSendToShorts: (clips: ShortsSegment[], data: YoutubeImportData) => void;
}

// ─────────────────────────────────────────────────────────────────────────────

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch {
    if (text.trimStart().startsWith('<')) throw new Error('Server returned HTML. Start the Flask Server workflow.');
    throw new Error(text.slice(0, 200) || 'Invalid server response');
  }
}

const fmtTime = (s: number) =>
  `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

const fmtDur = (s: number) =>
  s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`.replace(/ 0s$/, 'm');

// ─────────────────────────────────────────────────────────────────────────────

const PROCESS_ORDER: ProcessStep[] = ['fetching_transcript', 'analyzing', 'downloading', 'done'];

const STEP_LABELS: Record<string, { label: string; defaultSub: string }> = {
  fetching_transcript: { label: 'Fetching transcript',   defaultSub: 'Connecting to server…' },
  analyzing:           { label: 'Analyzing with Gemini', defaultSub: 'Finding best moments…' },
  downloading:         { label: 'Downloading video',     defaultSub: 'Starting download…'   },
};

const ProgressStep: React.FC<{ step: ProcessStep; current: ProcessStep; sub?: string }> = ({
  step, current, sub,
}) => {
  const myIdx  = PROCESS_ORDER.indexOf(step);
  const curIdx = PROCESS_ORDER.indexOf(current);
  const done   = curIdx > myIdx || current === 'done';
  const active = step === current;
  const info   = STEP_LABELS[step];

  return (
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
        done   ? 'bg-emerald-500/20 text-emerald-400' :
        active ? 'bg-purple-500/20 text-purple-400'  :
                 'bg-white/[0.04] text-gray-700'
      }`}>
        {done   ? <CheckCircle2 size={12} /> :
         active ? <Loader2 size={12} className="animate-spin" /> :
                  <div className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />}
      </div>
      <div>
        <p className={`text-sm leading-none ${done ? 'text-emerald-400' : active ? 'text-white' : 'text-gray-600'}`}>
          {info.label}
        </p>
        {active && (
          <p className="text-xs text-gray-600 mt-1">{sub || info.defaultSub}</p>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const DURATION_OPTS: { mode: ClipDurationMode; label: string; sub: string }[] = [
  { mode: 'auto',      label: 'Auto',    sub: 'Best' },
  { mode: 'under1min', label: '< 1 min', sub: '~30s'  },
  { mode: '2min',      label: '2 min',   sub: '1–2m'  },
  { mode: '5min',      label: '5 min',   sub: '2–5m'  },
  { mode: '8min',      label: '8 min',   sub: '5–8m'  },
  { mode: '15min',     label: '15 min',  sub: '8–15m' },
  { mode: 'custom',    label: 'Custom',  sub: 'Set'   },
];

// ─────────────────────────────────────────────────────────────────────────────

const VideoClipImporter: React.FC<Props> = ({ onUseTranscript, onSendToShorts }) => {
  const [url,          setUrl]          = useState('');
  const [ratio,        setRatio]        = useState<ClipRatio>('9:16');
  const [durationMode, setDurationMode] = useState<ClipDurationMode>('auto');
  const [customMins,   setCustomMins]   = useState('2');
  const [clipCount,    setClipCount]    = useState(3);
  const [step,         setStep]         = useState<ProcessStep>('idle');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [dlSub,        setDlSub]        = useState('');
  const [clips,        setClips]        = useState<ShortsSegment[]>([]);
  const [ytData,       setYtData]       = useState<YoutubeImportData | null>(null);
  const [dlFilename,   setDlFilename]   = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startPoll = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/youtube/download/status/${jobId}`);
        const data = await safeJson(res);
        if (data.status === 'downloading') {
          const parts: string[] = [];
          if (typeof data.progress === 'number') parts.push(`${Math.round(data.progress)}%`);
          if (data.speed) parts.push(data.speed);
          if (data.eta)   parts.push(`ETA ${data.eta}`);
          setDlSub(parts.join('  ·  '));
        } else if (data.status === 'done') {
          clearInterval(pollRef.current!);
          setDlFilename(data.filename);
          setDlSub('');
          setStep('done');
        } else if (data.status === 'error') {
          clearInterval(pollRef.current!);
          setErrorMsg(data.error || 'Download failed');
          setStep('error');
        }
      } catch { /* keep polling on network blip */ }
    }, 1500);
  }, []);

  const handleGenerate = async () => {
    if (!url.trim()) return;
    setStep('fetching_transcript');
    setErrorMsg('');
    setClips([]);
    setDlFilename('');

    // Step 1 ── Transcript
    let transcript: TranscriptSegment[] = [];
    let fullText = '', videoId = '', videoTitle = '', videoDescription = '';
    try {
      const res  = await fetch('/api/youtube/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Transcript fetch failed');
      transcript       = data.segments;
      fullText         = data.full_text;
      videoId          = data.video_id    || '';
      videoTitle       = data.title       || '';
      videoDescription = data.description || '';
    } catch (e: any) {
      setErrorMsg(e.message?.includes('fetch')
        ? 'Cannot connect to Flask server. Start the "Flask Server" workflow.'
        : (e.message || 'Failed to fetch transcript'));
      setStep('error');
      return;
    }

    // Step 2 ── Gemini
    setStep('analyzing');
    const config: VideoClipGeneratorConfig = {
      ratio,
      durationMode,
      customDurationSeconds: durationMode === 'custom' ? parseFloat(customMins) * 60 : undefined,
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

    const data: YoutubeImportData = {
      url: url.trim(), videoId, transcript, fullText, videoTitle, videoDescription,
    };
    setYtData(data);

    // Step 3 ── Download (non-fatal)
    setStep('downloading');
    try {
      const res  = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), quality: '1080' }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || 'Download start failed');
      if (d.status === 'done') { setDlFilename(d.filename); setStep('done'); }
      else startPoll(d.job_id);
    } catch { setStep('done'); }
  };

  const running     = ['fetching_transcript', 'analyzing', 'downloading'].includes(step);
  const canGenerate = !!url.trim() && !running;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-6 md:py-10 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
          <Scissors size={15} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white leading-none">Clip Generator</h1>
          <p className="text-xs text-gray-600 mt-0.5">AI finds the best clips from any YouTube video</p>
        </div>
      </div>

      {/* ── URL ────────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">YouTube URL</label>
        <div className="relative">
          <Youtube size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && canGenerate && handleGenerate()}
            placeholder="https://youtube.com/watch?v=..."
            disabled={running}
            className="w-full bg-[#0d0d0d] border border-white/[0.07] rounded-xl pl-8 pr-3 py-3 text-sm text-white placeholder:text-gray-700 focus:outline-none focus:border-purple-500/40 transition-all disabled:opacity-50"
          />
        </div>
      </div>

      {/* ── Options ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">

        {/* Format — 2 toggle pills */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Format</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { r: '9:16' as ClipRatio, label: 'Short (9:16)', Icon: Smartphone, sub: 'Reels / TikTok' },
              { r: '16:9' as ClipRatio, label: 'Long (16:9)',  Icon: Monitor,    sub: 'YouTube' },
            ]).map(({ r, label, Icon, sub }) => (
              <button
                key={r}
                onClick={() => setRatio(r)}
                disabled={running}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all disabled:opacity-40 ${
                  ratio === r
                    ? 'bg-purple-500/[0.08] border-purple-500/30 text-white'
                    : 'bg-[#0d0d0d] border-white/[0.06] text-gray-500 hover:border-white/[0.1] hover:text-gray-300'
                }`}
              >
                <Icon size={15} className={ratio === r ? 'text-purple-400' : 'text-gray-600'} />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold truncate">{label}</p>
                  <p className="text-[10px] text-gray-700">{sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Duration — scrollable pill row */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Avg Clip Duration</label>
          <div className="flex gap-1.5 flex-wrap">
            {DURATION_OPTS.map(opt => (
              <button
                key={opt.mode}
                onClick={() => setDurationMode(opt.mode)}
                disabled={running}
                className={`flex flex-col items-center px-3 py-2 rounded-lg border text-left transition-all disabled:opacity-40 ${
                  durationMode === opt.mode
                    ? 'bg-purple-500/[0.08] border-purple-500/30 text-white'
                    : 'bg-[#0d0d0d] border-white/[0.06] text-gray-500 hover:border-white/[0.1] hover:text-gray-300'
                }`}
              >
                <span className="text-[12px] font-semibold leading-none">{opt.label}</span>
                <span className="text-[9px] text-gray-700 mt-0.5">{opt.sub}</span>
              </button>
            ))}
          </div>
          {durationMode === 'custom' && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number" min="0.5" max="60" step="0.5"
                value={customMins}
                onChange={e => setCustomMins(e.target.value)}
                disabled={running}
                className="w-16 bg-[#0d0d0d] border border-white/[0.07] rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-purple-500/40 transition-all disabled:opacity-50"
              />
              <span className="text-xs text-gray-600">minutes per clip</span>
            </div>
          )}
        </div>

        {/* Clip Count — 5 number pills */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Number of Clips</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setClipCount(n)}
                disabled={running}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all disabled:opacity-40 ${
                  clipCount === n
                    ? 'bg-purple-500/[0.12] border-purple-500/40 text-white shadow-[0_0_10px_rgba(168,85,247,0.15)]'
                    : 'bg-[#0d0d0d] border-white/[0.06] text-gray-500 hover:border-white/[0.1] hover:text-gray-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Generate Button ─────────────────────────────────────────────────── */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-purple-900/25"
      >
        {running
          ? <><Loader2 size={16} className="animate-spin" />Processing…</>
          : <><Zap size={15} />Generate Clips</>}
      </button>

      {/* ── Progress ────────────────────────────────────────────────────────── */}
      {step !== 'idle' && (
        <div className="bg-[#0a0a0a] border border-white/[0.05] rounded-xl p-4 space-y-3">
          {(Object.keys(STEP_LABELS) as ProcessStep[]).map(s => (
            <ProgressStep key={s} step={s} current={step}
              sub={s === 'downloading' ? dlSub : undefined}
            />
          ))}
          {step === 'error' && (
            <div className="flex items-start gap-2 bg-red-500/[0.06] border border-red-500/[0.15] rounded-lg px-3 py-2.5">
              <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-300/70 text-xs leading-relaxed">{errorMsg}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {clips.length > 0 && (
        <div className="space-y-3">

          {/* header row */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              {clips.length} Clip{clips.length !== 1 ? 's' : ''} Generated
            </p>
            {dlFilename && (
              <a
                href={`/api/files/${dlFilename}`}
                download
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-white px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.05] transition-all"
              >
                <Download size={10} />Download Video
              </a>
            )}
          </div>

          {/* clip cards */}
          {clips.map((clip, i) => (
            <div key={i} className="bg-[#0a0a0a] border border-white/[0.05] rounded-xl p-4 active:bg-[#0d0d0d] transition-all">
              <div className="flex items-start gap-3">
                {/* index badge */}
                <div className="w-6 h-6 rounded-md bg-purple-500/[0.1] border border-purple-500/[0.15] flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-purple-400">{i + 1}</span>
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-[13px] font-semibold text-white leading-snug">{clip.title}</p>

                  {/* time badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-gray-500 bg-white/[0.04] rounded-md px-2 py-0.5">
                      <Play size={7} className="text-purple-400" />
                      {fmtTime(clip.start)} → {fmtTime(clip.end)}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-gray-500 bg-white/[0.04] rounded-md px-2 py-0.5">
                      <Clock size={7} />{fmtDur(clip.end - clip.start)}
                    </span>
                    <span className="text-[10px] text-gray-600 bg-white/[0.04] rounded-md px-2 py-0.5">{ratio}</span>
                  </div>

                  {/* description */}
                  {clip.description && (
                    <p className="text-[11px] text-gray-600 leading-relaxed">{clip.description}</p>
                  )}

                  {/* hook quote */}
                  {clip.hook && (
                    <p className="text-[11px] text-gray-600 italic pl-2 border-l-2 border-purple-500/20 leading-relaxed">
                      "{clip.hook}"
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* action buttons */}
          {ytData && (
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => onSendToShorts(clips, { ...ytData, downloadedFilename: dlFilename || undefined })}
                className="w-full flex items-center justify-center gap-1.5 py-3.5 rounded-xl font-semibold text-sm bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white transition-all active:scale-[0.98] shadow-md shadow-purple-900/20"
              >
                <Scissors size={14} />
                Open in Shorts Editor
                <ChevronRight size={13} />
              </button>
              <button
                onClick={() => onUseTranscript(ytData)}
                className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl font-semibold text-sm bg-white/[0.05] hover:bg-white/[0.08] active:bg-white/[0.03] text-gray-300 border border-white/[0.07] transition-all active:scale-[0.98]"
              >
                <ArrowRight size={14} />
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
