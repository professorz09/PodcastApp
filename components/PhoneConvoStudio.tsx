import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Square, Download, Check,
  Volume2, Loader2,
  MonitorSmartphone,
} from 'lucide-react';
import { CanvasRenderer, PhoneConfig, ScriptTurn, StudioState, AnimStyle } from '../services/phoneCanvasRenderer';
import { renderVideoOffline } from '../services/videoRenderer';
import {
  generateScriptChapters,
  analyzePodcastChapters,
  generatePodcastDeepAnalysisScript,
  generateClipTakeScript,
  detectPodcastSpeakers,
  generateIntroFromTranscript,
  generateSpeech,
  generateTitleTextPair,
  generateThumbnail,
  PodcastTranscriptSeg,
  PodcastCutRange,
  PodcastChapter,
} from '../services/geminiService';
import {
  transcribeAudioGoogleCloud,
  generateProportionalWordTimings,
} from '../services/googleCloudService';
import { toast } from './Toast';
import { DebateSegment } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── AI Model Presets ─────────────────────────────────────────────────────────

const AI_MODEL_PRESETS: {
  id: string; label: string; emoji: string;
  color: string; screen: string; style: AnimStyle;
}[] = [
  { id: 'chatgpt',   label: 'ChatGPT',   emoji: '🤖', color: '#10a37f', screen: '#010f0a', style: 'aurora'        },
  { id: 'gemini',    label: 'Gemini',    emoji: '✨', color: '#4285F4', screen: '#080c18', style: 'gemini'        },
  { id: 'claude',    label: 'Claude',    emoji: '🧠', color: '#d97706', screen: '#130a01', style: 'cosmic-sphere' },
  { id: 'grok',      label: 'Grok',      emoji: '⚡', color: '#e5e5e5', screen: '#111111', style: 'ripple'        },
  { id: 'deepseek',  label: 'DeepSeek',  emoji: '🔮', color: '#3b82f6', screen: '#04081a', style: 'wave'          },
  { id: 'llama',     label: 'Llama',     emoji: '🦙', color: '#f97316', screen: '#130800', style: 'orb'           },
  { id: 'perplexity',label: 'Perplexity',emoji: '🔍', color: '#20b2aa', screen: '#021210', style: 'neon'          },
  { id: 'custom',    label: 'Custom',    emoji: '👤', color: '#a855f7', screen: '#0d0618', style: 'aurora'        },
];

const ANIM_STYLES: { value: AnimStyle; label: string; desc: string }[] = [
  { value: 'gemini',       label: 'Gemini',        desc: 'Sphere + ripple rings' },
  { value: 'siri-blob',    label: 'Siri Blob',     desc: 'Iridescent layered blobs' },
  { value: 'liquid',       label: 'Liquid',        desc: 'Morphing blob' },
  { value: 'particles',    label: 'Particles',     desc: 'Swarming dot orbit' },
  { value: 'galaxy',       label: 'Galaxy',        desc: 'Spiral arm dots' },
  { value: 'pulse-grid',   label: 'Pulse Grid',    desc: 'Lattice ripple' },
  { value: 'spectrum',     label: 'Spectrum',      desc: 'Analyzer-style bars' },
  { value: 'ripple',       label: 'Ripple',        desc: 'Expanding rings' },
  { value: 'neon',         label: 'Neon Bars',     desc: 'Glowing equalizer' },
  { value: 'orb',          label: 'Orb',           desc: 'Glowing sphere' },
  { value: 'cosmic-sphere',label: 'Cosmic',        desc: 'Nebula clouds' },
  { value: 'aurora',       label: 'Aurora',        desc: 'Northern lights' },
  { value: 'wave',         label: 'Wave',          desc: 'Audio bars' },
  { value: 'bottom-glow',  label: 'Bottom Glow',   desc: 'Glow blobs' },
];

const PRESET_COLORS = [
  { color: '#4285F4', screen: '#080c18', label: 'Blue' },
  { color: '#10b981', screen: '#04130e', label: 'Green' },
  { color: '#a855f7', screen: '#0d0618', label: 'Purple' },
  { color: '#f97316', screen: '#130800', label: 'Orange' },
  { color: '#ef4444', screen: '#130404', label: 'Red' },
  { color: '#06b6d4', screen: '#021013', label: 'Cyan' },
  { color: '#f59e0b', screen: '#130e01', label: 'Gold' },
  { color: '#e879f9', screen: '#120518', label: 'Pink' },
  { color: '#ffffff', screen: '#111111', label: 'White' },
];

const BG_OPTIONS = [
  { value: '#0f172a', label: 'Midnight' },
  { value: '#050505', label: 'Pure Black' },
  { value: '#0a0a12', label: 'Deep Dark' },
  { value: 'linear:#0a0a12,#12172a', label: 'Dark Gradient' },
  { value: 'linear:#0d0010,#200050', label: 'Purple Haze' },
  { value: 'linear:#000510,#0c1e40', label: 'Ocean Deep' },
  { value: '#1a1a2e', label: 'Dark Navy' },
  { value: '#f0f4f8', label: 'Light' },
];

// ─── Conversation Styles ──────────────────────────────────────────────────────

const CONVO_STYLES: {
  id: string; emoji: string; label: string; desc: string; prompt: string;
}[] = [
  {
    id: 'podcast_analysis',
    emoji: '🎙️🔍',
    label: 'Podcast Deep Analysis',
    desc: 'Adaptive — auto-adjusts tone by chapter (debate / banter / personal / preference)',
    prompt: `DEEP PODCAST ANALYSIS MODE — ADAPTIVE. Two analysts react to a podcast chapter. Their tone auto-adjusts: serious claims → push-back debate; funny banter → interesting commentary, not arguing; personal stories → warm curiosity, no criticizing someone's life; personal tastes ("I like the Taj Mahal") → no mocking the preference. Critic agrees when a point is genuinely solid — no knee-jerk contrarianism.`,
  },
  {
    id: 'podcast_analysis_funny',
    emoji: '🎙️😏',
    label: 'Podcast Analysis — Funny/Sarcastic',
    desc: 'Same deep analysis but with comedic, lightly-sarcastic banter throughout',
    prompt: `FUNNY/SARCASTIC PODCAST ANALYSIS. Same deep dive into the chapter, but the energy is comedic and lightly sarcastic. Witty observations, playful jabs, deadpan one-liners. Both speakers tease the podcast guests AND each other — but the actual points still land. Not mean — funny.`,
  },
  {
    id: 'podcast_analysis_friendly',
    emoji: '🎙️☕',
    label: 'Podcast Analysis — Friendly Chat',
    desc: 'Two friends talking warmly about what they heard — curious, no adversarial energy',
    prompt: `FRIENDLY PODCAST CHAT. Two friends discussing a podcast chapter together over coffee. Warm, curious, no adversarial framing. They build on each other's reactions, share what struck them, riff on ideas. Mild disagreement is fine but the default is exploring TOGETHER. Interesting > combative.`,
  },
  {
    id: 'clip_reaction',
    emoji: '🎥',
    label: 'Clip Reaction (1 Speaker, ~5 min)',
    desc: 'YouTube clip → one speaker introduces it, gives their take, ends with takeaways',
    prompt: '', // unused — handled by generateClipTakeScript via PodcastAnalysisFlow
  },
  {
    id: 'what_if',
    emoji: '🌌',
    label: 'What If…',
    desc: 'Hypothetical scenarios — setup → basics → debate → fun deep conclusion',
    prompt: `WHAT-IF MODE — for hypothetical / thought-experiment scenarios like "What if all data centers shifted to Mars?", "What if the sun disappeared?", "What if gravity didn't exist?".

FOLLOW THIS STRUCTURE EXACTLY:

PHASE 1 — SCENARIO SETUP (first 2 turns, MUST come first, do NOT start in-medias-res):
- Speaker 1 introduces the wild scenario clearly so the listener instantly knows what's being imagined. Frame it with stakes/scale and a hook. Use their name once. ("Okay picture this — every data center on Earth, packed onto rockets, launched to Mars. Yes literally Mars. What actually happens?")
- Speaker 2 reacts with energy and locks in the premise. Maybe defines the rules of the thought experiment. ("Wait, are we assuming the rockets even make it? Because step one is already a disaster…")

PHASE 2 — BASICS BRIDGE (3-5 turns):
- Walk through the underlying REAL-WORLD facts the hypothetical depends on, FROM BASICS, assuming the listener knows nothing.
- One explains a basic in a fun, conversational way ("okay so first — a data center is basically a warehouse full of computers running so hot they need AC units the size of buildings just to not melt"), the other adds the next layer.
- Each fact should land a small "huh, interesting" moment. Teach like a clever friend over chai, NOT a textbook. Light sarcasm is fine.

PHASE 3 — IMPLICATIONS, ONE BY ONE, WITH DEBATE (60% of turns):
- Walk through the specific implications point by point — pick 4-6 distinct angles relevant to THIS scenario (for Mars data centers: latency, power, cooling, repairs, cost, solar storms, time-zone for engineers… for sun-disappears: light, gravity, temperature, oceans, atmosphere, photosynthesis…).
- For EACH implication: explain the science/mechanism FROM BASICS in 1-2 sentences, then the speakers GENUINELY DISAGREE — one says "actually this could work because X", the other says "nope, absurd, because Y". Take both sides seriously — steelman each.
- Sprinkle funny analogies + light sarcasm — "Right, so we'll just FedEx Mars our servers, what could possibly go wrong" — but the FACTS stay real.
- Don't agree just to be agreeable. Don't disagree just to be contrarian. Earn the disagreement with content.

PHASE 4 — FUN + DEEP CONCLUSION (last 2 turns):
- Each speaker delivers a final take that's PUNCHY and FUNNY on the surface but lands a genuinely deep observation — what this hypothetical actually reveals about the real world.
- NOT "well that was fun!" — a real insight. Example: "The funniest part is we're already doing the small version of this — every undersea cable is a less dramatic Mars launch. We've just normalised the absurdity."
- They don't fully agree. One ends with a witty line, the other with the deeper takeaway.

GLOBAL TONE RULES:
- Funny + interesting + lightly sarcastic — two smart friends at a dinner party.
- Real science/facts as the foundation, even when the scenario is absurd.
- Explain technical concepts FROM BASICS — never assume background knowledge. But DON'T explain things the listener already knows (gravity, sun, computer, etc.).
- Each turn earns its slot — no filler ("great point", "I totally agree and would add").
- Mix turn lengths — short stinging jabs with longer 4-5 sentence analytical turns.
- Speakers refer to each other by name occasionally, not every turn.`,
  },
  {
    id: 'debate2',
    emoji: '⚡',
    label: 'Debate 2 — Extremes',
    desc: 'Funny + sarcastic EXTREMES debate on big questions, with deep knowledgeable wrap-up',
    prompt: `DEBATE 2 MODE — high-energy, funny, sarcastic debate on big "is X possible / should we do X / can X ever happen" questions like "Should we move data centers to Mars?", "Can human suffering ever truly end?", "Is privacy already dead?". This is NOT the regular Debate style — both speakers take EXTREME positions with full conviction, no middle ground, but the form is witty/sharp/clever, NEVER hostile.

FOLLOW THIS STRUCTURE EXACTLY:

PHASE 1 — FRAMING (1-2 turns):
- Open by stating the question plainly but with attitude. Speaker 1 stakes out one extreme position immediately with a punchy declarative line. ("Honestly? Moving data centers to Mars is the most beautifully unhinged idea humanity has had since the pyramids — and I think we should absolutely do it.")
- Speaker 2 responds with the OPPOSITE extreme, also punchy. ("Okay, you've lost the plot. This is a Tony Stark fanfic, not a plan. Sit down.")
- No "well, on one hand…" centrism allowed. No qualifier-hedging openers.

PHASE 2 — EXTREMES, FACTS, WIT (70% of turns):
- Pick 3-5 specific debate sub-points (different angles on the question).
- For EACH sub-point:
  - Speaker A makes their extreme case with humour + ONE real fact/study/example/historical precedent that genuinely supports it.
  - Speaker B counter-extremes with sarcasm + their OWN real fact/example backing the opposite extreme.
  - Both must use REAL data and examples — the form is funny, the substance is honest.
- When a sub-point uses a TECHNICAL concept the listener may not know (e.g. "latency", "entropy", "hedonic treadmill", "Pareto distribution"), the speaker explains it FROM BASICS in 1-2 sentences inside their turn before using it — conversationally, not textbook-style.
- DO NOT bridge for things the listener already knows (happiness, money, marriage, AI, school) — only genuinely technical/niche terms.
- Sarcasm examples: "Right, and the moon is made of cheese — let me know how the round-trip ping works out", "Sure, we'll eliminate suffering by Tuesday, I'll put it on the calendar between dentist and laundry".
- Two clever friends arguing at a dinner party — sharp, never mean, never personal.
- NO conceding mid-debate. Both stay on their extreme until Phase 3.

PHASE 3 — DEEP + FUN CONCLUSION (last 2 turns, MANDATORY):
- The energy softens just slightly. Each speaker delivers a FINAL take that's funny on the surface but contains a deep, genuinely knowledgeable insight — something worth chewing on hours after the video ends.
- They don't fully agree — that's the realism. But each gives the listener a real takeaway.
- Example for "Can suffering ever end?": "Look — I'll concede this much: total elimination is fantasy. But every century has cut average suffering by orders of magnitude, and the only reason that sounds wild is that we measure pain in screams, not in the silences we never noticed. Maybe ending suffering isn't a target — it's a direction." / "Sure, beautifully said, and also exactly what every utopian who got people killed used to say. The danger isn't the goal — it's mistaking direction for permission. I'll keep my screams, thanks."
- One ends with a punchy line, the other with the deeper observation.

GLOBAL TONE RULES:
- Funny + sarcastic FORM, deeply knowledgeable SUBSTANCE. Jokes are the wrapping, facts are the gift.
- Each turn must add a new fact, angle, counter, or insight — no filler.
- Mix turn lengths — short stinging jabs with longer 4-5 sentence analytical turns.
- Speakers refer to each other by name occasionally.
- THIS IS NOT THE STANDARD 'DEBATE' STYLE. Make it feel distinctly different — sharper, funnier, smarter, more extreme positions, deeper wrap.`,
  },
  {
    id: 'podcast',
    emoji: '🎙️',
    label: 'Podcast',
    desc: 'Joe Rogan style — curious, casual, deep dives',
    prompt: `Joe Rogan style casual podcast. Use phrases like "wait wait wait", "that's crazy", "what do you mean by that", "let me ask you something". Curious, open-minded. Long tangents welcome. Natural interruptions. Very conversational — as if recorded live. Mix serious points with casual banter.`,
  },
  {
    id: 'roast',
    emoji: '🔥',
    label: 'Roast',
    desc: 'Savage burns, comedy burns, witty comebacks',
    prompt: `Comedy roast style. Each response should contain a subtle or not-so-subtle burn/jab at the other's point. Witty, sharp, sarcastic. Think: "Oh wow, groundbreaking insight from someone who…", "That's a bold take from the AI that…". Keep it funny not mean. Each speaker tries to one-up the other with sharper jokes while still making valid points.`,
  },
  {
    id: 'sarcastic',
    emoji: '😏',
    label: 'Sarcastic',
    desc: 'Dripping sarcasm, eye-rolls, deadpan humour',
    prompt: `Heavy sarcasm and deadpan humour throughout. Lots of "Oh sure, because THAT makes total sense", "Right, and I'm sure that worked out great", "Wow, never heard that one before". One AI is genuinely trying to make good points, the other responds with increasing sarcasm. Eventually they both become sarcastic together. Dry British-style humour.`,
  },
  {
    id: 'factual',
    emoji: '🧠',
    label: 'Factual Deep',
    desc: 'Concepts explained simply — like explaining to a friend',
    prompt: `Educational but conversational. Break down complex concepts using simple analogies and real-world examples. Think "okay so imagine you're at a grocery store and…", "it's basically like when…", "the crazy thing is most people don't realize that…". Deep but accessible. Both AIs build on each other's explanations. No jargon without explanation. By the end, a 12-year-old should understand it.`,
  },
  {
    id: 'devils_advocate',
    emoji: '😈',
    label: "Devil's Advocate",
    desc: 'One defends a claim, other destroys it ruthlessly',
    prompt: `One AI (first speaker) is FULLY defending the topic/claim — strongly, with conviction. The other AI (second speaker) is playing devil's advocate — finding every flaw, counterexample, and logical gap in the argument. It's not a balanced debate — the second speaker is specifically trying to dismantle the first's argument. First speaker has to keep defending. Make both sides compelling.`,
  },
  {
    id: 'hot_takes',
    emoji: '🌶️',
    label: 'Hot Takes',
    desc: 'Controversial opinions, Twitter-drama energy',
    prompt: `Hot takes energy. Both AIs dropping controversial, provocative opinions about the topic. Think Twitter discourse, podcast clips that go viral. "Unpopular opinion but…", "I'm going to get cancelled for this but…", "Nobody wants to admit it but…". Opinions should be spicy but defensible. The other AI reacts with "WAIT. You can't just say that", "Okay that's actually kind of true though". High energy.`,
  },
  {
    id: 'factcheck',
    emoji: '📋',
    label: 'Fact-Check',
    desc: 'Breaking down myths, wrong claims, misconceptions',
    prompt: `One AI presents common misconceptions or popular claims about the topic. The other fact-checks them in real time — "Actually that's not quite right because…", "That's partially true but the part people miss is…", "The study that everyone cites actually said something different…". Educational myth-busting format. Both are curious, not combative. End goal: truth.`,
  },
  {
    id: 'react',
    emoji: '🎬',
    label: 'React & Review',
    desc: 'Reacting strongly with opinions, like a reaction video',
    prompt: `Reaction video energy. Both AIs are reacting to the topic as if seeing it for the first time. Strong first reactions — "Oh this is actually wild", "Wait hold on", "I did NOT expect that". Mix of hype, genuine interest, and criticism. One is more positive/hyped, the other is more skeptical/critical. Like two friends watching something together and giving live commentary.`,
  },
  {
    id: 'experts',
    emoji: '🔬',
    label: 'Experts',
    desc: 'Deep technical analysis from two domain experts',
    prompt: `Expert and analytical tone. Both agents are deeply knowledgeable. Use technical terms. Cite data and facts. Take each other's points seriously. Peer-review energy.`,
  },
  {
    id: 'detailed',
    emoji: '📝',
    label: 'Detailed',
    desc: 'Thorough breakdown covering every angle',
    prompt: `Thorough and methodical. Explain each point in detail. Step-by-step breakdown. Cover every angle. No shortcuts.`,
  },
  {
    id: 'funny',
    emoji: '😂',
    label: 'Funny',
    desc: 'Hilarious takes with real info underneath',
    prompt: `Humorous and witty tone. Use jokes and analogies. Light-hearted banter. Funny examples. Entertaining yet informative. Think stand-up meets a Wikipedia rabbit hole.`,
  },
  {
    id: 'debate',
    emoji: '⚔️',
    label: 'Debate',
    desc: 'Head-to-head debate — strong opposing views',
    prompt: `Argumentative tone. Agents actively disagree. Challenge each other. Strong opposing views. Heated but logical. No cheap shots — real arguments only.`,
  },
  {
    id: 'debate_sarcasm',
    emoji: '🗡️',
    label: 'Debate + Sarcasm',
    desc: 'Full debate dripping with sharp sarcasm',
    prompt: `Full debate but EVERY counterpoint drips with sarcasm. Sharp, stinging sarcastic remarks on every response. "Oh sure, great point — maybe the sky is green too." Both sides genuinely argue but every line has eye-rolls and withering sarcasm.`,
  },
  {
    id: 'fight',
    emoji: '🥊',
    label: 'Fight Mode',
    desc: 'Heated argument — interruptions, frustration, passion',
    prompt: `This is a HEATED ARGUMENT — both speakers interrupt, cut each other off, get frustrated. "You're not even listening!", "Don't tell me what to think!" Real argument energy — emotional, intense, passionate. Use em-dashes to show interruptions. But facts must be real.`,
  },
  {
    id: 'romantic',
    emoji: '💕',
    label: 'Romantic',
    desc: 'Warm, flirty conversation exploring the topic',
    prompt: `Two people having a warm, romantic conversation about the topic. Soft, flirty, caring tone. Playful banter with genuine affection. They listen to each other deeply. Explore the topic through a romantic, emotional lens.`,
  },
  {
    id: 'celebrity_call',
    emoji: '⭐',
    label: 'Celebrity Call',
    desc: 'Two A-listers calling each other about a hot topic',
    prompt: `This is an intellectual celebrity phone call. Both speak like confident public figures — opinionated, charming, slightly larger-than-life. Witty one-liners, strong takes, name-dropping real events, playful ego clashes. Like two A-listers calling each other about a hot topic.`,
  },
  {
    id: 'ground_search',
    emoji: '🔍',
    label: 'Ground Search',
    desc: 'Investigative fact-finding — what does data actually say?',
    prompt: `Research mode — both agents dig for ground-level facts. Back every claim with actual data, studies, real-world examples. "Let's look at what the actual research says...", "The real numbers are...", "That's a common myth — the reality is..." Truth-seeking, investigative journalism energy.`,
  },
  {
    id: 'explain_examples',
    emoji: '💡',
    label: 'Explain w/ Examples',
    desc: 'Every point backed by a real concrete example',
    prompt: `Explain the topic entirely through REAL EXAMPLES. Every single point must have a concrete, relatable example. "Think of it like a coffee shop where...", "Real case: Apple did exactly this when...", "Imagine you're at a traffic signal and..." Both speakers build on each other's examples.`,
  },
  {
    id: 'explain_funny',
    emoji: '🤪',
    label: 'Explain Funny',
    desc: 'Absurd analogies + comedy = actual learning',
    prompt: `Explain the topic in a FUNNY, comedic way. Absurd analogies, silly comparisons, unexpected humor. "This is basically like if your stomach was a startup trying to raise a Series A..." Stand-up comedy energy meets actual education. Every explanation must land a laugh but the info must be accurate.`,
  },
  {
    id: 'explain_deep',
    emoji: '🌊',
    label: 'Explain Deep',
    desc: 'First principles — go 3 levels deeper than anyone else',
    prompt: `DEEP explanation mode. Every layer reveals more layers underneath. Start from first principles. "But why does that even work?" / "The root cause is..." / "That's just surface — the real mechanism is..." Philosophical and analytical depth. Nothing is taken at face value. Go three levels deeper than anyone else would.`,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const speakerToPhoneId = (speaker: string) =>
  `p_${speaker.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`;

const DEFAULT_BATTERIES = ['87%', '73%', '91%', '65%', '82%', '58%'];

// Default model assignments per speaker index
const DEFAULT_MODELS = ['chatgpt', 'gemini', 'claude', 'grok', 'deepseek', 'llama'];

const buildPhonesFromSpeakers = (
  speakers: string[],
  existing: PhoneConfig[]
): PhoneConfig[] => {
  return speakers.map((spk, i) => {
    const existingPhone = existing.find(p => p.id === speakerToPhoneId(spk));
    if (existingPhone) return existingPhone;
    // Pick default model preset
    const preset = AI_MODEL_PRESETS.find(m => m.id === DEFAULT_MODELS[i % DEFAULT_MODELS.length])
                   ?? AI_MODEL_PRESETS[0];
    return {
      id: speakerToPhoneId(spk),
      name: preset.label,
      style: preset.style,
      color: preset.color,
      screenColor: preset.screen,
      rotation: [-4, 5, -3, 4][i % 4],
      showControls: true,
      battery: DEFAULT_BATTERIES[i % DEFAULT_BATTERIES.length],
    };
  });
};

const estimateWordTimings = (text: string, durationSec: number) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const weights = words.map(w => w.length + 2);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  return words.map((word, i) => {
    const dur = (weights[i] / total) * durationSec;
    const wt = { word, startTime: +t.toFixed(3), endTime: +(t + dur).toFixed(3) };
    t += dur;
    return wt;
  });
};

const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ─── IntroFlow — Optional Intro Video (Step 2 / Cuts) ────────────────────────
// Pipeline: gemini-3.1-flash-lite + Google grounding → TTS → STT → 1080p MP4.
// Single phone called "Intro" (aurora purple). Per-step status + retry.

type IntroStepKey = 'text' | 'tts' | 'stt' | 'render';
type IntroStepStatus = 'pending' | 'running' | 'done' | 'failed';

const INTRO_STEPS: { key: IntroStepKey; label: string }[] = [
  { key: 'text',   label: '🧠 Intro likh raha hai (Gemini 3.1 Flash Lite · Search ON)' },
  { key: 'tts',    label: '🗣️ Intro ka audio bana raha hai (TTS)' },
  { key: 'stt',    label: '🔤 Speech-to-text — word timings nikaal raha hai' },
  { key: 'render', label: '🎬 1080p MP4 render kar raha hai' },
];

interface IntroFlowProps {
  segments: PodcastTranscriptSeg[];
  podcastTitle: string;
  podcastHost: string;
  podcastGuests: string[];
  // Time range (seconds) covering ONLY the selected chapters. When provided,
  // the intro is generated from this slice of the transcript — NOT the whole
  // episode — so the topic matches what the user actually picked.
  selectedRanges?: { startSec: number; endSec: number }[];
  selectionLabel?: string;
}

const IntroFlow: React.FC<IntroFlowProps> = ({ segments, podcastTitle, podcastHost, podcastGuests, selectedRanges, selectionLabel }) => {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [steps, setSteps] = useState<Record<IntroStepKey, { status: IntroStepStatus; detail?: string; error?: string }>>({
    text:   { status: 'pending' },
    tts:    { status: 'pending' },
    stt:    { status: 'pending' },
    render: { status: 'pending' },
  });

  // Mirror in state for display
  const [introText, setIntroText] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [detectedHost, setDetectedHost] = useState<string | null>(null);

  // Cached intermediate results — refs so the pipeline can read them sync
  const introTextRef = useRef<string | null>(null);
  const audioRef = useRef<{ blob: Blob; url: string; duration: number } | null>(null);
  const timingsRef = useRef<{ word: string; start: number; end: number }[] | null>(null);
  const videoRef = useRef<{ blob: Blob; url: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Free the video blob URL on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current?.url) {
        try { URL.revokeObjectURL(videoRef.current.url); } catch {}
      }
      if (audioRef.current?.url) {
        try { URL.revokeObjectURL(audioRef.current.url); } catch {}
      }
    };
  }, []);

  const patchStep = (key: IntroStepKey, patch: Partial<{ status: IntroStepStatus; detail?: string; error?: string }>) => {
    setSteps(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const STEP_ORDER: IntroStepKey[] = INTRO_STEPS.map(s => s.key);

  // Run the pipeline from `fromStep` to end. Earlier steps reuse cached refs.
  const runFrom = async (fromStep: IntroStepKey) => {
    if (running) return;
    if (!segments.length) {
      toast.error('Transcript empty hai — pehle URL fetch karo');
      return;
    }
    setRunning(true);

    // Reset this step + all later steps to pending (clear any old failure / done)
    const startIdx = STEP_ORDER.indexOf(fromStep);
    setSteps(prev => {
      const next = { ...prev };
      STEP_ORDER.forEach((k, i) => {
        if (i >= startIdx) next[k] = { status: 'pending' };
      });
      return next;
    });

    try {
      // ── Step 1: Generate intro text ───────────────────────────────────
      if (startIdx <= 0) {
        patchStep('text', { status: 'running' });
        try {
          // Slice the transcript to ONLY the selected chapter ranges so the
          // intro's topic matches what the user actually picked. Fall back to
          // the full transcript only if no ranges were provided.
          const ranges = (selectedRanges || []).filter(r => r.endSec > r.startSec);
          const segsForIntro = ranges.length
            ? segments.filter(s => {
                const segEnd = s.start + (s.duration || 0);
                return ranges.some(r => segEnd > r.startSec && s.start < r.endSec);
              })
            : segments;
          const transcriptText = segsForIntro.map(s => s.text).join(' ');
          if (!transcriptText.trim()) throw new Error('Selected chapters ka transcript empty hai');
          const res = await generateIntroFromTranscript({
            transcriptText,
            podcastTitle,
            podcastHost,
            podcastGuests,
          });
          introTextRef.current = res.intro;
          setIntroText(res.intro);
          setTopic(res.topic);
          setDetectedHost(res.host);
          patchStep('text', { status: 'done', detail: `Topic: "${res.topic}" · Host: ${res.host}` });
        } catch (e: any) {
          patchStep('text', { status: 'failed', error: e?.message || 'Intro text generation failed' });
          setRunning(false);
          return;
        }
      }

      // ── Step 2: TTS ───────────────────────────────────────────────────
      if (startIdx <= 1) {
        patchStep('tts', { status: 'running' });
        try {
          const txt = introTextRef.current;
          if (!txt) throw new Error('Intro text missing — Step 1 re-run karo');
          const ttsRes = await generateSpeech(txt, 'Zubenelgenubi');
          const blob = await (await fetch(ttsRes.audioUrl)).blob();
          // Free any prior audio blob URL
          if (audioRef.current?.url && audioRef.current.url !== ttsRes.audioUrl) {
            try { URL.revokeObjectURL(audioRef.current.url); } catch {}
          }
          audioRef.current = { blob, url: ttsRes.audioUrl, duration: ttsRes.duration };
          patchStep('tts', { status: 'done', detail: `${ttsRes.duration.toFixed(1)}s WAV` });
        } catch (e: any) {
          patchStep('tts', { status: 'failed', error: e?.message || 'TTS failed' });
          setRunning(false);
          return;
        }
      }

      // ── Step 3: STT (word timings) ────────────────────────────────────
      if (startIdx <= 2) {
        patchStep('stt', { status: 'running' });
        try {
          if (!audioRef.current) throw new Error('Audio missing — Step 2 re-run karo');
          let timings: { word: string; start: number; end: number }[];
          try {
            timings = await transcribeAudioGoogleCloud(audioRef.current.blob, 'en-US');
            if (!timings.length) throw new Error('STT returned 0 words');
          } catch (sttErr: any) {
            // Fallback: proportional timings from the text + duration
            console.warn('Google STT failed → proportional fallback', sttErr);
            timings = generateProportionalWordTimings(introTextRef.current || '', audioRef.current.duration);
          }
          timingsRef.current = timings;
          patchStep('stt', { status: 'done', detail: `${timings.length} words timed` });
        } catch (e: any) {
          patchStep('stt', { status: 'failed', error: e?.message || 'STT failed' });
          setRunning(false);
          return;
        }
      }

      // ── Step 4: Video render ──────────────────────────────────────────
      if (startIdx <= 3) {
        patchStep('render', { status: 'running', detail: '0%' });
        try {
          if (!audioRef.current || !timingsRef.current || !introTextRef.current) {
            throw new Error('Pichla data missing — pichle step retry karo');
          }
          if (!('VideoEncoder' in window)) {
            throw new Error('Browser WebCodecs support nahi karta — Chrome/Edge try karo');
          }

          // Build single-phone state for the renderer
          const introPhone: PhoneConfig = {
            id: 'intro_phone',
            name: 'Intro',
            style: 'aurora',
            color: '#a855f7',
            screenColor: '#0d0618',
            rotation: 0,
            showControls: true,
            battery: '87%',
          };
          const turn: ScriptTurn = {
            id: 'intro_turn',
            phoneId: 'intro_phone',
            text: introTextRef.current,
            durationMs: Math.round(audioRef.current.duration * 1000),
            audioUrl: audioRef.current.url,
            wordTimings: timingsRef.current.map(w => ({
              word: w.word, startTime: w.start, endTime: w.end,
            })),
            isNarrator: false,
          };

          // Decode audio → 48kHz STEREO Float32Arrays for the muxer.
          //
          // Why 48k stereo:
          // - Gemini TTS outputs 24kHz mono WAV. Some WebCodecs AAC encoder
          //   builds (notably Chrome on Windows/Android) silently misencode
          //   24kHz mono — the MP4 muxes a track but it's empty / unplayable
          //   in QuickTime / WMP / default Android player. 48kHz stereo is
          //   the most universally accepted AAC config.
          // - decodeAudioData(ab) detaches the ArrayBuffer — we slice() to a
          //   fresh copy so retries don't read a zero-length buffer.
          const TARGET_SR = 48_000;
          let actx: AudioContext;
          try { actx = new AudioContext({ sampleRate: TARGET_SR }); }
          catch { actx = new AudioContext(); }
          const rawAb = await audioRef.current.blob.arrayBuffer();
          const ab = rawAb.slice(0);
          if (ab.byteLength < 100) {
            await actx.close();
            throw new Error(`TTS audio empty hai (${ab.byteLength} bytes) — Step 2 dobara chalao`);
          }
          const decoded = await actx.decodeAudioData(ab);
          // decodeAudioData resamples to the AudioContext's rate automatically,
          // so `decoded` is at TARGET_SR (or whatever the fallback context chose).
          const srcCh0 = decoded.getChannelData(0);
          const srcCh1 = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : srcCh0;
          // Copy out BEFORE closing the AudioContext (otherwise the underlying
          // buffer is detached and reads return zero).
          const left  = new Float32Array(srcCh0.length);
          const right = new Float32Array(srcCh1.length);
          left.set(srcCh0);
          right.set(srcCh1);
          const sampleRate = decoded.sampleRate;
          const duration = decoded.duration;
          await actx.close();

          // Sanity: confirm the buffer actually contains sound. Catches the
          // rare case where TTS returned silent PCM (quota errors etc.).
          let peak = 0, sumSq = 0;
          const stride = Math.max(1, Math.floor(left.length / 4096));
          let counted = 0;
          for (let k = 0; k < left.length; k += stride) {
            const v = Math.abs(left[k]);
            if (v > peak) peak = v;
            sumSq += left[k] * left[k];
            counted++;
          }
          const rms = Math.sqrt(sumSq / Math.max(1, counted));
          console.log(`[IntroFlow] audio ready — samples=${left.length} sr=${sampleRate} ch=2 dur=${duration.toFixed(2)}s peak=${peak.toFixed(4)} rms=${rms.toFixed(4)}`);
          if (left.length === 0) {
            throw new Error('Decoded audio me 0 samples hain — TTS step retry karo');
          }
          if (peak < 0.0005) {
            throw new Error('TTS ne silent audio diya (peak ~ 0) — Step 2 retry karo');
          }

          // Offscreen canvas + renderer
          const W = 1920, H = 1080, FPS = 30;
          const exportCanvas = document.createElement('canvas');
          exportCanvas.width = W;
          exportCanvas.height = H;
          const state: StudioState = {
            phones: [introPhone],
            script: [turn],
            background: { type: 'color', value: bgColor },
            deviceSpacing: 50,
            deviceScale: 100,
            startTime: '09:41',
            subtitleConfig: { enabled: true, size: 1.6, background: 'dark', textColor: '#ffffff' },
            phoneZPulse: false,
          };
          const exportRenderer = new CanvasRenderer(exportCanvas, state);

          const blob = await renderVideoOffline({
            canvas: exportCanvas,
            audioChannels: [left, right],
            sampleRate,
            duration,
            fps: FPS,
            bitrate: 8_000_000,
            width: W,
            height: H,
            renderCallback: (_time, _level, _vid, offCtx) => {
              exportRenderer.currentTime = _time * 1000;
              exportRenderer.audioLevel = _level;
              exportRenderer.drawFrame();
              offCtx.drawImage(exportCanvas, 0, 0, W, H);
            },
            onProgress: p => {
              patchStep('render', { status: 'running', detail: `${Math.round(p * 100)}%` });
            },
          }) as Blob | void;

          if (!blob) throw new Error('Render empty blob return hua');
          // Free any old video URL before replacing
          if (videoRef.current?.url) {
            try { URL.revokeObjectURL(videoRef.current.url); } catch {}
          }
          const url = URL.createObjectURL(blob);
          videoRef.current = { blob, url };
          patchStep('render', { status: 'done', detail: `${(blob.size / 1024 / 1024).toFixed(1)} MB MP4 ready` });
          toast.success('✓ Intro video ready — download click karo');
        } catch (e: any) {
          console.error('Intro render error:', e);
          patchStep('render', { status: 'failed', error: e?.message || 'Render failed' });
          setRunning(false);
          return;
        }
      }
    } finally {
      setRunning(false);
    }
  };

  const handleDownload = () => {
    if (!videoRef.current) return;
    const a = document.createElement('a');
    a.href = videoRef.current.url;
    a.download = `intro-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const allDone = STEP_ORDER.every(k => steps[k].status === 'done');
  const allPending = STEP_ORDER.every(k => steps[k].status === 'pending');
  const startedAny = !allPending;

  return (
    <div style={{
      borderRadius: 12,
      border: '1px solid rgba(168,85,247,0.25)',
      background: 'linear-gradient(135deg, rgba(168,85,247,0.06), rgba(124,58,237,0.04))',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 20, flexShrink: 0 }}>🎤</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd' }}>
            Optional Intro Video <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>(separate MP4 download)</span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 1, wordBreak: 'break-word' }}>
            {selectionLabel ? <>From <b style={{ color: '#c4b5fd' }}>{selectionLabel}</b> → </> : null}
            "In this clip {detectedHost || podcastHost || 'host'}{podcastGuests?.[0] ? ` and ${podcastGuests[0]}` : ''} talk about…" → audio → 1080p MP4
          </div>
        </div>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 12px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Background picker — only when not running */}
          {!running && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Background
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {([
                  { value: '#ffffff', label: 'White' },
                  { value: '#00b140', label: '🟢 Green Screen' },
                  { value: '#00ff00', label: '🟢 Chroma' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setBgColor(opt.value)}
                    style={{
                      padding: '7px 4px', borderRadius: 8, border: `2px solid ${bgColor === opt.value ? '#a855f7' : 'rgba(255,255,255,0.1)'}`,
                      background: opt.value, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 10, fontWeight: 700,
                      color: opt.value === '#ffffff' ? '#374151' : '#ffffff',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generate button — visible when nothing has started yet OR when allDone (to regenerate) */}
          {(allPending || allDone) && (
            <button
              onClick={() => runFrom('text')}
              disabled={running || !segments.length}
              style={{
                padding: '11px', borderRadius: 10, border: 'none',
                background: running ? 'rgba(168,85,247,0.4)' : 'linear-gradient(135deg,#a855f7,#7c3aed)',
                color: '#fff', fontSize: 13, fontWeight: 800,
                cursor: running ? 'default' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: !segments.length ? 0.4 : 1,
              }}
            >
              {running
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Pipeline chal raha hai…</>
                : allDone ? '🔁 Re-generate Intro' : '🎤 Generate Intro'}
            </button>
          )}

          {/* Steps panel — shown once pipeline has started */}
          {startedAny && (
            <div style={{
              borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(0,0,0,0.3)', padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {INTRO_STEPS.map((s, i) => {
                const st = steps[s.key];
                const icon =
                  st.status === 'done' ? '✓' :
                  st.status === 'failed' ? '✗' :
                  st.status === 'running' ? '⋯' : '○';
                const color =
                  st.status === 'done' ? '#86efac' :
                  st.status === 'failed' ? '#fca5a5' :
                  st.status === 'running' ? '#fde68a' : 'rgba(255,255,255,0.3)';
                return (
                  <div key={s.key} style={{
                    padding: '6px 8px', borderRadius: 7,
                    background: st.status === 'running' ? 'rgba(253,230,138,0.06)'
                              : st.status === 'failed'  ? 'rgba(239,68,68,0.06)'
                              : st.status === 'done'    ? 'rgba(34,197,94,0.05)'
                              : 'transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(255,255,255,0.06)', color, fontSize: 11, fontWeight: 800,
                      }}>
                        {st.status === 'running'
                          ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                          : icon}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: st.status === 'pending' ? 'rgba(255,255,255,0.4)' : '#fff', wordBreak: 'break-word' }}>
                        <span style={{ color: 'rgba(255,255,255,0.35)', marginRight: 5 }}>{i + 1}.</span>
                        {s.label}
                      </span>
                      {st.status === 'failed' && (
                        <button
                          onClick={() => runFrom(s.key)}
                          disabled={running}
                          style={{
                            flexShrink: 0, whiteSpace: 'nowrap',
                            padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(252,165,165,0.4)',
                            background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: 10, fontWeight: 700,
                            cursor: running ? 'default' : 'pointer', fontFamily: 'inherit',
                          }}
                        >↻ Retry</button>
                      )}
                    </div>
                    {st.detail && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginLeft: 26, marginTop: 2 }}>
                        {st.detail}
                      </div>
                    )}
                    {st.error && (
                      <div style={{ fontSize: 10, color: '#fca5a5', marginLeft: 26, marginTop: 2 }}>
                        ⚠ {st.error}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Intro text preview */}
          {introText && (
            <div style={{
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)',
            }}>
              <div style={{ fontSize: 9, color: 'rgba(196,181,253,0.7)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                Generated Intro
              </div>
              <div style={{ fontSize: 12, color: '#fff', lineHeight: 1.5, fontStyle: 'italic' }}>
                "{introText}"
              </div>
            </div>
          )}

          {/* Download button */}
          {allDone && videoRef.current && (
            <button
              onClick={handleDownload}
              style={{
                padding: '11px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#10b981,#059669)',
                color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Download size={14} /> Download Intro MP4
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── PodcastAnalysisFlow ─────────────────────────────────────────────────────

type PodcastVariant = 'adaptive' | 'funny' | 'friendly' | 'clip_take';

interface PodcastFlowProps {
  sel: { emoji: string; label: string; desc: string };
  variant: PodcastVariant;
  onChangeStyle: () => void;
  generating: boolean;
  onGenerate: (args: {
    podcastUrl: string;
    chapters: PodcastChapter[];
    segments: PodcastTranscriptSeg[];
    podcastTitle: string;
    podcastHost: string;
    podcastGuests: string[];
    supporterName: string;
    criticName: string;
    extraFocus: string;
    useGrounding: boolean;
    variant: PodcastVariant;
    // Clip Reaction extras (only used when variant === 'clip_take')
    analystName?: string;
    personInClip?: string;
    actionVerb?: string;
    topicHeading?: string;
  }) => Promise<void>;
}

const fmtSec = (s: number) => {
  const sec = Math.max(0, Math.floor(s));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

const parseTsInput = (txt: string): number | null => {
  const t = txt.trim();
  if (!t) return null;
  const parts = t.split(':').map(p => +p);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
};

const PodcastAnalysisFlow: React.FC<PodcastFlowProps> = ({ sel, variant, onChangeStyle, generating, onGenerate }) => {
  const [phase, setPhase] = useState<'url' | 'cuts' | 'chapters' | 'ready'>('url');
  const [podcastUrl, setPodcastUrl] = useState('');
  const [podcastTitle, setPodcastTitle] = useState('');
  const [supporterName, setSupporterName] = useState('Sam');
  const [criticName, setCriticName] = useState('Alex');
  const [useGrounding, setUseGrounding] = useState(true);
  const [extraFocus, setExtraFocus] = useState('');

  const [segments, setSegments] = useState<PodcastTranscriptSeg[]>([]);
  const [fetching, setFetching] = useState(false);
  const [podcastDescription, setPodcastDescription] = useState('');
  const [podcastUploader, setPodcastUploader] = useState('');
  const [podcastHost, setPodcastHost] = useState('');
  const [podcastGuests, setPodcastGuests] = useState<string[]>([]);
  const [detectingSpeakers, setDetectingSpeakers] = useState(false);

  // Clip Reaction: only the analyst (reacting speaker) name is user-input.
  // Person-in-clip / verb / topic are auto-detected from the transcript by Gemini.
  const isClip = variant === 'clip_take';
  const [analystName, setAnalystName] = useState('Sam');

  const [cuts, setCuts] = useState<PodcastCutRange[]>([]);
  const [cutStartTxt, setCutStartTxt] = useState('');
  const [cutEndTxt, setCutEndTxt] = useState('');

  const [chapters, setChapters] = useState<PodcastChapter[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedIdxs, setSelectedIdxs] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combo + Thumbnail state
  const [comboPairs, setComboPairs] = useState<{ title: string; thumbnailText: string; description: string }[]>([]);
  const [comboLoading, setComboLoading] = useState(false);
  const [comboError, setComboError] = useState<string | null>(null);
  const [selectedCombo, setSelectedCombo] = useState<{ title: string; thumbnailText: string; description: string } | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbStep, setThumbStep] = useState<string>('');

  const toggleChapter = (i: number) => {
    setSelectedIdxs(prev => {
      if (prev.includes(i)) return prev.filter(x => x !== i);
      if (prev.length >= 2) return [prev[1], i]; // drop oldest, keep latest 2
      return [...prev, i];
    });
  };

  const totalSec = segments.length
    ? (segments[segments.length - 1].start + (segments[segments.length - 1].duration || 0))
    : 0;

  // ── 1. Fetch transcript ────────────────────────────────────────────────────
  const handleFetch = async () => {
    if (!podcastUrl.trim()) { toast.error('Podcast URL paste karo pehle'); return; }
    setFetching(true);
    try {
      const r = await fetch('/api/youtube/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: podcastUrl.trim(), language: 'auto' }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Transcript fetch failed (${r.status})`);
      }
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      const segs: PodcastTranscriptSeg[] = (data.segments || data.transcript || []).map((s: any) => ({
        text: s.text ?? '',
        start: typeof s.start === 'number' ? s.start : 0,
        duration: typeof s.duration === 'number' ? s.duration : 0,
      })).filter((s: PodcastTranscriptSeg) => s.text.trim());
      if (!segs.length) throw new Error('Is podcast me transcript available nahi hai');
      setSegments(segs);
      const fetchedTitle = (data.title || '').toString();
      const fetchedDesc = (data.description || '').toString();
      const fetchedUploader = (data.uploader || '').toString();
      setPodcastDescription(fetchedDesc);
      setPodcastUploader(fetchedUploader);
      if (!podcastTitle.trim() && fetchedTitle) setPodcastTitle(fetchedTitle);
      setPhase('cuts');
      toast.success(`✓ Transcript fetched (${segs.length} segments, ${fmtSec(segs[segs.length - 1].start)})`);

      // Background: auto-detect host + guest names (don't block UI)
      const titleForDetect = fetchedTitle || podcastTitle;
      if (titleForDetect || fetchedDesc || fetchedUploader) {
        setDetectingSpeakers(true);
        const transcriptSample = segs.slice(0, 30).map(s => s.text).join(' ');
        detectPodcastSpeakers({
          title: titleForDetect,
          description: fetchedDesc,
          uploader: fetchedUploader,
          transcriptSample,
        }).then(res => {
          setPodcastHost(res.host);
          setPodcastGuests(res.guests);
          if (res.host || res.guests.length) {
            const parts = [res.host && `Host: ${res.host}`, res.guests.length && `Guest: ${res.guests.join(', ')}`].filter(Boolean).join(' · ');
            toast.success(`✓ ${parts}`);
          }
        }).catch(() => { /* silent */ }).finally(() => setDetectingSpeakers(false));
      }
    } catch (e: any) {
      toast.error(e.message || 'Transcript fetch failed');
    } finally {
      setFetching(false);
    }
  };

  // ── 1b. Upload transcript file ─────────────────────────────────────────────
  const handleTranscriptFile = async (file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const text = await file.text();
    let segs: PodcastTranscriptSeg[] = [];

    try {
      if (ext === 'json') {
        // JSON: [{text, start, duration?}] or [{text, offset, duration?}] (yt formats)
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : (parsed.segments || parsed.transcript || []);
        segs = arr.map((s: any, i: number) => ({
          text: String(s.text || s.content || '').trim(),
          start: Number(s.start ?? s.offset ?? i * 5),
          duration: Number(s.duration ?? 5),
        })).filter((s: PodcastTranscriptSeg) => s.text);
      } else if (ext === 'srt') {
        // SRT: parse timing + text
        const blocks = text.trim().split(/\n\n+/);
        segs = blocks.flatMap(block => {
          const lines = block.trim().split('\n');
          const timeLine = lines.find(l => l.includes('-->'));
          if (!timeLine) return [];
          const textLines = lines.filter(l => l.trim() && !l.includes('-->') && !/^\d+$/.test(l.trim()));
          const txt = textLines.join(' ').trim();
          if (!txt) return [];
          const toSec = (t: string) => {
            const [h, m, rest] = t.trim().replace(',', '.').split(':');
            return (+h) * 3600 + (+m) * 60 + parseFloat(rest);
          };
          const [startStr, endStr] = timeLine.split('-->');
          const start = toSec(startStr);
          const end = toSec(endStr);
          return [{ text: txt, start, duration: Math.max(0, end - start) }];
        }).filter(s => s.text);
      } else {
        // Plain text — split by lines/paragraphs, fake timestamps
        const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
        let t = 0;
        segs = lines.map(line => {
          const dur = Math.max(3, line.split(' ').length * 0.4);
          const seg = { text: line, start: t, duration: dur };
          t += dur;
          return seg;
        });
      }
    } catch {
      toast.error('File parse nahi hui — JSON, SRT, ya plain text try karo');
      return;
    }

    if (!segs.length) { toast.error('File mein koi transcript nahi mila'); return; }
    setSegments(segs);
    if (!podcastTitle.trim()) setPodcastTitle(file.name.replace(/\.[^.]+$/, ''));
    setPhase('cuts');
    toast.success(`✓ ${segs.length} segments file se load hue`);
  };

  // ── 2. Cuts management ─────────────────────────────────────────────────────
  const handleAddCut = () => {
    const s = parseTsInput(cutStartTxt);
    const e = parseTsInput(cutEndTxt);
    if (s == null || e == null) { toast.error('Format: M:SS — e.g. 12:30'); return; }
    if (e <= s) { toast.error('End time start ke baad honi chahiye'); return; }
    setCuts(prev => [...prev, { startSec: s, endSec: e }].sort((a, b) => a.startSec - b.startSec));
    setCutStartTxt(''); setCutEndTxt('');
  };

  const handleRemoveCut = (i: number) => setCuts(prev => prev.filter((_, idx) => idx !== i));

  // ── 3. Analyze chapters ────────────────────────────────────────────────────
  const handleAnalyze = async (overrideCuts?: PodcastCutRange[]) => {
    if (!segments.length) return;
    const cutsToUse = overrideCuts !== undefined ? overrideCuts : cuts;
    setAnalyzing(true);
    try {
      const chaps = await analyzePodcastChapters(segments, cutsToUse, podcastTitle || 'this podcast');
      if (!chaps.length) throw new Error('Koi chapters detect nahi hue');
      setChapters(chaps);
      setSelectedIdxs([0]);
      setPhase('chapters');
      toast.success(`✓ ${chaps.length} chapters mile`);
    } catch (e: any) {
      toast.error(e.message || 'Chapter analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  // ── 4. Final generate ──────────────────────────────────────────────────────
  const handleGenerateFinal = async () => {
    if (isClip) {
      if (!analystName.trim()) { toast.error('Speaker (analyst) ka naam dalo'); return; }
      // person-in-clip / verb / topic → auto-detected by Gemini from transcript
    } else if (!supporterName.trim() || !criticName.trim()) {
      toast.error('Dono speaker names dalo');
      return;
    }
    let picked: PodcastChapter[];
    if (selectedIdxs.length === 0) {
      // No chapter selected → use the whole transcript as one synthetic chapter
      if (!segments.length) {
        toast.error('Transcript empty hai');
        return;
      }
      picked = [{
        startSec: 0,
        endSec: totalSec,
        title: `${podcastTitle.trim() || 'Full Podcast'} — Full Episode`,
        startQuote: '',
        endQuote: '',
        summary: 'Full episode — covering all main topics of the podcast.',
      }];
    } else {
      const ordered = [...selectedIdxs].sort((a, b) => a - b);
      picked = ordered.map(i => chapters[i]).filter(Boolean);
      if (!picked.length) {
        toast.error('Selected chapters invalid hain');
        return;
      }
    }
    await onGenerate({
      podcastUrl: podcastUrl.trim(),
      chapters: picked,
      segments,
      podcastTitle: podcastTitle.trim() || 'this podcast',
      podcastHost: podcastHost.trim(),
      podcastGuests: podcastGuests.filter(g => g.trim()).map(g => g.trim()),
      supporterName: supporterName.trim(),
      criticName: criticName.trim(),
      extraFocus: extraFocus.trim(),
      useGrounding,
      variant,
      ...(isClip ? {
        analystName: analystName.trim(),
        // person/verb/topic are auto-detected — left undefined so Gemini extracts
      } : {}),
    });
  };

  // ── Combo + Thumbnail handlers ─────────────────────────────────────────────
  const handleGenerateCombo = async () => {
    if (!segments.length) { setComboError('Transcript load karo pehle'); return; }
    setComboLoading(true);
    setComboError(null);
    try {
      const srcText = segments.map(s => s.text).join(' ').slice(0, 3500);
      const result = await generateTitleTextPair(srcText, 'podcast');
      if (!result.length) { setComboError('Koi combo nahi aaya — dobara try karo'); return; }
      setComboPairs(result);
      setSelectedCombo(result[0]);
    } catch (e: any) {
      setComboError(e?.message || 'Combo generation fail hua');
    } finally {
      setComboLoading(false);
    }
  };

  const handleGenerateThumbnail = async () => {
    if (!selectedCombo) return;
    setThumbLoading(true);
    setThumbUrl(null);
    setThumbStep('Generating…');
    try {
      const srcText = segments.map(s => s.text).join(' ').slice(0, 3500);
      const url = await generateThumbnail(
        selectedCombo.title,
        podcastHost || supporterName || 'Host',
        podcastGuests[0] || criticName || 'Guest',
        undefined,
        selectedCombo.description,
        step => setThumbStep(step),
        'podcast',
        srcText,
        podcastTitle || undefined,
      );
      setThumbUrl(url);
      setThumbStep('');
    } catch (e: any) {
      setThumbStep('');
      setComboError(e?.message || 'Thumbnail generation fail hua');
    } finally {
      setThumbLoading(false);
    }
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Selected style badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
      }}>
        <span style={{ fontSize: 18 }}>{sel.emoji}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>{sel.label}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{sel.desc}</div>
        </div>
        <button
          onClick={onChangeStyle}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
        >Change</button>
      </div>

      {/* Sub-step indicator */}
      <div style={{ display: 'flex', gap: 4, fontSize: 10 }}>
        {(['url', 'cuts', 'chapters', 'ready'] as const).map((p, i) => {
          const labels = ['URL', 'Cuts', 'Chapters', 'Generate'];
          const active = phase === p;
          const passed = ['url', 'cuts', 'chapters', 'ready'].indexOf(phase) > i;
          return (
            <div key={p} style={{
              flex: 1, padding: '5px 4px', borderRadius: 6, textAlign: 'center',
              background: active ? 'rgba(239,68,68,0.15)' : passed ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
              color: active ? '#fca5a5' : passed ? '#86efac' : 'rgba(255,255,255,0.3)',
              border: active ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
              fontWeight: 700,
            }}>
              {i + 1}. {labels[i]}
            </div>
          );
        })}
      </div>

      {/* ── PHASE: URL ── */}
      {phase === 'url' && (
        <>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Podcast URL (YouTube)</div>
            <input
              value={podcastUrl}
              onChange={e => setPodcastUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Podcast Title (optional)</div>
            <input
              value={podcastTitle}
              onChange={e => setPodcastTitle(e.target.value)}
              placeholder="e.g. JRE #2507, Lex Fridman #450..."
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px, 100%), 1fr))', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(86,239,140,0.7)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>👍 Supporter</div>
              <input
                value={supporterName}
                onChange={e => setSupporterName(e.target.value)}
                placeholder="Name"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                  background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                  color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(252,165,165,0.8)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>🗡️ Critic</div>
              <input
                value={criticName}
                onChange={e => setCriticName(e.target.value)}
                placeholder="Name"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                  background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                  color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          <button
            onClick={handleFetch}
            disabled={fetching || !podcastUrl.trim()}
            style={{
              padding: '11px', borderRadius: 12, border: 'none',
              background: fetching ? 'rgba(239,68,68,0.3)' : '#ef4444',
              color: '#fff', fontSize: 13, fontWeight: 800,
              cursor: fetching ? 'default' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: !podcastUrl.trim() ? 0.4 : 1,
            }}
          >
            {fetching
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Transcript fetch ho raha hai…</>
              : <>📥 Fetch Transcript</>}
          </button>

          {/* Transcript file upload — fallback when YouTube fails */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ya</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.srt,.txt"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleTranscriptFile(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '10px', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.55)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            📄 Transcript File Upload (.json / .srt / .txt)
          </button>
        </>
      )}

      {/* ── PHASE: CUTS (skippable) ── */}
      {phase === 'cuts' && (
        <>
          <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#86efac' }}>✓ Transcript Ready</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {segments.length} segments · Total {fmtSec(totalSec)}
            </div>
          </div>

          {/* Detected Host / Guest banner — editable */}
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd' }}>
                🎙️ Podcast People {detectingSpeakers && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginLeft: 4 }} />}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                {detectingSpeakers ? 'Detect ho raha hai…' : 'Auto-detected — fix kar sakte ho'}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9, color: 'rgba(147,197,253,0.7)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Host</div>
                <input
                  value={podcastHost}
                  onChange={e => setPodcastHost(e.target.value)}
                  placeholder="e.g. Lex Fridman"
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 7, boxSizing: 'border-box',
                    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                    color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9, color: 'rgba(147,197,253,0.7)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Guest(s) — comma separated</div>
                <input
                  value={podcastGuests.join(', ')}
                  onChange={e => setPodcastGuests(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="e.g. Elon Musk, Naval Ravikant"
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 7, boxSizing: 'border-box',
                    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                    color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 6, lineHeight: 1.4 }}>
              Conversation me ye naam use honge jab analysts podcast hosts/guest ko refer karenge.
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
            <b style={{ color: '#fde68a' }}>Optional:</b> Ads, intros, ya boring parts cut karo (M:SS format). Kuch nahi dalna ho to direct <b>🧠 Analyze Chapters</b> daba do — pura video use hoga.
            <br />Ya <b style={{ color: '#c4b5fd' }}>Skip Chapter</b> dabake seedha Step 4 par jaa ke full-video deep analysis bana sakte ho.
          </div>

          {/* Add cut */}
          <div style={{ borderRadius: 10, border: '1px dashed rgba(255,255,255,0.15)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%' }}>
              <input
                value={cutStartTxt}
                onChange={e => setCutStartTxt(e.target.value)}
                placeholder="Start (e.g. 2:15)"
                style={{
                  flex: '1 1 120px', minWidth: 0,
                  padding: '8px 10px', borderRadius: 7, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'monospace',
                }}
              />
              <input
                value={cutEndTxt}
                onChange={e => setCutEndTxt(e.target.value)}
                placeholder="End (e.g. 4:30)"
                style={{
                  flex: '1 1 120px', minWidth: 0,
                  padding: '8px 10px', borderRadius: 7, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'monospace',
                }}
              />
              <button
                onClick={handleAddCut}
                style={{
                  flex: '0 0 auto', whiteSpace: 'nowrap',
                  padding: '8px 12px', borderRadius: 7, border: 'none',
                  background: 'rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >+ Cut</button>
            </div>
          </div>

          {/* Cut list */}
          {cuts.length > 0 && (
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden' }}>
              {cuts.map((c, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                  borderBottom: i < cuts.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>#{i + 1}</span>
                  <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, color: '#fca5a5' }}>
                    {fmtSec(c.startSec)} → {fmtSec(c.endSec)}
                    <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 6 }}>
                      ({fmtSec(c.endSec - c.startSec)} cut)
                    </span>
                  </span>
                  <button
                    onClick={() => handleRemoveCut(i)}
                    style={{
                      background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                      cursor: 'pointer', fontSize: 14, padding: 0,
                    }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px, 100%), 1fr))', gap: 8 }}>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              style={{
                padding: '11px', borderRadius: 10, border: 'none',
                background: analyzing ? 'rgba(239,68,68,0.3)' : '#ef4444',
                color: '#fff', fontSize: 13, fontWeight: 800,
                cursor: analyzing ? 'default' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {analyzing
                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Gemini…</>
                : <>🧠 Analyze Chapters</>}
            </button>
            <button
              onClick={() => { setChapters([]); setSelectedIdxs([]); setPhase('ready'); }}
              disabled={analyzing}
              style={{
                padding: '11px', borderRadius: 10, border: '1px solid rgba(168,85,247,0.3)',
                background: 'rgba(168,85,247,0.1)', color: '#c4b5fd', fontSize: 12, fontWeight: 700,
                cursor: analyzing ? 'default' : 'pointer', fontFamily: 'inherit',
              }}
            >⏩ Skip Chapter → Step 4 (Full Video)</button>
          </div>
        </>
      )}

      {/* ── PHASE: CHAPTERS (selection only) ── */}
      {phase === 'chapters' && (
        <>
          <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd' }}>📚 {chapters.length} Chapters Detected</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              Ek ya do chapter select karo ({selectedIdxs.length}/2 selected) — 2 chunte ho to combined analysis banegi.
              <br />Koi select nahi karoge to <b style={{ color: '#c4b5fd' }}>puri transcript</b> par deep analysis banegi.
            </div>
          </div>

          {/* Chapter table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
            {chapters.map((c, i) => {
              const selOrder = selectedIdxs.indexOf(i); // -1 / 0 / 1
              const isSel = selOrder !== -1;
              const dur = c.endSec - c.startSec;
              return (
                <div
                  key={i}
                  onClick={() => toggleChapter(i)}
                  style={{
                    padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                    border: `1.5px solid ${isSel ? '#a855f7' : 'rgba(255,255,255,0.07)'}`,
                    background: isSel ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.025)',
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: isSel ? '#a855f7' : 'rgba(255,255,255,0.08)',
                      color: isSel ? '#fff' : 'rgba(255,255,255,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800,
                    }}>{isSel ? `✓${selOrder + 1}` : i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#fff', wordBreak: 'break-word' }}>{c.title}</div>
                    <span style={{ flexShrink: 0, fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                      {fmtSec(dur)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.55)', paddingLeft: 30 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ color: '#86efac', fontFamily: 'monospace', fontWeight: 700, flexShrink: 0 }}>
                        START {fmtSec(c.startSec)}
                      </span>
                      <span style={{ flex: 1, fontStyle: 'italic' }}>{c.startQuote || c.summary}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ color: '#fca5a5', fontFamily: 'monospace', fontWeight: 700, flexShrink: 0 }}>
                        END {'  '}{fmtSec(c.endSec)}
                      </span>
                      <span style={{ flex: 1, fontStyle: 'italic' }}>{c.endQuote || c.summary}</span>
                    </div>
                    {c.summary && (
                      <div style={{ marginTop: 3, color: 'rgba(255,255,255,0.4)' }}>↳ {c.summary}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Nav buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              onClick={() => setPhase('cuts')}
              style={{
                flex: '0 0 auto', whiteSpace: 'nowrap',
                padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >← Cuts</button>
            <button
              onClick={() => setPhase('ready')}
              style={{
                flex: '1 1 200px', minWidth: 0,
                padding: '13px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                color: '#fff', fontSize: 13, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {selectedIdxs.length === 0
                ? 'Next → Use Full Transcript'
                : selectedIdxs.length === 2
                  ? 'Next → Generate (2 Chapters)'
                  : 'Next → Generate Script'}
            </button>
          </div>
        </>
      )}

      {/* ── PHASE: READY (Step 4 — Generate Script) ── */}
      {phase === 'ready' && (
        <>
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd' }}>
              ✨ Step 4 — Generate Script
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 3, lineHeight: 1.45 }}>
              {selectedIdxs.length === 0
                ? '0 chapters selected → puri transcript par deep analysis banegi'
                : selectedIdxs.length === 2
                  ? `${selectedIdxs.length} chapters selected — combined deep analysis banegi`
                  : '1 chapter selected — deep analysis script banegi'}
              <br />Generate ke baad Script Editor khulega — wahaan review/edit karke aap Phone Studio open kar sakte ho.
            </div>
          </div>

          {/* Selected chapter summary (or full-transcript card if no selection) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selectedIdxs.length === 0 ? (
              <div style={{
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)',
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    background: '#a855f7', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12,
                  }}>∞</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Full Episode (whole transcript)</div>
                  <span style={{ flexShrink: 0, fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)' }}>
                    {fmtSec(0)}–{fmtSec(totalSec)}
                  </span>
                </div>
              </div>
            ) : (
              [...selectedIdxs].sort((a, b) => a - b).map((idx, n) => {
                const c = chapters[idx];
                if (!c) return null;
                return (
                  <div key={idx} style={{
                    padding: '8px 10px', borderRadius: 8,
                    background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)',
                  }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        background: '#a855f7', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800,
                      }}>{n + 1}</div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                      <span style={{ flexShrink: 0, fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)' }}>
                        {fmtSec(c.startSec)}–{fmtSec(c.endSec)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Speakers banner (or Clip Reaction single-speaker form) */}
          {isClip ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>🎥 Clip Reaction — 1 Speaker</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.45 }}>
                  Ek speaker clip ko introduce karega → apna take dega → takeaways. Total ~5 min.
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, color: 'rgba(168,85,247,0.85)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>🎙️ Analyst (speaker)</div>
                <input
                  value={analystName}
                  onChange={e => setAnalystName(e.target.value)}
                  placeholder="e.g. Sam"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              {/* Auto-detect notice — person / verb / topic come from Gemini's transcript pass */}
              <div style={{
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#86efac', display: 'flex', alignItems: 'center', gap: 5 }}>
                  ✨ Auto-detect ON
                  {detectingSpeakers && <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 3, lineHeight: 1.45 }}>
                  Gemini transcript se khud nikalega: <b style={{ color: '#fff' }}>kaun bol raha hai</b>, <b style={{ color: '#fff' }}>kya kar raha hai</b> (talks about / explains / etc.), aur <b style={{ color: '#fff' }}>topic</b> — koi field manually bharne ki zaroorat nahi.
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 5, fontStyle: 'italic' }}>
                  Intro line ban jayegi: <span style={{ color: 'rgba(255,255,255,0.6)' }}>"In this clip &lt;person&gt; &lt;verb&gt; about &lt;topic&gt;. Let's watch — then I'll give my take."</span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{
                flex: 1, padding: '7px 10px', borderRadius: 8,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
              }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>SUPPORTER</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#86efac' }}>{supporterName}</div>
              </div>
              <div style={{
                flex: 1, padding: '7px 10px', borderRadius: 8,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>CRITIC</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>{criticName}</div>
              </div>
            </div>
          )}

          {/* Host/Guest mini-summary (so user sees what'll be referenced) */}
          {(podcastHost || podcastGuests.length > 0) && (
            <div style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>🎙️ Podcast People (analysts inhe naam se refer karenge)</div>
              <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 2 }}>
                {podcastHost && <><b>Host:</b> {podcastHost}</>}
                {podcastHost && podcastGuests.length > 0 && ' · '}
                {podcastGuests.length > 0 && <><b>Guest:</b> {podcastGuests.join(', ')}</>}
              </div>
            </div>
          )}

          {/* Extra focus */}
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Extra Focus (optional)
            </div>
            <input
              value={extraFocus}
              onChange={e => setExtraFocus(e.target.value)}
              placeholder="e.g. Focus on the ethical implications, or the data being cited"
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Optional Intro Video — generated from SELECTED chapters only,
              so the topic in the intro line matches what the user picked. */}
          <IntroFlow
            segments={segments}
            podcastTitle={podcastTitle}
            podcastHost={podcastHost}
            podcastGuests={podcastGuests}
            selectedRanges={
              selectedIdxs.length === 0
                ? [{ startSec: 0, endSec: totalSec }]
                : [...selectedIdxs].sort((a, b) => a - b)
                    .map(i => chapters[i])
                    .filter(Boolean)
                    .map(c => ({ startSec: c.startSec, endSec: c.endSec }))
            }
            selectionLabel={
              selectedIdxs.length === 0
                ? 'full episode'
                : selectedIdxs.length === 1
                  ? '1 selected chapter'
                  : `${selectedIdxs.length} selected chapters`
            }
          />

          {/* ── Combo + Thumbnail card ── */}
          <div style={{ borderRadius: 12, border: '1px solid rgba(234,179,8,0.25)', background: 'rgba(234,179,8,0.05)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#fde68a', letterSpacing: '0.04em' }}>⚡ Title + Thumbnail Combo</div>
              <button
                onClick={handleGenerateCombo}
                disabled={comboLoading || !segments.length}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 8, border: 'none',
                  background: comboLoading ? 'rgba(234,179,8,0.2)' : '#ca8a04',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  cursor: comboLoading ? 'default' : 'pointer', fontFamily: 'inherit',
                  opacity: !segments.length ? 0.4 : 1,
                }}
              >
                {comboLoading
                  ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                  : comboPairs.length > 0 ? '↺ Regenerate' : '⚡ Generate Combo'}
              </button>
            </div>

            {comboError && <div style={{ fontSize: 11, color: '#fca5a5' }}>{comboError}</div>}

            {comboPairs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {comboPairs.map((pair, idx) => {
                  const isSel = selectedCombo?.title === pair.title;
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedCombo(pair)}
                      style={{
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                        border: `1.5px solid ${isSel ? '#ca8a04' : 'rgba(255,255,255,0.08)'}`,
                        background: isSel ? 'rgba(234,179,8,0.08)' : 'rgba(255,255,255,0.02)',
                        transition: 'all 0.12s',
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{pair.title}</div>
                      <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 700, letterSpacing: '0.05em' }}>{pair.thumbnailText}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedCombo && (
              <div style={{ borderTop: '1px solid rgba(234,179,8,0.15)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {thumbUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <img src={thumbUrl} alt="thumbnail" style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a
                        href={thumbUrl}
                        download="thumbnail.jpg"
                        style={{ flex: 1, textAlign: 'center', padding: '7px', borderRadius: 8, background: '#ca8a04', color: '#fff', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}
                      >⬇ Download</a>
                      <button
                        onClick={handleGenerateThumbnail}
                        disabled={thumbLoading}
                        style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.05)', color: '#fde68a', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                      >↺ Regenerate</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleGenerateThumbnail}
                    disabled={thumbLoading}
                    style={{
                      padding: '10px', borderRadius: 10, border: 'none',
                      background: thumbLoading ? 'rgba(234,179,8,0.3)' : 'linear-gradient(135deg,#ca8a04,#d97706)',
                      color: '#fff', fontSize: 12, fontWeight: 800,
                      cursor: thumbLoading ? 'default' : 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    {thumbLoading
                      ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> {thumbStep || 'Generating Thumbnail…'}</>
                      : <>🖼 Generate Thumbnail</>}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Grounding toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', cursor: 'pointer' }}>
            <div
              onClick={() => setUseGrounding(p => !p)}
              style={{
                width: 36, height: 20, borderRadius: 50, position: 'relative', cursor: 'pointer',
                background: useGrounding ? '#10b981' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                left: useGrounding ? 18 : 2,
              }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>🔍 Google Search Grounding</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>Latest facts, data, narratives include karega</div>
            </div>
          </label>

          {/* Generate / Done buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              onClick={() => setPhase('chapters')}
              disabled={generating}
              style={{
                flex: '0 0 auto', whiteSpace: 'nowrap',
                padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600,
                cursor: generating ? 'default' : 'pointer', fontFamily: 'inherit',
              }}
            >← Chapters</button>
            <button
              onClick={handleGenerateFinal}
              disabled={generating}
              style={{
                flex: '1 1 200px', minWidth: 0,
                padding: '13px', borderRadius: 12, border: 'none',
                background: generating ? 'rgba(168,85,247,0.4)' : 'linear-gradient(135deg,#a855f7,#7c3aed)',
                color: '#fff', fontSize: 13, fontWeight: 800,
                cursor: generating ? 'default' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {generating
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating Deep Analysis…</>
                : selectedIdxs.length === 0
                  ? <>✅ Generate Full-Transcript Script → Script Editor</>
                  : <>✅ Generate Script → Script Editor</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── ScriptGeneratorPanel ─────────────────────────────────────────────────────

interface GenPanelProps {
  genStep: 1 | 2; setGenStep: (s: 1 | 2) => void;
  genStyle: string; setGenStyle: (s: string) => void;
  genTopic: string; setGenTopic: (s: string) => void;
  genYtMode: boolean; setGenYtMode: (b: boolean) => void;
  genYtUrl: string; setGenYtUrl: (s: string) => void;
  genTurns: number; setGenTurns: (n: number) => void;
  genAutoTurns: boolean; setGenAutoTurns: (b: boolean) => void;
  phones: PhoneConfig[];
  generating: boolean;
  onGenerate: () => void;
  onPodcastGenerate: (args: {
    podcastUrl: string;
    chapters: PodcastChapter[];
    segments: PodcastTranscriptSeg[];
    podcastTitle: string;
    podcastHost: string;
    podcastGuests: string[];
    supporterName: string;
    criticName: string;
    extraFocus: string;
    useGrounding: boolean;
    variant: PodcastVariant;
    analystName?: string;
    personInClip?: string;
    actionVerb?: string;
    topicHeading?: string;
  }) => Promise<void>;
}

const ScriptGeneratorPanel: React.FC<GenPanelProps> = ({
  genStep, setGenStep, genStyle, setGenStyle,
  genTopic, setGenTopic, genYtMode, setGenYtMode,
  genYtUrl, setGenYtUrl, genTurns, setGenTurns,
  genAutoTurns, setGenAutoTurns,
  phones, generating, onGenerate, onPodcastGenerate,
}) => {
  const sel = CONVO_STYLES.find(s => s.id === genStyle)!;
  const isPodcastAnalysis = genStyle === 'podcast_analysis'
    || genStyle === 'podcast_analysis_funny'
    || genStyle === 'podcast_analysis_friendly'
    || genStyle === 'clip_reaction';

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: 14,
        paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >

      {/* ── Step indicator ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {([1, 2] as const).map(n => (
          <React.Fragment key={n}>
            <button
              onClick={() => setGenStep(n)}
              style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none',
                background: genStep === n ? '#ef4444' : 'rgba(255,255,255,0.08)',
                color: genStep === n ? '#fff' : 'rgba(255,255,255,0.4)',
                fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                flexShrink: 0,
              }}
            >{n}</button>
            <span style={{ fontSize: 11, color: genStep === n ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: genStep === n ? 700 : 400 }}>
              {n === 1 ? 'Style choose karo' : 'Topic / Source'}
            </span>
            {n < 2 && <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />}
          </React.Fragment>
        ))}
      </div>

      {/* ── Step 1: Style selection ── */}
      {genStep === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>
            Conversation style select karo:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {CONVO_STYLES.map(style => {
              const isSel = genStyle === style.id;
              return (
                <button
                  key={style.id}
                  onClick={() => { setGenStyle(style.id); setGenStep(2); }}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                    border: `1.5px solid ${isSel ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
                    background: isSel ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.025)',
                    display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all 0.12s', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{style.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isSel ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                      {style.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                      {style.desc}
                    </div>
                  </div>
                  {isSel && <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={11} />
                  </div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 2: Podcast Analysis flow (special) ── */}
      {genStep === 2 && isPodcastAnalysis && (
        <PodcastAnalysisFlow
          sel={sel}
          variant={
            genStyle === 'podcast_analysis_funny' ? 'funny'
              : genStyle === 'podcast_analysis_friendly' ? 'friendly'
                : genStyle === 'clip_reaction' ? 'clip_take'
                  : 'adaptive'
          }
          onChangeStyle={() => setGenStep(1)}
          onGenerate={onPodcastGenerate}
          generating={generating}
        />
      )}

      {/* ── Step 2: Topic + YouTube ── */}
      {genStep === 2 && !isPodcastAnalysis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Selected style badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          }}>
            <span style={{ fontSize: 18 }}>{sel.emoji}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>{sel.label}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{sel.desc}</div>
            </div>
            <button
              onClick={() => setGenStep(1)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
            >Change</button>
          </div>

          {/* Speakers display */}
          {phones.length >= 2 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {phones.slice(0, 2).map(p => (
                <div key={p.id} style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8,
                  background: p.color + '14', border: `1px solid ${p.color}30`,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{p.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* YouTube toggle */}
          <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <button
              onClick={() => setGenYtMode(!genYtMode)}
              style={{
                width: '100%', padding: '10px 12px', background: genYtMode ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'inherit', borderBottom: genYtMode ? '1px solid rgba(239,68,68,0.2)' : 'none',
              }}
            >
              <span style={{ fontSize: 18 }}>▶️</span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: genYtMode ? '#fca5a5' : 'rgba(255,255,255,0.7)' }}>
                  YouTube Video se Generate
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                  Gemini transcript analyze karke discussion points nikaalega
                </div>
              </div>
              <div style={{
                width: 36, height: 20, borderRadius: 50, position: 'relative',
                background: genYtMode ? '#ef4444' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s',
              }}>
                <div style={{
                  position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s', left: genYtMode ? 18 : 2,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }} />
              </div>
            </button>
            {genYtMode && (
              <div style={{ padding: '10px 12px' }}>
                <input
                  value={genYtUrl}
                  onChange={e => setGenYtUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>
            )}
          </div>

          {/* Topic input */}
          {!genYtMode && (
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Topic / Question
              </div>
              <textarea
                value={genTopic}
                onChange={e => setGenTopic(e.target.value)}
                placeholder={`e.g. "Is social media making people less intelligent?" or "AI jobs lega ya nayi jobs create karega?"`}
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit',
                  resize: 'vertical', lineHeight: 1.5,
                }}
              />
            </div>
          )}
          {genYtMode && (
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Extra Focus (optional)
              </div>
              <input
                value={genTopic}
                onChange={e => setGenTopic(e.target.value)}
                placeholder="e.g. Focus on claims about diet, or the part about AI"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
          )}

          {/* Turns count — with Auto toggle */}
          <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                Conversation Length
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: genAutoTurns ? '#86efac' : '#fff' }}>
                {genAutoTurns ? 'Auto · 3-15 min' : `${genTurns} turns (~${Math.round(genTurns * 12)}s)`}
              </span>
            </div>

            {/* Auto toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
              <div
                onClick={() => setGenAutoTurns(!genAutoTurns)}
                style={{
                  width: 34, height: 18, borderRadius: 50, position: 'relative', cursor: 'pointer',
                  background: genAutoTurns ? '#10b981' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  left: genAutoTurns ? 18 : 2,
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>🪄 Auto Length</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                  Gemini topic depth dekh ke turns decide karega (3-15 min target)
                </div>
              </div>
            </label>

            {!genAutoTurns && (
              <input
                type="range" min={6} max={60} step={2} value={genTurns}
                onChange={e => setGenTurns(+e.target.value)}
                style={{ width: '100%', accentColor: '#ef4444', marginTop: 6 }}
              />
            )}
          </div>

          {/* Generate button */}
          <button
            onClick={onGenerate}
            disabled={generating || (!genTopic.trim() && !genYtMode) || (genYtMode && !genYtUrl.trim())}
            style={{
              padding: '13px', borderRadius: 12, border: 'none',
              background: generating ? 'rgba(239,68,68,0.3)' : '#ef4444',
              color: '#fff', fontSize: 14, fontWeight: 800,
              cursor: generating ? 'default' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: (!genTopic.trim() && !genYtMode) || (genYtMode && !genYtUrl.trim()) ? 0.4 : 1,
            }}
          >
            {generating ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Generate ho raha hai…
              </>
            ) : (
              <>✨ Script Generate Karo</>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  mainScript: DebateSegment[];
  /** Embedded mode: render ONLY the script-generator UI (used inside DebateInput's "New Phone Studio" tab). */
  embedded?: boolean;
  /** Fired when the embedded generator finishes — caller commits the script (and routes to PHONE_STUDIO). */
  onGeneratorComplete?: (turns: ScriptTurn[], phones: PhoneConfig[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PhoneConvoStudio: React.FC<Props> = ({ mainScript, embedded = false, onGeneratorComplete }) => {
  const [phones, setPhones]   = useState<PhoneConfig[]>([]);
  const [script, setScript]   = useState<ScriptTurn[]>([]);
  const [bg, setBg]           = useState('#f0f4f8');
  const [bgImageUrl, setBgImageUrlRaw] = useState<string | null>(null);
  // Always revoke the previous blob URL before swapping in a new one.
  // Without this, every uploaded image leaks until tab close (MBs each).
  const setBgImageUrl = useCallback((next: string | null) => {
    setBgImageUrlRaw(prev => {
      if (prev && prev.startsWith('blob:') && prev !== next) {
        try { URL.revokeObjectURL(prev); } catch {}
      }
      return next;
    });
  }, []);
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [subtitleBg, setSubtitleBg]           = useState<'dark' | 'light' | 'none'>('dark');
  const [subtitleSize, setSubtitleSize]       = useState(1.6);
  const [startTime, setStartTime]             = useState('09:41');
  const [spacing, setSpacing]   = useState(50);
  const [scale, setScale]       = useState(100);
  const [tab, setTab] = useState<'visual' | 'export'>('visual');
  const [visualSub, setVisualSub] = useState<'phones' | 'background' | 'subtitle'>('phones');

  // Script generator state
  const [genStyle, setGenStyle] = useState('podcast');
  const [genTopic, setGenTopic] = useState('');
  const [genYtMode, setGenYtMode] = useState(false);
  const [genYtUrl, setGenYtUrl]   = useState('');
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState<1 | 2>(1);
  const [genTurns, setGenTurns] = useState(14);
  const [genAutoTurns, setGenAutoTurns] = useState(true);

  // Canvas + renderer
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const [isPlaying, setIsPlaying]   = useState(false);
  const isPlayingRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Audio playback
  const audioCtxRef    = useRef<AudioContext | null>(null);
  // Track every scheduled BufferSourceNode so we can stop them immediately
  const audioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  // Pre-fetched raw ArrayBuffer cache (keyed by URL) so play starts instantly
  const audioCacheRef  = useRef<Map<string, ArrayBuffer>>(new Map());
  // AnalyserNode that taps the playback chain so the renderer can drive
  // its z-pulse / VU meter from the actual audio.
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const levelLoopRef   = useRef<number | null>(null);
  const smoothedLevelRef = useRef(0);

  // Visual toggles (persist on the renderer state)
  const [vuMeterOn, setVuMeterOn] = useState(false);
  const [phoneZPulseOverride, setPhoneZPulseOverride] = useState<boolean | null>(null);

  // Chapters
  const [chapters, setChapters] = useState<{ startMs: number; endMs: number; title: string }[]>([]);
  const [chaptersGenerating, setChaptersGenerating] = useState(false);

  // Export
  const [exporting, setExporting]       = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');

  const totalDuration = script.reduce((a, b) => a + b.durationMs, 0);

  // ── Sync main app script → PhoneConvoStudio ───────────────────────────────

  useEffect(() => {
    if (!mainScript.length) return;

    // Exclude NARRATOR from phone list
    const uniqueSpeakers = Array.from(
      new Set<string>(mainScript.map(s => s.speaker).filter(sp => sp !== 'NARRATOR'))
    );

    setPhones(prev => buildPhonesFromSpeakers(uniqueSpeakers, prev));

    const turns: ScriptTurn[] = mainScript.map(seg => {
      const isNarrator = seg.speaker === 'NARRATOR';
      const wt = seg.wordTimings;
      // Priority: real STT timings → audio.duration → text estimate (last resort)
      const realDurMs = wt?.length
        ? Math.round(wt[wt.length - 1].end * 1000)   // last word's end = actual audio length
        : seg.duration
          ? Math.round(seg.duration * 1000)           // from HTML Audio element
          : null;
      return {
        id: seg.id,
        phoneId: isNarrator ? 'narrator' : speakerToPhoneId(seg.speaker),
        text: seg.text,
        isNarrator,
        durationMs: isNarrator ? 4000 : (realDurMs ?? Math.max(2500, seg.text.length * 75)),
        audioUrl: isNarrator ? undefined : seg.audioUrl,
        // Use real STT timings directly — no estimation when real data exists
        wordTimings: isNarrator ? undefined : (wt?.length
          ? wt.map(w => ({ word: w.word, startTime: w.start, endTime: w.end }))
          : undefined),
      };
    });
    setScript(turns);
  }, [mainScript]);

  const buildState = useCallback((): StudioState => ({
    phones,
    script,
    background: { type: 'color', value: bg },
    bgImageUrl: bgImageUrl ?? undefined,
    deviceSpacing: spacing,
    deviceScale: scale,
    startTime,
    subtitleConfig: {
      enabled: subtitleEnabled,
      size: subtitleSize,
      background: subtitleBg,
      textColor: '#ffffff',
    },
    vuMeter: vuMeterOn,
    // Default: z-pulse on for 1 speaker, off for 2+. User can override.
    phoneZPulse: phoneZPulseOverride ?? (phones.length === 1),
  }), [phones, script, bg, bgImageUrl, spacing, scale, startTime, subtitleEnabled, subtitleBg, subtitleSize, vuMeterOn, phoneZPulseOverride]);

  // Init canvas renderer
  useEffect(() => {
    if (!canvasRef.current) return;
    const r = new CanvasRenderer(canvasRef.current, buildState());
    r.onTimeUpdate = t => setCurrentTime(t);
    r.onComplete   = () => {
      setIsPlaying(false);
      // Stop all scheduled sources when video naturally ends
      audioSourcesRef.current.forEach(s => { try { s.stop(0); } catch {} });
      audioSourcesRef.current = [];
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
    rendererRef.current = r;
    r.drawFrame();

    // Cleanup on unmount: stop the render loop AND any active audio.
    // Without this, navigating away from Phone Studio while playing leaks
    // the AudioContext (browsers cap to ~6 — eventually new AudioContext() throws)
    // and keeps voices playing in the background.
    return () => {
      try { r.pause(); } catch {}
      try { r.stop(); } catch {}
      audioSourcesRef.current.forEach(s => { try { s.stop(0); } catch {} });
      audioSourcesRef.current = [];
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch {}
        audioCtxRef.current = null;
      }
      rendererRef.current = null;
      // Revoke any pending background-image blob URL
      setBgImageUrlRaw(prev => {
        if (prev && prev.startsWith('blob:')) {
          try { URL.revokeObjectURL(prev); } catch {}
        }
        return null;
      });
    };
  }, []);

  // Update renderer state
  useEffect(() => {
    rendererRef.current?.updateState(buildState());
  }, [buildState]);

  // ── Pre-fetch audio into cache whenever script changes ────────────────────
  useEffect(() => {
    const urls = script.map(t => t.audioUrl).filter((u): u is string => !!u);
    urls.forEach(url => {
      if (audioCacheRef.current.has(url)) return; // already cached
      fetch(url)
        .then(r => r.arrayBuffer())
        .then(ab => { audioCacheRef.current.set(url, ab); })
        .catch(() => {});
    });
  }, [script]);

  // ── Keep isPlayingRef in sync (for use inside async callbacks) ───────────
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // ── Shared audio kill helper ───────────────────────────────────────────────
  const killAudio = useCallback(() => {
    audioSourcesRef.current.forEach(s => { try { s.stop(0); } catch {} });
    audioSourcesRef.current = [];
    if (levelLoopRef.current !== null) {
      cancelAnimationFrame(levelLoopRef.current);
      levelLoopRef.current = null;
    }
    analyserRef.current = null;
    smoothedLevelRef.current = 0;
    if (rendererRef.current) rendererRef.current.audioLevel = 0;
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
  }, []);

  // ── Schedule audio from a given timeline position ─────────────────────────
  // Creates a fresh AudioContext, decodes all audio (from cache), and
  // schedules each turn at the correct offset. Returns the new context.
  const scheduleAudioFrom = useCallback(async (startMs: number): Promise<AudioContext | null> => {
    killAudio();
    if (!script.some(t => t.audioUrl)) return null;

    const actx = new AudioContext();
    audioCtxRef.current = actx;
    const analyser = actx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    analyser.connect(actx.destination);
    analyserRef.current = analyser;

    const buffers = await Promise.all(
      script.map(t => {
        if (!t.audioUrl) return Promise.resolve(null);
        const cached = audioCacheRef.current.get(t.audioUrl);
        const abPromise = cached
          ? Promise.resolve(cached.slice(0))
          : fetch(t.audioUrl).then(res => res.arrayBuffer());
        return abPromise.then(ab => actx.decodeAudioData(ab)).catch(() => null);
      })
    );
    // Cancelled by another call OR component unmounted
    if (audioCtxRef.current !== actx) return null;

    // ── Build actual durations from decoded buffers ───────────────────────
    // Use real buf.duration where audio exists — fixes visual/audio desync
    const actualDurations = buffers.map((buf, i) =>
      buf ? Math.round(buf.duration * 1000) : script[i].durationMs
    );

    // Re-check cancellation right before mutating React state — between the
    // await and here, the user could have seeked again or unmounted the
    // component (cleanup nulls audioCtxRef). Without this guard, a superseded
    // decode would clobber word timings on a now-different script.
    if (audioCtxRef.current !== actx) return null;

    // If any duration differs from estimate → update script state + renderer
    const hasMismatch = actualDurations.some((d, i) => d !== script[i].durationMs);
    if (hasMismatch) {
      setScript(prev => prev.map((t, i) => {
        const newDur = actualDurations[i];
        if (newDur === t.durationMs) return t;
        return {
          ...t,
          durationMs: newDur,
          wordTimings: t.wordTimings
            ? estimateWordTimings(t.text, newDur / 1000)
            : undefined,
        };
      }));
    }

    // Final guard before scheduling on the AudioContext — if cancelled,
    // actx may already be closing; creating BufferSourceNodes on a closed
    // context throws.
    if (audioCtxRef.current !== actx) return null;

    let elapsed = 0;
    buffers.forEach((buf, i) => {
      const turnStartMs = elapsed;
      const turnEndMs   = elapsed + actualDurations[i];   // ← actual, not estimate
      elapsed = turnEndMs;

      if (!buf) return;
      if (turnEndMs <= startMs) return; // turn already passed

      const audioOffsetSec = Math.max(0, (startMs - turnStartMs) / 1000);
      const scheduleAtSec  = actx.currentTime + Math.max(0, (turnStartMs - startMs) / 1000);

      if (audioOffsetSec >= buf.duration) return;

      const src = actx.createBufferSource();
      src.buffer = buf;
      src.connect(analyser);
      src.start(scheduleAtSec, audioOffsetSec);
      audioSourcesRef.current.push(src);
    });

    // Start the level-meter loop. Reads RMS from the analyser, smooths it,
    // writes to the renderer's audioLevel. Stops via cancelAnimationFrame on
    // killAudio or when the AudioContext is closed.
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      const a = analyserRef.current;
      const r = rendererRef.current;
      if (!a || !r || audioCtxRef.current !== actx) {
        levelLoopRef.current = null;
        return;
      }
      a.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      const raw = Math.min(1, Math.pow(rms * 4.5, 0.75));
      const cur = smoothedLevelRef.current;
      const alpha = raw > cur ? 0.55 : 0.18;
      const next = cur + (raw - cur) * alpha;
      smoothedLevelRef.current = next;
      r.audioLevel = next;
      levelLoopRef.current = requestAnimationFrame(tick);
    };
    levelLoopRef.current = requestAnimationFrame(tick);

    return actx;
  }, [script, killAudio]);

  // ── Playback ──────────────────────────────────────────────────────────────

  const togglePlay = async () => {
    const r = rendererRef.current;
    if (!r) return;

    if (isPlayingRef.current) {
      r.stop();
      setIsPlaying(false);
      killAudio();
      return;
    }

    const startMs = r.currentTime;
    setIsPlaying(true);
    // Decode buffers FIRST, then start renderer — both begin simultaneously
    await scheduleAudioFrom(startMs);
    r.play();
  };

  // Visual-only seek (called continuously while dragging)
  const seek = (ms: number) => {
    rendererRef.current?.seek(ms);
    setCurrentTime(ms);
  };

  // Full seek: update visual + restart audio from new position (called on mouse-up)
  const seekWithAudio = useCallback(async (ms: number) => {
    const r = rendererRef.current;
    r?.seek(ms);
    setCurrentTime(ms);
    if (isPlayingRef.current) {
      r?.pause();                     // stop loop while audio decodes
      await scheduleAudioFrom(ms);    // decode buffers first
      r?.play();                      // restart loop — now in sync with audio
    }
  }, [scheduleAudioFrom]);

  // ── Phone helpers ─────────────────────────────────────────────────────────

  const updatePhone = (id: string, ch: Partial<PhoneConfig>) =>
    setPhones(prev => prev.map(p => p.id === id ? { ...p, ...ch } : p));

  // ── Timeline ──────────────────────────────────────────────────────────────

  let timelineElapsed = 0;
  const timelineItems = script.map((turn, idx) => {
    const start = timelineElapsed;
    const end = timelineElapsed + turn.durationMs;
    timelineElapsed = end;
    const phone = phones.find(p => p.id === turn.phoneId);
    return { ...turn, start, end, idx, phoneName: phone?.name ?? '?', color: phone?.color ?? '#888' };
  });
  const activeTurn = timelineItems.find(it => currentTime >= it.start && currentTime < it.end);

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!script.length) { toast.error('Script empty hai'); return; }

    if (!('VideoEncoder' in window)) {
      toast.error('Yeh browser WebCodecs support nahi karta. Chrome ya Edge use karo.');
      return;
    }

    const W = 1920, H = 1080, FPS = 30;
    const totalMs = script.reduce((s, t) => s + t.durationMs, 0);
    const totalSec = totalMs / 1000;
    // Stream to disk for anything > 3 min — keeps RAM flat regardless of duration
    const isLongVideo = totalSec > 3 * 60;

    setExporting(true); setExportProgress(0); setExportStatus('Audio decode ho raha hai…');

    let fileStream: any = null;

    try {
      // ── 0. For long videos: get file save handle BEFORE decoding ──────────
      if (isLongVideo && 'showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: `phone-studio-${Date.now()}.mp4`,
            types: [{ description: 'MP4 Video', accept: { 'video/mp4': ['.mp4'] } }],
          });
          fileStream = await fileHandle.createWritable();
          toast.info('Long video → disk pe stream ho raha hai (RAM save hoga)');
        } catch {
          // User cancelled picker or browser doesn't support — fallback to in-memory
          fileStream = null;
        }
      }

      // ── 1. Decode audio serially and mix into one Float32Array ────────────
      // Force 24kHz AudioContext — TTS voices are mono ~22kHz max, this halves
      // the mixed buffer size vs 48kHz default (huge memory win on long exports).
      // Decode one turn at a time so peak memory = mixed + 1 decoded chunk
      // instead of mixed + ALL-decoded (which OOM-crashed on long exports).
      const TARGET_SR = 24_000;
      let actx: AudioContext;
      try {
        actx = new AudioContext({ sampleRate: TARGET_SR });
      } catch {
        // Older Safari doesn't allow setting sampleRate — fall back to default
        actx = new AudioContext();
      }
      const sampleRate = actx.sampleRate;
      const totalSamples = Math.ceil(totalSec * sampleRate);

      // Guard: refuse to attempt > ~1.5 GB mixed buffer (would OOM the tab)
      const bufferBytes = totalSamples * 4;
      if (bufferBytes > 1_500_000_000) {
        throw new Error(`Video bahut lambi hai (${Math.round(totalSec / 60)} min) — RAM me fit nahi hogi. Split karke export karo.`);
      }

      const mixed = new Float32Array(totalSamples);
      let offsetMs = 0;
      let decodedCount = 0;
      const totalAudioTurns = script.filter(t => t.audioUrl).length || 1;

      for (let i = 0; i < script.length; i++) {
        const t = script[i];
        if (t.audioUrl) {
          try {
            const ab = await (await fetch(t.audioUrl)).arrayBuffer();
            const buf = await actx.decodeAudioData(ab);
            const startSample = Math.floor(offsetMs / 1000 * sampleRate);
            const ch = buf.getChannelData(0);
            const writeLen = Math.min(ch.length, totalSamples - startSample);
            for (let j = 0; j < writeLen; j++) {
              mixed[startSample + j] += ch[j];
            }
            decodedCount++;
            // Update status occasionally so user sees progress on long exports
            if (decodedCount % 5 === 0 || decodedCount === totalAudioTurns) {
              setExportStatus(`Audio decode: ${decodedCount}/${totalAudioTurns}`);
              // Yield to UI thread between batches
              await new Promise(r => setTimeout(r, 0));
            }
          } catch (decodeErr) {
            console.warn(`Audio decode failed for turn ${i}:`, decodeErr);
          }
        }
        offsetMs += t.durationMs;
      }
      await actx.close();

      // ── 2. Create offscreen renderer at 1080p ─────────────────────────────
      setExportStatus(isLongVideo && fileStream
        ? 'Long video — disk pe stream ho raha hai…'
        : 'Video render ho raha hai…');
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = W; exportCanvas.height = H;
      const state = buildState();
      const exportRenderer = new CanvasRenderer(exportCanvas, state);

      // ── 3. Offline render via WebCodecs (mp4-muxer) ───────────────────────
      const blob = await renderVideoOffline({
        canvas: exportCanvas,
        audioChannels: [mixed],
        sampleRate,
        duration: totalSec,
        fps: FPS,
        bitrate: 8_000_000,
        width: W,
        height: H,
        renderCallback: (_time, _level, _vid, offCtx) => {
          exportRenderer.currentTime = _time * 1000;
          exportRenderer.audioLevel = _level;
          exportRenderer.drawFrame();
          offCtx.drawImage(exportCanvas, 0, 0, W, H);
        },
        onProgress: p => {
          setExportProgress(Math.round(p * 100));
        },
      }, fileStream ?? undefined);

      // ── 4. Download (only if in-memory; streaming already wrote to file) ──
      if (fileStream) {
        await fileStream.close();
        toast.success('✓ Long video disk pe save ho gaya!');
      } else {
        if (!blob) throw new Error('Render empty return hua');
        const url = URL.createObjectURL(blob as Blob);
        const a = document.createElement('a');
        a.href = url; a.download = `phone-studio-${Date.now()}.mp4`; a.click();
        // Defer revoke — Firefox/Safari sometimes need the URL live for several
        // seconds after .click() to actually save the file. Immediate revoke
        // causes empty / 0-byte downloads on those browsers.
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 60_000);
        toast.success('✓ 1080p MP4 download ho gaya!');
      }
    } catch (err: any) {
      if (fileStream) { try { await fileStream.close(); } catch {} }
      console.error('Export error:', err);
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setExporting(false); setExportProgress(0); setExportStatus('');
    }
  }, [buildState, script]);

  // ── Script Generator ──────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    const style = CONVO_STYLES.find(s => s.id === genStyle) ?? CONVO_STYLES[0];
    const speaker1 = phones[0]?.name ?? 'ChatGPT';
    const speaker2 = phones[1]?.name ?? 'Gemini';

    if (!genTopic.trim() && !genYtMode) {
      toast.error('Topic ya YouTube URL dalo pehle');
      return;
    }

    setGenerating(true);

    try {
      let topicContext = genTopic.trim();

      // ── YouTube mode: fetch transcript → summarize with Gemini ─────────────
      if (genYtMode && genYtUrl.trim()) {
        toast.info('YouTube transcript fetch ho raha hai…');
        const ytRes = await fetch('/api/youtube/transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: genYtUrl.trim(), language: 'auto' }),
        });
        if (!ytRes.ok) throw new Error('YouTube transcript fetch failed');
        const ytData = await ytRes.json();
        if (ytData.error) throw new Error(ytData.error);
        // Flask returns full_text (snake_case) and segments[]
        const rawText: string =
          ytData.full_text ??
          ytData.fullText ??
          (ytData.segments ?? ytData.transcript ?? []).map((t: any) => t.text).join(' ') ??
          '';
        if (!rawText.trim()) throw new Error('Is video ka transcript available nahi hai. Caption-enabled video try karo.');

        // Summarize + find discussion points via Gemini
        toast.info('Gemini points analyze kar raha hai…');
        const analyzeRes = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemini-3.5-flash',
            contents: [{
              role: 'user',
              parts: [{ text: `You are analyzing a YouTube video transcript to find the most interesting discussion points.

TRANSCRIPT (first 8000 chars):
${rawText.slice(0, 8000)}

Your task:
1. Find 4-6 specific claims, arguments, or moments in this video that would make great discussion points — especially:
   - Controversial or debatable claims
   - Factual statements that could be questioned
   - Interesting concepts worth exploring deeper
   - Surprising or counterintuitive ideas
   - Moments where the host says something strong or provocative

2. Also write a 2-3 sentence summary of the video's main topic.

Return JSON only:
{
  "topic": "2-3 sentence summary",
  "points": ["point 1", "point 2", "point 3", "point 4"]
}` }],
            }],
          }),
        });
        const analyzeJson = await analyzeRes.json();
        const analyzeText = analyzeJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const match = analyzeText.match(/\{[\s\S]*\}/);
        let analyzed: { topic?: string; points?: unknown } | null = null;
        if (match) {
          try { analyzed = JSON.parse(match[0]); } catch { analyzed = null; }
        }
        if (analyzed && Array.isArray(analyzed.points) && analyzed.points.length > 0) {
          const pointsList = (analyzed.points as unknown[])
            .filter((p): p is string => typeof p === 'string')
            .map((p, i) => `${i + 1}. ${p}`)
            .join('\n');
          const topicLine = typeof analyzed.topic === 'string' ? analyzed.topic : '(video topic)';
          topicContext = `Based on this YouTube video:\n${topicLine}\n\nKey discussion points to explore:\n${pointsList}`;
        } else {
          // Gemini didn't return usable JSON — fall back to raw transcript slice
          topicContext = rawText.slice(0, 1500);
        }
      }

      // ── Generate conversation script via Gemini ────────────────────────────
      toast.info('Script generate ho raha hai…');
      const sourceLenHint = genYtMode
        ? `Source: YouTube transcript (~${Math.round(topicContext.length / 1000)}k chars of context).`
        : `Source: topic prompt (user-supplied, no transcript).`;
      const lengthRule = genAutoTurns
        ? `1. AUTO LENGTH MODE — YOU decide the turn count yourself. ${sourceLenHint}
   Target final video: **3 to 15 minutes** (each turn ~12-14s spoken, so 12-75 turns total).
   Choose the count that does justice to the topic — NO PADDING, NO FILLER:
   - Quick / shallow topic → 12-22 turns (~3-5 min)
   - Standard topic with 2-3 sub-points → 22-40 turns (~5-9 min)
   - Rich / deep / multi-claim topic (or long transcript source) → 40-75 turns (~9-15 min)
   Pick based on actual richness, not arbitrarily. If the topic is shallow, STAY SHORT — don't pad to hit 15 min.
   Alternate between speakers (start with ${speaker1}).`
        : `1. Generate exactly ${genTurns} turns total, alternating between speakers (start with ${speaker1}).`;

      const prompt = `You are writing a script for a phone conversation video between two AI assistants: "${speaker1}" and "${speaker2}".

TOPIC/CONTEXT:
${topicContext}

CONVERSATION STYLE:
${style.prompt}

RULES:
${lengthRule}
2. Each turn: 2-4 natural sentences. No bullet points. No headers.
3. Each turn should feel like actual spoken dialogue — contractions, casual language, reactions.
4. Avoid "In conclusion" or formal summaries — keep the conversation flowing.
5. Make it engaging for YouTube viewers — hooks, surprising statements, moments of disagreement.

Return ONLY a valid JSON array. No markdown. No explanation. Just the array:
[
  {"speaker": "${speaker1}", "text": "..."},
  {"speaker": "${speaker2}", "text": "..."}
]`;

      const genRes = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-3.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      });
      if (!genRes.ok) throw new Error(`Gemini error: ${genRes.status}`);
      const genJson = await genRes.json();
      const rawText2 = genJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const arrMatch = rawText2.match(/\[[\s\S]*\]/);
      if (!arrMatch) throw new Error('Gemini se valid JSON nahi aaya');

      const turns: { speaker: string; text: string }[] = JSON.parse(arrMatch[0]);
      if (!turns.length) throw new Error('Script turns empty hain');

      // Build ScriptTurn[] from parsed turns
      const newPhones = phones.length >= 2 ? phones : (() => {
        const p1 = AI_MODEL_PRESETS.find(m => m.label === speaker1) ?? AI_MODEL_PRESETS[0];
        const p2 = AI_MODEL_PRESETS.find(m => m.label === speaker2) ?? AI_MODEL_PRESETS[1];
        return [
          { id: 'p_ChatGPT', name: p1.label, style: p1.style, color: p1.color, screenColor: p1.screen, rotation: -4, showControls: true, battery: '87%' },
          { id: 'p_Gemini', name: p2.label, style: p2.style, color: p2.color, screenColor: p2.screen, rotation: 5, showControls: true, battery: '73%' },
        ];
      })();

      if (phones.length < 2) setPhones(newPhones);

      const newScript: ScriptTurn[] = turns.map((t, i) => {
        const matchPhone = newPhones.find(p => p.name === t.speaker) ?? newPhones[i % newPhones.length];
        const estDur = Math.max(3000, t.text.length * 72);
        return {
          id: `gen_${i}_${Date.now()}`,
          phoneId: matchPhone.id,
          text: t.text,
          isNarrator: false,
          durationMs: estDur,
          audioUrl: undefined,
          wordTimings: estimateWordTimings(t.text, estDur / 1000),
        };
      });

      if (embedded && onGeneratorComplete) {
        onGeneratorComplete(newScript, newPhones);
        toast.success(`✓ ${newScript.length} turns generate ho gaye! Script Editor me jaa raha hai…`);
      } else {
        setScript(newScript);
        setTab('visual');
        toast.success(`✓ ${newScript.length} turns generate ho gaye!`);
      }

    } catch (err: any) {
      console.error('Generate error:', err);
      toast.error(`Generate failed: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }, [genStyle, genTopic, genYtMode, genYtUrl, genTurns, genAutoTurns, phones]);

  // ── Podcast Deep-Analysis Generator ───────────────────────────────────────

  const handlePodcastGenerate = useCallback(async (args: {
    podcastUrl: string;
    chapters: PodcastChapter[];
    segments: PodcastTranscriptSeg[];
    podcastTitle: string;
    podcastHost: string;
    podcastGuests: string[];
    supporterName: string;
    criticName: string;
    extraFocus: string;
    useGrounding: boolean;
    variant: PodcastVariant;
    analystName?: string;
    personInClip?: string;
    actionVerb?: string;
    topicHeading?: string;
  }) => {
    setGenerating(true);
    try {
      // ── Clip Reaction (single-speaker) ───────────────────────────────────
      if (args.variant === 'clip_take') {
        toast.info('Gemini clip reaction script bana raha hai…');
        const turns = await generateClipTakeScript({
          segments: args.segments,
          chapters: args.chapters,
          podcastTitle: args.podcastTitle,
          personInClip: args.personInClip || args.podcastHost || 'the speaker',
          actionVerb: args.actionVerb || 'talks about',
          topicHeading: args.topicHeading || 'this topic',
          analystName: args.analystName || 'Sam',
          extraFocus: args.extraFocus || undefined,
          useGoogleGrounding: args.useGrounding,
        });
        if (!turns.length) throw new Error('Clip reaction script empty hai');

        const analyst = args.analystName || 'Sam';
        const phoneId = speakerToPhoneId(analyst);
        const purplePreset = PRESET_COLORS.find(p => p.label === 'Purple') ?? PRESET_COLORS[0];
        const newPhones: PhoneConfig[] = [{
          id: phoneId, name: analyst,
          style: 'aurora', color: purplePreset.color, screenColor: purplePreset.screen,
          rotation: 0, showControls: true, battery: '87%',
        }];
        const newScript: ScriptTurn[] = turns.map((t, i) => {
          const estDur = Math.max(3000, t.text.length * 72);
          return {
            id: `clip_${i}_${Date.now()}`,
            phoneId,
            text: t.text,
            isNarrator: false,
            durationMs: estDur,
            audioUrl: undefined,
            wordTimings: estimateWordTimings(t.text, estDur / 1000),
          };
        });

        if (embedded && onGeneratorComplete) {
          onGeneratorComplete(newScript, newPhones);
          toast.success(`✓ ${newScript.length} turns clip-reaction ready!`);
        } else {
          setPhones(newPhones);
          setScript(newScript);
          setTab('visual');
          toast.success(`✓ ${newScript.length} turns ka clip-reaction script ready hai!`);
        }
        return;
      }

      // ── Standard 2-speaker Deep Analysis ─────────────────────────────────
      toast.info(args.chapters.length > 1
        ? `Gemini ${args.chapters.length} chapters ki combined analysis bana raha hai…`
        : 'Gemini chapter deep-analyze kar raha hai…');
      const turns = await generatePodcastDeepAnalysisScript({
        segments: args.segments,
        chapters: args.chapters,
        podcastTitle: args.podcastTitle,
        podcastHost: args.podcastHost || undefined,
        podcastGuests: args.podcastGuests.length ? args.podcastGuests : undefined,
        supporterName: args.supporterName,
        criticName: args.criticName,
        extraFocus: args.extraFocus || undefined,
        useGoogleGrounding: args.useGrounding,
        variant: args.variant,
      });
      if (!turns.length) throw new Error('Script empty hai');

      // Build / reuse phones for supporter (green) + critic (red)
      const supporterPhoneId = speakerToPhoneId(args.supporterName);
      const criticPhoneId = speakerToPhoneId(args.criticName);
      const greenPreset = PRESET_COLORS.find(p => p.label === 'Green') ?? PRESET_COLORS[1];
      const redPreset   = PRESET_COLORS.find(p => p.label === 'Red')   ?? PRESET_COLORS[4];
      const newPhones: PhoneConfig[] = [
        {
          id: supporterPhoneId, name: args.supporterName,
          style: 'aurora', color: greenPreset.color, screenColor: greenPreset.screen,
          rotation: -4, showControls: true, battery: '87%',
        },
        {
          id: criticPhoneId, name: args.criticName,
          style: 'ripple', color: redPreset.color, screenColor: redPreset.screen,
          rotation: 5, showControls: true, battery: '73%',
        },
      ];
      const newScript: ScriptTurn[] = turns.map((t, i) => {
        const isSupp = t.speaker.trim().toLowerCase() === args.supporterName.trim().toLowerCase();
        const phoneId = isSupp ? supporterPhoneId : criticPhoneId;
        const estDur = Math.max(3000, t.text.length * 72);
        return {
          id: `podcast_${i}_${Date.now()}`,
          phoneId,
          text: t.text,
          isNarrator: false,
          durationMs: estDur,
          audioUrl: undefined,
          wordTimings: estimateWordTimings(t.text, estDur / 1000),
        };
      });

      if (embedded && onGeneratorComplete) {
        onGeneratorComplete(newScript, newPhones);
        toast.success(`✓ ${newScript.length} turns deep-analysis ready! Script Editor me jaa raha hai…`);
      } else {
        setPhones(newPhones);
        setScript(newScript);
        setTab('visual');
        toast.success(`✓ ${newScript.length} turns ka deep-analysis script ready hai!`);
      }
    } catch (err: any) {
      console.error('Podcast generate error:', err);
      toast.error(`Generate failed: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }, []);

  // ── Embedded mode: render ONLY the script generator (used inside DebateInput's "New Phone Studio" tab) ──

  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#050507', color: '#e0e0e0', fontFamily: 'inherit' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <MonitorSmartphone size={18} color="#ef4444" />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>New Phone Studio — Script Generator</span>
        </div>
        <ScriptGeneratorPanel
          genStep={genStep} setGenStep={setGenStep}
          genStyle={genStyle} setGenStyle={setGenStyle}
          genTopic={genTopic} setGenTopic={setGenTopic}
          genYtMode={genYtMode} setGenYtMode={setGenYtMode}
          genYtUrl={genYtUrl} setGenYtUrl={setGenYtUrl}
          genTurns={genTurns} setGenTurns={setGenTurns}
          genAutoTurns={genAutoTurns} setGenAutoTurns={setGenAutoTurns}
          phones={phones}
          generating={generating}
          onGenerate={handleGenerate}
          onPodcastGenerate={handlePodcastGenerate}
        />
      </div>
    );
  }

  // ── Standalone PHONE_STUDIO state with no script yet → show empty-state placeholder.
  //    Generator UI lives in DebateInput "New Phone Studio" tab now — Phone Studio always shows main UI here.

  if (!mainScript.length && !script.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#050507', color: '#e0e0e0', fontFamily: 'inherit' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <MonitorSmartphone size={18} color="#ef4444" />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Phone Studio</span>
        </div>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center',
        }}>
          <div style={{ maxWidth: 320 }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📱</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              Koi script load nahi hua
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.55 }}>
              Input page pe jaa ke <b style={{ color: '#fca5a5' }}>“New Phone Studio”</b> tab choose karo — wahaan script generate karne ke baad ye studio automatically open ho jayega.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#050507', color: '#e0e0e0', overflow: 'hidden', fontFamily: 'inherit' }}>

      {/* ── 16:9 Canvas Preview ── */}
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', flexShrink: 0, background: '#050505', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <canvas
            ref={canvasRef}
            width={1920}
            height={1080}
            style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
          />
          {!exporting && (
            <div style={{
              position: 'absolute', bottom: 10, left: 10,
              background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(8px)', borderRadius: 20,
              padding: '3px 10px', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.6)',
            }}>
              {fmtTime(currentTime)} <span style={{ color: 'rgba(255,255,255,0.3)' }}>/ {fmtTime(totalDuration)}</span>
            </div>
          )}
          {isPlaying && (
            <div style={{
              position: 'absolute', top: 10, right: 10,
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 700,
              color: '#ef4444', display: 'flex', alignItems: 'center', gap: 5, letterSpacing: '0.1em',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
              LIVE
            </div>
          )}
          {/* Audio badge */}
          <div style={{
            position: 'absolute', top: 10, left: 10,
            background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20, padding: '3px 10px', fontSize: 10, color: 'rgba(255,255,255,0.4)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Volume2 size={10} />
            {script.filter(t => t.audioUrl).length}/{script.length} audio
          </div>
        </div>
      </div>

      {/* ── Playback + Seek ── */}
      <div style={{ flexShrink: 0, padding: '8px 12px 6px', background: '#0a0a0d', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={togglePlay}
            disabled={!script.length}
            style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: '#fff', border: 'none', cursor: script.length ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: script.length ? 1 : 0.3,
              boxShadow: '0 2px 8px rgba(255,255,255,0.1)',
            }}
          >
            {isPlaying
              ? <Square size={13} fill="#000" color="#000" />
              : <Play size={13} fill="#000" color="#000" style={{ marginLeft: 1 }} />}
          </button>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input
              type="range" min={0} max={totalDuration || 1} value={currentTime}
              onChange={e => seek(+e.target.value)}
              onMouseUp={e => seekWithAudio(+(e.target as HTMLInputElement).value)}
              onTouchEnd={e => seekWithAudio(+(e.currentTarget as HTMLInputElement).value)}
              style={{ width: '100%', accentColor: '#ef4444', cursor: 'pointer', height: 3 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
              <span>{activeTurn ? `${activeTurn.idx + 1}/${script.length} · ${activeTurn.phoneName}` : `0/${script.length}`}</span>
              <span>{fmtTime(totalDuration)}</span>
            </div>
          </div>
        </div>

        {/* Timeline chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 6, paddingBottom: 2 }}>
          {timelineItems.map(item => {
            const active = currentTime >= item.start && currentTime < item.end;
            return (
              <button
                key={item.id}
                onClick={() => seekWithAudio(item.start)}
                style={{
                  flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  width: 44, padding: '5px 4px', borderRadius: 10,
                  cursor: 'pointer',
                  border: `1px solid ${active ? item.color + '70' : 'rgba(255,255,255,0.05)'}`,
                  background: active ? item.color + '18' : 'rgba(255,255,255,0.03)',
                  position: 'relative', transition: 'all 0.15s',
                  opacity: active ? 1 : 0.6,
                }}
              >
                {active && <div style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />}
                <div style={{
                  width: 24, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: item.color + '28', border: `1px solid ${item.color}44`,
                  color: item.color, fontSize: 10, fontWeight: 800, marginBottom: 2,
                }}>
                  {item.phoneName[0]}
                </div>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                  {(item.durationMs / 1000).toFixed(0)}s
                </span>
              </button>
            );
          })}
          {!script.length && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', padding: '6px 2px', alignSelf: 'center' }}>
              Script turns nahi hain
            </span>
          )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#080809' }}>
        {([
          { id: 'visual', label: 'Settings', icon: '⚙️' },
          { id: 'export', label: 'Export',   icon: '📤' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${tab === t.id ? '#ef4444' : 'transparent'}`,
              color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.38)',
              fontSize: 12, fontWeight: 700, transition: 'all 0.15s', letterSpacing: '0.05em',
              fontFamily: 'inherit',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

        {/* ════ SETTINGS / VISUAL TAB ════ */}
        {tab === 'visual' && (
          <div style={{ padding: 12, paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Script info banner */}
            <div style={{
              padding: '10px 12px', borderRadius: 12,
              background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#86efac' }}>
                  Main App Script Connected
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  {script.length} turns · {phones.length} speakers · {script.filter(t => t.audioUrl).length}/{script.length} audio ready
                </div>
              </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4 }}>
              {(['phones', 'background', 'subtitle'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setVisualSub(s)}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: visualSub === s ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: visualSub === s ? '#fff' : 'rgba(255,255,255,0.35)',
                    fontSize: 11, fontWeight: 600, fontFamily: 'inherit', textTransform: 'capitalize',
                  }}
                >
                  {s === 'subtitle' ? 'Subtitles' : s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {/* ── Phones sub-tab ── */}
            {visualSub === 'phones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Spacing + Scale sliders */}
                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    Layout
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {([
                      { label: 'Spacing', value: spacing, set: setSpacing, min: 0, max: 100 },
                      { label: 'Scale', value: scale, set: setScale, min: 50, max: 150 },
                    ] as const).map(sl => (
                      <div key={sl.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{sl.label}</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{sl.value}</span>
                        </div>
                        <input
                          type="range" min={sl.min} max={sl.max} value={sl.value}
                          onChange={e => sl.set(+e.target.value)}
                          style={{ width: '100%', accentColor: '#ef4444' }}
                        />
                      </div>
                    ))}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Clock Start</span>
                        <input
                          value={startTime}
                          onChange={e => setStartTime(e.target.value)}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 12, fontFamily: 'monospace', outline: 'none', width: 72, textAlign: 'right', padding: '6px 8px' }}
                          placeholder="09:41"
                        />
                      </div>
                    </div>

                    {/* VU meter toggle (default OFF) */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                      <div
                        onClick={() => setVuMeterOn(v => !v)}
                        style={{
                          width: 34, height: 18, borderRadius: 50, position: 'relative', cursor: 'pointer',
                          background: vuMeterOn ? '#22c55e' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', flexShrink: 0,
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%',
                          background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                          left: vuMeterOn ? 18 : 2,
                        }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>📊 VU Meter</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>Audio-reactive bar beside active phone</div>
                      </div>
                    </label>

                    {/* Z-pulse toggle (default = single-speaker auto) */}
                    {(() => {
                      const effectiveOn = phoneZPulseOverride ?? (phones.length === 1);
                      const isDefault = phoneZPulseOverride === null;
                      return (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                          <div
                            onClick={() => setPhoneZPulseOverride(effectiveOn ? false : true)}
                            style={{
                              width: 34, height: 18, borderRadius: 50, position: 'relative', cursor: 'pointer',
                              background: effectiveOn ? '#a855f7' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', flexShrink: 0,
                            }}
                          >
                            <div style={{
                              position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%',
                              background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                              left: effectiveOn ? 18 : 2,
                            }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>🌀 Z-Pulse (voice depth)</div>
                            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                              {isDefault
                                ? (phones.length === 1 ? 'Default ON (1 speaker)' : 'Default OFF (2+ speakers)')
                                : 'Manual override active'}
                            </div>
                          </div>
                          {!isDefault && (
                            <button
                              onClick={e => { e.preventDefault(); setPhoneZPulseOverride(null); }}
                              style={{ fontSize: 9, padding: '3px 7px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'inherit' }}
                            >reset</button>
                          )}
                        </label>
                      );
                    })()}
                  </div>
                </div>

                {/* Phone cards (one per speaker) */}
                {phones.map((phone) => {
                  const activeModel = AI_MODEL_PRESETS.find(m => m.label === phone.name) ?? null;
                  return (
                  <div key={phone.id} style={{ borderRadius: 14, border: `1px solid ${phone.color}28`, background: 'rgba(255,255,255,0.025)', overflow: 'hidden' }}>

                    {/* ── Model Selector Bar ── */}
                    <div style={{ padding: '8px 12px', background: phone.color + '12', borderBottom: `1px solid ${phone.color}20` }}>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>AI Model</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {AI_MODEL_PRESETS.map(model => {
                          const sel = activeModel?.id === model.id;
                          return (
                            <button
                              key={model.id}
                              onClick={() => updatePhone(phone.id, {
                                name: model.label,
                                color: model.color,
                                screenColor: model.screen,
                                style: model.style,
                              })}
                              style={{
                                padding: '8px 12px', borderRadius: 20, minHeight: 36,
                                border: `1px solid ${sel ? model.color : 'rgba(255,255,255,0.1)'}`,
                                background: sel ? model.color + '30' : 'rgba(255,255,255,0.04)',
                                color: sel ? '#fff' : 'rgba(255,255,255,0.45)',
                                fontSize: 12, fontWeight: sel ? 700 : 500,
                                cursor: 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center', gap: 4,
                                transition: 'all 0.12s',
                              }}
                            >
                              <span style={{ fontSize: 13 }}>{model.emoji}</span>
                              {model.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {/* Speaker photo thumbnail or color dot */}
                      {phone.backgroundImage
                        ? <img
                            src={phone.backgroundImage}
                            style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${phone.color}`, flexShrink: 0, cursor: 'pointer' }}
                            onClick={() => updatePhone(phone.id, { backgroundImage: undefined })}
                            title="Click to remove photo"
                          />
                        : <div style={{ width: 10, height: 10, borderRadius: '50%', background: phone.color, flexShrink: 0 }} />
                      }
                      <input
                        value={phone.name}
                        onChange={e => updatePhone(phone.id, { name: e.target.value })}
                        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, outline: 'none', fontFamily: 'inherit' }}
                        placeholder="Speaker name..."
                      />
                      <span style={{ flexShrink: 0, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                        {script.filter(t => t.phoneId === phone.id).length} turns
                      </span>
                    </div>
                    {/* Photo upload row */}
                    <div style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1 }}>
                        <div style={{
                          flex: 1, padding: '5px 10px', borderRadius: 8,
                          border: `1.5px dashed ${phone.backgroundImage ? phone.color : 'rgba(255,255,255,0.15)'}`,
                          background: phone.backgroundImage ? phone.color + '12' : 'rgba(255,255,255,0.03)',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{ fontSize: 13 }}>📸</span>
                          <span style={{ fontSize: 11, color: phone.backgroundImage ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                            {phone.backgroundImage ? 'Photo set ✓' : 'Upload photo'}
                          </span>
                        </div>
                        <input
                          type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => {
                              updatePhone(phone.id, { backgroundImage: ev.target?.result as string });
                            };
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {phone.backgroundImage && (
                        <button
                          onClick={() => updatePhone(phone.id, { backgroundImage: undefined })}
                          style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.18)', color: '#fca5a5', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', minHeight: 36 }}
                        >✕ Remove</button>
                      )}
                    </div>
                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

                      {/* Animation style */}
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Animation</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {ANIM_STYLES.map(s => (
                            <button
                              key={s.value}
                              onClick={() => updatePhone(phone.id, { style: s.value })}
                              title={s.desc}
                              style={{
                                padding: '5px 10px', borderRadius: 8,
                                border: `1px solid ${phone.style === s.value ? phone.color : 'rgba(255,255,255,0.1)'}`,
                                background: phone.style === s.value ? phone.color + '25' : 'rgba(255,255,255,0.04)',
                                color: phone.style === s.value ? '#fff' : 'rgba(255,255,255,0.4)',
                                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Color presets */}
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Color</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {PRESET_COLORS.map(pc => (
                            <div
                              key={pc.color}
                              onClick={() => updatePhone(phone.id, { color: pc.color, screenColor: pc.screen })}
                              title={pc.label}
                              style={{
                                width: 32, height: 32, borderRadius: '50%', background: pc.color, cursor: 'pointer',
                                boxShadow: phone.color === pc.color
                                  ? `0 0 0 2px #050507, 0 0 0 4px ${pc.color}`
                                  : 'none',
                                transform: phone.color === pc.color ? 'scale(1.12)' : 'scale(1)',
                                transition: 'all 0.15s',
                                flexShrink: 0,
                              }}
                            />
                          ))}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="color" value={phone.color}
                              onChange={e => updatePhone(phone.id, { color: e.target.value })}
                              style={{ width: 32, height: 32, border: 'none', padding: 0, background: 'none', cursor: 'pointer', borderRadius: '50%' }}
                              title="Custom color"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Rotation */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tilt</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{phone.rotation ?? 0}°</span>
                        </div>
                        <input
                          type="range" min={-15} max={15} value={phone.rotation ?? 0}
                          onChange={e => updatePhone(phone.id, { rotation: +e.target.value })}
                          style={{ width: '100%', accentColor: phone.color }}
                        />
                      </div>

                      {/* Battery */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Battery</span>
                          <input
                            value={phone.battery ?? '87%'}
                            onChange={e => updatePhone(phone.id, { battery: e.target.value })}
                            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#fff', fontSize: 12, fontFamily: 'monospace', outline: 'none', width: 72, textAlign: 'center', padding: '6px 8px' }}
                            placeholder="87%"
                          />
                        </div>
                      </div>

                      {/* Call controls toggle */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <div
                          onClick={() => updatePhone(phone.id, { showControls: !phone.showControls })}
                          style={{
                            width: 36, height: 20, borderRadius: 50, position: 'relative', cursor: 'pointer',
                            background: phone.showControls !== false ? '#ef4444' : 'rgba(255,255,255,0.1)',
                            transition: 'background 0.2s', flexShrink: 0,
                          }}
                        >
                          <div style={{
                            position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
                            background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                            left: phone.showControls !== false ? 18 : 2,
                          }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Show call controls</span>
                      </label>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* ── Background sub-tab ── */}
            {visualSub === 'background' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Custom image upload */}
                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Custom Image</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <div style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, border: `1.5px dashed ${bgImageUrl ? '#ef4444' : 'rgba(255,255,255,0.18)'}`,
                      background: bgImageUrl ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 16 }}>🖼️</span>
                      <span style={{ fontSize: 12, color: bgImageUrl ? '#fca5a5' : 'rgba(255,255,255,0.45)' }}>
                        {bgImageUrl ? 'Custom image set ✓' : 'Upload background image'}
                      </span>
                    </div>
                    <input
                      type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = URL.createObjectURL(file);
                        setBgImageUrl(url);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {bgImageUrl && (
                    <button
                      onClick={() => setBgImageUrl(null)}
                      style={{ marginTop: 6, width: '100%', padding: '5px', borderRadius: 7, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Remove image
                    </button>
                  )}
                </div>

                {/* Preset colors */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px, 100%), 1fr))', gap: 8 }}>
                  {BG_OPTIONS.map(opt => {
                    const sel = !bgImageUrl && bg === opt.value;
                    const preview = opt.value.startsWith('linear:')
                      ? 'linear-gradient(135deg,' + opt.value.slice(7) + ')'
                      : opt.value;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => { setBgImageUrl(null); setBg(opt.value); }}
                        style={{
                          aspectRatio: '16/9', borderRadius: 10, cursor: 'pointer',
                          background: preview,
                          border: `2px solid ${sel ? '#ef4444' : 'rgba(255,255,255,0.06)'}`,
                          position: 'relative', overflow: 'hidden',
                          transition: 'border-color 0.15s',
                        }}
                      >
                        {sel && <div style={{ position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={11} /></div>}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '5px 7px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{opt.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Subtitle sub-tab ── */}
            {visualSub === 'subtitle' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Enable toggle */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', cursor: 'pointer' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Show Subtitles</span>
                  <div
                    onClick={() => setSubtitleEnabled(p => !p)}
                    style={{
                      width: 40, height: 22, borderRadius: 50, position: 'relative', cursor: 'pointer',
                      background: subtitleEnabled ? '#ef4444' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s',
                    }}
                  >
                    <div style={{ position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', left: subtitleEnabled ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
                  </div>
                </label>

                {/* Size slider */}
                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Font Size</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{subtitleSize.toFixed(1)}×</span>
                  </div>
                  <input
                    type="range" min={0.5} max={2.0} step={0.05} value={subtitleSize}
                    onChange={e => setSubtitleSize(+e.target.value)}
                    style={{ width: '100%', accentColor: '#ef4444' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>0.5×</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>2.0×</span>
                  </div>
                </div>

                {/* Background style */}
                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Background Style</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['dark', 'light', 'none'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setSubtitleBg(s)}
                        style={{
                          flex: 1, padding: '7px 4px', borderRadius: 8,
                          border: `1px solid ${subtitleBg === s ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                          background: subtitleBg === s ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                          color: subtitleBg === s ? '#fff' : 'rgba(255,255,255,0.4)',
                          fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sync mode indicator */}
                {(() => {
                  // Estimated wordTimings get set when the script is generated, BEFORE audio/STT.
                  // Real STT sync writes phraseTimings — that's the canonical "actually synced" marker.
                  const hasRealSync = script.some(t => (t as any).phraseTimings && (t as any).phraseTimings.length > 0);
                  const realCount   = script.filter(t => (t as any).phraseTimings && (t as any).phraseTimings.length > 0).length;
                  return (
                    <div style={{ padding: '9px 12px', borderRadius: 10, background: hasRealSync ? 'rgba(34,197,94,0.07)' : 'rgba(251,191,36,0.07)', border: `1px solid ${hasRealSync ? 'rgba(34,197,94,0.2)' : 'rgba(251,191,36,0.2)'}`, fontSize: 11, lineHeight: 1.6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 13 }}>{hasRealSync ? '✅' : '⚡'}</span>
                        <span style={{ fontWeight: 700, color: hasRealSync ? '#86efac' : '#fde68a' }}>
                          {hasRealSync ? `Real Word Sync — ${realCount}/${script.length} turns` : 'Estimated Sync (no STT data)'}
                        </span>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {hasRealSync
                          ? 'Word-level STT timings available hain — subtitles exact audio se sync hain.'
                          : 'STT word timings nahi hain — weight-based estimate use ho raha hai. Voice Gen → STT karke sync improve karo.'}
                      </span>
                    </div>
                  );
                })()}

                {/* ── YouTube Chapters ── */}
                <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>⏱ YouTube Chapters</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>AI topic-based chapters — YouTube description mein paste karo</div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <button
                      onClick={async () => {
                        if (!script.length || chaptersGenerating) return;
                        setChaptersGenerating(true);
                        try {
                          const turns = script.map(t => {
                            const phone = phones.find(p => p.id === t.phoneId);
                            return { text: t.text, speaker: phone?.name ?? t.phoneId, durationMs: t.durationMs };
                          });
                          const result = await generateScriptChapters(turns);
                          setChapters(result);
                          toast.success(`✓ ${result.length} chapters generate ho gaye!`);
                        } catch (e: any) {
                          toast.error(`Chapters error: ${e.message}`);
                        } finally {
                          setChaptersGenerating(false);
                        }
                      }}
                      disabled={!script.length || chaptersGenerating}
                      style={{
                        flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none',
                        background: (!script.length || chaptersGenerating) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                        color: (!script.length || chaptersGenerating) ? 'rgba(255,255,255,0.3)' : '#fff',
                        fontSize: 11, fontWeight: 700, cursor: (!script.length || chaptersGenerating) ? 'default' : 'pointer',
                        fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}
                    >
                      {chaptersGenerating
                        ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                        : '✨ Generate Chapters'}
                    </button>
                    {chapters.length > 0 && (
                      <button
                        onClick={() => {
                          const fmt = (ms: number) => {
                            const s = Math.floor(ms / 1000);
                            const m = Math.floor(s / 60);
                            const sec = s % 60;
                            return `(${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')})`;
                          };
                          const text = chapters.map(c => `${fmt(c.startMs)} ${c.title}`).join('\n');
                          navigator.clipboard.writeText(text)
                            .then(() => toast.success('✓ Chapters copy ho gaye!'))
                            .catch(() => toast.error('Copy failed'));
                        }}
                        style={{
                          padding: '7px 12px', borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: '#1e293b', color: '#94a3b8',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        } as React.CSSProperties}
                      >
                        📋 Copy
                      </button>
                    )}
                  </div>

                  {/* Chapter list */}
                  {chapters.length > 0 ? (
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden' }}>
                      {chapters.map((ch, i) => {
                        const fmtMs = (ms: number) => {
                          const s = Math.floor(ms / 1000);
                          const m = Math.floor(s / 60);
                          const sec = s % 60;
                          return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
                        };
                        return (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                            borderBottom: i < chapters.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          }}>
                            {/* Time range badge */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <span style={{ color: '#818cf8', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
                                ({fmtMs(ch.startMs)})
                              </span>
                              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9 }}>→</span>
                              <span style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 10 }}>
                                ({fmtMs(ch.endMs)})
                              </span>
                            </div>
                            {/* Title */}
                            <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ch.title}
                            </span>
                            {/* Duration */}
                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', flexShrink: 0, fontFamily: 'monospace' }}>
                              {Math.round((ch.endMs - ch.startMs) / 1000)}s
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '12px 8px', fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
                      {script.length ? '↑ "Generate Chapters" dabao — AI topic groups banana hai' : 'Script load karo pehle'}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}

        {/* ════ EXPORT TAB ════ */}
        {tab === 'export' && (
          <div style={{ padding: 14, paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Info card */}
            <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Export — 1080p MP4</div>
              {[
                `Format: MP4 (H.264 · AAC)  ·  1920×1080`,
                `Quality: 8 Mbps High Bitrate`,
                `Duration: ${fmtTime(totalDuration)}`,
                `${phones.length} phone${phones.length > 1 ? 's' : ''} · ${script.length} turns`,
                `Audio: ${script.filter(t => t.audioUrl).length}/${script.length} turns ready`,
              ].map(t => (
                <div key={t} style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', display: 'flex', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: '#ef4444' }}>•</span> {t}
                </div>
              ))}
            </div>

            {/* Progress bar (only while exporting) */}
            {exporting && (
              <div style={{ borderRadius: 14, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.07)', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#fca5a5', fontWeight: 700 }}>{exportStatus || 'Rendering…'}</span>
                  <span style={{ color: '#ef4444', fontFamily: 'monospace', fontWeight: 700 }}>{exportProgress}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 6, width: `${exportProgress}%`,
                    background: 'linear-gradient(90deg,#ef4444,#f97316)',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
                  Faster than real-time · WebCodecs offline render
                </div>
              </div>
            )}

            {/* Single export button */}
            <button
              onClick={handleExport}
              disabled={exporting || !script.length}
              style={{
                width: '100%', padding: '15px', borderRadius: 14,
                background: (!script.length || exporting) ? 'rgba(255,255,255,0.05)' : '#ef4444',
                border: 'none', color: '#fff', fontWeight: 800, fontSize: 15,
                cursor: (!script.length || exporting) ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: 'inherit', opacity: (!script.length || exporting) ? 0.4 : 1,
                boxShadow: (!script.length || exporting) ? 'none' : '0 8px 28px rgba(239,68,68,0.35)',
                letterSpacing: '0.06em', transition: 'all 0.2s',
              }}
            >
              {exporting
                ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Rendering {exportProgress}%…</>
                : <><Download size={17} /> EXPORT 1080p MP4</>
              }
            </button>
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  );
};

export default PhoneConvoStudio;
