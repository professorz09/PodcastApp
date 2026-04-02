import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles, drawSideStats, drawScores } from './utils';

export const modernTheme: Theme = {
  id: 'modern',
  name: 'Modern',
  description: 'Clean, circular speaker indicators with pulse effect.',
  properties: [
    { id: 'speakerColorA', label: 'Speaker A Color', type: 'color', defaultValue: '#3b82f6' },
    { id: 'speakerColorB', label: 'Speaker B Color', type: 'color', defaultValue: '#ef4444' },
    { id: 'baseRadius', label: 'Circle Radius', type: 'number', defaultValue: 80, min: 40, max: 150 },
    { id: 'pulseIntensity', label: 'Pulse Intensity', type: 'number', defaultValue: 10, min: 0, max: 50 },
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
    
    const showSpeakers = config.showSpeakers;

    // Background
    drawBackground(ctx, assets, currentSegment, canvasWidth, canvasHeight, config.backgroundDim);

    // Timer
    if (config.showTimer) {
         ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
         ctx.beginPath();
         ctx.roundRect(canvasWidth / 2 - 80, 20, 160, 60, 30);
         ctx.fill();
         
         ctx.fillStyle = '#fff';
         ctx.font = 'bold 32px sans-serif';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';

         if (currentSegment.speaker === 'Narrator') {
             if (!(config.showSubtitles && config.subtitleBackground)) {
                 ctx.fillText('NARRATOR', canvasWidth / 2, 50);
             }
         } else {
             const segmentStartTime = context.segmentOffsets[currentSegmentIndex] || 0;
             const segmentEndTime = context.segmentOffsets[currentSegmentIndex + 1] || context.totalDuration;
             
             const segmentDuration = Math.max(0, segmentEndTime - segmentStartTime);
             const segmentElapsed = Math.max(0, time - segmentStartTime);
             const timeLeft = Math.max(0, Math.ceil(segmentDuration - segmentElapsed));

             ctx.fillText(`${timeLeft}s`, canvasWidth / 2, 50);
         }
    }

    // Speakers
    const baseRadius = (themeConfig?.baseRadius || 80) * config.speakerScale;
    const pulseIntensity = themeConfig?.pulseIntensity || 10;

    const drawSpeaker = (label: string, xPct: number, yPct: number, isActive: boolean, color: string, image: HTMLImageElement | null) => {
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
          ctx.beginPath();
          ctx.arc(x, y, baseRadius + 15 + (audioLevel * 40), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + (audioLevel * 0.7)})`;
          ctx.lineWidth = 4 + (audioLevel * 12);
          ctx.stroke();
          
          // Glow
          ctx.save();
          ctx.shadowBlur = 10 + (audioLevel * 30);
          ctx.shadowColor = color;
          ctx.stroke();
          ctx.restore();
      }

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label.toUpperCase(), x, y + baseRadius + 40);
    };

    if (showSpeakers) {
        speakerIds.forEach((id, index) => {
            const isSpeaking = isPlaying && currentSegment.speaker === id;
            const label = speakerLabels[index] || id;
            const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
            const color = colors[index % colors.length];
            
            drawSpeaker(label, pos.x, pos.y, isSpeaking, color, config.showSpeakerImages[index] !== false ? assets.speakerImages[index] : null);
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
