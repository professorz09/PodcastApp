import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles } from './utils';

export const arenaTheme: Theme = {
  id: 'arena',
  name: 'Arena',
  description: 'Versus layout with central VS indicator and score cards.',
  properties: [
    { id: 'timerColor', label: 'Timer Color', type: 'color', defaultValue: '#eab308' },
    { id: 'vsColor', label: 'VS Color', type: 'color', defaultValue: '#f97316' },
    { id: 'speakerColorA', label: 'Speaker A Color', type: 'color', defaultValue: '#3b82f6' },
    { id: 'speakerColorB', label: 'Speaker B Color', type: 'color', defaultValue: '#ef4444' },
    { id: 'showSpeakers', label: 'Show Speakers', type: 'boolean', defaultValue: true },
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
        '#eab308', // Yellow
        '#22c55e'  // Green
    ];
    
    const showSpeakers = themeConfig?.showSpeakers !== undefined ? themeConfig.showSpeakers : config.showSpeakers;

    // Background
    drawBackground(ctx, assets, currentSegment, canvasWidth, canvasHeight, config.backgroundDim);

    // --- Top Section ---
    const topY = 50;
    
    // Timer Box
    if (config.showTimer) {
        const timerW = 100;
        const timerH = 40;
        const timerX = canvasWidth / 2 - timerW / 2;
        const timerY = topY - timerH / 2;
        
        ctx.save();
        ctx.fillStyle = themeConfig?.timerColor || '#eab308';
        ctx.beginPath();
        ctx.roundRect(timerX, timerY, timerW, timerH, 8);
        ctx.fill();
        
        const segmentStartTime = context.segmentOffsets[currentSegmentIndex] || 0;
        const segmentEndTime = context.segmentOffsets[currentSegmentIndex + 1] || context.totalDuration;
        const timeLeft = Math.max(0, Math.ceil(segmentEndTime - time));
        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        
        ctx.fillStyle = '#000';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${m}:${s}`, timerX + timerW / 2, topY);
        ctx.restore();
    }

    // --- Center VS (Only if 2 speakers) ---
    if (speakerIds.length === 2) {
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2 + 50;
        const vsRadius = 45;
        const vsColor = themeConfig?.vsColor || '#f97316';

        ctx.save();
        // Glow
        const vsGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, vsRadius * 2);
        vsGlow.addColorStop(0, vsColor);
        vsGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = vsGlow;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(centerX, centerY, vsRadius * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Circle
        ctx.fillStyle = vsColor;
        ctx.beginPath();
        ctx.arc(centerX, centerY, vsRadius, 0, Math.PI * 2);
        ctx.fill();

        // Text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VS', centerX, centerY);
        ctx.restore();
    }

    // --- Speaker Cards (Minimal style) ---
    const drawSpeaker = (label: string, xPct: number, yPct: number, isActive: boolean, color: string, image: HTMLImageElement | null) => {
        const x = xPct * canvasWidth;
        const y = yPct * canvasHeight;
        const w = 240 * config.speakerScale;
        const h = 320 * config.speakerScale;
        const rectX = x - w / 2;
        const rectY = y - h / 2 + 50;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, w, h, 30);
        ctx.clip();

        if (image) {
            const scale = Math.max(w / image.width, h / image.height);
            const imgW = image.width * scale;
            const imgH = image.height * scale;
            ctx.drawImage(image, rectX + w / 2 - imgW / 2, rectY + h / 2 - imgH / 2, imgW, imgH);
        } else {
            ctx.fillStyle = '#1e1e1e';
            ctx.fill();
            const radius = 60 * config.speakerScale;
            ctx.beginPath();
            ctx.arc(x, rectY + h / 2 - 40, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#27272a';
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label.charAt(0).toUpperCase(), x, rectY + h / 2 - 40);
        }
        ctx.restore();

        // Border — active: colored glow; inactive: subtle dark
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, w, h, 30);
        if (isActive) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 28 + audioLevel * 20;
        }
        ctx.lineWidth = isActive ? 4 : 2;
        ctx.strokeStyle = isActive ? color : '#333';
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();

        // Name label below card
        ctx.save();
        ctx.font = `bold ${20 * config.speakerScale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (isActive) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
        }
        ctx.fillStyle = isActive ? color : 'rgba(255,255,255,0.6)';
        ctx.fillText(label.toUpperCase(), x, rectY + h + 10);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Side VU meter
        if (config.showVuMeter && isActive) {
            const barX = rectX + w + 10;

            if (config.vuMeterStyle === 'dots') {
                const DOTS = 12;
                const dotR = Math.max(3, Math.min(6, h / (DOTS * 3)));
                const spacing = (h - DOTS * dotR * 2) / (DOTS - 1);
                const dotCX = barX + dotR + 1;
                const activeDots = Math.round(Math.max(0.18, audioLevel) * DOTS);

                for (let d = 0; d < DOTS; d++) {
                    const dotY = rectY + h - d * (dotR * 2 + spacing) - dotR;
                    const isLit = d < activeDots;
                    const pct = d / (DOTS - 1);
                    let dotColor: string;
                    if (!isLit) {
                        dotColor = 'rgba(255,255,255,0.10)';
                    } else if (pct < 0.5) {
                        dotColor = color;
                    } else if (pct < 0.8) {
                        dotColor = '#facc15';
                    } else {
                        dotColor = '#ef4444';
                    }
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
                ctx.fillRect(barX, rectY, barW, h);
                const fillH = h * Math.min(1, audioLevel);
                const fillY = rectY + h - fillH;
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = 8;
                ctx.fillRect(barX, fillY, barW, fillH);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(barX - 1, fillY - 2, barW + 2, 3);
                ctx.shadowBlur = 0;
            }
        }
    };

    if (showSpeakers) {
        speakerIds.forEach((id, index) => {
            const isSpeaking = isPlaying && currentSegment.speaker === id;
            const label = speakerLabels[index] || id;
            const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
            const color = colors[index % colors.length];

            drawSpeaker(
                label,
                pos.x,
                pos.y,
                isSpeaking,
                color,
                config.showSpeakerImages[index] !== false ? assets.speakerImages[index] : null
            );
        });
    }

    // Subtitles
    drawSubtitles(ctx, context);
  }
};
