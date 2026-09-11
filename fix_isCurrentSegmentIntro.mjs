import fs from 'fs';

function fix(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');
  
  const oldCode = `  const introSegments = script.filter(s => s.learnEnglish?.segmentType === 'intro');
  const isCurrentSegmentIntro = Boolean(
    currentSegment?.learnEnglish?.segmentType === 'intro' ||
    (introSegments.length > 0 && introSegments.some(s => s.id === currentSegment?.id))
  );`;
  
  const newCode = `  const introSegments = script.filter(s => s.learnEnglish?.segmentType === 'intro');
  const isCurrentSegmentIntro = Boolean(
    currentSegmentIndex === 0 ||
    currentSegment?.learnEnglish?.segmentType === 'intro' ||
    (introSegments.length > 0 && introSegments.some(s => s.id === currentSegment?.id))
  );`;

  if (code.includes(oldCode)) {
    code = code.replace(oldCode, newCode);
    fs.writeFileSync(filepath, code);
    console.log("Fixed isCurrentSegmentIntro in " + filepath);
  }
}

fix('components/EnglishVideoMaker.tsx');
fix('components/DebateVisualizer.tsx');
