import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles } from './utils';

export const minimalTheme: Theme = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Simple, flat design with a top status bar.',
  properties: [
    { id: 'barColor', label: 'Bar Color', type: 'color', defaultValue: '#1e1e1e' },
    { id: 'speakerColorA', label: 'Speaker A Color', type: 'color', defaultValue: '#3b82f6' },
    { id: 'speakerColorB', label: 'Speaker B Color', type: 'color', defaultValue: '#ec4899' },
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
        themeConfig?.speakerColorB || '#ec4899',
        '#eab308', // Yellow
        '#22c55e'  // Green
    ];

    // Background
    drawBackground(ctx, assets, currentSegment, canvasWidth, canvasHeight, config.backgroundDim);

    // Top Bar
    const barHeight = 100;
    const barWidth = canvasWidth - 100;
    const barX = 50;
    const barY = 30;
    
    ctx.fillStyle = themeConfig?.barColor || '#1e1e1e';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 20);
    ctx.fill();
    
    // Timer
    if (config.showTimer) {
         ctx.fillStyle = '#fff';
         ctx.font = 'bold 48px sans-serif';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';

         if (currentSegment.speaker === 'Narrator') {
             if (!(config.showSubtitles && config.subtitleBackground)) {
                 ctx.fillText('NARRATOR', canvasWidth / 2, barY + barHeight / 2);
             }
         } else {
             const segmentStartTime = context.segmentOffsets[currentSegmentIndex] || 0;
             const segmentEndTime = context.segmentOffsets[currentSegmentIndex + 1] || context.totalDuration;
             
             const segmentDuration = Math.max(0, segmentEndTime - segmentStartTime);
             const segmentElapsed = Math.max(0, time - segmentStartTime);
             const timeLeft = Math.max(0, Math.ceil(segmentDuration - segmentElapsed));

             ctx.fillText(`${timeLeft}`, canvasWidth / 2, barY + barHeight / 2);
         }
    }

    // Draw Speakers in Top Bar
    // We only show up to 2 in the top bar corners for now to keep it clean, 
    // or we can try to fit more.
    // Let's stick to the first 2 for the corners if they exist.
    // If we have more, maybe we shouldn't show them in the top bar or show them smaller.
    // For now, let's just show the first 2 as "Team A" and "Team B" representatives or just Speaker 1/2.
    
    const showName = config.showMinimalSpeakerName !== false;
    const glowBlur = audioLevel * 28; // scale glow with voice level

    if (speakerIds.length > 0) {
        // Left Side (Speaker 1)
        const leftX = barX + 30;
        const centerY = barY + barHeight / 2;
        const color1 = colors[0];
        const label1 = speakerLabels[0] || speakerIds[0];
        const isSpeaking1 = currentSegment.speaker === speakerIds[0];

        ctx.save();
        if (isSpeaking1) {
            ctx.shadowColor = color1;
            ctx.shadowBlur = glowBlur;
        }
        ctx.beginPath();
        ctx.arc(leftX + 25, centerY, 25, 0, Math.PI * 2);
        ctx.fillStyle = color1;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label1.charAt(0).toUpperCase(), leftX + 25, centerY);

        if (showName) {
            ctx.textAlign = 'left';
            ctx.fillStyle = '#fff';
            if (isSpeaking1) {
                ctx.shadowColor = color1;
                ctx.shadowBlur = glowBlur * 0.7;
            }
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(label1.toUpperCase(), leftX + 65, centerY);
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    }

    if (speakerIds.length > 1) {
        // Right Side (Speaker 2)
        const rightX = barX + barWidth - 30;
        const centerY = barY + barHeight / 2;
        const color2 = colors[1];
        const label2 = speakerLabels[1] || speakerIds[1];
        const isSpeaking2 = currentSegment.speaker === speakerIds[1];

        ctx.save();
        if (isSpeaking2) {
            ctx.shadowColor = color2;
            ctx.shadowBlur = glowBlur;
        }
        ctx.beginPath();
        ctx.arc(rightX - 25, centerY, 25, 0, Math.PI * 2);
        ctx.fillStyle = color2;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label2.charAt(0).toUpperCase(), rightX - 25, centerY);

        if (showName) {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#fff';
            if (isSpeaking2) {
                ctx.shadowColor = color2;
                ctx.shadowBlur = glowBlur * 0.7;
            }
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(label2.toUpperCase(), rightX - 65, centerY);
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    }

    // Speakers (Rectangular Cards)
    const drawSpeaker = (label: string, xPct: number, yPct: number, isActive: boolean, color: string, image: HTMLImageElement | null) => {
        const x = xPct * canvasWidth;
        const y = yPct * canvasHeight;
        const w = 240 * config.speakerScale;
        const h = 320 * config.speakerScale;
        const rectX = x - w/2;
        const rectY = y - h/2 + 50;
        
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, w, h, 30);
        ctx.clip();
        
        if (image) {
            const scale = Math.max(w / image.width, h / image.height);
            const imgW = image.width * scale;
            const imgH = image.height * scale;
            ctx.drawImage(image, rectX + w/2 - imgW/2, rectY + h/2 - imgH/2, imgW, imgH);
        } else {
            ctx.fillStyle = '#1e1e1e';
            ctx.fill();
            const radius = 60 * config.speakerScale;
            ctx.beginPath();
            ctx.arc(x, rectY + h/2 - 40, radius, 0, Math.PI*2);
            ctx.fillStyle = '#27272a';
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label.charAt(0).toUpperCase(), x, rectY + h/2 - 40);
        }
        ctx.restore();

        ctx.beginPath();
        ctx.roundRect(rectX, rectY, w, h, 30);
        ctx.lineWidth = isActive ? 4 : 2;
        ctx.strokeStyle = isActive ? color : '#333';
        ctx.stroke();

        // VU Meter (Side)
        if (config.showVuMeter && config.showMinimalSideVU !== false && isActive) {
            const barX = rectX + w + 10;

            if (config.vuMeterStyle === 'dots') {
                // --- Dots VU Meter ---
                const DOTS = 12;
                const dotR = Math.max(3, Math.min(6, h / (DOTS * 3)));
                const totalDotsH = DOTS * dotR * 2;
                const spacing = (h - totalDotsH) / (DOTS - 1);
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
                    if (isLit) {
                        ctx.shadowColor = dotColor;
                        ctx.shadowBlur = 5 + audioLevel * 8;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
            } else {
                // --- Classic Bar ---
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

    if (config.showSpeakers) {
        speakerIds.forEach((id, index) => {
            const isSpeaking = isPlaying && currentSegment.speaker === id;
            const label = speakerLabels[index] || id;
            const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
            const color = colors[index % colors.length];
            
            drawSpeaker(label, pos.x, pos.y, isSpeaking, color, config.showSpeakerImages[index] !== false ? assets.speakerImages[index] : null);
        });
    }

    // Subtitles
    drawSubtitles(ctx, context);
  }
};
