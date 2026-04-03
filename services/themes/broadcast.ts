import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles, drawSideStats } from './utils';

export const broadcastTheme: Theme = {
  id: 'broadcast',
  name: 'Broadcast',
  description: 'Professional TV-style layout with top bar and timer.',
  properties: [
    { id: 'barColor', label: 'Bar Color', type: 'color', defaultValue: '#0f172a' },
    { id: 'timerBgColor', label: 'Timer BG Color', type: 'color', defaultValue: '#1e293b' },
    { id: 'speakerColorA', label: 'Speaker A Color', type: 'color', defaultValue: '#3b82f6' },
    { id: 'speakerColorB', label: 'Speaker B Color', type: 'color', defaultValue: '#ef4444' },
    { id: 'showWaveforms', label: 'Show Waveforms', type: 'boolean', defaultValue: true },
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
    const showWaveforms = themeConfig?.showWaveforms !== undefined ? themeConfig.showWaveforms : true;

    const isNarrator = currentSegment.speaker === 'Narrator';

    // Background
    drawBackground(ctx, assets, currentSegment, canvasWidth, canvasHeight, config.backgroundDim);

    // --- Top Bar Components ---
    const topY = 0;
    const boxHeight = 60; 
    
    // Helper for Glowing Box
    const drawGlowBox = (x: number, y: number, w: number, h: number, color: string, align: 'left' | 'right' | 'center') => {
        ctx.save();
        
        // Outer Glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // Darker background
        
        ctx.beginPath();
        
        // Extend box upwards to hide top border
        const drawY = y - 10;
        const drawH = h + 10;

        // Round corners based on alignment
        if (align === 'left') {
             ctx.roundRect(x, drawY, w, drawH, [0, 0, 12, 0]);
        } else if (align === 'right') {
             ctx.roundRect(x, drawY, w, drawH, [0, 0, 0, 12]);
        } else {
             ctx.roundRect(x, drawY, w, drawH, [0, 0, 12, 12]);
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Inner Accent Line
        ctx.fillStyle = color;
        if (align === 'left') {
            ctx.fillRect(x, drawY, 4, drawH);
        } else if (align === 'right') {
            ctx.fillRect(x + w - 4, drawY, 4, drawH);
        } else {
            ctx.fillRect(x, drawY + drawH - 4, w, 4); // Bottom line for center
        }

        ctx.restore();
    };

    const showScores = config.showScores;
    const showTimer = config.showTimer;

    // Timer Logic
    let timerText = "00:00";
    if (showTimer) {
         const segmentStartTime = context.segmentOffsets[currentSegmentIndex] || 0;
         const segmentEndTime = context.segmentOffsets[currentSegmentIndex + 1] || context.totalDuration;
         const segmentDuration = Math.max(0, segmentEndTime - segmentStartTime);
         const segmentElapsed = Math.max(0, time - segmentStartTime);
         const timeLeft = Math.max(0, Math.ceil(segmentDuration - segmentElapsed));
         
         const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
         const s = (timeLeft % 60).toString().padStart(2, '0');
         timerText = `${m}:${s}`;
    }

    // Draw Top Boxes
    if (speakerIds.length === 2) {
        // Standard 2-Speaker Layout
        const speakerA = speakerIds[0];
        const speakerB = speakerIds[1];
        const isSpeakingA = isPlaying && currentSegment.speaker === speakerA;
        const isSpeakingB = isPlaying && currentSegment.speaker === speakerB;
        const colorA = colors[0];
        const colorB = colors[1];

        const getBoxWidth = (isSpeaking: boolean) => {
            if (showScores && showTimer) return isSpeaking ? 220 : 100;
            if (showScores && !showTimer) return 100;
            if (!showScores && showTimer) return isSpeaking ? 140 : 0;
            return 0;
        };

        const leftWidth = getBoxWidth(isSpeakingA);
        const rightWidth = getBoxWidth(isSpeakingB);

        // Left Box
        if (leftWidth > 0) {
            drawGlowBox(0, topY, leftWidth, boxHeight, colorA, 'left');
            if (showScores) {
                const scoreA = context.scores?.scoreA || "0"; // TODO: Map correctly
                ctx.fillStyle = colorA;
                ctx.font = 'bold 36px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const showTimerHere = showTimer && isSpeakingA;
                const scoreAX = showTimerHere ? 50 : leftWidth / 2;
                ctx.shadowColor = colorA;
                ctx.shadowBlur = 10;
                ctx.fillText(scoreA, scoreAX, topY + boxHeight / 2 + 2);
                ctx.shadowBlur = 0;
            }
            if (showTimer && isSpeakingA) {
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 24px sans-serif';
                ctx.textAlign = showScores ? 'right' : 'center';
                const timerX = showScores ? leftWidth - 20 : leftWidth / 2;
                ctx.fillText(timerText, timerX, topY + boxHeight / 2 + 2);
            }
        }

        // Right Box
        if (rightWidth > 0) {
            const rightBoxX = canvasWidth - rightWidth;
            drawGlowBox(rightBoxX, topY, rightWidth, boxHeight, colorB, 'right');
            if (showScores) {
                const scoreB = context.scores?.scoreB || "0"; // TODO: Map correctly
                ctx.fillStyle = colorB;
                ctx.font = 'bold 36px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const showTimerHere = showTimer && isSpeakingB;
                const scoreBX = showTimerHere ? rightBoxX + rightWidth - 50 : rightBoxX + rightWidth / 2;
                ctx.shadowColor = colorB;
                ctx.shadowBlur = 10;
                ctx.fillText(scoreB, scoreBX, topY + boxHeight / 2 + 2);
                ctx.shadowBlur = 0;
            }
            if (showTimer && isSpeakingB) {
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 24px sans-serif';
                ctx.textAlign = showScores ? 'left' : 'center';
                const timerX = showScores ? rightBoxX + 20 : rightBoxX + rightWidth / 2;
                ctx.fillText(timerText, timerX, topY + boxHeight / 2 + 2);
            }
        }
    } else {
        // Multi-Speaker Layout (or 1 speaker)
        // Just show a center timer box if timer is on
        if (showTimer && !isNarrator) {
             const timerWidth = 140;
             const timerX = (canvasWidth - timerWidth) / 2;
             drawGlowBox(timerX, topY, timerWidth, boxHeight, '#fff', 'center');
             
             ctx.fillStyle = '#fff';
             ctx.font = 'bold 28px sans-serif';
             ctx.textAlign = 'center';
             ctx.textBaseline = 'middle';
             ctx.fillText(timerText, canvasWidth / 2, topY + boxHeight / 2 + 2);
        }
    }

    // Center Names / Narrator
    const centerX = canvasWidth / 2;
    const nameY = topY + boxHeight / 2;
    
    if (isNarrator) {
        if (!(config.showSubtitles && config.subtitleBackground)) {
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 10;
            ctx.fillText("NARRATOR", centerX, nameY);
            ctx.shadowBlur = 0;
        }
    } else {
        // Draw Active Speaker Name(s)
        // If 2 speakers: Left/Right names
        // If != 2: Just show active speaker name in center
        
        if (speakerIds.length === 2) {
            const speakerA = speakerIds[0];
            const speakerB = speakerIds[1];
            const isSpeakingA = isPlaying && currentSegment.speaker === speakerA;
            const isSpeakingB = isPlaying && currentSegment.speaker === speakerB;
            const labelA = speakerLabels[0] || speakerA;
            const labelB = speakerLabels[1] || speakerB;

            const drawName = (label: string, x: number, align: CanvasTextAlign, active: boolean) => {
                ctx.font = '900 32px sans-serif';
                ctx.textAlign = align;
                ctx.textBaseline = 'middle';
                
                if (active) {
                    const textMetrics = ctx.measureText(label.toUpperCase());
                    const textWidth = textMetrics.width;
                    const paddingX = 20;
                    const paddingY = 10;
                    
                    const badgeWidth = textWidth + paddingX * 2;
                    const badgeHeight = 32 + paddingY * 2;
                    
                    const badgeX = align === 'right' ? x - textWidth - paddingX : x - paddingX;
                    const badgeY = nameY - badgeHeight / 2;
                    
                    // Draw red background box
                    const gradient = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeHeight);
                    gradient.addColorStop(0, '#ff4b4b');
                    gradient.addColorStop(1, '#dc2626');
                    ctx.fillStyle = gradient;
                    
                    ctx.beginPath();
                    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 10);
                    ctx.fill();
                    
                    // Add a subtle glow
                    ctx.shadowColor = 'rgba(220, 38, 38, 0.6)';
                    ctx.shadowBlur = 15;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    
                    ctx.fillStyle = '#000000'; // Black text for active
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                }
                
                ctx.fillText(label.toUpperCase(), x, nameY);
            };

            drawName(labelA, centerX - 10, 'right', isSpeakingA);
            drawName(labelB, centerX + 10, 'left', isSpeakingB);

            // Waveforms (Only for 2 speakers layout for now)
            // ... (Waveform logic)
        } else {
            // Generic Active Speaker Name
            const activeIndex = speakerIds.indexOf(currentSegment.speaker);
            if (activeIndex !== -1) {
                const label = speakerLabels[activeIndex] || currentSegment.speaker;
                const color = colors[activeIndex % colors.length];
                
                ctx.font = '900 36px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = 20;
                ctx.fillText(label.toUpperCase(), centerX, nameY + (showTimer ? 60 : 0)); // Move down if timer is there
                ctx.shadowBlur = 0;
            }
        }
    }
    
    // Speakers (Circles)
    const baseRadius = 80 * config.speakerScale;
    const pulseIntensity = 10;

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

    // Subtitles
    drawSubtitles(ctx, context);
  }
};
