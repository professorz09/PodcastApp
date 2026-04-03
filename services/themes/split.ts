import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles, drawScores, drawDebatePointCounter } from './utils';

export const splitTheme: Theme = {
  id: 'split',
  name: 'Split',
  description: 'Vertical split layout with large timer.',
  properties: [
    { id: 'timerColor', label: 'Timer Color', type: 'color', defaultValue: '#eab308' },
    { id: 'speakerColorA', label: 'Speaker A Color', type: 'color', defaultValue: '#3b82f6' },
    { id: 'speakerColorB', label: 'Speaker B Color', type: 'color', defaultValue: '#ef4444' },
    { id: 'showPointCounter',   label: '🏆 Debate Point Counter', type: 'boolean', defaultValue: false },
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
    
    // Use theme-specific override if available, otherwise fallback to global config
    const showSpeakers = config.showSpeakers;

    // Background
    drawBackground(ctx, assets, currentSegment, canvasWidth, canvasHeight, config.backgroundDim);

    // Timer (Top Center)
    if (config.showTimer) {
         ctx.fillStyle = themeConfig?.timerColor || '#eab308';
         ctx.font = 'bold 60px sans-serif';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';

         if (currentSegment.speaker === 'Narrator') {
             if (!(config.showSubtitles && config.subtitleBackground)) {
                 ctx.fillText('NARRATOR', canvasWidth / 2, 70);
             }
         } else {
             const segmentStartTime = context.segmentOffsets[currentSegmentIndex] || 0;
             const segmentEndTime = context.segmentOffsets[currentSegmentIndex + 1] || context.totalDuration;
             
             const segmentDuration = Math.max(0, segmentEndTime - segmentStartTime);
             const segmentElapsed = Math.max(0, time - segmentStartTime);
             const timeLeft = Math.max(0, Math.ceil(segmentDuration - segmentElapsed));

             ctx.fillText(`${timeLeft}`, canvasWidth / 2, 70);
         }
    }

    // Speakers (Large Cards)
    const drawSpeaker = (label: string, score: string, xPct: number, yPct: number, isActive: boolean, color: string, image: HTMLImageElement | null) => {
        const x = xPct * canvasWidth;
        const y = yPct * canvasHeight;
        
        const baseW = 200 * config.speakerScale; // Reduced from 320
        const baseH = 150 * config.speakerScale; // Reduced from 240
        const scaleFactor = isActive ? 1.1 : 1.0;
        const w = baseW * scaleFactor;
        const h = baseH * scaleFactor;
        
        const rectX = x - w/2;
        const rectY = y - h/2 + 30;
        
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, w, h, 15); // Slightly smaller radius
        ctx.clip();

        if (image) {
            const scale = Math.max(w / image.width, h / image.height);
            const imgW = image.width * scale;
            const imgH = image.height * scale;
            ctx.drawImage(image, rectX + w/2 - imgW/2, rectY + h/2 - imgH/2, imgW, imgH);
        } else {
            // Colorful fallback (like Arena theme)
            ctx.fillStyle = color;
            ctx.fillRect(rectX, rectY, w, h);
            
            // Subtle gradient for depth
            const gradient = ctx.createLinearGradient(rectX, rectY, rectX, rectY + h);
            gradient.addColorStop(0, 'rgba(255,255,255,0.2)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.1)');
            ctx.fillStyle = gradient;
            ctx.fillRect(rectX, rectY, w, h);

            // Large Initial
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = `bold ${60 * scaleFactor}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label.charAt(0).toUpperCase(), x, rectY + h/2);
        }
        ctx.restore();
        
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, w, h, 15);
        ctx.lineWidth = isActive ? 4 : 2; // Reduced line width
        ctx.strokeStyle = isActive ? color : '#333';
        
        if (isActive) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 20; // Reduced blur
        } else {
            ctx.shadowBlur = 0;
        }
        
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Score Badge (Replaces LIVE badge)
        // Always show score
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.roundRect(rectX + w - 60, rectY + h - 30, 50, 20, 4);
        ctx.fill();
        ctx.fillStyle = color; // Use speaker color for score
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(score, rectX + w - 35, rectY + h - 20);

        // VU Meter
        if (config.showVuMeter && isActive) {
            const barW = 8;
            const barX = rectX + w + 4;
            // Background: always full box height
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(barX, rectY, barW, h);
            // Active fill from bottom
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
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif'; // Reduced font
        ctx.textAlign = 'center';
        ctx.fillText(label.toUpperCase(), x, rectY + h + 25);
    };

    if (showSpeakers) {
        speakerIds.forEach((id, index) => {
            const isSpeaking = isPlaying && currentSegment.speaker === id;
            const label = speakerLabels[index] || id;
            const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
            const color = colors[index % colors.length];
            
            // Map scores
            let score = "0";
            if (index === 0) score = context.scores.scoreA;
            if (index === 1) score = context.scores.scoreB;

            drawSpeaker(
                label, 
                score, 
                pos.x, 
                pos.y, 
                isSpeaking, 
                color, 
                config.showSpeakerImages[index] !== false ? assets.speakerImages[index] : null
            );
        });
    }

    // Debate Point Counter
    drawDebatePointCounter(ctx, context);

    // Subtitles
    drawSubtitles(ctx, context);
  }
};
