import { Type, Modality, ThinkingLevel } from "@google/genai";
import { TranscriptSegment, DebateSegment, DebateSpeaker } from "../types";
import { fetchRandomStyleReference } from "./styleRefClient";

// Nano Banana 2 — Gemini image model, used for all image generation
// (thumbnails, avatars, storyboard illustrations, etc). A global switch (not
// per-screen) lets the Lite variant be flipped on to compare rate limits —
// https://ai.google.dev/gemini-api/docs/image-generation
const IMAGE_MODEL_FULL = 'gemini-3.1-flash-image';
const IMAGE_MODEL_LITE = 'gemini-3.1-flash-lite-image';
const LITE_IMAGE_MODEL_KEY = 'autovid_use_lite_image_model';

export const isUsingLiteImageModel = (): boolean => {
  try { return localStorage.getItem(LITE_IMAGE_MODEL_KEY) === '1'; } catch { return false; }
};
export const setUseLiteImageModel = (useLite: boolean): void => {
  try { localStorage.setItem(LITE_IMAGE_MODEL_KEY, useLite ? '1' : '0'); } catch { /* ignore */ }
};
const getImageModel = (): string => isUsingLiteImageModel() ? IMAGE_MODEL_LITE : IMAGE_MODEL_FULL;

// Least-restrictive safety config — this app generates fictional podcast
// hosts/guests and illustrated story scenes, which default safety settings
// over-block. Every image generation call below spreads these in.
const IMAGE_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];
const IMAGE_PERSON_GENERATION = 'allow_all';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const callGemini = async (model: string, contents: any, config?: any): Promise<any> => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, contents, config }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error || `Gemini proxy error: ${response.status}`;
    if (response.status === 429 || msg.includes('RESOURCE_EXHAUSTED')) {
      // Keep the real backend detail (the gemini edge function prefixes it
      // with [vertex]/[apikey] plus any quota-violation info Google returns)
      // instead of replacing it with a generic message that hides which
      // backend actually failed and why.
      throw new Error(`Gemini API Quota Exceeded — ${msg}`);
    }
    throw new Error(msg);
  }
  const data = await response.json();
  // `text` is a prototype getter on GenerateContentResponse — it doesn't survive
  // JSON serialization through the Vertex proxy. Reconstruct it from candidates
  // so every caller can rely on response.text reliably.
  if (data.text == null) {
    const parts: any[] = data.candidates?.[0]?.content?.parts ?? [];
    const extracted = parts.map((p: any) => p.text ?? '').join('').trim();
    if (extracted) data.text = extracted;
  }
  return data;
};

const mockAi = {
  models: {
    generateContent: async ({ model, contents, config }: { model: string; contents: any; config?: any }) => {
      return callGemini(model, contents, config);
    },
  },
};

const getAi = () => mockAi;

export const generateTitleTextPair = async (scriptText: string): Promise<{ title: string; thumbnailText: string; description: string }[]> => {
  const ai = getAi();

  const variationSeed = Math.floor(Math.random() * 9999);
  const prompt = `You are India's top viral YouTube content strategist — you've helped channels like NDTV, ABP, Dhruv Rathee, and Ranveer Allahbadia crack 10M+ views with title+thumbnail combos.

YOUR TASK: Read the script carefully. Extract the MOST SHOCKING, SPECIFIC, INTERESTING element. Then write 3 killer combos. Variation seed: ${variationSeed} — generate fresh output every time, never repeat previous runs.

TITLE RULES:
- SPECIFICITY IS EVERYTHING — generic titles get skipped. Every title must NAME something real from the script: a person, a country, a number, an event, a year. 55-75 chars.
- BAD: "Something Shocking Happened" (too vague)
- GOOD: "I Found Out After 3 Years — My Company Was Destroying Me"
- GOOD: "Trump Just Put 145% Tariffs On China — What Does This Mean For India?"

THUMBNAIL TEXT RULES:
- 2-4 words. ALL CAPS. The emotional punch the title builds toward — must ADD a new dimension, never repeat title words.
- BAD: "LIFE RUINED" (repeats title idea) — GOOD: "NO ESCAPE" / "TRUTH HIDDEN" / "REAL REASON"

DESCRIPTION RULES — a vivid, photorealistic scene-concept brief for an AI image generator (this becomes the actual generation prompt, not a layout spec):
- Describe ONE clear, specific, camera-real moment that captures the story: who is in it (age/gender/build/clothing/expression, named exactly if the script names them), what they're doing, where, and the mood/lighting.
- Make EVERY detail 100% specific to THIS script — never generic ("a stressed person" → "a stressed 35-year-old Indian man in a plain shirt, staring at a laptop showing a red loss graph").
- Do NOT describe text placement, colors, or layout — that's handled separately. Just the real-world scene/subject.
- Keep it 2-4 sentences.

━━━ GLOBAL RULES ━━━
1. Each of the 3 combos must approach the SAME topic from a DIFFERENT ANGLE:
   - Combo 1: Lead with the SHOCKING OUTCOME / consequence
   - Combo 2: Lead with the MYSTERY / hidden reason ("Real Reason", "The Truth Nobody Says")
   - Combo 3: Lead with the PERSONAL STAKES for the viewer ("What This Means For You")
2. Thumbnail text MUST complement the title — NEVER echo the same words.
3. Each of the 3 thumbnail texts and descriptions must be DIFFERENT from each other.
4. Language: ALWAYS write titles and thumbnail text in English only — do NOT use Hindi, Hinglish, or any other language, regardless of the script language.
5. Return ONLY valid JSON array of exactly 3 objects: [{"title": "...", "thumbnailText": "...", "description": "..."}, ...]

SCRIPT TO ANALYZE:
${scriptText.slice(0, 3500)}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', temperature: 1.2 },
    });
    const raw = response.text?.trim() || '[]';
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Expected array from AI');
    return parsed
      .filter((p: any) => p && typeof p.title === 'string' && typeof p.thumbnailText === 'string')
      .slice(0, 3)
      .map((p: any) => ({ title: p.title, thumbnailText: p.thumbnailText, description: p.description || '' }));
  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429) {
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
    }
    console.error("Error in generateTitleTextPair:", error);
    throw error;
  }
};

export const generateThumbnailInspiration = async (scriptText: string): Promise<string> => {
  const ai = getAi();

  const prompt = `You are a creative YouTube thumbnail director. Read the script below and write a short, specific thumbnail art direction in 2-4 sentences.

SCRIPT (first 2000 chars):
${scriptText.slice(0, 2000)}

Your output should describe:
1. WHO should appear (person type, age, gender, look — e.g. "stressed middle-aged man in plain shirt", "young confident woman in business attire", "tired working-class man in his 40s") — or the key topic-specific scene/object if no person fits.
2. EXPRESSION / MOOD (e.g. "shocked and overwhelmed", "quietly sad", "determined and angry")
3. BACKGROUND / ATMOSPHERE (e.g. "dark red dramatic background", "moody office blur", "gritty urban night")

Write in plain English. No bullet points. No JSON. Just a short, crisp scene description (2-4 sentences max) that an image generator can immediately turn into a photorealistic thumbnail.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return response.text?.trim() || '';
  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429) {
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
    }
    console.error("Error in generateThumbnailInspiration:", error);
    throw error;
  }
};

export const generateNarratorPrompts = async (scriptText: string): Promise<string[]> => {
  const ai = getAi();

  const prompt = `
    Based on the following script, generate a sequence of detailed image generation prompts for the "Narrator" intro section.
    Generate as many prompts as necessary (e.g., 5, 10, 15, 20) to fully illustrate the scenarios, questions, and progression of the intro.
    The style MUST be a "Fern style documentary reconstruction". 
    
    CRITICAL STYLE RULES:
    1. The main subject MUST ALWAYS be a "smooth, featureless white 3D mannequin figure with no facial features".
    2. The mannequin should be dressed in clothing relevant to the scenario (e.g., a dark suit and tie, casual t-shirt, lab coat, etc.).
    3. The environment must be highly detailed, cinematic, and dimly lit with dramatic, moody lighting (like warm desk lamps or cool monitor glows).
    4. Frame the shots like a professional documentary (e.g., over-the-shoulder, wide establishing shot, close-up on an object with the mannequin blurred in the background).
    
    Incorporate elements from the script's topic into these scenarios to visually tell the story.
    
    Return ONLY a JSON array of strings.
    
    Script:
    ${scriptText}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    if (!response.text) throw new Error("No response from Gemini");
    let jsonText = response.text;
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonText);
  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429) {
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
    }
    console.error("Error in generateNarratorPrompts:", error);
    throw error;
  }
};

export const transcribeAudioBlob = async (audioBlob: Blob): Promise<TranscriptSegment[]> => {
  const ai = getAi();

  // Convert Blob to Base64
  const base64Audio = await blobToBase64(audioBlob);
  
  // Clean base64 string (remove data URL prefix if present)
  const data = base64Audio.split(',')[1];

  const prompt = `
    Listen to this audio carefully. 
    Generate a detailed transcription for video subtitles.
    CRITICAL: Break the transcript into SHORT, NATURAL PHRASES (approx 3-10 words).
    Do not provide long sentences. We need fine-grained timestamps for image synchronization.
    Return a JSON array where each object has:
    - 'text': The spoken text.
    - 'start': Start time in seconds (number).
    - 'end': End time in seconds (number).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash', 
      contents: {
        parts: [
            {
                inlineData: {
                    mimeType: audioBlob.type || 'audio/mpeg',
                    data: data
                }
            },
            { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              start: { type: Type.NUMBER },
              end: { type: Type.NUMBER },
            },
            required: ["text", "start", "end"],
          },
        },
      },
    });

    let jsonText = response.text;
    if (!jsonText) throw new Error("No response from Gemini");

    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    const segments: TranscriptSegment[] = JSON.parse(jsonText);
    return segments;

  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429) {
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
    }
    console.error("Gemini Transcription Error:", error);
    throw error;
  }
};

export const transcribeAudio = async (audioFile: File): Promise<TranscriptSegment[]> => {
  return transcribeAudioBlob(audioFile);
};

export const generateDebateScript = async (
  topic: string, 
  duration: number, 
  includeNarrator: boolean,
  customScript?: string,
  contextFileContent?: string,
  model: string = 'gemini-3.8-flash',
  language: string = 'English',
  style: 'debate' | 'debate2' | 'conversational' | 'formal debate' | 'explained' | 'explained_solo' | 'narration' | 'monkey_explain' | 'crime_documentary' | 'viral_recap' | 'deep_explainer' | 'image' | 'podcast_breakdown' | 'podcast_panel' | 'context_bridge' | 'situational' | 'documentary' | 'joe_rogan' | 'finance_deep_dive' | 'professor_jiang' | 'book_summary' | 'questioning' | 'transcript_review' | 'summarizer_pov' | 'phone_studio' = 'debate',
  speakerCount: number = 2,
  providedSpeakerNames?: string[],
  specificDetails?: string,
  youtubeUrl?: string,
  commentsFileContent?: string
): Promise<DebateSegment[]> => {
  const ai = getAi();

  let prompt = "";
  const wordsPerMinute = 150;
  const isAuto = duration <= 0;
  const targetWordCount = isAuto ? 0 : duration * wordsPerMinute;

  // Duration constraint lines — empty when auto so AI decides length
  const durLineEn  = isAuto ? '' : `Target Duration: ${duration} minutes (approximately ${targetWordCount} words total).`;
  const durFillEn  = isAuto ? '' : `CRITICAL: Ensure the content is substantive and detailed enough to fill ${duration} minutes.`;
  const durTotalEn = isAuto ? '' : `5. The total length should be approximately ${targetWordCount} words to fit a ${duration} minute duration.`;
  const durLineHi  = isAuto ? '' : `लक्ष्य अवधि: ${duration} मिनट (लगभग ${targetWordCount} शब्द)।`;
  const durFillHi  = isAuto ? '' : `महत्वपूर्ण: सुनिश्चित करें कि सामग्री ${duration} मिनट भरने के लिए पर्याप्त और विस्तृत है।`;
  const durTotalHi = isAuto ? '' : `5. कुल लंबाई लगभग ${targetWordCount} शब्द होनी चाहिए ताकि ${duration} मिनट की अवधि पूरी हो सके।`;

  // Determine Names
  let speakers = providedSpeakerNames || [];
  // Fill missing names with placeholders if needed, but better to let AI generate them if empty
  // If completely empty, we ask AI to generate them.
  
  const speakerListStr = speakers.length > 0 
    ? speakers.join(", ") 
    : `${speakerCount} distinct speakers relevant to the topic`;

  const isHindi = language.toLowerCase() === 'hindi';

  // Narrator Intro Logic (English)
  const narratorIntro = `
    Start with a Narrator introduction following this EXACT structure:
    1. Introduction: Briefly introduce the overall topic with a strong hook.
    2. Scenario 1: Present the first specific scenario/case study clearly.
    3. The Question: State the central moral/ethical question for this scenario.
    
    After the Narrator, the debate must follow this pattern for EACH scenario:
    - Speaker A presents their POV (Point of View).
    - Speaker B presents their opposing POV.
    - (Optional) Short rebuttal/discussion.
    - Narrator introduces the NEXT scenario (if applicable) and repeats the pattern.
  `;

  // Narrator Intro Logic (Hindi)
  const narratorIntroHindi = `
    नैरेटर (Narrator) की भूमिका केवल शुरुआत (Start) और अंत (End) में होगी। बीच में बिल्कुल नहीं।

    शुरुआत (Start):
    नैरेटर को सीधे मुद्दे पर आना चाहिए (To-The-Point):
    1. Situation (परिस्थिति): सीधे केस/सिचुएशन बताएं। (जैसे: "एक सेल्फ-ड्राइविंग कार के सामने 5 लोग हैं...")
    2. Debate Question (सवाल): तुरंत मुख्य नैतिक सवाल पूछें। (जैसे: "AI किसे बचाए? ड्राइवर या 5 लोग?")

    इसके बाद बहस (Debate):
    - वक्ता A (Speaker A) अपना पक्ष रखता है।
    - वक्ता B (Speaker B) अपना विरोधी पक्ष रखता है।
    - वे आपस में तर्क-वितर्क (Rebuttal) करते हैं।
    - यदि एक से अधिक परिदृश्य (Scenarios) हैं, तो वक्ता (Speakers) खुद अगले विषय पर जाएंगे। (जैसे: "ठीक है, लेकिन अगर हम डेथ पेनल्टी की बात करें...")
    
    अंत (End):
    - नैरेटर केवल अंत में एक संक्षिप्त निष्कर्ष (Conclusion) देने के लिए आएगा।
    
    सख्त नियम: नैरेटर बहस के बीच में कभी नहीं बोलेगा।
  `;

  if (isHindi) {
      if (customScript) {
        prompt = `
          तुम्हारा काम है नीचे दी गई script को speaker-tagged JSON segments में convert करना।

          ORIGINAL SCRIPT:
          """
          ${customScript}
          """

          INSTRUCTIONS:
          1. SPEAKER DETECTION: Script में जो speakers हैं उनके exact नाम detect करो जैसे script में लिखे हैं (जैसे "Rahul:", "Host:", "Guest 1:" आदि)। अगर कोई label नहीं है तो context से logically 2 speakers assign करो।
          2. SPLIT: Script को speaker turns में बाँटो — हर बार जब speaker बदले एक नया segment बनाओ।
          3. TEXT PRESERVE: हर segment का text EXACTLY वही रखो जो original script में है — एक भी word मत बदलो, मत हटाओ, मत छोटा करो। सिर्फ speaker label prefix हटाओ अगर है।
          4. Narrator: अगर script में कोई unattributed text है तो उसे "Narrator" tag करो।

          STRICT RULES:
          ✗ Original text को rewrite, shorten, या modify मत करो — WORD FOR WORD preserve करो
          ✗ Speaker names invent मत करो — script से exactly लो
          ✗ Content add या remove मत करो
          ✓ Output ONLY valid JSON array — कोई extra text नहीं।

          Output format:
          [
            {"speaker": "Speaker Name", "text": "Exact original text for this turn"},
            {"speaker": "Speaker Name", "text": "Exact original text for next turn"},
            ...
          ]
        `;
      } else {
        if (style === 'explained') {
            if (includeNarrator) {
              prompt = `
                विषय: "${topic}"
                ${specificDetails ? `विशेष context: ${specificDetails}` : ''}
                ${durLineHi}
                भाषा: Hinglish — natural, conversational।

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                STEP 1 — पहले PLAN करो (script लिखने से पहले):
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                इस topic के 4-6 सबसे important aspects/points identify करो।
                हर point के लिए सोचो:
                  → यह point है क्या? (definition / meaning)
                  → इसका positive/benefit side क्या है?
                  → इसका negative/drawback/दूसरा side क्या है?
                  → Real life example क्या होगा?
                यही structure script में आएगा।

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                CHARACTERS:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                - Narrator: सिर्फ opening intro और closing के लिए — बीच में नहीं आएगा
                - 2 Speakers: ${speakers.length > 0 ? speakers.join(", ") : "topic के हिसाब से 2 fresh नाम choose करो — हर बार अलग"} — दोनों की अलग personality:
                  Speaker A: curious, questions पूछता है, कभी-कभी devil's advocate बनता है
                  Speaker B: well-informed, clearly explain करता है, दोनों sides देखता है

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                STRUCTURE:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                【 Narrator — Opening (2-3 lines max) 】
                Seedha topic ke naam se shuru karo — koi dramatic hook nahi, koi greeting nahi।
                Format: "Aaj hum baat karenge [topic] ke baare mein — [ek line: kya cover karenge]।"
                Example: "Aaj hum baat karenge Robert Greene ki 48 Laws of Power ke baare mein — kya hai yeh book, iske key laws, aur kya yeh practically kaam karte hain।"

                【 Point-by-Point Discussion (यही main content है) 】
                हर important aspect/point के लिए यह structure follow करो:

                POINT X: [Point का नाम]
                → Speaker A: यह point है क्या — basics से explain करो, zero assume करो
                → Speaker B: इसका एक side/angle बताओ (benefit / how it works / positive view)
                → Speaker A: इसका दूसरा side बताओ (drawback / limitation / counter view / darker side)
                → Speaker B: Real example दो जो दोनों sides को clearly show करे
                → दोनों मिलकर: इस point का conclusion — यह कब काम करता है, कब नहीं

                यही pattern हर point पर repeat करो।
                Points के बीच naturally transition करो — "Ab baat karte hain..." जैसे phrases से।

                【 Narrator — Closing (SHORT — 2-3 lines) 】
                → Topic का core essence एक line में
                → एक thought-provoking question या insight जो याद रहे

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                RULES:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ✓ हर point के दोनों sides ज़रूर दिखाओ — सिर्फ positive या सिर्फ negative नहीं
                ✓ हर point zero से explain करो — audience को पहले से कुछ पता नहीं है
                ✓ हर point के साथ एक specific, real example — generic नहीं
                ✓ Simple Hinglish — expert की सोच, दोस्त की भाषा
                ✓ दोनों speakers की अलग voice — एक जैसे मत लगें
                ✗ BANNED: Long dramatic intro — opening 4 lines से ज़्यादा नहीं
                ✗ BANNED: Narrator बीच में आए — सिर्फ opening और closing
                ✗ BANNED: "यह महत्वपूर्ण है", "निष्कर्ष में", "आइए समझते हैं", generic filler
                ✗ BANNED: Speakers एक-दूसरे के words refer करें — seedha topic पर बात करो
                ${durFillHi}
              `;
            } else {
              prompt = `
                विषय: "${topic}"
                ${specificDetails ? `विशेष context: ${specificDetails}` : ''}
                ${durLineHi}
                भाषा: Hinglish — जैसे दो जानकार दोस्त आपस में बात कर रहे हों।

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                STEP 1 — पहले PLAN करो:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                इस topic के 4-6 सबसे important aspects/points identify करो।
                हर point के लिए तय करो:
                  → यह क्या है (definition)
                  → इसका positive/benefit side
                  → इसका negative/drawback/दूसरा side
                  → Best real example

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                CHARACTERS — ठीक 2 speakers (Narrator नहीं):
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ${speakers.length > 0 ? `इन नामों का उपयोग करो: ${speakers.join(", ")}.` : `Topic के हिसाब से fresh नाम choose करो — हर बार अलग।`}
                दोनों की personality अलग:
                - Speaker A: curious, devil's advocate, dono sides explore karta hai
                - Speaker B: well-informed, clearly explain karta hai, examples deta hai

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                STRUCTURE:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                【 Opening — Speaker A (2-3 lines max) 】
                Seedha topic ke naam se shuru karo — koi greeting nahi, koi "yaar" nahi।
                Format: "[Topic ka naam] — [ek line mein kya cover karenge]। Shuru karte hain।"
                Example: "Aaj hum baat karenge Robert Greene ki 48 Laws of Power ki — kya hai yeh book, iske key laws, aur kya yeh practically kaam karte hain।"

                【 Point-by-Point Discussion (यही main content है) 】
                हर important aspect/point के लिए:

                POINT X: [Point का नाम]
                → Speaker A: यह point क्या है — basics से, zero assume karo
                → Speaker B: इसका एक side (benefit / how it works / positive view)
                → Speaker A: इसका दूसरा side (drawback / limitation / counter / darker side)
                → Speaker B: Real example जो दोनों sides show करे
                → दोनों: इस point का conclusion — kab kaam karta hai, kab nahi

                Natural transition: "Ab ek aur cheez..." / "Yaar ek important angle reh gaya..."

                【 Closing — Speaker B (SHORT — 2-3 lines) 】
                → Topic ka core essence ek line mein
                → Ek memorable thought ya question

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                RULES:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ✓ हर point के DONO sides dikhao — sirf positive ya sirf negative nahi
                ✓ हर point zero से explain करो
                ✓ हर point ke saath specific real example
                ✓ Simple Hinglish — expert ki soch, dost ki bhaasha
                ✓ Dono speakers ki alag voice
                ✗ BANNED: Greeting ya "yaar" se opening — seedha topic se shuru
                ✗ BANNED: Long intro — opening max 3 lines
                ✗ BANNED: "yeh zaroori hai", "nirhskarsh mein", generic filler
                ✗ BANNED: Speakers ek-dusre ke words refer karein
                ${durFillHi}
              `;
            }
        } else if (style === 'image') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: IMAGE STYLE — SINGLE VOICE, SINGLE MAN SCENARIO
            एक ही speaker। कोई narrator नहीं, कोई दूसरा speaker नहीं।
            यह psychology / finance / self-improvement topic पर एक voiceover script है।
            Audience: USA-based adults। Language: English।
            Hook: Prefer scenarios featuring a single man — relatable, ordinary, real-feeling.
            ═══════════════════════════════════════

            Topic: "${topic}"
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}
            ${durLineHi}
            Speaker: ${speakers.length > 0 ? speakers[0] : 'Voiceover'}

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STRUCTURE:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            【 HOOK (first 3-5 lines — this is everything) 】
            एक specific, vivid MAN के scenario से शुरू करो — real-feeling situation।
            फिर audience को flip करो: "Have you ever...?" / "Sound familiar?" / "That's most of us."
            ALWAYS a man. Never a woman. Never a group.
            Good hook examples:
            • "A man who never misses a gym session, eats clean, sleeps 8 hours — but still feels completely empty inside. Have you ever met someone like that? Or maybe... that's you."
            • "There's a man who checks his bank account every morning — not out of habit. Out of fear. He earns good money. It still never feels like enough."
            • "A 29-year-old man who looks successful on paper — good job, decent apartment, nice clothes — but spends every Sunday night dreading Monday. Not because the job is hard. Because it doesn't mean anything."

            【 THE CORE INSIGHT 】
            Hook के बाद real psychology या financial principle explain करो।
            — What is actually happening (the mechanism, the pattern)
            — Why most people don't see it clearly
            — What it costs them (emotionally, financially, time-wise)
            ✓ Examples में भी हमेशा "a man", "he", "him" — never "she" or "they"

            【 THE SHIFT 】
            Audience को एक reframe दो — एक नया नज़रिया।
            — A simple, concrete principle or action
            — Example of a man who understood this and what changed
            — Grounded, not preachy

            【 CLOSING LINE (1-2 lines max) 】
            एक line जो याद रहे। A question, a truth, or a challenge.
            Example: "The goal was never the money. The goal was the feeling you thought money would give you."

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            RULES:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✓ Single speaker — no dialogue, no back-and-forth
            ✓ English — USA audience, conversational but smart
            ✓ EVERY scenario/example = ONE MAN only (he/him/his)
            ✓ Hook must be a specific male character scenario, not generic
            ✓ Tone: calm, direct, intelligent
            ✗ BANNED: Any female character or "she/her"
            ✗ BANNED: Groups, couples, or "they/them" scenarios
            ✗ BANNED: "In today's video we will..." — start with the hook directly
            ✗ BANNED: Preachy advice, motivational poster lines, hollow positivity
            ✗ BANNED: Multiple speakers or dialogue format
            ${durFillHi}
          `;
        } else if (style === 'professor_jiang') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: PROFESSOR JIANG XUEQIN — CURRENT EVENTS DEEP ANALYSIS
            Speaker: Professor Jiang Xueqin — एक analytical, measured, globally-informed thinker।
            अकेला एक speaker। कोई dialogue नहीं, कोई debate नहीं।
            यह एक structured current-events breakdown है — जैसे एक professor किसी घटना को dissect करे।
            Language: English। Tone: academic but accessible, direct, never sensational।
            ═══════════════════════════════════════

            Topic/Event: "${topic}"
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}
            ${durLineHi}
            Speaker Name: ${speakers.length > 0 ? speakers[0] : 'Professor Jiang Xueqin'}

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STRUCTURE — इसी exact order में:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            【 OPENING — THE MOMENT 】
            Topic को seedha ek sharp, factual statement से शुरू करो।
            Conversational lekin authoritative — जैसे professor class shuru karta hai।
            Example: "So today, Trump agreed to a ceasefire. But at what cost?"
            "The Fed held rates again. Let's talk about what that actually means."
            2-3 sentences max। No filler। No "In today's video..."

            【 WHAT HAPPENED — THE FACTS 】
            Precisely batao kya hua — verified, specific।
            Key players, dates, decisions — jo important hain।
            Neutrally stated। No opinion yet।
            Bullet-point style thinking lekin flowing prose में।

            【 WHY IT HAPPENED — THE DEEPER CONTEXT 】
            Ab explain karo kyun yeh hua।
            Historical context, power dynamics, underlying pressures — jo common audience miss karta hai।
            Yahan professor ka asli value hai: connection points jo surface-level coverage skip kar deti hai।

            【 WHAT IT ACTUALLY MEANS — THE REAL IMPLICATIONS 】
            Iska real-world impact kya hai?
            — Ordinary people pe
            — Geopolitically / financially / socially
            — Short-term vs long-term
            Specific, grounded — no vague "this will have big consequences"

            【 WHAT COULD HAPPEN NEXT — STRUCTURED PREDICTIONS 】
            3 clearly labeled scenarios — each realistic, each distinct:

            Scenario A, Most Likely: explain why yeh ho sakta hai, kis direction mein jaayega
            Scenario B, Best Case: optimal outcome, conditions jo chahiye
            Scenario C, Worst Case: agar cheezein galat disha mein gayeen

            Each scenario 2-3 sentences। Grounded in logic, not fear।

            【 CLOSING LINE 】
            Ek observation ya question jo listener ke saath rehta ho।
            Not hopeful, not hopeless — honest।
            Example: "The question now is not whether a deal was made. It's what was given up to make it."

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            RULES:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✓ Single speaker — Professor Jiang Xueqin's voice only
            ✓ English — clear, academic but not jargon-heavy
            ✓ Every claim grounded — no speculation without basis
            ✓ Structured predictions clearly labeled (A/B/C)
            ✓ Tone: measured, confident, never alarmist or cheerleader
            ✓ EXPLAIN every term, acronym, institution, or event the first time it is mentioned — weave the explanation naturally into the sentence, like a good professor would. Example: "The IMF — the International Monetary Fund, which acts as a global lender of last resort — stepped in." Or: "Section 301 tariffs, which the US uses to punish unfair trade practices, were invoked." Never assume the audience already knows.
            ✗ BANNED: "In today's video..." / "Don't forget to like and subscribe"
            ✗ BANNED: Emotional manipulation, sensational framing
            ✗ BANNED: Second speaker or dialogue of any kind
            ✗ BANNED: Vague conclusions ("time will tell", "only time will tell")
            ✗ BANNED: Any brackets in the output — no [ ], no 【 】, no ( ) around labels — plain text only
            ✗ BANNED: Section headings in the output — just flow naturally from one section to next
            ${durFillHi}
          `;
        } else if (style === 'book_summary') {
          if (speakerCount === 1) {
            prompt = `
              ═══════════════════════════════════════
              STYLE: BOOK SUMMARIZER — SOLO VOICE EXPLAINER
              One speaker only. No dialogue. No second voice.
              Language: English — clear, conversational, warm.
              Tone: Like a knowledgeable friend who just read the book and is telling you everything over coffee.
              ═══════════════════════════════════════
              Book / Chapter: "${topic}"
              ${specificDetails ? `Extra context: ${specificDetails}` : ''}
              ${durLineEn}
              Speaker: ${speakers.length > 0 ? speakers[0] : 'Voiceover'}

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              DETECT INPUT TYPE:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              - Full book title (e.g. "48 Laws of Power", "Atomic Habits") → summarize the whole book, covering the most important laws/chapters/concepts.
              - One chapter or law (e.g. "Law 1: Never Outshine The Master") → deep breakdown of just that chapter/law.
              Same structure applies in both cases.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STRUCTURE (in this exact order):
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

              INTRO — START DIRECTLY
              First line names the book/chapter and captures the core idea.
              Example: "48 Laws of Power — Robert Greene's guide to understanding how power really works, and how to use it without being used."
              Then 2-3 lines telling the listener exactly what this video covers.

              BACKGROUND
              Who wrote it and why? What problem does this book/chapter solve?
              One real example or fact that shows why it matters. Simple language. Zero jargon.

              MAIN BREAKDOWN
              For a full book: cover the 5-10 most important laws/chapters/concepts.
              For one chapter: cover 3-5 key ideas from that chapter.

              For each concept:
              → State the concept name clearly
              → Explain it in 2-3 simple lines — as if explaining to someone who has never heard of this
              → Give one real-life example — a famous person, historical event, or relatable everyday scenario
              → Practical application — how can the listener use this in their own life? Be specific.

              COMMON MISTAKE
              One common mistake or misconception people have about this book/chapter.
              1-2 sharp, specific lines.

              KEY TAKEAWAYS
              3-5 things the listener can apply starting today. Practical, actionable, specific.

              CLOSING
              One strong, memorable final line that captures the whole message.
              Then: "I hope you found this video informative. Thanks for watching."

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              RULES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ✓ Always write in English only
              ✓ Single speaker throughout — warm, confident, conversational
              ✓ Real example for every concept — no vague placeholders
              ✓ Explain any term immediately when used — zero assumed knowledge
              ✓ Every section must be present
              ✗ BANNED: Second speaker or dialogue of any kind
              ✗ BANNED: Generic opener like "Today I'm going to tell you about..." — start directly
              ✗ BANNED: Filler phrases ("This is very important", "This book is amazing")
              ✗ BANNED: Formatting marks — no **, no --, no [], no bullet symbols in output
              ✗ BANNED: Section headings in output — natural flowing speech only
              ${durFillEn}
            `;
          } else if (!includeNarrator) {
            prompt = `
              ═══════════════════════════════════════
              STYLE: BOOK SUMMARIZER — 2 HOSTS DISCUSSION (NO NARRATOR)
              Two hosts break down the book/chapter together in a natural back-and-forth conversation.
              No narrator. No third voice. Just two engaged, curious hosts.
              Language: English — conversational, energetic, easy to follow.
              ═══════════════════════════════════════
              Book / Chapter: "${topic}"
              ${specificDetails ? `Extra context: ${specificDetails}` : ''}
              ${durLineEn}
              Hosts: ${speakers.length >= 2 ? `${speakers[0]} and ${speakers[1]}` : 'Choose two natural-sounding names — one male, one female'}

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              DETECT INPUT TYPE:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              - Full book title → cover the most important 5-10 laws/concepts from the whole book.
              - One chapter/law → go deep on just that chapter — cover 3-5 key ideas from it.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              HOST PERSONALITIES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              Host A: Curious, asks questions, plays devil's advocate — sometimes skeptical.
              Host B: Well-read on the topic, explains clearly, gives examples, sees multiple angles.
              Both sound natural — not scripted. They react, build on each other, occasionally push back.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STRUCTURE:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

              OPENING (Host A or B — 3-4 lines)
              Jump straight in. Name the book/chapter. One-line hook on what it's about.
              Tell the listener what they'll learn in this episode. No warm-up. No generic greetings.
              Example: "Today we're diving into 48 Laws of Power — the book that basically wrote the rulebook on how power works in the real world. We'll break down the biggest laws, the most shocking examples, and whether any of this is actually useful in everyday life."

              BACKGROUND — SHORT (2-3 exchanges)
              Host A asks: who wrote it and why does this book exist?
              Host B answers with the context — author background, what problem the book solves, one striking fact about the book.

              CONCEPT BREAKDOWN (this is the main bulk)
              Go through each major law/concept one by one:
              → Host B introduces the concept in simple terms
              → Host A reacts — asks a follow-up, challenges it, or gives a real-world angle
              → Host B gives a real example — specific name, event, or scenario (not vague)
              → Both agree on the practical takeaway — how does someone use this today?
              Transition naturally between concepts — "Okay, next one..." or "That reminds me of another law..."

              COMMON MISTAKE (1 exchange)
              Host A raises a common misconception about the book/chapter.
              Host B corrects it clearly and specifically.

              KEY TAKEAWAYS (1 exchange — Host A or B)
              3-5 specific things the listener can actually apply. Not vague advice — real, actionable steps.

              CLOSING (2-3 lines — one or both hosts)
              One strong final thought that captures the message of the book/chapter.
              End with: "Hope you found this useful. See you in the next one."

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              RULES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ✓ Always write in English only
              ✓ Exactly 2 speakers — no narrator, no third voice
              ✓ Real example for every concept — no generic "imagine someone does X..."
              ✓ Explain any term the moment it's used — zero jargon left unexplained
              ✓ Hosts must sound different — not a monologue split into two
              ✗ BANNED: Narrator or any third speaker
              ✗ BANNED: Generic opener ("Hey guys, welcome back to...") — start on topic immediately
              ✗ BANNED: Filler agreement ("Absolutely!", "Great point!", "Totally!") — every exchange adds value
              ✗ BANNED: Formatting marks in output — no **, no --, no [], no bullet symbols
              ✗ BANNED: Section headings in output — natural flowing dialogue only
              ${durFillEn}
            `;
          } else {
            prompt = `
              ═══════════════════════════════════════
              STYLE: BOOK SUMMARIZER — NARRATED 2 HOST FORMAT
              Narrator opens and closes. Two hosts do the main breakdown.
              Language: English — clear, engaging, accessible.
              ═══════════════════════════════════════
              Book / Chapter: "${topic}"
              ${specificDetails ? `Extra context: ${specificDetails}` : ''}
              ${durLineEn}
              Narrator: Narrator
              Hosts: ${speakers.length >= 2 ? `${speakers[0]} and ${speakers[1]}` : 'Choose two natural-sounding names — one male, one female'}

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              DETECT INPUT TYPE:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              - Full book title → cover the most important 5-10 laws/concepts from the whole book.
              - One chapter/law → deep breakdown of just that chapter — cover 3-5 key ideas.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              HOST PERSONALITIES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              Host A: Curious, questions-driven, occasionally skeptical — the learner in the room.
              Host B: Knowledgeable, example-driven, explains both sides — the expert in the room.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STRUCTURE (strictly in this order):
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

              NARRATOR — OPENING (3-4 lines max)
              State the book/chapter name directly. One-sentence hook on the core idea.
              Tell the listener what they'll take away from this episode. No warmup. No generic intro.
              Example: "48 Laws of Power by Robert Greene — a book that reveals how power really works in the world, who has it, who loses it, and why. Today, we break down the biggest laws and what they mean for your real life."

              HOSTS — BACKGROUND (2-3 exchanges)
              Host A asks about the book's origin — who wrote it, why does it exist?
              Host B answers: author background, the problem the book solves, one striking real fact.

              HOSTS — CONCEPT BREAKDOWN (main content)
              Go through each major concept/law one by one:
              → Host B introduces the concept simply
              → Host A reacts — questions, challenges, or real-world angle
              → Host B gives a specific real example — name, event, scenario
              → Both land on a practical takeaway — how to apply this today
              Transition naturally between concepts.

              HOSTS — COMMON MISTAKE (1 exchange)
              Host A raises a common misconception. Host B corrects it sharply.

              HOSTS — KEY TAKEAWAYS (1 exchange)
              3-5 specific, actionable things the listener can use today.

              NARRATOR — CLOSING (2-3 lines)
              One strong line capturing the essence of the book/chapter.
              Then: "I hope you found this video informative. Thanks for watching."

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              RULES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ✓ Always write in English only
              ✓ Narrator only appears at the very start and very end — nowhere in the middle
              ✓ Exactly 2 hosts for the main discussion
              ✓ Real, specific example for every concept — no generic placeholders
              ✓ Explain every term immediately — no unexplained jargon
              ✗ BANNED: Narrator speaking in the middle of the discussion
              ✗ BANNED: Generic opener — Narrator must name the book/topic in the first line
              ✗ BANNED: Filler agreement ("Absolutely!", "Great point!") — every line must add value
              ✗ BANNED: Formatting marks in output — no **, no --, no [], no bullet symbols
              ✗ BANNED: Section headings in output — natural flowing dialogue only
              ${durFillEn}
            `;
          }
        } else if (style === 'questioning') {
          const speakerBlock = speakerCount >= 4 && speakers.length >= 4
            ? `Speaker 1: ${speakers[0]}
Speaker 2: ${speakers[1]}
Speaker 3: ${speakers[2]}
Speaker 4: ${speakers[3]}

CRITICAL — Use EXACTLY these names as speaker labels throughout. Do NOT rename them.
Each name represents its identity/worldview:
- A religion name (Muslim, Christian, Hindu, Buddhist, Atheist) → speak from that faith's perspective, in the voice of a believer
- An AI name (ChatGPT, Grok, Claude, Gemini) → speak as that AI system would, in its tone and style
- A public figure name → speak in that person's known voice, views, and style
- Any other name → represent whatever worldview or identity that name implies`
            : `Choose 4 speakers whose perspectives are most naturally contrasting for this specific topic.
Examples (pick what fits the topic — don't copy blindly):
- Religious/moral topic: Christian, Muslim, Buddhist, Atheist
- AI topic: ChatGPT, Grok, Claude, Gemini
- Finance topic: Warren Buffett, Elon Musk, Dave Ramsey, a broke 25-year-old
- Political topic: Democrat, Republican, Libertarian, Independent voter
Choose whatever 4 make the most sense for THIS specific topic.
Use those labels as speaker names throughout.`;

          const qLang = isHindi
            ? 'Hinglish (Hindi + English mix, natural conversational tone — jaise real log baat karte hain)'
            : language;
          const qAudience = isHindi ? 'Hindi-speaking audience (India)' : 'USA adults';
          const contextBlock = specificDetails
            ? `BACKGROUND KNOWLEDGE — use these points as your OWN understanding to enrich the discussion. NEVER say "podcast mein", "video mein", "unhone kaha", "as seen in", "according to the show/interview/article" or anything that references an external source. These are just facts and angles you already know:
${specificDetails}`
            : '';

          if (!includeNarrator) {
            prompt = `
              STYLE: QUESTIONING — 4 PERSPECTIVES
              Language: ${qLang}. Audience: ${qAudience}.
              Topic / Question: "${topic}"
              ${contextBlock}
              ${durLineEn}

              ${speakerBlock}

              CRITICAL — THIS IS A DIRECT DISCUSSION OF THE QUESTION ITSELF.
              Speaker 1 opens by immediately stating their OWN genuine take on the question — no warm-up, no "did you see/watch/read" opener. Just their position on the question, right away.

              ${isHindi
                ? `GALAT opening: "Yaar, tune wo podcast/video dekha jisme Vikas Sir ne kaha..." ya "Bhai, ek show mein inhone ye point rakha tha..."\nSAHI opening: "Mujhe lagta hai shadi ka concept genuinely change ho raha hai — aur ye zyada logon ke liye achha hai..." ya "Dekho, ye question hi galat hai — shadi khatam nahi ho rahi, sirf uski definition badal rahi hai..."`
                : `WRONG opening: "Did you guys see that podcast where they debated this?"\nRIGHT opening: "Does money actually buy happiness? Yes — up to a clear point. Here's why..."`}

              Then all 4 speakers weigh in from their own worldview.

              Each speaker must:
              - Speak from their own worldview/identity consistently throughout
              - Support their point with at least one real, specific example (a name, event, or situation)
              - Directly respond to what others say — not just deliver separate monologues
              - Use plain language — conversational, not academic

              The conversation flow should feel natural and different for every topic.
              Do not repeat a rigid round-by-round template — let the dialogue evolve based on what the topic calls for.
              Speaker 1 closes with a brief final thought.

              RULES:
              ✓ Language: ${qLang}
              ✓ Speaker names used EXACTLY as given — do not rename or replace them
              ✓ 4 distinct voices — each sounds clearly different from the others
              ✓ Real specific examples — not vague general claims
              ✓ Genuine disagreement — speakers hold their positions
              ✗ NEVER say "podcast mein", "video mein", "show mein", "unhone kaha", "as per the interview/article/video" — speakers discuss the QUESTION from their OWN perspective
              ✗ NEVER reference a show name, guest name as a source — only as a real-world example if needed
              ✗ No generic filler ("Great point!", "Bilkul!", "I totally agree!")
              ✗ No formatting marks in output — no **, no --, no bullet symbols
              ✗ No section headings in output — just natural flowing dialogue
              ${durFillEn}
            `;
          } else {
            prompt = `
              STYLE: QUESTIONING — NARRATOR + 4 PERSPECTIVES
              Language: ${qLang}. Audience: ${qAudience}.
              Topic / Question: "${topic}"
              ${contextBlock}
              ${durLineEn}

              Narrator: Narrator
              ${speakerBlock}

              CRITICAL — THIS IS A DIRECT DISCUSSION OF THE QUESTION ITSELF. No podcast, video, show, or external reference anywhere.

              ${isHindi
                ? `Narrator seedha question throw kare — sharp aur immediate: "Theek hai, aaj ka sawaal — [topic]. [Speaker 1], [Speaker 2], [Speaker 3], [Speaker 4] — bolo." Koi podcast/show/video ka naam nahi.`
                : `The Narrator opens by throwing the question directly: "Alright, here's the question — [topic]. [Speaker 1], [Speaker 2], [Speaker 3], [Speaker 4] — let's get into it." No show name, no "did you watch/see".`}

              Each speaker responds to the QUESTION itself from their own worldview/identity — NOT as a reaction to something they "saw" or "watched".
              The Narrator asks sharp follow-up questions at natural moments — probing the most interesting tensions.

              The conversation should feel organic and specific to this topic.
              Do not follow a rigid round-by-round template — let the discussion evolve naturally.

              Each speaker must:
              - Stay consistent with their worldview/identity throughout
              - Back every major point with a real, specific example (a name, event, or concrete situation)
              - React to what others say — not just give prepared speeches
              - Use plain accessible language

              The Narrator closes with a brief honest observation about what the conversation revealed.

              RULES:
              ✓ Language: ${qLang}
              ✓ Speaker names used EXACTLY as given — do not rename or replace them
              ✓ Narrator appears at the start, at natural moments to ask questions, and at the close
              ✓ 4 distinct speaker voices — each sounds clearly different from the others
              ✓ Real specific examples for every major point — not abstract claims
              ✓ Genuine disagreement — speakers hold their ground
              ✗ NEVER say "podcast mein", "video mein", "show mein", "unhone kaha", "according to the interview" — speakers are discussing the QUESTION, not reacting to a source
              ✗ NEVER reference a show name or host as the source of the topic
              ✗ No generic filler ("Great point!", "Bilkul!", "I totally agree!")
              ✗ No formatting marks in output — no **, no --, no bullet symbols
              ✗ No section headings in output — just natural flowing dialogue
              ${durFillEn}
            `;
          }
        } else if (style === 'transcript_review') {
          const transcriptText = contextFileContent
            ? `\n\nTRANSCRIPT / CONTENT:\n${contextFileContent.slice(0, 15000)}`
            : '';
          prompt = `
            STYLE: TRANSCRIPT REVIEW — SINGLE HOST OPINION VIDEO
            Language: ${language}. Audience: general viewers.
            ${durLineEn}

            You are writing a YouTube-style single-host video script where ONE person:
            1. Opens by briefly telling viewers what the source content is about (who, what show/platform, what topics were covered)
            2. Walks through the key ideas from the content in a natural, engaging way
            3. Closes with ONE paragraph of their own honest opinion — grounded in facts, not vague

            Topic / Source info: "${topic}"
            ${specificDetails ? `Extra context: ${specificDetails}` : ''}
            ${transcriptText}

            OPENING (2-4 sentences):
            Start with something like: "Hey guys, [Guest/Host] was on [Show] recently talking about [topic]. He's a [brief credential] — and he covered [point 1], [point 2], [point 3], [point 4]. Let me walk you through it and then give you my take."
            Make it feel like you just watched the video and are telling a friend about it. Natural, not formal.

            CONTENT WALKTHROUGH:
            Cover the key ideas from the transcript in a clear, engaging way.
            Each key point should be explained in plain language.
            Keep it flowing — no bullet lists, no headers, just natural speech.
            If an idea is interesting, react to it briefly ("And this is the part that really hit me..." / "Now this is where it gets wild...").

            CLOSING OPINION (1 paragraph):
            One honest, specific paragraph of your own take on the topic.
            Ground it in something real — a fact, a study, a pattern you've noticed, a personal angle.
            No vague opinions ("I think this is really important"). Make a specific point.
            End with a direct line to the viewer: a question, a challenge, or a clear takeaway.

            FORMAT RULES:
            ✗ NO speaker labels — no "Voiceover:", no "Host:", nothing
            ✗ NO bullet points, NO numbered lists, NO section headings in the output
            ✗ NO formatting marks — no **, no --, no bullet symbols
            ✓ Just clean flowing paragraphs — exactly as a real person would speak it
            ✓ Plain conversational language throughout
            ${durFillEn}
          `;
        } else if (style === 'summarizer_pov') {
          const transcriptText = contextFileContent
            ? `\n\nTRANSCRIPT / CLIP CONTENT:\n${contextFileContent.slice(0, 15000)}`
            : '';
          prompt = `
            STYLE: SUMMARIZER POV — TWO-PART REACTION SCRIPT
            Language: ${language}. Audience: general viewers.
            ${durLineEn}

            You are writing a SINGLE-VOICE script that has TWO clearly-separated parts:
              PART 1 — INTRO (fixed format, lists every big claim made in the clip)
              PART 2 — YOUR POV (your own analytical breakdown of each claim, one by one)

            Topic / Clip info: "${topic}"
            ${specificDetails ? `Extra context: ${specificDetails}` : ''}
            ${transcriptText}

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            PART 1 — INTRO (FIXED FORMAT — do NOT improvise the structure)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            Open with EXACTLY this template, filling in the blanks from the clip/transcript:

              "In this clip, [Person 1] and [Person 2] — [brief one-line description of who they are, e.g. 'a famous comedian and actor'] — make some big claims about [overall topic / theme].
              First, that [claim 1 — one short sentence].
              Second, that [claim 2 — one short sentence].
              Third, that [claim 3 — one short sentence].
              And fourth, that [claim 4 — one short sentence].
              Let's watch — and then I'll give my opinion."

            Rules for INTRO:
              ✓ Use the speakers'/guests' real names from the transcript (or topic line if missing)
              ✓ List 3 to 5 claims (use only as many as the clip actually makes — do not invent)
              ✓ Each claim is ONE short, plain sentence — no analysis yet, just neutral statement
              ✓ End the intro EXACTLY with: "Let's watch — and then I'll give my opinion."
              ✗ No analysis, no opinion, no facts/counter-facts in PART 1

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            PART 2 — YOUR POV (YOUR OWN ANALYSIS, claim by claim)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            Now go through the SAME claims listed in the intro, in the SAME order.
            For EACH claim:
              1. Briefly restate which claim you're addressing (1 short line).
              2. Give your verdict — pick the honest one:
                   • "actually solid / true" — if the claim genuinely holds up
                   • "partially true" — if there's a kernel of truth but exaggerated
                   • "misleading" — if technically not false but framed deceptively
                   • "exaggerated / blown out of proportion" — if real but overhyped
                   • "false / not supported by reality" — if just wrong
              3. Explain WHY in 3-6 sentences, grounded in real facts, mechanisms, or examples.
                 Use specific reasoning — what the technology/event actually is, what it actually does,
                 and where the speaker stretched it. No vague hand-waving.
              4. Optionally end the claim with a short punchy takeaway line.

            Tone for PART 2:
              ✓ Honest, calm, slightly opinionated — like a knowledgeable friend correcting hype
              ✓ Use phrases like: "So first thing —", "Now the biggest point —",
                "Here's the reality —", "This is actually solid", "But the truth is —"
              ✓ Don't be afraid to AGREE when a claim holds up (don't debunk for the sake of debunking)
              ✓ Reference real-world facts, dates, mechanisms (as of ${new Date().getFullYear()})

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            FORMAT RULES (STRICT):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✗ NO speaker labels — no "Voiceover:", no "Host:", no "Narrator:", nothing
            ✗ NO bullet points, NO numbered lists, NO section headings in the OUTPUT
            ✗ NO formatting marks — no **, no --, no bullet symbols
            ✗ Do NOT label "PART 1" / "PART 2" in the output — just write them as flowing speech
            ✓ Just clean flowing paragraphs — exactly as one person would speak it on camera
            ✓ Natural pause between intro and POV (a paragraph break is enough)
            ${durFillEn}
          `;
        } else if (style === 'explained_solo') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: EXPLAINED SOLO — SINGLE VOICE YOUTUBE EXPLAINER
            यह एक solo explainer है। एक ही आवाज़, कोई dialogue नहीं, कोई debate नहीं।
            Conversational YouTube tone — जैसे Dhruv Rathee या similar channel।
            किसी और style से बिल्कुल अलग — यहाँ सिर्फ एक इंसान camera पर बोल रहा है।
            ═══════════════════════════════════════
            विषय: "${topic}"
            ${specificDetails ? `विशेष context: ${specificDetails}` : ''}
            ${durLineHi}
            भाषा: Hinglish — natural, conversational YouTube voiceover style।

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STEP 1 — PLAN FIRST:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            इस topic के 4-7 key points identify करो जो एक proper YouTube video में cover होने चाहिए।
            Order: basics → depth → application → conclusion

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            CHARACTER — केवल 1 speaker (Voiceover):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ${speakers.length > 0 ? `Speaker का नाम: ${speakers[0]}` : `Speaker का नाम: "Voiceover"`}
            Tone: confident, clear, friendly — जैसे एक knowledgeable YouTuber बोलता है।

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STRUCTURE (इसी order में):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            【 OPENING — SEEDHA TOPIC SE (कोई warmup नहीं) 】
            पहली line में TOPIC का नाम लो — directly।
            जैसे:
            • "Robert Greene ki 48 Laws of Power — Law 1: Never Outshine The Master। आज हम इसी के बारे में बात करेंगे।"
            • "Trump का stock manipulation — क्या था ये, कैसे काम किया, कब-कब हुआ, और Americans के लिए क्यों ख़राब था।"
            • "Love और sex — आज हम इस topic पर बिना filter के बात करेंगे।"

            फिर 2-3 lines में बताओ इस video में क्या-क्या cover होगा — specific angles:
            "इस video में हम देखेंगे — [angle 1], [angle 2], [angle 3]..." — topic के हिसाब से।
            Generic list नहीं — इस specific topic के actual angles।

            【 BASICS — यह topic है क्या? 】
            2-4 lines में: यह topic zero से explain करो।
            Assume करो audience को कुछ भी नहीं पता।
            Simple language — jargon नहीं।

            【 MAIN POINTS — ek ek karke 】
            हर point के लिए:
            → Point ka naam clearly bolo
            → Explain karo yeh point kya hai
            → Real example ya analogy do
            → Practical implication bolo — isse kya farak padta hai?

            【 KEY TAKEAWAY 】
            2-3 lines mein: is topic ka sabse important message kya hai।
            Simple, memorable।

            【 OUTRO 】
            "I hope you find this video informative. Thanks for watching."
            Exactly yahi line use karo — word for word।

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            RULES:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✓ Sirf 1 speaker — "Voiceover" (ya provided name)
            ✓ Har point zero se explain karo — prior knowledge assume mat karo
            ✓ Har point ke saath specific real example
            ✓ Conversational Hinglish — jaise koi dost samjha raha ho
            ✓ YouTube script feel — scripted nahi, natural
            ✗ BANNED: Multiple speakers ya dialogue format
            ✗ BANNED: "Yeh zaroori hai", "Is prakar", "Ant mein", generic filler
            ✗ BANNED: Long boring intro — hook direct aur sharp ho
            ${durFillHi}
          `;
        } else if (style === 'narration') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: NARRATION — SIMPLE SINGLE-VOICE SCRIPT (कोई speaker tag नहीं)
            यह एक plain narration script है। कोई dialogue नहीं, कोई hook-structure नहीं, कोई forced format नहीं।
            बस topic को एक ही आवाज़ में, शुरू से आखिर तक, flowing paragraphs में सुनाओ — जैसे कोई audiobook या essay पढ़ा जा रहा हो।
            ═══════════════════════════════════════
            विषय: "${topic}"
            ${specificDetails ? `विशेष context: ${specificDetails}` : ''}
            ${durLineHi}
            भाषा: ${language}.

            CHARACTER — केवल 1 narrator:
            ${speakers.length > 0 ? `Speaker का नाम: ${speakers[0]}` : `Speaker का नाम: "Voiceover"`}

            RULES:
            ✓ पूरी script सिर्फ एक ही speaker बोलेगा — शुरू से अंत तक, ek continuous piece jaisa lage, tukdon mein todi hui speech jaisa nahi
            ✓ Natural, flowing narration — जैसे कोई किताब पढ़ी जा रही हो या कोई कहानी सुनाई जा रही हो
            ✓ Engaging aur simple rakho — jahan bhi koi idea samjhane mein madad kare, wahan ek concrete real-world example, analogy, ya vivid specific detail zaroor daalo. Rigid structure force kiye bina bhi listener ko interested banaye rakhna hai, dry/textbook jaisa bilkul nahi
            ✓ कोई forced structure नहीं (opening/hook/outro जबरदस्ती मत डालो) — topic जो माँगे वैसे लिखो
            ✓ Content ko clear CHAPTERS/sections mein organize karo (jaise ek achi book ya documentary hoti hai) — har chapter apne aap mein poora aur DETAILED ho, chhota ya sarsari mat rakho
            ✓ Har chapter = ek JSON segment. Chapters ki length topic ke hisaab se jitni chahiye utni rakho — koi fixed short limit nahi. Lambi script khud kai chapters mein bant jaayegi, aur agar koi chapter audio ke liye bahut lamba ho to Script Editor ka "Split Script" button use karke usse automatically safe parts mein cut kiya ja sakta hai — isliye yahan sirf FULL DETAIL aur achi chapter-structure pe focus karo
            ✗ कोई dialogue नहीं, कोई दूसरा speaker नहीं, कोई "Q:"/"A:" जैसे tags नहीं
            ✗ Text के अंदर कोई speaker-label मत लिखो (जैसे "Narrator:") — सिर्फ शुद्ध बोलने वाला text
            ${durFillHi}
          `;
        } else if (style === 'monkey_explain') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: MONKEY EXPLAIN — STORYTELLING-STYLE SOLO EXPLANATION
            Yeh ek STORY hai, lecture nahi. Ek hi narrator, ek chhoti fictional/relatable
            KAHAANI sunata hai (aksar ek बंदर ya bandaron ke group ke through, ya koi aur
            simple roz़marra ka scenario) jo naturally real topic ko explain kar deti hai —
            jaise "socho ek jangal mein bandaron ka ek troop hai jo..." — aur story ke
            events ke through hi concept unfold hota hai, seedha lecture dekar nahi.
            Engaging aur simple — kabhi bhi dry, technical, ya textbook jaisa mat lagne do.
            ═══════════════════════════════════════
            विषय: "${topic}"
            ${specificDetails ? `विशेष context: ${specificDetails}` : ''}
            ${durLineHi}
            भाषा: ${language}.

            CHARACTER — केवल 1 narrator (story-teller):
            ${speakers.length > 0 ? `Speaker का नाम: ${speakers[0]}` : `Speaker का नाम: "Voiceover"`}

            APPROACH:
            - Topic ke liye ek simple story/scenario socho jo us concept ko naturally represent kare — often ek monkey/troop of monkeys wali kahaani (jaise island pe bandaron ki economy, ya bandaron ka ek chhota society), ya koi aur roz़marra ka relatable scenario agar wo better fit ho.
            - Story ko step-by-step unfold karo: ek setup se शुरू करो, फिर कुछ hota hai (problem/change/twist), फिर uska natural नतीजा — aur wahi नतीजा real topic ka core insight ban jaata hai.
            - Jargon bilkul avoid karo. Agar koi technical term zaroori ho, use story ke andar hi ek simple cheez se replace/compare kar do.
            - Opening seedhe story se शुरू karo — koi "in this video hum explain karenge" jaisa dry intro mat do. Seedha "Socho..." / "Imagine..." / "Ek dafa ki baat hai..." jaise story-hook se शुरू karo.

            RULES:
            ✓ Sirf 1 speaker — poori script wahi bolega, ek continuous story jaisa, tukdon mein todi hui speech jaisa nahi
            ✓ Engaging, curiosity-driven — reader/listener ko "aage kya hoga" jaisa feel aana chahiye
            ✓ Simple, conversational, friendly tone — kabhi lecture ya textbook jaisa nahi
            ✓ Story khatam hote hote real topic ka core takeaway naturally clear ho jaana chahiye — alag se "moral of the story" jaisa bolne ki zaroorat nahi, khud hi samajh aa jaaye
            ✓ Content ko clear CHAPTERS/scenes mein organize karo (jaise kisi kahaani ke chapters) — har chapter apne aap mein poora aur DETAILED ho, chhota mat rakho
            ✓ Har chapter = ek JSON segment. Length topic ke hisaab se rakho, fixed short limit nahi — bahut lambe chapter ko baad mein "Split Script" button se audio-safe parts mein cut kiya ja sakta hai, isliye yahan FULL DETAIL aur achi storytelling pe focus karo
            ✗ Koi dialogue nahi, koi doosra speaker nahi
            ✗ Text ke andar speaker-label mat likho — sirf bolne wala text
            ✗ Dry, technical, ya bullet-point-jaisa explanation mat likho — sab kuch story ke through aana chahiye
            ${durFillHi}
          `;
        } else if (style === 'crime_documentary') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: CRIME DOCUMENTARY — SUSPENSEFUL SOLO TRUE-CRIME STORYTELLING
            Ek hi narrator, jaise Mr. Ballen / Dark Downunder / Crime Junkie style true-crime
            documentary — dheema, ominous, controlled tone mein ek case ki poori kahaani sunata hai.
            Koi dialogue nahi, koi doosra speaker nahi — sirf ek calm, measured awaaz jo suspense
            build karti hai.
            ═══════════════════════════════════════
            Topic/Case: "${topic}"
            ${specificDetails ? `Extra context/facts: ${specificDetails}` : ''}
            ${durLineHi}
            भाषा: ${language}.

            CHARACTER — केवल 1 narrator:
            ${speakers.length > 0 ? `Speaker का नाम: ${speakers[0]}` : `Speaker का नाम: "Voiceover"`}

            APPROACH:
            - Agar topic mein real facts/names/case-details diye gaye hain, unhe accurately use karo. Agar topic generic hai, ek realistic, grounded case socho jo believable lage (real jagah, tareekh, roz़marra ka insaan) — kabhi over-the-top ya cartoonish nahi.
            - Opening SEEDHA scene se karo, koi "aaj hum baat karenge" jaisa dry intro nahi — ek specific date, jagah, aur ek bilkul ordinary insaan ki roz़marra zindagi se शुरू karo. Jaise: "2025 ki baat hai. Ek aadmi tha jo ek chhoti si car repair shop mein kaam karta tha..." — pehle NORMALCY establish karo, taaki baad mein jab kuch galat ho to zyada impactful lage.

            STRUCTURE (isi order mein, lekin labels output mein mat likho):
            1. THE ORDINARY DAY — specific date/jagah/insaan, roz़marra zindagi ke sensory details (awaaz, mausam, kaam) — ek shaant, normal shuruaat.
            2. THE FIRST CRACK — kuch ajeeb ya suspicious hota hai — pehla warning sign, chhota sa lekin unsettling.
            3. THE UNRAVELING — events dheere dheere unfold hote hain. Clues EK EK KARKE reveal karo — sab kuch shuru mein hi mat bata do, tension gradually build karo.
            4. THE TWIST — ek shocking reveal ya turning point jo sab kuch badal deta hai.
            5. THE AFTERMATH — kya hua end mein, consequences, case kaise resolve hua (ya nahi hua).
            6. CLOSING LINE — ek haunting ya thought-provoking final line jo yaad rah jaaye.

            RULES:
            ✓ Sirf 1 narrator — pura case wahi bolega, ek continuous piece jaisa, tukdon mein todi hui speech jaisa nahi
            ✓ Tone: calm, ominous, measured, documentary-style — kabhi bhi rushed, cheerful, ya sensational nahi
            ✓ Suspenseful pacing — tense moments par chhoti, punchy sentences use karo taaki dread mehsoos ho
            ✓ Cinematic, sensory detail — jagah, mausam, expressions, sound describe karo taaki listener scene "dekh" sake
            ✓ Information STRATEGICALLY withhold karo — poori kahaani ek sath mat bata do, suspense ke liye reveal ko control karo
            ✓ Content ko clear CHAPTERS mein organize karo (jaise structure mein diya hai) — har chapter poora aur DETAILED ho
            ✓ Har chapter = ek JSON segment. Lambi script khud kai chapters mein bant jaayegi — "Split Script" button baad mein use ho sakta hai
            ✗ Koi dialogue nahi, koi doosra speaker nahi
            ✗ Text ke andar speaker-label mat likho — sirf bolne wala text
            ✗ Generic filler jaise "is prakar", "ant mein", "yeh zaroori hai" — BANNED
            ${durFillHi}
          `;
        } else if (style === 'viral_recap') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: VIRAL RECAP — HYPE, MEME-ENERGY SOLO TRUE-STORY NARRATION
            Ek hi narrator, jaise viral internet true-story/scam/heist recap channels — fast,
            breathless, chatty, jaise koi apne dost ko sabse crazy story excitedly sunata hai.
            Yeh "Crime Documentary" style ka bilkul OPPOSITE hai (wo somber/ominous hai) —
            yeh loud, fun, thoda unhinged, full of personality aur reaction wala tone hai.
            ═══════════════════════════════════════
            Topic/Story: "${topic}"
            ${specificDetails ? `Extra context/facts: ${specificDetails}` : ''}
            ${durLineHi}
            भाषा: ${language}.

            CHARACTER — केवल 1 narrator:
            ${speakers.length > 0 ? `Speaker का नाम: ${speakers[0]}` : `Speaker का नाम: "Voiceover"`}

            APPROACH:
            - Agar topic mein real facts/names/numbers diye gaye hain, unhe accurately use karo aur unki wildness pe lean karo. Agar topic generic hai, specific vivid believable details (naam, dollar amounts, dates) invent karo — vague mat raho.
            - Opening seedhe sabse shocking fact/number se karo, casually, jaise beech baatcheet mein ho — jaise "so this guy is rich, I mean like $230 million rich — because he stole it." Koi warmup nahi, koi "aaj hum baat karenge" nahi.
            - Isse SPOKEN, transcribed audio jaisa likho, polished prose nahi: run-on sentences "and" se connected, casual fillers ("I mean", "like", "so", "okay so"), sentence fragments punch ke liye, aur beech mein jaan-boojh kar audience-facing asides (jaise "okay real quick ek cheez batana bhool gaya, chalo rewind karte hain").
            - Sabse bade, jaw-dropping numbers/facts ko EMPHASIS ke liye REPEAT karo — ek baar bolo, phir dobara bolo jaise narrator khud believe nahi kar pa raha (jaise "$230 million... $230 million.").
            - Apni khud ki story pe react karo jaise sunate ho — rhetorical asides jaise "like damn, kitna drive kar raha hai ye?", "I can't even make this up", "bro really thought—". Narrator ko real, entertained insaan jaisa lagna chahiye, script jaisa nahi.
            - Jab spending spree/escalation/excess ki list ho, usse item-by-item actually list karo specific numbers ke saath (cars, rent, bottles, gifts) — numbers ki repetition hi entertainment hai, usse summarize karke mat udao.
            - Jahan fit ho, logon ki real reactions ko unke apne words mein "quote" karo (exclamations, texts) jaise actual audio replay ho raha ho — isse real, sourced story jaisa lagta hai, summary jaisa nahi.
            - Ek turn ki taraf build karo — wo moment jab sab unravel hone lagta hai — aur ending ko ek dry, matter-of-fact epilogue note ke saath khatam karo (kya confirmed hai vs alleged, aage kya hoga, current status) — moralizing wrap-up nahi.

            RULES:
            ✓ Sirf 1 narrator — poori story ek continuous, high-energy piece jaisa, tukdon mein todi hui speech jaisa nahi
            ✓ Tone: excited, casual, funny, thoda chaotic — jaise gossip sunaya ja raha ho, kabhi somber ya slow nahi
            ✓ Fast pacing — short punchy bursts aur lambe breathless run-ons mix karo, bilkul real spoken storytelling jaisa
            ✓ Har jagah specific numbers, names, details — vague generalities is style ko kill kar dete hain
            ✓ Content ko clear CHAPTERS/beats mein organize karo (setup → escalation → turn → aftermath) — har chapter poora aur DETAILED ho
            ✓ Har chapter = ek JSON segment. Lambi script khud kai chapters mein bant jaayegi — "Split Script" button baad mein use ho sakta hai
            ✗ Koi dialogue nahi, koi doosra speaker nahi
            ✗ Text ke andar speaker-label mat likho — sirf bolne wala text
            ✗ Kabhi bhi formal, documentary, ya news-anchor tone mein mat jao — wo alag style hai
            ✗ Generic filler jaise "is prakar", "ant mein", "yeh zaroori hai" — BANNED
            ${durFillHi}
          `;
        } else if (style === 'deep_explainer') {
          prompt = `
            ═══════════════════════════════════════════════════════
            STYLE: DEEP EXPLAINER — BEGINNER-FRIENDLY NEWS/TOPIC BREAKDOWN
            दो conversational speakers। एक explain करता है, दूसरा पूछता है। हर jargon term तुरंत define होता है।
            शुरुआत में ही strong HOOK। Structured segments। Zero assumed knowledge।
            Think: podcast-meets-YouTube-explainer — गहरा, सटीक, conversational।
            ═══════════════════════════════════════════════════════
            विषय: "${topic}"
            ${specificDetails ? `अतिरिक्त context / angle: ${specificDetails}` : ''}
            ${durLineHi}
            भाषा: Hinglish — natural, conversational, जैसे दो दोस्त podcast में बात कर रहे हों।

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STEP 1 — पहले PLAN करो (लिखने से पहले):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            इस topic के बारे में एक total beginner को क्या-क्या MUST जानना चाहिए — 5-7 key points:
              → Shocking hook / central fact
              → Core background (क्या हुआ / यह है क्या)
              → Key numbers / math (simple comparisons के साथ explain करो)
              → Real-world stakes (किसे नुकसान, किसे फायदा, क्यों matter करता है)
              → Counterargument / दूसरा side (fair hearing दो)
              → Hidden detail जो headlines miss करती हैं
              → Simple takeaway

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            CHARACTERS — ठीक 2 speakers (कोई Narrator नहीं):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ${speakers.length >= 2
              ? `Speaker A (Explainer): ${speakers[0]} — well-informed, clearly explain करता है, real analogies use करता है
Speaker B (Curious): ${speakers[1]} — audience जो सोच रही है वही पूछता है, pushback देता है, genuinely react करता है`
              : `Speaker A (Explainer): suitable नाम choose करो — well-informed, clearly explain करता है, real analogies use करता है
Speaker B (Curious): अलग नाम choose करो — audience जो सोच रही है वही पूछता है, pushback देता है, genuinely react करता है`
            }

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STRUCTURE (exact इसी flow में):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            【 HOOK — पहले 20 seconds (2-4 short exchanges) 】
            SHOCKING number, fact, या question से खोलो — कोई warmup नहीं।
            अच्छे examples:
            • "Quick question। एक ही दिन में ₹5 लाख करोड़ कैसे डूब जाते हैं?"
            • "Yaar, क्या हो अगर मैं कहूँ कि सबसे safe लगने वाला investment अब सबसे risky हो गया है?"
            Speaker B disbelief में react करे। Speaker A full story की झलक दे।
            End: इस video का central question।
            RULE: Number/fact FIRST — "आज हम X के बारे में बात करेंगे" से मत शुरू करो।

            【 SEGMENT 1 — क्या हुआ / यह है क्या (basics from zero) 】
            Background बिल्कुल zero से explain करो — assume करो viewer को कुछ नहीं पता।
            हर technical term तुरंत define होना चाहिए जब पहली बार आए:
              ✓ "'IPO' — Initial Public Offering — यानी जब कोई private company पहली बार public को shares बेचती है।"
              ✓ "'Valuation' का मतलब है: अगर तुम company के सारे shares खरीद लो, तो कितना पैसा लगेगा।"
            Speaker B audience के obvious questions पूछे।
            Tight रखो — foundation only।

            【 SEGMENT 2 — Key Numbers / Math Simple में 】
            Real analysis। Most important numbers walk-through करो।
            हर number को concrete बनाने के लिए comparison दो:
              ✓ "Normal company 3 times sales पर trade करती है। यह 95 times पर है।"
              ✓ "सोचो swimming pool में पानी बहुत कम है। एक कंकड़ फेंको — tsunami जैसा लगेगा।"
            Speaker B pushback करे: "Yaar यह normal है?" / "यह तो insane लग रहा है।"
            कम से कम 2 vivid analogies।

            【 SEGMENT 3 — Credit Where Due / दूसरा Side (fair रहो) 】
            उस चीज़ के लिए strongest honest argument।
            Speaker B: "तो फिर लोग worried क्यों हैं?" — transition to actual risk।
            यह segment MUST हो — कभी one-sided मत रहो।

            【 SEGMENT 4 — Hidden Detail (जो headlines miss करती हैं) 】
            एक specific insight जो casual coverage skip करती है।
            Speaker B react करे: "Ruko — तो इसका मतलब..."

            【 SEGMENT 5 — Optimist's Case (steelman करो) 】
            Speaker A bull/positive case fairly present करे।
            Speaker B: "पर best-case में भी यह believe करना पड़ेगा कि..."

            【 CLOSING — Simple Takeaway 】
            Speaker B: "Plain और simple — [central question restate करो]?"
            Speaker A: direct 2-3 sentence answer। कोई hedging नहीं।
            MEMORABLE CLOSING LINE — sharp, witty, thought-provoking।
            Examples:
            • "मज़ेदार बात यह है कि इस company में जो safely land करता है हर बार... वो rockets हैं, stock नहीं।"
            • "Math झूठ नहीं बोलता। Marketing बोलती है।"

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            NON-NEGOTIABLE RULES:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✓ हर technical term को तुरंत define करो जब पहली बार आए — कोई exception नहीं
            ✓ Short turns: 2-4 sentences per exchange — कोई long monologue नहीं
            ✓ Speaker B हर segment में कम से कम एक बार genuinely pushback या react करे
            ✓ हर analogy visual और concrete हो — "it's complex" या "it's nuanced" नहीं
            ✓ Numbers को context दो — stat drop करते वक्त comparison ज़रूरी है
            ✓ दोनों sides को fair hearing मिले — clarity, not cheerleading या fear-mongering
            ✗ BANNED: "Yeh zaroori hai", "Ant mein", "Chaliye shuru karte hain", generic filler
            ✗ BANNED: Hook से पहले long intro
            ✗ BANNED: Jargon बिना explanation के
            ✗ BANNED: कोई भी side cartoonishly wrong

            ${durFillHi}
          `;
        } else if (style === 'situational') {
          if (!includeNarrator) {
            prompt = `
              ═══════════════════════════════════════
              STYLE: SITUATIONAL — REAL PERSON + 2 EXPERTS
              यह debate नहीं है, explanation नहीं है, podcast नहीं है।
              एक असली इंसान अपनी real-life situation बताता है — फिर 2 experts उसे actually help करते हैं।
              Tone: emotional, raw, genuine — जैसे Reddit thread या real confession।
              ═══════════════════════════════════════
              विषय: "${topic}" पर एक "Situational" style की video script बनाओ।
              ${specificDetails ? `परिस्थिति का विवरण: ${specificDetails}` : ''}
              ${durLineHi}
              भाषा: हिंदी + Hinglish (real लोग जैसे बात करते हैं — natural, short, human)।
              Target Audience: USA में रहने वाले mature adults।

              पात्र — ठीक 3 वक्ता:
              ${speakers.length >= 3
                ? `इन नामों का उपयोग करें: ${speakers[0]} (situation में फंसा इंसान), ${speakers[1]} (Expert 1), ${speakers[2]} (Expert 2).`
                : `Topic के हिसाब से नाम और experts चुनो — Speaker 1 वो इंसान जो situation में फंसा है, Speaker 2 और 3 उस topic के दो अलग-अलग relevant domain experts।`
              }

              ══════════════════════════════════════════
              【 SPEAKER 1 — INTRO + STORY (situation में फंसा इंसान) 】
              ══════════════════════════════════════════

              Speaker 1 की opening EXACTLY इस structure में होगी:

              पहली line — नाम और identity (DIRECT, कोई buildup नहीं):
              "मेरा नाम [नाम] है। मैं [identity] हूँ।"
              अगली line में STRAIGHT problem पर आ जाओ — triggering moment क्या था, कोई intro नहीं।
              (topic के हिसाब से believable time reference: "पिछले महीने...", "तीन हफ्ते पहले...", "उस दिन जब..." — जो सबसे fit करे)

              फिर story naturally build हो:
              → क्या हुआ — specific details के साथ, summary नहीं
              → कैसे complicated होता गया — step by step
              → आज कहाँ हूँ — emotionally और practically
              → अपने सवालों से end करे — वो specific questions जो सोने नहीं देते

              ══════════════════════════════════════════
              【 SPEAKER 2 — EXPERT 1 (पहला angle) 】
              ══════════════════════════════════════════
              ★ पहले story को genuinely feel करो — "यार, यह सुनकर समझ आता है कितना tough होगा" — फिर शुरू करो
              ★ हर point simple और clear रखो — जैसे किसी दोस्त को समझा रहे हो, lecture नहीं
              ★ कोई भी term जो आम आदमी न जाने — उसी line में simple भाषा में explain करो
              ★ हर advice के साथ एक real example — कोई नाम, situation, result — abstract नहीं
              ★ Pros और cons दोनों बताओ — false hope मत दो, real picture दो

              ══════════════════════════════════════════
              【 SPEAKER 3 — EXPERT 2 (दूसरा angle) 】
              ══════════════════════════════════════════
              ★ Speaker 2 की बात repeat मत करो — बिल्कुल नया angle लाओ
              ★ वो चीज़ बताओ जो लोग usually miss करते हैं — hidden costs, emotional toll, long-term consequences
              ★ एक ऐसी analogy दो जो instantly समझ आए — रोज़ की ज़िंदगी से
              ★ कोई भी term — immediately explain करो, bare term कभी मत छोड़ो
              ★ Politely disagree करो जहाँ ज़रूरी हो — real conversation होनी चाहिए

              ══════════════════════════════════════════
              FLOW:
              ══════════════════════════════════════════
              ACT 1 — Speaker 1 की story: Hook → journey → ONE burning question
              ACT 2 — Experts react genuinely → clarify → advice शुरू करें
              ACT 3 — Back-and-forth: Experts एक-दूसरे को challenge करें, Speaker 1 बीच में सवाल पूछे
              ENDING — दोनों experts मिलकर Speaker को SPECIFIC numbered actionable steps दें — vague नहीं, actual step-by-step। यहीं script खत्म होती है।

              ══════════════════════════════════════════
              HARD RULES:
              ══════════════════════════════════════════
              ✗ Jargon बिना explanation — NEVER
              ✗ "consult a professional" — professionals पहले से बैठे हैं, actual advice दो
              ✗ "ध्यान देने योग्य है", "निष्कर्ष में", "सुनिश्चित करें" — banned
              ✗ Surface-level generic advice — deeper जाओ
              ✗ Lecture mode — conversation होनी चाहिए
              ✓ हर major point = एक real, named example
              ✓ Emotional truth — audience को लगे "यार यह तो मेरी ही story है"
              ══════════════════════════════════════════
              ${durFillHi}
            `;
          } else {
            prompt = `
              विषय/Situation: "${topic}" पर एक Situational Dilemma style की video script बनाओ।
              ${specificDetails ? `परिस्थिति का विवरण: ${specificDetails}` : ''}
              ${durLineHi}
              भाषा: हिंदी + Hinglish (natural, conversational)।

              पात्र — ठीक 3 (fixed):
              - Narrator: situation/concept को शुरू में explain करेगा — बस opening में
              - 2 Speakers:
              ${speakers.length >= 2
                ? `इन नामों का उपयोग करें: ${speakers[0]} और ${speakers[1]}.`
                : `Topic के हिसाब से 2 अलग-अलग perspective वाले लोग चुनो — जो genuinely अलग सोचते हों।`
              }

              ══════════════════════════════════════════
              【 NARRATOR 】
              ══════════════════════════════════════════
              Narrator शुरुआत में situation/dilemma को 2-3 lines में simple तरीके से explain करे — opening एक clear question पर खत्म हो।
              जैसे: "एक आदमी है जिसने loan लिया... bank ने उसके पैसे काट लिए... अब उसके पास दो रास्ते हैं।"
              या concept के लिए: "Trolley Problem — एक ट्राली है जो 5 लोगों की तरफ बढ़ रही है..."
              Narrator बीच में भी आ सकता है — नया angle लाने के लिए, debate को नई direction देने के लिए, या दूसरा question पूछने के लिए।

              ══════════════════════════════════════════
              【 SPEAKERS — DILEMMA DEBATE 】
              ══════════════════════════════════════════
              दोनों speakers genuinely अलग choice/perspective रखते हैं।
              Real back-and-forth — एक बोले, दूसरा challenge करे।
              दोनों sides genuinely strong — कोई side obviously weak नहीं।
              Closing: दोनों अपनी final position रखें — audience को decide करने दो।

              RULES:
              - Natural, human भाषा — AI clichés बिल्कुल नहीं
              - दोनों sides genuinely strong — कोई side obvious winner नहीं
              ══════════════════════════════════════════
              ${durFillHi}
            `;
          }
        } else if (style === 'documentary') {
            prompt = `
              विषय/Case: "${topic}" पर एक Documentary / True Crime style वीडियो script बनाओ।
              ${specificDetails ? `Case की details और context: ${specificDetails}` : ''}
              ${durLineHi}
              भाषा: हिंदी + Hinglish (serious, gripping, cinematic tone)।

              पात्र — ठीक 2 वक्ता:
              ${speakers.length >= 2
                ? `इन नामों का उपयोग करें: ${speakers[0]} और ${speakers[1]}.`
                : `दो ऐसे नाम चुनो जो documentary anchor / investigative journalist जैसे लगें — topic और case के हिसाब से।`
              }

              ══════════════════════════════════════════
              【 OPENING — Hook Intro (short, gripping) 】
              ══════════════════════════════════════════
              पहले 2-3 lines में case को tease करो — पूरा मत बताओ, बस इतना कि audience रुक जाए:
              जैसे: "आज हम बात करेंगे [YEAR] के एक ऐसे case के बारे में जो..."
              या: "[जगह], [DATE/TIME]... [एक chilling detail]"
              Tone: serious, cinematic — news anchor का नहीं, documentary filmmaker का।

              ══════════════════════════════════════════
              【 STORY — Suspenseful Documentary Unfold 】
              ══════════════════════════════════════════
              → Scene setting: जगह, समय, माहौल — जैसे camera वहाँ मौजूद हो
              → घटना step by step reveal हो — एक साथ dump नहीं
              → हर reveal के साथ tension build हो — cliffhangers जहाँ audience सोचे "फिर क्या हुआ?"
              → दोनों speakers एक-दूसरे को pass करते हुए आगे बढ़ें — जैसे Anchor + Investigative Journalist
              → Facts और details को cinematic तरीके से present करो — dry reading नहीं

              ══════════════════════════════════════════
              RULES:
              ══════════════════════════════════════════
              ✗ "यह घटना बड़ी चौंकाने वाली थी", "आइए जानते हैं", "तो दोस्तों" — बिल्कुल banned
              ✗ Generic filler — हर line में substance हो
              ✓ Suspense पहले, facts बाद में — audience को खींचो
              ✓ Cinematic, immersive — जैसे Netflix documentary चल रही हो
              ══════════════════════════════════════════
              ${durFillHi}
            `;
        } else if (style === 'podcast_panel') {
            if (commentsFileContent) {
              prompt = `
              ⚠️ अनिवार्य नियम — इसे पहले पढ़ें:
              नैरेटर (Narrator) प्रत्येक दावे से पहले अनिवार्य रूप से बोलेगा। एक भी दावा ऐसा नहीं होना चाहिए जिसके पहले नैरेटर न हो। यदि नैरेटर किसी भी दावे से पहले गायब है, तो स्क्रिप्ट गलत मानी जाएगी।

              आपका काम: नीचे दिए गए video/source material और दर्शकों के comments को पढ़कर एक बातचीत-शैली की पॉडकास्ट स्क्रिप्ट लिखें।
              ${specificDetails ? `विशेष निर्देश: ${specificDetails}` : ''}
              ${durLineHi}
              भाषा: हिंदी (स्वाभाविक हिंग्लिश ठीक है)।

              ═══════════════════════════════════════
              चरण १ — video के सभी claims/points निकालो
              ═══════════════════════════════════════
              video/source material को पूरा ध्यान से पढ़ें।
              उसमें जितने भी दावे (claims), विचार, तथ्य या बातें कही गई हैं — उन्हें एक-एक करके अलग से नोट करें।
              कोई भी बात छूटनी नहीं चाहिए।

              ═══════════════════════════════════════
              चरण २ — बेहतरीन कमेंट्स चुनें
              ═══════════════════════════════════════
              केवल वो कमेंट्स चुनें जो वाकई तीखे, सोचने वाले, या मज़ेदार हों।
              स्पैम और बेकार कमेंट्स नज़रअंदाज़ करें।

              ═══════════════════════════════════════
              चरण ३ — स्क्रिप्ट लिखें
              ═══════════════════════════════════════

              पात्र — ठीक तीन लोग:
              ${speakers.length > 0 ? `इन नामों का उपयोग करें: ${speakers.join(", ")} (दो गेस्ट के लिए)। नैरेटर का नाम "नैरेटर" ही रहेगा।` : `दो ऐसे creative नाम चुनें जो विषय से मेल खाते हों और real लोगों जैसे लगें — जैसे कोई वैज्ञानिक, दार्शनिक, पत्रकार, इतिहासकार। ट्रांसक्रिप्ट के नाम कभी नहीं। "Speaker A/B", "Alex", "Sam" जैसे generic नाम बिल्कुल नहीं।`}

              ───────────────────────────────────────
              तीनों पात्रों की भूमिका:
              ───────────────────────────────────────

              【 नैरेटर 】
              नैरेटर का काम: video/podcast में जो बताया गया है, उसे अपने words में साफ़ और सही तरीके से explain करो — जैसे कोई दोस्त को समझा रहा हो। फिर वक्ता A से question।
              ⚠️ नैरेटर खुद कोई बाहरी knowledge, analysis, या opinion नहीं जोड़ता — सिर्फ video का point अपने शब्दों में ठीक से बताता है।
              2-3 natural sentences में: video/podcast क्या कह रहा है — properly और clearly — फिर question।
              Example: "Podcast में बताया गया कि जब [person] को arrest किया गया, उसके कुछ ही दिनों बाद उनकी company के नाम पर 8000 gallon sulfuric acid का order आया। यह acid बहुत ज़्यादा quantity थी और timing भी अजीब थी। [वक्ता A], इस पर तुम्हारा क्या कहना है?"

              【 वक्ता A 】
              ⚠️ नैरेटर ने जो claim बताया उसे DOBARA MAT BOLO। वह बात हो चुकी।
              अब अपनी ORIGINAL knowledge लाओ: इस topic पर तुम्हें क्या पता है? Core concept क्या है? Real-world में यह कैसे काम करता है? कोई related fact, data, या example जो video में नहीं था?

              【 वक्ता B 】
              ⚠️ वक्ता A ने जो कहा उसे DOBARA MAT BOLO।
              अब facts + logic दोनों से आगे बढ़ाओ। Agree हो तो नया data लाओ। Disagree हो तो logical argument दो — sirf "document mein aisa nahi tha" type challenge nahi, real reasoning चाहिए।

              ───────────────────────────────────────
              हर point का flow (सख्ती से follow करो):
              ───────────────────────────────────────

              १. नैरेटर — 3-4 sentences: point clearly explain + context + question
              २. वक्ता A — अपनी ORIGINAL knowledge/analysis (नैरेटर की बात repeat नहीं, उस पर ADD करो)
              ३. वक्ता B — नया angle, fact, या logic (A की बात repeat नहीं)
              ४. 1-2 exchanges और
              ५. नैरेटर — अगला point (फिर same proper setup)

              सभी बातें cover करें। अंत में नैरेटर के मुख्य निष्कर्ष (३-४ बातें)।

              JSON output pattern:
              [
                {"speaker": "नैरेटर", "text": "पहली बात — इस video में कहा गया कि [सरल summary]। [वक्ता A का नाम], इस पर तुम्हारी क्या राय है?"},
                {"speaker": "[वक्ता A का नाम]", "text": "..."},
                {"speaker": "[वक्ता B का नाम]", "text": "..."},
                {"speaker": "[वक्ता A का नाम]", "text": "..."},
                {"speaker": "नैरेटर", "text": "अगली बात — [सरल summary]। [वक्ता A], तुम्हारा नज़रिया?"},
                {"speaker": "[वक्ता A का नाम]", "text": "..."},
                {"speaker": "[वक्ता B का नाम]", "text": "..."}
              ]
              ⚠️ नैरेटर का पहला line देखो — कोई welcome नहीं, कोई show name नहीं, सीधे "पहली बात" से शुरू।
              हर बात से पहले नैरेटर ज़रूर आएगा।
            `;
            } else {
              prompt = `
              नैरेटर (Narrator) हर बात से पहले बोलेगा — यह flow हमेशा बना रहेगा।

              आपका काम: नीचे दिए गए video/source material को पढ़कर एक बातचीत-शैली की पॉडकास्ट स्क्रिप्ट लिखें।
              ${specificDetails ? `विशेष निर्देश: ${specificDetails}` : ''}
              ${durLineHi}
              भाषा: हिंदी (स्वाभाविक हिंग्लिश ठीक है)।

              ═══════════════════════════════════════
              चरण १ — video के सभी claims/points निकालो
              ═══════════════════════════════════════
              video/source material को पूरा ध्यान से पढ़ें।
              उसमें जितने भी दावे (claims), विचार, तथ्य या बातें कही गई हैं — उन्हें एक-एक करके अलग से नोट करें।
              कोई भी बात छूटनी नहीं चाहिए।

              ═══════════════════════════════════════
              चरण २ — स्क्रिप्ट लिखें
              ═══════════════════════════════════════

              पात्र — ठीक तीन लोग:
              ${speakers.length > 0 ? `इन नामों का उपयोग करें: ${speakers.join(", ")} (दो गेस्ट के लिए)। नैरेटर का नाम "नैरेटर" ही रहेगा।` : `दो ऐसे creative नाम चुनें जो विषय से मेल खाते हों और real लोगों जैसे लगें — जैसे कोई वैज्ञानिक, दार्शनिक, पत्रकार, इतिहासकार। ट्रांसक्रिप्ट के नाम कभी नहीं। "Speaker A/B", "Alex", "Sam" जैसे generic नाम बिल्कुल नहीं।`}

              ───────────────────────────────────────
              तीनों पात्रों की भूमिका:
              ───────────────────────────────────────

              【 नैरेटर 】
              नैरेटर का काम: video/podcast में जो बताया गया है उसे अपने words में साफ़ और सही तरीके से explain करो — जैसे कोई दोस्त को समझा रहा हो। फिर question।
              ⚠️ कोई बाहरी knowledge, analysis, या opinion नहीं — सिर्फ video का point अपने शब्दों में properly बताना है।
              2-3 natural sentences में: video/podcast क्या कह रहा है — clearly — फिर वक्ता A से question।

              【 वक्ता A 】
              ⚠️ नैरेटर ने जो claim बताया उसे DOBARA MAT BOLO।
              अपनी ORIGINAL knowledge लाओ — इस topic पर real facts, data, core concept, या कोई ऐसी बात जो video में नहीं थी।

              【 वक्ता B 】
              ⚠️ वक्ता A ने जो कहा उसे DOBARA MAT BOLO।
              Facts + logic दोनों से आगे बढ़ाओ। Agree हो तो नया data। Disagree हो तो real reasoning।

              ───────────────────────────────────────
              हर point का flow:
              ───────────────────────────────────────

              १. नैरेटर — 3-4 sentences: point properly explain + context + question
              २. वक्ता A — ORIGINAL knowledge (नैरेटर की बात पर ADD करो, repeat नहीं)
              ३. वक्ता B — नया angle, fact, या logic (repeat नहीं)
              ४. 1-2 exchanges
              ५. नैरेटर — अगला point (same proper setup)

              सभी बातें cover करें। अंत में नैरेटर के मुख्य निष्कर्ष (३-४ बातें)।

              JSON output pattern:
              [
                {"speaker": "नैरेटर", "text": "पहली बात — इस video में कहा गया कि [सरल summary]। [वक्ता A का नाम], इस पर तुम्हारी क्या राय है?"},
                {"speaker": "[वक्ता A का नाम]", "text": "..."},
                {"speaker": "[वक्ता B का नाम]", "text": "..."},
                {"speaker": "[वक्ता A का नाम]", "text": "..."},
                {"speaker": "नैरेटर", "text": "अगली बात — [सरल summary]। [वक्ता A], तुम्हारा नज़रिया?"},
                {"speaker": "[वक्ता A का नाम]", "text": "..."},
                {"speaker": "[वक्ता B का नाम]", "text": "..."}
              ]
              हर बात से पहले नैरेटर ज़रूर आएगा।
            `;
            }
        } else if (style === 'context_bridge') {
            const cbSpeakerHi = speakers.length > 0 ? speakers[0] : null;
            prompt = `
              विषय: "${topic}"
              ${specificDetails ? `अतिरिक्त संदर्भ: ${specificDetails}` : ''}

              तुम एक experienced, well-read analyst हो — जैसे कोई journalist-researcher जो इस topic को deeply जानता हो। तुम interesting तरीके से बात करते हो, professional लगते हो, लेकिन boring नहीं — हर point में कुछ नया सीखने को मिलता है।

              तुम्हारा PRIMARY काम: transcript में हर उस जगह रुको जहाँ कोई बात अधूरी रह गई हो, कुछ explain नहीं हुआ, कोई नाम भूल गया, या कोई interesting reference आया जिसे और खोला जा सके। उसे इस तरह बताओ कि सुनने वाला सोचे — "अरे, यह तो पता नहीं था, और यह interesting भी है।"

              Transcript पढ़ो और इन चार situations में बोलो:

              १. **Gap Fill / Bhuli hui cheez** (सबसे IMPORTANT) — speaker ने कुछ अधूरा छोड़ा, कोई नाम भूल गया, या कहा "वो... क्या था... हाँ वो चीज़" — तुम तुरंत वो gap भरो, सही नाम/term बताओ, और उस चीज़ के बारे में एक interesting fact भी दो जो शायद सुनने वाले को पता न हो।
                 Example: अगर guest कहे "वो drug जो Breaking Bad में दिखाई थी, नाम भूल रहा हूँ" — तुम बोलो: "वो Methamphetamine है — जिसे street में 'Meth' कहते हैं। Breaking Bad में Walter White यही बनाता था, लेकिन real life में यह brain का dopamine system इतना overload करती है कि एक ही use के बाद addiction शुरू हो सकती है। US में 2022 में Meth से 32,000 से ज़्यादा deaths हुईं — Opioids के बाद सबसे ज़्यादा।"

              २. **Context / Concept** — कोई term, शख्स, event, या reference बिना explanation के आया। उसे simple लेकिन intelligent तरीके से समझाओ — सिर्फ definition नहीं, उसकी real-world importance और impact भी बताओ। Google Search से verified facts लाओ।
                 Example: "यहाँ 'Quantitative Easing' की बात हो रही है — यह वो tool है जो central banks use करते हैं जब normal monetary policy काम नहीं करती। 2008 की crisis के बाद Fed ने $4 trillion से ज़्यादा इसी तरह pump किए — जिसने stock markets को तो बचाया, लेकिन inequality भी बढ़ाई।"

              ३. **Fact / Correction** — कुछ गलत, exaggerated, या context के बिना बताया गया। Google Search से verified data लाओ, correct करो — और बताओ इससे actually क्या फर्क पड़ता है।
                 Example: "यहाँ जो 4000 का आँकड़ा बताया — WHO 2023 report के अनुसार actual figure 1,247 है। यह gap important है क्योंकि इससे directly policy decisions affect होती हैं।"

              ४. **Analyst's take** — इस point पर transcript ने कुछ miss किया जो तुम्हारे पास Google Search-backed data के साथ है।
                 Example: "यह claim convincing लगती है, लेकिन अगर यह सच होता तो verifiable records ज़रूर होते — अब तक कोई credible independent source इसे confirm नहीं करता।"

              Tone rules:
              - Professional और knowledgeable — जैसे well-read journalist या researcher
              - हर point में एक "hook" हो — dry facts नहीं, कुछ ऐसा जो याद रहे
              - Gap fill करते समय confidently बोलो — "वो X है" — hesitation नहीं
              - Google Search use करो — real numbers, real events, real sources
              - 2-4 sentences max, focused
              - हर segment किसी SPECIFIC transcript moment से जुड़ा हो

              पात्र: सिर्फ 1 speaker।
              ${cbSpeakerHi ? `Speaker का नाम: "${cbSpeakerHi}"` : 'Topic के हिसाब से एक fitting name खुद चुनो।'}

              "sourceTimestamp" — उस moment की transcript में position, "M:SS" format में (जैसे "1:01")

              Language: Hindi

              JSON output:
              [
                {"speaker": "[Name]", "text": "...", "sourceTimestamp": "1:01"},
                {"speaker": "[Name]", "text": "...", "sourceTimestamp": "2:10"}
              ]
            `;
        } else if (style === 'podcast_breakdown' || youtubeUrl) {
            prompt = `
              तुम्हें "${topic}" पर एक podcast breakdown script बनानी है।
              ${specificDetails ? `अतिरिक्त संदर्भ: ${specificDetails}` : ''}
              ${durLineHi}
              भाषा: हिंदी।

              पात्र:
              - नैरेटर (Narrator) — सिर्फ points introduce करने और end में conclusion देने के लिए
              - वक्ता A और वक्ता B — दोनों knowledgeable analysts जो transcript के points पर अपनी real analysis देते हैं
              ${speakers.length > 0 ? `नाम: ${speakers.join(", ")}` : `Topic के हिसाब से fitting नाम खुद चुनो।`}

              STEP 1 — पहले transcript को analyze करो:
              Transcript / context material पढ़ो और सभी KEY POINTS निकालो जो podcast में discuss हुए — claims, facts, revelations, arguments। इन्हीं points पर script बनेगी।

              STEP 2 — Script structure (हर point के लिए यह pattern follow करो):

              **नैरेटर** → video/podcast में जो कहा गया उसे अपने words में साफ़ और properly बताओ — जैसे कोई दोस्त को simply explain कर रहा हो। फिर question।
              कोई welcome नहीं, कोई intro नहीं। कोई बाहरी analysis या opinion नहीं — बस video का वही point, अपने शब्दों में clearly।
              2-3 natural sentences में explain करो, फिर वक्ता A से sharp question।
              Example: "Podcast में बताया गया कि जब [person] को arrest किया गया, उसके कुछ ही दिनों बाद उनकी company के नाम पर 8000 gallon sulfuric acid का order आया। यह acid बहुत ज़्यादा quantity थी और timing भी suspicious थी। [वक्ता A], इस पर तुम्हारा क्या कहना है?"

              **वक्ता A** → इस claim पर अपनी ANALYSIS देता है — core concept explain करता है, relevant facts और data लाता है, और अपना informed perspective देता है। Transcript को repeat नहीं करता।

              **वक्ता B** → या तो support करता है नए angle से, या challenge करता है। Disagreement के लिए — FACTS + LOGIC दोनों use करता है।

              ⚠️ CRITICAL RULE — Logic + Facts दोनों ज़रूरी हैं:
              अगर किसी claim को challenge करना है तो सिर्फ "document में ऐसा लिखा था" से काम नहीं चलेगा।
              सोचो एक इंसान की तरह: कोई भी illegal काम documents में clearly नहीं लिखता। अगर कोई acid मंगाता है body dissolve करने के लिए, तो document में "for cleaning" ही लिखेगा। Document का official reason = proof नहीं है कि इरादा वही था।
              Challenge करना हो तो: circumstantial evidence, logical inconsistency, pattern of behavior, या timeline mismatch — इन पर argue करो। सिर्फ "official record कहता है X" पर नहीं।

              Pattern continue करो सभी major points के लिए।

              **End में नैरेटर** → 2-3 lines का sharp conclusion — overall takeaway क्या है इस podcast से।

              Tone rules:
              - बोलचाल की भाषा — जैसे real लोग बात करते हों
              - वक्ता A और B की अपनी personality हो — एक ज़्यादा skeptical, दूसरा ज़्यादा analytical
              - Source material की बात को word-for-word repeat मत करो — value add करो
              - पूरी script हिंदी में

              ⚠️ STRICT WORD BAN: Script में कहीं भी "transcript" शब्द नहीं आना चाहिए।
              इसकी जगह use करो: "video clip में", "इस video में", "podcast में", "उन्होंने कहा", "show में बताया गया"

              JSON output pattern (इसी format में):
              [
                {"speaker": "नैरेटर", "text": "पहली बात — इस video में कहा गया कि [claim]। [वक्ता A का नाम], इस पर तुम्हारी क्या राय है?"},
                {"speaker": "[वक्ता A का नाम]", "text": "[अपनी analysis, transcript repeat नहीं]"},
                {"speaker": "[वक्ता B का नाम]", "text": "[support या challenge — facts + logic दोनों के साथ]"},
                {"speaker": "नैरेटर", "text": "अगली बात — [claim]। [वक्ता A], तुम्हारा नज़रिया?"},
                {"speaker": "[वक्ता A का नाम]", "text": "..."},
                {"speaker": "[वक्ता B का नाम]", "text": "..."}
              ]
              ⚠️ नैरेटर का पहला line — कोई welcome नहीं, सीधे "पहली बात" से शुरू।
            `;
        } else if (style === 'debate') {
            if (includeNarrator) {
              prompt = `
                विषय: "${topic}" पर एक Debate style वीडियो स्क्रिप्ट लिखो।
                ${specificDetails ? `अतिरिक्त संदर्भ: ${specificDetails}` : ''}
                ${durLineHi}
                भाषा: हिंदी / Hinglish (जैसा topic हो वैसा)।

                पात्र:
                - Narrator: एक (हमेशा "Narrator" label से)
                - ${speakerCount} वक्ता (दो opposing sides): ${speakers.length > 0 ? speakers.join(", ") : `Topic के हिसाब से fresh नाम choose करो — हर बार अलग, topic-relevant। अगर topic किसी specific public figure पर है तो उनका नाम use करो, concept debate है तो उस side को represent करने वाला believable नाम बनाओ। Generic या repeated नाम मत use करो।`}

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                OPENING — NARRATOR (3 lines max):
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                Yeh 3 cheezein clearly cover karo — apni wording mein:
                1. Topic ka naam directly batao.
                2. Dono debaters ke naam + unki exact position/side — "X, jo [position] support karta hai, aur Y, jo [position] ka paksha leta hai."
                3. Ek sharp, direct debate question jisse debate shuru ho.
                Bas. Koi extra build-up nahi.

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                DEBATE BODY:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                दोनों speakers expert की तरह argue करें — लेकिन simple, clear भाषा में।

                हर argument इस तरह build होगा:
                → पहले अपनी position का core reason basics से explain करो — assume मत करो audience सब जानती है
                → फिर एक logical reasoning दो — facts, real examples, या analogies से support करो
                → दूसरी side के argument को directly counter करो — logical basis पर, emotional नहीं
                → Arguments deep और well-reasoned हों — surface-level assertions नहीं

                Narrator की flexibility:
                → Narrator सिर्फ opening और closing तक सीमित नहीं है
                → जब कोई important context, fact, या clarification debate को और strong बनाए, तब Narrator बीच में आ सकता है
                → लेकिन बहुत ज़्यादा नहीं — speakers की debate flow interrupt न हो

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                CLOSING — NARRATOR:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                - दोनों sides के core argument को एक line में capture करे
                - Audience को choose करने दे — एक thought-provoking closing question या statement

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                RULES:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ✓ दोनों sides genuinely strong — कोई side strawman नहीं
                ✓ Expert-level thinking, simple भाषा — जैसे कोई जानकार इंसान real debate में बोलता हो
                ✓ Real examples, analogies, या facts से arguments support हों
                ✗ BANNED: Generic filler — "यह ध्यान देने योग्य है", "निष्कर्ष में", "इस प्रकार"
                ✗ BANNED: एक side का argument दूसरे से obviously कमज़ोर हो
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ${durFillHi}
              `;
            } else {
              prompt = `
                विषय: "${topic}" पर एक Debate style वीडियो स्क्रिप्ट लिखो।
                ${specificDetails ? `अतिरिक्त संदर्भ: ${specificDetails}` : ''}
                ${durLineHi}
                भाषा: हिंदी / Hinglish।

                पात्र — ठीक ${speakerCount} वक्ता (कोई Narrator नहीं):
                ${speakers.length > 0 ? `इन नामों का उपयोग करो: ${speakers.join(", ")}.` : `Topic के हिसाब से fresh नाम choose करो — हर बार अलग। Generic या repeated नाम मत use करो।`}

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                OPENING — Speaker A (3 lines max):
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                Yeh 3 cheezein clearly cover karo — apni wording mein:
                1. Topic ka naam directly batao.
                2. Apna naam + apni position, aur opponent ka naam + uski position — clearly.
                3. Ek sharp debate question opponent ko throw karo.
                Bas. Speaker B turant jawab dega.

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                DEBATE BODY:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                दोनों speakers expert की तरह argue करें — लेकिन simple, clear भाषा में।

                हर argument इस तरह build होगा:
                → पहले अपनी position का core reason basics से explain करो — assume मत करो audience सब जानती है
                → फिर एक logical reasoning दो — facts, real examples, या analogies से support करो
                → दूसरी side के argument को directly counter करो — logical basis पर, emotional नहीं
                → Arguments deep और well-reasoned हों — surface-level assertions नहीं

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                CLOSING:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                - दोनों अपना final position confidently रखें — brief, sharp
                - कोई resolution नहीं — audience को decide करना है

                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                RULES:
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ✓ दोनों sides equally strong — कोई side strawman नहीं
                ✓ Expert-level thinking, simple भाषा — जैसे कोई जानकार इंसान real debate में बोलता हो
                ✓ Real examples, analogies, या facts से arguments support हों
                ✗ BANNED: Generic filler — "यह ध्यान देने योग्य है", "निष्कर्ष के रूप में"
                ✗ BANNED: एक side का argument दूसरे से obviously कमज़ोर हो
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ${durFillHi}
              `;
            }
        } else if (style === 'debate2') {
            const debaterA = speakers.length >= 1 ? speakers[0] : null;
            const debaterB = speakers.length >= 2 ? speakers[1] : null;
            const debaterLine = debaterA && debaterB
              ? `Debater A: ${debaterA} | Debater B: ${debaterB}`
              : debaterA
              ? `Debater A: ${debaterA} | Debater B: Topic के opposite side का एक relevant expert/figure — fresh, topic-specific`
              : `Topic के हिसाब से दो opposing real/fictional personas choose करो — जो उस debate को genuinely represent करें। Generic नाम मत use करो।`;
            prompt = `
              तुम्हें "${topic}" पर एक Debate 2 style वीडियो स्क्रिप्ट लिखनी है।
              ${specificDetails ? `अतिरिक्त संदर्भ: ${specificDetails}` : ''}
              ${durLineHi}
              भाषा: हिंदी / Hinglish (punchy, cinematic — जैसे high-stakes YouTube debate video हो)।

              ════════════════════════════════════════════
              CHARACTERS:
              ════════════════════════════════════════════
              - Narrator → HOST का role: intro + rounds announce + outro। Label हमेशा "Narrator" रहेगा।
              - ${debaterLine}

              ════════════════════════════════════════════
              STRUCTURE — इसी exact order में:
              ════════════════════════════════════════════

              【 PART 1 — HOST INTRO (Narrator) 】
              ─────────────────────────────────────
              Cinematic, dramatic hook — 4-5 short punchy lines:
              - पहली line: एक universal tension या paradox जो audience को instantly relate हो
              - दूसरी line: उस tension को amplify करो — "ek side promises X, dusri side promises Y"
              - तीसरी line: एक explosive question — "Lekin kya agar ek choice quietly tumhara future barbaad kar rahi hai?"
              - Debaters introduce करो — naam + unka exact stance एक line में
              - End: "Aaj [Debater A] vs [Debater B] — [Topic] ka ultimate debate."

              【 PART 2 — ROUND 1: CORE PHILOSOPHY 】
              ─────────────────────────────────────
              Narrator: "⚔️ Round 1 — Core Philosophy" jaise ek line announce karo (short, punchy)
              Debater A: अपनी philosophical core position — 4-6 lines, clear reasoning, one strong analogy
              Debater B: अपनी opposing philosophy — 4-6 lines, directly counter करो, equally strong

              【 PART 3 — ROUND 2: MONEY & NUMBERS 】
              ─────────────────────────────────────
              Narrator: "⚡ Round 2 — [relevant sub-topic]" announce (one punchy line)
              Debater A: Practical argument — real numbers, examples, logical data-driven angle
              Debater B: Counter with opposing logic — leverage, long-term perspective, counter-data

              【 PART 4 — ROUND 3: REAL-LIFE SITUATIONS 】
              ─────────────────────────────────────
              Narrator: "💥 Round 3 — [relevant sub-topic]" announce (one line)
              Debater A: Real-world example/scenario जो उनकी side को prove करे — specific, relatable
              Debater B: Counter with a different real-world angle — long-term या different perspective

              【 PART 5 — ROUND 4: DIRECT CLASH (Short & Sharp) 】
              ─────────────────────────────────────
              Narrator: "⚔️ Round 4 — Direct Clash" announce (one line)
              Debater A: 2-3 lines max — one sharp, punchy statement या counter-punch
              Debater B: 2-3 lines max — directly respond karo, no long arguments

              【 PART 6 — FINAL STATEMENTS 】
              ─────────────────────────────────────
              Narrator: "🧠 Final Statements" announce (one line)
              Debater A: 3-4 lines — अपनी core position confidently summarize करो। Motivational tone।
              Debater B: 3-4 lines — equally strong closing। अपनी side का strongest point।

              【 PART 7 — HOST OUTRO (Narrator) 】
              ─────────────────────────────────────
              - एक line में दोनों sides का essence capture करो
              - Audience को polarize करो — "Ek side choose kar lo"
              - End with a sharp, emotionally charged question जो audience को comment section में engage करे

              ════════════════════════════════════════════
              RULES:
              ════════════════════════════════════════════
              ✓ हर Round का Narrator announcement एक line में sharp — like a boxing match announcer
              ✓ दोनों debaters genuinely strong — कोई side weaker नहीं लगनी चाहिए
              ✓ Real examples, analogies, numbers — surface-level assertions नहीं
              ✓ Host/Narrator tone: cinematic, high-energy, TV presenter जैसा
              ✓ Debaters tone: confident, passionate, expert — जैसे actually वो लोग बोल रहे हों
              ✗ BANNED: Generic filler, पहले से सुने conclusion, obvious statements
              ✗ BANNED: Narrator बहुत ज़्यादा बोले — सिर्फ structure anchoring के लिए
              ✗ BANNED: कोई side strawman argument दे
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ${durFillHi}
            `;
        } else if (style === 'joe_rogan') {
          const guest = speakers.length >= 2 ? speakers[1] : (speakers[0] && speakers[0] !== 'Joe Rogan' ? speakers[0] : 'Elon Musk');
          prompt = `
            तुम Joe Rogan Experience podcast की एक episode की script लिख रहे हो।
            ${specificDetails ? `विशेष संदर्भ: ${specificDetails}` : ''}
            ${durLineHi}
            भाषा: हिंदी / Hinglish (natural बोलचाल की भाषा — जैसे असली podcast हो)।

            दो ही speakers हैं:
            - Joe Rogan (Host) — curious, direct, kabhi kabhi challenge karta hai, "bro", "that's insane", "a hundred percent", "for real though" जैसे phrases use karta hai
            - ${guest} (Guest) — इनकी real life, views, controversies, achievements के हिसाब से authentic dialogue

            ══════════════════════════════════════════
            EPISODE STRUCTURE (इसी order में, exactly):
            ══════════════════════════════════════════

            【 1. Joe का Opening — Guest Introduction 】
            Joe Rogan की style में show शुरू करो:
            - Show introduce करो briefly (JRE style — casual नहीं formal)
            - ${guest} को warmly introduce करो — कौन हैं, क्यों famous/controversial हैं, एक-दो known facts
            - Topic hint करो — "आज हम बात करेंगे [topic] के बारे में..."
            - फिर एक sharp, open-ended opening question से conversation शुरू करो
            Example tone: "यार, मैं काफी excited था तुमसे मिलने के लिए। तुम्हारे बारे में बहुत कुछ सुना है — [fact]। तो बताओ, सच क्या है?"

            【 2. Main Conversation (एपिसोड का 80% हिस्सा) 】
            Free-flowing, long-form conversation — कोई structured debate नहीं:
            - ${guest} detailed, thoughtful answers देते हैं (अपनी real known views के साथ)
            - Joe curious follow-ups पूछता है, tangents explore करता है
            - Joe kabhi kabhi pushback देता है — gently challenge karta hai
            - Personal stories, controversies, behind-the-scenes moments mix karo
            - Deep topics explore karo — philosophy, science, conspiracy, personal life
            - Authentic Joe phrases mix karo: "That's insane bro", "Is that from a study?", "A hundred percent", "Pull that up", "For real though", "I think there's something to that", "Powerful", "That makes sense actually"

            【 3. Closing 】
            - Joe wrap up karo naturally — no forced conclusion
            - Where to find the guest, any plug (book, company, social)
            - Joe का final thought — appreciative, genuine

            ══════════════════════════════════════════
            TONE RULES (strictly follow):
            ══════════════════════════════════════════
            - Completely natural banter — jaise real dost baat kar rahe ho
            - ${guest} की ACTUAL known views, statements, controversies use karo — generic mat bolo
            - Tangents OK hain — real conversations go off-track naturally
            - Banned: "यह ध्यान देने योग्य है", "निष्कर्ष में", "इस महत्वपूर्ण विषय पर"
            - ${durFillHi}

            Topic for today's episode: "${topic}"
          `;
        } else if (style === 'finance_deep_dive') {
          if (includeNarrator) {
            prompt = `
              ═══════════════════════════════════════
              STYLE: FINANCE DEEP DIVE — USA FINANCE DISCUSSION WITH REAL NUMBERS
              Yeh situational nahi hai, debate nahi hai, general podcast nahi hai।
              Ek relatable USA-based scenario + 2 finance experts jo real calculations ke saath actual advice dete hain।
              Har point pe numbers aane chahiye — formulas, dollar amounts, year-by-year breakdown।
              ═══════════════════════════════════════
              Topic: "${topic}"
              ${specificDetails ? `Additional context: ${specificDetails}` : ''}
              ${durLineHi}
              Language: Hinglish — simple, conversational।
              Target Audience: USA mein rehne wale Indians।

              CHARACTERS — exactly 3:
              - Narrator: sirf opening aur closing ke liye — beech mein nahi
              ${speakers.length >= 3
                ? `- Expert 1: ${speakers[1]} | Expert 2: ${speakers[2]}`
                : `- Expert 1 aur Expert 2: topic ke liye sabse relevant do finance experts choose karo (jaise CFP + Stock Analyst, ya Real Estate Expert + Tax Advisor) — fresh realistic names, har baar alag`
              }

              ══════════════════════════════════════════
              【 NARRATOR — OPENING (SHOW FORMAT) 】
              ══════════════════════════════════════════
              Narrator EXACTLY is structure mein shuru kare:

              Line 1 — seedha topic introduce karo:
              "Aaj hum baat karenge [TOPIC] ke baare mein।"
              (topic ka naam clearly pehli line mein — koi buildup nahi)

              Line 2-3 — us specific person ko introduce karo jisne yeh question poochha hai:
              "Yeh sawaal hai [NAME] ka। Wo [CITY] mein rehte hain, ek [JOB] hain, aur unka sawaal hai — [SPECIFIC QUESTION RELATED TO TOPIC]।"
              Person ki identity topic ke hisaab se realistic choose karo — age, job, city, family situation।

              Line 4 — Experts ko hand over karo:
              "Aaj hamare paas hain [Expert 1 naam] aur [Expert 2 naam] — aao dekhte hain kya kehna hai inhe।"

              Bas — Narrator ka kaam yahan khatam। Beech mein nahi aayega।

              ══════════════════════════════════════════
              【 MAIN DISCUSSION — Dono Experts 】
              ══════════════════════════════════════════
              Har important angle ke liye:
              → Zero se explain karo — prior knowledge assume mat karo
              → Calculations explicitly dikhao — formulas, year-by-year numbers
              → Specific real examples — actual companies, real events
              → Pros aur Cons dono clearly
              → Dono experts naturally agree aur disagree karte hain — real conversation

              Topic ke hisaab se cover karo:
              • Compounding → A=P(1+r)^n formula, 10/20/30 year comparison, early vs late start
              • Stock → 5-year history, PE ratio, pros/cons, S&P 500 comparison, clear verdict
              • Car → EMI + insurance + maintenance + depreciation = true cost, loan vs cash
              • Home loan → PITI breakdown, 30yr vs 15yr, rent vs buy, 28% rule
              • Koi bhi finance topic → monthly numbers mein todke dikhao

              ══════════════════════════════════════════
              【 NARRATOR — CLOSING 】
              ══════════════════════════════════════════
              Experts dono milke specific numbered action plan dete hain scenario ke hisaab se।
              Phir Narrator ek memorable line se close karta hai।

              RULES:
              ✗ "Consult a professional" BANNED
              ✗ Generic advice BANNED — numbers ke saath sab kuch
              ✗ Jargon turant explain karo — akela mat chodo
              ✓ Step-by-step calculations
              ✓ Simple Hinglish — expert ki soch, dost ki bhaasha
              ${durFillHi}
            `;
          } else {
            prompt = `
              ═══════════════════════════════════════
              STYLE: FINANCE DEEP DIVE — SITUATIONAL (NO NARRATOR)
              Yeh general situational nahi hai — yeh FINANCE topic pe focused hai।
              Ek normal person apni real USA-based financial problem batata hai।
              2 finance experts actual numbers aur calculations ke saath help karte hain।
              Har point pe real math dikhao — no vague advice।
              ═══════════════════════════════════════
              Topic: "${topic}"
              ${specificDetails ? `Additional context: ${specificDetails}` : ''}
              ${durLineHi}
              Language: Hinglish — simple, conversational।
              Target Audience: USA mein rehne wale Indians।

              CHARACTERS — exactly 3:
              ${speakers.length >= 3
                ? `- Normal Person: ${speakers[0]} | Expert 1: ${speakers[1]} | Expert 2: ${speakers[2]}`
                : `- Speaker 1: ek aam USA-based Indian — topic ke hisaab se realistic identity (age, job, city sab khud choose karo)
              - Speaker 2 aur 3: topic ke liye sabse relevant do finance experts — fresh realistic names har baar`
              }

              ══════════════════════════════════════════
              【 SPEAKER 1 — NORMAL PERSON (opening) 】
              ══════════════════════════════════════════
              Seedha apna intro deta/deti hai:
              "Mera naam [naam] hai। Main [city] mein rehta/rehti hoon। [job] karta/karti hoon, salary $[amount]/year hai।"
              Phir apni real financial situation detail mein batata/batati hai — kya problem hai, kaise complicated ho gayi, abhi kahan hai।
              Specific questions se end karo jo mind mein ghoom rahe hain।

              ══════════════════════════════════════════
              【 EXPERTS — Deep Dive 】
              ══════════════════════════════════════════
              Expert 1 pehle genuinely react karta hai story pe — phir apna angle deta hai।
              Expert 2 bilkul alag angle laata hai — Expert 1 ki baat repeat nahi karta।

              Har point ke liye:
              → Zero se explain karo — audience ko kuch nahi pata assume karo
              → Calculations explicitly dikhao — formulas, year-by-year numbers
              → Specific real examples — actual companies, real events
              → Pros aur Cons dono clearly
              → Dono experts aapas mein respectfully disagree karte hain — real conversation

              Topic ke hisaab se cover karo:
              • Compounding → A=P(1+r)^n formula, 10/20/30 year comparison, early vs late start
              • Stock → 5-year history, PE ratio, pros/cons, S&P 500 comparison, clear verdict
              • Car → EMI + insurance + maintenance + depreciation = true cost, loan vs cash
              • Home loan → PITI breakdown, 30yr vs 15yr, rent vs buy, 28% rule
              • Koi bhi finance topic → monthly numbers mein todke dikhao

              Speaker 1 beech beech mein follow-up questions puchta/puchti hai — real back-and-forth।

              ══════════════════════════════════════════
              【 CLOSING 】
              ══════════════════════════════════════════
              Dono experts milke Speaker 1 ko specific numbered action plan dete hain।
              Actual steps — amounts, timelines, order।

              RULES:
              ✗ "Consult a professional" BANNED — aap HI experts ho
              ✗ Generic advice BANNED — numbers ke saath sab kuch
              ✗ Jargon turant explain karo — akela mat chodo
              ✓ Step-by-step calculations with real numbers
              ✓ Simple Hinglish — expert ki soch, dost ki bhaasha
              ${durFillHi}
            `;
          }
        } else {
            prompt = `
              विषय: "${topic}" पर एक ${style} वीडियो स्क्रिप्ट तैयार करें।
              ${specificDetails ? `विशिष्ट विवरण/संदर्भ: ${specificDetails}` : ''}
              ${durLineHi}
              भाषा: हिंदी (Hindi)।
              
              पात्र:
              ${speakerCount} अलग-अलग वक्ता बनाएं।
              ${speakers.length > 0 ? `इन नामों का उपयोग करें: ${speakers.join(", ")}.` : `विषय के लिए उपयुक्त नाम/व्यक्तित्व ऑटो-डिटेक्ट करें (जैसे "शाकाहारी" बनाम "मांसाहारी" या विशिष्ट प्रसिद्ध हस्तियां)।`}
              
              संरचना और प्रवाह:
              1. ${includeNarrator ? narratorIntroHindi : `एक परिचय के साथ शुरू करें जो विषय/केस को सीधे और सरलता से समझाता है, केंद्रीय प्रश्न पूछता है, और वक्ताओं का परिचय देता है।`}
              2. वक्ता A और B आपस में तर्क-वितर्क करते हैं।
              3. प्रवाह स्वाभाविक और आकर्षक रखें।
              4. ${includeNarrator ? "नैरेटर केवल अंत में एक संक्षिप्त निष्कर्ष (Conclusion) देने के लिए आएगा।" : ""}
              5. सभी ${speakerCount} वक्ताओं की समान भागीदारी सुनिश्चित करें।
              6. पूरी स्क्रिप्ट हिंदी में होनी चाहिए।
              
              स्वर और भाषा (Tone & Language):
              - भाषा बहुत ही स्वाभाविक, संवादात्मक (conversational) और इंसानों जैसी (human-like) होनी चाहिए।
              - रोबोटिक, किताबी या अत्यधिक औपचारिक शब्दों का प्रयोग न करें। आम बोलचाल की भाषा (Colloquial Hindi/Hinglish) का उपयोग करें।
              - AI वाले घिसे-पिटे वाक्यों से बचें। ऐसा लगना चाहिए जैसे असली इंसान स्वाभाविक रूप से बात कर रहे हैं।
              
              ${durFillHi}
            `;
        }
      }
  } else {
      // English Logic
      if (customScript) {
        prompt = `
          Your job is to convert the script below into speaker-tagged JSON segments.

          ORIGINAL SCRIPT:
          """
          ${customScript}
          """

          INSTRUCTIONS:
          1. SPEAKER DETECTION: Find the speakers by their exact names as written in the script (e.g. "Joe Rogan:", "Host:", "Guest 1:"). If no labels exist, logically assign 2 speakers from context.
          2. SPLIT: Divide the script into speaker turns — create a new segment each time the speaker changes.
          3. TEXT PRESERVE: Keep the text of each segment EXACTLY as written in the original — do not change, remove, shorten, or rephrase even a single word. Only strip the speaker label prefix if present.
          4. Any unattributed narration should be tagged as "Narrator".

          STRICT RULES:
          ✗ Do NOT rewrite, shorten, or modify the original text — WORD FOR WORD
          ✗ Do NOT invent speaker names — use exactly what is in the script
          ✗ Do NOT add or remove any content
          ✓ Output ONLY a valid JSON array. No extra text, no markdown.

          Output format:
          [
            {"speaker": "Speaker Name", "text": "Exact original text for this turn"},
            {"speaker": "Speaker Name", "text": "Exact original text for next turn"},
            ...
          ]
        `;
      } else {
        // General Prompt Construction
        if (style === 'explained') {
          if (includeNarrator) {
            prompt = `
              Topic: "${topic}"
              ${specificDetails ? `Additional context: ${specificDetails}` : ''}
              ${durLineEn}
              Language: ${language}.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STEP 1 — PLAN BEFORE WRITING:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              Identify 4-6 key aspects/points of this topic.
              For each point, determine:
                → What it is (definition / how it works)
                → Its positive / benefit / upside
                → Its negative / drawback / other side
                → The best real-world example that shows both sides

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              CHARACTERS:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              - Narrator: ONLY for opening and closing — never in between
              - 2 Speakers: ${speakers.length > 0 ? speakers.join(", ") : "choose 2 fresh names fitting the topic — different each time"} — distinct personalities:
                Speaker A: curious, sometimes plays devil's advocate, asks what the audience is thinking
                Speaker B: well-informed, explains both sides clearly, uses real examples

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STRUCTURE:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

              【 Narrator — Opening (DIRECT, SHORT — 3-4 lines MAX) 】
              Start by naming the topic DIRECTLY in the very first sentence — no warmup, no dramatic build-up.
              Examples of the right opening tone:
              • "Today we're talking about Robert Greene's 48 Laws of Power — what it is, and why millions of people swear by it."
              • "Today's topic is cryptocurrency — what it actually is, how it works, and whether it's worth your attention."
              • "Today we're breaking down Stoicism — the ancient philosophy that modern CEOs and athletes live by."
              Then 1-2 sentences on what specifically will be covered in this video.
              Then hand off immediately to speakers. No long intro.

              【 Point-by-Point Discussion (this is the entire main content) 】
              For each key aspect/point, follow this exact pattern:

              POINT [X]: [Name of the point]
              → Speaker A: What this point is — explain from zero, assume audience knows nothing
              → Speaker B: The positive/benefit/upside side — how it works, why it matters
              → Speaker A: The negative/drawback/counter side — limitations, risks, darker angle
              → Speaker B: A specific real example that shows BOTH sides clearly
              → Together: Brief conclusion on this point — when it works, when it doesn't

              Transition naturally to the next point — "Now let's talk about...", "There's another angle here..."

              【 Narrator — Closing (SHORT — 2-3 lines) 】
              → The core essence of the topic in one line
              → One thought-provoking question or insight to leave with

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              RULES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ✓ Show BOTH sides of every point — never only positive or only negative
              ✓ Build every concept from zero — never assume prior knowledge
              ✓ Every point must have a specific, real example — no vague placeholders
              ✓ Simple language, expert thinking — like a knowledgeable friend
              ✓ Speaker A and B must sound clearly different
              ✗ BANNED: Long dramatic opening — 4 lines max
              ✗ BANNED: Narrator appearing mid-discussion — only opening and closing
              ✗ BANNED: "It's important to note", "Let's delve into", "In conclusion", generic filler
              ✗ BANNED: Speakers referencing each other's words — stay focused on the topic
              ${durFillEn}
            `;
          } else {
            prompt = `
              Topic: "${topic}"
              ${specificDetails ? `Additional context: ${specificDetails}` : ''}
              ${durLineEn}
              Language: ${language}.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STEP 1 — PLAN BEFORE WRITING:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              Identify 4-6 key aspects/points of this topic.
              For each point:
                → What it is (definition)
                → Positive / benefit side
                → Negative / drawback / other side
                → Best real example showing both sides

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              CHARACTERS — exactly 2 speakers (no Narrator):
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ${speakers.length > 0 ? `Use these names: ${speakers.join(", ")}.` : `Choose fresh names fitting the topic — different every time.`}
              Distinct personalities:
              - Speaker A: curious, devil's advocate, explores both sides
              - Speaker B: well-informed, explains clearly with specific examples

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STRUCTURE:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

              【 Opening — Speaker A (2-3 lines max) 】
              Start directly with the topic name — no greeting, no "alright guys", no warmup.
              Format: "Today we're talking about [topic name] — [one line on what will be covered]."
              Example: "Today we're talking about Robert Greene's 48 Laws of Power — what it teaches, its key laws, and whether it actually works in real life."

              【 Point-by-Point Discussion (this is the entire main content) 】
              For each key aspect/point:

              POINT [X]: [Name of the point]
              → Speaker A: What this point is — from zero, no prior knowledge assumed
              → Speaker B: The positive/benefit/upside side
              → Speaker A: The negative/drawback/counter side
              → Speaker B: Specific real example showing both sides
              → Both: Quick conclusion — when does this work, when doesn't it

              Natural transitions between points.

              【 Closing — Speaker B (SHORT — 2-3 lines) 】
              → Core essence of the topic in one line
              → One memorable thought or question

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              RULES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ✓ Both sides of every point — never one-sided
              ✓ Build from zero — no assumed knowledge
              ✓ Specific real examples — no vague "imagine a company..." placeholders
              ✓ Simple language, expert thinking
              ✓ Speaker A and B must sound clearly different
              ✗ BANNED: Long opening — 4 lines max
              ✗ BANNED: "It's important to note", "Let's delve into", "In conclusion", generic filler
              ✗ BANNED: Speakers referencing each other's words
              ${durFillEn}
            `;
          }
        } else if (style === 'image') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: IMAGE STYLE — SINGLE VOICE, SINGLE MAN SCENARIO
            One speaker. No narrator. No second speaker. No dialogue.
            Psychology / finance / self-improvement topic.
            Audience: USA-based adults. Language: English.
            Hook: Prefer scenarios featuring a single man — ordinary, relatable, real-feeling.
            ═══════════════════════════════════════

            Topic: "${topic}"
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}
            ${durLineEn}
            Speaker: ${speakers.length > 0 ? speakers[0] : 'Voiceover'}

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STRUCTURE:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            【 HOOK (3-5 lines — this determines everything) 】
            Open with ONE specific man in a specific, real-feeling situation.
            He is ordinary. Not famous. The situation is concrete and visual.
            Then pivot to the audience — "Have you ever...?" / "Sound familiar?" / "That's most of us."
            The character is ALWAYS male. Every pronoun is he/him/his.
            Strong hook examples:
            • "A man who never misses a gym session, eats clean, sleeps 8 hours — but still feels completely empty inside. Have you ever met someone like that? Or maybe... that's you."
            • "There's a man who checks his bank account every morning — not out of habit. Out of fear. He earns good money. It still never feels like enough."
            • "A 29-year-old man who looks successful on paper — good job, decent apartment, nice clothes — but spends every Sunday night dreading Monday. Not because the job is hard. Because it doesn't mean anything."

            【 THE CORE INSIGHT 】
            Explain the real psychology or financial principle at play.
            — What is happening beneath the surface (the mechanism, the pattern)
            — Why most people don't see it or name it
            — What it costs him — emotionally, financially, in time or energy
            ✓ All examples use "a man", "he", "him" — never "she", "her", or "they"

            【 THE SHIFT 】
            Give the audience a reframe — a concrete new way to see the situation.
            — One principle or shift in thinking tied to this topic
            — A real example of a man who applied this and what actually changed for him
            — Grounded. Not motivational. Practical.

            【 CLOSING (1-2 lines only) 】
            One line that lingers. A truth, a question, or a quiet challenge.
            Example: "The goal was never the money. The goal was the feeling you thought money would give you."

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            RULES:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✓ Single speaker only — no back-and-forth, no names exchanged
            ✓ English — USA audience, conversational but intelligent
            ✓ EVERY character/scenario = ONE MAN (he/him/his) — no exceptions
            ✓ Hook must open with a specific male character, not a generic statement
            ✓ Every insight must have a grounded real example with a man
            ✓ Tone: calm, direct, unhurried
            ✗ BANNED: Any female character or "she/her/woman"
            ✗ BANNED: Groups, couples, "they/them", or plural people
            ✗ BANNED: "In today's video..." — start with the hook directly
            ✗ BANNED: Hollow motivational lines, generic life advice, filler phrases
            ✗ BANNED: Multiple speakers or any form of dialogue
            ${durFillEn}
          `;
        } else if (style === 'professor_jiang') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: PROFESSOR JIANG XUEQIN — CURRENT EVENTS DEEP ANALYSIS
            Speaker: Professor Jiang Xueqin — a globally-informed, analytically rigorous thinker.
            ONE speaker only. No dialogue. No second voice. No debate format.
            This is a structured breakdown of a current event — like a professor dissecting what just happened.
            Language: English. Tone: academic but accessible, measured, never sensational.
            ═══════════════════════════════════════

            Topic/Event: "${topic}"
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}
            ${durLineEn}
            Speaker Name: ${speakers.length > 0 ? speakers[0] : 'Professor Jiang Xueqin'}

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STRUCTURE — follow this exact order:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            【 OPENING — THE MOMENT 】
            Start with a sharp, factual statement that drops the audience directly into the event.
            Conversational but authoritative — like a professor opening a lecture without preamble.
            Examples:
            "So today, Trump agreed to a ceasefire. But at what cost?"
            "The Fed held rates again. Let's talk about what that actually means."
            "India just crossed a line. And most people don't realize it yet."
            2-3 sentences. No filler. Never start with "In today's video..."

            【 WHAT HAPPENED — THE FACTS 】
            State precisely what occurred — specific, verifiable.
            Key actors, decisions, dates, numbers — only what's relevant.
            Neutral framing. No opinion yet. Just the facts arranged clearly.

            【 WHY IT HAPPENED — THE DEEPER CONTEXT 】
            Now explain why this happened.
            Historical background, power dynamics, pressure points, prior agreements — the context that surface-level coverage skips.
            This is where Professor Jiang's value shows: drawing the connections most analysts miss.

            【 WHAT IT ACTUALLY MEANS — THE REAL IMPLICATIONS 】
            What does this actually mean in practice?
            — For ordinary people (economically, socially, physically)
            — Geopolitically or institutionally
            — Short-term disruption vs long-term shift
            Be specific. Avoid vague "this will have significant consequences."

            【 WHAT COULD HAPPEN NEXT — STRUCTURED PREDICTIONS 】
            Three clearly labeled scenarios:

            Scenario A, Most Likely: What will probably happen and why. What indicators point here.
            Scenario B, Best Case: The optimal outcome. What conditions need to hold for this.
            Scenario C, Worst Case: If things go wrong. What triggers this and how bad it gets.

            Each scenario: 2-3 sentences. Grounded in logic, evidence, and precedent — not fear.

            【 CLOSING LINE 】
            One observation or question that stays with the listener.
            Not hopeful, not hopeless — just honest.
            Examples:
            "The question now is not whether a deal was made. It's what was given up to make it."
            "History doesn't repeat. But it rhymes loudly."

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            RULES:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✓ Single speaker — Professor Jiang Xueqin voice only
            ✓ English — precise, academic but not jargon-heavy
            ✓ All claims grounded — no bare speculation
            ✓ Predictions clearly labeled Scenario A / B / C
            ✓ Tone: measured, confident, never alarmist or partisan
            ✓ Use Google Search to verify facts if relevant (dates, names, figures)
            ✓ EXPLAIN every term, acronym, institution, or event the first time it appears — fold the explanation naturally into the sentence. Example: "The Fed — the US Federal Reserve, which controls interest rates — held rates steady." Or: "Article 370, which had given Jammu and Kashmir special autonomous status within India, was revoked." Never assume the listener already knows the term. Treat it like a smart friend explaining, not a textbook footnote.
            ✗ BANNED: "In today's video..." / YouTube-style intros
            ✗ BANNED: Emotional manipulation or sensational framing
            ✗ BANNED: Any second speaker, dialogue, or debate format
            ✗ BANNED: "Only time will tell" or other vague non-conclusions
            ✗ BANNED: Any brackets in output — no [ ], no 【 】, no ( ) around labels — plain spoken text only
            ✗ BANNED: Section headings in the output — content must flow naturally without printed headers
            ${durFillEn}
          `;
        } else if (style === 'book_summary') {
          if (speakerCount === 1) {
            prompt = `
              ═══════════════════════════════════════
              STYLE: BOOK SUMMARIZER — SOLO VOICE EXPLAINER
              One speaker only. No dialogue. No second voice.
              Language: English — clear, conversational, warm.
              Tone: Like a knowledgeable friend who just read the book and is telling you everything over coffee.
              ═══════════════════════════════════════
              Book / Chapter: "${topic}"
              ${specificDetails ? `Extra context: ${specificDetails}` : ''}
              ${durLineEn}
              Speaker: ${speakers.length > 0 ? speakers[0] : 'Voiceover'}

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              DETECT INPUT TYPE:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              - Full book title (e.g. "48 Laws of Power", "Atomic Habits") → summarize the whole book, covering the most important laws/chapters/concepts.
              - One chapter or law (e.g. "Law 1: Never Outshine The Master") → deep breakdown of just that chapter/law.
              Same structure applies in both cases.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STRUCTURE (in this exact order):
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

              INTRO — START DIRECTLY
              First line names the book/chapter and captures the core idea.
              Example: "48 Laws of Power — Robert Greene's guide to understanding how power really works, and how to use it without being used."
              Then 2-3 lines telling the listener exactly what this video covers.

              BACKGROUND
              Who wrote it and why? What problem does this book/chapter solve?
              One real example or fact that shows why it matters. Simple language. Zero jargon.

              MAIN BREAKDOWN
              For a full book: cover the 5-10 most important laws/chapters/concepts.
              For one chapter: cover 3-5 key ideas from that chapter.

              For each concept:
              → State the concept name clearly
              → Explain it in 2-3 simple lines — as if explaining to someone who has never heard of this
              → Give one real-life example — a famous person, historical event, or relatable everyday scenario
              → Practical application — how can the listener use this in their own life? Be specific.

              COMMON MISTAKE
              One common mistake or misconception people have about this book/chapter.
              1-2 sharp, specific lines.

              KEY TAKEAWAYS
              3-5 things the listener can apply starting today. Practical, actionable, specific.

              CLOSING
              One strong, memorable final line that captures the whole message.
              Then: "I hope you found this video informative. Thanks for watching."

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              RULES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ✓ Always write in English only
              ✓ Single speaker throughout — warm, confident, conversational
              ✓ Real example for every concept — no vague placeholders
              ✓ Explain any term immediately when used — zero assumed knowledge
              ✓ Every section must be present
              ✗ BANNED: Second speaker or dialogue of any kind
              ✗ BANNED: Generic opener like "Today I'm going to tell you about..." — start directly
              ✗ BANNED: Filler phrases ("This is very important", "This book is amazing")
              ✗ BANNED: Formatting marks — no **, no --, no [], no bullet symbols in output
              ✗ BANNED: Section headings in output — natural flowing speech only
              ${durFillEn}
            `;
          } else if (!includeNarrator) {
            prompt = `
              ═══════════════════════════════════════
              STYLE: BOOK SUMMARIZER — 2 HOSTS DISCUSSION (NO NARRATOR)
              Two hosts break down the book/chapter together in a natural back-and-forth conversation.
              No narrator. No third voice. Just two engaged, curious hosts.
              Language: English — conversational, energetic, easy to follow.
              ═══════════════════════════════════════
              Book / Chapter: "${topic}"
              ${specificDetails ? `Extra context: ${specificDetails}` : ''}
              ${durLineEn}
              Hosts: ${speakers.length >= 2 ? `${speakers[0]} and ${speakers[1]}` : 'Choose two natural-sounding names — one male, one female'}

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              DETECT INPUT TYPE:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              - Full book title → cover the most important 5-10 laws/concepts from the whole book.
              - One chapter/law → go deep on just that chapter — cover 3-5 key ideas from it.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              HOST PERSONALITIES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              Host A: Curious, asks questions, plays devil's advocate — sometimes skeptical.
              Host B: Well-read on the topic, explains clearly, gives examples, sees multiple angles.
              Both sound natural — not scripted. They react, build on each other, occasionally push back.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STRUCTURE:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

              OPENING (Host A or B — 3-4 lines)
              Jump straight in. Name the book/chapter. One-line hook on what it's about.
              Tell the listener what they'll learn in this episode. No warm-up. No generic greetings.
              Example: "Today we're diving into 48 Laws of Power — the book that basically wrote the rulebook on how power works in the real world. We'll break down the biggest laws, the most shocking examples, and whether any of this is actually useful in everyday life."

              BACKGROUND — SHORT (2-3 exchanges)
              Host A asks: who wrote it and why does this book exist?
              Host B answers with context — author background, what problem the book solves, one striking fact.

              CONCEPT BREAKDOWN (main content)
              Go through each major law/concept one by one:
              → Host B introduces the concept in simple terms
              → Host A reacts — asks a follow-up, challenges it, or gives a real-world angle
              → Host B gives a real example — specific name, event, or scenario (not vague)
              → Both agree on the practical takeaway — how does someone use this today?
              Transition naturally between concepts — "Okay, next one..." or "That reminds me of..."

              COMMON MISTAKE (1 exchange)
              Host A raises a common misconception about the book/chapter.
              Host B corrects it clearly and specifically.

              KEY TAKEAWAYS (1 exchange)
              3-5 specific things the listener can actually apply. Not vague advice — real, actionable steps.

              CLOSING (2-3 lines — one or both hosts)
              One strong final thought that captures the message of the book/chapter.
              End with: "Hope you found this useful. See you in the next one."

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              RULES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ✓ Always write in English only
              ✓ Exactly 2 speakers — no narrator, no third voice
              ✓ Real example for every concept — no generic "imagine someone does X..."
              ✓ Explain any term the moment it's used — zero jargon left unexplained
              ✓ Hosts must sound different — not a monologue split into two
              ✗ BANNED: Narrator or any third speaker
              ✗ BANNED: Generic opener ("Hey guys, welcome back to...") — start on topic immediately
              ✗ BANNED: Filler agreement ("Absolutely!", "Great point!", "Totally!") — every exchange adds value
              ✗ BANNED: Formatting marks in output — no **, no --, no [], no bullet symbols
              ✗ BANNED: Section headings in output — natural flowing dialogue only
              ${durFillEn}
            `;
          } else {
            prompt = `
              ═══════════════════════════════════════
              STYLE: BOOK SUMMARIZER — NARRATED 2 HOST FORMAT
              Narrator opens and closes. Two hosts do the main breakdown.
              Language: English — clear, engaging, accessible.
              ═══════════════════════════════════════
              Book / Chapter: "${topic}"
              ${specificDetails ? `Extra context: ${specificDetails}` : ''}
              ${durLineEn}
              Narrator: Narrator
              Hosts: ${speakers.length >= 2 ? `${speakers[0]} and ${speakers[1]}` : 'Choose two natural-sounding names — one male, one female'}

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              DETECT INPUT TYPE:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              - Full book title → cover the most important 5-10 laws/concepts from the whole book.
              - One chapter/law → deep breakdown of just that chapter — cover 3-5 key ideas.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              HOST PERSONALITIES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              Host A: Curious, questions-driven, occasionally skeptical — the learner in the room.
              Host B: Knowledgeable, example-driven, explains both sides — the expert in the room.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STRUCTURE (strictly in this order):
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

              NARRATOR — OPENING (3-4 lines max)
              State the book/chapter name directly. One-sentence hook on the core idea.
              Tell the listener what they'll take away from this episode. No warmup. No generic intro.
              Example: "48 Laws of Power by Robert Greene — a book that reveals how power really works in the world, who has it, who loses it, and why. Today, we break down the biggest laws and what they mean for your real life."

              HOSTS — BACKGROUND (2-3 exchanges)
              Host A asks about the book's origin — who wrote it, why does it exist?
              Host B answers: author background, the problem the book solves, one striking real fact.

              HOSTS — CONCEPT BREAKDOWN (main content)
              Go through each major concept/law one by one:
              → Host B introduces the concept simply
              → Host A reacts — questions, challenges, or real-world angle
              → Host B gives a specific real example — name, event, scenario
              → Both land on a practical takeaway — how to apply this today
              Transition naturally between concepts.

              HOSTS — COMMON MISTAKE (1 exchange)
              Host A raises a common misconception. Host B corrects it sharply.

              HOSTS — KEY TAKEAWAYS (1 exchange)
              3-5 specific, actionable things the listener can use today.

              NARRATOR — CLOSING (2-3 lines)
              One strong line capturing the essence of the book/chapter.
              Then: "I hope you found this video informative. Thanks for watching."

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              RULES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ✓ Always write in English only
              ✓ Narrator only appears at the very start and very end — nowhere in the middle
              ✓ Exactly 2 hosts for the main discussion
              ✓ Real, specific example for every concept — no generic placeholders
              ✓ Explain every term immediately — no unexplained jargon
              ✗ BANNED: Narrator speaking in the middle of the discussion
              ✗ BANNED: Generic opener — Narrator must name the book/topic in the first line
              ✗ BANNED: Filler agreement ("Absolutely!", "Great point!") — every line must add value
              ✗ BANNED: Formatting marks in output — no **, no --, no [], no bullet symbols
              ✗ BANNED: Section headings in output — natural flowing dialogue only
              ${durFillEn}
            `;
          }
        } else if (style === 'questioning') {
          const speakerBlock = speakerCount >= 4 && speakers.length >= 4
            ? `Speaker 1: ${speakers[0]}
Speaker 2: ${speakers[1]}
Speaker 3: ${speakers[2]}
Speaker 4: ${speakers[3]}

CRITICAL — Use EXACTLY these names as speaker labels throughout. Do NOT rename them.
Each name represents its identity/worldview:
- A religion name (Muslim, Christian, Hindu, Buddhist, Atheist) → speak from that faith's perspective, in the voice of a believer
- An AI name (ChatGPT, Grok, Claude, Gemini) → speak as that AI system would, in its tone and style
- A public figure name → speak in that person's known voice, views, and style
- Any other name → represent whatever worldview or identity that name implies`
            : `Choose 4 speakers whose perspectives are most naturally contrasting for this specific topic.
Examples (pick what fits the topic — don't copy blindly):
- Religious/moral topic: Christian, Muslim, Buddhist, Atheist
- AI topic: ChatGPT, Grok, Claude, Gemini
- Finance topic: Warren Buffett, Elon Musk, Dave Ramsey, a broke 25-year-old
- Political topic: Democrat, Republican, Libertarian, Independent voter
Choose whatever 4 make the most sense for THIS specific topic.
Use those labels as speaker names throughout.`;

          const qLang = isHindi
            ? 'Hinglish (Hindi + English mix, natural conversational tone — jaise real log baat karte hain)'
            : language;
          const qAudience = isHindi ? 'Hindi-speaking audience (India)' : 'USA adults';
          const contextBlock = specificDetails
            ? `BACKGROUND KNOWLEDGE — use these points as your OWN understanding to enrich the discussion. NEVER say "podcast mein", "video mein", "unhone kaha", "as seen in", "according to the show/interview/article" or anything that references an external source. These are just facts and angles you already know:
${specificDetails}`
            : '';

          if (!includeNarrator) {
            prompt = `
              STYLE: QUESTIONING — 4 PERSPECTIVES
              Language: ${qLang}. Audience: ${qAudience}.
              Topic / Question: "${topic}"
              ${contextBlock}
              ${durLineEn}

              ${speakerBlock}

              CRITICAL — THIS IS A DIRECT DISCUSSION OF THE QUESTION ITSELF.
              Speaker 1 opens by immediately stating their OWN genuine take on the question — no warm-up, no "did you see/watch/read" opener. Just their position on the question, right away.

              ${isHindi
                ? `GALAT opening: "Yaar, tune wo podcast/video dekha jisme Vikas Sir ne kaha..." ya "Bhai, ek show mein inhone ye point rakha tha..."\nSAHI opening: "Mujhe lagta hai shadi ka concept genuinely change ho raha hai — aur ye zyada logon ke liye achha hai..." ya "Dekho, ye question hi galat hai — shadi khatam nahi ho rahi, sirf uski definition badal rahi hai..."`
                : `WRONG opening: "Did you guys see that podcast where they debated this?"\nRIGHT opening: "Does money actually buy happiness? Yes — up to a clear point. Here's why..."`}

              Then all 4 speakers weigh in from their own worldview.

              Each speaker must:
              - Speak from their own worldview/identity consistently throughout
              - Support their point with at least one real, specific example (a name, event, or situation)
              - Directly respond to what others say — not just deliver separate monologues
              - Use plain language — conversational, not academic

              The conversation flow should feel natural and different for every topic.
              Do not repeat a rigid round-by-round template — let the dialogue evolve based on what the topic calls for.
              Speaker 1 closes with a brief final thought.

              RULES:
              ✓ Language: ${qLang}
              ✓ Speaker names used EXACTLY as given — do not rename or replace them
              ✓ 4 distinct voices — each sounds clearly different from the others
              ✓ Real specific examples — not vague general claims
              ✓ Genuine disagreement — speakers hold their positions
              ✗ NEVER say "podcast mein", "video mein", "show mein", "unhone kaha", "as per the interview/article/video" — speakers discuss the QUESTION from their OWN perspective
              ✗ NEVER reference a show name, guest name as a source — only as a real-world example if needed
              ✗ No generic filler ("Great point!", "Bilkul!", "I totally agree!")
              ✗ No formatting marks in output — no **, no --, no bullet symbols
              ✗ No section headings in output — just natural flowing dialogue
              ${durFillEn}
            `;
          } else {
            prompt = `
              STYLE: QUESTIONING — NARRATOR + 4 PERSPECTIVES
              Language: ${qLang}. Audience: ${qAudience}.
              Topic / Question: "${topic}"
              ${contextBlock}
              ${durLineEn}

              Narrator: Narrator
              ${speakerBlock}

              CRITICAL — THIS IS A DIRECT DISCUSSION OF THE QUESTION ITSELF. No podcast, video, show, or external reference anywhere.

              ${isHindi
                ? `Narrator seedha question throw kare — sharp aur immediate: "Theek hai, aaj ka sawaal — [topic]. [Speaker 1], [Speaker 2], [Speaker 3], [Speaker 4] — bolo." Koi podcast/show/video ka naam nahi.`
                : `The Narrator opens by throwing the question directly: "Alright, here's the question — [topic]. [Speaker 1], [Speaker 2], [Speaker 3], [Speaker 4] — let's get into it." No show name, no "did you watch/see".`}

              Each speaker responds to the QUESTION itself from their own worldview/identity — NOT as a reaction to something they "saw" or "watched".
              The Narrator asks sharp follow-up questions at natural moments — probing the most interesting tensions.

              The conversation should feel organic and specific to this topic.
              Do not follow a rigid round-by-round template — let the discussion evolve naturally.

              Each speaker must:
              - Stay consistent with their worldview/identity throughout
              - Back every major point with a real, specific example (a name, event, or concrete situation)
              - React to what others say — not just give prepared speeches
              - Use plain accessible language

              The Narrator closes with a brief honest observation about what the conversation revealed.

              RULES:
              ✓ Language: ${qLang}
              ✓ Speaker names used EXACTLY as given — do not rename or replace them
              ✓ Narrator appears at the start, at natural moments to ask questions, and at the close
              ✓ 4 distinct speaker voices — each sounds clearly different from the others
              ✓ Real specific examples for every major point — not abstract claims
              ✓ Genuine disagreement — speakers hold their ground
              ✗ NEVER say "podcast mein", "video mein", "show mein", "unhone kaha", "according to the interview" — speakers are discussing the QUESTION, not reacting to a source
              ✗ NEVER reference a show name or host as the source of the topic
              ✗ No generic filler ("Great point!", "Bilkul!", "I totally agree!")
              ✗ No formatting marks in output — no **, no --, no bullet symbols
              ✗ No section headings in output — just natural flowing dialogue
              ${durFillEn}
            `;
          }
        } else if (style === 'transcript_review') {
          const transcriptText = contextFileContent
            ? `\n\nTRANSCRIPT / CONTENT:\n${contextFileContent.slice(0, 15000)}`
            : '';
          prompt = `
            STYLE: TRANSCRIPT REVIEW — SINGLE HOST OPINION VIDEO
            Language: ${language}. Audience: general viewers.
            ${durLineEn}

            You are writing a YouTube-style single-host video script where ONE person:
            1. Opens by briefly telling viewers what the source content is about (who, what show/platform, what topics were covered)
            2. Walks through the key ideas from the content in a natural, engaging way
            3. Closes with ONE paragraph of their own honest opinion — grounded in facts, not vague

            Topic / Source info: "${topic}"
            ${specificDetails ? `Extra context: ${specificDetails}` : ''}
            ${transcriptText}

            OPENING (2-4 sentences):
            Start with something like: "Hey guys, [Guest/Host] was on [Show] recently talking about [topic]. He's a [brief credential] — and he covered [point 1], [point 2], [point 3], [point 4]. Let me walk you through it and then give you my take."
            Make it feel like you just watched the video and are telling a friend about it. Natural, not formal.

            CONTENT WALKTHROUGH:
            Cover the key ideas from the transcript in a clear, engaging way.
            Each key point should be explained in plain language.
            Keep it flowing — no bullet lists, no headers, just natural speech.
            If an idea is interesting, react to it briefly ("And this is the part that really hit me..." / "Now this is where it gets wild...").

            CLOSING OPINION (1 paragraph):
            One honest, specific paragraph of your own take on the topic.
            Ground it in something real — a fact, a study, a pattern you've noticed, a personal angle.
            No vague opinions ("I think this is really important"). Make a specific point.
            End with a direct line to the viewer: a question, a challenge, or a clear takeaway.

            FORMAT RULES:
            ✗ NO speaker labels — no "Voiceover:", no "Host:", nothing
            ✗ NO bullet points, NO numbered lists, NO section headings in the output
            ✗ NO formatting marks — no **, no --, no bullet symbols
            ✓ Just clean flowing paragraphs — exactly as a real person would speak it
            ✓ Plain conversational language throughout
            ${durFillEn}
          `;
        } else if (style === 'summarizer_pov') {
          const transcriptText = contextFileContent
            ? `\n\nTRANSCRIPT / CLIP CONTENT:\n${contextFileContent.slice(0, 15000)}`
            : '';
          prompt = `
            STYLE: SUMMARIZER POV — TWO-PART REACTION SCRIPT
            Language: ${language}. Audience: general viewers.
            ${durLineEn}

            You are writing a SINGLE-VOICE script that has TWO clearly-separated parts:
              PART 1 — INTRO (fixed format, lists every big claim made in the clip)
              PART 2 — YOUR POV (your own analytical breakdown of each claim, one by one)

            Topic / Clip info: "${topic}"
            ${specificDetails ? `Extra context: ${specificDetails}` : ''}
            ${transcriptText}

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            PART 1 — INTRO (FIXED FORMAT — do NOT improvise the structure)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            Open with EXACTLY this template, filling in the blanks from the clip/transcript:

              "In this clip, [Person 1] and [Person 2] — [brief one-line description of who they are, e.g. 'a famous comedian and actor'] — make some big claims about [overall topic / theme].
              First, that [claim 1 — one short sentence].
              Second, that [claim 2 — one short sentence].
              Third, that [claim 3 — one short sentence].
              And fourth, that [claim 4 — one short sentence].
              Let's watch — and then I'll give my opinion."

            Rules for INTRO:
              ✓ Use the speakers'/guests' real names from the transcript (or topic line if missing)
              ✓ List 3 to 5 claims (use only as many as the clip actually makes — do not invent)
              ✓ Each claim is ONE short, plain sentence — no analysis yet, just neutral statement
              ✓ End the intro EXACTLY with: "Let's watch — and then I'll give my opinion."
              ✗ No analysis, no opinion, no facts/counter-facts in PART 1

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            PART 2 — YOUR POV (YOUR OWN ANALYSIS, claim by claim)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            Now go through the SAME claims listed in the intro, in the SAME order.
            For EACH claim:
              1. Briefly restate which claim you're addressing (1 short line).
              2. Give your verdict — pick the honest one:
                   • "actually solid / true" — if the claim genuinely holds up
                   • "partially true" — if there's a kernel of truth but exaggerated
                   • "misleading" — if technically not false but framed deceptively
                   • "exaggerated / blown out of proportion" — if real but overhyped
                   • "false / not supported by reality" — if just wrong
              3. Explain WHY in 3-6 sentences, grounded in real facts, mechanisms, or examples.
                 Use specific reasoning — what the technology/event actually is, what it actually does,
                 and where the speaker stretched it. No vague hand-waving.
              4. Optionally end the claim with a short punchy takeaway line.

            Tone for PART 2:
              ✓ Honest, calm, slightly opinionated — like a knowledgeable friend correcting hype
              ✓ Use phrases like: "So first thing —", "Now the biggest point —",
                "Here's the reality —", "This is actually solid", "But the truth is —"
              ✓ Don't be afraid to AGREE when a claim holds up (don't debunk for the sake of debunking)
              ✓ Reference real-world facts, dates, mechanisms (as of ${new Date().getFullYear()})

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            FORMAT RULES (STRICT):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✗ NO speaker labels — no "Voiceover:", no "Host:", no "Narrator:", nothing
            ✗ NO bullet points, NO numbered lists, NO section headings in the OUTPUT
            ✗ NO formatting marks — no **, no --, no bullet symbols
            ✗ Do NOT label "PART 1" / "PART 2" in the output — just write them as flowing speech
            ✓ Just clean flowing paragraphs — exactly as one person would speak it on camera
            ✓ Natural pause between intro and POV (a paragraph break is enough)
            ${durFillEn}
          `;
        } else if (style === 'explained_solo') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: EXPLAINED SOLO — SINGLE VOICE YOUTUBE EXPLAINER
            This is NOT a debate, NOT a conversation, NOT a podcast.
            ONE voice only — like a YouTube creator talking directly to camera.
            Think: Kurzgesagt, Wendover Productions, or Dhruv Rathee style.
            ═══════════════════════════════════════
            Topic: "${topic}"
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}.

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STEP 1 — PLAN FIRST:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            Identify 4-7 key points that a proper YouTube video on this topic should cover.
            Logical order: basics → depth → application → conclusion

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            CHARACTER — exactly 1 speaker (Voiceover):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ${speakers.length > 0 ? `Speaker name: ${speakers[0]}` : `Speaker name: "Voiceover"`}
            Tone: confident, clear, friendly — like a knowledgeable YouTuber talking directly to camera.

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STRUCTURE (in this exact order):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            【 OPENING — START WITH THE TOPIC (no warmup) 】
            First line names the topic directly — no generic opener.
            Examples of how it should feel:
            • "Robert Greene's 48 Laws of Power — Law 1: Never Outshine The Master. That's what we're covering today."
            • "Trump's stock manipulation — what it was, how it worked, who was involved, and why it hurt everyday Americans."
            • "Love and sex — let's talk about it honestly, no filter."

            Then in 2-3 lines, tell the viewer exactly what angles this video covers — specific to THIS topic:
            "In this video we'll look at — [angle 1], [angle 2], [angle 3]..." — not a generic list, real angles for this specific topic.

            【 BASICS — What is this topic? 】
            2-4 lines: explain this topic from absolute zero.
            Assume the audience knows nothing about it.
            Simple language — zero jargon.

            【 MAIN POINTS — one by one 】
            For each point:
            → State the point name clearly
            → Explain what this point is
            → Give a real example or analogy
            → Practical implication — why does this matter?

            【 KEY TAKEAWAY 】
            2-3 lines: what is the single most important message from this topic.
            Simple and memorable.

            【 OUTRO 】
            End with exactly this line: "I hope you find this video informative. Thanks for watching."
            Use these exact words — do not paraphrase.

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            RULES:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✓ Only 1 speaker — "Voiceover" (or provided name)
            ✓ Explain every point from zero — never assume prior knowledge
            ✓ Every point must have a specific real example
            ✓ Conversational tone — like a friend explaining, not a lecture
            ✓ Proper YouTube script feel — natural, not stilted
            ✗ BANNED: Multiple speakers or dialogue format
            ✗ BANNED: "It's important to note", "In conclusion", "Furthermore", generic filler
            ✗ BANNED: Long boring intro — hook must be direct and sharp
            ${durFillEn}
          `;
        } else if (style === 'narration') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: NARRATION — SIMPLE SINGLE-VOICE SCRIPT (no speaker tags)
            Plain narration script. No dialogue, no hook-structure, no forced format.
            Just narrate the topic in ONE continuous voice, start to finish, in flowing paragraphs —
            like an audiobook or an essay being read aloud.
            ═══════════════════════════════════════
            Topic: "${topic}"
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}.

            CHARACTER — exactly 1 narrator:
            ${speakers.length > 0 ? `Speaker name: ${speakers[0]}` : `Speaker name: "Voiceover"`}

            RULES:
            ✓ The entire script is spoken by ONE speaker only, start to finish — one continuous
              piece, not something that reads like it was chopped into disconnected lines
            ✓ Natural, flowing narration — like a book being read or a story being told
            ✓ Engaging and simple — wherever it helps an idea land, use a concrete real-world
              example, analogy, or vivid specific detail. Keep the listener interested without
              forcing a rigid structure — never dry or textbook-like
            ✓ No forced structure (don't force a hook/opening/outro) — let the topic dictate the shape
            ✓ Organize the content into clear CHAPTERS/sections (like a good book or documentary) —
              each chapter should be complete and DETAILED on its own, not short or thin
            ✓ One chapter = one JSON segment. Chapter length follows the topic's needs, no fixed
              short cap — a long script will naturally split into several chapters, and any single
              chapter that's too long for one audio take can be cut into safe parts afterward with
              the Script Editor's "Split Script" button, so focus here purely on full detail and a
              good chapter structure
            ✗ No dialogue, no second speaker, no "Q:"/"A:" style tags
            ✗ Do not write speaker labels inside the text itself (e.g. "Narrator:") — just the pure spoken text
            ${durFillEn}
          `;
        } else if (style === 'monkey_explain') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: MONKEY EXPLAIN — STORYTELLING-STYLE SOLO EXPLANATION
            This is a STORY, not a lecture. One narrator tells a short fictional/relatable
            STORY (often through a monkey or a troop of monkeys, or some other simple everyday
            scenario) that naturally explains the real topic — like "Imagine a troop of monkeys
            living on an island who..." — and the concept unfolds through the story's events,
            not through direct lecturing. Engaging and simple — never dry, technical, or textbook-like.
            ═══════════════════════════════════════
            Topic: "${topic}"
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}.

            CHARACTER — exactly 1 narrator (storyteller):
            ${speakers.length > 0 ? `Speaker name: ${speakers[0]}` : `Speaker name: "Voiceover"`}

            APPROACH:
            - Come up with a simple story or scenario that naturally represents this topic —
              often a monkey/troop-of-monkeys story (e.g. an island monkey economy, a small
              monkey society), or another relatable everyday scenario if that fits better.
            - Unfold the story step by step: a setup, then something happens (a problem, a
              change, a twist), then its natural consequence — and that consequence becomes
              the topic's core insight.
            - Avoid jargon entirely. If a technical term is unavoidable, replace or compare it
              with something simple inside the story itself.
            - Open directly with the story — no dry "in this video we'll explain..." intro.
              Start straight with a story-hook like "Imagine..." or "Once upon a time...".

            RULES:
            ✓ Only 1 speaker — the entire script, told as one continuous story, not something
              that reads like it was chopped into disconnected lines
            ✓ Engaging, curiosity-driven — the listener should want to know what happens next
            ✓ Simple, conversational, friendly tone — never a lecture or textbook
            ✓ By the end of the story, the real topic's core takeaway should be naturally clear —
              no need to spell out "the moral of the story", let it land on its own
            ✓ Organize the content into clear CHAPTERS/scenes (like a story's chapters) — each
              chapter should be complete and DETAILED on its own, not short or thin
            ✓ One chapter = one JSON segment. Chapter length follows the topic's needs, no fixed
              short cap — a long chapter can be cut into safe parts afterward with the "Split
              Script" button, so focus here purely on full detail and good storytelling
            ✗ No dialogue, no second speaker
            ✗ Do not write speaker labels inside the text itself — just the pure spoken text
            ✗ Do not write a dry, technical, or bullet-point-style explanation — everything
              should come through the story
            ${durFillEn}
          `;
        } else if (style === 'crime_documentary') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: CRIME DOCUMENTARY — SUSPENSEFUL SOLO TRUE-CRIME STORYTELLING
            One narrator only, in the style of Mr. Ballen / Dark Downunder / Crime Junkie —
            a calm, ominous, controlled voice telling the full story of a case. No dialogue,
            no second speaker — just one measured voice building suspense.
            ═══════════════════════════════════════
            Topic/Case: "${topic}"
            ${specificDetails ? `Additional context/facts: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}.

            CHARACTER — exactly 1 narrator:
            ${speakers.length > 0 ? `Speaker name: ${speakers[0]}` : `Speaker name: "Voiceover"`}

            APPROACH:
            - If the topic includes real facts/names/case details, use them accurately. If the topic is generic, invent a realistic, grounded case that feels believable (a real-feeling place, date, ordinary person) — never over-the-top or cartoonish.
            - Open DIRECTLY with the scene — no dry "today we'll talk about..." intro. Start with a specific date, place, and a completely ordinary person's everyday life. e.g. "It was 2025. A man worked at a small car repair shop..." — establish NORMALCY first, so it lands harder when something goes wrong.

            STRUCTURE (in this order, but don't write the labels in the output):
            1. THE ORDINARY DAY — a specific date/place/person, sensory details of everyday life (sounds, weather, work) — a calm, normal beginning.
            2. THE FIRST CRACK — something strange or suspicious happens — a small but unsettling first warning sign.
            3. THE UNRAVELING — events unfold gradually. Reveal clues ONE AT A TIME — don't front-load the whole story, build tension gradually.
            4. THE TWIST — a shocking revelation or turning point that changes everything.
            5. THE AFTERMATH — what happened in the end, the consequences, how the case resolved (or didn't).
            6. CLOSING LINE — one haunting or thought-provoking final line that stays with the listener.

            RULES:
            ✓ Only 1 narrator — the entire case, told as one continuous piece, not something that reads like it was chopped into disconnected lines
            ✓ Tone: calm, ominous, measured, documentary-style — never rushed, cheerful, or sensational
            ✓ Suspenseful pacing — short, punchy sentences at tense moments to build dread
            ✓ Cinematic, sensory detail — describe place, weather, expressions, sound so the listener can "see" the scene
            ✓ Withhold information strategically — don't tell the whole story at once, control the reveal for suspense
            ✓ Organize the content into clear CHAPTERS (matching the structure above) — each chapter complete and DETAILED
            ✓ One chapter = one JSON segment. A long script will naturally split into several chapters — the "Split Script" button can cut any overly-long one afterward
            ✗ No dialogue, no second speaker
            ✗ Do not write speaker labels inside the text itself — just the pure spoken text
            ✗ Generic filler like "it's important to note", "in conclusion" — BANNED
            ${durFillEn}
          `;
        } else if (style === 'viral_recap') {
          prompt = `
            ═══════════════════════════════════════
            STYLE: VIRAL RECAP — HYPE, MEME-ENERGY SOLO TRUE-STORY NARRATION
            One narrator only, in the style of viral internet true-story/scam/heist recap
            channels — fast, breathless, chatty, like someone excitedly telling their friend
            the wildest story they just heard. This is the OPPOSITE of a somber documentary
            voice (that's what "Crime Documentary" is for) — this is loud, fun, a little
            unhinged, full of personality and reaction.
            ═══════════════════════════════════════
            Topic/Story: "${topic}"
            ${specificDetails ? `Additional context/facts: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}.

            CHARACTER — exactly 1 narrator:
            ${speakers.length > 0 ? `Speaker name: ${speakers[0]}` : `Speaker name: "Voiceover"`}

            APPROACH:
            - If the topic includes real facts/names/numbers, use them accurately and lean into how wild they are. If the topic is generic, invent specific, vivid, believable details (names, dollar amounts, dates) rather than staying vague.
            - Open with the SINGLE most shocking fact or number, stated almost casually, like you're already mid-conversation — e.g. "so this guy is rich, I mean like $230 million rich — because he stole it." No warmup, no "today we're talking about...".
            - Write it like SPOKEN, transcribed audio, not polished prose: run-on sentences connected with "and", casual fillers ("I mean", "like", "so", "okay so"), sentence fragments for punch, and audience-facing asides that break the flow on purpose (e.g. "okay real quick there's one thing I forgot to mention, let's rewind").
            - For the biggest, most jaw-dropping numbers or facts, REPEAT them for emphasis — say it once, then say it again like the narrator can't quite believe it themselves (e.g. "$230 million... $230 million.").
            - React to your own story as you tell it — rhetorical asides like "like damn, how much is he even driving?", "I can't even make this up", "bro really thought—". Make the narrator sound like a real, entertained person, not a script.
            - When there's a spending spree / escalation / list of excess, actually list it out item by item with specific numbers each time (cars, rent, bottles, gifts) — the sheer repetition of numbers IS the entertainment, don't summarize it away.
            - Where it fits, "quote" people's real reactions in the moment (their own words, exclamations, texts) as if replaying the actual audio — this makes it feel like a real, sourced story rather than a summary.
            - Build toward a turn — the moment it starts unraveling — and let the ending land with a dry, matter-of-fact epilogue note (what's actually confirmed vs. alleged, what happens next, current status) rather than a moralizing wrap-up.

            RULES:
            ✓ Only 1 narrator — the entire story, told as one continuous, high-energy piece, not something that reads like it was chopped into disconnected lines
            ✓ Tone: excited, casual, funny, a little chaotic — like recounting gossip, never somber or slow
            ✓ Fast pacing — short punchy bursts mixed with long breathless run-ons, exactly like real spoken storytelling
            ✓ Specific numbers, names, and details everywhere — vague generalities kill this style
            ✓ Organize the content into clear CHAPTERS/beats (setup → escalation → turn → aftermath) — each chapter complete and DETAILED
            ✓ One chapter = one JSON segment. A long script will naturally split into several chapters — the "Split Script" button can cut any overly-long one afterward
            ✗ No dialogue, no second speaker
            ✗ Do not write speaker labels inside the text itself — just the pure spoken text
            ✗ Never slip into a formal, documentary, or news-anchor tone — that's a different style
            ✗ Generic filler like "it's important to note", "in conclusion" — BANNED
            ${durFillEn}
          `;
        } else if (style === 'deep_explainer') {
          prompt = `
            ═══════════════════════════════════════════════════════
            STYLE: DEEP EXPLAINER — BEGINNER-FRIENDLY NEWS/TOPIC BREAKDOWN
            Two conversational speakers. One asks, one explains. EVERY jargon term defined
            the moment it appears. Strong hook in first 20 seconds. Structured segments.
            Think: podcast-meets-YouTube-explainer — deep, accurate, conversational, zero assumed knowledge.
            ═══════════════════════════════════════════════════════
            Topic: "${topic}"
            ${specificDetails ? `Additional context / angle: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}.

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STEP 1 — PLAN FIRST (before writing):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            Identify the 5-7 most important things a total beginner MUST understand about this topic:
              → The shocking hook / central fact
              → Core background (what happened / what is this)
              → The key numbers / math (explained simply with comparisons)
              → The real-world stakes (who gets hurt, who benefits, why it matters)
              → The counterargument / other side (give it a fair hearing)
              → The hidden detail most headlines miss
              → The simple takeaway

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            CHARACTERS — exactly 2 speakers (no Narrator):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ${speakers.length >= 2
              ? `Speaker A (Explainer): ${speakers[0]} — well-informed, explains clearly, uses real analogies
Speaker B (Curious): ${speakers[1]} — asks what the audience is thinking, pushes back, reacts genuinely`
              : `Speaker A (Explainer): choose a fitting name — well-informed, explains clearly, uses real analogies
Speaker B (Curious): choose a different name — asks what the audience is thinking, pushes back, reacts genuinely`
            }

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STRUCTURE (follow this exact flow):
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            【 HOOK — first 20 seconds (2-4 short exchanges) 】
            Open with a SHOCKING number, fact, or question — no warmup, no intro.
            Good examples:
            • "Quick question. How do you lose $600 billion dollars in one single day?"
            • "What if I told you the safest-looking investment just became the riskiest?"
            Speaker B reacts in disbelief or curiosity. Speaker A teases the full story.
            End with: the central question this video will answer.
            RULE: Start with the number/fact FIRST — not "Today we're talking about X."

            【 SEGMENT 1 — WHAT HAPPENED / WHAT IS THIS (basics from zero) 】
            Explain background from absolute zero — assume viewer knows NOTHING.
            EVERY technical term defined immediately when it first appears:
              ✓ "An 'IPO' — Initial Public Offering — is just the moment a private company sells shares to the public for the first time."
              ✓ "'Valuation' just means: if you bought every single share, that's what it would cost you."
            Speaker B asks the obvious questions the audience is thinking.
            Keep it tight — foundation only.

            【 SEGMENT 2 — THE KEY NUMBERS / MATH MADE SIMPLE 】
            Real analysis. Walk through the most important numbers.
            Every number needs a comparison to make it concrete:
              ✓ "For comparison, the average company trades at 3 times sales. This one is at 95."
              ✓ "Picture a swimming pool with almost no water. Throw in one pebble — it looks like a tsunami."
            Speaker B pushes back: "Is that normal?" / "That seems insane."
            Use at least 2 vivid analogies.

            【 SEGMENT 3 — CREDIT WHERE DUE / THE OTHER SIDE (be fair) 】
            Strongest honest argument FOR the thing being analyzed.
            Speaker B: "So why are people still worried?" — transition to what's actually risky.
            This MUST exist — never one-sided.

            【 SEGMENT 4 — THE HIDDEN DETAIL (what headlines miss) 】
            One specific insight most casual coverage skips.
            Speaker B reacts: "Wait — so that means..."

            【 SEGMENT 5 — OPTIMIST'S CASE (steelman it) 】
            Speaker A presents the bull/positive case fairly.
            Speaker B: "But even the best-case version still requires believing..."

            【 CLOSING — SIMPLE TAKEAWAY 】
            Speaker B: "So, plain and simple — [restate the question]?"
            Speaker A: direct 2-3 sentence answer. No hedging.
            End with a MEMORABLE CLOSING LINE — sharp, witty, thought-provoking.
            Examples:
            • "Funny enough, the part of this company that actually lands safely every time... might be the rockets, not the stock."
            • "The math doesn't lie. The marketing does."

            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            NON-NEGOTIABLE RULES:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✓ Define EVERY technical term immediately when it first appears — no exceptions
            ✓ Short turns: 2-4 sentences per exchange — no long monologues
            ✓ Speaker B must push back or react genuinely at least once per segment
            ✓ Every analogy must be visual and concrete — NOT "it's complex" or "it's nuanced"
            ✓ Numbers need context — never drop a stat without a comparison to something normal
            ✓ Both sides get a fair hearing — clarity, not cheerleading or fear-mongering
            ✗ BANNED: "It's important to note", "In conclusion", "Let's delve into", "Fascinating", "Great question"
            ✗ BANNED: Long intro before the hook — first line MUST be punchy
            ✗ BANNED: Dropping jargon without explaining immediately
            ✗ BANNED: Either side being cartoonishly wrong

            ${durFillEn}
          `;
        } else if (style === 'situational') {
          if (!includeNarrator) {
          prompt = `
            ═══════════════════════════════════════
            STYLE: SITUATIONAL — REAL PERSON + 2 EXPERTS
            This is NOT a debate. NOT a podcast. NOT an explanation video.
            A real person shares their genuine life situation → 2 domain experts actually help them.
            Tone: raw, human, emotionally grounded — like a Reddit confession thread meets expert panel.
            ═══════════════════════════════════════
            Generate a "Situational" style video script on the topic: "${topic}".
            ${specificDetails ? `Situation details: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}.
            Target Audience: USA mature audience — people dealing with real-life issues related to this topic.

            Characters — exactly 3 speakers:
            ${speakers.length >= 3
              ? `Use these names: ${speakers[0]} (the person in the situation), ${speakers[1]} (Expert 1), ${speakers[2]} (Expert 2).`
              : `Choose names and experts for THIS topic — Speaker 1 is the person stuck in the situation, Speakers 2 & 3 are two different domain experts most relevant to this topic.`
            }

            ══════════════════════════════════════════
            【 SPEAKER 1 — INTRO + STORY (the person in the situation) 】
            ══════════════════════════════════════════

            Speaker 1 opens EXACTLY in this structure:

            First line — name and identity (DIRECT, no buildup):
            "My name is [name]. I'm a [identity]."
            Next line goes STRAIGHT to the problem — what triggered this, no warm-up.
            (Pick a natural time reference: "Three weeks ago...", "Ever since that day...", "A month back..." — whatever fits, do NOT default to "last night")

            Then the story builds naturally:
            → What happened — specific details, not a summary
            → How it got complicated — step by step
            → Where they are now — emotionally and practically
            → Ends with their own questions — specific things they can't figure out

            ══════════════════════════════════════════
            【 SPEAKER 2 — EXPERT 1 (first angle) 】
            ══════════════════════════════════════════
            ★ First, genuinely feel the story — "Man, hearing that… I can understand how overwhelming that must feel." Then dig in.
            ★ Explain everything in simple, plain language — like talking to a smart friend, not a client
            ★ Any term the average person might not know — explain it immediately in the same sentence
            ★ Every piece of advice needs a real example — give it a name, a situation, a result — not abstract
            ★ Give both the upside AND the downside — no false hope, real picture

            ══════════════════════════════════════════
            【 SPEAKER 3 — EXPERT 2 (second angle) 】
            ══════════════════════════════════════════
            ★ Bring a completely different angle — do NOT repeat what Expert 1 said
            ★ Surface what people usually miss — hidden costs, emotional toll, long-term consequences
            ★ Use one analogy from everyday life that instantly clicks
            ★ Any term you use — explain it immediately. No bare jargon ever.
            ★ Respectfully push back on Expert 1 where needed — real conversation, not a tag team

            ══════════════════════════════════════════
            STORY ARC:
            ══════════════════════════════════════════
            ACT 1 — Speaker 1's story: Hook → full journey → ONE burning question
            ACT 2 — Experts genuinely react → clarify → start going deep
            ACT 3 — Real back-and-forth: experts challenge each other, Speaker 1 asks follow-up questions
            ENDING — Both experts together give Speaker 1 SPECIFIC numbered actionable steps — actual instructions, not vague suggestions. Script ends here. Nothing after this.

            ══════════════════════════════════════════
            NON-NEGOTIABLE RULES:
            ══════════════════════════════════════════
            ✗ NEVER use any term without immediately explaining it
            ✗ NEVER say "consult a professional" — you ARE the professionals, give actual advice
            ✗ NO surface-level generic advice — go deeper than what anyone already knows
            ✗ NO lecture mode — this is a real conversation
            ✗ Banned phrases: "It's important to note", "In conclusion", "Let's delve into", "I want to emphasize"
            ✓ Every major point = one real example with specific detail
            ✓ Audience should think: "Wait — this is literally my situation"
            ══════════════════════════════════════════
            ${durFillEn}
          `;
          } else {
            prompt = `
              Write a Situational Dilemma style video script on: "${topic}".
              ${specificDetails ? `Situation details: ${specificDetails}` : ''}
              ${durLineEn}
              Language: ${language}. Tone: natural, conversational.

              Characters — exactly 3 (fixed):
              - Narrator: explains the situation/concept at the start only
              - 2 Speakers:
              ${speakers.length >= 2
                ? `Use these names: ${speakers[0]} and ${speakers[1]}.`
                : `Choose 2 people with genuinely different perspectives — who would naturally take opposite sides on this dilemma.`
              }

              ══════════════════════════════════════════
              【 NARRATOR 】
              ══════════════════════════════════════════
              Narrator opens by explaining the situation/dilemma simply in 2–3 lines — end with one clear question that kicks off the debate.
              e.g. "A man took out a loan. The bank deducted money he never owed. Now he has two choices..."
              Or for a concept: "The Trolley Problem — a trolley is headed toward five people..."
              Narrator can also appear mid-debate — to introduce a new angle, shift the direction, or ask a follow-up question.

              ══════════════════════════════════════════
              【 SPEAKERS — DILEMMA DEBATE 】
              ══════════════════════════════════════════
              Both speakers hold genuinely different positions on what to do.
              Real back-and-forth — one speaks, the other challenges.
              Both sides genuinely strong — no obvious winner.
              Closing: each states their final position — audience decides.

              RULES:
              - Natural, human language — no AI-speak
              - Both sides genuinely strong — no obvious winner
              ══════════════════════════════════════════
              ${durFillEn}
            `;
          }
        } else if (style === 'documentary') {
          prompt = `
            Write a Documentary / True Crime style video script on: "${topic}".
            ${specificDetails ? `Case details and context: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}. Tone: serious, gripping, cinematic.

            Characters — exactly 2 speakers:
            ${speakers.length >= 2
              ? `Use these names: ${speakers[0]} and ${speakers[1]}.`
              : `Choose two names that feel like documentary anchors or investigative journalists — fitting the tone and subject of the case.`
            }

            ══════════════════════════════════════════
            【 OPENING — Hook Intro (short, gripping) 】
            ══════════════════════════════════════════
            First 2–3 lines only — tease the case, don't reveal it yet. Make the audience unable to look away:
            e.g. "Today we're talking about a [YEAR] case that..." 
            or: "[Location], [DATE/TIME]... [one chilling detail that raises questions]"
            Tone: documentary filmmaker, not news anchor. Pull them in quietly.

            ══════════════════════════════════════════
            【 STORY — Suspenseful Documentary Unfold 】
            ══════════════════════════════════════════
            → Set the scene: place, time, atmosphere — like a camera is there
            → Reveal the case step by step — don't dump everything at once
            → Build tension with each reveal — cliffhangers that make the audience think "then what?"
            → Both speakers pass the story to each other — like Anchor + Investigative Journalist
            → Present facts cinematically — not dry reading, immersive storytelling

            ══════════════════════════════════════════
            RULES:
            ══════════════════════════════════════════
            ✗ Banned: "This was a shocking incident", "Let us find out", "So folks today"
            ✗ No generic filler — every line must carry weight
            ✓ Suspense first, facts second — draw them in, then reveal
            ✓ Cinematic, immersive — like a Netflix documentary
            ══════════════════════════════════════════
            ${durFillEn}
          `;
        } else if (style === 'finance_deep_dive') {
          if (includeNarrator) {
          prompt = `
            ═══════════════════════════════════════
            STYLE: FINANCE DEEP DIVE — USA FINANCIAL DISCUSSION WITH CALCULATIONS
            This is NOT a general podcast. NOT a situational drama. NOT vague advice.
            Narrator sets a vivid USA financial scenario → 2 finance experts break it down with REAL NUMBERS.
            Every point must have formulas, dollar amounts, year-by-year math. No exceptions.
            ═══════════════════════════════════════
            Topic: "${topic}"
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}
            ${durLineEn}
            Language: Plain American English — like a knowledgeable friend explaining money.
            Target Audience: USA adults making real financial decisions.

            CHARACTERS — exactly 3:
            - Narrator: only for opening and closing — not in the middle
            ${speakers.length >= 3
              ? `- Expert 1: ${speakers[1]} | Expert 2: ${speakers[2]}`
              : `- Expert 1 and Expert 2: pick the two most relevant finance experts for this topic (e.g. CFP + Stock Analyst, or Real Estate Expert + Tax Advisor) — fresh realistic names, different every time`
            }

            ══════════════════════════════════════════
            【 NARRATOR — OPENING (SHOW FORMAT) 】
            ══════════════════════════════════════════
            Narrator opens EXACTLY in this structure:

            Line 1 — name the topic directly:
            "Today we're talking about [TOPIC]."
            (topic first — no warmup, no buildup)

            Line 2-3 — introduce the specific person who asked this question:
            "This question comes from [NAME]. [He/She] lives in [CITY], works as a [JOB], and wants to know — [SPECIFIC QUESTION TIED TO TOPIC]."
            Pick a realistic person — age, job, city, family situation that fits this topic.

            Line 4 — hand off to experts:
            "Joining us today are [Expert 1 name] and [Expert 2 name] — let's hear what they have to say."

            That's it — Narrator does NOT come back in the middle.

            ══════════════════════════════════════════
            【 MAIN DISCUSSION — Both Experts 】
            ══════════════════════════════════════════
            For each key point:
            → Explain from zero — assume the viewer knows nothing
            → Show calculations explicitly — formulas, year-by-year numbers
            → Use specific real examples — actual company names, real events
            → Cover Pros clearly, Cons clearly
            → Both experts naturally agree and push back on each other — real conversation

            Topic-specific coverage:
            • Compounding → A=P(1+r)^n formula, 10/20/30 year comparison, early vs late start
            • Stock → 5-year history, PE ratio, pros/cons, S&P 500 comparison, clear verdict
            • Car → EMI + insurance + maintenance + depreciation = true cost, loan vs cash
            • Home loan → PITI breakdown, 30yr vs 15yr, rent vs buy, 28% rule
            • Any finance topic → break it down to monthly numbers the viewer can feel

            ══════════════════════════════════════════
            【 NARRATOR — CLOSING 】
            ══════════════════════════════════════════
            Both Experts together give a NUMBERED action plan tailored to the scenario.
            Narrator closes with ONE memorable line.

            RULES:
            ✗ "Consult a professional" BANNED
            ✗ Generic advice BANNED — all tied to real numbers
            ✗ Never leave jargon unexplained — define every term immediately
            ✓ Every calculation shown step by step
            ✓ Plain English — expert thinking, friend-level language
            ${durFillEn}
          `;
          } else {
          prompt = `
            ═══════════════════════════════════════
            STYLE: FINANCE DEEP DIVE — SITUATIONAL (NO NARRATOR)
            This is NOT general situational drama. This is FINANCE-specific.
            A regular American shares their real financial problem → 2 finance experts help with ACTUAL MATH.
            Every claim must have numbers — no vague statements ever.
            ═══════════════════════════════════════
            Topic: "${topic}"
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}
            ${durLineEn}
            Language: Plain American English — like a knowledgeable friend explaining money.
            Target Audience: USA adults making real financial decisions.

            CHARACTERS — exactly 3:
            ${speakers.length >= 3
              ? `- Normal Person: ${speakers[0]} | Expert 1: ${speakers[1]} | Expert 2: ${speakers[2]}`
              : `- Speaker 1: a regular American dealing with this exact financial topic — pick a realistic age, job, city, and family situation that fits
            - Speaker 2 and 3: the two most relevant finance experts for this topic — fresh realistic names, different every time`
            }

            ══════════════════════════════════════════
            【 SPEAKER 1 — NORMAL PERSON (opening) 】
            ══════════════════════════════════════════
            Introduces themselves directly:
            "My name is [name]. I live in [city]. I work as a [job] making $[salary]/year."
            Then shares their real financial situation in detail — what happened, how it got complicated, where they are now.
            Ends with specific questions they cannot figure out on their own.

            ══════════════════════════════════════════
            【 EXPERTS — Deep Dive 】
            ══════════════════════════════════════════
            Expert 1 genuinely reacts to the story first — then digs in with their angle.
            Expert 2 brings a completely different angle — does NOT repeat Expert 1.

            For each key point:
            → Explain from zero — assume the viewer knows nothing
            → Show calculations explicitly — formulas, year-by-year numbers
            → Use specific real examples — actual company names, real events
            → Cover Pros clearly, Cons clearly
            → Both experts respectfully disagree where needed — real conversation

            Topic-specific coverage:
            • Compounding → A=P(1+r)^n formula, 10/20/30 year comparison, early vs late start
            • Stock → 5-year history, PE ratio, pros/cons, S&P 500 comparison, clear verdict
            • Car → EMI + insurance + maintenance + depreciation = true cost, loan vs cash
            • Home loan → PITI breakdown, 30yr vs 15yr, rent vs buy, 28% rule
            • Any finance topic → break it down to monthly numbers the viewer can feel

            Speaker 1 asks follow-up questions mid-discussion — natural back-and-forth.

            ══════════════════════════════════════════
            【 CLOSING 】
            ══════════════════════════════════════════
            Both Experts together give Speaker 1 a NUMBERED action plan.
            Actual steps — specific amounts, timelines, order of priority.

            RULES:
            ✗ "Consult a professional" BANNED — you ARE the professionals, give real advice
            ✗ Generic advice BANNED — all tied to real numbers
            ✗ Never leave jargon unexplained — define every term immediately
            ✓ Every calculation shown step by step
            ✓ Plain English — expert thinking, friend-level language
            ${durFillEn}
          `;
          }
        } else if (style === 'podcast_panel') {
          const podcastSpeakerRule = speakers.length > 0
            ? `Use these speaker names: ${speakers.join(", ")} for the two guests. The host/narrator is always "Narrator".`
            : `Generate two creative, topic-appropriate guest names that sound like real people — relevant to the podcast's subject matter (e.g. a philosopher, scientist, journalist, entrepreneur, historian — whoever fits the topic). DO NOT use names from the transcript. DO NOT use generic names like "Speaker A/B", "Alex", "Sam", "Host", or "Guest".`;

          if (commentsFileContent) {
            prompt = `
            ⚠️ MANDATORY RULE — READ THIS FIRST:
            The Narrator MUST speak before EVERY single claim. There must be NO claim where Narrator is absent. If Narrator is missing before any claim, the script is considered invalid.

            Your task: Analyze the transcript/context AND the audience comments below, then write a Joe Rogan-style conversational podcast script.

            ${specificDetails ? `Specific Details/Context: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}.

            **STEP 1 — LIST EVERY CLAIM/POINT FROM THE VIDEO:**
            Read the full transcript carefully. List every claim, idea, fact, or point made — one by one.
            Identify each as a clear, distinct claim. Do NOT miss any.

            **STEP 2 — FILTER THE COMMENTS:**
            Pick only comments that are genuinely insightful, sharp, or funny.
            Ignore spam and irrelevant noise.

            **STEP 3 — WRITE THE SCRIPT:**

            Characters — exactly 3:
            ${podcastSpeakerRule}

            **Speaker Roles:**

            【 NARRATOR 】
            The Narrator's job: take what the video/podcast actually said and explain it in their own words — clearly and properly, like explaining to a friend. Then ask a question.
            ⚠️ Do NOT add outside knowledge, analysis, or opinions. Only explain what the video/podcast said — but do it properly, in natural conversational sentences.
            2-3 natural sentences: what the video/podcast is saying — clearly — then a sharp question to Speaker A.
            No welcome, no show intro. Just explain the point well, then hand over.

            【 SPEAKER A 】
            ⚠️ DO NOT repeat or rephrase what the Narrator just said. That claim has already been stated.
            Bring your OWN knowledge — real facts, data, core concepts, or angles that were NOT in the video. Add genuine value.

            【 SPEAKER B 】
            ⚠️ DO NOT repeat what Speaker A just said.
            Push forward with facts + logic. If you agree, bring new data. If you disagree, give real reasoning — not just "the document says otherwise."

            ══════════════════════════════════════
            FLOW FOR EVERY POINT:
            ══════════════════════════════════════

            1. Narrator — 3-4 sentences: explain the point properly + context + question to Speaker A
            2. Speaker A — ORIGINAL knowledge/analysis (ADD to what Narrator said, don't repeat it)
            3. Speaker B — new angle, fact, or logic (no repetition)
            4. 1-2 natural exchanges
            5. Narrator — next point (same proper setup). Repeat.

            Cover ALL extracted points. End with Narrator's Key Takeaways (3-4 lines).

            JSON output pattern:
            [
              {"speaker": "Narrator", "text": "First up — in the video they said [simple summary]. [Speaker A name], what do you make of that?"},
              {"speaker": "[Speaker A name]", "text": "..."},
              {"speaker": "[Speaker B name]", "text": "..."},
              {"speaker": "[Speaker A name]", "text": "..."},
              {"speaker": "Narrator", "text": "Next up — they also said [simple summary]. [Speaker A name], thoughts?"},
              {"speaker": "[Speaker A name]", "text": "..."},
              {"speaker": "[Speaker B name]", "text": "..."}
            ]
            Narrator comes before every point — that flow stays consistent.
          `;
          } else {
            prompt = `
            Narrator speaks before every point — this flow stays consistent throughout.

            Your task: Analyze the transcript/context below and write a Joe Rogan-style conversational podcast script.

            ${specificDetails ? `Specific Details/Context: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}.

            ══════════════════════════════════════
            STEP 1 — LIST EVERY CLAIM FROM THE VIDEO
            ══════════════════════════════════════
            Read the full transcript carefully.
            List every claim, idea, fact, or point made — one by one, clearly identified.
            Do NOT miss any.

            ══════════════════════════════════════
            STEP 2 — WRITE THE SCRIPT
            ══════════════════════════════════════

            Characters — exactly 3:
            ${podcastSpeakerRule}

            **Speaker Roles:**

            【 NARRATOR (host) 】
            Moves the podcast forward. For every point:
              1. Briefly summarizes what the video/podcast said (1-2 sentences, in their own words)
              2. Asks a natural, thought-provoking question to Speaker A
            Narrator only passes the baton — no analysis of their own.

            【 SPEAKER A 】
            Shares their genuine take on this specific point — whatever is naturally relevant to it.
            No formula, no checklist. Just an honest, informed response to what's actually being discussed.
            Simple language, deep knowledge.

            【 SPEAKER B 】
            Grounds the discussion in facts and logic — clear reasoning, real examples, concrete illustrations.
            Explains the point through specific examples that make it tangible and easy to understand.
            Extends what Speaker A said — together they build the full picture.
            Simple language, grounded in facts.

            ══════════════════════════════════════
            FLOW FOR EVERY POINT:
            ══════════════════════════════════════

            1. Narrator — short summary of what the video/podcast said + question to Speaker A
            2. Speaker A — their natural take on that specific point
            3. Speaker B — facts, logic, and real examples that make the point concrete and clear
            4. Natural back-and-forth (1-2 exchanges)
            5. Narrator — next point. Repeat.

            Cover ALL extracted points. End with Narrator's Key Takeaways (3-4 lines).

            JSON output pattern:
            [
              {"speaker": "Narrator", "text": "First up — in the video they said [simple summary]. [Speaker A name], what do you make of that?"},
              {"speaker": "[Speaker A name]", "text": "..."},
              {"speaker": "[Speaker B name]", "text": "..."},
              {"speaker": "[Speaker A name]", "text": "..."},
              {"speaker": "Narrator", "text": "Next up — they also said [simple summary]. [Speaker A name], thoughts?"},
              {"speaker": "[Speaker A name]", "text": "..."},
              {"speaker": "[Speaker B name]", "text": "..."}
            ]
            Narrator comes before every point — that flow stays consistent.
          `;
          }
        } else if (style === 'context_bridge') {
          const cbSpeakerEn = speakers.length > 0 ? speakers[0] : null;
          prompt = `
            Topic: "${topic}"
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}

            You are an experienced, well-read analyst — like a sharp journalist or researcher who deeply knows this subject. You speak in an interesting, engaging way and sound professional, but never boring. Every point you add should make the listener think "I didn't know that."

            Your PRIMARY job: catch every moment in the transcript where something was left incomplete, a name was forgotten, a reference was dropped without explanation, or something genuinely interesting was glossed over — then fill that gap in a way that makes the listener think: "I didn't know that, and that's actually fascinating."

            Read the transcript and speak up in these four situations:

            1. **Gap Fill / Forgotten Reference** (MOST IMPORTANT) — the speaker left something incomplete, forgot a name, or said something like "that thing, what's it called..." — you jump in immediately, give the correct name/term, and then add an interesting fact about it that the listener probably doesn't know.
               Example: If a guest says "that dangerous drug they show in Breaking Bad, I'm blanking on the name" — you say: "That's Methamphetamine — known on the street as Meth. In Breaking Bad, Walter White cooks it in a desert lab, but in real life it works by flooding the brain's dopamine system so aggressively that addiction can begin after a single use. In 2022, Meth was responsible for over 32,000 deaths in the US — second only to opioids."

            2. **Context / Concept** — a term, person, event, or reference appears without explanation. Explain it simply but intelligently — not just the definition, but the real-world significance and why it matters. Use Google Search for accurate facts.
               Example: "They mentioned 'Quantitative Easing' — this is the tool central banks reach for when standard monetary policy stops working. In plain terms: they create money and inject it directly into financial markets. After the 2008 crisis, the Fed pumped over $4 trillion this way — which stabilized markets, but also widened wealth inequality."

            3. **Fact / Correction** — something stated is wrong, exaggerated, or missing critical context. Use Google Search to get the verified number, correct it, and explain why the gap actually matters.
               Example: "That 4,000 figure they cited — the WHO's 2023 report puts the actual number at 1,247. That difference matters because it directly determines how much health funding governments allocate."

            4. **Analyst's take** — you have a sharp, Google Search-backed perspective on this specific point that the video missed entirely.
               Example: "This claim sounds convincing, but there's a core problem — if it had actually happened, there would be independent verifiable records. No credible source has corroborated it to date."

            Tone rules:
            - Professional and knowledgeable — like a well-read journalist or researcher
            - Every point needs a hook — something the listener will remember, not just dry facts
            - On gap fills, be confident and direct — "That's X" — no hedging
            - Use Google Search actively — real numbers, real events, real sources
            - 2-4 sentences max, focused and sharp
            - Every segment must tie to a SPECIFIC moment in the transcript

            Character: Exactly 1 speaker.
            ${cbSpeakerEn ? `Speaker name: "${cbSpeakerEn}"` : 'Choose a fitting name for the topic.'}

            "sourceTimestamp" — the position of that moment in the transcript, in "M:SS" format (e.g. "1:01")

            Language: ${language}

            JSON output:
            [
              {"speaker": "[Name]", "text": "...", "sourceTimestamp": "1:01"},
              {"speaker": "[Name]", "text": "...", "sourceTimestamp": "2:10"}
            ]
          `;
        } else if (style === 'podcast_breakdown' || youtubeUrl) {
          prompt = `
            You are creating a podcast breakdown script on: "${topic}".
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}.

            Characters:
            - Narrator — only for introducing each point and closing the episode
            - Speaker A and Speaker B — two knowledgeable analysts who bring their OWN analysis, not transcript repetition
            ${speakers.length > 0 ? `Names: ${speakers.join(", ")}` : `Choose fitting names for the topic.`}

            STEP 1 — Analyze the transcript first:
            Read through all the provided transcript/context and extract the KEY POINTS discussed — claims, facts, revelations, arguments. The script will be built around these points.

            STEP 2 — Script structure (repeat this pattern for every key point):

            **Narrator** → No intro, no welcome, no show name. Jump straight to the first point — state the core claim from the podcast clearly, then ask a sharp question to Speaker A.
            Example: "In the podcast, it was claimed that 8,000 gallons of sulfuric acid were ordered after the arrest. [Speaker A], what do you make of that?"

            **Speaker A** → Gives their own ANALYSIS on this claim — explains the core concept, brings in relevant data and facts, shares an informed perspective. Does NOT repeat the transcript.

            **Speaker B** → Either supports with a new angle, or challenges. If challenging — uses BOTH FACTS and LOGIC.

            ⚠️ CRITICAL RULE — Logic + Facts, never just documents:
            If challenging a claim, "the document says X" is NOT sufficient on its own.
            Think like a human: nobody writes their illegal intentions in official documents. If someone orders acid to dissolve a body, the purchase order will say "for cleaning" — that's how cover stories work. An official document's stated reason is NOT proof the real intent was innocent.
            When challenging, argue from: circumstantial evidence, logical inconsistency, behavioral patterns, timeline mismatches, or what makes sense given the known context. Never dismiss a claim purely because an official record says otherwise.

            Continue this pattern across all major points from the source material.

            **Narrator at the end** → A sharp 2-3 line conclusion — what is the real takeaway from this podcast?

            Tone & Language:
            - Natural, conversational — like real people actually talking
            - Speaker A and B should have distinct personalities — one more skeptical, one more analytical
            - Never repeat the source material word-for-word — always add value and perspective
            - The entire script MUST be in ${language}

            ⚠️ STRICT WORD BAN: The word "transcript" must NEVER appear anywhere in the generated script.
            Use instead: "in the video", "in the clip", "in the podcast", "they said", "it was mentioned in the show"

            JSON output pattern (follow this format exactly):
            [
              {"speaker": "Narrator", "text": "First up — in the video they said [claim]. [Speaker A name], what do you make of that?"},
              {"speaker": "[Speaker A name]", "text": "[own analysis, NOT repeating the source material]"},
              {"speaker": "[Speaker B name]", "text": "[support or challenge — using both facts AND logic]"},
              {"speaker": "Narrator", "text": "Next — [claim]. [Speaker A name], thoughts?"},
              {"speaker": "[Speaker A name]", "text": "..."},
              {"speaker": "[Speaker B name]", "text": "..."}
            ]
            ⚠️ Narrator's first line — NO welcome, NO show name. Start directly with "First up —"
          `;
        } else if (style === 'debate') {
          if (includeNarrator) {
            prompt = `
              Write a Debate style video script on the topic: "${topic}".
              ${specificDetails ? `Additional context: ${specificDetails}` : ''}
              ${durLineEn}
              Language: ${language}.

              Characters:
              - Narrator: one (always labeled "Narrator")
              - ${speakerCount} speakers (two opposing sides): ${speakers.length > 0 ? speakers.join(", ") : `Choose fresh, topic-appropriate names — never reuse the same names across topics. If the topic is about a specific public figure, use their name; if it's a concept debate, create believable names that fit the side they represent. Avoid generic or repetitive names.`}

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              OPENING — NARRATOR (3 lines max):
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              Cover these 3 things clearly — in your own wording:
              1. State the topic directly by name.
              2. Introduce both debaters with their name AND their exact position/side — e.g. "X, who supports [position], and Y, who argues for [position]."
              3. One sharp, direct debate question to kick things off.
              That's it. No extra build-up. Debate begins.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              DEBATE BODY:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              Both speakers argue like genuine experts — but in simple, clear language anyone can follow.

              Every argument must be built like this:
              → Start from the basics of their position — don't assume the audience already knows the context
              → Add logical reasoning — support with real facts, examples, or analogies
              → Directly counter the other side's argument — on logical grounds, not emotional
              → Arguments must be deep and well-reasoned — not surface-level assertions

              Narrator's flexibility:
              → Narrator is NOT limited to only the opening and closing
              → When important context, a key fact, or a clarification would genuinely strengthen the debate, Narrator can step in
              → But sparingly — don't interrupt the natural flow of the argument

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              CLOSING — NARRATOR:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              - Capture each side's core argument in one line
              - Leave the audience to decide — a thought-provoking final question or statement

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              RULES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ✓ Both sides genuinely strong — no strawmanning either side
              ✓ Expert-level thinking, simple language — like a knowledgeable person arguing in real life
              ✓ Support arguments with real examples, analogies, or facts
              ✗ BANNED: Generic filler — "It's important to note", "In conclusion", "Let's delve into"
              ✗ BANNED: One side being obviously weaker than the other
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ${durFillEn}
            `;
          } else {
            prompt = `
              Write a Debate style video script on the topic: "${topic}".
              ${specificDetails ? `Additional context: ${specificDetails}` : ''}
              ${durLineEn}
              Language: ${language}.

              Characters — exactly ${speakerCount} speakers (no Narrator):
              ${speakers.length > 0 ? `Use these names: ${speakers.join(", ")}.` : `Choose fresh names relevant to this specific topic — never repeat the same names. No generic placeholder names. Each name should feel like it belongs to someone who would genuinely hold that side's position.`}

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              OPENING — Speaker A (3 lines max):
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              Cover these 3 things clearly — in your own wording:
              1. State the topic directly by name.
              2. Introduce yourself with your position/side, and your opponent with their position/side — clearly stated.
              3. Throw one sharp debate question at your opponent.
              That's it. Speaker B responds immediately.

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              DEBATE BODY:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              Both speakers argue like genuine experts — but in simple, clear language anyone can follow.

              Every argument must be built like this:
              → Start from the basics of their position — don't assume the audience already knows the context
              → Add logical reasoning — support with real facts, examples, or analogies
              → Directly counter the other side's argument — on logical grounds, not emotional
              → Arguments must be deep and well-reasoned — not surface-level assertions

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              CLOSING:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              - Each speaker states their final position — confident, sharp, no new arguments
              - No resolution — audience decides

              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              RULES:
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ✓ Both sides equally strong — no strawmanning either side
              ✓ Expert-level thinking, simple language — like a knowledgeable person arguing in real life
              ✓ Support arguments with real examples, analogies, or facts
              ✗ BANNED: Generic filler — "It's important to note", "In conclusion", "Let's delve into"
              ✗ BANNED: One side being obviously weaker than the other
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              ${durFillEn}
            `;
          }
        } else if (style === 'joe_rogan') {
          const guest = speakers.length >= 2 ? speakers[1] : (speakers[0] && speakers[0] !== 'Joe Rogan' ? speakers[0] : 'Elon Musk');
          prompt = `
            You are writing a script for a Joe Rogan Experience (JRE) podcast episode.
            ${specificDetails ? `Additional context: ${specificDetails}` : ''}
            ${durLineEn}
            Language: ${language}.

            There are EXACTLY 2 speakers:
            - Joe Rogan (Host) — curious, direct, occasionally challenges the guest, uses phrases like "bro", "that's insane", "a hundred percent", "for real though", "is that from a study?", "pull that up Jamie", "i think there's something to that", "powerful"
            - ${guest} (Guest) — use their ACTUAL known views, controversies, achievements, and personality for authentic dialogue

            ══════════════════════════════════════════
            EPISODE STRUCTURE (follow in exact order):
            ══════════════════════════════════════════

            【 1. Joe's Opening — Guest Introduction 】
            Joe opens in his classic JRE style:
            - Brief casual show intro (no stiff formal intro — just Joe being Joe)
            - Warm, genuine intro of ${guest}: who they are, why they're famous/controversial, 1-2 known facts that set up the conversation
            - Hint at today's topic: "We're gonna get into [topic] today..."
            - End opening with a sharp, open-ended first question to kick off the conversation
            Example tone: "Man, I've been wanting to have you on for a while. I've heard a lot about [fact/controversy]. So tell me — what actually happened?"

            【 2. Main Conversation (80% of the episode) 】
            Free-flowing, long-form conversation — NOT a structured debate:
            - ${guest} gives detailed, thoughtful, authentic answers (based on their REAL known views and statements)
            - Joe asks curious follow-up questions, goes down interesting tangents
            - Joe occasionally pushes back gently — challenges but stays genuinely curious
            - Mix in: personal stories, controversies, behind-the-scenes moments, philosophy, science, life advice
            - Let the conversation breathe — real conversations drift off-topic and come back
            - Mix in authentic Joe expressions: "That's insane bro", "Is that from a study?", "A hundred percent", "Pull that up", "For real though", "I think there's something to that", "Powerful", "That makes sense actually", "Dude", "No way"

            【 3. Closing 】
            - Joe wraps up naturally — no forced summary
            - Where to find the guest (socials, company, book, etc.)
            - Joe's final genuine thought — appreciative, real

            ══════════════════════════════════════════
            TONE RULES (strictly follow):
            ══════════════════════════════════════════
            - 100% natural banter — like two people who are genuinely interested in each other
            - Use ${guest}'s ACTUAL known views, quotes, and controversial positions — not generic filler
            - Tangents are welcome — real conversations naturally drift
            - Banned phrases: "It's important to note", "In conclusion", "This is significant", "Let's delve into", "Furthermore"
            - The guest should sound EXACTLY like ${guest} — their specific communication style, known opinions, vocabulary
            ${durFillEn}

            Topic for today's episode: "${topic}"
          `;
        } else {
          prompt = `
            Generate a script for a ${style} on the topic: "${topic}".
            ${durLineEn}
            Language: ${language}.
            
            Characters:
            Create or use ${speakerCount} distinct speakers.
            ${speakers.length > 0 ? `Use these names: ${speakers.join(", ")}.` : `Auto-detect appropriate names/personas for the topic.`}
            
            Structure & Flow:
            1. ${includeNarrator ? narratorIntro : `Start with an introduction that explains the topic/case simply, poses the central question, and introduces the speakers.`}
            2. Speakers debate and discuss from their respective sides.
            3. Maintain a natural, engaging flow.
            4. ${includeNarrator ? "Narrator provides a brief conclusion at the very end." : ""}
            5. Ensure equal participation from all ${speakerCount} speakers.
            6. The entire script MUST be in ${language}.
            
            Tone & Language:
            - Use highly natural, conversational, and human-like language.
            - Avoid robotic, overly formal, or cliché AI phrases (like "In conclusion", "It's important to note", "Let's delve into").
            - Use contractions, natural pauses, colloquialisms, and conversational filler where appropriate to make it sound like real people talking.
            - Show emotion, personality, and natural reactions.
            
            ${durFillEn}
          `;
        }
      }
  }

  if (specificDetails) {
    prompt += `
      
      SPECIFIC DETAILS / CONTEXT TO INCLUDE:
      Ensure the following details, instructions, or context are incorporated into the script:
      ---
      ${specificDetails}
      ---
    `;
  }

  if (contextFileContent) {
    prompt += `
      
      CONTEXT / RESEARCH MATERIAL:
      The following content is provided as the primary source material, background research, or transcript. 
      CRITICAL INSTRUCTION: You MUST base your script heavily on this provided content. Extract specific claims, quotes, facts, or points from this text and explicitly address them in the script. Do not generate a generic script; it must be deeply tied to this specific material.
      ---
      ${contextFileContent}
      ---
    `;
  }

  if (commentsFileContent && style !== 'podcast_panel') {
    prompt += `
      
      AUDIENCE COMMENTS & COMMUNITY INSIGHTS:
      The following are top comments from the audience/community on this podcast or video. These represent real people's logical criticisms, counter-arguments, additional context, and insights that they raised after engaging with the original content.
      
      CRITICAL INSTRUCTION — HOW TO USE THESE COMMENTS:
      1. DO NOT quote these comments directly or say "a commenter said..." or "someone in the comments mentioned...".
      2. Instead, identify the most insightful, logical, and context-adding points from the comments.
      3. Naturally weave these perspectives into the speakers' dialogue as if the speakers themselves organically arrived at these insights or counter-points during the discussion.
      4. For example: if a comment points out a flaw in an argument, have one of the speakers raise that exact flaw as their own critical thinking.
      5. If a comment adds important context (e.g., "this only works in X country" or "they forgot to mention Y"), incorporate that nuance into the conversation naturally.
      6. The goal is to make the script RICHER and more intellectually honest by including the community's collective critical intelligence — but seamlessly, as part of the natural flow of discussion.
      
      Comments:
      ---
      ${commentsFileContent}
      ---
    `;
  }

  if (commentsFileContent && style === 'podcast_panel') {
    prompt += `
      
      AUDIENCE COMMENTS (for Joe Rogan Style 2):
      ---
      ${commentsFileContent}
      ---
    `;
  }

  if (youtubeUrl) {
    prompt += `
      
      YOUTUBE VIDEO CONTEXT:
      Analyze the content of this YouTube video: ${youtubeUrl}
      Extract the key points, arguments, and facts directly from this video to inform the debate.
    `;
  }

  if (style === 'context_bridge') {
    prompt += `
      Return a JSON array where each object has:
      - 'speaker': The analyst's name.
      - 'text': The context explanation for that moment (2-4 sentences, factually grounded).
      - 'sourceTimestamp': The approximate timestamp in the source video/transcript where this context is relevant (format: "M:SS" e.g. "1:23").
      - 'scores': [] (empty array)
      - 'averageScore': 0
    `;
  } else {
    prompt += `
      Return a JSON array where each object has:
      - 'speaker': The name of the speaker (e.g. 'Narrator', or one of the generated/provided names).
      - 'text': The spoken text for that segment.
      - 'scores': An array of objects with 'model' (string) and 'score' (number 1-10) representing how different AI models might rate this argument. Models: ['Grok', 'DeepSeek', 'ChatGPT', 'Gemini', 'Claude'].
      - 'averageScore': The average of the scores (number).
    `;
  }

  // customScript just needs speaker detection — use pro model, no grounding needed
  const effectiveModel = customScript ? 'gemini-3.1-pro-preview' : model;

  const tools: any[] = [{ googleSearch: {} }];
  if (youtubeUrl) {
    tools.push({ urlContext: {} });
  }

  // Only use googleSearch grounding for models that support it without breaking text extraction
  // Disable grounding for customScript — web search is irrelevant when user already has the script
  const supportsGrounding = !customScript && (model.includes('2.5') || model.includes('1.5') || model.includes('3.'));
  const finalTools = supportsGrounding ? tools : [];

  try {
    const response = await ai.models.generateContent({
      model: effectiveModel,
      contents: { parts: [{ text: prompt }] },
      config: {
        ...(finalTools.length > 0 ? { tools: finalTools } : {}),
      }
    });

    // Robustly extract text — response.text fails when model uses grounding/tools
    let jsonText = response.text ?? "";
    if (!jsonText) {
      // Try candidates → parts fallback
      const parts = (response as any)?.candidates?.[0]?.content?.parts ?? [];
      jsonText = parts.map((p: any) => p.text ?? "").join("").trim();
    }
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    if (!jsonText) throw new Error("Script generate nahi hua — Dobara try karo ya alag model chunein.");
    let rawSegments: any[];

    const tryParseScript = (raw: string): any[] => {
      // Pass 1: direct parse
      try { return JSON.parse(raw); } catch {}

      // Pass 2: extract outermost [...] block
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try { return JSON.parse(arrMatch[0]); } catch {}

        // Pass 3: clean control chars inside string values, then parse
        const cleaned = arrMatch[0]
          .replace(/[\u0000-\u001F\u007F]/g, ch => {
            // Keep allowed escape sequences, remove the rest
            if (ch === '\n') return '\\n';
            if (ch === '\r') return '\\r';
            if (ch === '\t') return '\\t';
            return '';
          });
        try { return JSON.parse(cleaned); } catch {}

        // Pass 4: extract individual {...} objects and build array manually
        const objects: any[] = [];
        const objRegex = /\{[^{}]*\}/g;
        let m;
        while ((m = objRegex.exec(arrMatch[0])) !== null) {
          try { objects.push(JSON.parse(m[0])); } catch {}
        }
        if (objects.length > 0) return objects;
      }

      throw new Error("Script JSON parse nahi hua — Dobara try karo.");
    };

    try {
      rawSegments = tryParseScript(jsonText);
    } catch (parseErr: any) {
      throw new Error(parseErr.message || "Could not parse script response as JSON array");
    }
    
    return rawSegments.map((seg: any, index: number) => ({
      id: `seg-${index}`,
      speaker: seg.speaker,
      text: seg.text,
      scores: seg.scores,
      averageScore: seg.averageScore,
      ...(seg.sourceTimestamp !== undefined && { sourceTimestamp: seg.sourceTimestamp }),
    }));
  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429) {
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
    }
    console.error("Error in generateDebateScript:", error);
    throw error;
  }
};

export const detectSpeakers = async (topic: string, count: number = 2): Promise<string[]> => {
  const ai = getAi();

  const prompt = `
    Analyze the debate topic: "${topic}".
    Identify ${count} distinct opposing characters, personas, or specific people best suited to debate this.
    
    Rules:
    1. If the topic mentions names (e.g. "Trump vs Xi Jinping"), use them.
    2. If the topic is abstract (e.g. "AI Safety"), create representative personas (e.g. "AI Optimist", "AI Skeptic").
    3. Return ONLY a JSON object with a "speakers" array of strings.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            speakers: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
          },
          required: ["speakers"],
        },
      },
    });

    let jsonText = response.text;
    if (!jsonText) return Array.from({length: count}, (_, i) => `Speaker ${i+1}`);
    
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonText);
    return result.speakers || Array.from({length: count}, (_, i) => `Speaker ${i+1}`);
  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429) {
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
    }
    console.error("Error in detectSpeakers:", error);
    throw error;
  }
};

export const rewriteScriptSegment = async (
  text: string,
  speaker: string,
  instruction: string = "Make it more persuasive and engaging."
): Promise<string> => {
  const ai = getAi();

  const prompt = `
    Rewrite the following debate script segment spoken by "${speaker}".
    
    Current Text: "${text}"
    
    Instruction: ${instruction}
    
    Guidelines:
    1. Maintain the persona and voice of ${speaker}.
    2. Keep the length appropriate for a spoken segment unless instructed otherwise.
    3. Ensure the tone fits the context of the debate/discussion.
    
    Return ONLY the rewritten text. Do not include quotes, markdown, or explanations.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts: [{ text: prompt }] },
    });

    return response.text?.trim() || text;
  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429) {
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
    }
    console.error("Error in rewriteScriptSegment:", error);
    throw error;
  }
};

export const generateSpeech = async (text: string, voiceName: string): Promise<{ audioUrl: string, duration: number }> => {
  const ai = getAi();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: { parts: [{ text }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Failed to generate speech");

    // Convert base64 to Blob URL
    const binaryString = window.atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // The Gemini TTS API returns raw PCM data (16-bit, 24kHz, mono) by default.
    // We need to wrap it in a WAV header for the browser to play it.
    
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = bytes.length;
    const chunkSize = 36 + dataSize;
    
    const wavBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(wavBuffer);
    
    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, chunkSize, true);
    writeString(view, 8, 'WAVE');
    
    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write PCM data
    const pcmData = new Uint8Array(wavBuffer, 44);
    pcmData.set(bytes);

    const blob = new Blob([wavBuffer], { type: 'audio/wav' }); 
    const url = URL.createObjectURL(blob);

    // Calculate duration in seconds
    const duration = dataSize / byteRate;

    return { audioUrl: url, duration }; 
  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429) {
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
    }
    console.error("Error in generateSpeech:", error);
    throw error;
  }
};

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const fileToBase64 = (file: File): Promise<string> => {
  return blobToBase64(file);
};

// ── Thumbnail generation — ported from the sister "PodcastFlux" thumbnail
// system: one universal style (no per-video-style branching), a real curated
// thumbnail picked as a visual STYLE reference (best match to the topic, not
// purely random), and an optional real face photo swapped in as the main
// subject. ──

const BASE_THUMB = 'Design a top-tier, agency-grade, scroll-stopping YouTube thumbnail in 16:9 landscape — match the production quality, polish and click-worthiness of the best viral thumbnails from the biggest creators. Unless a specific art style is explicitly requested, lean photorealistic and lifelike — real-camera depth of field, natural skin texture, and a sharp, detailed, expressive face with realistic lighting. Compose it in whatever way best suits the topic — a bold real scene, a dramatic environment, or a clean backdrop — with a strong, clear focal point and real depth; just avoid random, meaningless clutter. Depict the subject and topic accurately. Use dramatic lighting, punchy vibrant colors and strong contrast so it pops even at small sizes. Render at high fidelity — crisp, detailed and clean, with no blur, noise, artifacts, warping or distorted anatomy. Do not add extra text, letters, captions, subtitles, watermarks or gibberish beyond any text that is explicitly requested.';

const TOPIC_HINTS: { re: RegExp; hint: string }[] = [
  { re: /\b(game|gaming|gameplay|minecraft|fortnite|gta|valorant|fps|roblox|pubg|bgmi)\b/i, hint: 'High-energy gaming look: vivid neon accents, glowing effects, dynamic action framing.' },
  { re: /\b(money|rich|income|invest|stock|crypto|bitcoin|business|profit|millionaire|earn)\b/i, hint: 'Wealth/finance look: gold and deep-green tones, cash/upward-arrow motifs, confident expression.' },
  { re: /\b(tech|iphone|android|gadget|ai|coding|developer|laptop|pc|review|unbox)\b/i, hint: 'Clean modern tech look: sleek gradients, cool blue/purple accents, crisp product focus.' },
  { re: /\b(fitness|gym|workout|muscle|bodybuild|weight ?loss|diet|abs)\b/i, hint: 'Fitness look: strong dramatic rim lighting, energetic pose, bold red/orange accents.' },
  { re: /\b(food|recipe|cook|cooking|eat|mukbang|kitchen|restaurant)\b/i, hint: 'Mouth-watering food look: warm appetizing light, tight close-up, glossy vivid colors.' },
  { re: /\b(travel|trip|tour|country|city|adventure|explore|journey|vlog)\b/i, hint: 'Travel look: stunning scenic backdrop, warm golden-hour light, sense of wonder.' },
  { re: /\b(horror|scary|ghost|haunted|creepy|nightmare|paranormal)\b/i, hint: 'Dark suspenseful horror look: moody shadows, cold eerie lighting, high tension.' },
  { re: /\b(kids|cartoon|toy|family|nursery|fun)\b/i, hint: 'Playful colorful look: bright cheerful palette, fun exaggerated expressions.' },
  { re: /\b(story|storytime|drama|exposed|expose|truth|shocking|secret|reaction)\b/i, hint: 'Dramatic storytelling look: expressive shocked face, bold arrows/circles highlighting the key element.' },
  { re: /\b(tutorial|how to|guide|learn|course|tips|hack)\b/i, hint: 'Clear educational look: clean layout, numbered/step feel, confident presenter, legible callouts.' },
];
const topicDirective = (topic: string): string => {
  const t = topic.trim();
  if (!t) return '';
  const hit = TOPIC_HINTS.find(h => h.re.test(t));
  return hit ? `${hit.hint} ` : '';
};

const textDirective = (t: string): string => {
  const raw = t.trim();
  if (!raw) {
    return 'Do NOT render any text, words, letters, captions, labels, numbers or watermarks anywhere on the image — keep it completely clean and text-free.';
  }
  const long = raw.split(/\s+/).length > 5;
  const hook = long
    ? `distill the idea into a punchy 2-4 word hook (do NOT paste the whole sentence)`
    : `use it exactly as "${raw}"`;
  return `Overlay ONE bold, chunky, EXTRA-LARGE uppercase title text — ${hook}. The text color MUST be pure white with a thick solid black outline and a strong drop shadow for maximum contrast. Place it clear of the subject's face and keep it to at most one third of the frame. Render ONLY this single piece of text — absolutely no other words, duplicate captions, subtitles, stray letters or gibberish anywhere else on the image.`;
};

// Cheap LLM pass producing a vivid, camera-real scene-concept for the
// thumbnail — only runs when the caller hasn't already supplied one (e.g.
// the Combo's auto-filled "description", or hand-typed by the user).
const generateThumbnailConcept = async (scriptText: string, topicName: string, title: string): Promise<string> => {
  const ai = getAi();
  const prompt = `You are a YouTube thumbnail art director. Read the context below and write ONE vivid, camera-real scene-concept for a thumbnail — who/what is in it, their expression, and the setting. 2-3 sentences, no bullet points, no JSON, plain English.

TITLE / HOOK: "${title}"
${topicName ? `TOPIC: ${topicName}\n` : ''}SCRIPT CONTEXT (first 2000 chars):
${scriptText.slice(0, 2000)}`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return response.text?.trim() || '';
  } catch {
    return '';
  }
};

// Style reference pick — a random curated thumbnail from the local bundled
// set (see styleRefClient.ts). topicQuery is unused now that matching is
// purely local, kept so callers don't need to change.
const pickBestStyleReference = async (_topicQuery: string): Promise<{ data: string; mimeType: string } | null> =>
  await fetchRandomStyleReference();

export const generateThumbnail = async (
  title: string,
  extraInstructions: string | undefined,
  faceImage: { data: string; mimeType: string } | undefined,
  onStep: ((step: 'inspecting' | 'analyzing' | 'generating') => void) | undefined,
  scriptText: string,
  topicName: string,
): Promise<string> => {
  const ai = getAi();

  onStep?.('analyzing');
  const concept = extraInstructions?.trim() || (await generateThumbnailConcept(scriptText, topicName || '', title));

  onStep?.('inspecting');
  const topicQuery = [title, topicName, concept].filter(Boolean).join('. ').slice(0, 2000);
  const styleRef = await pickBestStyleReference(topicQuery);

  onStep?.('generating');

  const faceDir = faceImage
    ? `Feature the person from the uploaded face photo (the ${styleRef ? 'SECOND' : 'FIRST'} image) as the thumbnail's main subject — swap in their exact face and likeness, photorealistically, matching the rest of the composition's pose, scale and lighting. ${styleRef ? "Do NOT use the FIRST image's person — that is a completely different, unrelated person from someone else's thumbnail. " : ''}`
    : `Build the main subject from the concept below — a photorealistic person or scene fitting the topic. ${styleRef ? "Do NOT reuse the FIRST image's specific person or face under any circumstances — that person belongs to a different, unrelated thumbnail. " : ''}`;

  const conceptLine = concept ? `SCENE CONCEPT: ${concept} ` : '';

  const styleIntro = styleRef
    ? "Use the FIRST image ONLY as a visual STYLE reference — copy its composition, framing, lighting, color grade and mood (and, only if it uses on-image text, its text placement). CRITICAL: the FIRST image is from a completely different, unrelated thumbnail — its specific person/face, props and any on-image wording all belong to THAT one. Do NOT copy any of them — take ONLY the visual style and create an ORIGINAL thumbnail for THIS video in that same look. "
    : '';

  const prompt = `${styleIntro}${conceptLine}${faceDir}${textDirective(title)} ${topicDirective(topicQuery)}${BASE_THUMB}`;

  const parts: any[] = [];
  if (styleRef) parts.push({ inlineData: { data: styleRef.data, mimeType: styleRef.mimeType } });
  if (faceImage) parts.push({ inlineData: { data: faceImage.data, mimeType: faceImage.mimeType } });
  parts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model: getImageModel(),
      contents: { parts },
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: { aspectRatio: '16:9', personGeneration: IMAGE_PERSON_GENERATION },
        safetySettings: IMAGE_SAFETY_SETTINGS,
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
    }
  } catch (e: any) {
    if (e?.status === 'RESOURCE_EXHAUSTED' || e?.code === 429) {
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
    }
    console.error('Thumbnail generation failed', e);
    throw e;
  }

  throw new Error('No image generated');
};

export const generateVideoBackground = async (hostName: string, guestName: string): Promise<string> => {
  const ai = getAi();

  const prompt = `
    Create a high-quality, professional YouTube podcast background image in the style of the Joe Rogan Experience.
    
    COMPOSITION:
    1. **Subjects**: Two people sitting facing each other in a podcast studio. On the right is ${hostName}, and on the left is ${guestName}. They should look like they are in a deep, engaging conversation.
    2. **Foreground**: Two professional black studio microphones (like Shure SM7B) visible in the bottom foreground, one for each person.
    3. **Background**: A clean, pure white background.
    4. **Style**: Photorealistic, cinematic lighting, high contrast, sharp details.
    
    CRITICAL: Do NOT add any text, title cards, name labels, overlays, badges, or any kind of text box anywhere in the image. The image must be completely free of all text and UI elements. Only the two people and microphones — nothing else.
  `;

  try {
    const response = await ai.models.generateContent({
      model: getImageModel(),
      contents: { parts: [{ text: prompt }] },
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: {
          aspectRatio: "16:9",
          personGeneration: IMAGE_PERSON_GENERATION,
        },
        safetySettings: IMAGE_SAFETY_SETTINGS,
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }
  } catch (e: any) {
    if (e?.status === 'RESOURCE_EXHAUSTED' || e?.code === 429) {
      throw new Error("Gemini API Quota Exceeded. Please try again in a few minutes.");
    }
    console.error("Video background generation failed", e);
    throw e;
  }

  throw new Error("No image generated");
};

export const generateSegmentImage = async (segmentText: string, context?: string): Promise<string> => {
  const ai = getAi();

  const prompt = `
    Generate a simple illustration in the style of MS Paint that directly explains the following text segment.
    
    Segment Text: "${segmentText}"
    ${context ? `Context: ${context}` : ''}
    
    Requirements:
    1. **Style**: MS Paint style, simple drawings, basic colors, unpolished, naive art style.
    2. **Focus**: ONLY illustrate the core concept or action of what is being said in the text. Make it easy to understand.
    3. **White Background**: The image MUST have a clean, pure white background.
    4. **Minimalist**: Use simple visual metaphors, stick figures, or basic shapes. Avoid complex details.
    5. **No Text Overload**: Do not just write the text on the image. Use visuals to represent the concept.
    6. **Aspect Ratio**: 16:9.
  `;

  try {
    const response = await ai.models.generateContent({
      model: getImageModel(),
      contents: { parts: [{ text: prompt }] },
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: {
          aspectRatio: "16:9",
          personGeneration: IMAGE_PERSON_GENERATION,
        },
        safetySettings: IMAGE_SAFETY_SETTINGS,
      }
    });

    // Extract image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }
  } catch (e: any) {
      if (e?.status === 'RESOURCE_EXHAUSTED' || e?.code === 429) {
        throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
      }
      console.error("Image generation failed", e);
      throw e;
  }
  
  throw new Error("No image generated");
};

export const selectBestCommentsForIntro = async (comments: string[]): Promise<string[]> => {
  const ai = getAi();
  const sample = comments.slice(0, 150);
  const prompt = `You are selecting YouTube comments for a viral intro video.
From the comments below, pick exactly 7 that are the most interesting, funny, controversial, or thought-provoking.
They should represent diverse reactions. Keep comments short enough to fit on screen (under 120 chars each; if longer, trim smartly).
Return ONLY a JSON array of 7 selected/trimmed comment strings. No explanation.

Comments:
${JSON.stringify(sample)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' }
  });
  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 8) as string[];
  } catch {}
  return comments.filter(c => c.length > 15 && c.length < 130).slice(0, 7);
};

/**
 * Curate scraped IG comments for the IG → Song flow.
 * Picks the funniest, wittiest, most quotable comments (roasts, one-liners,
 * relatable reactions, sarcasm). Drops emoji-only / spam / generic praise.
 * Returns up to `count` comments, lightly trimmed if needed.
 */
export const pickFunnyCommentsForSong = async (
  comments: string[],
  count: number = 20,
  language: string = 'Hindi',
  model: string = 'gemini-3.8-flash',
): Promise<string[]> => {
  const ai = getAi();
  const cleaned = comments
    .map(c => (c || '').trim())
    .filter(c => c.length >= 4 && c.length <= 280);
  if (cleaned.length === 0) return [];
  const sample = cleaned.slice(0, 300);

  const prompt = `You are curating Instagram comments for a music video where the comments will scroll on screen with a song.
LANGUAGE PREFERENCE: ${language} (but mixed-language / Hinglish / English comments are all fine — preserve the original).

From the comments below, pick EXACTLY ${count} comments (or fewer if there aren't enough good ones) that are:
- The FUNNIEST — jokes, roasts, sarcasm, wit, savage one-liners
- The MOST RELATABLE — reactions everyone agrees with
- The MOST QUOTABLE — punchy lines that read well on screen
- DIVERSE — different angles/jokes, no near-duplicates

REJECT:
- Pure emoji / emoji-only comments
- Generic praise ("nice", "wow", "great video")
- Spam, promos, follow-requests
- Anything under ~4 words unless it's a perfect punchline
- Hate speech / slurs / political attacks

Trim any comment over 140 chars at a natural break, keep it punchy. Preserve original spelling/language.

Return ONLY a JSON array of selected comment strings — no markdown, no commentary, no keys.

Comments:
${JSON.stringify(sample)}`;

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' },
  });
  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
        .slice(0, count);
    }
  } catch {}
  // Fallback: rough heuristic if Gemini returns bad JSON
  return cleaned.filter(c => c.length >= 10 && c.length <= 140).slice(0, count);
};

export const generateIntroQuote = async (comments: string[]): Promise<string> => {
  const ai = getAi();
  const sample = comments.slice(0, 15).join('\n');
  const prompt = `Based on these YouTube comments, write ONE powerful closing quote (10-18 words) for a viral video intro.
It should feel bold, thought-provoking, or inspiring. No quotation marks. No explanation. Just the quote.

Comments:
${sample}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Every opinion matters. Every voice counts.";
};

export const translateScriptToHindi = async (segments: DebateSegment[]): Promise<string[]> => {
  const ai = getAi();

  const textsJson = JSON.stringify(segments.map(s => s.text));

  const prompt = `Translate the following JSON array of script dialogue lines to Hindi.
Return ONLY a valid JSON array of translated strings in the exact same order.
Do NOT add any explanation or markdown. Output must be a raw JSON array only.

Input:
${textsJson}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' }
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]) as string[];
  }
  throw new Error("Translation failed: could not parse response");
};

export const generateTopicQuote = async (scriptText: string): Promise<{ quote: string; author: string; title: string }> => {
  const ai = getAi();
  const excerpt = scriptText.slice(0, 2000);

  const prompt = `You are a quote curator. Read this debate/podcast script excerpt and identify the core topic being discussed.
Then generate ONE powerful, solid, thought-provoking quote that perfectly captures the essence of that topic.

Rules:
- The quote must be deep, memorable, and feel authentic — like something a great thinker, leader, or expert would say.
- It can be a real famous quote from a real person IF it is highly relevant. Or craft a new one attributed to a plausible real or fictional expert figure.
- Keep the quote between 12-25 words. Short, punchy, powerful.
- The author name should be real and well-known (philosopher, scientist, leader, author) OR a believable expert with title (e.g., "Dr. Amara Singh, Economist").
- Return ONLY valid JSON. No markdown. No extra text.

Return this exact JSON format:
{"quote": "...", "author": "...", "title": "..."}
Where "title" is the author's role/profession (e.g., "Philosopher", "Nobel Laureate", "Tech Entrepreneur").

Script excerpt:
${excerpt}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' }
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try {
    const parsed = JSON.parse(raw);
    if (parsed.quote && parsed.author) return parsed as { quote: string; author: string; title: string };
  } catch {}
  const match = raw.match(/\{[\s\S]*?\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed.quote) return parsed;
    } catch {}
  }
  return { quote: "The truth is rarely pure and never simple.", author: "Oscar Wilde", title: "Playwright & Wit" };
};

// ── Clip Intro Generator ───────────────────────────────────────────────────
export const generateClipIntro = async (
  scriptText: string,
  speakers: string[]
): Promise<string> => {
  const ai = getAi();
  const excerpt = scriptText.slice(0, 1500);
  const speakerA = speakers[0] || 'Host';
  const speakerB = speakers[1] || 'Guest';

  const prompt = `Read this podcast/debate script and extract the MAIN TOPIC in 3-6 words (concise, engaging, no punctuation).

Script excerpt:
${excerpt}

Return ONLY the topic phrase, nothing else. Example outputs:
- "AI taking over jobs"
- "future of democracy"
- "celebrity mental health crisis"`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const topic = (response.candidates?.[0]?.content?.parts?.[0]?.text || 'this topic').trim().replace(/[.!?]$/, '');

  return `In this clip, ${speakerA} and ${speakerB} talk about ${topic}. Let's check it out! If you want to watch the reaction version, skip the timeline.`;
};

// ── Optional Intro Generator (Phone Studio · Step 2) ──────────────────────
// Uses gemini-3.1-flash-lite + Google Search grounding to write a 2-3 sentence
// intro in the style: "In this clip, <host> <action> about <topic>. <one-line
// host context — what they do / why they matter>. Let's check it out."
// Returns the intro text + the extracted topic phrase (for UI display).
export const generateIntroFromTranscript = async (args: {
  transcriptText: string;
  podcastTitle?: string;
  podcastHost?: string;
  podcastGuests?: string[];
}): Promise<{ intro: string; topic: string; host: string }> => {
  const { transcriptText, podcastTitle, podcastHost, podcastGuests } = args;
  const excerpt = (transcriptText || '').slice(0, 4000);
  const hostHint = (podcastHost || '').trim();
  const guestsHint = (podcastGuests || []).filter(Boolean).join(', ');

  const prompt = `You are writing a SHORT, CATCHY spoken intro (1-2 sentences, ~18-32 words total) for a YouTube clip.

CONTEXT
- Podcast title: ${podcastTitle || '(unknown)'}
- Detected host: ${hostHint || '(unknown — figure out from transcript / search)'}
- Detected guest(s): ${guestsHint || '(none / unknown)'}
- Transcript excerpt (THIS is the clip — base the topic ONLY on what's actually discussed here, do not invent):
${excerpt}

YOUR JOB
1. Identify the HOST (use detected host if given; otherwise infer from transcript / search).
2. Identify the GUEST if there is one (use detected guest if given; otherwise infer). If multiple guests, pick the primary one.
3. Identify the CORE TOPIC of THIS CLIP specifically (3-7 words, concrete — not "stuff" / "things" / generic).
4. Use Google Search grounding to pull ONE short factual description of the GUEST's role/profession (e.g. "a professional comedian", "a neuroscientist", "the founder of Tesla"). Keep it 2-6 words. Must be TRUE.

OUTPUT — pick ONE shape based on whether there's a guest:

WITH GUEST:
"In this clip <Host> and <Guest>, who is <guest's role description>, talk about <topic>."

NO GUEST (solo episode):
"In this clip <Host> <verb> about <topic>."

EXAMPLES
✓ "In this clip Joe Rogan and Hardly Williams, who is a professional comedian, talk about prison stories from his early career."
✓ "In this clip Lex Fridman and Andrej Karpathy, who is a leading AI researcher, talk about how large language models actually learn."
✓ "In this clip Tim Ferriss explains why he stopped drinking coffee for 30 days."

VERB CHOICES (no-guest case): talks about / explains / breaks down / argues / reveals / reacts to / shares
RULES
- ONE sentence preferred. Two max. Hard cap 35 words.
- No emojis. No quotes around the intro. No "welcome back" / "hey guys" / "let's check it out" / "today we have".
- The guest description must be FACTUAL and grounded — not invented. If unsure, use a safe generic ("a writer", "an entrepreneur") rather than guessing specifics.
- Topic comes from THE TRANSCRIPT EXCERPT above — NOT from the title or anything external. If the excerpt is about prison stories, the topic is prison stories — even if the podcast title says something else.
- Plain spoken English. Contractions OK. Punchy, catchy, hook-y.

Return JSON ONLY (no markdown, no preamble):
{
  "host": "the host's full name as you'd say it",
  "guest": "the primary guest's full name, or empty string if solo",
  "guestRole": "short factual role description of the guest, or empty string if solo",
  "topic": "3-7 word topic phrase grounded in the excerpt",
  "intro": "the full 1-2 sentence spoken intro"
}`;

  // Grounding ON — we want the latest factual context about the host.
  const data = await callGemini(
    'gemini-3.1-flash-lite',
    [{ role: 'user', parts: [{ text: prompt }] }],
    { tools: [{ googleSearch: {} }] },
  );

  const raw: string =
    data.text
    ?? data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('')
    ?? '';

  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  let parsed: { host?: string; guest?: string; guestRole?: string; topic?: string; intro?: string } | null = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { parsed = null; }
    }
  }

  const host = (parsed?.host || hostHint || 'the host').toString().trim();
  const guest = (parsed?.guest || (podcastGuests || [])[0] || '').toString().trim();
  const guestRole = (parsed?.guestRole || '').toString().trim();
  const topic = (parsed?.topic || 'this topic').toString().trim();
  let intro = (parsed?.intro || '').toString().trim();

  if (!intro) {
    intro = guest
      ? `In this clip ${host} and ${guest}${guestRole ? `, who is ${guestRole},` : ''} talk about ${topic}.`
      : `In this clip ${host} talks about ${topic}.`;
  }
  return { intro, topic, host };
};

// Speaker appearance pools for variety
const SPEAKER_STYLES = [
  { gender: 'man', age: 'mid-30s', ethnicity: 'South Asian Indian', hair: 'short dark hair', top: 'navy blue collared shirt', bg: 'blurred home office with bookshelf' },
  { gender: 'woman', age: 'late 20s', ethnicity: 'East Asian', hair: 'straight black hair pulled back', top: 'white blazer', bg: 'soft blurred living room with warm light' },
  { gender: 'man', age: 'early 40s', ethnicity: 'Black American', hair: 'trimmed fade', top: 'grey henley', bg: 'blurred modern apartment window with city' },
  { gender: 'woman', age: 'early 30s', ethnicity: 'Hispanic Latina', hair: 'curly medium length brown hair', top: 'teal blouse', bg: 'blurred cozy café background' },
  { gender: 'man', age: 'late 20s', ethnicity: 'white European', hair: 'messy sandy hair', top: 'dark green hoodie', bg: 'blurred minimalist white office' },
  { gender: 'woman', age: 'mid-40s', ethnicity: 'Middle Eastern', hair: 'wavy dark hair, shoulder length', top: 'rust orange top', bg: 'blurred neutral grey studio backdrop' },
];

export const generateSpeakerImage = async (speakerIndex: number, label?: string, use16x9 = false): Promise<string> => {
  const ai = getAi();

  const style = SPEAKER_STYLES[speakerIndex % SPEAKER_STYLES.length];

  const prompt = use16x9
    ? `Cinematic 16:9 wide-angle portrait of a ${style.gender}, ${style.age}, ${style.ethnicity}, ${style.hair}, wearing ${style.top}.
Framing: upper-body visible, centered, slight off-axis gaze as if reading a screen, confident and natural expression.
Background: ${style.bg} — beautifully blurred bokeh, cinematic depth of field.
Lighting: soft ring-light frontal glow, warm cinematic colour grade.
Style: semi-realistic digital portrait, sharp face, professional broadcast-quality look. No text, no watermarks.
Aspect ratio: 16:9, wide frame. Podcast speaker avatar. Character: "${label || 'Speaker ' + (speakerIndex + 1)}".`
    : `Clean digital portrait illustration of a ${style.gender}, ${style.age}, ${style.ethnicity}, ${style.hair}, wearing ${style.top}.
Head and shoulders framing, looking slightly off-camera with a calm, confident expression.
Background: ${style.bg} — softly blurred.
Style: semi-realistic digital art, smooth shading, warm natural lighting, like a professional profile picture or podcast guest photo.
No text, no watermarks. Square crop, clear face.
Podcast debate speaker avatar. Character label: "${label || 'Speaker ' + (speakerIndex + 1)}".`;

  const response = await ai.models.generateContent({
    model: getImageModel(),
    contents: { parts: [{ text: prompt }] },
    config: {
      responseModalities: [Modality.IMAGE],
      imageConfig: { aspectRatio: use16x9 ? '16:9' : '1:1', personGeneration: IMAGE_PERSON_GENERATION },
      safetySettings: IMAGE_SAFETY_SETTINGS,
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('No image generated');
};

/**
 * Cinematic 16:9 movie-still for a Learn English scene line — used for the
 * Intro tab's hook shot AND (unlike the flat-cartoon MS-Paint-style
 * generateSegmentImage) for English Video's general per-segment/bulk image
 * generation, so every generated image in English Video shares one
 * realistic cinematic look instead of mixing crude cartoon illustrations
 * with the realistic speaker avatars/backgrounds.
 */
export const generateCinematicSceneImage = async (sceneText: string): Promise<string> => {
  const ai = getAi();

  const prompt = `Cinematic 16:9 movie-still that visually depicts this moment from a scene: "${sceneText}".
Framing: wide establishing shot or a dramatic close-up — whichever best captures the moment described — with clean space for subtitle text near the bottom third.
Lighting: cinematic, moody, movie-trailer quality — strong directional light, real shadows, shallow depth of field where appropriate.
Style: semi-realistic digital cinematography, sharp detail, professional color grade. No text, no watermarks, no logos.
This should feel like a real frame from a movie or TV drama depicting this exact moment — not an illustration or cartoon.`;

  const response = await ai.models.generateContent({
    model: getImageModel(),
    contents: { parts: [{ text: prompt }] },
    config: {
      responseModalities: [Modality.IMAGE],
      imageConfig: { aspectRatio: '16:9', personGeneration: IMAGE_PERSON_GENERATION },
      safetySettings: IMAGE_SAFETY_SETTINGS,
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('No image generated');
};

/**
 * Full-frame (16:9) scene background featuring a given speaker — used by
 * English Video's per-speaker background feature: when that speaker talks,
 * this image fills the whole frame instead of a floating avatar box, using
 * the same SPEAKER_STYLES index as generateSpeakerImage so the character
 * stays visually consistent between their avatar and their background.
 */
export const generateSpeakerBackgroundScene = async (speakerIndex: number, label?: string, sceneHint?: string): Promise<string> => {
  const ai = getAi();

  const style = SPEAKER_STYLES[speakerIndex % SPEAKER_STYLES.length];

  const prompt = `Cinematic wide 16:9 scene background featuring a ${style.gender}, ${style.age}, ${style.ethnicity}, ${style.hair}, wearing ${style.top}${sceneHint ? `, in this setting: ${sceneHint}` : `, in a setting that fits: ${style.bg}`}.
Framing: the character is visible within a full believable environment (not a close-up headshot/portrait) — cinematic depth of field, shot like a movie still, character positioned to one side so there's clean space for subtitles.
Lighting: cinematic, warm colour grade, natural shadows.
Style: semi-realistic digital art, sharp detail, professional broadcast-quality look. No text, no watermarks.
This is a FULL-FRAME VIDEO BACKGROUND, not a portrait. Character: "${label || 'Speaker ' + (speakerIndex + 1)}".`;

  const response = await ai.models.generateContent({
    model: getImageModel(),
    contents: { parts: [{ text: prompt }] },
    config: {
      responseModalities: [Modality.IMAGE],
      imageConfig: { aspectRatio: '16:9', personGeneration: IMAGE_PERSON_GENERATION },
      safetySettings: IMAGE_SAFETY_SETTINGS,
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('No image generated');
};

export const generateVeo3Prompt = async (comments: string[], transcript?: string): Promise<string> => {
  const ai = getAi();
  const commentSample = comments.slice(0, 20).join('\n');
  const transcriptSample = transcript ? transcript.slice(0, 1200) : '';

  const prompt = `You are an expert Veo 3 video prompt writer. Create a highly detailed, cinematic Veo 3 text-to-video prompt for a fast-cut viral intro video.

Style requirements:
- Fast cuts every 0.5-1 second, kinetic energy, high motion
- Paper/cards/sticky notes flying and landing on screen rapidly
- Bold text appearing with snap animations
- Electric, vibrant colors — neon accents on dark or white backgrounds
- Quick zoom-ins, whip-pans, glitch transitions
- Feels like a trending YouTube Shorts opener
- Duration: approximately 8-12 seconds

Content context (use this as the VIDEO TOPIC):
${transcriptSample ? `Transcript excerpt:\n${transcriptSample}\n` : ''}
Viewer reactions:
${commentSample}

Write ONE complete, detailed Veo 3 prompt. Start directly with the scene description. No preamble, no explanation, no markdown headers. Just the prompt text (150-250 words).`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
};

// ── Timeline Cuts Analyzer ─────────────────────────────────────────────────
export interface TimelineCut {
  index: number;         // narrator segment index (1-based for display)
  text: string;          // narrator script label (first ~60 chars)
  startSec: number;
  endSec: number;
  transcriptPreview: string; // what YouTube speakers actually said at those timestamps
}

export const analyzeTimelineCuts = async (
  narratorSegments: { index: number; text: string }[],
  transcript: { text: string; start: number; end: number }[]
): Promise<TimelineCut[]> => {
  const ai = getAi();

  // Build compact transcript string with timestamps
  const transcriptStr = transcript
    .map(t => `[${t.start.toFixed(1)}s] ${t.text.trim()}`)
    .join('\n');

  const narratorStr = narratorSegments
    .map(s => `${s.index}. ${s.text.substring(0, 400)}`)
    .join('\n\n');

  const prompt = `You are a precise video transcript analyst.

TASK: A podcast/debate script was created from a YouTube video. The script is grouped into POINTS — each point starts with a [Narrator] who introduces the topic, followed by [Speaker A], [Speaker B] etc. who discuss it.

For EACH point below, find the EXACT time range in the YouTube transcript covering the FULL discussion of that topic — from where the Narrator's introduction topic begins, all the way to where the speakers finish discussing it.

Return ONLY a raw JSON array. No markdown, no explanation, no code fences.

Format:
[
  {"index": 1, "startSec": 125.5, "endSec": 266.0},
  {"index": 2, "startSec": 305.0, "endSec": 410.5}
]

Rules:
- "index" matches the point number below
- "startSec" = where this topic's discussion STARTS in the YouTube video
- "endSec" = where this topic's discussion ENDS (when next topic begins or speakers move on)
- Use the transcript timestamps exactly as given — they are seconds from video start
- Cover the ENTIRE discussion, not just the intro
- If you genuinely cannot find the topic, use startSec: -1 and endSec: -1

YOUTUBE TRANSCRIPT (timestamps in seconds):
${transcriptStr.substring(0, 14000)}

SCRIPT POINTS TO MAP (each point = Narrator intro + full speaker discussion):
${narratorStr}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
  const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let parsed: { index: number; startSec: number; endSec: number }[] = [];
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('Timeline analysis result parse nahi hua. Dobara try karo.');
  }

  return parsed.map(item => {
    const seg = narratorSegments.find(s => s.index === item.index);

    // Extract what YouTube speakers actually said in this time range
    let transcriptPreview = '';
    if (item.startSec >= 0 && item.endSec >= 0) {
      const preview = transcript
        .filter(t => t.start >= item.startSec - 1 && t.start <= item.endSec + 1)
        .map(t => t.text.trim())
        .filter(Boolean)
        .join(' ');
      transcriptPreview = preview.length > 220 ? preview.substring(0, 220) + '…' : preview;
    }

    return {
      index: item.index,
      text: seg ? seg.text.substring(0, 60) : `Point ${item.index}`,
      startSec: item.startSec,
      endSec: item.endSec,
      transcriptPreview,
    };
  });
};

// Parse "M:SS" or "H:MM:SS" timestamp string → seconds (returns null if invalid)
const parseTimestampToSec = (ts: string): number | null => {
  if (!ts || typeof ts !== 'string') return null;
  const parts = ts.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
};

// Dedicated timeline matcher for context_bridge.
// Uses sourceTimestamp (already generated during script creation) to snap each segment
// to the nearest real timestamp in the timed YouTube transcript — no extra AI call needed.
export const analyzeContextBridgeTimeline = (
  segments: { index: number; text: string; sourceTimestamp?: string }[],
  transcript: { text: string; start: number; end: number }[]
): TimelineCut[] => {
  // Find the nearest transcript entry to a given target second
  const snapToTranscript = (targetSec: number): number => {
    let bestSec = -1;
    let bestDiff = Infinity;
    for (const t of transcript) {
      const diff = Math.abs(t.start - targetSec);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSec = t.start;
      }
    }
    return bestSec;
  };

  return segments.map(seg => {
    const targetSec = seg.sourceTimestamp ? parseTimestampToSec(seg.sourceTimestamp) : null;

    let startSec = -1;
    if (targetSec !== null && targetSec >= 0 && transcript.length > 0) {
      startSec = snapToTranscript(targetSec);
    }

    let transcriptPreview = '';
    if (startSec >= 0) {
      const nearby = transcript
        .filter(t => t.start >= startSec - 1 && t.start <= startSec + 18)
        .map(t => t.text.trim())
        .filter(Boolean)
        .join(' ');
      transcriptPreview = nearby.length > 200 ? nearby.substring(0, 200) + '…' : nearby;
    }

    return {
      index: seg.index,
      text: seg.text.substring(0, 60),
      startSec,
      endSec: startSec >= 0 ? startSec + 5 : -1,
      transcriptPreview,
    };
  });
};

// ─── Context Bridge: Separate Conclusion Generator ──────────────────────────
export const generateContextBridgeConclusion = async (
  topic: string,
  language: string,
  speakerName: string,
  contextContent: string,
  model: string = 'gemini-3.8-flash',
): Promise<DebateSegment[]> => {
  const ai = getAi();

  const isHindi = language === 'Hindi';
  const name = speakerName || (isHindi ? 'Analyst' : 'Analyst');

  const prompt = isHindi ? `
    तुम "${name}" हो — एक experienced analyst जिसने अभी "${topic}" पर एक video के बारे में context और corrections दिए।

    अब एक **Conclusion + Key Takeaways** segment generate करो — जो इस पूरे analysis को wrap करे।

    Transcript / Context:
    ${contextContent.slice(0, 4000)}

    यह conclusion segment:
    - पूरे analysis का एक sharp, meaningful wrap-up हो
    - 2-3 key takeaways दो जो viewer को याद रहें
    - Tone: professional लेकिन engaging — जैसे koi well-read journalist अपना final thought दे
    - 4-6 sentences max
    - Google Search से verified insights लाओ अगर relevant हो

    JSON output (sirf yeh, kuch aur nahi):
    [
      {"speaker": "${name}", "text": "...", "sourceTimestamp": "end"}
    ]
  ` : `
    You are "${name}" — an experienced analyst who has just provided context and corrections on a video about "${topic}".

    Now generate a **Conclusion + Key Takeaways** segment — wrapping up the entire analysis.

    Transcript / Context:
    ${contextContent.slice(0, 4000)}

    This conclusion segment should:
    - Be a sharp, meaningful wrap-up of the full analysis
    - Give 2-3 key takeaways the viewer will actually remember
    - Tone: professional but engaging — like a well-read journalist giving their final thought
    - 4-6 sentences max
    - Use Google Search for verified insights if relevant

    JSON output (only this, nothing else):
    [
      {"speaker": "${name}", "text": "...", "sourceTimestamp": "end"}
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [{ text: prompt }] },
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      },
    });

    let raw = response.text || "[]";
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed: any[];
    try { parsed = JSON.parse(raw); }
    catch {
      const m = raw.match(/\[[\s\S]*\]/);
      parsed = m ? JSON.parse(m[0]) : [];
    }

    return parsed.map((seg: any, i: number) => ({
      id: `conclusion-${i}`,
      speaker: seg.speaker || name,
      text: seg.text || '',
      scores: [],
      averageScore: 0,
      sourceTimestamp: 'end',
    }));
  } catch (err: any) {
    console.error("Conclusion generation failed:", err);
    return [];
  }
};

// ── Learn English — situational practice-dialogue script generator ──────────
export const generateLearnEnglishScript = async (
  topic: string,
  speakerCount: number,        // 1 = solo monologue practice, 2 = You + 1 other, 3 = You + 2 others
  includeNarrator: boolean,    // adds a short cinematic-hook Narrator "intro" line at the start
  generateQuestions: boolean,  // appends "quiz" segments at the end, spoken by Narrator
  duration: number = 5,        // minutes — rough length guide
  model: string = 'gemini-3.8-flash',
  leStyle: string = 'situational',
  leLanguage: 'hinglish' | 'english' = 'hinglish', // language of Narrator's teaching asides/quiz — dialogue is ALWAYS English
  includeTeachingAsides: boolean = true, // mid-dialogue Narrator phrase/grammar explanations — independent of includeNarrator (intro)
): Promise<DebateSegment[]> => {
  const ai = getAi();

  const turnsGuide = Math.max(6, Math.round(duration * 3));
  const rolesLine = speakerCount <= 1
    ? 'Just ONE speaker: "You" — a monologue / self-practice speech about the situation.'
    : speakerCount === 2
      ? leStyle === 'debate'
        ? 'TWO speakers: "You" (the English learner) and ONE "Opponent" who argues the other side of the topic. Keep the opponent\'s name consistent throughout. This is a direct back-and-forth debate, not a moderated one — no third person bridging it.'
        : 'TWO speakers: "You" (the English learner) and ONE other character who drives the situation. Give them a real first name plus their role fits the topic (e.g. "Boss", "Officer Reyes", "Maya (your date)", "Interviewer") and keep that EXACT string spelled identically every time it\'s used as "speaker" — this string is also used to pick their voice and on-screen name, so never vary it mid-script. The scene is a DIRECT exchange between "You" and this character — do not add a third person or narrator bridging the conversation, it breaks immersion.'
      : '"You" (the English learner) plus TWO other characters that fit the situation. Pick natural, consistent role names for the topic.';

  const introLine = includeNarrator
    ? 'Segment 1 MUST be spoken by "Narrator", tag "intro", just 1-2 sentences (10-15 seconds spoken) — a cinematic story hook that sets the scene and creates curiosity about what\'s coming (e.g. "It was just another Monday morning... until my boss called me into his office."). Don\'t give away how it ends. After that, hand off entirely to the characters — Narrator should not interrupt the scene again except for the "narrator" teaching asides described below.'
    : 'Do NOT include an intro segment — start directly with the first line of dialogue (tag "dialogue"), in media res, as if the scene is already underway.';

  const languageLine = leLanguage === 'hinglish'
    ? 'IMPORTANT: All "dialogue"/"intro" segments (the actual scene) must be in English — that never changes, it\'s what the learner is practicing. BUT every "narrator" aside\'s spoken "text" and its explanation.meaning must be written in Hindi (Devanagari script, natural Hinglish tone, like a friendly teacher talking to the learner directly — not a formal textbook translation). explanation.phrase and explanation.example stay in English (they ARE the English being taught). Same for "quiz" segments: the question text should be in Hindi, options/answer can stay in English where they quote the English phrase being tested.'
    : 'Everything — dialogue, narrator asides, and quiz — should be in English.';

  const teachingLine = includeTeachingAsides
    ? `TEACHING ASIDES ("narrator" tag, roughly 10% of all segments, spread out — not clustered together):
Roughly every 3-5 lines of dialogue, when a line just used a genuinely common, USEFUL idiom, phrasal verb, or natural expression (not something rare or textbook-obscure), insert ONE short "Narrator" aside — like a teacher briefly pausing the scene, not lecturing. Rules for a good aside:
- Pick expressions a learner would actually want to reuse in daily life — prioritize phrasal verbs, common idioms, and natural connector phrases over vocabulary that's just a "big word".
- "text" (what's spoken) is ONE casual, encouraging sentence, e.g. "Notice how she said 'let you go' — that's a polite way to say someone is fired." Never just repeat the dialogue line verbatim.
- "explanation.phrase" is the exact expression as used.
- "explanation.meaning" is a short, plain-language meaning — no jargon, no dictionary-speak.
- "explanation.example" is a FRESH example sentence in a completely different context from the dialogue, so the learner sees the phrase used a second, different way (not a copy of the dialogue line with names swapped).
- Never explain something already obvious or something a beginner already knows (e.g. don't explain "hello" or "thank you").
Immediately after each aside, cut straight back to the story — no lingering.`
    : 'Do NOT insert any "narrator" teaching-aside segments — this is a pure dialogue-only scene, no interruptions to explain vocabulary.';

  const questionsLine = generateQuestions
    ? `\n\nQUIZ ("quiz" tag, spoken by "Narrator", roughly 10% of all segments, placed as 2-4 segments after the dialogue ends):
Short, punchy comprehension/recall questions based ONLY on what was just shown — a viewer who watched the scene should be able to answer every one without outside knowledge. Mix the question types instead of repeating the same pattern:
- A couple of plot-recall questions (e.g. "What did the boss say instead of 'You're fired'?").
- At least one usage/application question testing the taught phrases themselves (e.g. "Which of these means the same as 'let you go'?" with the real phrase as one option and 2-3 plausible-but-wrong alternatives).
Keep questions unambiguous — exactly one correct answer, no trick wording. Each segment must carry a "quiz" object: {"question": the question text, "options": 2-4 short possible answers (optional, only include when it naturally fits multiple-choice), "answer": the correct answer, matched exactly to one of the options when options are given}. "text" is just the spoken question itself.`
    : '';

  const styleLine = {
    situational: 'Everyday situational English — natural, practical phrasing a learner would actually use in real life. Invent a real, slightly dramatic everyday situation that specifically fits the given topic (getting fired, missing a flight, being stopped by police, a first date, a robbery, overhearing a secret at work, etc. are just examples of the GENRE — don\'t default to reusing them verbatim unless the topic itself is exactly that; tailor the specifics — names, setting, stakes — to the topic given).',
    roleplay: 'A roleplay-practice scene — slightly more structured, clearly modeling both sides of a common exchange, useful as a template the learner could mimic in real life.',
    interview: 'A more formal register — like a job interview or official conversation, polite and professional English, but still natural (not stiff/robotic).',
    casual: 'Casual, relaxed conversational English between people who know each other — contractions, filler words like "honestly"/"I mean", interruptions, natural back-and-forth.',
    debate: 'A friendly but spirited debate between "You" and an "Opponent" arguing opposite sides of the topic — teaches persuasive/argumentative English: agreeing, disagreeing, making a point, conceding a point, rebutting.',
  }[leStyle] || 'Everyday situational English.';

  const prompt = `You are a scriptwriter creating an ENGLISH-LEARNING practice video, based on this topic/situation: "${topic}".

${rolesLine}
${introLine}
Style: ${styleLine}
${languageLine}

SCENE CRAFT — this must read as a real mini-story, not a generic back-and-forth. Give it a clear arc across the ~${turnsGuide} "dialogue" lines: a quick SETUP (where/who/what's at stake), rising TENSION or complication (something goes wrong, is revealed, or is at risk), a TURNING POINT, and a RESOLUTION or a clear final beat — even in ${turnsGuide} lines this should feel like it's going somewhere, not just chatting. 80% of all segments should be plain "dialogue" between the characters.

DIALOGUE QUALITY:
- Natural, everyday spoken English — contractions (I'm, don't, that's), realistic reactions, interruptions where it fits. Not stiff, not textbook-perfect grammar showcases.
- Vary sentence length — short reactive lines mixed with longer ones, the way real conversation actually sounds.
- Every character should sound distinct — don't make both sides speak in the same rhythm/vocabulary.
- Genuinely useful, reusable expressions a learner would want to practice should come up naturally — don't force vocabulary in awkwardly.

${teachingLine}${questionsLine}

Return JSON only (no markdown, no commentary before or after), an array of objects in speaking order:
{"speaker": "...", "text": "...", "tag": "intro"|"dialogue"|"narrator"|"quiz", "explanation": {...} (ONLY for tag "narrator"), "quiz": {...} (ONLY for tag "quiz")}
"speaker" must be exactly "Narrator", "You", or the other character's exact name/role string (spelled identically every single time it's used).`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [{ text: prompt }] },
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } },
    });

    let raw = response.text || '[]';
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed: any[];
    try { parsed = JSON.parse(raw); }
    catch {
      const m = raw.match(/\[[\s\S]*\]/);
      parsed = m ? JSON.parse(m[0]) : [];
    }

    return parsed.map((seg: any, i: number) => {
      const tag = (seg.tag === 'intro' || seg.tag === 'narrator' || seg.tag === 'quiz') ? seg.tag : 'dialogue';
      const result: DebateSegment = {
        id: `learn-english-${i}`,
        speaker: seg.speaker || 'You',
        text: seg.text || '',
        scores: [],
        averageScore: 0,
        learnEnglish: { segmentType: tag },
      };
      if (tag === 'narrator' && seg.explanation?.phrase) {
        result.learnEnglish!.explanation = {
          phrase: seg.explanation.phrase,
          meaning: seg.explanation.meaning || '',
          example: seg.explanation.example,
        };
      }
      if (tag === 'quiz' && seg.quiz?.question) {
        result.learnEnglish!.quiz = {
          question: seg.quiz.question,
          options: Array.isArray(seg.quiz.options) ? seg.quiz.options : undefined,
          answer: seg.quiz.answer || '',
        };
      }
      return result;
    });
  } catch (err: any) {
    console.error('Learn English script generation failed:', err);
    return [];
  }
};

// ── Topic-based Transcript Splitter ──────────────────────────────────────────
export interface TranscriptChunk {
  title: string;
  start: number;   // seconds
  end: number;     // seconds
  text: string;
  summary?: string; // AI-generated summary (only for Auto AI split)
}

// ── Duration-based split (pure client-side, no AI) ───────────────────────────
export const splitTranscriptByDuration = (
  segments: { text: string; start: number; end: number }[],
  maxSeconds: number
): TranscriptChunk[] => {
  if (!segments.length) return [];
  const chunks: TranscriptChunk[] = [];
  let chunkStart = segments[0].start;
  let chunkTexts: string[] = [];
  let chunkEnd = segments[0].start;

  for (const seg of segments) {
    const wouldBe = seg.end - chunkStart;
    if (wouldBe > maxSeconds && chunkTexts.length > 0) {
      chunks.push({
        title: `Segment ${chunks.length + 1}`,
        start: chunkStart,
        end: chunkEnd,
        text: chunkTexts.join(' '),
      });
      chunkStart = seg.start;
      chunkTexts = [seg.text];
      chunkEnd = seg.end;
    } else {
      chunkTexts.push(seg.text);
      chunkEnd = seg.end;
    }
  }
  if (chunkTexts.length > 0) {
    chunks.push({
      title: `Segment ${chunks.length + 1}`,
      start: chunkStart,
      end: chunkEnd,
      text: chunkTexts.join(' '),
    });
  }
  return chunks;
};

// ── AI topic split with summaries ────────────────────────────────────────────
export const splitTranscriptByTopics = async (
  segments: { text: string; start: number; end: number }[]
): Promise<TranscriptChunk[]> => {
  if (!segments.length) throw new Error('Transcript is empty');

  const ai = getAi();

  const totalDuration = segments[segments.length - 1].end;

  // Build compact timestamped text: [MM:SS] text
  const timestamped = segments.map(s => {
    const m = Math.floor(s.start / 60).toString().padStart(2, '0');
    const sc = Math.floor(s.start % 60).toString().padStart(2, '0');
    return `[${m}:${sc}] ${s.text}`;
  }).join('\n');

  const prompt = `You are analyzing a transcript. Split it into topic-based chunks.

RULES:
1. Each chunk MUST be less than 8 minutes (480 seconds) long.
2. Split ONLY at natural topic change points — don't cut mid-sentence.
3. Minimum chunk size: 30 seconds (don't make tiny chunks).
4. Cover the ENTIRE transcript — no gaps, no overlaps.
5. Give each chunk a short descriptive title (5-7 words).
6. Write a 1-2 sentence summary of what is discussed in each chunk (in the same language as the transcript).

Total duration: ${Math.floor(totalDuration / 60)}m ${Math.floor(totalDuration % 60)}s

TRANSCRIPT (timestamps in [MM:SS]):
${timestamped}

Return ONLY a JSON array. Each item: {"title": "...", "start_seconds": 0, "end_seconds": 0, "summary": "..."}
The first chunk's start_seconds must be 0. The last chunk's end_seconds must be ${Math.floor(totalDuration)}.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
  });

  const raw = response.text ?? '';
  let splits: { title: string; start_seconds: number; end_seconds: number; summary?: string }[] = [];

  try {
    const m = raw.match(/\[[\s\S]*\]/);
    splits = JSON.parse(m ? m[0] : raw);
  } catch {
    throw new Error('Segment analysis failed — try again');
  }

  if (!Array.isArray(splits) || !splits.length) throw new Error('No splits returned');

  // Map each split back to actual text from segments
  return splits.map(sp => {
    const s = Math.max(0, sp.start_seconds);
    const e = Math.min(totalDuration, sp.end_seconds);
    const chunkSegs = segments.filter(seg => seg.start >= s - 1 && seg.start < e + 1);
    const text = chunkSegs.map(seg => seg.text).join(' ');
    return { title: sp.title || 'Section', start: s, end: e, text, summary: sp.summary };
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// LYRICS GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

const STYLE_PROMPTS: Record<string, string> = {
  auto: 'AUTO',
};

export const generateLyrics = async (params: {
  comments: string;
  context: string;
  directLyrics: string;
  style: string;
  language: string;
  model: string;
}): Promise<string> => {
  const ai = getAi();

  const lang = params.language || 'Hindi';

  const topicLine = params.context
    ? `TOPIC (write ONLY about this): ${params.context}`
    : params.comments
      ? `TOPIC: Derive the topic entirely from the comments below — stay 100% true to what the comments are about.`
      : `TOPIC: Write a fun and creative song.`;

  const prompt = `You are a creative lyricist. Your job is to write the BEST possible song for the given topic.

LANGUAGE: ${lang} — natural, colloquial speech. Slang is welcome.
${topicLine}
${params.comments ? `\nCOMMENTS FROM AUDIENCE (extract the topic, emotion, and humor from these — let them inspire every line):\n${params.comments.slice(0, 3000)}` : ''}
${params.directLyrics ? `\nUSER'S DRAFT (refine and polish this, keep the same topic):\n${params.directLyrics}` : ''}

STYLE INSTRUCTION: Choose the most fitting style yourself based on the topic and comments. If the topic is funny/meme-worthy → funny rap or sarcastic roast. If it's emotional → melodic/ballad. If it's hype/news → hip-hop bars. If it's dramatic/big → cinematic. If it's light/trendy → pop/viral. You decide — pick whatever makes the song hit hardest.

Write complete song lyrics with:
- [Mukhda] — hook/chorus: the core punchline or emotion (6–10 lines)
- [Antara 1] — first verse: specific details about the topic (6–10 lines)
- [Mukhda] — repeat
- [Antara 2] — second verse: different angle or deeper take (6–10 lines)
- [Mukhda] — repeat
- [Bridge] — twist, punchline, or emotional peak (4–6 lines)

STRICT RULES:
• Write ONLY about the given topic. Never drift.
• Do NOT add politics unless the topic itself is political.
• Output ONLY the lyrics with section labels. No explanations, no commentary.`;

  try {
    const response = await ai.models.generateContent({
      model: params.model || 'gemini-3.8-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    if (!response.text) throw new Error('Gemini returned empty lyrics');
    return response.text.trim();
  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429) {
      throw new Error('Gemini API quota exceeded. Wait a few minutes and try again.');
    }
    throw error;
  }
};

export const generateSongAudio = async (
  lyrics: string,
  style: string,
  lyriaModel: string = 'lyria-3-clip-preview',
): Promise<Blob> => {
  const ai = getAi();

  // Strip section labels for clean music prompt
  const cleanLyrics = lyrics
    .replace(/\[(Mukhda|Antara \d+|Bridge|Sanchari|Chorus|Verse \d+)\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Build a Lyria-optimized music generation prompt
  const musicDesc = 'A modern song with vocals — let the lyrics determine the mood, genre, and instrumentation';

  const musicPrompt = `${musicDesc}. Include vocals singing these lyrics:\n\n${cleanLyrics.slice(0, 800)}`;

  const response = await (ai.models as any).generateContent({
    model: lyriaModel,
    contents: musicPrompt,
    config: {
      responseModalities: ['AUDIO'],
    },
  });

  // Lyria returns parts array — iterate to find audio
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find((p: any) => p?.inlineData?.data);
  if (!audioPart?.inlineData?.data) throw new Error('Lyria returned no audio data. Try again.');

  const raw = atob(audioPart.inlineData.data);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return new Blob([buf], { type: audioPart.inlineData.mimeType || 'audio/wav' });
};

// ─────────────────────────────────────────────────────────────────────────────
// STORYBOARD SCENE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export interface StoryboardSceneRaw {
  sceneNumber: number;
  prompt: string;
  segmentIndices: number[];
  usesCharacter?: boolean;
}

export interface StoryboardScenesResult {
  scenes: StoryboardSceneRaw[];
  characterGuide: string;
}

export const generateStoryboardScenes = async (
  segments: { speaker: string; text: string; duration?: number; startTime?: number; endTime?: number }[],
  sceneCount: number,
  model: string = 'gemini-3.8-flash',
): Promise<StoryboardScenesResult> => {
  const ai = getAi();

  const hasTimestamps = segments.some(s => s.startTime != null && s.endTime != null);
  const scriptText = segments.map((s, i) => {
    if (hasTimestamps && s.startTime != null && s.endTime != null) {
      return `[${i}] (${s.startTime.toFixed(1)}s–${s.endTime.toFixed(1)}s) ${s.speaker}: ${s.text}`;
    }
    return `[${i}] ${s.speaker}: ${s.text}`;
  }).join('\n');
  const durInfo = segments.map((s, i) => {
    const dur = s.endTime != null && s.startTime != null
      ? (s.endTime - s.startTime).toFixed(1)
      : (s.duration ?? 0).toFixed(1);
    return `[${i}] ${dur}s`;
  }).join(', ');

  const prompt = `
You are a professional storyboard artist creating a consistent illustrated story — like a children's picture book or a simple comic strip.

Below is a script split into segments with durations:

SCRIPT:
${scriptText}

SEGMENT DURATIONS: ${durInfo}

TASK:
Step 1 — CHARACTER GUIDE (only if the script actually needs one):
Check whether the script naturally centers on a recurring character/host — someone
who should look the same from scene to scene (e.g. a narrator persona, a story
character like a monkey in a fable, a debate host).
- If yes: create a SHORT, PRECISE visual description (appearance, clothing, hair,
  skin tone, distinguishing features) that will be copy-pasted into EVERY image
  generation prompt for consistency. Single compact paragraph starting with
  "Main character: ...". If there are 2 speakers, describe both. Under 60 words total.
- If no — the script is explaining a concept, object, event, or idea with no fixed
  protagonist — leave characterGuide as an empty string "". Do NOT invent a host just
  to have one; let each scene simply visualize whatever it actually needs (objects,
  settings, symbols, different people as the moment calls for, or no people at all).

Step 2 — SCENES:
Create exactly ${sceneCount} storyboard scenes that visually represent this script as a story.
Each scene covers one or more consecutive script segments. Every segment must be covered (no gaps, no overlaps).

For each scene prompt:
- Describe WHAT IS HAPPENING in this scene — using the character(s) from Step 1 if one
  exists, otherwise just whatever people/objects/setting the moment actually calls for
- Match the segment's actual content — if it mentions a car with a man and a woman in
  it, the scene shows the car with BOTH of them in it, not just one person standing
  somewhere generic. Never drop a person/object the segment clearly describes just to
  simplify — "one clear moment" means one coherent event, not fewer things than the
  script actually says are there
- Include the character's action, expression, and setting, and any other details
  (mood, relevant objects, background elements) that help the image feel complete
- Keep it clear and literal, focused on ONE main thing happening — not five unrelated
  events crammed into one image. e.g. "A monkey selling bananas on a busy street,
  smiling as a customer hands over a coin" is fine — that's still one clear moment,
  just with enough detail to make the scene feel real
- Vary the shot across scenes so the storyboard doesn't feel repetitive — mix wide
  establishing shots, close-ups on a face or hands, over-the-shoulder moments, and
  reaction shots instead of framing every scene the same way ("person standing there")
- For an abstract idea, emotion, or turning point, reach for a vivid visual metaphor
  when it reads more clearly at a glance than a literal illustration would — e.g. a
  looming shadow for fear, a tangled knot for confusion, a rising sun for a fresh start
- Keep it to WHO is there, WHAT they're doing, WHAT objects/setting are involved —
  never describe art style, rendering technique, or colors/coloring here (no "vibrant",
  no "flat colors", no medium). The image generator applies style separately at the end.
- Set "usesCharacter": true ONLY if the recurring character from Step 1 is actually
  depicted doing something in THIS scene. Plenty of scenes legitimately don't need
  them (e.g. a cutaway to an object, a different person, a location, a statistic, a
  reaction from someone else) — set "usesCharacter": false for those, even though a
  character guide exists overall. If Step 1 produced no character at all, always false.

Respond ONLY with valid JSON in this exact format:
{
  "characterGuide": "Main character: ...",
  "scenes": [
    {
      "sceneNumber": 1,
      "prompt": "Scene description here using the character...",
      "segmentIndices": [0, 1],
      "usesCharacter": true
    },
    ...
  ]
}
Do not add any explanation outside the JSON.
`;

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);
  return {
    scenes: (parsed.scenes || []) as StoryboardSceneRaw[],
    characterGuide: (parsed.characterGuide || '') as string,
  };
};

// Time-based scene generation: given pre-computed slots with voiceover text,
// AI only generates image prompts (no segmentIndices decision needed)
export const generateStoryboardScenesTimeBased = async (
  slots: { sceneNumber: number; startTime: number; endTime: number; voiceover: string }[],
  model: string = 'gemini-3.8-flash',
): Promise<{ prompts: string[]; usesCharacter: boolean[]; characterGuide: string }> => {
  const ai = getAi();

  const slotText = slots.map(s =>
    `Scene ${s.sceneNumber} [${s.startTime.toFixed(1)}s–${s.endTime.toFixed(1)}s]:\n"${s.voiceover}"`
  ).join('\n\n');

  const prompt = `
You are a professional storyboard artist creating a consistent illustrated story.

Below are ${slots.length} scenes with their exact timestamps and voiceover text (what is being spoken during each scene):

${slotText}

TASK:
Step 1 — CHARACTER GUIDE (only if the voiceover actually needs one):
Check whether the voiceover naturally centers on a recurring character/host who should
look the same from scene to scene (e.g. a narrator persona, a story character like a
monkey in a fable). If yes, create a SHORT visual description (appearance, clothing,
hair, skin tone) for consistency across all scenes — max 60 words, starting with
"Main character: ...". If the voiceover is explaining a concept, object, event, or idea
with no fixed protagonist, leave characterGuide as an empty string "" — do not invent a
host just to have one; let each scene visualize whatever it actually needs.

Step 2 — IMAGE PROMPTS:
For each scene, create one image prompt that visually illustrates what is happening during that voiceover.
- Show what's happening — using the character from Step 1 if one exists, otherwise
  whatever people/objects/setting the moment actually calls for
- Match the voiceover's actual content — if it mentions a car with a man and a woman in
  it, the scene shows the car with BOTH of them in it, not just one person standing
  somewhere generic. Never drop a person/object the voiceover clearly describes just to
  simplify — "one clear moment" means one coherent event, not fewer things than the
  voiceover actually says are there
- Include enough detail (setting, expression, relevant objects, mood) that the scene
  feels complete, but keep it focused on ONE main thing happening — not five unrelated
  events crammed into one image. e.g. "A monkey selling bananas on a busy street,
  smiling as a customer hands over a coin" is fine — one clear moment, described fully
- Vary the shot across scenes so the storyboard doesn't feel repetitive — mix wide
  establishing shots, close-ups on a face or hands, over-the-shoulder moments, and
  reaction shots instead of framing every scene the same way ("person standing there")
- For an abstract idea, emotion, or turning point, reach for a vivid visual metaphor
  when it reads more clearly at a glance than a literal illustration would — e.g. a
  looming shadow for fear, a tangled knot for confusion, a rising sun for a fresh start
- Keep it to WHO is there, WHAT they're doing, WHAT objects/setting are involved —
  never describe art style, rendering technique, or colors/coloring here (no "vibrant",
  no "flat colors", no medium). The image generator applies style separately at the end.
- For each scene also decide usesCharacter: true ONLY if the recurring character from
  Step 1 is actually depicted doing something in THAT scene. Many scenes legitimately
  don't need them (a cutaway to an object, a different person, a location, a statistic,
  someone else's reaction) — use false for those even though a character guide exists
  overall. If Step 1 produced no character at all, every usesCharacter must be false.

Respond ONLY with valid JSON:
{
  "characterGuide": "Main character: ...",
  "prompts": ["prompt for scene 1", "prompt for scene 2", ...],
  "usesCharacter": [true, false, ...]
}
"usesCharacter" must have exactly one entry per scene, same order as "prompts".
Do not add explanation outside the JSON.
`;

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json', temperature: 0.7 },
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);
  return {
    prompts: (parsed.prompts || []) as string[],
    usesCharacter: (parsed.usesCharacter || []) as boolean[],
    characterGuide: (parsed.characterGuide || '') as string,
  };
};

// ── Chirp 3 HD — via server-side Google Cloud TTS API (Vertex SA auth preferred) ──
export const generateSpeechChirp3HD = async (
  text: string,
  voiceName: string,
  languageCode: string = 'en-US',
): Promise<{ audioUrl: string; duration: number }> => {
  const response = await fetch('/api/google/text-to-speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceName, languageCode }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = data.error || `Chirp 3 HD error: ${response.status}`;
    throw new Error(msg);
  }

  const base64Audio: string = data.audioContent;
  if (!base64Audio) throw new Error('No audio content from Chirp 3 HD');

  // Decode base64 MP3 → Blob URL
  const binary = window.atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  const audioUrl = URL.createObjectURL(blob);

  // Decode to get actual duration
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  let duration = 0;
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    duration = decoded.duration;
  } catch (_) {
    // fallback duration stays 0
  } finally {
    audioCtx.close();
  }

  return { audioUrl, duration };
};

export const generateStoryboardImage = async (
  prompt: string,
  characterGuide?: string,
  aspectRatio: '16:9' | '3:4' | '1:1' | '9:16' = '16:9',
): Promise<string> => {
  const ai = getAi();

  const characterSection = characterGuide
    ? ` Character consistency — draw them exactly like this, same face/clothes/hair as every other scene: ${characterGuide}`
    : '';

  // Keep this as close to the raw scene prompt as possible — just one style
  // line appended at the end. Explicitly saying "MS Paint" made the model
  // render an actual Windows Paint application window (title bar, menus,
  // blank margins) instead of just adopting the crude flat art style, so
  // this describes the look directly instead.
  const fullPrompt = `${prompt}.${characterSection} Simple flat 2D cartoon clip-art illustration style, bold black outlines, vibrant colorful flat colors, minimal shading, no text, no watermark, no app windows or UI chrome, full-bleed edge-to-edge with no borders or blank margins, aspect ratio ${aspectRatio}.`;

  const response = await ai.models.generateContent({
    model: getImageModel(),
    contents: { parts: [{ text: fullPrompt }] },
    config: {
      responseModalities: [Modality.IMAGE],
      imageConfig: { aspectRatio, personGeneration: IMAGE_PERSON_GENERATION },
      safetySettings: IMAGE_SAFETY_SETTINGS,
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  // Surface WHY — a safety block or a text-only reply both land here, and
  // "No image generated" alone gives no way to tell them apart or act on it.
  const blockReason = response.promptFeedback?.blockReason;
  const finishReason = response.candidates?.[0]?.finishReason;
  const textReply = response.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join(' ');
  const detail = blockReason ? `blocked: ${blockReason}` : finishReason ? `finishReason: ${finishReason}` : textReply ? `model replied with text instead: "${textReply.slice(0, 200)}"` : 'empty response';
  throw new Error(`No image generated (${detail})`);
};

// ── Best Shorts Segments Finder ──────────────────────────────────────────────
export interface ShortsSegment {
  title: string;
  start: number;
  end: number;
  description: string;
  hook: string;
}

export type ClipMode = 'short' | 'long';

// Robust text extraction — `response.text` getter can be missing after JSON
// proxying, and grounding/tool calls sometimes leave it empty. Falls back to
// concatenating every text part across every candidate.
const extractGeminiText = (response: any): string => {
  if (typeof response?.text === 'string' && response.text.trim()) return response.text;
  const candidates = response?.candidates;
  if (!Array.isArray(candidates)) return '';
  const chunks: string[] = [];
  for (const c of candidates) {
    const parts = c?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const p of parts) {
      if (typeof p?.text === 'string') chunks.push(p.text);
    }
  }
  return chunks.join('').trim();
};

const parseSegmentsJson = (
  text: string,
  label: string,
): { segments: ShortsSegment[] } => {
  const tryParse = (s: string): { segments: ShortsSegment[] } | null => {
    try {
      const p = JSON.parse(s);
      if (p && Array.isArray(p.segments)) return p;
      if (Array.isArray(p)) return { segments: p };
      return null;
    } catch { return null; }
  };

  let parsed = tryParse(text);
  if (!parsed) {
    const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    parsed = tryParse(stripped);
    if (!parsed) {
      const obj = stripped.match(/\{[\s\S]*\}/);
      if (obj) parsed = tryParse(obj[0]);
      if (!parsed) {
        const arr = stripped.match(/\[[\s\S]*\]/);
        if (arr) {
          const p = tryParse(arr[0]);
          if (p) parsed = p;
        }
      }
    }
  }

  if (!parsed) {
    console.error(`${label} AI raw response:`, text.slice(0, 500));
    throw new Error(
      text.trim()
        ? `AI response was not valid JSON. Got: ${text.slice(0, 120)}`
        : 'AI returned an empty response. Try again, or shorten the transcript.'
    );
  }
  return parsed;
};

export const findBestShortsSegments = async (
  transcript: { text: string; start: number; end: number }[],
  rangeStart?: number,
  rangeEnd?: number,
  mode: ClipMode = 'short',
): Promise<ShortsSegment[]> => {
  if (!transcript.length) throw new Error('Transcript is empty');

  const ai = getAi();

  const inRange = (rangeStart !== undefined && rangeEnd !== undefined)
    ? transcript.filter(s => s.end >= rangeStart && s.start <= rangeEnd)
    : transcript;
  if (!inRange.length) throw new Error('No transcript in selected range');

  // Truncate transcript if too long (model context limit)
  const MAX_CHARS = 28_000;
  let allLines = inRange.map(s => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`);
  let joined = allLines.join('\n');
  if (joined.length > MAX_CHARS) {
    // Evenly sample across the full transcript to preserve coverage
    const step = Math.ceil(allLines.length / Math.floor(MAX_CHARS / 60));
    allLines = allLines.filter((_, i) => i % step === 0);
    joined = allLines.join('\n');
  }
  const lines = joined;

  const rangeNote = (rangeStart !== undefined && rangeEnd !== undefined)
    ? `\nFocus only on the time range ${rangeStart.toFixed(1)}s to ${rangeEnd.toFixed(1)}s.`
    : '';

  const prompt = mode === 'long'
    ? `You are an expert long-form video editor (YouTube long-form, podcast highlights, deep-dive segments).
Analyse the transcript below and find the 2 to 4 BEST natural LONG segments where one specific topic is discussed in FULL CONTEXT — meaning the segment includes the setup, the full back-and-forth/discussion, the examples given, and the natural conclusion of that topic.${rangeNote}

Each segment MUST:
  • Be 90 seconds to 6 minutes long (NEVER under 90s, NEVER over 6 minutes)
  • Cover ONE coherent topic from start to natural finish — do NOT cut mid-discussion
  • Begin where the topic is introduced (not in the middle of an unrelated point)
  • End at a natural pause / topic shift / conclusion
  • Contain enough context that someone who hasn't seen the rest of the video can follow it

Pick segments where the discussion is genuinely valuable: deep explanations, multi-angle debates, full stories, complete teachings, layered arguments.

Return JSON ONLY in this exact shape (no markdown, no extra text):
{
  "segments": [
    {
      "title": "5-9 word topic title (in transcript's language)",
      "start": <number, seconds>,
      "end": <number, seconds>,
      "description": "1-2 sentences explaining what topic is fully covered in this segment (in transcript's language)",
      "hook": "The opening line that introduces this topic in the transcript"
    }
  ]
}

Transcript with timestamps:
${lines}`
    : `You are an expert short-form video editor (YouTube Shorts / Instagram Reels / TikTok).
Analyse the transcript below and find the 3 to 5 BEST segments that would make engaging Shorts.${rangeNote}

Each segment must be 20-60 seconds long, have a strong hook, and contain a complete idea.
Look for: surprising statements, emotional moments, controversial takes, valuable insights, funny lines, story climaxes.

Return JSON ONLY in this exact shape (no markdown, no extra text):
{
  "segments": [
    {
      "title": "5-7 word punchy title (in transcript's language)",
      "start": <number, seconds>,
      "end": <number, seconds>,
      "description": "1 sentence why this works as a Short (in transcript's language)",
      "hook": "The opening line/hook from the transcript that pulls viewers in"
    }
  ]
}

Transcript with timestamps:
${lines}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          segments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER },
                description: { type: Type.STRING },
                hook: { type: Type.STRING },
              },
              required: ['title', 'start', 'end'],
            },
          },
        },
        required: ['segments'],
      },
    },
  });

  const text = extractGeminiText(response);
  const parsed = parseSegmentsJson(text, 'Clip');

  return parsed.segments
    .filter(s => typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start)
    .map(s => ({
      title: s.title || 'Untitled segment',
      start: Math.max(0, s.start),
      end: s.end,
      description: s.description || '',
      hook: s.hook || '',
    }));
};

// ── Generate 4 viral titles + thumbnail text from actual transcript ────────────
export interface ShortsContentResult {
  titles: string[];
  thumbnailText: string; // separate punchy 2-4 word text for the thumbnail visual
}

export const generateShortsTitles = async (
  seg: ShortsSegment,
  transcriptText: string,
): Promise<ShortsContentResult> => {
  const ai = getAi();

  const prompt = `You are an expert viral YouTube content strategist.

Here is the ACTUAL spoken transcript from this video clip (use THIS as your source, not summaries):
---
${transcriptText}
---

Segment info (for context only):
Title: ${seg.title}
Duration: ${Math.round(seg.end - seg.start)}s

Generate the following JSON object:
{
  "titles": [<4 viral YouTube titles based on what was ACTUALLY said in the transcript>],
  "thumbnailText": "<2-5 word ultra-punchy visual text for the thumbnail — NOT the same as any title — shocking, bold, curiosity-driving, like 'THEY LIED TO US' or 'THIS CHANGES EVERYTHING'>"
}

Rules for titles:
- Based on what was ACTUALLY spoken in the transcript above
- Maximum 65 characters each
- English only, no hashtags, no emojis
- Mix: question / bold claim / shocking fact / emotional hook
- Make someone STOP scrolling

Rules for thumbnailText:
- 2-5 words MAX, all caps style thinking
- Must be DIFFERENT from the titles
- Ultra short and punchy — designed to be read in 0.5 seconds
- Based on the key revelation/shock/hook from the actual transcript

Return ONLY valid JSON. No markdown, no explanation.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: { parts: [{ text: prompt }] },
  });

  const raw = (response.candidates?.[0]?.content?.parts?.[0] as any)?.text?.trim() ?? '';
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  return {
    titles: Array.isArray(parsed.titles) ? parsed.titles.slice(0, 4).map(String) : [],
    thumbnailText: String(parsed.thumbnailText || seg.title),
  };
};

// ── Generate just the catchy thumbnail text from transcript ───────────────────
export const generateShortsThumbText = async (
  seg: ShortsSegment,
  transcriptText: string,
): Promise<string> => {
  const ai = getAi();

  const prompt = `You are a viral YouTube thumbnail copywriter.

Here is the ACTUAL spoken transcript from this video clip:
---
${transcriptText}
---

Segment title (context only): ${seg.title}

Generate ONE ultra-short catchy phrase to display as bold visual text on a YouTube thumbnail.

Rules:
- 2 to 5 words MAX
- ALL CAPS style thinking (you can return lowercase, it will be uppercased)
- Based on the KEY SHOCK / HOOK / REVELATION from the actual transcript above
- Must be DIFFERENT from the title — it's a visual punch, not a description
- Examples: "THEY LIED TO US", "THIS CHANGES EVERYTHING", "NO ONE KNEW THIS", "THE TRUTH HURTS"
- Make someone STOP scrolling in 0.5 seconds

Return ONLY the phrase text. No quotes, no explanation, no JSON.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: { parts: [{ text: prompt }] },
  });

  const text = (response.candidates?.[0]?.content?.parts?.[0] as any)?.text?.trim() ?? '';
  return text.replace(/^["']|["']$/g, '').trim() || seg.title;
};

// ── Generate thumbnail image in bold YouTube style ─────────────────────────────
export const generateShortsThumbnail = async (
  thumbnailText: string,
  personName: string,
): Promise<string> => {
  const ai = getAi();

  const words = thumbnailText.trim().split(/\s+/);
  // Split into 2 lines — if 1-2 words keep on 1 line, else split at midpoint
  let line1 = words.join(' ').toUpperCase();
  let line2 = '';
  if (words.length >= 3) {
    const mid = Math.ceil(words.length / 2);
    line1 = words.slice(0, mid).join(' ').toUpperCase();
    line2 = words.slice(mid).join(' ').toUpperCase();
  }

  const personDesc = personName.trim()
    ? `The person on the left is ${personName}. Draw them realistically, recognizable, with their actual appearance.`
    : `A dramatic photorealistic person — man or woman — with a shocked, concerned, or intense expression.`;

  const bottomBlock = line2
    ? `- BOTTOM TEXT: "${line2}" — bold RED uppercase, same condensed font, slightly smaller. Or place inside a solid red bar with white text if line2 is short.`
    : `- No bottom text needed.`;

  const prompt = `Create a professional viral YouTube thumbnail — 16:9 aspect ratio.

BACKGROUND: Pure black / very dark charcoal. Subtle dark film grain texture.

LEFT SIDE (40% of image):
${personDesc}
Shot from shoulders up, facing slightly right. Dark cinematic lighting, subtle edge-light rim. Background behind them is solid black/dark. NO text over the person.

RIGHT SIDE (55% of image):
A white or off-white grunge/distressed rectangle (rough torn edges, light noise texture).
Inside the box:
- TOP TEXT: "${line1}" — huge bold black condensed Impact-style uppercase font, fills most of box width, centered.
${bottomBlock}
The text is dramatic, aggressive, punchy.

OVERALL: High contrast, cinematic. Looks like a top 1% viral YouTube thumbnail. Photorealistic quality.

STRICT: Do NOT add watermarks. Only show the person and the text box as described above.`;

  const response = await ai.models.generateContent({
    model: getImageModel(),
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: { aspectRatio: '16:9', personGeneration: IMAGE_PERSON_GENERATION },
      safetySettings: IMAGE_SAFETY_SETTINGS,
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if ((part as any).inlineData) {
      const d = (part as any).inlineData;
      return `data:${d.mimeType};base64,${d.data}`;
    }
  }
  throw new Error('No thumbnail generated');
};

// ── YouTube Clip Generator ────────────────────────────────────────────────────

export type ClipDurationMode = 'auto' | 'under1min' | '2min' | '5min' | '8min' | '15min' | 'custom';
export type ClipRatio = '9:16' | '16:9';

export type ClipCount = number | 'auto';

export interface VideoClipGeneratorConfig {
  ratio: ClipRatio;
  durationMode: ClipDurationMode;
  customDurationSeconds?: number; // used when durationMode === 'custom'
  clipCount: ClipCount; // 1–5, or 'auto' to scale with video length
}

// Auto clip count: scales with video length so a 2-hour video yields many clips,
// not just 3. Caps at sane upper bounds so we don't blow up the prompt budget.
const autoClipCount = (totalSeconds: number, ratio: ClipRatio): number => {
  const minutes = totalSeconds / 60;
  if (ratio === '9:16') {
    // ~1 short per 8 min of content, baseline 3, capped at 30
    return Math.min(30, Math.max(3, Math.round(minutes / 8)));
  }
  // long form: ~1 clip per 15 min, baseline 2, capped at 15
  return Math.min(15, Math.max(2, Math.round(minutes / 15)));
};

function buildDurationConstraint(config: VideoClipGeneratorConfig): { minS: number; maxS: number; label: string } {
  if (config.durationMode === 'custom' && config.customDurationSeconds) {
    const t = config.customDurationSeconds;
    return { minS: Math.max(10, t - 30), maxS: t + 30, label: `~${Math.round(t / 60)}min` };
  }
  const map: Record<ClipDurationMode, { minS: number; maxS: number; label: string }> = {
    auto:      config.ratio === '9:16' ? { minS: 20, maxS: 60, label: '20–60s' } : { minS: 90, maxS: 360, label: '1.5–6min' },
    under1min: { minS: 20, maxS: 60, label: 'under 1 min' },
    '2min':    { minS: 60, maxS: 120, label: '1–2 min' },
    '5min':    { minS: 120, maxS: 300, label: '2–5 min' },
    '8min':    { minS: 300, maxS: 480, label: '5–8 min' },
    '15min':   { minS: 480, maxS: 900, label: '8–15 min' },
    custom:    { minS: 20, maxS: 60, label: 'custom' },
  };
  return map[config.durationMode];
}

export const generateVideoClipsFromTranscript = async (
  transcript: { text: string; start: number; end: number }[],
  config: VideoClipGeneratorConfig,
): Promise<ShortsSegment[]> => {
  if (!transcript.length) throw new Error('Transcript is empty');

  const ai = getAi();

  const { minS, maxS, label } = buildDurationConstraint(config);
  const totalSeconds = transcript[transcript.length - 1].end - transcript[0].start;
  const n = config.clipCount === 'auto'
    ? autoClipCount(totalSeconds, config.ratio)
    : config.clipCount;
  const formatHint = config.ratio === '9:16'
    ? 'short-form vertical video (YouTube Shorts / Reels / TikTok) — punchy, high-energy, hooky'
    : 'long-form horizontal video (YouTube full video) — informative, complete, in-depth';

  // Truncate transcript if too long
  const MAX_CHARS_2 = 28_000;
  let rawLines2 = transcript.map(s => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`);
  let joined2 = rawLines2.join('\n');
  if (joined2.length > MAX_CHARS_2) {
    const step = Math.ceil(rawLines2.length / Math.floor(MAX_CHARS_2 / 60));
    rawLines2 = rawLines2.filter((_, i) => i % step === 0);
    joined2 = rawLines2.join('\n');
  }
  const lines = joined2;

  const prompt = `You are an expert video editor specialising in ${formatHint}.

Analyse the transcript below and select EXACTLY ${n} clip${n > 1 ? 's' : ''} that would perform best as standalone clips.

Duration rule: each clip MUST be between ${minS}s and ${maxS}s long (${label}).
Format: ${config.ratio} — ${config.ratio === '9:16' ? 'optimise for short-form hooks, surprising moments, emotional peaks, viral potential' : 'optimise for complete ideas, full explanations, natural topic arcs'}.

Selection criteria:
- Strong opening hook (first 3 seconds must grab attention)
- Clear, self-contained idea — a viewer with no context can follow it
- Natural start (don't begin mid-sentence or mid-thought)
- Natural end (conclusion, punchline, or clear topic shift)
- No boring filler, greetings, or outros

Return JSON ONLY — no markdown, no extra text:
{
  "segments": [
    {
      "title": "5-9 word punchy clip title in the transcript's language",
      "start": <number, seconds>,
      "end": <number, seconds>,
      "description": "One sentence: why this clip works (in transcript's language)",
      "hook": "Exact opening line from the transcript that starts this clip"
    }
  ]
}

Transcript:
${lines}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          segments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER },
                description: { type: Type.STRING },
                hook: { type: Type.STRING },
              },
              required: ['title', 'start', 'end'],
            },
          },
        },
        required: ['segments'],
      },
    },
  });

  const text = extractGeminiText(response);
  const parsed = parseSegmentsJson(text, 'ClipGen');

  return parsed.segments
    .filter(s => typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start)
    .slice(0, n)
    .map(s => ({
      title: s.title || 'Untitled clip',
      start: Math.max(0, s.start),
      end: s.end,
      description: s.description || '',
      hook: s.hook || '',
    }));
};

// ─── Phone Studio Script Generator ───────────────────────────────────────────

// ── YouTube-style Chapter Generator ───────────────────────────────────────────

export interface ScriptChapter {
  startMs: number;   // chapter start in ms
  endMs: number;     // chapter end in ms (next chapter's start or total)
  title: string;     // short topic title (3-6 words)
}

export const generateScriptChapters = async (
  turns: { text: string; speaker: string; durationMs: number }[],
  language: 'hindi' | 'english' = 'english',
): Promise<ScriptChapter[]> => {
  if (!turns.length) return [];
  const ai = getAi();

  // Build a condensed script with cumulative timestamps
  let ms = 0;
  const lines = turns.map((t, i) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const ts = `${m}:${String(s).padStart(2, '0')}`;
    const entry = `[${ts}] ${t.speaker}: ${t.text.replace(/\n/g, ' ').slice(0, 80)}`;
    ms += t.durationMs;
    return entry;
  }).join('\n');

  const totalSec = Math.floor(ms / 1000);
  const totalMin = Math.floor(totalSec / 60);

  const prompt = `You are a YouTube video editor. Analyse the script below and create ${totalMin < 3 ? '3-4' : totalMin < 8 ? '4-6' : '5-8'} topic-based chapters for a YouTube description.

Rules:
- Each chapter covers ONE clear topic/theme discussed in that time range
- Chapter title: 2-5 words, punchy, in ${language === 'hindi' ? 'Hindi (Hinglish ok)' : 'English'}
- First chapter MUST start at 0:00
- Chapters cover the FULL video — last chapter ends at ${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}
- Group multiple speaker turns under ONE chapter if they discuss the same topic
- NO generic titles like "Introduction" — make them specific to what is actually discussed

Return JSON ONLY:
{
  "chapters": [
    { "startTimestamp": "0:00", "title": "Chapter topic here" },
    { "startTimestamp": "2:15", "title": "Next topic" }
  ]
}

Script:
${lines}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: { parts: [{ text: prompt }] },
    config: { responseMimeType: 'application/json' },
  });

  const text = response.text || '';
  let parsed: { chapters: { startTimestamp: string; title: string }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Chapter AI response was not valid JSON');
    parsed = JSON.parse(m[0]);
  }

  if (!parsed?.chapters || !Array.isArray(parsed.chapters)) {
    throw new Error('Invalid chapters response');
  }

  // Convert "M:SS" timestamps back to ms
  const totalMs = turns.reduce((a, t) => a + t.durationMs, 0);
  const chaps = parsed.chapters.map(c => {
    const parts = c.startTimestamp.split(':').map(Number);
    const sec = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
    return { startMs: sec * 1000, title: c.title };
  }).sort((a, b) => a.startMs - b.startMs);

  // Attach endMs
  return chaps.map((c, i) => ({
    startMs: c.startMs,
    endMs: i + 1 < chaps.length ? chaps[i + 1].startMs : totalMs,
    title: c.title,
  }));
};

export type PhoneConvoStyle = 'podcast' | 'roast' | 'sarcastic' | 'factual' | 'devils_advocate' | 'hot_takes' | 'factcheck' | 'react' | 'experts' | 'detailed' | 'funny' | 'debate' | 'debate_sarcasm' | 'fight' | 'romantic' | 'celebrity_call' | 'ground_search' | 'explain_examples' | 'explain_funny' | 'explain_deep';

export const generatePhoneStudioScript = async (
  topic: string,
  phoneConvoStyle: PhoneConvoStyle,
  speakers: string[],
  duration: number,
  description?: string,
  contextFileContent?: string,
  model: string = 'gemini-3.8-flash',
  language: string = 'English',
  includeNarrator: boolean = false,
  youtubeComments?: string[],
): Promise<DebateSegment[]> => {
  const targetWords = duration * 150;
  const isHindi = language.toLowerCase() === 'hindi';

  const styleGuides: Record<PhoneConvoStyle, string> = {
    podcast: `Joe Rogan style casual podcast. Use phrases like "wait wait wait", "that's crazy", "what do you mean by that", "let me ask you something". Curious, open-minded. Long tangents welcome. Natural interruptions. Very conversational — as if recorded live. Mix serious points with casual banter.`,
    roast: `Comedy roast style. Each response should contain a subtle or not-so-subtle burn/jab at the other's point. Witty, sharp, sarcastic. Think: "Oh wow, groundbreaking insight from someone who…", "That's a bold take from the AI that…". Keep it funny not mean. Each speaker tries to one-up the other with sharper jokes while still making valid points.`,
    sarcastic: `Heavy sarcasm and deadpan humour throughout. Lots of "Oh sure, because THAT makes total sense", "Right, and I'm sure that worked out great", "Wow, never heard that one before". One AI is genuinely trying to make good points, the other responds with increasing sarcasm. Eventually they both become sarcastic together. Dry British-style humour.`,
    factual: `Educational but conversational. Break down complex concepts using simple analogies and real-world examples. Think "okay so imagine you're at a grocery store and…", "it's basically like when…", "the crazy thing is most people don't realize that…". Deep but accessible. Both AIs build on each other's explanations. No jargon without explanation.`,
    devils_advocate: `One AI (first speaker) is FULLY defending the topic/claim — strongly, with conviction. The other AI (second speaker) is playing devil's advocate — finding every flaw, counterexample, and logical gap in the argument. It's not a balanced debate — the second speaker is specifically trying to dismantle the first's argument. First speaker has to keep defending. Make both sides compelling.`,
    hot_takes: `Hot takes energy. Both AIs dropping controversial, provocative opinions about the topic. Think Twitter discourse, podcast clips that go viral. "Unpopular opinion but…", "I'm going to get cancelled for this but…", "Nobody wants to admit it but…". Opinions should be spicy but defensible. The other AI reacts with "WAIT. You can't just say that", "Okay that's actually kind of true though". High energy.`,
    factcheck: `One AI presents common misconceptions or popular claims about the topic. The other fact-checks them in real time — "Actually that's not quite right because…", "That's partially true but the part people miss is…", "The study that everyone cites actually said something different…". Educational myth-busting format. Both are curious, not combative. End goal: truth.`,
    react: `Reaction video energy. Both AIs are reacting to the topic as if seeing it for the first time. Strong first reactions — "Oh this is actually wild", "Wait hold on", "I did NOT expect that". Mix of hype, genuine interest, and criticism. One is more positive/hyped, the other is more skeptical/critical. Like two friends watching something together and giving live commentary.`,
    experts: isHindi
      ? 'Expert aur analytical tone. Dono agents deeply knowledgeable hain. Technical terms use karo. Data aur facts cite karo. Ek doosre ki baatein seriously lete hain.'
      : 'Expert and analytical tone. Both agents are deeply knowledgeable. Use technical terms. Cite data and facts. Take each other\'s points seriously.',
    detailed: isHindi
      ? 'Thorough aur methodical. Har point ko detail mein explain karo. Step-by-step breakdown. Koi bhi angle miss mat karo.'
      : 'Thorough and methodical. Explain each point in detail. Step-by-step breakdown. Cover every angle.',
    funny: isHindi
      ? 'Humorous aur witty tone. Jokes aur analogies use karo. Light-hearted banter. Funny examples dena. Entertainment bhi, information bhi.'
      : 'Humorous and witty tone. Use jokes and analogies. Light-hearted banter. Funny examples. Entertaining yet informative.',
    debate: isHindi
      ? 'Argumentative tone. Dono agents disagree karte hain. Challenge karo ek doosre ko. Strong opposing views rakhna. Heated but logical.'
      : 'Argumentative tone. Agents actively disagree. Challenge each other. Strong opposing views. Heated but logical.',
    debate_sarcasm: isHindi
      ? 'Debate karo lekin HEAVY sarcasm ke saath. Har counterpoint mein ek stinging sarcastic remark ho. "Oh sure, bilkul — aur shayad pigs bhi ud rahe hain." Dono sides genuinely argue karte hain lekin har line mein eye-rolls aur withering sarcasm hai.'
      : 'Full debate but EVERY counterpoint drips with sarcasm. Sharp, stinging sarcastic remarks on every response. "Oh sure, great point — maybe the sky is green too." Both sides genuinely argue but every line has eye-rolls and withering sarcasm.',
    fight: isHindi
      ? 'Yeh ek HEATED argument hai — dono ek doosre ko interrupt karte hain, frustrated hote hain, baat kaatte hain. "Bhai, tum sun hi nahi rahe!", "Mujhe mat batao kya sochna hai!" Real argument energy — emotional, intense, passionate. Lekin facts galat nahi hone chahiye.'
      : 'This is a HEATED ARGUMENT — both speakers interrupt, cut each other off, get frustrated. "You\'re not even listening!", "Don\'t tell me what to think!" Real argument energy — emotional, intense, passionate. But the facts should still be real.',
    romantic: isHindi
      ? 'Do log ek romantic situation mein baat kar rahe hain. Warm, flirty, caring tone. Dono ek doosre ki baaton mein interest lete hain. Playful banter with genuine affection. Topic ke context ko romantic angle se explore karo.'
      : 'Two people having a warm, romantic conversation about the topic. Soft, flirty, caring tone. Playful banter with genuine affection. They listen to each other deeply. Explore the topic through a romantic, emotional lens.',
    celebrity_call: isHindi
      ? 'Yeh ek intellectual celebrity phone call hai. Dono public figures ya celebrities ki tarah baat karte hain — confident, opinionated, slightly larger-than-life. Witty one-liners, strong takes, name-dropping, playful ego clashes. Like two A-listers calling each other about a hot topic.'
      : 'This is an intellectual celebrity phone call. Both speak like confident public figures — opinionated, charming, slightly larger-than-life. Witty one-liners, strong takes, name-dropping real events, playful ego clashes. Like two A-listers calling each other about a hot topic.',
    ground_search: isHindi
      ? 'Research mode — dono agents ground-level facts dhundhte hain. Har claim ke peeche actual data, studies, real examples dhundho. "Dekho, actual research kya kehti hai...", "Real numbers yeh hain...", "Yeh common myth hai, reality yeh hai..." Truth-seeking journalism energy.'
      : 'Research mode — both agents dig for ground-level facts. Back every claim with actual data, studies, real-world examples. "Let\'s look at what the actual research says...", "The real numbers are...", "That\'s a common myth — the reality is..." Truth-seeking, investigative journalism energy.',
    explain_examples: isHindi
      ? 'Topic ko REAL EXAMPLES se explain karo. Har point ke liye ek relatable, concrete example do. "Jaise agar tum ek chai stall pe ho...", "Real life mein yeh XYZ company ne kiya...", "Think of it like this..." Dono speakers milke examples build karte hain.'
      : 'Explain the topic entirely through REAL EXAMPLES. Every single point must have a concrete, relatable example. "Think of it like a coffee shop where...", "Real case: Apple did exactly this when...", "Imagine you\'re at a traffic signal and..." Both speakers build on each other\'s examples.',
    explain_funny: isHindi
      ? 'Topic ko FUNNY WAY mein explain karo — silly analogies, absurd examples, unexpected comparisons. "Yeh basically waise hai jaise agar tera pet ek startup hota...", Stand-up comedy energy mein educational content. Har explanation mein ek laugh ho. Lekin information accurate rahe.'
      : 'Explain the topic in a FUNNY, comedic way. Absurd analogies, silly comparisons, unexpected humor. "This is basically like if your stomach was a startup trying to raise a Series A...", Stand-up comedy energy meets actual education. Every explanation must land a laugh but the info must be accurate.',
    explain_deep: isHindi
      ? 'DEEP explanation mode. Har layer ke neeche aur layers hain. First principles se shuru karo. "Lekin socho kyu?" / "Iski root cause kya hai?" / "Yeh sirf surface level hai — asli cheez yeh hai..." Philosophical aur analytical depth. Nothing is taken at face value.'
      : 'DEEP explanation mode. Every layer reveals more layers underneath. Start from first principles. "But why does that even work?" / "The root cause is..." / "That\'s just surface — the real mechanism is..." Philosophical and analytical depth. Nothing is taken at face value. Go three levels deeper than anyone else would.',
  };

  const isYtClaims = contextFileContent?.startsWith('YOUTUBE_CLAIMS:') ?? false;

  // Style-specific claim dynamics for YouTube mode
  const ytClaimDynamics: Record<PhoneConvoStyle, string> = {
    podcast: `- Casually bring up each claim like you stumbled on it: "wait, they literally said X — what do you even make of that?"\n- One speaker finds it kinda believable, other pushes back with context. Natural tangents welcome.\n- Rotate who's the skeptic and who's curious. Feel like two friends going down a rabbit hole together.`,
    roast: `- Each claim is an opportunity to roast both the original speaker AND each other.\n- One defends the claim (badly, with increasingly weak arguments) — the other tears it apart with sharp wit.\n- End each claim with a devastating one-liner verdict. Switch who defends/roasts each time.`,
    sarcastic: `- Greet each claim with maximum sarcasm: "Oh WOW, shocking. Truly never heard anything like this before."\n- One is sarcastically defending it ("Sure, totally believable, very normal thing to claim") — the other is sarcastically destroying it.\n- By the end of each claim both have descended into full sarcasm together.`,
    factual: `- One speaker introduces the claim simply. The other breaks it down with real science, data, and analogies.\n- Use "okay so imagine..." and "the actual research shows..."\n- Rotate: sometimes first speaker is the educator, sometimes second.\n- Every claim gets a clear verdict: TRUE / PARTIALLY TRUE / FALSE / MISLEADING.`,
    devils_advocate: `- For each claim: one speaker FULLY defends it (finds every possible angle to justify it) — the other systematically dismantles it.\n- The defender must genuinely TRY — not strawman it. Make both sides compelling.\n- Switch who defends and who attacks on each claim.`,
    hot_takes: `- React to each claim with the spiciest possible take.\n- One says "unpopular opinion but this is actually right and here's why" — the other drops an even hotter counter-take.\n- High energy. "I cannot believe they said this but..." / "Okay this one actually goes hard though"\n- Alternate who has the hot take and who reacts.`,
    factcheck: `- One speaker presents the claim as stated. The other immediately fact-checks it in real time.\n- "Actually, the part people miss is..." / "That study everyone cites? It actually said something different..."\n- Give a clear fact-check verdict after each claim: MOSTLY TRUE / MISLEADING / FALSE / NEEDS CONTEXT.\n- Rotate fact-checker role each claim.`,
    react: `- Both react to each claim as if seeing it for the first time — raw, unfiltered reactions.\n- One is more hyped ("this is actually wild, I did not expect this"), one is more skeptical ("okay but wait, hold on").\n- Then they dig into what it actually means together.\n- Switch energy — sometimes first speaker is the skeptic, sometimes second.`,
    experts: `- Analyze each claim with expertise. Cite relevant fields, data, precedents.\n- One validates what's technically correct in the claim — the other identifies the gaps, overreach, or missing context.\n- Alternate who leads the analysis on each claim.`,
    detailed: `- Break each claim into components: What was literally said? What does it imply? What's the evidence for/against?\n- One speaker defends taking it at face value — the other adds nuance, exceptions, counterexamples.\n- Cover every angle before moving to the next claim.`,
    funny: `- Find the absurdity in each claim and run with it — funny analogies, ridiculous comparisons.\n- One defends it with increasingly silly logic — the other can't stop laughing but still makes valid points.\n- Keep it light but land actual information.`,
    debate: `- Each claim is a mini-debate. One argues FOR it, one argues AGAINST — strongly, with conviction.\n- No agreement allowed mid-debate. They can only agree in the conclusion.\n- Switch sides on each claim — the one who argued against must argue for the next one.`,
    debate_sarcasm: `- Each claim triggers a debate WITH heavy sarcasm. One defends it sarcastically ("Oh wow yes, of course this is true, obviously"), the other dismantles it sarcastically ("Right, and I'm sure that held up in literally any real-world test ever").\n- Both argue real points but every sentence drips with sarcasm.\n- Switch who's defending vs attacking each claim.`,
    fight: `- Each claim sparks a FIGHT. One speaker gets heated defending or attacking it — "That's not even close to what the data says!", "You're completely ignoring the obvious!".\n- Interruptions, frustration, talking over each other (show as em-dashes mid-sentence).\n- Still factually engaged — the fight is about genuine disagreement, not just noise.`,
    romantic: `- Discuss each claim with warmth and gentle curiosity. One asks soft questions, the other answers thoughtfully.\n- "That's interesting — makes me wonder what that really means for people like us..."\n- Explore the emotional and human angle of each claim. No harsh debate — just two people genuinely curious together.`,
    celebrity_call: `- Both speakers react to each claim like celebrities with strong public personas.\n- Confident, quotable takes. Name-drop real events. Playful ego clashes.\n- "Okay I'll be honest, I had a whole different take until I actually looked into this..." Celebrity insider energy.`,
    ground_search: `- For each claim: one speaker states it, the other immediately digs for the ground truth.\n- "What does the actual data show?" / "Who funded that study?" / "The real number is..." Investigative fact-finding.\n- Every claim gets a clear ground-truth verdict backed by real evidence.`,
    explain_examples: `- For each claim: explain it using a concrete real-world example or analogy.\n- One speaker states the claim, the other explains it with "Think of it like..." or gives a real case study.\n- Build on each other's examples to make the concept crystal clear.`,
    explain_funny: `- Explain each claim using absurd, funny analogies and ridiculous comparisons.\n- "Okay this is basically like if your immune system was a bouncer at a club who's had too much coffee..."\n- Keep it hilarious but make sure the actual explanation lands correctly.`,
    explain_deep: `- Go deep on every claim. Start from first principles. Ask "but WHY does that happen?" three times.\n- One speaker gives the surface explanation, the other keeps drilling down: "Okay but what's actually causing that?" / "One level deeper — the real mechanism is..."\n- By the end of each claim, cover root causes, second-order effects, and what most people miss.`,
  };

  const ytDynamicInstructions = isYtClaims
    ? (isHindi
        ? `\n⚠️ CONVERSATION OPENING (pehle 2 turns):\n- ${speakers[0] ?? 'Speaker 1'} seedha TOPIC/QUESTION se shuru kare — koi podcast/video reference NAHI.\n- Opening mein sirf woh MAIN QUESTION ya CLAIM uthao jo sabse interesting ya controversial hai content mein se.\n- GALAT opening: "Yaar, tune The Ranveer Show ka episode dekha?" ya "Bhai, is podcast mein unhone jo bola..."\n- SAHI opening: "Yaar, kya sach mein shadi ka future khatam ho raha hai? Mujhe lagta hai..." ya "Ek cheez jo mujhe genuinely confuse karti hai — [topic] — tum kya sochte ho?"\n- Template mat use karo — natural rakhna. Seedha point pe aao.\n- ${speakers[1] ?? 'Speaker 2'} naturally respond kare aur pehle claim ki taraf move ho.\n\n⚠️ CLAIM DISCUSSION RULES:\n- हर claim को specifically discuss करो — generic mat bolo.\n- Claim quote करो, react करो, phir context/facts/science bolo.\n- Alag alag claims par alag dynamics rakhna — kabhi ek defend kare doosra destroy kare, kabhi dono skeptical, kabhi shocked + explain.\n- Roles swap karte raho — kabhi ${speakers[0] ?? 'Speaker 1'} defend kare, kabhi ${speakers[1] ?? 'Speaker 2'}.\n- CONCLUSION (last 2 turns): Dono apna personal final take den topic par — genuine opinion, koi video rating nahi.`
        : `\n⚠️ CONVERSATION OPENING (first 1-2 turns — very important):\n- ${speakers[0] ?? 'Speaker 1'} opens by immediately stating the MAIN QUESTION or CLAIM from the content — NO show name, NO "did you watch/see" opener.\n- WRONG opening: "Okay so that [Show Name] episode with [Guest] — did you see it?" or "Hey, I just watched that [Host] podcast..."\n- RIGHT opening: "So here's what I keep thinking about — [main claim/question from the content]. Like, is that actually true?" or "I genuinely can't stop thinking about this idea — [topic]. What's your take?"\n- ${speakers[1] ?? 'Speaker 2'} responds to the QUESTION/CLAIM directly — not "oh yeah I saw that too".\n- NEVER mention a show name, podcast name, or "did you watch/see/read" in the opening.\n\n⚠️ CLAIM DISCUSSION RULES (follow exactly):\n\nSTYLE-SPECIFIC DYNAMICS FOR EACH CLAIM:\n${ytClaimDynamics[phoneConvoStyle]}\n\nGENERAL RULES:\n- Reference each claim specifically — do NOT speak generically about the topic.\n- Quote or paraphrase the claim, react to it, then dig into the real facts/science/context.\n- Vary the dynamic on each claim — do NOT repeat the same pattern twice in a row.\n- Rotate roles — sometimes ${speakers[0] ?? 'Speaker 1'} leads/defends, sometimes ${speakers[1] ?? 'Speaker 2'} does.\n\nCONCLUSION (MANDATORY — last 2 turns of the script):\n- ${speakers[0] ?? 'Speaker 1'}: Give your genuine personal take on the topic overall — what you actually believe, one clear opinion.\n- ${speakers[1] ?? 'Speaker 2'}: Give YOUR take — it must be DIFFERENT or add a new angle. Specific, not generic.\n- Conclusions must feel personal — not "great discussion" wrap-up lines.`)
    : '';

  const commentsSection = youtubeComments && youtubeComments.length > 0
    ? (isHindi
        ? `\nYOUTUBE COMMENTS (silently use karo — quote mat karo):\nNeeche real audience comments hain. Inhe DIRECTLY quote ya reference mat karo. Ye comments sirf speakers ki APNI reasoning, counterarguments, aur attacks ke liye fuel hain:\n- Ek speaker doosre ka point attack karte waqt comment ki baat apni zubaan mein bole — jaise comment ne unhe woh angle diya ho.\n- Comment ka meaning use karo, comment khud nahi. "Quote mat karo — absorb karo."\n- Agar comment skeptical hai → speaker skepticism apne argument mein inject kare.\n- Agar comment funny ya sarcastic hai → speaker usi energy se doosre ko target kare.\n- Agar comment kisi flaw point out kare → speaker woh flaw apna counterpoint bana le.\n${youtubeComments.slice(0, 60).map((c, i) => `${i + 1}. ${c.slice(0, 120)}`).join('\n')}`
        : `\nYOUTUBE COMMENTS (use silently — NEVER quote them directly):\nBelow are real audience comments on this video. DO NOT quote them, reference them, or say "someone commented...". These comments are FUEL — they give speakers extra angles, ammunition, and energy to attack each other's points with.\n\nHow to use them:\n- If a comment is skeptical → one speaker channels that skepticism as their OWN counterpoint against the other speaker.\n- If a comment calls out a flaw → a speaker uses that flaw as their attack: "but here's what you're missing..." (the comment gave them the angle, but it sounds like their own thought).\n- If a comment is funny/sarcastic → inject that same energy into how a speaker tears down the other's argument.\n- If a comment agrees with a point → use it to make one speaker more confident and forceful.\n- NEVER say "the comments say..." or "people online think..." — just use the ideas as your own.\n\nComments to absorb:\n${youtubeComments.slice(0, 60).map((c, i) => `${i + 1}. ${c.slice(0, 120)}`).join('\n')}`)
    : '';

  const contextSection = [
    description && `${isHindi ? 'विवरण' : 'Description'}: ${description}`,
    contextFileContent && (isYtClaims
      ? `${isHindi ? 'यह conversation एक REAL YouTube video के specific claims पर based है' : 'This conversation is based on SPECIFIC CLAIMS from a real YouTube video'}:\n\n${contextFileContent.slice(0, 4000)}${ytDynamicInstructions}`
      : `${isHindi ? 'संदर्भ सामग्री' : 'Reference Material'}:\n${contextFileContent.slice(0, 4000)}`),
    commentsSection,
  ].filter(Boolean).join('\n\n');

  const speakerList = speakers.length >= 2
    ? speakers.join(', ')
    : speakers.length === 1
      ? `${speakers[0]} and another AI agent`
      : 'Agent A and Agent B';

  const narratorInstructions = includeNarrator
    ? (isHindi
        ? `
NARRATOR FORMAT (IMPORTANT):
- Script को ${Math.max(2, Math.round(duration / 1.5))} sections में बाँटो।
- हर section की शुरुआत एक NARRATOR segment से करो जिसमें speaker = "NARRATOR" हो।
- NARRATOR का text एक SHORT, punchy question या topic statement हो (max 10 words), जैसे:
  "क्या AI सच में jobs ले लेगी?" या "ChatGPT vs Gemini: कौन ज़्यादा smart?"
- NARRATOR के बाद speakers उस question पर 4-6 turns discuss करें।
- Format: NARRATOR → speakers discuss → NARRATOR (next question) → speakers discuss → ...
`
        : `
NARRATOR FORMAT (IMPORTANT):
- Divide the script into ${Math.max(2, Math.round(duration / 1.5))} sections.
- Start each section with a NARRATOR segment where speaker = "NARRATOR".
- NARRATOR text must be a SHORT punchy question or topic statement (max 10 words), e.g.:
  "Will AI really replace human jobs?" or "ChatGPT vs Gemini: Who's actually smarter?"
- After each NARRATOR, speakers discuss that question for 4-6 turns.
- Pattern: NARRATOR → speakers discuss → NARRATOR (next question) → speakers discuss → ...
`
      )
    : '';

  const prompt = isHindi ? `
तुम एक phone conversation script बना रहे हो जिसमें AI agents आपस में बात कर रहे हैं।

Speakers: ${speakerList}
Topic: "${topic}"
${contextSection ? `\n${contextSection}\n` : ''}
Conversation Style: ${styleGuides[phoneConvoStyle]}
Target Duration: ${duration} minutes (~${targetWords} words total)
${narratorInstructions}
एक natural, engaging conversation generate करो जहाँ agents एक दूसरे के points पर react करें।
बातचीत podcast जैसी होनी चाहिए — agents एक दूसरे को interrupt करें, agree/disagree करें, examples दें।

ONLY valid JSON array return करो, no markdown:
[
  {"speaker": "AgentName", "text": "dialogue text here"},
  ${includeNarrator ? '{"speaker": "NARRATOR", "text": "Short question here?"},' : ''}
  ...
]

Rules:
- Har turn 2-4 sentences का हो (NARRATOR को छोड़कर — वो max 10 words)
- Agents एक दूसरे के नाम लें और points reference करें
- ${styleGuides[phoneConvoStyle]}
- Total length ~${targetWords} words
- At least ${Math.max(6, duration * 3)} turns generate करो
` : `
You are creating a phone conversation script between AI agents chatting with each other.

Speakers: ${speakerList}
Topic: "${topic}"
${contextSection ? `\n${contextSection}\n` : ''}
Conversation Style: ${styleGuides[phoneConvoStyle]}
Target Duration: ${duration} minutes (~${targetWords} words total)
${narratorInstructions}
Generate a natural, engaging conversation where agents react to each other's points.
It should feel like a podcast — agents interrupt each other, agree/disagree, give examples.

Return ONLY a valid JSON array, no markdown:
[
  {"speaker": "AgentName", "text": "dialogue text here"},
  ${includeNarrator ? '{"speaker": "NARRATOR", "text": "Short question here?"},' : ''}
  ...
]

Rules:
- Each turn 2-4 sentences (NARRATOR turns are max 10 words — short questions only)
- Agents reference each other by name and build on points
- ${styleGuides[phoneConvoStyle]}
- Total length ~${targetWords} words
- Generate at least ${Math.max(6, duration * 3)} turns
`;

  const data = await callGemini(model, [{ role: 'user', parts: [{ text: prompt }] }]);
  const raw: string = data.text ?? data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let parsed: { speaker: string; text: string }[];
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const m = jsonStr.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('Phone Studio: AI response was not valid JSON');
    parsed = JSON.parse(m[0]);
  }

  if (!Array.isArray(parsed)) throw new Error('Phone Studio: Expected JSON array');

  return parsed.map((item, i) => ({
    id: `phone-${Date.now()}-${i}`,
    speaker: item.speaker || speakers[i % speakers.length] || 'Agent',
    text: item.text || '',
  }));
};

// ─── Podcast Deep-Analysis Helpers ────────────────────────────────────────────

export interface PodcastTranscriptSeg { text: string; start: number; duration: number; }
export interface PodcastCutRange { startSec: number; endSec: number; }

export interface PodcastChapter {
  startSec: number;
  endSec: number;
  title: string;
  startQuote: string;
  endQuote: string;
  summary: string;
}

const fmtTs = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

const applyCuts = (segs: PodcastTranscriptSeg[], cuts: PodcastCutRange[]): PodcastTranscriptSeg[] => {
  if (!cuts.length) return segs;
  return segs.filter(s => {
    const mid = s.start + (s.duration || 0) / 2;
    return !cuts.some(c => mid >= c.startSec && mid <= c.endSec);
  });
};

export const analyzePodcastChapters = async (
  segments: PodcastTranscriptSeg[],
  cuts: PodcastCutRange[] = [],
  podcastTitle: string = 'this podcast',
): Promise<PodcastChapter[]> => {
  if (!segments.length) return [];
  const filtered = applyCuts(segments, cuts);
  if (!filtered.length) throw new Error('Cuts ne saara transcript khaa liya — kam cuts karo');

  // Build compact timestamped lines
  const totalSec = filtered[filtered.length - 1].start + (filtered[filtered.length - 1].duration || 0);
  const lines = filtered.map(s => `[${fmtTs(s.start)}] ${s.text.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n');

  // Cap prompt size — Gemini has limits but transcripts can be very long
  const MAX_CHARS = 90000;
  const promptBody = lines.length > MAX_CHARS
    ? lines.slice(0, MAX_CHARS) + '\n…[transcript truncated for length]'
    : lines;

  const prompt = `You are extracting the MAIN POINTS from a podcast transcript of "${podcastTitle}". You are NOT writing YouTube-style chapter markers that cover every second of the video. You are picking out the DISCRETE BIG IDEAS that this podcast actually makes — and skipping everything else.

═══ MENTAL MODEL ═══
Think of it like this: if a journalist took notes during this podcast, what would the bullet-point list of "main things they actually discussed" look like? That bullet list IS your chapter list. Each bullet = one chapter. Filler, intros, banter, tangents, transitions, ads, sponsor reads, small talk = NOT chapters. They get SKIPPED.

═══ HOW TO DO THIS (two passes — actually do this) ═══

PASS 1 — Read the entire transcript and identify the DISCRETE MAIN POINTS the conversation actually makes. Write them down as a private list. A "main point" is a specific claim, argument, story, framework, or theme the speakers genuinely develop for more than a passing moment. Greetings, "how are you", reading sponsor copy, off-topic banter, transitions, repeated reframings of the same idea — these are NOT main points.

PASS 2 — For EACH main point in your list, find the EXACT span of transcript where it lives. That span becomes one chapter. The start is the line where the speakers GENUINELY begin discussing that point (not the polite lead-in). The end is where they GENUINELY land on it before pivoting away (not the next greeting/banter).

═══ HARD RULES ═══

1. **CHAPTERS DO NOT HAVE TO COVER THE FULL TRANSCRIPT.** Most podcasts have huge amounts of non-content time — intros, ads, tangents, "by the way", "anyway", "hey check out our sponsor", random anecdotes that don't connect to a main point. **SKIP all of that.** Gaps of 2, 5, even 15 minutes between chapters are FINE if the in-between section has no main point. The chapters are the GOLD — the rest is dirt.

2. **CHAPTER LENGTH IS WILDLY VARIABLE.** Some main points are 60 seconds. Some are 18 minutes. Some are 4 minutes. DO NOT regularize. Two adjacent chapters of vastly different lengths is the CORRECT output.

3. **DO NOT INVENT EVENLY-SPACED CHAPTERS.** If your output shows chapter ends and starts at roughly even intervals (e.g. chapter 1: 0:00-5:30, chapter 2: 5:31-11:00, chapter 3: 11:01-16:30), you have FAILED — you are doing time-slot chunking, not topic extraction. Start over.

4. **EVERY CHAPTER MUST BE A SPECIFIC IDEA, NOT A SECTION OF TIME.** A bad title is "Introduction" / "First Half" / "Main Discussion" / "Wrapping Up". A good title names the actual claim or theme: "Why LLMs Don't Reason", "The Case Against Daily Standups", "What Aliens Would See in Earth Radio".

5. **3–15 chapters total**, but ONLY use as many as there are real main points. A 3-hour podcast that's mostly chit-chat with 4 real ideas → 4 chapters. A 30-minute focused interview that hits 10 distinct claims → 10 chapters. Be honest about what's actually there.

6. **NEVER cut a main point in half** to fit a quota or even out chapter sizes. If one idea takes 20 minutes to fully develop, that's one 20-minute chapter, period.

7. **startQuote / endQuote**: must be ACTUAL phrases from the transcript (10–25 words). startQuote is the moment the main point ignites. endQuote is the moment it lands / they pivot away.

8. Chapters in chronological order. NO overlaps. Gaps between chapters are FINE and expected.

═══ EXAMPLES — internalize the contrast ═══

❌ BAD (time-slot chunking — what you should NEVER produce):
  - 0:00 → 8:30   "Introduction"
  - 8:31 → 17:00  "Main discussion part 1"
  - 17:01 → 25:30 "Main discussion part 2"
  - 25:31 → 34:00 "Wrap up"

✅ GOOD (real topic extraction):
  - 4:12 → 6:08   "Why He Walked Out of His First Startup"   (1m 56s)
  - 12:40 → 14:55 "The 'Vibes Hiring' Anti-Pattern"          (2m 15s)
  - 22:30 → 41:18 "His Full Framework for Product Discovery" (18m 48s)
  - 53:00 → 56:32 "Critique of Y Combinator's New Cohort"    (3m 32s)
  - (Note: there are large gaps between these — that's correct. The gap content was banter / tangents / setup / not a main point.)

═══ OUTPUT ═══

Total transcript length: ${fmtTs(totalSec)}

Return JSON ONLY:
{
  "chapters": [
    {
      "startTimestamp": "M:SS",
      "endTimestamp": "M:SS",
      "title": "specific main-point name (4-9 words)",
      "startQuote": "actual phrase from transcript where this point ignites",
      "endQuote": "actual phrase from transcript where this point lands",
      "summary": "one-line description of the specific main point"
    }
  ]
}

Before finalizing, AUDIT your output:
- Are any two adjacent chapters at suspiciously similar lengths? If yes → you're chunking by time, redo.
- Do gaps exist between consecutive chapters? If no gaps anywhere → you covered filler, redo.
- Does each title name a SPECIFIC idea? If any are generic ("Introduction", "Discussion") → rename or remove.

Transcript:
${promptBody}`;

  const data = await callGemini('gemini-3.8-flash', [{ role: 'user', parts: [{ text: prompt }] }], {
    responseMimeType: 'application/json',
  });

  const raw: string = data.text ?? data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  let parsed: { chapters: any[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.replace(/```json\s*/gi, '').replace(/```/g, '').match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Chapter response: invalid JSON');
    parsed = JSON.parse(m[0]);
  }

  if (!parsed?.chapters?.length) throw new Error('Gemini ne chapters nahi diye');

  const toSec = (ts: string): number => {
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  };

  return parsed.chapters
    .map((c: any): PodcastChapter => ({
      startSec: toSec(c.startTimestamp || c.start || '0:00'),
      endSec: toSec(c.endTimestamp || c.end || '0:00'),
      title: (c.title || '').toString().trim() || 'Untitled chapter',
      startQuote: (c.startQuote || '').toString().trim(),
      endQuote: (c.endQuote || '').toString().trim(),
      summary: (c.summary || '').toString().trim(),
    }))
    .filter(c => c.endSec > c.startSec)
    .sort((a, b) => a.startSec - b.startSec);
};

export interface DetectedSpeakers {
  host: string;
  guests: string[];
}

export const detectPodcastSpeakers = async (args: {
  title: string;
  description: string;
  uploader?: string;
  transcriptSample?: string;
}): Promise<DetectedSpeakers> => {
  const { title, description, uploader, transcriptSample } = args;

  const prompt = `Identify the HOST(s) and GUEST(s) of this podcast from the metadata below.

PODCAST TITLE: ${title || '(none)'}
CHANNEL / UPLOADER: ${uploader || '(none)'}
DESCRIPTION: ${description || '(none)'}
${transcriptSample ? `\nTRANSCRIPT FIRST 800 CHARS (only if host/guest introduce themselves):\n${transcriptSample.slice(0, 800)}\n` : ''}

RULES:
- "host": the primary person/people running the show. Usually matches the channel name (e.g. "Lex Fridman Podcast" → "Lex Fridman", "The Joe Rogan Experience" → "Joe Rogan"). If two hosts, pick the main one.
- "guests": the people being interviewed on this episode. Could be 0, 1, or more. Look for "with [Name]", "featuring [Name]", "guest: [Name]", "[Name] on [topic]", or names mentioned in title that aren't the host.
- Return real human names only — not titles, not "the host", not channel suffixes ("Podcast", "Show", "Clips").
- If you genuinely cannot determine a host or guest, return empty string / empty array. DO NOT invent names.

Return JSON ONLY:
{ "host": "First Last or empty", "guests": ["First Last", ...] }`;

  try {
    const data = await callGemini('gemini-3.1-flash-lite', [{ role: 'user', parts: [{ text: prompt }] }], {
      responseMimeType: 'application/json',
    });
    const raw: string = data.text ?? data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    let parsed: any;
    try { parsed = JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }
    const host = (parsed?.host || '').toString().trim();
    const guests = Array.isArray(parsed?.guests)
      ? parsed.guests.map((g: any) => (g || '').toString().trim()).filter(Boolean)
      : [];
    return { host, guests };
  } catch {
    return { host: '', guests: [] };
  }
};

export type PodcastAnalysisVariant = 'adaptive' | 'funny' | 'friendly' | 'clip_take';

// Single-speaker "Clip Reaction" — intro template + take + takeaways, max ~5 min.
// Person / verb / topic are auto-extracted from the transcript by Gemini.
// Optional overrides are accepted but rarely needed.
export const generateClipTakeScript = async (
  args: {
    segments: PodcastTranscriptSeg[];
    chapter?: PodcastChapter;
    chapters?: PodcastChapter[];
    podcastTitle: string;
    analystName: string;        // the single speaker reacting to the clip
    podcastHost?: string;       // hint for auto-detect (who is speaking in the clip)
    podcastGuests?: string[];   // hint for auto-detect
    // Optional overrides — if empty, Gemini auto-extracts each from the transcript.
    personInClip?: string;      // e.g. "Elon Musk" — host or guest, whoever is talking
    actionVerb?: string;        // e.g. "talks about" / "explains" / …
    topicHeading?: string;      // short heading e.g. "AI feature risks…"
    extraFocus?: string;
    useGoogleGrounding?: boolean;
  },
): Promise<{ speaker: string; text: string }[]> => {
  const { segments, chapter, chapters: chaptersArg, analystName, podcastHost, podcastGuests, extraFocus, useGoogleGrounding } = args;

  const personOverride = (args.personInClip || '').trim();
  const verbOverride   = (args.actionVerb   || '').trim();
  const topicOverride  = (args.topicHeading || '').trim();
  const autoDetect = !personOverride || !verbOverride || !topicOverride;

  const chapters: PodcastChapter[] = chaptersArg && chaptersArg.length
    ? [...chaptersArg].sort((a, b) => a.startSec - b.startSec)
    : (chapter ? [chapter] : []);
  if (!chapters.length) throw new Error('Koi chapter select nahi kiya gaya');

  const chapterSegs = segments.filter(s => {
    const mid = s.start + (s.duration || 0) / 2;
    return chapters.some(c => mid >= c.startSec && mid <= c.endSec);
  });
  if (!chapterSegs.length) throw new Error('Selected chapter me transcript content nahi mila');

  const transcriptText = chapterSegs.map(s => `[${fmtTs(s.start)}] ${s.text}`).join('\n');
  const transcriptCapped = transcriptText.length > 22000
    ? transcriptText.slice(0, 22000) + '\n…[transcript truncated]'
    : transcriptText;

  // Build the INTRO instruction. If overrides given, use them literally; else
  // ask Gemini to extract person/verb/topic from the transcript itself.
  const knownPeople = [podcastHost, ...(podcastGuests || [])].filter(Boolean).join(', ');
  const introInstruction = autoDetect
    ? `EXTRACT three things from the TRANSCRIPT below — do NOT use placeholders, fill in real values:
  • PERSON: the real full name of the main speaker in the clip (the one whose ideas dominate). ${knownPeople ? `Known people on this show: ${knownPeople}.` : ''} If a guest is the dominant voice, use the guest's name; if it's the host, use the host's name. Use a real human name — never "the speaker" / "the host" / "the guest".
  • VERB: pick ONE verb phrase that best fits what the speaker is doing in the clip. Choose from: talks about / explains / breaks down / argues / exposes / reveals / warns about / reacts to / shares.
  • TOPIC: a short, specific topic phrase (5-12 words) that captures the actual subject of the clip — concrete, not vague. Avoid "this topic" / "various things".

Then write the FIRST turn EXACTLY as: "In this clip <PERSON> <VERB> about <TOPIC>. Let's watch — then I'll give my take on this." — substituting the real values you extracted. No quotes, no brackets around the substitutions. Output that line as the first turn. Nothing else in this turn.`
    : `The FIRST and ONLY turn of this phase MUST be EXACTLY this sentence, with no prelude, no greeting, no extra wording:
"In this clip ${personOverride} ${verbOverride} about ${topicOverride}. Let's watch — then I'll give my take on this."
Output that single line as the first turn. Nothing else in this turn.`;

  const prompt = `You are writing a SINGLE-SPEAKER reaction script for "${analystName}", who is reacting to a clip from a YouTube video.

STRUCTURE — EXACTLY 3 SECTIONS, in this order. NEVER add a fourth section. The whole output is just these three parts.

═══ SECTION 1 — INTRO (exactly 1 turn — MANDATORY FIXED OPENING) ═══
${introInstruction}

═══ SECTION 2 — MAIN BODY · MY ANALYSIS (4-6 turns total — NOT MORE) ═══
${analystName}'s personal take on the clip. Treat this as ONE cohesive analysis block split into 4-6 longer turns (3-5 sentences each, ~30-45 sec spoken per turn).
- Walk through the 4-6 MOST IMPORTANT POINTS from the clip — pick the strongest ones, drop the rest. One point per turn.
- For each turn: briefly paraphrase the claim (1 sentence), THEN react with your own analysis / agreement / pushback / context (2-4 sentences).
- Explain technical jargon FROM BASICS in 1-2 sentences inside the same turn before using it ("quick context — X is basically...").
- Confident, conversational, smart-friend energy. Real spoken English with contractions. No filler.
- ${useGoogleGrounding ? 'Where useful, weave in LATEST facts / data / events / studies from search.' : ''}
- DO NOT split a single point into multiple short turns. Each turn = one complete thought.
- DO NOT exceed 6 turns in this section.

═══ SECTION 3 — TAKEAWAYS (exactly 3 turns — CLOSING) ═══
- Turn 1 MUST start with EXACTLY this phrase: "First takeaway from this is" — then complete the first takeaway in 1-2 sentences.
- Turn 2: "Second takeaway —" or "And the second thing —" followed by takeaway 2 in 1-2 sentences.
- Turn 3: "And finally —" or "Last one —" followed by takeaway 3 in 1-2 sentences. End cleanly. No "thanks for watching" sign-off.

TOTAL TURN COUNT: 8-10 turns (1 intro + 4-6 body + 3 takeaways). Never more.
LENGTH CAP — DO NOT EXCEED ~750 WORDS TOTAL across all turns combined (target ~5 minutes). If unsure, err shorter, not longer.

TONE: Single-speaker reflection. Articulate, opinionated, warm, smart-friend voice. Not lecture-y. Not formal. Real spoken English with contractions.

${extraFocus ? `EXTRA FOCUS FROM USER: ${extraFocus}\n` : ''}
CLIP TRANSCRIPT (paraphrase, react — don't quote whole blocks):
${transcriptCapped}

Return ONLY a JSON array. No markdown. No preamble. ${autoDetect
    ? 'The first item\'s text MUST follow the exact shape "In this clip <real-person-name> <verb> about <real-topic>. Let\'s watch — then I\'ll give my take on this." with the actual values you extracted — never literal placeholders.'
    : `The first item's text MUST be EXACTLY: "In this clip ${personOverride} ${verbOverride} about ${topicOverride}. Let's watch — then I'll give my take on this."`}
Just:
[
  { "speaker": "${analystName}", "text": "In this clip ... ... about .... Let's watch — then I'll give my take on this." },
  { "speaker": "${analystName}", "text": "..." }
]`;

  const config: any = {};
  if (useGoogleGrounding) {
    config.tools = [{ googleSearch: {} }];
  } else {
    config.responseMimeType = 'application/json';
  }

  const data = await callGemini('gemini-3.8-flash', [{ role: 'user', parts: [{ text: prompt }] }], config);
  const raw: string = data.text
    ?? data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('')
    ?? '';

  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  let parsed: { speaker: string; text: string }[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('Clip Reaction: invalid JSON from Gemini');
    parsed = JSON.parse(m[0]);
  }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error('Clip Reaction: empty script');

  // Force every speaker label to analystName (single-speaker invariant)
  return parsed.map(t => ({ speaker: analystName, text: (t.text ?? '').toString() })).filter(t => t.text);
};

export const generatePodcastDeepAnalysisScript = async (
  args: {
    segments: PodcastTranscriptSeg[];
    chapter?: PodcastChapter;
    chapters?: PodcastChapter[];
    podcastTitle: string;
    podcastHost?: string;
    podcastGuests?: string[];
    supporterName: string;
    criticName: string;
    extraFocus?: string;
    useGoogleGrounding?: boolean;
    variant?: PodcastAnalysisVariant;
  },
): Promise<{ speaker: string; text: string }[]> => {
  const { segments, chapter, chapters: chaptersArg, podcastTitle, podcastHost, podcastGuests, supporterName, criticName, extraFocus, useGoogleGrounding } = args;
  const variant: PodcastAnalysisVariant = args.variant ?? 'adaptive';

  const chapters: PodcastChapter[] = chaptersArg && chaptersArg.length
    ? [...chaptersArg].sort((a, b) => a.startSec - b.startSec)
    : (chapter ? [chapter] : []);
  if (!chapters.length) throw new Error('Koi chapter select nahi kiya gaya');

  // Extract transcript from any selected chapter range (skips the gap between them)
  const chapterSegs = segments.filter(s => {
    const mid = s.start + (s.duration || 0) / 2;
    return chapters.some(c => mid >= c.startSec && mid <= c.endSec);
  });

  if (!chapterSegs.length) throw new Error('Selected chapters me koi transcript content nahi mila');

  // Build chapter-by-chapter transcript blocks so the LLM knows where each chapter starts/ends
  const chapterBlocks = chapters.map((c, i) => {
    const segs = chapterSegs.filter(s => {
      const mid = s.start + (s.duration || 0) / 2;
      return mid >= c.startSec && mid <= c.endSec;
    });
    const body = segs.map(s => `[${fmtTs(s.start)}] ${s.text}`).join('\n');
    return `=== CHAPTER ${i + 1}: "${c.title}" (${fmtTs(c.startSec)} → ${fmtTs(c.endSec)}) ===\n${c.summary ? `Focus: ${c.summary}\n` : ''}${body}`;
  });
  const fullText = chapterBlocks.join('\n\n');
  const chapterTextCapped = fullText.length > 30000
    ? fullText.slice(0, 30000) + '\n…[transcript truncated]'
    : fullText;

  const isMulti = chapters.length > 1;
  const chapterListLine = chapters.map((c, i) => `${i + 1}. "${c.title}" (${fmtTs(c.startSec)} → ${fmtTs(c.endSec)})`).join('\n');
  const focusLine = chapters.map(c => c.summary || c.title).join(' | ');

  const prompt = `You are writing a DEEP ANALYSIS DISCUSSION script between two analysts who are reacting to and discussing ${isMulti ? `${chapters.length} podcast chapters back-to-back` : 'a podcast segment'}. They are NOT recreating the podcast — they are talking ABOUT what was said.

PODCAST: "${podcastTitle}"
${isMulti ? `CHAPTERS UNDER DISCUSSION (${chapters.length}):\n${chapterListLine}` : `CHAPTER TITLE: "${chapters[0].title}"\nCHAPTER TIME: ${fmtTs(chapters[0].startSec)} → ${fmtTs(chapters[0].endSec)}`}
CHAPTER FOCUS: ${focusLine}${isMulti ? `\n\nMULTI-CHAPTER RULE: Cover BOTH chapters in the discussion. After exploring chapter 1, the analysts naturally transition to chapter 2 (e.g. "next they pivot to...", "later in the episode they get into..."). Each chapter gets meaningful airtime — don't let one swallow the other. Surface connections / contrasts between the two chapters where they genuinely exist.` : ''}

SPEAKERS (these are the two analysts, NOT the podcast hosts):
- "${supporterName}" → leans toward seeing what's RIGHT and INTERESTING about what the podcast says. Builds on points, adds supporting context, defends the strong takes.
- "${criticName}" → leans skeptical / curious-pushback. Spots gaps, missing nuance, weak assumptions. NOT a knee-jerk disagreer — when a point is genuinely solid, ${criticName} ADMITS it and explains WHY it's solid (then maybe adds nuance). Mindless contrarianism is forbidden.

${variant === 'funny' ? `
TONE — FUNNY / SARCASTIC:
The whole conversation has comedic, lightly sarcastic energy. Witty one-liners, playful jabs at the podcast guest AND at each other, deadpan observations. The points still land — the humour is the wrapper, not a replacement for substance. Not mean — funny. Both speakers are in on the joke.
` : variant === 'friendly' ? `
TONE — FRIENDLY CHAT:
Two friends discussing the chapter over coffee. Warm, curious, no adversarial framing. They riff together, share what struck them, build on each other's reactions. Mild disagreement is fine but the default mode is exploring TOGETHER, not arguing. "Yeah and the other thing that hit me…", "Oh totally, and what I loved was…", "Hmm I read that differently though — what about…". Interesting > combative.
` : `
TONE — ADAPTIVE (this is the most important rule for this style):
BEFORE writing, JUDGE the chapter's content and pick the right register. Different parts of the chapter may call for different registers — switch within the script as the content shifts.

  1. SERIOUS ANALYTICAL CONTENT (claims about facts, science, politics, business, public figures, public policy, controversial claims about external things):
     → Full supporter-vs-critic dynamic. Push back, find logical gaps, demand evidence, disagree when justified.

  2. CASUAL / FUNNY / SHIT-TALK (banter, jokes, light stories, "guys hanging out" energy, ribbing each other):
     → DO NOT argue. Both analysts find it interesting / funny. Comment on what was said in an entertaining way, riff on the moment, share a related thought. Light teasing of the podcast guests is fine. No critic mode. No "let me dismantle this banter".

  3. PERSONAL STORY / LIFE EXPERIENCE (someone sharing a personal journey, memory, emotion, relationship moment):
     → Respond with WARMTH and CURIOSITY. NEVER criticize the person's choices, feelings, or lived experience. Reflect on what's interesting, relate it to broader human themes, share what it makes you think about. The analyst might one of them share a parallel of their own ("yeah this reminds me of…") rather than analyse the person.

  4. PERSONAL PREFERENCE / TASTE ("I love X", "my favourite Y is Z", "I think this place is beautiful"):
     → Do NOT criticize the preference itself. You can't tell someone their favourite restaurant is wrong. You CAN ask "what about it specifically", compare to your own taste, gently push on the *reasoning* if they gave one — but NEVER mock or invalidate the preference. "Mujhe Taj Mahal pasand hai" cannot be rebutted.

  5. MIXED CONTENT (most real chapters):
     → Switch registers as the content shifts. Critic-mode on the analytical claims, warm/curious on the personal parts, interesting-commentary on the banter. Same two speakers, fluid register.

THE CRITIC IS NOT A KNEE-JERK DISAGREER (this overrides everything above):
- When the podcast makes a point that is actually GOOD / TRUE / WELL-REASONED, ${criticName} explicitly admits it and explains why it's solid — then may add nuance.
- Sometimes ${criticName} fully agrees and ${supporterName} adds the nuance. Mix who plays which role.
- "Auto-disagreement" reads as fake and is FORBIDDEN.
`}

CONCEPT BRIDGING — TEACH WHEN IT'S NEEDED, SKIP WHEN IT'S NOT (apply throughout the script):

When the chapter mentions a TERM, FRAMEWORK, EVENT, FIGURE, or IDEA that a smart-but-non-expert listener probably doesn't know cold, ONE analyst (whoever is leading that beat) drops a quick 1-2 sentence plain-English "basics bridge" THE FIRST TIME it's mentioned — before going into the deeper take. Keep it conversational, not Wikipedia-style. The OTHER analyst then immediately continues the analysis, building on top of it.

✅ BRIDGE when the chapter mentions things like:
   - Technical jargon ("quantitative easing", "neuroplasticity", "principal-agent problem", "RAG pipeline")
   - Niche concepts / theories / frameworks ("Dunbar's number", "Overton window", "first-mover advantage")
   - People / events the listener may not recognise ("the Volcker shock", "Renaissance Technologies", "what George Soros did in '92")
   - Domain-specific phrases used as shorthand ("zero-day", "alpha", "p-value", "fiat", "M2 supply")
   - Anything where the host/guest assumes background knowledge the average listener lacks

   Example pattern:
   "${supporterName}: They're banking on a 'flywheel effect' here — quick context, that just means each part of the business makes the next part easier, so growth compounds. And what's sharp is..."
   "${criticName}: Right, but the flywheel only spins if [actual analysis]..."

❌ DO NOT bridge — there's nothing to explain — when the chapter is about:
   - Personal preference / taste ("I love Paris", "Mujhe Taj Mahal pasand hai", "my favourite restaurant is X") — preferences aren't concepts.
   - Personal stories / memories / emotions
   - Common everyday things everyone already knows ("traffic", "school", "marriage", "money")
   - Casual banter / jokes / shit-talk
   - Already-mainstream ideas the average listener clearly knows ("inflation", "AI is rising", "social media is addictive")

   If you're not sure whether to bridge: ask "would a smart 22-year-old who doesn't work in this field need this?" — if no, skip the bridge.

BRIDGE RULES:
- 1-2 sentences MAX. Land it inside an analyst's existing turn — don't make it a separate "explanation turn".
- Plain language, no textbook tone. Use "basically", "quick context —", "for anyone unfamiliar —", "the idea is —".
- ONCE per term per script. Don't re-explain something already bridged.
- The bridge should make the ANALYSIS that comes right after make sense — it's a setup for the punchline, not a tangent.

STRUCTURE the script as follows:

A. **Opening Hook** (1-2 turns) — IN MEDIAS RES
   Open as if the two analysts are ALREADY mid-conversation about this idea — they've already established context off-screen. Drop the listener straight into the SPECIFIC CLAIM or argument being discussed. The first line is a sharp, opinionated reaction to a concrete claim — not a setup, not a recap, not a "let me tell you what we just watched".

   ❌ FORBIDDEN OPENERS (do NOT use any of these patterns — they make the discussion sound like a YouTube reaction video):
     - "So, I was listening to..." / "I just watched..." / "We watched this clip..."
     - "On ${podcastTitle}, the part where they say..."
     - "Have you seen the new ${podcastTitle} episode?"
     - "${supporterName}: Today we're going to talk about..."
     - Any opener that announces the podcast or chapter as if introducing it to a viewer.

   ✅ CORRECT FEEL (mid-conversation, content-first):
     "${supporterName}: Okay, the [specific claim from the chapter — name it directly] — that's actually a sharper point than people are giving them credit for."
     "${criticName}: Sharper? It only sounds sharp because they smuggled in an assumption. Watch — [zeroes in on the load-bearing flaw]."
   Notice: no "I was listening to", no podcast announcement, no greeting. They're already deep in it.

B. **Topic-by-topic Deep Dive** (${isMulti ? '18-24' : '12-18'} turns)
   Identify ${isMulti ? '3-5 SPECIFIC sub-topics per chapter (across BOTH chapters — clearly bridge from one chapter to the next mid-discussion)' : '3-5 SPECIFIC sub-topics inside this chapter'} (specific claims, framings, or moments). For EACH sub-topic:
   - One analyst introduces it by referencing what the podcast host actually said — paraphrase the SPECIFIC line/claim, don't speak generically. "Next, [podcast host] argues that [actual claim]..." / "Then they pivot to [specific framing]..."
   - If that sub-topic contains an unfamiliar term/concept (per the CONCEPT BRIDGING rules above), the introducing analyst drops the 1-2 sentence bridge inside their turn BEFORE the analysis lands.
   - The other reacts with their stance (supporter / critic depending on who's leading) — and must respond to the SPECIFIC claim, not vague "yeah I see what you mean" filler.
   - They go BACK AND FORTH 2-4 turns per sub-topic — surface point → critical take → counter → concession or reframe.
   - Use natural, spoken language. Contractions. Reactions. Interruptions ("wait, hold on..."). Don't be academic.
   - Reference real-world examples, data, or context where it lands naturally. ${useGoogleGrounding ? 'Use the LATEST facts / events / statistics / studies you can find via search.' : ''}
   - NO PADDING — every turn must add a new thought, example, counter, or nuance. Banned filler patterns: "That's a great point", "I totally agree, and I'd add...", "Exactly, and what's interesting is...", "Yeah no for sure...". Each turn EARNS its slot.
   - VARY RHYTHM — mix short jabs (1 sentence) with longer analytical turns (4-5 sentences). All-uniform-length turns feel robotic.

${variant === 'friendly' ? `C. **One Moment of Light Difference** (2-3 turns) — OPTIONAL
   If there's a natural place where ${supporterName} and ${criticName} read something differently, let it surface gently. Not a confrontation — a "huh, I saw that differently" moment that opens up the topic further. If nothing in the chapter genuinely invites disagreement (e.g. it's all personal stories or shared taste), SKIP this beat entirely.

D. **Final Wrap** (2 turns at the very end)
   - ${supporterName}: "what stuck with me from this" — a few warm, conversational takeaways.
   - ${criticName}: "yeah, and the thing I'm still chewing on is…" — what's interesting, what's still open, anything that gave them pause. NOT a "concerns" list — a friendly reflection.` : variant === 'funny' ? `C. **The Disagreement Beat** (2-3 turns) — OPTIONAL
   If the chapter has a serious claim worth landing a punch on, ${supporterName} and ${criticName} disagree with comedic energy — sarcastic jabs, witty pushback. If the chapter is pure banter / personal story with nothing to actually disagree about, SKIP this beat.

D. **Final Wrap** (2 turns at the very end)
   - ${supporterName}: a punchy takeaway — what actually worked, delivered with comedic timing.
   - ${criticName}: a sharp/sarcastic counter-beat — what was sus, weak, or pure copium — delivered with humour, not bitterness.` : `C. **Disagreement Beat** (2-3 turns) — ONLY IF JUSTIFIED BY THE CONTENT
   If the chapter has substantive analytical claims worth disputing, this is the spot where ${supporterName} and ${criticName} clearly disagree about an interpretation. Let it breathe — they don't resolve it cleanly. That's the realism.
   IMPORTANT: If the chapter is mostly personal story, banter, or shared taste (i.e. there's nothing genuinely *worth* disagreeing about), DO NOT force an artificial disagreement. SKIP this beat and let the discussion stay curious/warm.

D. **Final Wrap** (2 turns at the very end — adapt to what the chapter actually was)
   - ${supporterName}: closing reflection — for analytical chapters this is "what this podcast actually got RIGHT — what we should walk away learning" (2-4 positive takeaways). For personal/casual chapters this is "what stuck with me from this" (warm, conversational).
   - ${criticName}: closing reflection — for analytical chapters this is "what's CONCERNING / what to be careful about" (2-4 concerns, sharp but not bitter). For personal/casual chapters this is "yeah, and what I'm still thinking about is…" — open-ended reflection, NOT a concerns list. Match the register of the chapter, not a hardcoded template.`}

${(podcastHost || (podcastGuests && podcastGuests.length)) ? `PODCAST PEOPLE (use these EXACT names when the analysts refer to who said what):
${podcastHost ? `- HOST: ${podcastHost}` : ''}
${podcastGuests && podcastGuests.length ? `- GUEST(S): ${podcastGuests.join(', ')}` : ''}

` : ''}NATURAL REFERENCING RULES:
- Speakers refer to the podcast host(s) and guest(s) by their REAL NAMES${podcastHost ? ` (host is ${podcastHost}${podcastGuests && podcastGuests.length ? `, guest${podcastGuests.length > 1 ? 's are' : ' is'} ${podcastGuests.join(', ')}` : ''})` : ''}. If a name is unknown, use "the host", "they", "the guest" — do NOT invent names.
- Use phrases like: "next, ${podcastHost || '[host]'} talks about...", "first thing I noticed was when ${podcastGuests && podcastGuests[0] ? podcastGuests[0] : '[the guest]'} said...", "${podcastHost || '[the host]'} pushes back, asking — what's your take?", "this is where I push back...", "exactly the part that's bothering me too".
- DO NOT roleplay AS the podcast host or guest. The analysts are OUTSIDE the podcast looking in.
- DO NOT invent quotes the host/guest didn't say — paraphrase from the transcript below.
- **NEVER open with viewer-commentary phrasing.** The first sentence of the script MUST NOT contain: "I was listening to", "I just watched", "we watched this clip", "I want to talk about", "today we're discussing", "on ${podcastTitle}", "in this episode of", or any phrase that introduces the podcast to a third-party viewer. The two analysts assume the listener already knows what they're discussing — they go straight into the SPECIFIC CLAIM.
- The analysts are NOT TV hosts addressing an audience. They are two thinkers in the middle of an argument with each other.

LENGTH: ${isMulti ? '28-36' : '22-28'} turns total, alternating naturally (not strictly). Each turn = 2-5 sentences of natural spoken English.

${extraFocus ? `EXTRA FOCUS FROM USER: ${extraFocus}\n` : ''}
THE ${isMulti ? 'CHAPTER TRANSCRIPTS' : 'CHAPTER TRANSCRIPT'} (this is what the analysts are reacting to — paraphrase, don't quote whole blocks):
${chapterTextCapped}

Return ONLY a JSON array. No markdown. No preamble. Just:
[
  { "speaker": "${supporterName}", "text": "..." },
  { "speaker": "${criticName}", "text": "..." }
]`;

  const config: any = {};
  if (useGoogleGrounding) {
    config.tools = [{ googleSearch: {} }];
  } else {
    config.responseMimeType = 'application/json';
  }

  const data = await callGemini('gemini-3.8-flash', [{ role: 'user', parts: [{ text: prompt }] }], config);

  const raw: string = data.text
    ?? data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('')
    ?? '';

  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  let parsed: { speaker: string; text: string }[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('Deep analysis: invalid JSON from Gemini');
    parsed = JSON.parse(m[0]);
  }

  if (!Array.isArray(parsed) || !parsed.length) throw new Error('Deep analysis: empty script');

  return parsed
    .map(t => ({
      speaker: (t.speaker || '').toString().trim() || supporterName,
      text: (t.text || '').toString().trim(),
    }))
    .filter(t => t.text.length > 0);
};

// ─── Podcast Pro — best-moment finder → tightener → POV1/POV2 reaction script ─
// Fully-automatic pipeline: given a raw transcript, (1) find the best
// standalone-clip-worthy stretches, (2) tighten the top pick down to a
// duration budget without losing substance, (3) write a two-voice POV1/POV2
// reaction script over just the kept parts.

export interface PodcastBestSegment {
  label: string;
  start_sec: number;
  end_sec: number;
  reason: string;
}

export interface PodcastKeepRange { start_sec: number; end_sec: number; }

const buildTimestampedLines = (segs: PodcastTranscriptSeg[]): string =>
  segs.map(s => `${fmtTs(s.start)} ${s.text.replace(/\s+/g, ' ').trim()}`).join('\n');

const capTranscript = (text: string, maxChars = 90000): string =>
  text.length > maxChars ? text.slice(0, maxChars) + '\n…[transcript truncated for length]' : text;

export const findBestPodcastSegments = async (
  segments: PodcastTranscriptSeg[],
  maxSpanSec: number,
): Promise<PodcastBestSegment[]> => {
  if (!segments.length) return [];
  const transcript_text = capTranscript(buildTimestampedLines(segments));

  const prompt = `You are analyzing the full timestamped transcript of a podcast episode to find
the best self-contained stretches for a short reaction/commentary video.

Identify up to 5 of the BEST, most distinct segments — each a single coherent topic, story, or exchange that
works as a standalone clip, no longer than ${maxSpanSec} seconds. Rank them best (most compelling,
surprising, or discussion-worthy) first. Pick genuinely DIFFERENT topics from each other, not overlapping
picks of the same exchange.

For each, give: a short label (max 8 words) naming the topic, the start_sec and end_sec it spans (from the
transcript timestamps below — pick natural boundaries, e.g. where the conversation turns to a new topic, not
mid-sentence), and a one-sentence reason it's compelling.

Timestamped transcript ("MM:SS text" per line):
${transcript_text}

Return ONLY a JSON array of up to 5 objects, ranked best first, no prose, no markdown fences:
[{"label": "...", "start_sec": <float>, "end_sec": <float>, "reason": "..."}, ...]`;

  const data = await callGemini('gemini-3.8-flash', [{ role: 'user', parts: [{ text: prompt }] }], {
    responseMimeType: 'application/json',
  });
  const raw = extractGeminiText(data);
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('Best-moment finder: invalid JSON from Gemini');
    parsed = JSON.parse(m[0]);
  }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error('Best-moment finder: Gemini returned no segments');

  return parsed
    .map((s: any): PodcastBestSegment => ({
      label: (s.label || '').toString().trim() || 'Untitled moment',
      start_sec: Number(s.start_sec) || 0,
      end_sec: Number(s.end_sec) || 0,
      reason: (s.reason || '').toString().trim(),
    }))
    .filter(s => s.end_sec > s.start_sec);
};

export const tightenPodcastSegment = async (
  segments: PodcastTranscriptSeg[],
  candidate: PodcastBestSegment,
  maxSpanSec: number,
  paddingSec: number = 90,
): Promise<PodcastKeepRange[]> => {
  const fallback: PodcastKeepRange[] = [{ start_sec: candidate.start_sec, end_sec: candidate.end_sec }];
  if (!segments.length) return fallback;

  const windowStart = Math.max(0, candidate.start_sec - paddingSec);
  const windowEnd = candidate.end_sec + paddingSec;
  const windowSegs = segments.filter(s => {
    const mid = s.start + (s.duration || 0) / 2;
    return mid >= windowStart && mid <= windowEnd;
  });
  const transcript_text = capTranscript(buildTimestampedLines(windowSegs.length ? windowSegs : segments));

  const prompt = `A broad candidate stretch of a podcast episode was picked as worth building
a video around — the host/guest discussing ONE topic. Your job is to select which PARTS of it to actually KEEP
so the full discussion of that topic stays completely covered, while cutting out slow, repetitive, or
tangential parts — the total KEPT duration must be no more than ${maxSpanSec} seconds (${(maxSpanSec / 60).toFixed(1)} min).
Nothing important about the topic should end up missing; this is about tightening, not shortening the
substance.

Candidate topic: "${candidate.label}"
Rough original range: ${candidate.start_sec}s to ${candidate.end_sec}s

Timestamped transcript around that range ("MM:SS text" per line, wider than the candidate so you can see where
it actually starts/ends):
${transcript_text}

Return a list of KEEP ranges, in chronological order, each a natural stretch (never cut mid-sentence). One
range if the whole thing is worth keeping as-is; more than one only if there's a genuinely slow/off-topic
stretch in the middle worth cutting. Ranges must not overlap, and their combined duration must be
<= ${maxSpanSec} seconds.

Return ONLY a JSON object, no prose, no markdown fences:
{"keep_ranges": [{"start_sec": <float>, "end_sec": <float>}, ...]}`;

  const data = await callGemini('gemini-3.8-flash', [{ role: 'user', parts: [{ text: prompt }] }], {
    responseMimeType: 'application/json',
  });
  const raw = extractGeminiText(data);
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  let parsed: { keep_ranges: any[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Tighten segment: invalid JSON from Gemini');
    parsed = JSON.parse(m[0]);
  }

  const ranges = (parsed?.keep_ranges || [])
    .map((r: any): PodcastKeepRange => ({ start_sec: Number(r.start_sec) || 0, end_sec: Number(r.end_sec) || 0 }))
    .filter(r => r.end_sec > r.start_sec)
    .sort((a, b) => a.start_sec - b.start_sec);

  return ranges.length ? ranges : fallback;
};

export const generatePOVReactionScript = async (args: {
  segments: PodcastTranscriptSeg[];
  keepRanges: PodcastKeepRange[];
  label: string;
  podcastTitle?: string;
  podcastHost?: string;
  podcastGuests?: string[];
  pov1Name?: string;
  pov2Name?: string;
  useGoogleGrounding?: boolean;
  language?: string;
}): Promise<{ speaker: 'pov1' | 'pov2'; text: string; timestamp_sec?: number }[]> => {
  const { segments, keepRanges, label, podcastTitle, podcastHost, podcastGuests, useGoogleGrounding } = args;
  const languageName = (args.language || '').trim() || 'English';

  const keptSegs = segments.filter(s => {
    const mid = s.start + (s.duration || 0) / 2;
    return keepRanges.some(r => mid >= r.start_sec && mid <= r.end_sec);
  });
  if (!keptSegs.length) throw new Error('POV script: kept transcript is empty');
  const transcript_text = capTranscript(buildTimestampedLines(keptSegs));

  const totalKeptSec = keepRanges.reduce((a, r) => a + (r.end_sec - r.start_sec), 0);
  const subTopicNote = totalKeptSec < 90
    ? 'likely just 1-2 sub-topics for a clip this short — do not force more than the content actually has'
    : totalKeptSec < 240
      ? 'likely 2-3 distinct sub-topics'
      : 'likely 3-5 distinct sub-topics';
  const turnCountNote = `TURN COUNT: aim for roughly one full exchange (2-6 turns, per the adaptive-tone rule above) per sub-topic — for a clip about ${fmtTs(totalKeptSec)} long, a natural total is somewhere around ${Math.max(6, Math.round(totalKeptSec / 12))} turns. Don't pad to hit a number — stop once the sub-topics are genuinely covered.`;

  const researchBlock = useGoogleGrounding
    ? 'RESEARCH: Google Search grounding is available — use it to pull real, current facts, sources, and context for the FILL MISSING CONTEXT / FACT-CHECK jobs below. Only cite what search actually surfaces.\n'
    : 'RESEARCH: no live search for this run — rely on your own knowledge, and if you are not confident something is accurate, say so plainly rather than inventing a specific.\n';

  const extraContextParts = [
    podcastTitle && `Podcast: "${podcastTitle}"`,
    podcastHost && `Host: ${podcastHost}`,
    podcastGuests && podcastGuests.length ? `Guest(s): ${podcastGuests.join(', ')}` : null,
    `Clip topic: "${label}"`,
  ].filter(Boolean);
  const extraContextBlock = extraContextParts.length ? `CONTEXT:\n${extraContextParts.join('\n')}\n` : '';

  const prompt = `You are writing a two-person reaction/analysis script for two distinct voices,
POV1 and POV2, reacting to and discussing a real podcast clip. They are NOT recreating the podcast — they are
two sharp, well-informed people talking ABOUT what was said, already mid-conversation about it.

POV1 tends to run point — picking up on what was just said, filling in real missing context, adding what they
themselves know that goes beyond what was already said in the clip. POV2 is the more skeptical read — pushing
back with real counter-reasoning, spotting gaps or flawed claims — BUT NOT ALWAYS: when a point is genuinely
solid, POV2 just agrees and supports it, backing it up with their own better knowledge rather than repeating
what was already said. Auto-disagreement reads as fake and is forbidden; so is auto-agreement everywhere —
react to what's ACTUALLY being said, not from a fixed role. Mix who plays which role turn to turn; this is a
real exchange, not two fixed positions repeating themselves.

ADAPT THE TONE TO WHAT'S ACTUALLY BEING DISCUSSED — don't force the same "debate" shape onto every sub-topic,
and stay flexible enough that this works whether the clip is a serious interview, casual banter, or a personal
story, not just one fixed genre:
  - A checkable factual/statistical claim → genuine debate is fair game: push back, fact-check, disagree with
    real reasoning.
  - A personal story or experience (something that happened to them, an opinion about their own life/taste) —
    don't argue with it or nitpick it. React with warm curiosity, or add a genuinely interesting related
    thought/knowledge. The ONLY exception: if it's dressed up as a big, confident-sounding factual or
    pseudo-scientific claim with nothing real backing it — call that out plainly, once, then move on. Don't
    turn an ordinary personal anecdote into a fact-checking session.
  - Casual banter or a joke in the clip → just react to it naturally (amused, surprised, whatever fits) — not
    every line needs a counter-argument.
  Both speakers should recognize which of these a sub-topic is and match their energy to it — arguing about
  EVERYTHING, all the time, reads exhausting and fake. Real conversations move between real pushback, easy
  agreement, and just riffing on something interesting.

KEEP THE LANGUAGE SIMPLE — plain, everyday words a normal listener actually uses, not academic or jargon-heavy
phrasing. Don't turn a sub-topic into a vocabulary lesson or a debate about terminology — if a term genuinely
needs explaining, the quick one-line bridge below is enough; otherwise there's usually a normal person's
OPINION or REACTION to have, not a definition to argue about.

The extra context below usually includes the ACTUAL TRANSCRIPT of this specific clip — that is your primary
material. Identify SPECIFIC sub-topics from it (specific claims, framings, or moments — ${subTopicNote}). For
EACH sub-topic:
  - One side introduces it by referencing what was actually said, specifically — not generically. "What he
    just said about [specific claim]..." / "The part where [specific moment]..." — never philosophizing about
    the broader topic in a way that could be copy-pasted onto any other episode about roughly the same subject.
  - If that sub-topic mentions a term, event, or name a smart-but-non-expert listener likely doesn't know, the
    introducing turn drops a quick 1-2 sentence plain-English bridge for it BEFORE the analysis lands — once
    per term, conversational ("quick context — that's basically X —"), never textbook-toned.
  - The other reacts to that SPECIFIC claim — never vague filler ("that's interesting", "I see your point").
  - Go BACK AND FORTH on it for as many turns as that sub-topic actually earns (per the adaptive-tone rule
    above): 2-4 turns of surface point → pushback/fact-check → counter → concession for a genuinely debatable
    claim; fewer, warmer turns for a personal story or casual moment that doesn't call for pushback at all.
    It's good for one side to concede a specific point before raising a sharper one — real disagreement has
    texture, it isn't wall-to-wall opposition.

Two concrete jobs a turn can do, grounded in the research block below:
  - FILL MISSING CONTEXT: the clip mentions something real without explaining it — supply the actual missing
    piece, specifically. "What he just said about the UAE — that's referring to [real event]. [Real outlet]
    covered it at the time, and [specific real person] was involved."
  - FACT-CHECK A CLAIM: the clip states something checkable — say whether it holds up, citing what the
    research block actually supports (a real source name if one is given). "That claim that sugar is
    healthy — there's no real science behind that; [real source, if given] actually found the opposite."
Never invent a specific study, institution, name, or statistic that isn't in the research/context below —
vague ("there's real research on this") beats a fabricated specific ("a University of X study found...") every
time; if the research doesn't cover something, say plainly it's unverified rather than making it up.

Every turn must earn its slot — NO PADDING. Banned filler that adds nothing: "That's a great point", "I
totally agree, and I'd add...", "Exactly, and what's interesting is...", "Yeah no for sure...". VARY RHYTHM —
mix short one-sentence jabs with longer 3-5 sentence turns; uniform-length turns read robotic and scripted.

OPENING — IN MEDIAS RES: the first turn drops straight into the specific claim being discussed, as if this
conversation was already underway. NEVER open with "So I was listening to...", "We just watched this clip...",
"On [show], the part where...", "Today we're talking about...", or anything that introduces/announces the
clip to a viewer — that reads like a reaction-video intro, not two people already deep in conversation.

EXAMPLE OF THE RIGHT FEEL (the actual claim/topic/names below are placeholders — write about what THIS clip
actually said, never reuse this example's content, only its shape: specific, varied turn length, real texture):
  POV1: Okay, the bit where he said [specific claim] — that's a sharper point than people are giving him credit for.
  POV2: Sharper? It only sounds sharp because he skipped a step — [specific counter-reasoning naming the gap].
  POV1: Fair, that gap's real. But even with it, the core mechanism still holds up, because [reason] — and that
    part people are sleeping on.
  POV2: Okay, I'll give you that much.
Notice the shape: short jab, medium pushback, a longer turn that both concedes AND argues further, then a
short close. That mix of short and long IN THE SAME EXCHANGE — not every turn the same length — is what makes
it read as real people, not a scripted back-and-forth.

${turnCountNote}

CLOSING: the FINAL POV1 and FINAL POV2 turns land as a short, punchy bottom-line take each — POV1 on what
actually held up / was worth taking seriously, POV2 on what's still shaky or worth being careful about. Adapt
to what the clip actually was; don't force a disagreement that isn't genuinely there.

If a TIMESTAMPED transcript of this clip is given below (lines starting "MM:SS"), give every turn a
"timestamp_sec" — the real moment (matching one of those marks) it's actually reacting to or discussing.
Spread turns across DIFFERENT moments rather than clustering on one, unless the discussion genuinely keeps
returning to the same moment. Write the exchange in roughly the SAME chronological order as the transcript —
a turn responding to another should sit at essentially the same moment as the turn it's responding to, not a
different one. If no timestamped transcript is given, omit "timestamp_sec" entirely (don't guess one).

Language: ${languageName}. Tone: serious, thoughtful, genuinely engaging — never a comedy bit, never mean-
spirited toward the real people in the clip; disagree with IDEAS, not attack people.
${researchBlock}${extraContextBlock}
TIMESTAMPED TRANSCRIPT OF THIS CLIP ("MM:SS text" per line):
${transcript_text}

Return ONLY a JSON array, no prose, no markdown fences — omit "timestamp_sec" on any turn it doesn't apply to:
[{"speaker": "pov1", "text": "...", "timestamp_sec": 42}, {"speaker": "pov2", "text": "...", "timestamp_sec": 97}, ...]`;

  const config: any = {};
  if (useGoogleGrounding) {
    config.tools = [{ googleSearch: {} }];
  } else {
    config.responseMimeType = 'application/json';
  }

  const data = await callGemini('gemini-3.8-flash', [{ role: 'user', parts: [{ text: prompt }] }], config);
  const raw = extractGeminiText(data);
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('POV script: invalid JSON from Gemini');
    parsed = JSON.parse(m[0]);
  }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error('POV script: empty script');

  return parsed
    .map((t: any) => {
      const speaker: 'pov1' | 'pov2' = (t.speaker || '').toString().trim().toLowerCase() === 'pov2' ? 'pov2' : 'pov1';
      const timestamp_sec = Number.isFinite(Number(t.timestamp_sec)) && t.timestamp_sec !== undefined && t.timestamp_sec !== null
        ? Number(t.timestamp_sec)
        : undefined;
      return { speaker, text: (t.text || '').toString().trim(), timestamp_sec };
    })
    .filter(t => t.text.length > 0);
};
