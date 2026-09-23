// services/whiteboardRenderer.ts
// Renders the Phone Studio 2-style white grid whiteboard roadmap
// for debate dilemmas, showing the question sheet, active question highlight,
// and red marker strike-throughs as questions are covered.

export interface WhiteboardBoardConfig {
  enabled?: boolean;
  title: string;
  questions: string[];
  speakerName?: string;
}

export function drawWhiteboardRoadmap(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  progress: number,
  board: WhiteboardBoardConfig,
  doneCount = 0,
  activeIndex = -1,
  options?: {
    showSpokenSubtitle?: boolean;
    offsetY?: number;
  }
): void {
  if (!board || !board.questions || board.questions.length === 0) return;

  const isLandscape = w > h;
  const offsetY = options?.offsetY ?? 0;

  // Slide animation parameters
  const SLIDE_IN = 0.15;
  const SLIDE_OUT = 0.15;
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
  const easeInCubic = (t: number) => t * t * t;

  // Responsive dimensions - positioned in upper/mid portion so bottom black area is reserved for yellow subtitles
  const cardW = isLandscape ? Math.min(w * 0.76, 960) : w * 0.92;
  const cardH = isLandscape ? Math.min(h * 0.65, 480) : h * 0.64;
  const cx = w / 2;
  const restCy = offsetY + (isLandscape ? h * 0.37 : h * 0.36);
  const offscreenCy = offsetY - cardH; // fully above the visible frame

  let cy: number;
  let alpha: number;
  if (progress < SLIDE_IN) {
    const t = easeOutCubic(progress / SLIDE_IN);
    cy = offscreenCy + (restCy - offscreenCy) * t;
    alpha = Math.min(1, progress / 0.03); // quick fade so top edge doesn't abruptly pop
  } else if (progress > 1 - SLIDE_OUT) {
    const t = easeInCubic((progress - (1 - SLIDE_OUT)) / SLIDE_OUT);
    cy = restCy + (offscreenCy - restCy) * t;
    alpha = 1;
  } else {
    cy = restCy;
    alpha = 1;
  }

  const rx = cx - cardW / 2;
  const ry = cy - cardH / 2;
  const corner = Math.min(cardW, cardH) * 0.024;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, offsetY, w, h);
  ctx.clip();
  ctx.globalAlpha = alpha;

  // 1. Drop shadow & White paper base
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = Math.min(cardW * 0.05, 48);
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(rx, ry, cardW, cardH, corner);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetY = 0;

  // Clip content inside the rounded board
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rx, ry, cardW, cardH, corner);
  ctx.clip();

  // 2. White grid-paper graph lines
  const gridStep = Math.max(16, cardW * 0.032);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = rx; x <= rx + cardW; x += gridStep) {
    ctx.moveTo(x, ry);
    ctx.lineTo(x, ry + cardH);
  }
  for (let y = ry; y <= ry + cardH; y += gridStep) {
    ctx.moveTo(rx, y);
    ctx.lineTo(rx + cardW, y);
  }
  ctx.stroke();

  // 3. Top Accent & Header Title (only if a specific non-default title is provided)
  const isDefaultTitle = !board.title || 
    board.title.trim().toUpperCase() === 'DEBATE ROADMAP' || 
    board.title.trim().toUpperCase() === 'DEBATE QUESTIONS';
  
  let listTop = ry + cardH * 0.08;
  if (!isDefaultTitle && board.title.trim()) {
    const baseTitleFs = Math.max(17, cardW * 0.032);
    const headerTopY = ry + cardH * 0.085;

    // Board Title
    const displayTitle = board.title.trim().toUpperCase();
    const maxTitleW = cardW * 0.86;
    let actualTitleFs = baseTitleFs;
    ctx.font = `900 ${actualTitleFs}px -apple-system, system-ui, sans-serif`;
    const titleMetrics = ctx.measureText(displayTitle);
    if (titleMetrics.width > maxTitleW) {
      actualTitleFs = Math.max(13, actualTitleFs * (maxTitleW / titleMetrics.width));
    }

    ctx.font = `900 ${actualTitleFs}px -apple-system, system-ui, sans-serif`;
    ctx.fillStyle = '#dc2626';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.02em';
    ctx.fillText(displayTitle, rx + cardW / 2, headerTopY);
    ctx.letterSpacing = '0';

    // Subtle separator line
    ctx.strokeStyle = 'rgba(220, 38, 38, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx + cardW * 0.08, headerTopY + actualTitleFs * 0.58);
    ctx.lineTo(rx + cardW * 0.92, headerTopY + actualTitleFs * 0.58);
    ctx.stroke();

    listTop = headerTopY + actualTitleFs * 0.95;
  }

  // 4. Questions list layout & auto-scaling
  // Subtitles are rendered outside at the bottom as requested, so the board has maximum breathing room
  const bottomReserve = cardH * 0.05;
  const listH = (ry + cardH - bottomReserve) - listTop;
  const textX = rx + cardW * 0.07;
  const maxTextW = cardW * 0.86;
  const MIN_FS = 11;

  const wrapAt = (size: number): string[][] => {
    ctx.font = `700 ${size}px -apple-system, system-ui, sans-serif`;
    return board.questions.map((q, i) => {
      const label = `${i + 1}. ${q}`;
      const words = label.split(' ').filter(Boolean);
      const lines: string[] = [];
      let cur = '';
      for (const word of words) {
        const test = cur ? cur + ' ' + word : word;
        if (ctx.measureText(test).width > maxTextW && cur) {
          lines.push(cur);
          cur = word;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      return lines;
    });
  };

  const stackHeight = (lines: string[][], lineH: number, gap: number) =>
    lines.reduce((acc, ls) => acc + ls.length * lineH + gap, -gap);

  let fs = Math.max(14, cardW * 0.026);
  let lh = fs * 1.25;
  let rowGap = fs * 0.8;
  let allLines = wrapAt(fs);

  while (fs > MIN_FS && stackHeight(allLines, lh, rowGap) > listH) {
    fs *= 0.92;
    lh = fs * 1.25;
    rowGap = fs * 0.8;
    allLines = wrapAt(fs);
  }

  ctx.textAlign = 'left';
  ctx.font = `700 ${fs}px -apple-system, system-ui, sans-serif`;

  let cursorY = listTop;
  board.questions.forEach((q, i) => {
    const lines = allLines[i];
    const blockH = lines.length * lh;
    const blockCy = cursorY + blockH / 2;
    const startY = cursorY + fs * 0.8;

    const isActive = i === activeIndex;
    const isDone = i < doneCount;

    // Active pill background highlight
    if (isActive) {
      const pillPad = fs * 0.4;
      const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
      ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
      ctx.beginPath();
      ctx.roundRect(
        textX - pillPad,
        cursorY - pillPad * 0.3,
        Math.min(maxTextW, widest + pillPad * 2),
        blockH + pillPad * 0.8,
        6
      );
      ctx.fill();

      // Left blue accent bar
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(textX - pillPad, cursorY, 3, blockH + pillPad * 0.3);
    }

    // Question text color
    if (isActive) {
      ctx.fillStyle = '#2563eb'; // Vibrant blue for active sub-question
    } else if (isDone) {
      ctx.fillStyle = '#64748b'; // Slate gray for completed points
    } else {
      ctx.fillStyle = '#0f172a'; // Deep charcoal for upcoming points
    }

    lines.forEach((line, li) => {
      ctx.fillText(line, textX, startY + li * lh);
    });

    // Strike-through line across completed questions
    if (isDone) {
      const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
      ctx.strokeStyle = '#dc2626'; // Red marker line
      ctx.lineWidth = Math.max(2, fs * 0.09);
      ctx.beginPath();
      ctx.moveTo(textX - fs * 0.2, blockCy);
      ctx.lineTo(textX + widest + fs * 0.2, blockCy);
      ctx.stroke();
    }

    cursorY += blockH + rowGap;
  });

  ctx.restore(); // Restore clip inside board
  ctx.restore(); // Restore global context
}

/**
 * Renders the separate Summary Card at the end of the video.
 * Displays each point heading sequentially:
 * - Each point becomes visible only when it is reached/spoken
 * - Shows only the point's clean heading
 * - Highlights the currently spoken point with a vivid blue active badge
 * - Previously spoken points remain cleanly visible in completed state (without strike-throughs)
 */
export function drawSummaryCard(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  progress: number,
  board: WhiteboardBoardConfig,
  revealCount: number,
  activeRevealIndex: number = -1,
  options?: {
    offsetY?: number;
  }
): void {
  if (!board || !board.questions || board.questions.length === 0) return;

  const isLandscape = w > h;
  const offsetY = options?.offsetY ?? 0;

  // Slide animation parameters
  const SLIDE_IN = 0.12;
  const SLIDE_OUT = 0.12;
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
  const easeInCubic = (t: number) => t * t * t;

  const cardW = isLandscape ? Math.min(w * 0.78, 980) : w * 0.92;
  const cardH = isLandscape ? Math.min(h * 0.68, 500) : h * 0.66;
  const cx = w / 2;
  const restCy = offsetY + (isLandscape ? h * 0.38 : h * 0.36);
  const offscreenCy = offsetY - cardH;

  let cy: number;
  let alpha: number;
  if (progress < SLIDE_IN) {
    const t = easeOutCubic(progress / SLIDE_IN);
    cy = offscreenCy + (restCy - offscreenCy) * t;
    alpha = Math.min(1, progress / 0.03);
  } else if (progress > 1 - SLIDE_OUT) {
    const t = easeInCubic((progress - (1 - SLIDE_OUT)) / SLIDE_OUT);
    cy = restCy + (offscreenCy - restCy) * t;
    alpha = 1;
  } else {
    cy = restCy;
    alpha = 1;
  }

  const rx = cx - cardW / 2;
  const ry = cy - cardH / 2;
  const corner = Math.min(cardW, cardH) * 0.024;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, offsetY, w, h);
  ctx.clip();
  ctx.globalAlpha = alpha;

  // 1. Drop shadow & Crisp white card base
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = Math.min(cardW * 0.06, 52);
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(rx, ry, cardW, cardH, corner);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetY = 0;

  // Clip content inside card
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rx, ry, cardW, cardH, corner);
  ctx.clip();

  // 2. Whiteboard graph paper grid
  const gridStep = Math.max(16, cardW * 0.032);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = rx; x <= rx + cardW; x += gridStep) {
    ctx.moveTo(x, ry);
    ctx.lineTo(x, ry + cardH);
  }
  for (let y = ry; y <= ry + cardH; y += gridStep) {
    ctx.moveTo(rx, y);
    ctx.lineTo(rx + cardW, y);
  }
  ctx.stroke();

  // 3. Header: Clean "SUMMARY" or custom Topic Heading (Never generic "Debate Roadmap")
  const headerTopY = ry + cardH * 0.09;
  const baseTitleFs = Math.max(18, cardW * 0.033);
  let summaryTitle = 'SUMMARY';
  if (board.title && board.title.trim() && 
      board.title.trim().toUpperCase() !== 'DEBATE ROADMAP' && 
      board.title.trim().toUpperCase() !== 'DEBATE QUESTIONS') {
    summaryTitle = `${board.title.trim().toUpperCase()} — SUMMARY`;
  }

  const maxTitleW = cardW * 0.86;
  let actualTitleFs = baseTitleFs;
  ctx.font = `900 ${actualTitleFs}px -apple-system, system-ui, sans-serif`;
  let titleMetrics = ctx.measureText(summaryTitle);
  if (titleMetrics.width > maxTitleW) {
    actualTitleFs = Math.max(14, actualTitleFs * (maxTitleW / titleMetrics.width));
  }

  // Header Title with emerald green / royal blue summary accent
  ctx.font = `900 ${actualTitleFs}px -apple-system, system-ui, sans-serif`;
  ctx.fillStyle = '#059669'; // Emerald green summary header
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.04em';
  ctx.fillText(summaryTitle, rx + cardW / 2, headerTopY);
  ctx.letterSpacing = '0';

  // Separator line
  ctx.strokeStyle = 'rgba(5, 150, 105, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rx + cardW * 0.08, headerTopY + actualTitleFs * 0.55);
  ctx.lineTo(rx + cardW * 0.92, headerTopY + actualTitleFs * 0.55);
  ctx.stroke();

  // 4. Sequential Points Reveal: Only show points up to revealCount!
  const listTop = headerTopY + actualTitleFs * 0.95;
  const bottomReserve = cardH * 0.05;
  const listH = (ry + cardH - bottomReserve) - listTop;
  const textX = rx + cardW * 0.07;
  const maxTextW = cardW * 0.86;
  const MIN_FS = 12;

  // Extract clean heading for each question (strip question marks if pure heading desired, keep concise)
  const cleanHeadings = board.questions.map((q) => {
    return q.trim().replace(/^[\d.)\s-]+/, '');
  });

  const wrapHeading = (size: number): string[][] => {
    ctx.font = `700 ${size}px -apple-system, system-ui, sans-serif`;
    return cleanHeadings.map((heading, i) => {
      const label = `${i + 1}. ${heading}`;
      const words = label.split(' ').filter(Boolean);
      const lines: string[] = [];
      let cur = '';
      for (const word of words) {
        const test = cur ? cur + ' ' + word : word;
        if (ctx.measureText(test).width > maxTextW && cur) {
          lines.push(cur);
          cur = word;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      return lines;
    });
  };

  const stackHeight = (lines: string[][], lineH: number, gap: number) =>
    lines.reduce((acc, ls) => acc + ls.length * lineH + gap, -gap);

  let fs = Math.max(16, cardW * 0.028);
  let lh = fs * 1.28;
  let rowGap = fs * 0.85;
  let allLines = wrapHeading(fs);

  while (fs > MIN_FS && stackHeight(allLines, lh, rowGap) > listH) {
    fs *= 0.92;
    lh = fs * 1.28;
    rowGap = fs * 0.85;
    allLines = wrapHeading(fs);
  }

  ctx.textAlign = 'left';
  ctx.font = `700 ${fs}px -apple-system, system-ui, sans-serif`;

  let cursorY = listTop;
  board.questions.forEach((_, i) => {
    const lines = allLines[i];
    const blockH = lines.length * lh;
    const startY = cursorY + fs * 0.8;

    // Sequential reveal condition: ONLY visible if i < revealCount!
    const isVisible = i < revealCount;
    const isActive = i === activeRevealIndex;

    if (isVisible) {
      // Smooth fade & gentle scale pop for the newly appearing point
      if (isActive) {
        const pillPad = fs * 0.45;
        const widest = Math.max(...lines.map(l => ctx.measureText(l).width));

        // Active highlighted pill
        ctx.fillStyle = 'rgba(5, 150, 105, 0.10)';
        ctx.beginPath();
        ctx.roundRect(
          textX - pillPad,
          cursorY - pillPad * 0.3,
          Math.min(maxTextW, widest + pillPad * 2),
          blockH + pillPad * 0.8,
          8
        );
        ctx.fill();

        // Left accent bar (emerald green)
        ctx.fillStyle = '#059669';
        ctx.fillRect(textX - pillPad, cursorY, 4, blockH + pillPad * 0.3);

        // Checkmark / bullet icon
        ctx.font = `900 ${fs}px -apple-system, system-ui, sans-serif`;
        ctx.fillStyle = '#059669';
      } else {
        // Previously revealed points: solid high contrast slate/charcoal
        ctx.font = `700 ${fs}px -apple-system, system-ui, sans-serif`;
        ctx.fillStyle = '#1e293b';
      }

      lines.forEach((line, li) => {
        ctx.fillText(line, textX, startY + li * lh);
      });
    }

    cursorY += blockH + rowGap;
  });

  ctx.restore(); // Restore clip inside card
  ctx.restore(); // Restore global context
}

/**
 * Draws white bottom subtitles in the bottom black region
 * beneath the whiteboard card with crisp shadow, high-contrast dark stroke, and timing synchronization.
 */
export function drawWhiteboardSubtitles(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  segment: {
    text: string;
    phraseTimings?: { text: string; start: number; end: number }[];
    wordTimings?: { word: string; start: number; end: number }[];
    duration?: number;
    visualConfig?: any;
  },
  relTime: number,
  color = '#ffffff'
): void {
  if (!segment || !segment.text || !segment.text.trim()) return;

  const isLandscape = w > h;
  const cleanText = segment.text.replace(/\[[^\]]+\]/g, '').trim();
  if (!cleanText) return;

  // Max width for bottom subtitles
  const maxSubW = isLandscape ? Math.min(w * 0.86, 1040) : w * 0.92;
  const fs = Math.max(20, Math.min(30, Math.round(isLandscape ? w * 0.022 : w * 0.042)));

  ctx.save();
  ctx.font = `bold ${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

  // Helper to wrap text into lines within maxWidth
  const wrap = (t: string): string[] => {
    const words = t.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxSubW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  let visibleLines: string[] = [];

  if (segment.phraseTimings && segment.phraseTimings.length > 0) {
    const past = segment.phraseTimings.filter(p => p.start <= relTime);
    if (past.length > 0) {
      const active = past[past.length - 1];
      if (relTime <= active.end + 0.45) {
        visibleLines = wrap(active.text);
      }
    }
    if (visibleLines.length === 0 && past.length > 0) {
      visibleLines = wrap(past[past.length - 1].text);
    }
  } else if (segment.wordTimings && segment.wordTimings.length > 0) {
    const wt = segment.wordTimings;
    const past = wt.filter(item => item.start <= relTime);
    if (past.length > 0) {
      const last = past[past.length - 1];
      const curIdx = wt.indexOf(last);
      // Group words into natural phrase window
      let startIdx = curIdx;
      while (startIdx > 0) {
        const prev = wt[startIdx - 1];
        if (/[.!?]$/.test(prev.word) || (wt[startIdx].start - prev.end) > 0.6 || (curIdx - startIdx >= 8)) break;
        startIdx--;
      }
      let endIdx = curIdx;
      while (endIdx < wt.length - 1) {
        const curr = wt[endIdx];
        const next = wt[endIdx + 1];
        if (/[.!?]$/.test(curr.word) || (next.start - curr.end) > 0.6 || (endIdx - startIdx >= 14)) break;
        endIdx++;
      }
      const phraseText = wt.slice(startIdx, endIdx + 1).map(item => item.word).join(' ');
      visibleLines = wrap(phraseText);
    }
  }

  // Fallback: progress through whole text
  if (visibleLines.length === 0) {
    const allLines = wrap(cleanText);
    if (allLines.length <= 2) {
      visibleLines = allLines;
    } else {
      const dur = Math.max(0.1, segment.duration || 4);
      const prog = Math.min(1, Math.max(0, relTime / dur));
      const lineIdx = Math.min(Math.floor(prog * allLines.length), allLines.length - 1);
      if (lineIdx < allLines.length - 1) {
        visibleLines = [allLines[lineIdx], allLines[lineIdx + 1]];
      } else {
        visibleLines = [allLines[lineIdx]];
      }
    }
  }

  // Limit to max 2 lines to ensure plenty of breathing room
  const displayLines = visibleLines.slice(0, 2);
  if (displayLines.length === 0) {
    ctx.restore();
    return;
  }

  const lh = fs * 1.34;
  const bottomPadding = isLandscape ? Math.max(22, h * 0.04) : Math.max(26, h * 0.045);
  // Anchor the baseline of the bottom line near the bottom edge
  const startY = (h - bottomPadding) - (displayLines.length - 1) * lh;
  const centerX = w / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // 1. Text deep drop shadow (like intro subtitles)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  // 2. High-contrast stroke for pristine readability
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.lineWidth = Math.max(3, fs * 0.14);
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  displayLines.forEach((line, idx) => {
    const y = startY + idx * lh;
    ctx.strokeText(line, centerX, y);
  });

  // 3. Crisp white text fill
  ctx.shadowBlur = 0;
  ctx.fillStyle = color || '#ffffff';
  displayLines.forEach((line, idx) => {
    const y = startY + idx * lh;
    ctx.fillText(line, centerX, y);
  });

  ctx.restore();
}
