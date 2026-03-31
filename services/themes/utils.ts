import { DrawContext } from './types';

export const drawBackground = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, assets: any, currentSegment: any, width: number, height: number, dimLevel: number = 0) => {
  const segmentBgUrl = currentSegment.visualConfig?.backgroundUrl;
  const segmentBgColor = currentSegment.visualConfig?.backgroundColor;
  
  let bgToDraw = assets.background;
  let videoToDraw = assets.backgroundVideo;
  let colorToDraw = assets.backgroundColor;

  // Segment overrides
  if (segmentBgUrl && assets.segmentBackgrounds.has(segmentBgUrl)) {
      bgToDraw = assets.segmentBackgrounds.get(segmentBgUrl) || null;
      videoToDraw = null;
      colorToDraw = null;
  } else if (segmentBgColor) {
      bgToDraw = null;
      videoToDraw = null;
      colorToDraw = segmentBgColor;
  }

  if (videoToDraw) {
    // Check if video is ready to play
    if (videoToDraw.readyState >= 2) {
        const scale = Math.max(width / videoToDraw.videoWidth, height / videoToDraw.videoHeight);
        const x = (width / 2) - (videoToDraw.videoWidth / 2) * scale;
        const y = (height / 2) - (videoToDraw.videoHeight / 2) * scale;
        ctx.drawImage(videoToDraw, x, y, videoToDraw.videoWidth * scale, videoToDraw.videoHeight * scale);
        
        // Apply Dimming
        if (dimLevel > 0) {
            ctx.fillStyle = `rgba(0,0,0,${dimLevel})`;
            ctx.fillRect(0, 0, width, height);
        }
    } else {
        // Fallback to black if video not ready
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
    }
  } else if (bgToDraw) {
    const scale = Math.max(width / bgToDraw.width, height / bgToDraw.height);
    const x = (width / 2) - (bgToDraw.width / 2) * scale;
    const y = (height / 2) - (bgToDraw.height / 2) * scale;
    ctx.drawImage(bgToDraw, x, y, bgToDraw.width * scale, bgToDraw.height * scale);
    
    // Apply Dimming
    if (dimLevel > 0) {
        ctx.fillStyle = `rgba(0,0,0,${dimLevel})`;
        ctx.fillRect(0, 0, width, height);
    }
  } else if (colorToDraw) {
    ctx.fillStyle = colorToDraw;
    ctx.fillRect(0, 0, width, height);
    
    // Apply Dimming
    if (dimLevel > 0) {
        ctx.fillStyle = `rgba(0,0,0,${dimLevel})`;
        ctx.fillRect(0, 0, width, height);
    }
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#f3f4f6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
};

export const drawSubtitles = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, context: DrawContext) => {
  const { config, currentSegmentIndex, script, time, segmentOffsets, themeConfig } = context;
  let currentSegment = script[currentSegmentIndex];
  
  if (!config.showSubtitles) return;

  let isQuestionModeActive = false;
  if (config.questionMode) {
      // Find the most recent Narrator segment
      let lastNarratorSegment = null;
      for (let i = currentSegmentIndex; i >= 0; i--) {
          if (script[i].speaker === 'Narrator') {
              lastNarratorSegment = script[i];
              break;
          }
      }
      
      if (lastNarratorSegment) {
          currentSegment = lastNarratorSegment;
          isQuestionModeActive = true;
      } else {
          // If there's no Narrator segment before this, don't show subtitles in question mode
          return;
      }
  }

  if (!currentSegment || !currentSegment.text) return;

  const subtitleConfig = currentSegment.visualConfig?.subtitleConfig || {
      x: 192, y: 550, w: 896, h: 150, fontSize: 1, backgroundColor: 'rgba(0,0,0,0.8)', textColor: '#ffffff'
  };

  const text = currentSegment.text;
  const fontSize = 32 * subtitleConfig.fontSize;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  
  const maxWidth = subtitleConfig.w - (60 * subtitleConfig.fontSize);
  
  let visibleLines: string[] = [];
  const segmentStartTime = segmentOffsets[currentSegmentIndex] || 0;
  const relativeTime = time - segmentStartTime;

  if (isQuestionModeActive) {
      // In question mode, we want to show the full text statically, no animation.
      const words = text.split(' ');
      let line = '';
      for(let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          visibleLines.push(line.trim());
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      if (line.trim()) visibleLines.push(line.trim());
  } else if (currentSegment.phraseTimings && currentSegment.phraseTimings.length > 0) {
      // Find the active phrase based on current time
      // Find the most recent phrase that has started
      const pastPhrases = currentSegment.phraseTimings.filter(p => p.start <= relativeTime);
      
      let currentText = "";
      if (pastPhrases.length > 0) {
          const activePhrase = pastPhrases[pastPhrases.length - 1];
          // Keep showing the phrase for a short moment after it ends, 
          // but ONLY if the next phrase hasn't started yet.
          // Since we took the last phrase that started, if we are here, the next phrase hasn't started.
          if (relativeTime <= activePhrase.end + 0.5) {
              currentText = activePhrase.text;
          }
      }

      // Word wrap the current phrase
      const words = currentText.split(' ');
      let line = '';
      for(let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
              visibleLines.push(line.trim());
              line = words[n] + ' ';
          } else {
              line = testLine;
          }
      }
      if (line.trim()) visibleLines.push(line.trim());

  } else if (currentSegment.wordTimings && currentSegment.wordTimings.length > 0) {
      // Find the active word based on current time
      const pastWords = currentSegment.wordTimings.filter(w => w.start <= relativeTime);
      
      let currentIndex = -1;
      if (pastWords.length > 0) {
          const lastWord = pastWords[pastWords.length - 1];
          if (relativeTime <= lastWord.end + 0.5) {
              currentIndex = currentSegment.wordTimings.indexOf(lastWord);
          }
      }

      let currentText = "";
      if (currentIndex !== -1) {
          // Find phrase start
          let startIndex = currentIndex;
          while (startIndex > 0) {
              const prevWord = currentSegment.wordTimings[startIndex - 1];
              const currWord = currentSegment.wordTimings[startIndex];
              const isPunctuation = /[.!?]$/.test(prevWord.word);
              const isGap = (currWord.start - prevWord.end) > 0.8;
              if (isPunctuation || isGap || (currentIndex - startIndex >= 12)) {
                  break;
              }
              startIndex--;
          }
          
          // Find phrase end
          let endIndex = currentIndex;
          while (endIndex < currentSegment.wordTimings.length - 1) {
              const currWord = currentSegment.wordTimings[endIndex];
              const nextWord = currentSegment.wordTimings[endIndex + 1];
              const isPunctuation = /[.!?]$/.test(currWord.word);
              const isGap = (nextWord.start - currWord.end) > 0.8;
              if (isPunctuation || isGap || (endIndex - startIndex >= 12)) {
                  break;
              }
              endIndex++;
          }

          const phraseWords = currentSegment.wordTimings.slice(startIndex, endIndex + 1);
          currentText = phraseWords.map(w => w.word).join(' ');
      }

      // Word wrap the current phrase
      const words = currentText.split(' ');
      let line = '';
      for(let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
              visibleLines.push(line.trim());
              line = words[n] + ' ';
          } else {
              line = testLine;
          }
      }
      if (line.trim()) visibleLines.push(line.trim());

  } else {
      // Fallback to old linear logic if no phrase timings
      const words = text.split(' ');
      let line = '';
      const lines: string[] = [];
      for(let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          lines.push(line.trim());
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line.trim());

      let duration = currentSegment.duration || 1;
      if (!isFinite(duration) || duration <= 0) duration = 1;
      
      const progress = Math.min(relativeTime / duration, 1);
      const visibleWordCount = Math.floor(progress * words.length);

      let wordCounter = 0;
      let activeLineIndex = 0;
      for (let i = 0; i < lines.length; i++) {
          const lineWords = lines[i].split(' ').length;
          if (visibleWordCount >= wordCounter && visibleWordCount < wordCounter + lineWords) {
              activeLineIndex = i;
              break;
          }
          wordCounter += lineWords;
      }
      if (visibleWordCount >= words.length) activeLineIndex = lines.length - 1;

      const mode = subtitleConfig.mode || 'full-word';
      if (mode === 'full-static') {
          visibleLines = lines;
      } else if (mode === 'line-static' || mode === 'line-word' || mode === 'full-word') {
          visibleLines = [lines[activeLineIndex] || ''];
      }
  }

  const lineHeight = fontSize * 1.5;
  const totalHeight = visibleLines.length * lineHeight;
  const bx = subtitleConfig.x;
  const by = subtitleConfig.y;
  const bw = subtitleConfig.w;
  const bh = Math.max(subtitleConfig.h, totalHeight + (60 * subtitleConfig.fontSize));

  if (config.subtitleBackground) {
      const boxStyle = (config.theme === 'transparent-avatars' && themeConfig?.subtitleBoxStyle) ? themeConfig.subtitleBoxStyle : 'classic';
      
      if (config.theme === 'transparent-avatars' && boxStyle === 'comic') {
          // White background with black border
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 4;
          const br = 12 * subtitleConfig.fontSize;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, br);
          ctx.fill();
          ctx.stroke();
          
          if (currentSegment.speaker !== 'Narrator') {
              const speakerIndex = config.speakerIds.indexOf(currentSegment.speaker);
              if (speakerIndex !== -1) {
                  const speakerName = config.speakerLabels[speakerIndex] || currentSegment.speaker;
                  const shortName = speakerName.split(' ')[0]; // First word only
                  
                  ctx.font = `bold ${24 * subtitleConfig.fontSize}px 'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', sans-serif`;
                  const nameMetrics = ctx.measureText(shortName);
                  const nameW = nameMetrics.width + 40;
                  const nameH = 40 * subtitleConfig.fontSize;
                  const nameX = bx + (bw / 2) - (nameW / 2);
                  const nameY = by - (nameH / 2);
                  
                  // Black box for name
                  ctx.fillStyle = '#000000';
                  ctx.beginPath();
                  ctx.roundRect(nameX, nameY, nameW, nameH, 8);
                  ctx.fill();
                  
                  // White text for name
                  ctx.fillStyle = '#ffffff';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(shortName, nameX + nameW / 2, nameY + nameH / 2 + 2);
              }
          }
      } else if (config.theme === 'transparent-avatars' && boxStyle === 'minimal') {
          // Minimal style: just a semi-transparent dark box, no speaker name
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          const br = 12 * subtitleConfig.fontSize;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, br);
          ctx.fill();
      } else {
          // Classic style
          ctx.fillStyle = subtitleConfig.backgroundColor;
          const br = 20 * subtitleConfig.fontSize;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, br);
          ctx.fill();

          // Configurable border (borderWidth 0 = no border)
          const bw2 = subtitleConfig.borderWidth ?? 0;
          if (bw2 > 0) {
              ctx.strokeStyle = subtitleConfig.borderColor || '#ffffff';
              ctx.lineWidth = bw2 * subtitleConfig.fontSize;
              ctx.stroke();
          }
          
          if (currentSegment.speaker !== 'Narrator') {
              const speakerIndex = config.speakerIds.indexOf(currentSegment.speaker);
              if (speakerIndex !== -1) {
                  const colors = [
                      themeConfig?.speakerColorA || (config.theme === 'neon' ? '#00ff00' : '#3b82f6'),
                      themeConfig?.speakerColorB || (config.theme === 'neon' ? '#ff0000' : '#ef4444'),
                      '#eab308', // Yellow
                      '#22c55e'  // Green
                  ];
                  const speakerColor = colors[speakerIndex % colors.length];
                  const speakerName = config.speakerLabels[speakerIndex] || currentSegment.speaker;
                  
                  ctx.save();
                  ctx.font = `bold ${24 * subtitleConfig.fontSize}px sans-serif`;
                  const text = speakerName.toUpperCase();
                  const textMetrics = ctx.measureText(text);
                  const textWidth = textMetrics.width;
                  const textHeight = 24 * subtitleConfig.fontSize;
                  const paddingX = 16 * subtitleConfig.fontSize;
                  const paddingY = 8 * subtitleConfig.fontSize;
                  
                  const badgeW = textWidth + paddingX * 2;
                  const badgeH = textHeight + paddingY * 2;
                  
                  let badgeX;
                  if (speakerIndex % 2 === 0) {
                      badgeX = bx + 20;
                  } else {
                      badgeX = bx + bw - badgeW - 20;
                  }
                  const badgeY = by - badgeH / 2;
                  
                  ctx.fillStyle = subtitleConfig.backgroundColor || 'rgba(0, 0, 0, 0.8)';
                  ctx.beginPath();
                  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8 * subtitleConfig.fontSize);
                  ctx.fill();
                  
                  ctx.strokeStyle = '#000000';
                  ctx.lineWidth = 2 * subtitleConfig.fontSize;
                  ctx.stroke();
                  
                  ctx.fillStyle = speakerColor;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(text, badgeX + badgeW / 2, badgeY + badgeH / 2 + 2);
                  ctx.restore();
              }
          }
      }
  } else {
      // If background is off, add shadow/stroke to make text readable
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
  }

  if (config.showVuMeter && config.vuMeterStyle === 'bar' && currentSegment.speaker !== 'Narrator' && config.subtitleBackground) {
      const speakerIndex = config.speakerIds.indexOf(currentSegment.speaker);
      if (speakerIndex !== -1) {
          const colors = [
              themeConfig?.speakerColorA || (config.theme === 'neon' ? '#00ff00' : '#3b82f6'),
              themeConfig?.speakerColorB || (config.theme === 'neon' ? '#ff0000' : '#ef4444'),
              '#eab308',
              '#22c55e'
          ];
          const speakerColor = colors[speakerIndex % colors.length];

          const barWidth = 12 * subtitleConfig.fontSize;
          const barX = (speakerIndex % 2 === 0) ? bx - barWidth - 8 : bx + bw + 8;
          // Background: always full box height
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(barX, by, barWidth, bh);
          // Active fill: grows from bottom based on audioLevel
          const fillH = bh * Math.min(1, context.audioLevel);
          const fillY = by + bh - fillH;
          ctx.fillStyle = speakerColor;
          ctx.shadowColor = speakerColor;
          ctx.shadowBlur = 12;
          ctx.fillRect(barX, fillY, barWidth, fillH);
          // White cap at top of fill
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(barX - 2, fillY - 2, barWidth + 4, 3);
          ctx.shadowBlur = 0;
      }
  }

  if (currentSegment.speaker === 'Narrator') {
      // Narrator Style: use configured color (default gold)
      ctx.fillStyle = config.narratorTextColor || '#eab308';
      const boxStyle = (config.theme === 'transparent-avatars' && themeConfig?.subtitleBoxStyle) ? themeConfig.subtitleBoxStyle : 'classic';
      if (config.theme === 'transparent-avatars' && config.subtitleBackground && boxStyle === 'comic') {
          ctx.font = `bold ${fontSize}px 'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', sans-serif`;
      } else {
          ctx.font = `bold ${fontSize}px sans-serif`;
      }
      
      if (!config.subtitleBackground) {
          // If background is off, add shadow/stroke to make text readable
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
      } else {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
      }
  } else {
      // Regular Speaker Style
      const boxStyle = (config.theme === 'transparent-avatars' && themeConfig?.subtitleBoxStyle) ? themeConfig.subtitleBoxStyle : 'classic';
      if (config.theme === 'transparent-avatars' && config.subtitleBackground && boxStyle === 'comic') {
          ctx.fillStyle = '#000000'; // Black text on white background
          ctx.font = `bold ${fontSize}px 'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', sans-serif`;
      } else {
          ctx.fillStyle = subtitleConfig.textColor;
          ctx.font = `bold ${fontSize}px sans-serif`;
      }

      if (!config.subtitleBackground) {
          // If background is off, add shadow/stroke to make text readable
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
      } else {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
      }
  }

  // Draw Narrator name above subtitle box
  if (currentSegment.speaker === 'Narrator' && config.subtitleBackground) {
      ctx.save();
      ctx.font = `bold ${24 * subtitleConfig.fontSize}px sans-serif`;
      const text = 'NARRATOR';
      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;
      const textHeight = 24 * subtitleConfig.fontSize;
      const paddingX = 16 * subtitleConfig.fontSize;
      const paddingY = 8 * subtitleConfig.fontSize;
      
      const badgeW = textWidth + paddingX * 2;
      const badgeH = textHeight + paddingY * 2;
      const badgeX = bx + bw / 2 - badgeW / 2;
      const badgeY = by - badgeH / 2;
      const badgeCY = badgeY + badgeH / 2;
      const fs = subtitleConfig.fontSize;

      ctx.fillStyle = subtitleConfig.backgroundColor || 'rgba(0, 0, 0, 0.8)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8 * fs);
      ctx.fill();
      
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2 * fs;
      ctx.stroke();
      
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, badgeX + badgeW / 2, badgeCY + 2);
      ctx.restore();
  }

  ctx.textAlign = 'center';
  const textBlockHeight = visibleLines.length * lineHeight;
  
  // Center vertically
  const textStartY = by + (bh - textBlockHeight) / 2 + (fontSize * 0.3);

  visibleLines.forEach((l, i) => {
      ctx.fillText(l, bx + bw / 2, textStartY + (i * lineHeight));
  });
  
  // Draw Settings Handles
  if (config.showSettings) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      const handleSize = 10;
      const sh = bh; // Use actual drawn height for handles
      
      ctx.fillRect(bx - handleSize/2, by - handleSize/2, handleSize, handleSize);
      ctx.fillRect(bx + bw - handleSize/2, by - handleSize/2, handleSize, handleSize);
      ctx.fillRect(bx - handleSize/2, by + sh - handleSize/2, handleSize, handleSize);
      ctx.fillRect(bx + bw - handleSize/2, by + sh - handleSize/2, handleSize, handleSize);
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, sh);
  }

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
};

export const drawSideStats = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, context: DrawContext) => {
    const { config, script, currentSegmentIndex, audioLevel, themeConfig } = context;
    const { width: canvasWidth, height: canvasHeight } = ctx.canvas;
    const { speakerIds } = config;

    if (!config.showSideStats) return;
    
    // Only support side stats for first 2 speakers for now
    if (speakerIds.length < 2) return;

    const speakerA = speakerIds[0];
    const speakerB = speakerIds[1];

    let totalA = 0;
    let totalB = 0;
    let currentA = 0;
    let currentB = 0;

    script.forEach((seg, idx) => {
        if (seg.speaker === speakerA) {
            totalA++;
            if (idx <= currentSegmentIndex) currentA++;
        } else if (seg.speaker === speakerB) {
            totalB++;
            if (idx <= currentSegmentIndex) currentB++;
        }
    });

    const isSpeakingA = script[currentSegmentIndex]?.speaker === speakerA;
    const isSpeakingB = script[currentSegmentIndex]?.speaker === speakerB;

    const drawSidePanel = (isLeft: boolean, total: number, current: number, isActive: boolean, color: string) => {
        const margin = 30;
        const boxSize = 12;
        const gap = 8;
        const meterWidth = 12;
        const spacing = 15;
        
        // Dots Height (Actual)
        const dotsHeight = Math.max(0, total * (boxSize + gap) - gap);
        const dotsY = canvasHeight / 2 - dotsHeight / 2;
        
        let dotsX: number;
        let meterX: number;

        if (isLeft) {
            // [VU] [Dots]
            meterX = margin;
            dotsX = margin + meterWidth + spacing;
        } else {
            // [Dots] [VU]
            meterX = canvasWidth - margin - meterWidth;
            dotsX = canvasWidth - margin - meterWidth - spacing - boxSize;
        }

        // Draw Dots
        for (let i = 0; i < total; i++) {
            const y = dotsY + i * (boxSize + gap);
            ctx.beginPath();
            const isCompleted = i < current;
            const isCurrent = i === current - 1;

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

            ctx.fillRect(dotsX, y, boxSize, boxSize);
            ctx.shadowBlur = 0;
        }

        // VU Meter (Side Bar)
        if (config.showVuMeter) {
            // Fixed height to at least 8 dots
            const minDots = 8;
            const meterDots = Math.max(total, minDots);
            const meterHeight = Math.max(0, meterDots * (boxSize + gap) - gap);
            const meterY = canvasHeight / 2 - meterHeight / 2;

            if (meterDots > 0) {
                // Always draw meter background
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.fillRect(meterX, meterY, meterWidth, meterHeight);

                if (isActive) {
                    // Ensure minimum visibility if active
                    const effectiveLevel = Math.max(0.05, audioLevel); 
                    const activeHeight = meterHeight * effectiveLevel;
                    const activeY = meterY + meterHeight - activeHeight;
                    
                    // Gradient for VU meter
                    const gradient = ctx.createLinearGradient(meterX, meterY, meterX, meterY + meterHeight);
                    gradient.addColorStop(0, '#ef4444'); // Red at top
                    gradient.addColorStop(0.3, '#eab308'); // Yellow
                    gradient.addColorStop(1, color); // Speaker color at bottom
                    
                    ctx.fillStyle = gradient;
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 20;
                    ctx.fillRect(meterX, activeY, meterWidth, activeHeight);
                    
                    // Add a "cap" or indicator at the top of the level
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(meterX - 2, activeY - 2, meterWidth + 4, 4);
                    
                    ctx.shadowBlur = 0;
                }
            }
        }
    };

    const colorA = themeConfig?.speakerColorA || (config.theme === 'neon' ? '#00ff00' : '#3b82f6');
    const colorB = themeConfig?.speakerColorB || (config.theme === 'neon' ? '#ff0000' : '#ef4444');

    drawSidePanel(true, totalA, currentA, isSpeakingA, colorA);
    drawSidePanel(false, totalB, currentB, isSpeakingB, colorB);
};

export const drawScores = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, context: DrawContext) => {
    const { config, scores, themeConfig } = context;
    const { width: canvasWidth } = ctx.canvas;
    const { speakerIds } = config;

    if (!config.showScores || !scores) return;
    
    // Only support scores for first 2 speakers for now
    if (speakerIds.length < 2) return;

    const drawScoreBox = (isLeft: boolean, score: string, color: string) => {
        const boxW = 140;
        const boxH = 60;
        const margin = 20;
        const x = isLeft ? margin : canvasWidth - margin - boxW;
        const y = 20;

        // Background
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, y, boxW, boxH, 12);
        ctx.fill();

        // Shadow/Glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(score, x + boxW / 2, y + boxH / 2 + 2);
    };

    const colorA = themeConfig?.speakerColorA || (config.theme === 'neon' ? '#00ff00' : '#3b82f6');
    const colorB = themeConfig?.speakerColorB || (config.theme === 'neon' ? '#ff0000' : '#ef4444');

    drawScoreBox(true, scores.scoreA, colorA);
    drawScoreBox(false, scores.scoreB, colorB);
};
