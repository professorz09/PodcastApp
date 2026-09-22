export type AnimStyle =
  | 'orb'
  | 'bottom-glow'
  | 'wave'
  | 'cosmic-sphere'
  | 'aurora'
  | 'gemini'
  | 'ripple'
  | 'neon'
  | 'particles'
  | 'liquid'
  | 'spectrum'
  | 'pulse-grid'
  | 'siri-blob'
  | 'galaxy';

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
  // 0-based index into narratorBoard.questions this turn is introducing —
  // undefined for the opening/closing Narrator turns (they don't map to a
  // single question). Drives which board items are "done" vs the one
  // currently being discussed (see drawFrame/drawWhiteboardContent).
  narratorPointIndex?: number;
  // A manually-attached AI illustration for this specific turn (host/phone
  // turns, picked per-turn in the "Image" settings sub-tab) — when set, this
  // turn renders as a full-bleed image instead of the phone mockups for its
  // whole duration, same full-frame treatment as the Narrator card.
  visualImageUrl?: string;
  /** Timed storyboard scenes for the Intro cold-open — switches images over
   *  the turn's own duration (same model as English Video's introScenes). */
  introScenes?: { prompt: string; startOffset: number; endOffset: number; imageUrl?: string; usesCharacter?: boolean }[];
  /** Timed storyboard scenes for a discussion turn (Image settings sub-tab). */
  segmentScenes?: { prompt: string; startOffset: number; endOffset: number; imageUrl?: string; usesCharacter?: boolean }[];
}

type TimedTurnScene = { prompt: string; startOffset: number; endOffset: number; imageUrl?: string };

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
  // Voice-driven "z-axis" scale pulse on the active phone. Default ON for
  // single-speaker scripts, OFF for 2+ speakers (set by the consumer).
  phoneZPulse?: boolean;
  // VU meter (audio-reactive vertical bar) beside the active phone. Default OFF.
  vuMeter?: boolean;
  // "Phone Studio 2" split-screen — a clip plays cover-fit in the top band
  // of the frame; everything else (background/phones/narrator) is confined
  // to the remaining bottom band instead of the full canvas.
  splitScreen?: { videoEl: HTMLVideoElement | null; topRatio?: number };
  // Narrator "whiteboard" — a grid-paper roadmap of debate questions shown
  // instead of the plain single-line card, one item struck through per
  // Narrator turn already passed (see drawNarratorCard). Omit/empty
  // questions to keep the plain single-line card for styles that don't use
  // a question sheet.
  narratorBoard?: { title: string; questions: string[] };
  /** Yellow bottom subtitles during intro/segment storyboard image playback. */
  storyboardSubtitleConfig?: {
    enabled: boolean;
    size: number;
    textColor?: string;
  };
  /** Top + bottom black letterbox bars on storyboard frames; subtitles sit in the bottom bar. */
  storyboardLetterbox?: boolean;
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: StudioState;
  private reqId = 0;

  public currentTime = 0;
  public playing = false;
  // 0..1 — set externally each frame from an AnalyserNode during playback,
  // or passed in from videoRenderer during export. Drives the active-phone
  // z-pulse and the VU meter.
  public audioLevel = 0;
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
    this.drawFrame();
  }

  // Attach/detach the top-band clip video for split-screen mode without
  // requiring the caller to rebuild the whole StudioState object.
  setSplitScreen(cfg: StudioState['splitScreen']) {
    this.state = { ...this.state, splitScreen: cfg };
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

    // ── Split-screen: clip in the top band, everything else confined to
    // the bottom band ────────────────────────────────────────────────────
    const split = state.splitScreen;
    const regionY = split ? h * (split.topRatio ?? 0.5) : 0;
    const regionH = h - regionY;
    const barH = (state.storyboardLetterbox ?? false) ? regionH * 0.12 : 0;
    const contentY = regionY + barH;
    const contentH = regionH - barH * 2;

    if (barH > 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, regionY, w, barH);
      ctx.fillRect(0, regionY + regionH - barH, w, barH);
    }

    if (split) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, regionY); ctx.clip();
      const vid = split.videoEl;
      if (vid && vid.readyState >= 2 && vid.videoWidth > 0) {
        const vScl = Math.max(w / vid.videoWidth, regionY / vid.videoHeight);
        const vdw = vid.videoWidth * vScl, vdh = vid.videoHeight * vScl;
        ctx.drawImage(vid, (w - vdw) / 2, (regionY - vdh) / 2, vdw, vdh);
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, regionY);
      }
      ctx.restore();
    }

    // ── Background (bottom band when split, full canvas otherwise) ────────
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
        ctx.fillStyle = '#111'; ctx.fillRect(0, contentY, w, contentH);
      } else {
        // Cover fit — fill content band preserving aspect ratio
        const scl = Math.max(w / img.width, contentH / img.height);
        const dw = img.width * scl, dh = img.height * scl;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, contentY, w, contentH); ctx.clip();
        ctx.drawImage(img, (w - dw) / 2, contentY + (contentH - dh) / 2, dw, dh);
        ctx.restore();
      }
    } else {
      const bgVal = state.background.value || '#0f172a';
      if (bgVal.startsWith('linear:')) {
        const colors = bgVal.substring(7).split(',');
        const grad = ctx.createLinearGradient(0, contentY, w, contentY + contentH);
        colors.forEach((c, i) => grad.addColorStop(i / Math.max(1, colors.length - 1), c.trim()));
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = bgVal;
      }
      ctx.fillRect(0, contentY, w, contentH);
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

    // ── Timed storyboard (intro cold-open or discussion segment scenes) ─
    // Intro always uses storyboard mode (white fallback if no scenes/images yet).
    const isIntroStoryboard = activeTurn?.phoneId === 'intro';
    const isSegmentStoryboard = !!activeTurn?.segmentScenes?.length;
    if (isIntroStoryboard || isSegmentStoryboard) {
      const timedScenes: TimedTurnScene[] = isIntroStoryboard
        ? (activeTurn!.introScenes ?? [])
        : activeTurn!.segmentScenes!;
      const turnIdx = activeTurn ? state.script.indexOf(activeTurn) : 0;
      this.drawTimedTurnScenes(w, contentH, contentY, timedScenes, turnProgress, activeTurn!.durationMs, turnIdx);
      if (isSegmentStoryboard) {
        this.drawPhonesPip(w, contentH, contentY, phones, activeTurn!, turnProgress);
      }
      this.drawLetterboxBars(w, regionY, regionH);
      this.drawStoryboardSubtitles(w, regionH, regionY, activeTurn!, turnProgress);
      return;
    }

    // ── Narrator card — white slide, confined to the bottom band when split ─
    if (activeTurn?.isNarrator) {
      const board = state.narratorBoard;
      let doneCount = 0;
      let activeIndex = -1;
      if (board && board.questions.length) {
        const n = board.questions.length;
        if (activeTurn.narratorPointIndex !== undefined) {
          // This turn IS introducing a specific question — everything before
          // it is done/crossed, this one is the highlighted "current" item.
          doneCount = activeTurn.narratorPointIndex;
          activeIndex = activeTurn.narratorPointIndex;
        } else {
          // Opening or closing turn — find the highest question index any
          // EARLIER turn already introduced. Static, no animation: whatever
          // is already done shows as already-crossed from this turn's very
          // first frame — 0 for the opening (nothing done yet), n for the
          // closing (everything done) — same as every other turn.
          let maxSeen = -1;
          for (const turn of state.script) {
            if (turn === activeTurn) break;
            if (turn.narratorPointIndex !== undefined) maxSeen = Math.max(maxSeen, turn.narratorPointIndex);
          }
          doneCount = maxSeen + 1;
        }
      }
      this.drawNarratorCard(w, contentH, activeTurn.text, turnProgress, contentY, board, doneCount, activeIndex);
      this.drawLetterboxBars(w, regionY, regionH);
      return;
    }

    // ── Per-turn illustration — full-bleed Ken Burns background with speaker
    // phones shrunk into a bottom-right PiP overlay (Image settings sub-tab).
    if (activeTurn?.visualImageUrl) {
      const turnIdx = activeTurn ? state.script.indexOf(activeTurn) : 0;
      this.drawSegmentImage(w, contentH, contentY, activeTurn.visualImageUrl, turnProgress, turnIdx);
      this.drawPhonesPip(w, contentH, contentY, phones, activeTurn, turnProgress);
      this.drawLetterboxBars(w, regionY, regionH);
      this.drawStoryboardSubtitles(w, regionH, regionY, activeTurn, turnProgress);
      return;
    }

    if (!phones.length) {
      this.drawLetterboxBars(w, regionY, regionH);
      return;
    }

    // Layout — confined to the bottom band when split-screen is active
    const phoneAspect = 9 / 19.5;
    const isSingle = phones.length === 1;
    const spacingRatio = (state.deviceSpacing ?? 50) / 100;
    // Quadratic scale: at 100% gives large visible gap; at 0% phones are close
    const padding = w * 0.06 * (1 - spacingRatio);
    const yPadding = contentH * 0.09;
    const availW = w - padding * 2;
    const availH = contentH - yPadding * 2;
    const spacing = availW * (0.02 + 0.44 * spacingRatio * spacingRatio + 0.06 * spacingRatio);
    let pw = (availW - spacing * (phones.length - 1)) / phones.length;
    let ph = pw / phoneAspect;
    if (ph > availH) { ph = availH; pw = ph * phoneAspect; }
    const scale = (state.deviceScale ?? 100) / 100;
    pw *= scale; ph *= scale;
    const totalW = pw * phones.length + spacing * (phones.length - 1);
    // Single-speaker mode: phone sits on the LEFT side of the frame so the
    // right side is free for subtitles / overlays. Multi-speaker stays centred.
    const startX = isSingle ? (w * 0.04) : (w - totalW) / 2;
    const startY = contentY + (contentH - ph) / 2;

    // Z-pulse: default ON when single-speaker, OFF for multi. Consumer can
    // override either way via state.phoneZPulse.
    const zPulseOn = state.phoneZPulse ?? false;

    phones.forEach((phone, idx) => {
      const x = startX + idx * (pw + spacing);
      const isActive = activeTurn?.phoneId === phone.id;
      // DebateVisualizer-style pulse: small scale-up driven by audioLevel.
      // Single-speaker uses a stronger pulse so the depth effect reads clearly.
      const pulse = (zPulseOn && isActive) ? 1 + this.audioLevel * (isSingle ? 0.1 : 0.075) : 1;
      const force0Rotation = isSingle;
      this.drawPhone(x, startY, pw, ph, phone, isActive, activeTurn !== null, activeTurn?.text, turnProgress, activeTurn, pulse, force0Rotation);
    });
    this.drawLetterboxBars(w, regionY, regionH);
  }

  /** Top + bottom black bars — visible on canvas whenever letterbox is enabled. */
  private drawLetterboxBars(w: number, regionY: number, regionH: number) {
    const barH = (this.state.storyboardLetterbox ?? false) ? regionH * 0.12 : 0;
    if (barH <= 0) return;
    const { ctx } = this;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, regionY, w, barH);
    ctx.fillRect(0, regionY + regionH - barH, w, barH);
  }

  /** Nearest scene with an image — missing slots inherit from earlier scenes, else later ones. */
  private resolveSceneImageUrl(scenes: TimedTurnScene[], sceneIdx: number): string | undefined {
    if (sceneIdx < 0 || sceneIdx >= scenes.length) return undefined;
    if (scenes[sceneIdx].imageUrl) return scenes[sceneIdx].imageUrl;
    for (let i = sceneIdx - 1; i >= 0; i--) {
      if (scenes[i].imageUrl) return scenes[i].imageUrl;
    }
    for (let i = sceneIdx + 1; i < scenes.length; i++) {
      if (scenes[i].imageUrl) return scenes[i].imageUrl;
    }
    return undefined;
  }

  /** White placeholder so playback never blocks on missing images. */
  private drawStoryboardFallback(w: number, h: number, offsetY: number) {
    const { ctx } = this;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, offsetY, w, h);
  }

  private drawTimedTurnScenes(
    w: number, regionH: number, regionY: number,
    scenes: TimedTurnScene[], turnProgress: number, durationMs: number, turnIdx: number,
  ): void {
    if (!scenes.length) {
      this.drawStoryboardFallback(w, regionH, regionY);
      return;
    }
    const localSec = turnProgress * (durationMs / 1000);
    const sceneIdx = scenes.findIndex(s => localSec >= s.startOffset && localSec < s.endOffset);
    const idx = sceneIdx >= 0 ? sceneIdx : scenes.length - 1;
    const scene = scenes[idx];
    const sceneDur = Math.max(0.1, scene.endOffset - scene.startOffset);
    const sceneProgress = Math.max(0, Math.min(1, (localSec - scene.startOffset) / sceneDur));
    const imageUrl = this.resolveSceneImageUrl(scenes, idx);
    if (imageUrl) {
      this.drawSegmentImage(w, regionH, regionY, imageUrl, sceneProgress, idx);
    } else {
      this.drawStoryboardFallback(w, regionH, regionY);
    }
  }

  // Full-bleed cover-fit image for a manually-attached segment illustration
  // — reuses bgImageCache (keyed by URL, no reason for a separate cache).
  // Slow Ken Burns zoom + drift over progress (0→1) so a static illustration
  // never sits completely frozen on screen. sceneIndex alternates drift
  // direction so consecutive intro beats don't all pan the same way.
  private drawSegmentImage(w: number, h: number, offsetY: number, url: string, progress = 0, sceneIndex = 0) {
    const { ctx } = this;
    let img = this.bgImageCache.get(url);
    if (!img) {
      const newImg = new Image();
      newImg.crossOrigin = 'anonymous';
      newImg.onload = () => {
        this.bgImageCache.set(url, newImg);
        if (!this.playing) this.drawFrame();
      };
      newImg.src = url;
      ctx.fillStyle = '#111';
      ctx.fillRect(0, offsetY, w, h);
      return;
    }
    const p = Math.max(0, Math.min(1, progress));
    const zoom = 1.05 + 0.11 * p;
    const scl = Math.max(w / img.width, h / img.height) * zoom;
    const dw = img.width * scl, dh = img.height * scl;
    const dir = sceneIndex % 2 === 0 ? 1 : -1;
    const driftX = dir * Math.sin(p * Math.PI * 0.5) * w * 0.028;
    const driftY = Math.cos(p * Math.PI * 0.5) * h * 0.014;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, offsetY, w, h); ctx.clip();
    ctx.drawImage(img, (w - dw) / 2 - driftX, offsetY + (h - dh) / 2 - driftY, dw, dh);
    ctx.restore();
  }

  /** Fixed bottom-center yellow subtitles on storyboard frames (inside bottom bar). */
  private drawStoryboardSubtitles(
    w: number, regionH: number, regionY: number,
    activeTurn: ScriptTurn, turnProgress: number,
  ) {
    const subCfg = this.state.storyboardSubtitleConfig;
    if (!subCfg?.enabled || !activeTurn.text) return;

    const { ctx } = this;
    const letterbox = this.state.storyboardLetterbox ?? false;
    const barH = letterbox ? regionH * 0.12 : regionH * 0.08;
    const subY = regionY + regionH - barH;

    if (!letterbox) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, subY, w, barH);
    }

    const sizeMul = subCfg.size ?? 1;
    const fontSize = Math.min(barH * 0.42, w * 0.014) * sizeMul;
    const lh = fontSize * 1.25;
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const text = activeTurn.text.replace(/\n/g, ' ');
    const words = text.split(' ').filter(w => w.trim() !== '');
    const pct = Math.max(0, Math.min(1, turnProgress / 0.95));

    let targetWordFloat = 0;
    const wtArr = activeTurn.wordTimings;
    if (wtArr?.length) {
      const cur = turnProgress * (activeTurn.durationMs / 1000);
      for (let i = 0; i < wtArr.length; i++) {
        const wt = wtArr[i];
        if (cur < wt.startTime) break;
        else if (cur <= wt.endTime) {
          const wd = wt.endTime - wt.startTime;
          targetWordFloat = i + (wd > 0 ? (cur - wt.startTime) / wd : 1);
          break;
        } else { targetWordFloat = i + 1; }
      }
    } else {
      const ww = words.map(w => w.length + 2);
      const tot = ww.reduce((a, b) => a + b, 0) || 1;
      const tgt = pct * tot;
      let acc = 0;
      for (let i = 0; i < words.length; i++) {
        if (tgt <= acc + ww[i]) { targetWordFloat = i + (tgt - acc) / ww[i]; break; }
        acc += ww[i];
      }
      if (tgt >= tot) targetWordFloat = words.length;
    }

    const maxW = w * 0.92;
    const lines: { text: string; words: string[] }[] = [];
    let curW: string[] = [];
    for (const word of words) {
      const test = curW.length ? curW.join(' ') + ' ' + word : word;
      if (curW.length && ctx.measureText(test).width > maxW) {
        lines.push({ text: curW.join(' '), words: [...curW] });
        curW = [word];
      } else { curW.push(word); }
    }
    if (curW.length) lines.push({ text: curW.join(' '), words: [...curW] });

    const phraseGroups: { text: string; words: string[] }[][] = [];
    for (let i = 0; i < lines.length; i += 1) phraseGroups.push(lines.slice(i, i + 1));

    let globalStart = 0;
    let activeGroupIdx = phraseGroups.length - 1;
    for (let g = 0; g < phraseGroups.length; g++) {
      const groupWords = phraseGroups[g].reduce((s, l) => s + l.words.length, 0);
      if (targetWordFloat < globalStart + groupWords) { activeGroupIdx = g; break; }
      globalStart += groupWords;
    }
    globalStart = 0;
    for (let g = 0; g < activeGroupIdx; g++)
      globalStart += phraseGroups[g].reduce((s, l) => s + l.words.length, 0);

    const activeGroup = phraseGroups[activeGroupIdx] || [];
    const groupH = activeGroup.length * lh;
    const cx = w / 2;
    const baseY = subY + (barH + groupH) / 2 - fontSize * 0.15;

    const col = subCfg.textColor ?? '#FFD700';
    const rr = parseInt(col.slice(1, 3), 16) || 255;
    const gg = parseInt(col.slice(3, 5), 16) || 255;
    const bb = parseInt(col.slice(5, 7), 16) || 255;

    let wordIdxInGroup = globalStart;
    activeGroup.forEach((line, li) => {
      const lineW = ctx.measureText(line.text).width;
      const startTx = cx - lineW / 2;
      let prevText = '';
      line.words.forEach(word => {
        const dist = targetWordFloat - wordIdxInGroup;
        const alpha = dist > 0 ? Math.min(1.0, dist * 7.0) : 0;
        if (alpha > 0.01) {
          const xOff = prevText ? ctx.measureText(prevText + ' ').width : 0;
          ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha})`;
          ctx.fillText(word, startTx + xOff, baseY + li * lh);
        }
        prevText += (prevText ? ' ' : '') + word;
        wordIdxInGroup++;
      });
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
  }

  /** Word-synced subtitles in a canvas bounding box (phone screen or full storyboard). */
  private drawSyncedSubtitles(
    bx: number, by: number, bw: number, bh: number,
    text: string, turnProgress: number, activeTurn: ScriptTurn | null,
    subCfg: { enabled: boolean; size: number; background?: 'dark' | 'light' | 'none'; textColor?: string },
    verticalAnchor = 0.68,
  ) {
    const { ctx } = this;
    if (!subCfg.enabled || !text) return;

    const cx = bx + bw / 2;

    const bgType = subCfg.background ?? 'dark';
    if (bgType !== 'none') {
      const tg = ctx.createLinearGradient(0, by + bh * 0.2, 0, by + bh);
      tg.addColorStop(0, 'transparent');
      if (bgType === 'light') {
        tg.addColorStop(0.4, 'rgba(255,255,255,0.4)');
        tg.addColorStop(1, 'rgba(255,255,255,0.85)');
      } else {
        tg.addColorStop(0.4, 'rgba(0,0,0,0.6)');
        tg.addColorStop(1, 'rgba(0,0,0,0.9)');
      }
      ctx.fillStyle = tg;
      ctx.fillRect(bx, by + bh * 0.2, bw, bh * 0.8);
    }

    const fontSize = bw * 0.045 * (subCfg.size ?? 1);
    ctx.font = `500 ${fontSize}px sans-serif`;
    ctx.textAlign = 'left';

    const words = text.replace(/\n/g, ' ').split(' ').filter(w => w.trim() !== '');
    const pct = Math.max(0, Math.min(1, turnProgress / 0.95));

    let targetWordFloat = 0;
    const wtArr = activeTurn?.wordTimings;
    if (wtArr && wtArr.length > 0) {
      const cur = turnProgress * (activeTurn!.durationMs / 1000);
      for (let i = 0; i < wtArr.length; i++) {
        const wt = wtArr[i];
        if (cur < wt.startTime) break;
        else if (cur <= wt.endTime) {
          const wd = wt.endTime - wt.startTime;
          targetWordFloat = i + (wd > 0 ? (cur - wt.startTime) / wd : 1);
          break;
        } else { targetWordFloat = i + 1; }
      }
    } else {
      const ww = words.map(w => w.length + 2);
      const tot = ww.reduce((a, b) => a + b, 0) || 1;
      const tgt = pct * tot;
      let acc = 0;
      for (let i = 0; i < words.length; i++) {
        if (tgt <= acc + ww[i]) { targetWordFloat = i + (tgt - acc) / ww[i]; break; }
        acc += ww[i];
      }
      if (tgt >= tot) targetWordFloat = words.length;
    }

    const lines: { text: string; words: string[] }[] = [];
    let curW: string[] = [];
    for (const w of words) {
      const test = curW.length ? curW.join(' ') + ' ' + w : w;
      if (curW.length && ctx.measureText(test).width > bw * 0.85) {
        lines.push({ text: curW.join(' '), words: [...curW] }); curW = [w];
      } else { curW.push(w); }
    }
    if (curW.length) lines.push({ text: curW.join(' '), words: [...curW] });

    const phraseGroups: { text: string; words: string[] }[][] = [];
    for (let i = 0; i < lines.length; i += 2) phraseGroups.push(lines.slice(i, i + 2));

    let globalStart = 0;
    let activeGroupIdx = phraseGroups.length - 1;
    for (let g = 0; g < phraseGroups.length; g++) {
      const groupWords = phraseGroups[g].reduce((s, l) => s + l.words.length, 0);
      if (targetWordFloat < globalStart + groupWords) { activeGroupIdx = g; break; }
      globalStart += groupWords;
    }
    globalStart = 0;
    for (let g = 0; g < activeGroupIdx; g++)
      globalStart += phraseGroups[g].reduce((s, l) => s + l.words.length, 0);

    const activeGroup = phraseGroups[activeGroupIdx] || [];
    const lh = fontSize * 1.4;
    const groupH = activeGroup.length * lh;
    const ty = by + bh * verticalAnchor - groupH / 2;

    const col = subCfg.textColor ?? '#ffffff';
    const rr = parseInt(col.slice(1, 3), 16) || 255;
    const gg = parseInt(col.slice(3, 5), 16) || 255;
    const bb = parseInt(col.slice(5, 7), 16) || 255;

    let wordIdxInGroup = globalStart;
    activeGroup.forEach((line, li) => {
      const lineW = ctx.measureText(line.text).width;
      const startTx = cx - lineW / 2;
      let prevText = '';
      line.words.forEach(w => {
        const dist = targetWordFloat - wordIdxInGroup;
        const alpha = dist > 0 ? Math.min(1.0, dist * 7.0) : 0;
        if (alpha > 0.01) {
          const ease = 1 - Math.pow(1 - Math.min(1, alpha), 3);
          const yOffset = (1 - ease) * (bw * 0.008);
          const xOff = prevText ? ctx.measureText(prevText + ' ').width : 0;
          ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha})`;
          ctx.fillText(w, startTx + xOff, ty + li * lh + yOffset);
        }
        prevText += (prevText ? ' ' : '') + w;
        wordIdxInGroup++;
      });
    });
    ctx.textAlign = 'center';
  }

  // Speaker overlay on a full-bleed segment illustration — when photos are
  // uploaded, show only circular avatar PiP (not mini phone mockups). Active
  // speaker is slightly larger with an audio-reactive glow; inactive is dull.
  private drawPhonesPip(
    w: number, regionH: number, regionY: number,
    phones: PhoneConfig[], activeTurn: ScriptTurn, turnProgress: number,
  ) {
    if (!phones.length) return;
    if (phones.some(p => p.backgroundImage)) {
      this.drawSpeakerPhotosPip(w, regionH, regionY, phones, activeTurn);
      return;
    }
    this.drawPhoneMockupsPip(w, regionH, regionY, phones, activeTurn, turnProgress);
  }

  private drawSpeakerPhotosPip(
    w: number, regionH: number, regionY: number,
    phones: PhoneConfig[], activeTurn: ScriptTurn,
  ) {
    const { ctx } = this;
    const edgePad = w * 0.032;
    const gap = w * 0.022;
    const baseD = regionH * 0.13;
    const zPulseOn = this.state.phoneZPulse ?? false;

    type Item = { phone: PhoneConfig; isActive: boolean; d: number };
    const items: Item[] = phones.map(phone => {
      const isActive = activeTurn.phoneId === phone.id;
      const audioPulse = (zPulseOn && isActive) ? 1 + this.audioLevel * 0.14 : 1;
      const d = baseD * (isActive ? 1.22 : 0.88) * audioPulse;
      return { phone, isActive, d };
    });

    const totalW = items.reduce((s, it, i) => s + it.d + (i > 0 ? gap : 0), 0);
    const maxH = items.reduce((m, it) => Math.max(m, it.d), 0);
    const startX = w - edgePad - totalW;
    const baseY = regionY + regionH - edgePad;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = w * 0.018;
    ctx.beginPath();
    ctx.roundRect(startX - edgePad * 0.4, baseY - maxH - edgePad * 0.25, totalW + edgePad * 0.8, maxH + edgePad * 0.5, w * 0.016);
    ctx.fill();
    ctx.restore();

    // Pre-compute positions left-to-right, then paint inactive before active
    let x = startX;
    const positioned = items.map(item => {
      const cx = x + item.d / 2;
      const cy = baseY - item.d / 2;
      x += item.d + gap;
      return { ...item, cx, cy };
    });
    const drawOrder = [...positioned].sort((a, b) => (a.isActive === b.isActive ? 0 : a.isActive ? 1 : -1));
    for (const { phone, isActive, d, cx, cy } of drawOrder) {

      if (isActive) {
        const flicker = 0.7 + this.audioLevel * 0.3 + Math.sin(this.currentTime / 260) * 0.06;
        ctx.save();
        ctx.shadowColor = phone.color;
        ctx.shadowBlur = d * 0.22 * flicker;
        ctx.strokeStyle = phone.color;
        ctx.lineWidth = d * 0.045;
        ctx.globalAlpha = flicker;
        ctx.beginPath();
        ctx.arc(cx, cy, d / 2 + d * 0.04, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      ctx.clip();

      const url = phone.backgroundImage;
      if (url) {
        let img = this.speakerImageCache.get(url);
        if (!img) {
          img = new Image();
          img.src = url;
          img.onload = () => { if (!this.playing) this.drawFrame(); };
          this.speakerImageCache.set(url, img);
        }
        if (img.complete && img.naturalWidth > 0) {
          const scl = Math.max(d / img.naturalWidth, d / img.naturalHeight);
          const dw = img.naturalWidth * scl;
          const dh = img.naturalHeight * scl;
          ctx.globalAlpha = isActive ? 1 : 0.38;
          ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
          if (!isActive) {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(cx - d / 2, cy - d / 2, d, d);
          }
        } else {
          ctx.fillStyle = phone.color + '55';
          ctx.fillRect(cx - d / 2, cy - d / 2, d, d);
        }
      } else {
        ctx.fillStyle = isActive ? phone.color + '88' : phone.color + '33';
        ctx.fillRect(cx - d / 2, cy - d / 2, d, d);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${d * 0.38}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = isActive ? 1 : 0.45;
        ctx.fillText(phone.name[0]?.toUpperCase() || '?', cx, cy);
      }
      ctx.restore();
    }
  }

  private drawPhoneMockupsPip(
    w: number, regionH: number, regionY: number,
    phones: PhoneConfig[], activeTurn: ScriptTurn, turnProgress: number,
  ) {
    const { ctx } = this;
    const phoneAspect = 9 / 19.5;
    const count = phones.length;
    const edgePad = w * 0.032;
    const gap = w * 0.016;

    let ph = regionH * 0.24;
    let pw = ph * phoneAspect;
    const totalW = pw * count + gap * (count - 1);
    const maxW = w * 0.52;
    if (totalW > maxW) {
      pw = (maxW - gap * (count - 1)) / count;
      ph = pw / phoneAspect;
    }

    const startX = w - edgePad - totalW;
    const startY = regionY + regionH - edgePad - ph;
    const zPulseOn = this.state.phoneZPulse ?? false;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = w * 0.02;
    ctx.beginPath();
    ctx.roundRect(startX - edgePad * 0.45, startY - edgePad * 0.35, totalW + edgePad * 0.9, ph + edgePad * 0.7, w * 0.018);
    ctx.fill();
    ctx.restore();

    phones.forEach((phone, idx) => {
      const x = startX + idx * (pw + gap);
      const isActive = activeTurn.phoneId === phone.id;
      const pulse = (zPulseOn && isActive) ? 1 + this.audioLevel * 0.075 : 1;
      this.drawPhone(x, startY, pw, ph, phone, isActive, true, activeTurn.text, turnProgress, activeTurn, pulse, false);
    });
  }

  // Slides down from off-screen top into position, holds, then slides back
  // up before the turn ends — "a whiteboard drops down while the Narrator
  // talks" instead of a static centered fade card. With a narratorBoard
  // configured (question-sheet styles like case_debate) this becomes a
  // near full-bleed grid-paper roadmap with questions struck through as
  // the debate passes them; otherwise it's the original small floating
  // "QUESTION" card.
  private drawNarratorCard(
    w: number, h: number, text: string, progress: number, offsetY = 0,
    board?: { title: string; questions: string[] }, doneCount = 0, activeIndex = -1,
  ) {
    const { ctx } = this;
    const hasBoard = !!(board && board.questions.length);

    const SLIDE_IN = 0.15;
    const SLIDE_OUT = 0.15;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const easeInCubic = (t: number) => t * t * t;

    const cardW = hasBoard ? w * 0.94 : w * 0.78;
    const cardH = hasBoard ? h * 0.86 : h * 0.42;
    const cx = w / 2;
    const restCy = offsetY + h / 2;
    const offscreenCy = offsetY - cardH; // fully above the visible frame

    let cy: number;
    let alpha: number;
    if (progress < SLIDE_IN) {
      const t = easeOutCubic(progress / SLIDE_IN);
      cy = offscreenCy + (restCy - offscreenCy) * t;
      alpha = Math.min(1, progress / 0.03); // quick fade so the top edge doesn't pop in
    } else if (progress > 1 - SLIDE_OUT) {
      const t = easeInCubic((progress - (1 - SLIDE_OUT)) / SLIDE_OUT);
      cy = restCy + (offscreenCy - restCy) * t;
      alpha = 1;
    } else {
      cy = restCy;
      alpha = 1;
    }

    const rx = cx - cardW / 2, ry = cy - cardH / 2;
    const corner = hasBoard ? cardW * 0.018 : Math.min(cardW, cardH) * 0.07;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, offsetY, w, h);
    ctx.clip();
    ctx.globalAlpha = alpha;

    // Drop shadow + base white fill (shared by both variants)
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 48;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(rx, ry, cardW, cardH, corner);
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;

    if (hasBoard) {
      this.drawWhiteboardContent(rx, ry, cardW, cardH, corner, board!, doneCount, activeIndex);
    } else {
      this.drawPlainNarratorContent(rx, ry, cardW, cardH, cx, text);
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // Original small floating "QUESTION" card — used when no narratorBoard
  // question sheet is configured for this video.
  private drawPlainNarratorContent(rx: number, ry: number, cardW: number, cardH: number, cx: number, text: string) {
    const { ctx } = this;
    const w = cardW / 0.78; // recover the original `w` scale factor used for font sizing below

    // Subtle top accent bar
    const accentH = cardH * 0.012;
    const accentGrad = ctx.createLinearGradient(rx, ry, rx + cardW, ry);
    accentGrad.addColorStop(0, '#7c3aed');
    accentGrad.addColorStop(1, '#ec4899');
    ctx.fillStyle = accentGrad;
    ctx.beginPath();
    ctx.roundRect(rx, ry, cardW, accentH, [cardW * 0.09, cardW * 0.09, 0, 0]);
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
  }

  // Grid-paper "debate roadmap" whiteboard — a bold title up top, then the
  // full question sheet below with `doneCount` items struck through (a red
  // line through ones the debate has already covered), matching a real
  // whiteboard being crossed off as a discussion progresses.
  private drawWhiteboardContent(
    rx: number, ry: number, cardW: number, cardH: number, corner: number,
    board: { title: string; questions: string[] }, doneCount: number, activeIndex: number,
  ) {
    const { ctx } = this;

    // Clip to the board's rounded-rect footprint so the grid lines don't
    // spill past the corners.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rx, ry, cardW, cardH, corner);
    ctx.clip();

    // Grid-paper background
    const gridStep = cardW * 0.032;
    ctx.strokeStyle = 'rgba(15,23,42,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = rx; x <= rx + cardW; x += gridStep) { ctx.moveTo(x, ry); ctx.lineTo(x, ry + cardH); }
    for (let y = ry; y <= ry + cardH; y += gridStep) { ctx.moveTo(rx, y); ctx.lineTo(rx + cardW, y); }
    ctx.stroke();

    // Title
    const titleFs = cardW * 0.032;
    ctx.font = `800 ${titleFs}px -apple-system,sans-serif`;
    ctx.fillStyle = '#dc2626';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.02em';
    ctx.fillText(board.title.toUpperCase(), rx + cardW / 2, ry + cardH * 0.1);
    ctx.letterSpacing = '0';

    // Questions list — TOP-ANCHORED: items stack compactly right under the
    // title with a fixed, count-independent row height/gap, never spread
    // out to fill the card (so 2 questions don't float with huge gaps).
    // Font only shrinks (down to a legibility floor) when the stack would
    // otherwise overflow the card — so it holds up whether there are 3
    // questions or 10, without ever affecting the layout when there aren't.
    const listTop = ry + cardH * 0.18;
    const listH = cardH * 0.8;
    const textX = rx + cardW * 0.05;
    const maxTextW = cardW * 0.9;
    const MIN_FS = 9;

    const wrapAt = (size: number): string[][] => {
      ctx.font = `700 ${size}px -apple-system,sans-serif`;
      return board.questions.map((q, i) => {
        const label = `${i + 1}. ${q}`;
        const words = label.split(' ').filter(Boolean);
        const lines: string[] = [];
        let cur = '';
        for (const word of words) {
          const test = cur ? cur + ' ' + word : word;
          if (ctx.measureText(test).width > maxTextW && cur) { lines.push(cur); cur = word; }
          else cur = test;
        }
        if (cur) lines.push(cur);
        return lines;
      });
    };
    const stackHeight = (lines: string[][], lineH: number, gap: number) =>
      lines.reduce((h, ls) => h + ls.length * lineH + gap, -gap);

    let fs = cardW * 0.026;
    let lh = fs * 1.25;
    let rowGap = fs * 0.85;
    let allLines = wrapAt(fs);
    while (fs > MIN_FS && stackHeight(allLines, lh, rowGap) > listH) {
      fs *= 0.92;
      lh = fs * 1.25;
      rowGap = fs * 0.85;
      allLines = wrapAt(fs);
    }

    ctx.textAlign = 'left';
    ctx.font = `700 ${fs}px -apple-system,sans-serif`;

    let cursorY = listTop;
    board.questions.forEach((q, i) => {
      const lines = allLines[i];
      const blockH = lines.length * lh;
      const blockCy = cursorY + blockH / 2;
      const startY = cursorY + fs * 0.8;

      // Currently-being-discussed item gets a highlight color instead of
      // plain black, so it reads at a glance which point is live right now.
      ctx.fillStyle = i === activeIndex ? '#2563eb' : '#111111';
      lines.forEach((line, li) => ctx.fillText(line, textX, startY + li * lh));

      if (i < doneCount) {
        // Red strike-through across the whole wrapped block, like it's
        // been crossed off with a marker.
        const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = fs * 0.09;
        ctx.beginPath();
        ctx.moveTo(textX - fs * 0.2, blockCy);
        ctx.lineTo(textX + widest + fs * 0.2, blockCy);
        ctx.stroke();
      }

      cursorY += blockH + rowGap;
    });

    ctx.restore();
  }

  private drawPhone(
    x: number, y: number, w: number, h: number,
    phone: PhoneConfig, isActive: boolean, hasActive: boolean,
    text?: string, turnProgress = 0, activeTurn: ScriptTurn | null = null,
    pulseScale: number = 1, forceZeroRotation: boolean = false
  ) {
    const { ctx } = this;
    const r = w * 0.12;
    const cx = x + w / 2, cy = y + h / 2;

    // VU meter renders OUTSIDE the rotated/scaled phone transform so it stays
    // anchored to a clean vertical orientation.
    if (this.state.vuMeter && isActive) {
      this.drawVuMeter(x, y, w, h);
    }

    ctx.save();
    // Z-pulse: scale around the phone centre. Combines with rotation cleanly.
    if (pulseScale !== 1) {
      ctx.translate(cx, cy);
      ctx.scale(pulseScale, pulseScale);
      ctx.translate(-cx, -cy);
    }
    const effRotation = forceZeroRotation ? 0 : (phone.rotation ?? 0);
    if (effRotation) {
      ctx.translate(cx, cy);
      ctx.rotate((effRotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    // ── Outer glow when SPEAKING — driven by real audio level + subtle idle wobble
    if (isActive) {
      const audioBoost = this.audioLevel * 0.45;
      const pulse = 0.5 + Math.sin(this.currentTime / 350) * 0.12 + audioBoost;
      ctx.shadowColor = phone.color;
      ctx.shadowBlur = w * (0.14 + audioBoost * 0.22);
      ctx.strokeStyle = phone.color;
      ctx.lineWidth = w * (0.024 + audioBoost * 0.012);
      ctx.globalAlpha = Math.min(1, pulse);
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

  // ── VU meter ─────────────────────────────────────────────────────────────
  // Vertical segmented bar to the LEFT of the active phone, driven by
  // this.audioLevel (0..1). LED-style — green at the bottom, amber midway,
  // red at peak — with a small "decay" highlight at the current level.
  private drawVuMeter(phoneX: number, phoneY: number, phoneW: number, phoneH: number) {
    const { ctx } = this;
    const segments = 14;
    const meterW = phoneW * 0.18;
    const gap    = phoneW * 0.025;
    const x      = phoneX - meterW - gap * 2;
    const y      = phoneY + phoneH * 0.05;
    const totalH = phoneH * 0.9;
    const segH   = (totalH - (segments - 1) * 2) / segments;

    const lvl = Math.max(0, Math.min(1, this.audioLevel));
    const filled = Math.round(lvl * segments);

    ctx.save();
    // Faint backing strip
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 3, meterW + 6, totalH + 6, 6);
    ctx.fill();

    for (let i = 0; i < segments; i++) {
      const segY = y + totalH - (i + 1) * segH - i * 2;
      const isOn = i < filled;
      let col: string;
      if (i >= segments - 2)       col = isOn ? '#ef4444' : 'rgba(239,68,68,0.18)';      // top 2 red
      else if (i >= segments - 5)  col = isOn ? '#f59e0b' : 'rgba(245,158,11,0.18)';     // next 3 amber
      else                         col = isOn ? '#22c55e' : 'rgba(34,197,94,0.18)';      // rest green
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(x, segY, meterW, segH, 2);
      ctx.fill();
    }

    // "Peak" highlight at the current top filled segment
    if (filled > 0) {
      const i = filled - 1;
      const segY = y + totalH - (i + 1) * segH - i * 2;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.roundRect(x, segY, meterW, Math.max(2, segH * 0.25), 2);
      ctx.fill();
    }
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

    // ── Speaker background image — contain-fit so square/portrait headshots
    // show fully (not over-cropped), with a light bottom scrim for UI text.
    if (phone.backgroundImage) {
      let img = this.speakerImageCache.get(phone.backgroundImage);
      if (!img) {
        img = new Image();
        img.src = phone.backgroundImage;
        img.onload = () => { if (!this.playing) this.drawFrame(); };
        this.speakerImageCache.set(phone.backgroundImage, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
        ctx.fillStyle = phone.screenColor || '#0a0a0a';
        ctx.fillRect(sx, sy, sw, sh);

        const imgAspect = img.naturalWidth / img.naturalHeight;
        const scale = Math.min(sw / img.naturalWidth, sh / img.naturalHeight);
        let dW = img.naturalWidth * scale;
        let dH = img.naturalHeight * scale;
        // Portrait / square headshots sit slightly above centre (video-call framing)
        const isPortraitish = imgAspect <= 1.15;
        const offsetX = sx + (sw - dW) / 2;
        const offsetY = isPortraitish ? sy + sh * 0.06 : sy + (sh - dH) / 2;
        const imgCx = offsetX + dW / 2;
        const imgCy = offsetY + dH / 2;

        // Subtle audio-reactive zoom on the photo itself when speaking
        const photoPulse = isActive ? 1 + this.audioLevel * 0.05 : 1;
        if (photoPulse !== 1) {
          ctx.translate(imgCx, imgCy);
          ctx.scale(photoPulse, photoPulse);
          ctx.translate(-imgCx, -imgCy);
        }

        ctx.drawImage(img, offsetX, offsetY, dW, dH);

        // Bottom gradient only — keeps status text readable without washing out the face
        const scrim = ctx.createLinearGradient(0, sy + sh * 0.5, 0, sy + sh);
        scrim.addColorStop(0, 'rgba(0,0,0,0)');
        scrim.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = scrim;
        ctx.fillRect(sx, sy, sw, sh);
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

    // ── Animation styles — skipped entirely when a real speaker photo is
    // uploaded (phone.backgroundImage): a glowing orb/wave/particle overlay
    // centered right where the face is just reads as clutter on top of an
    // actual photo, so an uploaded image shows clean instead. ──────────────

    if (phone.backgroundImage) {
      // no animated overlay — the photo speaks for itself
    } else if (phone.style === 'orb') {
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

    } else if (phone.style === 'particles') {
      // ── Particles: floating dots swarming around a center, drift outward on speech ──
      const t = this.currentTime / 1000;
      const N = 28;
      const baseR = sw * 0.16;
      const reach = sw * 0.32;

      ctx.save();
      ctx.shadowColor = phone.color;
      for (let i = 0; i < N; i++) {
        // Deterministic per-particle "seed" — no rand to keep stable
        const seed = i * 137.508;
        const angle = (seed + t * (0.4 + (i % 3) * 0.25)) % (Math.PI * 2);
        const orbitJitter = Math.sin(t * 1.7 + i) * 0.2;
        const r = baseR + (reach - baseR) * (isActive ? volt : 0.15) * (0.55 + orbitJitter);
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r * 0.78;
        const pr = sw * 0.013 * (0.7 + Math.sin(t * 2 + i) * 0.3) * (isActive ? 0.7 + volt * 0.6 : 0.4);
        ctx.shadowBlur = pr * 4 * (isActive ? volt : 0.2);
        ctx.globalAlpha = isActive ? 0.55 + 0.35 * volt : 0.22;
        ctx.fillStyle = phone.color;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
      }
      // Soft center core
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR);
      cg.addColorStop(0, phone.color + 'cc');
      cg.addColorStop(1, 'transparent');
      ctx.shadowBlur = 0;
      ctx.globalAlpha = isActive ? 0.7 : 0.35;
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cx, cy, baseR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

    } else if (phone.style === 'liquid') {
      // ── Liquid: morphing blob with bezier-distorted radius ──
      const t = this.currentTime / 800;
      const baseR = sw * 0.22 + (isActive ? volt * sw * 0.08 : 0);
      const points = 14;
      const wobble = (isActive ? 0.18 + volt * 0.32 : 0.08);

      ctx.save();
      ctx.shadowColor = phone.color;
      ctx.shadowBlur = baseR * (isActive ? 0.55 * volt : 0.12);

      // Build a smooth closed blob path
      ctx.beginPath();
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < points; i++) {
        const a = (i / points) * Math.PI * 2;
        const noise =
          Math.sin(a * 3 + t * 1.3) * wobble +
          Math.sin(a * 5 + t * 0.7) * wobble * 0.55 +
          Math.cos(a * 2 + t * 2.1) * wobble * 0.45;
        const r = baseR * (1 + noise);
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
      // Catmull-Rom-ish smoothing via quadratic curves to midpoints
      for (let i = 0; i < points; i++) {
        const cur = pts[i];
        const nxt = pts[(i + 1) % points];
        const mx = (cur.x + nxt.x) / 2;
        const my = (cur.y + nxt.y) / 2;
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.quadraticCurveTo(cur.x, cur.y, mx, my);
      }
      ctx.closePath();

      const lg = ctx.createRadialGradient(cx - baseR * 0.3, cy - baseR * 0.3, 0, cx, cy, baseR * 1.1);
      lg.addColorStop(0, '#ffffff');
      lg.addColorStop(0.22, phone.color);
      lg.addColorStop(0.85, phone.color + 'cc');
      lg.addColorStop(1, phone.color + '20');
      ctx.fillStyle = lg;
      ctx.globalAlpha = isActive ? 1 : 0.55;
      ctx.fill();
      ctx.restore();

    } else if (phone.style === 'spectrum') {
      // ── Spectrum: tall analyzer-style bars across full width ──
      const t = this.currentTime / 110;
      const bars = 22;
      const totalW = sw * 0.82;
      const startBX = cx - totalW / 2;
      const bw = totalW / bars * 0.55;
      const slot = totalW / bars;
      const maxH = sh * 0.34;

      ctx.save();
      ctx.shadowColor = phone.color;
      for (let i = 0; i < bars; i++) {
        const bx = startBX + i * slot + slot / 2;
        // Pink-noise-ish: lower freq bars more energetic
        const k = 1 - Math.abs(i - bars / 2) / (bars / 2) * 0.45;
        const wave = isActive
          ? (0.45 + Math.sin(t + i * 0.42) * 0.3 + Math.sin(t * 1.8 + i * 0.9) * 0.25) * k
          : 0.08 + Math.sin(t * 0.5 + i * 0.3) * 0.04;
        const h = Math.max(bw * 0.4, maxH * Math.max(0, wave) * (isActive ? (0.4 + volt * 0.9) : 1));
        ctx.shadowBlur = isActive ? bw * 2.4 * volt : 0;

        const bg = ctx.createLinearGradient(bx, cy - h / 2, bx, cy + h / 2);
        bg.addColorStop(0,   phone.color);
        bg.addColorStop(0.5, '#ffffff');
        bg.addColorStop(1,   phone.color);
        ctx.fillStyle = bg;
        ctx.globalAlpha = isActive ? 0.85 : 0.28;
        ctx.beginPath();
        ctx.roundRect(bx - bw / 2, cy - h / 2, bw, h, bw * 0.4);
        ctx.fill();
      }
      ctx.restore();

    } else if (phone.style === 'pulse-grid') {
      // ── Pulse grid: dot lattice that ripples outward from center ──
      const t = this.currentTime / 700;
      const cols = 7, rows = 7;
      const spanW = sw * 0.78;
      const spanH = sh * 0.5;
      const dotMax = sw * 0.022;

      ctx.save();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dx = cx - spanW / 2 + (c + 0.5) * (spanW / cols);
          const dy = cy - spanH / 2 + (r + 0.5) * (spanH / rows);
          const dist = Math.hypot(dx - cx, dy - cy) / (sw * 0.4);
          // Outward wave
          const wave = isActive
            ? Math.sin(t * 1.5 - dist * 3.2) * 0.5 + 0.5
            : (1 - dist) * 0.25;
          const intensity = Math.max(0, wave) * (isActive ? (0.45 + volt * 0.8) : 0.35);
          const dr = dotMax * (0.35 + intensity * 0.9);
          ctx.fillStyle = phone.color;
          ctx.shadowColor = phone.color;
          ctx.shadowBlur = isActive ? dr * 3 * intensity : 0;
          ctx.globalAlpha = isActive ? 0.35 + intensity * 0.6 : 0.16;
          ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();

    } else if (phone.style === 'siri-blob') {
      // ── Siri-style: layered iridescent blobs blended with screen mode ──
      const t = this.currentTime / 1100;
      const R = sw * (0.26 + (isActive ? volt * 0.14 : 0.03));
      const layers = 5;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // Parse phone.color → mix with white + accent for iridescent feel
      const hexToRgb = (hex: string) => {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex.replace('#', ''));
        if (!m) return { r: 200, g: 200, b: 255 };
        const n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
      };
      const { r: br, g: bg, b: bb } = hexToRgb(phone.color);
      // 3 accent hues that orbit the primary
      const accents = [
        `rgba(${br},${bg},${bb},1)`,
        `rgba(${Math.min(255, br + 60)},${Math.min(255, bg + 30)},255,1)`,
        `rgba(255,${Math.min(255, bg + 90)},${Math.min(255, bb + 60)},1)`,
      ];

      for (let i = 0; i < layers; i++) {
        const ang = t * (0.8 + i * 0.2) + i * Math.PI * 0.4;
        const off = R * (0.25 + Math.sin(t * 1.3 + i) * 0.12);
        const lx  = cx + Math.cos(ang) * off;
        const ly  = cy + Math.sin(ang) * off * 0.7;
        const lr  = R * (0.85 + Math.sin(t * 0.9 + i) * 0.18);
        const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
        grad.addColorStop(0, accents[i % accents.length]);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = isActive ? 0.55 + 0.35 * volt : 0.28;
        ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // Bright highlight on top
      const hg = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
      hg.addColorStop(0, 'rgba(255,255,255,0.55)');
      hg.addColorStop(1, 'transparent');
      ctx.fillStyle = hg;
      ctx.globalAlpha = isActive ? 1 : 0.5;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

    } else if (phone.style === 'galaxy') {
      // ── Galaxy: spiral of bright dots, rotating slowly ──
      const t = this.currentTime / 2200;
      const arms = 3;
      const perArm = 22;
      const reach = sw * (0.34 + (isActive ? volt * 0.08 : 0));

      ctx.save();
      ctx.shadowColor = phone.color;

      // Central glow
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sw * 0.18);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.4, phone.color);
      cg.addColorStop(1, 'transparent');
      ctx.globalAlpha = isActive ? 0.9 : 0.5;
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cx, cy, sw * 0.18, 0, Math.PI * 2); ctx.fill();

      // Spiral arms
      for (let a = 0; a < arms; a++) {
        const armOffset = (a / arms) * Math.PI * 2;
        for (let k = 0; k < perArm; k++) {
          const f = k / perArm;
          const r = reach * f;
          const angle = armOffset + f * 4.4 + t * (isActive ? 0.9 : 0.45);
          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r * 0.78;
          const pr = sw * (0.012 - f * 0.006) * (isActive ? 0.7 + volt * 0.5 : 0.5);
          if (pr <= 0) continue;
          ctx.fillStyle = phone.color;
          ctx.shadowBlur = pr * 4 * (isActive ? volt : 0.3);
          ctx.globalAlpha = (1 - f * 0.65) * (isActive ? 0.8 : 0.4);
          ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    // Reset
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // ── Subtitles (MobileTalk style) ──────────────────────────────────────
    const subCfg = this.state.subtitleConfig ?? { enabled: true, size: 1, background: 'dark', textColor: '#fff' };
    if (isActive && text && subCfg.enabled) {
      this.drawSyncedSubtitles(sx, sy, sw, sh, text, turnProgress, activeTurn, subCfg, 0.68);
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
