import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Play, Pause, Download, RotateCcw, ChevronLeft, ChevronRight,
  Loader2, CheckCircle, ImagePlus, X, Settings, Palette,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const BG_PRESETS = [
  { id: 'black',   label: 'Black',   value: '#000000' },
  { id: 'dark',    label: 'Dark',    value: '#0a0a0a' },
  { id: 'navy',    label: 'Night',   value: 'linear-gradient(135deg,#060d1a,#0a1628,#0d1f3c)' },
  { id: 'purple',  label: 'Violet',  value: 'linear-gradient(135deg,#1a0030,#3d0060,#0a0020)' },
  { id: 'sunset',  label: 'Sunset',  value: 'linear-gradient(135deg,#1a0038,#5c0030,#c0392b)' },
  { id: 'cosmic',  label: 'Cosmic',  value: 'linear-gradient(135deg,#0a0028,#200060,#4a0080)' },
  { id: 'forest',  label: 'Forest',  value: 'linear-gradient(135deg,#001a0a,#003010,#00501a)' },
  { id: 'ocean',   label: 'Ocean',   value: 'linear-gradient(135deg,#001a2c,#003b6e,#005f8a)' },
];

const AVATAR_COLORS = [
  '#8B5CF6','#EC4899','#F97316','#14B8A6','#3B82F6','#EF4444','#10B981','#F59E0B',
  '#6366F1','#D946EF','#0EA5E9','#22C55E',
];

const USERNAMES = [
  'v3lvetring_','tyler_gies_','doubledadid69','leafybean','not_a_bot_42','memequeen99',
  'RealOne_7','AnonymousJi','LyricsLover','MusicManiac','SoundSeeker','DarkHumor101',
  'sarcasm_king','funny_or_die','DesiVibes','UrbanPoet','NightOwl_SK','BombayBoy99',
];

const TIME_LABELS = ['2w','4w','1 month','3 months','6 months','22w','34w','1 year','21w','8w'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLyrics(text: string) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map((l, i) => ({ isSection: l.startsWith('['), text: l, lineIdx: i }));
}

function avatarColor(username: string): string {
  let n = 0;
  for (const c of username) n += c.charCodeAt(0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function getInitial(u: string) { return u.charAt(0).toUpperCase(); }

// ── YouTube Comment Overlay Card ───────────────────────────────────────────────

interface CommentProps {
  line: string;
  username: string;
  timeAgo: string;
  likes: number;
  isNext?: boolean;
}

const CommentOverlay: React.FC<CommentProps> = ({ line, username, timeAgo, likes, isNext }) => {
  const col = avatarColor(username);
  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 12,
        padding: '10px 14px',
        transition: 'all 0.4s cubic-bezier(.4,0,.2,1)',
        opacity: isNext ? 0.28 : 1,
        transform: isNext ? 'translateY(6px) scale(0.97)' : 'translateY(0) scale(1)',
        boxShadow: isNext ? 'none' : '0 4px 24px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, minWidth: 36, borderRadius: '50%',
          background: col, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0,
        }}>
          {getInitial(username)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Username + time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>@{username}</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{timeAgo}</span>
          </div>
          {/* Lyric as comment */}
          <p style={{ fontSize: 14, color: '#1f2937', lineHeight: 1.45, margin: 0, fontWeight: 400 }}>{line}</p>
          {/* Actions */}
          <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12, color: '#6b7280' }}>
            <span>👍 {likes}</span>
            <span>👎</span>
            <span style={{ fontWeight: 500 }}>Reply</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

interface Props {
  lyricsText: string;
  audioUrl?: string;
  songStyle?: string;
  onBack: () => void;
}

const LyricsCanvas: React.FC<Props> = ({ lyricsText, audioUrl = '', songStyle = '', onBack }) => {
  const lines = parseLyrics(lyricsText);
  const lyricsLines = lines.filter(l => !l.isSection);

  // Stable derived data
  const [usernames] = useState(() => lyricsLines.map((_, i) => USERNAMES[i % USERNAMES.length]));
  const [timings]   = useState(() => lyricsLines.map((_, i) => TIME_LABELS[i % TIME_LABELS.length]));
  const [likes]     = useState(() => lyricsLines.map(() => Math.floor(Math.random() * 8900 + 100)));

  // State
  const [bgImage, setBgImage]         = useState('');
  const [bgPreset, setBgPreset]       = useState(BG_PRESETS[0]);
  const [customColor, setCustomColor] = useState('');
  const [overlayText, setOverlayText] = useState('CHAT MUSIC');
  const [commentPos, setCommentPos]   = useState<'bottom-left' | 'bottom-right' | 'bottom-center'>('bottom-left');
  const [showPanel, setShowPanel]     = useState(false);
  const [currentIdx, setCurrentIdx]   = useState(0);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [speed, setSpeed]             = useState(2500);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDone, setExportDone]   = useState(false);

  const audioRef    = useRef<HTMLAudioElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveBg = bgImage ? undefined : (customColor || bgPreset.value);

  // Auto-advance
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentIdx(prev => {
          if (prev >= lyricsLines.length - 1) { setIsPlaying(false); audioRef.current?.pause(); return prev; }
          return prev + 1;
        });
      }, speed);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, speed, lyricsLines.length]);

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
    setCurrentIdx(0);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setBgImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // 16:9 video export (1920×1080)
  const handleExport = useCallback(async () => {
    setIsExporting(true); setExportDone(false);
    try {
      const W = 1920, H = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      const stream = canvas.captureStream(30);
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

      for (let i = 0; i < lyricsLines.length; i++) {
        // Background
        if (bgImg) {
          ctx.drawImage(bgImg, 0, 0, W, H);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(0, 0, W, H);
        } else {
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
          const grd = ctx.createLinearGradient(0, 0, W, H);
          grd.addColorStop(0, '#1a0030'); grd.addColorStop(1, '#0a0020');
          ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
        }

        // Overlay label
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.roundRect(40, 40, 340, 70, 12); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(overlayText, 60, 75);

        // Comment card (bottom-left)
        const cardX = 40, cardW = Math.min(700, W - 80), cardH = 180;
        const cardY = H - cardH - 60;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 16); ctx.fill();

        // Avatar
        ctx.fillStyle = avatarColor(usernames[i]);
        ctx.beginPath(); ctx.arc(cardX + 50, cardY + 50, 26, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(getInitial(usernames[i]), cardX + 50, cardY + 50);

        // Username + time
        ctx.fillStyle = '#111827'; ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('@' + usernames[i], cardX + 88, cardY + 42);
        ctx.fillStyle = '#9ca3af'; ctx.font = '18px Arial';
        ctx.fillText(timings[i], cardX + 88, cardY + 68);

        // Lyric text
        ctx.fillStyle = '#1f2937'; ctx.font = '24px Arial';
        const maxW = cardW - 110;
        const words = lyricsLines[i].text.split(' ');
        let ln = '', lineY = cardY + 100;
        for (const word of words) {
          const test = ln ? ln + ' ' + word : word;
          if (ctx.measureText(test).width > maxW && ln) {
            ctx.fillText(ln, cardX + 88, lineY); ln = word; lineY += 32;
          } else { ln = test; }
        }
        if (ln) ctx.fillText(ln, cardX + 88, lineY);

        // Footer
        ctx.fillStyle = '#6b7280'; ctx.font = '18px Arial';
        ctx.fillText(`👍 ${likes[i]}    👎    Reply`, cardX + 88, cardY + 160);

        await new Promise(r => setTimeout(r, speed));
      }

      recorder.stop();
      await new Promise(r => { recorder.onstop = r; });
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `lyrics_${Date.now()}.webm`; a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
    } catch (err: any) {
      alert('Export failed: ' + err.message);
    } finally { setIsExporting(false); }
  }, [lyricsLines, usernames, timings, likes, bgImage, overlayText, speed]);

  const cur  = lyricsLines[currentIdx];
  const next = lyricsLines[currentIdx + 1];

  const commentAlign = commentPos === 'bottom-right' ? { right: 16 }
    : commentPos === 'bottom-center' ? { left: '50%', transform: 'translateX(-50%)' }
    : { left: 16 };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 flex flex-col overflow-hidden">

      {/* ── Mobile top bar ─────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-3 sm:px-4 h-14 bg-[#050505]/95 backdrop-blur-xl border-b border-white/5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors active:scale-95"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline text-sm">Back</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600 uppercase tracking-widest font-semibold hidden md:block">
            {songStyle || 'Lyrics'} Canvas · 16:9
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Settings toggle */}
          <button
            onClick={() => setShowPanel(p => !p)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-all active:scale-95 ${showPanel ? 'border-purple-500/50 text-purple-400 bg-purple-500/10' : 'border-white/10 text-gray-500 hover:text-gray-300'}`}
          >
            <Settings size={14} />
            <span className="hidden sm:inline">Customize</span>
          </button>

          {/* Export */}
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

      {/* ── Main layout (below fixed top bar) ─────────────────── */}
      <div className="flex flex-1 pt-14 overflow-hidden">

        {/* ── Canvas area ───────────────────────────────────────── */}
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
              {/* Slight dark overlay when image is set */}
              {bgImage && (
                <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.22)' }} />
              )}

              {/* ── "CHAT MUSIC" overlay label (top-left) ── */}
              {overlayText && (
                <div
                  className="absolute top-3 sm:top-4 left-3 sm:left-4 select-none"
                  style={{
                    background: 'rgba(0,0,0,0.60)',
                    borderRadius: 8,
                    padding: '4px 12px',
                    backdropFilter: 'blur(6px)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: '"Arial Black", Impact, sans-serif',
                      fontWeight: 900,
                      fontSize: 'clamp(10px, 2.2vw, 22px)',
                      color: '#ffffff',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                    }}
                  >
                    {overlayText}
                  </span>
                </div>
              )}

              {/* ── YouTube comment overlay (bottom) ── */}
              <div
                className="absolute"
                style={{
                  bottom: 12,
                  width: 'clamp(260px, 55%, 480px)',
                  ...commentAlign,
                }}
              >
                <div className="space-y-2">
                  {/* Next comment (faded, behind) */}
                  {next && (
                    <CommentOverlay
                      line={next.text}
                      username={usernames[currentIdx + 1] || ''}
                      timeAgo={timings[currentIdx + 1] || ''}
                      likes={likes[currentIdx + 1] || 50}
                      isNext
                    />
                  )}
                  {/* Active comment */}
                  {cur && (
                    <CommentOverlay
                      line={cur.text}
                      username={usernames[currentIdx] || ''}
                      timeAgo={timings[currentIdx] || ''}
                      likes={likes[currentIdx] || 100}
                    />
                  )}
                </div>
              </div>

              {/* Progress bar inside frame (bottom edge) */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${((currentIdx + 1) / lyricsLines.length) * 100}%` }}
                />
              </div>
            </div>

            {/* ── Playback controls (below frame) ── */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setCurrentIdx(p => Math.max(0, p - 1))}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-white/10 text-gray-400 hover:text-white hover:border-white/25 flex items-center justify-center transition-all active:scale-95"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={reset}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-white/10 text-gray-400 hover:text-white hover:border-white/25 flex items-center justify-center transition-all active:scale-95"
              >
                <RotateCcw size={15} />
              </button>
              <button
                onClick={togglePlay}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-900/40 active:scale-95 transition-all"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
              </button>
              <button
                onClick={() => setCurrentIdx(p => Math.min(lyricsLines.length - 1, p + 1))}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-white/10 text-gray-400 hover:text-white hover:border-white/25 flex items-center justify-center transition-all active:scale-95"
              >
                <ChevronRight size={18} />
              </button>
              <span className="text-xs text-gray-600 ml-1 tabular-nums">
                {currentIdx + 1} / {lyricsLines.length}
              </span>
            </div>
          </div>

          {/* ── All lyrics list ── */}
          <div className="w-full space-y-1" style={{ maxWidth: 900 }}>
            <div className="text-[10px] text-gray-700 uppercase tracking-widest font-semibold mb-2">All Lines</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {lyricsLines.map((line, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIdx(i)}
                  className={`text-left text-xs px-3 py-2 rounded-lg transition-all ${i === currentIdx ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-gray-600 hover:text-gray-300 hover:bg-white/4 border border-transparent'}`}
                >
                  <span className="text-gray-700 mr-1.5">{i + 1}.</span>{line.text}
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* ── Customize Panel (right on desktop, overlay on mobile) ─ */}
        <>
          {/* Mobile backdrop */}
          {showPanel && (
            <div
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setShowPanel(false)}
            />
          )}

          {/* Panel */}
          <aside className={`
            fixed lg:static inset-y-0 right-0 z-50 w-72 sm:w-80 bg-[#0a0a0a] border-l border-white/5
            flex flex-col overflow-y-auto
            transition-transform duration-300 ease-in-out
            ${showPanel ? 'translate-x-0' : 'translate-x-full lg:translate-x-0 lg:hidden'}
            pt-14 lg:pt-0
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
                    <div className="absolute bottom-2 left-2 text-[10px] text-white/60 bg-black/60 rounded px-1.5 py-0.5">Image loaded ✓</div>
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

              {/* BG Color Presets */}
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
                <div>
                  <div className="text-[10px] text-gray-700 mb-1">Custom color</div>
                  <input
                    type="color"
                    value={customColor || '#000000'}
                    onChange={e => { setCustomColor(e.target.value); setBgImage(''); }}
                    className="w-full h-9 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                  />
                </div>
              </div>

              {/* Overlay Title */}
              <div className="space-y-2">
                <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Title Overlay</div>
                <input
                  value={overlayText}
                  onChange={e => setOverlayText(e.target.value)}
                  placeholder="CHAT MUSIC"
                  className="w-full bg-[#1a1a1a] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500/40"
                />
              </div>

              {/* Comment Position */}
              <div className="space-y-2">
                <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Comment Position</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['bottom-left','bottom-center','bottom-right'] as const).map(pos => (
                    <button
                      key={pos}
                      onClick={() => setCommentPos(pos)}
                      className={`text-[10px] py-2 rounded-lg border transition-all ${commentPos === pos ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-white/8 text-gray-600 hover:text-gray-400'}`}
                    >
                      {pos === 'bottom-left' ? '← Left' : pos === 'bottom-center' ? '— Center' : 'Right →'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed */}
              <div className="space-y-2">
                <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Line Speed</div>
                {[{ label: 'Slow — 4s', ms: 4000 }, { label: 'Normal — 2.5s', ms: 2500 }, { label: 'Fast — 1.5s', ms: 1500 }].map(sp => (
                  <button
                    key={sp.ms}
                    onClick={() => setSpeed(sp.ms)}
                    className={`w-full text-xs py-2 rounded-xl border transition-all ${speed === sp.ms ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-white/8 text-gray-600 hover:text-gray-400'}`}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </>
      </div>

      {/* Audio element */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />}
    </div>
  );
};

export default LyricsCanvas;
