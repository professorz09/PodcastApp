const fs = require('fs');
let content = fs.readFileSync('./services/geminiService.ts', 'utf8');

const introLineOld = `    : includeNarrator
      ? \`MODE: CINEMATIC INTRO HOOK ON
Segment 1 MUST be spoken by "Narrator", tag "intro" — an immersive, scene-setting opening that puts the listener right in the situation. Give it real substance: 4-8 sentences. Follow this EXACT narrative style and flow:
- Start with an "Imagine you're..." statement placing the listener directly in the location (e.g., "Imagine you're walking down a busy street in London...").
- Describe a sudden turn of events or conflict in short, punchy sentences (e.g., "You're enjoying your day when, suddenly... someone grabs your phone and runs.").
- State the listener's internal reaction/emotion (e.g., "You're frustrated, confused, and you don't know what to do.").
- Set up the immediate next action or encounter (e.g., "Then, you spot a police officer nearby. You walk up to him and try to explain what happened.").
- ALWAYS end the intro with the exact question and phrase: "But how would you explain this situation in English? Let's find out." or "So, how would you handle this situation in English? Let's find out."
After this intro, hand off entirely to the characters for the main scene.\`
      : \`MODE: INTRO OFF (IN MEDIA RES)`;

const introLineNew = `    : includeNarrator
      ? \`MODE: CINEMATIC INTRO HOOK ON
\${leStyle === 'multi_situation' ? 'For EACH situation in the list, the very first segment of that situation MUST be spoken by "Narrator", tag "intro"' : 'Segment 1 MUST be spoken by "Narrator", tag "intro"'} — an immersive, scene-setting opening that puts the listener right in the situation. Give it real substance: 4-8 sentences. Follow this EXACT narrative style and flow:
- Start with an "Imagine you're..." statement placing the listener directly in the location (e.g., "Imagine you're walking down a busy street in London...").
- Describe a sudden turn of events or conflict in short, punchy sentences (e.g., "You're enjoying your day when, suddenly... someone grabs your phone and runs.").
- State the listener's internal reaction/emotion (e.g., "You're frustrated, confused, and you don't know what to do.").
- Set up the immediate next action or encounter (e.g., "Then, you spot a police officer nearby. You walk up to him and try to explain what happened.").
- ALWAYS end the intro with the exact question and phrase: "But how would you explain this situation in English? Let's find out." or "So, how would you handle this situation in English? Let's find out."
After this intro, hand off entirely to the characters for the main scene.\`
      : \`MODE: INTRO OFF (IN MEDIA RES)`;

content = content.replace(introLineOld, introLineNew);

fs.writeFileSync('./services/geminiService.ts', content);
