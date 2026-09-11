import fs from 'fs';
let code = fs.readFileSync('services/themes/utils.ts', 'utf8');

code = code.replace(
  `const isIntroSeg = currentSegment.learnEnglish?.segmentType === 'intro' || 
                     (currentSegmentIndex === 0 && (currentSegment.speaker === 'Narrator' || currentSegment.speaker?.toLowerCase() === 'narrator'));`,
  `const isIntroSeg = currentSegment.learnEnglish?.segmentType === 'intro' || 
                     (currentSegmentIndex === 0 && (currentSegment.speaker === 'Narrator' || currentSegment.speaker?.toLowerCase() === 'narrator' || currentSegment.speaker === 'Intro' || currentSegment.speaker === 'I'));`
);

fs.writeFileSync('services/themes/utils.ts', code);
console.log("Patched intro logic");
