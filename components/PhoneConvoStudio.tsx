import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Square, Download, Plus, Trash2, X, Check,
  Volume2, Smartphone, Palette, Video,
  ChevronDown, ChevronUp, Loader2,
  MonitorSmartphone,
} from 'lucide-react';
import { CanvasRenderer, PhoneConfig, ScriptTurn, StudioState, AnimStyle } from '../services/phoneCanvasRenderer';
import { renderVideoOffline } from '../services/videoRenderer';
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

// ─── ScriptGeneratorPanel ─────────────────────────────────────────────────────

interface GenPanelProps {
  genStep: 1 | 2; setGenStep: (s: 1 | 2) => void;
  genStyle: string; setGenStyle: (s: string) => void;
  genTopic: string; setGenTopic: (s: string) => void;
  genYtMode: boolean; setGenYtMode: (b: boolean) => void;
  genYtUrl: string; setGenYtUrl: (s: string) => void;
  genTurns: number; setGenTurns: (n: number) => void;
  phones: PhoneConfig[];
  generating: boolean;
  onGenerate: () => void;
}

const ScriptGeneratorPanel: React.FC<GenPanelProps> = ({
  genStep, setGenStep, genStyle, setGenStyle,
  genTopic, setGenTopic, genYtMode, setGenYtMode,
  genYtUrl, setGenYtUrl, genTurns, setGenTurns,
  phones, generating, onGenerate,
}) => {
  const sel = CONVO_STYLES.find(s => s.id === genStyle)!;

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

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
                  onClick={() => setGenStyle(style.id)}
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
          <button
            onClick={() => setGenStep(2)}
            style={{
              marginTop: 4, padding: '11px', borderRadius: 12, border: 'none',
              background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Next: Topic Set Karo →
          </button>
        </div>
      )}

      {/* ── Step 2: Topic + YouTube ── */}
      {genStep === 2 && (
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

          {/* Turns count */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Conversation Length
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{genTurns} turns (~{Math.round(genTurns * 12)}s)</span>
            </div>
            <input
              type="range" min={6} max={24} step={2} value={genTurns}
              onChange={e => setGenTurns(+e.target.value)}
              style={{ width: '100%', accentColor: '#ef4444' }}
            />
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
}

// ─── Component ────────────────────────────────────────────────────────────────

const PhoneConvoStudio: React.FC<Props> = ({ mainScript }) => {
  const [phones, setPhones]   = useState<PhoneConfig[]>([]);
  const [script, setScript]   = useState<ScriptTurn[]>([]);
  const [bg, setBg]           = useState('#f0f4f8');
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [subtitleBg, setSubtitleBg]           = useState<'dark' | 'light' | 'none'>('dark');
  const [subtitleSize, setSubtitleSize]       = useState(1.0);
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
      return {
        id: seg.id,
        phoneId: isNarrator ? 'narrator' : speakerToPhoneId(seg.speaker),
        text: seg.text,
        isNarrator,
        // Narrator cards get a fixed 4-second display time
        durationMs: isNarrator
          ? 4000
          : seg.duration
            ? Math.round(seg.duration * 1000)
            : Math.max(2500, seg.text.length * 75),
        audioUrl: isNarrator ? undefined : seg.audioUrl,
        wordTimings: isNarrator ? undefined : (seg.wordTimings
          ? seg.wordTimings.map(wt => ({ word: wt.word, startTime: wt.start, endTime: wt.end }))
          : seg.audioUrl
            ? estimateWordTimings(seg.text, seg.duration ?? seg.text.length * 0.075)
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
  }), [phones, script, bg, bgImageUrl, spacing, scale, startTime, subtitleEnabled, subtitleBg, subtitleSize]);

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
    // Cancelled by another call
    if (audioCtxRef.current !== actx) return null;

    // ── Build actual durations from decoded buffers ───────────────────────
    // Use real buf.duration where audio exists — fixes visual/audio desync
    const actualDurations = buffers.map((buf, i) =>
      buf ? Math.round(buf.duration * 1000) : script[i].durationMs
    );

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
      src.connect(actx.destination);
      src.start(scheduleAtSec, audioOffsetSec);
      audioSourcesRef.current.push(src);
    });

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
    r.play();
    setIsPlaying(true);
    await scheduleAudioFrom(startMs);
  };

  // Visual-only seek (called continuously while dragging)
  const seek = (ms: number) => {
    rendererRef.current?.seek(ms);
    setCurrentTime(ms);
  };

  // Full seek: update visual + restart audio from new position (called on mouse-up)
  const seekWithAudio = useCallback((ms: number) => {
    rendererRef.current?.seek(ms);
    setCurrentTime(ms);
    if (isPlayingRef.current) {
      scheduleAudioFrom(ms);
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

    setExporting(true); setExportProgress(0); setExportStatus('Audio decode ho raha hai…');

    try {
      // ── 1. Decode all audio and mix into one Float32Array ─────────────────
      const actx = new AudioContext();
      const decoded = await Promise.all(
        script.map(t =>
          t.audioUrl
            ? fetch(t.audioUrl).then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).catch(() => null)
            : Promise.resolve(null)
        )
      );
      const sampleRate = decoded.find(Boolean)?.sampleRate ?? 24000;
      const totalSamples = Math.ceil(totalSec * sampleRate);
      const mixed = new Float32Array(totalSamples);
      let offsetMs = 0;
      decoded.forEach((buf, i) => {
        if (buf) {
          const startSample = Math.floor(offsetMs / 1000 * sampleRate);
          const ch = buf.getChannelData(0);
          for (let j = 0; j < ch.length && startSample + j < totalSamples; j++)
            mixed[startSample + j] += ch[j];
        }
        offsetMs += script[i].durationMs;
      });
      await actx.close();

      // ── 2. Create offscreen renderer at 1080p ─────────────────────────────
      setExportStatus('Video render ho raha hai…');
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = W; exportCanvas.height = H;
      const state = buildState();
      const exportRenderer = new CanvasRenderer(exportCanvas, state);

      // ── 3. Offline render via WebCodecs (mp4-muxer) — much faster ─────────
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
          exportRenderer.drawFrame();
          offCtx.drawImage(exportCanvas, 0, 0, W, H);
        },
        onProgress: p => {
          setExportProgress(Math.round(p * 100));
        },
      });

      if (!blob) throw new Error('Render empty return hua');

      // ── 4. Download ───────────────────────────────────────────────────────
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `phone-studio-${Date.now()}.mp4`; a.click();
      URL.revokeObjectURL(url);
      toast.success('✓ 1080p MP4 download ho gaya!');
    } catch (err: any) {
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
        if (match) {
          const parsed = JSON.parse(match[0]);
          topicContext = `Based on this YouTube video:\n${parsed.topic}\n\nKey discussion points to explore:\n${(parsed.points as string[]).map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
        } else {
          topicContext = rawText.slice(0, 1500);
        }
      }

      // ── Generate conversation script via Gemini ────────────────────────────
      toast.info('Script generate ho raha hai…');
      const prompt = `You are writing a script for a phone conversation video between two AI assistants: "${speaker1}" and "${speaker2}".

TOPIC/CONTEXT:
${topicContext}

CONVERSATION STYLE:
${style.prompt}

RULES:
1. Generate exactly ${genTurns} turns total, alternating between speakers (start with ${speaker1}).
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

      setScript(newScript);
      setTab('visual');
      toast.success(`✓ ${newScript.length} turns generate ho gaye!`);

    } catch (err: any) {
      console.error('Generate error:', err);
      toast.error(`Generate failed: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }, [genStyle, genTopic, genYtMode, genYtUrl, genTurns, phones]);

  // ── No script fallback → show generator ───────────────────────────────────

  if (!mainScript.length && !script.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#050507', color: '#e0e0e0', fontFamily: 'inherit' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <MonitorSmartphone size={18} color="#ef4444" />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Phone Studio — Script Generator</span>
        </div>
        <ScriptGeneratorPanel
          genStep={genStep} setGenStep={setGenStep}
          genStyle={genStyle} setGenStyle={setGenStyle}
          genTopic={genTopic} setGenTopic={setGenTopic}
          genYtMode={genYtMode} setGenYtMode={setGenYtMode}
          genYtUrl={genYtUrl} setGenYtUrl={setGenYtUrl}
          genTurns={genTurns} setGenTurns={setGenTurns}
          phones={phones}
          generating={generating}
          onGenerate={handleGenerate}
        />
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
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
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
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ════ SETTINGS / VISUAL TAB ════ */}
        {tab === 'visual' && (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

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
                          style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 11, fontFamily: 'monospace', outline: 'none', width: 50, textAlign: 'right' }}
                          placeholder="09:41"
                        />
                      </div>
                    </div>
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
                                padding: '4px 9px', borderRadius: 20,
                                border: `1px solid ${sel ? model.color : 'rgba(255,255,255,0.1)'}`,
                                background: sel ? model.color + '30' : 'rgba(255,255,255,0.04)',
                                color: sel ? '#fff' : 'rgba(255,255,255,0.45)',
                                fontSize: 11, fontWeight: sel ? 700 : 500,
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
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: phone.color, flexShrink: 0 }} />
                      <input
                        value={phone.name}
                        onChange={e => updatePhone(phone.id, { name: e.target.value })}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, outline: 'none', fontFamily: 'inherit' }}
                      />
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                        {script.filter(t => t.phoneId === phone.id).length} turns
                      </span>
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
                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                          {PRESET_COLORS.map(pc => (
                            <div
                              key={pc.color}
                              onClick={() => updatePhone(phone.id, { color: pc.color, screenColor: pc.screen })}
                              title={pc.label}
                              style={{
                                width: 24, height: 24, borderRadius: '50%', background: pc.color, cursor: 'pointer',
                                boxShadow: phone.color === pc.color
                                  ? `0 0 0 2px #050507, 0 0 0 3.5px ${pc.color}`
                                  : 'none',
                                transform: phone.color === pc.color ? 'scale(1.18)' : 'scale(1)',
                                transition: 'all 0.15s',
                              }}
                            />
                          ))}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="color" value={phone.color}
                              onChange={e => updatePhone(phone.id, { color: e.target.value })}
                              style={{ width: 24, height: 24, border: 'none', padding: 0, background: 'none', cursor: 'pointer', borderRadius: '50%' }}
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
                            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#fff', fontSize: 11, fontFamily: 'monospace', outline: 'none', width: 52, textAlign: 'center', padding: '2px 4px' }}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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

                {/* Sync info */}
                <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                  <span style={{ color: '#86efac', fontWeight: 700 }}>Word-by-word mode:</span> Subtitles ek-ek word karke aate hain — naturally, jaise typing. Sync ki hui files (STT) use hoti hain agar available ho, warna weight estimate.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ EXPORT TAB ════ */}
        {tab === 'export' && (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

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
