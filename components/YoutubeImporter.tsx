import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import IntroVideoMaker from './IntroVideoMaker';

// ── Session persistence ───────────────────────────────────────────────────────
const YT_STORAGE_KEY = 'yt_importer_v1';
function readSaved<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(YT_STORAGE_KEY);
    if (!raw) return fallback;
    const obj = JSON.parse(raw);
    return key in obj ? (obj[key] as T) : fallback;
  } catch { return fallback; }
}
import {
  Youtube,
  Download,
  FileText,
  ChevronRight,
  Scissors,
  Rows3,
  CheckCircle,
  Loader2,
  AlertCircle,
  SkipForward,
  Server,
  MessageSquare,
  Video,
  Edit3,
  ChevronDown,
  ChevronUp,
  X,
  FileCheck,
  Upload,
  Mic,
} from 'lucide-react';
import { YoutubeImportData } from '../types';
import { transcribeAudioGoogleCloud } from '../services/googleCloudService';
import { splitTranscriptByTopics, TranscriptChunk } from '../services/geminiService';

interface Props {
  onImportDone: (data: YoutubeImportData) => void;
  onAttachContext?: (content: string, fileName: string) => void;
  onTranscriptFetched?: (transcript: YoutubeImportData['transcript'], fullText: string, videoId: string) => void;
  onSkip: () => void;
}

const DEFAULT_FLASK_URL = '';
const DEFAULT_SEG_ZOOM = { zoom: 1.0, panX: 0, panY: 0 };
type Tab = 'transcript' | 'comments' | 'video' | 'stt';
type BlackBars = 'none' | 'top_bottom' | 'sides' | 'both';

// ── Helper: trigger browser download of text ──────────────────────────────────
function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Reusable error box ────────────────────────────────────────────────────────
const ErrBox = ({ msg, code, availableLangs }: { msg: string; code?: string; availableLangs?: {code: string; name: string; auto: boolean}[] }) => {
  const tips: Record<string, string> = {
    TRANSCRIPTS_DISABLED: 'Try a different video that has captions enabled.',
    VIDEO_UNAVAILABLE: 'Make sure the video is public and accessible.',
    RATE_LIMITED: 'Wait 1-2 minutes and try again.',
    AGE_RESTRICTED: 'Age-restricted videos cannot be accessed without login.',
    MISSING_DEPENDENCY: 'On Flask server run: pip install youtube-transcript-api',
    INVALID_URL: 'Copy the URL directly from the YouTube address bar.',
    CONNECTION_ERROR: 'Make sure the "Flask Server" workflow is running.',
    NO_TRANSCRIPT: 'Try a video with captions, or use the manual transcript editor.',
  };
  const tip = code ? tips[code] : null;
  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mt-2 space-y-2">
      <div className="flex items-start gap-2 text-red-400 text-xs">
        <AlertCircle size={13} className="mt-0.5 shrink-0" />
        <span>{msg}</span>
      </div>
      {tip && (
        <div className="text-[11px] text-yellow-400/80 pl-5">💡 {tip}</div>
      )}
      {availableLangs && availableLangs.length > 0 && (
        <div className="pl-5 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Available languages on this video:</p>
          <div className="flex flex-wrap gap-1">
            {availableLangs.map(l => (
              <span key={l.code} className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full border border-white/5">
                {l.name} ({l.code}){l.auto ? ' · auto' : ' · manual'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Section wrapper ───────────────────────────────────────────────────────────
const Section = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`bg-[#0f0f0f] border border-white/5 rounded-2xl p-4 space-y-3 ${className}`}>
    {children}
  </div>
);

// Safe JSON parser — shows a clear message when Flask returns HTML instead of JSON
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (text.trimStart().startsWith('<')) {
      throw new Error('Server returned HTML instead of JSON. Try restarting the Flask Server workflow.');
    }
    throw new Error(text.slice(0, 200) || 'Invalid response from server');
  }
}

const YoutubeImporter: React.FC<Props> = ({ onImportDone, onAttachContext, onTranscriptFetched, onSkip }) => {
  const [flaskUrl, setFlaskUrl] = useState(DEFAULT_FLASK_URL);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [url, setUrl] = useState(() => readSaved('url', ''));
  const [activeTab, setActiveTab] = useState<Tab>(() => readSaved<Tab>('activeTab', 'transcript'));

  // ── Transcript ──────────────────────────────────────────────────────────────
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcript, setTranscript] = useState<YoutubeImportData['transcript'] | null>(() => readSaved('transcript', null));
  const [fullText, setFullText] = useState(() => readSaved('fullText', ''));
  const [videoId, setVideoId] = useState(() => readSaved('videoId', ''));

  // On mount: if transcript already exists from sessionStorage, sync to App immediately
  useEffect(() => {
    const saved = readSaved<YoutubeImportData['transcript'] | null>('transcript', null);
    const savedFullText = readSaved('fullText', '');
    const savedVideoId = readSaved('videoId', '');
    if (saved && saved.length > 0) {
      onTranscriptFetched?.(saved, savedFullText, savedVideoId);
    }
  }, []);
  const [transcriptError, setTranscriptError] = useState('');
  const [transcriptErrorCode, setTranscriptErrorCode] = useState('');
  const [transcriptAvailableLangs, setTranscriptAvailableLangs] = useState<{code: string; name: string; auto: boolean}[]>([]);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [transcriptLang, setTranscriptLang] = useState(() => readSaved('transcriptLang', ''));
  const [videoTitle, setVideoTitle] = useState(() => readSaved('videoTitle', ''));
  const [videoDescription, setVideoDescription] = useState(() => readSaved('videoDescription', ''));
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [attachedLabel, setAttachedLabel] = useState<string | null>(null);

  const handleGetTranscript = async () => {
    if (!url.trim()) return;
    setTranscriptLoading(true);
    setTranscriptError('');
    setTranscriptErrorCode('');
    setTranscriptAvailableLangs([]);
    setTranscript(null);
    try {
      const res = await fetch(`${flaskUrl}/api/youtube/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setTranscriptErrorCode(data.error_code || '');
        setTranscriptAvailableLangs(data.available_languages || []);
        throw new Error(data.error || 'Transcript fetch failed');
      }
      setTranscript(data.segments);
      setFullText(data.full_text);
      setVideoId(data.video_id);
      setTranscriptLang(data.language || '');
      setVideoTitle(data.title || '');
      setVideoDescription(data.description || '');
      onTranscriptFetched?.(data.segments, data.full_text, data.video_id);
    } catch (e: any) {
      if (!e.message?.includes('fetch')) {
        setTranscriptError(e.message || 'Something went wrong. Please try again.');
      } else {
        setTranscriptError('Could not connect to Flask server. Please start the "Flask Server" workflow.');
        setTranscriptErrorCode('CONNECTION_ERROR');
      }
    } finally {
      setTranscriptLoading(false);
    }
  };

  // Memoized: only recomputes when transcript data or toggle changes
  const displayText = useMemo(() => {
    if (!transcript) return '';
    if (!showTimestamps) return fullText;
    return transcript.map(s => {
      const mins = Math.floor(s.start / 60).toString().padStart(2, '0');
      const secs = Math.floor(s.start % 60).toString().padStart(2, '0');
      return `[${mins}:${secs}] ${s.text}`;
    }).join('\n');
  }, [transcript, showTimestamps, fullText]);

  // For collapsed preview — only first 1200 chars to keep DOM tiny
  const previewText = useMemo(() => displayText.slice(0, 1200), [displayText]);

  const getTranscriptDisplayText = () => displayText;

  const downloadTranscript = () => {
    const body = getTranscriptDisplayText();
    if (!body) return;
    const suffix = showTimestamps ? '_timestamps' : '';
    const headerLines: string[] = [];
    if (url) headerLines.push(`Video: ${url}`);
    if (videoTitle) headerLines.push(`Title: ${videoTitle}`);
    if (videoDescription) headerLines.push(`Description:\n${videoDescription}`);
    const header = headerLines.length > 0 ? headerLines.join('\n') + '\n\n' + '─'.repeat(60) + '\n\n' : '';
    downloadTextFile(header + body, `transcript_${videoId || 'video'}${suffix}.txt`);
  };

  // ── Google Speech-to-Text ─────────────────────────────────────────────────────
  const [sttFile, setSttFile] = useState<File | null>(null);
  const [sttLoading, setSttLoading] = useState(false);
  const [sttError, setSttError] = useState('');
  const [sttProgress, setSttProgress] = useState('');
  const [sttLang, setSttLang] = useState<'hi-IN' | 'en-US' | 'ur-PK'>('hi-IN');
  const sttFileInputRef = useRef<HTMLInputElement>(null);

  const wordTimingsToSegments = (words: { word: string; start: number; end: number }[]): YoutubeImportData['transcript'] => {
    if (!words.length) return [];
    const segments: YoutubeImportData['transcript'] = [];
    const WORDS_PER_SEG = 10;
    for (let i = 0; i < words.length; i += WORDS_PER_SEG) {
      const chunk = words.slice(i, i + WORDS_PER_SEG);
      const text = chunk.map(w => w.word).join(' ');
      const start = chunk[0].start;
      const end = chunk[chunk.length - 1].end;
      segments.push({ text, start, end, duration: end - start });
    }
    return segments;
  };

  const handleSpeechToText = async () => {
    if (!sttFile) return;
    setSttLoading(true);
    setSttError('');
    setSttProgress('Reading file…');
    setTranscript(null);
    try {
      const blob = new Blob([await sttFile.arrayBuffer()], { type: sttFile.type || 'audio/wav' });
      setSttProgress('Sending to Google Speech-to-Text (chunked)…');
      const wordTimings = await transcribeAudioGoogleCloud(blob, sttLang);
      if (!wordTimings.length) throw new Error('No speech detected in the audio.');
      setSttProgress('Building transcript…');
      const segs = wordTimingsToSegments(wordTimings);
      const text = segs.map(s => s.text).join(' ');
      setTranscript(segs);
      setFullText(text);
      setVideoId(sttFile.name.replace(/\.[^.]+$/, ''));
      setTranscriptLang(sttLang);
      setVideoTitle(sttFile.name);
      setVideoDescription('');
      onTranscriptFetched?.(segs, text, sttFile.name);
    } catch (e: any) {
      setSttError(e.message || 'Speech transcription failed.');
    } finally {
      setSttLoading(false);
      setSttProgress('');
    }
  };

  // ── Topic Split ───────────────────────────────────────────────────────────────
  const [splitChunks, setSplitChunks] = useState<TranscriptChunk[]>([]);
  const [splitLoading, setSplitLoading] = useState(false);
  const [splitError, setSplitError] = useState('');
  const [attachedChunkIdx, setAttachedChunkIdx] = useState<number | null>(null);

  const handleTopicSplit = async () => {
    if (!transcript || !transcript.length) return;
    setSplitLoading(true);
    setSplitError('');
    setSplitChunks([]);
    setAttachedChunkIdx(null);
    try {
      const chunks = await splitTranscriptByTopics(transcript);
      setSplitChunks(chunks);
    } catch (e: any) {
      setSplitError(e.message || 'Split failed. Please try again.');
    } finally {
      setSplitLoading(false);
    }
  };

  const attachChunk = (chunk: TranscriptChunk, idx: number) => {
    const header = `[${fmtTime(chunk.start)} – ${fmtTime(chunk.end)}] ${chunk.title}\n\n`;
    onAttachContext?.(header + chunk.text, chunk.title);
    setAttachedChunkIdx(idx);
  };

  // ── Cookies ──────────────────────────────────────────────────────────────────
  const [hasCookies, setHasCookies] = useState<boolean | null>(null);
  const [cookiesUploading, setCookiesUploading] = useState(false);
  const cookiesInputRef = useRef<HTMLInputElement>(null);

  const checkCookies = async () => {
    try {
      const r = await fetch(`${flaskUrl}/api/health`);
      const d = await safeJson(r);
      setHasCookies(!!d.cookies);
    } catch { setHasCookies(false); }
  };

  const handleCookiesUpload = async (file: File) => {
    setCookiesUploading(true);
    try {
      const content = await file.text();
      const r = await fetch(`${flaskUrl}/api/cookies/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const d = await safeJson(r);
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      setHasCookies(true);
      alert(`✅ Cookies saved! (${Math.round(d.size / 1024)}KB)\nAll future requests will use these cookies.`);
    } catch (e: any) {
      alert('❌ ' + (e.message || 'Upload failed'));
    } finally {
      setCookiesUploading(false);
    }
  };

  const handleCookiesDelete = async () => {
    if (!confirm('Delete saved YouTube cookies?')) return;
    try {
      await fetch(`${flaskUrl}/api/cookies/delete`, { method: 'POST' });
      setHasCookies(false);
    } catch { alert('Failed to delete cookies'); }
  };

  // ── Comments ─────────────────────────────────────────────────────────────────
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [comments, setComments] = useState<string[] | null>(() => readSaved('comments', null));
  const [commentsError, setCommentsError] = useState('');
  const [showAllComments, setShowAllComments] = useState(false);
  const [maxComments, setMaxComments] = useState<500 | 5000 | 'all'>(() => readSaved<500 | 5000 | 'all'>('maxComments', 500));
  const [showIntroMaker, setShowIntroMaker] = useState(false);

  const handleGetComments = async () => {
    if (!url.trim()) return;
    setCommentsLoading(true);
    setCommentsError('');
    setComments(null);
    try {
      const res = await fetch(`${flaskUrl}/api/youtube/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, max_comments: maxComments }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Comments fetch failed');
      setComments(data.comments);
    } catch (e: any) {
      setCommentsError(e.message || 'Could not connect to Flask server.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const downloadComments = () => {
    if (!comments || comments.length === 0) return;
    // Pointwise, no author names, no metadata
    const content = comments.map((c, i) => `• ${c}`).join('\n\n');
    downloadTextFile(content, `comments_${videoId || 'video'}.txt`);
  };

  // ── Video Download ────────────────────────────────────────────────────────────
  const [quality, setQuality] = useState<'360' | '480' | '720' | '1080'>(() => readSaved<'360' | '480' | '720' | '1080'>('quality', '720'));
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadedFilename, setDownloadedFilename] = useState(() => readSaved('downloadedFilename', ''));
  const [downloadError, setDownloadError] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [downloadEta, setDownloadEta] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear interval on unmount to prevent network/memory leak
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPoll = useCallback(
    (jobId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${flaskUrl}/api/youtube/download/status/${jobId}`);
          const data = await safeJson(res);
          if (data.status === 'downloading') {
            if (typeof data.progress === 'number') setDownloadProgress(data.progress);
            if (data.speed) setDownloadSpeed(data.speed);
            if (data.eta) setDownloadEta(data.eta);
          } else if (data.status === 'done') {
            clearInterval(pollRef.current!);
            setDownloadProgress(100);
            setDownloadLoading(false);
            setDownloadedFilename(data.filename);
          } else if (data.status === 'error') {
            clearInterval(pollRef.current!);
            setDownloadLoading(false);
            setDownloadError(data.error || 'Download failed');
          }
        } catch {
          // network glitch, keep polling
        }
      }, 1500);
    },
    [flaskUrl]
  );

  const handleDownload = async () => {
    if (!url.trim()) return;
    setDownloadLoading(true);
    setDownloadError('');
    setDownloadedFilename('');
    setDownloadProgress(0);
    setDownloadSpeed('');
    setDownloadEta('');
    try {
      const res = await fetch(`${flaskUrl}/api/youtube/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, quality }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Download start failed');
      if (data.status === 'done') {
        setDownloadLoading(false);
        setDownloadedFilename(data.filename);
      } else {
        startPoll(data.job_id);
      }
    } catch (e: any) {
      setDownloadLoading(false);
      setDownloadError(e.message || 'Download could not start.');
    }
  };

  // ── Pro Editor ────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const miniMapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<boolean>(false);
  const miniDraggingRef = useRef<boolean>(false);
  // Per-segment zoom: key = segment index, value = {zoom, panX, panY}
  const [segmentZooms, setSegmentZooms] = useState<Record<number, {zoom: number; panX: number; panY: number}>>(() => readSaved('segmentZooms', {}));
  const [blackBars, setBlackBars] = useState<BlackBars>(() => readSaved<BlackBars>('blackBars', 'none'));
  const [editLoading, setEditLoading] = useState(false);
  const [editedFilename, setEditedFilename] = useState(() => readSaved('editedFilename', ''));
  const [editError, setEditError] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [cutPoints, setCutPoints] = useState<number[]>(() => readSaved('cutPoints', []));
  const [previewSegIdx, setPreviewSegIdx] = useState(0);
  const [skippedSegs, setSkippedSegs] = useState<number[]>(() => readSaved('skippedSegs', []));
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(() => readSaved('timelineZoom', 1));
  const [timelineOffset, setTimelineOffset] = useState(0);
  const [skipSecs, setSkipSecs] = useState(() => readSaved('skipSecs', 2));
  const [tapFlash, setTapFlash] = useState<'left' | 'right' | null>(null);

  // Derive segments from cutPoints
  const allPoints = [0, ...cutPoints.slice().sort((a, b) => a - b), videoDuration > 0 ? videoDuration : 0];
  const segments = allPoints.slice(0, -1).map((s, i) => ({ start: s, end: allPoints[i + 1], idx: i }));

  // Kept segments (all except skipped)
  const keptSegs = segments.filter(s => !skippedSegs.includes(s.idx));

  // cuts for export/backward compat — only if we're actually removing something
  const cuts = keptSegs.length > 0 && keptSegs.length < segments.length
    ? keptSegs.map(s => ({ start: s.start, end: s.end }))
    : [];

  // ── Current segment zoom helpers ──────────────────────────────────────────
  const curSeg = segmentZooms[previewSegIdx] ?? DEFAULT_SEG_ZOOM;
  const setCurZoom = (z: number) => setSegmentZooms(prev => ({ ...prev, [previewSegIdx]: { ...(prev[previewSegIdx] ?? DEFAULT_SEG_ZOOM), zoom: Math.max(1, Math.min(3, parseFloat(z.toFixed(2)))) } }));
  const setCurPanX = (x: number) => setSegmentZooms(prev => ({ ...prev, [previewSegIdx]: { ...(prev[previewSegIdx] ?? DEFAULT_SEG_ZOOM), panX: Math.max(-50, Math.min(50, x)) } }));
  const setCurPanY = (y: number) => setSegmentZooms(prev => ({ ...prev, [previewSegIdx]: { ...(prev[previewSegIdx] ?? DEFAULT_SEG_ZOOM), panY: Math.max(-50, Math.min(50, y)) } }));
  const resetCurSeg = () => setSegmentZooms(prev => { const n = { ...prev }; delete n[previewSegIdx]; return n; });

  // ── Persist state to sessionStorage so switching sections doesn't wipe data ──
  useEffect(() => {
    try {
      sessionStorage.setItem(YT_STORAGE_KEY, JSON.stringify({
        url, activeTab,
        transcript, fullText, videoId, transcriptLang,
        videoTitle, videoDescription,
        comments, maxComments,
        downloadedFilename, quality,
        editedFilename,
        segmentZooms, blackBars,
        cutPoints, skippedSegs,
        timelineZoom, skipSecs,
      }));
    } catch { /* quota exceeded or private browsing */ }
  }, [
    url, activeTab,
    transcript, fullText, videoId, transcriptLang,
    videoTitle, videoDescription,
    comments, maxComments,
    downloadedFilename, quality,
    editedFilename,
    segmentZooms, blackBars,
    cutPoints, skippedSegs,
    timelineZoom, skipSecs,
  ]);

  const toggleSkip = (idx: number) => {
    setSkippedSegs(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleVideoLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    const dur = v.duration;
    if (!isFinite(dur) || dur === 0) return;
    setVideoDuration(dur);
    setCutPoints([]);
    setPreviewSegIdx(0);
    setSkippedSegs([]);
    setTimelineZoom(1);
    setTimelineOffset(0);
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  const seekTo = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const skipBy = (secs: number) => {
    if (videoDuration <= 0) return;
    const next = Math.max(0, Math.min(videoDuration, currentTime + secs));
    seekTo(next);
  };

  const handleVideoTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    if (xPct < 0.3) {
      skipBy(-skipSecs);
      setTapFlash('left');
      setTimeout(() => setTapFlash(null), 400);
    } else if (xPct > 0.7) {
      skipBy(skipSecs);
      setTapFlash('right');
      setTimeout(() => setTapFlash(null), 400);
    } else {
      togglePlay();
    }
  };

  // Timeline window helpers
  const tlWindowDur = videoDuration > 0 ? videoDuration / timelineZoom : 1;
  const tlMaxOffset = Math.max(0, videoDuration - tlWindowDur);
  const tlOffset = Math.min(timelineOffset, tlMaxOffset);

  // Convert a time value → left% position on current timeline view
  const tToTl = (t: number) => ((t - tlOffset) / tlWindowDur) * 100;

  // Timeline: click or drag anywhere → seek playhead
  const getTimelineT = (clientX: number) => {
    if (!timelineRef.current || videoDuration <= 0) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.max(0, Math.min(videoDuration, tlOffset + pct * tlWindowDur));
  };

  // Auto-scroll timeline window when playhead goes out of view
  React.useEffect(() => {
    if (timelineZoom <= 1 || videoDuration <= 0) return;
    const margin = tlWindowDur * 0.1;
    if (currentTime < tlOffset + margin) {
      setTimelineOffset(Math.max(0, currentTime - margin));
    } else if (currentTime > tlOffset + tlWindowDur - margin) {
      setTimelineOffset(Math.min(tlMaxOffset, currentTime - tlWindowDur + margin));
    }
  }, [currentTime, timelineZoom]);

  const handleTimelinePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seekTo(getTimelineT(e.clientX));
  };

  const handleTimelinePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    seekTo(getTimelineT(e.clientX));
  };

  const handleTimelinePointerUp = () => { draggingRef.current = false; };

  // Minimap drag — scrolls timeline window
  const getMiniMapOffset = (clientX: number) => {
    if (!miniMapRef.current || videoDuration <= 0) return 0;
    const rect = miniMapRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.max(0, Math.min(tlMaxOffset, pct * videoDuration - tlWindowDur / 2));
  };
  const handleMiniPointerDown = (e: React.PointerEvent) => {
    miniDraggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setTimelineOffset(getMiniMapOffset(e.clientX));
  };
  const handleMiniPointerMove = (e: React.PointerEvent) => {
    if (!miniDraggingRef.current) return;
    setTimelineOffset(getMiniMapOffset(e.clientX));
  };
  const handleMiniPointerUp = () => { miniDraggingRef.current = false; };

  // Add cut at current playhead position
  const handleAddCut = () => {
    if (videoDuration <= 0 || currentTime <= 0.1 || currentTime >= videoDuration - 0.1) return;
    const tooClose = cutPoints.some(p => Math.abs(p - currentTime) < 0.3);
    if (tooClose) return;
    const newCuts = [...cutPoints, currentTime].sort((a, b) => a - b);
    setCutPoints(newCuts);
    const allPts = [0, ...newCuts, videoDuration];
    let idx = 0;
    for (let i = 0; i < allPts.length - 1; i++) {
      if (currentTime >= allPts[i] && currentTime < allPts[i + 1]) { idx = i; break; }
    }
    setPreviewSegIdx(idx);
  };

  // Remove a cut marker
  const handleRemoveCut = (pt: number) => {
    const newCuts = cutPoints.filter(p => Math.abs(p - pt) > 0.01);
    setCutPoints(newCuts);
    setPreviewSegIdx(0);
    setSkippedSegs([]);
  };

  const handleEditVideo = async () => {
    if (!downloadedFilename) return;
    setEditLoading(true);
    setEditError('');
    setEditedFilename('');
    try {
      // Build cuts array with per-segment zoom/pan
      const cutsWithZoom = keptSegs.length > 0 && keptSegs.length < segments.length
        ? keptSegs.map(s => {
            const sz = segmentZooms[s.idx];
            return {
              start: s.start, end: s.end,
              ...(sz && sz.zoom !== 1.0 ? { zoom: sz.zoom } : {}),
              ...(sz && sz.panX !== 0 ? { pan_x: sz.panX } : {}),
              ...(sz && sz.panY !== 0 ? { pan_y: sz.panY } : {}),
            };
          })
        : undefined;

      // Global zoom from segment 0 (when no cuts)
      const globalSz = segmentZooms[0] ?? DEFAULT_SEG_ZOOM;

      const res = await fetch(`${flaskUrl}/api/video/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: downloadedFilename,
          cuts: cutsWithZoom,
          zoom: !cutsWithZoom && globalSz.zoom !== 1.0 ? globalSz.zoom : undefined,
          pan_x: !cutsWithZoom && globalSz.panX !== 0 ? globalSz.panX : undefined,
          pan_y: !cutsWithZoom && globalSz.panY !== 0 ? globalSz.panY : undefined,
          black_bars: blackBars !== 'none' ? blackBars : undefined,
          output_name: `edited_${downloadedFilename}`,
        }),
      });
      // Safe JSON parse — Flask might return HTML if down
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); }
      catch { throw new Error(text.startsWith('<') ? 'Server returned HTML instead of JSON. Is Flask Server running?' : text.slice(0, 200)); }
      if (!res.ok) throw new Error(data.error || 'Edit failed');
      setEditedFilename(data.filename);
    } catch (e: any) {
      setEditError(e.message || 'Video edit failed');
    } finally {
      setEditLoading(false);
    }
  };

  // ── Done/Skip ──────────────────────────────────────────────────────────────────
  const canProceed = transcript !== null || downloadedFilename !== '';
  const handleDone = () => {
    onImportDone({
      url,
      videoId,
      transcript: transcript || [],
      fullText,
      downloadedFilename: downloadedFilename || undefined,
      editedFilename: editedFilename || undefined,
      cuts: cuts.length > 0 ? cuts : undefined,
      zoom: Object.keys(segmentZooms).length > 0 ? segmentZooms[0]?.zoom : undefined,
      blackBars: blackBars !== 'none' ? blackBars : undefined,
      flaskUrl,
      videoTitle: videoTitle || undefined,
      videoDescription: videoDescription || undefined,
    });
  };

  const showAttached = (label: string) => {
    setAttachedLabel(label);
    setTimeout(() => setAttachedLabel(null), 3000);
  };

  const handleSendTranscriptAsContext = () => {
    const content = displayText;
    if (!content) return;
    const suffix = showTimestamps ? '_timestamps' : '';
    const fileName = `transcript_${videoId || 'video'}${suffix}.txt`;
    if (onAttachContext) {
      onAttachContext(content, fileName);
    }
    showAttached('Transcript attached!');
  };

  const handleSendCommentsAsContext = () => {
    if (!comments || comments.length === 0) return;
    const content = comments.map((c) => `• ${c}`).join('\n\n');
    const fileName = `comments_${videoId || 'video'}.txt`;
    if (onAttachContext) {
      onAttachContext(content, fileName);
    }
    showAttached('Comments attached!');
  };

  // ── Tab config ────────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'transcript', label: 'Transcript', icon: <FileText size={16} /> },
    { id: 'comments', label: 'Comments', icon: <MessageSquare size={16} /> },
    {
      id: 'video',
      label: 'Video',
      icon: <Video size={16} />,
      badge: downloadedFilename ? '✓' : undefined,
    },
    {
      id: 'stt',
      label: 'STT',
      icon: <Mic size={16} />,
    },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 flex flex-col">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 bg-[#050505]/95 backdrop-blur-xl border-b border-white/5 px-4 pt-4 pb-3 space-y-3">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-red-600/20 rounded-xl flex items-center justify-center shrink-0">
              <Youtube size={16} className="text-red-500" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">YouTube Import</h1>
              <p className="text-[10px] text-gray-600 leading-tight">Transcript · Comments · Video · STT</p>
            </div>
          </div>
          <button
            onClick={onSkip}
            className="flex items-center gap-1 text-gray-500 active:text-gray-300 text-xs py-2 px-3 rounded-xl border border-white/5 active:border-white/10 transition-colors"
          >
            Skip →
          </button>
        </div>

        {/* URL input */}
        <div className="flex gap-2">
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="youtube.com/watch?v=..."
            className="flex-1 min-w-0 bg-[#111] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/40"
          />
        </div>

        {/* Server config toggle */}
        <button
          onClick={() => setShowServerConfig(!showServerConfig)}
          className="flex items-center gap-1.5 text-[11px] text-gray-600 active:text-gray-400"
        >
          <Server size={11} />
          <span className="truncate max-w-[200px]">{flaskUrl}</span>
          {showServerConfig ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>

        {showServerConfig && (
          <>
          <div className="flex gap-2 pb-1">
            <input
              type="url"
              inputMode="url"
              value={flaskUrl}
              onChange={(e) => setFlaskUrl(e.target.value)}
              placeholder="http://192.168.x.x:5000"
              className="flex-1 bg-[#111] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-purple-500/40"
            />
            <button
              onClick={async () => {
                try {
                  const r = await fetch(`${flaskUrl}/api/health`);
                  const d = await safeJson(r);
                  setHasCookies(!!d.cookies);
                  alert(
                    `✅ Connected!\nTranscript API: ${d.transcript_api ? 'Ready' : '❌ pip install youtube-transcript-api'}\nCookies: ${d.cookies ? `✅ Active (${Math.round(d.cookies_size/1024)}KB)` : '❌ Not set'}`
                  );
                } catch {
                  alert('❌ Could not connect to server.\nIs Flask Server workflow running?');
                }
              }}
              className="shrink-0 px-3 py-2 bg-purple-600/20 active:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-xl text-xs"
            >
              Test
            </button>
          </div>

          {/* ── Cookies Section ─────────────────────────────────────────────── */}
          <div className="mt-2 p-3 rounded-xl bg-[#0f0f0f] border border-white/8 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-gray-300">YouTube Cookies</span>
                {hasCookies === true && (
                  <span className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">✓ Active</span>
                )}
                {hasCookies === false && (
                  <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">Not set</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <button onClick={checkCookies} className="text-[10px] text-gray-600 active:text-gray-300 px-2 py-1 rounded-lg border border-white/5">
                  Check
                </button>
                {hasCookies && (
                  <button onClick={handleCookiesDelete} className="text-[10px] text-red-500/70 active:text-red-400 px-2 py-1 rounded-lg border border-red-500/20">
                    Delete
                  </button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-gray-600 leading-relaxed">
              Fix "Sign in to confirm you're not a bot" error. Export cookies from Chrome using the
              {' '}<span className="text-gray-400 font-medium">Get cookies.txt LOCALLY</span> extension, then upload here.
            </p>
            <input
              ref={cookiesInputRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCookiesUpload(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => cookiesInputRef.current?.click()}
              disabled={cookiesUploading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 active:bg-yellow-500/20 disabled:opacity-50 transition-all"
            >
              {cookiesUploading ? <><Loader2 size={13} className="animate-spin" /> Uploading...</> : <><Upload size={13} /> {hasCookies ? 'Replace' : 'Upload'} cookies.txt</>}
            </button>
          </div>
          </>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 bg-[#111] rounded-xl p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all relative ${
                activeTab === t.id
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 active:text-gray-300'
              }`}
            >
              {t.icon}
              <span className="hidden xs:inline">{t.label}</span>
              {t.badge && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full text-[8px] flex items-center justify-center text-black font-bold">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-32">

        {/* ── TRANSCRIPT TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'transcript' && (
          <>
            <Section>
              <p className="text-xs text-gray-500">
                Auto-detects language. Works with most videos that have captions enabled.
              </p>

              <button
                onClick={handleGetTranscript}
                disabled={transcriptLoading || !url.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-blue-600/20 active:bg-blue-600/30 border border-blue-500/30 text-blue-300 disabled:opacity-40 transition-all"
              >
                {transcriptLoading ? (
                  <><Loader2 size={15} className="animate-spin" /> Fetching...</>
                ) : (
                  <><FileText size={15} /> Get Transcript</>
                )}
              </button>
              {transcriptError && <ErrBox msg={transcriptError} code={transcriptErrorCode} availableLangs={transcriptAvailableLangs} />}
            </Section>

            {transcript && (
              <Section>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-400 text-sm font-semibold flex-wrap">
                    <CheckCircle size={15} />
                    {transcript.length} segments
                    {transcriptLang && (
                      <span className="text-[10px] bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full font-normal border border-green-500/20">
                        🌐 {transcriptLang === 'hi' || transcriptLang === 'hi-IN' ? 'Hindi' : transcriptLang === 'en' || transcriptLang.startsWith('en') ? 'English' : transcriptLang === 'ur' ? 'Urdu' : transcriptLang}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={downloadTranscript}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600/20 active:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-lg"
                  >
                    <Download size={12} />
                    .txt Download
                  </button>
                </div>

                {/* Timestamps toggle */}
                <div className="flex bg-[#111] p-0.5 rounded-xl border border-white/5">
                  <button
                    onClick={() => setShowTimestamps(false)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                      !showTimestamps ? 'bg-white/10 text-white' : 'text-gray-500'
                    }`}
                  >
                    Without Timestamps
                  </button>
                  <button
                    onClick={() => setShowTimestamps(true)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                      showTimestamps ? 'bg-white/10 text-white' : 'text-gray-500'
                    }`}
                  >
                    With Timestamps
                  </button>
                </div>

                {/* Preview */}
                <div
                  className={`bg-black/30 rounded-xl p-3 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap ${
                    showFullTranscript ? 'max-h-[60vh] overflow-y-auto' : 'max-h-28 overflow-hidden'
                  }`}
                >
                  {showFullTranscript ? displayText : previewText}
                  {!showFullTranscript && displayText.length > 1200 && (
                    <span className="text-gray-600">…</span>
                  )}
                </div>
                <button
                  onClick={() => setShowFullTranscript(v => !v)}
                  className="text-[11px] text-gray-600 active:text-gray-400 flex items-center gap-1"
                >
                  {showFullTranscript ? (
                    <><ChevronUp size={11} /> Collapse</>
                  ) : (
                    <><ChevronDown size={11} /> Show full ({Math.round(displayText.length / 1000)}K chars)</>
                  )}
                </button>

                {/* Attach to context button */}
                <button
                  onClick={handleSendTranscriptAsContext}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border transition-all ${
                    attachedLabel === 'Transcript attached!'
                      ? 'bg-green-600/20 border-green-500/40 text-green-300'
                      : 'bg-gradient-to-r from-purple-600/20 to-blue-600/20 active:from-purple-600/30 active:to-blue-600/30 border-purple-500/40 text-purple-300'
                  }`}
                >
                  <FileCheck size={15} />
                  {attachedLabel === 'Transcript attached!' ? '✓ Transcript Attached!' : 'Attach Transcript → Script Context'}
                </button>
              </Section>
            )}

            {/* ── TOPIC SPLIT SYSTEM (Transcript tab) ── */}
            {transcript && transcript.length > 0 && (
              <Section>
                <div className="flex items-center gap-2">
                  <Scissors size={15} className="text-orange-400" />
                  <span className="text-sm font-semibold text-orange-300">Topic-wise Split</span>
                  <span className="text-[10px] text-gray-600 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">Gemini Flash</span>
                </div>
                <p className="text-xs text-gray-500">
                  Split transcript by topic — each part under 8 min. Attach any section directly to script context.
                </p>
                <button
                  onClick={handleTopicSplit}
                  disabled={splitLoading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-orange-600/15 active:bg-orange-600/25 border border-orange-500/25 text-orange-300 disabled:opacity-40 transition-all"
                >
                  {splitLoading ? (
                    <><Loader2 size={15} className="animate-spin" /> Splitting by topics…</>
                  ) : (
                    <><Scissors size={15} /> Split by Topics</>
                  )}
                </button>
                {splitError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-red-400 text-xs">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>{splitError}</span>
                  </div>
                )}
                {splitChunks.length > 0 && (
                  <div className="space-y-2">
                    {/* Numbered summary strip */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {splitChunks.map((chunk, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-orange-500/10 border border-orange-500/20 text-orange-300 px-2 py-1 rounded-lg font-mono whitespace-nowrap"
                        >
                          {idx + 1}. {fmtTime(chunk.start)} – {fmtTime(chunk.end)}
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-600 uppercase tracking-wider">{splitChunks.length} segments found</p>
                    {splitChunks.map((chunk, idx) => {
                      const dur = chunk.end - chunk.start;
                      const durMin = Math.floor(dur / 60);
                      const durSec = Math.floor(dur % 60);
                      const isAttached = attachedChunkIdx === idx;
                      return (
                        <div
                          key={idx}
                          className={`rounded-xl border p-3 space-y-2 transition-all ${isAttached ? 'border-green-500/40 bg-green-500/5' : 'border-white/8 bg-white/3'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-200 leading-snug">{chunk.title}</p>
                              <p className="text-[10px] text-gray-600 mt-0.5">
                                {fmtTime(chunk.start)} – {fmtTime(chunk.end)}
                                <span className="ml-2 text-orange-400/70">{durMin}m {durSec}s</span>
                              </p>
                            </div>
                            <button
                              onClick={() => attachChunk(chunk, idx)}
                              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                                isAttached
                                  ? 'bg-green-600/20 border-green-500/40 text-green-300'
                                  : 'bg-blue-600/15 active:bg-blue-600/25 border-blue-500/25 text-blue-300'
                              }`}
                            >
                              <FileCheck size={11} />
                              {isAttached ? '✓ Attached' : 'Attach'}
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
                            {chunk.text.slice(0, 140)}{chunk.text.length > 140 ? '…' : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            )}
          </>
        )}

        {/* ── COMMENTS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'comments' && (
          <>
            <Section>
              <p className="text-xs text-gray-500">
                Fetch top comments from a YouTube video (text only, no author info). More comments = slower.
              </p>

              {/* Max comments selector */}
              <div>
                <label className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5 block">Max Comments</label>
                <div className="grid grid-cols-3 gap-2">
                  {([500, 5000, 'all'] as const).map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => setMaxComments(v)}
                      className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                        maxComments === v
                          ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                          : 'bg-white/5 border-white/8 text-gray-500 active:text-gray-300'
                      }`}
                    >
                      {v === 'all' ? 'All' : v >= 1000 ? `${v/1000}K` : v}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-700 mt-1">
                  {maxComments === 'all' ? '⚠️ "All" can be very slow (3-5 min)' : maxComments === 5000 ? '~1-2 minutes' : '~30 seconds'}
                </p>
              </div>

              <button
                onClick={handleGetComments}
                disabled={commentsLoading || !url.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-purple-600/20 active:bg-purple-600/30 border border-purple-500/30 text-purple-300 disabled:opacity-40 transition-all"
              >
                {commentsLoading ? (
                  <><Loader2 size={15} className="animate-spin" /> Fetching Comments...</>
                ) : (
                  <><MessageSquare size={15} /> Get {maxComments === 'all' ? 'All' : maxComments >= 1000 ? `${maxComments/1000}K` : maxComments} Comments</>
                )}
              </button>
              {commentsError && <ErrBox msg={commentsError} />}
            </Section>

            {comments && (
              <Section>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-purple-400 text-sm font-semibold">
                    <CheckCircle size={15} />
                    {comments.length} comments
                  </div>
                  <button
                    onClick={downloadComments}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-600/20 active:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-lg"
                  >
                    <Download size={12} />
                    .txt Download
                  </button>
                </div>

                {/* Comments list */}
                <div
                  className={`space-y-2 overflow-hidden transition-all ${
                    showAllComments ? 'max-h-[60vh] overflow-y-auto' : 'max-h-52 overflow-hidden'
                  }`}
                >
                  {comments.map((c, i) => (
                    <div
                      key={i}
                      className="flex gap-2 text-xs text-gray-300 leading-relaxed bg-black/20 rounded-xl px-3 py-2"
                    >
                      <span className="text-gray-700 shrink-0 mt-0.5">•</span>
                      <span>{c}</span>
                    </div>
                  ))}
                </div>

                {!showAllComments && comments.length > 5 && (
                  <button
                    onClick={() => setShowAllComments(true)}
                    className="text-[11px] text-gray-600 active:text-gray-400 flex items-center gap-1"
                  >
                    <ChevronDown size={11} />
                    Show all ({comments.length})
                  </button>
                )}
                {showAllComments && (
                  <button
                    onClick={() => setShowAllComments(false)}
                    className="text-[11px] text-gray-600 active:text-gray-400 flex items-center gap-1"
                  >
                    <ChevronUp size={11} /> Collapse
                  </button>
                )}

                {/* Attach to context button */}
                <button
                  onClick={handleSendCommentsAsContext}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border transition-all ${
                    attachedLabel === 'Comments attached!'
                      ? 'bg-green-600/20 border-green-500/40 text-green-300'
                      : 'bg-gradient-to-r from-purple-600/20 to-pink-600/20 active:from-purple-600/30 active:to-pink-600/30 border-purple-500/40 text-purple-300'
                  }`}
                >
                  <FileCheck size={15} />
                  {attachedLabel === 'Comments attached!' ? '✓ Comments Attached!' : 'Attach Comments → Script Context'}
                </button>

                {/* Intro Video button */}
                <button
                  onClick={() => setShowIntroMaker(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border bg-indigo-500/12 border-indigo-500/30 text-indigo-300 active:bg-indigo-500/20 transition-all"
                >
                  <Video size={15} />
                  Make Intro Video (16:9)
                </button>
              </Section>
            )}
          </>
        )}

        {/* ── VIDEO TAB ──────────────────────────────────────────────────────── */}
        {activeTab === 'video' && (
          <>
            <Section>
              <p className="text-xs text-gray-500">
                Download a video via the Flask server. You can edit it afterwards in the Editor tab.
              </p>

              {/* Quality buttons */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-600 uppercase tracking-wider">Quality</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['360', '480', '720', '1080'] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={`py-3 rounded-xl text-sm font-bold border transition-all ${
                        quality === q
                          ? 'bg-green-600/20 border-green-500/40 text-green-300'
                          : 'bg-white/5 border-white/8 text-gray-500 active:text-gray-300'
                      }`}
                    >
                      {q}p
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleDownload}
                disabled={downloadLoading || !url.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-green-600/20 active:bg-green-600/30 border border-green-500/30 text-green-300 disabled:opacity-40 transition-all"
              >
                {downloadLoading ? (
                  <><Loader2 size={15} className="animate-spin" /> Downloading…</>
                ) : (
                  <><Download size={15} /> Download {quality}p</>
                )}
              </button>
              {downloadError && <ErrBox msg={downloadError} />}
            </Section>

            {downloadLoading && (
              <Section>
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <Loader2 size={16} className="animate-spin text-green-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-white">Downloading...</p>
                      <span className="text-green-400 font-bold text-sm">{downloadProgress}%</span>
                    </div>
                    <div className="flex gap-3 text-[10px] text-gray-600 mt-0.5">
                      {downloadSpeed && <span>Speed: {downloadSpeed}</span>}
                      {downloadEta && <span>ETA: {downloadEta}</span>}
                      {!downloadSpeed && <span>Downloading via yt-dlp…</span>}
                    </div>
                  </div>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </Section>
            )}

            {downloadedFilename && (
              <Section>
                <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
                  <CheckCircle size={16} />
                  Download complete!
                </div>
                <code className="text-xs text-green-300/70 break-all">{downloadedFilename}</code>

                <div className="flex gap-2">
                  <a
                    href={`${flaskUrl}/api/files/${downloadedFilename}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600/20 active:bg-green-600/30 border border-green-500/30 text-green-300 rounded-xl text-xs font-semibold"
                  >
                    <Download size={13} />
                    Phone par Download
                  </a>
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── STT TAB ────────────────────────────────────────────────────────── */}
        {activeTab === 'stt' && (
          <>
            <Section>
              <div className="flex items-center gap-2 text-purple-400 text-sm font-semibold">
                <Mic size={15} />
                Google Speech-to-Text
              </div>
              <p className="text-xs text-gray-500">
                Upload any audio or video file — Google Speech-to-Text will transcribe it and attach automatically.
              </p>

              {/* Hidden file input */}
              <input
                ref={sttFileInputRef}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) setSttFile(f); e.target.value = ''; }}
              />

              {/* File drop zone */}
              <div
                onClick={() => sttFileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setSttFile(f); }}
                className="w-full border border-dashed border-purple-500/25 rounded-xl p-6 text-center cursor-pointer active:bg-white/5 transition-all"
              >
                {sttFile ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-left min-w-0">
                      <Mic size={14} className="text-purple-400 shrink-0" />
                      <span className="text-xs text-gray-300 truncate">{sttFile.name}</span>
                      <span className="text-[10px] text-gray-600 shrink-0">{(sttFile.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setSttFile(null); }}
                      className="text-gray-600 active:text-red-400 shrink-0 p-1"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-600">
                    <Upload size={22} />
                    <span className="text-xs text-gray-400">Choose or drag & drop an audio / video file</span>
                    <span className="text-[10px]">MP3 · WAV · MP4 · M4A · OGG · WEBM</span>
                  </div>
                )}
              </div>

              {/* Language selector */}
              <div>
                <label className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5 block">Language</label>
                <div className="flex bg-[#111] p-0.5 rounded-xl border border-white/5">
                  {([['hi-IN', 'Hindi'], ['en-US', 'English'], ['ur-PK', 'Urdu']] as const).map(([code, label]) => (
                    <button
                      key={code}
                      onClick={() => setSttLang(code)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${sttLang === code ? 'bg-purple-600/30 text-purple-200' : 'text-gray-500'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transcribe button */}
              <button
                onClick={handleSpeechToText}
                disabled={sttLoading || !sttFile}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-purple-600/20 active:bg-purple-600/30 border border-purple-500/30 text-purple-300 disabled:opacity-40 transition-all"
              >
                {sttLoading ? (
                  <><Loader2 size={15} className="animate-spin" /> {sttProgress || 'Processing…'}</>
                ) : (
                  <><Mic size={15} /> Transcribe</>
                )}
              </button>

              {sttError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-red-400 text-xs">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>{sttError}</span>
                </div>
              )}
            </Section>

            {/* Transcript result — STT tab */}
            {transcript && (
              <Section>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                    <CheckCircle size={15} />
                    {transcript.length} segments
                    <span className="text-[10px] bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full font-normal border border-green-500/20">
                      {sttLang === 'hi-IN' ? 'Hindi' : sttLang === 'ur-PK' ? 'Urdu' : 'English'}
                    </span>
                  </div>
                  <button
                    onClick={downloadTranscript}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600/20 active:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-lg"
                  >
                    <Download size={12} /> .txt
                  </button>
                </div>

                {/* Timestamps toggle */}
                <div className="flex bg-[#111] p-0.5 rounded-xl border border-white/5">
                  <button
                    onClick={() => setShowTimestamps(false)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${!showTimestamps ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                  >
                    Without Timestamps
                  </button>
                  <button
                    onClick={() => setShowTimestamps(true)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${showTimestamps ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                  >
                    With Timestamps
                  </button>
                </div>

                <div className={`bg-black/30 rounded-xl p-3 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap ${showFullTranscript ? 'max-h-[60vh] overflow-y-auto' : 'max-h-28 overflow-hidden'}`}>
                  {showFullTranscript ? displayText : displayText.slice(0, 1200)}
                  {!showFullTranscript && displayText.length > 1200 && <span className="text-gray-600">…</span>}
                </div>
                <button
                  onClick={() => setShowFullTranscript(v => !v)}
                  className="text-[11px] text-gray-600 active:text-gray-400 flex items-center gap-1"
                >
                  {showFullTranscript ? <><ChevronUp size={11} /> Collapse</> : <><ChevronDown size={11} /> Show full ({Math.round(displayText.length / 1000)}K chars)</>}
                </button>

                <button
                  onClick={handleSendTranscriptAsContext}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border transition-all ${
                    attachedLabel === 'Transcript attached!'
                      ? 'bg-green-600/20 border-green-500/40 text-green-300'
                      : 'bg-gradient-to-r from-purple-600/20 to-blue-600/20 active:from-purple-600/30 active:to-blue-600/30 border-purple-500/40 text-purple-300'
                  }`}
                >
                  <FileCheck size={15} />
                  {attachedLabel === 'Transcript attached!' ? '✓ Transcript Attached!' : 'Attach Transcript → Script Context'}
                </button>
              </Section>
            )}

            {/* ── TOPIC SPLIT SYSTEM ── */}
            {transcript && transcript.length > 0 && (
              <Section>
                <div className="flex items-center gap-2">
                  <Scissors size={15} className="text-orange-400" />
                  <span className="text-sm font-semibold text-orange-300">Topic-wise Split</span>
                  <span className="text-[10px] text-gray-600 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">Gemini Flash</span>
                </div>
                <p className="text-xs text-gray-500">
                  Split transcript by topic — each part under 8 min. Attach any section directly to script context.
                </p>

                <button
                  onClick={handleTopicSplit}
                  disabled={splitLoading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-orange-600/15 active:bg-orange-600/25 border border-orange-500/25 text-orange-300 disabled:opacity-40 transition-all"
                >
                  {splitLoading ? (
                    <><Loader2 size={15} className="animate-spin" /> Splitting by topics…</>
                  ) : (
                    <><Scissors size={15} /> Split by Topics</>
                  )}
                </button>

                {splitError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-red-400 text-xs">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>{splitError}</span>
                  </div>
                )}

                {splitChunks.length > 0 && (
                  <div className="space-y-2">
                    {/* Numbered summary strip */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {splitChunks.map((chunk, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-orange-500/10 border border-orange-500/20 text-orange-300 px-2 py-1 rounded-lg font-mono whitespace-nowrap"
                        >
                          {idx + 1}. {fmtTime(chunk.start)} – {fmtTime(chunk.end)}
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-600 uppercase tracking-wider">{splitChunks.length} segments found</p>
                    {splitChunks.map((chunk, idx) => {
                      const dur = chunk.end - chunk.start;
                      const durMin = Math.floor(dur / 60);
                      const durSec = Math.floor(dur % 60);
                      const isAttached = attachedChunkIdx === idx;
                      return (
                        <div
                          key={idx}
                          className={`rounded-xl border p-3 space-y-2 transition-all ${isAttached ? 'border-green-500/40 bg-green-500/5' : 'border-white/8 bg-white/3'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-200 leading-snug">{chunk.title}</p>
                              <p className="text-[10px] text-gray-600 mt-0.5">
                                {fmtTime(chunk.start)} – {fmtTime(chunk.end)}
                                <span className="ml-2 text-orange-400/70">{durMin}m {durSec}s</span>
                              </p>
                            </div>
                            <button
                              onClick={() => attachChunk(chunk, idx)}
                              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                                isAttached
                                  ? 'bg-green-600/20 border-green-500/40 text-green-300'
                                  : 'bg-blue-600/15 active:bg-blue-600/25 border-blue-500/25 text-blue-300'
                              }`}
                            >
                              <FileCheck size={11} />
                              {isAttached ? '✓ Attached' : 'Attach'}
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
                            {chunk.text.slice(0, 140)}{chunk.text.length > 140 ? '…' : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            )}
          </>
        )}

        {/* editor tab removed — kept state vars for session persistence only */}
        {false && (
          <>
            {!downloadedFilename ? (
              <Section><div /></Section>
            ) : (
              <>
                {/* ── LIVE VIDEO PREVIEW ── */}
                <Section className="!p-2">
                  <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
                    {/* Video element */}
                    <video
                      ref={videoRef}
                      src={`${flaskUrl}/api/files/${editedFilename || downloadedFilename}`}
                      className="absolute inset-0 w-full h-full object-contain"
                      style={{
                        transform: `scale(${curSeg.zoom})`,
                        transformOrigin: `${50 + curSeg.panX}% ${50 + curSeg.panY}%`,
                        transition: 'transform 0.1s ease, transform-origin 0.1s ease',
                      }}
                      onLoadedMetadata={handleVideoLoaded}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      playsInline
                      preload="metadata"
                    />

                    {/* Black bar overlays */}
                    {(blackBars === 'top_bottom' || blackBars === 'both') && (
                      <>
                        <div className="absolute top-0 left-0 right-0 bg-black" style={{ height: '12%' }} />
                        <div className="absolute bottom-0 left-0 right-0 bg-black" style={{ height: '12%' }} />
                      </>
                    )}
                    {(blackBars === 'sides' || blackBars === 'both') && (
                      <>
                        <div className="absolute top-0 bottom-0 left-0 bg-black" style={{ width: '8%' }} />
                        <div className="absolute top-0 bottom-0 right-0 bg-black" style={{ width: '8%' }} />
                      </>
                    )}

                    {/* Tap zones: left=back, center=play/pause, right=forward */}
                    <div
                      className="absolute inset-0 flex"
                      onClick={handleVideoTap}
                    >
                      {/* Left zone — back */}
                      <div className="w-[30%] h-full flex items-center justify-center relative">
                        {tapFlash === 'left' && (
                          <div className="absolute inset-0 bg-white/10 rounded-l-xl animate-ping pointer-events-none" />
                        )}
                        <div className="opacity-0 hover:opacity-70 active:opacity-90 transition-opacity flex flex-col items-center gap-0.5">
                          <div className="flex">
                            <div className="w-0 h-0 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent border-r-[11px] border-r-white" />
                            <div className="w-0 h-0 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent border-r-[11px] border-r-white -ml-1" />
                          </div>
                          <span className="text-white text-[9px] font-bold">{skipSecs}s</span>
                        </div>
                      </div>
                      {/* Center zone — play/pause */}
                      <div className="flex-1 h-full flex items-center justify-center">
                        <div className="w-11 h-11 bg-black/50 rounded-full flex items-center justify-center opacity-0 hover:opacity-90 active:opacity-100 transition-opacity">
                          {isPlaying
                            ? <div className="flex gap-1"><div className="w-1.5 h-5 bg-white rounded" /><div className="w-1.5 h-5 bg-white rounded" /></div>
                            : <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[14px] border-l-white ml-1" />
                          }
                        </div>
                      </div>
                      {/* Right zone — forward */}
                      <div className="w-[30%] h-full flex items-center justify-center relative">
                        {tapFlash === 'right' && (
                          <div className="absolute inset-0 bg-white/10 rounded-r-xl animate-ping pointer-events-none" />
                        )}
                        <div className="opacity-0 hover:opacity-70 active:opacity-90 transition-opacity flex flex-col items-center gap-0.5">
                          <div className="flex">
                            <div className="w-0 h-0 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent border-l-[11px] border-l-white" />
                            <div className="w-0 h-0 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent border-l-[11px] border-l-white -ml-1" />
                          </div>
                          <span className="text-white text-[9px] font-bold">{skipSecs}s</span>
                        </div>
                      </div>
                    </div>

                    {/* ── ZOOM controls overlay — top-right ── */}
                    <div className="absolute top-2 right-2 z-30 flex flex-col items-center gap-0.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setCurZoom(curSeg.zoom + 0.25)}
                        className="w-7 h-7 bg-black/60 backdrop-blur-sm border border-white/15 rounded-lg text-white text-base font-bold active:bg-white/20 leading-none flex items-center justify-center"
                      >+</button>
                      <div className="bg-black/60 backdrop-blur-sm border border-white/15 rounded-lg px-1.5 py-0.5 text-[10px] font-mono text-blue-300 text-center min-w-[28px]">
                        {curSeg.zoom.toFixed(1)}x
                      </div>
                      <button
                        onClick={() => { const nz = curSeg.zoom - 0.25; setCurZoom(nz); if (nz <= 1) resetCurSeg(); }}
                        className="w-7 h-7 bg-black/60 backdrop-blur-sm border border-white/15 rounded-lg text-white text-base font-bold active:bg-white/20 leading-none flex items-center justify-center"
                      >−</button>
                      {/* Segment indicator */}
                      {segments.length > 1 && (
                        <div className="bg-black/70 border border-white/10 rounded px-1 text-[8px] text-yellow-300/70 font-mono mt-0.5 whitespace-nowrap">
                          Clip {previewSegIdx + 1}
                        </div>
                      )}
                      {/* Reset this segment */}
                      {(curSeg.zoom !== 1 || curSeg.panX !== 0 || curSeg.panY !== 0) && (
                        <button onClick={resetCurSeg}
                          className="bg-black/60 border border-white/10 rounded px-1.5 text-[8px] text-gray-400 active:text-white mt-0.5">↺</button>
                      )}
                    </div>

                    {/* ── PAN d-pad overlay — bottom-left, only when zoomed ── */}
                    {curSeg.zoom > 1 && (
                      <div className="absolute bottom-8 left-2 z-30 grid grid-cols-3 gap-0.5" onClick={e => e.stopPropagation()} style={{ width: 84 }}>
                        <div />
                        <button onClick={() => setCurPanY(curSeg.panY - 5)}
                          className="w-6 h-6 bg-black/60 backdrop-blur-sm border border-white/15 rounded-md text-white text-xs active:bg-white/25 flex items-center justify-center">▲</button>
                        <div />
                        <button onClick={() => setCurPanX(curSeg.panX - 5)}
                          className="w-6 h-6 bg-black/60 backdrop-blur-sm border border-white/15 rounded-md text-white text-xs active:bg-white/25 flex items-center justify-center">◀</button>
                        <button onClick={resetCurSeg}
                          className="w-6 h-6 bg-black/60 backdrop-blur-sm border border-white/20 rounded-md text-gray-400 text-[8px] active:bg-white/25 flex items-center justify-center">◎</button>
                        <button onClick={() => setCurPanX(curSeg.panX + 5)}
                          className="w-6 h-6 bg-black/60 backdrop-blur-sm border border-white/15 rounded-md text-white text-xs active:bg-white/25 flex items-center justify-center">▶</button>
                        <div />
                        <button onClick={() => setCurPanY(curSeg.panY + 5)}
                          className="w-6 h-6 bg-black/60 backdrop-blur-sm border border-white/15 rounded-md text-white text-xs active:bg-white/25 flex items-center justify-center">▼</button>
                        <div />
                      </div>
                    )}

                    {/* Time display */}
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-mono px-2 py-0.5 rounded-md pointer-events-none">
                      {fmtTime(currentTime)} / {fmtTime(videoDuration)}
                    </div>
                  </div>

                  {/* Play controls */}
                  <div className="flex items-center gap-1 px-0.5 pt-1.5">
                    <button onClick={() => seekTo(0)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 active:text-gray-300 text-sm">⏮</button>
                    <button onClick={() => skipBy(-skipSecs)} className="w-8 h-8 flex items-center justify-center bg-white/8 rounded-lg text-white active:bg-white/20 text-xs font-bold">
                      <span className="flex flex-col items-center leading-none gap-px"><span className="text-sm">⏪</span><span className="text-[7px] text-gray-500">{skipSecs}s</span></span>
                    </button>
                    <button onClick={togglePlay} className="w-9 h-9 flex items-center justify-center bg-white/15 rounded-full text-white active:bg-white/25 mx-0.5">
                      {isPlaying
                        ? <div className="flex gap-0.5"><div className="w-1 h-3.5 bg-white rounded" /><div className="w-1 h-3.5 bg-white rounded" /></div>
                        : <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[10px] border-l-white ml-0.5" />
                      }
                    </button>
                    <button onClick={() => skipBy(skipSecs)} className="w-8 h-8 flex items-center justify-center bg-white/8 rounded-lg text-white active:bg-white/20 text-xs font-bold">
                      <span className="flex flex-col items-center leading-none gap-px"><span className="text-sm">⏩</span><span className="text-[7px] text-gray-500">{skipSecs}s</span></span>
                    </button>
                    <div className="flex-1 text-center text-[11px] font-mono text-gray-500 tabular-nums">{fmtTime(currentTime)}<span className="text-gray-700 mx-0.5">/</span>{fmtTime(videoDuration)}</div>
                    {/* Skip selector */}
                    <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
                      {[1, 2, 5, 10].map(s => (
                        <button key={s} onClick={() => setSkipSecs(s)} className={`w-6 h-5 rounded text-[9px] font-bold transition-all ${skipSecs === s ? 'bg-blue-500/40 text-blue-200' : 'text-gray-600 active:text-gray-300'}`}>{s}s</button>
                      ))}
                    </div>
                  </div>
                </Section>

                {/* ── TIMELINE ── */}
                <Section>
                  {/* Header */}
                  <div className="flex items-center gap-1.5">
                    <Scissors size={13} className="text-yellow-400 shrink-0" />
                    <span className="text-xs font-semibold text-white">Timeline</span>
                    {videoDuration > 0 && (
                      <span className="text-[10px] text-yellow-300/50 ml-0.5">
                        {skippedSegs.length > 0
                          ? `${keptSegs.length}/${segments.length} · ${fmtTime(keptSegs.reduce((sum, s) => sum + (s.end - s.start), 0))}`
                          : fmtTime(videoDuration)}
                      </span>
                    )}
                    {/* Zoom controls */}
                    <div className="flex items-center gap-0.5 ml-auto bg-white/5 rounded-lg p-0.5">
                      <button
                        onClick={() => { setTimelineZoom(z => Math.max(1, z / 2)); setTimelineOffset(0); }}
                        disabled={timelineZoom <= 1}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 active:text-white disabled:opacity-20 text-sm"
                      >−</button>
                      <span className="text-[10px] text-gray-500 w-6 text-center font-mono">{timelineZoom}x</span>
                      <button
                        onClick={() => setTimelineZoom(z => Math.min(16, z * 2))}
                        disabled={videoDuration <= 0}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 active:text-white disabled:opacity-20 text-sm"
                      >+</button>
                    </div>
                    {/* Cut button */}
                    <button
                      onClick={handleAddCut}
                      disabled={videoDuration <= 0 || currentTime <= 0.1 || currentTime >= videoDuration - 0.1}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-500/20 border border-red-500/25 text-red-300 active:bg-red-500/30 disabled:opacity-25"
                    >
                      <Scissors size={10} /> Cut
                    </button>
                    {cutPoints.length > 0 && (
                      <button
                        onClick={() => { setCutPoints([]); setSkippedSegs([]); setPreviewSegIdx(0); }}
                        className="px-2 py-1.5 rounded-lg text-[10px] text-gray-600 active:text-gray-300 bg-white/5"
                      >✕</button>
                    )}
                  </div>

                  {videoDuration > 0 ? (
                    <>
                      {/* Segment chips */}
                      {segments.length > 1 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {segments.map((seg, i) => {
                            const isSkipped = skippedSegs.includes(i);
                            const isPreview = i === previewSegIdx;
                            return (
                              <div key={i} className={`flex items-center rounded-lg border overflow-hidden text-[10px] font-semibold transition-all ${
                                isSkipped ? 'border-red-500/25 bg-red-500/10 opacity-50'
                                : isPreview ? 'border-yellow-400/40 bg-yellow-400/12'
                                : 'border-green-500/25 bg-green-500/8'
                              }`}>
                                <button onClick={() => { setPreviewSegIdx(i); seekTo(seg.start); }}
                                  className={`px-2 py-1 ${isSkipped ? 'text-red-400 line-through' : isPreview ? 'text-yellow-300' : 'text-green-300'}`}>
                                  {i + 1} <span className="opacity-60 font-normal">{fmtTime(seg.end - seg.start)}</span>
                                  {segmentZooms[i] && segmentZooms[i].zoom > 1 && (
                                    <span className="ml-1 text-blue-400/80 text-[8px] font-mono">{segmentZooms[i].zoom.toFixed(1)}x</span>
                                  )}
                                </button>
                                <button onClick={() => toggleSkip(i)}
                                  className={`px-1.5 py-1 border-l border-white/8 ${isSkipped ? 'text-red-400' : 'text-gray-600 active:text-red-400'}`}>
                                  {isSkipped ? '↩' : '✕'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Main timeline bar */}
                      <div
                        ref={timelineRef}
                        className="relative h-11 rounded-xl cursor-crosshair select-none touch-none mt-1.5"
                        onPointerDown={handleTimelinePointerDown}
                        onPointerMove={handleTimelinePointerMove}
                        onPointerUp={handleTimelinePointerUp}
                      >
                        <div className="absolute inset-0 bg-gray-800/70 rounded-xl" />

                        {/* Segment blocks */}
                        {segments.map((seg, i) => {
                          const visStart = Math.max(seg.start, tlOffset);
                          const visEnd = Math.min(seg.end, tlOffset + tlWindowDur);
                          if (visStart >= visEnd) return null;
                          const isSkipped = skippedSegs.includes(i);
                          const isPreview = i === previewSegIdx;
                          return (
                            <div
                              key={i}
                              onClick={(e) => { e.stopPropagation(); setPreviewSegIdx(i); seekTo(seg.start); }}
                              className={`absolute top-1 bottom-1 rounded-lg cursor-pointer transition-all ${
                                isSkipped ? 'bg-red-500/10 border border-red-500/20'
                                : isPreview ? 'bg-yellow-400/28 border border-yellow-400/45'
                                : 'bg-green-500/15 border border-green-500/22'
                              }`}
                              style={{ left: `${tToTl(visStart)}%`, width: `${((visEnd - visStart) / tlWindowDur) * 100}%` }}
                            >
                              {isSkipped && <span className="absolute inset-0 flex items-center justify-center text-[9px] text-red-400/50 pointer-events-none">✕</span>}
                            </div>
                          );
                        })}

                        {/* Cut markers */}
                        {cutPoints.filter(pt => pt >= tlOffset && pt <= tlOffset + tlWindowDur).map((pt, i) => (
                          <div key={i} className="absolute top-0 bottom-0 z-10 group" style={{ left: `${tToTl(pt)}%`, transform: 'translateX(-50%)' }}>
                            <div className="absolute top-0 bottom-0 w-px bg-red-400/70 left-0" />
                            <div className="absolute -top-0.5 left-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                              <span className="text-[8px] text-red-300 bg-black/80 px-1 rounded whitespace-nowrap">{fmtTime(pt)}</span>
                              <button onClick={(e) => { e.stopPropagation(); handleRemoveCut(pt); }} className="text-[8px] text-red-400 bg-black/80 px-1 rounded">✕</button>
                            </div>
                            <div className="absolute bottom-0.5 -left-1.5 text-red-400/60 text-[8px] pointer-events-none">✂</div>
                          </div>
                        ))}

                        {/* Playhead */}
                        {tToTl(currentTime) >= 0 && tToTl(currentTime) <= 100 && (
                          <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: `${tToTl(currentTime)}%` }}>
                            <div className="absolute left-0 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-white" />
                            <div className="absolute top-1.5 bottom-0 w-px bg-white/90 left-0" />
                          </div>
                        )}

                        {/* Time ticks */}
                        <div className="absolute bottom-0.5 left-0 right-0 flex justify-between px-1 pointer-events-none">
                          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
                            <span key={p} className="text-[8px] text-gray-600 tabular-nums">{fmtTime(tlOffset + p * tlWindowDur)}</span>
                          ))}
                        </div>
                      </div>

                      {/* ── Minimap scrollbar — only when zoomed ── */}
                      {timelineZoom > 1 && (
                        <div
                          ref={miniMapRef}
                          className="relative h-4 bg-gray-800/50 rounded-full mt-1.5 cursor-pointer touch-none select-none border border-white/5"
                          onPointerDown={handleMiniPointerDown}
                          onPointerMove={handleMiniPointerMove}
                          onPointerUp={handleMiniPointerUp}
                        >
                          {/* Segment colors on minimap */}
                          {segments.map((seg, i) => (
                            <div
                              key={i}
                              className={`absolute top-1 bottom-1 rounded-full ${skippedSegs.includes(i) ? 'bg-red-500/25' : 'bg-green-500/30'}`}
                              style={{ left: `${(seg.start / videoDuration) * 100}%`, width: `${((seg.end - seg.start) / videoDuration) * 100}%` }}
                            />
                          ))}
                          {/* Cut markers on minimap */}
                          {cutPoints.map((pt, i) => (
                            <div key={i} className="absolute top-0.5 bottom-0.5 w-px bg-red-400/50" style={{ left: `${(pt / videoDuration) * 100}%` }} />
                          ))}
                          {/* Playhead on minimap */}
                          <div className="absolute top-0 bottom-0 w-px bg-white/40 z-10" style={{ left: `${(currentTime / videoDuration) * 100}%` }} />
                          {/* Visible window box — draggable */}
                          <div
                            className="absolute top-0 bottom-0 rounded-full bg-white/15 border border-white/35 z-20"
                            style={{
                              left: `${(tlOffset / videoDuration) * 100}%`,
                              width: `${(tlWindowDur / videoDuration) * 100}%`,
                            }}
                          />
                        </div>
                      )}

                      {/* Cut chips */}
                      {cutPoints.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap mt-1.5">
                          {cutPoints.sort((a, b) => a - b).map((pt, i) => (
                            <div key={i} className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-lg">
                              <span className="text-[10px] text-red-300 font-mono">✂ {fmtTime(pt)}</span>
                              <button onClick={() => handleRemoveCut(pt)} className="text-red-500/70 text-xs active:text-red-300 leading-none">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-16 flex items-center justify-center text-xs text-gray-700">Loading video…</div>
                  )}
                </Section>


                {/* ── BLACK BARS ── */}
                <Section>
                  <div className="flex items-center gap-2">
                    <Rows3 size={13} className="text-orange-400 shrink-0" />
                    <span className="text-xs font-semibold text-white">Black Bars</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'none', label: 'None', preview: '□' },
                      { value: 'top_bottom', label: 'Top & Bottom', preview: '▬' },
                      { value: 'sides', label: 'Sides', preview: '▏□▕' },
                      { value: 'both', label: 'All Sides', preview: '◼' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setBlackBars(opt.value as BlackBars)}
                        className={`py-3 rounded-xl border text-center transition-all text-sm ${
                          blackBars === opt.value
                            ? 'bg-orange-600/20 border-orange-500/40 text-orange-300'
                            : 'bg-white/3 border-white/8 text-gray-500 active:text-gray-300'
                        }`}
                      >
                        <div className="text-lg mb-0.5">{opt.preview}</div>
                        <div className="text-[11px] font-semibold">{opt.label}</div>
                      </button>
                    ))}
                  </div>
                </Section>

                {/* ── APPLY EDITS ── */}
                <button
                  onClick={handleEditVideo}
                  disabled={editLoading}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-sm bg-gradient-to-r from-yellow-600/20 to-orange-600/20 active:from-yellow-600/30 active:to-orange-600/30 border border-yellow-500/30 text-yellow-300 disabled:opacity-40 transition-all"
                >
                  {editLoading ? (
                    <><Loader2 size={16} className="animate-spin" /> ffmpeg processing...</>
                  ) : (
                    <><Scissors size={16} /> Apply Edits & Export</>
                  )}
                </button>

                {editError && <ErrBox msg={editError} />}

                {editedFilename && (
                  <Section>
                    <div className="flex items-center gap-2 text-yellow-400 font-semibold text-sm">
                      <CheckCircle size={15} />
                      Edit done!
                    </div>
                    <code className="text-xs text-yellow-300/70 break-all">{editedFilename}</code>
                    <div className="flex gap-2">
                      <a
                        href={`${flaskUrl}/api/files/${editedFilename}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-yellow-600/20 active:bg-yellow-600/30 border border-yellow-500/30 text-yellow-300 rounded-xl text-sm font-semibold"
                      >
                        <Download size={14} />
                        Download Edited
                      </a>
                      <button
                        onClick={() => {
                          setDownloadedFilename(editedFilename);
                          setEditedFilename('');
                          setEditError('');
                          setVideoDuration(0);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-white/5 active:bg-white/10 border border-white/10 text-gray-400 rounded-xl text-xs font-semibold"
                      >
                        <Edit3 size={13} />
                        Dobara Edit
                      </button>
                    </div>
                  </Section>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Bottom action bar (fixed) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-[#050505]/95 backdrop-blur-xl border-t border-white/5 p-4 space-y-2">
        {/* Status pills */}
        <div className="flex gap-2 flex-wrap">
          {transcript && (
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
              ✓ Transcript
            </span>
          )}
          {comments && (
            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">
              ✓ {comments.length} Comments
            </span>
          )}
          {downloadedFilename && (
            <span className="text-[10px] bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">
              ✓ Video
            </span>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onSkip}
            className="py-3 px-5 border border-white/10 text-gray-500 active:text-gray-300 rounded-2xl text-sm transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleDone}
            disabled={!canProceed}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 to-blue-600 active:from-purple-700 active:to-blue-700 text-white font-bold rounded-2xl text-sm disabled:opacity-40 shadow-lg"
          >
            Next Step
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {showIntroMaker && comments && comments.length > 0 && (
        <IntroVideoMaker
          comments={comments}
          transcript={fullText}
          onClose={() => setShowIntroMaker(false)}
        />
      )}
    </div>
  );
};

export default YoutubeImporter;
