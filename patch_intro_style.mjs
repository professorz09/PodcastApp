import fs from 'fs';
let code = fs.readFileSync('components/EnglishVideoMaker.tsx', 'utf8');

const target1 = `        const text = currentSegment.text;
        const fontSize = 32 * subtitleConfig.fontSize;
        ctx.font = \`bold \${fontSize}px sans-serif\`;
        ctx.textAlign = 'center';
        
        const bw = isIntro ? 896 : subtitleConfig.w;
        const maxWidth = bw - (60 * subtitleConfig.fontSize);`;

const replace1 = `        const text = currentSegment.text;
        const fontSize = isIntro ? 28 : (32 * subtitleConfig.fontSize);
        ctx.font = \`bold \${fontSize}px sans-serif\`;
        ctx.textAlign = 'center';
        
        const bw = isIntro ? (canvas.width - 100) : subtitleConfig.w;
        const maxWidth = isIntro ? bw : (bw - (60 * subtitleConfig.fontSize));`;

const target2 = `        const lineHeight = fontSize * 1.5;
        const totalHeight = visibleLines.length * lineHeight;
        
        const bx = isIntro ? 192 : subtitleConfig.x;
        
        const bh = isIntro ? (totalHeight + (20 * subtitleConfig.fontSize)) : Math.max(subtitleConfig.h, totalHeight + (60 * subtitleConfig.fontSize));
        const by = isIntro ? (canvas.height - bh - 60) : subtitleConfig.y;`;

const replace2 = `        const lineHeight = fontSize * 1.5;
        const totalHeight = visibleLines.length * lineHeight;
        
        const bx = isIntro ? 50 : subtitleConfig.x;
        const bh = isIntro ? totalHeight : Math.max(subtitleConfig.h, totalHeight + (60 * subtitleConfig.fontSize));
        const by = isIntro ? (canvas.height - totalHeight - 40) : subtitleConfig.y;`;

if (code.includes(target1)) {
    code = code.replace(target1, replace1);
    console.log("Replaced target 1");
} else {
    console.log("Target 1 not found!");
}

if (code.includes(target2)) {
    code = code.replace(target2, replace2);
    console.log("Replaced target 2");
} else {
    console.log("Target 2 not found!");
}

fs.writeFileSync('components/EnglishVideoMaker.tsx', code);
