import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles, drawSideStats } from './utils';

export const neonTheme: Theme = {
  id: 'neon',
  name: 'Neon',
  description: 'Cyberpunk style with glowing text and borders.',
  properties: [
    { id: 'glowColorA',      label: 'Glow Color A',          type: 'color',   defaultValue: '#00ff00' },
    { id: 'glowColorB',      label: 'Glow Color B',          type: 'color',   defaultValue: '#ff0000' },
    { id: 'showBar',         label: 'Show Top Bar',           type: 'boolean', defaultValue: true },
    { id: 'barColor',        label: 'Bar Color',              type: 'color',   defaultValue: 'rgba(0,0,0,0.8)' },
    { id: 'scoreStyle',      label: 'Score Style',            type: 'select',  defaultValue: 'neon-badge',
      options: ['neon-badge', 'glitch', 'dots', 'bar'] },
    { id: 'scorePosition',   label: 'Score Position',         type: 'select',  defaultValue: 'top',
      options: ['top', 'bottom'] },
  ],
  draw: (context: DrawContext) => {
    const { ctx, time, audioLevel, script, currentSegmentIndex, config, assets, themeConfig } = context;
    const { width: canvasWidth, height: canvasHeight } = ctx.canvas;
    const currentSegment = script[currentSegmentIndex];
    if (!currentSegment) return;

    const isPlaying = true;
    const { speakerIds, speakerLabels, speakerPositions } = config;
    
    const showSpeakers = config.showSpeakers;
    const showBar = themeConfig?.showBar !== undefined ? themeConfig.showBar : true;
    const scoreStyle: string = themeConfig?.scoreStyle || 'neon-badge';
    const scorePosition: string = themeConfig?.scorePosition || 'top';

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
      ctx.strokeStyle = isActive ? color : '#1a2a1a';
      ctx.shadowColor = isActive ? color : 'transparent';
      ctx.shadowBlur = isActive ? 15 + audioLevel * 20 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // VU Meter Ring
      if (config.showVuMeter && isActive && config.vuMeterStyle === 'ring') {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, baseRadius + 15 + (audioLevel * 40), 0, Math.PI * 2);
          ctx.shadowBlur = 10 + (audioLevel * 40);
          ctx.shadowColor = color;
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + (audioLevel * 0.7)})`;
          ctx.lineWidth = 4 + (audioLevel * 16);
          ctx.stroke();
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
        '#3b82f6',
        '#eab308'
    ];

    speakerIds.forEach((id, index) => {
        const isSpeaking = isPlaying && currentSegment.speaker === id;
        const label = speakerLabels[index] || id;
        const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
        const color = colors[index % colors.length];
        
        drawNeonText(label, pos.x * canvasWidth, color, isSpeaking);

        if (showSpeakers) {
            drawSpeaker(pos.x, pos.y, isSpeaking, color, config.showSpeakerImages[index] !== false ? assets.speakerImages[index] : null, label);
        }
    });

    // Side Stats
    drawSideStats(ctx, context);

    // ── Neon Score Boxes (custom, theme-matched) ────────────────────
    if (config.showScores && context.scores && speakerIds.length >= 2) {
        const scoreA = context.scores.scoreA;
        const scoreB = context.scores.scoreB;
        const colorA = themeConfig?.glowColorA || '#00ff00';
        const colorB = themeConfig?.glowColorB || '#ff0000';
        const labelA = speakerLabels?.[0] || speakerIds[0] || 'A';
        const labelB = speakerLabels?.[1] || speakerIds[1] || 'B';

        const isBottom = scorePosition === 'bottom';
        const posY = isBottom ? canvasHeight - 100 : 18;

        const drawNeonScoreBox = (isLeft: boolean, score: string, color: string, label: string) => {
            const margin = 18;

            if (scoreStyle === 'neon-badge') {
                // ── Neon Badge style ─────────────────────────
                const boxW = 150, boxH = 68;
                const x = isLeft ? margin : canvasWidth - margin - boxW;
                const y = posY;

                // Outer neon glow
                ctx.save();
                ctx.shadowColor = color;
                ctx.shadowBlur = 28;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(x, y, boxW, boxH, 6);
                ctx.stroke();
                ctx.restore();

                // Dark fill
                ctx.fillStyle = 'rgba(0,0,0,0.88)';
                ctx.beginPath();
                ctx.roundRect(x, y, boxW, boxH, 6);
                ctx.fill();

                // Corner accent lines
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.shadowColor = color;
                ctx.shadowBlur = 15;
                const corner = 14;
                // top-left
                ctx.beginPath(); ctx.moveTo(x + corner, y); ctx.lineTo(x, y); ctx.lineTo(x, y + corner); ctx.stroke();
                // top-right
                ctx.beginPath(); ctx.moveTo(x + boxW - corner, y); ctx.lineTo(x + boxW, y); ctx.lineTo(x + boxW, y + corner); ctx.stroke();
                // bottom-left
                ctx.beginPath(); ctx.moveTo(x + corner, y + boxH); ctx.lineTo(x, y + boxH); ctx.lineTo(x, y + boxH - corner); ctx.stroke();
                // bottom-right
                ctx.beginPath(); ctx.moveTo(x + boxW - corner, y + boxH); ctx.lineTo(x + boxW, y + boxH); ctx.lineTo(x + boxW, y + boxH - corner); ctx.stroke();
                ctx.restore();

                // Label
                ctx.fillStyle = color;
                ctx.font = 'bold 11px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.shadowColor = color;
                ctx.shadowBlur = 8;
                ctx.fillText(label.toUpperCase(), x + boxW / 2, y + 8);
                ctx.shadowBlur = 0;

                // Score
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 30px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = color;
                ctx.shadowBlur = 20;
                ctx.fillText(score, x + boxW / 2, y + boxH / 2 + 8);
                ctx.shadowBlur = 0;

            } else if (scoreStyle === 'glitch') {
                // ── Glitch style ──────────────────────────────
                const boxW = 130, boxH = 56;
                const x = isLeft ? margin : canvasWidth - margin - boxW;
                const y = posY;

                // Glitch offset layers
                const glitchOffset = Math.sin(time * 12) * 2;
                ctx.save();
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = color;
                ctx.font = 'bold 34px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(score, x + boxW / 2 + glitchOffset, y + boxH / 2);
                ctx.fillStyle = '#ff00ff';
                ctx.fillText(score, x + boxW / 2 - glitchOffset, y + boxH / 2);
                ctx.globalAlpha = 1;
                ctx.restore();

                // Dark bg
                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                ctx.fillRect(x, y, boxW, boxH);

                // Scanline effect
                for (let sy = y; sy < y + boxH; sy += 4) {
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    ctx.fillRect(x, sy, boxW, 2);
                }

                // Score
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 30px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = color;
                ctx.shadowBlur = 18;
                ctx.fillText(score, x + boxW / 2, y + boxH / 2);
                ctx.shadowBlur = 0;

                // Label
                ctx.fillStyle = color;
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = isLeft ? 'left' : 'right';
                ctx.textBaseline = 'top';
                ctx.fillText(label.toUpperCase(), isLeft ? x + 4 : x + boxW - 4, y + 4);

            } else if (scoreStyle === 'dots') {
                // ── Dots style (segment tracker) ─────────────
                const maxDots = 10;
                const scoreNum = parseFloat(score) || 0;
                const filledDots = Math.round((scoreNum / 10) * maxDots);
                const dotR = 9;
                const dotGap = 6;
                const totalW = maxDots * (dotR * 2) + (maxDots - 1) * dotGap;
                const startX = isLeft ? margin : canvasWidth - margin - totalW;
                const centerY = posY + dotR;

                // Label
                ctx.fillStyle = color;
                ctx.font = 'bold 11px monospace';
                ctx.textAlign = isLeft ? 'left' : 'right';
                ctx.textBaseline = 'bottom';
                ctx.shadowColor = color;
                ctx.shadowBlur = 8;
                ctx.fillText(`${label.toUpperCase()} · ${score}`, isLeft ? startX : startX + totalW, centerY - dotR - 4);
                ctx.shadowBlur = 0;

                for (let d = 0; d < maxDots; d++) {
                    const dotX = startX + d * (dotR * 2 + dotGap) + dotR;
                    const isFilled = d < filledDots;
                    ctx.beginPath();
                    ctx.arc(dotX, centerY, dotR, 0, Math.PI * 2);
                    ctx.fillStyle = isFilled ? color : 'rgba(255,255,255,0.08)';
                    ctx.shadowColor = isFilled ? color : 'transparent';
                    ctx.shadowBlur = isFilled ? 12 : 0;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }

            } else if (scoreStyle === 'bar') {
                // ── Bar style ─────────────────────────────────
                const barW = 18;
                const barMaxH = 100;
                const scoreNum = parseFloat(score) || 0;
                const fillH = (scoreNum / 10) * barMaxH;
                const x = isLeft ? margin : canvasWidth - margin - barW;
                const barBottom = posY + barMaxH;

                // Track
                ctx.fillStyle = 'rgba(255,255,255,0.07)';
                ctx.beginPath();
                ctx.roundRect(x, posY, barW, barMaxH, 4);
                ctx.fill();

                // Fill
                ctx.save();
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.roundRect(x, barBottom - fillH, barW, fillH, 4);
                ctx.fill();
                ctx.restore();

                // Score text
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(score, x + barW / 2, barBottom + 6);

                // Label
                ctx.fillStyle = color;
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(label.slice(0, 3).toUpperCase(), x + barW / 2, posY - 4);
            }
        };

        drawNeonScoreBox(true,  scoreA, colorA, labelA);
        drawNeonScoreBox(false, scoreB, colorB, labelB);
    }

    // Subtitles
    drawSubtitles(ctx, context);
  }
};
