import fs from 'fs';

function fixIntro(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');
  
  const oldIntro = "const isIntro = currentSegment?.learnEnglish?.segmentType === 'intro';";
  const newIntro = "const isIntro = currentSegmentIndex === 0 || currentSegment?.learnEnglish?.segmentType === 'intro';";

  if (code.includes(oldIntro)) {
    code = code.split(oldIntro).join(newIntro);
    fs.writeFileSync(filepath, code);
    console.log("Fixed intro index check in " + filepath);
  } else {
    console.log("Old logic not found in " + filepath);
  }
}

fixIntro('components/EnglishVideoMaker.tsx');
fixIntro('components/DebateVisualizer.tsx');
