import fs from 'fs';

function fixDuplicate(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  const oldCode = `        const totalHeight = visibleLines.length * lineHeight;
        const isIntro = currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim()));
        
        const bx = isIntro ? 192 : subtitleConfig.x;`;

  const newCode = `        const totalHeight = visibleLines.length * lineHeight;
        
        const bx = isIntro ? 192 : subtitleConfig.x;`;

  if (code.includes(oldCode)) {
    code = code.replace(oldCode, newCode);
    fs.writeFileSync(filepath, code);
    console.log("Fixed duplicate isIntro in " + filepath);
  } else {
    console.log("Old code not found in " + filepath);
  }
}

fixDuplicate('components/EnglishVideoMaker.tsx');
fixDuplicate('components/DebateVisualizer.tsx');
