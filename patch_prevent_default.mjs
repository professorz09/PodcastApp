import fs from 'fs';

function patchPreventDefault(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  // Add e.preventDefault() to pointer down
  if (code.includes('const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {') && !code.includes('const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => { e.preventDefault();')) {
      code = code.replace('const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {', 'const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {\n    if (e.cancelable) e.preventDefault();');
  }

  // Add e.preventDefault() to pointer move if interacting
  if (code.includes('const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {') && !code.includes('const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => { e.preventDefault();')) {
      code = code.replace('const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {', 'const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {\n    if (isInteractingRef.current && e.cancelable) e.preventDefault();');
  }

  fs.writeFileSync(filepath, code);
  console.log("Patched preventDefault in " + filepath);
}

patchPreventDefault('components/EnglishVideoMaker.tsx');
patchPreventDefault('components/DebateVisualizer.tsx');
