import fs from 'fs';

function patchFile(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  // Patch default theme
  code = code.replace(/useState<string>\('neon'\)/g, "useState<string>('cinematic')");
  
  // Patch subtitleConfig default font size
  code = code.replace(/fontSize: 1,/g, "fontSize: 1.4,");
  
  fs.writeFileSync(filepath, code);
  console.log("Patched defaults in " + filepath);
}

patchFile('components/EnglishVideoMaker.tsx');
patchFile('components/DebateVisualizer.tsx');
