import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Play, Pause, Download, RotateCcw, ChevronLeft, ChevronRight,
  Palette, Loader2, Video, CheckCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type CanvasStyle = 'dark' | 'neon' | 'glass' | 'cinema' | 'paper';
type BgPreset = { id: string; label: string; value: string; isGradient: boolean };

interface StyleDef {
  id: CanvasStyle;
  label: string;
  emoji: string;
  bg: string;
  cardBg: string;
  cardBorder: string;
  nameCls: string;
  textCls: string;
  shadowCls: string;
}

const CANVAS_STYLES: StyleDef[] = [
  {
    id: 'dark', label: 'TikTok Dark', emoji: '🖤',
    bg: '#0a0a0a', cardBg: 'rgba(30,30,30,0.95)', cardBorder: 'rgba(255,255,255,0.08)',
    nameCls: 'text-purple-400', textCls: 'text-gray-100', shadowCls: 'shadow-black/60',
  },
  {
    id: 'neon', label: 'Neon City', emoji: '💜',
    bg: '#08001f', cardBg: 'rgba(20,5,50,0.92)', cardBorder: 'rgba(180,0,255,0.5)',
    nameCls: 'text-pink-400', textCls: 'text-cyan-100', shadowCls: 'shadow-purple-900/80',
  },
  {
    id: 'glass', label: 'Glass', emoji: '🔮',
    bg: 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)', cardBg: 'rgba(255,255,255,0.08)', cardBorder: 'rgba(255,255,255,0.18)',
    nameCls: 'text-blue-300', textCls: 'text-white', shadowCls: 'shadow-blue-900/60',
  },
  {
    id: 'cinema', label: 'Cinema', emoji: '🎬',
    bg: '#000000', cardBg: 'rgba(0,0,0,0.85)', cardBorder: 'rgba(255,215,0,0.4)',
    nameCls: 'text-yellow-400', textCls: 'text-yellow-50', shadowCls: 'shadow-yellow-900/40',
  },
  {
    id: 'paper', label: 'Vintage Paper', emoji: '📜',
    bg: '#f5f0e8', cardBg: 'rgba(255,252,245,0.97)', cardBorder: 'rgba(180,140,80,0.3)',
    nameCls: 'text-amber-700', textCls: 'text-stone-800', shadowCls: 'shadow-amber-900/20',
  },
];

const BG_PRESETS: BgPreset[] = [
  { id: 'black',   label: 'Black',    value: '#000000',  isGradient: false },
  { id: 'navy',    label: 'Night',    value: '#080818',  isGradient: false },
  { id: 'purple',  label: 'Deep Violet', value: 'linear-gradient(160deg,#1a0030,#0a0020)', isGradient: true },
  { id: 'sunset',  label: 'Sunset',   value: 'linear-gradient(160deg,#1a0038,#5c0030,#ff4000)', isGradient: true },
  { id: 'ocean',   label: 'Ocean',    value: 'linear-gradient(160deg,#001a2c,#003b6e,#005f8a)', isGradient: true },
  { id: 'forest',  label: 'Forest',   value: 'linear-gradient(160deg,#001a0a,#003010,#00501a)', isGradient: true },
  { id: 'cosmic',  label: 'Cosmic',   value: 'linear-gradient(160deg,#0a0028,#200060,#4a0080)', isGradient: true },
  { id: 'rose',    label: 'Rose',     value: 'linear-gradient(160deg,#1a000a,#400020,#800040)', isGradient: true },
  { id: 'white',   label: 'White',    value: '#f8f5f0',  isGradient: false },
  { id: 'sepia',   label: 'Sepia',    value: '#e8ddc8',  isGradient: false },
];

// avatar initials palette
const AVATAR_COLORS = [
  '#8B5CF6','#EC4899','#F97316','#14B8A6','#3B82F6','#EF4444','#10B981','#F59E0B',
];

// Random username list (for fun comment-style display)
const USERNAMES = [
  'Arjun_beats','Priya_vibes','RajeshRaps','SonaliStar','DesiDreamer','NightOwl_SK',
  'BombayBoy99','PunjabDiPari','Rohan_EDM','Aisha_Poetry','MumbaiMafia','DelliWala',
  'FakeNameXD','RealOne_7','AnonymousJi','LyricsLover','MusicManiac','SoundSeeker',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLyrics(text: string): { isSection: boolean; text: string; lineIdx: number }[] {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map((l, i) => ({ isSection: l.startsWith('['), text: l, lineIdx: i }));
}

function getAvatar(username: string): string {
  return username.charAt(0).toUpperCase();
}

function avatarColor(username: string): string {
  let n = 0;
  for (const c of username) n += c.charCodeAt(0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface CommentBoxProps {
  line: string;
  username: string;
  avatarCol: string;
  styleDef: StyleDef;
  active: boolean;
  idx: number;
}

const CommentBox: React.FC<CommentBoxProps> = ({ line, username, avatarCol, styleDef, active, idx }) => {
  const isNeon = styleDef.id === 'neon';
  const isCinema = styleDef.id === 'cinema';
  const isPaper = styleDef.id === 'paper';

  return (
    <div
      style={{
        background: styleDef.cardBg,
        border: `1px solid ${active ? (isNeon ? '#ff00ff' : styleDef.cardBorder) : styleDef.cardBorder}`,
        boxShadow: active
          ? `0 0 ${isNeon ? '20px 4px rgba(255,0,255,0.5)' : '12px 2px rgba(0,0,0,0.4)'}`
          : undefined,
        backdropFilter: styleDef.id === 'glass' ? 'blur(16px)' : undefined,
        transition: 'all 0.3s ease',
        opacity: active ? 1 : 0.45,
        transform: active ? 'scale(1.01)' : 'scale(0.98)',
        fontFamily: isPaper ? '"Georgia", serif' : undefined,
      }}
      className={`flex items-start gap-3 p-3 rounded-2xl ${styleDef.shadowCls} shadow-lg`}
    >
      {/* Avatar */}
      {!isCinema && (
        <div
          style={{ background: avatarCol, width: 36, height: 36, minWidth: 36 }}
          className="rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
        >
          {getAvatar(username)}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Username */}
        {!isCinema && (
          <div className={`text-[11px] font-bold mb-0.5 truncate ${styleDef.nameCls}`}>
            @{username}
            {active && <span className="ml-1.5 text-[9px] opacity-60">▶ now</span>}
          </div>
        )}
        {/* Lyric line */}
        <div
          className={`text-sm leading-snug font-medium ${styleDef.textCls} ${isCinema ? 'text-base font-bold tracking-wide text-center' : ''} ${isNeon && active ? 'drop-shadow-[0_0_8px_rgba(255,100,255,0.8)]' : ''}`}
        >
          {line}
        </div>

        {/* Engagement bar (visual detail) */}
        {!isCinema && !isPaper && (
          <div className="flex items-center gap-3 mt-1.5 text-[10px] opacity-40">
            <span>❤️ {Math.floor(Math.random() * 900 + 100)}</span>
            <span>💬 {Math.floor(Math.random() * 50 + 5)}</span>
            <span>↩ Reply</span>
          </div>
        )}
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

  const [styleDef, setStyleDef] = useState<StyleDef>(CANVAS_STYLES[0]);
  const [bgPreset, setBgPreset] = useState<BgPreset>(BG_PRESETS[0]);
  const [customBg, setCustomBg] = useState('');
  const [showStylePanel, setShowStylePanel] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(2500); // ms per line
  const [usernames] = useState(() =>
    lyricsLines.map((_, i) => USERNAMES[i % USERNAMES.length])
  );
  const [avatarColors] = useState(() =>
    lyricsLines.map((_, i) => AVATAR_COLORS[i % AVATAR_COLORS.length])
  );

  const audioRef = useRef<HTMLAudioElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const effectiveBg = customBg || bgPreset.value;

  // Auto-advance lines when playing
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentIdx(prev => {
          if (prev >= lyricsLines.length - 1) {
            setIsPlaying(false);
            if (audioRef.current) audioRef.current.pause();
            return prev;
          }
          return prev + 1;
        });
      }, speed);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, speed, lyricsLines.length]);

  const togglePlay = () => {
    if (!isPlaying) {
      if (audioRef.current && audioUrl) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    } else {
      if (audioRef.current) audioRef.current.pause();
    }
    setIsPlaying(p => !p);
  };

  const reset = () => {
    setIsPlaying(false);
    setCurrentIdx(0);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  };

  // Simple video export using MediaRecorder on canvas element
  const handleExport = useCallback(async () => {
    const el = previewRef.current;
    if (!el) return;
    setIsExporting(true);
    setExportDone(false);

    try {
      // Use html2canvas-like approach via canvas capture stream
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d')!;

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.start();

      // Draw each lyric line as a "frame" for `speed` ms
      const msPerFrame = speed;
      for (let i = 0; i < lyricsLines.length; i++) {
        // Background
        if (effectiveBg.includes('gradient')) {
          const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
          grd.addColorStop(0, '#0a0010');
          grd.addColorStop(1, '#200040');
          ctx.fillStyle = grd;
        } else {
          ctx.fillStyle = effectiveBg.startsWith('#') ? effectiveBg : '#000';
        }
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw previous lines (faded)
        const startFrom = Math.max(0, i - 3);
        for (let j = startFrom; j < i; j++) {
          const alpha = 0.15 + (j - startFrom) * 0.12;
          drawLyricCard(ctx, lyricsLines[j].text, usernames[j], avatarColors[j], styleDef, false, j - startFrom, alpha);
        }
        // Draw current line (highlighted)
        drawLyricCard(ctx, lyricsLines[i].text, usernames[i], avatarColors[i], styleDef, true, i - startFrom, 1);

        await new Promise(resolve => setTimeout(resolve, msPerFrame));
      }

      recorder.stop();
      await new Promise(resolve => { recorder.onstop = resolve; });

      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lyrics_video_${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
    } catch (err: any) {
      console.error('Export failed:', err);
      alert('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  }, [lyricsLines, usernames, avatarColors, styleDef, effectiveBg, speed]);

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-3 bg-[#0a0a0a] border-b border-white/5 gap-2">
        <button onClick={onBack} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs sm:text-sm transition-colors shrink-0">
          <ArrowLeft size={15} /> <span className="hidden sm:inline">Back to Studio</span><span className="sm:hidden">Back</span>
        </button>
        <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest hidden md:block">Lyrics Canvas</span>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setShowStylePanel(p => !p)}
            className={`flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all ${showStylePanel ? 'border-purple-500/40 text-purple-400 bg-purple-500/10' : 'border-white/10 text-gray-500'}`}
          >
            <Palette size={12} /> <span className="hidden xs:inline">Styles</span>
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 text-white px-2.5 sm:px-3 py-1.5 rounded-xl transition-all"
          >
            {isExporting ? <Loader2 size={12} className="animate-spin" /> : exportDone ? <CheckCircle size={12} /> : <Download size={12} />}
            <span className="hidden sm:inline">{isExporting ? 'Exporting…' : exportDone ? 'Saved!' : 'Export Video'}</span>
            <span className="sm:hidden">{isExporting ? '…' : exportDone ? '✓' : 'Export'}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* ── Style Panel ── */}
        {showStylePanel && (
          <aside className="w-full lg:w-64 bg-[#0a0a0a] border-b lg:border-b-0 lg:border-r border-white/5 overflow-y-auto p-4 space-y-5 shrink-0 max-h-[40vh] lg:max-h-none">
            {/* Canvas Style */}
            <div className="space-y-2">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Style</div>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
                {CANVAS_STYLES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setStyleDef(s)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${styleDef.id === s.id ? 'border-purple-500/50 bg-purple-500/10 text-white' : 'border-white/5 text-gray-500 hover:text-gray-300 hover:border-white/10'}`}
                  >
                    <span className="text-base">{s.emoji}</span>
                    <span className="text-xs font-medium">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Background */}
            <div className="space-y-2">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Background</div>
              <div className="grid grid-cols-2 gap-1.5">
                {BG_PRESETS.map(bg => (
                  <button
                    key={bg.id}
                    onClick={() => { setBgPreset(bg); setCustomBg(''); }}
                    style={{ background: bg.value }}
                    className={`h-10 rounded-lg border-2 text-[10px] font-semibold transition-all ${bgPreset.id === bg.id && !customBg ? 'border-white scale-105' : 'border-transparent hover:border-white/30'} text-white/60`}
                    title={bg.label}
                  >
                    <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{bg.label}</span>
                  </button>
                ))}
              </div>

              {/* Custom color picker */}
              <div className="space-y-1">
                <div className="text-[10px] text-gray-700">Custom color:</div>
                <input
                  type="color"
                  value={customBg || '#000000'}
                  onChange={e => setCustomBg(e.target.value)}
                  className="w-full h-8 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                />
              </div>
            </div>

            {/* Playback speed */}
            <div className="space-y-2">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Line Speed</div>
              {[
                { label: 'Slow (4s)', ms: 4000 },
                { label: 'Normal (2.5s)', ms: 2500 },
                { label: 'Fast (1.5s)', ms: 1500 },
              ].map(sp => (
                <button
                  key={sp.ms}
                  onClick={() => setSpeed(sp.ms)}
                  className={`w-full text-xs py-1.5 rounded-lg border transition-all ${speed === sp.ms ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-white/5 text-gray-600 hover:text-gray-400'}`}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* ── Canvas Preview ── */}
        <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto">
          {/* Phone frame preview */}
          <div
            ref={previewRef}
            style={{
              background: effectiveBg,
              width: '100%',
              maxWidth: 360,
              minHeight: 640,
              borderRadius: 24,
              padding: '24px 16px',
              boxShadow: '0 0 60px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              position: 'relative',
            }}
          >
            {/* Song info header */}
            <div className="flex items-center gap-2 mb-1 opacity-60">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shrink-0">
                <span className="text-[10px] text-white">♪</span>
              </div>
              <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">
                {songStyle || 'Song'} · Lyrics
              </div>
            </div>

            {/* Lyric lines */}
            <div className="flex-1 flex flex-col gap-2">
              {lyricsLines.slice(
                Math.max(0, currentIdx - 2),
                currentIdx + 4,
              ).map((line, i) => {
                const absIdx = Math.max(0, currentIdx - 2) + i;
                const isActive = absIdx === currentIdx;
                return (
                  <CommentBox
                    key={absIdx}
                    line={line.text}
                    username={usernames[absIdx] || 'user'}
                    avatarCol={avatarColors[absIdx] || '#8B5CF6'}
                    styleDef={styleDef}
                    active={isActive}
                    idx={i}
                  />
                );
              })}
            </div>

            {/* Section label overlay */}
            {lines[currentIdx + Math.max(0, currentIdx - 2)]?.isSection && (
              <div className="text-center text-[11px] text-purple-400 font-semibold uppercase tracking-widest opacity-70 py-1">
                {lines[currentIdx].text}
              </div>
            )}
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => setCurrentIdx(p => Math.max(0, p - 1))}
              className="w-9 h-9 rounded-full border border-white/10 text-gray-500 hover:text-white hover:border-white/20 flex items-center justify-center transition-all"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              onClick={reset}
              className="w-9 h-9 rounded-full border border-white/10 text-gray-500 hover:text-white hover:border-white/20 flex items-center justify-center transition-all"
            >
              <RotateCcw size={14} />
            </button>

            <button
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-purple-900/40 active:scale-95 transition-all"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
            </button>

            <button
              onClick={() => setCurrentIdx(p => Math.min(lyricsLines.length - 1, p + 1))}
              className="w-9 h-9 rounded-full border border-white/10 text-gray-500 hover:text-white hover:border-white/20 flex items-center justify-center transition-all"
            >
              <ChevronRight size={16} />
            </button>

            <div className="text-xs text-gray-600 ml-1">
              {currentIdx + 1} / {lyricsLines.length}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-[360px] mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-600 to-pink-600 rounded-full transition-all duration-300"
              style={{ width: `${((currentIdx + 1) / lyricsLines.length) * 100}%` }}
            />
          </div>

          {/* Audio element */}
          {audioUrl && (
            <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />
          )}

          {/* All lyrics list */}
          <div className="w-full max-w-[360px] mt-4 space-y-1">
            <div className="text-[10px] text-gray-700 uppercase tracking-widest font-semibold mb-2">All Lines</div>
            {lyricsLines.map((line, i) => (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                className={`w-full text-left text-xs px-3 py-1.5 rounded-lg transition-all ${i === currentIdx ? 'bg-purple-500/20 text-purple-300' : 'text-gray-600 hover:text-gray-400 hover:bg-white/3'}`}
              >
                {i + 1}. {line.text}
              </button>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
};

// ── Canvas 2D draw helper (for video export) ──────────────────────────────────

function drawLyricCard(
  ctx: CanvasRenderingContext2D,
  text: string,
  username: string,
  avatarCol: string,
  styleDef: StyleDef,
  active: boolean,
  position: number,
  alpha: number,
) {
  const cw = ctx.canvas.width;
  const cardW = cw - 80;
  const cardH = 120;
  const x = 40;
  const baseY = ctx.canvas.height / 2 - cardH / 2;
  const y = baseY + position * (cardH + 16) - (active ? 0 : 0);

  ctx.globalAlpha = alpha;
  ctx.fillStyle = active ? 'rgba(80,30,120,0.9)' : 'rgba(30,30,50,0.8)';
  ctx.beginPath();
  ctx.roundRect(x, y, cardW, cardH, 20);
  ctx.fill();

  if (active) {
    ctx.strokeStyle = 'rgba(180,80,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Avatar
  ctx.fillStyle = avatarCol;
  ctx.beginPath();
  ctx.arc(x + 36, y + cardH / 2, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(getAvatar(username), x + 36, y + cardH / 2);

  // Username
  ctx.fillStyle = active ? '#d8b4fe' : '#9ca3af';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('@' + username, x + 70, y + 34);

  // Lyric text
  ctx.fillStyle = active ? '#f3e8ff' : '#d1d5db';
  ctx.font = `${active ? 'bold' : 'normal'} 20px sans-serif`;
  ctx.textBaseline = 'alphabetic';
  const maxW = cardW - 90;
  const words = text.split(' ');
  let line = '';
  let lineY = y + 64;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x + 70, lineY);
      line = word;
      lineY += 24;
    } else { line = test; }
  }
  if (line) ctx.fillText(line, x + 70, lineY);

  ctx.globalAlpha = 1;
}

export default LyricsCanvas;
