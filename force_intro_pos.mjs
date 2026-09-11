import fs from 'fs';
let code = fs.readFileSync('services/themes/utils.ts', 'utf8');

code = code.replace(
  `  const textBlockHeight = visibleLines.length * lineHeight;
  const textStartY = by + (bh - textBlockHeight) / 2 + (fontSize * 0.3);`,
  `  const textBlockHeight = visibleLines.length * lineHeight;
  let textStartY = by + (bh - textBlockHeight) / 2 + (fontSize * 0.3);
  if (isIntroSeg) {
      textStartY = (ctx.canvas.height || 720) - textBlockHeight - 60;
  }`
);

fs.writeFileSync('services/themes/utils.ts', code);
console.log("Forced textStartY");
