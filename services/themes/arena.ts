import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles } from './utils';

export const arenaTheme: Theme = {
  id: 'arena',
  name: 'Arena',
  description: 'Versus layout with central VS indicator and score cards.',
  properties: [
    // ── Colors ────────────────────────────────────────────────────
    { id: 'speakerColorA',      label: 'Speaker A Color',          type: 'color',   defaultValue: '#3b82f6',  group: 'Colors' },
    { id: 'speakerColorB',      label: 'Speaker B Color',          type: 'color',   defaultValue: '#ef4444',  group: 'Colors' },
    { id: 'timerColor',         label: 'Timer Color',              type: 'color',   defaultValue: '#eab308',  group: 'Colors' },
    { id: 'vsColor',            label: 'VS Badge Color',           type: 'color',   defaultValue: '#f97316',  group: 'Colors' },
    // ── Speaker ───────────────────────────────────────────────────
    { id: 'speakerShape',       label: 'Speaker Shape',            type: 'select',  defaultValue: 'rect',     group: 'Speaker',
      options: ['rect', 'circle', 'triangle'] },
    { id: 'focusActiveSpeaker', label: 'Focus Active Speaker',     type: 'boolean', defaultValue: false,      group: 'Speaker' },
    // ── Elements ──────────────────────────────────────────────────
    { id: 'showArenaScore',     label: 'Show Corner Scores',       type: 'boolean', defaultValue: false,      group: 'Elements' },
    { id: 'showTimerNames',     label: 'Speaker Names by Timer',   type: 'boolean', defaultValue: false,      group: 'Elements' },
    { id: 'showVsBadge',        label: 'Show VS Badge',            type: 'boolean', defaultValue: false,      group: 'Elements' },
    { id: 'showSegmentCount',   label: 'Show Segment Count Dots',  type: 'boolean', defaultValue: false,      group: 'Elements' },
    { id: 'showVuMeter',        label: 'Show VU Meter',            type: 'boolean', defaultValue: false,      group: 'Elements' },
    { id: 'detachVuMeter',      label: 'Detach VU to Side',        type: 'boolean', defaultValue: false,      group: 'Elements' },
    { id: 'vuDetachStyle',      label: 'Side VU Style',            type: 'select',  defaultValue: 'dots',     group: 'Elements',
      options: ['dots', 'bars', 'arc'] },
  ],
  draw: (context: DrawContext) => {
    const { ctx, time, audioLevel, script, currentSegmentIndex, config, assets, themeConfig } = context;
    const { width: canvasWidth, height: canvasHeight } = ctx.canvas;
    const currentSegment = script[currentSegmentIndex];
    if (!currentSegment) return;

    const isPlaying = true;
    const { speakerIds, speakerLabels, speakerPositions } = config;
    const colors = [
        themeConfig?.speakerColorA || '#3b82f6',
        themeConfig?.speakerColorB || '#ef4444',
        '#eab308',
        '#22c55e',
    ];

    const showSpeakers     = config.showSpeakers;
    const speakerShape: 'rect' | 'circle' | 'triangle' = themeConfig?.speakerShape || 'rect';
    const showArenaScore   = themeConfig?.showArenaScore ?? false;
    const showTimerNames   = themeConfig?.showTimerNames ?? false;
    const showVsBadge      = themeConfig?.showVsBadge ?? false;
    const showSegmentCount = themeConfig?.showSegmentCount ?? false;
    const detachVuMeter    = themeConfig?.detachVuMeter ?? false;
    const vuDetachStyle    = themeConfig?.vuDetachStyle || 'dots';
    // VU meter: arena theme has its own default (off); respects global toggle too
    // When detachVuMeter is true, we suppress the ring-on-speaker VU and instead draw on sides
    const vuEnabled        = config.showVuMeter && (themeConfig?.showVuMeter ?? false) && !detachVuMeter;
    const vuDetachEnabled  = config.showVuMeter && (themeConfig?.showVuMeter ?? false) && detachVuMeter;

    // Background
    drawBackground(ctx, assets, currentSegment, canvasWidth, canvasHeight, config.backgroundDim);

    // ── Timer ──────────────────────────────────────────────────────
    const topY = 50;
    if (config.showTimer) {
        const timerW = 100, timerH = 40;
        const timerX = canvasWidth / 2 - timerW / 2;
        const timerY = topY - timerH / 2;
        ctx.save();
        ctx.fillStyle = themeConfig?.timerColor || '#eab308';
        ctx.beginPath();
        ctx.roundRect(timerX, timerY, timerW, timerH, 8);
        ctx.fill();
        const segEnd = context.segmentOffsets[currentSegmentIndex + 1] || context.totalDuration;
        const timeLeft = Math.max(0, Math.ceil(segEnd - time));
        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        ctx.fillStyle = '#000';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${m}:${s}`, timerX + timerW / 2, topY);
        ctx.restore();
    }

    // ── Speaker names beside timer ─────────────────────────────────
    if (showTimerNames && speakerIds.length >= 2 && config.showTimer) {
        const timerW   = 100;
        const timerCY  = 50; // topY
        const GAP      = 18;
        const leftEdge = canvasWidth / 2 - timerW / 2 - GAP;
        const rightEdge = canvasWidth / 2 + timerW / 2 + GAP;

        speakerIds.slice(0, 2).forEach((id, index) => {
            const isLeft     = index === 0;
            const label      = speakerLabels[index] || id;
            const color      = colors[index];
            const isSpeaking = currentSegment.speaker === id;

            ctx.save();
            ctx.font        = `bold 16px sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign    = isLeft ? 'right' : 'left';
            ctx.fillStyle    = isSpeaking ? '#fff' : 'rgba(255,255,255,0.38)';
            ctx.shadowColor  = isSpeaking ? color : 'transparent';
            ctx.shadowBlur   = isSpeaking ? 14 : 0;
            ctx.fillText(label.toUpperCase(), isLeft ? leftEdge : rightEdge, timerCY);
            ctx.restore();
        });
    }

    // ── Corner Scores (animated) ───────────────────────────────────
    if (showArenaScore && context.scores && speakerIds.length >= 2) {
        const scoreA     = context.scores.scoreA || '0';
        const scoreB     = context.scores.scoreB || '0';
        const scoreVals  = [scoreA, scoreB];
        const labelVals  = [speakerLabels[0] || speakerIds[0], speakerLabels[1] || speakerIds[1]];
        const activeSide = currentSegment.speaker === speakerIds[0] ? 0
                         : currentSegment.speaker === speakerIds[1] ? 1 : -1;

        const BOX_W = 170, BOX_H = 80;
        const MARGIN = 20;
        const RADIUS = 16;

        [0, 1].forEach(idx => {
            const isLeft   = idx === 0;
            const color    = colors[idx];
            const label    = labelVals[idx];
            const score    = scoreVals[idx];
            const isActive = activeSide === idx;

            // Animation: active side pulses with audio
            const pulse    = isActive ? audioLevel * 0.06 : 0;
            const scale    = 1 + pulse;
            const glowR    = isActive ? 18 + audioLevel * 28 : 8;

            const bx = isLeft ? MARGIN : canvasWidth - MARGIN - BOX_W;
            const by = MARGIN;
            const cx = bx + BOX_W / 2;
            const cy = by + BOX_H / 2;

            ctx.save();
            // Scale from center of box (active animation)
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.translate(-cx, -cy);

            // ── Outer glow ring (active side) ──────────────────
            if (isActive) {
                ctx.save();
                ctx.shadowColor = color;
                ctx.shadowBlur  = glowR;
                ctx.strokeStyle = color;
                ctx.lineWidth   = 2;
                ctx.globalAlpha = 0.35 + audioLevel * 0.45;
                ctx.beginPath();
                ctx.roundRect(bx - 3, by - 3, BOX_W + 6, BOX_H + 6, RADIUS + 3);
                ctx.stroke();
                ctx.restore();
            }

            // ── Dark glass background ───────────────────────────
            ctx.save();
            ctx.fillStyle = 'rgba(6, 8, 18, 0.88)';
            ctx.beginPath();
            ctx.roundRect(bx, by, BOX_W, BOX_H, RADIUS);
            ctx.fill();
            ctx.restore();

            // ── Colored top accent bar ──────────────────────────
            ctx.save();
            const grad = ctx.createLinearGradient(bx, by, bx + BOX_W, by);
            grad.addColorStop(0, color);
            grad.addColorStop(1, isLeft ? 'transparent' : color);
            const grad2 = ctx.createLinearGradient(bx, by, bx + BOX_W, by);
            grad2.addColorStop(0, isLeft ? color : 'transparent');
            grad2.addColorStop(1, isLeft ? 'transparent' : color);
            ctx.fillStyle = isLeft ? grad : grad2;
            ctx.shadowColor = color;
            ctx.shadowBlur  = isActive ? 12 + audioLevel * 18 : 4;
            ctx.beginPath();
            ctx.roundRect(bx, by, BOX_W, 4, [RADIUS, RADIUS, 0, 0]);
            ctx.fill();
            ctx.restore();

            // ── Subtle side accent stripe ───────────────────────
            ctx.save();
            const stripeX = isLeft ? bx : bx + BOX_W - 4;
            const stripeGrad = ctx.createLinearGradient(0, by, 0, by + BOX_H);
            stripeGrad.addColorStop(0, color);
            stripeGrad.addColorStop(0.5, `${color}88`);
            stripeGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = stripeGrad;
            ctx.globalAlpha = isActive ? 0.7 + audioLevel * 0.3 : 0.35;
            ctx.beginPath();
            ctx.roundRect(stripeX, by + 4, 4, BOX_H - 4, isLeft ? [0, 0, 0, RADIUS] : [0, 0, RADIUS, 0]);
            ctx.fill();
            ctx.restore();

            // ── Speaker label (small, top area) ────────────────
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font      = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(label.toUpperCase(), bx + BOX_W / 2, by + 12);
            ctx.restore();

            // ── Score number (big, center) ──────────────────────
            ctx.save();
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold 36px sans-serif`;
            if (isActive) {
                ctx.shadowColor = color;
                ctx.shadowBlur  = 14 + audioLevel * 20;
                ctx.fillStyle   = '#fff';
            } else {
                ctx.fillStyle   = 'rgba(255,255,255,0.70)';
            }
            ctx.fillText(score, bx + BOX_W / 2, by + BOX_H / 2 + 6);
            ctx.restore();

            ctx.restore(); // end scale transform
        });
    }

    // ── VS badge ───────────────────────────────────────────────────
    if (showVsBadge && speakerIds.length === 2) {
        const cx = canvasWidth / 2, cy = canvasHeight / 2 + 50;
        const vsRadius = 45, vsColor = themeConfig?.vsColor || '#f97316';
        ctx.save();
        const vsGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, vsRadius * 2);
        vsGlow.addColorStop(0, vsColor);
        vsGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = vsGlow;
        ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.arc(cx, cy, vsRadius * 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = vsColor;
        ctx.beginPath(); ctx.arc(cx, cy, vsRadius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('VS', cx, cy);
        ctx.restore();
    }

    // ── Helper: clip paths ─────────────────────────────────────────
    const clipRect = (cx: number, cy: number, w: number, h: number, r = 30) => {
        ctx.beginPath();
        ctx.roundRect(cx - w / 2, cy - h / 2, w, h, r);
    };
    const clipCircle = (cx: number, cy: number, r: number) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
    };
    const clipTriangle = (cx: number, cy: number, R: number) => {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const angle = (Math.PI / 2) + (i * 2 * Math.PI / 3) * -1 + Math.PI;
            const px = cx + R * Math.cos(angle - Math.PI / 2);
            const py = cy + R * Math.sin(angle - Math.PI / 2);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
    };

    // ── Speaker draw ───────────────────────────────────────────────
    const drawSpeaker = (label: string, xPct: number, yPct: number, isActive: boolean, color: string, image: HTMLImageElement | null) => {
        const cx = xPct * canvasWidth;
        const cy = yPct * canvasHeight + 50;
        const pulse = isActive ? (1 + audioLevel * 0.07) : 1;
        const sc = config.speakerScale * pulse;

        if (speakerShape === 'circle') {
            const R = 120 * sc;
            ctx.save(); clipCircle(cx, cy, R); ctx.clip();
            if (image) {
                const s = Math.max((R*2)/image.width, (R*2)/image.height);
                ctx.drawImage(image, cx - image.width*s/2, cy - image.height*s/2, image.width*s, image.height*s);
            } else {
                ctx.fillStyle = '#1e1e1e'; ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = `bold ${R*0.55}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label.charAt(0).toUpperCase(), cx, cy);
            }
            ctx.restore();
            ctx.save(); clipCircle(cx, cy, R);
            if (isActive) { ctx.shadowColor = color; ctx.shadowBlur = 18 + audioLevel*28; }
            ctx.strokeStyle = isActive ? color : '#333'; ctx.lineWidth = isActive ? 4 : 2;
            ctx.stroke(); ctx.shadowBlur = 0; ctx.restore();

            if (vuEnabled && isActive) {
                const ringCount = 3;
                for (let r = 0; r < ringCount; r++) {
                    const expand = R + 14*(r+1) + audioLevel*22*(r+1);
                    const alpha = Math.max(0, 0.55 - r*0.18) * audioLevel;
                    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, 3-r);
                    ctx.globalAlpha = alpha; ctx.shadowColor = color; ctx.shadowBlur = 12;
                    clipCircle(cx, cy, expand); ctx.stroke(); ctx.restore();
                }
            }

        } else if (speakerShape === 'triangle') {
            const R = 140 * sc;
            ctx.save(); clipTriangle(cx, cy, R); ctx.clip();
            if (image) {
                const size = R * 1.8;
                const s = Math.max(size/image.width, size/image.height);
                ctx.drawImage(image, cx - image.width*s/2, cy - image.height*s/2, image.width*s, image.height*s);
            } else {
                ctx.fillStyle = '#1e1e1e'; ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = `bold ${R*0.42}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label.charAt(0).toUpperCase(), cx, cy + R*0.1);
            }
            ctx.restore();
            ctx.save(); clipTriangle(cx, cy, R);
            if (isActive) { ctx.shadowColor = color; ctx.shadowBlur = 18 + audioLevel*28; }
            ctx.strokeStyle = isActive ? color : '#333'; ctx.lineWidth = isActive ? 4 : 2;
            ctx.stroke(); ctx.shadowBlur = 0; ctx.restore();

            if (vuEnabled && isActive) {
                for (let r = 0; r < 3; r++) {
                    const expandR = R + 12*(r+1) + audioLevel*20*(r+1);
                    const alpha = Math.max(0, 0.6 - r*0.2) * audioLevel;
                    ctx.save(); clipTriangle(cx, cy, expandR);
                    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, 3-r);
                    ctx.globalAlpha = alpha; ctx.shadowColor = color; ctx.shadowBlur = 14;
                    ctx.stroke(); ctx.restore();
                }
            }

        } else {
            // ── RECT (default) ─────────────────────────────────────
            const w = 240 * sc, h = 320 * sc;
            const rx = cx - w/2, ry = cy - h/2;
            ctx.save(); clipRect(cx, cy, w, h, 30); ctx.clip();
            if (image) {
                const s = Math.max(w/image.width, h/image.height);
                ctx.drawImage(image, rx+w/2 - image.width*s/2, ry+h/2 - image.height*s/2, image.width*s, image.height*s);
            } else {
                ctx.fillStyle = '#1e1e1e'; ctx.fill();
                const avatarR = 60 * sc;
                ctx.beginPath(); ctx.arc(cx, ry+h/2-40, avatarR, 0, Math.PI*2);
                ctx.fillStyle = '#27272a'; ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = `bold ${40*pulse}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label.charAt(0).toUpperCase(), cx, ry+h/2-40);
            }
            ctx.restore();
            ctx.save(); clipRect(cx, cy, w, h, 30);
            if (isActive) { ctx.shadowColor = color; ctx.shadowBlur = 20 + audioLevel*30; }
            ctx.strokeStyle = isActive ? color : '#333'; ctx.lineWidth = isActive ? 4 : 2;
            ctx.stroke(); ctx.shadowBlur = 0; ctx.restore();

            if (vuEnabled && isActive) {
                const barX = rx + w + 10;
                if (config.vuMeterStyle === 'dots') {
                    const DOTS = 12;
                    const dotR = Math.max(3, Math.min(6, h/(DOTS*3)));
                    const spacing = (h - DOTS*dotR*2) / (DOTS-1);
                    const dotCX = barX + dotR + 1;
                    const activeDots = Math.round(Math.max(0.18, audioLevel) * DOTS);
                    for (let d = 0; d < DOTS; d++) {
                        const dotY = ry + h - d*(dotR*2+spacing) - dotR;
                        const isLit = d < activeDots;
                        const pct = d / (DOTS-1);
                        const dotColor = !isLit ? 'rgba(255,255,255,0.10)' : pct < 0.5 ? color : pct < 0.8 ? '#facc15' : '#ef4444';
                        ctx.beginPath(); ctx.arc(dotCX, dotY, dotR, 0, Math.PI*2);
                        ctx.fillStyle = dotColor;
                        ctx.shadowColor = isLit ? dotColor : 'transparent';
                        ctx.shadowBlur = isLit ? 5 + audioLevel*8 : 0;
                        ctx.fill();
                    }
                    ctx.shadowBlur = 0;
                } else {
                    const barW = 10;
                    ctx.fillStyle = 'rgba(255,255,255,0.08)';
                    ctx.fillRect(barX, ry, barW, h);
                    const fillH = h * Math.min(1, audioLevel);
                    const fillY = ry + h - fillH;
                    ctx.fillStyle = color;
                    ctx.shadowColor = color; ctx.shadowBlur = 8;
                    ctx.fillRect(barX, fillY, barW, fillH);
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(barX-1, fillY-2, barW+2, 3);
                    ctx.shadowBlur = 0;
                }
            }
        }
    };

    // ── Render all speakers ────────────────────────────────────────
    if (showSpeakers) {
        const focusMode = themeConfig?.focusActiveSpeaker === true;
        const isNarratorTurn = currentSegment.speaker === 'Narrator' || currentSegment.speaker === 'narrator';
        speakerIds.forEach((id, index) => {
            const isSpeaking = isPlaying && currentSegment.speaker === id;
            if (focusMode) { if (isNarratorTurn || !isSpeaking) return; }
            const label = speakerLabels[index] || id;
            const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
            const color = colors[index % colors.length];
            drawSpeaker(label, pos.x, pos.y, isSpeaking, color,
                config.showSpeakerImages[index] !== false ? assets.speakerImages[index] : null);
        });
    }

    // ── Segment Count Dots — side-centered, no names ──────────────
    if (showSegmentCount && speakerIds.length >= 2) {
        const speakerSegCounts = speakerIds.map(id =>
            script.slice(0, currentSegmentIndex + 1).filter(s => s.speaker === id).length
        );
        const speakerSegTotals = speakerIds.map(id =>
            Math.max(1, script.filter(s => s.speaker === id).length)
        );

        const DOT_R    = 6;
        const DOT_GAP  = 7;
        const SIDE_X_L = 14 + DOT_R;
        const SIDE_X_R = canvasWidth - 14 - DOT_R;

        const drawSideDots = (isLeft: boolean, done: number, total: number, color: string) => {
            const cx  = isLeft ? SIDE_X_L : SIDE_X_R;
            // Vertically center the dot column in the canvas
            const colH = total * (DOT_R * 2) + (total - 1) * DOT_GAP;
            const startY = (canvasHeight - colH) / 2;

            for (let i = 0; i < total; i++) {
                const dotY = startY + i * (DOT_R * 2 + DOT_GAP) + DOT_R;
                const isDone = i < done;
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, dotY, DOT_R, 0, Math.PI * 2);
                ctx.fillStyle = isDone ? color : 'rgba(255,255,255,0.10)';
                ctx.shadowColor = isDone ? color : 'transparent';
                ctx.shadowBlur = isDone ? 12 : 0;
                ctx.fill();
                ctx.restore();
            }
        };

        drawSideDots(true,  speakerSegCounts[0], speakerSegTotals[0], colors[0]);
        drawSideDots(false, speakerSegCounts[1], speakerSegTotals[1], colors[1]);
    }

    // ── Detached VU Meter — side panel, active speaker's side ─────
    if (vuDetachEnabled && speakerIds.length >= 2) {
        const activeSpeakerId = currentSegment.speaker;
        const activeIdx = speakerIds.indexOf(activeSpeakerId);
        if (activeIdx === 0 || activeIdx === 1) {
            const isLeft  = activeIdx === 0;
            const color   = colors[activeIdx];
            const DOT_R   = 6;
            const DOT_GAP = 7;
            const VU_SLOTS = 10;

            // Base edge x (same column as segment count dots)
            const baseX   = isLeft ? 14 + DOT_R : canvasWidth - 14 - DOT_R;
            // Offset to sit beside segment count dots if both are visible
            const segOff  = showSegmentCount ? DOT_R * 2 + 5 : 0;
            const vuCX    = isLeft ? baseX + segOff : baseX - segOff;

            // Vertical centering
            const colH    = VU_SLOTS * (DOT_R * 2) + (VU_SLOTS - 1) * DOT_GAP;
            const startY  = (canvasHeight - colH) / 2;
            const litCount = Math.max(1, Math.round(audioLevel * VU_SLOTS));

            // Helper: color ramp per slot (0=bottom)
            const slotColor = (slotIdx: number, lit: boolean) => {
                if (!lit) return 'rgba(255,255,255,0.08)';
                const pct = slotIdx / (VU_SLOTS - 1);
                return pct < 0.55 ? color : pct < 0.80 ? '#facc15' : '#ef4444';
            };

            if (vuDetachStyle === 'dots') {
                // ── Round dots ────────────────────────────────────
                for (let i = 0; i < VU_SLOTS; i++) {
                    const slotIdx = VU_SLOTS - 1 - i;  // 0 = bottom
                    const isLit   = slotIdx < litCount;
                    const dotY    = startY + i * (DOT_R * 2 + DOT_GAP) + DOT_R;
                    const dc      = slotColor(slotIdx, isLit);
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(vuCX, dotY, DOT_R, 0, Math.PI * 2);
                    ctx.fillStyle = dc;
                    if (isLit) { ctx.shadowColor = dc; ctx.shadowBlur = 8 + audioLevel * 12; }
                    ctx.fill();
                    ctx.restore();
                }

            } else if (vuDetachStyle === 'bars') {
                // ── Thin rectangle bars ───────────────────────────
                const BAR_W = 14, BAR_H_UNIT = DOT_R * 2;
                for (let i = 0; i < VU_SLOTS; i++) {
                    const slotIdx = VU_SLOTS - 1 - i;
                    const isLit   = slotIdx < litCount;
                    const barY    = startY + i * (BAR_H_UNIT + DOT_GAP);
                    const barX    = isLeft ? vuCX - BAR_W / 2 : vuCX - BAR_W / 2;
                    const dc      = slotColor(slotIdx, isLit);
                    ctx.save();
                    ctx.fillStyle = dc;
                    if (isLit) { ctx.shadowColor = dc; ctx.shadowBlur = 6 + audioLevel * 10; }
                    ctx.beginPath();
                    ctx.roundRect(barX, barY, BAR_W, BAR_H_UNIT, 3);
                    ctx.fill();
                    ctx.restore();
                }

            } else {
                // ── Arc (curved meter) ────────────────────────────
                // Draw a partial arc on the near edge of the canvas
                const arcCX  = isLeft ? 0 : canvasWidth;
                const arcCY  = canvasHeight / 2;
                const R_NEAR = 60 + segOff;
                const R_FAR  = R_NEAR + 26;
                const SEGS   = 16;
                const SWEEP  = Math.PI * 0.9; // total arc sweep (radians)
                const startA = -SWEEP / 2 - Math.PI / 2;
                const litSegs = Math.max(1, Math.round(audioLevel * SEGS));

                for (let s = 0; s < SEGS; s++) {
                    const a0   = startA + (s / SEGS) * SWEEP;
                    const a1   = startA + ((s + 1) / SEGS) * SWEEP - 0.04;
                    const isLit = s < litSegs;
                    const pct  = s / (SEGS - 1);
                    const dc   = !isLit ? 'rgba(255,255,255,0.07)'
                                 : pct < 0.55 ? color
                                 : pct < 0.80 ? '#facc15' : '#ef4444';
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(arcCX, arcCY, R_NEAR, a0, a1);
                    ctx.arc(arcCX, arcCY, R_FAR,  a1, a0, true);
                    ctx.closePath();
                    ctx.fillStyle = dc;
                    if (isLit) { ctx.shadowColor = dc; ctx.shadowBlur = 8 + audioLevel * 14; }
                    ctx.fill();
                    ctx.restore();
                }
            }
        }
    }

    // Subtitles
    drawSubtitles(ctx, context);
  }
};
