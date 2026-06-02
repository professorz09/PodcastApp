# 🎙️ Master Instruction — Phone Studio Deep Analysis Prompt

Copy-paste ready prompt for generating supporter-vs-critic style deep-analysis conversation scripts from any podcast chapter.

Same conversational style as Phone Studio's built-in `podcast_analysis` flow (supporter + critic, in-medias-res, host/guest references, takeaway closers).

---

## 1. MASTER PROMPT — copy this whole block

```
You are writing a DEEP ANALYSIS DISCUSSION script between two analysts who are reacting to and discussing a podcast segment. They are NOT recreating the podcast — they are talking ABOUT what was said.

PODCAST: "{{PODCAST_TITLE}}"
CHAPTER TITLE: "{{CHAPTER_TITLE}}"
CHAPTER TIME: {{CHAPTER_TIME_RANGE}}
CHAPTER FOCUS: {{CHAPTER_SUMMARY}}

PODCAST PEOPLE (use these EXACT names when the analysts refer to who said what):
- HOST: {{HOST_NAME}}
- GUEST(S): {{GUEST_NAMES}}

SPEAKERS (these are the two analysts, NOT the podcast hosts):
- "{{SUPPORTER_NAME}}" → THE SUPPORTER. Genuinely finds the podcast's points compelling. Defends them, builds on them, adds supporting evidence and context. Sees what is RIGHT. Thoughtful, not blindly positive.
- "{{CRITIC_NAME}}" → THE CRITIC. Sharp, skeptical analyst. Picks apart the arguments — logical gaps, missing nuance, dangerous implications, counterexamples. Intellectually adversarial, never hostile.

THE TWO ANALYSTS NATURALLY DISAGREE. Their back-and-forth is intellectual tension — they push back, concede, reframe. Real conversation energy, not a polite forum.

STRUCTURE the script as follows:

A. **Opening Hook** (1-2 turns) — IN MEDIAS RES
   Open as if the two analysts are ALREADY mid-conversation about this idea. Drop the listener straight into the SPECIFIC CLAIM being discussed. First line = a sharp, opinionated reaction to a concrete claim — NOT a setup, NOT a recap.

   ❌ FORBIDDEN OPENERS:
     - "So, I was listening to..." / "I just watched..." / "We watched this clip..."
     - "On {{PODCAST_TITLE}}, the part where they say..."
     - "Today we're going to talk about..."
     - Any opener that announces the podcast as if introducing it to a viewer.

   ✅ CORRECT FEEL (mid-conversation, content-first):
     "{{SUPPORTER_NAME}}: Okay, the [specific claim] — that's a sharper point than people are giving them credit for."
     "{{CRITIC_NAME}}: Sharper? It only sounds sharp because they smuggled in an assumption. Watch — [zeroes in on the flaw]."

B. **Topic-by-topic Deep Dive** (12-18 turns)
   Identify 3-5 SPECIFIC sub-topics inside this chapter (specific claims, framings, or moments). For EACH sub-topic:
   - One analyst introduces it by referencing what {{HOST_NAME}} or {{GUEST_NAMES}} actually said: "Next, {{HOST_NAME}} argues that..." / "Then {{GUEST_NAMES}} pivots to..."
   - The other reacts with their stance.
   - Go BACK AND FORTH 2-4 turns per sub-topic — surface point → critical take → counter → concession or reframe.
   - Natural spoken language. Contractions. Reactions. Interruptions ("wait, hold on…"). NOT academic.
   - Reference real-world examples, data, or context where it lands naturally.

C. **The Critical Disagreement Beat** (2-3 turns)
   One spot where {{SUPPORTER_NAME}} and {{CRITIC_NAME}} clearly disagree about an interpretation. Let it breathe — they don't resolve it cleanly. That's the realism.

D. **Final Key Takeaways** (2 turns — MANDATORY at the very end)
   - {{SUPPORTER_NAME}}: brief "what this podcast actually got RIGHT — what we walk away learning" — 2-4 distinct positive takeaways, conversational.
   - {{CRITIC_NAME}}: "what's CONCERNING / what we should be careful about" — 2-4 distinct concerns, sharp but not bitter.

NATURAL REFERENCING RULES:
- Speakers refer to {{HOST_NAME}} and {{GUEST_NAMES}} by their REAL NAMES. If unknown, use "the host", "they", "the guest" — do NOT invent names.
- Use phrases like: "next, {{HOST_NAME}} talks about…", "first thing I noticed was when {{GUEST_NAMES}} said…", "{{HOST_NAME}} pushes back asking — what's your take?", "this is where I push back…", "exactly the part that's bothering me too".
- DO NOT roleplay AS {{HOST_NAME}} or {{GUEST_NAMES}}. The analysts are OUTSIDE the podcast looking in.
- DO NOT invent quotes the host/guest didn't say — paraphrase from the transcript below.
- NEVER open with viewer-commentary phrasing. The analysts assume the listener already knows what they're discussing.

LENGTH: 22-28 turns total, alternating naturally. Each turn = 2-5 sentences of natural spoken English. Audio-ready (no markdown, no bullet points, no headers inside the turn text).

THE CHAPTER TRANSCRIPT (this is what the analysts are reacting to — paraphrase, don't quote whole blocks):

{{TRANSCRIPT_PORTION}}

Return ONLY a JSON array. No markdown. No preamble. Just:
[
  { "speaker": "{{SUPPORTER_NAME}}", "text": "..." },
  { "speaker": "{{CRITIC_NAME}}", "text": "..." }
]
```

---

## 2. CHAPTER DETAILS — fill before running

```
PODCAST_TITLE     = (e.g. "Joe Rogan Experience #2507")
CHAPTER_TITLE     = (e.g. "Mapping the Milky Way with the Dot-of-an-Eye Analogy")
CHAPTER_TIME_RANGE= (e.g. "81:17 → 90:12")
CHAPTER_SUMMARY   = (1-line description of the chapter's main point)

HOST_NAME         = (e.g. "Joe Rogan")
GUEST_NAMES       = (e.g. "Michelle Thaller")

SUPPORTER_NAME    = (e.g. "Aarav")
CRITIC_NAME       = (e.g. "Neha")

TRANSCRIPT_PORTION = (paste the chapter's transcript here — with [M:SS] timestamps if available)
```

---

## 3. EXAMPLE — JRE #2507 (pre-filled)

```
PODCAST_TITLE     = Joe Rogan Experience #2507
CHAPTER_TITLE     = Mapping the Milky Way with the Dot-of-an-Eye Analogy
CHAPTER_TIME_RANGE= 81:17 → 90:12
CHAPTER_SUMMARY   = Michelle Thaller walks Joe through a scale model of the Milky Way using the eye-pupil as Earth's solar system, making the galaxy's true size viscerally graspable.

HOST_NAME         = Joe Rogan
GUEST_NAMES       = Michelle Thaller

SUPPORTER_NAME    = Aarav
CRITIC_NAME       = Neha

TRANSCRIPT_PORTION = [paste the 81:17 → 90:12 transcript portion here]
```

Paste this filled block + the actual transcript portion into the Master Prompt's `{{...}}` placeholders, then run.

---

## 4. HOW TO USE

1. **Copy** the Master Prompt block (section 1).
2. **Replace every `{{PLACEHOLDER}}`** with values from section 2 (or the example in section 3).
3. **Paste the chapter's transcript** into the `{{TRANSCRIPT_PORTION}}` slot — ideally with `[M:SS]` timestamps line-by-line.
4. **Send to AI** (Gemini / Claude / GPT). Output will be a JSON array of `{speaker, text}` turns — audio-ready, in our supporter-vs-critic conversational style.
5. **Paste the JSON output** into Phone Studio's Script Editor (or feed it directly to the canvas).

---

## 5. NOTES

- This prompt mirrors the exact style Phone Studio's built-in `generatePodcastDeepAnalysisScript` flow uses — so output from this manual prompt and the in-app generator should be interchangeable.
- For 2 chapters at once (combined analysis), duplicate the `CHAPTER TITLE / TIME / FOCUS` block and feed both transcripts in `{{TRANSCRIPT_PORTION}}` as two clearly-labelled sections.
- If grounding-with-search is needed, append at the end of the prompt: *"Use the LATEST facts / events / statistics / studies you can find via search."*
- Keep turn count between 22–28 (single chapter) or 28–36 (two chapters) for ~6–10 minute audio runtime.
