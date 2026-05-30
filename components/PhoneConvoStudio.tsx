import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Square, Download, Plus, Trash2, X, Check,
  Volume2, Smartphone, Palette, Video,
  ChevronDown, ChevronUp, Loader2,
  MonitorSmartphone,
} from 'lucide-react';
import { CanvasRenderer, PhoneConfig, ScriptTurn, StudioState, AnimStyle } from '../services/phoneCanvasRenderer';
import { renderVideoOffline } from '../services/videoRenderer';
import { toast } from './Toast';
import { DebateSegment } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const ANIM_STYLES: { value: AnimStyle; label: string; desc: string }[] = [
  { value: 'orb',          label: 'Orb',          desc: 'Glowing sphere' },
  { value: 'cosmic-sphere',label: 'Cosmic Sphere', desc: 'Nebula clouds' },
  { value: 'aurora',       label: 'Aurora',        desc: 'Northern lights' },
  { value: 'wave',         label: 'Wave Bars',     desc: 'Audio bars' },
  { value: 'bottom-glow',  label: 'Bottom Glow',   desc: 'Glow + blobs' },
];

const PRESET_COLORS = [
  { color: '#4285F4', screen: '#080c18', label: 'Blue' },
  { color: '#10b981', screen: '#04130e', label: 'Green' },
  { color: '#a855f7', screen: '#0d0618', label: 'Purple' },
  { color: '#f97316', screen: '#130800', label: 'Orange' },
  { color: '#ef4444', screen: '#130404', label: 'Red' },
  { color: '#06b6d4', screen: '#021013', label: 'Cyan' },
  { color: '#f59e0b', screen: '#130e01', label: 'Gold' },
  { color: '#e879f9', screen: '#120518', label: 'Pink' },
  { color: '#ffffff', screen: '#111111', label: 'White' },
];

const BG_OPTIONS = [
  { value: '#0f172a', label: 'Midnight' },
  { value: '#050505', label: 'Pure Black' },
  { value: '#0a0a12', label: 'Deep Dark' },
  { value: 'linear:#0a0a12,#12172a', label: 'Dark Gradient' },
  { value: 'linear:#0d0010,#200050', label: 'Purple Haze' },
  { value: 'linear:#000510,#0c1e40', label: 'Ocean Deep' },
  { value: '#1a1a2e', label: 'Dark Navy' },
  { value: '#f0f4f8', label: 'Light' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const speakerToPhoneId = (speaker: string) =>
  `p_${speaker.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`;

const buildPhonesFromSpeakers = (
  speakers: string[],
  existing: PhoneConfig[]
): PhoneConfig[] => {
  const styles: AnimStyle[] = ['cosmic-sphere', 'aurora', 'orb', 'wave', 'bottom-glow'];
  return speakers.map((spk, i) => {
    const existingPhone = existing.find(p => p.id === speakerToPhoneId(spk));
    if (existingPhone) return existingPhone;
    return {
      id: speakerToPhoneId(spk),
      name: spk,
      style: styles[i % styles.length],
      color: PRESET_COLORS[i % PRESET_COLORS.length].color,
      screenColor: PRESET_COLORS[i % PRESET_COLORS.length].screen,
      rotation: [-4, 5, -3, 4][i % 4],
      showControls: true,
    };
  });
};

const estimateWordTimings = (text: string, durationSec: number) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const weights = words.map(w => w.length + 2);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  return words.map((word, i) => {
    const dur = (weights[i] / total) * durationSec;
    const wt = { word, startTime: +t.toFixed(3), endTime: +(t + dur).toFixed(3) };
    t += dur;
    return wt;
  });
};

const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  mainScript: DebateSegment[];
}

// ─── Component ────────────────────────────────────────────────────────────────

const PhoneConvoStudio: React.FC<Props> = ({ mainScript }) => {
  const [phones, setPhones]   = useState<PhoneConfig[]>([]);
  const [script, setScript]   = useState<ScriptTurn[]>([]);
  const [bg, setBg]           = useState('linear:#0a0a12,#12172a');
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [subtitleBg, setSubtitleBg]           = useState<'dark' | 'light' | 'none'>('dark');
  const [subtitleSize, setSubtitleSize]       = useState(1.0);
  const [startTime, setStartTime]             = useState('09:41');
  const [spacing, setSpacing]   = useState(50);
  const [scale, setScale]       = useState(100);
  const [tab, setTab] = useState<'visual' | 'export'>('visual');
  const [visualSub, setVisualSub] = useState<'phones' | 'background' | 'subtitle'>('phones');

  // Canvas + renderer
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Audio playback
  const audioCtxRef    = useRef<AudioContext | null>(null);
  // Pre-fetched raw ArrayBuffer cache (keyed by URL) so play starts instantly
  const audioCacheRef  = useRef<Map<string, ArrayBuffer>>(new Map());

  // Export
  const [exporting, setExporting]       = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');

  const totalDuration = script.reduce((a, b) => a + b.durationMs, 0);

  // ── Sync main app script → PhoneConvoStudio ───────────────────────────────

  useEffect(() => {
    if (!mainScript.length) return;

    // Exclude NARRATOR from phone list
    const uniqueSpeakers = Array.from(
      new Set<string>(mainScript.map(s => s.speaker).filter(sp => sp !== 'NARRATOR'))
    );

    setPhones(prev => buildPhonesFromSpeakers(uniqueSpeakers, prev));

    const turns: ScriptTurn[] = mainScript.map(seg => {
      const isNarrator = seg.speaker === 'NARRATOR';
      return {
        id: seg.id,
        phoneId: isNarrator ? 'narrator' : speakerToPhoneId(seg.speaker),
        text: seg.text,
        isNarrator,
        // Narrator cards get a fixed 4-second display time
        durationMs: isNarrator
          ? 4000
          : seg.duration
            ? Math.round(seg.duration * 1000)
            : Math.max(2500, seg.text.length * 75),
        audioUrl: isNarrator ? undefined : seg.audioUrl,
        wordTimings: isNarrator ? undefined : (seg.wordTimings
          ? seg.wordTimings.map(wt => ({ word: wt.word, startTime: wt.start, endTime: wt.end }))
          : seg.audioUrl
            ? estimateWordTimings(seg.text, seg.duration ?? seg.text.length * 0.075)
            : undefined),
      };
    });
    setScript(turns);
  }, [mainScript]);

  const buildState = useCallback((): StudioState => ({
    phones,
    script,
    background: { type: 'color', value: bg },
    deviceSpacing: spacing,
    deviceScale: scale,
    startTime,
    subtitleConfig: {
      enabled: subtitleEnabled,
      size: subtitleSize,
      background: subtitleBg,
      textColor: '#ffffff',
    },
  }), [phones, script, bg, spacing, scale, startTime, subtitleEnabled, subtitleBg, subtitleSize]);

  // Init canvas renderer
  useEffect(() => {
    if (!canvasRef.current) return;
    const r = new CanvasRenderer(canvasRef.current, buildState());
    r.onTimeUpdate = t => setCurrentTime(t);
    r.onComplete   = () => setIsPlaying(false);
    rendererRef.current = r;
    r.drawFrame();
  }, []);

  // Update renderer state
  useEffect(() => {
    rendererRef.current?.updateState(buildState());
  }, [buildState]);

  // ── Pre-fetch audio into cache whenever script changes ────────────────────
  useEffect(() => {
    const urls = script.map(t => t.audioUrl).filter((u): u is string => !!u);
    urls.forEach(url => {
      if (audioCacheRef.current.has(url)) return; // already cached
      fetch(url)
        .then(r => r.arrayBuffer())
        .then(ab => { audioCacheRef.current.set(url, ab); })
        .catch(() => {});
    });
  }, [script]);

  // ── Playback ──────────────────────────────────────────────────────────────

  const togglePlay = async () => {
    const r = rendererRef.current;
    if (!r) return;
    if (isPlaying) {
      r.stop();
      setIsPlaying(false);
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      return;
    }

    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    const actx = new AudioContext();
    audioCtxRef.current = actx;

    // Capture seek position BEFORE async fetch
    const startMs = r.currentTime;

    // Use pre-fetched cache → decode only (no network wait) → instant start
    const buffers = await Promise.all(
      script.map(t => {
        if (!t.audioUrl) return Promise.resolve(null);
        const cached = audioCacheRef.current.get(t.audioUrl);
        const abPromise = cached
          ? Promise.resolve(cached.slice(0)) // slice = copy (decodeAudioData transfers/detaches)
          : fetch(t.audioUrl).then(res => res.arrayBuffer());
        return abPromise.then(ab => actx.decodeAudioData(ab)).catch(() => null);
      })
    );
    if (audioCtxRef.current !== actx) return; // cancelled

    let elapsed = 0;
    buffers.forEach((buf, i) => {
      const turnStartMs = elapsed;
      const turnEndMs   = elapsed + script[i].durationMs;
      elapsed = turnEndMs;

      if (!buf) return;
      if (turnEndMs <= startMs) return; // turn already passed — skip

      // How far into this audio buffer to start (if we seeked mid-turn)
      const audioOffsetSec = Math.max(0, (startMs - turnStartMs) / 1000);
      // When to play it relative to AudioContext start
      const scheduleAtSec  = actx.currentTime + Math.max(0, (turnStartMs - startMs) / 1000);

      if (audioOffsetSec >= buf.duration) return; // nothing left to play

      const src = actx.createBufferSource();
      src.buffer = buf;
      src.connect(actx.destination);
      src.start(scheduleAtSec, audioOffsetSec);
    });

    r.play();
    setIsPlaying(true);
  };

  const seek = (ms: number) => {
    rendererRef.current?.seek(ms);
    setCurrentTime(ms);
  };

  // ── Phone helpers ─────────────────────────────────────────────────────────

  const updatePhone = (id: string, ch: Partial<PhoneConfig>) =>
    setPhones(prev => prev.map(p => p.id === id ? { ...p, ...ch } : p));

  // ── Timeline ──────────────────────────────────────────────────────────────

  let timelineElapsed = 0;
  const timelineItems = script.map((turn, idx) => {
    const start = timelineElapsed;
    const end = timelineElapsed + turn.durationMs;
    timelineElapsed = end;
    const phone = phones.find(p => p.id === turn.phoneId);
    return { ...turn, start, end, idx, phoneName: phone?.name ?? '?', color: phone?.color ?? '#888' };
  });
  const activeTurn = timelineItems.find(it => currentTime >= it.start && currentTime < it.end);

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!script.length) { toast.error('Script empty hai'); return; }

    if (!('VideoEncoder' in window)) {
      toast.error('Yeh browser WebCodecs support nahi karta. Chrome ya Edge use karo.');
      return;
    }

    const W = 1920, H = 1080, FPS = 30;
    const totalMs = script.reduce((s, t) => s + t.durationMs, 0);
    const totalSec = totalMs / 1000;

    setExporting(true); setExportProgress(0); setExportStatus('Audio decode ho raha hai…');

    try {
      // ── 1. Decode all audio and mix into one Float32Array ─────────────────
      const actx = new AudioContext();
      const decoded = await Promise.all(
        script.map(t =>
          t.audioUrl
            ? fetch(t.audioUrl).then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).catch(() => null)
            : Promise.resolve(null)
        )
      );
      const sampleRate = decoded.find(Boolean)?.sampleRate ?? 24000;
      const totalSamples = Math.ceil(totalSec * sampleRate);
      const mixed = new Float32Array(totalSamples);
      let offsetMs = 0;
      decoded.forEach((buf, i) => {
        if (buf) {
          const startSample = Math.floor(offsetMs / 1000 * sampleRate);
          const ch = buf.getChannelData(0);
          for (let j = 0; j < ch.length && startSample + j < totalSamples; j++)
            mixed[startSample + j] += ch[j];
        }
        offsetMs += script[i].durationMs;
      });
      await actx.close();

      // ── 2. Create offscreen renderer at 1080p ─────────────────────────────
      setExportStatus('Video render ho raha hai…');
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = W; exportCanvas.height = H;
      const state = buildState();
      const exportRenderer = new CanvasRenderer(exportCanvas, state);

      // ── 3. Offline render via WebCodecs (mp4-muxer) — much faster ─────────
      const blob = await renderVideoOffline({
        canvas: exportCanvas,
        audioChannels: [mixed],
        sampleRate,
        duration: totalSec,
        fps: FPS,
        bitrate: 8_000_000,
        width: W,
        height: H,
        renderCallback: (_time, _level, _vid, offCtx) => {
          exportRenderer.currentTime = _time * 1000;
          exportRenderer.drawFrame();
          offCtx.drawImage(exportCanvas, 0, 0, W, H);
        },
        onProgress: p => {
          setExportProgress(Math.round(p * 100));
        },
      });

      if (!blob) throw new Error('Render empty return hua');

      // ── 4. Download ───────────────────────────────────────────────────────
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `phone-studio-${Date.now()}.mp4`; a.click();
      URL.revokeObjectURL(url);
      toast.success('✓ 1080p MP4 download ho gaya!');
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setExporting(false); setExportProgress(0); setExportStatus('');
    }
  }, [buildState, script]);

  // ── No script fallback ────────────────────────────────────────────────────

  if (!mainScript.length) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', background: '#050507', color: '#e0e0e0', padding: 32, textAlign: 'center', gap: 16,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MonitorSmartphone size={28} color="#ef4444" />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Script nahi mila</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, maxWidth: 320 }}>
            Pehle main flow mein <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Script → Audio</strong> steps complete karein.
            Jab audio generate ho jaaye, Phone Studio us script aur audio ko automatically use karega.
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#050507', color: '#e0e0e0', overflow: 'hidden', fontFamily: 'inherit' }}>

      {/* ── 16:9 Canvas Preview ── */}
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', flexShrink: 0, background: '#050505', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <canvas
            ref={canvasRef}
            width={1920}
            height={1080}
            style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
          />
          {!exporting && (
            <div style={{
              position: 'absolute', bottom: 10, left: 10,
              background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(8px)', borderRadius: 20,
              padding: '3px 10px', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.6)',
            }}>
              {fmtTime(currentTime)} <span style={{ color: 'rgba(255,255,255,0.3)' }}>/ {fmtTime(totalDuration)}</span>
            </div>
          )}
          {isPlaying && (
            <div style={{
              position: 'absolute', top: 10, right: 10,
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 700,
              color: '#ef4444', display: 'flex', alignItems: 'center', gap: 5, letterSpacing: '0.1em',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
              LIVE
            </div>
          )}
          {/* Audio badge */}
          <div style={{
            position: 'absolute', top: 10, left: 10,
            background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20, padding: '3px 10px', fontSize: 10, color: 'rgba(255,255,255,0.4)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Volume2 size={10} />
            {script.filter(t => t.audioUrl).length}/{script.length} audio
          </div>
        </div>
      </div>

      {/* ── Playback + Seek ── */}
      <div style={{ flexShrink: 0, padding: '8px 12px 6px', background: '#0a0a0d', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={togglePlay}
            disabled={!script.length}
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: '#fff', border: 'none', cursor: script.length ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: script.length ? 1 : 0.3,
              boxShadow: '0 2px 8px rgba(255,255,255,0.1)',
            }}
          >
            {isPlaying
              ? <Square size={13} fill="#000" color="#000" />
              : <Play size={13} fill="#000" color="#000" style={{ marginLeft: 1 }} />}
          </button>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input
              type="range" min={0} max={totalDuration || 1} value={currentTime}
              onChange={e => seek(+e.target.value)}
              style={{ width: '100%', accentColor: '#ef4444', cursor: 'pointer', height: 3 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
              <span>{activeTurn ? `${activeTurn.idx + 1}/${script.length} · ${activeTurn.phoneName}` : `0/${script.length}`}</span>
              <span>{fmtTime(totalDuration)}</span>
            </div>
          </div>
        </div>

        {/* Timeline chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 6, paddingBottom: 2 }}>
          {timelineItems.map(item => {
            const active = currentTime >= item.start && currentTime < item.end;
            return (
              <button
                key={item.id}
                onClick={() => { if (!isPlaying) seek(item.start); }}
                disabled={isPlaying}
                style={{
                  flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  width: 44, padding: '5px 4px', borderRadius: 10,
                  cursor: isPlaying ? 'default' : 'pointer',
                  border: `1px solid ${active ? item.color + '70' : 'rgba(255,255,255,0.05)'}`,
                  background: active ? item.color + '18' : 'rgba(255,255,255,0.03)',
                  position: 'relative', transition: 'all 0.15s',
                  opacity: isPlaying && !active ? 0.4 : 1,
                }}
              >
                {active && <div style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />}
                <div style={{
                  width: 24, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: item.color + '28', border: `1px solid ${item.color}44`,
                  color: item.color, fontSize: 10, fontWeight: 800, marginBottom: 2,
                }}>
                  {item.phoneName[0]}
                </div>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                  {(item.durationMs / 1000).toFixed(0)}s
                </span>
              </button>
            );
          })}
          {!script.length && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', padding: '6px 2px', alignSelf: 'center' }}>
              Script turns nahi hain
            </span>
          )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#080809' }}>
        {([
          { id: 'visual', label: 'Settings', icon: '⚙️' },
          { id: 'export', label: 'Export',   icon: '📤' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${tab === t.id ? '#ef4444' : 'transparent'}`,
              color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.38)',
              fontSize: 12, fontWeight: 700, transition: 'all 0.15s', letterSpacing: '0.05em',
              fontFamily: 'inherit',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ════ SETTINGS / VISUAL TAB ════ */}
        {tab === 'visual' && (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Script info banner */}
            <div style={{
              padding: '10px 12px', borderRadius: 12,
              background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#86efac' }}>
                  Main App Script Connected
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  {script.length} turns · {phones.length} speakers · {script.filter(t => t.audioUrl).length}/{script.length} audio ready
                </div>
              </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4 }}>
              {(['phones', 'background', 'subtitle'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setVisualSub(s)}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: visualSub === s ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: visualSub === s ? '#fff' : 'rgba(255,255,255,0.35)',
                    fontSize: 11, fontWeight: 600, fontFamily: 'inherit', textTransform: 'capitalize',
                  }}
                >
                  {s === 'subtitle' ? 'Subtitles' : s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {/* ── Phones sub-tab ── */}
            {visualSub === 'phones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Spacing + Scale sliders */}
                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    Layout
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {([
                      { label: 'Spacing', value: spacing, set: setSpacing, min: 0, max: 100 },
                      { label: 'Scale', value: scale, set: setScale, min: 50, max: 150 },
                    ] as const).map(sl => (
                      <div key={sl.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{sl.label}</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{sl.value}</span>
                        </div>
                        <input
                          type="range" min={sl.min} max={sl.max} value={sl.value}
                          onChange={e => sl.set(+e.target.value)}
                          style={{ width: '100%', accentColor: '#ef4444' }}
                        />
                      </div>
                    ))}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Clock Start</span>
                        <input
                          value={startTime}
                          onChange={e => setStartTime(e.target.value)}
                          style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 11, fontFamily: 'monospace', outline: 'none', width: 50, textAlign: 'right' }}
                          placeholder="09:41"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Phone cards (one per speaker) */}
                {phones.map((phone) => (
                  <div key={phone.id} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: phone.color, flexShrink: 0 }} />
                      <input
                        value={phone.name}
                        onChange={e => updatePhone(phone.id, { name: e.target.value })}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, outline: 'none', fontFamily: 'inherit' }}
                      />
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                        {script.filter(t => t.phoneId === phone.id).length} turns
                      </span>
                    </div>
                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

                      {/* Animation style */}
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Animation</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {ANIM_STYLES.map(s => (
                            <button
                              key={s.value}
                              onClick={() => updatePhone(phone.id, { style: s.value })}
                              title={s.desc}
                              style={{
                                padding: '5px 10px', borderRadius: 8,
                                border: `1px solid ${phone.style === s.value ? phone.color : 'rgba(255,255,255,0.1)'}`,
                                background: phone.style === s.value ? phone.color + '25' : 'rgba(255,255,255,0.04)',
                                color: phone.style === s.value ? '#fff' : 'rgba(255,255,255,0.4)',
                                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Color presets */}
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Color</div>
                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                          {PRESET_COLORS.map(pc => (
                            <div
                              key={pc.color}
                              onClick={() => updatePhone(phone.id, { color: pc.color, screenColor: pc.screen })}
                              title={pc.label}
                              style={{
                                width: 24, height: 24, borderRadius: '50%', background: pc.color, cursor: 'pointer',
                                boxShadow: phone.color === pc.color
                                  ? `0 0 0 2px #050507, 0 0 0 3.5px ${pc.color}`
                                  : 'none',
                                transform: phone.color === pc.color ? 'scale(1.18)' : 'scale(1)',
                                transition: 'all 0.15s',
                              }}
                            />
                          ))}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="color" value={phone.color}
                              onChange={e => updatePhone(phone.id, { color: e.target.value })}
                              style={{ width: 24, height: 24, border: 'none', padding: 0, background: 'none', cursor: 'pointer', borderRadius: '50%' }}
                              title="Custom color"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Rotation */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tilt</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{phone.rotation ?? 0}°</span>
                        </div>
                        <input
                          type="range" min={-15} max={15} value={phone.rotation ?? 0}
                          onChange={e => updatePhone(phone.id, { rotation: +e.target.value })}
                          style={{ width: '100%', accentColor: phone.color }}
                        />
                      </div>

                      {/* Call controls toggle */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <div
                          onClick={() => updatePhone(phone.id, { showControls: !phone.showControls })}
                          style={{
                            width: 36, height: 20, borderRadius: 50, position: 'relative', cursor: 'pointer',
                            background: phone.showControls !== false ? '#ef4444' : 'rgba(255,255,255,0.1)',
                            transition: 'background 0.2s', flexShrink: 0,
                          }}
                        >
                          <div style={{
                            position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
                            background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                            left: phone.showControls !== false ? 18 : 2,
                          }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Show call controls</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Background sub-tab ── */}
            {visualSub === 'background' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {BG_OPTIONS.map(opt => {
                  const sel = bg === opt.value;
                  const preview = opt.value.startsWith('linear:')
                    ? 'linear-gradient(135deg,' + opt.value.slice(7) + ')'
                    : opt.value;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => setBg(opt.value)}
                      style={{
                        aspectRatio: '16/9', borderRadius: 10, cursor: 'pointer',
                        background: preview,
                        border: `2px solid ${sel ? '#ef4444' : 'rgba(255,255,255,0.06)'}`,
                        position: 'relative', overflow: 'hidden',
                        transition: 'border-color 0.15s',
                      }}
                    >
                      {sel && <div style={{ position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={11} /></div>}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '5px 7px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{opt.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Subtitle sub-tab ── */}
            {visualSub === 'subtitle' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Enable toggle */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', cursor: 'pointer' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Show Subtitles</span>
                  <div
                    onClick={() => setSubtitleEnabled(p => !p)}
                    style={{
                      width: 40, height: 22, borderRadius: 50, position: 'relative', cursor: 'pointer',
                      background: subtitleEnabled ? '#ef4444' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s',
                    }}
                  >
                    <div style={{ position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', left: subtitleEnabled ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
                  </div>
                </label>

                {/* Size slider */}
                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Font Size</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{subtitleSize.toFixed(1)}×</span>
                  </div>
                  <input
                    type="range" min={0.5} max={2.0} step={0.05} value={subtitleSize}
                    onChange={e => setSubtitleSize(+e.target.value)}
                    style={{ width: '100%', accentColor: '#ef4444' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>0.5×</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>2.0×</span>
                  </div>
                </div>

                {/* Background style */}
                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Background Style</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['dark', 'light', 'none'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setSubtitleBg(s)}
                        style={{
                          flex: 1, padding: '7px 4px', borderRadius: 8,
                          border: `1px solid ${subtitleBg === s ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                          background: subtitleBg === s ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                          color: subtitleBg === s ? '#fff' : 'rgba(255,255,255,0.4)',
                          fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sync info */}
                <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                  <span style={{ color: '#86efac', fontWeight: 700 }}>Word-by-word mode:</span> Subtitles ek-ek word karke aate hain — naturally, jaise typing. Sync ki hui files (STT) use hoti hain agar available ho, warna weight estimate.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ EXPORT TAB ════ */}
        {tab === 'export' && (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Info card */}
            <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Export — 1080p MP4</div>
              {[
                `Format: MP4 (H.264 · AAC)  ·  1920×1080`,
                `Quality: 8 Mbps High Bitrate`,
                `Duration: ${fmtTime(totalDuration)}`,
                `${phones.length} phone${phones.length > 1 ? 's' : ''} · ${script.length} turns`,
                `Audio: ${script.filter(t => t.audioUrl).length}/${script.length} turns ready`,
              ].map(t => (
                <div key={t} style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', display: 'flex', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: '#ef4444' }}>•</span> {t}
                </div>
              ))}
            </div>

            {/* Progress bar (only while exporting) */}
            {exporting && (
              <div style={{ borderRadius: 14, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.07)', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#fca5a5', fontWeight: 700 }}>{exportStatus || 'Rendering…'}</span>
                  <span style={{ color: '#ef4444', fontFamily: 'monospace', fontWeight: 700 }}>{exportProgress}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 6, width: `${exportProgress}%`,
                    background: 'linear-gradient(90deg,#ef4444,#f97316)',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
                  Faster than real-time · WebCodecs offline render
                </div>
              </div>
            )}

            {/* Single export button */}
            <button
              onClick={handleExport}
              disabled={exporting || !script.length}
              style={{
                width: '100%', padding: '15px', borderRadius: 14,
                background: (!script.length || exporting) ? 'rgba(255,255,255,0.05)' : '#ef4444',
                border: 'none', color: '#fff', fontWeight: 800, fontSize: 15,
                cursor: (!script.length || exporting) ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: 'inherit', opacity: (!script.length || exporting) ? 0.4 : 1,
                boxShadow: (!script.length || exporting) ? 'none' : '0 8px 28px rgba(239,68,68,0.35)',
                letterSpacing: '0.06em', transition: 'all 0.2s',
              }}
            >
              {exporting
                ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Rendering {exportProgress}%…</>
                : <><Download size={17} /> EXPORT 1080p MP4</>
              }
            </button>
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  );
};

export default PhoneConvoStudio;
