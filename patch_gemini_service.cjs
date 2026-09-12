const fs = require('fs');
let content = fs.readFileSync('./services/geminiService.ts', 'utf8');

// The `topic` string might be a JSON array if multi_situation. Let's parse it inside the prompt so Gemini knows.

const multiSituationPrompt = `        multi_situation: \`MULTI-SITUATION SCENARIOS:
- The user has provided multiple situations as a JSON array or list in the topic: "\${topic}".
- Treat each situation in the list as its own separate mini-scene or chapter.
- \${includeNarrator ? 'For EACH situation, you MUST start with a cinematic "intro" segment spoken by "Narrator" to set up that specific scene. This means there will be multiple "intro" segments across the script.' : 'Start each scene directly with dialogue.'}
- Ensure the transition between situations is clear.
- This is a compilation of different, independent scenarios happening one after another.\`,`;

content = content.replace(
  '        situational: `SITUATIONAL ENGLISH STYLE:',
  multiSituationPrompt + '\n        situational: `SITUATIONAL ENGLISH STYLE:'
);

fs.writeFileSync('./services/geminiService.ts', content);
