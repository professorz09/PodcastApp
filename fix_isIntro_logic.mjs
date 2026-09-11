import fs from 'fs';

function fixLogic(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');
  
  const oldIntro = "const isIntro = currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim()));";
  const newIntro = "const isIntro = currentSegment?.learnEnglish?.segmentType === 'intro';";

  if (code.includes(oldIntro)) {
    code = code.split(oldIntro).join(newIntro);
    fs.writeFileSync(filepath, code);
    console.log("Fixed isIntro logic in " + filepath);
  } else {
    console.log("Old isIntro logic not found in " + filepath);
  }
}

fixLogic('components/EnglishVideoMaker.tsx');
fixLogic('components/DebateVisualizer.tsx');
