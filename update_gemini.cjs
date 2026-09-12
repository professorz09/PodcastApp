const fs = require('fs');
let content = fs.readFileSync('services/geminiService.ts', 'utf8');

// HINDI
const docuDebateHindi = `
        } else if (style === 'docu_debate') {
          prompt = \`
            विषय/Topic: "\${topic}" पर एक "Docu-Debate (Case Study)" style वीडियो script बनाओ।
            \${specificDetails ? \`Context: \${specificDetails}\` : ''}
            \${durLineHi}
            भाषा: हिंदी + Hinglish (cinematic, serious documentary tone and sharp debate)।
            पात्र (Speakers):
            \${speakers.length >= 2
              ? \`इन नामों का उपयोग करें: \${speakers[0]} (Prosecution/For) और \${speakers[1]} (Defense/Against).\`
              : \`दो ऐसे नाम चुनो जो lawyer, expert या debater लगें।\`
            }
            साथ ही एक "Narrator" (या Voiceover) जो documentary sections बोलेगा।

            ══════════════════════════════════════════
            【 STRUCTURE & FORMAT RULES 】
            ══════════════════════════════════════════
            Script का structure EXACTLY ऐसा होना चाहिए:

            1. [COLD OPEN — DOCUMENTARY STYLE]
               - Narrator: cinematic तरीके से case/situation को explain करे। Suspenseful, scene-setting, aur main debate question ko raise kare (jaise: "Toh ab sawaal yeh nahi tha ki... sawaal yeh tha ki...").
               - Text format: [COLD OPEN — DOCUMENTARY STYLE] (as a non-spoken marker or spoken by Narrator as an intro)

            2. ROUND 1, 2, 3... (PROSECUTION VS DEFENSE / FOR VS AGAINST)
               - Narrator debate rounds announce kar sakta hai ya speakers direct shuru kar sakte hain.
               - Round 1, Round 2 aadi headings use karo (script ke topic/themes ke mutabiq).
               - Ek speaker strongly defend kare, doosra strongly oppose kare. Logical, factual, aur deep arguments hone chahiye.

            3. CROSS-EXAMINATION
               - Ek rapid-fire section jisme ek speaker seedhe doosre se sharp sawal pooche aur doosra turant sharp jawab de. (PROSECUTION -> DEFENSE aur vice-versa).

            4. FINAL ROUND — JUSTICE KYA HAI? (या CONCLUSION)
               - Dono sides apna closing, strong emotional/logical argument dein.

            5. [ENDING — DOCUMENTARY STYLE]
               - Narrator wapas aaye. Story ko wrap up kare aur audience ke liye ek open, thought-provoking question chhod de (jaise: "Aap kya choose karenge...?").

            RULES:
            - "Intro" tag documentary style ke shuru mein lagna chahiye.
            - Cinematic + Legal/Logical Debate ka perfect mix hona chahiye.
            - Dono debaters strong hone chahiye, koi strawman nahi.
            \${durFillHi}
          \`;
`;

content = content.replace("} else if (style === 'documentary') {", docuDebateHindi + "} else if (style === 'documentary') {");

// ENGLISH
const docuDebateEnglish = `
        } else if (style === 'docu_debate') {
          prompt = \`
            Write a "Docu-Debate (Case Study)" style video script on: "\${topic}".
            \${specificDetails ? \`Context: \${specificDetails}\` : ''}
            \${durLineEn}
            Language: \${language}. Tone: serious, gripping, cinematic documentary mixed with sharp, high-level debate.
            Characters (Speakers):
            \${speakers.length >= 2
              ? \`Use these names: \${speakers[0]} (Prosecution/For) and \${speakers[1]} (Defense/Against).\`
              : \`Choose two names that feel like legal experts or sharp debaters.\`
            }
            Plus a "Narrator" (or Voiceover) to handle the documentary sections.

            ══════════════════════════════════════════
            【 STRUCTURE & FORMAT RULES 】
            ══════════════════════════════════════════
            The script structure MUST follow this exact flow:

            1. [COLD OPEN — DOCUMENTARY STYLE]
               - Narrator: Explain the case/situation cinematically. Suspenseful, scene-setting. It must end by raising the core moral/legal debate question.
               - Text format: Include "[COLD OPEN — DOCUMENTARY STYLE]" as a scene marker or intro tag.

            2. ROUND 1, ROUND 2, ROUND 3... (PROSECUTION VS DEFENSE / FOR VS AGAINST)
               - Break the debate down into logical thematic rounds.
               - One speaker strongly defends, the other strongly opposes. Logical, factual, deep arguments.

            3. CROSS-EXAMINATION
               - A rapid-fire section where one speaker directly asks sharp questions to the other, followed by immediate, sharp answers.

            4. FINAL ROUND
               - Both sides give their closing, strong emotional/logical arguments.

            5. [ENDING — DOCUMENTARY STYLE]
               - Narrator returns. Wraps up the story and leaves the audience with an open, thought-provoking question ("So what would you choose...?").

            RULES:
            - Use an "Intro" tag at the start of the documentary style section.
            - Perfect mix of Cinematic storytelling + Legal/Logical Debate.
            - Both debaters must be strong; no strawman arguments.
            \${durFillEn}
          \`;
`;

const searchEng = "} else if (style === 'documentary') {";
// find the second occurrence
let pos = content.indexOf(searchEng);
pos = content.indexOf(searchEng, pos + 1);

content = content.slice(0, pos) + docuDebateEnglish + content.slice(pos);

fs.writeFileSync('services/geminiService.ts', content, 'utf8');
