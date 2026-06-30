import { Type, Modality, ThinkingLevel } from "@google/genai";
import { TranscriptSegment, DebateSegment, DebateSpeaker } from "../types";

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
      throw new Error("Gemini API Quota Exceeded. Please check your billing or wait a few minutes before trying again.");
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

export type ThumbnailVideoStyle = 'situational' | 'debate' | 'podcast' | 'explained' | 'professor_jiang' | 'phone_studio' | 'phone_clean' | 'phone_clean_2' | 'phone_dual' | 'news_dramatic' | 'podcast_2' | 'cinematic_drama' | 'podcast_3' | 'podcast_4' | 'corkboard_meta' | 'movie_review';

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
  if (style === 'phone_studio') {
    return `
You are a YouTube copywriter for the "Phone Studio" thumbnail style — punchy AI-chat-style clips that go viral on Shorts and homepage. The thumbnail shows a phone screen on one side (AI chat about a celebrity's take) and the celebrity's face on the other, with HUGE red+white impact text in the middle.

Read the script and generate 4 SHORT, CATCHY, ULTRA-CLICKABLE YouTube titles in this style.

STYLE: Ultra-short. Question or bold claim. Sounds like a headline you'd say out loud. The shorter, the better. The celebrity / person being discussed MUST be named.

REQUIREMENTS:
1. 35-55 characters max. Tight, punchy, no filler words.
2. Format options to mix across the 4:
   - Direct question: "Do Aliens Exist? — Joe Rogan Answers"
   - Bold claim with name: "Elon Musk: Shift Data Centers To The Moon"
   - Punchy shock: "Trump: War Phase Won Again"
   - Reveal: "Joe Rogan Reveals What's Really In Area 51"
3. Always name the celebrity / person from the script in the title.
4. No semicolons, no em-dashes overuse — keep it conversational.
5. ALWAYS write titles in English only — do NOT use Hindi or Hinglish.
6. The 4 titles must approach the SAME topic from DIFFERENT angles (question / bold claim / reveal / consequence).

EXAMPLES (for tone — do NOT copy verbatim):
- "Do Aliens Exist? Trump Reveals The Truth"
- "Elon Musk Wants Data Centers On The Moon"
- "Joe Rogan: War Phase Has Already Started"
- "Putin Just Said Something Insane About AI"

Return ONLY a valid JSON array of 4 strings. No markdown.
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
  if (style === 'phone_clean') {
    return `
You are a YouTube copywriter for the "Phone Clean" style — clean white-background thumbnails showing an AI phone call with a shocking topic. Short, viral, makes people stop scrolling.

REQUIREMENTS:
1. 40-60 characters max. Bold claim or question.
2. Read the FULL script to extract the EXACT topic, person, brand, or event — never be generic.
3. MUST name the specific entity (person/org/brand/event) from the script.
4. Sounds like a revealing expose or insider scoop about that specific topic.
5. ALWAYS write titles in English only.
6. Return ONLY a valid JSON array of 4 strings. No markdown.

EXAMPLES (tone only — rewrite for the actual script topic):
- "OpenAI's Hidden Plan Nobody Told You About"
- "Google's Secret Deal Just Got Exposed"
- "Why Apple Is Quietly Buying This Company"
    `;
  }
  if (style === 'phone_clean_2') {
    return `
You are a YouTube copywriter for the "Phone Clean 2" style — clean white-background thumbnail, phone on left, sitting presenter with lapel mic on right, bold topic text in center.

REQUIREMENTS:
1. 40-60 characters max. Direct, punchy, reveals something SPECIFIC.
2. Read the FULL script to extract the EXACT topic, person, brand, country, or event — never generic.
3. MUST name the specific entity from the script — make the viewer feel they're getting insider info.
4. Format ideas: "X's Secret Plan", "The Truth About X", "Why X Is Doing This", "X Just Revealed This"
5. ALWAYS write titles in English only.
6. Return ONLY a valid JSON array of 4 strings. No markdown.

EXAMPLES (tone only — rewrite for the actual script topic):
- "The Real Reason Tesla Fired Half Its Engineers"
- "India's Secret Space Plan Nobody Told You About"
- "Why Sam Altman's Plan Will Change Everything"
    `;
  }
  if (style === 'phone_dual') {
    return `
You are a YouTube copywriter for the "Phone Dual" style — two characters having a shocking phone conversation about a wild topic. Think conspiracy meets comedy meets clickbait.

REQUIREMENTS:
1. 40-65 characters max. Make it a question or a confrontational claim.
2. Name BOTH characters if possible, or make the topic the star.
3. "Do X Exist?", "Does Y Know About Z?", "X Calls Y About Z" formats work great.
4. ALWAYS write titles in English only.
5. Return ONLY a valid JSON array of 4 strings. No markdown.

EXAMPLES:
- "Do Aliens Exist? Trump Calls To Find Out"
- "Elon Calls Putin: What Did They Really Say?"
- "Does God Exist? Einstein vs. Darwin Phone Call"
    `;
  }
  if (style === 'podcast_2') {
    return `
You are a YouTube copywriter for real podcast channels (Joe Rogan / Lex Fridman / Andrew Huberman style) — two people sitting across each other, discussing a specific topic shown in a CENTER image insert.

REQUIREMENTS:
1. 55-75 characters. Conversational, specific, makes you curious about the discussion.
2. MUST name the specific topic, person, or thing being discussed — never vague.
3. Sounds like two people reacting to something: "[Person] Reacts To...", "We Tested...", "The Truth About X", "Is X Real? — [Person]'s Take"
4. Format ideas: "[Guest Name] On [Topic]", "Why [Topic] Is [Shocking Claim]", "[Topic]: The Conversation Nobody Is Having"
5. ALWAYS write titles in English only.
6. Return ONLY a valid JSON array of 4 strings. No markdown.

EXAMPLES (tone only — rewrite for the actual script topic):
- "Joe Rogan and Guest React To Moon Landing Evidence"
- "The Truth About COVID Vaccines — No Filter Conversation"
- "Trump's Real Opinion On Drinking — Shocking Reveal"
- "We Discussed XVideos, Pornhub, And The Internet's Dark Side"
    `;
  }
  if (style === 'movie_review') {
    return `
You are a YouTube copywriter for a cinematic review/analysis channel — works for ANY topic (movies, books, events, brands, people, documentaries, sports). Titles are opinionated, punchy, Hindi-English mix or pure English, honest hot takes.

REQUIREMENTS:
1. 45-70 characters. Sounds like a reviewer's raw honest reaction — can be in Hindi, English, or Hinglish.
2. MUST name the actual topic (film, book, brand, event, person) from the script.
3. Can use emojis and colloquial expressions.
4. Works for: movie review, book review, event breakdown, brand story, sports moment, documentary reaction.
5. Return ONLY a valid JSON array of 4 strings. No markdown.

EXAMPLES (tone only):
- "Krishnavataram Review: Dhoka Hua Mere Saath 💔"
- "Jolly LLB 3: WTF Bhai Rula Diya 🔥"
- "Apple's Biggest Failure — Full Story Explained 🤯"
- "IPL 2025 Final: Paisa Vasool Tha Yaar 🏏"
    `;
  }
  if (style === 'corkboard_meta') {
    return `
You are a YouTube copywriter for meta educational content — "how thumbnails/videos go viral", "what makes content work", YouTube strategy breakdowns. The thumbnail shows a cork board with an annotated thumbnail pinned to it.

REQUIREMENTS:
1. 50-70 characters. Sounds like you're revealing a YouTube/content creation formula or secret.
2. MUST be topic-specific — name what formula, strategy, or concept is being broken down.
3. Formats: "The [X] Formula", "Why [X] Goes Viral", "How [Channel] Gets [Y] Views", "The Secret Behind [X]"
4. ALWAYS write titles in English only.
5. Return ONLY a valid JSON array of 4 strings. No markdown.

EXAMPLES (tone only):
- "The Viral Formula Behind Every 10M View Podcast Thumbnail"
- "Why DOAC Thumbnails Always Go Viral — Broken Down"
- "The Secret Structure Behind Every Successful YouTube Hook"
- "How MrBeast Designs Thumbnails That Get Billions Of Views"
    `;
  }
  if (style === 'podcast_4') {
    return `
You are a YouTube copywriter for the "Viral Tweet / Scandal Documentary" style — dark background, two emotional faces (left & right), and a giant social media post in the center showing the shocking reveal. Used for business scandals, celebrity controversies, founder stories.

REQUIREMENTS:
1. 55-80 characters. Sounds like a documentary title or investigative exposé.
2. MUST name the real person, brand, or event from the script.
3. Formats: "The [X] Scandal Nobody Talked About", "When [Person] Posted This And Everything Changed", "How [Brand] Collapsed After One Tweet"
4. ALWAYS write titles in English only.
5. Return ONLY a valid JSON array of 4 strings. No markdown.

EXAMPLES (tone only):
- "The Café Coffee Day Founder's Last Tweet Before He Disappeared"
- "How One Tweet Ended India's Biggest Coffee Chain"
- "The Dark Truth Behind VG Siddhartha's Final Message"
- "When A Founder's 'I Quit' Post Shocked The Entire Country"
    `;
  }
  if (style === 'podcast_3') {
    return `
You are a YouTube copywriter for the "Podcast Quote" style — deep red background, speaker's face on right, a bold statement sentence on the left with ONE key word highlighted in a YELLOW BOX. Used by financial/opinion podcasts (crypto, investing, life advice).

REQUIREMENTS:
1. 55-75 characters. Sounds like something a guest actually SAID — a direct quote or bold opinion.
2. MUST be specific to the actual topic/person from the script — name the speaker or the claim.
3. Formats: "[Person]: [Shocking Statement]", "[Claim] — [Person]", conversational opinion.
4. ALWAYS write in English only.
5. Return ONLY a valid JSON array of 4 strings. No markdown.

EXAMPLES (tone only):
- "Scaramucci Said Bitcoin Is Complete Bullsh*t — Here's Why He Changed"
- "Raoul Pal: Impatience Is Literally Keeping You Broke"
- "Matt Hougan Says Just Buy This One Thing And Wait"
- "They Are Actively Trying To Steal Your Crypto — Here's How"
    `;
  }
  if (style === 'cinematic_drama') {
    return `
You are a YouTube copywriter for cinematic drama / Bollywood / thriller content — thumbnails with ZERO or minimal text. The visual tells the whole story.

REQUIREMENTS:
1. 55-80 characters. Cinematic, story-driven. Sounds like a movie title or dramatic reveal.
2. MUST name the specific person, film, event, or drama from the script.
3. Evokes emotion: mystery, danger, betrayal, shock, humor contrast.
4. Formats: "[Name]'s Shocking Secret", "What Nobody Knew About [Event]", "[X] vs [Y] — The Real Story", "When [X] Happened..."
5. ALWAYS write titles in English only.
6. Return ONLY a valid JSON array of 4 strings. No markdown.

EXAMPLES (tone only):
- "Ranbir Kapoor Destroys Avatar & Avengers — Here's Why"
- "The Dark Truth Behind Punjab's Drug Mafia Nobody Talks About"
- "When The Trolley Problem Met God — Nobody Expected This"
- "Superman Meets Bollywood — The Craziest Crossover Yet"
    `;
  }
  if (style === 'news_dramatic') {
    return `
You are a YouTube copywriter for Indian breaking news channels (Career247 / ABP / India TV style) — dramatic, urgent, shocking headlines that go viral. The thumbnail shows a BLUE text box on the left + dramatic background scene + celebrity face foreground.

REQUIREMENTS:
1. 55-75 characters. Hard-hitting, factual but dramatic. Names the SPECIFIC event, country, leader, or policy.
2. Format: "[Shocking Event]!! — [Consequence/Twist]" or "[Country/Person] [Shocking Action]!! — [Why It Matters]"
3. MUST name the real entity from the script (person, country, conflict, event) — never vague.
4. ALWAYS write titles in English only — do NOT use Hindi or Hinglish.
5. Return ONLY a valid JSON array of 4 strings. No markdown.

EXAMPLES (tone only — rewrite for the actual script topic):
- "Israel Attacks Iran!! — Humiliation For Trump!!"
- "Moscow Burning!! — Why Black Rain On Putin??"
- "Iran Hits US Air Force Hard!! — Shocking Images Show Damage!!"
- "Pakistan Increases Defence Budget By 18%!! — War With India Near??"
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
  const ai = getAi();

  const variationSeed = Math.floor(Math.random() * 9999);
  const prompt = `
    ${getTitleStylePrompt(videoStyle)}
    
    Generate completely fresh titles — do NOT repeat or paraphrase any previously generated titles. Variation seed: ${variationSeed}.
    
    Script:
    ${scriptText}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
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
  if (style === 'phone_studio') {
    return `
You are a thumbnail copywriter for the "Phone Studio" style — ultra-bold red+white text overlaid on a phone screen + celebrity face composition.

STYLE: 2-5 word ALL-CAPS punch line. Either a SHORT QUESTION (ends with ?) or a SHOCK DECLARATION (ends with ! or no punctuation). Half the words will be WHITE, the most explosive 1-2 words RED.

CRITICAL RULE — MUST BE TOPIC-SPECIFIC:
Read the script. Pick the SINGLE most viral 2-5 word hook from the actual content. Never generic.

Generate exactly 5 options with VARIETY:
- Option 1: 2-word shock question — "ALIENS REAL?" / "WAR OVER?" / "DOGE DEAD?"
- Option 2: 3-4 word bold claim — "WAR PHASE WON" / "MOON IS TARGET" / "DOGE WILL WIN"
- Option 3: 4-5 word question — "DO ALIENS REALLY EXIST?" / "SHIFT DATA TO MOON?"
- Option 4: 2-3 word declaration — "AREA 51 EXPOSED" / "ELON LIED"
- Option 5: Punchy verb-action — "TRUMP WINS AGAIN" / "MUSK GOES MARS"

RULES:
- Max 5 words. Lean toward 2-3.
- ALL CAPS only.
- Each option DIFFERENT — different word, different angle, different punctuation.
- ALWAYS English only — no Hindi/Hinglish.
- No emojis, no quotes, no punctuation except ? or !
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
  if (style === 'phone_clean') {
    return `
You are a thumbnail copywriter for "Phone Clean" style — bold black text + RED BOX on a white background. The text sits in the center of a clean phone thumbnail.

STYLE: 2-5 words ALL CAPS, punchy. One key word goes in a SOLID RED RECTANGLE. Must be TOPIC-SPECIFIC — extracted from the script.
BAD: "GAME OVER" (generic, could mean anything)
GOOD (for OpenAI script): "OPENAI'S HIDDEN PLAN" with HIDDEN in red box
GOOD (for India space script): "INDIA GOES MARS" with MARS in red box

Generate 5 options — each MUST reference the actual topic/entity from the script:
- Option 1: "X's [RED WORD] REVEALED" — name the entity
- Option 2: "[RED WORD] EXPOSED" — the shocking thing
- Option 3: Short question about the topic
- Option 4: 2-3 word declaration about the script topic
- Option 5: Bold claim specific to this script

RULES: ALL CAPS, max 5 words, English only. Return ONLY a JSON array of 5 strings.
    `;
  }
  if (style === 'phone_clean_2') {
    return `
You are a thumbnail copywriter for "Phone Clean 2" style — sitting presenter with lapel mic on right, phone on left, BOLD TEXT center on white background. One key word appears in a RED RECTANGLE.

STYLE: 2-5 words ALL CAPS. Must be TOPIC-SPECIFIC — read the script and name the actual person/brand/event/country.
BAD: "THE REAL PLAN" (generic, no info)
GOOD (for Tesla script): "TESLA'S REAL PLAN" with REAL in red box
GOOD (for India script): "INDIA'S SECRET EXPOSED" with SECRET in red box

Generate 5 options — each MUST be specific to the script's topic:
- Option 1: "[ENTITY]'S [RED WORD]" — entity name + key concept
- Option 2: "[RED WORD] EXPOSED" — shocking reveal
- Option 3: "WHY [ENTITY] [VERB]?" — question format
- Option 4: Short verdict about the topic
- Option 5: Bold 2-word claim from the script

RULES: ALL CAPS, max 5 words, English only. Return ONLY a JSON array of 5 strings.
    `;
  }
  if (style === 'phone_dual') {
    return `
You are a thumbnail copywriter for "Phone Dual" style — two phones showing characters, giant question/claim in center.

STYLE: 2-5 words MAX. Must work as a huge question OR bold revelation. Should make people think "wait, what?"

Generate 5 options:
- Option 1: Short question "DO X EXIST?"
- Option 2: Shocking question "IS X REAL?"
- Option 3: Bold claim "X IS REAL"
- Option 4: Conspiracy hook "X KNOWS"
- Option 5: Wild reveal "X EXPOSED"

RULES: ALL CAPS only, max 5 words, English only. Return ONLY a JSON array of 5 strings.
    `;
  }
  if (style === 'podcast_2') {
    return `
You are a thumbnail copywriter for the "Podcast 2" style — two hosts on either side, topic image INSERT in center with colored border. No big bold text overlay — the image insert IS the visual hook.

The "thumbnail text" here describes the CENTER INSERT VISUAL (the topic image inside the colored border), not actual text on screen.

Generate 5 options — each describes what should appear in the center topic insert image:
- Option 1: The most iconic visual object related to the topic (e.g. "COVID-19 vaccine bottle closeup")
- Option 2: A dramatic scene visual (e.g. "whiskey being poured into glass, dark moody lighting")
- Option 3: A symbolic image (e.g. "moon surface with rainbow light beam")
- Option 4: A controversial or surprising visual (e.g. "multiple adult platform logos side by side")
- Option 5: A person or face collage related to the topic

Each option should be 4-8 words MAX describing the topic insert image. ALL in plain English. No ALL CAPS needed.
Return ONLY a JSON array of 5 strings. No markdown.
    `;
  }
  if (style === 'movie_review') {
    return `
You are a thumbnail copywriter for a cinematic review/analysis channel. The thumbnail shows a dramatic full-frame background image (movie still, event scene, person, etc.) with a dark GOLD-BORDER box on the left containing the bold yellow hook text.

The thumbnailText = the BOLD YELLOW HOOK TEXT inside the dark gold-border box — the raw honest reaction/opinion. Can be Hindi, English, or Hinglish. Can include 1-2 emojis.

RULES:
- 3-6 words. Raw, expressive, emotional reaction or punchy opinion.
- Works for ANY topic — film, book, event, brand, person, sports, documentary.
- This goes in LARGE BOLD YELLOW inside the dark box — it's the emotional anchor.
- 5 options, varied tones (loved it, hated it, shocked, funny, emotional)
- Return ONLY a JSON array of 5 strings. No markdown.

EXAMPLES (tone only):
- "DHOKA HUA 💔 MERE SATH"
- "NOT INDIAN 😱 ENOUGH"
- "WTF BHAI 🔥 RULA DIYA"
- "PAISA VASOOL HAI YAR"
- "MIND BLOWN 🤯 SERIOUSLY"
    `;
  }
  if (style === 'corkboard_meta') {
    return `
You are a thumbnail copywriter for the "Corkboard Meta" style — a cork bulletin board background with a smaller YouTube thumbnail PINNED to it, with annotation labels pointing to its elements.

The thumbnailText = the TWO-WORD TITLE shown in the BLUE TOP BANNER. Format: "[YELLOW WORD] White Word"
— first word gets a YELLOW BOX, remaining words are white on the blue banner.

RULES:
- 2-4 words total that work as a big bold banner title
- First word in [YELLOW BOX] format using [BRACKETS]: "[Viral] Formula", "[Secret] Structure", "[Hidden] Formula"
- Choose words that evoke a "formula revealed" feeling
- Extract from the actual topic/script
- 5 options, varied angles
- Return ONLY a JSON array of 5 strings with FIRST WORD in [BRACKETS]. No markdown.
    `;
  }
  if (style === 'podcast_4') {
    return `
You are a thumbnail copywriter for the "Viral Tweet / Scandal Documentary" style. The CENTER of the thumbnail is a giant social media post screenshot showing the shocking reveal text.

The thumbnailText = the BIG DRAMATIC TEXT that appears inside the social media post — the actual shocking message that was posted.

RULES:
- 2-5 words maximum. Sounds like something a founder/celebrity actually posted/said.
- Emotional, final, shocking — like a last message: "I Quit...", "It's Over", "I'm Sorry", "Goodbye Everyone", "I Failed You"
- Can include ellipsis (...) for drama
- Extract from actual script content — what was the viral/famous thing that was said or posted?
- 5 options, varied emotional angles
- Return ONLY a JSON array of 5 strings. No markdown.
    `;
  }
  if (style === 'podcast_3') {
    return `
You are a thumbnail copywriter for the "Podcast Quote" style — deep red gradient background, speaker face RIGHT, bold statement sentence LEFT with ONE word in a YELLOW HIGHLIGHT BOX.

The thumbnailText = the BIG STATEMENT SENTENCE that appears on the left. Format using [BRACKETS] around the ONE word that gets the yellow box highlight.

RULES:
- Write a bold 4-8 word statement or quote — sounds like the guest actually said it
- ONE key word wrapped in [BRACKETS] — the most shocking/impactful/interesting word
- That bracketed word gets a SOLID YELLOW RECTANGLE with BLACK text — this is the visual hook
- Rest of the sentence is in large white text
- Examples:
  - "Bitcoin is [BULLSH*T]"
  - "They want to [STEAL] your Crypto!"
  - "Impatience keeps you [Broke.]"
  - "[Just Buy This.]"
- Extract the most shocking claim/word from the actual script topic — never generic
- 5 options, each a different angle on the script's main claim
- Return ONLY a JSON array of 5 strings. No markdown.
    `;
  }
  if (style === 'cinematic_drama') {
    return `
You are a thumbnail visual director for the "Cinematic Drama" style — NO text or MINIMAL text on thumbnail. The entire story is told through dramatic visuals, extreme close-ups, and multi-layer compositing.

"thumbnailText" here = ONE optional short element (a quote in quotes, a single word, or EMPTY). Not a headline — just the rare piece of text that belongs naturally in the scene.

Generate 5 options:
- Option 1: Leave empty "" — pure visual, no text at all
- Option 2: A short 2-4 word QUOTE in "quotes" as if a character said it (e.g. "God said pull")
- Option 3: A single dramatic word/name label (e.g. "EXPOSED" or a character name)
- Option 4: Leave empty "" — another pure visual variation
- Option 5: A very short ironic/funny contrast label (e.g. "Meanwhile..." or "But why?")

RULES: If text, keep it 1-4 words MAX. English only. Return ONLY a JSON array of 5 strings.
    `;
  }
  if (style === 'news_dramatic') {
    return `
You are a thumbnail copywriter for Indian breaking news thumbnails (Career247 / ABP style). The thumbnail shows TWO stacked text blocks on the LEFT side:
- Block 1 (SOLID BLUE BOX): The main shocking headline — 3-6 words ALL CAPS
- Block 2 (dark background): The secondary twist/consequence — 3-6 words ALL CAPS

Generate 5 paired options. Each option = "HEADLINE | SUBHEADLINE" (pipe-separated, both ALL CAPS).

RULES:
- Both parts must be topic-specific — extracted from the actual script. NO generic phrases.
- Headline = the main shocking event (e.g. "ISRAEL ATTACKS IRAN!!")
- Subheadline = the consequence or second twist (e.g. "HUMILIATION FOR TRUMP!!")
- Max 6 words each part. ALL CAPS. English only.
- GOOD: "MOSCOW BURNING!! | BLACK RAIN ON PUTIN??"
- GOOD: "IRAN HITS US HARD!! | TRUMP IN SHOCK!!"
- Return ONLY a JSON array of 5 strings in format "HEADLINE | SUBHEADLINE". No markdown.
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
  const ai = getAi();

  const variationSeed = Math.floor(Math.random() * 9999);
  const prompt = `
    ${getThumbnailTextStylePrompt(videoStyle)}

    Generate completely fresh thumbnail text options — do NOT repeat any previously generated options. Variation seed: ${variationSeed}.

    Content:
    ${scriptText}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
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

export const generateTitleTextPair = async (scriptText: string, videoStyle: ThumbnailVideoStyle = 'situational'): Promise<{ title: string; thumbnailText: string; description: string }[]> => {
  const ai = getAi();

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
- Together they hint at a story bigger than either alone.

DESCRIPTION RULES — brief for the AI image generator:
- ONE person only, RIGHT SIDE of frame, mid-shot, looking slightly left toward the text
- Describe EXACTLY who this person is from the script (age, gender, build, clothing, emotional state — e.g. "stressed 35-year-old Indian man in plain shirt, looking down defeated")
- BACKGROUND: dark moody color matching the emotion (deep charcoal, dark red, dark teal) — NOT white, NOT generic
- TEXT: thumbnailText in bold ALL CAPS LEFT SIDE, 2-3 lines, yellow or white on dark background
- Include 1 topic-specific prop if relevant (e.g. "laptop showing red loss graph", "torn documents on table", "empty wallet")`

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
- GOOD: "BINDRA EXPOSED" / "DELHI WINS" / "BOTH WRONG"

DESCRIPTION RULES — brief for the AI image generator:
- TWO people on OPPOSITE SIDES of frame, facing each other, confrontational energy
- Name BOTH people from the script exactly (e.g. "Sandeep Maheshwari on left, Vivek Bindra on right")
- CENTER: thumbnailText in BOLD CAPS between them, 1-2 lines, red or yellow
- Background: dark dramatic (red/orange split or dark grey), high energy tension
- Expression: both looking intense/confrontational — like they're about to clash`

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
- GOOD: "48 LAWS" / "WAR TRUTH" / "REAL REASON" / "HIDDEN TRUTH"

DESCRIPTION RULES — brief for the AI image generator:
- ONE large person/face RIGHT SIDE of frame, mid-shot or close-up, photorealistic
- NAME the exact person from the script (or describe type if unnamed: "stressed 40-year-old Indian man in suit")
- BACKGROUND: dark dramatic (charcoal, deep blue, or topic-specific color) + relevant topic visual element behind/beside them
- TEXT: thumbnailText in bold CAPS LEFT SIDE, 2-3 lines, white or yellow
- Add the key visual prop or scene from the script (e.g. "book cover in hand", "map of Israel-Hamas behind them", "stock chart on screen behind")`

    : videoStyle === 'phone_studio'
    ? `STYLE — Phone Studio (Phone Screen + Celebrity Face + Big Red/White Text):
TITLE RULES:
- Ultra-short, catchy, viral-Shorts energy. 35-55 chars MAX.
- ALWAYS name the celebrity / featured person from the script in the title (e.g. "Joe Rogan", "Trump", "Elon Musk").
- Format options: bold question / shock claim / reveal. Pick whichever hits hardest for THIS script.
- BAD: "An Interesting Take On Aliens" (no name, no punch)
- GOOD: "Do Aliens Exist? — Joe Rogan Reveals The Truth"
- GOOD: "Elon Musk Wants Data Centers On The Moon"
- GOOD: "Trump: War Phase Won Again"

THUMBNAIL TEXT RULES:
- 2-5 word ALL CAPS punch — fits inside the central red+white impact text block.
- A short QUESTION ("ALIENS REAL?") or a SHOCK DECLARATION ("WAR PHASE WON").
- The CELEBRITY NAME from the title goes on the PHONE STATUS BAR, NOT in the big text — so the big text is the topic hook, not the person.
- Title + thumbnail text together should feel like one viral combo where the text is the visual stinger.
- BAD: thumbnail text = same words as title (echoes)
- GOOD pair: title "Do Aliens Exist? — Joe Rogan Reveals The Truth" + text "DO ALIENS EXIST?"
- GOOD pair: title "Elon Musk Wants Data Centers On The Moon" + text "SHIFT DATA TO MOON"
- GOOD pair: title "Trump: War Phase Won Again" + text "WAR PHASE WON!"

DESCRIPTION RULES — write the BRIEF for an AI image generator. MUST include:
- The CELEBRITY NAME so the generator places the right face on the right side of the phone (e.g. "celebrity: Joe Rogan, late 50s, bald, grey goatee, black t-shirt")
- The PHONE SCREEN content — a topic-specific image showing on the phone (e.g. "phone screen shows a glowing alien face / a moon with data servers / war battlefield")
- The BIG TEXT on screen (matches thumbnailText, ALL CAPS, white + red split)
- Background = pure black or very dark grey, cinematic.
- Keep it 3-5 sentences, actionable for an image model.`

    : videoStyle === 'phone_clean'
    ? `STYLE — Phone Clean (White background, phone left, bold text center-right):
TITLE RULES:
- Short & punchy, reveals a hidden truth or secret about the SPECIFIC topic in the script. 40-60 chars.
- MUST name the exact entity (company, person, tech, country, event) from the script — no generic titles.
- BAD: "Something Shocking Is Happening" (zero info, could be anything)
- GOOD (for OpenAI script): "OpenAI's Hidden Plan Nobody Told You About"
- GOOD (for India space script): "India's Secret Space Mission Just Got Exposed"

THUMBNAIL TEXT RULES:
- 2-5 words ALL CAPS. One key word goes in a SOLID RED RECTANGLE. Extract from the script topic.
- The boxed word = the most shocking/secret element FROM THIS SCRIPT.
- BAD: "HIDDEN AGENDA" (generic) — GOOD: "OPENAI'S [HIDDEN] PLAN" / "INDIA'S [SECRET] MISSION"

DESCRIPTION RULES — brief for the image generator:
- Pure white background (#FFFFFF)
- Left: realistic iPhone with topic-specific image on screen + caller name "Speaking"
- Center: bold ALL CAPS 3-line text, one line in SOLID RED RECTANGLE with white text
- Right: half-body presenter figure with concerned/intrigued expression facing left
- Clean, minimal, professional feel.`

    : videoStyle === 'phone_clean_2'
    ? `STYLE — Phone Clean 2 (White background, phone left, SITTING presenter with LAPEL MIC right):
TITLE RULES:
- 40-60 chars. Direct, reveals insider info about the SPECIFIC topic from the script.
- MUST name the exact entity from the script — never vague or generic.
- BAD: "The Truth Nobody Knows" (no entity, zero info)
- GOOD (for Tesla script): "The Real Reason Tesla Fired Half Its Engineers"
- GOOD (for India script): "India's Secret Plan That America Fears"

THUMBNAIL TEXT RULES:
- 2-5 words ALL CAPS. One key word in SOLID RED RECTANGLE. Must be TOPIC-SPECIFIC.
- Extract the most shocking element from THIS script's topic.
- BAD: "THE REAL PLAN" (generic) — GOOD: "TESLA'S [REAL] PLAN" / "INDIA [GOES] NUCLEAR"

DESCRIPTION RULES — brief for the image generator:
- Pure white background (#FFFFFF), clean minimal
- Left: realistic iPhone portrait with topic-specific image on screen + caller name "Speaking"
- Center: bold ALL CAPS 3-line impact text, middle line in SOLID RED RECTANGLE
- Right: SITTING presenter in chair/stool — upper body, clip-on LAPEL MIC visible on shirt/lapel, facing left toward text, confident expression
- Lapel mic detail: small silver/black clip microphone on chest, realistic and clearly visible
- No separate background behind the presenter — clean cut-out on white`

    : videoStyle === 'phone_dual'
    ? `STYLE — Phone Dual (Two phones side by side, topic text center):
TITLE RULES:
- Question format works best: "Do X Exist?", "Does Y Know About Z?", "X vs Y — Who's Right?"
- Name BOTH characters if the script has them. 40-65 chars.
- GOOD: "Do Aliens Exist? Trump Calls To Find Out"
- GOOD: "Elon Calls Putin: What Did They Really Say?"

THUMBNAIL TEXT RULES:
- 2-4 words. Giant bold ALL CAPS center text. Works best as a question or single shocking fact.
- GOOD: "DO ALIENS EXIST?" / "IS THIS REAL?" / "THEY KNOW"

DESCRIPTION RULES — brief for the image generator:
- Light gray/white gradient background
- LEFT phone: Character 1 (speaking) — their photo on screen, "Speaking" green dot indicator
- RIGHT phone: Character 2 (listening) — their photo or blue listening circle on screen
- CENTER: Giant bold impact typography with ONE red word/phrase
- Two phones slightly angled inward toward the text`

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
- Together = feels like a BREAKING STORY viewers CANNOT ignore.

DESCRIPTION RULES — brief for the AI image generator:
- Fox News Alert chyron style: bold red BREAKING NEWS banner at bottom, dark blue/grey background
- LARGE face of the real political figure/analyst from this script — named specifically (e.g. "Trump, 78, silver hair, dark suit, shocked expression")
- Behind them: topic-specific background image (e.g. "US-China trade war map", "burning Ukrainian city", "Federal Reserve building")
- thumbnailText as a bold chyron bar at the bottom — white text on dark red rectangle
- High contrast, news broadcast aesthetic`

    : videoStyle === 'podcast_2'
    ? `STYLE — Podcast 2 (Two real hosts + center topic image insert with colored border):
TITLE RULES:
- Conversational, specific — sounds like two real people reacting to something. 55-75 chars.
- NAME the specific topic, guest, or thing being discussed — never generic.
- GOOD: "Joe Rogan and Guest React To Moon Landing Evidence"
- GOOD: "Trump's Real Opinion On Drinking — Shocking Reveal"
- GOOD: "The Truth About COVID Vaccines — No Filter Conversation"

THUMBNAIL TEXT RULES:
- Not actual on-screen text — describe the CENTER INSERT IMAGE visual (what goes inside the colored border box).
- 4-8 words describing the topic-specific image that appears in the center insert.
- Must be a clear, photorealistic, visually striking image description.
- GOOD: "COVID-19 vaccine bottle held by gloved hand"
- GOOD: "whiskey being poured into crystal glass"
- GOOD: "moon surface with rainbow light beam from space"

DESCRIPTION RULES — brief for the AI image generator:
- Background: blurred warm podcast studio with equipment
- LEFT SIDE: Name the real host from the script (e.g. "Joe Rogan, bald, black t-shirt, facing right with mic")
- RIGHT SIDE: Name the real guest from the script (e.g. "Elon Musk, dark suit, facing left with mic, reacting expression")
- CENTER INSERT: Thick colored border box with a SPECIFIC topic image inside — describe the exact image from this script topic (e.g. "Tesla Cybertruck in flames", "COVID-19 vaccine vial glowing", "glowing moon surface with data server")
- Border color: green (science/space), red (political/war), cyan (health/tech), orange (entertainment) — pick based on topic`

    : videoStyle === 'movie_review'
    ? `STYLE — Cinematic Review (full dramatic background image + dark gold-border box with bold yellow hook text on left):
TITLE RULES:
- Opinionated, punchy tone. NAME the specific topic (film, book, brand, event, person). 45-70 chars.
- Can be Hindi/English/Hinglish. Can use emojis. Works for any topic, not just movies.
- GOOD: "Krishnavataram Review: Dhoka Hua Mere Saath 💔"
- GOOD: "Ramayana Movie — Not Indian Enough? My Honest Take 😱"
- GOOD: "Jolly LLB 3 Review: WTF Bhai Rula Diya 🔥"
- GOOD (non-movie): "Apple's Biggest Failure — Full Story 🤯"

THUMBNAIL TEXT RULES:
- 3-6 words raw reaction/hook in LARGE BOLD YELLOW inside a dark gold-border box. Can be Hindi/Hinglish + emoji.
- GOOD: "DHOKA HUA 💔 MERE SATH" / "WTF BHAI 🔥 RULA DIYA" / "NOT INDIAN 😱 ENOUGH"
- Extract from the actual topic/sentiment in the script.

DESCRIPTION RULES — brief for the AI image generator:
- BACKGROUND: Describe the EXACT scene from this specific topic (e.g. "Ranbir Kapoor as Ram in Ramayana epic temple scene, golden hour lighting" OR "Steve Jobs in black turtleneck on Apple stage, spotlight" — NOT generic)
- LEFT-CENTER: Dark semi-transparent box with GOLD border. Inside TOP: topic name in small white caps. MIDDLE: thumbnailText in LARGE BOLD YELLOW. BOTTOM: content type label (MOVIE REVIEW / DEEP DIVE / FULL STORY / etc.)
- No host/reviewer face — background scene only
- Cinematic color grade matching THIS topic's specific mood`

    : videoStyle === 'corkboard_meta'
    ? `STYLE — Corkboard Meta (blue top banner + cork board bg + annotated thumbnail pinned + presenter face right):
TITLE RULES:
- Meta educational / formula-reveal tone. 50-70 chars. Names what's being broken down.
- GOOD: "The Viral Formula Behind Every 10M View Podcast Thumbnail"
- GOOD: "Why DOAC Thumbnails Always Go Viral — Broken Down"
- GOOD: "How MrBeast Designs Thumbnails That Get Billions Of Views"

THUMBNAIL TEXT RULES:
- 2-4 words for the BLUE TOP BANNER. First word in [BRACKETS] gets YELLOW BOX on blue.
- GOOD: "[Viral] Formula", "[Secret] Structure", "[Hidden] Blueprint", "[Real] Strategy"

DESCRIPTION RULES — brief for the AI image generator:
- TOP BANNER: Bright blue horizontal bar full width, top 12% of frame — holds the banner title (yellow box first word + white bold remaining words)
- BACKGROUND (below banner): Cork/bulletin board texture — warm tan/brown, natural cork material, realistic texture fills entire remaining frame
- CENTER-LEFT: A smaller YOUTUBE THUMBNAIL pinned to the cork board with a red pushpin at the top center — the mini thumbnail shows two podcast hosts with bold text overlay (any podcast style). The mini thumbnail is slightly tilted (~3°)
- ANNOTATION LABELS on the mini thumbnail: 3 glitchy/pixelated red-orange label boxes with white text — "Subject" (pointing to left person), "Hook" (pointing to text), "Caption" (pointing to bottom) — connected by thin red lines/arrows to their targets
- RIGHT SIDE (40%): Presenter face — young professional, thoughtful expression, chin on hand or pointing gesture, looking at the cork board area, clean cut-out against the cork texture`

    : videoStyle === 'podcast_4'
    ? `STYLE — Viral Tweet / Scandal Documentary (dark background, two emotional faces, giant social media post center):
TITLE RULES:
- Documentary/exposé tone. Name the real person, brand, or event. 55-80 chars.
- GOOD: "The Café Coffee Day Founder's Last Tweet Before He Disappeared"
- GOOD: "How One Tweet Ended India's Biggest Coffee Chain"
- GOOD: "When A Founder's 'I Quit' Post Shocked The Entire Country"

THUMBNAIL TEXT RULES:
- The actual shocking post/message shown INSIDE the social media screenshot. 2-6 words MAX.
- Must feel like a REAL social media post someone actually wrote — TOPIC-SPECIFIC to the script.
- NEVER use "EXPOSED" or any generic word — the text must come from the actual drama in the script.
- Finance/Business: "We're Filing Bankruptcy", "I Lost Everything", "The Company Is Over"
- Resignation/Quit: "I Quit...", "I Resign Today", "It's Over For Me"
- Personal crisis: "I Failed My Family", "I Can't Do This Anymore", "I'm Sorry Everyone"
- Political: "I Resign Effective Today", "They Forced Me Out", "This Is My Last Post"
- Relationship: "She Left Me", "I Lied To You All", "It Was All Fake"
- Death/Loss: "He's Gone. I Tried.", "I Couldn't Save Him"
- Always extract from the ACTUAL turning point event in the script — what was the viral/real message?

DESCRIPTION RULES — brief for the AI image generator:
- Background: very dark charcoal/near-black with slight vignette
- LEFT: Name the actual subject person from the script (e.g. "V.G. Siddhartha, founder of Café Coffee Day — close-up face, tears, devastated expression"). Thick BLACK CENSOR BAR over eyes with topic-specific word (NOT "EXPOSED" — e.g. "BANKRUPT", "SU*CIDE", "RUINED")
- CENTER: Large social media post screenshot — real account name from script, thumbnailText as GIANT BOLD post message, red underline, realistic timestamp
- RIGHT: Name the narrator/reactor from the script if known, otherwise "serious young narrator, concerned expression"
- Overall: dark, investigative, documentary scandal feel — name all real people and events from script`

    : videoStyle === 'podcast_3'
    ? `STYLE — Podcast Quote (deep red background, speaker face right, bold statement left with yellow highlight word):
TITLE RULES:
- Sounds like the guest actually said something shocking. 55-75 chars. Name the speaker + claim.
- GOOD: "Scaramucci Said Bitcoin Is Complete Bullsh*t — Here's Why He Changed"
- GOOD: "Raoul Pal: Impatience Is Literally Keeping You Broke"
- GOOD: "They Are Actively Trying To Steal Your Crypto — Here's How"

THUMBNAIL TEXT RULES:
- A 4-8 word bold statement sentence with [BRACKETS] around ONE key word that gets the YELLOW BOX.
- The bracketed word = the most shocking/impactful element of the sentence.
- Extract from the actual script topic — never generic.
- GOOD: "Bitcoin is [BULLSH*T]"
- GOOD: "They want to [STEAL] your Crypto!"
- GOOD: "Impatience keeps you [Broke.]"
- GOOD: "[Just Buy This.]"

DESCRIPTION RULES — brief for the AI image generator:
- Background: deep rich crimson red gradient (#8B0000 → #CC0000)
- LEFT 45%: thumbnailText as big statement — white text with ONE word in SOLID YELLOW BOX. Below: "- [Speaker's real name from script] →" italic attribution line
- Optional topic prop: if finance/crypto, faint candlestick chart behind text; if health, subtle medical visual; if politics, faint flag
- RIGHT 55%: Name the actual speaker/guest from the script (e.g. "Raoul Pal, grey-haired economist, serious expression, podcast microphone visible"). Photorealistic, clean cutout on red background
- No logo or watermark. Describe any topic-specific element that makes this visually unique to the script`

    : videoStyle === 'cinematic_drama'
    ? `STYLE — Cinematic Drama (Bollywood / thriller / drama — NO text or MINIMAL text, pure visual storytelling):
TITLE RULES:
- Cinematic, story-driven, sounds like a film title or dramatic reveal. 55-80 chars.
- MUST name the specific person, film, or event from the script.
- GOOD: "Ranbir Kapoor Destroys Avatar & Avengers — Here's Why"
- GOOD: "The Dark Truth Behind Punjab's Drug Mafia Nobody Talks About"
- GOOD: "When God Said Pull The Lever — The Trolley Problem Explained"

THUMBNAIL TEXT RULES:
- This is NOT a headline. It is either EMPTY or a single short element that appears naturally in the visual.
- Option A: "" (empty — pure visual thumbnail, zero text)
- Option B: A short QUOTE in "quotes" as a character would say it: e.g. "God said pull"
- Option C: A single dramatic word if absolutely needed: "EXPOSED"
- DEFAULT to "" (empty) unless a quote or single word would dramatically add to the visual.

DESCRIPTION RULES — brief for the AI image generator:
- ZERO TEXT unless thumbnailText has a quote — if so, tiny white text top-left corner only
- RIGHT SIDE: EXTREME CLOSE-UP of the main character from this script — name them specifically (e.g. "Ranbir Kapoor, intense bloodshot eyes, bruised face, dark lighting"). Face fills 40-50% of frame
- BACKGROUND/LEFT: Describe the exact topic-specific dramatic scene from the script (e.g. "Punjab drug mafia dealing scene in a dark alley at night", "courtroom with judges", "battlefield with tanks")
- Cinematic color grade specific to this topic's mood (e.g. "teal-orange Bollywood poster grade", "cold blue thriller grade", "warm golden drama grade")
- Multi-layer depth: foreground face + middle scene + background environment — photorealistic film still quality`

    : videoStyle === 'news_dramatic'
    ? `STYLE — News Dramatic (Career247 / ABP / India TV breaking news thumbnail):
TITLE RULES:
- Hard-hitting breaking news headline. NAME the specific event + person + consequence. 55-75 chars.
- Format: "[Shocking Event]!! — [Consequence/Twist]" works perfectly.
- GOOD: "Israel Attacks Iran!! — Humiliation For Trump!!"
- GOOD: "Moscow Burning!! — Why Black Rain On Putin??"
- GOOD: "Pakistan Increases Defence Budget By 18%!! — War With India Near??"

THUMBNAIL TEXT RULES:
- Two stacked blocks — format: "HEADLINE | SUBHEADLINE" (pipe-separated, ALL CAPS, max 5 words each)
- Headline (BLUE BOX — top): the main shocking event in 2-4 ALL-CAPS words. Very short, punchy.
- Subheadline (dark box — below): the consequence or reaction in 2-5 ALL-CAPS words.
- BOTH must come from the actual script — never generic fillers like "BIG NEWS" or "BREAKING"
- GOOD: "INDIA STRIKES BACK!! | PAKISTAN IN SHOCK!!"
- GOOD: "MARKET CRASHES!! | DOLLAR AT 90!!"
- GOOD: "TRUMP BANS INDIA | WAR IMMINENT??"
- The AI will also auto-derive better topic-specific headline/subheadline from the script during image generation

DESCRIPTION RULES — brief for the AI image generator:
- BACKGROUND: Describe the EXACT topic-specific scene from this script (e.g. "Indian Air Force jets firing missiles at night over Pakistani border, orange explosion clouds", "US Congress in chaos, senators shouting, American flags", "burning Ukrainian town with black smoke")
- LEFT TEXT BLOCKS: Blue (#1565C0) rectangle on top with headline, dark charcoal rectangle below with subheadline — both sharp-edged, bold white ALL-CAPS
- FOREGROUND CENTER: Name the REAL person from this script (e.g. "Donald Trump, 78, silver hair, dark suit, shocked open-mouthed expression") — VERY LARGE, overlapping both text blocks and background
- Photorealistic, cinematic quality — NOT illustrated
- NO channel name, NO "By [Name]" text`

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
7. For each combo, write a "description" — a STYLE-SPECIFIC and SCRIPT-SPECIFIC visual brief for an AI image generator. CRITICAL RULES for the description:
   a. FOLLOW THE DESCRIPTION RULES from the style guide above for layout structure (which element goes where, what colors, what format).
   b. Make EVERY detail 100% specific to THIS script — NEVER use generic placeholders:
      - NAME the actual real person/celebrity from the script (e.g. "Donald Trump, 78, silver hair, dark suit" — NOT "a political figure")
      - DESCRIBE the exact topic-specific scene (e.g. "Indian fighter jets firing over Pakistani border at night, orange explosion glow" — NOT "a dramatic scene")
      - SPECIFY the exact thumbnail text and where it appears per the style's layout
      - ADD topic-specific props/elements that make this thumbnail unique to THIS script
   c. Keep it 3-5 sentences, actionable and specific enough that an image model can execute it without guessing.
8. Return ONLY valid JSON array of exactly 3 objects: [{"title": "...", "thumbnailText": "...", "description": "..."}, ...]

SCRIPT TO ANALYZE:
${scriptText.slice(0, 3500)}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
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

export const generateThumbnailInspiration = async (scriptText: string, videoStyle: ThumbnailVideoStyle = 'situational'): Promise<string> => {
  const ai = getAi();

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
      model: 'gemini-3.5-flash',
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
      model: 'gemini-3.5-flash',
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
      model: 'gemini-3.5-flash', 
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
  model: string = 'gemini-3.5-flash',
  language: string = 'English',
  style: 'debate' | 'debate2' | 'conversational' | 'formal debate' | 'explained' | 'explained_solo' | 'deep_explainer' | 'image' | 'podcast_breakdown' | 'podcast_panel' | 'context_bridge' | 'situational' | 'documentary' | 'joe_rogan' | 'finance_deep_dive' | 'professor_jiang' | 'book_summary' | 'questioning' | 'transcript_review' | 'summarizer_pov' | 'phone_studio' = 'debate',
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
      model: 'gemini-3.5-flash',
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
      model: 'gemini-3.5-flash',
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

// ── Step 1: Extract style from reference image (pure inspection, no generation) ──
const extractStyleFromImage = async (
  referenceImage: { data: string; mimeType: string }
): Promise<string> => {
  const response = await callGemini('gemini-3.5-flash', {
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
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
};

export const generateThumbnail = async (title: string, hostName: string, guestName: string, referenceImage?: { data: string, mimeType: string }, extraInstructions?: string, onStep?: (step: 'inspecting' | 'analyzing' | 'generating') => void, videoStyle?: string, scriptText?: string, topicName?: string): Promise<string> => {
  const ai = getAi();

  let professorImagePart: any = null;

  const extraNote = extraInstructions?.trim()
    ? `\n\nCREATOR EXTRA INSTRUCTIONS (apply these on top):\n${extraInstructions.trim()}`
    : '';

  let prompt: string;

  if (referenceImage) {
    // Step 1: Extract style from reference image
    onStep?.('inspecting');
    const styleAnalysis = await extractStyleFromImage(referenceImage);

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

  } else if (videoStyle === 'phone_studio') {
    const scriptSnippet = scriptText?.slice(0, 2000) || '';
    // The featured person whose face goes on the right side of the thumbnail.
    // The user picks them in the "Guest" field — fall back to host if guest empty.
    const celebrityName = (guestName || hostName || '').trim();

    // ── Step 1: Ask Gemini what should appear on the PHONE SCREEN ──
    let phoneScreenVisual = 'A topic-specific dramatic photo filling the phone screen — e.g. a glowing alien face, a moon base, a war battlefield, a stock market crash — chosen to match the script topic';
    let celebrityDescription = celebrityName
      ? `${celebrityName} — match the real public photographs of this person EXACTLY (face, age, hair, signature look). Confident expression, head-and-shoulders crop.`
      : 'A confident, recognizable male public figure appropriate for the topic — photorealistic head-and-shoulders crop, dramatic studio lighting';

    if (scriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{
            role: 'user',
            parts: [{
              text: `You are a thumbnail art director for the "Phone Studio" YouTube style — viral format: vertical phone FAR LEFT showing topic image, large celebrity face CENTER-RIGHT, huge red+white hook text in the middle.

SCRIPT:
${scriptSnippet}

CELEBRITY (person whose face is large on the right): ${celebrityName || '(infer from script — who is the most prominent person?)'}
HOOK TEXT: "${title}"
${topicName ? `TOPIC: ${topicName}` : ''}

Decide:
1. PHONE SCREEN VISUAL: The single most dramatic, topic-specific image to fill the phone screen. Must instantly tell the viewer what the video is about. Be hyper-specific to THIS script — not generic.
   - India-Pakistan war script → "Indian fighter jets firing missiles over Pakistani border at night, orange explosion plumes, dramatic aerial view"
   - Bitcoin crash script → "Bitcoin symbol shattering like glass, red market chart plummeting, dark dramatic lighting"
   - Political scandal → "specific politician's leaked document on screen, stamped 'CLASSIFIED' in red"
   - Not: generic battlefield / generic chart — SPECIFIC to this exact topic

2. CELEBRITY DESCRIPTION: Real name, their signature appearance (exact hair, age look, clothing style they're known for), and the emotional expression that fits this topic mood. This must match their real public photographs.

Reply ONLY in JSON, no markdown:
{
  "phoneScreen": "Vivid 2-3 sentence description of the topic image on phone screen — 100% specific to this script, photorealistic, dramatic",
  "celebrity": "Full description: name, exact appearance (hair, age, typical clothing), expression for this topic"
}`
            }]
          }],
          config: { responseMimeType: 'application/json' },
        });
        const entityRaw = (() => {
          const raw = entityResponse.text?.trim() || '{}';
          const m = raw.match(/\{[\s\S]*\}/);
          return m ? m[0] : '{}';
        })();
        const entities = JSON.parse(entityRaw);
        if (entities.phoneScreen) phoneScreenVisual = entities.phoneScreen;
        if (entities.celebrity && !celebrityName) celebrityDescription = entities.celebrity;
        else if (entities.celebrity && celebrityName) {
          celebrityDescription = `${celebrityName} — ${entities.celebrity}. Match the real public photographs of ${celebrityName} EXACTLY (face, age, hair, signature look).`;
        }
      } catch (e) {
        console.warn('[PhoneStudio] entity extraction failed, using fallback:', e);
      }
    }

    // Split the hook text — first half white, last 1-2 words red (matches reference).
    const hookClean = (title || '').replace(/["“”]/g, '').trim();
    const hookWords = hookClean.split(/\s+/).filter(Boolean);
    const redWordCount = Math.min(2, Math.max(1, Math.floor(hookWords.length / 2)));
    const whitePart = hookWords.slice(0, hookWords.length - redWordCount).join(' ');
    const redPart   = hookWords.slice(hookWords.length - redWordCount).join(' ');

    prompt = `You are a world-class YouTube thumbnail designer creating a "PHONE STUDIO" style thumbnail — viral AI-chat / podcast-clip aesthetic. The composition is FIXED:

════ EXACT LAYOUT — 1920×1080, 16:9 ════

▶ LEFT SIDE (left 0–28% of frame): A REALISTIC IPHONE-STYLE SMARTPHONE
- Vertical phone, slight tilt (~-4°), photorealistic glossy black bezel, rounded corners
- Phone is FULL HEIGHT — top of phone near top edge, bottom near bottom edge of frame
- Status bar at top: small white text "${celebrityName || 'Speaker'}" (left, with tiny pulse dot "● Speaking") and "73% 🔋" on the right
- The ENTIRE phone screen is filled with this image: ${phoneScreenVisual}
- Image on screen must be vivid, dramatic, topic-specific — it is the visual story of the script
- At the bottom of the phone screen: a small red circular X close button (end call button)
- Subtle side-light glinting on the bezel

▶ CELEBRITY FACE — LARGE, CENTER-DOMINANT (fills center-right ~35% to 100% of frame):
- ${celebrityDescription}
- Face and upper body positioned CENTER to RIGHT — their face should be the LARGEST element
- The celebrity's body starts from about 35% of the frame width, extending to the right edge
- Face should be at roughly 60-65% of frame width — LARGE, prominent, not squeezed to the side
- Looking TOWARD the left/center (toward the phone and text)
- Cinematic studio lighting — sharp focus, dramatic rim light matching topic mood
- A small floating name label near their shoulder: "${celebrityName || 'SPEAKER'}" in white text with thin pointer line
- Person visually DOMINATES the right half — this is the emotional anchor of the thumbnail

▶ CENTER OVERLAY — THE MASSIVE HOOK TEXT (overlapping phone right edge and celebrity left body):
- The text "${hookClean}" rendered HUGE, between the phone and celebrity (roughly 22%–58% of frame width)
- Font: ultra-bold condensed italic display sans-serif (Anton / Impact / Bebas Neue extended-italic), ALL CAPS, slight rightward lean
- Color split: "${whitePart}" in PURE WHITE, "${redPart}" in BRIGHT RED (#ED1C24)
- Stack on 2-3 lines, left-aligned to the phone's right edge
- Slight dark drop-shadow for readability against the celebrity face
- Text overlaps BOTH the phone (right edge) and the celebrity body (left portion) — this overlap creates the layered depth

▶ BACKGROUND:
- SOLID PURE BLACK (#0a0a0a) — absolutely uniform, no variation
- ZERO texture, ZERO pattern, ZERO bokeh, ZERO grain, ZERO gradients
- Only 3 things exist: (1) phone on far left, (2) celebrity face center-right, (3) hook text in the middle
- Think photography studio black backdrop — flat, featureless, infinite

════ STRICT RULES ════
- Photorealistic — NOT illustrated, NOT cartoon, NOT 3D-rendered
- Celebrity face MUST fill a large area — they are NOT a small figure on the side; they dominate the right 65% of the frame
- Celebrity MUST be recognizable as ${celebrityName || 'the named figure'} — match real reference photos exactly
- Phone screen visual MUST match the script topic — viewers must immediately understand what the video is about
- Hook text is bold, high-contrast, sharp — white + red split as specified
- BACKGROUND IS PURE SOLID BLACK — any texture, gradient, or extra element is FORBIDDEN
- 16:9 aspect ratio (1920×1080)
- No watermarks, no logos${extraNote}`;

  } else if (videoStyle === 'phone_clean') {
    const scriptSnippet = scriptText?.slice(0, 2000) || '';
    const callerName = (guestName || hostName || 'AI Assistant').trim();

    let phoneScreenVisual = 'A dramatic, high-contrast topic-relevant image filling the entire phone screen — mysterious, glowing, cinematic';
    let creatorDesc = hostName ? `${hostName} — photorealistic headshot, concerned or intrigued expression, professional look` : '';

    if (scriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{ role: 'user', parts: [{ text: `Read this script and decide what image to show on the phone screen for a YouTube thumbnail.\n\nSCRIPT:\n${scriptSnippet}\nHOOK TEXT: "${title}"\nCALLER: ${callerName}\n\nReply ONLY in JSON:\n{"phoneScreen":"vivid 1-2 sentence description of the topic image on the phone screen — dramatic, topic-specific","callerNote":"one sentence about the caller entity's visual icon or logo to show as phone avatar"}` }] }],
          config: { responseMimeType: 'application/json' },
        });
        const raw = entityResponse.text?.trim() || '{}';
        const m = raw.match(/\{[\s\S]*\}/);
        const entities = JSON.parse(m ? m[0] : '{}');
        if (entities.phoneScreen) phoneScreenVisual = entities.phoneScreen;
      } catch (e) {
        console.warn('[PhoneClean] entity extraction failed, using fallback:', e);
      }
    }

    const hookWords = title.trim().toUpperCase().split(/\s+/).filter(Boolean);
    const redCount = Math.min(2, Math.max(1, Math.floor(hookWords.length / 3)));
    const blackPart1 = hookWords.slice(0, Math.floor((hookWords.length - redCount) / 2)).join(' ');
    const redPart    = hookWords.slice(Math.floor((hookWords.length - redCount) / 2), hookWords.length - redCount).join(' ');
    const blackPart2 = hookWords.slice(hookWords.length - redCount).join(' ');

    prompt = `You are a world-class YouTube thumbnail designer creating a "PHONE CLEAN" style thumbnail — exactly matching the reference style: phone on left, big text center, presenter/person on right.

════ EXACT LAYOUT — 1920×1080, 16:9 ════

▶ BACKGROUND: Pure white (#FFFFFF) — clean, minimal, no textures, no gradients

▶ LEFT SIDE (30% of frame): REALISTIC iPHONE
- Portrait iPhone, slight 6° rightward tilt, photorealistic black glossy bezel, rounded corners
- Status bar: small white text "${callerName}" (left, with tiny blue dot "● Speaking") + "73% 🔋" (right)
- Phone SCREEN filled entirely with: ${phoneScreenVisual}
- Bottom of phone screen: three call buttons (gray mic, gray ●●●, red ✕ circle)
- Realistic drop shadow on white background for depth

▶ CENTER (35% of frame): BOLD IMPACT TYPOGRAPHY — 3 stacked lines
  Line 1: "${blackPart1 || title.split(' ')[0].toUpperCase()}" — PURE BLACK (#000000), ultra-bold condensed, Impact/Anton style
  Line 2: "${redPart || (title.split(' ')[1] || 'HIDDEN').toUpperCase()}" — WHITE text on a SOLID RED RECTANGLE (#CC0000) — the rectangle is a full-width banner behind this word, white text centered inside it
  Line 3: "${blackPart2 || title.split(' ').slice(-1)[0].toUpperCase()}" — PURE BLACK (#000000), same style as Line 1
- Text lines are tightly stacked, centered in this zone

▶ RIGHT SIDE (35% of frame): ${creatorDesc ? `PRESENTER / CREATOR` : 'TOPIC VISUAL'}
${creatorDesc
  ? `- Photorealistic half-body or 3/4-body figure of ${creatorDesc}
- Standing or slightly gesturing toward the text (facing left)
- Clean cut-out on the white background — NO separate background behind them
- Natural lighting matching the white background — casual professional look`
  : `- A dramatic topic-relevant image or icon that represents "${callerName}" or the subject
- Slightly faded / subtle so text stays dominant`}

════ STRICT RULES ════
- PURE WHITE background — not gray, not gradient
- Typography ENORMOUS — must read at thumbnail size
- Phone photorealistic with proper iOS call UI
- Red rectangle on Line 2 is the hero visual element — make it vivid
- 16:9 exactly. No watermarks.${extraNote}`;

  } else if (videoStyle === 'phone_clean_2') {
    const scriptSnippet = scriptText?.slice(0, 2000) || '';
    const callerName = (guestName || hostName || 'AI Assistant').trim();
    const presenterDesc = hostName
      ? `${hostName} — photorealistic upper body, SEATED in a chair or stool, clip-on lapel microphone clearly visible on shirt/lapel near chest, confident expression, looking slightly left toward camera`
      : 'a professional presenter — seated in a chair, clip-on lapel microphone visible on shirt, confident expression, facing slightly left';

    let phoneScreenVisual = 'A dramatic, high-contrast topic-relevant image filling the entire phone screen — cinematic, specific to the topic';

    if (scriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{ role: 'user', parts: [{ text: `Read this script and decide what image to show on the phone screen for a YouTube thumbnail.\n\nSCRIPT:\n${scriptSnippet}\nHOOK TEXT: "${title}"\nCALLER: ${callerName}\n\nReply ONLY in JSON:\n{"phoneScreen":"vivid 1-2 sentence description of the topic image on the phone screen — dramatic, topic-specific, cinematic"}` }] }],
          config: { responseMimeType: 'application/json' },
        });
        const raw = entityResponse.text?.trim() || '{}';
        const m = raw.match(/\{[\s\S]*\}/);
        const entities = JSON.parse(m ? m[0] : '{}');
        if (entities.phoneScreen) phoneScreenVisual = entities.phoneScreen;
      } catch (e) {
        console.warn('[PhoneClean2] entity extraction failed, using fallback:', e);
      }
    }

    const hookWords = title.trim().toUpperCase().split(/\s+/).filter(Boolean);
    const redCount = Math.min(2, Math.max(1, Math.floor(hookWords.length / 3)));
    const blackPart1 = hookWords.slice(0, Math.floor((hookWords.length - redCount) / 2)).join(' ');
    const redPart    = hookWords.slice(Math.floor((hookWords.length - redCount) / 2), hookWords.length - redCount).join(' ');
    const blackPart2 = hookWords.slice(hookWords.length - redCount).join(' ');

    prompt = `You are a world-class YouTube thumbnail designer creating a "PHONE CLEAN 2" style thumbnail — white background, phone on left, big bold text center, SEATED presenter with LAPEL MIC on right.

════ EXACT LAYOUT — 1920×1080, 16:9 ════

▶ BACKGROUND: Pure white (#FFFFFF) — completely clean, no textures, no shadows on background

▶ LEFT SIDE (28% of frame): REALISTIC iPHONE
- Portrait iPhone, slight 6° rightward tilt, photorealistic black glossy bezel, rounded corners
- Status bar: small white text "${callerName}" (left, tiny blue dot "● Speaking") + "73% 🔋" (right)
- Phone SCREEN filled entirely with: ${phoneScreenVisual}
- Bottom of phone screen: three call buttons (gray mic, gray ●●●, red ✕ circle)
- Realistic drop shadow for depth

▶ CENTER (37% of frame): BOLD IMPACT TYPOGRAPHY — 3 stacked lines
  Line 1: "${blackPart1 || hookWords.slice(0, 2).join(' ')}" — PURE BLACK (#000000), ultra-bold condensed, Impact/Anton style, enormous size
  Line 2: "${redPart || hookWords[Math.floor(hookWords.length / 2)]}" — WHITE text inside a SOLID RED RECTANGLE (#CC0000) — full-width banner, white text centered
  Line 3: "${blackPart2 || hookWords.slice(-2).join(' ')}" — PURE BLACK (#000000), same size as Line 1
- All 3 lines tightly stacked, centered in this zone, massive readable size

▶ RIGHT SIDE (35% of frame): SEATED PRESENTER WITH LAPEL MIC
- Photorealistic upper-body shot of ${presenterDesc}
- SEATED position — person is in a chair or on a stool, NOT standing
- LAPEL MICROPHONE: small silver/black clip-on mic attached to shirt collar/lapel area, clearly visible, realistic detail — this is a key element
- Person faces slightly LEFT toward the center text, looking at camera with engaged confident expression
- Clean cut-out on the pure white background — NO separate background behind them
- Casual-professional attire: button shirt or jacket, the lapel mic clipped on the chest/collar

════ STRICT RULES ════
- PURE WHITE background — absolutely no gray, no gradient
- Typography ENORMOUS — dominant visual element, must be readable at small thumbnail size
- Seated presenter is essential — NOT standing, NOT half-body standing pose
- Lapel mic must be clearly visible and realistic — not hidden, not tiny
- Phone photorealistic with proper iOS call UI elements
- Red rectangle (Line 2) is the hero accent — bold, vivid red
- 16:9 exactly. No watermarks. No logos.${extraNote}`;

  } else if (videoStyle === 'phone_dual') {
    const scriptSnippet = scriptText?.slice(0, 2000) || '';
    const char1 = (guestName || 'Character 1').trim();
    const char2 = (hostName || 'Character 2').trim();

    let char1Screen = `${char1}'s face filling the screen — photorealistic, dramatic studio lighting, intense expression, pointing or gesturing, microphone visible`;
    let char2Screen = `${char2}'s face — photorealistic, soft neutral lighting, thoughtful listening expression, looking slightly off-screen`;
    let char2IsPerson = true;

    if (scriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{ role: 'user', parts: [{ text: `For a YouTube thumbnail showing TWO phones in a conversation:\n\nSCRIPT:\n${scriptSnippet}\nHOOK TEXT: "${title}"\nLEFT PHONE (speaking): ${char1}\nRIGHT PHONE (listening/topic): ${char2}\n\nDecide: is the RIGHT phone showing a REAL PERSON's face, or a TOPIC/COUNTRY/CONCEPT image?\n- If "${char2}" is a real public figure → show their face photorealistically\n- If "${char2}" is a country, topic, brand, concept → show a dramatic recognizable image (e.g. Chinese flag + Shanghai skyline, Moon with stars, etc.)\n\nReply ONLY in JSON:\n{"char1Screen":"vivid 1-2 sentence description of ${char1}'s face/appearance on the dark phone screen — intense, photorealistic","char2Screen":"vivid 1-2 sentence description of what fills the RIGHT phone screen (either face or topic image)","char2IsPerson":true}` }] }],
          config: { responseMimeType: 'application/json' },
        });
        const raw = entityResponse.text?.trim() || '{}';
        const m = raw.match(/\{[\s\S]*\}/);
        const entities = JSON.parse(m ? m[0] : '{}');
        if (entities.char1Screen) char1Screen = entities.char1Screen;
        if (entities.char2Screen) char2Screen = entities.char2Screen;
        if (entities.char2IsPerson !== undefined) char2IsPerson = !!entities.char2IsPerson;
      } catch (e) {
        console.warn('[PhoneDual] entity extraction failed, using fallback:', e);
      }
    }

    // Text layout matching reference: "[Speaker]:" / "[KEY WORD in RED BOX]" / "[rest]"
    const hookClean = title.trim();
    const hookWords2 = hookClean.split(/\s+/).filter(Boolean);
    // First line: speaker name + colon. Middle: key word(s) in red box. Last: rest of claim.
    const speakerLine = char1.toUpperCase() + ':';
    let redWord = hookWords2[0]?.toUpperCase() || title.toUpperCase();
    let restLine = hookWords2.slice(1).join(' ').toUpperCase() || '';
    // If title has 3+ words, put middle word(s) in red box
    if (hookWords2.length >= 3) {
      const mid = Math.floor(hookWords2.length / 2);
      redWord = hookWords2.slice(0, mid).join(' ').toUpperCase();
      restLine = hookWords2.slice(mid).join(' ').toUpperCase();
    }

    prompt = `You are a world-class YouTube thumbnail designer creating a viral "PHONE DUAL" style thumbnail — exactly matching the reference style where two phones flank bold center text on a white background.

════ EXACT LAYOUT — 1920×1080, 16:9 ════

▶ BACKGROUND: Pure white to very light gray (#ffffff → #f2f2f2) — clean, minimal, airy

▶ LEFT PHONE (30% of frame, left side): ${char1.toUpperCase()} IS SPEAKING
- DARK/BLACK iPhone — photorealistic glossy black bezel, rounded corners
- Status bar: small white text "09:41" top-left, "73% 🔋" top-right
- Below status bar: "${char1}" in white bold, below it green dot "● Speaking"
- ENTIRE dark phone screen filled edge-to-edge with: ${char1Screen}
- Bottom call buttons: mic icon (gray circle), ••• (gray circle), red ✕ circle (hang up)
- Phone tilts very slightly clockwise (~5°). Strong realistic drop shadow.

▶ RIGHT PHONE (30% of frame, right side): ${char2.toUpperCase()} IS LISTENING
- WHITE/SILVER iPhone — photorealistic white or silver bezel, rounded corners — NOT black
- Status bar: small dark text "09:41" top-left, "73% 🔋" top-right (dark text on light background)
- Below status bar: "${char2}" in dark bold text, below it blue dot "● Listening" in blue text
- Phone screen: ${char2IsPerson ? `${char2Screen} — face filling most of the screen with neutral background` : `${char2Screen} — fills the entire screen dramatically`}
- Bottom call buttons: mic icon (gray circle), ••• (gray circle), red ✕ circle (hang up)
- Phone tilts very slightly counter-clockwise (~5°). Strong realistic drop shadow.

▶ CENTER TEXT (40% of frame, dominant):
EXACT 3-LAYER TYPOGRAPHY matching reference style:

TOP LINE: "${speakerLine}" — huge ultra-bold condensed black (#000000) serif/impact font, weight 900
MIDDLE BAND: A solid RED RECTANGLE (#CC0000 to #ED1C24) spanning ~60-70% of the text column width, containing "${redWord}" in crisp white bold letters centered inside the rectangle — this is the KEY visual element
BOTTOM LINE: "${restLine}" — huge ultra-bold condensed black (#000000) same style as top line

- All text is stacked vertically, centered between the two phones
- Text slightly overlaps both phones for depth
- Very subtle black drop shadow on text for legibility

════ STRICT RULES ════
- Background MUST be white/near-white — NOT dark, NOT gray
- Left phone = BLACK bezel. Right phone = WHITE/SILVER bezel. This contrast is critical.
- The red rectangle for the middle word is MANDATORY — it's the hero element
- Both phones photorealistic with proper iOS call UI visible
- 16:9 aspect ratio, 1920×1080, no extra text or watermarks${extraNote}`;

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
          model: 'gemini-3.5-flash',
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

  } else if (videoStyle === 'podcast_2') {
    const scriptSnippet = scriptText?.slice(0, 2000) || '';
    const p2Host = (hostName || 'Podcast host').trim();
    const p2Guest = (guestName || '').trim();

    let p2InsertVisual = 'A topic-relevant photorealistic object or scene — dramatic, high-contrast, clearly tied to the script topic';
    let p2InsertBorderColor = '#00FF00';
    let p2HostDesc = `${p2Host} — photorealistic, natural podcast expression, upper body, facing toward the center`;
    let p2GuestDesc = p2Guest
      ? `${p2Guest} — photorealistic, MATCH REAL PHOTOGRAPHS of this person EXACTLY (face, hair, look), upper body, facing toward the center, engaged reacting expression`
      : 'Second podcast guest — upper body, natural reacting expression, facing toward the center';

    if (scriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{
            role: 'user',
            parts: [{
              text: `You are a YouTube thumbnail art director for a real podcast channel (Joe Rogan / Lex Fridman style).

SCRIPT:
${scriptSnippet}

HOST: ${p2Host}
GUEST: ${p2Guest || '(infer from script)'}

Based on the script topic, decide:
1. CENTER INSERT IMAGE: The single most iconic, photorealistic, visually dramatic object or scene to show in the center insert box — this is the topic visual that appears between the two hosts. Should instantly communicate what the podcast is about.
2. BORDER COLOR: The thick colored border around the insert. Pick ONE that fits the topic mood:
   - "#00FF00" (bright green) — for science/space/nature topics
   - "#FF0000" (bright red) — for political/controversial/shocking topics
   - "#00E5FF" (cyan/teal) — for health/tech/medical topics
   - "#FF6600" (orange) — for entertainment/drama topics
3. HOST description: appearance of ${p2Host} as they would look in a podcast (clothing, expression, look)
4. GUEST description: appearance of ${p2Guest || 'the guest'} (MUST match real photographs if real person)

Reply ONLY in JSON, no markdown:
{
  "insertVisual": "Vivid 2-3 sentence description of the center insert image — photorealistic, topic-specific, dramatic",
  "borderColor": "#RRGGBB hex color",
  "hostDesc": "One sentence: ${p2Host}'s appearance (hair, clothing, expression) in the podcast",
  "guestDesc": "One sentence: ${p2Guest || 'guest'}'s appearance (face, hair, clothing, expression) — match real photos if real person"
}`
            }]
          }],
          config: { responseMimeType: 'application/json' },
        });
        const p2Raw = (() => {
          const raw = entityResponse.text?.trim() || '{}';
          const m = raw.match(/\{[\s\S]*\}/);
          return m ? m[0] : '{}';
        })();
        const p2Entities = JSON.parse(p2Raw);
        if (p2Entities.insertVisual) p2InsertVisual = p2Entities.insertVisual;
        if (p2Entities.borderColor) p2InsertBorderColor = p2Entities.borderColor;
        if (p2Entities.hostDesc) p2HostDesc = `${p2Host} — ${p2Entities.hostDesc}`;
        if (p2Entities.guestDesc) {
          p2GuestDesc = p2Guest
            ? `${p2Guest} — ${p2Entities.guestDesc}. MATCH REAL PUBLIC PHOTOGRAPHS of ${p2Guest} EXACTLY.`
            : p2Entities.guestDesc;
        }
      } catch (e) {
        console.warn('[Podcast2] entity extraction failed, using fallback:', e);
      }
    }

    prompt = `You are a world-class YouTube thumbnail designer for real podcast channels (Joe Rogan Experience / Lex Fridman / Andrew Huberman style). Create a PHOTOREALISTIC thumbnail that looks like a genuine professional podcast screenshot.

TOPIC: "${title}"
HOST: ${p2Host}
GUEST: ${p2Guest || 'podcast guest'}

════ EXACT LAYOUT — 1920×1080, 16:9 ════

▶ LEFT SIDE (38% of frame): THE HOST
- ${p2HostDesc}
- Upper body, shoulders and head clearly visible, cropped at chest/waist level
- Positioned on the far LEFT, facing INWARD toward the center
- Studio microphone (black or dark grey, modern podcast mic) visible in front of them in the lower portion
- Natural expression: engaged, curious, reacting to the topic
- Slightly blurred warm studio background behind them (out of focus)

▶ RIGHT SIDE (38% of frame): THE GUEST
- ${p2GuestDesc}
- Upper body, shoulders and head clearly visible, cropped at chest/waist level
- Positioned on the far RIGHT, facing INWARD toward the center
- Studio microphone visible in front of them in the lower portion
- Natural expression: speaking, explaining, reacting — genuine podcast energy
- Slightly blurred studio or home background behind them

▶ CENTER INSERT (center 30% of frame, vertically centered, slight portrait or landscape orientation):
- A RECTANGULAR IMAGE INSERT with a THICK (8-12px equivalent) SOLID COLORED BORDER in ${p2InsertBorderColor}
- The border is crisp, bold, clearly visible against the background
- INSIDE the border box: ${p2InsertVisual}
- The insert photo is photorealistic, sharp, high-contrast, dramatically lit
- The insert floats in the center, partially overlapping both the host and guest slightly at the edges

▶ BACKGROUND:
- Warm, ambient, slightly out-of-focus podcast studio environment
- Studio equipment subtly visible: stands, cables, acoustic panels, colored lighting
- Real room feel — NOT solid color, NOT plain backdrop
- The background transitions naturally between the left and right sides

════ STRICT RULES ════
- NO big text overlay, NO headlines, NO captions on the image (the insert IS the hook)
- Both people are REAL-LOOKING — photorealistic, NOT illustrated or cartoon
- ${p2Guest ? `The guest (${p2Guest}) MUST match real public photographs of this person — face, hair, age, look` : 'The guest looks natural and credible'}
- The CENTER INSERT must be clearly framed with the thick colored border — it stands out as a deliberate element
- Microphones visible for both hosts — this grounds it as a real podcast
- 16:9 aspect ratio, 1920×1080${extraNote}`;

  } else if (videoStyle === 'movie_review') {
    const scriptSnippet = scriptText?.slice(0, 1500) || '';
    const mrTopicName = (topicName || guestName || '').trim();
    const mrHookText = (title || '').trim();

    let mrBackgroundScene = 'A dramatic cinematic scene — powerful character in action, intense expression, vivid cinematic lighting, fills the entire frame with rich detail';
    let mrTopLabel = mrTopicName || 'REVIEW';
    let mrBottomLabel = 'REVIEW';
    let mrColorGrade = 'Rich cinematic grade — deep warm tones, high contrast, dramatic feel';

    if (scriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{
            role: 'user',
            parts: [{
              text: `You are a YouTube thumbnail art director for a cinematic review/analysis channel.

SCRIPT:
${scriptSnippet}

TOPIC: ${mrTopicName || '(infer from script)'}
HOOK: "${mrHookText}"

This style works for ANY topic — movie review, book review, documentary, event, business story, sports moment, etc.

Decide:
1. BACKGROUND SCENE: A dramatic, photorealistic cinematic image that fills the entire frame — related to this specific topic. Could be a movie still, a dramatic event photo, a character in costume, a historical moment, a sports action shot, or any vivid scene directly tied to the script topic.
2. TOP LABEL: The short topic name shown at the top of the dark box (e.g. a film name, brand name, event name, person's name — 1-4 words ALL CAPS)
3. BOTTOM LABEL: What type of content this is — shown at the bottom of the dark box (e.g. "MOVIE REVIEW", "BOOK REVIEW", "DEEP DIVE", "FULL STORY", "EXPLAINED", "DOCUMENTARY", "ANALYSIS" — pick the best fit for the script)
4. COLOR GRADE: The cinematic color mood matching this topic's feel

Reply ONLY in JSON, no markdown:
{
  "backgroundScene": "Vivid 2-3 sentence description of the dramatic cinematic image filling the background — specific to THIS topic",
  "topLabel": "Short topic name (ALL CAPS, 1-4 words)",
  "bottomLabel": "Content type label (1-2 words ALL CAPS, e.g. MOVIE REVIEW, BOOK REVIEW, DEEP DIVE, FULL STORY, EXPLAINED)",
  "colorGrade": "Cinematic color grade description"
}`
            }]
          }],
          config: { responseMimeType: 'application/json' },
        });
        const mrRaw = (() => {
          const raw = entityResponse.text?.trim() || '{}';
          const m = raw.match(/\{[\s\S]*\}/);
          return m ? m[0] : '{}';
        })();
        const mrEntities = JSON.parse(mrRaw);
        if (mrEntities.backgroundScene) mrBackgroundScene = mrEntities.backgroundScene;
        if (mrEntities.topLabel) mrTopLabel = mrEntities.topLabel;
        if (mrEntities.bottomLabel) mrBottomLabel = mrEntities.bottomLabel;
        if (mrEntities.colorGrade) mrColorGrade = mrEntities.colorGrade;
      } catch (e) {
        console.warn('[MovieReview] entity extraction failed, using fallback:', e);
      }
    }

    prompt = `You are a world-class YouTube thumbnail designer for a cinematic review/analysis channel. Create a powerful thumbnail using a dramatic full-frame background image with a dark gold-border overlay box.

TOPIC: ${mrTopLabel}
HOOK TEXT: "${mrHookText}"

════ EXACT LAYOUT — 1920×1080, 16:9 ════

▶ BACKGROUND (entire frame — 100% of image):
${mrBackgroundScene}
- Fills the ENTIRE 16:9 frame — edge to edge, top to bottom
- Photorealistic, cinematic — rich detail, dramatic lighting
- Color grade: ${mrColorGrade}
- Visually arresting — the kind of image that immediately stops the scroll

▶ CENTER-LEFT OVERLAY BOX (positioned left-center, ~38% of frame width):
- A DARK SEMI-TRANSPARENT ROUNDED RECTANGLE — near-black (#0d0d0d) at ~85% opacity
- BORDER: A thin (2-3px) GOLD (#D4AF37) outline around the entire rectangle — the gold border is a KEY design element, must be clearly visible
- Padding inside the box (~20-25px all sides)
- INSIDE THE BOX (top to bottom):
  1. TOP: "${mrTopLabel}" — small white ALL CAPS text, thin font weight, subtle
  2. MIDDLE: "${mrHookText}" — LARGE BOLD YELLOW (#F5C518) text, 2-3 lines, heavy bold weight. This is the dominant element inside the box — big, impactful.
  3. BOTTOM: "${mrBottomLabel}" — small white ALL CAPS text, thin font weight

════ STRICT RULES ════
- BACKGROUND must be a real dramatic photorealistic scene — NOT solid color, NOT studio, NOT plain
- DARK BOX with GOLD BORDER must be left-center positioned — gold outline clearly visible
- Hook text MUST appear in LARGE BOLD YELLOW — this is the most critical text element
- Box is semi-transparent — the background scene is faintly visible through it
- NO separate host/reviewer face cutout
- Photorealistic cinematic quality throughout
- 16:9 aspect ratio, 1920×1080${extraNote}`;

  } else if (videoStyle === 'corkboard_meta') {
    const cmPresenter = (hostName || '').trim();

    // Parse banner text: [YELLOW] white part
    const cmRaw = (title || '').trim();
    const cmBracketMatch = cmRaw.match(/\[([^\]]+)\]/);
    const cmYellowWord = cmBracketMatch ? cmBracketMatch[1] : cmRaw.split(' ')[0];
    const cmWhitePart = cmBracketMatch
      ? cmRaw.replace(/\[[^\]]+\]\s*/, '').trim()
      : cmRaw.split(' ').slice(1).join(' ');

    const cmPresenterDesc = cmPresenter
      ? `${cmPresenter} — MATCH REAL PHOTOGRAPHS EXACTLY. Thoughtful expression, chin on hand or pointing gesture, looking left toward the cork board`
      : 'A confident young male presenter — short brown hair, casual-smart attire, thoughtful chin-on-hand pose, looking left toward the pinned thumbnail';

    const cmScriptSnippet = scriptText?.slice(0, 600) || '';
    let cmMiniThumbDesc = 'A podcast-style thumbnail: two hosts (older man left with glasses, younger man right) facing each other, bold white text center with one RED highlighted word, black background — classic DOAC/diary-of-a-CEO style';
    let cmAnnotations: string[] = [];

    if (cmScriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{
            role: 'user',
            parts: [{
              text: `Script topic: ${cmScriptSnippet}
Title: "${title}"

For a "thumbnail breakdown" YouTube video, decide:
1. What mini thumbnail to pin on the cork board — which channel style / what it shows / what the hook text inside it says (make it directly relevant to the script topic)
2. Should annotation labels appear? Only add them if they genuinely help explain the topic. They are OPTIONAL.
   If yes, provide 2-3 labels that are SPECIFIC to what's being taught in this script (not generic "Subject/Hook/Caption" unless those are what the script teaches).
   If the script is not about thumbnail/content strategy, use labels that fit the actual topic being shown on the mini thumbnail.

Reply ONLY in JSON:
{
  "miniThumbDesc": "Description of the smaller pinned thumbnail — make it topic-specific",
  "showLabels": true or false,
  "labels": ["label1 text", "label2 text", "label3 text"] (2-3 short 2-3 word labels, or empty array if showLabels is false)
}`
            }]
          }],
          config: { responseMimeType: 'application/json' },
        });
        const cmEntityRaw = (() => {
          const raw = entityResponse.text?.trim() || '{}';
          const m = raw.match(/\{[\s\S]*\}/);
          return m ? m[0] : '{}';
        })();
        const cmEntities = JSON.parse(cmEntityRaw);
        if (cmEntities.miniThumbDesc) cmMiniThumbDesc = cmEntities.miniThumbDesc;
        if (cmEntities.showLabels && Array.isArray(cmEntities.labels)) {
          cmAnnotations = cmEntities.labels.slice(0, 3).filter(Boolean);
        }
      } catch (e) {
        console.warn('[CorkboardMeta] entity extraction failed, using fallback:', e);
      }
    }

    const cmLabelsBlock = cmAnnotations.length > 0
      ? `- Three ANNOTATION LABELS floating near the mini thumbnail, each in a GLITCHY/PIXELATED RED-ORANGE rectangle with white bold text:
  ${cmAnnotations.map((l, i) => `- Label "${l}" with a thin red arrow pointing to a relevant element of the mini thumbnail`).join('\n  ')}
- The glitchy label boxes have a pixelated/degraded border effect — like a digital glitch filter
- Thin red lines/arrows connecting each label to its target`
      : `- NO annotation labels — the pinned thumbnail stands alone on the cork board, clean and simple`;

    prompt = `You are a world-class YouTube thumbnail designer for meta/educational content creators. Create a thumbnail that looks like a PROFESSIONAL CONTENT STRATEGY video thumbnail — "cork board with annotated thumbnail pinned to it" style.

TOPIC: "${title}"
BANNER TITLE: "${cmYellowWord}" (yellow box) + "${cmWhitePart}" (white text)

════ EXACT LAYOUT — 1920×1080, 16:9 ════

▶ TOP BANNER (full width, top 12% of frame):
- BRIGHT BLUE horizontal bar (#1565C0 to #1E88E5) spanning the entire top
- LEFT PORTION: The word "${cmYellowWord}" inside a SOLID YELLOW RECTANGLE (#FFD700) with BOLD BLACK text — large, dominant
- RIGHT OF YELLOW BOX: "${cmWhitePart}" in LARGE BOLD WHITE text — same font weight, same size
- The banner looks like a TV chyron / news ticker — clean, bold, impactful

▶ BACKGROUND (below the banner, fills rest of frame):
- CORK BULLETIN BOARD texture — realistic warm tan/brown cork material
- Natural cork surface: slight grain, organic texture, warm amber tones
- The cork fills the entire background area below the banner

▶ CENTER-LEFT (the pinned element):
- A SMALLER YOUTUBE THUMBNAIL (about 35% of frame width) pinned to the cork board
- Slight tilt (~3° clockwise), realistic drop shadow beneath it
- A RED PUSHPIN at the top-center of the mini thumbnail, pressed into the cork
- The mini thumbnail content: ${cmMiniThumbDesc}
${cmLabelsBlock}

▶ RIGHT SIDE (40% of frame):
- ${cmPresenterDesc}
- Upper body visible, head and shoulders
- Clean, well-lit, photorealistic
- Natural against the cork board background

════ STRICT RULES ════
- TOP BANNER = YELLOW BOX + WHITE TEXT on BRIGHT BLUE — this is the most important text element
- Cork board texture MUST look realistic — warm grain, natural material, not a flat color
- The red pushpin pressed into the cork at the top of the mini thumbnail is mandatory
${cmAnnotations.length > 0 ? '- Annotation label boxes MUST have the glitchy/pixelated red-orange border effect — NOT clean rectangles\n- Red arrows/lines must visibly connect each label to its target' : '- No annotation labels — keep it clean'}
- Photorealistic — NOT cartoon or illustrated
- 16:9 aspect ratio, 1920×1080${extraNote}`;

  } else if (videoStyle === 'podcast_4') {
    const scriptSnippet = scriptText?.slice(0, 2000) || '';
    const p4Subject = (guestName || hostName || '').trim();

    let p4PostText = (title || 'I Quit...').trim();

    let p4SubjectDesc = p4Subject
      ? `${p4Subject} — MATCH REAL PUBLIC PHOTOGRAPHS EXACTLY. Extreme left-side close-up, deeply emotional expression (tears, praying hands, devastated look)`
      : 'The main person in the story — extreme left-side close-up face, deeply emotional expression, tears or praying hands';
    let p4ReactorDesc = hostName && guestName
      ? `${hostName} — close-up face on the right side, serious concerned expression, looking straight at viewer`
      : 'A serious young narrator/reactor — close-up face on the right side, furrowed brow, concerned expression, looking at camera';
    let p4AccountName = p4Subject || 'Unknown';
    let p4CensorText = 'CENSORED';
    let p4PostTime = '11:25 PM · Jul 29, 2019';
    let p4Platform = 'Twitter/X';

    if (scriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{
            role: 'user',
            parts: [{
              text: `You are a YouTube thumbnail art director for a scandal/documentary channel. Analyze this script and decide the visual elements.

SCRIPT:
${scriptSnippet}

SUBJECT (person story is about): ${p4Subject || '(infer from script)'}
HOST/NARRATOR (reactor on right): ${hostName || '(infer from script)'}
USER-SELECTED POST TEXT: "${p4PostText}"

Decide:
1. Subject's appearance and emotional expression (the person on the LEFT who the story is about)
2. Narrator/reactor's appearance (the person on the RIGHT reacting/narrating)
3. The social media account name and platform shown in the post screenshot
4. The word on the BLACK CENSORSHIP BAR over the left person's eyes — the most sensitive/shocking word SPECIFIC to this script (censored with * e.g. "SU*CIDE", "BANK*RUPT", "FR**D", "FIR*D", "M*RDER", "RUINED", "B*OKRUPT") — NEVER use "EXPOSED" or generic words
5. A realistic-looking timestamp for the viral post
6. The best 2-6 word post message for the social media screenshot — if user-selected post text is good (2-6 words, feels like a real post), use it as-is. Otherwise write a better topic-specific one that captures the actual viral turning point from the script. Must sound like a real social media post, NOT a headline.

Reply ONLY in JSON, no markdown:
{
  "subjectDesc": "Vivid description of left person's appearance + emotional state (crying/praying/devastated)",
  "reactorDesc": "Description of right person's appearance + serious concerned expression",
  "accountName": "The social media account name for the post (real or made up to match topic)",
  "platform": "Twitter/X or Instagram or WhatsApp",
  "censorText": "The word shown on the black censor bar (2-10 chars, censored with * — topic-specific, NEVER 'EXPOSED')",
  "postTime": "A realistic timestamp (e.g. '11:25 PM · Jul 29, 2019')",
  "postText": "The final 2-6 word post message shown in giant bold text inside the screenshot"
}`
            }]
          }],
          config: { responseMimeType: 'application/json' },
        });
        const p4Raw = (() => {
          const raw = entityResponse.text?.trim() || '{}';
          const m = raw.match(/\{[\s\S]*\}/);
          return m ? m[0] : '{}';
        })();
        const p4Entities = JSON.parse(p4Raw);
        if (p4Entities.subjectDesc) {
          p4SubjectDesc = p4Subject
            ? `${p4Subject} — MATCH REAL PUBLIC PHOTOGRAPHS EXACTLY. ${p4Entities.subjectDesc}`
            : p4Entities.subjectDesc;
        }
        if (p4Entities.reactorDesc) p4ReactorDesc = p4Entities.reactorDesc;
        if (p4Entities.accountName) p4AccountName = p4Entities.accountName;
        if (p4Entities.platform) p4Platform = p4Entities.platform;
        if (p4Entities.censorText) p4CensorText = p4Entities.censorText;
        if (p4Entities.postTime) p4PostTime = p4Entities.postTime;
        if (p4Entities.postText) p4PostText = p4Entities.postText;
      } catch (e) {
        console.warn('[Podcast4] entity extraction failed, using fallback:', e);
      }
    }

    prompt = `You are a world-class YouTube thumbnail designer for scandal documentary / investigative exposé channels. Create a dark, dramatic, cinematic thumbnail — style inspired by Indian business scandal channels (Think School / Dhruv Rathee / Nikhil Kamath-style investigative content).

TOPIC: "${title}"
VIRAL POST MESSAGE: "${p4PostText}"

════ EXACT LAYOUT — 1920×1080, 16:9 ════

▶ BACKGROUND (full frame):
- Near-black to very dark charcoal (#0a0a0a → #1a1a1a), slight vignette at all edges
- Dark, heavy, serious — no color, no patterns — just deep darkness

▶ LEFT SIDE (30% of frame): THE SUBJECT'S FACE
- ${p4SubjectDesc}
- Extreme close-up — face fills the left 30%, cropped tight (chin to forehead)
- Expression: devastated, crying, praying hands pressed together at chin level — raw emotion
- A THICK BLACK HORIZONTAL BAR across the eyes area (like a censorship/redaction bar)
  - Inside the black bar: white bold ALL-CAPS text "${p4CensorText}" — worn/distressed font style
  - The bar sits at eye level, partially covering the eyes — this is a critical visual element
- Slightly dark/desaturated tone — moody, heavy

▶ CENTER (40% of frame): THE VIRAL SOCIAL MEDIA POST
- A large FLOATING SCREENSHOT of a ${p4Platform} post, centered, slightly tilted (~2°), taking up ~40% of frame width
- The screenshot looks like a real ${p4Platform} post card — slightly worn/grungy white or light grey background
- INSIDE THE SCREENSHOT:
  - TOP: Small profile photo (logo/avatar) + account name "${p4AccountName}" + verified blue checkmark
  - MIDDLE: The post message in GIANT BOLD dark typography: "${p4PostText}"
  - Below the text: a SHORT THICK RED HORIZONTAL LINE underline
  - BOTTOM: Timestamp "${p4PostTime}" + engagement stats (2K · 15K ♥ · 1.9M views) in small grey text
- The screenshot has a subtle drop shadow and slight edge glow, floating against the dark background

▶ RIGHT SIDE (30% of frame): THE NARRATOR/REACTOR'S FACE
- ${p4ReactorDesc}
- Extreme close-up — face fills the right 30%, cropped tight
- Expression: serious, concerned, slightly furrowed brow — watching the viewer directly
- Same dark moody treatment as the left face

════ STRICT RULES ════
- The BLACK CENSOR BAR with white text on the left face is a MANDATORY element — make it clearly visible
- The social media screenshot must look like a REAL ${p4Platform} post — not a generic card
- "${p4PostText}" must appear in VERY LARGE bold text inside the screenshot — this is the visual center of gravity
- The RED UNDERLINE below the post text is important — thick, saturated red (#FF0000)
- Overall color palette: near-black background, white/grey screenshot, red underline, dark faces
- Photorealistic — NOT illustrated or cartoon
- 16:9 aspect ratio, 1920×1080${extraNote}`;

  } else if (videoStyle === 'podcast_3') {
    const p3Speaker = (guestName || hostName || 'the speaker').trim();

    // Parse statement: extract [BRACKETED] word and split sentence
    const p3Raw = (title || '').trim();
    const p3BracketMatch = p3Raw.match(/\[([^\]]+)\]/);
    const p3HighlightWord = p3BracketMatch ? p3BracketMatch[1] : '';
    const p3FullStatement = p3Raw.replace(/\[|\]/g, '');
    const p3BeforeHighlight = p3BracketMatch
      ? p3Raw.substring(0, p3Raw.indexOf('[')).replace(/\[|\]/g, '').trim()
      : '';
    const p3AfterHighlight = p3BracketMatch
      ? p3Raw.substring(p3Raw.indexOf(']') + 1).replace(/\[|\]/g, '').trim()
      : '';

    let p3SpeakerDesc = p3Speaker !== 'the speaker'
      ? `${p3Speaker} — MATCH REAL PUBLIC PHOTOGRAPHS of ${p3Speaker} EXACTLY. Upper body portrait, professional, facing slightly left toward the text, microphone at bottom`
      : 'A confident professional expert — upper body portrait, facing slightly left, microphone at bottom, natural expression';

    let p3ChartOverlay = '';
    const scriptSnippet = scriptText?.slice(0, 800) || '';

    if (scriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{
            role: 'user',
            parts: [{
              text: `SCRIPT EXCERPT: ${scriptSnippet}
SPEAKER: ${p3Speaker}
STATEMENT: "${p3FullStatement}"

Is this topic finance/crypto/investing/economics? If yes, what chart or data visual would work as a subtle background overlay?
Also describe the speaker's exact appearance.

Reply ONLY in JSON:
{
  "speakerDesc": "One sentence: speaker's appearance (hair, age, clothing style, expression — natural podcast look)",
  "chartOverlay": "If finance topic: describe a chart (e.g. 'red and green candlestick chart trending upward with yellow moving average lines') — otherwise empty string"
}`
            }]
          }],
          config: { responseMimeType: 'application/json' },
        });
        const p3EntityRaw = (() => {
          const raw = entityResponse.text?.trim() || '{}';
          const m = raw.match(/\{[\s\S]*\}/);
          return m ? m[0] : '{}';
        })();
        const p3Entities = JSON.parse(p3EntityRaw);
        if (p3Entities.speakerDesc) {
          p3SpeakerDesc = p3Speaker !== 'the speaker'
            ? `${p3Speaker} — ${p3Entities.speakerDesc}. MATCH REAL PUBLIC PHOTOGRAPHS of ${p3Speaker} EXACTLY.`
            : p3Entities.speakerDesc;
        }
        if (p3Entities.chartOverlay) p3ChartOverlay = p3Entities.chartOverlay;
      } catch (e) {
        console.warn('[Podcast3] entity extraction failed, using fallback:', e);
      }
    }

    prompt = `You are a world-class YouTube thumbnail designer for financial and opinion podcasts ("When Shift Happens" / Lex Fridman / Real Vision style). Create a clean, powerful, professional thumbnail with a DEEP RED BACKGROUND.

SPEAKER: ${p3Speaker}
STATEMENT: "${p3FullStatement}"

════ EXACT LAYOUT — 1920×1080, 16:9 ════

▶ BACKGROUND (full frame):
- Deep rich crimson red gradient — brighter/lighter red in the center-right (behind the face), darker toward the left and all corners
- Color: center #CC2020 → edges #550000, smooth radial vignette
- Clean, bold, professional — NOT textured, NOT grungy
${p3ChartOverlay ? `- Subtle OVERLAY on left side: ${p3ChartOverlay} — semi-transparent (30-40% opacity) layered on the red background, gives financial/data context without overwhelming the text` : ''}

▶ LEFT SIDE (45% of frame): THE BOLD STATEMENT
- Render the sentence in LARGE, CLEAN, BOLD typography — like a direct quote from the speaker
- Font: heavy bold sans-serif (similar to bold Helvetica/DM Sans/Nunito) — NOT Impact, NOT condensed
${p3HighlightWord ? `- The word(s) "${p3HighlightWord}" rendered inside a SOLID YELLOW RECTANGLE (#FFD700 or #FFEB00) with BOLD BLACK text — the yellow box is the visual stinger
- "${p3BeforeHighlight}" in white before the yellow box (on its own line or inline)
- "${p3AfterHighlight}" in white after the yellow box
- The yellow box word POPS off the red background — this is the most eye-catching element` : `- Full statement "${p3FullStatement}" in large white bold text, 2-4 lines, left-aligned`}
- Text is 3-4 lines total, left-aligned, starting about 1/4 from the left edge
- Text takes up the middle-left 40% of the frame vertically
- BELOW the statement text (lower left): A small italic attribution line — "- ${p3Speaker}" in white italic script font, with a small curved arrow (→ or ↓) pointing toward the person on the right

▶ RIGHT SIDE (55% of frame): THE SPEAKER
- ${p3SpeakerDesc}
- Clean photorealistic cutout — person placed against the red background naturally
- Upper body clearly visible: head, shoulders, chest, slightly cropped at mid-torso
- A professional studio microphone (dark/black, modern podcast mic) visible at the bottom in front of them
- Expression: calm, confident, assertive — as if they just delivered the statement
- Soft warm rim light on one side, matching the red background mood

════ STRICT RULES ════
- The YELLOW HIGHLIGHT BOX is the most critical element — must be clearly visible, sharp, clean rectangle
- Background is SOLID RED GRADIENT — absolutely no photos, no scenes, no studio blur behind
${p3ChartOverlay ? '- Chart overlay is SEMI-TRANSPARENT — text and person must remain fully readable over it' : ''}
- NO large channel watermark or logo — only if the speaker/channel specifically requires it
- Person must be photorealistic and recognizable as ${p3Speaker}
- Typography is clean professional sans-serif — NOT grungy, NOT handwritten (except the small attribution line)
- 16:9 aspect ratio, 1920×1080${extraNote}`;

  } else if (videoStyle === 'cinematic_drama') {
    const scriptSnippet = scriptText?.slice(0, 2000) || '';
    const cdProtagonist = (guestName || hostName || '').trim();

    let cdFaceDesc = cdProtagonist
      ? `${cdProtagonist} — MATCH REAL PUBLIC PHOTOGRAPHS EXACTLY. Extreme close-up, right side of frame, filling 40-50% of frame, intense beaten/emotional/mystical expression`
      : 'A dramatic intense face — extreme close-up, right side of frame, expression of pain/determination/shock/mystery';
    let cdBackgroundScene = 'A dramatic cinematic outdoor scene — action, confrontation, or symbolic elements specific to the topic, filling the left side and background';
    let cdColorGrade = 'Rich golden-hour warmth with deep blue shadows, high contrast cinematic grade';
    let cdForegroundProp = '';
    let cdMinimalText = (title || '').trim().split(/\s*—\s*/)[0] || '';

    if (scriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{
            role: 'user',
            parts: [{
              text: `You are a Bollywood/cinematic YouTube thumbnail art director. Your thumbnails have ZERO text — the entire story is told through dramatic visuals.

SCRIPT:
${scriptSnippet}

TITLE: "${title}"
MAIN PERSON (extreme close-up face on right): ${cdProtagonist || '(infer from script)'}

Design a cinematic multi-layer thumbnail. Decide:
1. FACE/PROTAGONIST: Who is the extreme close-up face? Describe their appearance and expression vividly.
2. BACKGROUND SCENE: What dramatic scene fills the left side and background? (fight, confrontation, burning, laughing group, conspiracy, nature scene — match script topic exactly)
3. FOREGROUND PROP (optional): Is there any dramatic prop in the very foreground? (a burning movie poster, a gun held out, a hand showing something — only if it strongly tells the story)
4. COLOR GRADE: The overall cinematic color mood (e.g. "golden harvest fields with deep blue sky", "dark moody navy with blood red accents", "bright outdoor daylight with warm orange tones")
5. COMEDY OR DRAMA?: Is this primarily comedy (bright, laughing, absurd contrast) or serious drama (dark, violent, emotional)?

Reply ONLY in JSON, no markdown:
{
  "faceDesc": "Vivid description of the extreme close-up face — who, expression, makeup/wounds/look",
  "backgroundScene": "Vivid 2-3 sentence description of the dramatic background scene (left side + full background)",
  "foregroundProp": "One sentence describing any dramatic prop in the very foreground (or empty string if none)",
  "colorGrade": "Cinematic color grade description (e.g. 'golden fields + deep blue sky', 'dark shadows + blood red')",
  "mood": "comedy" or "drama"
}`
            }]
          }],
          config: { responseMimeType: 'application/json' },
        });
        const cdRaw = (() => {
          const raw = entityResponse.text?.trim() || '{}';
          const m = raw.match(/\{[\s\S]*\}/);
          return m ? m[0] : '{}';
        })();
        const cdEntities = JSON.parse(cdRaw);
        if (cdEntities.faceDesc) {
          cdFaceDesc = cdProtagonist
            ? `${cdProtagonist} — MATCH REAL PUBLIC PHOTOGRAPHS EXACTLY. ${cdEntities.faceDesc}`
            : cdEntities.faceDesc;
        }
        if (cdEntities.backgroundScene) cdBackgroundScene = cdEntities.backgroundScene;
        if (cdEntities.foregroundProp) cdForegroundProp = cdEntities.foregroundProp;
        if (cdEntities.colorGrade) cdColorGrade = cdEntities.colorGrade;
      } catch (e) {
        console.warn('[CinematicDrama] entity extraction failed, using fallback:', e);
      }
    }

    const cdTextLine = title && title.trim()
      ? `\n▶ MINIMAL TEXT (if any):\n- ONLY this small element: "${title}" — rendered in plain white text, top-left corner, small size, as if a character quote or subtitle. Keep it subtle — it should NOT dominate.\n`
      : '';

    prompt = `You are a world-class Bollywood/cinematic YouTube thumbnail designer. Create a PHOTOREALISTIC, CINEMATIC thumbnail with ZERO or minimal text — the visuals tell the entire story.

TOPIC: "${title}"

════ COMPOSITION — 1920×1080, 16:9 ════

▶ RIGHT SIDE (40-50% of frame): EXTREME CLOSE-UP FACE — THE EMOTIONAL ANCHOR
- ${cdFaceDesc}
- Extreme close-up: face fills the right 40-50% of the frame — eyes, nose, mouth fully visible, cropped just below chin
- Expression MUST be intense and story-telling: beaten/bloodied, mystical/glowing eyes, crying, laughing, shocked, determined
- Photorealistic skin texture, dramatic rim lighting (warm or cold based on mood)
- This face IS the emotional hook — the viewer must feel something immediately

▶ LEFT SIDE + BACKGROUND (60% of frame behind the face): THE DRAMATIC SCENE
- ${cdBackgroundScene}
- Multiple figures or elements composited in a naturalistic scene — NOT a studio background
- Rich depth: foreground elements → middle ground characters → background sky/environment
- The background scene extends behind the close-up face as well (the face is composited OVER it)
${cdForegroundProp ? `\n▶ VERY FOREGROUND PROP (closest to viewer, partially in frame):\n- ${cdForegroundProp}\n- Slightly out of focus at very front, dramatic effect — a hand, an object, bleeding into frame from edge` : ''}
${cdTextLine}
▶ COLOR GRADE & MOOD:
- ${cdColorGrade}
- High contrast, richly saturated — think Bollywood movie poster or A24 film still
- Deep shadows with punchy highlights — NOT flat or washed out

════ STRICT RULES ════
- ZERO large text overlay — NO title, NO caption boxes, NO channel name
${title && title.trim() ? `- The ONLY allowed text: "${title}" — tiny, subtle, top corner` : '- ABSOLUTELY NO text anywhere on the image'}
- Photorealistic — NOT illustrated, NOT 3D cartoon, NOT anime (unless script demands it)
- Multi-layer depth: foreground / middle / background all populated with story elements
- The thumbnail must be FULLY UNDERSTOOD without reading any text — pure visual storytelling
- Cinematic quality — looks like a frame from a high-budget Bollywood or thriller film
- 16:9 aspect ratio, 1920×1080${extraNote}`;

  } else if (videoStyle === 'news_dramatic') {
    const scriptSnippet = scriptText?.slice(0, 2000) || '';
    const ndCelebrity = (guestName || hostName || '').trim();

    // Parse pipe-separated headline | subheadline from title
    const ndTitleClean = (title || '').trim();
    const ndParts = ndTitleClean.split(/\s*\|\s*/);
    let ndHeadline = (ndParts[0] || ndTitleClean).toUpperCase().trim();
    let ndSubheadline = (ndParts[1] || '').toUpperCase().trim();

    let ndBackgroundScene = 'A dramatic cinematic political/geopolitical scene — government buildings, crowds, flags, or conflict imagery — photorealistic, intense warm tones, fills the full background';
    let ndCelebrityDescription = ndCelebrity
      ? `${ndCelebrity} — photorealistic, match real public photographs EXACTLY. Large head + upper body, expression of shock or deep concern`
      : 'The most prominent real person from this story — photorealistic, large head + upper body, intense expression';
    let ndSceneMood = 'dark dramatic stormy atmosphere with warm orange glow';

    if (scriptSnippet) {
      onStep?.('analyzing');
      try {
        const entityResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [{
            role: 'user',
            parts: [{
              text: `You are a YouTube thumbnail art director for an Indian breaking news channel (Career247 / ABP / India TV style).

SCRIPT:
${scriptSnippet}

TOPIC TITLE: "${ndTitleClean}"
FEATURED PERSON: ${ndCelebrity || '(infer from script — pick the most prominent real person in this story)'}

Analyze the script and decide ALL of the following:

1. BACKGROUND SCENE: A dramatic, photorealistic cinematic image that fills the entire frame as background. Must be 100% specific to THIS script's topic — could be war, protests, government building, courtroom, stock market crash, space scene, factory, border, hospital, parliament, etc. Describe exactly what's in the scene, the lighting, colors, mood. 2-3 vivid sentences.

2. CELEBRITY/PERSON: The main person's real name, appearance (face features, hair, age, clothing), and their emotional expression. If they're a real public figure, note their signature look so the image model can match them accurately.

3. HEADLINE (for BLUE BOX): A punchy 2-4 word ALL-CAPS breaking news headline capturing the MAIN EVENT from the script. Examples: "TRUMP BANS INDIA", "WAR DECLARED!!", "MARKET CRASHES", "INDIA STRIKES BACK". Extract from the script — NOT from example.

4. SUBHEADLINE (for DARK BOX below blue): A punchy 2-5 word ALL-CAPS consequence or reaction from the script. Examples: "PAKISTAN IN SHOCK", "DOLLAR HITS 90", "MARKETS IN FREEFALL". Extract from the script.

5. SCENE MOOD: One short phrase describing the dominant color/atmosphere of the background (e.g. "fiery orange war zone", "cold blue parliament crisis", "green jungle military", "grey urban riots")

Reply ONLY in JSON, no markdown:
{
  "backgroundScene": "Vivid 2-3 sentence cinematic description — 100% specific to this script topic",
  "celebrity": "Person name + appearance description + expression",
  "headlineText": "2-4 WORD HEADLINE ALL CAPS",
  "subheadlineText": "2-5 WORD SUBHEADLINE ALL CAPS",
  "sceneMood": "short atmosphere phrase"
}`
            }]
          }],
          config: { responseMimeType: 'application/json' },
        });
        const ndRaw = (() => {
          const raw = entityResponse.text?.trim() || '{}';
          const m = raw.match(/\{[\s\S]*\}/);
          return m ? m[0] : '{}';
        })();
        const ndEntities = JSON.parse(ndRaw);
        if (ndEntities.backgroundScene) ndBackgroundScene = ndEntities.backgroundScene;
        if (ndEntities.celebrity) {
          ndCelebrityDescription = ndCelebrity
            ? `${ndCelebrity} — MATCH REAL PUBLIC PHOTOGRAPHS EXACTLY. ${ndEntities.celebrity}`
            : ndEntities.celebrity;
        }
        if (ndEntities.headlineText) ndHeadline = ndEntities.headlineText.toUpperCase();
        if (ndEntities.subheadlineText) ndSubheadline = ndEntities.subheadlineText.toUpperCase();
        if (ndEntities.sceneMood) ndSceneMood = ndEntities.sceneMood;
      } catch (e) {
        console.warn('[NewsDramatic] entity extraction failed, using fallback:', e);
      }
    }

    prompt = `You are a world-class YouTube thumbnail designer replicating the exact visual style of viral Indian breaking news channels like Career247, ABP News, India TV. Create a PHOTOREALISTIC, CINEMATIC thumbnail.

TOPIC: "${ndTitleClean}"

════ EXACT LAYOUT — 1920×1080, 16:9 ════

▶ FULL BACKGROUND (entire frame):
${ndBackgroundScene}
- This photorealistic scene fills the ENTIRE 1920×1080 frame edge-to-edge — like a real news photo
- Atmospheric: ${ndSceneMood}
- Ultra-detailed, high dynamic range, photojournalistic quality
- NO solid color backgrounds — every pixel of background is this scene

▶ LEFT SIDE TEXT BLOCKS (occupying left ~30% of frame, stacked vertically, center-left position):
- BLOCK 1 — BRIGHT BLUE RECTANGLE (#1565C0 or #0D47A1):
  - Solid bold blue filled rectangle, width ~28% of frame, tight padding
  - Inside: "${ndHeadline}" in white bold ALL-CAPS Impact/Arial-Black font
  - Text is very large, 2-3 lines, centered inside the blue block
  - Blue rectangle has sharp edges — NO rounded corners, NO border, NO drop shadow
- BLOCK 2 — DARK CHARCOAL RECTANGLE (#1a1a1a or #111111), directly below Block 1, same width:
  - Inside: "${ndSubheadline}" in white bold ALL-CAPS font, slightly smaller than Block 1 text
  - Same sharp-edged rectangle style, flush below Block 1 with zero gap
- Both blocks together form a tall stacked text column on the left side

▶ FEATURED PERSON (LARGE, center-left to center, IN FOREGROUND over everything):
- ${ndCelebrityDescription}
- VERY LARGE head and upper body — person's face should be at least 40% of frame height
- Positioned CENTER to SLIGHTLY LEFT of center — person OVERLAPS both the text blocks on the left AND the background on the right
- The person is COMPOSITED IN FRONT of everything — text blocks are partially behind their body/arms, background is fully behind
- Expression: INTENSE — shocked, stressed, angry, concerned, or grim — matching the news story mood
- Photorealistic skin, hair, clothing — looks like a real photograph, NOT illustrated
- Slight dramatic rim lighting matching the background atmosphere
- Person's body cuts INTO both zones — this overlapping creates the Career247 style depth

════ STRICT RULES ════
- BACKGROUND: real photorealistic scene, NOT solid color, NOT generic studio — 100% topic-specific
- TEXT BLOCKS: solid filled rectangles, sharp edges, bold legible white text, proper ABP/Career247 news style
- PERSON: LARGE, in FOREGROUND, overlapping text AND background — this layering is CRITICAL
- Photorealistic throughout — NOT illustrated, NOT cartoon, NOT 3D render
- NO channel name, NO logo, NO "By [Name]", NO watermarks ANYWHERE
- 16:9 aspect ratio, 1920×1080${extraNote}`;

  } else if (videoStyle === 'situational') {
    const scriptSnippet = scriptText?.slice(0, 2000) || '';
    prompt = `You are a world-class YouTube thumbnail designer specializing in personal story and emotional content.

YOUR TASK:
Create a powerful single-person YouTube thumbnail for the story/situation below. No reference image provided — design from scratch.

CRITICAL — ANALYZE THE SCRIPT AND DETERMINE THE PERSON TYPE:
Read the script carefully and identify WHO the main person is. Choose from:
- Young man (22-30, modern casual clothes, city person)
- Middle-class man (30-45, plain shirt or simple suit, ordinary look)
- Wealthy/rich man (40-55, expensive suit, watch, polished look)
- Young woman (22-32, modern professional or casual)
- Middle-aged woman (35-50, everyday practical look)
- Elderly man or woman (60+, aged face, life-worn look)
- Working class / simple person (any age, plain worn clothes)
Pick the type that EXACTLY matches who this story is about.

HOOK TEXT: "${title}"
${scriptSnippet ? `SCRIPT / TOPIC CONTENT:\n${scriptSnippet}` : ''}

LAYOUT (follow strictly):
- ONE person only — positioned on the RIGHT side of the frame, looking slightly left (toward the text), natural pose
- Hook text on the LEFT side — bold, large, prominent, 2-3 lines max, high contrast color (yellow/white on dark background)
- Background: dark, dramatic, moody — deep charcoal, dark teal, or deep maroon. NOT white.
- Expression: matches the emotional weight — stressed, reflective, shocked, or determined based on the topic
- A studio microphone visible near the person (subtle, not dominant)
- NO second person. ONE compelling face that tells the whole story.

STYLE RULES:
- High contrast, cinematic quality, sharply focused
- Photorealistic, NOT illustrated or cartoon
- 16:9 aspect ratio, 1920×1080 quality
- Bold, clean sans-serif typography for the hook text${extraNote}`;

  } else if (videoStyle === 'debate') {
    prompt = `You are a world-class YouTube thumbnail designer specializing in debate and confrontational content.

YOUR TASK:
Create a high-impact YouTube debate thumbnail — two people on opposite sides, tense confrontation energy.

HOOK TEXT: "${title}"
${hostName ? `LEFT PERSON: ${hostName}` : 'LEFT PERSON: Generate a realistic confident male debater'}
${guestName ? `RIGHT PERSON: ${guestName}` : 'RIGHT PERSON: Generate a realistic confident male debater'}

LAYOUT (follow strictly):
1. LEFT SIDE: ${hostName || 'Person A'} — large face close-up, pointing aggressively or looking serious. Expression: confident, challenging.
2. RIGHT SIDE: ${guestName || 'Person B'} — large face close-up, matching energy. Expression: defensive or equally confident.
3. CENTER: Bold hook text "${title}" — large, split across two lines, in high-contrast color (red/yellow/white). Can have a thin divider line between the two faces.
4. BACKGROUND: Dark gradient, deep blue or charcoal, with dramatic lighting hitting both faces.
5. Optional: A subtle VS graphic or divider between the two people.

STYLE RULES:
- High contrast, cinematic quality, tense energy
- Both faces must look photorealistic and different from each other
- Text must be LARGE and clearly readable
- NOT illustrated or cartoon
- 16:9 aspect ratio, 1920×1080 quality${extraNote}`;

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
      model: 'gemini-3.1-flash-image',
      contents: { parts: parts },
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: {
          aspectRatio: "16:9",
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
      model: 'gemini-3.1-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: {
          aspectRatio: "16:9",
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
      model: 'gemini-3.1-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: {
          aspectRatio: "16:9",
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
  const ai = getAi();
  const sample = comments.slice(0, 150);
  const prompt = `You are selecting YouTube comments for a viral intro video.
From the comments below, pick exactly 7 that are the most interesting, funny, controversial, or thought-provoking.
They should represent diverse reactions. Keep comments short enough to fit on screen (under 120 chars each; if longer, trim smartly).
Return ONLY a JSON array of 7 selected/trimmed comment strings. No explanation.

Comments:
${JSON.stringify(sample)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
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
  model: string = 'gemini-3.5-flash',
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
    model: 'gemini-3.5-flash',
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
    model: 'gemini-3.5-flash',
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
    model: 'gemini-3.5-flash',
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
    model: 'gemini-3.5-flash',
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
    model: 'gemini-3.1-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: { responseModalities: [Modality.IMAGE], imageConfig: { aspectRatio: use16x9 ? '16:9' : '1:1' } }
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
    model: 'gemini-3.5-flash',
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
    model: 'gemini-3.5-flash',
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
  model: string = 'gemini-3.5-flash',
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
    model: 'gemini-3.5-flash',
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
      model: params.model || 'gemini-3.5-flash',
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
}

export interface StoryboardScenesResult {
  scenes: StoryboardSceneRaw[];
  characterGuide: string;
}

export const generateStoryboardScenes = async (
  segments: { speaker: string; text: string; duration?: number; startTime?: number; endTime?: number }[],
  sceneCount: number,
  model: string = 'gemini-3.5-flash',
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
  model: string = 'gemini-3.5-flash',
): Promise<{ prompts: string[]; characterGuide: string }> => {
  const ai = getAi();

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
    model: 'gemini-3.1-flash-image',
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
    model: 'gemini-3.5-flash',
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

// ── Find MANY viral clips from a full movie/long video ────────────────────────
// Unlike findBestShortsSegments (3-5 clips), this scans the whole film and
// returns as many Reels-worthy moments as exist — iconic dialogues, emotional
// beats, plot twists, funny lines, action peaks. Each clip is Reels-length.
export const findViralMovieClips = async (
  transcript: { text: string; start: number; end: number }[],
  maxDurationSec: number = 90,
): Promise<ShortsSegment[]> => {
  if (!transcript.length) throw new Error('Transcript is empty');

  const ai = getAi();

  // Movies are long — sample heavily but keep coverage across the whole runtime.
  const MAX_CHARS = 40_000;
  let allLines = transcript.map(s => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`);
  let joined = allLines.join('\n');
  if (joined.length > MAX_CHARS) {
    const step = Math.ceil(allLines.length / Math.floor(MAX_CHARS / 60));
    allLines = allLines.filter((_, i) => i % step === 0);
    joined = allLines.join('\n');
  }

  const prompt = `You are an expert film editor who cuts viral Instagram Reels / YouTube Shorts from movies.
Scan the ENTIRE movie transcript below and find EVERY moment that could go viral as a short clip.

Look for:
  • Iconic / quotable dialogues and one-liners
  • Emotional peaks (heartbreak, reunion, sacrifice, betrayal)
  • Plot twists and shocking reveals
  • Funny / meme-able exchanges
  • Motivational or powerful monologues
  • Tense confrontations and action climaxes

Each clip MUST:
  • Be between 15 and ${maxDurationSec} seconds long (Instagram Reels limit — NEVER longer than ${maxDurationSec}s)
  • Be a complete, self-contained moment that makes sense without the rest of the film
  • Start exactly where the moment begins and end at its natural punch/conclusion

Find as MANY strong clips as the movie genuinely offers — typically 8 to 20. Do NOT pad with weak moments; quality first, but don't miss any real gem. Spread them across the whole runtime (beginning, middle, end).

Return JSON ONLY in this exact shape (no markdown, no extra text):
{
  "segments": [
    {
      "title": "5-8 word punchy viral title (in transcript's language)",
      "start": <number, seconds>,
      "end": <number, seconds>,
      "description": "1 sentence on why this moment goes viral",
      "hook": "The key line/moment that hooks viewers"
    }
  ]
}

Movie transcript with timestamps:
${joined}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
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
  const parsed = parseSegmentsJson(text, 'MovieClip');

  return parsed.segments
    .filter(s => typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start)
    .map(s => ({
      title: s.title || 'Untitled clip',
      start: Math.max(0, s.start),
      // Clamp each clip to the Reels duration limit
      end: Math.min(s.end, s.start + maxDurationSec),
      description: s.description || '',
      hook: s.hook || '',
    }))
    .filter(s => s.end - s.start >= 5); // drop anything too short to be useful
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
    model: 'gemini-3.5-flash',
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
    model: 'gemini-3.5-flash',
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
    model: 'gemini-3.1-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: { aspectRatio: '16:9' },
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
    model: 'gemini-3.5-flash',
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
    model: 'gemini-3.5-flash',
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
  model: string = 'gemini-3.5-flash',
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

  const data = await callGemini('gemini-3.5-flash', [{ role: 'user', parts: [{ text: prompt }] }], {
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

  const data = await callGemini('gemini-3.5-flash', [{ role: 'user', parts: [{ text: prompt }] }], config);
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

  const data = await callGemini('gemini-3.5-flash', [{ role: 'user', parts: [{ text: prompt }] }], config);

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
