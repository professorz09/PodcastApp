import fs from 'fs';
let code = fs.readFileSync('components/EnglishVideoMaker.tsx', 'utf8');

const target = `        if (isIntro) {
            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
        }`;

const replace = `        if (isIntro) {
            ctx.shadowColor = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    console.log("Replaced shadow");
} else {
    console.log("Shadow target not found!");
}

fs.writeFileSync('components/EnglishVideoMaker.tsx', code);
