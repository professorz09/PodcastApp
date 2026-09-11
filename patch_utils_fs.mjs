import fs from 'fs';
let code = fs.readFileSync('services/themes/utils.ts', 'utf8');

const t = `  const text = currentSegment.text;
  const fs = subtitleConfig.fontSize;
  const fontSize = 32 * fs;
  ctx.font = \`bold \${fontSize}px sans-serif\`;
  ctx.textAlign = 'center';
  const maxWidth = subtitleConfig.w - (60 * fs);`;

const r = `  const isIntroSeg = currentSegment.learnEnglish?.segmentType === 'intro' || 
                     (currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim())));

  const text = currentSegment.text;
  const fs = subtitleConfig.fontSize;
  const fontSize = isIntroSeg ? 28 : (32 * fs);
  ctx.font = \`bold \${fontSize}px sans-serif\`;
  ctx.textAlign = 'center';
  const maxWidth = isIntroSeg ? (ctx.canvas.width || 1280) - 100 : subtitleConfig.w - (60 * fs);`;

if(code.includes(t)) {
  code = code.replace(t, r);
  console.log("REPLACED!");
} else {
  console.log("NOT FOUND!");
}
fs.writeFileSync('services/themes/utils.ts', code);
