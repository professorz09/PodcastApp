import fs from 'fs';
const code = fs.readFileSync('components/EnglishVideoMaker.tsx', 'utf8');
console.log(code.substring(code.indexOf('if (currentSegment.phraseTimings'), code.indexOf('const lineHeight = fontSize * 1.5;')));
