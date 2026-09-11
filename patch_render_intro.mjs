import fs from 'fs';

function patchRender(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  const oldCode = `        const isIntro = currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim()));
        
        const bx = subtitleConfig.x;
        const bw = subtitleConfig.w;
        
        const bh = isIntro ? (totalHeight + (20 * subtitleConfig.fontSize)) : Math.max(subtitleConfig.h, totalHeight + (60 * subtitleConfig.fontSize));
        const by = isIntro ? (canvas.height - bh - 60) : subtitleConfig.y;`;

  const newCode = `        const isIntro = currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim()));
        
        const bx = isIntro ? 192 : subtitleConfig.x;
        const bw = isIntro ? 896 : subtitleConfig.w;
        
        const bh = isIntro ? (totalHeight + (20 * subtitleConfig.fontSize)) : Math.max(subtitleConfig.h, totalHeight + (60 * subtitleConfig.fontSize));
        const by = isIntro ? (canvas.height - bh - 60) : subtitleConfig.y;`;

  if (code.includes(oldCode)) {
    code = code.replace(oldCode, newCode);
    fs.writeFileSync(filepath, code);
    console.log("Patched render intro in " + filepath);
  } else {
    console.log("Old code not found in " + filepath);
  }
}

patchRender('components/EnglishVideoMaker.tsx');
patchRender('components/DebateVisualizer.tsx');
