import fs from 'fs';

function addIcon(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');
  if (!code.includes('ChevronRight')) {
    code = code.replace(/ChevronLeft,/, 'ChevronLeft, ChevronRight,');
    fs.writeFileSync(filepath, code);
    console.log("Added ChevronRight to " + filepath);
  }
}
addIcon('components/EnglishVideoMaker.tsx');
addIcon('components/DebateVisualizer.tsx');
