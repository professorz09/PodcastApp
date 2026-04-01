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

    // --- Speaker Cards ---
    const drawArenaCard = (label: string, subLabel: string, score: string, xPct: number, yPct: number, isActive: boolean, color: string, image: HTMLImageElement | null) => {
        const x = xPct * canvasWidth;
        const y = yPct * canvasHeight;
        
        const cardW = 160 * config.speakerScale;
        const cardH = 200 * config.speakerScale;
        const scale = isActive ? 1.05 : 1.0;
        const w = cardW * scale;
        const h = cardH * scale;
        
        const rectX = x - w / 2;
        const rectY = y - h / 2;

        ctx.save();
        
        // Card Body
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, w, h, 20);
        ctx.fill();

        // Active Glow
        if (isActive) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 30;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Score
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${48 * scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(score, x, rectY + h * 0.4);

        // Divider
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rectX + 20, rectY + h * 0.65);
        ctx.lineTo(rectX + w - 20, rectY + h * 0.65);
        ctx.stroke();

        // Name
        ctx.font = `bold ${18 * scale}px sans-serif`;
        ctx.fillText(label.toUpperCase(), x, rectY + h * 0.75);

        // Sublabel
        ctx.font = `${12 * scale}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(subLabel.toUpperCase(), x, rectY + h * 0.88);

        // VU Meter (Subtle)
        if (config.showVuMeter && isActive) {
            const meterW = w - 40;
            const meterH = 8;
            const meterX = rectX + 20;
            const meterY = rectY + h - 15;
            
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.beginPath();
            ctx.roundRect(meterX, meterY, meterW, meterH, 4);
            ctx.fill();
            
            ctx.fillStyle = '#fff';
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 10 + (audioLevel * 10);
            ctx.beginPath();
            ctx.roundRect(meterX, meterY, meterW * audioLevel, meterH, 4);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    };

    if (showSpeakers) {
        speakerIds.forEach((id, index) => {
            const isSpeaking = isPlaying && currentSegment.speaker === id;
            const label = speakerLabels[index] || id;
            const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
            const color = colors[index % colors.length];
            
            // Determine sublabel and score
            // For now, map index 0 to 'SUPPORTER' and index 1 to 'OPPONENT' if 2 speakers
            // Otherwise just 'SPEAKER X'
            let subLabel = `SPEAKER ${index + 1}`;
            if (speakerIds.length === 2) {
                subLabel = index === 0 ? 'SUPPORTER' : 'OPPONENT';
            }
            
            // Map scores: index 0 -> scoreA, index 1 -> scoreB, others -> 0
            let score = "0";
            if (index === 0) score = context.scores.scoreA;
            if (index === 1) score = context.scores.scoreB;

            drawArenaCard(
                label, 
                subLabel, 
                score, 
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
