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

  // Question Mode: freeze on last Narrator segment
  let isQuestionModeActive = false;
  if (config.questionMode) {
    let lastNarrator = null;
    for (let i = currentSegmentIndex; i >= 0; i--) {
      if (script[i].speaker === 'Narrator') { lastNarrator = script[i]; break; }
    }
    if (lastNarrator) { currentSegment = lastNarrator; isQuestionModeActive = true; }
    else return;
  }

  if (!currentSegment || !currentSegment.text) return;

  const subtitleConfig = currentSegment.visualConfig?.subtitleConfig || {
    x: 192, y: 550, w: 896, h: 150, fontSize: 1,
    backgroundColor: 'rgba(0,0,0,0.85)', textColor: '#ffffff',
    borderColor: '#ffffff', borderWidth: 0, borderRadius: 20
  };

  const text = currentSegment.text;
  const fs = subtitleConfig.fontSize;
  const fontSize = 32 * fs;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  const maxWidth = subtitleConfig.w - (60 * fs);
  const mode = (subtitleConfig.mode as string) || 'phrase';

  // ── Helper: word-wrap ──────────────────────────────────────────
  const wrapText = (t: string): string[] => {
    if (!t.trim()) return [];
    const words = t.trim().split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line.trim());
        line = word + ' ';
      } else {
        line = test;
      }
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
  };

  // ── Compute wordTimings phrase boundary ───────────────────────
  const getPhraseWindow = (wt: {word: string; start: number; end: number}[], currentIndex: number) => {
    let startIndex = currentIndex;
    while (startIndex > 0) {
      const prev = wt[startIndex - 1];
      const curr = wt[startIndex];
      if (/[.!?]$/.test(prev.word) || (curr.start - prev.end) > 0.8 || (currentIndex - startIndex >= 12)) break;
      startIndex--;
    }
    let endIndex = currentIndex;
    while (endIndex < wt.length - 1) {
      const curr = wt[endIndex];
      const next = wt[endIndex + 1];
      if (/[.!?]$/.test(curr.word) || (next.start - curr.end) > 0.8 || (endIndex - startIndex >= 12)) break;
      endIndex++;
    }
    return { startIndex, endIndex };
  };

  // ── Determine visible lines based on mode + timing ────────────
  let visibleLines: string[] = [];
  const segStartTime = segmentOffsets[currentSegmentIndex] || 0;
  const relTime = time - segStartTime;

  if (isQuestionModeActive || mode === 'full-static') {
    visibleLines = wrapText(text);

  } else if (currentSegment.phraseTimings && currentSegment.phraseTimings.length > 0) {
    const pastPhrases = currentSegment.phraseTimings.filter((p: any) => p.start <= relTime);
    if (pastPhrases.length > 0) {
      const activePhrase = pastPhrases[pastPhrases.length - 1];
      if (relTime <= activePhrase.end + 0.5) {
        const phraseWords = activePhrase.text.trim().split(/\s+/);
        const pDur = Math.max(0.1, activePhrase.end - activePhrase.start);
        const pElapsed = relTime - activePhrase.start;
        const progress = Math.min(pElapsed / pDur, 1);

        if (mode === 'word') {
          const idx = Math.min(Math.floor(progress * phraseWords.length), phraseWords.length - 1);
          visibleLines = [phraseWords[idx] || ''];
        } else if (mode === 'mix') {
          const count = Math.max(1, Math.ceil(progress * phraseWords.length));
          visibleLines = wrapText(phraseWords.slice(0, count).join(' '));
        } else if (mode === 'line') {
          const allLines = wrapText(activePhrase.text);
          const lineIdx = Math.min(Math.floor(progress * allLines.length), allLines.length - 1);
          visibleLines = [allLines[lineIdx] || ''];
        } else {
          // phrase (default)
          visibleLines = wrapText(activePhrase.text);
        }
      }
    }

  } else if (currentSegment.wordTimings && currentSegment.wordTimings.length > 0) {
    const wt = currentSegment.wordTimings;
    const past = wt.filter((w: any) => w.start <= relTime);
    if (past.length > 0) {
      const lastWord = past[past.length - 1];
      if (relTime <= lastWord.end + 0.5) {
        const currentIdx = wt.indexOf(lastWord);
        if (mode === 'word') {
          visibleLines = [lastWord.word];
        } else {
          const { startIndex, endIndex } = getPhraseWindow(wt, currentIdx);
          if (mode === 'mix') {
            const acc = wt.slice(startIndex, currentIdx + 1).map((w: any) => w.word).join(' ');
            visibleLines = wrapText(acc);
          } else if (mode === 'line') {
            const phraseTxt = wt.slice(startIndex, endIndex + 1).map((w: any) => w.word).join(' ');
            const allLines = wrapText(phraseTxt);
            const posInPhrase = currentIdx - startIndex;
            let wordsCount = 0, activeLine = 0;
            for (let i = 0; i < allLines.length; i++) {
              const lw = allLines[i].split(' ').length;
              if (posInPhrase < wordsCount + lw) { activeLine = i; break; }
              wordsCount += lw; activeLine = i;
            }
            visibleLines = [allLines[activeLine] || ''];
          } else {
            // phrase (default)
            const phraseTxt = wt.slice(startIndex, endIndex + 1).map((w: any) => w.word).join(' ');
            visibleLines = wrapText(phraseTxt);
          }
        }
      }
    }

  } else {
    // Fallback: no timing data — progress-based
    const words = text.split(/\s+/);
    const allLines = wrapText(text);
    let dur = currentSegment.duration || 1;
    if (!isFinite(dur) || dur <= 0) dur = 1;
    const progress = Math.min(relTime / dur, 1);

    if (mode === 'word') {
      const idx = Math.min(Math.floor(progress * words.length), words.length - 1);
      visibleLines = [words[idx] || ''];
    } else if (mode === 'mix') {
      const count = Math.max(1, Math.ceil(progress * words.length));
      visibleLines = wrapText(words.slice(0, count).join(' '));
    } else if (mode === 'line') {
      const lineIdx = Math.min(Math.floor(progress * allLines.length), allLines.length - 1);
      visibleLines = [allLines[lineIdx] || ''];
    } else {
      // phrase: show current line at progress
      const wordIdx = Math.floor(progress * words.length);
      let counter = 0, activeLine = 0;
      for (let i = 0; i < allLines.length; i++) {
        const lw = allLines[i].split(' ').length;
        if (wordIdx >= counter && wordIdx < counter + lw) { activeLine = i; break; }
        counter += lw; activeLine = i;
      }
      visibleLines = [allLines[activeLine] || ''];
    }
  }

  // ── Layout ────────────────────────────────────────────────────
  const lineHeight = fontSize * 1.5;
  const totalHeight = visibleLines.length * lineHeight;
  const bx = subtitleConfig.x;
  const by = subtitleConfig.y;
  const bw = subtitleConfig.w;
  const bh = Math.max(subtitleConfig.h, totalHeight + (60 * fs));
  const br = (subtitleConfig.borderRadius ?? 20) * fs;

  // ── Speaker theme colours ─────────────────────────────────────
  const themeColors = [
    themeConfig?.speakerColorA || (config.theme === 'neon' ? '#00ff00' : '#3b82f6'),
    themeConfig?.speakerColorB || (config.theme === 'neon' ? '#ff0000' : '#ef4444'),
    '#eab308',
    '#22c55e',
  ];
  const badgeCustomColors = [
    config.nameBadgeColorA || themeColors[0],
    config.nameBadgeColorB || themeColors[1],
    themeColors[2],
    themeColors[3],
  ];

  // Effective badge style
  // transparent-avatars comic box-style overrides badge style to 'comic'
  const comicBoxActive = config.theme === 'transparent-avatars' &&
    (themeConfig?.subtitleBoxStyle === 'comic' || !themeConfig?.subtitleBoxStyle);
  const badgeStyle = comicBoxActive ? 'comic' : (config.nameBadgeStyle || 'classic');

  // ── Draw Box ──────────────────────────────────────────────────
  if (config.subtitleBackground) {
    if (comicBoxActive) {
      // transparent-avatars comic: white box, black border
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, br);
      ctx.fill();
      ctx.stroke();
    } else if (config.theme === 'transparent-avatars' && themeConfig?.subtitleBoxStyle === 'minimal') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, br);
      ctx.fill();
    } else {
      ctx.fillStyle = subtitleConfig.backgroundColor;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, br);
      ctx.fill();
      const borderW = subtitleConfig.borderWidth ?? 0;
      if (borderW > 0) {
        ctx.strokeStyle = subtitleConfig.borderColor || '#ffffff';
        ctx.lineWidth = borderW * fs;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, br);
        ctx.stroke();
      }
    }
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
  }

  // ── Draw Badge (speaker or narrator) ─────────────────────────
  if (config.subtitleBackground && config.showNameBadge !== false) {
    const isNarratorSeg = currentSegment.speaker === 'Narrator';
    const speakerIndex = config.speakerIds.indexOf(currentSegment.speaker);
    const hasKnownSpeaker = !isNarratorSeg && speakerIndex !== -1;

    const badgeFontSize = 22 * fs;
    ctx.save();
    ctx.font = `bold ${badgeFontSize}px sans-serif`;

    const rawName = isNarratorSeg ? 'NARRATOR' : (config.speakerLabels[speakerIndex] || currentSegment.speaker);
    const badgeText = rawName.toUpperCase();
    const tW = ctx.measureText(badgeText).width;
    const padX = 14 * fs;
    const padY = 7 * fs;
    const badgeW = tW + padX * 2;
    const badgeH = badgeFontSize + padY * 2;
    const badgeRadius = badgeStyle === 'pill' ? badgeH / 2 : 8 * fs;

    // X position: speaker alternates left/right; narrator centered
    let badgeX: number;
    if (isNarratorSeg || badgeStyle === 'comic') {
      badgeX = bx + bw / 2 - badgeW / 2;
    } else {
      badgeX = speakerIndex % 2 === 0 ? bx + 20 : bx + bw - badgeW - 20;
    }

    // Y position based on style
    let badgeY: number;
    if (badgeStyle === 'comic') {
      badgeY = by - badgeH / 2; // half inside box (transparent-avatars original style)
    } else {
      badgeY = by - badgeH - 6; // fully above box
    }

    // Colors
    let bgColor: string;
    let textColor = '#ffffff';
    if (badgeStyle === 'comic') {
      bgColor = '#000000';
    } else if (isNarratorSeg) {
      bgColor = subtitleConfig.backgroundColor || 'rgba(0,0,0,0.85)';
    } else {
      bgColor = badgeCustomColors[speakerIndex % badgeCustomColors.length];
    }

    if (badgeStyle === 'minimal') {
      // No background, just floating text with shadow
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = hasKnownSpeaker ? badgeCustomColors[speakerIndex % badgeCustomColors.length] : '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
      ctx.shadowBlur = 0;
    } else {
      // Draw badge background
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeRadius);
      ctx.fillStyle = bgColor;
      ctx.fill();

      if (badgeStyle !== 'comic' && !isNarratorSeg) {
        ctx.shadowColor = bgColor;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }

      if (badgeStyle === 'comic' || isNarratorSeg) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2 * fs;
        ctx.stroke();
      }

      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);
    }
    ctx.restore();
  }

  // ── VU Meter bar on subtitle ───────────────────────────────────
  if (config.showVuMeter && config.vuMeterStyle === 'bar' && currentSegment.speaker !== 'Narrator' && config.subtitleBackground) {
    const speakerIndex = config.speakerIds.indexOf(currentSegment.speaker);
    if (speakerIndex !== -1) {
      const speakerColor = themeColors[speakerIndex % themeColors.length];
      const barWidth = 12 * fs;
      const barX = speakerIndex % 2 === 0 ? bx - barWidth - 8 : bx + bw + 8;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(barX, by, barWidth, bh);
      const fillH = bh * Math.min(1, context.audioLevel);
      const fillY = by + bh - fillH;
      ctx.fillStyle = speakerColor;
      ctx.shadowColor = speakerColor;
      ctx.shadowBlur = 12;
      ctx.fillRect(barX, fillY, barWidth, fillH);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(barX - 2, fillY - 2, barWidth + 4, 3);
      ctx.shadowBlur = 0;
    }
  }

  // ── Set text style ────────────────────────────────────────────
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  if (currentSegment.speaker === 'Narrator') {
    ctx.fillStyle = config.narratorTextColor || '#eab308';
  } else if (comicBoxActive && config.subtitleBackground) {
    ctx.fillStyle = '#000000';
  } else {
    ctx.fillStyle = subtitleConfig.textColor || '#ffffff';
  }

  if (!config.subtitleBackground) {
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
  }

  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';

  // ── Draw Text ─────────────────────────────────────────────────
  const textBlockHeight = visibleLines.length * lineHeight;
  const textStartY = by + (bh - textBlockHeight) / 2 + (fontSize * 0.3);
  visibleLines.forEach((l, i) => {
    ctx.fillText(l, bx + bw / 2, textStartY + i * lineHeight);
  });

  // ── Settings Handles ──────────────────────────────────────────
  if (config.showSettings) {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    const hSize = 10;
    ctx.fillRect(bx - hSize/2, by - hSize/2, hSize, hSize);
    ctx.fillRect(bx + bw - hSize/2, by - hSize/2, hSize, hSize);
    ctx.fillRect(bx - hSize/2, by + bh - hSize/2, hSize, hSize);
    ctx.fillRect(bx + bw - hSize/2, by + bh - hSize/2, hSize, hSize);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
  }

  // Reset
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
