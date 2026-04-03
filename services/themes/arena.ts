import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles } from './utils';

export const arenaTheme: Theme = {
  id: 'arena',
  name: 'Arena',
  description: 'Versus layout with central VS indicator and score cards.',
  properties: [
    { id: 'timerColor',         label: 'Timer Color',       type: 'color',   defaultValue: '#eab308' },
    { id: 'vsColor',            label: 'VS Color',          type: 'color',   defaultValue: '#f97316' },
    { id: 'speakerColorA',      label: 'Speaker A Color',   type: 'color',   defaultValue: '#3b82f6' },
    { id: 'speakerColorB',      label: 'Speaker B Color',   type: 'color',   defaultValue: '#ef4444' },
    { id: 'focusActiveSpeaker', label: '🎙 Sirf Bolne Wala Dikhao (Narrator pe dono hide)', type: 'boolean', defaultValue: false },
    { id: 'speakerShape',       label: 'Speaker Image Shape', type: 'select', defaultValue: 'rect',
      options: ['rect', 'circle', 'triangle'] },
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

    const showSpeakers = config.showSpeakers;
    const speakerShape: 'rect' | 'circle' | 'triangle' = themeConfig?.speakerShape || 'rect';

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

    // ── VS badge ───────────────────────────────────────────────────
    if (speakerIds.length === 2) {
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
            ctx.save();
            clipCircle(cx, cy, R);
            ctx.clip();
            if (image) {
                const s = Math.max((R * 2) / image.width, (R * 2) / image.height);
                ctx.drawImage(image, cx - image.width * s / 2, cy - image.height * s / 2, image.width * s, image.height * s);
            } else {
                ctx.fillStyle = '#1e1e1e';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(cx, cy, R * 0.45, 0, Math.PI * 2);
                ctx.fillStyle = '#27272a';
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${R * 0.55}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label.charAt(0).toUpperCase(), cx, cy);
            }
            ctx.restore();
            ctx.save();
            clipCircle(cx, cy, R);
            if (isActive) { ctx.shadowColor = color; ctx.shadowBlur = 18 + audioLevel * 28; }
            ctx.strokeStyle = isActive ? color : '#333';
            ctx.lineWidth = isActive ? 4 : 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.restore();
            if (config.showVuMeter && isActive) {
                const ringCount = 3;
                for (let r = 0; r < ringCount; r++) {
                    const expand = R + 14 * (r + 1) + audioLevel * 22 * (r + 1);
                    const alpha = Math.max(0, 0.55 - r * 0.18) * audioLevel;
                    ctx.save();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = Math.max(1, 3 - r);
                    ctx.globalAlpha = alpha;
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 12;
                    clipCircle(cx, cy, expand);
                    ctx.stroke();
                    ctx.restore();
                }
            }

        } else if (speakerShape === 'triangle') {
            const R = 140 * sc;
            ctx.save();
            clipTriangle(cx, cy, R);
            ctx.clip();
            if (image) {
                const size = R * 1.8;
                const s = Math.max(size / image.width, size / image.height);
                ctx.drawImage(image, cx - image.width * s / 2, cy - image.height * s / 2, image.width * s, image.height * s);
            } else {
                ctx.fillStyle = '#1e1e1e';
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${R * 0.42}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label.charAt(0).toUpperCase(), cx, cy + R * 0.1);
            }
            ctx.restore();
            ctx.save();
            clipTriangle(cx, cy, R);
            if (isActive) { ctx.shadowColor = color; ctx.shadowBlur = 18 + audioLevel * 28; }
            ctx.strokeStyle = isActive ? color : '#333';
            ctx.lineWidth = isActive ? 4 : 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.restore();
            if (config.showVuMeter && isActive) {
                for (let r = 0; r < 3; r++) {
                    const expandR = R + 12 * (r + 1) + audioLevel * 20 * (r + 1);
                    const alpha = Math.max(0, 0.6 - r * 0.2) * audioLevel;
                    ctx.save();
                    clipTriangle(cx, cy, expandR);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = Math.max(1, 3 - r);
                    ctx.globalAlpha = alpha;
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 14;
                    ctx.stroke();
                    ctx.restore();
                }
            }

        } else {
            const w = 240 * sc, h = 320 * sc;
            const rx = cx - w / 2, ry = cy - h / 2;
            ctx.save();
            clipRect(cx, cy, w, h, 30);
            ctx.clip();
            if (image) {
                const s = Math.max(w / image.width, h / image.height);
                ctx.drawImage(image, rx + w / 2 - image.width * s / 2, ry + h / 2 - image.height * s / 2, image.width * s, image.height * s);
            } else {
                ctx.fillStyle = '#1e1e1e';
                ctx.fill();
                const avatarR = 60 * sc;
                ctx.beginPath();
                ctx.arc(cx, ry + h / 2 - 40, avatarR, 0, Math.PI * 2);
                ctx.fillStyle = '#27272a'; ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${40 * pulse}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label.charAt(0).toUpperCase(), cx, ry + h / 2 - 40);
            }
            ctx.restore();
            ctx.save();
            clipRect(cx, cy, w, h, 30);
            if (isActive) { ctx.shadowColor = color; ctx.shadowBlur = 20 + audioLevel * 30; }
            ctx.strokeStyle = isActive ? color : '#333';
            ctx.lineWidth = isActive ? 4 : 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.restore();
            if (config.showVuMeter && isActive) {
                const barX = rx + w + 10;
                if (config.vuMeterStyle === 'dots') {
                    const DOTS = 12;
                    const dotR = Math.max(3, Math.min(6, h / (DOTS * 3)));
                    const spacing = (h - DOTS * dotR * 2) / (DOTS - 1);
                    const dotCX = barX + dotR + 1;
                    const activeDots = Math.round(Math.max(0.18, audioLevel) * DOTS);
                    for (let d = 0; d < DOTS; d++) {
                        const dotY = ry + h - d * (dotR * 2 + spacing) - dotR;
                        const isLit = d < activeDots;
                        const pct = d / (DOTS - 1);
                        const dotColor = !isLit ? 'rgba(255,255,255,0.10)' : pct < 0.5 ? color : pct < 0.8 ? '#facc15' : '#ef4444';
                        ctx.beginPath();
                        ctx.arc(dotCX, dotY, dotR, 0, Math.PI * 2);
                        ctx.fillStyle = dotColor;
                        ctx.shadowColor = isLit ? dotColor : 'transparent';
                        ctx.shadowBlur = isLit ? 5 + audioLevel * 8 : 0;
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
                    ctx.fillRect(barX - 1, fillY - 2, barW + 2, 3);
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
            if (focusMode) {
                if (isNarratorTurn) return;
                if (!isSpeaking) return;
            }
            const label = speakerLabels[index] || id;
            const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
            const color = colors[index % colors.length];
            drawSpeaker(label, pos.x, pos.y, isSpeaking, color,
                config.showSpeakerImages[index] !== false ? assets.speakerImages[index] : null);
        });
    }

    // ── Segment Count Dots (both sides) ──────────────────────────
    if (speakerIds.length >= 2) {
        // Count how many segments each speaker has had so far (up to current)
        const speakerSegCounts = speakerIds.map(id =>
            script.slice(0, currentSegmentIndex + 1).filter(s => s.speaker === id).length
        );
        // Total segments each speaker has in the whole script
        const speakerSegTotals = speakerIds.map(id =>
            script.filter(s => s.speaker === id).length
        );

        const DOT_R = 7;
        const DOT_GAP = 5;
        const PER_ROW = 5;
        const ROW_GAP = 20;
        const SIDE_MARGIN = 14;
        const START_Y = canvasHeight * 0.68;

        const drawSegDots = (isLeft: boolean, done: number, total: number, color: string) => {
            const rows = Math.ceil(total / PER_ROW);
            const rowW = PER_ROW * (DOT_R * 2) + (PER_ROW - 1) * DOT_GAP;

            for (let i = 0; i < total; i++) {
                const row = Math.floor(i / PER_ROW);
                const col = i % PER_ROW;
                const isDone = i < done;

                const dotX = isLeft
                    ? SIDE_MARGIN + DOT_R + col * (DOT_R * 2 + DOT_GAP)
                    : canvasWidth - SIDE_MARGIN - DOT_R - col * (DOT_R * 2 + DOT_GAP);
                const dotY = START_Y + row * ROW_GAP;

                ctx.save();
                ctx.beginPath();
                ctx.arc(dotX, dotY, DOT_R, 0, Math.PI * 2);

                if (isDone) {
                    ctx.fillStyle = color;
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 10;
                } else {
                    ctx.fillStyle = 'rgba(255,255,255,0.12)';
                    ctx.shadowBlur = 0;
                }
                ctx.fill();
                ctx.restore();
            }

            // Count label below dots
            const labelY = START_Y + rows * ROW_GAP + 8;
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = isLeft ? 'left' : 'right';
            ctx.textBaseline = 'top';
            const labelX = isLeft ? SIDE_MARGIN : canvasWidth - SIDE_MARGIN;
            ctx.fillText(`${done}/${total}`, labelX, labelY);
            ctx.restore();
        };

        // Only draw for first 2 speakers (left/right sides)
        drawSegDots(true,  speakerSegCounts[0], Math.max(1, speakerSegTotals[0]), colors[0]);
        drawSegDots(false, speakerSegCounts[1], Math.max(1, speakerSegTotals[1]), colors[1]);
    }

    // Subtitles
    drawSubtitles(ctx, context);
  }
};
