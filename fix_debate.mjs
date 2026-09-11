import fs from 'fs';
let code = fs.readFileSync('components/DebateVisualizer.tsx', 'utf8');
code = code.split("const isIntro = currentSegment?.learnEnglish?.segmentType === 'intro';").join("const isIntro = currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim()));");
fs.writeFileSync('components/DebateVisualizer.tsx', code);
console.log("Fixed DebateVisualizer");
