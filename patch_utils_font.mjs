import fs from 'fs';

let code = fs.readFileSync('services/themes/utils.ts', 'utf8');

// Patch subtitleConfig default font size
code = code.replace(/fontSize: 1,/g, "fontSize: 1.4,");

fs.writeFileSync('services/themes/utils.ts', code);
console.log("Patched defaults in utils.ts");
