import fs from 'fs';

function patchDefaultTab(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');
  
  const oldState = "const [settingsTab, setSettingsTab] = useState<'speakers'|'background'|'subtitle'|'options'>('speakers');";
  const newState = "const [settingsTab, setSettingsTab] = useState<'speakers'|'background'|'subtitle'|'options'>('background');";
  
  const oldState2 = "const [settingsTab, setSettingsTab] = useState<typeof TABS[number]>('Speakers');"; // Just in case it's defined this way

  if (code.includes(oldState)) {
    code = code.replace(oldState, newState);
    fs.writeFileSync(filepath, code);
    console.log("Patched tab state in " + filepath);
  } else {
    // Try regex
    const regex = /const \[settingsTab, setSettingsTab\] = useState<.+>\('Speakers'\);/i;
    if (regex.test(code)) {
      code = code.replace(regex, "const [settingsTab, setSettingsTab] = useState<'Speakers'|'Background'|'Subtitle'|'Options'>('Background');");
      fs.writeFileSync(filepath, code);
      console.log("Patched tab state (regex) in " + filepath);
    } else {
        const regex2 = /useState<.+>\('speakers'\);/i;
        if (regex2.test(code)) {
          code = code.replace(regex2, "useState<'speakers'|'background'|'subtitle'|'options'>('background');");
          fs.writeFileSync(filepath, code);
          console.log("Patched tab state (regex2) in " + filepath);
        } else {
          console.log("Old tab state not found in " + filepath);
        }
    }
  }
}

patchDefaultTab('components/EnglishVideoMaker.tsx');
patchDefaultTab('components/DebateVisualizer.tsx');
