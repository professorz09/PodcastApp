import fs from 'fs';
let code = fs.readFileSync('services/themes/utils.ts', 'utf8');

const t = `  const isIntroSeg = currentSegment.learnEnglish?.segmentType === 'intro' || 
                     (currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim())));`;

// Wait, the one I just inserted is identical.
// I only want to remove the SECOND occurrence.
const firstIndex = code.indexOf(t);
const secondIndex = code.indexOf(t, firstIndex + 1);

if (secondIndex !== -1) {
  code = code.substring(0, secondIndex) + code.substring(secondIndex + t.length);
  console.log("REMOVED SECOND!");
} else {
  console.log("SECOND NOT FOUND!");
}

fs.writeFileSync('services/themes/utils.ts', code);
