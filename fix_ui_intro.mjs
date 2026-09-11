import fs from 'fs';
let code = fs.readFileSync('components/EnglishVideoMaker.tsx', 'utf8');
code = code.replace("const isSegIntro = i === 0 || seg.learnEnglish?.segmentType === 'intro';", "const isSegIntro = seg.learnEnglish?.segmentType === 'intro';");
fs.writeFileSync('components/EnglishVideoMaker.tsx', code);
console.log("Fixed EnglishVideoMaker UI logic");
