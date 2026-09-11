import fs from 'fs';
let code = fs.readFileSync('services/themes/utils.ts', 'utf8');

const lines = code.split('\n');

const newBlock = `  if (!drawBox) {
    if (isIntroSeg) {
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    } else {
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
    }
  }

  ctx.font = \`bold \${fontSize}px sans-serif\`;
  ctx.textAlign = 'center';

  const textBlockHeight = visibleLines.length * lineHeight;
  const textStartY = by + (bh - textBlockHeight) / 2 + (fontSize * 0.3);

  visibleLines.forEach((l, i) => {
    const textY = textStartY + i * lineHeight;
    ctx.fillText(l, bx + bw / 2, textY);
  });

  if (isIntroSeg && !drawBox) {
      ctx.shadowBlur = 3;
      visibleLines.forEach((l, i) => {
        const textY = textStartY + i * lineHeight;
        ctx.fillText(l, bx + bw / 2, textY);
      });
  }`;

// Find start and end indices
const startIdx = lines.findIndex((l, i) => i > 480 && l.includes("if (!drawBox) {"));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes("if (config.showSettings) {"));

if (startIdx !== -1 && endIdx !== -1) {
    lines.splice(startIdx, endIdx - startIdx - 1, newBlock); // keep the settings handles comment
    fs.writeFileSync('services/themes/utils.ts', lines.join('\n'));
    console.log("Fixed!");
} else {
    console.log("Not found", startIdx, endIdx);
}
