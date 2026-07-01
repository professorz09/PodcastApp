import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, Youtube, Download, Loader2, Scissors,
  ArrowLeft, Sparkles, Copy, Check, RefreshCw,
  Film, Package,
} from 'lucide-react';
import { findBestShortsSegments, findViralMovieClips, generateShortsTitles, ShortsSegment, ClipMode } from '../services/geminiService';
import { transcribeAudioGoogleCloud } from '../services/googleCloudService';
import { createZip, ZipEntry } from '../services/zipWriter';
import { toast } from './Toast';

// Canvas 9:16 portrait
const W = 1080;
const H = 1920;
const HEADER_H = 220;

// ── Subtitle helper ───────────────────────────────────────────────────────────
function getSubtitleAt(
  chunks: { text: string; start: number; end: number }[],
  t: number,
): string {
  const c = chunks.find(x => t >= x.start && t < x.end + 0.5);
  return c?.text ?? '';
}

// ── Word timings → transcript chunks (3-second windows) ──────────────────────
function wordTimingsToChunks(
  timings: { word: string; start: number; end: number }[],
): { text: string; start: number; end: number }[] {
  if (!timings.length) return [];
  const CHUNK_S = 3;
  const out: { text: string; start: number; end: number }[] = [];
  let batch: typeof timings = [];
  for (const w of timings) {
    if (batch.length > 0 && w.start - batch[0].start > CHUNK_S) {
      out.push({ text: batch.map(t => t.word).join(' '), start: batch[0].start, end: batch[batch.length - 1].end });
      batch = [w];
    } else {
      batch.push(w);
    }
  }
  if (batch.length) out.push({ text: batch.map(t => t.word).join(' '), start: batch[0].start, end: batch[batch.length - 1].end });
  return out;
}

// Word-wrap helper
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// ── Draw one frame on canvas ─────────────────────────────────────────────────
// kicker = small caption line shown above the big title in the white header.
function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  title: string,
  subtitle: string,
  isYoutube: boolean,
  kicker?: string,
) {
  // Video / background
  if (video && video.readyState >= 2) {
    const vW = W, vH = H - HEADER_H;
    const vAsp = video.videoWidth / (video.videoHeight || 1);
    const cAsp = vW / vH;
    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
    if (vAsp > cAsp) { sw = Math.round(sh * cAsp); sx = Math.round((video.videoWidth - sw) / 2); }
    else { sh = Math.round(sw / cAsp); sy = Math.round((video.videoHeight - sh) / 2); }
    ctx.drawImage(video, sx, sy, sw, sh, 0, HEADER_H, vW, vH);
  } else {
    // No video (YouTube) — dark gradient background
    const grad = ctx.createLinearGradient(0, HEADER_H, 0, H);
    grad.addColorStop(0, '#111111');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, HEADER_H, W, H - HEADER_H);
    if (isYoutube) {
      ctx.fillStyle = 'rgba(255,0,0,0.15)';
      ctx.fillRect(0, HEADER_H, W, H - HEADER_H);
    }
  }

  // White header
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, HEADER_H);

  const maxTW = W - 80;
  ctx.textAlign = 'center';

  // ── Small kicker line (top of header) — colored, uppercase, letter-spaced ──
  let headerTop = 40;
  if (kicker && kicker.trim()) {
    ctx.fillStyle = '#7C3AED';
    ctx.font = '800 30px Arial, sans-serif';
    const k = kicker.toUpperCase().slice(0, 38);
    ctx.fillText(k, W / 2, headerTop + 26);
    headerTop += 52;
  }

  // ── Big bold title (black caps, auto-fit) ──
  ctx.fillStyle = '#0A0A0A';
  const avail = HEADER_H - headerTop - 24;
  let fs = 74;
  let lines: string[] = [];
  for (; fs >= 40; fs -= 4) {
    ctx.font = `900 ${fs}px Arial, sans-serif`;
    lines = wrapText(ctx, title.toUpperCase(), maxTW);
    if (lines.length * fs * 1.18 <= avail) break;
  }
  const lh = fs * 1.18;
  const block = lines.length * lh;
  const titleY = headerTop + (avail - block) / 2 + fs * 0.82;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, titleY + i * lh));

  // ── Subtitle over video — big bold white, mixed-size feel, strong shadow ──
  if (subtitle.trim()) {
    const sfs = 58;
    ctx.font = `900 ${sfs}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    const sLines = wrapText(ctx, subtitle.trim(), W - 90);
    const slh = sfs * 1.18;
    const baseY = H - sLines.length * slh - 90;

    // Outline for legibility on any background
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.92)';
    ctx.lineJoin = 'round';
    sLines.forEach((l, i) => ctx.strokeText(l, W / 2, baseY + i * slh));
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#FFFFFF';
    sLines.forEach((l, i) => ctx.fillText(l, W / 2, baseY + i * slh));
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }
}

// ── Render clip to Blob ────────────────────────────────────────────────────────
async function renderClip(
  videoUrl: string | null,
  start: number,
  end: number,
  title: string,
  transcript: { text: string; start: number; end: number }[],
  onProgress: (pct: number) => void,
  kicker?: string,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const isYoutube = !videoUrl;

  let video: HTMLVideoElement | null = null;
  let dest: MediaStreamAudioDestinationNode | null = null;
  // Hoisted so we can close it after every render — browsers cap the number of
  // live AudioContexts (~6), so a movie ZIP of many clips MUST release each one.
  let audioCtx: AudioContext | null = null;

  if (videoUrl) {
    video = document.createElement('video');
    video.src = videoUrl;
    video.preload = 'auto';
    video.muted = false;
    await new Promise<void>((res, rej) => {
      let loadTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => rej(new Error('Video load timeout')), 30_000);
      const clear = () => { if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; } };
      video!.oncanplaythrough = () => { clear(); res(); };
      video!.onerror = () => { clear(); rej(new Error('Video load nahi hua')); };
      video!.load();
    });
    audioCtx = new AudioContext();
    const src = audioCtx.createMediaElementSource(video);
    dest = audioCtx.createMediaStreamDestination();
    src.connect(dest);
    src.connect(audioCtx.destination);
    video.currentTime = start;
    await new Promise<void>(r => { video!.onseeked = () => r(); });
  }

  const videoTracks = canvas.captureStream(30).getVideoTracks();
  const audioTracks = dest ? dest.stream.getAudioTracks() : [];
  const stream = new MediaStream([...videoTracks, ...audioTracks]);

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : 'video/webm';

  return new Promise<Blob>((resolve, reject) => {
    const chunks: Blob[] = [];
    let animId = 0;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    // Release every resource this render acquired — AudioContext, video buffers,
    // and timers. Called exactly once on success, error, or timeout.
    const cleanup = () => {
      if (animId) cancelAnimationFrame(animId);
      if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
      if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
      try { video?.pause(); } catch {}
      if (video) { try { video.removeAttribute('src'); video.load(); } catch {} }
      if (audioCtx && audioCtx.state !== 'closed') { audioCtx.close().catch(() => {}); }
    };

    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
    recorder.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('MediaRecorder error'));
    };

    recorder.start(100);
    video?.play().catch(() => {});

    const duration = end - start;
    const startWall = Date.now();

    const tick = () => {
      const elapsed = video ? (video.currentTime - start) : ((Date.now() - startWall) / 1000);
      onProgress(Math.min(99, Math.round((elapsed / duration) * 100)));

      const t = start + elapsed;
      const subtitle = getSubtitleAt(transcript, t);
      drawFrame(ctx, video, title, subtitle, isYoutube, kicker);

      const done = video ? video.currentTime >= end - 0.05 : elapsed >= duration;
      if (done) {
        cancelAnimationFrame(animId);
        animId = 0;
        try { video?.pause(); } catch {}
        stopTimer = setTimeout(() => { try { recorder.stop(); } catch {} }, 300);
        return;
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    // Safety timeout — force-stop if playback stalls and never reaches the end.
    safetyTimer = setTimeout(() => {
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
    }, (duration + 8) * 1000);
  });
}

// Run async tasks with a bounded concurrency so a long movie (15-20 clips)
// doesn't fire 30-40 Gemini calls at once and trip rate limits (429).
async function runWithLimit<T>(items: T[], limit: number, worker: (item: T, idx: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

// ── Hashtag fetcher via /api/gemini ──────────────────────────────────────────
async function fetchHashtags(title: string, text: string): Promise<string[]> {
  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-3.5-flash',
        contents: [{ role: 'user', parts: [{ text: `Generate 8 viral hashtags for this YouTube Shorts clip.
Title: ${title}
Clip: ${text.slice(0, 300)}
Return ONLY a JSON array like ["#shorts","#viral","#topic"]. Always include #shorts and #reels.` }] }],
        config: { responseMimeType: 'application/json' },
      }),
    });
    const data = await res.json();
    const raw = data.text ?? data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    const parsed = JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim());
    return Array.isArray(parsed) ? parsed.map(String) : ['#shorts', '#viral'];
  } catch {
    return ['#shorts', '#viral', '#trending', '#reels'];
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface ShortsStudioProps { onBack: () => void }

const ShortsStudio: React.FC<ShortsStudioProps> = ({ onBack }) => {
  type Phase = 'input' | 'processing' | 'results';
  const [phase, setPhase] = useState<Phase>('input');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // Input
  const [inputMode, setInputMode] = useState<'upload' | 'youtube' | 'movie'>('upload');
  const [ytUrl, setYtUrl] = useState('');

  // Config (shown after file/URL is set)
  const [clipMode, setClipMode] = useState<ClipMode>('short');
  const [clipCount, setClipCount] = useState<3 | 5 | 7>(5);
  const [language, setLanguage] = useState<'en-US' | 'hi-IN' | 'auto'>('en-US');
  // Movie mode — max Reels duration per clip
  const [reelDuration, setReelDuration] = useState<60 | 90>(90);

  const isMovie = inputMode === 'movie';
  const isFileMode = inputMode === 'upload' || inputMode === 'movie';

  // Media
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  // Stored blob URL for uploaded file (separate from videoUrl which is set after processing)
  const [pendingFileUrl, setPendingFileUrl] = useState<string | null>(null);

  // Results
  const [videoTitle, setVideoTitle] = useState('');
  const [transcript, setTranscript] = useState<{ text: string; start: number; end: number }[]>([]);
  const [segments, setSegments] = useState<ShortsSegment[]>([]);
  const [clipTitles, setClipTitles] = useState<Record<number, string>>({});
  const [clipHashtags, setClipHashtags] = useState<Record<number, string[]>>({});
  const [metaLoading, setMetaLoading] = useState<Set<number>>(new Set());

  // Render
  const [renderingIdx, setRenderingIdx] = useState<number | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // ZIP (movie — download all)
  const [zipping, setZipping] = useState(false);
  const [zipDone, setZipDone] = useState(0);
  const [zipStatus, setZipStatus] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMeta = useCallback(async (
    idx: number,
    seg: ShortsSegment,
    chunks: { text: string; start: number; end: number }[],
  ) => {
    setMetaLoading(prev => new Set(prev).add(idx));
    try {
      const text = chunks.filter(c => c.end >= seg.start && c.start <= seg.end).map(c => c.text).join(' ');
      const [result, hashtags] = await Promise.all([
        generateShortsTitles(seg, text),
        fetchHashtags(seg.title, text),
      ]);
      setClipTitles(prev => ({ ...prev, [idx]: result.titles[0] ?? seg.title }));
      setClipHashtags(prev => ({ ...prev, [idx]: hashtags }));
    } catch {
      setClipTitles(prev => ({ ...prev, [idx]: seg.title }));
      setClipHashtags(prev => ({ ...prev, [idx]: ['#shorts', '#viral', '#trending'] }));
    } finally {
      setMetaLoading(prev => { const n = new Set(prev); n.delete(idx); return n; });
    }
  }, []);

  const processTranscript = useCallback(async (
    chunks: { text: string; start: number; end: number }[],
    title: string,
    url: string | null,
  ) => {
    setTranscript(chunks);
    setVideoTitle(title);
    let segs: ShortsSegment[];
    if (isMovie) {
      setStatus('Poori movie analyse karke viral clips dhund raha hai…');
      segs = await findViralMovieClips(chunks, reelDuration);
    } else {
      setStatus('AI best clips dhund raha hai…');
      // clipCount only steers the 'short' prompt; 'long' naturally yields 2-4.
      segs = await findBestShortsSegments(chunks, undefined, undefined, clipMode, clipMode === 'short' ? clipCount : undefined);
    }
    if (!segs.length) throw new Error('Koi suitable clip nahi mila');
    setSegments(segs);
    setVideoUrl(url);
    setPhase('results');
    toast.success(`${segs.length} clips ready!`);
    // Throttle metadata generation — max 3 clips in flight at once.
    runWithLimit(segs, 3, (seg, idx) => loadMeta(idx, seg, chunks));
  }, [clipMode, clipCount, isMovie, reelDuration, loadMeta]);

  // Just stores the file — does NOT start processing
  const handleFileSelect = useCallback((file: File) => {
    if (pendingFileUrl) URL.revokeObjectURL(pendingFileUrl);
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setPendingFileUrl(url);
    setError('');
  }, [pendingFileUrl]);

  // Called when user clicks "Find Clips" — starts the actual work
  const handleStart = useCallback(async () => {
    setError('');
    setPhase('processing');

    if (isFileMode && videoFile && pendingFileUrl) {
      try {
        setStatus('Audio transcribe ho raha hai…');
        const langCode = language === 'auto' ? 'en-US' : language;
        const wordTimings = await transcribeAudioGoogleCloud(videoFile, langCode, (s) => setStatus(s));
        if (!wordTimings.length) throw new Error('Transcript nahi mila — video mein clear audio hai?');
        const chunks = wordTimingsToChunks(wordTimings);
        await processTranscript(chunks, videoFile.name.replace(/\.[^.]+$/, ''), pendingFileUrl);
      } catch (e: any) {
        setError(e.message || 'Kuch error aaya');
        setPhase('input');
      }
    } else if (inputMode === 'youtube' && ytUrl.trim()) {
      try {
        setStatus('YouTube transcript fetch ho raha hai…');
        const res = await fetch('/api/youtube/transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: ytUrl.trim(), language: 'auto' }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Transcript nahi mila');
        const rawSegs: { text: string; start: number; end: number }[] =
          (data.segments ?? data.transcript ?? []).map((s: any) => ({
            text: s.text, start: s.start, end: s.start + (s.duration ?? 3),
          }));
        if (!rawSegs.length) throw new Error('Is video ka transcript available nahi hai');
        await processTranscript(rawSegs, data.title ?? '', null);
      } catch (e: any) {
        setError(e.message || 'Kuch error aaya');
        setPhase('input');
      }
    } else {
      setError('Pehle video upload karo ya YouTube URL daalo');
      setPhase('input');
    }
  }, [inputMode, isFileMode, videoFile, pendingFileUrl, ytUrl, language, processTranscript]);

  const handleDownload = useCallback(async (idx: number) => {
    const seg = segments[idx];
    const title = clipTitles[idx] ?? seg.title;

    if (!videoUrl && inputMode === 'youtube') {
      // YouTube — render karaoke-style clip (transcript over dark bg)
      toast.info('YouTube video render ho raha hai (karaoke style)…');
    } else if (!videoUrl) {
      toast.error('Video file upload karo pehle'); return;
    }

    setRenderingIdx(idx);
    setRenderProgress(0);
    try {
      const blob = await renderClip(videoUrl, seg.start, seg.end, title, transcript, setRenderProgress, seg.hook);
      setRenderProgress(100);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${title.slice(0, 40).replace(/[^a-z0-9]/gi, '_')}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast.success('Clip download ho gayi!');
    } catch (e: any) {
      toast.error(e.message || 'Render failed');
    } finally {
      setRenderingIdx(null);
      setRenderProgress(0);
    }
  }, [segments, clipTitles, videoUrl, transcript, inputMode]);

  // ── Download ALL clips as a numbered ZIP + titles.txt ──
  const handleDownloadZip = useCallback(async () => {
    if (!videoUrl) { toast.error('Video file chahiye ZIP ke liye'); return; }
    if (!segments.length) return;

    setZipping(true);
    setZipDone(0);
    try {
      const entries: ZipEntry[] = [];
      const titleLines: string[] = [];
      const pad = (n: number) => String(n).padStart(2, '0');
      let failed = 0;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const title = clipTitles[i] ?? seg.title;
        setZipStatus(`Clip ${i + 1}/${segments.length} render ho rahi hai…`);
        setRenderingIdx(i);
        setRenderProgress(0);

        // One failed clip must not abort the whole batch — skip and continue.
        let buf: Uint8Array | null = null;
        try {
          const blob = await renderClip(videoUrl, seg.start, seg.end, title, transcript, setRenderProgress, seg.hook);
          buf = new Uint8Array(await blob.arrayBuffer());
        } catch {
          failed++;
        }

        if (buf) {
          const safe = title.slice(0, 50).replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
          entries.push({ name: `${pad(i + 1)}_${safe}.webm`, data: buf });
        }

        const hashtags = (clipHashtags[i] ?? []).join(' ');
        titleLines.push(
          `${pad(i + 1)}. ${title}${buf ? '' : '   [render failed — skipped]'}`,
          `   ⏱ ${fmtTime(seg.start)} – ${fmtTime(seg.end)}  (${Math.round(seg.end - seg.start)}s)`,
          hashtags ? `   ${hashtags}` : '',
          '',
        );
        setZipDone(i + 1);
      }

      if (!entries.length) throw new Error('Koi bhi clip render nahi hui — dobara try karo');

      // titles.txt
      const header = `${videoTitle || 'Movie'} — Viral Clips\n${'='.repeat(40)}\n\n`;
      entries.push({ name: 'titles.txt', data: new TextEncoder().encode(header + titleLines.join('\n')) });

      setZipStatus('ZIP file ban rahi hai…');
      const zip = createZip(entries);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zip);
      a.download = `${(videoTitle || 'movie').slice(0, 40).replace(/[^a-z0-9]/gi, '_')}_clips.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      const ok = entries.length - 1; // minus titles.txt
      toast.success(failed > 0
        ? `${ok} clips ZIP me — ${failed} render fail hui`
        : `${ok} clips ZIP download ho gayi!`);
    } catch (e: any) {
      toast.error(e.message || 'ZIP banane mein error');
    } finally {
      setZipping(false);
      setZipStatus('');
      setRenderingIdx(null);
      setRenderProgress(0);
    }
  }, [videoUrl, segments, clipTitles, clipHashtags, transcript, videoTitle]);

  const copyTimestamps = useCallback((idx: number) => {
    const seg = segments[idx];
    const title = clipTitles[idx] ?? seg.title;
    const hashtags = (clipHashtags[idx] ?? []).join(' ');
    const text = `${title}\n\n⏱ ${fmtTime(seg.start)} – ${fmtTime(seg.end)}\n\n${hashtags}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
    toast.success('Info copied!');
  }, [segments, clipTitles, clipHashtags]);

  const reset = () => {
    setPhase('input');
    setSegments([]);
    setTranscript([]);
    setClipTitles({});
    setClipHashtags({});
    setVideoFile(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (pendingFileUrl) URL.revokeObjectURL(pendingFileUrl);
    setVideoUrl(null);
    setPendingFileUrl(null);
    setError('');
    setStatus('');
    setYtUrl('');
  };

  const isReady = isFileMode ? !!videoFile : !!ytUrl.trim();

  // ── Input Screen ────────────────────────────────────────────────────────────
  if (phase === 'input') {
    return (
      <div className="min-h-screen bg-[#050505] text-white">
        <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <button onClick={onBack} className="p-2 rounded-lg hover:bg-white/8 text-gray-400 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold">Shorts Studio</h1>
              <p className="text-xs text-gray-500">Video, YouTube ya poori movie se viral clips</p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Mode Toggle */}
          <div className="grid grid-cols-3 gap-2 mb-5 p-1 bg-white/5 rounded-xl">
            {([
              { m: 'upload' as const, icon: Upload, label: 'Video' },
              { m: 'youtube' as const, icon: Youtube, label: 'YouTube' },
              { m: 'movie' as const, icon: Film, label: 'Movie' },
            ]).map(({ m, icon: Icon, label }) => (
              <button
                key={m}
                onClick={() => { setInputMode(m); setVideoFile(null); setYtUrl(''); if (pendingFileUrl) { URL.revokeObjectURL(pendingFileUrl); setPendingFileUrl(null); } }}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${inputMode === m ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' : 'text-gray-400 hover:text-white'}`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Movie mode banner */}
          {isMovie && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-purple-500/8 border border-purple-500/20 text-xs text-purple-300/90 leading-relaxed">
              🎬 Poori movie upload karo — AI saare viral moments dhundega, har clip Reels-length cut karega, aur sab ek ZIP me numbered + titles.txt ke saath milegi.
            </div>
          )}

          {/* ── STEP 1: Upload / URL ── */}
          <div className="mb-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Step 1 — Source</p>

            {isFileMode && (
              videoFile ? (
                /* File selected — show pill with change option */
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/25">
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                    {isMovie ? <Film size={15} className="text-green-400" /> : <Scissors size={15} className="text-green-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-300 truncate">{videoFile.name}</p>
                    <p className="text-xs text-gray-500">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/8 transition-colors shrink-0"
                  >
                    Change
                  </button>
                  <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/12 rounded-2xl p-8 text-center cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-all"
                >
                  {isMovie ? <Film size={32} className="mx-auto mb-2 text-gray-500" /> : <Upload size={32} className="mx-auto mb-2 text-gray-500" />}
                  <p className="text-sm font-medium text-gray-300">{isMovie ? 'Poori movie file click karo' : 'Video file click karo'}</p>
                  <p className="text-xs text-gray-600 mt-1">MP4, MOV, AVI, MKV, WebM</p>
                  <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                </div>
              )
            )}

            {inputMode === 'youtube' && (
              <input
                type="url"
                value={ytUrl}
                onChange={e => setYtUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-purple-500/50 focus:outline-none"
              />
            )}
          </div>

          {/* ── STEP 2: Configure (always visible, but highlighted when ready) ── */}
          <div className={`mt-6 rounded-2xl border transition-all ${isReady ? 'border-white/12 bg-white/3' : 'border-white/6 bg-white/2 opacity-60'}`}>
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-4">Step 2 — Configure</p>

              {/* Clip Duration — non-movie modes */}
              {!isMovie && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-2">Clip Duration</p>
                  <div className="flex gap-2">
                    {([
                      { mode: 'short' as ClipMode, label: '⚡ Short', sub: '20–60 sec' },
                      { mode: 'long' as ClipMode, label: '🎯 Long', sub: '90s–6 min' },
                    ]).map(({ mode, label, sub }) => (
                      <button
                        key={mode}
                        onClick={() => setClipMode(mode)}
                        className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${clipMode === mode ? 'border-purple-500 bg-purple-500/15 text-purple-300' : 'border-white/8 bg-white/3 text-gray-400 hover:border-white/20 hover:text-white'}`}
                      >
                        <div>{label}</div>
                        <div className="text-xs opacity-55 mt-0.5">{sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Number of Clips — non-movie modes (movie finds as many as exist) */}
              {!isMovie && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-2">Number of Clips</p>
                  <div className="flex gap-2">
                    {([3, 5, 7] as const).map(n => (
                      <button
                        key={n}
                        onClick={() => setClipCount(n)}
                        className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-all ${clipCount === n ? 'border-purple-500 bg-purple-500/15 text-purple-300' : 'border-white/8 bg-white/3 text-gray-400 hover:border-white/20 hover:text-white'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reel Duration — movie mode only */}
              {isMovie && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-2">Max Reel Duration (per clip)</p>
                  <div className="flex gap-2">
                    {([
                      { val: 60 as const, label: '60 sec', sub: 'Tight & punchy' },
                      { val: 90 as const, label: '90 sec', sub: 'Reels max' },
                    ]).map(({ val, label, sub }) => (
                      <button
                        key={val}
                        onClick={() => setReelDuration(val)}
                        className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${reelDuration === val ? 'border-purple-500 bg-purple-500/15 text-purple-300' : 'border-white/8 bg-white/3 text-gray-400 hover:border-white/20 hover:text-white'}`}
                      >
                        <div>{label}</div>
                        <div className="text-xs opacity-55 mt-0.5">{sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Language (file modes only) */}
              {isFileMode && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-2">Audio Language</p>
                  <div className="flex gap-2">
                    {([
                      { val: 'en-US' as const, label: '🇺🇸 English' },
                      { val: 'hi-IN' as const, label: '🇮🇳 Hindi' },
                      { val: 'auto' as const, label: '🌐 Auto' },
                    ]).map(({ val, label }) => (
                      <button
                        key={val}
                        onClick={() => setLanguage(val)}
                        className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${language === val ? 'border-purple-500 bg-purple-500/15 text-purple-300' : 'border-white/8 bg-white/3 text-gray-400 hover:border-white/20 hover:text-white'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Find Clips Button */}
            <div className="px-4 pb-4">
              <button
                onClick={handleStart}
                disabled={!isReady}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-purple-600 hover:bg-purple-500 text-white transition-all disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30"
              >
                <Sparkles size={16} />
                {isMovie ? 'Find Viral Clips' : 'Find Best Clips'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Processing Screen ────────────────────────────────────────────────────────
  if (phase === 'processing') {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center mb-6">
          <Loader2 size={28} className="text-purple-400 animate-spin" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Processing...</h2>
        <p className="text-sm text-gray-400 text-center max-w-xs">{status || 'Thoda ruko…'}</p>
      </div>
    );
  }

  // ── Results Screen ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={reset} className="p-2 rounded-lg hover:bg-white/8 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold truncate">{videoTitle || 'Shorts Studio'}</h1>
            <p className="text-xs text-gray-500">{segments.length} clips • {isMovie ? `Reels ≤${reelDuration}s` : clipMode === 'short' ? '20–60s' : '90s–6min'}</p>
          </div>
          <button
            onClick={reset}
            className="p-2 rounded-lg hover:bg-white/8 text-gray-500 hover:text-white transition-colors"
            title="New video"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Download All (ZIP) — movie mode with uploaded video */}
        {isMovie && videoUrl && segments.length > 0 && (
          <button
            onClick={handleDownloadZip}
            disabled={zipping}
            className="w-full mb-5 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30"
          >
            {zipping ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {zipStatus || `Rendering ${zipDone}/${segments.length}…`}
              </>
            ) : (
              <>
                <Package size={16} />
                Download All {segments.length} Clips (ZIP)
              </>
            )}
          </button>
        )}

        {/* Clip Cards */}
        <div className="space-y-4">
          {segments.map((seg, idx) => {
            const title = clipTitles[idx] ?? seg.title;
            const hashtags = clipHashtags[idx] ?? [];
            const isLoadingMeta = metaLoading.has(idx);
            const isRendering = renderingIdx === idx;

            return (
              <div key={idx} className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
                {/* Clip Header */}
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Clip {idx + 1}</span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {fmtTime(seg.start)} → {fmtTime(seg.end)} · {Math.round(seg.end - seg.start)}s
                    </span>
                  </div>

                  {/* Title */}
                  {isLoadingMeta ? (
                    <div className="h-5 w-3/4 bg-white/8 rounded animate-pulse mt-1" />
                  ) : (
                    <input
                      type="text"
                      value={title}
                      onChange={e => setClipTitles(prev => ({ ...prev, [idx]: e.target.value }))}
                      className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none border-b border-transparent focus:border-white/20 pb-0.5 transition-colors"
                    />
                  )}
                </div>

                {/* Hashtags */}
                <div className="px-4 pb-3 min-h-[28px]">
                  {isLoadingMeta ? (
                    <div className="flex gap-1.5 flex-wrap">
                      {[70, 90, 60, 80].map(w => (
                        <div key={w} className="h-5 rounded-full bg-white/8 animate-pulse" style={{ width: w }} />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {hashtags.map((h, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/12 text-blue-400 border border-blue-500/20">
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="border-t border-white/6 flex">
                  {/* Copy Info */}
                  <button
                    onClick={() => copyTimestamps(idx)}
                    className="flex-1 py-3 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    {copiedIdx === idx ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                    {copiedIdx === idx ? 'Copied!' : 'Copy Info'}
                  </button>

                  {/* Download */}
                  <button
                    onClick={() => handleDownload(idx)}
                    disabled={isRendering || renderingIdx !== null}
                    className="flex-1 py-3 flex items-center justify-center gap-1.5 text-xs font-medium text-purple-300 hover:text-white hover:bg-purple-600/20 transition-all border-l border-white/6 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRendering ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        {renderProgress}%
                      </>
                    ) : (
                      <>
                        <Download size={13} />
                        Download Clip
                      </>
                    )}
                  </button>
                </div>

                {/* Render progress bar */}
                {isRendering && (
                  <div className="h-1 bg-white/5">
                    <div
                      className="h-full bg-purple-500 transition-all duration-200"
                      style={{ width: `${renderProgress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* YouTube note */}
        {!videoUrl && (
          <div className="mt-6 px-4 py-3 rounded-xl bg-yellow-500/8 border border-yellow-500/20 text-xs text-yellow-400">
            💡 YouTube clips will render as subtitle-style video (karaoke). Upload the video file for clips with actual video frames.
          </div>
        )}
      </div>
    </div>
  );
};

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default ShortsStudio;
