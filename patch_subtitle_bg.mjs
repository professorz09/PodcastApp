import fs from 'fs';

function patchBg(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  const oldState = "const [subtitleBackground, setSubtitleBackground] = useState(true);";
  const newState = "const [subtitleBackground, setSubtitleBackground] = useState(false);";

  if (code.includes(oldState)) {
    code = code.replace(oldState, newState);
    fs.writeFileSync(filepath, code);
    console.log("Patched subtitleBackground in " + filepath);
  } else {
    // Try regex
    const regex = /const \[subtitleBackground, setSubtitleBackground\] = useState\(true\);/i;
    if (regex.test(code)) {
      code = code.replace(regex, newState);
      fs.writeFileSync(filepath, code);
      console.log("Patched subtitleBackground (regex) in " + filepath);
    } else {
        console.log("Old subtitleBackground not found in " + filepath);
    }
  }
}

patchBg('components/EnglishVideoMaker.tsx');
patchBg('components/DebateVisualizer.tsx');
