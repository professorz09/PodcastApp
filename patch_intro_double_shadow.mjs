import fs from 'fs';
let code = fs.readFileSync('components/EnglishVideoMaker.tsx', 'utf8');

const target = `        visibleLines.forEach((l, i) => {
            ctx.fillText(l, bx + bw / 2, textStartY + (i * lineHeight));
        });
        
        if (isIntro) {
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }`;

const replace = `        visibleLines.forEach((l, i) => {
            ctx.fillText(l, bx + bw / 2, textStartY + (i * lineHeight));
        });
        
        if (isIntro) {
            ctx.shadowBlur = 3;
            visibleLines.forEach((l, i) => {
                ctx.fillText(l, bx + bw / 2, textStartY + (i * lineHeight));
            });
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    console.log("Replaced double shadow");
} else {
    console.log("Double shadow target not found!");
}

fs.writeFileSync('components/EnglishVideoMaker.tsx', code);
