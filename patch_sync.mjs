import fs from 'fs';

function patchSync(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');
  
  const oldState = "const [syncSubtitlePosition, setSyncSubtitlePosition] = useState(true);";
  const newState = "const [syncSubtitlePosition, setSyncSubtitlePosition] = useState(false);";

  if (code.includes(oldState)) {
    code = code.replace(oldState, newState);
    fs.writeFileSync(filepath, code);
    console.log("Patched sync state in " + filepath);
  } else {
    // try regex
    const regex = /const \[syncSubtitlePosition, setSyncSubtitlePosition\] = useState\(true\);/i;
    if (regex.test(code)) {
      code = code.replace(regex, newState);
      fs.writeFileSync(filepath, code);
      console.log("Patched sync state (regex) in " + filepath);
    } else {
        console.log("Old sync state not found in " + filepath);
    }
  }
}

patchSync('components/EnglishVideoMaker.tsx');
patchSync('components/DebateVisualizer.tsx');
