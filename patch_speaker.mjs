import fs from 'fs';
let code = fs.readFileSync('services/themes/utils.ts', 'utf8');

code = code.replace(
  `const isIntroSeg = currentSegment.learnEnglish?.segmentType === 'intro' || \n                     (currentSegmentIndex === 0 && (currentSegment.speaker === 'Narrator' || currentSegment.speaker?.toLowerCase() === 'narrator' || currentSegment.speaker === 'Intro' || currentSegment.speaker === 'I'));`,
  `const isIntroSeg = currentSegment.learnEnglish?.segmentType === 'intro' || \n                     (currentSegmentIndex === 0 && (currentSegment.speaker?.toLowerCase().trim() === 'narrator' || currentSegment.speaker?.toLowerCase().trim() === 'intro' || currentSegment.speaker?.toLowerCase().trim() === 'i'));`
);

fs.writeFileSync('services/themes/utils.ts', code);
console.log("Patched speaker logic");
