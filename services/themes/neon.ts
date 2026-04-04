import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles, drawSideStats } from './utils';

export const neonTheme: Theme = {
  id: 'neon',
  name: 'Neon',
  description: 'Cyberpunk style with glowing text and borders.',
  properties: [
    // ── Colors ────────────────────────────────────────────────────
    { id: 'glowColorA',        label: 'Glow Color A',             type: 'color',   defaultValue: '#00ff00',          group: 'Colors' },
    { id: 'glowColorB',        label: 'Glow Color B',             type: 'color',   defaultValue: '#ff0000',          group: 'Colors' },
    { id: 'barColor',          label: 'Top Bar Color',            type: 'color',   defaultValue: 'rgba(0,0,0,0.88)', group: 'Colors' },
    // ── Speaker ───────────────────────────────────────────────────
    { id: 'speakerShape',      label: 'Speaker Shape',            type: 'select',  defaultValue: 'circle',           group: 'Speaker',
      options: ['circle', 'square', 'hexagon'] },
    { id: 'focusActiveSpeaker', label: 'Focus Active Speaker',    type: 'boolean', defaultValue: false,              group: 'Speaker' },
    { id: 'showSpeakerLabel',  label: 'Show Speaker Name',        type: 'boolean', defaultValue: false,              group: 'Speaker' },
    { id: 'detachNamePos',     label: 'Detach Name from Shape',   type: 'boolean', defaultValue: false,              group: 'Speaker' },
    { id: 'nameAlign',         label: 'Name Position',            type: 'select',  defaultValue: 'bottom-sides',     group: 'Speaker',
      options: ['bottom-sides', 'top-sides', 'mid-sides'] },
    // ── Elements ──────────────────────────────────────────────────
    { id: 'showBar',           label: 'Show Top Bar',             type: 'boolean', defaultValue: false,              group: 'Elements' },
    { id: 'showTimerNames',    label: 'Speaker Names by Timer',   type: 'boolean', defaultValue: true,               group: 'Elements' },
    // ── Scores ────────────────────────────────────────────────────
    { id: 'scoreStyle',        label: 'Score Style',              type: 'select',  defaultValue: 'neon-badge',       group: 'Scores',
      options: ['neon-badge', 'glitch', 'dots', 'bar'] },
    { id: 'scorePosition',     label: 'Score Position',           type: 'select',  defaultValue: 'bottom',           group: 'Scores',
      options: ['top-bar', 'bottom'] },
  ],
  draw: (context: DrawContext) => {
    const { ctx, time, audioLevel, script, currentSegmentIndex, config, assets, themeConfig } = context;
    const { width: canvasWidth, height: canvasHeight } = ctx.canvas;
    const currentSegment = script[currentSegmentIndex];
    if (!currentSegment) return;

    const isPlaying = true;
    const { speakerIds, speakerLabels, speakerPositions } = config;

    const showSpeakers      = config.showSpeakers;
    const showBar           = themeConfig?.showBar ?? false;
    const showTimerNames    = themeConfig?.showTimerNames ?? true;
    const speakerShape      = themeConfig?.speakerShape || 'circle';
    const focusActiveSpeaker = themeConfig?.focusActiveSpeaker ?? false;
    const showSpeakerLabel  = themeConfig?.showSpeakerLabel ?? false;
    const detachNamePos     = themeConfig?.detachNamePos ?? false;
    const nameAlign         = themeConfig?.nameAlign || 'bottom-sides';
    const scoreStyle        = themeConfig?.scoreStyle || 'neon-badge';
    const scorePosition     = themeConfig?.scorePosition || 'bottom';
    const BAR_H             = 80;

    const colors = [
        themeConfig?.glowColorA || '#00ff00',
        themeConfig?.glowColorB || '#ff0000',
        '#3b82f6',
        '#eab308',
    ];

    // ── Background ─────────────────────────────────────────────────
    drawBackground(ctx, assets, currentSegment, canvasWidth, canvasHeight, config.backgroundDim);

    // ── Top Bar ────────────────────────────────────────────────────
    if (showBar) {
        ctx.fillStyle = themeConfig?.barColor || 'rgba(0,0,0,0.88)';
        ctx.fillRect(0, 0, canvasWidth, BAR_H);

        // Thin neon bottom border on bar
        const barBorderColor = themeConfig?.glowColorA || '#00ff00';
        ctx.save();
        ctx.strokeStyle = barBorderColor;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = barBorderColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, BAR_H); ctx.lineTo(canvasWidth, BAR_H);
        ctx.stroke();
        ctx.restore();

        // Timer (center of bar)
        if (config.showTimer) {
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 32px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#0ff';
            ctx.shadowBlur = 12;
            if (currentSegment.speaker === 'Narrator') {
                if (!(config.showSubtitles && config.subtitleBackground)) {
                    ctx.fillText('NARRATOR', canvasWidth / 2, BAR_H / 2);
                }
            } else {
                const segEnd = context.segmentOffsets[currentSegmentIndex + 1] || context.totalDuration;
                const timeLeft = Math.max(0, Math.ceil(segEnd - time));
                ctx.fillText(`${timeLeft}s`, canvasWidth / 2, BAR_H / 2);
            }
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        // Speaker names inside bar (left / right halves, based on speaker positions)
        speakerIds.forEach((id, index) => {
            const isSpeaking = isPlaying && currentSegment.speaker === id;
            const label = speakerLabels[index] || id;
            const color = colors[index % colors.length];
            const pos = speakerPositions[index] || { x: index === 0 ? 0.25 : 0.75, y: 0.5 };
            ctx.save();
            ctx.font = 'bold 22px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isSpeaking ? '#fff' : 'rgba(255,255,255,0.28)';
            ctx.shadowColor = isSpeaking ? color : 'transparent';
            ctx.shadowBlur = isSpeaking ? 18 : 0;
            ctx.fillText(label.toUpperCase(), pos.x * canvasWidth, BAR_H / 2);
            ctx.shadowBlur = 0;
            ctx.restore();
        });
    }

    // ── Timer outside bar (when bar is off) ────────────────────────
    if (!showBar && config.showTimer) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(canvasWidth / 2 - 70, 14, 140, 48, 24);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 10;
        if (currentSegment.speaker === 'Narrator') {
            if (!(config.showSubtitles && config.subtitleBackground)) {
                ctx.fillText('NARRATOR', canvasWidth / 2, 38);
            }
        } else {
            const segEnd = context.segmentOffsets[currentSegmentIndex + 1] || context.totalDuration;
            const timeLeft = Math.max(0, Math.ceil(segEnd - time));
            ctx.fillText(`${timeLeft}s`, canvasWidth / 2, 38);
        }
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // ── Speaker names beside / around timer ───────────────────────
    if (showTimerNames && config.showTimer && speakerIds.length >= 2) {
        const timerCY = showBar ? BAR_H / 2 : 38;
        const count   = speakerIds.length;

        if (count === 2) {
            // Original 2-speaker layout: left & right of timer
            const timerHW  = showBar ? 48 : 70;
            const GAP      = 20;
            const leftEdge  = canvasWidth / 2 - timerHW - GAP;
            const rightEdge = canvasWidth / 2 + timerHW + GAP;

            speakerIds.forEach((id, index) => {
                const isLeft     = index === 0;
                const label      = speakerLabels[index] || id;
                const color      = colors[index % colors.length];
                const isSpeaking = currentSegment.speaker === id;
                ctx.save();
                ctx.font         = `bold 22px sans-serif`;
                ctx.textBaseline = 'middle';
                ctx.textAlign    = isLeft ? 'right' : 'left';
                ctx.fillStyle    = isSpeaking ? '#fff' : 'rgba(255,255,255,0.28)';
                ctx.shadowColor  = isSpeaking ? color : 'transparent';
                ctx.shadowBlur   = isSpeaking ? 18 : 0;
                ctx.fillText(label.toUpperCase(), isLeft ? leftEdge : rightEdge, timerCY);
                ctx.restore();
            });
        } else {
            // 3+ speakers: evenly spread across top — active one glows
            const SIDE_PAD = 60;
            const fontSize = count > 4 ? 15 : 18;
            speakerIds.forEach((id, index) => {
                const label      = speakerLabels[index] || id;
                const color      = colors[index % colors.length];
                const isSpeaking = currentSegment.speaker === id;
                const x = SIDE_PAD + (canvasWidth - SIDE_PAD * 2) * (index / (count - 1));

                ctx.save();
                ctx.font         = `bold ${fontSize}px sans-serif`;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle    = isSpeaking ? '#fff' : 'rgba(255,255,255,0.28)';
                ctx.shadowColor  = isSpeaking ? color : 'transparent';
                ctx.shadowBlur   = isSpeaking ? 18 : 0;
                ctx.fillText(label.toUpperCase(), x, timerCY - 6);

                // Active indicator dot below name
                if (isSpeaking) {
                    ctx.beginPath();
                    ctx.arc(x, timerCY + 10, 3.5, 0, Math.PI * 2);
                    ctx.fillStyle   = color;
                    ctx.shadowColor = color;
                    ctx.shadowBlur  = 8;
                    ctx.fill();
                }
                ctx.restore();
            });
        }
    }

    // ── Speaker draw (circle / square / hexagon) ───────────────────
    const baseRadius = 80 * config.speakerScale;

    const drawHexPath = (x: number, y: number, r: number) => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i - 30);
            const px = x + r * Math.cos(angle);
            const py = y + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
    };

    const drawSpeaker = (xPct: number, yPct: number, isActive: boolean, color: string, image: HTMLImageElement | null, label: string) => {
        const x = xPct * canvasWidth;
        const y = yPct * canvasHeight;
        const pulse = isActive ? 10 * audioLevel : 0;

        if (speakerShape === 'square') {
            // ── Square ────────────────────────────────────
            const side = (baseRadius * 2.0) + pulse;
            const w = side, h = side;
            const rx = x - w / 2, ry = y - h / 2;

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(rx, ry, w, h, 16);
            ctx.clip();
            if (image) {
                const s = Math.max(w / image.width, h / image.height);
                ctx.drawImage(image, x - image.width * s / 2, y - image.height * s / 2, image.width * s, image.height * s);
            } else {
                ctx.fillStyle = '#0a0f0a';
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${baseRadius * 0.7}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label.charAt(0).toUpperCase(), x, y);
            }
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(rx, ry, w, h, 16);
            ctx.strokeStyle = color;
            ctx.lineWidth = isActive ? 3 : 1.5;
            ctx.shadowColor = color;
            ctx.shadowBlur = isActive ? 20 + audioLevel * 25 : 6;
            ctx.stroke();
            ctx.restore();

            if (showSpeakerLabel && !detachNamePos) {
                ctx.save();
                ctx.fillStyle = color;
                ctx.font = 'bold 18px monospace';
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.shadowColor = color; ctx.shadowBlur = 10;
                ctx.fillText(label.toUpperCase(), x, ry + h + 10);
                ctx.restore();
            }

        } else if (speakerShape === 'hexagon') {
            // ── Hexagon ───────────────────────────────────
            const r = baseRadius + pulse * 0.6;

            ctx.save();
            drawHexPath(x, y, r);
            ctx.clip();
            if (image) {
                const s = Math.max((r * 2) / image.width, (r * 2) / image.height);
                ctx.drawImage(image, x - image.width * s / 2, y - image.height * s / 2, image.width * s, image.height * s);
            } else {
                ctx.fillStyle = '#0a0f0a';
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${r * 0.65}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label.charAt(0).toUpperCase(), x, y);
            }
            ctx.restore();

            ctx.save();
            drawHexPath(x, y, r);
            ctx.strokeStyle = color;
            ctx.lineWidth = isActive ? 3 : 1.5;
            ctx.shadowColor = color;
            ctx.shadowBlur = isActive ? 22 + audioLevel * 28 : 6;
            ctx.stroke();
            ctx.restore();

            // Outer ring VU
            if (isActive && config.showVuMeter) {
                ctx.save();
                drawHexPath(x, y, r + 14 + audioLevel * 24);
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.3 + audioLevel * 0.5;
                ctx.lineWidth = 2;
                ctx.shadowColor = color; ctx.shadowBlur = 14;
                ctx.stroke();
                ctx.restore();
            }

            if (showSpeakerLabel && !detachNamePos) {
                ctx.save();
                ctx.fillStyle = color;
                ctx.font = 'bold 18px monospace';
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.shadowColor = color; ctx.shadowBlur = 10;
                ctx.fillText(label.toUpperCase(), x, y + r + 12);
                ctx.restore();
            }

        } else {
            // ── Circle (default) ───────────────────────────
            if (isActive) {
                ctx.beginPath();
                ctx.arc(x, y, baseRadius + pulse + 10, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.25;
                ctx.fill();
                ctx.globalAlpha = 1;

                ctx.beginPath();
                ctx.arc(x, y, baseRadius + pulse, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.15;
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
            ctx.clip();
            if (image) {
                const scale = Math.max((baseRadius * 2) / image.width, (baseRadius * 2) / image.height);
                ctx.drawImage(image, x - image.width * scale / 2, y - image.height * scale / 2, image.width * scale, image.height * scale);
            } else {
                ctx.fillStyle = '#0a0f0a';
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 64px sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label.charAt(0).toUpperCase(), x, y);
            }
            ctx.restore();

            ctx.beginPath();
            ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
            ctx.lineWidth = isActive ? 4 : 1.5;
            ctx.strokeStyle = color;
            ctx.shadowColor = isActive ? color : 'transparent';
            ctx.shadowBlur = isActive ? 20 + audioLevel * 25 : 0;
            ctx.stroke();
            ctx.shadowBlur = 0;

            if (config.showVuMeter && isActive && config.vuMeterStyle === 'ring') {
                ctx.save();
                ctx.beginPath();
                ctx.arc(x, y, baseRadius + 15 + audioLevel * 40, 0, Math.PI * 2);
                ctx.shadowBlur = 10 + audioLevel * 40;
                ctx.shadowColor = color;
                ctx.strokeStyle = `rgba(255,255,255,${0.3 + audioLevel * 0.7})`;
                ctx.lineWidth = 4 + audioLevel * 16;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, baseRadius + 25 + audioLevel * 60, 0, Math.PI * 2);
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.2 * audioLevel;
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
            }

            if (showSpeakerLabel && !detachNamePos) {
                ctx.save();
                ctx.fillStyle = color;
                ctx.font = 'bold 18px monospace';
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.shadowColor = color; ctx.shadowBlur = 10;
                ctx.fillText(label.toUpperCase(), x, y + baseRadius + 12);
                ctx.restore();
            }
        }
    };

    if (showSpeakers) {
        const isNarratorTurn = currentSegment.speaker === 'Narrator' || currentSegment.speaker === 'narrator';

        // ── Neon Spotlight vignette (focus mode) ─────────────────
        if (focusActiveSpeaker && !isNarratorTurn) {
            const activeIdx = speakerIds.indexOf(currentSegment.speaker);
            if (activeIdx !== -1) {
                const activePos = speakerPositions[activeIdx] || { x: 0.5, y: 0.5 };
                const cx = activePos.x * canvasWidth;
                const cy = activePos.y * canvasHeight;
                const spotR = Math.max(canvasWidth, canvasHeight) * 0.48;
                const grad = ctx.createRadialGradient(cx, cy, spotR * 0.08, cx, cy, spotR);
                grad.addColorStop(0, 'rgba(0,0,0,0)');
                grad.addColorStop(0.55, 'rgba(0,0,0,0.35)');
                grad.addColorStop(1, 'rgba(0,0,0,0.78)');
                ctx.save();
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                ctx.restore();
            }
        }

        speakerIds.forEach((id, index) => {
            const isSpeaking = isPlaying && currentSegment.speaker === id;
            // Narrator turn → hide all speakers in focus mode
            if (focusActiveSpeaker && isNarratorTurn) return;
            const label = speakerLabels[index] || id;
            const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
            const color = colors[index % colors.length];
            // Inactive speaker → render faint (neon ghost) instead of completely hiding
            const isDimmed = focusActiveSpeaker && !isSpeaking;
            if (isDimmed) { ctx.save(); ctx.globalAlpha = 0.18; }
            drawSpeaker(pos.x, pos.y, isSpeaking, color,
                config.showSpeakerImages[index] !== false ? assets.speakerImages[index] : null, label);
            if (isDimmed) ctx.restore();
        });

        // ── Detached Speaker Names ────────────────────────────────
        if (showSpeakerLabel && detachNamePos) {
            const nameY = nameAlign === 'top-sides'
                ? canvasHeight * 0.12
                : nameAlign === 'mid-sides'
                ? canvasHeight * 0.50
                : canvasHeight * 0.88;

            const count    = speakerIds.length;
            const SIDE_PAD = 80;
            const fontSize = count > 4 ? 15 : count > 2 ? 17 : 20;

            // X position: 2 speakers → fixed quarters; 3+ → evenly distributed
            const getNameX = (index: number) => {
                if (count === 2) return index === 0 ? canvasWidth * 0.22 : canvasWidth * 0.78;
                return SIDE_PAD + (canvasWidth - SIDE_PAD * 2) * (index / (count - 1));
            };

            speakerIds.forEach((id, index) => {
                const isSpeaking = isPlaying && currentSegment.speaker === id;
                if (focusActiveSpeaker && isNarratorTurn) return;
                const label       = speakerLabels[index] || id;
                const color       = colors[index % colors.length];
                const isDimmedName = focusActiveSpeaker && !isSpeaking;
                const nameX       = getNameX(index);

                ctx.save();
                if (isDimmedName) ctx.globalAlpha = 0.18;
                ctx.font         = `bold ${fontSize}px monospace`;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle    = isSpeaking ? '#fff' : 'rgba(255,255,255,0.35)';
                ctx.shadowColor  = isSpeaking ? color : 'transparent';
                ctx.shadowBlur   = isSpeaking ? 20 : 0;

                // Neon highlight pill behind active name
                const tw = ctx.measureText(label.toUpperCase()).width;
                if (isSpeaking && !isDimmedName) {
                    ctx.fillStyle    = color;
                    ctx.globalAlpha  = 0.18;
                    ctx.beginPath();
                    ctx.roundRect(nameX - tw / 2 - 12, nameY - 16, tw + 24, 32, 6);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }

                ctx.fillStyle = isSpeaking ? '#fff' : 'rgba(255,255,255,0.35)';
                ctx.fillText(label.toUpperCase(), nameX, nameY);

                // Thin colored underline
                ctx.beginPath();
                ctx.moveTo(nameX - tw / 2, nameY + fontSize * 0.75);
                ctx.lineTo(nameX + tw / 2, nameY + fontSize * 0.75);
                ctx.strokeStyle  = color;
                ctx.lineWidth    = isSpeaking ? 2 : 1;
                ctx.globalAlpha  = isSpeaking ? (isDimmedName ? 0.18 : 1) : 0.3;
                ctx.shadowColor  = color;
                ctx.shadowBlur   = isSpeaking ? 10 : 0;
                ctx.stroke();
                ctx.restore();
            });
        }
    }

    // Side Stats
    drawSideStats(ctx, context);

    // ── Neon Score Display ─────────────────────────────────────────
    if (config.showScores && context.scores && speakerIds.length >= 2) {
        const scoreA = context.scores.scoreA;
        const scoreB = context.scores.scoreB;
        const colorA = colors[0];
        const colorB = colors[1];
        const labelA = speakerLabels?.[0] || speakerIds[0] || 'A';
        const labelB = speakerLabels?.[1] || speakerIds[1] || 'B';

        if (scorePosition === 'top-bar') {
            // ── Integrated into top bar ──────────────────
            // Already positioned: speaker names are in bar; add score as small badge next to name
            const drawBarScore = (isLeft: boolean, score: string, color: string, label: string) => {
                const spkIdx = isLeft ? 0 : 1;
                const pos = speakerPositions[spkIdx] || { x: isLeft ? 0.25 : 0.75, y: 0.5 };
                const cx = pos.x * canvasWidth;
                const badgeW = 52, badgeH = 28;
                const bx = isLeft ? cx + 60 : cx - 60 - badgeW;
                const by = (BAR_H - badgeH) / 2;

                ctx.save();
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.beginPath();
                ctx.roundRect(bx, by, badgeW, badgeH, 6);
                ctx.fill();

                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.shadowColor = color; ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.roundRect(bx, by, badgeW, badgeH, 6);
                ctx.stroke();

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 16px monospace';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.shadowColor = color; ctx.shadowBlur = 12;
                ctx.fillText(score, bx + badgeW / 2, by + badgeH / 2);
                ctx.restore();
            };

            drawBarScore(true,  scoreA, colorA, labelA);
            drawBarScore(false, scoreB, colorB, labelB);

        } else {
            // ── Bottom corners ────────────────────────────
            const posY = canvasHeight - 110;
            const margin = 20;

            const drawBottomScore = (isLeft: boolean, score: string, color: string, label: string) => {

                if (scoreStyle === 'neon-badge') {
                    const boxW = 150, boxH = 68;
                    const x = isLeft ? margin : canvasWidth - margin - boxW;
                    const y = posY;

                    ctx.save();
                    ctx.shadowColor = color; ctx.shadowBlur = 28;
                    ctx.strokeStyle = color; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.roundRect(x, y, boxW, boxH, 6); ctx.stroke();
                    ctx.restore();

                    ctx.fillStyle = 'rgba(0,0,0,0.88)';
                    ctx.beginPath(); ctx.roundRect(x, y, boxW, boxH, 6); ctx.fill();

                    // Corner brackets
                    ctx.save();
                    ctx.strokeStyle = color; ctx.lineWidth = 3;
                    ctx.shadowColor = color; ctx.shadowBlur = 15;
                    const c = 14;
                    ctx.beginPath(); ctx.moveTo(x+c,y); ctx.lineTo(x,y); ctx.lineTo(x,y+c); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(x+boxW-c,y); ctx.lineTo(x+boxW,y); ctx.lineTo(x+boxW,y+c); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(x+c,y+boxH); ctx.lineTo(x,y+boxH); ctx.lineTo(x,y+boxH-c); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(x+boxW-c,y+boxH); ctx.lineTo(x+boxW,y+boxH); ctx.lineTo(x+boxW,y+boxH-c); ctx.stroke();
                    ctx.restore();

                    ctx.fillStyle = color;
                    ctx.font = 'bold 11px monospace';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                    ctx.shadowColor = color; ctx.shadowBlur = 8;
                    ctx.fillText(label.toUpperCase(), x + boxW/2, y + 8);
                    ctx.shadowBlur = 0;

                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 30px monospace';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.shadowColor = color; ctx.shadowBlur = 20;
                    ctx.fillText(score, x + boxW/2, y + boxH/2 + 8);
                    ctx.shadowBlur = 0;

                } else if (scoreStyle === 'glitch') {
                    const boxW = 140, boxH = 58;
                    const x = isLeft ? margin : canvasWidth - margin - boxW;
                    const y = posY;
                    const g = Math.sin(time * 14) * 2.5;

                    ctx.fillStyle = 'rgba(0,0,0,0.78)';
                    ctx.fillRect(x, y, boxW, boxH);
                    for (let sy = y; sy < y + boxH; sy += 4) {
                        ctx.fillStyle = 'rgba(0,0,0,0.22)';
                        ctx.fillRect(x, sy, boxW, 2);
                    }

                    ctx.save();
                    ctx.globalAlpha = 0.35;
                    ctx.font = 'bold 32px monospace';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillStyle = colorA; ctx.fillText(score, x+boxW/2+g, y+boxH/2);
                    ctx.fillStyle = colorB; ctx.fillText(score, x+boxW/2-g, y+boxH/2);
                    ctx.globalAlpha = 1;
                    ctx.restore();

                    ctx.fillStyle = '#fff'; ctx.font = 'bold 30px monospace';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.shadowColor = color; ctx.shadowBlur = 16;
                    ctx.fillText(score, x + boxW/2, y + boxH/2);
                    ctx.shadowBlur = 0;

                    ctx.fillStyle = color; ctx.font = 'bold 10px monospace';
                    ctx.textAlign = isLeft ? 'left' : 'right'; ctx.textBaseline = 'top';
                    ctx.fillText(label.toUpperCase(), isLeft ? x+4 : x+boxW-4, y+4);

                } else if (scoreStyle === 'dots') {
                    const maxDots = 10;
                    const scoreNum = parseFloat(score) || 0;
                    const filled = Math.round((scoreNum / 10) * maxDots);
                    const dotR = 10, dotGap = 7;
                    const totalW = maxDots*(dotR*2) + (maxDots-1)*dotGap;
                    const startX = isLeft ? margin : canvasWidth - margin - totalW;
                    const cy = posY + dotR;

                    ctx.fillStyle = color; ctx.font = 'bold 12px monospace';
                    ctx.textAlign = isLeft ? 'left' : 'right'; ctx.textBaseline = 'bottom';
                    ctx.shadowColor = color; ctx.shadowBlur = 8;
                    ctx.fillText(`${label.toUpperCase()} · ${score}`, isLeft ? startX : startX+totalW, cy - dotR - 6);
                    ctx.shadowBlur = 0;

                    for (let d = 0; d < maxDots; d++) {
                        const dx = startX + d*(dotR*2+dotGap) + dotR;
                        const lit = d < filled;
                        ctx.beginPath();
                        ctx.arc(dx, cy, dotR, 0, Math.PI*2);
                        ctx.fillStyle = lit ? color : 'rgba(255,255,255,0.07)';
                        ctx.shadowColor = lit ? color : 'transparent';
                        ctx.shadowBlur = lit ? 14 : 0;
                        ctx.fill();
                        ctx.shadowBlur = 0;
                    }

                } else if (scoreStyle === 'bar') {
                    const barW = 20, barMaxH = 90;
                    const scoreNum = parseFloat(score) || 0;
                    const fillH = (scoreNum / 10) * barMaxH;
                    const x = isLeft ? margin : canvasWidth - margin - barW;
                    const barTop = posY;
                    const barBottom = posY + barMaxH;

                    ctx.fillStyle = 'rgba(255,255,255,0.06)';
                    ctx.beginPath(); ctx.roundRect(x, barTop, barW, barMaxH, 4); ctx.fill();

                    ctx.save();
                    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 16;
                    ctx.beginPath(); ctx.roundRect(x, barBottom-fillH, barW, fillH, 4); ctx.fill();
                    ctx.restore();

                    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                    ctx.fillText(score, x+barW/2, barBottom+6);

                    ctx.fillStyle = color; ctx.font = 'bold 10px monospace';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                    ctx.shadowColor = color; ctx.shadowBlur = 8;
                    ctx.fillText(label.slice(0,4).toUpperCase(), x+barW/2, barTop-4);
                    ctx.shadowBlur = 0;
                }
            };

            drawBottomScore(true,  scoreA, colorA, labelA);
            drawBottomScore(false, scoreB, colorB, labelB);
        }
    }

    // Subtitles
    drawSubtitles(ctx, context);
  }
};
