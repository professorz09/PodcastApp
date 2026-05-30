export type AnimStyle = 'orb' | 'bottom-glow' | 'wave' | 'cosmic-sphere' | 'aurora';

export interface PhoneConfig {
  id: string;
  name: string;
  style: AnimStyle;
  color: string;
  screenColor: string;
  rotation?: number;
  showControls?: boolean;
  voiceId?: string;
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

    // Background
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
    const padding = w * 0.13 * (1 - spacingRatio);
    const yPadding = h * 0.09;
    const availW = w - padding * 2;
    const availH = h - yPadding * 2;
    const spacing = availW * (0.02 + 0.13 * spacingRatio);
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
    // Volume up
    ctx.beginPath(); ctx.roundRect(x - btnW, y + h * 0.21, btnW, btnH, 2); ctx.fill();
    // Volume down
    ctx.beginPath(); ctx.roundRect(x - btnW, y + h * 0.3, btnW, btnH * 0.8, 2); ctx.fill();
    // Power
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
    ctx.fillText(this.state.deviceBattery || '95%', sx + sw * 0.93, sy + sw * 0.1);

    // Phone name
    ctx.textAlign = 'center';
    ctx.font = `bold ${sw * 0.065}px -apple-system,sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(phone.name, cx, sy + sh * 0.12);

    // Speaking / Listening status
    ctx.font = `600 ${sw * 0.038}px -apple-system,sans-serif`;
    if (isActive) {
      ctx.fillStyle = phone.color;
      ctx.fillText('Speaking…', cx, sy + sh * 0.17);
    } else if (hasActive) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('Listening…', cx, sy + sh * 0.17);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillText('Connected', cx, sy + sh * 0.17);
    }

    // Voice intensity (smoothed)
    let volt = this.voiceIntensities[phone.id] ?? 0;
    if (isActive) {
      const t = performance.now() / 150;
      const raw = (Math.sin(t) + Math.sin(t * 1.5 + 2) + Math.random() * 0.5) / 2.5;
      const target = Math.max(0.3, Math.min(1.2, 0.5 + raw * 0.5));
      volt += (target - volt) * 0.22;
    } else if (hasActive) {
      const t = performance.now() / 1000;
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

      const t = performance.now() / 1000;
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
      const t = performance.now() / 200;
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
      const t = performance.now() / 1000;
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
      const t = performance.now() / 1500;
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
    }

    // Reset
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // ── Subtitles — phrase mode ────────────────────────────────────────────
    const subCfg = this.state.subtitleConfig ?? { enabled: true, size: 1, background: 'dark', textColor: '#fff' };
    if (isActive && text && subCfg.enabled) {
      const bgType = subCfg.background ?? 'dark';
      if (bgType !== 'none') {
        const tg = ctx.createLinearGradient(0, sy + sh * 0.55, 0, sy + sh);
        tg.addColorStop(0, 'transparent');
        tg.addColorStop(0.45, bgType === 'light' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.65)');
        tg.addColorStop(1,    bgType === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.94)');
        ctx.fillStyle = tg;
        ctx.fillRect(sx, sy + sh * 0.55, sw, sh * 0.45);
      }

      const fs = sw * 0.052 * (subCfg.size ?? 1);
      ctx.font = `700 ${fs}px -apple-system,sans-serif`;

      const allWords = text.replace(/\n/g, ' ').split(/\s+/).filter(w => w);
      if (!allWords.length) { ctx.textAlign = 'center'; return; }

      // ── Split text into fixed phrases of CHUNK_SIZE words ──────────────
      const CHUNK = 4;
      const phrases: string[][] = [];
      for (let i = 0; i < allWords.length; i += CHUNK)
        phrases.push(allWords.slice(i, i + CHUNK));

      // ── Determine current global word index + pop-in progress ──────────
      const wtArr = activeTurn?.wordTimings;
      const useTimings = !!(wtArr && wtArr.length > 0 && Math.abs(wtArr.length - allWords.length) <= 3);

      let globalWordIdx = 0;   // index of the word currently appearing (0-based)
      let popProg       = 1.0; // 0–1 pop-in of that word

      if (useTimings) {
        const cur = turnProgress * (activeTurn!.durationMs / 1000);
        let found = false;
        for (let i = 0; i < wtArr!.length; i++) {
          const wt = wtArr![i];
          if (cur < wt.startTime) {
            globalWordIdx = Math.max(0, i - 1); popProg = 1.0; found = true; break;
          }
          if (cur <= wt.endTime) {
            const wd = wt.endTime - wt.startTime;
            globalWordIdx = i;
            popProg = wd > 1e-4 ? (cur - wt.startTime) / wd : 1;
            found = true; break;
          }
          globalWordIdx = i; popProg = 1.0;
        }
        if (!found) { globalWordIdx = wtArr!.length - 1; popProg = 1.0; }
      } else {
        const pct = Math.max(0, Math.min(0.999, turnProgress / 0.98));
        const weights = allWords.map(w => w.length + 2);
        const total   = weights.reduce((a, b) => a + b, 0) || 1;
        const target  = pct * total;
        let acc = 0;
        for (let i = 0; i < allWords.length; i++) {
          if (target < acc + weights[i]) {
            globalWordIdx = i;
            popProg = (target - acc) / weights[i];
            break;
          }
          acc += weights[i];
          globalWordIdx = i; popProg = 1.0;
        }
      }

      // ── Which phrase is active + how many words of it are visible ──────
      const activePhraseIdx  = Math.min(Math.floor(globalWordIdx / CHUNK), phrases.length - 1);
      const phraseStartWord  = activePhraseIdx * CHUNK;
      // +1 because globalWordIdx is the word currently popping in
      const wordsVisibleInPhrase = Math.min(globalWordIdx - phraseStartWord + 1, phrases[activePhraseIdx].length);

      const phrase = phrases[activePhraseIdx];

      // ── Colour helpers ────────────────────────────────────────────────
      const col = subCfg.textColor ?? '#ffffff';
      const hx  = (s: string, o: number) => parseInt(s.slice(o, o + 2), 16) || 255;
      const [rr, gg, bb] = [hx(col, 1), hx(col, 3), hx(col, 5)];

      // ── Draw words of the active phrase ───────────────────────────────
      // Anchor x so full phrase is centered (fixed — no text shift as words appear)
      const fullW = ctx.measureText(phrase.join(' ')).width;
      const lx    = cx - fullW / 2;
      const baseY = sy + sh * 0.875;

      ctx.textAlign = 'left';
      let prevStr = '';
      for (let i = 0; i < wordsVisibleInPhrase; i++) {
        const word     = phrase[i];
        const xOff     = prevStr ? ctx.measureText(prevStr + ' ').width : 0;
        const isNewest = i === wordsVisibleInPhrase - 1;

        if (isNewest) {
          const ease = 1 - Math.pow(1 - Math.max(0.02, popProg), 2.5);
          const yOff  = (1 - ease) * fs * 0.38;
          ctx.globalAlpha = Math.max(0.06, ease);
          ctx.fillStyle   = col;
          ctx.fillText(word, lx + xOff, baseY + yOff);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = `rgba(${rr},${gg},${bb},0.95)`;
          ctx.fillText(word, lx + xOff, baseY);
        }
        prevStr += (prevStr ? ' ' : '') + word;
      }
      ctx.textAlign = 'center';
    }

    // ── Bottom call controls ──────────────────────────────────────────────
    if (phone.showControls !== false) {
      const by = sy + sh * 0.925;
      // Video icon bg
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.beginPath(); ctx.arc(cx - sw * 0.25, by, sw * 0.065, 0, Math.PI * 2); ctx.fill();
      // Mic icon bg
      ctx.beginPath(); ctx.arc(cx, by, sw * 0.065, 0, Math.PI * 2); ctx.fill();
      // End call (red)
      ctx.fillStyle = 'rgba(239,68,68,0.85)';
      ctx.beginPath(); ctx.arc(cx + sw * 0.25, by, sw * 0.065, 0, Math.PI * 2); ctx.fill();
      // End call X
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = sw * 0.012;
      ctx.lineCap = 'round';
      const ex = cx + sw * 0.25, d = sw * 0.022;
      ctx.beginPath(); ctx.moveTo(ex - d, by - d); ctx.lineTo(ex + d, by + d); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + d, by - d); ctx.lineTo(ex - d, by + d); ctx.stroke();
    }
  }
}
