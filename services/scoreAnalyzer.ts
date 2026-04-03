import { DebateSegment } from '../types';

const STORAGE_KEY = 'debateforge_segment_scores';

const ARGUMENT_KEYWORDS = [
    'evidence', 'research', 'study', 'studies', 'data', 'statistics', 'statistic',
    'fact', 'facts', 'proven', 'prove', 'proof', 'demonstrate', 'shows', 'indicates',
    'according', 'report', 'survey', 'analysis', 'example', 'instance', 'because',
    'therefore', 'thus', 'hence', 'consequently', 'result', 'conclude', 'conclusion',
    'argument', 'point', 'reason', 'basis', 'foundation', 'support', 'claim',
    'clearly', 'obviously', 'undeniably', 'certainly', 'significant', 'important',
    'critical', 'crucial', 'essential', 'fundamental', 'key', 'major',
    'percent', '%', 'million', 'billion', 'trillion', 'thousand',
    'scientific', 'expert', 'professor', 'doctor', 'journal', 'published',
    'experiment', 'test', 'trial', 'measured', 'observed', 'found', 'discovered',
];

const TRANSITION_WORDS = [
    'however', 'furthermore', 'moreover', 'nevertheless', 'nonetheless',
    'additionally', 'consequently', 'therefore', 'although', 'despite',
    'whereas', 'while', 'similarly', 'likewise', 'alternatively',
    'on the other hand', 'in contrast', 'in addition', 'as a result',
    'for example', 'for instance', 'in fact', 'indeed', 'specifically',
    'particularly', 'especially', 'notably', 'importantly',
];

const FILLER_WORDS = [
    'um', 'uh', 'like', 'basically', 'literally', 'actually', 'yeah',
    'ok', 'okay', 'so', 'right', 'you know', 'i mean', 'kind of', 'sort of',
];

export function analyzeSegmentScore(segment: DebateSegment): number {
    const text = (segment.text || '').trim();
    if (!text) return 6.0;

    const lower = text.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    if (wordCount < 3) return 6.0;

    // ── 1. Word count score (more words = more content) ──────────────
    // Ideal debate turn: 40-120 words. Bonus up to 1.0
    const wordScore = wordCount < 10 ? 0
        : wordCount < 30  ? 0.2
        : wordCount < 60  ? 0.5
        : wordCount < 100 ? 0.8
        : wordCount < 180 ? 1.0
        : 0.9; // too long can become rambling

    // ── 2. Vocabulary richness (unique words / total words) ──────────
    const uniqueWords = new Set(words.map(w => w.replace(/[^a-z]/g, ''))).size;
    const richness = uniqueWords / wordCount;
    const richnessScore = richness > 0.75 ? 1.0
        : richness > 0.60 ? 0.7
        : richness > 0.45 ? 0.4
        : 0.1;

    // ── 3. Argument keyword presence ─────────────────────────────────
    const keywordHits = ARGUMENT_KEYWORDS.filter(kw => lower.includes(kw)).length;
    const keywordScore = keywordHits === 0 ? 0
        : keywordHits === 1 ? 0.3
        : keywordHits === 2 ? 0.6
        : keywordHits === 3 ? 0.9
        : 1.0;

    // ── 4. Transition words (shows structured thinking) ──────────────
    const transitionHits = TRANSITION_WORDS.filter(tw => lower.includes(tw)).length;
    const transitionScore = Math.min(1.0, transitionHits * 0.4);

    // ── 5. Filler word penalty ────────────────────────────────────────
    const fillerHits = FILLER_WORDS.filter(fw => lower.includes(fw)).length;
    const fillerPenalty = Math.min(0.5, fillerHits * 0.1);

    // ── 6. Question mark (rhetorical questions = engagement) ─────────
    const hasQuestion = text.includes('?');
    const questionBonus = hasQuestion ? 0.15 : 0;

    // ── 7. Duration bonus (longer duration = more time used well) ────
    const duration = segment.duration || 0;
    const durationScore = duration > 30 ? 0.3
        : duration > 15 ? 0.2
        : duration > 8  ? 0.1
        : 0;

    // ── Combine ───────────────────────────────────────────────────────
    // Base: 6.0. Max possible additions: ~4.55. Target range: 6.0–9.9
    const raw = 6.0
        + wordScore      * 0.8
        + richnessScore  * 0.7
        + keywordScore   * 0.8
        + transitionScore * 0.5
        + questionBonus
        + durationScore
        - fillerPenalty;

    // Clamp to 6.0–9.9 and round to 1 decimal
    const clamped = Math.min(9.9, Math.max(6.0, raw));
    return Math.round(clamped * 10) / 10;
}

export function analyzeAllScores(script: DebateSegment[]): number[] {
    return script.map(seg => analyzeSegmentScore(seg));
}

// ── LocalStorage save/load ────────────────────────────────────────────────

function makeKey(script: DebateSegment[]): string {
    // Build a lightweight fingerprint from segment speakers + first 20 chars of text
    const sig = script.map(s => `${s.speaker}:${(s.text || '').slice(0, 20)}`).join('|');
    // Simple hash
    let h = 0;
    for (let i = 0; i < sig.length; i++) {
        h = (Math.imul(31, h) + sig.charCodeAt(i)) | 0;
    }
    return `${STORAGE_KEY}_${Math.abs(h)}`;
}

export function saveScores(script: DebateSegment[], scores: number[]): void {
    try {
        const key = makeKey(script);
        localStorage.setItem(key, JSON.stringify(scores));
    } catch {
        // localStorage might be unavailable (private browsing, quota exceeded)
    }
}

export function loadScores(script: DebateSegment[]): number[] | null {
    try {
        const key = makeKey(script);
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === script.length) {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}
