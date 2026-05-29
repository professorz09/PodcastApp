import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Trash2, Play, Pause, RotateCcw, Download,
  Smartphone, ChevronDown, ChevronUp, X, Check,
  Settings, Palette, FileText, Video, GripVertical,
  Square, Circle
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

const ORB_COLORS: Record<OrbColor, { inner: string; mid: string; outer: string; glow: string; css: string }> = {
  blue:   { inner: '#93c5fd', mid: '#3b82f6', outer: '#1e3a8a', glow: 'rgba(59,130,246,0.7)',   css: 'blue'   },
  green:  { inner: '#86efac', mid: '#22c55e', outer: '#14532d', glow: 'rgba(34,197,94,0.7)',    css: 'green'  },
  red:    { inner: '#fca5a5', mid: '#ef4444', outer: '#7f1d1d', glow: 'rgba(239,68,68,0.7)',    css: 'red'    },
  purple: { inner: '#d8b4fe', mid: '#a855f7', outer: '#4a1d96', glow: 'rgba(168,85,247,0.7)',   css: 'purple' },
  orange: { inner: '#fdba74', mid: '#f97316', outer: '#7c2d12', glow: 'rgba(249,115,22,0.7)',   css: 'orange' },
  cyan:   { inner: '#a5f3fc', mid: '#06b6d4', outer: '#164e63', glow: 'rgba(6,182,212,0.7)',    css: 'cyan'   },
  pink:   { inner: '#f9a8d4', mid: '#ec4899', outer: '#831843', glow: 'rgba(236,72,153,0.7)',   css: 'pink'   },
  white:  { inner: '#ffffff', mid: '#e2e8f0', outer: '#64748b', glow: 'rgba(226,232,240,0.5)',  css: 'white'  },
};

const BG_PRESETS: Record<BgPreset, { label: string; value: string; preview: string }> = {
  'dark-room':   { label: 'Dark Room',       value: '#080808',         preview: '#080808' },
  'midnight':    { label: 'Midnight',        value: '#03030f',         preview: '#03030f' },
  'studio':      { label: 'Studio Gray',     value: '#181818',         preview: '#181818' },
  'grad-dark':   { label: 'Deep Space',      value: 'linear-gradient(135deg,#0a0a0a 0%,#111827 50%,#0a0a0a 100%)', preview: '#111827' },
  'grad-purple': { label: 'Purple Haze',     value: 'linear-gradient(135deg,#0f0014 0%,#1e0040 50%,#0f000a 100%)', preview: '#1e0040' },
  'grad-blue':   { label: 'Ocean Deep',      value: 'linear-gradient(135deg,#00050f 0%,#0c1a3a 50%,#000508 100%)', preview: '#0c1a3a' },
  'white':       { label: 'Clean White',     value: '#f1f5f9',         preview: '#f1f5f9' },
  'wood':        { label: 'Wooden Table',    value: 'linear-gradient(180deg,#3d2b1f 0%,#5c3d2a 30%,#4a3020 60%,#3d2b1f 100%)', preview: '#4a3020' },
};

const PHONE_STYLES: Record<PhoneStyle, { label: string; bodyBg: string; border: string; screenBg: string; statusColor: string }> = {
  'android-dark':  { label: 'Android Dark',  bodyBg: '#0e0e0e', border: '#1f1f1f', screenBg: '#000000', statusColor: '#ffffff' },
  'android-light': { label: 'Android Light', bodyBg: '#e8e8e8', border: '#cccccc', screenBg: '#f5f5f5', statusColor: '#000000' },
  'iphone-black':  { label: 'iPhone Black',  bodyBg: '#111111', border: '#2a2a2a', screenBg: '#000000', statusColor: '#ffffff' },
  'iphone-white':  { label: 'iPhone White',  bodyBg: '#f0f0f0', border: '#d4d4d4', screenBg: '#ffffff', statusColor: '#000000' },
};

const DEFAULT_DEVICES: Device[] = [
  { id: 'dev-1', name: 'ChatGPT', orbColor: 'white', phoneStyle: 'iphone-black' },
  { id: 'dev-2', name: 'Gemini', orbColor: 'blue', phoneStyle: 'android-dark' },
];

const DEFAULT_SCRIPT: ScriptLine[] = [
  { id: 'line-1', deviceId: 'dev-1', text: 'Hello! How can I help you today?', duration: 3 },
  { id: 'line-2', deviceId: 'dev-2', text: 'Hi there! I can answer that question.', duration: 4 },
  { id: 'line-3', deviceId: 'dev-1', text: 'That\'s a great point. Let me think about that.', duration: 4 },
  { id: 'line-4', deviceId: 'dev-2', text: 'Sure! Here\'s what I know about this topic.', duration: 5 },
];

// ─── OrbDisplay ───────────────────────────────────────────────────────────────

interface OrbProps {
  color: OrbColor;
  isActive: boolean;
  ampRef: React.MutableRefObject<number>;
  deviceId: string;
}

const OrbDisplay: React.FC<OrbProps> = ({ color, isActive, ampRef, deviceId }) => {
  const orbRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const c = ORB_COLORS[color];

  useEffect(() => {
    const animate = () => {
      const amp = ampRef.current;
      if (orbRef.current) {
        const scale = 0.55 + 0.45 * amp;
        orbRef.current.style.transform = `scale(${scale})`;
        orbRef.current.style.opacity = String(0.5 + 0.5 * amp);
      }
      if (glowRef.current) {
        const glowScale = 0.6 + 0.6 * amp;
        glowRef.current.style.transform = `scale(${glowScale})`;
        glowRef.current.style.opacity = String(0.3 + 0.5 * amp);
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ampRef]);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Outer ambient glow */}
      <div
        ref={glowRef}
        className="absolute rounded-full"
        style={{
          width: '85%',
          height: '85%',
          background: `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`,
          filter: 'blur(16px)',
          transition: 'none',
        }}
      />
      {/* Main orb */}
      <div
        ref={orbRef}
        className="absolute rounded-full"
        style={{
          width: '65%',
          height: '65%',
          background: `radial-gradient(circle at 35% 30%, ${c.inner}, ${c.mid} 50%, ${c.outer})`,
          boxShadow: `0 0 40px 10px ${c.glow}, inset 0 0 20px rgba(255,255,255,0.15)`,
          transition: 'none',
        }}
      />
      {/* Specular highlight */}
      <div
        className="absolute rounded-full"
        style={{
          width: '22%',
          height: '22%',
          top: '22%',
          left: '32%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

// ─── PhoneFrame ───────────────────────────────────────────────────────────────

interface PhoneFrameProps {
  device: Device;
  isActive: boolean;
  ampRef: React.MutableRefObject<number>;
  subtitle?: string;
  showSubtitles: boolean;
  showName: boolean;
  style?: React.CSSProperties;
}

const PhoneFrame: React.FC<PhoneFrameProps> = ({
  device, isActive, ampRef, subtitle, showSubtitles, showName, style
}) => {
  const ps = PHONE_STYLES[device.phoneStyle];
  const isLight = device.phoneStyle.includes('light') || device.phoneStyle.includes('white');
  const isIphone = device.phoneStyle.includes('iphone');

  return (
    <div className="flex flex-col items-center gap-2" style={style}>
      {/* Phone body */}
      <div
        className="relative rounded-[14%] shadow-2xl"
        style={{
          width: '100%',
          paddingBottom: '210%',
          background: ps.bodyBg,
          border: `2px solid ${ps.border}`,
          boxShadow: isActive
            ? `0 0 30px 6px ${ORB_COLORS[device.orbColor].glow}, 0 20px 60px rgba(0,0,0,0.5)`
            : '0 20px 60px rgba(0,0,0,0.5)',
          transition: 'box-shadow 0.3s ease',
        }}
      >
        <div className="absolute inset-[3%] rounded-[12%] overflow-hidden" style={{ background: ps.screenBg }}>
          {/* Status bar */}
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 z-10"
            style={{ height: '8%', color: ps.statusColor }}
          >
            <span className="text-[0.55em] font-semibold opacity-80">9:41</span>
            <span className="text-[0.55em] font-semibold opacity-80">95%</span>
          </div>

          {/* iPhone notch / Android pill */}
          {isIphone ? (
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full z-20"
              style={{ top: '1.5%', width: '30%', height: '3.5%', background: ps.bodyBg }}
            />
          ) : (
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full z-20"
              style={{ top: '1%', width: '8%', height: '2.5%', background: ps.bodyBg }}
            />
          )}

          {/* Model label */}
          <div
            className="absolute top-[12%] left-0 right-0 flex items-center justify-center z-10"
          >
            <span
              className="text-[0.65em] font-medium opacity-50"
              style={{ color: ps.statusColor }}
            >
              {device.name}
            </span>
          </div>

          {/* Orb area */}
          <div className="absolute" style={{ top: '18%', left: '5%', right: '5%', bottom: '22%' }}>
            <OrbDisplay
              color={device.orbColor}
              isActive={isActive}
              ampRef={ampRef}
              deviceId={device.id}
            />
          </div>

          {/* Subtitle text */}
          {showSubtitles && subtitle && isActive && (
            <div
              className="absolute bottom-[16%] left-[6%] right-[6%] text-center z-10"
              style={{ color: ps.statusColor }}
            >
              <span className="text-[0.6em] font-medium leading-tight opacity-90 line-clamp-2">
                {subtitle}
              </span>
            </div>
          )}

          {/* Bottom bar */}
          <div className="absolute bottom-[2%] left-0 right-0 flex items-center justify-center gap-[12%] z-10">
            <div
              className="rounded-full opacity-50"
              style={{ width: '8%', paddingBottom: '8%', background: ps.statusColor }}
            />
            <div
              className="rounded-full"
              style={{ width: '22%', height: '3px', background: ps.statusColor, opacity: 0.3 }}
            />
            <div
              className="rounded-full opacity-40"
              style={{
                width: '8%',
                paddingBottom: '8%',
                border: `1.5px solid ${ps.statusColor}`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Device name label below phone */}
      {showName && (
        <div
          className="text-xs font-semibold tracking-wide px-3 py-1 rounded-full"
          style={{
            background: isActive ? `${ORB_COLORS[device.orbColor].glow}` : 'rgba(255,255,255,0.06)',
            color: isActive ? '#fff' : 'rgba(255,255,255,0.45)',
            transition: 'all 0.3s ease',
          }}
        >
          {device.name}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const PhoneConvoStudio: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>(DEFAULT_DEVICES);
  const [script, setScript] = useState<ScriptLine[]>(DEFAULT_SCRIPT);
  const [bgPreset, setBgPreset] = useState<BgPreset>('dark-room');
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [activeTab, setActiveTab] = useState<'script' | 'devices' | 'background' | 'export'>('script');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegIdx, setCurrentSegIdx] = useState(0);
  const [segmentElapsed, setSegmentElapsed] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportResolution, setExportResolution] = useState<'720p' | '1080p'>('720p');

  // Per-device amplitude refs (updated in RAF loop, avoid React re-renders)
  const ampRefs = useRef<Record<string, React.MutableRefObject<number>>>({});

  const getAmpRef = useCallback((deviceId: string) => {
    if (!ampRefs.current[deviceId]) {
      ampRefs.current[deviceId] = { current: 0.1 };
    }
    return ampRefs.current[deviceId];
  }, []);

  // Playback state refs
  const playStartRef = useRef<number>(0);
  const playOffsetRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const scriptRef = useRef(script);
  const devicesRef = useRef(devices);
  useEffect(() => { scriptRef.current = script; }, [script]);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  const totalDuration = script.reduce((s, l) => s + l.duration, 0);

  // Amplitude simulation engine
  const ampTimeRefs = useRef<Record<string, number>>({});

  const computeAmplitude = useCallback((deviceId: string, isActive: boolean, elapsed: number): number => {
    if (!ampTimeRefs.current[deviceId]) ampTimeRefs.current[deviceId] = 0;
    ampTimeRefs.current[deviceId] += 0.016;
    const t = ampTimeRefs.current[deviceId];

    if (isActive) {
      // Speech-like: fast irregular pulsing
      const a = 0.45 + 0.35 * Math.abs(Math.sin(t * 8.5 + Math.sin(t * 3.1) * 1.5));
      const b = 0.1 * Math.sin(t * 17.3);
      const c = 0.08 * Math.sin(t * 5.7 + 1.2);
      return Math.min(1, Math.max(0, a + b + c));
    } else {
      // Idle: slow breathing
      return 0.08 + 0.05 * Math.sin(t * 1.2 + parseFloat(deviceId.split('-')[1] || '0') * 1.5);
    }
  }, []);

  // Main RAF loop for amplitude updates + playback progress
  useEffect(() => {
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (isPlayingRef.current) {
        const elapsed = playOffsetRef.current + (now - playStartRef.current) / 1000;

        // Find current segment
        let cumulative = 0;
        let segIdx = -1;
        let segOff = 0;
        const sc = scriptRef.current;
        for (let i = 0; i < sc.length; i++) {
          if (elapsed < cumulative + sc[i].duration) {
            segIdx = i;
            segOff = elapsed - cumulative;
            break;
          }
          cumulative += sc[i].duration;
        }

        if (segIdx === -1) {
          // Done
          isPlayingRef.current = false;
          setIsPlaying(false);
          setCurrentSegIdx(0);
          setSegmentElapsed(0);
          playOffsetRef.current = 0;
        } else {
          setCurrentSegIdx(segIdx);
          setSegmentElapsed(segOff);

          // Update amplitudes for all devices
          const activeDeviceId = sc[segIdx]?.deviceId;
          devicesRef.current.forEach(d => {
            const ampRef = getAmpRef(d.id);
            ampRef.current = computeAmplitude(d.id, d.id === activeDeviceId, segOff);
          });
        }
      } else {
        // Idle breathing for all devices
        devicesRef.current.forEach(d => {
          const ampRef = getAmpRef(d.id);
          ampRef.current = computeAmplitude(d.id, false, 0);
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [computeAmplitude, getAmpRef]);

  const handlePlay = () => {
    if (script.length === 0) return;
    playStartRef.current = performance.now();
    playOffsetRef.current = 0;
    isPlayingRef.current = true;
    setIsPlaying(true);
    setCurrentSegIdx(0);
    setSegmentElapsed(0);
  };

  const handlePause = () => {
    const elapsed = playOffsetRef.current + (performance.now() - playStartRef.current) / 1000;
    playOffsetRef.current = elapsed;
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

  // ─── Script helpers ─────────────────────────────────────────────────────────

  const addLine = () => {
    const newLine: ScriptLine = {
      id: `line-${Date.now()}`,
      deviceId: devices[0]?.id || '',
      text: '',
      duration: 3,
    };
    setScript(prev => [...prev, newLine]);
  };

  const updateLine = (id: string, changes: Partial<ScriptLine>) => {
    setScript(prev => prev.map(l => l.id === id ? { ...l, ...changes } : l));
  };

  const deleteLine = (id: string) => {
    setScript(prev => prev.filter(l => l.id !== id));
  };

  // ─── Device helpers ──────────────────────────────────────────────────────────

  const addDevice = () => {
    if (devices.length >= 4) { toast.warning('Maximum 4 devices'); return; }
    const colors: OrbColor[] = ['blue', 'green', 'red', 'purple', 'orange', 'cyan', 'pink', 'white'];
    const styles: PhoneStyle[] = ['android-dark', 'iphone-black', 'android-light', 'iphone-white'];
    const idx = devices.length;
    setDevices(prev => [...prev, {
      id: `dev-${Date.now()}`,
      name: `Device ${prev.length + 1}`,
      orbColor: colors[idx % colors.length],
      phoneStyle: styles[idx % styles.length],
    }]);
  };

  const updateDevice = (id: string, changes: Partial<Device>) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, ...changes } : d));
  };

  const removeDevice = (id: string) => {
    if (devices.length <= 1) { toast.warning('Need at least 1 device'); return; }
    setDevices(prev => prev.filter(d => d.id !== id));
    setScript(prev => prev.filter(l => l.deviceId !== id));
  };

  // ─── Canvas export ───────────────────────────────────────────────────────────

  const exportCanvasRef = useRef<HTMLCanvasElement>(null);

  const drawFrameToCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    devices: Device[],
    activeDeviceId: string,
    subtitle: string,
    showSubs: boolean,
    showNms: boolean,
    bgPreset: BgPreset,
    frameTime: number,
  ) => {
    // Background
    const bgVal = BG_PRESETS[bgPreset].value;
    if (bgVal.startsWith('linear-gradient')) {
      // Parse and apply gradient
      const grad = ctx.createLinearGradient(0, 0, W, H);
      if (bgPreset === 'grad-purple') {
        grad.addColorStop(0, '#0f0014');
        grad.addColorStop(0.5, '#1e0040');
        grad.addColorStop(1, '#0f000a');
      } else if (bgPreset === 'grad-blue') {
        grad.addColorStop(0, '#00050f');
        grad.addColorStop(0.5, '#0c1a3a');
        grad.addColorStop(1, '#000508');
      } else if (bgPreset === 'wood') {
        grad.addColorStop(0, '#3d2b1f');
        grad.addColorStop(0.3, '#5c3d2a');
        grad.addColorStop(0.6, '#4a3020');
        grad.addColorStop(1, '#3d2b1f');
      } else {
        grad.addColorStop(0, '#0a0a0a');
        grad.addColorStop(0.5, '#111827');
        grad.addColorStop(1, '#0a0a0a');
      }
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = bgVal;
    }
    ctx.fillRect(0, 0, W, H);

    const n = devices.length;
    const phoneH = H * 0.72;
    const phoneW = phoneH * 0.48;
    const gap = W * 0.04;
    const totalW = n * phoneW + (n - 1) * gap;
    const startX = (W - totalW) / 2;
    const phoneY = (H - phoneH) / 2 - (showNms ? H * 0.03 : 0);

    devices.forEach((device, i) => {
      const px = startX + i * (phoneW + gap);
      const isActive = device.id === activeDeviceId;
      const ps = PHONE_STYLES[device.phoneStyle];
      const c = ORB_COLORS[device.orbColor];

      // Compute amplitude
      let amp: number;
      if (isActive) {
        amp = 0.45 + 0.35 * Math.abs(Math.sin(frameTime * 8.5 + Math.sin(frameTime * 3.1) * 1.5))
             + 0.1 * Math.sin(frameTime * 17.3);
        amp = Math.min(1, Math.max(0, amp));
      } else {
        amp = 0.08 + 0.05 * Math.sin(frameTime * 1.2 + i * 1.5);
      }

      // Phone glow when active
      if (isActive) {
        ctx.save();
        ctx.shadowColor = c.glow;
        ctx.shadowBlur = 30;
      }

      // Phone body (rounded rect)
      const r = phoneW * 0.08;
      ctx.beginPath();
      ctx.moveTo(px + r, phoneY);
      ctx.lineTo(px + phoneW - r, phoneY);
      ctx.quadraticCurveTo(px + phoneW, phoneY, px + phoneW, phoneY + r);
      ctx.lineTo(px + phoneW, phoneY + phoneH - r);
      ctx.quadraticCurveTo(px + phoneW, phoneY + phoneH, px + phoneW - r, phoneY + phoneH);
      ctx.lineTo(px + r, phoneY + phoneH);
      ctx.quadraticCurveTo(px, phoneY + phoneH, px, phoneY + phoneH - r);
      ctx.lineTo(px, phoneY + r);
      ctx.quadraticCurveTo(px, phoneY, px + r, phoneY);
      ctx.closePath();
      ctx.fillStyle = ps.bodyBg;
      ctx.fill();
      ctx.strokeStyle = ps.border;
      ctx.lineWidth = 2;
      ctx.stroke();

      if (isActive) ctx.restore();

      // Screen
      const sp = phoneW * 0.04;
      const sx = px + sp, sy = phoneY + phoneH * 0.05;
      const sw = phoneW - sp * 2, sh = phoneH * 0.87;
      const sr = r * 0.8;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx + sr, sy);
      ctx.lineTo(sx + sw - sr, sy);
      ctx.quadraticCurveTo(sx + sw, sy, sx + sw, sy + sr);
      ctx.lineTo(sx + sw, sy + sh - sr);
      ctx.quadraticCurveTo(sx + sw, sy + sh, sx + sw - sr, sy + sh);
      ctx.lineTo(sx + sr, sy + sh);
      ctx.quadraticCurveTo(sx, sy + sh, sx, sy + sh - sr);
      ctx.lineTo(sx, sy + sr);
      ctx.quadraticCurveTo(sx, sy, sx + sr, sy);
      ctx.closePath();
      ctx.fillStyle = ps.screenBg;
      ctx.fill();
      ctx.clip();

      // Orb
      const orbCX = sx + sw / 2;
      const orbCY = sy + sh * 0.48;
      const maxR = sw * 0.33;
      const orbR = maxR * (0.5 + 0.5 * amp);

      // Outer glow
      const glowGrad = ctx.createRadialGradient(orbCX, orbCY, 0, orbCX, orbCY, orbR * 2.8);
      glowGrad.addColorStop(0, c.glow.replace(')', `,${amp * 0.5})`).replace('rgba(', 'rgba('));
      glowGrad.addColorStop(0, c.glow);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.globalAlpha = amp * 0.7;
      ctx.beginPath();
      ctx.arc(orbCX, orbCY, orbR * 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Main orb
      const orbGrad = ctx.createRadialGradient(
        orbCX - orbR * 0.2, orbCY - orbR * 0.2, 0,
        orbCX, orbCY, orbR
      );
      orbGrad.addColorStop(0, c.inner);
      orbGrad.addColorStop(0.5, c.mid);
      orbGrad.addColorStop(1, c.outer + '80');
      ctx.globalAlpha = 0.5 + 0.5 * amp;
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(orbCX, orbCY, orbR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Specular
      const specR = orbR * 0.28;
      const specGrad = ctx.createRadialGradient(
        orbCX - orbR * 0.3, orbCY - orbR * 0.3, 0,
        orbCX - orbR * 0.3, orbCY - orbR * 0.3, specR
      );
      specGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
      specGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = specGrad;
      ctx.beginPath();
      ctx.arc(orbCX - orbR * 0.3, orbCY - orbR * 0.3, specR, 0, Math.PI * 2);
      ctx.fill();

      // Model name on screen
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = ps.statusColor;
      ctx.font = `${Math.round(sw * 0.09)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(device.name, orbCX, sy + sh * 0.14);
      ctx.globalAlpha = 1;

      // Subtitle on screen
      if (showSubs && subtitle && isActive) {
        ctx.fillStyle = ps.statusColor;
        ctx.font = `${Math.round(sw * 0.08)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.9;
        const maxW = sw * 0.88;
        const words = subtitle.split(' ');
        let line = '', lines: string[] = [];
        words.forEach(w => {
          const test = line ? line + ' ' + w : w;
          if (ctx.measureText(test).width > maxW) { lines.push(line); line = w; }
          else line = test;
        });
        if (line) lines.push(line);
        lines.slice(-2).forEach((ln, li) => {
          ctx.fillText(ln, orbCX, sy + sh * 0.82 + li * sw * 0.1);
        });
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // Device name label below phone
      if (showNms) {
        ctx.font = `bold ${Math.round(phoneW * 0.1)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = isActive ? '#ffffff' : 'rgba(255,255,255,0.4)';
        ctx.fillText(device.name, px + phoneW / 2, phoneY + phoneH + phoneH * 0.07);
      }
    });
  }, []);

  const handleExport = useCallback(async () => {
    if (script.length === 0) { toast.error('Script is empty'); return; }
    if (devices.length === 0) { toast.error('No devices'); return; }

    const FPS = 30;
    const W = exportResolution === '1080p' ? 1920 : 1280;
    const H = exportResolution === '1080p' ? 1080 : 720;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    const stream = canvas.captureStream(FPS);
    const chunks: Blob[] = [];

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    setIsExporting(true);
    setExportProgress(0);
    recorder.start(100);

    let t = 0;
    const totalT = script.reduce((s, l) => s + l.duration, 0);
    const dt = 1 / FPS;

    let cumulative = 0;
    let segIdx = 0;
    let segOff = 0;
    const getActiveDevice = (time: number) => {
      let cum = 0;
      for (let i = 0; i < script.length; i++) {
        if (time < cum + script[i].duration) return { id: script[i].deviceId, text: script[i].text, segOff: time - cum };
        cum += script[i].duration;
      }
      return { id: '', text: '', segOff: 0 };
    };

    await new Promise<void>(resolve => {
      const renderFrame = () => {
        if (t > totalT + 0.5) { resolve(); return; }
        const { id: activeId, text, segOff: so } = getActiveDevice(Math.min(t, totalT - 0.001));
        drawFrameToCanvas(ctx, W, H, devices, activeId, text, showSubtitles, showNames, bgPreset, t);
        t += dt;
        setExportProgress(Math.min(99, Math.round((t / totalT) * 100)));
        setTimeout(renderFrame, 0);
      };
      renderFrame();
    });

    recorder.stop();
    await new Promise<void>(res => { recorder.onstop = () => res(); });

    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phone-convo-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);

    setIsExporting(false);
    setExportProgress(0);
    toast.success('Video exported!');
  }, [script, devices, showSubtitles, showNames, bgPreset, exportResolution, drawFrameToCanvas]);

  // Current segment info
  const currentSeg = script[currentSegIdx];
  const progressPct = totalDuration > 0
    ? Math.min(100, (script.slice(0, currentSegIdx).reduce((s, l) => s + l.duration, 0) + segmentElapsed) / totalDuration * 100)
    : 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  const bgStyle: React.CSSProperties = {
    background: BG_PRESETS[bgPreset].value,
  };

  return (
    <div className="flex flex-col h-full bg-[#050505] text-white overflow-hidden">

      {/* Preview Area */}
      <div
        className="relative flex-shrink-0 overflow-hidden"
        style={{ ...bgStyle, aspectRatio: '16/9', maxHeight: '45vh', minHeight: '180px' }}
      >
        {/* Phone frames */}
        <div className="absolute inset-0 flex items-center justify-center gap-4 px-6 py-4">
          {devices.map(device => {
            const isActive = isPlaying && currentSeg?.deviceId === device.id;
            const subtitle = isActive ? currentSeg?.text : undefined;
            return (
              <div
                key={device.id}
                className="flex-1 flex items-center justify-center"
                style={{ maxWidth: `${Math.min(160, 400 / devices.length)}px` }}
              >
                <PhoneFrame
                  device={device}
                  isActive={isActive}
                  ampRef={getAmpRef(device.id)}
                  subtitle={subtitle}
                  showSubtitles={showSubtitles}
                  showName={showNames}
                  style={{ width: '100%' }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-white/[0.06] bg-[#080808]">
        {/* Progress bar */}
        <div className="h-1 bg-white/[0.06] rounded-full mb-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-none"
            style={{
              width: `${progressPct}%`,
              background: 'linear-gradient(90deg, #a855f7, #3b82f6)',
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={isPlaying ? handlePause : handlePlay}
            disabled={script.length === 0}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all active:scale-95 disabled:opacity-30"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
          <button
            onClick={handleStop}
            className="w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/10 flex items-center justify-center transition-all active:scale-95"
          >
            <Square size={12} />
          </button>
          <div className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {script.map((line, idx) => {
              const dev = devices.find(d => d.id === line.deviceId);
              const isCurrentLine = isPlaying && idx === currentSegIdx;
              const c = dev ? ORB_COLORS[dev.orbColor] : null;
              return (
                <div
                  key={line.id}
                  className="flex-shrink-0 flex flex-col items-center gap-0.5 cursor-pointer group"
                  onClick={() => {
                    if (!isPlaying) {
                      setCurrentSegIdx(idx);
                      setSegmentElapsed(0);
                    }
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all"
                    style={{
                      background: isCurrentLine && c ? `${c.glow}` : 'rgba(255,255,255,0.06)',
                      border: isCurrentLine && c ? `1.5px solid ${c.mid}` : '1.5px solid transparent',
                      color: isCurrentLine ? '#fff' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {dev?.name?.[0] ?? '?'}
                  </div>
                  <span className="text-[9px] text-gray-600">{line.duration}s</span>
                </div>
              );
            })}
          </div>
          <span className="text-[11px] text-gray-600 shrink-0">
            {totalDuration}s total
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-white/[0.06] bg-[#080808]">
        {([
          { id: 'script',     label: 'Script',     icon: FileText },
          { id: 'devices',    label: 'Devices',    icon: Smartphone },
          { id: 'background', label: 'Background', icon: Palette },
          { id: 'export',     label: 'Export',     icon: Video },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all border-b-2 ${
              activeTab === tab.id
                ? 'border-purple-500 text-white'
                : 'border-transparent text-gray-600 hover:text-gray-400'
            }`}
          >
            <tab.icon size={13} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* ── Script Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'script' && (
          <div className="p-3 space-y-2">
            {script.length === 0 && (
              <div className="text-center py-8 text-gray-600 text-sm">
                No script lines yet. Add one below.
              </div>
            )}
            {script.map((line, idx) => {
              const dev = devices.find(d => d.id === line.deviceId);
              const c = dev ? ORB_COLORS[dev.orbColor] : null;
              const isCurrentLine = isPlaying && idx === currentSegIdx;
              return (
                <div
                  key={line.id}
                  className="rounded-xl overflow-hidden border transition-all"
                  style={{
                    borderColor: isCurrentLine && c ? c.mid + '60' : 'rgba(255,255,255,0.07)',
                    background: isCurrentLine && c ? `${c.glow.replace('0.7)', '0.06)')}` : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05]">
                    {/* Device picker */}
                    <select
                      value={line.deviceId}
                      onChange={e => updateLine(line.id, { deviceId: e.target.value })}
                      className="bg-transparent text-xs font-semibold border-none outline-none cursor-pointer"
                      style={{ color: c ? c.inner : '#fff', maxWidth: '120px' }}
                    >
                      {devices.map(d => (
                        <option key={d.id} value={d.id} style={{ background: '#111', color: '#fff' }}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex-1" />
                    {/* Duration */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-600">Duration:</span>
                      <input
                        type="number"
                        value={line.duration}
                        min={1}
                        max={30}
                        onChange={e => updateLine(line.id, { duration: Math.max(1, Number(e.target.value)) })}
                        className="w-10 bg-white/[0.06] rounded px-1.5 py-0.5 text-xs text-center text-white border border-white/10 outline-none"
                      />
                      <span className="text-[10px] text-gray-600">s</span>
                    </div>
                    <button
                      onClick={() => deleteLine(line.id)}
                      className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <textarea
                    value={line.text}
                    onChange={e => updateLine(line.id, { text: e.target.value })}
                    placeholder="Enter dialogue..."
                    rows={2}
                    className="w-full bg-transparent px-3 py-2 text-sm text-gray-200 placeholder-gray-700 resize-none outline-none"
                  />
                </div>
              );
            })}
            <button
              onClick={addLine}
              className="w-full py-3 rounded-xl border border-dashed border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 text-gray-600 hover:text-gray-400 text-sm font-medium flex items-center justify-center gap-2 transition-all"
            >
              <Plus size={15} /> Add Line
            </button>
          </div>
        )}

        {/* ── Devices Tab ────────────────────────────────────────────────── */}
        {activeTab === 'devices' && (
          <div className="p-3 space-y-3">
            {/* Toggles */}
            <div className="flex items-center gap-3 pb-2 border-b border-white/[0.06]">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setShowSubtitles(p => !p)}
                  className={`w-9 h-5 rounded-full transition-all relative ${showSubtitles ? 'bg-purple-600' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${showSubtitles ? 'left-4' : 'left-0.5'}`} />
                </div>
                <span className="text-xs text-gray-400">Subtitles</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setShowNames(p => !p)}
                  className={`w-9 h-5 rounded-full transition-all relative ${showNames ? 'bg-purple-600' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${showNames ? 'left-4' : 'left-0.5'}`} />
                </div>
                <span className="text-xs text-gray-400">Names</span>
              </label>
            </div>

            {devices.map(device => (
              <div key={device.id} className="bg-white/[0.03] rounded-xl border border-white/[0.07] overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05]">
                  <input
                    value={device.name}
                    onChange={e => updateDevice(device.id, { name: e.target.value })}
                    className="flex-1 bg-transparent text-sm font-semibold text-white outline-none border-none placeholder-gray-600"
                    placeholder="Device name"
                  />
                  <button
                    onClick={() => removeDevice(device.id)}
                    className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="p-3 grid grid-cols-2 gap-3">
                  {/* Phone Style */}
                  <div>
                    <label className="text-[10px] text-gray-600 uppercase tracking-wider block mb-1.5">Phone Style</label>
                    <select
                      value={device.phoneStyle}
                      onChange={e => updateDevice(device.id, { phoneStyle: e.target.value as PhoneStyle })}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                    >
                      {Object.entries(PHONE_STYLES).map(([key, val]) => (
                        <option key={key} value={key} style={{ background: '#111' }}>{val.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* Orb Color */}
                  <div>
                    <label className="text-[10px] text-gray-600 uppercase tracking-wider block mb-1.5">Orb Color</label>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(ORB_COLORS) as OrbColor[]).map(colorKey => (
                        <button
                          key={colorKey}
                          onClick={() => updateDevice(device.id, { orbColor: colorKey })}
                          className="w-6 h-6 rounded-full transition-all"
                          style={{
                            background: ORB_COLORS[colorKey].mid,
                            boxShadow: device.orbColor === colorKey
                              ? `0 0 0 2px #fff, 0 0 0 3px ${ORB_COLORS[colorKey].mid}`
                              : 'none',
                            transform: device.orbColor === colorKey ? 'scale(1.1)' : 'scale(1)',
                          }}
                          title={colorKey}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {devices.length < 4 && (
              <button
                onClick={addDevice}
                className="w-full py-3 rounded-xl border border-dashed border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 text-gray-600 hover:text-gray-400 text-sm font-medium flex items-center justify-center gap-2 transition-all"
              >
                <Plus size={15} /> Add Device ({devices.length}/4)
              </button>
            )}
          </div>
        )}

        {/* ── Background Tab ─────────────────────────────────────────────── */}
        {activeTab === 'background' && (
          <div className="p-3">
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(BG_PRESETS) as [BgPreset, typeof BG_PRESETS[BgPreset]][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setBgPreset(key)}
                  className="relative rounded-xl overflow-hidden border-2 transition-all active:scale-95 aspect-video"
                  style={{
                    borderColor: bgPreset === key ? '#a855f7' : 'rgba(255,255,255,0.07)',
                    background: val.value,
                  }}
                >
                  {bgPreset === key && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                      <Check size={11} />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
                    <span className="text-xs font-medium text-white">{val.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Export Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'export' && (
          <div className="p-4 space-y-4">
            <div className="bg-white/[0.03] rounded-xl border border-white/[0.07] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">Export Settings</h3>
              <div>
                <label className="text-[11px] text-gray-500 uppercase tracking-wider block mb-2">Resolution</label>
                <div className="flex gap-2">
                  {(['720p', '1080p'] as const).map(res => (
                    <button
                      key={res}
                      onClick={() => setExportResolution(res)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                        exportResolution === res
                          ? 'bg-purple-600/20 border-purple-500 text-white'
                          : 'bg-white/[0.04] border-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      {res} {res === '720p' ? '(1280×720)' : '(1920×1080)'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <p>• Format: WebM (plays in all browsers)</p>
                <p>• Duration: {totalDuration}s total</p>
                <p>• {devices.length} device{devices.length > 1 ? 's' : ''}, {script.length} lines</p>
              </div>
            </div>

            {isExporting ? (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-purple-300 font-medium">Exporting video…</span>
                  <span className="text-purple-400">{exportProgress}%</span>
                </div>
                <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-600 to-blue-500 transition-none"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">Rendering frames to canvas…</p>
              </div>
            ) : (
              <button
                onClick={handleExport}
                disabled={script.length === 0}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 shadow-lg shadow-purple-900/30"
              >
                <Download size={16} />
                Export Video ({exportResolution})
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default PhoneConvoStudio;
