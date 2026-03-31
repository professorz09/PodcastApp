import { Theme, DrawContext } from './types';
import { drawBackground, drawSubtitles } from './utils';

export const transparentAvatarsTheme: Theme = {
  id: 'transparent-avatars',
  name: 'Transparent PNGs',
  description: 'Upload transparent PNGs for speakers. Keeps original shape and size.',
  properties: [
    { id: 'timerColor', label: 'Timer Color', type: 'color', defaultValue: '#eab308' },
    { id: 'speakerColorA', label: 'Speaker A Glow', type: 'color', defaultValue: '#3b82f6' },
    { id: 'speakerColorB', label: 'Speaker B Glow', type: 'color', defaultValue: '#ef4444' },
    { id: 'nameBackgroundColor', label: 'Name Box Color', type: 'color', defaultValue: '#000000' },
    { id: 'nameBackgroundOpacity', label: 'Name Box Opacity', type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.1 },
    { id: 'baseSize', label: 'Image Size', type: 'number', defaultValue: 150, min: 50, max: 400 },
    { id: 'pulseIntensity', label: 'Pulse Intensity', type: 'number', defaultValue: 15, min: 0, max: 50 },
    { id: 'showSpeakers', label: 'Show Speakers', type: 'boolean', defaultValue: true },
    { id: 'showSpeakerNames', label: 'Show Speaker Names', type: 'boolean', defaultValue: true },
    { id: 'showScores', label: 'Show Scores', type: 'boolean', defaultValue: false },
    { id: 'subtitleBoxStyle', label: 'Subtitle Box Style', type: 'select', defaultValue: 'comic', options: ['comic', 'classic', 'minimal'] },
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
    const showSpeakerNames = themeConfig?.showSpeakerNames !== undefined ? themeConfig.showSpeakerNames : true;

    // Background
    drawBackground(ctx, assets, currentSegment, canvasWidth, canvasHeight, config.backgroundDim);

    // Timer
    if (config.showTimer) {
        const topY = 50;
        const timerW = 100;
        const timerH = 40;
        const timerX = canvasWidth / 2 - timerW / 2;
        const timerY = topY - timerH / 2;
        
        ctx.save();
        if (currentSegment.speaker !== 'Narrator') {
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
        } else {
            if (!(config.showSubtitles && config.subtitleBackground)) {
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 32px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('NARRATOR', canvasWidth / 2, topY);
            }
        }
        ctx.restore();
    }

    // Calculate Debate Points
    let totalA = 0, totalB = 0, currentA = 0, currentB = 0;
    if (speakerIds.length >= 2) {
        script.forEach((seg, idx) => {
            if (seg.speaker === speakerIds[0]) {
                totalA++;
                if (idx <= currentSegmentIndex) currentA++;
            } else if (seg.speaker === speakerIds[1]) {
                totalB++;
                if (idx <= currentSegmentIndex) currentB++;
            }
        });
    }

    // Speakers
    const baseSize = (themeConfig?.baseSize || 150) * config.speakerScale;
    const pulseIntensity = themeConfig?.pulseIntensity || 30;

    const drawSpeaker = (
        label: string, 
        score: string, 
        totalPoints: number, 
        currentPoints: number, 
        xPct: number, 
        yPct: number, 
        isActive: boolean, 
        color: string, 
        image: HTMLImageElement | null
    ) => {
      const x = xPct * canvasWidth;
      const y = yPct * canvasHeight;
      const pulse = isActive ? pulseIntensity * audioLevel : 0;
      
      let imgW = baseSize * 2;
      let imgH = baseSize * 2;

      if (image) {
          const targetSize = baseSize * 2;
          const baseScale = Math.min(targetSize / image.width, targetSize / image.height);
          const currentScale = baseScale * (1 + (pulse / targetSize));
          imgW = image.width * currentScale;
          imgH = image.height * currentScale;
          
          if (isActive) {
              ctx.shadowColor = color;
              ctx.shadowBlur = 30 + pulse;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;
          }
          
          ctx.drawImage(image, x - imgW/2, y - imgH/2, imgW, imgH);
          ctx.shadowBlur = 0;
      } else {
          const radius = baseSize;
          imgW = radius * 2.5; // Make it a horizontal rectangle (aada ayat)
          imgH = radius * 1.5;
          const rectX = x - imgW / 2;
          const rectY = y - imgH / 2;
          
          if (isActive) {
              ctx.beginPath();
              ctx.roundRect(rectX - pulse/2 - 5, rectY - pulse/2 - 5, imgW + pulse + 10, imgH + pulse + 10, 15);
              ctx.fillStyle = color;
              ctx.globalAlpha = 0.3;
              ctx.fill();
              ctx.globalAlpha = 1.0;
          }

          ctx.beginPath();
          ctx.roundRect(rectX, rectY, imgW, imgH, 15);
          ctx.fillStyle = '#1e293b';
          ctx.fill();
          
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 64px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label.charAt(0).toUpperCase(), x, y);
          
          ctx.beginPath();
          ctx.roundRect(rectX, rectY, imgW, imgH, 15);
          ctx.lineWidth = 4;
          ctx.strokeStyle = isActive ? '#fff' : '#334155';
          ctx.stroke();
      }

      // Score Badge (on top of image)
      if (config.showScores) {
          const badgeW = 80;
          const badgeH = 36;
          const badgeX = x + imgW/2 - badgeW + 10;
          const badgeY = y + imgH/2 - badgeH + 10;
          
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
          ctx.fill();
          
          ctx.fillStyle = color;
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(score, badgeX + badgeW/2, badgeY + badgeH/2 + 2);
      }

      const sideOffset = imgW / 2 + 10;

      // Debate Points (Left side of the speaker)
      if (config.showSideStats) {
          const boxSize = 10;
          const gap = 6;
          const dotsHeight = Math.max(0, totalPoints * (boxSize + gap) - gap);
          const dotsY = y - dotsHeight / 2;
          const dotsX = x - sideOffset - boxSize;

          for (let i = 0; i < totalPoints; i++) {
              const dotY = dotsY + i * (boxSize + gap);
              ctx.beginPath();
              const isCompleted = i < currentPoints;
              const isCurrent = i === currentPoints - 1;

              if (isCompleted) {
                  ctx.fillStyle = color;
                  ctx.shadowColor = color;
                  ctx.shadowBlur = 10;
              } else {
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                  ctx.shadowBlur = 0;
              }

              if (isCurrent && isActive) {
                  ctx.fillStyle = '#fff';
                  ctx.shadowColor = '#fff';
                  ctx.shadowBlur = 15;
              }

              ctx.fillRect(dotsX, dotY, boxSize, boxSize);
              ctx.shadowBlur = 0;
          }
      }

      // VU Meter (Right side of the speaker)
      if (config.showVuMeter) {
          const meterH = imgH;
          const meterX = x + sideOffset;
          const meterY = y - meterH / 2;

          if (config.vuMeterStyle === 'dots') {
              // --- Dots VU Meter ---
              const DOTS = 14;
              const dotR = Math.max(3, Math.min(6, meterH / (DOTS * 3)));
              const totalDotsH = DOTS * dotR * 2;
              const spacing = (meterH - totalDotsH) / (DOTS - 1);
              const dotX = meterX + dotR + 2;
              const activeDots = isActive
                  ? Math.round(Math.max(0.18, audioLevel) * DOTS)
                  : 0;

              for (let d = 0; d < DOTS; d++) {
                  const dotY = meterY + meterH - d * (dotR * 2 + spacing) - dotR;
                  const isLit = d < activeDots;
                  // Color gradient: bottom=green, mid=yellow, top=red
                  const pct = d / (DOTS - 1);
                  let dotColor: string;
                  if (!isLit) {
                      dotColor = 'rgba(255,255,255,0.10)';
                  } else if (pct < 0.5) {
                      dotColor = color;
                  } else if (pct < 0.8) {
                      dotColor = '#facc15'; // yellow
                  } else {
                      dotColor = '#ef4444'; // red
                  }
                  ctx.beginPath();
                  ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
                  ctx.fillStyle = dotColor;
                  if (isLit) {
                      ctx.shadowColor = dotColor;
                      ctx.shadowBlur = 6 + audioLevel * 10;
                  } else {
                      ctx.shadowBlur = 0;
                  }
                  ctx.fill();
              }
              ctx.shadowBlur = 0;
          } else {
              // --- Classic Bar VU Meter ---
              const meterW = 16;
              ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
              ctx.fillRect(meterX, meterY, meterW, meterH);
              if (isActive) {
                  const effectiveLevel = Math.max(0.15, audioLevel);
                  const activeHeight = meterH * effectiveLevel;
                  const activeY = meterY + meterH - activeHeight;
                  ctx.fillStyle = color;
                  ctx.shadowColor = color;
                  ctx.shadowBlur = 20 + (audioLevel * 40);
                  ctx.fillRect(meterX, activeY, meterW, activeHeight);
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(meterX - 2, activeY - 2, meterW + 4, 4);
                  ctx.shadowBlur = 0;
              }
          }
      }
    };

    if (showSpeakers) {
        speakerIds.forEach((id, index) => {
            const isSpeaking = isPlaying && currentSegment.speaker === id;
            const label = speakerLabels[index] || id;
            const pos = speakerPositions[index] || { x: 0.5, y: 0.5 };
            const color = colors[index % colors.length];
            
            let score = "0";
            let totalPts = 0;
            let currentPts = 0;
            if (index === 0) {
                score = context.scores?.scoreA || "0";
                totalPts = totalA;
                currentPts = currentA;
            } else if (index === 1) {
                score = context.scores?.scoreB || "0";
                totalPts = totalB;
                currentPts = currentB;
            }
            
            drawSpeaker(
                label, 
                score, 
                totalPts, 
                currentPts, 
                pos.x, 
                pos.y, 
                isSpeaking, 
                color, 
                config.showSpeakerImages ? assets.speakerImages[index] : null
            );
        });
    }

    // Draw Speaker Names (Top Left)
    const drawSpeakerNames = () => {
        if (speakerIds.length < 2) return;
        
        const startX = 30;
        let startY = 30;
        const boxH = 50;
        const gap = 15;

        speakerIds.forEach((id, index) => {
            if (index > 1) return; // Only first 2 speakers
            const label = speakerLabels[index] || id;
            const color = colors[index % colors.length];
            const isSpeaking = isPlaying && currentSegment.speaker === id;
            const bgColor = themeConfig?.nameBackgroundColor || '#000000';
            const bgOpacity = themeConfig?.nameBackgroundOpacity !== undefined ? themeConfig.nameBackgroundOpacity : 1;
            
            const boxY = startY + index * (boxH + gap);
            
            ctx.save();
            ctx.font = 'bold 24px sans-serif';
            const textMetrics = ctx.measureText(label.toUpperCase());
            const boxW = Math.max(180, textMetrics.width + 40);

            // Draw Box
            ctx.beginPath();
            ctx.roundRect(startX, boxY, boxW, boxH, 8);
            
            if (isSpeaking) {
                // Red gradient background for active speaker
                const gradient = ctx.createLinearGradient(startX, boxY, startX, boxY + boxH);
                gradient.addColorStop(0, '#ff4b4b');
                gradient.addColorStop(1, '#dc2626');
                ctx.fillStyle = gradient;
                ctx.fill();
                
                // Subtle red glow
                ctx.shadowColor = 'rgba(220, 38, 38, 0.6)';
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.shadowBlur = 0;
            } else {
                // Convert hex to rgba for opacity
                const hexToRgba = (hex: string, alpha: number) => {
                    if (!hex.startsWith('#')) return `rgba(0, 0, 0, ${alpha})`;
                    const r = parseInt(hex.slice(1, 3), 16);
                    const g = parseInt(hex.slice(3, 5), 16);
                    const b = parseInt(hex.slice(5, 7), 16);
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                };

                ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
                ctx.fill();
                
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Draw Text
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            if (isSpeaking) {
                ctx.fillStyle = '#ffffff';
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            }
            
            ctx.fillText(label.toUpperCase(), startX + boxW / 2, boxY + boxH / 2 + 2);
            ctx.restore();
        });
    };

    if (showSpeakers && showSpeakerNames) {
        drawSpeakerNames();
    }

    // Subtitles
    drawSubtitles(ctx, context);
  }
};
