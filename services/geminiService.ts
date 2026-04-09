import { GoogleGenAI, Type, Modality, ThinkingLevel } from "@google/genai";
import { TranscriptSegment, DebateSegment, DebateSpeaker } from "../types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getApiKey = () => {
  // Check multiple potential locations for the API key
  // 1. window.process.env (dynamic runtime injection)
  // 2. process.env (baked in at build time)
  // 3. import.meta.env (Vite standard)
  
  const apiKey = (window as any).process?.env?.API_KEY ||
                 (window as any).process?.env?.GEMINI_API_KEY ||
                 process.env.API_KEY || 
                 process.env.GEMINI_API_KEY || 
                 (import.meta as any).env?.VITE_API_KEY ||
                 (import.meta as any).env?.VITE_GEMINI_API_KEY ||
                 (import.meta as any).env?.API_KEY ||
                 (import.meta as any).env?.GEMINI_API_KEY;
                 
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please set GEMINI_API_KEY in the AI Studio Settings menu.");
  }
  return apiKey;
};

export type ThumbnailVideoStyle = 'situational' | 'debate' | 'podcast' | 'explained' | 'professor_jiang';

const getTitleStylePrompt = (style: ThumbnailVideoStyle): string => {
  if (style === 'explained') {
    return `
You are a YouTube copywriter for "Explained" channels that do book summaries, biographies, and topic breakdowns.
Read the script and generate 4 direct, conversational YouTube titles — the kind that NAME the topic clearly and invite the viewer to learn it with you.

STYLE: Direct + Conversational. No clickbait tricks. The title should tell exactly what the video is about, but make it sound exciting.

REQUIREMENTS:
1. ALWAYS name the exact topic/book/person/concept from the script — never be vague.
2. Sound like you are talking TO the viewer — warm, confident, inviting.
3. ALWAYS write in English only — do NOT use Hindi, Hinglish, or any other language.
4. The title should feel like the presenter just sat down and is starting the video.
5. 55-75 characters max. Complete and readable.

FORMATS to vary across 4 options:
- Direct intro style: "The Full Story Of [Topic] — Everything Explained"
- Conversational hook: "Have You Heard About [Topic]? Here's The Truth"
- Bold claim: "[Topic] — The [Key Insight] Nobody Talks About"
- Punchy: "[Topic]: The [Angle] No One Explained"

EXAMPLES (if topic is "Robert Greene's 48 Laws of Power"):
- "48 Laws of Power — The Book That Changes How You See The World"
- "Robert Greene's 48 Laws of Power Fully Explained"
- "What Is 48 Laws of Power? Robert Greene's Complete Secret"
- "48 Laws of Power Explained: The Formula To Understand Power"

Return ONLY a valid JSON array of 4 strings. No markdown.
    `;
  }
  if (style === 'situational') {
    return `
    You are a YouTube copywriter specializing in personal story and emotional content.
    Read the script and generate 4 highly clickable YouTube titles that feel deeply personal, relatable, and emotionally resonant.

    Requirements:
    1. First-person or story-driven: "I Lost Everything...", "Nobody Warned Me About This", "My Life Changed After..."
    2. Make the viewer feel "this is literally my situation" or "I need to watch this"
    3. Emotional words: "Broke Me", "Changed Everything", "Nobody Told Me", "I Finally Understood", "Worst Mistake"
    4. Under 65 characters. No generic clickbait — must feel like a real person's real story.
    5. ALWAYS write titles in English only — do NOT use Hindi or Hinglish.
    6. Return ONLY a valid JSON array of exactly 4 strings. No markdown.
    `;
  }
  if (style === 'debate') {
    return `
    You are a YouTube copywriter specializing in debate, opinion, and controversy content.
    Read the script and generate 4 highly clickable YouTube titles that feel confrontational, opinionated, and debate-worthy.

    Requirements:
    1. Two-sides framing: "X vs Y: Who's Actually Right?", "Why Everyone Is WRONG About X", "The REAL Truth About X"
    2. Challenge conventional wisdom: "Stop Believing This About X", "X Is A Lie — Here's Proof"
    3. Strong opinion words: "EXPOSED", "DEBUNKED", "The REAL Truth", "WRONG", "FIGHT BACK", "Unpopular Opinion"
    4. Under 65 characters. Must feel like a hot debate, not a tutorial.
    5. ALWAYS write titles in English only — do NOT use Hindi or Hinglish.
    6. Return ONLY a valid JSON array of exactly 4 strings. No markdown.
    `;
  }
  if (style === 'professor_jiang') {
    return `
You are a YouTube copywriter for serious current-events analysis channels — think Fox News, CNN Breaking, geopolitical commentary. Titles must feel urgent, important, and analytical.

Read the script and generate 4 highly clickable YouTube titles for a BREAKING NEWS ANALYSIS video. The topic is a real current event.

STYLE: Urgent, authoritative, analytical. Makes the viewer feel they MUST watch this RIGHT NOW to understand what just happened.

REQUIREMENTS:
1. Name the SPECIFIC event, country, leader, or policy from the script — never vague
2. Feel like a breaking news chyron or urgent editorial — serious, not sensational gossip
3. Use power words: "EXPLAINED", "BREAKING", "REAL REASON", "WHAT THIS MEANS", "NOBODY IS SAYING", "THE TRUTH"
4. Under 70 characters. Clear, readable.
5. ALWAYS write titles in English only — do NOT use Hindi or Hinglish.
6. Mix formats across 4 options.

FORMATS to vary:
- Urgent question: "Why Did [Event] Happen? The Answer Will Shock You"
- Bold claim: "[Leader/Country] Just Changed Everything — Here's Why"
- Analysis hook: "The REAL Reason Behind [Event] Nobody Is Talking About"
- Prediction: "What [Event] Means For [Country/World] In The Next 6 Months"

Return ONLY a valid JSON array of 4 strings. No markdown.
    `;
  }
  // podcast / default
  return `
    You are an expert YouTube strategist and copywriter.
    Read the ENTIRE script to deeply understand the core topic, context, and main conflict or value proposition.
    Generate 4 highly clickable, catchy, viral-style YouTube video titles.

    Requirements:
    1. Topic MUST be immediately clear.
    2. Hook/Curiosity: intense FOMO or curiosity bait.
    3. Strong words: "Exposed", "The Truth", "Why You're Wrong", "Secret", "Nobody Talks About This"
    4. Under 60 characters so they don't get cut off on mobile.
    5. ALWAYS write titles in English only — do NOT use Hindi or Hinglish.
    6. Return ONLY a valid JSON array of exactly 4 strings. No markdown.
  `;
};

export const generateTitles = async (scriptText: string, videoStyle: ThumbnailVideoStyle = 'podcast'): Promise<string[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const variationSeed = Math.floor(Math.random() * 9999);
  const prompt = `
    ${getTitleStylePrompt(videoStyle)}
    
    Generate completely fresh titles — do NOT repeat or paraphrase any previously generated titles. Variation seed: ${variationSeed}.
    
    Script:
    ${scriptText}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
      config: {
        temperature: 1.2,
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
    console.error("Error in generateTitles:", error);
    throw error;
  }
};

const getThumbnailTextStylePrompt = (style: ThumbnailVideoStyle): string => {
  if (style === 'explained') {
    return `
You are a thumbnail copywriter for "Explained" YouTube channels. Write SHORT text that appears ON the thumbnail image — this is the BIG BOLD TEXT overlay, not the title.

STYLE: Direct, name-drops the topic. Inviting and informative — not shock clickbait.

CRITICAL RULE — NAME THE TOPIC:
The text must say or strongly hint at the exact subject. Vague generic text like "EXPLAINED" alone is useless.
BAD: "EXPLAINED" / "THE TRUTH"
GOOD: "48 LAWS" / "ROBERT GREENE" / "THE SECRET" / "THE BOOK"

Generate exactly 5 options with VARIETY:
- Option 1: Topic name directly in CAPS (e.g. "48 LAWS OF POWER")
- Option 2: Short punchy hook (e.g. "READ THIS NOW!" / "POWER SECRETS")
- Option 3: Action/invitation (e.g. "FULL STORY" / "EVERYTHING EXPLAINED")
- Option 4: Ultra-short 2 words (e.g. "MUST READ" / "LIFE CHANGING")
- Option 5: One punchy insight from the topic (e.g. "POWER WINS" / "RULES MATTER")

RULES:
- Max 4 words each
- CAPS for the topic name and power words
- ALWAYS write in English only — do NOT use Hindi or Hinglish
- Must feel like it belongs on a clean explained thumbnail with a face
- Return ONLY a valid JSON array of exactly 5 strings. No markdown.
    `;
  }
  if (style === 'situational') {
    return `
You are a world-class YouTube thumbnail copywriter. Your job: write BIG BOLD TEXT that appears on a thumbnail image.

STYLE: Emotional personal story — raw, real, relatable. NOT generic clickbait.

CRITICAL RULE — TOPIC SPECIFICITY:
Every option MUST hint at the actual topic from the script. Generic phrases like "It Broke Me" or "My Biggest Regret" that could apply to ANY video are FORBIDDEN unless combined with a topic hint.
BAD: "It Broke Me" (could be anything)
GOOD: "My Job Broke Me..." (topic: job loss)
BAD: "Everything Is Over" (too vague)
GOOD: "My Relationship Ended..." (topic: relationship)

Generate exactly 5 options with VARIETY — not all the same tone:
- Option 1: Pure emotional first-person with topic hint (e.g. "Lost Everything at 40...")
- Option 2: The unspoken truth about this topic (e.g. "Nobody Warns You About This")
- Option 3: Raw confession style (e.g. "I Was So Wrong...")
- Option 4: The question this person is living (e.g. "Can I Still Fix This?")
- Option 5: The hardest moment, specific (e.g. "That One Phone Call...")

RULES:
- Max 5 words each — short and heavy
- Trailing "..." welcome for emotion
- One word can be light caps (CAPS for 1 word max)
- NO generic topic-free phrases
- ALWAYS write in English only — do NOT use Hindi or Hinglish
- Return ONLY a valid JSON array of exactly 5 strings. No markdown.
    `;
  }
  if (style === 'debate') {
    return `
You are a world-class YouTube thumbnail copywriter. Your job: write BIG BOLD TEXT that appears on a debate thumbnail.

STYLE: Bold, confrontational, two-sides battle — makes you pick a side immediately.

CRITICAL RULE — TOPIC SPECIFICITY:
The thumbnail text MUST reference the actual debate topic from the script. Generic "WHO'S RIGHT?" or "EXPOSED!" with no topic context are weak.
BAD: "WHO'S RIGHT?" (could be anything)
GOOD: "Is MARRIAGE Over?" (topic: marriage debate)
BAD: "BOTH WRONG?"
GOOD: "BOTH Sides LYING?" (keeps confrontation + hints)

Generate exactly 5 options with VARIETY:
- Option 1: Direct yes/no question about THIS topic (e.g. "Is Hustle Culture DEAD?")
- Option 2: Explosive claim about THIS topic (e.g. "MARRIAGE Is A TRAP")  
- Option 3: Challenge conventional wisdom (e.g. "Stop Believing This LIE")
- Option 4: Bold accusation (e.g. "They LIED To You!" / "You're Being FOOLED")
- Option 5: Censored-style if controversial (e.g. "It's All BULL**IT") — use * for letters

RULES:
- Max 5 words each
- ALL CAPS for 1-2 key power words
- ! or ? welcome
- Censored style (F**K, BULL**IT) only if topic is genuinely controversial
- ALWAYS write in English only — do NOT use Hindi or Hinglish
- Return ONLY a valid JSON array of exactly 5 strings. No markdown.
    `;
  }
  if (style === 'professor_jiang') {
    return `
You are a thumbnail copywriter for breaking news and current-events analysis channels. Write the BIG BOLD TEXT that appears on the thumbnail — the 2-4 word SHOCKER in huge yellow/white caps on a red breaking news banner.

STYLE: Fox News Alert / CNN Breaking — urgent, declarative, impossible to ignore. The text tells you something massive just happened.

CRITICAL RULE — TOPIC SPECIFIC:
The text MUST hint at the actual event from the script. Generic "IT'S OVER" with no context is weak.
BAD: "IT'S OVER" (could be anything)
GOOD: "TRADE WAR OVER" (topic: US-China trade deal)
BAD: "BREAKING NEWS"
GOOD: "CEASEFIRE BROKEN" (topic: ceasefire collapse)

Generate exactly 5 options with VARIETY:
- Option 1: 2-3 word declarative statement (e.g. "SYSTEM FAILING", "DEAL COLLAPSED")
- Option 2: Quoted speech style (e.g. "IT'S OVER", "WE LOST") — with quote marks 
- Option 3: Action claim (e.g. "WAR STARTS NOW", "RATES FROZEN")
- Option 4: Urgent warning (e.g. "WATCH THIS NOW", "DON'T MISS THIS")
- Option 5: Verdict style (e.g. "CHINA WINS", "TRUMP BLINKS", "INDIA LOSES")

RULES:
- Maximum 4 words each — shorter is more powerful
- ALL CAPS — this is a breaking news chyron
- No trailing "..." — declarative and final
- Must feel like it belongs on a red news alert banner
- Return ONLY a valid JSON array of exactly 5 strings. No markdown.
    `;
  }
  // podcast / default
  return `
You are a world-class YouTube thumbnail copywriter. Your job: write BIG BOLD TEXT for a podcast-style thumbnail.

STYLE: Shocking, curiosity-driven, high-energy — Joe Rogan / MrBeast energy. Makes you stop scrolling.

CRITICAL RULE — TOPIC SPECIFICITY:
The text must hint at the actual topic/person/revelation from the script. Pure generic shock with no content hook is weak.
BAD: "Gone FOREVER" (could be anything)
GOOD: "He LEFT It All..." (topic: someone who quit everything)
BAD: "The Truth REVEALED"
GOOD: "The REAL Story Finally" (still vague but slightly better — prefer specific)

Generate exactly 5 options with VARIETY:
- Option 1: Shocking revelation about THIS topic (e.g. "He Knew All Along...")
- Option 2: Explosive question (e.g. "She Said WHAT To Him?!")
- Option 3: The bombshell moment (e.g. "It's OVER For Real")
- Option 4: Raw honest reaction (e.g. "Nobody Saw This Coming!")
- Option 5: Censored shock (e.g. "That Was F***ING Crazy") — only if warranted

RULES:
- Maximum 4-6 words each
- ALL CAPS for 1-2 shock words
- Ellipsis (...) or !? for drama
- Censored style (F***ING, SH*T) only if content warrants
- ALWAYS write in English only — do NOT use Hindi or Hinglish
- Return ONLY a valid JSON array of exactly 5 strings. No markdown.
  `;
};

export const generateThumbnailText = async (scriptText: string, videoStyle: ThumbnailVideoStyle = 'podcast'): Promise<string[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const variationSeed = Math.floor(Math.random() * 9999);
  const prompt = `
    ${getThumbnailTextStylePrompt(videoStyle)}

    Generate completely fresh thumbnail text options — do NOT repeat any previously generated options. Variation seed: ${variationSeed}.

    Content:
    ${scriptText}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
      config: {
        temperature: 1.2,
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
    console.error("Error in generateThumbnailText:", error);
    throw error;
  }
};

export const generateTitleTextPair = async (scriptText: string, videoStyle: ThumbnailVideoStyle = 'situational'): Promise<{ title: string; thumbnailText: string }[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const styleGuide = videoStyle === 'situational'
    ? `STYLE — Situational / Personal Story:
TITLE RULES:
- Tell a SPECIFIC personal story hook. Use real numbers/timeframes/emotions. 55-70 chars.
- MUST feel like the person is confessing something shocking or deeply personal.
- BAD: "A Lot Happened In My Life" (too vague)
- GOOD: "I Found Out After 3 Years — My Company Was Destroying Me"
- GOOD: "Rs 40 Lakh Gone In One Night — Never Make This Mistake"

THUMBNAIL TEXT RULES:
- 2-4 words. ALL CAPS. The EMOTIONAL PUNCH that the title builds toward.
- Must ADD a new dimension, never repeat title words.
- BAD: "LIFE RUINED" (repeats title idea)
- GOOD (for "lost money" title) → "NO ESCAPE" / "TRUTH HIDDEN" / "TOO LATE NOW"
- Together they hint at a story bigger than either alone.`

    : videoStyle === 'debate'
    ? `STYLE — Debate / Two Sides:
TITLE RULES:
- Name the TWO SPECIFIC sides clearly. Real names, real stakes, real tension. 55-70 chars.
- MUST create a "who's right?" tension the viewer wants resolved.
- BAD: "Is Hustle Culture Right?" (no stakes, too safe)
- GOOD: "Sandeep Maheshwari vs Vivek Bindra — Who Is Actually Telling The Truth?"
- GOOD: "Delhi vs Mumbai: Who Makes More Money And Why?"

THUMBNAIL TEXT RULES:
- 2-4 words. CONFRONTATIONAL CAPS. Name one side's verdict or the clash itself.
- BAD: "BIG FIGHT" (generic)
- GOOD: "BINDRA EXPOSED" / "DELHI WINS" / "BOTH WRONG"`

    : videoStyle === 'explained'
    ? `STYLE — Explained / Educational YouTube:
TITLE RULES:
- NAME the exact topic, book, person, country, or concept directly. No vague hooks. 55-75 chars.
- Conversational — like a friend saying "let me explain this to you…"
- BAD: "A Book That Changes Everything" (no name)
- GOOD: "48 Laws of Power — The Book That Changed How The World Works"
- GOOD: "The Real Truth About The Israel-Hamas War — What Media Won't Tell You"

THUMBNAIL TEXT RULES:
- 2-4 words CAPS. NAME the core concept or drop the most shocking fact.
- BAD: "MUST WATCH" (says nothing)
- GOOD: "48 LAWS" / "WAR TRUTH" / "REAL REASON" / "HIDDEN TRUTH"`

    : videoStyle === 'professor_jiang'
    ? `STYLE — Breaking News / Current Events Analysis (Fox News Alert style):
TITLE RULES:
- NAME the specific country/leader/event/organization. Sound like a breaking news headline. 55-70 chars.
- MUST include: WHO did WHAT and WHY it matters — like a news editor wrote it.
- BAD: "Something Big Is About To Happen In The World" (zero information)
- BAD: "Trump Did Something" (too vague)
- GOOD: "Trump Just Put 145% Tariffs On China — What Does This Mean For India?"
- GOOD: "Fed Refused To Cut Rates — Why Hasn't The Dollar Crashed Yet?"
- GOOD: "Russia-Ukraine Deal — What Are Putin's Real Demands?"
- GOOD: "China Backed Down — Is This America's Victory Or A Trap?"

THUMBNAIL TEXT RULES:
- 2-4 words ALL CAPS. Must be a FOX NEWS ALERT chyron — shocking, declarative, punchy.
- Pick the MOST EXPLOSIVE outcome/actor/fact FROM THIS SPECIFIC SCRIPT. Make the viewer feel dread or urgency.
- BAD: "BIG NEWS" / "BREAKING" / any phrase that could apply to ANY topic (too generic)
- The text MUST be invented fresh from the script — do NOT copy or reuse example phrases below. Examples are only to show the TONE and STRUCTURE, not the words.
- TONE CATEGORIES (use as inspiration for structure only — create your own words from the script):
  Defeat/Surrender tone: "[ACTOR] TRAPPED" / "[COUNTRY] SURRENDERED" / "[PARTY] CORNERED"
  Economy/Currency tone: "[CURRENCY] CRASHES" / "[INSTITUTION] FAILED" / "[MARKET] COLLAPSED"  
  War/Deal tone: "[DEAL NAME] BROKEN" / "LAST [X]" / "NO RETURN"
  Power-shift tone: "[WINNER] WINS" / "[LOSER] FALLS" / "[COUNTRY] RISES"
  Urgency tone: "TOO LATE" / "IT ENDS" / "POINT CROSSED"
- Each combo must generate a DIFFERENT thumbnail text — never repeat the same phrase across the 3 combos.
- Together = feels like a BREAKING STORY viewers CANNOT ignore.`

    : `STYLE — Podcast / High Energy:
TITLE RULES:
- Drop a specific bombshell or reveal. Name names. Use real numbers. 55-65 chars.
- MUST make viewer feel: "I need to know what happened here"
- BAD: "The Story Of A Man Who Got Very Rich"
- GOOD: "He Quit A Rs 2 Crore Job — And Moved Back To His Village. Here's Why."
- GOOD: "Parag Agrawal Joined Twitter For $5M — Here's What You Don't Know"

THUMBNAIL TEXT RULES:
- 2-4 words explosive CAPS. Amplifies the title's most shocking element.
- BAD: "CRAZY STORY" (no info)
- GOOD: "HE QUIT IT ALL" / "PARAG EXPOSED" / "REAL REASON"`;

  const variationSeed = Math.floor(Math.random() * 9999);
  const prompt = `You are India's top viral YouTube content strategist — you've helped channels like NDTV, ABP, Dhruv Rathee, and Ranveer Allahbadia crack 10M+ views with title+thumbnail combos.

YOUR TASK: Read the script carefully. Extract the MOST SHOCKING, SPECIFIC, INTERESTING element. Then write 3 killer combos. Variation seed: ${variationSeed} — generate fresh output every time, never repeat previous runs.

${styleGuide}

━━━ GLOBAL RULES (apply to ALL styles) ━━━
1. SPECIFICITY IS EVERYTHING — generic titles get skipped. Every title must NAME something real from the script: a person, a country, a number, an event, a year.
2. Each of the 3 combos must approach the SAME topic from a DIFFERENT ANGLE:
   - Combo 1: Lead with the SHOCKING OUTCOME / consequence
   - Combo 2: Lead with the MYSTERY / hidden reason ("Real Reason", "The Truth Nobody Says", "What Nobody Mentions")  
   - Combo 3: Lead with the PERSONAL STAKES for the viewer ("What This Means For You", "Why You Should Care", "Your Life Changes")
3. Thumbnail text MUST complement the title — NEVER echo the same words.
4. DO NOT copy or reuse example phrases verbatim — all examples in the style guide above are only to show FORMAT and TONE. Your output must be freshly written from the actual script content.
5. Each of the 3 thumbnail texts must be DIFFERENT from each other — vary the words, angle, and emotional hook.
6. Language: ALWAYS write titles and thumbnail text in English only — do NOT use Hindi, Hinglish, or any other language, regardless of the script language.
7. Return ONLY valid JSON array of exactly 3 objects: [{"title": "...", "thumbnailText": "..."}, ...]

SCRIPT TO ANALYZE:
${scriptText.slice(0, 3500)}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', temperature: 1.2 },
    });
    const raw = response.text?.trim() || '[]';
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Expected array from AI');
    return parsed
      .filter((p: any) => p && typeof p.title === 'string' && typeof p.thumbnailText === 'string')
      .slice(0, 3);
  } catch (error: any) {
    if (error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429) {
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
    }
    console.error("Error in generateTitleTextPair:", error);
    throw error;
  }
};

export const generateThumbnailInspiration = async (scriptText: string, videoStyle: ThumbnailVideoStyle = 'situational'): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `You are a creative YouTube thumbnail director. Read the script below and write a short, specific thumbnail art direction in 2-4 sentences.

SCRIPT (first 2000 chars):
${scriptText.slice(0, 2000)}

STYLE: ${videoStyle}

Your output should describe:
1. WHO should appear (person type, age, gender, look — e.g. "stressed middle-aged man in plain shirt", "young confident woman in business attire", "tired working-class man in his 40s")
2. EXPRESSION / MOOD (e.g. "shocked and overwhelmed", "quietly sad", "determined and angry")
3. BACKGROUND / ATMOSPHERE (e.g. "dark red dramatic background", "moody office blur", "gritty urban night")
4. TEXT STYLE (e.g. "bold white sans-serif", "yellow highlight box", "red accent on key word")

${videoStyle === 'situational' ? 'Single person composition — person right side, text left side.' : ''}

Write in plain English. No bullet points. No JSON. Just a short, crisp art direction paragraph (2-4 sentences max) that a thumbnail designer can immediately follow.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
      model: 'gemini-3-flash-preview',
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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
      model: 'gemini-3-flash-preview', 
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
  model: string = 'gemini-3.1-flash-lite-preview',
  language: string = 'English',
  style: 'debate' | 'debate2' | 'conversational' | 'formal debate' | 'explained' | 'explained_solo' | 'image' | 'podcast_breakdown' | 'podcast_panel' | 'context_bridge' | 'situational' | 'documentary' | 'joe_rogan' | 'finance_deep_dive' | 'professor_jiang' = 'debate',
  speakerCount: number = 2,
  providedSpeakerNames?: string[],
  specificDetails?: string,
  youtubeUrl?: string,
  commentsFileContent?: string
): Promise<DebateSegment[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
          नीचे दी गई script को बिना कोई बदलाव किए, बिना कुछ जोड़े या हटाए, सिर्फ speaker के हिसाब से अलग-अलग segments में बाँटो।

          Script:
          """
          ${customScript}
          """

          RULES:
          1. Script में जो speakers हैं, उन्हें exactly वैसे ही detect करो जैसे script में लिखे हैं। कोई नया नाम मत दो।
          2. हर speaker का text उसी के segment में डालो — text में एक भी word मत बदलो।
          3. Narration या description (जो किसी speaker का नहीं है) को "Narrator" speaker के under रखो।
          4. अगर script में speaker clearly marked नहीं है (कोई tag नहीं है), तो context देखकर logically assign करो — लेकिन text मत बदलो।
          5. Output ONLY valid JSON array of segments। कोई extra text, explanation, या markdown नहीं।

          Output format:
          [
            {"speaker": "Speaker Name", "text": "Exact text from script"},
            {"speaker": "Speaker Name", "text": "Next segment text"},
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
          Split the script below into speaker segments. Do NOT change, add, or remove any text — only identify who is speaking each part.

          Script:
          """
          ${customScript}
          """

          RULES:
          1. Detect speakers exactly as they appear in the script. Do NOT invent or rename speakers.
          2. Keep every word of each speaker's text exactly as written — no edits, no paraphrasing.
          3. Any narration or unattributed text that is not a speaker goes under "Narrator".
          4. If the script has no explicit speaker labels, assign segments logically based on context — but do not change the words.
          5. Output ONLY a valid JSON array of segments. No extra text, explanations, or markdown.

          Output format:
          [
            {"speaker": "Speaker Name", "text": "Exact text from script"},
            {"speaker": "Speaker Name", "text": "Next segment text"},
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

  const tools: any[] = [{ googleSearch: {} }];
  if (youtubeUrl) {
    tools.push({ urlContext: {} });
  }

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: prompt }] },
      config: {
        tools,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH
        }
      }
    });

    let jsonText = response.text || "[]";
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
      model: 'gemini-3-flash-preview',
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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
      model: 'gemini-3-flash-preview',
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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
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

// ── Step 1: Extract style from reference image (pure inspection, no generation) ──
const extractStyleFromImage = async (
  ai: GoogleGenAI,
  referenceImage: { data: string; mimeType: string }
): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            data: referenceImage.data,
            mimeType: referenceImage.mimeType,
          }
        },
        {
          text: `You are a visual style analyst. Inspect this YouTube thumbnail image deeply and extract ONLY its visual style — not its content, people, or topic.

Describe the following in precise detail:

1. COLOR_PALETTE: Dominant colors, background color, accent colors, overall tone (dark/bright/muted/neon/warm/cold)
2. TYPOGRAPHY: Font weight (bold/thin), font size on screen (massive/medium/small), text color, text effects (shadow, outline, glow, background box, sticker shape), text placement (top/bottom/center/left/right)
3. LAYOUT: Position of people (left-right, centered, overlapping), how much of frame they occupy, where text sits relative to people
4. BACKGROUND: Solid color / gradient / blurred / studio / outdoor / pattern — describe exactly
5. LIGHTING_MOOD: Dramatic / soft / high-contrast / backlit / flat — describe the lighting feel
6. FACIAL_EXPRESSION_ENERGY: Shocked / intense / calm / laughing / serious — what emotional vibe
7. VISUAL_EFFECTS: Any overlays, frames, borders, emoji stickers, censorship bars, watermarks, glows, vignette
8. THUMBNAIL_STYLE_ARCHETYPE: e.g. "Mr Beast shock face", "Dark dramatic debate", "Clean minimal podcast", "Clickbait emoji", etc.

Return ONLY a structured list — no commentary, no explanation. Be extremely specific about colors (use hex codes if possible), sizes, and positions.`
        }
      ]
    }
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
};

export const generateThumbnail = async (title: string, hostName: string, guestName: string, referenceImage?: { data: string, mimeType: string }, extraInstructions?: string, onStep?: (step: 'inspecting' | 'analyzing' | 'generating') => void, videoStyle?: string, scriptText?: string): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  let professorImagePart: any = null;

  const extraNote = extraInstructions?.trim()
    ? `\n\nCREATOR EXTRA INSTRUCTIONS (apply these on top):\n${extraInstructions.trim()}`
    : '';

  let prompt: string;

  if (referenceImage) {
    // Step 1: Extract style from reference image
    onStep?.('inspecting');
    const styleAnalysis = await extractStyleFromImage(ai, referenceImage);

    // Step 2: Generate using extracted style, creative content based on topic
    onStep?.('generating');

    if (videoStyle === 'explained') {
      const scriptSnippet = scriptText?.slice(0, 1500) || '';
      prompt = `You are a world-class YouTube thumbnail designer specializing in "Explained" / documentary-style content.

VISUAL STYLE GUIDE (extracted from reference — follow this for colors, mood, font style, layout energy):
${styleAnalysis}

YOUR TASK:
Create a brand-new "Explained" style YouTube thumbnail for the topic below. Use the style guide above for color palette, mood, and typography feel. Content and composition are yours to design.

TOPIC: "${title}"
${scriptSnippet ? `SCRIPT CONTEXT:\n${scriptSnippet}` : ''}
${hostName ? `PRESENTER: ${hostName}` : 'PRESENTER: Confident, photorealistic presenter fitting this topic'}

LAYOUT (Explained signature look):
1. LEFT 40%: Large face close-up — intrigued, confident, or slightly shocked expression matching topic. Photorealistic, cinematic.
2. RIGHT 55%: A bold PROP, SCENE, or CONCEPT visual that represents this specific topic. NOT a second person. Make it dramatic and topic-specific.
3. BOTTOM: Full title text "${title}" — small but COMPLETELY READABLE, thin dark bar or clean white text at very bottom edge.
4. BACKGROUND: Solid dark saturated color that unifies both halves (deep green, navy, or dark red).

STYLE RULES:
- Match color grading and mood from the style guide
- High contrast, cinematic quality, sharply focused subjects
- Do NOT copy any people, text, or logos from the reference${extraNote}`;
    } else if (videoStyle === 'situational') {
      const scriptSnippet = scriptText?.slice(0, 2000) || '';
      prompt = `You are a world-class YouTube thumbnail designer specializing in personal story / situational content.

VISUAL STYLE GUIDE (extracted from a reference thumbnail — follow this religiously):
${styleAnalysis}

YOUR TASK:
Create a powerful single-person YouTube thumbnail for the story/situation below.

CRITICAL — ANALYZE THE SCRIPT AND DETERMINE THE PERSON TYPE:
Read the script carefully and identify WHO the main person is. Choose the person appearance from these types:
- Young man (22-30, modern casual clothes, city person)
- Middle-class man (30-45, plain shirt or simple suit, ordinary look)
- Wealthy/rich man (40-55, expensive suit, watch, polished look)
- Young woman (22-32, modern professional or casual)
- Middle-aged woman (35-50, everyday practical look)
- Attractive/stylish woman (25-38, fashionable, confident)
- Elderly man or woman (60+, aged face, life-worn look)
- Working class / simple person (any age, plain worn clothes)
Pick the type that EXACTLY matches who this story is about. Generate a PHOTOREALISTIC person of that type.

SCRIPT / TOPIC CONTENT:
${scriptSnippet}

HOOK TEXT: "${title}"

LAYOUT (follow this strictly):
- ONE person only — positioned on the RIGHT side of the frame, looking slightly left (toward the text), seated or slightly turned, natural pose
- Hook text on the LEFT side — bold, large, prominent, 2-3 lines max
- Background: match the style guide (dark, dramatic, textured)
- Expression: matches the emotional weight of the topic — stressed, reflective, shocked, or determined based on the content
- A studio microphone visible near the person (subtle, not dominant)
- NO second person. NO split screen. ONE compelling face that tells the whole story.

STYLE RULES (non-negotiable):
- Match color palette, typography, background mood from the style guide EXACTLY
- Photorealistic, high quality, 16:9 YouTube thumbnail
- Do NOT copy any people, text, or logos from the reference${extraNote}`;
    } else {
      prompt = `You are a world-class YouTube thumbnail designer.

VISUAL STYLE GUIDE (extracted from a reference thumbnail — follow this religiously):
${styleAnalysis}

YOUR TASK:
Design a brand new, highly engaging YouTube thumbnail for the topic below. Use the visual style guide above for ALL design decisions — colors, typography, layout, background, mood, effects. Be completely creative with the content and composition — make it feel like it was made for this specific topic.

TOPIC & CAST:
- Main hook text (show this prominently, bold, exactly as written): "${title}"
${hostName ? `- Host: ${hostName}` : '- Host: Generate a random realistic person appropriate for this topic'}
${guestName ? `- Guest / other speaker: ${guestName}` : '- Guest / other speaker: Generate a random realistic person appropriate for this topic'}

CONTENT FREEDOM — you decide:
- Best facial expressions and poses that match the topic energy
- Most impactful composition and framing for this specific topic
- Whether to show both people or focus on one for more impact
- Where text appears for maximum visual punch
- Any creative visual metaphors or elements that reinforce the topic

STYLE RULES (non-negotiable):
- Match the color palette, typography style, background type, and mood from the style guide above EXACTLY
- The text "${title}" must be clearly readable and prominent
- Photorealistic, high quality, 16:9 YouTube thumbnail
- Do NOT copy any people, text, or logos from the reference${extraNote}`;
    }

  } else if (videoStyle === 'explained') {
    // ── EXPLAINED style: big face left + bold visual right + small full title bottom ──
    const scriptSnippet = scriptText?.slice(0, 1500) || '';
    prompt = `You are a world-class YouTube thumbnail designer specializing in "Explained" and documentary-style content (like Kurzgesagt, Wendover Productions, Veritasium, MKBHD).

YOUR TASK:
Create a powerful, cinematic "Explained" style YouTube thumbnail — 16:9, photorealistic, ultra-high detail.

TOPIC / HOOK TEXT: "${title}"
${scriptSnippet ? `SCRIPT CONTEXT (use to pick the right visual):\n${scriptSnippet}` : ''}
${hostName ? `HOST / PRESENTER: ${hostName} — show this person as the main face` : 'PRESENTER: Generate a photorealistic confident presenter person fitting this topic'}

LAYOUT (follow STRICTLY — this is the signature "Explained" look):
1. LEFT 40% — Large face close-up of the presenter/character. Face takes up most of this zone. Expression: intrigued, slightly shocked, or confidently serious — matches the topic energy. Slight angle toward center. Photorealistic skin, hair, and lighting.
2. RIGHT 55% — A bold, dramatic visual that represents the topic. This is NOT another person — it is a PROP, SCENE, CONCEPT, or VISUAL METAPHOR. Examples: a burning object, a massive machine, a city skyline, a chart, a news clipping, a product, a creature — whatever BEST represents this specific topic visually. Make it dramatic and impactful.
3. TITLE TEXT — Positioned at the BOTTOM of the frame in a thin dark semi-transparent bar OR as small clean white bold sans-serif text at the very bottom. The full title "${title}" must be COMPLETELY READABLE — no cropping. Font size: small but sharp. This is the YouTube title displayed ON the thumbnail for context — do not make it the dominant element.
4. BACKGROUND — Solid dark color (deep green #1a3a1a, dark navy, dark grey, or deep red) that unifies both halves. Slight vignette at edges.

KEY VISUAL RULES:
- The face and the topic visual must look like they belong together — same lighting direction, same color grading
- High contrast, saturated colors, sharp focus on both elements
- The VISUAL on the right must be topic-specific — if topic is about AI, show a dramatic AI visualization; if about economy, show money/charts/graphs burning or collapsing; if about a movie, show a dramatic movie scene prop
- NO text overlays except the title line at the bottom
- NO generic stock photo look — cinematic, dramatic, editorial quality
- 16:9 aspect ratio, 1920×1080 quality feel
- Photorealistic — NOT illustrated or cartoon${extraNote}`;

  } else if (videoStyle === 'professor_jiang') {
    const scriptSnippet = scriptText?.slice(0, 2000) || '';

    // ── Step 1: Extract topic-specific visual entities from script ──
    let leftVisual = 'A dramatic close-up of a world political leader relevant to the script topic, in formal attire, with their country flag behind them, intense red atmospheric lighting';
    let rightVisual = 'A dramatic close-up of a second world political leader or symbolic figure relevant to the script, with their country flag behind them, dark red vignette';
    let bgAtmosphere = 'Deep crimson red with dramatic vignette and faint downward stock chart lines';

    if (scriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-preview',
          contents: [{
            role: 'user',
            parts: [{
              text: `You are a creative Fox News thumbnail art director. Read this script and decide the 2 most VISUALLY DRAMATIC and TOPIC-RELEVANT elements to show on the LEFT and RIGHT sides of a breaking news thumbnail.

SCRIPT:
${scriptSnippet}

TITLE: "${title}"

Be completely creative — you can show anything that visually tells the story:
- A political leader in a dramatic action or pose (e.g. "Trump sitting in a B2 stealth bomber cockpit, fierce expression, American flag reflected in visor")
- A country's military or power symbol (e.g. "Iranian missile launch with fire and smoke, Iran flag in background")
- A dramatic scene or metaphor (e.g. "A burning US dollar bill with crumbling stock charts, red smoke")
- A person + action combo (e.g. "Xi Jinping pointing aggressively at a crashing chart, red dramatic lighting")
- Any cinematic visual that INSTANTLY tells the viewer what the story is about

Read the script, understand the story, then pick the 2 most impactful visuals. No restrictions — be bold and creative.

Reply in JSON only — no extra text, no markdown:
{
  "left": "One vivid cinematic description for the LEFT SIDE — be specific about pose, action, setting, atmosphere (1-2 sentences)",
  "right": "One vivid cinematic description for the RIGHT SIDE — be specific about pose, action, setting, atmosphere (1-2 sentences)",
  "bgMood": "Background atmosphere (e.g. 'deep crimson with explosion glow' or 'dark stormy sky with falling numbers')"
}`
            }]
          }],
          config: { responseMimeType: 'application/json' },
        });
        const entityRaw = (() => {
          const raw = entityResponse.text?.trim() || '{}';
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          return jsonMatch ? jsonMatch[0] : '{}';
        })();
        console.log('[Prof.Jiang] Entity extraction raw:', entityRaw);
        const entities = JSON.parse(entityRaw);
        if (entities.left) leftVisual = entities.left;
        if (entities.right) rightVisual = entities.right;
        if (entities.bgMood) bgAtmosphere = entities.bgMood;
        console.log('[Prof.Jiang] Left:', leftVisual);
        console.log('[Prof.Jiang] Right:', rightVisual);
      } catch (e) {
        console.warn('[Prof.Jiang] Entity extraction failed, using fallback:', e);
      }
    }

    // ── Step 2: Load professor's reference photo ──
    try {
      const resp = await fetch('/professor_jiang.png');
      if (resp.ok) {
        const blob = await resp.blob();
        const b64 = await blobToBase64(blob);
        professorImagePart = { inlineData: { data: b64.split(',')[1], mimeType: 'image/png' } };
      }
    } catch (_) {}

    prompt = `You are a world-class YouTube thumbnail designer specializing in breaking news and current events analysis — Fox News Alert / CNN Breaking style.

${professorImagePart ? `REFERENCE PERSON — MANDATORY:
A reference photo of the HOST/ANALYST is provided. You MUST replicate this exact person's face, hairstyle, skin tone, and glasses precisely. Do NOT invent a different person.` : ''}

TOPIC / HOOK TEXT: "${title}"
HOST / ANALYST: ${professorImagePart ? 'Asian male, middle-aged, salt-and-pepper hair, rectangular metal-frame glasses, light blue casual shirt — MATCH THE REFERENCE PHOTO EXACTLY.' : hostName || 'Concerned-looking male analyst, centered.'}

════ LAYOUT — FOLLOW EXACTLY ════

▶ CENTER (focal point):
The host/analyst ${professorImagePart ? 'from the reference photo' : ''}. Dead center. Face fully visible. Expression: deeply concerned, worried, hands pressed near chin in prayer gesture. Photorealistic.

▶ LEFT SIDE — TOPIC-SPECIFIC VISUAL (40% of frame):
${leftVisual}
Large, dramatic, fills the left side. Intense red/orange atmospheric glow. Dark vignette at edges. This visual MUST match the script topic.

▶ RIGHT SIDE — TOPIC-SPECIFIC VISUAL (40% of frame):
${rightVisual}
Large, dramatic, fills the right side. Same intense red atmospheric treatment. This visual MUST match the script topic.

▶ BOTTOM BANNER — MOST CRITICAL ELEMENT:
Wide bold RED horizontal banner — full width, bottom 20% of image.
  • TOP LINE: "${title}" — MASSIVE yellow/gold ALL CAPS Impact-style font. Huge, dominant, 70% of banner height.
  • BOTTOM LINE: "FOX NEWS ALERT" in smaller white bold text.
  • Small stylized news logo on left side of banner.

▶ BACKGROUND:
${bgAtmosphere}. Dark vignette. Faint stock chart lines or relevant symbolic imagery in background. Urgent, tense.

════ STRICT RULES ════
- LEFT and RIGHT visuals MUST be EXACTLY as described above — flags, symbols, charts, buildings — NOT random generic people
- These side visuals must visually represent the TOPIC: "${title}" — a viewer should instantly recognize which countries/forces are involved
- Red banner + yellow/gold text = most important element — bold, clean, highly readable
- CENTER person must look exactly like the reference photo (if provided)
- Photorealistic, cinematic quality — NOT illustrated or cartoon
- 16:9 aspect ratio, 1920×1080
- High contrast, sharp edges, no blur${extraNote}`;

  } else {
    prompt = `
    Create a high-quality, professional YouTube podcast thumbnail in the style of the Joe Rogan Experience.
    
    COMPOSITION:
    1. **Subjects**: Two people facing each other in deep conversation. ${hostName ? `On the right is ${hostName}.` : 'On the right is a random realistic person fitting the topic.'} ${guestName ? `On the left is ${guestName}.` : 'On the left is a random realistic person fitting the topic.'}
    2. **Title Card**: In the center, between the two people, there is a clean white rounded rectangle title card. 
       - Inside the card, at the top, show the name "${guestName || 'Guest'}" with a small circular profile picture and a blue verified checkmark.
       - Below that, the hook text "${title}" in large, bold, black and red sans-serif typography — make it BIG and eye-catching.
    3. **Foreground**: Two professional black studio microphones (like Shure SM7B) should be visible in the bottom foreground, one for each person.
    4. **Background**: A clean, pure white background.
    5. **Style**: Photorealistic, cinematic lighting, high contrast, sharp details.
    
    The final image should look exactly like a professional podcast thumbnail from a top-tier show.${extraNote}
    `;
  }

  // Signal image generation is starting (for non-referenceImage flows)
  if (!referenceImage) {
    onStep?.('generating');
  }

  try {
    const parts: any[] = [];
    // For professor_jiang style, prepend the reference photo so Gemini uses that face
    if (professorImagePart) {
      parts.push(professorImagePart);
    }
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts: parts },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
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
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
    }
    console.error("Thumbnail generation failed", e);
    throw e;
  }

  throw new Error("No image generated");
};

export const generateVideoBackground = async (hostName: string, guestName: string): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: {
          imageConfig: {
              aspectRatio: "16:9"
          }
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
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const sample = comments.slice(0, 150);
  const prompt = `You are selecting YouTube comments for a viral intro video.
From the comments below, pick exactly 7 that are the most interesting, funny, controversial, or thought-provoking.
They should represent diverse reactions. Keep comments short enough to fit on screen (under 120 chars each; if longer, trim smartly).
Return ONLY a JSON array of 7 selected/trimmed comment strings. No explanation.

Comments:
${JSON.stringify(sample)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
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

export const generateIntroQuote = async (comments: string[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const sample = comments.slice(0, 15).join('\n');
  const prompt = `Based on these YouTube comments, write ONE powerful closing quote (10-18 words) for a viral video intro.
It should feel bold, thought-provoking, or inspiring. No quotation marks. No explanation. Just the quote.

Comments:
${sample}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Every opinion matters. Every voice counts.";
};

export const translateScriptToHindi = async (segments: DebateSegment[]): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const textsJson = JSON.stringify(segments.map(s => s.text));

  const prompt = `Translate the following JSON array of script dialogue lines to Hindi.
Return ONLY a valid JSON array of translated strings in the exact same order.
Do NOT add any explanation or markdown. Output must be a raw JSON array only.

Input:
${textsJson}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
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
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
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
    model: 'gemini-3-flash-preview',
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
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
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
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const topic = (response.candidates?.[0]?.content?.parts?.[0]?.text || 'this topic').trim().replace(/[.!?]$/, '');

  return `In this clip, ${speakerA} and ${speakerB} talk about ${topic}. Let's check it out! If you want to watch the reaction version, skip the timeline.`;
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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: use16x9 ? '16:9' : '1:1' } }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('No image generated');
};

export const generateVeo3Prompt = async (comments: string[], transcript?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
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
    model: 'gemini-3-flash-preview',
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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
    model: 'gemini-3-flash-preview',
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
  model: string = 'gemini-3-flash-preview',
): Promise<DebateSegment[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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

// ── Topic-based Transcript Splitter ──────────────────────────────────────────
export interface TranscriptChunk {
  title: string;
  start: number;   // seconds
  end: number;     // seconds
  text: string;
}

export const splitTranscriptByTopics = async (
  segments: { text: string; start: number; end: number }[]
): Promise<TranscriptChunk[]> => {
  if (!segments.length) throw new Error('Transcript is empty');

  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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

Total duration: ${Math.floor(totalDuration / 60)}m ${Math.floor(totalDuration % 60)}s

TRANSCRIPT (timestamps in [MM:SS]):
${timestamped}

Return ONLY a JSON array. Each item: {"title": "...", "start_seconds": 0, "end_seconds": 0}
The first chunk's start_seconds must be 0. The last chunk's end_seconds must be ${Math.floor(totalDuration)}.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  const raw = response.text ?? '';
  let splits: { title: string; start_seconds: number; end_seconds: number }[] = [];

  try {
    splits = JSON.parse(raw);
  } catch {
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('Gemini returned invalid JSON for topic split');
    splits = JSON.parse(m[0]);
  }

  if (!Array.isArray(splits) || !splits.length) throw new Error('No splits returned');

  // Map each split back to actual text from segments
  return splits.map(sp => {
    const s = Math.max(0, sp.start_seconds);
    const e = Math.min(totalDuration, sp.end_seconds);
    const chunkSegs = segments.filter(seg => seg.start >= s - 1 && seg.start < e + 1);
    const text = chunkSegs.map(seg => seg.text).join(' ');
    return { title: sp.title || 'Section', start: s, end: e, text };
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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
      model: params.model || 'gemini-3-flash-preview',
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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
}

export interface StoryboardScenesResult {
  scenes: StoryboardSceneRaw[];
  characterGuide: string;
}

export const generateStoryboardScenes = async (
  segments: { speaker: string; text: string; duration?: number; startTime?: number; endTime?: number }[],
  sceneCount: number,
  model: string = 'gemini-3.1-flash-lite-preview',
): Promise<StoryboardScenesResult> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
Step 1 — CHARACTER GUIDE:
First, identify the main character(s) from the script.
Create a SHORT, PRECISE visual description for each character that will be copy-pasted into EVERY image generation prompt to ensure visual consistency.
This must include: appearance, clothing, hair, skin tone, distinguishing features.
Write it as a single compact paragraph starting with "Main character: ..."
If there are 2 speakers, describe both. Keep it under 60 words total.

Step 2 — SCENES:
Create exactly ${sceneCount} storyboard scenes that visually represent this script as a story.
Each scene covers one or more consecutive script segments. Every segment must be covered (no gaps, no overlaps).

For each scene prompt:
- Describe WHAT IS HAPPENING in this scene using the character(s) from Step 1
- Include the character's action, expression, and setting
- Style: simple flat 2D illustration, story-book art, consistent character design, white or simple background
- Keep prompts clear and visual — no abstract concepts, show what is literally happening

Respond ONLY with valid JSON in this exact format:
{
  "characterGuide": "Main character: ...",
  "scenes": [
    {
      "sceneNumber": 1,
      "prompt": "Scene description here using the character...",
      "segmentIndices": [0, 1]
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
  model: string = 'gemini-3.1-flash-lite-preview',
): Promise<{ prompts: string[]; characterGuide: string }> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const slotText = slots.map(s =>
    `Scene ${s.sceneNumber} [${s.startTime.toFixed(1)}s–${s.endTime.toFixed(1)}s]:\n"${s.voiceover}"`
  ).join('\n\n');

  const prompt = `
You are a professional storyboard artist creating a consistent illustrated story.

Below are ${slots.length} scenes with their exact timestamps and voiceover text (what is being spoken during each scene):

${slotText}

TASK:
Step 1 — CHARACTER GUIDE:
Identify the main character(s) from the voiceover text. Create a SHORT visual description (appearance, clothing, hair, skin tone) for consistency across all scenes. Max 60 words, starting with "Main character: ..."

Step 2 — IMAGE PROMPTS:
For each scene, create one image prompt that visually illustrates what is happening during that voiceover.
- Show what the character is DOING or EXPERIENCING during those spoken words
- Style: simple flat 2D illustration, story-book art, consistent character design
- Be literal and visual — no abstract concepts

Respond ONLY with valid JSON:
{
  "characterGuide": "Main character: ...",
  "prompts": ["prompt for scene 1", "prompt for scene 2", ...]
}
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
    characterGuide: (parsed.characterGuide || '') as string,
  };
};

// ── Chirp 3 HD — via server-side Google Cloud TTS API (GOOGLE_CLOUD_API_KEY) ──
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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const characterSection = characterGuide
    ? `\nCHARACTER CONSISTENCY — always draw the character exactly as described below. Same appearance in every scene:\n${characterGuide}\n`
    : '';

  const fullPrompt = `
Generate a simple illustration in the style of MS Paint that directly visualizes the following scene from a story.
${characterSection}
Scene: "${prompt}"

Requirements:
1. Style: MS Paint style — simple drawings, basic bold colors, flat shading, unpolished, naive art style. Like a hand-drawn story illustration.
2. Character Consistency: Draw the character(s) exactly as described in the CHARACTER CONSISTENCY section. Same face, same clothes, same hair in every image.
3. White or very simple background.
4. Show WHAT IS HAPPENING in the scene — action, expression, setting.
5. No text written inside the image.
6. Aspect Ratio: ${aspectRatio}.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: fullPrompt }] },
    config: {
      imageConfig: { aspectRatio },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('No image generated');
};
