import fs from 'fs';
let code = fs.readFileSync('services/themes/utils.ts', 'utf8');

const regex = /const isIntroSeg = currentSegment\.learnEnglish\?\.segmentType === 'intro' \|\| \s*\(currentSegmentIndex === 0 && \(currentSegment\.speaker\?\.toLowerCase\(\)\.trim\(\) === 'narrator' \|\| currentSegment\.speaker\?\.toLowerCase\(\)\.trim\(\) === 'intro' \|\| currentSegment\.speaker\?\.toLowerCase\(\)\.trim\(\) === 'i'\)\);/g;

code = code.replace(regex, `const isIntroSeg = currentSegment.learnEnglish?.segmentType === 'intro' || \n                     (currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim())));`);

fs.writeFileSync('services/themes/utils.ts', code);
console.log("Patched intro names using regex");
