import fs from 'fs';
let code = fs.readFileSync('components/DebateVisualizer.tsx', 'utf8');

code = code.replace("const isSegIntro = i === 0 || seg.learnEnglish?.segmentType === 'intro';", "const isSegIntro = i === 0 && (!seg.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(seg.speaker.toLowerCase().trim()));");

fs.writeFileSync('components/DebateVisualizer.tsx', code);
console.log("Fixed isSegIntro in DebateVisualizer");
