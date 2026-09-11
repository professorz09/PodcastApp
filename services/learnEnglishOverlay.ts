import { DebateSegment } from '../types';

/**
 * Additive overlay for "Learn English" scripts — draws on top of whatever the
 * active theme already rendered. Purely additive: no-ops for any segment that
 * doesn't carry a `learnEnglish` tag, so normal (non-Learn-English) scripts
 * and every existing theme are completely unaffected.
 */
export const drawLearnEnglishOverlay = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  script: DebateSegment[],
  segmentOffsets: number[],
  currentSegmentIndex: number,
  time: number,
  narratorImage: HTMLImageElement | null = null,
) => {
  const seg = script[currentSegmentIndex];
  const tag = seg?.learnEnglish;
  if (!tag) return;

  const canvas = ctx.canvas;
  const W = canvas.width;
  const H = canvas.height;

  const segStart = segmentOffsets[currentSegmentIndex] ?? 0;
  const segEnd = segmentOffsets[currentSegmentIndex + 1] ?? (segStart + (seg.duration || 4));
  const segDur = Math.max(0.05, segEnd - segStart);
  const elapsed = Math.max(0, time - segStart);
  const progress = Math.min(1, elapsed / segDur);

  const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  if (tag.segmentType === 'narrator' && tag.explanation) {
    drawNarratorCard(ctx, W, H, tag.explanation, progress, ease, narratorImage);
  } else if (tag.segmentType === 'quiz' || Boolean(tag.quiz)) {
    const activeQuiz = tag.quiz || {
      question: seg.text || 'Question',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      answer: 'Option A',
    };
    drawQuizOverlay(ctx, W, H, activeQuiz, progress, ease);
  }
};

const wrapText = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const drawNarratorCard = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
  explanation: { phrase: string; meaning: string; example?: string },
  progress: number,
  ease: (t: number) => number,
  narratorImage: HTMLImageElement | null,
) => {
  const cardW = Math.min(460, W * 0.4);
  const cardX = W - cardW - 32;
  const cardTargetY = H - 220;

  // slide-in over the first 25% of the segment
  const slideT = ease(Math.min(1, progress / 0.25));
  const cardY = cardTargetY + (1 - slideT) * 40;
  const alpha = slideT;
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  const cardH = 168;
  ctx.fillStyle = 'rgba(10,14,20,0.92)';
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  ctx.stroke();

  // Narrator avatar — round portrait on the left, text column starts after it.
  const avatarSize = 64;
  const avatarX = cardX + 18;
  const avatarY = cardY + 18;
  let textX = cardX + 18;
  let textW = cardW - 36;
  if (narratorImage) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(narratorImage, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    textX = avatarX + avatarSize + 16;
    textW = cardW - (textX - cardX) - 18;
  } else {
    // "teacher" badge — only shown when there's no avatar to anchor the card
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(cardX + 18, cardY + 16, 110, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXPLAINER', cardX + 18 + 55, cardY + 16 + 15);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  const phraseLines = wrapText(ctx, `"${explanation.phrase}"`, textW);
  let ty = narratorImage ? cardY + 34 : cardY + 66;
  phraseLines.slice(0, 2).forEach((l) => {
    ctx.fillText(l, textX, ty);
    ty += 24;
  });

  ctx.fillStyle = '#a5f3fc';
  ctx.font = '15px sans-serif';
  const meaningLines = wrapText(ctx, explanation.meaning, textW);
  meaningLines.slice(0, 2).forEach((l) => {
    ctx.fillText(l, textX, ty);
    ty += 19;
  });

  if (explanation.example) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'italic 13px sans-serif';
    const exampleLines = wrapText(ctx, explanation.example, textW);
    if (exampleLines[0]) ctx.fillText(exampleLines[0], textX, ty);
  }

  ctx.restore();
};

const drawQuizOverlay = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
  quiz: {
    question: string;
    options?: string[];
    answer: string;
    theme?: 'light' | 'dark' | 'glass';
    position?: 'top' | 'center';
    revealTiming?: number;
    accentColor?: string;
    testReveal?: boolean;
  },
  progress: number,
  ease: (t: number) => number,
) => {
  const panelH = H;
  const panelW = W;
  const panelX = 0;
  const panelY = 0;

  // Reveal threshold (default 75%)
  const threshold = quiz.revealTiming ?? 0.75;
  const rawReveal = (progress - threshold) / Math.max(0.05, 1 - threshold);
  const isRevealed = quiz.testReveal || rawReveal > 0;
  const revealT = quiz.testReveal ? 1 : Math.max(0, Math.min(1, rawReveal));

  ctx.save();

  // Pure white background for quiz overlay
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.rect(panelX, panelY, panelW, panelH);
  ctx.fill();

  // Vertically centered content block
  const contentY = H / 2 - 160;

  // Chic "QUESTION" badge at top
  const badgeW = 120;
  const badgeH = 28;
  const badgeX = W / 2 - badgeW / 2;
  const badgeY = contentY + 10;
  ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 14);
  ctx.fill();
  ctx.fillStyle = '#b45309';
  ctx.font = '900 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('QUESTION', W / 2, badgeY + badgeH / 2);

  // Question Text
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const qLines = wrapText(ctx, quiz.question, panelW * 0.85);
  let qy = badgeY + 65;
  qLines.slice(0, 2).forEach((l) => {
    ctx.fillText(l, W / 2, qy);
    qy += 38;
  });

  // Options (if provided) — correct one highlights green once revealed
  if (quiz.options?.length) {
    const optCount = quiz.options.length;
    const cols = Math.min(2, optCount);
    const optGapX = 20;
    const optGapY = 16;
    const optW = (panelW * 0.82 - (cols - 1) * optGapX) / cols;
    const optH = 58;
    
    let totalW = cols * optW + (cols - 1) * optGapX;
    let startX = W / 2 - totalW / 2;
    let startY = qy + 16;

    quiz.options.forEach((opt, optIdx) => {
      const isCorrect = isRevealed && opt.trim().toLowerCase() === quiz.answer.trim().toLowerCase();
      const col = optIdx % cols;
      const row = Math.floor(optIdx / cols);
      const ox = startX + col * (optW + optGapX);
      const oy = startY + row * (optH + optGapY);

      if (isCorrect) {
        ctx.fillStyle = '#22c55e';
        ctx.shadowColor = 'rgba(34, 197, 94, 0.35)';
        ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = '#f8fafc';
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.roundRect(ox, oy, optW, optH, 14);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Option border
      ctx.strokeStyle = isCorrect ? '#16a34a' : 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = isCorrect ? 3 : 1.5;
      ctx.stroke();

      // Option Letter prefix (A, B, C, D) inside badge
      const letter = String.fromCharCode(65 + optIdx);
      ctx.fillStyle = isCorrect ? 'rgba(255,255,255,0.25)' : 'rgba(0, 0, 0, 0.05)';
      ctx.beginPath();
      ctx.roundRect(ox + 12, oy + optH / 2 - 16, 32, 32, 8);
      ctx.fill();

      ctx.fillStyle = isCorrect ? '#ffffff' : '#475569';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, ox + 12 + 16, oy + optH / 2 + 1);

      // Option Text
      ctx.fillStyle = isCorrect ? '#ffffff' : '#1e293b';
      ctx.font = '600 17px sans-serif';
      ctx.textAlign = 'left';
      const optLines = wrapText(ctx, opt, optW - 64);
      ctx.fillText(optLines[0] || opt, ox + 56, oy + optH / 2 + 1);
    });
  } else if (isRevealed) {
    ctx.globalAlpha = revealT;
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    const aLines = wrapText(ctx, `✓ Correct Answer: ${quiz.answer}`, panelW * 0.8);
    ctx.fillText(aLines[0] || '', W / 2, qy + 40);
    ctx.globalAlpha = 1;
  }

  // Timer bar at the bottom of the screen
  const barY = H - 55;
  const barW = panelW * 0.84;
  const barX = W / 2 - barW / 2;
  
  // Track background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, 8, 4);
  ctx.fill();

  const accent = quiz.accentColor || '#ef4444';
  ctx.fillStyle = isRevealed ? '#22c55e' : accent;
  
  const barProgress = ease(Math.min(1, Math.max(0, (progress - 0.02) / 0.98))); 
  const remaining = Math.max(0, 1 - barProgress) * barW;
  ctx.beginPath();
  ctx.roundRect(barX, barY, remaining, 8, 4);
  ctx.fill();

  ctx.restore();
};
