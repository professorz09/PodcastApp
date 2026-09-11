import fs from 'fs';
let code = fs.readFileSync('components/EnglishVideoMaker.tsx', 'utf8');

code = code.replace(
  /if \(showSettings\) {/g,
  `if (showSettings && !isIntro) {`
);

fs.writeFileSync('components/EnglishVideoMaker.tsx', code);
console.log("Settings patched.");
