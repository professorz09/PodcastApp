import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Play, Pause, Download, RotateCcw, ChevronLeft, ChevronRight,
  Loader2, CheckCircle, ImagePlus, X, Settings, Palette, ThumbsUp,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────

const BG_PRESETS = [
  { id: 'black',  label: 'Black',  value: '#000000' },
  { id: 'dark',   label: 'Dark',   value: '#0a0a0a' },
  { id: 'navy',   label: 'Night',  value: 'linear-gradient(135deg,#060d1a,#0a1628,#0d1f3c)' },
  { id: 'purple', label: 'Violet', value: 'linear-gradient(135deg,#1a0030,#3d0060,#0a0020)' },
  { id: 'sunset', label: 'Sunset', value: 'linear-gradient(135deg,#1a0038,#5c0030,#c0392b)' },
  { id: 'cosmic', label: 'Cosmic', value: 'linear-gradient(135deg,#0a0028,#200060,#4a0080)' },
  { id: 'forest', label: 'Forest', value: 'linear-gradient(135deg,#001a0a,#003010,#00501a)' },
  { id: 'ocean',  label: 'Ocean',  value: 'linear-gradient(135deg,#001a2c,#003b6e,#005f8a)' },
];

const AVATAR_COLORS = [
  '#8B5CF6','#EC4899','#F97316','#14B8A6','#3B82F6',
  '#EF4444','#10B981','#F59E0B','#6366F1','#D946EF',
];

const USERNAMES = [
  'v3lvetring_','tyler_gies_','doubledavid69','leafybean','not_a_bot_42',
  'memequeen99','RealOne_7','AnonymousJi','LyricsLover','MusicManiac',
  'sarcasm_king','funny_or_die','DesiVibes','UrbanPoet','NightOwl_SK',
  'BombayBoy99','Sharma__ji','desi_roaster','PunchlinesOnly','viral.raj',
];

const TIME_LABELS = [
  '2w','4w','1 month','3 months','6 months','22w','34w','1 year','21w','8w',
  '2 months','11w','5w','18w','7 months',
];

const LIKES = [
  12,47,103,8,251,36,1200,88,5,322,74,17,540,9,2100,
];

// Animation modes cycle
type AnimMode = 'partial' | 'all' | 'wbw';
const ANIM_MODES: AnimMode[] = ['wbw', 'all', 'partial'];

const WORD_MS = 280;  // ms per word in wbw mode

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseLyrics(text: string) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map((l, i) => ({ isSection: l.startsWith('['), text: l, lineIdx: i }));
}

function seededPick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed * 2654435761) % arr.length];
}

// ── YouTube Comment Card ──────────────────────────────────────────────────────

interface CommentCardProps {
  text: string;           // currently visible text
  lineIdx: number;        // used to seed username/avatar
  animMode: AnimMode;
  phase: 'partial' | 'full'; // for partial mode
}

const CommentCard: React.FC<CommentCardProps> = ({ text, lineIdx, animMode, phase }) => {
  const username  = seededPick(USERNAMES,    lineIdx);
  const avatarBg  = seededPick(AVATAR_COLORS, lineIdx);
  const timeAgo   = seededPick(TIME_LABELS,   lineIdx + 5);
  const likes     = seededPick(LIKES,         lineIdx + 3);
  const initial   = username.charAt(0).toUpperCase();

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 12,
        padding: '10px 14px 8px 14px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        boxShadow: '0 4px 24px rgba(0,0,0,0.28)',
        maxWidth: '92%',
        minWidth: 220,
        position: 'relative',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: avatarBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: 16,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {initial}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Username + time */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#0f0f0f', fontFamily: 'sans-serif' }}>
            {username}
          </span>
          <span style={{ fontSize: 11, color: '#909090', fontFamily: 'sans-serif' }}>
            {timeAgo}
          </span>
        </div>

        {/* Comment text */}
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.45,
            color: '#0f0f0f',
            fontFamily: 'sans-serif',
            fontWeight: 400,
            wordBreak: 'break-word',
            minHeight: 20,
          }}
        >
          {text}
        </p>

        {/* Reply + likes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#606060' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 10v12"/><path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>
            <span style={{ fontSize: 11, fontFamily: 'sans-serif' }}>{likes.toLocaleString()}</span>
          </div>
          <span style={{ fontSize: 11, color: '#606060', fontFamily: 'sans-serif', cursor: 'pointer' }}>Reply</span>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

type TimedWord = { word: string; start: number; end: number };

interface Props {
  lyricsText: string;
  audioUrl?: string;
  songStyle?: string;
  wordTimings?: TimedWord[];
  onBack: () => void;
}

const LyricsCanvas: React.FC<Props> = ({ lyricsText, audioUrl = '', songStyle = '', wordTimings = [], onBack }) => {
  const lines       = parseLyrics(lyricsText);
  const lyricsLines = lines.filter(l => !l.isSection);

  // ── Build STT line mapping — content-based (handles word-count drift) ──
  const lineStartWordIdx = React.useMemo<number[]>(() => {
    if (!wordTimings.length || !lyricsLines.length) return [];

    // Normalize word for comparison: lowercase, remove all non-alphanumeric
    // (works for Latin, Devanagari, Arabic scripts)
    const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

    const sttNorm = wordTimings.map(wt => norm(wt.word));

    const result: number[] = [];
    let searchFrom = 0;   // STT index to start next search from

    for (let li = 0; li < lyricsLines.length; li++) {
      const lineWords = lyricsLines[li].text.split(/\s+/).filter(Boolean);

      if (!lineWords.length) {
        result.push(searchFrom);
        continue;
      }

      // Expected position based on naive word count (fallback)
      const expectedPos = searchFrom;

      // Look for the first 1-2 lyric words in a window of ±12 STT words
      const firstNorm  = norm(lineWords[0]);
      const secondNorm = lineWords[1] ? norm(lineWords[1]) : '';
      const windowStart = Math.max(0, expectedPos - 4);
      const windowEnd   = Math.min(sttNorm.length - 1, expectedPos + 14);

      let matchIdx = -1;
      let singleMatchIdx = -1;

      for (let si = windowStart; si <= windowEnd; si++) {
        if (sttNorm[si] === firstNorm) {
          if (!secondNorm || sttNorm[si + 1] === secondNorm) {
            matchIdx = si;   // strong 2-word match → take it immediately
            break;
          }
          if (singleMatchIdx < 0) singleMatchIdx = si;  // weak 1-word match
        }
      }

      const best = matchIdx >= 0 ? matchIdx
                 : singleMatchIdx >= 0 ? singleMatchIdx
                 : searchFrom;  // no match → keep sequential estimate

      result.push(best);
      // Advance searchFrom by average of lyric word count (keeps next window reasonable)
      searchFrom = best + Math.max(1, lineWords.length);
    }

    return result;
  }, [wordTimings, lyricsLines]);

  // ── UI state ──
  const [bgImage, setBgImage]         = useState('');
  const [bgPreset, setBgPreset]       = useState(BG_PRESETS[0]);
  const [customColor, setCustomColor] = useState('');
  const [showPanel, setShowPanel]     = useState(false);

  // ── Playback ──
  const [currentIdx, setCurrentIdx]   = useState(0);
  const [wordIdx, setWordIdx]         = useState(0);
  const [animPhase, setAnimPhase]     = useState<'partial' | 'full'>('partial');
  const [isPlaying, setIsPlaying]     = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDone, setExportDone]   = useState(false);

  const audioRef     = useRef<HTMLAudioElement>(null);
  const wordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef       = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveBg = bgImage ? undefined : (customColor || bgPreset.value);

  // Current line
  const currentLine  = lyricsLines[currentIdx];
  const currentWords = currentLine ? currentLine.text.split(' ') : [];
  const totalWords   = currentWords.length;
  const animMode     = ANIM_MODES[currentIdx % ANIM_MODES.length];

  // ── Compute displayed text based on animMode + phase/wordIdx ──
  let displayedText = '';
  if (animMode === 'wbw') {
    displayedText = currentWords.slice(0, Math.max(1, wordIdx)).join(' ');
  } else if (animMode === 'all') {
    displayedText = currentLine?.text || '';
  } else if (animMode === 'partial') {
    const half = Math.max(1, Math.ceil(totalWords / 2));
    displayedText = animPhase === 'partial'
      ? currentWords.slice(0, half).join(' ')
      : currentLine?.text || '';
  }

  // ── Reset animation state on line change ──
  useEffect(() => {
    setWordIdx(0);
    setAnimPhase('partial');
  }, [currentIdx]);

  // ── STT-synced rAF loop (when wordTimings are present) ──
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!isPlaying || !wordTimings.length || !lineStartWordIdx.length) return;

    const tick = () => {
      const t = audioRef.current?.currentTime ?? 0;

      // Find last STT word whose start <= t
      let wi = -1;
      for (let i = 0; i < wordTimings.length; i++) {
        if (wordTimings[i].start <= t) wi = i;
        else break;
      }
      if (wi < 0) { rafRef.current = requestAnimationFrame(tick); return; }

      // Which lyric line does this word belong to?
      let li = 0;
      for (let i = 0; i < lineStartWordIdx.length - 1; i++) {
        if (wi >= lineStartWordIdx[i + 1]) li = i + 1;
        else break;
      }

      const wordsInLine = wi - lineStartWordIdx[li] + 1;
      setCurrentIdx(li);
      setWordIdx(wordsInLine);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, wordTimings, lineStartWordIdx]);

  // ── Timer animation engine (fallback when no STT timings) ──
  useEffect(() => {
    if (wordTimerRef.current) clearInterval(wordTimerRef.current);
    if (lineTimerRef.current) clearTimeout(lineTimerRef.current);
    // Skip if STT mode is active
    if (!isPlaying || !currentLine || wordTimings.length > 0) return;

    const advanceLine = () => {
      setCurrentIdx(ci => {
        if (ci >= lyricsLines.length - 1) {
          setIsPlaying(false);
          audioRef.current?.pause();
          return ci;
        }
        return ci + 1;
      });
    };

    if (animMode === 'wbw') {
      // Word by word, then pause, then next line
      wordTimerRef.current = setInterval(() => {
        setWordIdx(prev => {
          const next = prev + 1;
          if (next >= totalWords) {
            clearInterval(wordTimerRef.current!);
            lineTimerRef.current = setTimeout(advanceLine, 900);
          }
          return next;
        });
      }, WORD_MS);

    } else if (animMode === 'all') {
      // Show all at once, pause, then next line
      setWordIdx(totalWords);
      lineTimerRef.current = setTimeout(advanceLine, totalWords * 120 + 700);

    } else if (animMode === 'partial') {
      const half = Math.max(1, Math.ceil(totalWords / 2));
      // Show first half, pause, show full, pause, next line
      lineTimerRef.current = setTimeout(() => {
        setAnimPhase('full');
        lineTimerRef.current = setTimeout(advanceLine, 900);
      }, half * WORD_MS + 400);
    }

    return () => {
      if (wordTimerRef.current) clearInterval(wordTimerRef.current);
      if (lineTimerRef.current) clearTimeout(lineTimerRef.current);
    };
  }, [isPlaying, currentIdx, animMode, totalWords, lyricsLines.length]);

  const togglePlay = () => {
    if (!isPlaying && audioUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } else if (isPlaying) {
      audioRef.current?.pause();
    }
    setIsPlaying(p => !p);
  };

  const reset = () => {
    setIsPlaying(false);
    setCurrentIdx(0); setWordIdx(0); setAnimPhase('partial');
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  };

  const goTo = (idx: number) => {
    setCurrentIdx(idx);
    setWordIdx(0);
    setAnimPhase('partial');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setBgImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setIsExporting(true); setExportDone(false);
    try {
      const W = 1920, H = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      const stream   = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.start();

      // Preload bg image
      let bgImg: HTMLImageElement | null = null;
      if (bgImage) {
        bgImg = new Image();
        bgImg.src = bgImage;
        await new Promise(r => { bgImg!.onload = r; bgImg!.onerror = r; });
      }

      const cardH   = 180;
      const cardPad = 40;
      const cardY   = H - cardH - cardPad;

      const drawBg = () => {
        if (bgImg) {
          ctx.drawImage(bgImg, 0, 0, W, H);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(0, 0, W, H);
        } else {
          const grd = ctx.createLinearGradient(0, 0, W, H);
          grd.addColorStop(0, '#0a0028'); grd.addColorStop(1, '#1a0040');
          ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
        }
      };

      const drawCard = (text: string, lineI: number) => {
        const avatarColor = AVATAR_COLORS[Math.abs(lineI * 2654435761) % AVATAR_COLORS.length];
        const username    = USERNAMES[Math.abs(lineI * 2654435761) % USERNAMES.length];
        const timeAgo     = TIME_LABELS[(lineI + 5) % TIME_LABELS.length];
        const likes       = LIKES[(lineI + 3) % LIKES.length];

        // Card background
        const cX = cardPad, cW = W - cardPad * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(cX + 4, cardY + 4, cW, cardH, 16);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(cX, cardY, cW, cardH, 16);
        ctx.fill();

        // Avatar
        const avX = cX + 30, avY = cardY + 30, avR = 28;
        ctx.beginPath();
        ctx.arc(avX, avY + avR, avR, 0, Math.PI * 2);
        ctx.fillStyle = avatarColor;
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(username.charAt(0).toUpperCase(), avX, avY + avR + 9);

        // Username + time
        const textX = avX + avR + 16;
        ctx.fillStyle = '#0f0f0f';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(username, textX, cardY + 44);
        ctx.fillStyle = '#909090';
        ctx.font = '18px sans-serif';
        ctx.fillText(timeAgo, textX + ctx.measureText(username).width + 12, cardY + 44);

        // Comment text
        ctx.fillStyle = '#0f0f0f';
        ctx.font = '24px sans-serif';
        ctx.fillText(text.slice(0, 100), textX, cardY + 82);

        // Reply
        ctx.fillStyle = '#606060';
        ctx.font = '18px sans-serif';
        ctx.fillText(`👍 ${likes}   Reply`, textX, cardY + 120);
      };

      for (let i = 0; i < lyricsLines.length; i++) {
        const words  = lyricsLines[i].text.split(' ');
        const mode   = ANIM_MODES[i % ANIM_MODES.length];
        const half   = Math.max(1, Math.ceil(words.length / 2));

        if (mode === 'wbw') {
          for (let w = 1; w <= words.length; w++) {
            drawBg();
            drawCard(words.slice(0, w).join(' '), i);
            await new Promise(r => setTimeout(r, WORD_MS));
          }
        } else if (mode === 'all') {
          drawBg();
          drawCard(lyricsLines[i].text, i);
          await new Promise(r => setTimeout(r, words.length * 120 + 700));
        } else {
          // partial → full
          drawBg();
          drawCard(words.slice(0, half).join(' '), i);
          await new Promise(r => setTimeout(r, half * WORD_MS + 400));
          drawBg();
          drawCard(lyricsLines[i].text, i);
          await new Promise(r => setTimeout(r, 900));
        }
        await new Promise(r => setTimeout(r, 800));
      }

      recorder.stop();
      await new Promise(r => { recorder.onstop = r; });
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `lyrics_${Date.now()}.webm`; a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
    } catch (err: any) {
      alert('Export failed: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  }, [lyricsLines, bgImage]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-3 sm:px-4 h-14 bg-[#050505]/95 backdrop-blur-xl border-b border-white/5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors active:scale-95">
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <span className="text-[10px] text-gray-700 uppercase tracking-widest font-semibold hidden md:block">
          Lyrics Canvas · 16:9
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPanel(p => !p)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-all active:scale-95 ${showPanel ? 'border-purple-500/50 text-purple-400 bg-purple-500/10' : 'border-white/10 text-gray-500 hover:text-gray-300'}`}
          >
            <Settings size={14} />
            <span className="hidden sm:inline">Customize</span>
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 text-xs bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white px-3 py-2 rounded-xl transition-all active:scale-95"
          >
            {isExporting ? <Loader2 size={13} className="animate-spin" /> : exportDone ? <CheckCircle size={13} /> : <Download size={13} />}
            <span className="hidden sm:inline">{isExporting ? 'Exporting…' : exportDone ? 'Saved!' : 'Export'}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 pt-14 overflow-hidden">

        {/* ── Canvas area ── */}
        <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-5 overflow-y-auto gap-4 min-w-0">

          {/* 16:9 Frame */}
          <div className="w-full" style={{ maxWidth: 900 }}>
            <div
              className="relative w-full overflow-hidden"
              style={{
                aspectRatio: '16 / 9',
                borderRadius: 16,
                background: bgImage ? `url(${bgImage}) center/cover no-repeat` : effectiveBg,
                boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 24px 64px rgba(0,0,0,0.7)',
              }}
            >
              {bgImage && <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.18)' }} />}

              {/* ── Comment card overlay ── */}
              <div
                className="absolute left-0 right-0 bottom-0 flex justify-start items-end pb-[3%] px-[3%]"
                style={{ zIndex: 10 }}
              >
                <CommentCard
                  text={displayedText}
                  lineIdx={currentIdx}
                  animMode={animMode}
                  phase={animPhase}
                />
              </div>

              {/* STT sync indicator — small dot only when live-synced */}
              {wordTimings.length > 0 && isPlaying && (
                <div className="absolute top-[3%] right-[3%] z-20 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[9px] text-white/40 font-semibold">LIVE SYNC</span>
                </div>
              )}

              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/20 z-20">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${((currentIdx + 1) / lyricsLines.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Playback controls */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => goTo(Math.max(0, currentIdx - 1))}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-white/10 text-gray-400 hover:text-white hover:border-white/25 flex items-center justify-center transition-all active:scale-95"
              >
                <ChevronLeft size={18} />
              </button>
              <button onClick={reset} className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-white/10 text-gray-400 hover:text-white hover:border-white/25 flex items-center justify-center transition-all active:scale-95">
                <RotateCcw size={15} />
              </button>
              <button
                onClick={togglePlay}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-900/40 active:scale-95 transition-all"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
              </button>
              <button
                onClick={() => goTo(Math.min(lyricsLines.length - 1, currentIdx + 1))}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-white/10 text-gray-400 hover:text-white hover:border-white/25 flex items-center justify-center transition-all active:scale-95"
              >
                <ChevronRight size={18} />
              </button>
              <span className="text-xs text-gray-600 ml-1 tabular-nums">
                {currentIdx + 1} / {lyricsLines.length}
              </span>
            </div>
          </div>

          {/* All lyrics list */}
          <div className="w-full space-y-1" style={{ maxWidth: 900 }}>
            <div className="text-[10px] text-gray-700 uppercase tracking-widest font-semibold mb-2">All Lines</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {lyricsLines.map((line, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`text-left text-xs px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${i === currentIdx ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-gray-600 hover:text-gray-300 hover:bg-white/4 border border-transparent'}`}
                >
                  <span className="text-gray-700 shrink-0">{i + 1}.</span>
                  <span className="truncate">{line.text}</span>
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* ── Customize Panel ── */}
        <>
          {showPanel && (
            <div className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setShowPanel(false)} />
          )}
          <aside className={`
            fixed lg:static inset-y-0 right-0 z-50 w-72 sm:w-80 bg-[#0a0a0a] border-l border-white/5
            flex flex-col overflow-y-auto transition-transform duration-300 ease-in-out
            ${showPanel ? 'translate-x-0' : 'translate-x-full lg:translate-x-0 lg:hidden'} pt-14 lg:pt-0
          `}>
            <div className="p-4 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Palette size={14} className="text-purple-400" />
                  <span className="text-sm font-semibold text-white">Customize</span>
                </div>
                <button onClick={() => setShowPanel(false)} className="lg:hidden text-gray-600 hover:text-white p-1">
                  <X size={16} />
                </button>
              </div>

              {/* Image Upload */}
              <div className="space-y-2">
                <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Background Image / Meme</div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                {bgImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-white/10">
                    <img src={bgImage} alt="bg" className="w-full h-28 object-cover" />
                    <button
                      onClick={() => setBgImage('')}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/80 rounded-full flex items-center justify-center text-white hover:bg-black"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-20 flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-white/10 rounded-xl text-gray-600 hover:text-gray-400 hover:border-white/20 transition-all active:scale-[0.98]"
                  >
                    <ImagePlus size={18} />
                    <span className="text-xs">Upload Image / Meme</span>
                  </button>
                )}
              </div>

              {/* BG Presets */}
              <div className="space-y-2">
                <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Background Color</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {BG_PRESETS.map(bg => (
                    <button
                      key={bg.id}
                      onClick={() => { setBgPreset(bg); setCustomColor(''); setBgImage(''); }}
                      title={bg.label}
                      style={{ background: bg.value }}
                      className={`h-9 rounded-lg border-2 text-[9px] font-semibold transition-all ${bgPreset.id === bg.id && !customColor && !bgImage ? 'border-white scale-105' : 'border-transparent hover:border-white/30'}`}
                    >
                      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] text-white/80">{bg.label}</span>
                    </button>
                  ))}
                </div>
                <input
                  type="color"
                  value={customColor || '#000000'}
                  onChange={e => { setCustomColor(e.target.value); setBgImage(''); }}
                  className="w-full h-9 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                />
              </div>

              {/* STT sync status */}
              {wordTimings.length > 0 && (
                <div className="flex items-start gap-2 px-3 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <span className="w-2 h-2 rounded-full bg-green-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-green-400">Live Sync Active</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{wordTimings.length} words synced — text audio ke saath bilkul match karega</div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </>
      </div>

      {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />}
    </div>
  );
};

export default LyricsCanvas;
