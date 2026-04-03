import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles, drawSideStats, drawScores } from './utils';

export const modernTheme: Theme = {
  id: 'modern',
  name: 'Modern',
  description: 'Clean, circular speaker indicators with pulse effect.',
  properties: [
    // ── Colors ────────────────────────────────────────────────────
    { id: 'speakerColorA', label: 'Speaker A Color', type: 'color',  defaultValue: '#3b82f6',       group: 'Colors' },
    { id: 'speakerColorB', label: 'Speaker B Color', type: 'color',  defaultValue: '#ef4444',       group: 'Colors' },
    // ── Speaker ───────────────────────────────────────────────────
    { id: 'baseRadius',    label: 'Circle Radius',   type: 'number', defaultValue: 80, min: 40, max: 150, group: 'Speaker' },
    // ── VU Meter ──────────────────────────────────────────────────
    { id: 'vuStyle',       label: 'VU Meter Style',  type: 'select', defaultValue: 'arc-segments',  group: 'VU Meter',
      options: ['arc-segments', 'glow-ring', 'pulse-ring'] },
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
    const baseRadius   = (themeConfig?.baseRadius || 80) * config.speakerScale;
    const vuStyle      = themeConfig?.vuStyle || 'arc-segments';

    // Background
    drawBackground(ctx, assets, currentSegment, canvasWidth, canvasHeight, config.backgroundDim);

    // Timer
    if (config.showTimer) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(canvasWidth / 2 - 80, 16, 160, 52, 26);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (currentSegment.speaker === 'Narrator') {
            if (!(config.showSubtitles && config.subtitleBackground)) {
                ctx.fillText('NARRATOR', canvasWidth / 2, 42);
            }
        } else {
            const segEnd = context.segmentOffsets[currentSegmentIndex + 1] || context.totalDuration;
            const timeLeft = Math.max(0, Math.ceil(segEnd - time));
            ctx.fillText(`${timeLeft}s`, canvasWidth / 2, 42);
        }
    }

    // ── Speaker draw ───────────────────────────────────────────────
    const drawSpeaker = (label: string, xPct: number, yPct: number, isActive: boolean, color: string, image: HTMLImageElement | null) => {
        const x = xPct * canvasWidth;
        const y = yPct * canvasHeight;
        const level = isActive ? audioLevel : 0;

        // ── 1. Background circle (always dark) ────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.restore();

        // ── 2. Subtle radial glow behind active speaker ───────────
        if (isActive) {
            const glow = ctx.createRadialGradient(x, y, baseRadius * 0.4, x, y, baseRadius * 1.8);
            glow.addColorStop(0, `${color}22`);
            glow.addColorStop(0.5, `${color}0d`);
            glow.addColorStop(1, 'transparent');
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, baseRadius * 1.8, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();
            ctx.restore();
        }

        // ── 3. Speaker image / avatar ─────────────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
        ctx.clip();
        if (image) {
            const sc = Math.max((baseRadius * 2) / image.width, (baseRadius * 2) / image.height);
            ctx.drawImage(image, x - image.width * sc / 2, y - image.height * sc / 2, image.width * sc, image.height * sc);
        } else {
            ctx.fillStyle = '#1e293b';
            ctx.fill();
            ctx.fillStyle = isActive ? '#fff' : '#64748b';
            ctx.font = `bold ${Math.round(baseRadius * 0.65)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label.charAt(0).toUpperCase(), x, y);
        }
        ctx.restore();

        // ── 4. Border ring ────────────────────────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
        ctx.lineWidth = isActive ? 3.5 : 1.5;
        ctx.strokeStyle = isActive ? color : 'rgba(255,255,255,0.12)';
        if (isActive) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 14 + level * 18;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();

        // ── 5. VU Meter ───────────────────────────────────────────
        if (config.showVuMeter && isActive) {
            const gap = 12;
            const R1 = baseRadius + gap;
            const R2 = baseRadius + gap + 18 + level * 22;

            if (vuStyle === 'arc-segments') {
                // Segmented arc ring (professional)
                const SEGS = 32;
                const ARC_GAP = 0.04; // radians gap between segments
                const segAngle = (Math.PI * 2 - SEGS * ARC_GAP) / SEGS;
                const activeSegs = Math.max(2, Math.round(level * SEGS));
                const startAngle = -Math.PI / 2; // start at top

                ctx.save();
                for (let i = 0; i < SEGS; i++) {
                    const a0 = startAngle + i * (segAngle + ARC_GAP);
                    const a1 = a0 + segAngle;
                    const lit = i < activeSegs;

                    // Segment width grows slightly with audio level
                    const rOuter = lit ? R2 : R1 + 6;
                    const pct = i / (SEGS - 1);
                    let segColor: string;
                    if (!lit) {
                        segColor = 'rgba(255,255,255,0.06)';
                    } else if (pct < 0.6) {
                        segColor = color;
                    } else if (pct < 0.85) {
                        segColor = '#facc15';
                    } else {
                        segColor = '#ef4444';
                    }

                    ctx.beginPath();
                    ctx.arc(x, y, R1, a0, a1);
                    ctx.arc(x, y, rOuter, a1, a0, true);
                    ctx.closePath();
                    ctx.fillStyle = segColor;
                    if (lit) {
                        ctx.shadowColor = segColor;
                        ctx.shadowBlur = 6 + level * 10;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                ctx.restore();

            } else if (vuStyle === 'glow-ring') {
                // Single smooth glowing ring
                ctx.save();
                const ringAlpha = 0.5 + level * 0.5;
                const ringWidth = 4 + level * 14;
                ctx.beginPath();
                ctx.arc(x, y, R1 + ringWidth / 2, 0, Math.PI * 2);
                ctx.lineWidth = ringWidth;
                ctx.strokeStyle = color;
                ctx.globalAlpha = ringAlpha;
                ctx.shadowColor = color;
                ctx.shadowBlur = 20 + level * 30;
                ctx.stroke();
                ctx.restore();

            } else {
                // pulse-ring: concentric fading rings
                ctx.save();
                const rings = 3;
                for (let r = 0; r < rings; r++) {
                    const rR = R1 + r * (8 + level * 10);
                    const alpha = Math.max(0, (0.6 - r * 0.2)) * level;
                    ctx.beginPath();
                    ctx.arc(x, y, rR, 0, Math.PI * 2);
                    ctx.lineWidth = Math.max(1.5, 4 - r * 1.2);
                    ctx.strokeStyle = color;
                    ctx.globalAlpha = alpha;
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 10 + level * 20;
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        // ── 6. Speaker label below ────────────────────────────────
        ctx.save();
        ctx.fillStyle = isActive ? '#ffffff' : 'rgba(255,255,255,0.45)';
        ctx.font = `${isActive ? 'bold' : ''} 18px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (isActive) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
        }
        ctx.fillText(label.toUpperCase(), x, y + baseRadius + 14);
        ctx.shadowBlur = 0;
        ctx.restore();
    };

    if (showSpeakers) {
        speakerIds.forEach((id, index) => {
            const isSpeaking = isPlaying && currentSegment.speaker === id;
            const label = speakerLabels[index] || id;
            const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
            const color = colors[index % colors.length];
            drawSpeaker(label, pos.x, pos.y, isSpeaking, color,
                config.showSpeakerImages[index] !== false ? assets.speakerImages[index] : null);
        });
    }

    // Side Stats
    drawSideStats(ctx, context);

    // Scores
    drawScores(ctx, context);

    // Subtitles
    drawSubtitles(ctx, context);
  }
};
