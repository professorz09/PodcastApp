const fs = require('fs');
let content = fs.readFileSync('services/geminiService.ts', 'utf8');

content = content.replace(
  '1. [COLD OPEN — DOCUMENTARY STYLE]',
  '${includeIntro ? `1. [COLD OPEN — DOCUMENTARY STYLE]\\n               - Narrator: cinematic तरीके से case/situation को explain करे। Suspenseful, scene-setting, aur main debate question ko raise kare (jaise: "Toh ab sawaal yeh nahi tha ki... sawaal yeh tha ki...").\\n               - Text format: [COLD OPEN — DOCUMENTARY STYLE] (as a non-spoken marker or spoken by Narrator as an intro)` : `1. [START DEBATE IMMEDIATELY]\\n               - Do not include any Cold Open or documentary intro. Start directly with Round 1.`}'
);

content = content.replace(
  '1. [COLD OPEN — DOCUMENTARY STYLE]',
  '${includeIntro ? `1. [COLD OPEN — DOCUMENTARY STYLE]\\n               - Narrator: Explain the case/situation cinematically. Suspenseful, scene-setting. It must end by raising the core moral/legal debate question.\\n               - Text format: Include "[COLD OPEN — DOCUMENTARY STYLE]" as a scene marker or intro tag.` : `1. [START DEBATE IMMEDIATELY]\\n               - Do not include any Cold Open or documentary intro. Start directly with Round 1.`}'
);

fs.writeFileSync('services/geminiService.ts', content, 'utf8');
