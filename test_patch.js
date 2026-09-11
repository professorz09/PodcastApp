const fs = require('fs');
let code = fs.readFileSync('components/EnglishVideoMaker.tsx', 'utf8');

const oldCode = `        const lineHeight = fontSize * 1.5;
        const totalHeight = visibleLines.length * lineHeight;
        const bx = subtitleConfig.x;
        const by = subtitleConfig.y;
        const bw = subtitleConfig.w;
        const bh = Math.max(subtitleConfig.h, totalHeight + (60 * subtitleConfig.fontSize));

        const br = (subtitleConfig.borderRadius ?? 20) * subtitleConfig.fontSize;`;

const newCode = `        const lineHeight = fontSize * 1.5;
        const totalHeight = visibleLines.length * lineHeight;
        const isIntro = currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim()));
        
        const bx = subtitleConfig.x;
        const bw = subtitleConfig.w;
        
        const bh = isIntro ? (totalHeight + (20 * subtitleConfig.fontSize)) : Math.max(subtitleConfig.h, totalHeight + (60 * subtitleConfig.fontSize));
        const by = isIntro ? (canvas.height - bh - 30) : subtitleConfig.y;

        const br = (subtitleConfig.borderRadius ?? 20) * subtitleConfig.fontSize;`;

if (code.includes(oldCode)) {
  code = code.replace(oldCode, newCode);
  fs.writeFileSync('components/EnglishVideoMaker.tsx', code);
  console.log("Patched bh/by layout");
} else {
  console.log("Old code not found");
}
