import fs from 'fs';

function fix(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');
  
  const badIntro = `  const introSegments = script.filter(s => s.learnEnglish?.segmentType === 'intro');
  const isCurrentSegmentIntro = Boolean(
    currentSegmentIndex === 0 ||
    currentSegment?.learnEnglish?.segmentType === 'intro' ||
    (introSegments.length > 0 && introSegments.some(s => s.id === currentSegment?.id))
  );`;
  const goodIntro = `  const introSegments = script.filter(s => s.learnEnglish?.segmentType === 'intro');
  const isCurrentSegmentIntro = Boolean(
    currentSegment?.learnEnglish?.segmentType === 'intro' ||
    (introSegments.length > 0 && introSegments.some(s => s.id === currentSegment?.id))
  );`;

  if (code.includes(badIntro)) {
    code = code.replace(badIntro, goodIntro);
    fs.writeFileSync(filepath, code);
    console.log("Reverted isCurrentSegmentIntro in " + filepath);
  }
}

fix('components/EnglishVideoMaker.tsx');
fix('components/DebateVisualizer.tsx');
