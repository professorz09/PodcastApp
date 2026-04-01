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

export const generateTitles = async (scriptText: string): Promise<string[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    You are an expert YouTube strategist and copywriter. 
    Read the ENTIRE script provided below to deeply understand the core topic, context, and the main conflict or value proposition.
    
    Based on the script, generate 4 highly clickable, catchy, and viral-style YouTube video titles.
    
    Requirements for the titles:
    1. **Topic Clarity**: The main topic MUST be immediately clear to the viewer.
    2. **Hook/Curiosity**: Structure the title like a hook to generate intense curiosity or FOMO (Fear Of Missing Out).
    3. **Clickable**: Use strong, emotional, or action-oriented words (e.g., "Exposed", "The Truth", "Why You're Wrong", "Secret").
    4. **Length**: Keep them concise (under 60 characters if possible) so they don't get cut off on mobile screens.
    5. **Format**: Return ONLY a valid JSON array containing exactly 4 strings. Do not include markdown formatting like \`\`\`json.
    
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
    console.error("Error in generateTitles:", error);
    throw error;
  }
};

export const generateThumbnailText = async (scriptText: string): Promise<string[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    You are an expert YouTube thumbnail copywriter.
    Read the content below to understand the core topic, main conflict, or shocking moment.

    Generate 5 SHORT, PUNCHY, CLICKBAIT thumbnail text lines — these will appear as BIG BOLD TEXT overlaid on a YouTube thumbnail image (NOT full video titles).

    Rules:
    1. Maximum 4-6 words only — short and explosive
    2. Dramatic, shocking, emotional, or intensely curiosity-evoking
    3. Style examples: "I Quit...", "He EXPOSED Everything", "The Truth REVEALED", "They LIED To Us", "It's OVER...", "He Said WHAT?!", "Gone FOREVER", "Nobody Talks About This"
    4. Can use ellipsis (...), ALL CAPS for 1-2 words, dramatic punctuation (!?), or censored words (SU*CIDE style)
    5. NO full sentences — just the explosive hook phrase
    6. Match the language/tone of the content (Hindi topics → Hindi or Hinglish lines okay)
    7. Return ONLY a valid JSON array of exactly 5 strings. No markdown.

    Content:
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
    console.error("Error in generateThumbnailText:", error);
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
  model: string = 'gemini-3-flash-preview',
  language: string = 'English',
  style: 'debate' | 'conversational' | 'formal debate' | 'explained' | 'podcast_breakdown' | 'podcast_panel' | 'context_bridge' = 'debate',
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
          निम्नलिखित स्क्रिप्ट का विश्लेषण करें और इसे ${style} प्रारूप में व्यवस्थित करें।
          स्क्रिप्ट: "${customScript}"
          
          नियम:
          1. इसे 'नैरेटर' (यदि लागू हो) और ${speakerCount} वक्ताओं (${speakerListStr}) के लिए खंडों में विभाजित करें।
          2. यदि स्क्रिप्ट में स्पष्ट नहीं है कि कौन बोल रहा है, तो ${style} प्रवाह बनाने के लिए इसे तार्किक रूप से असाइन करें।
          3. ${includeNarrator ? `सुनिश्चित करें कि नैरेटर एक परिचय प्रदान करता है जो संदर्भ/दुविधा को सीधे समझाता है और केंद्रीय प्रश्न के साथ समाप्त होता है। "AI मॉडल" का उल्लेख न करें। अंत में बहुत संक्षिप्त सारांश (1-2 वाक्य) दें।` : "नैरेटर का उपयोग न करें।"}
          4. सुनिश्चित करें कि आउटपुट हिंदी (Hindi) में है।
          ${durTotalHi}
          6. ${includeNarrator ? "महत्वपूर्ण: नैरेटर के खंड छोटे और संक्षिप्त रखें। ध्यान वक्ताओं पर होना चाहिए।" : ""}
          ${style === 'explained' ? '7. महत्वपूर्ण: सुनिश्चित करें कि स्क्रिप्ट "इस वीडियो में..." से शुरू होती है और एक स्पष्ट, संरचित शैक्षिक प्रारूप का पालन करती है।' : ''}
          
          स्वर और भाषा (Tone & Language):
          - भाषा बहुत ही स्वाभाविक, संवादात्मक (conversational) और इंसानों जैसी (human-like) होनी चाहिए।
          - रोबोटिक, किताबी या अत्यधिक औपचारिक शब्दों का प्रयोग न करें। आम बोलचाल की भाषा (Colloquial Hindi/Hinglish) का उपयोग करें।
          - AI वाले घिसे-पिटे वाक्यों से बचें। ऐसा लगना चाहिए जैसे असली इंसान स्वाभाविक रूप से बात कर रहे हैं।
        `;
      } else {
        if (style === 'explained') {
            prompt = `
              विषय: "${topic}" पर एक शैक्षिक और संरचित "Explained" शैली की वीडियो स्क्रिप्ट तैयार करें।
              ${specificDetails ? `विशिष्ट विवरण/संदर्भ: ${specificDetails}` : ''}
              ${durLineHi}
              भाषा: हिंदी (Hindi)।
              
              पात्र:
              ${speakerCount} अलग-अलग वक्ता बनाएं।
              ${speakers.length > 0 ? `इन नामों का उपयोग करें: ${speakers.join(", ")}.` : `विषय के लिए उपयुक्त नाम/व्यक्तित्व ऑटो-डिटेक्ट करें।`}
              
              संरचना और प्रवाह:
              1. **महत्वपूर्ण शुरुआत**: स्क्रिप्ट की शुरुआत "इस वीडियो में..." वाक्यांश से होनी चाहिए। यह पहले वक्ता या नैरेटर द्वारा बोला जाना चाहिए।
              2. एक स्पष्ट, संरचित प्रारूप का पालन करें (जैसे, परिचय -> मुख्य अवधारणा 1 -> मुख्य अवधारणा 2 -> वास्तविक दुनिया के उदाहरण -> निष्कर्ष)।
              3. टोन जानकारीपूर्ण, आकर्षक और स्पष्ट होनी चाहिए (जैसे Vox या Kurzgesagt वीडियो)।
              4. जटिल विचारों को सरल, सुपाच्य भागों में तोड़ें।
              5. सभी ${speakerCount} वक्ताओं की समान भागीदारी सुनिश्चित करें, शायद एक "समझाने वाले" के रूप में कार्य कर रहा है और अन्य प्रश्न पूछ रहे हैं या उदाहरण दे रहे हैं।
              6. पूरी स्क्रिप्ट हिंदी में होनी चाहिए।
              
              स्वर और भाषा (Tone & Language):
              - भाषा बहुत ही स्वाभाविक, संवादात्मक (conversational) और इंसानों जैसी (human-like) होनी चाहिए।
              - रोबोटिक, किताबी या अत्यधिक औपचारिक शब्दों का प्रयोग न करें। आम बोलचाल की भाषा (Colloquial Hindi/Hinglish) का उपयोग करें।
              - AI वाले घिसे-पिटे वाक्यों से बचें। ऐसा लगना चाहिए जैसे असली इंसान स्वाभाविक रूप से बात कर रहे हैं।
              
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
              2. **परिदृश्य 1 (Scenario 1)**: नैरेटर पहले परिदृश्य/केस का परिचय देता है (सीधे मुद्दे पर)।
              3. वक्ता A (Speaker A) अपना पक्ष (POV) रखता है।
              4. वक्ता B (Speaker B) अपना विरोधी पक्ष (POV) रखता है।
              5. **बहस (Debate)**: वक्ता A और B आपस में तर्क-वितर्क करते हैं।
              6. **अगला परिदृश्य (Next Scenario)**: वक्ता (Speakers) खुद अगले विषय पर जाते हैं (नैरेटर नहीं)। (जैसे: "लेकिन अगर हम [अगला विषय] की बात करें...")
              7. वक्ता A और B अगले विषय पर बहस करते हैं।
              8. अवधि के अनुसार जितने परिदृश्य फिट हों, इस पैटर्न को जारी रखें।
              9. प्रवाह स्वाभाविक और आकर्षक रखें।
              10. ${includeNarrator ? "नैरेटर केवल अंत में एक संक्षिप्त निष्कर्ष (Conclusion) देने के लिए आएगा।" : ""}
              11. सभी ${speakerCount} वक्ताओं की समान भागीदारी सुनिश्चित करें।
              12. पूरी स्क्रिप्ट हिंदी में होनी चाहिए।
              
              स्वर और भाषा (Tone & Language):
              - भाषा बहुत ही स्वाभाविक, संवादात्मक (conversational) और इंसानों जैसी (human-like) होनी चाहिए।
              - रोबोटिक, किताबी या अत्यधिक औपचारिक शब्दों का प्रयोग न करें। आम बोलचाल की भाषा (Colloquial Hindi/Hinglish) का उपयोग करें।
              - AI वाले घिसे-पिटे वाक्यों से बचें। ऐसा लगना चाहिए जैसे असली इंसान स्वाभाविक रूप से बात कर रहे हैं।
              
              ${durFillHi}
              सख्त नियम: नैरेटर बहस के बीच में (Middle) कभी नहीं बोलेगा। केवल Start और End में।
            `;
        }
      }
  } else {
      // English Logic
      if (customScript) {
        prompt = `
          Analyze the following script and structure it into a ${style} format.
          Script: "${customScript}"
          
          Rules:
          1. Break it down into segments for 'Narrator' (if applicable) and the ${speakerCount} speakers (${speakerListStr}).
          2. If the script doesn't explicitly say who speaks, assign it logically to create a ${style} flow.
          3. ${includeNarrator ? `Ensure the Narrator provides an introduction that explains the context/dilemma directly and ends with the central question. Do NOT mention "AI models". Ends with a VERY BRIEF summary (1-2 sentences).` : "Do NOT use a Narrator."}
          4. Ensure the output is in ${language}.
          ${durTotalEn}
          6. ${includeNarrator ? "CRITICAL: Keep Narrator segments SHORT and CONCISE. The focus should be on the speakers." : ""}
          ${style === 'explained' ? '7. CRITICAL: Ensure the script starts with "In this video..." and follows a clear, structured educational format.' : ''}
          
          Tone & Language:
          - Use highly natural, conversational, and human-like language.
          - Avoid robotic, overly formal, or cliché AI phrases (like "In conclusion", "It's important to note", "Let's delve into").
          - Use contractions, natural pauses, colloquialisms, and conversational filler where appropriate to make it sound like real people talking.
          - Show emotion, personality, and natural reactions.
        `;
      } else {
        // General Prompt Construction
        if (style === 'explained') {
          prompt = `
            Generate an educational and structured "Explained" style video script on the topic: "${topic}".
            ${durLineEn}
            Language: ${language}.
            
            CRITICAL: You MUST base the explanation heavily on the provided context material if available. Accurately reflect the specific facts, data, and arguments from the "batchit" (conversation) or document.
            
            Characters:
            Create or use ${speakerCount} distinct speakers.
            ${speakers.length > 0 ? `Use these names: ${speakers.join(", ")}.` : `Auto-detect appropriate names/personas for the topic.`}
            
            Structure & Flow:
            1. **CRITICAL START**: The script MUST start with the exact phrase: "In this video...". This should be spoken by the first speaker or Narrator.
            2. Follow a clear, structured format (e.g., Introduction -> Key Concept 1 -> Key Concept 2 -> Real-world Examples -> Conclusion).
            3. The tone should be informative, engaging, and clear (like a Vox or Kurzgesagt video).
            4. Break down complex ideas into simple, digestible parts.
            5. Ensure equal participation from all ${speakerCount} speakers, perhaps with one acting as the "Explainer" and others asking questions or providing examples.
            6. The entire script MUST be in ${language}.
            
            Tone & Language:
            - Use highly natural, conversational, and human-like language.
            - Avoid robotic, overly formal, or cliché AI phrases (like "In conclusion", "It's important to note", "Let's delve into").
            - Use contractions, natural pauses, colloquialisms, and conversational filler where appropriate to make it sound like real people talking.
            - Show emotion, personality, and natural reactions.
            
            ${durFillEn}
          `;
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
        } else {
          prompt = `
            Generate a script for a ${style} on the topic: "${topic}".
            ${durLineEn}
            Language: ${language}.
            
            Characters:
            Create or use ${speakerCount} distinct speakers.
            ${speakers.length > 0 ? `Use these names: ${speakers.join(", ")}.` : `Auto-detect appropriate names/personas for the topic (e.g. "Vegetarian" vs "Omnivore" or specific famous figures).`}
            
            Structure & Flow:
            1. ${includeNarrator ? narratorIntro : `Start with an introduction that explains the topic/case simply, poses the central question, and introduces the speakers.`}
            2. **Scenario 1**: Narrator introduces the first scenario/case.
            3. Speaker A presents their POV on Scenario 1.
            4. Speaker B presents their opposing POV on Scenario 1.
            5. **Scenario 2**: Narrator introduces the second scenario/case (if applicable to the topic).
            6. Speaker A presents their POV on Scenario 2.
            7. Speaker B presents their opposing POV on Scenario 2.
            8. Continue this pattern for as many scenarios as fit the duration.
            9. ${style === 'formal debate' ? "Use a structured format: Opening Statements, Rebuttals, Closing Statements." : "Maintain a natural, engaging flow."}
            10. ${includeNarrator ? "Narrator acts as a guide/moderator, and MUST provide a VERY BRIEF summary (1-2 sentences) at the very end." : ""}
            11. Ensure equal participation from all ${speakerCount} speakers.
            12. The entire script MUST be in ${language}.
            
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
    1. If the topic mentions names (e.g. "Trump vs Biden"), use them.
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

export const generateThumbnail = async (title: string, hostName: string, guestName: string, referenceImage?: { data: string, mimeType: string }, extraInstructions?: string, onStep?: (step: 'inspecting' | 'generating') => void): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
    prompt = `You are a world-class YouTube thumbnail designer.

VISUAL STYLE GUIDE (extracted from a reference thumbnail — follow this religiously):
${styleAnalysis}

YOUR TASK:
Design a brand new, highly engaging YouTube thumbnail for the topic below. Use the visual style guide above for ALL design decisions — colors, typography, layout, background, mood, effects. Be completely creative with the content and composition — make it feel like it was made for this specific topic.

TOPIC & CAST:
- Main hook text (show this prominently, bold, exactly as written): "${title}"
- Podcast host: ${hostName}
- Guest / other speaker: ${guestName}

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

  } else {
    prompt = `
    Create a high-quality, professional YouTube podcast thumbnail in the style of the Joe Rogan Experience.
    
    COMPOSITION:
    1. **Subjects**: Two people facing each other. On the right is ${hostName}, and on the left is ${guestName}. They should look like they are in a deep conversation.
    2. **Title Card**: In the center, between the two people, there is a clean white rounded rectangle title card. 
       - Inside the card, at the top, show the guest's name "${guestName}" with a small circular profile picture and a blue verified checkmark.
       - Below that, the hook text "${title}" in large, bold, black and red sans-serif typography — make it BIG and eye-catching.
    3. **Foreground**: Two professional black studio microphones (like Shure SM7B) should be visible in the bottom foreground, one for each person.
    4. **Background**: A clean, pure white background.
    5. **Style**: Photorealistic, cinematic lighting, high contrast, sharp details.
    
    The final image should look exactly like a professional podcast thumbnail from a top-tier show.${extraNote}
    `;
  }

  try {
    const parts: any[] = [];
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
  funny: 'Funny meme rap song — internet humor, absurdist punchlines, relatable observations, unexpected wordplay. Think viral Twitter/Reddit humor turned into bars. Make people laugh out loud.',
  sarcastic: 'Sarcastic roast song — dripping with sarcasm, dark wit, shade, and savage observations. Deadpan delivery. Every line should feel like a mic drop moment or a cutting remark.',
  hiphop: 'Hip-hop street banger — hard-hitting bars, confident swagger, vivid storytelling, internal rhyme schemes. Real talk, no fluff. Think modern US hip-hop energy with cultural references.',
  hollywood: 'Classic cinematic Hollywood song — dramatic, orchestral feel in the lyrics. Grand metaphors, emotional depth, sweeping imagery. Like a movie trailer anthem or a Disney villain song.',
  viral: 'Viral pop bop — super catchy, radio-friendly, TikTok-worthy hook. Short punchy lines, repetitive chorus that sticks in your head, upbeat energy. Written to go viral on social media.',
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

  const styleDesc = STYLE_PROMPTS[params.style] || params.style;

  const lang = params.language || 'Hindi';

  const topicLine = params.context
    ? `TOPIC (write ONLY about this): ${params.context}`
    : params.comments
      ? `TOPIC: Derive the topic from the comments below — stay 100% true to what the comments are about.`
      : `TOPIC: Write a general fun/relatable song in the given style.`;

  const prompt = `You are a creative lyricist. Write song lyrics STRICTLY about the topic given below. Do NOT add unrelated themes, do NOT default to politics unless the topic itself is political.

STYLE: ${styleDesc}
LANGUAGE: ${lang}
${topicLine}
${params.comments ? `\nCOMMENTS (use the humor, emotions, and reactions from these — the song must reflect what these comments are about):\n${params.comments.slice(0, 3000)}` : ''}
${params.directLyrics ? `\nUSER DRAFT (refine and expand this, keep the same topic):\n${params.directLyrics}` : ''}

Write complete song lyrics with:
- [Mukhda] — hook/chorus capturing the core emotion or punchline of the topic (6–10 lines)
- [Antara 1] — first verse with specific details about the topic (6–10 lines)
- [Mukhda] — repeat
- [Antara 2] — second verse, different angle on the same topic (6–10 lines)
- [Mukhda] — repeat
- [Bridge] — twist, punchline, or emotional peak (4–6 lines)

STRICT RULES:
• Stay 100% on the given topic. Never drift to unrelated subjects.
• Language: ${lang} — natural, conversational, NOT formal. Slang welcome.
• Match the style: ${styleDesc}
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
  const styleMap: Record<string, string> = {
    funny:     'Comedic rap beat with bouncy bass, playful synths, and upbeat humorous energy',
    sarcastic: 'Dark satirical rap with minor key piano, punchy 808s, and dry deadpan delivery',
    hiphop:    'Modern US hip-hop banger with heavy 808 bass, trap hi-hats, and confident rap vocals',
    hollywood: 'Epic cinematic orchestral piece with sweeping strings, brass fanfare, and dramatic choir',
    viral:     'Upbeat viral pop song with catchy synth hook, claps, and energetic modern production',
  };
  const musicDesc = styleMap[style] || `${style} style Indian music`;

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
