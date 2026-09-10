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
    drawNarratorCard(ctx, W, H, tag.explanation, progress, ease);
  } else if (tag.segmentType === 'quiz' && tag.quiz) {
    drawQuizOverlay(ctx, W, H, tag.quiz, progress, ease);
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

  // "teacher" badge
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.roundRect(cardX + 18, cardY + 16, 96, 28, 14);
  ctx.fill();
  ctx.fillStyle = '#04141a';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LEARN', cardX + 18 + 48, cardY + 16 + 15);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  const phraseLines = wrapText(ctx, `"${explanation.phrase}"`, cardW - 36);
  let ty = cardY + 66;
  phraseLines.slice(0, 2).forEach((l) => {
    ctx.fillText(l, cardX + 18, ty);
    ty += 26;
  });

  ctx.fillStyle = '#a5f3fc';
  ctx.font = '16px sans-serif';
  const meaningLines = wrapText(ctx, explanation.meaning, cardW - 36);
  meaningLines.slice(0, 2).forEach((l) => {
    ctx.fillText(l, cardX + 18, ty);
    ty += 20;
  });

  if (explanation.example) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'italic 14px sans-serif';
    const exampleLines = wrapText(ctx, explanation.example, cardW - 36);
    if (exampleLines[0]) ctx.fillText(exampleLines[0], cardX + 18, ty);
  }

  ctx.restore();
};

const drawQuizOverlay = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
  quiz: { question: string; options?: string[]; answer: string },
  progress: number,
  ease: (t: number) => number,
) => {
  const panelH = 300;

  // slide down over the first 18% of the segment
  const slideT = ease(Math.min(1, progress / 0.18));
  const panelY = -panelH + slideT * panelH;

  // reveal answer during the last 30%
  const revealT = ease(Math.max(0, (progress - 0.7) / 0.3));

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(0, panelY, W, panelH, [0, 0, 28, 28]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const contentY = panelY;

  // question
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const qLines = wrapText(ctx, quiz.question, W * 0.72);
  let qy = contentY + 66;
  qLines.slice(0, 2).forEach((l) => {
    ctx.fillText(l, W / 2, qy);
    qy += 38;
  });

  // options (if provided) — correct one highlights once revealed
  if (quiz.options?.length) {
    const optCount = quiz.options.length;
    const optW = Math.min(260, (W * 0.86) / optCount - 16);
    const totalW = optCount * optW + (optCount - 1) * 16;
    let ox = W / 2 - totalW / 2;
    const oy = qy + 14;
    const optH = 54;
    quiz.options.forEach((opt) => {
      const isCorrect = revealT > 0.5 && opt.trim().toLowerCase() === quiz.answer.trim().toLowerCase();
      ctx.fillStyle = isCorrect ? '#22c55e' : '#f1f5f9';
      ctx.beginPath();
      ctx.roundRect(ox, oy, optW, optH, 12);
      ctx.fill();
      ctx.fillStyle = isCorrect ? '#ffffff' : '#334155';
      ctx.font = '600 16px sans-serif';
      const optLines = wrapText(ctx, opt, optW - 20);
      ctx.fillText(optLines[0] || opt, ox + optW / 2, oy + optH / 2 + 6);
      ox += optW + 16;
    });
  } else if (revealT > 0) {
    // no options — just reveal the answer text
    ctx.globalAlpha = revealT;
    ctx.fillStyle = '#16a34a';
    ctx.font = 'bold 22px sans-serif';
    const aLines = wrapText(ctx, `Answer: ${quiz.answer}`, W * 0.7);
    ctx.fillText(aLines[0] || '', W / 2, qy + 44);
    ctx.globalAlpha = 1;
  }

  // timer bar depleting across the full segment
  const barY = contentY + panelH - 14;
  const barW = W * 0.8;
  const barX = W / 2 - barW / 2;
  ctx.fillStyle = 'rgba(15,23,42,0.12)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, 6, 3);
  ctx.fill();
  ctx.fillStyle = revealT > 0 ? '#22c55e' : '#ef4444';
  const remaining = Math.max(0, 1 - progress) * barW;
  ctx.beginPath();
  ctx.roundRect(barX, barY, remaining, 6, 3);
  ctx.fill();

  ctx.restore();
};
