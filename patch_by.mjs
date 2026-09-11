import fs from 'fs';
let code = fs.readFileSync('services/themes/utils.ts', 'utf8');

code = code.replace(
  `const by = isIntroSeg ? (ctx.canvas.height || 1080) - bh - 60 : subtitleConfig.y;`,
  `const by = isIntroSeg ? (ctx.canvas.height || 1080) - bh - 30 : subtitleConfig.y;`
);

fs.writeFileSync('services/themes/utils.ts', code);
console.log("Patched by");
