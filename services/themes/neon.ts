import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles, drawSideStats, drawScores } from './utils';

export const neonTheme: Theme = {
  id: 'neon',
  name: 'Neon',
  description: 'Cyberpunk style with glowing text and borders.',
  properties: [
    { id: 'glowColorA', label: 'Glow Color A', type: 'color', defaultValue: '#00ff00' },
    { id: 'glowColorB', label: 'Glow Color B', type: 'color', defaultValue: '#ff0000' },
    { id: 'showBar', label: 'Show Top Bar', type: 'boolean', defaultValue: true },
    { id: 'barColor', label: 'Bar Color', type: 'color', defaultValue: 'rgba(0,0,0,0.8)' },
  ],
  draw: (context: DrawContext) => {
    const { ctx, time, audioLevel, script, currentSegmentIndex, config, assets, themeConfig } = context;
    const { width: canvasWidth, height: canvasHeight } = ctx.canvas;
    const currentSegment = script[currentSegmentIndex];
    if (!currentSegment) return;

    const isPlaying = true;
    const { speakerIds, speakerLabels, speakerPositions } = config;
    
    // Use theme-specific override if available, otherwise fallback to global config
    const showSpeakers = config.showSpeakers;
    const showBar = themeConfig?.showBar !== undefined ? themeConfig.showBar : true;

    // Background
    drawBackground(ctx, assets, currentSegment, canvasWidth, canvasHeight, config.backgroundDim);

    // Top Bar
    if (showBar) {
        ctx.fillStyle = themeConfig?.barColor || 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, canvasWidth, 80);
    }

    // Timer
    if (config.showTimer) {
         ctx.fillStyle = '#fff';
         ctx.font = 'bold 32px sans-serif';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         ctx.shadowColor = '#0ff';
         ctx.shadowBlur = 10;

         if (currentSegment.speaker === 'Narrator') {
             if (!(config.showSubtitles && config.subtitleBackground)) {
                 ctx.fillText('NARRATOR', canvasWidth / 2, 40);
             }
         } else {
             const segmentStartTime = context.segmentOffsets[currentSegmentIndex] || 0;
             const segmentEndTime = context.segmentOffsets[currentSegmentIndex + 1] || context.totalDuration;
             
             const segmentDuration = Math.max(0, segmentEndTime - segmentStartTime);
             const segmentElapsed = Math.max(0, time - segmentStartTime);
             const timeLeft = Math.max(0, Math.ceil(segmentDuration - segmentElapsed));

             ctx.fillText(`${timeLeft}s`, canvasWidth / 2, 40);
         }
         ctx.shadowBlur = 0;
    }

    const drawNeonText = (text: string, x: number, color: string, active: boolean) => {
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = active ? '#fff' : '#333';
        
        if (active) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 20;
            ctx.fillText(text, x, 40);
        } else {
            ctx.shadowBlur = 0;
            ctx.fillText(text, x, 40);
        }
        ctx.shadowBlur = 0;
    };

    // Speakers (Circles)
    const baseRadius = 80 * config.speakerScale;
    const pulseIntensity = 10;

    const drawSpeaker = (xPct: number, yPct: number, isActive: boolean, color: string, image: HTMLImageElement | null, label: string) => {
      const x = xPct * canvasWidth;
      const y = yPct * canvasHeight;
      const pulse = isActive ? pulseIntensity * audioLevel : 0;
      
      if (isActive) {
          ctx.beginPath();
          ctx.arc(x, y, baseRadius + pulse + 10, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.3;
          ctx.fill();
          ctx.globalAlpha = 1.0;
          
          ctx.beginPath();
          ctx.arc(x, y, baseRadius + pulse, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
      ctx.clip();
      
      if (image) {
          const scale = Math.max((baseRadius * 2) / image.width, (baseRadius * 2) / image.height);
          const imgW = image.width * scale;
          const imgH = image.height * scale;
          ctx.drawImage(image, x - imgW/2, y - imgH/2, imgW, imgH);
      } else {
          ctx.fillStyle = '#1e293b';
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 64px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label.charAt(0).toUpperCase(), x, y);
      }
      ctx.restore();
      
      ctx.beginPath();
      ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = isActive ? '#fff' : '#334155';
      ctx.stroke();

      // VU Meter Ring
      if (config.showVuMeter && isActive && config.vuMeterStyle === 'ring') {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, baseRadius + 15 + (audioLevel * 40), 0, Math.PI * 2);
          
          // Dynamic glow based on audio level
          ctx.shadowBlur = 10 + (audioLevel * 40);
          ctx.shadowColor = color;
          
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + (audioLevel * 0.7)})`;
          ctx.lineWidth = 4 + (audioLevel * 16);
          ctx.stroke();
          
          // Outer faint ring
          ctx.beginPath();
          ctx.arc(x, y, baseRadius + 25 + (audioLevel * 60), 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.2 * audioLevel;
          ctx.lineWidth = 2;
          ctx.stroke();
          
          ctx.restore();
      }
    };

    const colors = [
        themeConfig?.glowColorA || '#00ff00',
        themeConfig?.glowColorB || '#ff0000',
        '#3b82f6', // Blue
        '#eab308'  // Yellow
    ];

    speakerIds.forEach((id, index) => {
        const isSpeaking = isPlaying && currentSegment.speaker === id;
        const label = speakerLabels[index] || id;
        const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
        const color = colors[index % colors.length];
        
        // Draw Name in Top Bar
        // Distribute names in top bar based on position x
        // Or just use the speaker position x but projected to top bar?
        // Let's stick to the original layout: names in top bar.
        // If we have > 2 speakers, we might need to squeeze them.
        drawNeonText(label, pos.x * canvasWidth, color, isSpeaking);

        if (showSpeakers) {
            drawSpeaker(pos.x, pos.y, isSpeaking, color, config.showSpeakerImages[index] !== false ? assets.speakerImages[index] : null, label);
        }
    });

    // Side Stats
    drawSideStats(ctx, context);

    // Scores
    drawScores(ctx, context);

    // Subtitles
    drawSubtitles(ctx, context);
  }
};
