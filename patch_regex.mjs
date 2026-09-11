import fs from 'fs';
let code = fs.readFileSync('components/EnglishVideoMaker.tsx', 'utf8');

code = code.replace(
  /ctx\.fillStyle = subtitleConfig\.textColor;[\s\S]*?visibleLines\.forEach\(\(l, i\) => {[\s\S]*?ctx\.fillText\(l, bx \+ bw \/ 2, textStartY \+ \(i \* lineHeight\)\);[\s\S]*?}\);/,
  `ctx.fillStyle = subtitleConfig.textColor;
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
        }`
);

fs.writeFileSync('components/EnglishVideoMaker.tsx', code);
console.log("Regex replaced.");
