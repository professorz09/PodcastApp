import fs from 'fs';

function patchCanvas(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  const oldCode = `                    <canvas
                        ref={canvasRef}
                        width={1280}
                        height={720}
                        className="w-full h-full object-contain touch-none"`;
                        
  const newCode = `                    <canvas
                        ref={canvasRef}
                        width={1280}
                        height={720}
                        className="w-full h-full object-contain touch-none"
                        style={{ touchAction: 'none' }}`;

  if (code.includes(oldCode)) {
    code = code.replace(oldCode, newCode);
    fs.writeFileSync(filepath, code);
    console.log("Patched touch-action in " + filepath);
  } else {
    // Try to just add style={{ touchAction: 'none' }} to the canvas
    const regex = /className="w-full h-full object-contain touch-none"/g;
    if (regex.test(code)) {
        code = code.replace(regex, 'className="w-full h-full object-contain touch-none" style={{ touchAction: "none" }}');
        fs.writeFileSync(filepath, code);
        console.log("Patched touch-action (regex) in " + filepath);
    } else {
        console.log("Old canvas code not found in " + filepath);
    }
  }
}

patchCanvas('components/EnglishVideoMaker.tsx');
patchCanvas('components/DebateVisualizer.tsx');
