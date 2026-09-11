import fs from 'fs';
let code = fs.readFileSync('services/themes/utils.ts', 'utf8');

code = code.replace(
  `  // For intro segments, force it to be at the bottom and without box
  const bh = Math.max(subtitleConfig.h, totalHeight + (60 * fs));
  const by = isIntroSeg ? (ctx.canvas.height || 1080) - bh - 30 : subtitleConfig.y;`,
  `  // For intro segments, force it to be at the bottom and without box
  const bh = isIntroSeg ? (totalHeight + (20 * fs)) : Math.max(subtitleConfig.h, totalHeight + (60 * fs));
  const by = isIntroSeg ? (ctx.canvas.height || 1080) - bh - 60 : subtitleConfig.y;`
);

fs.writeFileSync('services/themes/utils.ts', code);
console.log("Patched layout");
