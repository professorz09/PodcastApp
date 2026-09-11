import fs from 'fs';

function patchTabs(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');
  
  const oldTabs = "const TABS = ['Speakers', 'Background', 'Subtitle', 'Options'] as const;";
  const newTabs = "const TABS = ['Background', 'Subtitle', 'Options', 'Speakers'] as const;";

  if (code.includes(oldTabs)) {
    code = code.replace(oldTabs, newTabs);
    fs.writeFileSync(filepath, code);
    console.log("Patched tabs in " + filepath);
  } else {
    console.log("Old tabs array not found in " + filepath);
  }
}

patchTabs('components/EnglishVideoMaker.tsx');
patchTabs('components/DebateVisualizer.tsx');
