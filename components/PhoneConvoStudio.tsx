import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Trash2, Play, Pause, Square, Download,
  Smartphone, X, Check, Palette, FileText, Video,
  MonitorSmartphone,
} from 'lucide-react';
import { toast } from './Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrbColor = 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'cyan' | 'pink' | 'white';
type PhoneStyle = 'android-dark' | 'android-light' | 'iphone-black' | 'iphone-white';
type BgPreset = 'dark-room' | 'midnight' | 'studio' | 'grad-dark' | 'grad-purple' | 'grad-blue' | 'white' | 'wood';

interface Device {
  id: string;
  name: string;
  orbColor: OrbColor;
  phoneStyle: PhoneStyle;
}

interface ScriptLine {
  id: string;
  deviceId: string;
  text: string;
  duration: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ORB_COLORS: Record<OrbColor, { inner: string; mid: string; outer: string; glow: string }> = {
  blue:   { inner: '#bfdbfe', mid: '#3b82f6', outer: '#1e3a8a', glow: 'rgba(59,130,246,0.8)'   },
  green:  { inner: '#bbf7d0', mid: '#22c55e', outer: '#14532d', glow: 'rgba(34,197,94,0.8)'    },
  red:    { inner: '#fecaca', mid: '#ef4444', outer: '#7f1d1d', glow: 'rgba(239,68,68,0.8)'    },
  purple: { inner: '#e9d5ff', mid: '#a855f7', outer: '#4a1d96', glow: 'rgba(168,85,247,0.8)'   },
  orange: { inner: '#fed7aa', mid: '#f97316', outer: '#7c2d12', glow: 'rgba(249,115,22,0.8)'   },
  cyan:   { inner: '#cffafe', mid: '#06b6d4', outer: '#164e63', glow: 'rgba(6,182,212,0.8)'    },
  pink:   { inner: '#fbcfe8', mid: '#ec4899', outer: '#831843', glow: 'rgba(236,72,153,0.8)'   },
  white:  { inner: '#ffffff', mid: '#cbd5e1', outer: '#475569', glow: 'rgba(203,213,225,0.6)'  },
};

const BG_PRESETS: Record<BgPreset, { label: string; css: string; preview: string }> = {
  'dark-room':   { label: 'Dark Room',    css: '#080808',    preview: '#080808' },
  'midnight':    { label: 'Midnight',     css: '#03020f',    preview: '#03020f' },
  'studio':      { label: 'Studio',       css: '#141414',    preview: '#141414' },
  'grad-dark':   { label: 'Deep Space',   css: 'linear-gradient(160deg,#0a0a12 0%,#12172a 50%,#0a0a12 100%)', preview: '#12172a' },
  'grad-purple': { label: 'Purple Haze',  css: 'linear-gradient(160deg,#0d0010 0%,#200050 50%,#0a0010 100%)', preview: '#200050' },
  'grad-blue':   { label: 'Ocean Deep',   css: 'linear-gradient(160deg,#000510 0%,#0c1e40 50%,#000810 100%)', preview: '#0c1e40' },
  'white':       { label: 'Clean White',  css: '#f0f4f8',    preview: '#f0f4f8' },
  'wood':        { label: 'Wood Table',   css: 'linear-gradient(180deg,#3d2b1f 0%,#5c3d2a 40%,#4a3020 70%,#3a2a1a 100%)', preview: '#4a3020' },
};

const PHONE_STYLES: Record<PhoneStyle, {
  label: string;
  body: string;
  bodyGrad: string;
  edge: string;
  screenBg: string;
  statusColor: string;
  isIphone: boolean;
  isDark: boolean;
}> = {
  'android-dark': {
    label: 'Android Dark', body: '#111111', bodyGrad: 'linear-gradient(145deg,#1a1a1a,#0a0a0a)',
    edge: '#2a2a2a', screenBg: '#000000', statusColor: '#ffffff', isIphone: false, isDark: true,
  },
  'android-light': {
    label: 'Android Light', body: '#e8e8e8', bodyGrad: 'linear-gradient(145deg,#f0f0f0,#d8d8d8)',
    edge: '#c0c0c0', screenBg: '#f8f8f8', statusColor: '#111111', isIphone: false, isDark: false,
  },
  'iphone-black': {
    label: 'iPhone Black', body: '#0f0f0f', bodyGrad: 'linear-gradient(145deg,#1c1c1e,#0a0a0a)',
    edge: '#2c2c2e', screenBg: '#000000', statusColor: '#ffffff', isIphone: true, isDark: true,
  },
  'iphone-white': {
    label: 'iPhone White', body: '#f2f2f7', bodyGrad: 'linear-gradient(145deg,#ffffff,#e5e5ea)',
    edge: '#d1d1d6', screenBg: '#ffffff', statusColor: '#111111', isIphone: true, isDark: false,
  },
};

const DEFAULT_DEVICES: Device[] = [
  { id: 'dev-1', name: 'ChatGPT', orbColor: 'white', phoneStyle: 'iphone-black' },
  { id: 'dev-2', name: 'Gemini', orbColor: 'blue', phoneStyle: 'android-dark' },
];

const DEFAULT_SCRIPT: ScriptLine[] = [
  { id: 'sl-1', deviceId: 'dev-1', text: 'Hello! How can I help you today?', duration: 3 },
  { id: 'sl-2', deviceId: 'dev-2', text: "Hi! I'm happy to help. What's on your mind?", duration: 4 },
  { id: 'sl-3', deviceId: 'dev-1', text: "That's a great point. Let me think about that.", duration: 4 },
  { id: 'sl-4', deviceId: 'dev-2', text: "Sure! Here's what I know about this topic in detail.", duration: 5 },
];

// ─── OrbDisplay ───────────────────────────────────────────────────────────────

interface OrbProps {
  color: OrbColor;
  ampRef: React.MutableRefObject<number>;
}

const OrbDisplay = React.memo<OrbProps>(({ color, ampRef }) => {
  const coreRef = useRef<HTMLDivElement>(null);
  const midRef  = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rafRef  = useRef<number>(0);
  const c = ORB_COLORS[color];

  useEffect(() => {
    const tick = () => {
      const a = ampRef.current;
      if (coreRef.current) {
        const s = 0.48 + 0.52 * a;
        coreRef.current.style.transform = `scale(${s})`;
        coreRef.current.style.opacity   = String(0.55 + 0.45 * a);
      }
      if (midRef.current) {
        const s = 0.55 + 0.6 * a;
        midRef.current.style.transform  = `scale(${s})`;
        midRef.current.style.opacity    = String(0.25 + 0.5 * a);
      }
      if (glowRef.current) {
        const s = 0.4 + 0.85 * a;
        glowRef.current.style.transform = `scale(${s})`;
        glowRef.current.style.opacity   = String(0.15 + 0.55 * a);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ampRef]);

  const style: React.CSSProperties = {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%,-50%) scale(0)',
    width: '80%', height: '80%',
    borderRadius: '50%',
    willChange: 'transform, opacity',
    transformOrigin: 'center',
  };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* Ambient glow */}
      <div ref={glowRef} style={{
        ...style,
        background: `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`,
        filter: 'blur(12px)',
        width: '110%', height: '110%',
        top: '50%', left: '50%',
      }} />
      {/* Mid halo */}
      <div ref={midRef} style={{
        ...style,
        background: `radial-gradient(circle, ${c.mid}aa 0%, ${c.mid}40 50%, transparent 75%)`,
        filter: 'blur(6px)',
        width: '95%', height: '95%',
      }} />
      {/* Core orb */}
      <div ref={coreRef} style={{
        ...style,
        width: '68%', height: '68%',
        background: `radial-gradient(circle at 38% 32%, ${c.inner} 0%, ${c.mid} 45%, ${c.outer}cc 100%)`,
        boxShadow: `0 0 30px 8px ${c.glow}, inset 0 2px 8px rgba(255,255,255,0.25)`,
      }}>
        {/* Specular highlight */}
        <div style={{
          position: 'absolute', top: '14%', left: '22%',
          width: '28%', height: '28%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.65) 0%, transparent 70%)',
        }} />
      </div>
    </div>
  );
});

// ─── PhoneFrame ───────────────────────────────────────────────────────────────

interface PhoneFrameProps {
  device: Device;
  isActive: boolean;
  ampRef: React.MutableRefObject<number>;
  subtitle?: string;
  showSubtitles: boolean;
  showName: boolean;
}

const PhoneFrame = React.memo<PhoneFrameProps>(({
  device, isActive, ampRef, subtitle, showSubtitles, showName,
}) => {
  const ps = PHONE_STYLES[device.phoneStyle];
  const c  = ORB_COLORS[device.orbColor];

  const btnColor = ps.isDark
    ? 'linear-gradient(180deg,#2a2a2a,#1a1a1a)'
    : 'linear-gradient(180deg,#e0e0e0,#c8c8c8)';
  const btnShadow = ps.isDark
    ? '-1px 0 4px rgba(0,0,0,0.8), inset 1px 0 1px rgba(255,255,255,0.05)'
    : '-1px 0 4px rgba(0,0,0,0.2), inset 1px 0 1px rgba(255,255,255,0.5)';
  const btnShadowR = ps.isDark
    ? '1px 0 4px rgba(0,0,0,0.8), inset -1px 0 1px rgba(255,255,255,0.05)'
    : '1px 0 4px rgba(0,0,0,0.2), inset -1px 0 1px rgba(255,255,255,0.5)';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      {/* Phone wrapper — takes remaining height */}
      <div style={{ flex: 1, width: '100%', position: 'relative', minHeight: 0 }}>

        {/* ── Left buttons (volume) ─── */}
        {/* Volume Up */}
        <div style={{
          position: 'absolute', left: '-7%', top: '18%',
          width: '7%', height: '9%',
          background: btnColor, borderRadius: '3px 0 0 3px',
          boxShadow: btnShadow, zIndex: 1,
        }} />
        {/* Volume Down */}
        <div style={{
          position: 'absolute', left: '-7%', top: '29%',
          width: '7%', height: '7%',
          background: btnColor, borderRadius: '3px 0 0 3px',
          boxShadow: btnShadow, zIndex: 1,
        }} />
        {/* iPhone: silent/mute toggle; Android: skip */}
        {ps.isIphone && (
          <div style={{
            position: 'absolute', left: '-7%', top: '10%',
            width: '6%', height: '4%',
            background: btnColor, borderRadius: '3px 0 0 3px',
            boxShadow: btnShadow, zIndex: 1,
          }} />
        )}

        {/* ── Right button (power) ─── */}
        <div style={{
          position: 'absolute', right: '-7%', top: '24%',
          width: '7%', height: ps.isIphone ? '10%' : '8%',
          background: btnColor, borderRadius: '0 3px 3px 0',
          boxShadow: btnShadowR, zIndex: 1,
        }} />

        {/* ── Phone body ─── */}
        <div style={{
          position: 'absolute', inset: 0,
          background: ps.bodyGrad,
          borderRadius: '12%',
          border: `1.5px solid ${ps.edge}`,
          boxShadow: isActive
            ? `0 0 0 1px ${c.mid}44, 0 0 40px 12px ${c.glow}, 0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12)`
            : `0 20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.09)`,
          transition: 'box-shadow 0.45s ease',
          zIndex: 2,
        }}>

          {/* Screen inset */}
          <div style={{
            position: 'absolute',
            top: '2%', left: '3%', right: '3%', bottom: '2%',
            background: ps.screenBg,
            borderRadius: '10.5%',
            overflow: 'hidden',
          }}>

            {/* Status bar */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: '7%', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', padding: '0 9%', zIndex: 5,
            }}>
              <span style={{ color: ps.statusColor, fontSize: '0.52em', fontWeight: 700, opacity: 0.75 }}>
                9:41
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4%' }}>
                {/* Signal dots */}
                {[1, 2, 3].map(i => (
                  <div key={i} style={{
                    width: '5%', height: `${40 + i * 20}%`,
                    background: ps.statusColor, opacity: 0.7,
                    borderRadius: '1px', minWidth: 2, minHeight: 4,
                    alignSelf: 'flex-end',
                  }} />
                ))}
                {/* Battery */}
                <div style={{
                  width: '16%', height: '45%',
                  border: `1.5px solid ${ps.statusColor}`, borderRadius: '2px',
                  opacity: 0.7, position: 'relative', marginLeft: '4%', minWidth: 12, minHeight: 7,
                }}>
                  <div style={{
                    position: 'absolute', inset: '2px', right: '20%',
                    background: ps.statusColor, borderRadius: '1px',
                  }} />
                  <div style={{
                    position: 'absolute', right: '-3px', top: '25%', bottom: '25%',
                    width: '2px', background: ps.statusColor, borderRadius: '0 1px 1px 0',
                  }} />
                </div>
              </div>
            </div>

            {/* Camera cutout */}
            {ps.isIphone ? (
              /* Dynamic Island pill */
              <div style={{
                position: 'absolute', top: '2.5%', left: '50%', transform: 'translateX(-50%)',
                width: '30%', height: '4.5%',
                background: '#000', borderRadius: '50px', zIndex: 6,
                boxShadow: '0 2px 8px rgba(0,0,0,0.8)',
              }}>
                {/* Camera dot inside pill */}
                <div style={{
                  position: 'absolute', right: '18%', top: '50%', transform: 'translateY(-50%)',
                  width: '22%', height: '70%', borderRadius: '50%',
                  background: '#1a1a1a',
                  boxShadow: 'inset 0 0 3px rgba(0,100,255,0.3)',
                }} />
              </div>
            ) : (
              /* Android punch-hole */
              <div style={{
                position: 'absolute', top: '2.2%', left: '50%', transform: 'translateX(-50%)',
                width: '8%', height: '4%',
                background: ps.body, borderRadius: '50%', zIndex: 6,
                boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
              }} />
            )}

            {/* App name / model label */}
            <div style={{
              position: 'absolute', top: '12%', left: 0, right: 0,
              textAlign: 'center', zIndex: 4,
            }}>
              <span style={{
                color: ps.statusColor, opacity: 0.42,
                fontSize: '0.6em', fontWeight: 600, letterSpacing: '0.05em',
              }}>
                {device.name}
              </span>
            </div>

            {/* Orb */}
            <div style={{ position: 'absolute', top: '18%', left: '6%', right: '6%', bottom: '22%' }}>
              <OrbDisplay color={device.orbColor} ampRef={ampRef} />
            </div>

            {/* Subtitle */}
            {showSubtitles && subtitle && isActive && (
              <div style={{
                position: 'absolute', bottom: '18%', left: '7%', right: '7%',
                textAlign: 'center', zIndex: 5,
              }}>
                <span style={{
                  color: ps.statusColor, opacity: 0.88,
                  fontSize: '0.55em', fontWeight: 500, lineHeight: 1.35,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as any,
                  overflow: 'hidden',
                }}>
                  {subtitle}
                </span>
              </div>
            )}

            {/* Call control icons (mic + end call) */}
            <div style={{
              position: 'absolute', bottom: '7.5%', left: 0, right: 0,
              display: 'flex', justifyContent: 'center', gap: '16%',
              alignItems: 'center', zIndex: 4,
            }}>
              {/* Mute icon */}
              <div style={{
                width: '11%', aspectRatio: '1', borderRadius: '50%',
                background: ps.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: '40%', height: '55%',
                  borderRadius: '50px',
                  background: ps.statusColor, opacity: 0.5,
                }} />
              </div>
              {/* End call (red circle with X) */}
              <div style={{
                width: '12%', aspectRatio: '1', borderRadius: '50%',
                background: '#ef4444cc',
                boxShadow: '0 2px 8px rgba(239,68,68,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: '50%', height: '3px',
                  background: '#fff', borderRadius: '2px',
                }} />
              </div>
            </div>

            {/* Home indicator bar */}
            <div style={{
              position: 'absolute', bottom: '2.5%', left: '50%',
              transform: 'translateX(-50%)',
              width: '30%', height: '1.5%',
              background: ps.statusColor, opacity: 0.22,
              borderRadius: '50px',
            }} />
          </div>

          {/* Glass sheen over entire phone face */}
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: '12%',
            background: 'linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.015) 40%, transparent 60%)',
            pointerEvents: 'none', zIndex: 10,
          }} />
        </div>
      </div>

      {/* Device name label below phone */}
      {showName && (
        <div style={{
          marginTop: '6%',
          padding: '2.5% 9%',
          borderRadius: '50px',
          background: isActive ? c.glow.replace('0.8)', '0.18)') : 'rgba(255,255,255,0.06)',
          border: `1px solid ${isActive ? c.mid + '60' : 'rgba(255,255,255,0.06)'}`,
          color: isActive ? '#fff' : 'rgba(255,255,255,0.38)',
          fontSize: '0.72em',
          fontWeight: 600,
          letterSpacing: '0.06em',
          transition: 'all 0.35s ease',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}>
          {device.name}
        </div>
      )}
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

const PhoneConvoStudio: React.FC = () => {
  const [devices, setDevices]         = useState<Device[]>(DEFAULT_DEVICES);
  const [script, setScript]           = useState<ScriptLine[]>(DEFAULT_SCRIPT);
  const [bgPreset, setBgPreset]       = useState<BgPreset>('dark-room');
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [showNames, setShowNames]     = useState(true);
  const [activeTab, setActiveTab]     = useState<'script' | 'devices' | 'background' | 'export'>('script');
  const [isPlaying, setIsPlaying]     = useState(false);
  const [currentSegIdx, setCurrentSegIdx] = useState(0);
  const [segmentElapsed, setSegmentElapsed] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportRes, setExportRes]     = useState<'720p' | '1080p'>('720p');

  // Per-device amplitude refs
  const ampRefs = useRef<Record<string, React.MutableRefObject<number>>>({});
  const getAmpRef = useCallback((id: string) => {
    if (!ampRefs.current[id]) ampRefs.current[id] = { current: 0.08 };
    return ampRefs.current[id];
  }, []);

  // Playback
  const isPlayingRef = useRef(false);
  const playStartRef = useRef(0);
  const playOffsetRef = useRef(0);
  const scriptRef = useRef(script);
  const devicesRef = useRef(devices);
  useEffect(() => { scriptRef.current = script; }, [script]);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  const totalDuration = script.reduce((s, l) => s + l.duration, 0);

  // Amplitude engine
  const ampPhaseRefs = useRef<Record<string, number>>({});

  const calcAmp = useCallback((id: string, active: boolean, phaseInc: number) => {
    if (!ampPhaseRefs.current[id]) ampPhaseRefs.current[id] = Math.random() * Math.PI * 2;
    ampPhaseRefs.current[id] += phaseInc;
    const p = ampPhaseRefs.current[id];
    if (active) {
      // Speech-like: fast multi-frequency pulsing
      return Math.min(1, Math.max(0,
        0.42 + 0.38 * Math.abs(Math.sin(p * 8.2 + Math.sin(p * 2.9) * 1.8))
              + 0.12 * Math.sin(p * 17.1)
              + 0.08 * Math.sin(p * 5.3)
      ));
    }
    // Idle: gentle breathing
    return 0.06 + 0.04 * Math.sin(p * 1.1);
  }, []);

  // Master RAF loop
  useEffect(() => {
    let lastT = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;

      if (isPlayingRef.current) {
        const elapsed = playOffsetRef.current + (now - playStartRef.current) / 1000;
        let cum = 0, segIdx = -1, segOff = 0;
        for (let i = 0; i < scriptRef.current.length; i++) {
          if (elapsed < cum + scriptRef.current[i].duration) {
            segIdx = i; segOff = elapsed - cum; break;
          }
          cum += scriptRef.current[i].duration;
        }
        if (segIdx === -1) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          setCurrentSegIdx(0);
          setSegmentElapsed(0);
          playOffsetRef.current = 0;
        } else {
          setCurrentSegIdx(segIdx);
          setSegmentElapsed(segOff);
          const activeId = scriptRef.current[segIdx].deviceId;
          devicesRef.current.forEach(d => {
            getAmpRef(d.id).current = calcAmp(d.id, d.id === activeId, dt * 60);
          });
        }
      } else {
        devicesRef.current.forEach(d => {
          getAmpRef(d.id).current = calcAmp(d.id, false, dt * 60 * 0.9);
        });
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [calcAmp, getAmpRef]);

  const handlePlay = () => {
    if (!script.length) return;
    playStartRef.current = performance.now();
    playOffsetRef.current = 0;
    isPlayingRef.current = true;
    setIsPlaying(true);
    setCurrentSegIdx(0);
    setSegmentElapsed(0);
  };
  const handlePause = () => {
    playOffsetRef.current += (performance.now() - playStartRef.current) / 1000;
    isPlayingRef.current = false;
    setIsPlaying(false);
  };
  const handleStop = () => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setCurrentSegIdx(0);
    setSegmentElapsed(0);
    playOffsetRef.current = 0;
  };

  // Script helpers
  const addLine = () => setScript(p => [...p, {
    id: `sl-${Date.now()}`,
    deviceId: devices[0]?.id || '',
    text: '', duration: 3,
  }]);
  const updateLine = (id: string, ch: Partial<ScriptLine>) =>
    setScript(p => p.map(l => l.id === id ? { ...l, ...ch } : l));
  const deleteLine = (id: string) =>
    setScript(p => p.filter(l => l.id !== id));

  // Device helpers
  const addDevice = () => {
    if (devices.length >= 4) { toast.warning('Maximum 4 devices'); return; }
    const cols: OrbColor[] = ['green', 'red', 'purple', 'orange', 'cyan', 'pink'];
    const sts: PhoneStyle[] = ['android-dark', 'iphone-black', 'android-light', 'iphone-white'];
    const i = devices.length;
    setDevices(p => [...p, {
      id: `dev-${Date.now()}`,
      name: `Device ${p.length + 1}`,
      orbColor: cols[i % cols.length],
      phoneStyle: sts[i % sts.length],
    }]);
  };
  const updateDevice = (id: string, ch: Partial<Device>) =>
    setDevices(p => p.map(d => d.id === id ? { ...d, ...ch } : d));
  const removeDevice = (id: string) => {
    if (devices.length <= 1) { toast.warning('Need at least 1 device'); return; }
    setDevices(p => p.filter(d => d.id !== id));
    setScript(p => p.filter(l => l.deviceId !== id));
  };

  // Progress
  const elapsed = script.slice(0, currentSegIdx).reduce((s, l) => s + l.duration, 0) + segmentElapsed;
  const progressPct = totalDuration > 0 ? Math.min(100, (elapsed / totalDuration) * 100) : 0;
  const currentSeg = script[currentSegIdx];

  // Phone sizing: height % of the 16:9 container, based on device count
  const phoneHeightPct = devices.length <= 1 ? 90 : devices.length === 2 ? 84 : devices.length === 3 ? 78 : 72;

  // ─── Export ─────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!script.length) { toast.error('Script is empty'); return; }
    const W = exportRes === '1080p' ? 1920 : 1280;
    const H = exportRes === '1080p' ? 1080 : 720;
    const FPS = 30;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(FPS);
    const chunks: Blob[] = [];
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    setIsExporting(true); setExportProgress(0);
    rec.start(100);

    const totalT = script.reduce((s, l) => s + l.duration, 0);
    const dt = 1 / FPS;
    const localAmpPhase: Record<string, number> = {};
    const getAmpCanvas = (id: string, active: boolean): number => {
      if (!localAmpPhase[id]) localAmpPhase[id] = Math.random() * Math.PI * 2;
      localAmpPhase[id] += active ? 0.5 : 0.055;
      const p = localAmpPhase[id];
      return active
        ? Math.min(1, 0.42 + 0.38 * Math.abs(Math.sin(p * 8.2 + Math.sin(p * 2.9) * 1.8)) + 0.12 * Math.sin(p * 17.1))
        : 0.06 + 0.04 * Math.sin(p * 1.1);
    };

    const drawScene = (t: number) => {
      const bg = BG_PRESETS[bgPreset];
      if (bg.css.startsWith('linear-gradient')) {
        const g = ctx.createLinearGradient(0, 0, W, H);
        if (bgPreset === 'grad-purple') { g.addColorStop(0,'#0d0010'); g.addColorStop(0.5,'#200050'); g.addColorStop(1,'#0a0010'); }
        else if (bgPreset === 'grad-blue') { g.addColorStop(0,'#000510'); g.addColorStop(0.5,'#0c1e40'); g.addColorStop(1,'#000810'); }
        else if (bgPreset === 'wood') { g.addColorStop(0,'#3d2b1f'); g.addColorStop(0.4,'#5c3d2a'); g.addColorStop(0.7,'#4a3020'); g.addColorStop(1,'#3a2a1a'); }
        else { g.addColorStop(0,'#0a0a12'); g.addColorStop(0.5,'#12172a'); g.addColorStop(1,'#0a0a12'); }
        ctx.fillStyle = g;
      } else { ctx.fillStyle = bg.css; }
      ctx.fillRect(0, 0, W, H);

      // Find active segment
      let cum = 0, activeId = '', subText = '';
      for (const seg of script) {
        if (t < cum + seg.duration) { activeId = seg.deviceId; subText = seg.text; break; }
        cum += seg.duration;
      }

      const n = devices.length;
      const pH = H * (phoneHeightPct / 100);
      const pW = pH * 0.475;
      const totalPW = n * pW + (n - 1) * pW * 0.15;
      let startX = (W - totalPW) / 2;
      const pY = (H - pH) / 2;

      devices.forEach(dev => {
        const isAct = dev.id === activeId;
        const amp = getAmpCanvas(dev.id, isAct);
        const ps2 = PHONE_STYLES[dev.phoneStyle];
        const c2 = ORB_COLORS[dev.orbColor];
        const r = pW * 0.12;

        const roundedRect = (x: number, y: number, w: number, h: number, rad: number) => {
          ctx.beginPath();
          ctx.moveTo(x+rad,y); ctx.lineTo(x+w-rad,y); ctx.quadraticCurveTo(x+w,y,x+w,y+rad);
          ctx.lineTo(x+w,y+h-rad); ctx.quadraticCurveTo(x+w,y+h,x+w-rad,y+h);
          ctx.lineTo(x+rad,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-rad);
          ctx.lineTo(x,y+rad); ctx.quadraticCurveTo(x,y,x+rad,y); ctx.closePath();
        };

        // Phone glow
        if (isAct) {
          ctx.save(); ctx.shadowColor = c2.glow; ctx.shadowBlur = 40;
        }

        // Body
        roundedRect(startX, pY, pW, pH, r);
        const bg2 = ctx.createLinearGradient(startX, pY, startX+pW, pY+pH);
        if (ps2.isDark) { bg2.addColorStop(0,'#1a1a1a'); bg2.addColorStop(1,'#0a0a0a'); }
        else { bg2.addColorStop(0,'#f0f0f0'); bg2.addColorStop(1,'#d8d8d8'); }
        ctx.fillStyle = bg2; ctx.fill();
        ctx.strokeStyle = ps2.edge; ctx.lineWidth = 1.5; ctx.stroke();
        if (isAct) ctx.restore();

        // Screen
        const sp = pW*0.03, st = pH*0.02, sw2 = pW-sp*2, sh2 = pH*0.96;
        ctx.save();
        roundedRect(startX+sp, pY+st, sw2, sh2, r*0.88);
        ctx.fillStyle = ps2.screenBg; ctx.fill(); ctx.clip();

        // Orb glow
        const orbX = startX+sp+sw2/2, orbY = pY+st+sh2*0.47;
        const orbR = (sw2*0.34) * (0.5 + 0.5*amp);
        const glowG = ctx.createRadialGradient(orbX,orbY,0,orbX,orbY,orbR*3);
        glowG.addColorStop(0, c2.glow); glowG.addColorStop(1,'rgba(0,0,0,0)');
        ctx.globalAlpha = amp*0.65; ctx.fillStyle=glowG;
        ctx.beginPath(); ctx.arc(orbX,orbY,orbR*3,0,Math.PI*2); ctx.fill();

        // Core orb
        const orbG = ctx.createRadialGradient(orbX-orbR*0.2,orbY-orbR*0.2,0,orbX,orbY,orbR);
        orbG.addColorStop(0,c2.inner); orbG.addColorStop(0.5,c2.mid); orbG.addColorStop(1,c2.outer+'99');
        ctx.globalAlpha = 0.55+0.45*amp; ctx.fillStyle=orbG;
        ctx.beginPath(); ctx.arc(orbX,orbY,orbR,0,Math.PI*2); ctx.fill();

        // Specular
        const sR=orbR*0.26;
        const sG=ctx.createRadialGradient(orbX-orbR*0.3,orbY-orbR*0.3,0,orbX-orbR*0.3,orbY-orbR*0.3,sR);
        sG.addColorStop(0,'rgba(255,255,255,0.6)'); sG.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=sG; ctx.beginPath(); ctx.arc(orbX-orbR*0.3,orbY-orbR*0.3,sR,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha=1;

        // Label
        ctx.font=`600 ${Math.round(sw2*0.08)}px system-ui`; ctx.textAlign='center';
        ctx.fillStyle=ps2.statusColor; ctx.globalAlpha=0.38;
        ctx.fillText(dev.name, orbX, pY+st+sh2*0.14); ctx.globalAlpha=1;

        // Subtitle
        if (showSubtitles && isAct && subText) {
          ctx.font=`500 ${Math.round(sw2*0.073)}px system-ui`; ctx.fillStyle=ps2.statusColor; ctx.globalAlpha=0.88;
          const maxW2=sw2*0.86;
          const words=subText.split(' '); let line='', lines2: string[]=[];
          words.forEach(w => { const test=line?line+' '+w:w; if(ctx.measureText(test).width>maxW2){lines2.push(line);line=w;}else line=test; });
          if(line)lines2.push(line);
          lines2.slice(-2).forEach((ln,li)=>{ ctx.fillText(ln, orbX, pY+st+sh2*0.82+li*sw2*0.09); });
          ctx.globalAlpha=1;
        }
        ctx.restore();

        startX += pW + pW*0.15;
      });

      // Device labels
      if (showNames) {
        let lx = (W - (n*pW + (n-1)*pW*0.15)) / 2;
        devices.forEach(dev => {
          const isAct = dev.id === activeId;
          const c2 = ORB_COLORS[dev.orbColor];
          ctx.font = `600 ${Math.round(pW*0.09)}px system-ui`; ctx.textAlign='center';
          ctx.fillStyle = isAct ? '#ffffff' : 'rgba(255,255,255,0.35)';
          ctx.fillText(dev.name, lx+pW/2, pY+pH+pH*0.06);
          lx += pW + pW*0.15;
        });
      }
    };

    await new Promise<void>(resolve => {
      let t = 0;
      const frame = () => {
        if (t > totalT+0.3) { resolve(); return; }
        drawScene(Math.min(t, totalT-0.001));
        t += dt;
        setExportProgress(Math.min(99, Math.round(t/totalT*100)));
        setTimeout(frame, 0);
      };
      frame();
    });

    rec.stop();
    await new Promise<void>(res => { rec.onstop = () => res(); });
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=`phone-studio-${Date.now()}.webm`; a.click();
    URL.revokeObjectURL(url);
    setIsExporting(false); setExportProgress(0);
    toast.success('Video exported!');
  }, [script, devices, bgPreset, showSubtitles, showNames, exportRes, phoneHeightPct]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#050505', color: '#fff', overflow: 'hidden' }}>

      {/* ── 16:9 Preview ── */}
      <div style={{
        position: 'relative',
        width: '100%',
        paddingBottom: '56.25%',
        flexShrink: 0,
        background: BG_PRESETS[bgPreset].css,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: `${devices.length > 2 ? 2 : 3}%`,
          padding: '3% 10%',
        }}>
          {devices.map(device => {
            const isActive = isPlaying && currentSeg?.deviceId === device.id;
            return (
              <div
                key={device.id}
                style={{
                  height: `${phoneHeightPct}%`,
                  aspectRatio: '9 / 20',
                  flexShrink: 0,
                  // font-size scales with phone height for em-based child sizes
                  fontSize: 'clamp(7px, 1.15vw, 16px)',
                }}
              >
                <PhoneFrame
                  device={device}
                  isActive={isActive}
                  ampRef={getAmpRef(device.id)}
                  subtitle={isActive ? currentSeg?.text : undefined}
                  showSubtitles={showSubtitles}
                  showName={showNames}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Playback Controls ── */}
      <div style={{ flexShrink: 0, padding: '8px 12px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#080808' }}>
        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 4, marginBottom: 8, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4, transition: 'none',
            width: `${progressPct}%`,
            background: 'linear-gradient(90deg,#a855f7,#3b82f6)',
          }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={isPlaying ? handlePause : handlePlay}
            disabled={!script.length}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
              border: 'none', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              opacity: script.length ? 1 : 0.3,
            }}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: 2 }} />}
          </button>
          <button
            onClick={handleStop}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: 'none', color: '#aaa', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Square size={12} />
          </button>

          {/* Timeline chips */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {script.map((line, idx) => {
              const dev = devices.find(d => d.id === line.deviceId);
              const active = isPlaying && idx === currentSegIdx;
              const c = dev ? ORB_COLORS[dev.orbColor] : null;
              return (
                <div key={line.id} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: active && c ? c.glow.replace('0.8)', '0.25)') : 'rgba(255,255,255,0.07)',
                    border: `1.5px solid ${active && c ? c.mid : 'transparent'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontWeight: 700, fontSize: 12,
                    transition: 'all 0.2s',
                  }}>
                    {dev?.name?.[0] ?? '?'}
                  </div>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{line.duration}s</span>
                </div>
              );
            })}
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{totalDuration}s</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#080808' }}>
        {([
          { id: 'script', label: 'Script', Icon: FileText },
          { id: 'devices', label: 'Devices', Icon: Smartphone },
          { id: 'background', label: 'Background', Icon: Palette },
          { id: 'export', label: 'Export', Icon: Video },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 5, padding: '10px 4px',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${activeTab === tab.id ? '#a855f7' : 'transparent'}`,
              color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.4)',
              fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
            }}
          >
            <tab.Icon size={13} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Script */}
        {activeTab === 'script' && (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {script.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
                No lines yet — add one below.
              </div>
            )}
            {script.map((line, idx) => {
              const dev = devices.find(d => d.id === line.deviceId);
              const c = dev ? ORB_COLORS[dev.orbColor] : null;
              const isCurrentLine = isPlaying && idx === currentSegIdx;
              return (
                <div key={line.id} style={{
                  borderRadius: 12,
                  border: `1px solid ${isCurrentLine && c ? c.mid + '50' : 'rgba(255,255,255,0.07)'}`,
                  background: isCurrentLine && c ? c.glow.replace('0.8)', '0.06)') : 'rgba(255,255,255,0.025)',
                  overflow: 'hidden', transition: 'border-color 0.2s',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    {/* Color dot */}
                    {c && <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.mid, flexShrink: 0 }} />}
                    <select
                      value={line.deviceId}
                      onChange={e => updateLine(line.id, { deviceId: e.target.value })}
                      style={{
                        background: 'transparent', border: 'none', outline: 'none',
                        color: c ? c.inner : '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        maxWidth: 120,
                      }}
                    >
                      {devices.map(d => <option key={d.id} value={d.id} style={{ background: '#111', color: '#fff' }}>{d.name}</option>)}
                    </select>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Duration:</span>
                    <input
                      type="number" value={line.duration} min={1} max={30}
                      onChange={e => updateLine(line.id, { duration: Math.max(1, +e.target.value) })}
                      style={{
                        width: 38, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6, padding: '2px 6px', color: '#fff', fontSize: 12, textAlign: 'center',
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>s</span>
                    <button
                      onClick={() => deleteLine(line.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.3)', padding: 4, borderRadius: 6,
                        display: 'flex', alignItems: 'center',
                      }}
                    ><Trash2 size={13} /></button>
                  </div>
                  <textarea
                    value={line.text}
                    onChange={e => updateLine(line.id, { text: e.target.value })}
                    placeholder="Enter dialogue here..."
                    rows={2}
                    style={{
                      width: '100%', background: 'transparent', border: 'none', outline: 'none',
                      color: '#e0e0e0', fontSize: 13, padding: '8px 10px', resize: 'none',
                      fontFamily: 'inherit', lineHeight: 1.45,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              );
            })}
            <button
              onClick={addLine}
              style={{
                width: '100%', padding: '12px', borderRadius: 12,
                border: '1px dashed rgba(255,255,255,0.1)', background: 'none',
                color: 'rgba(255,255,255,0.35)', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontFamily: 'inherit',
              }}
            >
              <Plus size={15} /> Add Line
            </button>
          </div>
        )}

        {/* Devices */}
        {activeTab === 'devices' && (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Toggles */}
            <div style={{
              display: 'flex', gap: 12, paddingBottom: 10,
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              {[
                { label: 'Subtitles', val: showSubtitles, toggle: () => setShowSubtitles(p => !p) },
                { label: 'Names', val: showNames, toggle: () => setShowNames(p => !p) },
              ].map(item => (
                <label key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <div
                    onClick={item.toggle}
                    style={{
                      width: 36, height: 20, borderRadius: 50, position: 'relative',
                      background: item.val ? '#a855f7' : 'rgba(255,255,255,0.1)',
                      transition: 'background 0.2s', cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
                      background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                      left: item.val ? 18 : 2,
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{item.label}</span>
                </label>
              ))}
            </div>

            {devices.map(device => {
              const ps = PHONE_STYLES[device.phoneStyle];
              return (
                <div key={device.id} style={{
                  borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.025)', overflow: 'hidden',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: ORB_COLORS[device.orbColor].mid, flexShrink: 0,
                    }} />
                    <input
                      value={device.name}
                      onChange={e => updateDevice(device.id, { name: e.target.value })}
                      style={{
                        flex: 1, background: 'transparent', border: 'none', outline: 'none',
                        color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                      }}
                      placeholder="Device name"
                    />
                    <button
                      onClick={() => removeDevice(device.id)}
                      style={{
                        background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                        cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex',
                      }}
                    ><X size={13} /></button>
                  </div>
                  <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Phone Style</div>
                      <select
                        value={device.phoneStyle}
                        onChange={e => updateDevice(device.id, { phoneStyle: e.target.value as PhoneStyle })}
                        style={{
                          width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8, padding: '6px 8px', color: '#fff', fontSize: 12,
                          outline: 'none', fontFamily: 'inherit',
                        }}
                      >
                        {Object.entries(PHONE_STYLES).map(([k, v]) => (
                          <option key={k} value={k} style={{ background: '#111' }}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Orb Color</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(Object.keys(ORB_COLORS) as OrbColor[]).map(k => (
                          <div
                            key={k}
                            onClick={() => updateDevice(device.id, { orbColor: k })}
                            style={{
                              width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                              background: ORB_COLORS[k].mid,
                              boxShadow: device.orbColor === k
                                ? `0 0 0 2px #050505, 0 0 0 3.5px ${ORB_COLORS[k].mid}`
                                : 'none',
                              transform: device.orbColor === k ? 'scale(1.15)' : 'scale(1)',
                              transition: 'all 0.15s',
                            }}
                            title={k}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {devices.length < 4 && (
              <button
                onClick={addDevice}
                style={{
                  width: '100%', padding: 12, borderRadius: 12,
                  border: '1px dashed rgba(255,255,255,0.1)', background: 'none',
                  color: 'rgba(255,255,255,0.35)', fontSize: 13, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: 'inherit',
                }}
              >
                <Plus size={15} /> Add Device ({devices.length}/4)
              </button>
            )}
          </div>
        )}

        {/* Background */}
        {activeTab === 'background' && (
          <div style={{ padding: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(Object.entries(BG_PRESETS) as [BgPreset, typeof BG_PRESETS[BgPreset]][]).map(([key, val]) => (
                <div
                  key={key}
                  onClick={() => setBgPreset(key)}
                  style={{
                    position: 'relative', borderRadius: 12, overflow: 'hidden',
                    aspectRatio: '16/9', cursor: 'pointer',
                    background: val.css,
                    border: `2px solid ${bgPreset === key ? '#a855f7' : 'rgba(255,255,255,0.07)'}`,
                    transition: 'border-color 0.15s',
                  }}
                >
                  {bgPreset === key && (
                    <div style={{
                      position: 'absolute', top: 6, right: 6,
                      width: 18, height: 18, borderRadius: '50%', background: '#a855f7',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={11} />
                    </div>
                  )}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '6px 8px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{val.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Export */}
        {activeTab === 'export' && (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.025)', padding: 14,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Export Settings</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Resolution (16:9)</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {(['720p', '1080p'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setExportRes(r)}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 10, fontSize: 12,
                      border: `1px solid ${exportRes === r ? '#a855f7' : 'rgba(255,255,255,0.1)'}`,
                      background: exportRes === r ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.04)',
                      color: exportRes === r ? '#fff' : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                    }}
                  >
                    {r} {r === '720p' ? '· 1280×720' : '· 1920×1080'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  `Format: WebM (VP9)`,
                  `Duration: ${totalDuration}s`,
                  `${devices.length} device${devices.length > 1 ? 's' : ''}, ${script.length} script lines`,
                ].map(t => (
                  <div key={t} style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#a855f7' }}>•</span> {t}
                  </div>
                ))}
              </div>
            </div>

            {isExporting ? (
              <div style={{
                borderRadius: 14, border: '1px solid rgba(168,85,247,0.2)',
                background: 'rgba(168,85,247,0.08)', padding: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#c084fc', fontWeight: 600 }}>Exporting…</span>
                  <span style={{ color: '#a855f7' }}>{exportProgress}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4,
                    width: `${exportProgress}%`,
                    background: 'linear-gradient(90deg,#a855f7,#3b82f6)', transition: 'none',
                  }} />
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Rendering frames to canvas…</div>
              </div>
            ) : (
              <button
                onClick={handleExport}
                disabled={!script.length}
                style={{
                  width: '100%', padding: '14px', borderRadius: 14,
                  background: 'linear-gradient(135deg,#7c3aed,#2563eb)',
                  border: 'none', color: '#fff', fontWeight: 700, fontSize: 14,
                  cursor: script.length ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: 'inherit', opacity: script.length ? 1 : 0.4,
                  boxShadow: '0 8px 24px rgba(124,58,237,0.3)',
                }}
              >
                <Download size={17} /> Export Video ({exportRes})
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default PhoneConvoStudio;
