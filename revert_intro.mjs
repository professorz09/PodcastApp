import fs from 'fs';

function fix(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');
  
  const badIntro = "const isIntro = currentSegmentIndex === 0 || currentSegment?.learnEnglish?.segmentType === 'intro';";
  const goodIntro = "const isIntro = currentSegment?.learnEnglish?.segmentType === 'intro';";

  if (code.includes(badIntro)) {
    code = code.split(badIntro).join(goodIntro);
    fs.writeFileSync(filepath, code);
    console.log("Reverted isIntro in " + filepath);
  }
}

fix('components/EnglishVideoMaker.tsx');
fix('components/DebateVisualizer.tsx');
