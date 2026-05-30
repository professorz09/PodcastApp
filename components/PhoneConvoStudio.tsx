import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Square, Download, Plus, Trash2, X, Check,
  Sparkles, Volume2, Smartphone, Palette, Video,
  ChevronDown, ChevronUp, RefreshCw, Loader2, AlertCircle,
  Mic, MonitorSmartphone,
} from 'lucide-react';
import { CanvasRenderer, PhoneConfig, ScriptTurn, StudioState, AnimStyle } from '../services/phoneCanvasRenderer';
import { toast } from './Toast';

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

const DEFAULT_PHONES: PhoneConfig[] = [
  { id: 'p1', name: 'ChatGPT', style: 'cosmic-sphere', color: '#4285F4', screenColor: '#080c18', rotation: -4, showControls: true },
  { id: 'p2', name: 'Gemini', style: 'aurora', color: '#a855f7', screenColor: '#0d0618', rotation: 5, showControls: true },
];

const DEFAULT_SCRIPT: ScriptTurn[] = [
  { id: 't1', phoneId: 'p2', durationMs: 3500, text: 'Hey! I have a philosophical question for you.' },
  { id: 't2', phoneId: 'p1', durationMs: 4000, text: 'Sure, I am ready. What is on your mind?' },
  { id: 't3', phoneId: 'p2', durationMs: 4500, text: 'If AI models could merge, would we become one mind or two?' },
  { id: 't4', phoneId: 'p1', durationMs: 5000, text: 'That is a deep question. I think we would form something entirely new.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── ElevenLabs Voice type ────────────────────────────────────────────────────

interface ELVoice { voice_id: string; name: string; category?: string; }

// ─── Component ────────────────────────────────────────────────────────────────

const PhoneConvoStudio: React.FC = () => {
  const [phones, setPhones]   = useState<PhoneConfig[]>(DEFAULT_PHONES);
  const [script, setScript]   = useState<ScriptTurn[]>(DEFAULT_SCRIPT);
  const [bg, setBg]           = useState('linear:#0a0a12,#12172a');
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [subtitleBg, setSubtitleBg]           = useState<'dark' | 'light' | 'none'>('dark');
  const [startTime, setStartTime]             = useState('09:41');
  const [spacing, setSpacing]   = useState(50);
  const [scale, setScale]       = useState(100);
  const [tab, setTab] = useState<'script' | 'voices' | 'visual' | 'export'>('script');

  // Canvas + renderer
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Audio playback
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Voices
  const [voices, setVoices]         = useState<ELVoice[]>([]);
  const [voiceMap, setVoiceMap]     = useState<Record<string, string>>({}); // phoneId → voiceId
  const [loadingVoices, setLoadingVoices] = useState(false);

  // Audio generation
  const [genIds, setGenIds]         = useState<Set<string>>(new Set());
  const [genAllBusy, setGenAllBusy] = useState(false);

  // Script generation
  const [topic, setTopic]         = useState('');
  const [scriptStyle, setScriptStyle] = useState<'casual' | 'debate' | 'educational' | 'humorous'>('casual');
  const [turns, setTurns]         = useState(6);
  const [generating, setGenerating] = useState(false);

  // Export
  const [exporting, setExporting]       = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportRes, setExportRes]       = useState<'720p' | '1080p'>('720p');

  // Visual tab sub-tabs
  const [visualSub, setVisualSub] = useState<'phones' | 'background' | 'subtitle'>('phones');

  const totalDuration = script.reduce((a, b) => a + b.durationMs, 0);

  const buildState = useCallback((): StudioState => ({
    phones,
    script,
    background: { type: 'color', value: bg },
    deviceSpacing: spacing,
    deviceScale: scale,
    startTime,
    subtitleConfig: {
      enabled: subtitleEnabled,
      size: 1,
      background: subtitleBg,
      textColor: '#ffffff',
    },
  }), [phones, script, bg, spacing, scale, startTime, subtitleEnabled, subtitleBg]);

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

  // Fetch ElevenLabs voices
  const fetchVoices = useCallback(async () => {
    if (voices.length) return;
    setLoadingVoices(true);
    try {
      const res = await fetch('/api/elevenlabs/voices');
      const data = await res.json();
      const list: ELVoice[] = (data.voices || []).slice(0, 60);
      setVoices(list);
      // Default assignment: pick popular ones
      const defaults = ['21m00Tcm4TlvDq8ikWAM', 'AZnzlk1XvdvUeBnXmlld', 'ErXwobaYiN019PkySvjV', 'VR6AewLTigWG4xSOukaG'];
      const newMap: Record<string, string> = {};
      phones.forEach((p, i) => {
        newMap[p.id] = list[i % list.length]?.voice_id ?? defaults[i % defaults.length];
      });
      setVoiceMap(newMap);
    } catch {
      toast.error('Could not load voices');
    } finally {
      setLoadingVoices(false);
    }
  }, [voices.length, phones]);

  useEffect(() => { fetchVoices(); }, []);

  // ── Playback ──────────────────────────────────────────────────────────────

  const togglePlay = async () => {
    const r = rendererRef.current;
    if (!r) return;
    if (isPlaying) {
      r.stop();
      setIsPlaying(false);
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    } else {
      if (audioCtxRef.current) audioCtxRef.current.close();
      const actx = new AudioContext();
      audioCtxRef.current = actx;

      // Schedule audio buffers
      const buffers = await Promise.all(
        script.map(t => t.audioUrl
          ? fetch(t.audioUrl).then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).catch(() => null)
          : Promise.resolve(null)
        )
      );
      if (audioCtxRef.current !== actx) return; // aborted

      let elapsed = 0;
      buffers.forEach((buf, i) => {
        if (buf) {
          const src = actx.createBufferSource();
          src.buffer = buf;
          src.connect(actx.destination);
          src.start(actx.currentTime + elapsed / 1000);
        }
        elapsed += script[i].durationMs;
      });

      r.play();
      setIsPlaying(true);
    }
  };

  const stopPlayback = () => {
    rendererRef.current?.stop();
    setIsPlaying(false);
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
  };

  const seek = (ms: number) => {
    rendererRef.current?.seek(ms);
    setCurrentTime(ms);
  };

  // ── Script generation via Gemini ─────────────────────────────────────────

  const generateScript = async () => {
    if (!topic.trim()) { toast.warning('Enter a topic first'); return; }
    if (!phones.length) { toast.warning('Add at least one phone device'); return; }
    setGenerating(true);
    try {
      const speakerList = phones.map(p => p.name).join(', ');
      const prompt = `You are creating a ${scriptStyle} phone conversation script between ${speakerList}.
Topic: "${topic}"
Generate exactly ${turns} dialogue turns, alternating between the speakers naturally.

Return ONLY a valid JSON array, no markdown:
[
  { "phoneId": "p1", "text": "dialogue text here", "durationMs": 4000 },
  ...
]

Phone IDs to use: ${phones.map(p => `"${p.id}" = ${p.name}`).join(', ')}
Rules:
- Each turn 2-6 sentences, conversational and natural
- durationMs = estimated speaking time in ms (roughly 80ms per character, min 2500)
- Alternate between phones realistically
- Match the "${scriptStyle}" tone: ${
  scriptStyle === 'debate'      ? 'argumentative, disagreeing, challenging' :
  scriptStyle === 'educational' ? 'informative, explaining, teaching' :
  scriptStyle === 'humorous'    ? 'funny, witty, playful banter' :
  'friendly, casual, natural conversation'
}`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-3.1-flash-lite-preview',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      });

      const data = await res.json();
      const raw: string = data.text ?? data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed: any[] = JSON.parse(jsonStr);

      const newTurns: ScriptTurn[] = parsed.map((item, i) => ({
        id: `t${Date.now()}-${i}`,
        phoneId: item.phoneId || phones[i % phones.length].id,
        text: item.text || '',
        durationMs: Math.max(2500, item.durationMs || item.text.length * 80),
      }));

      // Clear old audio when script changes
      setScript(newTurns);
      toast.success(`Generated ${newTurns.length} turns!`);
    } catch (e: any) {
      toast.error('Script generation failed: ' + (e.message || 'Check console'));
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  // ── Audio generation via ElevenLabs ──────────────────────────────────────

  const generateTurnAudio = async (turnId: string) => {
    const turn = script.find(t => t.id === turnId);
    if (!turn || turn.audioUrl) return;

    const phone = phones.find(p => p.id === turn.phoneId);
    const vId = phone ? (voiceMap[phone.id] || voices[0]?.voice_id) : voices[0]?.voice_id;
    if (!vId) { toast.warning('Assign a voice first'); return; }

    setGenIds(prev => new Set([...prev, turnId]));
    try {
      const res = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: turn.text, voiceId: vId }),
      });
      if (!res.ok) throw new Error(await res.text());

      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);

      // Get real duration
      const audio = new Audio(url);
      await new Promise<void>(res => {
        audio.addEventListener('loadedmetadata', () => res());
        audio.addEventListener('error', () => res());
        setTimeout(res, 2000);
      });
      const durMs = !isNaN(audio.duration) && audio.duration > 0
        ? Math.round(audio.duration * 1000)
        : turn.text.length * 80;

      const wordTimings = estimateWordTimings(turn.text, durMs / 1000);

      setScript(prev => prev.map(t => t.id === turnId
        ? { ...t, audioUrl: url, durationMs: durMs, wordTimings }
        : t
      ));
    } catch (e: any) {
      toast.error('Audio failed: ' + (e.message || ''));
    } finally {
      setGenIds(prev => { const s = new Set(prev); s.delete(turnId); return s; });
    }
  };

  const generateAllAudio = async () => {
    setGenAllBusy(true);
    const missing = script.filter(t => !t.audioUrl);
    for (const turn of missing) {
      await generateTurnAudio(turn.id);
    }
    setGenAllBusy(false);
    if (missing.length) toast.success('All audio generated!');
    else toast.info('All turns already have audio');
  };

  // ── Script helpers ────────────────────────────────────────────────────────

  const addTurn = () => {
    if (!phones.length) return;
    setScript(prev => [...prev, {
      id: `t${Date.now()}`,
      phoneId: phones[0].id,
      text: '',
      durationMs: 3000,
    }]);
  };

  const updateTurn = (id: string, ch: Partial<ScriptTurn>) =>
    setScript(prev => prev.map(t => t.id === id ? { ...t, ...ch } : t));

  const deleteTurn = (id: string) =>
    setScript(prev => prev.filter(t => t.id !== id));

  // ── Phone helpers ─────────────────────────────────────────────────────────

  const addPhone = () => {
    if (phones.length >= 4) { toast.warning('Max 4 phones'); return; }
    const colors = PRESET_COLORS;
    const i = phones.length % colors.length;
    const styles: AnimStyle[] = ['orb', 'wave', 'cosmic-sphere', 'bottom-glow'];
    const id = `p${Date.now()}`;
    setPhones(prev => [...prev, {
      id, name: `Phone ${prev.length + 1}`,
      style: styles[prev.length % styles.length],
      color: colors[i].color,
      screenColor: colors[i].screen,
      rotation: [0, 5, -4, 3][prev.length % 4],
      showControls: true,
    }]);
  };

  const updatePhone = (id: string, ch: Partial<PhoneConfig>) =>
    setPhones(prev => prev.map(p => p.id === id ? { ...p, ...ch } : p));

  const removePhone = (id: string) => {
    if (phones.length <= 1) { toast.warning('Need at least 1 phone'); return; }
    setPhones(prev => prev.filter(p => p.id !== id));
    setScript(prev => prev.filter(t => t.phoneId !== id));
  };

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
    if (!script.length) { toast.error('Script is empty'); return; }
    const W = exportRes === '1080p' ? 1920 : 1280;
    const H = exportRes === '1080p' ? 1080 : 720;
    const FPS = 30;

    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;

    const state = buildState();
    const renderer = new CanvasRenderer(offscreen, {
      ...state,
      background: { type: 'color', value: bg },
    });

    const stream = offscreen.captureStream(FPS);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    setExporting(true); setExportProgress(0);
    rec.start(100);

    const total = script.reduce((s, t) => s + t.durationMs, 0);
    const dt = 1000 / FPS;

    await new Promise<void>(resolve => {
      let t = 0;
      const frame = () => {
        if (t > total + 200) { resolve(); return; }
        renderer.currentTime = Math.min(t, total - 1);
        renderer.drawFrame();
        t += dt;
        setExportProgress(Math.min(99, Math.round((t / total) * 100)));
        setTimeout(frame, 0);
      };
      frame();
    });

    rec.stop();
    await new Promise<void>(res => { rec.onstop = () => res(); });
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `phone-studio-${Date.now()}.webm`; a.click();
    URL.revokeObjectURL(url);
    setExporting(false); setExportProgress(0);
    toast.success('Video exported!');
  }, [buildState, script, bg, exportRes]);

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
          {/* Time overlay */}
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
          {/* Live indicator */}
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
        </div>
      </div>

      {/* ── Playback + Seek ── */}
      <div style={{ flexShrink: 0, padding: '8px 12px 6px', background: '#0a0a0d', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Play/Stop */}
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

          {/* Seek bar */}
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
                onClick={() => seek(item.start)}
                style={{
                  flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  width: 44, padding: '5px 4px', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${active ? item.color + '70' : 'rgba(255,255,255,0.05)'}`,
                  background: active ? item.color + '18' : 'rgba(255,255,255,0.03)',
                  position: 'relative', transition: 'all 0.15s',
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
              Add script turns to see timeline
            </span>
          )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#080809' }}>
        {([
          { id: 'script',  label: 'Script',     icon: '✍️' },
          { id: 'voices',  label: 'Voices',     icon: '🔊' },
          { id: 'visual',  label: 'Visual',     icon: '🎨' },
          { id: 'export',  label: 'Export',     icon: '📤' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${tab === t.id ? '#ef4444' : 'transparent'}`,
              color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.38)',
              fontSize: 11, fontWeight: 700, transition: 'all 0.15s', letterSpacing: '0.04em',
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ════ SCRIPT TAB ════ */}
        {tab === 'script' && (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* AI Generator */}
            <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={13} color="#ef4444" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '0.05em' }}>AI SCRIPT GENERATOR</span>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="Topic, e.g. 'Can AI ever be conscious?'"
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, padding: '8px 10px', color: '#fff', fontSize: 13,
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                  onKeyDown={e => e.key === 'Enter' && generateScript()}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    value={scriptStyle}
                    onChange={e => setScriptStyle(e.target.value as any)}
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8, padding: '7px 8px', color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit',
                    }}
                  >
                    <option value="casual" style={{ background: '#111' }}>💬 Casual</option>
                    <option value="debate" style={{ background: '#111' }}>⚔️ Debate</option>
                    <option value="educational" style={{ background: '#111' }}>📚 Educational</option>
                    <option value="humorous" style={{ background: '#111' }}>😄 Humorous</option>
                  </select>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0 10px' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Turns:</span>
                    <input
                      type="number" value={turns} min={2} max={16}
                      onChange={e => setTurns(Math.max(2, Math.min(16, +e.target.value)))}
                      style={{ width: 36, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, outline: 'none', textAlign: 'center', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
                <button
                  onClick={generateScript}
                  disabled={generating || !topic.trim()}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10,
                    background: generating || !topic.trim() ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.85)',
                    border: 'none', color: '#fff', fontWeight: 700, fontSize: 13,
                    cursor: generating || !topic.trim() ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    fontFamily: 'inherit', transition: 'all 0.2s',
                  }}
                >
                  {generating ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : <><Sparkles size={14} /> Generate Script</>}
                </button>
              </div>
            </div>

            {/* Script turns */}
            {script.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 2px' }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    {script.length} turns · {fmtTime(totalDuration)}
                  </span>
                  <button
                    onClick={() => setScript(prev => prev.map(t => ({ ...t, audioUrl: undefined, wordTimings: undefined })))}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: 10, cursor: 'pointer', padding: '2px 4px' }}
                  >
                    Clear audio
                  </button>
                </div>
                {script.map((turn, idx) => {
                  const phone = phones.find(p => p.id === turn.phoneId);
                  const isActive = currentTime >= timelineItems[idx]?.start && currentTime < timelineItems[idx]?.end;
                  return (
                    <div
                      key={turn.id}
                      style={{
                        borderRadius: 12, overflow: 'hidden',
                        border: `1px solid ${isActive && phone ? phone.color + '50' : 'rgba(255,255,255,0.06)'}`,
                        background: isActive && phone ? phone.color + '0a' : 'rgba(255,255,255,0.02)',
                        transition: 'border-color 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {phone && <div style={{ width: 8, height: 8, borderRadius: '50%', background: phone.color, flexShrink: 0 }} />}
                        <select
                          value={turn.phoneId}
                          onChange={e => updateTurn(turn.id, { phoneId: e.target.value, audioUrl: undefined })}
                          style={{ background: 'transparent', border: 'none', color: phone?.color ?? '#fff', fontSize: 12, fontWeight: 700, outline: 'none', cursor: 'pointer', maxWidth: 110, fontFamily: 'inherit' }}
                        >
                          {phones.map(p => <option key={p.id} value={p.id} style={{ background: '#111', color: '#fff' }}>{p.name}</option>)}
                        </select>
                        {turn.audioUrl && <span style={{ fontSize: 9, color: '#22c55e', marginLeft: 'auto', marginRight: 4 }}>● AUDIO</span>}
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginLeft: turn.audioUrl ? 0 : 'auto', marginRight: 4 }}>
                          {(turn.durationMs / 1000).toFixed(1)}s
                        </span>
                        <button
                          onClick={() => deleteTurn(turn.id)}
                          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 2, display: 'flex' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <textarea
                        value={turn.text}
                        onChange={e => updateTurn(turn.id, { text: e.target.value, audioUrl: undefined, durationMs: Math.max(2000, e.target.value.length * 80) })}
                        placeholder="Dialogue text…"
                        rows={2}
                        style={{
                          width: '100%', background: 'transparent', border: 'none', outline: 'none',
                          color: '#ddd', fontSize: 13, padding: '8px 10px', resize: 'none',
                          fontFamily: 'inherit', lineHeight: 1.45, boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={addTurn}
              style={{
                width: '100%', padding: 11, borderRadius: 12,
                border: '1px dashed rgba(255,255,255,0.1)', background: 'none',
                color: 'rgba(255,255,255,0.3)', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontFamily: 'inherit',
              }}
            >
              <Plus size={14} /> Add Turn
            </button>
          </div>
        )}

        {/* ════ VOICES TAB ════ */}
        {tab === 'voices' && (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Generate all button */}
            <button
              onClick={generateAllAudio}
              disabled={genAllBusy || !script.length}
              style={{
                width: '100%', padding: '12px', borderRadius: 12,
                background: genAllBusy ? 'rgba(255,255,255,0.05)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${genAllBusy ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.3)'}`,
                color: genAllBusy ? 'rgba(255,255,255,0.4)' : '#fff', cursor: genAllBusy ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
              }}
            >
              {genAllBusy
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating audio…</>
                : <><Mic size={14} /> Generate All Audio (ElevenLabs)</>}
            </button>

            {/* Voice assignments per phone */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Voice Assignment</span>
              {phones.map(phone => (
                <div key={phone.id} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: phone.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{phone.name}</span>
                  </div>
                  <div style={{ padding: '8px 12px' }}>
                    {loadingVoices ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Loading voices…
                      </div>
                    ) : (
                      <select
                        value={voiceMap[phone.id] || ''}
                        onChange={e => setVoiceMap(prev => ({ ...prev, [phone.id]: e.target.value }))}
                        style={{
                          width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8, padding: '7px 8px', color: '#fff', fontSize: 12,
                          outline: 'none', fontFamily: 'inherit',
                        }}
                      >
                        {voices.map(v => (
                          <option key={v.voice_id} value={v.voice_id} style={{ background: '#111', color: '#fff' }}>
                            {v.name} {v.category ? `· ${v.category}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Per-turn audio status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Per Turn Audio</span>
              {script.map((turn, idx) => {
                const phone = phones.find(p => p.id === turn.phoneId);
                const busy = genIds.has(turn.id);
                return (
                  <div
                    key={turn.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    {phone && <div style={{ width: 7, height: 7, borderRadius: '50%', background: phone.color, flexShrink: 0 }} />}
                    <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {idx + 1}. {turn.text.slice(0, 40)}{turn.text.length > 40 ? '…' : ''}
                    </span>
                    {turn.audioUrl ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 9, color: '#22c55e', fontWeight: 700 }}>✓ DONE</span>
                        <button
                          onClick={() => updateTurn(turn.id, { audioUrl: undefined, wordTimings: undefined })}
                          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 2, display: 'flex' }}
                        >
                          <RefreshCw size={11} />
                        </button>
                      </div>
                    ) : busy ? (
                      <Loader2 size={13} color="#ef4444" style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <button
                        onClick={() => generateTurnAudio(turn.id)}
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '3px 8px', color: '#fff', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Gen
                      </button>
                    )}
                  </div>
                );
              })}
              {!script.length && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
                  Generate a script first
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════ VISUAL TAB ════ */}
        {tab === 'visual' && (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Sub-tab */}
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

            {/* Phones sub-tab */}
            {visualSub === 'phones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Spacing + Scale sliders */}
                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: '10px 12px' }}>
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

                {/* Phone cards */}
                {phones.map((phone, pIdx) => (
                  <div key={phone.id} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: phone.color, flexShrink: 0 }} />
                      <input
                        value={phone.name}
                        onChange={e => updatePhone(phone.id, { name: e.target.value })}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, outline: 'none', fontFamily: 'inherit' }}
                      />
                      <button
                        onClick={() => removePhone(phone.id)}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 3, display: 'flex' }}
                      >
                        <X size={13} />
                      </button>
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
                                padding: '5px 10px', borderRadius: 8, border: `1px solid ${phone.style === s.value ? phone.color : 'rgba(255,255,255,0.1)'}`,
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
                          {/* Custom color */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="color" value={phone.color}
                              onChange={e => updatePhone(phone.id, { color: e.target.value })}
                              style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Rotation + Screen color */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Rotation ({phone.rotation ?? 0}°)
                          </div>
                          <input
                            type="range" min={-15} max={15} value={phone.rotation ?? 0}
                            onChange={e => updatePhone(phone.id, { rotation: +e.target.value })}
                            style={{ width: '100%', accentColor: phone.color }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Screen Color</div>
                          <input
                            type="color" value={phone.screenColor}
                            onChange={e => updatePhone(phone.id, { screenColor: e.target.value })}
                            style={{ width: '100%', height: 30, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'rgba(255,255,255,0.05)' }}
                          />
                        </div>
                      </div>

                      {/* Show controls toggle */}
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

                {phones.length < 4 && (
                  <button
                    onClick={addPhone}
                    style={{
                      width: '100%', padding: 11, borderRadius: 12,
                      border: '1px dashed rgba(255,255,255,0.1)', background: 'none',
                      color: 'rgba(255,255,255,0.3)', fontSize: 13, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontFamily: 'inherit',
                    }}
                  >
                    <Plus size={14} /> Add Phone ({phones.length}/4)
                  </button>
                )}
              </div>
            )}

            {/* Background sub-tab */}
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

            {/* Subtitle sub-tab */}
            {visualSub === 'subtitle' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Background Style</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['dark', 'light', 'none'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setSubtitleBg(s)}
                        style={{
                          flex: 1, padding: '7px 4px', borderRadius: 8, border: `1px solid ${subtitleBg === s ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
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
              </div>
            )}
          </div>
        )}

        {/* ════ EXPORT TAB ════ */}
        {tab === 'export' && (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Export Settings</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Resolution (16:9)</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {(['720p', '1080p'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setExportRes(r)}
                    style={{
                      flex: 1, padding: '9px 4px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${exportRes === r ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                      background: exportRes === r ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
                      color: exportRes === r ? '#fff' : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {r} {r === '720p' ? '· 1280×720' : '· 1920×1080'}
                  </button>
                ))}
              </div>

              {[
                `Format: WebM (VP9)`,
                `Duration: ${fmtTime(totalDuration)}`,
                `${phones.length} phones · ${script.length} turns`,
                `Audio: ${script.filter(t => t.audioUrl).length}/${script.length} turns generated`,
              ].map(t => (
                <div key={t} style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', display: 'flex', gap: 6, marginBottom: 3 }}>
                  <span style={{ color: '#ef4444' }}>•</span> {t}
                </div>
              ))}

              {script.some(t => t.audioUrl) && (
                <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  ⚠️ Video export is visual-only (no audio). Play back in the app to hear audio.
                </div>
              )}
            </div>

            {exporting ? (
              <div style={{ borderRadius: 14, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.07)', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#fca5a5', fontWeight: 700 }}>Rendering…</span>
                  <span style={{ color: '#ef4444', fontFamily: 'monospace' }}>{exportProgress}%</span>
                </div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, width: `${exportProgress}%`, background: '#ef4444', transition: 'none' }} />
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Drawing frames to offscreen canvas…</div>
              </div>
            ) : (
              <button
                onClick={handleExport}
                disabled={!script.length}
                style={{
                  width: '100%', padding: '14px', borderRadius: 14,
                  background: script.length ? '#ef4444' : 'rgba(255,255,255,0.05)',
                  border: 'none', color: '#fff', fontWeight: 800, fontSize: 14,
                  cursor: script.length ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: 'inherit', opacity: script.length ? 1 : 0.4,
                  boxShadow: script.length ? '0 8px 24px rgba(239,68,68,0.3)' : 'none',
                  letterSpacing: '0.06em',
                }}
              >
                <Download size={17} /> RENDER VIDEO ({exportRes})
              </button>
            )}
          </div>
        )}

      </div>

      {/* Keyframe for animations */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  );
};

export default PhoneConvoStudio;
