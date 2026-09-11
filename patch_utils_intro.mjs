import fs from 'fs';
let code = fs.readFileSync('services/themes/utils.ts', 'utf8');

const target1 = `  const subtitleConfig = currentSegment.visualConfig?.subtitleConfig || {
    x: 192, y: 550, w: 896, h: 150, fontSize: 1.4,
    backgroundColor: 'rgba(0,0,0,0.85)', textColor: '#ffffff',
    borderColor: '#ffffff', borderWidth: 0, borderRadius: 20
  };

  const text = currentSegment.text;
  const fs = subtitleConfig.fontSize;
  const fontSize = 32 * fs;
  ctx.font = \`bold \${fontSize}px sans-serif\`;
  ctx.textAlign = 'center';
  const maxWidth = subtitleConfig.w - (60 * fs);

  // Normalise legacy mode strings → new mode keys
  const rawMode = (subtitleConfig.mode as string) || 'phrase';`;

const replace1 = `  const subtitleConfig = currentSegment.visualConfig?.subtitleConfig || {
    x: 192, y: 550, w: 896, h: 150, fontSize: 1.4,
    backgroundColor: 'rgba(0,0,0,0.85)', textColor: '#ffffff',
    borderColor: '#ffffff', borderWidth: 0, borderRadius: 20
  };

  const isIntroSeg = currentSegment.learnEnglish?.segmentType === 'intro' || 
                     (currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim())));

  const text = currentSegment.text;
  const fs = subtitleConfig.fontSize;
  const fontSize = isIntroSeg ? 24 : (32 * fs);
  ctx.font = \`bold \${fontSize}px sans-serif\`;
  ctx.textAlign = 'center';
  const maxWidth = isIntroSeg ? (ctx.canvas.width || 1280) - 100 : subtitleConfig.w - (60 * fs);

  // Normalise legacy mode strings → new mode keys
  const rawMode = isIntroSeg ? 'line' : ((subtitleConfig.mode as string) || 'phrase');`;

if (code.includes(target1)) {
    code = code.replace(target1, replace1);
    console.log("Replaced target 1");
} else {
    console.log("Target 1 not found!");
}

const target2 = `  // ── Guard: nothing to draw ────────────────────────────────────
  if (!visibleLines.length || !visibleLines.join('').trim()) return;

  const isIntroSeg = currentSegment.learnEnglish?.segmentType === 'intro' || 
                     (currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim())));

  // ── Layout ────────────────────────────────────────────────────`;

const replace2 = `  // ── Guard: nothing to draw ────────────────────────────────────
  if (!visibleLines.length || !visibleLines.join('').trim()) return;

  // ── Layout ────────────────────────────────────────────────────`;

if (code.includes(target2)) {
    code = code.replace(target2, replace2);
    console.log("Replaced target 2");
} else {
    console.log("Target 2 not found!");
}

// Ensure the positioning for isIntroSeg is strictly at the bottom
const target3 = `  const bh = isIntroSeg ? (totalHeight + (20 * fs)) : Math.max(subtitleConfig.h, totalHeight + (60 * fs));
  const by = isIntroSeg ? (ctx.canvas.height || 1080) - bh - 60 : subtitleConfig.y;`;

const replace3 = `  const bh = isIntroSeg ? totalHeight : Math.max(subtitleConfig.h, totalHeight + (60 * fs));
  const by = isIntroSeg ? (ctx.canvas.height || 1080) - totalHeight - 40 : subtitleConfig.y;`;

if (code.includes(target3)) {
    code = code.replace(target3, replace3);
    console.log("Replaced target 3");
} else {
    console.log("Target 3 not found!");
}

// Adjust shadow for intro
const target4 = `  if (isIntroSeg) {
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
  }`;

const replace4 = `  if (isIntroSeg) {
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }`;

if (code.includes(target4)) {
    code = code.replace(target4, replace4);
    console.log("Replaced target 4");
} else {
    console.log("Target 4 not found!");
}

const target5 = `  if (isIntroSeg) {
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }`;

const replace5 = `  if (isIntroSeg) {
    ctx.shadowBlur = 3;
    visibleLines.forEach((l, i) => {
      ctx.fillText(l, bx + bw / 2, textStartY + (i * lineHeight));
    });
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }`;

if (code.includes(target5)) {
    code = code.replace(target5, replace5);
    console.log("Replaced target 5");
} else {
    console.log("Target 5 not found!");
}

fs.writeFileSync('services/themes/utils.ts', code);
