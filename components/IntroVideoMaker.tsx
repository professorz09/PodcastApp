import React, { useRef, useState, useCallback } from 'react';
import { X, Download, Loader2, Sparkles, Play, Copy, Check, Wand2, Video } from 'lucide-react';
import { selectBestCommentsForIntro, generateIntroQuote, generateVeo3Prompt } from '../services/geminiService';

interface IntroVideoMakerProps {
  comments: string[];
  transcript?: string;
  onClose: () => void;
}

const CW = 1280;
const CH = 720;

const CARD_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444'];
const COMMENT_INTERVAL = 0.8;
const SLIDE_DUR = 0.35;
const QUOTE_OFFSET = 0.5;
const QUOTE_FADE = 0.55;
const HOLD_AFTER_QUOTE = 2.8;

type Stage = 'idle' | 'ai-loading' | 'rendering' | 'done';

function easeOut(t: number) { return 1 - Math.pow(1 - Math.min(t, 1), 3); }

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line.trimEnd(), x, cy);
      line = word + ' ';
      cy += lh;
    } else { line = test; }
  }
  if (line.trim()) ctx.fillText(line.trimEnd(), x, cy);
  return cy;
}

function playPop(ac: AudioContext, dest: MediaStreamAudioDestinationNode, time: number) {
  const osc = ac.createOscillator(); const g = ac.createGain();
  osc.connect(g); g.connect(dest);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1050, time);
  osc.frequency.exponentialRampToValueAtTime(360, time + 0.1);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(0.2, time + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  osc.start(time); osc.stop(time + 0.18);
}

function playBell(ac: AudioContext, dest: MediaStreamAudioDestinationNode, time: number) {
  const osc = ac.createOscillator(); const g = ac.createGain();
  osc.connect(g); g.connect(dest);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, time);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(0.24, time + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.95);
  osc.start(time); osc.stop(time + 1.0);
}

const IntroVideoMaker: React.FC<IntroVideoMakerProps> = ({ comments, transcript, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const heartCountsRef = useRef<number[]>([]);
  const downloadUrlRef = useRef<string | null>(null);

  // Cleanup on unmount: cancel RAF + revoke blob URL
  React.useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
        downloadUrlRef.current = null;
      }
    };
  }, []);

  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [selectedComments, setSelectedComments] = useState<string[]>([]);
  const [quote, setQuote] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [aiError, setAiError] = useState('');

  // Veo 3 section
  const [veo3Loading, setVeo3Loading] = useState(false);
  const [veo3Prompt, setVeo3Prompt] = useState('');
  const [veo3Copied, setVeo3Copied] = useState(false);
  const [veo3Error, setVeo3Error] = useState('');

  const getDuration = (n: number) =>
    0.3 + n * COMMENT_INTERVAL + QUOTE_OFFSET + QUOTE_FADE + HOLD_AFTER_QUOTE + 0.5;

  const drawFrame = useCallback((ctx: CanvasRenderingContext2D, t: number, comms: string[], q: string) => {
    const W = CW; const H = CH;
    const n = comms.length;
    const QUOTE_START = 0.3 + n * COMMENT_INTERVAL + QUOTE_OFFSET;
    const TOTAL = getDuration(n);

    ctx.clearRect(0, 0, W, H);

    const bgA = easeOut(t / 0.25);
    ctx.globalAlpha = bgA;
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#f8faff'); grd.addColorStop(1, '#e8edf8');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#6366f1'; ctx.globalAlpha = bgA * 0.05;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 18; c++) {
      ctx.beginPath(); ctx.arc(c * 74 + 37, r * 78 + 39, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (t > 0.12) {
      const ba = easeOut((t - 0.12) / 0.3);
      ctx.globalAlpha = ba;
      ctx.font = `bold ${W * 0.031}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = '#6366f1'; ctx.textAlign = 'left';
      ctx.fillText('AutoVid AI', 52, 52);
      ctx.font = `${W * 0.017}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Real reactions. Real people.', 52, 74);
      ctx.globalAlpha = 1;
    }

    const CARD_W = W * 0.60; const CARD_H = 90; const CARD_GAP = 8;
    const CARD_R = 14; const START_Y = 100; const CARD_X = W * 0.195;
    const quoteOverlay = t >= QUOTE_START ? easeOut((t - QUOTE_START) / 0.5) : 0;

    for (let i = 0; i < n; i++) {
      const cs = 0.3 + i * COMMENT_INTERVAL;
      if (t < cs) continue;
      const prog = easeOut((t - cs) / SLIDE_DUR);
      const cardY = START_Y + i * (CARD_H + CARD_GAP);
      const curX = (W + 80) + (CARD_X - (W + 80)) * prog;

      ctx.globalAlpha = 1 - quoteOverlay * 0.4;
      ctx.save();
      ctx.shadowColor = 'rgba(99,102,241,0.12)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 7;
      ctx.beginPath(); ctx.roundRect(curX, cardY, CARD_W, CARD_H, CARD_R);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();

      ctx.beginPath(); ctx.roundRect(curX, cardY, 5, CARD_H, [CARD_R, 0, 0, CARD_R]);
      ctx.fillStyle = CARD_COLORS[i % CARD_COLORS.length]; ctx.fill();

      const avX = curX + 36; const avY = cardY + CARD_H / 2;
      ctx.beginPath(); ctx.arc(avX, avY, 17, 0, Math.PI * 2);
      ctx.fillStyle = CARD_COLORS[i % CARD_COLORS.length] + '20'; ctx.fill();
      ctx.beginPath(); ctx.arc(avX, avY, 17, 0, Math.PI * 2);
      ctx.strokeStyle = CARD_COLORS[i % CARD_COLORS.length] + '55'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = `${W * 0.02}px sans-serif`; ctx.fillStyle = CARD_COLORS[i % CARD_COLORS.length];
      ctx.textAlign = 'center'; ctx.fillText('👤', avX, avY + 6);

      ctx.textAlign = 'left';
      ctx.font = `600 ${W * 0.017}px -apple-system, sans-serif`;
      ctx.fillStyle = '#64748b'; ctx.fillText(`Viewer ${i + 1}`, curX + 62, cardY + 24);
      ctx.font = `${W * 0.021}px -apple-system, sans-serif`; ctx.fillStyle = '#1e293b';
      const txt = comms[i].length > 95 ? comms[i].slice(0, 92) + '…' : comms[i];
      wrapText(ctx, txt, curX + 62, cardY + 47, CARD_W - 75, W * 0.025);
      ctx.font = `${W * 0.015}px sans-serif`; ctx.fillStyle = '#94a3b8';
      ctx.fillText(`♥ ${heartCountsRef.current[i] ?? 42}`, curX + 62, cardY + CARD_H - 9);
      ctx.globalAlpha = 1;
    }

    if (t >= QUOTE_START) {
      const ov = easeOut((t - QUOTE_START) / 0.55);
      ctx.fillStyle = `rgba(10,10,30,${ov * 0.84})`; ctx.fillRect(0, 0, W, H);
      if (t >= QUOTE_START + QUOTE_FADE) {
        const qa = easeOut((t - QUOTE_START - QUOTE_FADE) / 0.45);
        ctx.globalAlpha = qa;
        ctx.font = `bold ${W * 0.11}px Georgia, serif`; ctx.fillStyle = '#818cf8'; ctx.textAlign = 'center';
        ctx.fillText('\u201C', W / 2, H / 2 - 65);
        ctx.font = `${W * 0.037}px Georgia, serif`; ctx.fillStyle = '#f1f5f9'; ctx.textAlign = 'center';
        wrapText(ctx, q, W / 2, H / 2 - 15, W * 0.72, W * 0.044);
        ctx.fillStyle = '#818cf8'; ctx.fillRect(W / 2 - 32, H / 2 + 88, 64, 2.5);
        ctx.font = `600 ${W * 0.02}px -apple-system, sans-serif`; ctx.fillStyle = '#818cf8';
        ctx.fillText('AutoVid AI', W / 2, H / 2 + 116);
        ctx.globalAlpha = 1;
      }
    }

    if (t >= TOTAL - 0.4) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min((t - (TOTAL - 0.4)) / 0.4, 1)})`; ctx.fillRect(0, 0, W, H);
    }
  }, []);

  const startRender = useCallback((comms: string[], q: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const TOTAL = getDuration(comms.length);
    setStage('rendering'); setProgress(0);

    const ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    const now = ac.currentTime;
    comms.forEach((_, i) => playPop(ac, dest, now + 0.3 + i * COMMENT_INTERVAL + 0.08));
    playBell(ac, dest, now + 0.3 + comms.length * COMMENT_INTERVAL + QUOTE_OFFSET + QUOTE_FADE);

    const videoStream = canvas.captureStream(30);
    const combined = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus' : 'video/webm';
    const mr = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 5_000_000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mr.onstop = () => {
      const blobUrl = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = blobUrl;
      setDownloadUrl(blobUrl);
      setStage('done'); ac.close();
    };
    mr.start(100);

    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      drawFrame(ctx, t, comms, q);
      setProgress(Math.min((t / TOTAL) * 100, 99));
      if (t < TOTAL) { rafRef.current = requestAnimationFrame(tick); }
      else { drawFrame(ctx, TOTAL, comms, q); mr.stop(); }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [drawFrame]);

  // ── Button: Generate canvas intro video ──────────────────────────────────────
  const handleGenerateCanvas = async () => {
    cancelAnimationFrame(rafRef.current);
    setDownloadUrl(null);
    setStage('ai-loading');
    setAiError('');
    try {
      const [best, q] = await Promise.all([
        selectBestCommentsForIntro(comments),
        generateIntroQuote(comments),
      ]);
      setSelectedComments(best); setQuote(q);
      heartCountsRef.current = best.map(() => Math.floor(Math.random() * 900 + 40));
      setTimeout(() => startRender(best, q), 120);
    } catch (e: any) {
      setAiError(e.message || 'AI error');
      const fallback = comments.filter(c => c.length > 15 && c.length < 130).slice(0, 7);
      const fb_q = 'Every opinion matters. Every voice counts.';
      setSelectedComments(fallback); setQuote(fb_q);
      heartCountsRef.current = fallback.map(() => Math.floor(Math.random() * 900 + 40));
      setTimeout(() => startRender(fallback, fb_q), 120);
    }
  };

  // ── Button: Generate Veo 3 prompt ────────────────────────────────────────────
  const handleVeo3 = async () => {
    setVeo3Loading(true); setVeo3Error(''); setVeo3Prompt(''); setVeo3Copied(false);
    try {
      const p = await generateVeo3Prompt(comments, transcript);
      setVeo3Prompt(p);
    } catch (e: any) {
      setVeo3Error(e.message || 'Failed to generate prompt');
    } finally { setVeo3Loading(false); }
  };

  const handleCopyVeo3 = () => {
    navigator.clipboard.writeText(veo3Prompt).then(() => {
      setVeo3Copied(true);
      setTimeout(() => setVeo3Copied(false), 2500);
    });
  };

  const canvasVisible = stage !== 'idle';

  return (
    <div className="fixed inset-0 z-[999] flex flex-col bg-[#080810] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0c0c1a] border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-indigo-400" />
          <div>
            <p className="text-white font-bold text-sm leading-none">Intro Video Maker</p>
            <p className="text-zinc-500 text-[11px] mt-0.5">{comments.length} comments · 16:9</p>
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Idle state: two action buttons ─────────────────────────────────── */}
        {stage === 'idle' && (
          <div className="p-4 space-y-3">

            {/* Canvas animation button */}
            <button
              onClick={handleGenerateCanvas}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition-all text-white shadow-lg shadow-indigo-900/30"
            >
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Play size={20} />
              </div>
              <div className="text-left">
                <p className="font-bold text-sm">Canvas Intro Video Banao</p>
                <p className="text-indigo-200 text-xs mt-0.5">AI best comments select karega → animation render hogi → download milegi</p>
              </div>
            </button>

            {/* Veo 3 prompt button */}
            <button
              onClick={handleVeo3}
              disabled={veo3Loading}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#1a1030] hover:bg-[#22143d] active:scale-[0.98] border border-violet-500/30 hover:border-violet-400/50 transition-all text-white disabled:opacity-60"
            >
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
                {veo3Loading ? <Loader2 size={20} className="animate-spin text-violet-400" /> : <Video size={20} className="text-violet-400" />}
              </div>
              <div className="text-left">
                <p className="font-bold text-sm text-violet-200">Veo 3 Prompt Generate Karo</p>
                <p className="text-violet-400/70 text-xs mt-0.5">AI transcript se fast-cut style ka Veo 3 prompt banata hai — copy karke use karo</p>
              </div>
            </button>

            {/* Veo 3 output */}
            {veo3Error && (
              <div className="p-3 rounded-xl bg-red-900/20 border border-red-500/20 text-red-400 text-xs">{veo3Error}</div>
            )}
            {veo3Prompt && (
              <div className="rounded-2xl bg-[#100820] border border-violet-500/25 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-violet-500/15">
                  <div className="flex items-center gap-2">
                    <Wand2 size={13} className="text-violet-400" />
                    <span className="text-violet-300 text-xs font-bold uppercase tracking-widest">Veo 3 Prompt</span>
                  </div>
                  <button
                    onClick={handleCopyVeo3}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      veo3Copied
                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/25'
                    }`}
                  >
                    {veo3Copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
                <div className="p-4">
                  <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{veo3Prompt}</p>
                </div>
                <div className="px-4 pb-3">
                  <p className="text-violet-500/60 text-[11px]">👉 Yeh prompt Google Veo 3 / VideoFX mein paste karo</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Canvas area (visible when generating/rendering/done) ─────────── */}
        {canvasVisible && (
          <div className="space-y-0">

            {/* Canvas */}
            <div className="w-full relative bg-black" style={{ aspectRatio: '16/9', maxHeight: '55vh' }}>
              {stage === 'ai-loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-[#080810]">
                  <Loader2 size={30} className="text-indigo-400 animate-spin" />
                  <p className="text-zinc-300 text-sm font-medium">AI best comments select kar raha hai…</p>
                </div>
              )}
              <canvas
                ref={canvasRef}
                width={CW} height={CH}
                style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
              />
              {stage === 'rendering' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                  <div className="h-full bg-indigo-500 transition-all duration-200" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="px-4 py-3 bg-[#0c0c1a] border-b border-white/5 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {stage !== 'done'
                    ? <Loader2 size={12} className="text-indigo-400 animate-spin shrink-0" />
                    : <span className="text-emerald-400 text-sm">✓</span>
                  }
                  <span className="text-zinc-300 text-xs font-medium">
                    {stage === 'ai-loading' && 'AI comments select kar raha hai…'}
                    {stage === 'rendering' && `Rendering… ${Math.round(progress)}%`}
                    {stage === 'done' && 'Taiyaar! Download karo.'}
                  </span>
                </div>
                {stage === 'rendering' && (
                  <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all rounded-full" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {downloadUrl && (
                  <a href={downloadUrl} download="intro_video.webm"
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all">
                    <Download size={14} /> Download
                  </a>
                )}
                <button onClick={() => { cancelAnimationFrame(rafRef.current); setStage('idle'); setDownloadUrl(null); setProgress(0); }}
                  className="px-3 py-2.5 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-zinc-400 transition-all">
                  ← Back
                </button>
              </div>
            </div>

            {/* Comments preview */}
            {aiError && <div className="px-4 pt-3 text-amber-400 text-[11px]">AI fallback: {aiError}</div>}
            <div className="px-4 py-4 space-y-4">
              {quote && (
                <div className="p-3.5 rounded-xl bg-indigo-500/8 border border-indigo-500/18">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-1.5">AI Quote</p>
                  <p className="text-indigo-200 text-sm italic leading-relaxed">"{quote}"</p>
                </div>
              )}
              {selectedComments.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Selected Comments</p>
                  <div className="space-y-2">
                    {selectedComments.map((c, i) => (
                      <div key={i} className="flex gap-2.5 p-2.5 rounded-xl bg-white/3 border border-white/5">
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: CARD_COLORS[i % CARD_COLORS.length] }} />
                        <p className="text-zinc-300 text-xs leading-relaxed">{c}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Veo 3 section (when idle AND prompt generated) — also show in canvas view */}
        {stage !== 'idle' && veo3Prompt && (
          <div className="px-4 pb-4">
            <div className="rounded-2xl bg-[#100820] border border-violet-500/25 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-violet-500/15">
                <div className="flex items-center gap-2">
                  <Wand2 size={13} className="text-violet-400" />
                  <span className="text-violet-300 text-xs font-bold uppercase tracking-widest">Veo 3 Prompt</span>
                </div>
                <button onClick={handleCopyVeo3}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${veo3Copied ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/25'}`}>
                  {veo3Copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
              <div className="p-4">
                <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{veo3Prompt}</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default IntroVideoMaker;
