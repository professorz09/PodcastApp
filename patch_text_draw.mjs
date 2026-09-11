import fs from 'fs';
let code = fs.readFileSync('components/EnglishVideoMaker.tsx', 'utf8');

const oldCode = `        if (subtitleBackground) {
            ctx.fillStyle = subtitleConfig.backgroundColor;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, br);
            ctx.fill();

            if ((subtitleConfig.borderWidth ?? 0) > 0) {
                ctx.strokeStyle = subtitleConfig.borderColor || '#ffffff';
                ctx.lineWidth = subtitleConfig.borderWidth! * subtitleConfig.fontSize;
                ctx.beginPath();
                ctx.roundRect(bx, by, bw, bh, br);
                ctx.stroke();
            }
        }`;

const newCode = `        if (subtitleBackground && !isIntro) {
            ctx.fillStyle = subtitleConfig.backgroundColor;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, br);
            ctx.fill();

            if ((subtitleConfig.borderWidth ?? 0) > 0) {
                ctx.strokeStyle = subtitleConfig.borderColor || '#ffffff';
                ctx.lineWidth = subtitleConfig.borderWidth! * subtitleConfig.fontSize;
                ctx.beginPath();
                ctx.roundRect(bx, by, bw, bh, br);
                ctx.stroke();
            }
        }`;

if (code.includes(oldCode)) {
  code = code.replace(oldCode, newCode);
  fs.writeFileSync('components/EnglishVideoMaker.tsx', code);
  console.log("Patched subtitleBackground to exclude isIntro");
} else {
  console.log("Old background code not found");
}

const oldTextCode = `        ctx.fillStyle = subtitleConfig.textColor;
        ctx.font = \`bold \${fontSize}px sans-serif\`;
        ctx.textAlign = 'center';

        const textBlockHeight = visibleLines.length * lineHeight;
        const textStartY = by + (bh - textBlockHeight) / 2 + (fontSize * 0.3);

        visibleLines.forEach((l, i) => {
            ctx.fillText(l, bx + bw / 2, textStartY + (i * lineHeight));
        });`;

const newTextCode = `        ctx.fillStyle = subtitleConfig.textColor;
        ctx.font = \`bold \${fontSize}px sans-serif\`;
        ctx.textAlign = 'center';

        const textBlockHeight = visibleLines.length * lineHeight;
        let textStartY = by + (bh - textBlockHeight) / 2 + (fontSize * 0.3);

        if (isIntro) {
            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
        }

        visibleLines.forEach((l, i) => {
            ctx.fillText(l, bx + bw / 2, textStartY + (i * lineHeight));
        });
        
        if (isIntro) {
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }`;

if (code.includes(oldTextCode)) {
  code = code.replace(oldTextCode, newTextCode);
  fs.writeFileSync('components/EnglishVideoMaker.tsx', code);
  console.log("Patched textStartY logic");
} else {
  console.log("Old text drawing code not found");
}
