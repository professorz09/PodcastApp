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

// Word reveal interval in ms
const WORD_MS = 280;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLyrics(text: string) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map((l, i) => ({ isSection: l.startsWith('['), text: l, lineIdx: i }));
}

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

  // UI state
  const [bgImage, setBgImage]         = useState('');
  const [bgPreset, setBgPreset]       = useState(BG_PRESETS[0]);
  const [customColor, setCustomColor] = useState('');
  const [stripBg, setStripBg]         = useState<'white' | 'black' | 'blur'>('white');
  const [showPanel, setShowPanel]     = useState(false);

  // Playback state
  const [currentIdx, setCurrentIdx]   = useState(0);
  const [wordIdx, setWordIdx]         = useState(0);   // words revealed so far
  const [isPlaying, setIsPlaying]     = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDone, setExportDone]   = useState(false);

  const audioRef     = useRef<HTMLAudioElement>(null);
  const lineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveBg = bgImage ? undefined : (customColor || bgPreset.value);

  // Current line words
  const currentLine  = lyricsLines[currentIdx];
  const currentWords = currentLine ? currentLine.text.split(' ') : [];
  const totalWords   = currentWords.length;

  // Displayed text: words built up so far
  const displayedText = currentWords.slice(0, Math.max(1, wordIdx)).join(' ');

  // Reset word idx when line changes
  useEffect(() => {
    setWordIdx(0);
  }, [currentIdx]);

  // Word-by-word reveal animation when playing
  useEffect(() => {
    if (wordTimerRef.current) clearInterval(wordTimerRef.current);
    if (lineTimerRef.current) clearTimeout(lineTimerRef.current);

    if (!isPlaying) return;

    // Start building words
    wordTimerRef.current = setInterval(() => {
      setWordIdx(prev => {
        const next = prev + 1;
        if (next >= totalWords) {
          // All words shown — wait then advance line
          clearInterval(wordTimerRef.current!);
          lineTimerRef.current = setTimeout(() => {
            setCurrentIdx(ci => {
              if (ci >= lyricsLines.length - 1) {
                setIsPlaying(false);
                audioRef.current?.pause();
                return ci;
              }
              return ci + 1;
            });
          }, 900); // brief pause after full line
          return next;
        }
        return next;
      });
    }, WORD_MS);

    return () => {
      if (wordTimerRef.current) clearInterval(wordTimerRef.current);
      if (lineTimerRef.current) clearTimeout(lineTimerRef.current);
    };
  }, [isPlaying, currentIdx, totalWords, lyricsLines.length]);

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
    setWordIdx(0);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  };

  const goTo = (idx: number) => {
    setCurrentIdx(idx);
    setWordIdx(0);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setBgImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // Strip style variants
  const stripStyles: Record<string, React.CSSProperties> = {
    white: { background: '#ffffff', color: '#111827' },
    black: { background: 'rgba(0,0,0,0.82)', color: '#ffffff', backdropFilter: 'blur(4px)' },
    blur:  { background: 'rgba(255,255,255,0.15)', color: '#ffffff', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.2)' },
  };

  // ── 16:9 Video Export ────────────────────────────────────────────────────────
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

      const stripH = 130;

      for (let i = 0; i < lyricsLines.length; i++) {
        const words = lyricsLines[i].text.split(' ');
        // Animate word by word
        for (let w = 1; w <= words.length; w++) {
          // Draw background
          if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, W, H);
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(0, 0, W, H);
          } else {
            ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
            const grd = ctx.createLinearGradient(0, 0, W, H);
            grd.addColorStop(0, '#0a0028'); grd.addColorStop(1, '#1a0040');
            ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
          }

          // White strip at bottom
          if (stripBg === 'white') {
            ctx.fillStyle = '#ffffff';
          } else {
            ctx.fillStyle = 'rgba(0,0,0,0.82)';
          }
          ctx.fillRect(0, H - stripH, W, stripH);

          // Text
          const textColor = stripBg === 'white' ? '#111827' : '#ffffff';
          ctx.fillStyle = textColor;
          ctx.font = 'bold 52px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const partial = words.slice(0, w).join(' ');
          ctx.fillText(partial, W / 2, H - stripH / 2);

          await new Promise(r => setTimeout(r, WORD_MS));
        }
        // Pause after full line
        await new Promise(r => setTimeout(r, 800));
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
  }, [lyricsLines, bgImage, stripBg]);

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 flex flex-col overflow-hidden">

      {/* ── Fixed top bar ─────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-3 sm:px-4 h-14 bg-[#050505]/95 backdrop-blur-xl border-b border-white/5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors active:scale-95">
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Back</span>
        </button>

        <span className="text-[11px] text-gray-600 uppercase tracking-widest font-semibold hidden md:block">
          {songStyle || 'Lyrics'} Canvas · 16:9
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

      {/* ── Layout ────────────────────────────────────────────────── */}
      <div className="flex flex-1 pt-14 overflow-hidden">

        {/* ── Canvas area ─────────────────────────────────────────── */}
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
              {/* Dark overlay when image is set */}
              {bgImage && (
                <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.18)' }} />
              )}

              {/* ── White/dark bottom strip ── */}
              <div
                className="absolute left-0 right-0 bottom-0 flex items-center justify-center"
                style={{
                  minHeight: '18%',
                  padding: '12px 24px',
                  ...stripStyles[stripBg],
                }}
              >
                <p
                  key={displayedText}
                  style={{
                    fontSize: 'clamp(13px, 2.8vw, 28px)',
                    fontWeight: 700,
                    textAlign: 'center',
                    lineHeight: 1.35,
                    margin: 0,
                    letterSpacing: '0.01em',
                    animation: 'wordPop 0.18s ease',
                    color: stripStyles[stripBg].color,
                  }}
                >
                  {displayedText}
                </p>
              </div>

              {/* Progress bar at very bottom edge */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/20">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${((currentIdx + 1) / lyricsLines.length) * 100}%` }}
                />
              </div>
            </div>

            {/* ── Playback controls ── */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => goTo(Math.max(0, currentIdx - 1))}
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
                onClick={() => goTo(Math.min(lyricsLines.length - 1, currentIdx + 1))}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-white/10 text-gray-400 hover:text-white hover:border-white/25 flex items-center justify-center transition-all active:scale-95"
              >
                <ChevronRight size={18} />
              </button>
              <span className="text-xs text-gray-600 ml-1 tabular-nums">
                {currentIdx + 1} / {lyricsLines.length}
              </span>
            </div>

            {/* Word progress dots */}
            <div className="flex items-center justify-center gap-1 mt-2">
              {currentWords.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-150"
                  style={{
                    width: i < wordIdx ? 6 : 4,
                    height: i < wordIdx ? 6 : 4,
                    background: i < wordIdx ? '#a855f7' : 'rgba(255,255,255,0.12)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* ── All lyrics list ── */}
          <div className="w-full space-y-1" style={{ maxWidth: 900 }}>
            <div className="text-[10px] text-gray-700 uppercase tracking-widest font-semibold mb-2">All Lines</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {lyricsLines.map((line, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`text-left text-xs px-3 py-2 rounded-lg transition-all ${i === currentIdx ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-gray-600 hover:text-gray-300 hover:bg-white/4 border border-transparent'}`}
                >
                  <span className="text-gray-700 mr-1.5">{i + 1}.</span>{line.text}
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* ── Customize Panel ──────────────────────────────────────── */}
        <>
          {showPanel && (
            <div className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setShowPanel(false)} />
          )}
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
                <input
                  type="color"
                  value={customColor || '#000000'}
                  onChange={e => { setCustomColor(e.target.value); setBgImage(''); }}
                  className="w-full h-9 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                />
              </div>

              {/* Strip Style */}
              <div className="space-y-2">
                <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Text Strip Style</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { id: 'white', label: 'White', preview: '#fff' },
                    { id: 'black', label: 'Black', preview: '#000' },
                    { id: 'blur',  label: 'Glass', preview: 'rgba(255,255,255,0.15)' },
                  ] as const).map(s => (
                    <button
                      key={s.id}
                      onClick={() => setStripBg(s.id)}
                      style={{ background: s.preview, border: stripBg === s.id ? '2px solid #a855f7' : '2px solid rgba(255,255,255,0.08)' }}
                      className="h-10 rounded-xl text-[10px] font-semibold transition-all"
                    >
                      <span style={{ color: s.id === 'white' ? '#111' : '#fff', textShadow: s.id === 'white' ? 'none' : '0 1px 3px rgba(0,0,0,0.5)' }}>
                        {s.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </>
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes wordPop {
          from { opacity: 0.3; transform: scale(0.92); }
          to   { opacity: 1;   transform: scale(1); }
        }
      `}</style>

      {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />}
    </div>
  );
};

export default LyricsCanvas;
