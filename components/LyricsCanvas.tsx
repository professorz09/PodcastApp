import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Play, Pause, Download, RotateCcw, ChevronLeft, ChevronRight,
  Palette, Loader2, CheckCircle, ImagePlus, X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type BgMode = 'gradient' | 'image';

interface BgPreset {
  id: string;
  label: string;
  value: string;
}

const BG_PRESETS: BgPreset[] = [
  { id: 'black',   label: 'Black',      value: '#000000' },
  { id: 'dark',    label: 'Dark Gray',  value: '#0a0a0a' },
  { id: 'navy',    label: 'Night Blue', value: 'linear-gradient(180deg,#060d1a,#0a1628)' },
  { id: 'purple',  label: 'Deep Violet','value': 'linear-gradient(180deg,#1a0030,#0a0020)' },
  { id: 'sunset',  label: 'Sunset',     value: 'linear-gradient(180deg,#1a0038,#5c0030,#ff4000)' },
  { id: 'cosmic',  label: 'Cosmic',     value: 'linear-gradient(180deg,#0a0028,#200060,#4a0080)' },
  { id: 'forest',  label: 'Forest',     value: 'linear-gradient(180deg,#001a0a,#003010,#00501a)' },
  { id: 'ocean',   label: 'Ocean',      value: 'linear-gradient(180deg,#001a2c,#003b6e)' },
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

const TIME_LABELS = ['2w','4w','1 month','3 months','6 months','22w','34w','1 year'];

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

// ── YouTube Comment Card ───────────────────────────────────────────────────────

interface CommentCardProps {
  line: string;
  username: string;
  timeAgo: string;
  active: boolean;
  likes: number;
}

const CommentCard: React.FC<CommentCardProps> = ({ line, username, timeAgo, active, likes }) => {
  const col = avatarColor(username);
  return (
    <div
      style={{
        background: '#ffffff',
        transition: 'all 0.35s ease',
        opacity: active ? 1 : 0.35,
        transform: active ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.97)',
      }}
      className="rounded-2xl overflow-hidden shadow-2xl"
    >
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        {/* Avatar */}
        <div
          style={{ background: col, width: 40, height: 40, minWidth: 40 }}
          className="rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-md"
        >
          {username.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          {/* Username + time */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[13px] font-semibold text-gray-900">@{username}</span>
            <span className="text-[11px] text-gray-400">{timeAgo}</span>
          </div>
          {/* Comment text = lyric */}
          <p className="text-[14px] text-gray-800 leading-snug font-normal">{line}</p>
          {/* Footer */}
          <div className="flex items-center gap-4 mt-2 text-[12px] text-gray-500">
            <button className="flex items-center gap-1 hover:text-gray-800 transition-colors">
              <span>👍</span> {likes}
            </button>
            <button className="flex items-center gap-1 hover:text-gray-800 transition-colors">
              <span>👎</span>
            </button>
            <button className="font-medium hover:text-gray-800 transition-colors">Reply</button>
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

  const [bgMode, setBgMode] = useState<BgMode>('gradient');
  const [bgPreset, setBgPreset] = useState<BgPreset>(BG_PRESETS[0]);
  const [bgImageUrl, setBgImageUrl] = useState<string>('');
  const [customBgColor, setCustomBgColor] = useState('');
  const [overlayText, setOverlayText] = useState('CHAT MUSIC');
  const [showStylePanel, setShowStylePanel] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(2500);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const [usernames] = useState(() =>
    lyricsLines.map((_, i) => USERNAMES[i % USERNAMES.length])
  );
  const [timings] = useState(() =>
    lyricsLines.map((_, i) => TIME_LABELS[i % TIME_LABELS.length])
  );
  const [likes] = useState(() =>
    lyricsLines.map(() => Math.floor(Math.random() * 9000 + 100))
  );

  const audioRef = useRef<HTMLAudioElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Auto-advance
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setBgImageUrl(ev.target?.result as string);
      setBgMode('image');
    };
    reader.readAsDataURL(file);
  };

  const effectiveBg = bgMode === 'image' && bgImageUrl
    ? bgImageUrl
    : (customBgColor || bgPreset.value);

  // Video export
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportDone(false);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d')!;

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.start();

      for (let i = 0; i < lyricsLines.length; i++) {
        // Black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Top image area
        if (bgMode === 'image' && bgImageUrl) {
          try {
            const img = new Image();
            img.src = bgImageUrl;
            await new Promise(r => { img.onload = r; });
            const imgH = canvas.height * 0.58;
            ctx.drawImage(img, 0, 0, canvas.width, imgH);
          } catch { /* ignore */ }
        } else {
          const grd = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.6);
          grd.addColorStop(0, '#1a0030');
          grd.addColorStop(1, '#0a0020');
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, canvas.width, canvas.height * 0.58);
        }

        // Overlay text
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, canvas.height * 0.48, canvas.width, canvas.height * 0.1);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 80px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(overlayText, canvas.width / 2, canvas.height * 0.53);

        // Comment card
        const cardX = 60, cardY = canvas.height * 0.62, cardW = canvas.width - 120, cardH = 280;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 24);
        ctx.fill();

        // Avatar
        ctx.fillStyle = avatarColor(usernames[i]);
        ctx.beginPath();
        ctx.arc(cardX + 56, cardY + 60, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(usernames[i].charAt(0).toUpperCase(), cardX + 56, cardY + 60);

        // Username
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('@' + usernames[i], cardX + 102, cardY + 50);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '22px sans-serif';
        ctx.fillText(timings[i], cardX + 102, cardY + 82);

        // Lyric text
        ctx.fillStyle = '#1f2937';
        ctx.font = '28px sans-serif';
        const maxW = cardW - 110;
        const words = lyricsLines[i].text.split(' ');
        let line = ''; let lineY = cardY + 130;
        for (const word of words) {
          const test = line ? line + ' ' + word : word;
          if (ctx.measureText(test).width > maxW && line) {
            ctx.fillText(line, cardX + 100, lineY);
            line = word; lineY += 36;
          } else { line = test; }
        }
        if (line) ctx.fillText(line, cardX + 100, lineY);

        // Reply
        ctx.fillStyle = '#6b7280';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText('Reply', cardX + 100, cardY + 240);

        await new Promise(resolve => setTimeout(resolve, speed));
      }

      recorder.stop();
      await new Promise(resolve => { recorder.onstop = resolve; });
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `lyrics_video_${Date.now()}.webm`; a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
    } catch (err: any) {
      alert('Export failed: ' + (err.message || 'Unknown error'));
    } finally { setIsExporting(false); }
  }, [lyricsLines, usernames, timings, bgMode, bgImageUrl, overlayText, speed]);

  const activeLine = lyricsLines[currentIdx];

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-3 bg-[#0a0a0a] border-b border-white/5 gap-2">
        <button onClick={onBack} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs sm:text-sm transition-colors shrink-0">
          <ArrowLeft size={15} />
          <span className="hidden sm:inline">Back to Studio</span>
          <span className="sm:hidden">Back</span>
        </button>
        <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest hidden md:block">Lyrics Canvas</span>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setShowStylePanel(p => !p)}
            className={`flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all ${showStylePanel ? 'border-purple-500/40 text-purple-400 bg-purple-500/10' : 'border-white/10 text-gray-500'}`}
          >
            <Palette size={12} /> <span className="hidden sm:inline">Styles</span>
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
          <aside className="w-full lg:w-64 bg-[#0a0a0a] border-b lg:border-b-0 lg:border-r border-white/5 overflow-y-auto p-4 space-y-5 shrink-0 max-h-[45vh] lg:max-h-none">
            {/* Image Upload */}
            <div className="space-y-2">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Background Image</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              {bgImageUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-white/10">
                  <img src={bgImageUrl} alt="bg" className="w-full h-24 object-cover" />
                  <button
                    onClick={() => { setBgImageUrl(''); setBgMode('gradient'); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center text-white hover:bg-black/90"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 h-16 border-2 border-dashed border-white/10 rounded-xl text-gray-600 hover:text-gray-400 hover:border-white/20 transition-all text-xs"
                >
                  <ImagePlus size={16} /> Upload Image / Meme
                </button>
              )}
            </div>

            {/* Color presets (when no image) */}
            <div className="space-y-2">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Background Color</div>
              <div className="grid grid-cols-4 lg:grid-cols-2 gap-1.5">
                {BG_PRESETS.map(bg => (
                  <button
                    key={bg.id}
                    onClick={() => { setBgPreset(bg); setBgMode('gradient'); setCustomBgColor(''); setBgImageUrl(''); }}
                    style={{ background: bg.value }}
                    title={bg.label}
                    className={`h-9 rounded-lg border-2 text-[9px] font-semibold transition-all ${bgPreset.id === bg.id && bgMode === 'gradient' && !customBgColor ? 'border-white scale-105' : 'border-transparent hover:border-white/30'} text-white/70 drop-shadow-sm`}
                  >
                    <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{bg.label}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-gray-700">Custom:</div>
                <input
                  type="color"
                  value={customBgColor || '#000000'}
                  onChange={e => { setCustomBgColor(e.target.value); setBgMode('gradient'); setBgImageUrl(''); }}
                  className="w-full h-8 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                />
              </div>
            </div>

            {/* Overlay Text */}
            <div className="space-y-2">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Overlay Title</div>
              <input
                value={overlayText}
                onChange={e => setOverlayText(e.target.value)}
                placeholder="CHAT MUSIC"
                className="w-full bg-[#1a1a1a] border border-white/8 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-purple-500/40"
              />
            </div>

            {/* Speed */}
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
        <main className="flex-1 flex flex-col items-center justify-start p-4 overflow-y-auto gap-4">
          {/* Phone-style frame */}
          <div
            ref={previewRef}
            className="w-full flex flex-col overflow-hidden shadow-2xl"
            style={{
              maxWidth: 390,
              borderRadius: 28,
              background: '#000',
              boxShadow: '0 0 80px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.06)',
              minHeight: 560,
            }}
          >
            {/* ── Top image area ── */}
            <div
              className="relative flex-shrink-0"
              style={{
                height: 300,
                background: bgMode === 'image' && bgImageUrl
                  ? `url(${bgImageUrl}) center/cover no-repeat`
                  : effectiveBg,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Dark gradient at bottom of image for text readability */}
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{ height: 100, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}
              />
              {/* "CHAT MUSIC" overlay text */}
              {overlayText && (
                <div
                  className="absolute bottom-4 left-0 right-0 text-center select-none"
                  style={{
                    fontFamily: '"Arial Black", "Impact", sans-serif',
                    fontSize: 28,
                    fontWeight: 900,
                    color: '#ffffff',
                    textShadow: '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 3px 8px rgba(0,0,0,0.8)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  {overlayText}
                </div>
              )}
            </div>

            {/* ── Comment area ── */}
            <div
              className="flex-1 px-4 py-5 space-y-3"
              style={{ background: '#f8f9fa', minHeight: 180 }}
            >
              {/* Active comment (current lyric) */}
              {activeLine && (
                <CommentCard
                  line={activeLine.text}
                  username={usernames[currentIdx] || 'user'}
                  timeAgo={timings[currentIdx] || '1 month'}
                  active={true}
                  likes={likes[currentIdx] || 123}
                />
              )}

              {/* Next comment preview (faded) */}
              {lyricsLines[currentIdx + 1] && (
                <CommentCard
                  line={lyricsLines[currentIdx + 1].text}
                  username={usernames[currentIdx + 1] || 'user'}
                  timeAgo={timings[currentIdx + 1] || '2 months'}
                  active={false}
                  likes={likes[currentIdx + 1] || 50}
                />
              )}
            </div>
          </div>

          {/* ── Playback controls ── */}
          <div className="flex items-center gap-3">
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
          <div className="w-full max-w-[390px] h-1.5 bg-white/5 rounded-full overflow-hidden">
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
          <div className="w-full max-w-[390px] space-y-1">
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

export default LyricsCanvas;
