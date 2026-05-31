export type AnimStyle = 'orb' | 'bottom-glow' | 'wave' | 'cosmic-sphere' | 'aurora' | 'gemini' | 'ripple' | 'neon';

export interface PhoneConfig {
  id: string;
  name: string;
  style: AnimStyle;
  color: string;
  screenColor: string;
  rotation?: number;
  showControls?: boolean;
  voiceId?: string;
  battery?: string;
  backgroundImage?: string;
}

export interface CloudWord {
  word: string;
  startTime: number;
  endTime: number;
}

export interface ScriptTurn {
  id: string;
  phoneId: string;
  durationMs: number;
  text: string;
  audioUrl?: string;
  wordTimings?: CloudWord[];
  isNarrator?: boolean;
}

export interface StudioState {
  phones: PhoneConfig[];
  script: ScriptTurn[];
  background: { type: 'color'; value: string };
  deviceSpacing?: number;
  deviceScale?: number;
  startTime?: string;
  deviceBattery?: string;
  bgImageUrl?: string;
  subtitleConfig?: {
    enabled: boolean;
    size: number;
    background: 'dark' | 'light' | 'none';
    textColor?: string;
    narratorColor?: string;
    boxBorder?: number;
  };
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: StudioState;
  private reqId = 0;

  public currentTime = 0;
  public playing = false;
  private wallStart = 0;

  private voiceIntensities: Record<string, number> = {};
  private bgImageCache: Map<string, HTMLImageElement> = new Map();
  private speakerImageCache: Map<string, HTMLImageElement> = new Map();

  public onTimeUpdate?: (t: number) => void;
  public onComplete?: () => void;

  constructor(canvas: HTMLCanvasElement, state: StudioState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.state = state;
  }

  updateState(s: StudioState) {
    this.state = s;
    if (!this.playing) this.drawFrame();
  }

  play() {
    this.playing = true;
    this.wallStart = performance.now() - this.currentTime;
    this.loop();
  }

  stop() {
    this.playing = false;
    this.currentTime = 0;
    cancelAnimationFrame(this.reqId);
    this.onTimeUpdate?.(0);
    this.drawFrame();
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.reqId);
  }

  seek(t: number) {
    this.currentTime = t;
    this.onTimeUpdate?.(t);
    this.drawFrame();
  }

  private loop = () => {
    if (!this.playing) return;
    this.currentTime = performance.now() - this.wallStart;
    const total = this.state.script.reduce((a, b) => a + b.durationMs, 0);
    if (this.currentTime >= total && total > 0) {
      this.pause();
      this.currentTime = total;
      this.onComplete?.();
    }
    this.onTimeUpdate?.(this.currentTime);
    this.drawFrame();
    if (this.playing) this.reqId = requestAnimationFrame(this.loop);
  };

  drawFrame() {
    const { ctx, canvas, state, currentTime } = this;
    const w = canvas.width, h = canvas.height;

    // ── Background ────────────────────────────────────────────────────────
    if (state.bgImageUrl) {
      let img = this.bgImageCache.get(state.bgImageUrl);
      if (!img) {
        const newImg = new Image();
        newImg.crossOrigin = 'anonymous';
        newImg.onload = () => {
          this.bgImageCache.set(state.bgImageUrl!, newImg);
          if (!this.playing) this.drawFrame();
        };
        newImg.src = state.bgImageUrl;
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
      } else {
        // Cover fit — fill canvas preserving aspect ratio
        const scl = Math.max(w / img.width, h / img.height);
        const dw = img.width * scl, dh = img.height * scl;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
    } else {
      const bgVal = state.background.value || '#0f172a';
      if (bgVal.startsWith('linear:')) {
        const colors = bgVal.substring(7).split(',');
        const grad = ctx.createLinearGradient(0, 0, w, h);
        colors.forEach((c, i) => grad.addColorStop(i / Math.max(1, colors.length - 1), c.trim()));
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = bgVal;
      }
      ctx.fillRect(0, 0, w, h);
    }

    const phones = state.phones;

    // Active turn
    let elapsed = 0;
    let activeTurn: ScriptTurn | null = null;
    let turnProgress = 0;
    for (const turn of state.script) {
      if (currentTime >= elapsed && currentTime < elapsed + turn.durationMs) {
        activeTurn = turn;
        turnProgress = (currentTime - elapsed) / turn.durationMs;
        break;
      }
      elapsed += turn.durationMs;
    }

    // ── Narrator card — full-screen white slide ───────────────────────────
    if (activeTurn?.isNarrator) {
      this.drawNarratorCard(w, h, activeTurn.text, turnProgress);
      return;
    }

    if (!phones.length) return;

    // Layout
    const phoneAspect = 9 / 19.5;
    const spacingRatio = (state.deviceSpacing ?? 50) / 100;
    // Quadratic scale: at 100% gives large visible gap; at 0% phones are close
    const padding = w * 0.06 * (1 - spacingRatio);
    const yPadding = h * 0.09;
    const availW = w - padding * 2;
    const availH = h - yPadding * 2;
    const spacing = availW * (0.02 + 0.44 * spacingRatio * spacingRatio + 0.06 * spacingRatio);
    let pw = (availW - spacing * (phones.length - 1)) / phones.length;
    let ph = pw / phoneAspect;
    if (ph > availH) { ph = availH; pw = ph * phoneAspect; }
    const scale = (state.deviceScale ?? 100) / 100;
    pw *= scale; ph *= scale;
    const totalW = pw * phones.length + spacing * (phones.length - 1);
    const startX = (w - totalW) / 2;
    const startY = (h - ph) / 2;

    phones.forEach((phone, idx) => {
      const x = startX + idx * (pw + spacing);
      const isActive = activeTurn?.phoneId === phone.id;
      this.drawPhone(x, startY, pw, ph, phone, isActive, activeTurn !== null, activeTurn?.text, turnProgress, activeTurn);
    });
  }

  private drawNarratorCard(w: number, h: number, text: string, progress: number) {
    const { ctx } = this;

    // Fade in/out
    const fadeIn  = Math.min(1, progress / 0.12);
    const fadeOut = progress > 0.88 ? Math.max(0, (1 - progress) / 0.12) : 1;
    const alpha = fadeIn * fadeOut;

    // White card
    const cardW = w * 0.78;
    const cardH = h * 0.42;
    const cx = w / 2, cy = h / 2;
    const rx = cx - cardW / 2, ry = cy - cardH / 2;
    const corner = Math.min(cardW, cardH) * 0.07;

    ctx.globalAlpha = alpha;

    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 48;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(rx, ry, cardW, cardH, corner);
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;

    // Subtle top accent bar
    const accentH = cardH * 0.012;
    const accentGrad = ctx.createLinearGradient(rx, ry, rx + cardW, ry);
    accentGrad.addColorStop(0, '#7c3aed');
    accentGrad.addColorStop(1, '#ec4899');
    ctx.fillStyle = accentGrad;
    ctx.beginPath();
    ctx.roundRect(rx, ry, cardW, accentH, [corner, corner, 0, 0]);
    ctx.fill();

    // Question label
    ctx.fillStyle = '#9333ea';
    ctx.font = `700 ${w * 0.022}px -apple-system,sans-serif`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.1em';
    ctx.fillText('QUESTION', cx, ry + cardH * 0.24);
    ctx.letterSpacing = '0';

    // Divider line
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx + cardW * 0.12, ry + cardH * 0.35);
    ctx.lineTo(rx + cardW * 0.88, ry + cardH * 0.35);
    ctx.stroke();

    // Main question text — word wrap
    const fs = w * 0.042;
    ctx.font = `700 ${fs}px -apple-system,sans-serif`;
    ctx.fillStyle = '#111111';

    const maxW = cardW * 0.84;
    const words = text.split(' ').filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = word; }
      else cur = test;
    }
    if (cur) lines.push(cur);

    const lh = fs * 1.45;
    const textBlockH = lh * lines.length;
    const textStartY = ry + cardH * 0.45 + (cardH * 0.45 - textBlockH) / 2 + fs;
    lines.forEach((line, i) => {
      ctx.fillText(line, cx, textStartY + i * lh);
    });

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  private drawPhone(
    x: number, y: number, w: number, h: number,
    phone: PhoneConfig, isActive: boolean, hasActive: boolean,
    text?: string, turnProgress = 0, activeTurn: ScriptTurn | null = null
  ) {
    const { ctx } = this;
    const r = w * 0.12;
    const cx = x + w / 2, cy = y + h / 2;

    ctx.save();
    if (phone.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((phone.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    // ── Outer glow when SPEAKING ──────────────────────────────────────────
    if (isActive) {
      const pulse = 0.55 + Math.sin(this.currentTime / 350) * 0.2;
      ctx.shadowColor = phone.color;
      ctx.shadowBlur = w * 0.18;
      ctx.strokeStyle = phone.color;
      ctx.lineWidth = w * 0.028;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, w - 2, h - 2, r);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }

    // Outer shadow + bezel
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Bezel border
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#333');
    grad.addColorStop(1, '#111');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();

    // Screen
    const b = w * 0.025;
    ctx.fillStyle = phone.screenColor || '#000';
    ctx.beginPath();
    ctx.roundRect(x + b, y + b, w - b * 2, h - b * 2, r * 0.88);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + b, y + b, w - b * 2, h - b * 2, r * 0.88);
    ctx.clip();

    this.drawScreenContent(x + b, y + b, w - b * 2, h - b * 2, phone, isActive, hasActive, text, turnProgress, activeTurn);

    ctx.restore();

    // ── Subtle vignette when LISTENING — phone stays alive, just slightly quieter
    if (hasActive && !isActive) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x + b, y + b, w - b * 2, h - b * 2, r * 0.88);
      ctx.clip();
      // Very light overlay — just reduces brightness a tiny bit, phone stays visible
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }

    // Glass glare
    ctx.globalAlpha = 0.03;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x + b, y + b);
    ctx.lineTo(x + w * 0.72, y + b);
    ctx.lineTo(x + b, y + h * 0.78);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Side buttons
    const btnColor = '#252525';
    const btnH = h * 0.07;
    const btnW = w * 0.025;
    ctx.fillStyle = btnColor;
    ctx.beginPath(); ctx.roundRect(x - btnW, y + h * 0.21, btnW, btnH, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(x - btnW, y + h * 0.3, btnW, btnH * 0.8, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(x + w, y + h * 0.25, btnW, btnH * 1.1, 2); ctx.fill();

    ctx.restore();
  }

  private drawScreenContent(
    sx: number, sy: number, sw: number, sh: number,
    phone: PhoneConfig, isActive: boolean, hasActive: boolean,
    text?: string, turnProgress = 0, activeTurn: ScriptTurn | null = null
  ) {
    const { ctx } = this;
    const cx = sx + sw / 2;
    const cy = sy + sh * 0.42;

    // ── Speaker background image ───────────────────────────────────────────
    if (phone.backgroundImage) {
      let img = this.speakerImageCache.get(phone.backgroundImage);
      if (!img) {
        img = new Image();
        img.src = phone.backgroundImage;
        img.onload = () => { if (!this.playing) this.drawFrame(); };
        this.speakerImageCache.set(phone.backgroundImage, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const screenAspect = sw / sh;
        let dW = sw, dH = sh;
        if (imgAspect > screenAspect) { dH = sh; dW = sh * imgAspect; }
        else { dW = sw; dH = sw / imgAspect; }
        ctx.save();
        ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
        ctx.globalAlpha = 0.82;
        ctx.drawImage(img, sx - (dW - sw) / 2, sy - (dH - sh) / 2, dW, dH);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = phone.screenColor || '#000';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // Status bar
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 ${sw * 0.042}px -apple-system,sans-serif`;
    ctx.textAlign = 'left';

    let hrs = 9, mins = 41;
    if (this.state.startTime) {
      const [h, m] = this.state.startTime.split(':');
      hrs = parseInt(h) || 9; mins = parseInt(m) || 41;
    }
    const d = new Date(2024, 0, 1, hrs, mins, 0, 0);
    d.setMilliseconds(d.getMilliseconds() + this.currentTime);
    const fH = d.getHours().toString().padStart(2, '0');
    const fM = d.getMinutes().toString().padStart(2, '0');
    ctx.fillText(`${fH}:${fM}`, sx + sw * 0.07, sy + sw * 0.1);

    ctx.textAlign = 'right';
    // ── Per-phone battery (fallback to global setting) ─────────────────
    ctx.fillText(phone.battery ?? this.state.deviceBattery ?? '95%', sx + sw * 0.93, sy + sw * 0.1);

    // Phone name
    ctx.textAlign = 'center';
    ctx.font = `bold ${sw * 0.065}px -apple-system,sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(phone.name, cx, sy + sh * 0.12);

    // ── Speaking / Listening status with animated indicator ──────────────
    ctx.font = `600 ${sw * 0.038}px -apple-system,sans-serif`;
    const dotY  = sy + sh * 0.17 - sw * 0.016;
    const textX = cx + sw * 0.028;
    if (isActive) {
      // Pulsing colored dot
      const dotPulse = 0.7 + Math.sin(this.currentTime / 220) * 0.3;
      ctx.fillStyle = phone.color;
      ctx.shadowColor = phone.color;
      ctx.shadowBlur = sw * 0.04 * dotPulse;
      ctx.globalAlpha = dotPulse;
      ctx.beginPath(); ctx.arc(cx - sw * 0.11, dotY, sw * 0.016, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      ctx.fillStyle = phone.color;
      ctx.textAlign = 'left';
      ctx.fillText('Speaking', textX - sw * 0.11, sy + sh * 0.17);
      ctx.textAlign = 'center';
    } else if (hasActive) {
      // Small subtle dot (static, dim)
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.arc(cx - sw * 0.09, dotY, sw * 0.01, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'left';
      ctx.fillText('Listening', textX - sw * 0.09, sy + sh * 0.17);
      ctx.textAlign = 'center';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillText('Connected', cx, sy + sh * 0.17);
    }

    // Voice intensity (smoothed)
    let volt = this.voiceIntensities[phone.id] ?? 0;
    if (isActive) {
      const t = this.currentTime / 150;
      const raw = (Math.sin(t) + Math.sin(t * 1.5 + 2) + Math.random() * 0.5) / 2.5;
      const target = Math.max(0.3, Math.min(1.2, 0.5 + raw * 0.5));
      volt += (target - volt) * 0.22;
    } else if (hasActive) {
      const t = this.currentTime / 1000;
      volt += (0.07 + Math.sin(t) * 0.035 - volt) * 0.1;
    } else {
      volt += (0 - volt) * 0.08;
    }
    this.voiceIntensities[phone.id] = volt;

    // ── Animation styles ──────────────────────────────────────────────────

    if (phone.style === 'orb') {
      const maxR = sw * 0.34;
      const baseR = sw * 0.13;
      const radius = baseR + (maxR - baseR) * volt;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.3, phone.color);
      g.addColorStop(1, phone.color + '00');
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.shadowColor = phone.color; ctx.shadowBlur = 35 * volt;
      ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

    } else if (phone.style === 'bottom-glow') {
      const g = ctx.createRadialGradient(cx, sy + sh + sw * 0.1, 0, cx, sy + sh + sw * 0.1, sw * (0.55 + volt * 0.9));
      g.addColorStop(0, phone.color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.rect(sx, cy - sh * 0.2, sw, sh * 0.7); ctx.fill();

      const t = this.currentTime / 1000;
      ctx.fillStyle = phone.color;
      ctx.globalAlpha = 0.35 * volt;
      for (let i = 0; i < 3; i++) {
        const ox = Math.sin(t + i) * sw * 0.22;
        const oy = Math.cos(t * 1.5 + i) * sw * 0.1;
        const bR = sw * 0.28 + Math.sin(t * 2 + i) * sw * 0.1;
        ctx.beginPath(); ctx.arc(cx + ox, sy + sh + oy, bR, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

    } else if (phone.style === 'wave') {
      const t = this.currentTime / 200;
      ctx.strokeStyle = phone.color;
      ctx.lineWidth = sw * 0.032;
      ctx.lineCap = 'round';
      const bars = 7;
      const gap = sw * 0.09;
      const startBX = cx - (bars - 1) * gap / 2;
      for (let i = 0; i < bars; i++) {
        const bx = startBX + i * gap;
        const bh = sw * 0.045 + (volt > 0.01 ? Math.abs(Math.sin(t + i * 0.5)) * sw * 0.27 * volt : 0);
        ctx.beginPath(); ctx.moveTo(bx, cy - bh / 2); ctx.lineTo(bx, cy + bh / 2); ctx.stroke();
      }

    } else if (phone.style === 'cosmic-sphere') {
      const t = this.currentTime / 1000;
      const radius = sw * 0.27 + volt * sw * 0.13;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.7);
      cg.addColorStop(0, 'rgba(255,255,255,0.7)');
      cg.addColorStop(0.3, phone.color);
      cg.addColorStop(1, 'transparent');
      ctx.fillStyle = cg;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

      for (let i = 0; i < 4; i++) {
        const bR = radius * 1.55;
        const sp = 0.8 + i * 0.3;
        const ox = Math.sin(t * sp + i * Math.PI * 0.75) * radius * 0.42;
        const oy = Math.cos(t * sp * 1.1 + i * Math.PI * 0.75) * radius * 0.42;
        const bg = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, bR);
        bg.addColorStop(0, phone.color); bg.addColorStop(1, 'transparent');
        ctx.globalAlpha = 0.32 + volt * 0.38;
        ctx.fillStyle = bg;
        ctx.fillRect(cx + ox - bR, cy + oy - bR, bR * 2, bR * 2);
      }
      ctx.restore();

    } else if (phone.style === 'aurora') {
      const t = this.currentTime / 1500;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 4; i++) {
        const dx = Math.sin(t + i * 1.5) * sw * 0.32;
        const dy = Math.cos(t * 1.2 + i) * sh * 0.14;
        const ag = ctx.createRadialGradient(cx + dx, cy - sh * 0.15 + dy, 0, cx + dx, cy - sh * 0.15 + dy, sw * (0.38 + volt * 0.52));
        ag.addColorStop(0, phone.color); ag.addColorStop(1, 'transparent');
        ctx.fillStyle = ag;
        ctx.globalAlpha = 0.38 + 0.38 * volt;
        ctx.fillRect(sx, sy, sw, sh);
      }
      ctx.restore();

    } else if (phone.style === 'gemini') {
      // ── Gemini-style: large gradient sphere + ripple rings when speaking ─
      const t = this.currentTime / 1200;
      const baseR  = sw * 0.22;
      const radius = isActive ? baseR + volt * sw * 0.1 : baseR * 0.75;

      // Expanding ripple rings (only when speaking)
      if (isActive) {
        for (let i = 0; i < 3; i++) {
          const phase = ((t * 0.7 + i * 0.33) % 1);
          const rR    = radius * (1 + phase * 1.4);
          ctx.strokeStyle = phone.color;
          ctx.lineWidth   = sw * 0.006 * (1 - phase * 0.8);
          ctx.globalAlpha = (1 - phase) * 0.45 * volt;
          ctx.beginPath(); ctx.arc(cx, cy, rR, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Main sphere — radial gradient with highlight
      const sg = ctx.createRadialGradient(
        cx - radius * 0.28, cy - radius * 0.28, radius * 0.05,
        cx, cy, radius
      );
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(0.18, phone.color);
      sg.addColorStop(0.65, phone.color + 'cc');
      sg.addColorStop(1,    phone.color + '18');
      ctx.globalAlpha = isActive ? 1 : 0.6;
      ctx.shadowColor = phone.color;
      ctx.shadowBlur  = radius * (isActive ? 0.7 * volt : 0.15);
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = sg; ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

      // Subtle inner glare
      const glare = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx - radius * 0.3, cy - radius * 0.3, radius * 0.45);
      glare.addColorStop(0, 'rgba(255,255,255,0.35)');
      glare.addColorStop(1, 'transparent');
      ctx.fillStyle = glare; ctx.globalAlpha = isActive ? 1 : 0.5;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

    } else if (phone.style === 'ripple') {
      // ── Ripple: concentric expanding rings from center dot ────────────────
      const t = this.currentTime / 700;
      const dotR  = sw * 0.04 * (0.85 + volt * 0.3);
      const maxR  = sw * (0.3 + volt * 0.1);

      // Center dot
      ctx.fillStyle  = phone.color;
      ctx.shadowColor = phone.color;
      ctx.shadowBlur  = dotR * 1.8 * (isActive ? volt : 0.2);
      ctx.globalAlpha = isActive ? 1 : 0.45;
      ctx.beginPath(); ctx.arc(cx, cy, dotR, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.globalAlpha = 1;

      // Rings
      for (let i = 0; i < 4; i++) {
        const phase = isActive ? ((t + i * 0.25) % 1) : 0;
        const rR    = dotR + (maxR - dotR) * (isActive ? phase : i * 0.22);
        const alpha = isActive ? (1 - phase) * 0.55 * volt : 0.06 - i * 0.012;
        if (alpha <= 0) continue;
        ctx.strokeStyle = phone.color;
        ctx.lineWidth   = sw * 0.014 * (isActive ? (1 - phase * 0.6) : 0.5);
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(cx, cy, rR, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;

    } else if (phone.style === 'neon') {
      // ── Neon: vertical equalizer bars with glow ───────────────────────────
      const t    = this.currentTime / 140;
      const bars = 9;
      const bw   = sw * 0.028;
      const gap  = sw * 0.072;
      const maxH = sh * 0.26;
      const startBX = cx - (bars - 1) * gap / 2;

      ctx.save();
      ctx.shadowColor = phone.color;

      for (let i = 0; i < bars; i++) {
        const bx = startBX + i * gap;
        const h  = isActive
          ? bw * 0.6 + Math.abs(Math.sin(t + i * 0.65)) * maxH * volt
          : bw * 0.5;
        const alpha = isActive ? 0.65 + Math.abs(Math.sin(t * 0.5 + i)) * 0.35 : 0.18;
        ctx.shadowBlur = isActive ? bw * 2.5 * volt : 0;

        const bg = ctx.createLinearGradient(bx, cy - h / 2, bx, cy + h / 2);
        bg.addColorStop(0,   phone.color + '60');
        bg.addColorStop(0.5, phone.color);
        bg.addColorStop(1,   phone.color + '60');
        ctx.fillStyle  = bg;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.roundRect(bx - bw / 2, cy - h / 2, bw, h, bw * 0.4);
        ctx.fill();
      }
      ctx.restore();
    }

    // Reset
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // ── Subtitles (MobileTalk style) ──────────────────────────────────────
    const subCfg = this.state.subtitleConfig ?? { enabled: true, size: 1, background: 'dark', textColor: '#fff' };
    if (isActive && text && subCfg.enabled) {

      // ── Background gradient ──────────────────────────────────────────
      const bgType = subCfg.background ?? 'dark';
      if (bgType !== 'none') {
        const tg = ctx.createLinearGradient(0, sy + sh * 0.4, 0, sy + sh * 1.0);
        tg.addColorStop(0, 'transparent');
        if (bgType === 'light') {
          tg.addColorStop(0.4, 'rgba(255,255,255,0.4)');
          tg.addColorStop(1,   'rgba(255,255,255,0.85)');
        } else {
          tg.addColorStop(0.4, 'rgba(0,0,0,0.6)');
          tg.addColorStop(1,   'rgba(0,0,0,0.9)');
        }
        ctx.fillStyle = tg;
        ctx.fillRect(sx, sy + sh * 0.4, sw, sh * 0.6);
      }

      const fontSize = sw * 0.045 * (subCfg.size ?? 1);
      ctx.font = `500 ${fontSize}px sans-serif`;
      ctx.textAlign = 'left';

      const words = text.replace(/\n/g, ' ').split(' ').filter(w => w.trim() !== '');
      const pct   = Math.max(0, Math.min(1, turnProgress / 0.95));

      // ── targetWordFloat — how many words are "done" (fractional) ──────
      let targetWordFloat = 0;
      const wtArr = activeTurn?.wordTimings;
      if (wtArr && wtArr.length > 0) {
        const cur = turnProgress * (activeTurn!.durationMs / 1000);
        for (let i = 0; i < wtArr.length; i++) {
          const wt = wtArr[i];
          if (cur < wt.startTime) { break; }
          else if (cur <= wt.endTime) {
            const wd = wt.endTime - wt.startTime;
            targetWordFloat = i + (wd > 0 ? (cur - wt.startTime) / wd : 1);
            break;
          } else { targetWordFloat = i + 1; }
        }
      } else {
        const ww  = words.map(w => w.length + 2);
        const tot = ww.reduce((a, b) => a + b, 0) || 1;
        const tgt = pct * tot;
        let acc = 0;
        for (let i = 0; i < words.length; i++) {
          if (tgt <= acc + ww[i]) { targetWordFloat = i + (tgt - acc) / ww[i]; break; }
          acc += ww[i];
        }
        if (tgt >= tot) targetWordFloat = words.length;
      }

      // ── Word-wrap all text into lines ─────────────────────────────────
      const lines: { text: string; words: string[] }[] = [];
      let curW: string[] = [];
      for (const w of words) {
        const test = curW.length ? curW.join(' ') + ' ' + w : w;
        if (curW.length && ctx.measureText(test).width > sw * 0.85) {
          lines.push({ text: curW.join(' '), words: [...curW] }); curW = [w];
        } else { curW.push(w); }
      }
      if (curW.length) lines.push({ text: curW.join(' '), words: [...curW] });

      // ── Group wrapped lines into phrase groups of ≤2 lines ───────────
      const phraseGroups: { text: string; words: string[] }[][] = [];
      for (let i = 0; i < lines.length; i += 2)
        phraseGroups.push(lines.slice(i, i + 2));

      // Find which phrase group the current word falls in
      let globalStart = 0;
      let activeGroupIdx = phraseGroups.length - 1;
      for (let g = 0; g < phraseGroups.length; g++) {
        const groupWords = phraseGroups[g].reduce((s, l) => s + l.words.length, 0);
        if (targetWordFloat < globalStart + groupWords) { activeGroupIdx = g; break; }
        globalStart += groupWords;
      }

      // globalStart now = index of first word in active group
      // recalculate properly
      globalStart = 0;
      for (let g = 0; g < activeGroupIdx; g++)
        globalStart += phraseGroups[g].reduce((s, l) => s + l.words.length, 0);

      const activeGroup = phraseGroups[activeGroupIdx] || [];
      const lh          = fontSize * 1.4;

      // Y: center the group vertically in the lower area
      const groupH  = activeGroup.length * lh;
      const ty      = sy + sh * 0.68 - groupH / 2; // 1 line → sh*0.68, 2 lines → a bit higher

      const col = subCfg.textColor ?? '#ffffff';
      const rr  = parseInt(col.slice(1, 3), 16) || 255;
      const gg  = parseInt(col.slice(3, 5), 16) || 255;
      const bb  = parseInt(col.slice(5, 7), 16) || 255;

      let wordIdxInGroup = globalStart;
      activeGroup.forEach((line, li) => {
        const lineW   = ctx.measureText(line.text).width;
        const startTx = cx - lineW / 2;
        let prevText  = '';

        line.words.forEach(w => {
          const dist  = targetWordFloat - wordIdxInGroup;
          // Sharp sync: word appears almost instantly when it's "active"
          // dist > 0 means word's time has come; full alpha at dist = 0.15
          const alpha = dist > 0 ? Math.min(1.0, dist * 7.0) : 0;
          if (alpha > 0.01) {
            const ease    = 1 - Math.pow(1 - Math.min(1, alpha), 3);
            const yOffset = (1 - ease) * (sw * 0.008); // subtle slide, much less than before
            const xOff   = prevText ? ctx.measureText(prevText + ' ').width : 0;
            ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha})`;
            ctx.fillText(w, startTx + xOff, ty + li * lh + yOffset);
          }
          prevText += (prevText ? ' ' : '') + w;
          wordIdxInGroup++;
        });
      });
      ctx.textAlign = 'center';
    }

    // ── Bottom call controls (mic · dots · X) ────────────────────────────
    if (phone.showControls !== false) {
      const by  = sy + sh * 0.925;
      const cr  = sw * 0.065; // circle radius
      const ic  = 'rgba(255,255,255,0.9)';
      const bgC = 'rgba(255,255,255,0.1)';

      // ── Circle helper ─────────────────────────────────────────────────
      const drawCircleBg = (bx: number, fill: string) => {
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.arc(bx, by, cr, 0, Math.PI * 2); ctx.fill();
      };

      // ① Mic button ─────────────────────────────────────────────────────
      const mx = cx - sw * 0.25;
      drawCircleBg(mx, bgC);
      ctx.strokeStyle = ic; ctx.lineWidth = sw * 0.013; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.fillStyle = ic;
      const mh = cr * 0.52, mw = cr * 0.32;
      // Mic capsule
      ctx.beginPath();
      ctx.roundRect(mx - mw, by - mh, mw * 2, mh * 1.55, mw);
      ctx.fill();
      // Stand arc
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(mx, by + mh * 0.18, mw * 1.45, 0, Math.PI);
      ctx.stroke();
      // Stand line
      ctx.beginPath();
      ctx.moveTo(mx, by + mh * 0.18 + mw * 1.45);
      ctx.lineTo(mx, by + mh * 0.72);
      ctx.stroke();
      // Base line
      ctx.beginPath();
      ctx.moveTo(mx - mw * 1.2, by + mh * 0.72);
      ctx.lineTo(mx + mw * 1.2, by + mh * 0.72);
      ctx.stroke();

      // ② Three-dots button ──────────────────────────────────────────────
      drawCircleBg(cx, bgC);
      ctx.fillStyle = ic;
      const dr = cr * 0.13;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.arc(cx + i * cr * 0.36, by, dr, 0, Math.PI * 2); ctx.fill();
      }

      // ③ End-call (red X) ───────────────────────────────────────────────
      const ex = cx + sw * 0.25;
      drawCircleBg(ex, 'rgba(239,68,68,0.9)');
      ctx.strokeStyle = ic; ctx.lineWidth = sw * 0.014; ctx.lineCap = 'round';
      const d = cr * 0.38;
      ctx.beginPath(); ctx.moveTo(ex - d, by - d); ctx.lineTo(ex + d, by + d); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + d, by - d); ctx.lineTo(ex - d, by + d); ctx.stroke();
    }
  }
}
