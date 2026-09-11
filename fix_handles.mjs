import fs from 'fs';
let code = fs.readFileSync('components/EnglishVideoMaker.tsx', 'utf8');

code = code.replace(
  `    // Check Subtitle Handles first (if settings visible)
    if (showSettings && showSubtitles) {`,
  `    // Check Subtitle Handles first (if settings visible)
    if (showSettings && showSubtitles && !isIntro) {`
);

code = code.replace(
  `        // Center Drag
        if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {`,
  `        // Center Drag
        if (!isIntro && x >= bx && x <= bx + bw && y >= by && y <= by + bh) {`
);

fs.writeFileSync('components/EnglishVideoMaker.tsx', code);
console.log("Fixed handles.");
