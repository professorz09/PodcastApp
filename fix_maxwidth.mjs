import fs from 'fs';

function fixMaxWidth(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  const oldCode = `        const text = currentSegment.text;
        const fontSize = 32 * subtitleConfig.fontSize;
        ctx.font = \`bold \${fontSize}px sans-serif\`;
        ctx.textAlign = 'center';
        
        const maxWidth = subtitleConfig.w - (60 * subtitleConfig.fontSize);
        let visibleLines: string[] = [];`;

  const newCode = `        const text = currentSegment.text;
        const fontSize = 32 * subtitleConfig.fontSize;
        ctx.font = \`bold \${fontSize}px sans-serif\`;
        ctx.textAlign = 'center';
        
        const bw = isIntro ? 896 : subtitleConfig.w;
        const maxWidth = bw - (60 * subtitleConfig.fontSize);
        let visibleLines: string[] = [];`;

  if (code.includes(oldCode)) {
    code = code.replace(oldCode, newCode);
    
    // Also remove the old bw declaration if it's there
    const oldBw = `        const bx = isIntro ? 192 : subtitleConfig.x;
        const bw = isIntro ? 896 : subtitleConfig.w;`;
    const newBw = `        const bx = isIntro ? 192 : subtitleConfig.x;`;
    
    if (code.includes(oldBw)) {
      code = code.replace(oldBw, newBw);
    }
    
    fs.writeFileSync(filepath, code);
    console.log("Fixed maxWidth in " + filepath);
  } else {
    console.log("Old code not found in " + filepath);
  }
}

fixMaxWidth('components/EnglishVideoMaker.tsx');
fixMaxWidth('components/DebateVisualizer.tsx');
