import React, { useState, useRef, useCallback } from 'react';
import {
  Music2, FileText, Video, ChevronRight, Loader2, AlertCircle, CheckCircle,
  Play, Pause, Download, Mic2, RefreshCw, Sparkles, Copy, MessageSquare,
  ToggleLeft, ToggleRight, Volume2, Wand2,
} from 'lucide-react';
import { generateLyrics, generateSongAudio } from '../services/geminiService';
import { transcribeAudioGoogleCloud } from '../services/googleCloudService';
import LyricsCanvas from './LyricsCanvas';

type Phase = 'write' | 'song' | 'canvas';
type Style = 'bollywood' | 'rap' | 'pop' | 'ghazal' | 'folk';
type LangKey = 'Hindi' | 'Urdu' | 'Punjabi' | 'English' | 'Hinglish';

const STYLES: { id: Style; label: string; emoji: string; desc: string }[] = [
  { id: 'bollywood', label: 'Bollywood', emoji: '🎬', desc: 'Filmi mukhda + antara' },
  { id: 'rap',       label: 'Rap / Hip-Hop', emoji: '🎤', desc: 'Bars, punchlines, desi slang' },
  { id: 'pop',       label: 'Pop', emoji: '🎵', desc: 'Catchy chorus, emotional' },
  { id: 'ghazal',    label: 'Ghazal', emoji: '🌹', desc: 'Radif, qafia, classical' },
  { id: 'folk',      label: 'Folk / Lok Geet', emoji: '🪘', desc: 'Traditional baithak vibe' },
];

const VOICES = [
  { id: 'Aoede', label: 'Aoede (Female)' },
  { id: 'Charon', label: 'Charon (Male)' },
  { id: 'Fenrir', label: 'Fenrir (Male, deep)' },
  { id: 'Kore', label: 'Kore (Female, soft)' },
  { id: 'Puck', label: 'Puck (Male, expressive)' },
];

const LANGS: LangKey[] = ['Hindi', 'Urdu', 'Punjabi', 'English', 'Hinglish'];

const Section = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-[#0f0f0f] border border-white/5 rounded-2xl p-4 space-y-3 ${className}`} >
    {children}
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">{children}</span>
);

const ErrBox = ({ msg }: { msg: string }) => (
  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-red-400 text-xs">
    <AlertCircle size={13} className="mt-0.5 shrink-0" />
    <span>{msg}</span>
  </div>
);

interface Props {
  initialComments?: string;
  onSkip: () => void;
}

const LyricsGenerator: React.FC<Props> = ({ initialComments = '', onSkip }) => {
  const [phase, setPhase] = useState<Phase>('write');

  // ── Write inputs ─────────────────────────────────────────────
  const [commentsText, setCommentsText] = useState(initialComments);
  const [contextText, setContextText] = useState('');
  const [directMode, setDirectMode] = useState(false);
  const [directLyrics, setDirectLyrics] = useState('');
  const [style, setStyle] = useState<Style>('bollywood');
  const [language, setLanguage] = useState<LangKey>('Hindi');
  const [model, setModel] = useState('gemini-3-flash-preview');

  // ── Generated lyrics ─────────────────────────────────────────
  const [lyrics, setLyrics] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [lyricsError, setLyricsError] = useState('');

  // ── Song audio ───────────────────────────────────────────────
  const [voice, setVoice] = useState('Aoede');
  const [isMakingSong, setIsMakingSong] = useState(false);
  const [songBlob, setSongBlob] = useState<Blob | null>(null);
  const [songUrl, setSongUrl] = useState('');
  const [songError, setSongError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // ── STT transcript ───────────────────────────────────────────
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [transcriptError, setTranscriptError] = useState('');

  // ── Canvas ───────────────────────────────────────────────────
  const [showCanvas, setShowCanvas] = useState(false);

  const handleGenerateLyrics = useCallback(async () => {
    setIsGenerating(true); setLyricsError(''); setLyrics('');
    try {
      const result = await generateLyrics({
        comments: commentsText,
        context: contextText,
        directLyrics: directMode ? directLyrics : '',
        style,
        language,
        model,
      });
      setLyrics(result);
      setPhase('song');
    } catch (e: any) {
      setLyricsError(e.message || 'Lyrics generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [commentsText, contextText, directMode, directLyrics, style, language, model]);

  const handleMakeSong = useCallback(async () => {
    if (!lyrics) return;
    setIsMakingSong(true); setSongError(''); setSongBlob(null);
    if (songUrl) URL.revokeObjectURL(songUrl);
    setSongUrl('');
    try {
      const blob = await generateSongAudio(lyrics, style, voice);
      setSongBlob(blob);
      const url = URL.createObjectURL(blob);
      setSongUrl(url);
    } catch (e: any) {
      setSongError(e.message || 'Song generation failed');
    } finally {
      setIsMakingSong(false);
    }
  }, [lyrics, style, voice, songUrl]);

  const handleTranscribe = useCallback(async () => {
    if (!songBlob) return;
    setIsTranscribing(true); setTranscriptError(''); setTranscript('');
    try {
      const timings = await transcribeAudioGoogleCloud(songBlob, language === 'English' ? 'en-US' : 'hi-IN');
      setTranscript(timings.map(t => t.word).join(' '));
    } catch (e: any) {
      setTranscriptError(e.message || 'Transcription failed');
    } finally {
      setIsTranscribing(false);
    }
  }, [songBlob, language]);

  const togglePlay = () => {
    if (!audioRef.current || !songUrl) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  const downloadSong = () => {
    if (!songBlob) return;
    const a = document.createElement('a');
    a.href = songUrl;
    a.download = `lyrics_song_${Date.now()}.wav`;
    a.click();
  };

  const lyricsLines = lyrics.split('\n').filter(l => l.trim());

  const PHASES: { id: Phase; label: string; icon: React.ElementType }[] = [
    { id: 'write', label: 'Lyrics', icon: FileText },
    { id: 'song', label: 'Song', icon: Music2 },
    { id: 'canvas', label: 'Video Canvas', icon: Video },
  ];

  if (showCanvas) {
    return (
      <LyricsCanvas
        lyricsText={lyrics}
        audioUrl={songUrl}
        songStyle={style}
        onBack={() => setShowCanvas(false)}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg">
            <Music2 size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-white">Song / Lyrics Studio</h2>
            <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">AI Lyrics → Song → Video</p>
          </div>
        </div>
        <button onClick={onSkip} className="text-xs text-gray-600 hover:text-gray-400 border border-white/5 px-3 py-2 rounded-xl transition-all">
          Skip <ChevronRight size={12} className="inline" />
        </button>
      </div>

      {/* Phase tabs */}
      <div className="flex gap-1 bg-[#0f0f0f] border border-white/5 rounded-2xl p-1">
        {PHASES.map(p => {
          const Icon = p.icon;
          const active = phase === p.id;
          const done = (p.id === 'write' && lyrics) || (p.id === 'song' && songUrl);
          return (
            <button
              key={p.id}
              onClick={() => setPhase(p.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-all ${active ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {done && !active ? <CheckCircle size={12} className="text-green-400" /> : <Icon size={13} />}
              {p.label}
            </button>
          );
        })}
      </div>

      {/* ── Phase: Write ─────────────────────────────────────────────── */}
      {phase === 'write' && (
        <div className="space-y-3">
          {/* Comments / Context */}
          <Section>
            <div className="flex items-center justify-between">
              <Label>Comments / Context</Label>
              <button
                onClick={() => setDirectMode(p => !p)}
                className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border transition-all ${directMode ? 'border-purple-500/40 text-purple-400 bg-purple-500/10' : 'border-white/10 text-gray-500'}`}
              >
                {directMode ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                Direct Lyrics Mode
              </button>
            </div>

            {!directMode ? (
              <>
                <textarea
                  value={commentsText}
                  onChange={e => setCommentsText(e.target.value)}
                  rows={5}
                  placeholder="Paste comments from YouTube/Instagram/Reddit here... (ye comments lyrics ki inspiration hongi)"
                  className="w-full bg-[#1a1a1a] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-gray-200 placeholder-gray-700 focus:outline-none focus:border-purple-500/40 resize-none"
                />
                <textarea
                  value={contextText}
                  onChange={e => setContextText(e.target.value)}
                  rows={2}
                  placeholder="Song ka theme / topic kya ho? (e.g. dil tuta hua, zindagi ki tamanna, dosto ki yaad...)"
                  className="w-full bg-[#1a1a1a] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-gray-200 placeholder-gray-700 focus:outline-none focus:border-purple-500/40 resize-none"
                />
              </>
            ) : (
              <textarea
                value={directLyrics}
                onChange={e => setDirectLyrics(e.target.value)}
                rows={8}
                placeholder="Apni lyrics seedha yahan paste karo — Gemini inhe refine/polish kar dega..."
                className="w-full bg-[#1a1a1a] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-gray-200 placeholder-gray-700 focus:outline-none focus:border-purple-500/40 resize-none font-mono"
              />
            )}
          </Section>

          {/* Style picker */}
          <Section>
            <Label>Song Style</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STYLES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-all active:scale-95 ${style === s.id ? 'border-purple-500/50 bg-purple-500/10 text-white' : 'border-white/8 text-gray-500 hover:border-white/15 hover:text-gray-300'}`}
                >
                  <span className="text-base leading-none">{s.emoji}</span>
                  <div>
                    <div className="text-xs font-semibold">{s.label}</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </Section>

          {/* Language + Model */}
          <Section>
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[140px] space-y-1.5">
                <Label>Language</Label>
                <div className="flex flex-wrap gap-1.5">
                  {LANGS.map(l => (
                    <button
                      key={l}
                      onClick={() => setLanguage(l)}
                      className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${language === l ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-white/8 text-gray-600 hover:text-gray-400'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-[160px] space-y-1.5">
                <Label>AI Model</Label>
                <div className="flex flex-col gap-1.5">
                  {[
                    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', badge: 'Fast' },
                    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', badge: 'Best' },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setModel(m.id)}
                      className={`flex items-center justify-between text-[11px] px-3 py-1.5 rounded-lg border transition-all ${model === m.id ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-white/8 text-gray-600 hover:text-gray-400'}`}
                    >
                      {m.label}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${model === m.id ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-gray-700'}`}>{m.badge}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {lyricsError && <ErrBox msg={lyricsError} />}

          <button
            onClick={handleGenerateLyrics}
            disabled={isGenerating || (!commentsText.trim() && !contextText.trim() && !directLyrics.trim())}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-purple-900/30"
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isGenerating ? 'Lyrics likh raha hoon…' : 'Generate Lyrics'}
          </button>
        </div>
      )}

      {/* ── Phase: Song ──────────────────────────────────────────────── */}
      {phase === 'song' && (
        <div className="space-y-3">
          {/* Lyrics display */}
          <Section>
            <div className="flex items-center justify-between">
              <Label>Generated Lyrics</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(lyrics); }}
                  className="text-[11px] text-gray-600 hover:text-gray-400 flex items-center gap-1"
                >
                  <Copy size={11} /> Copy
                </button>
                <button onClick={() => setPhase('write')} className="text-[11px] text-gray-600 hover:text-gray-400 flex items-center gap-1">
                  <RefreshCw size={11} /> Regenerate
                </button>
              </div>
            </div>
            <textarea
              value={lyrics}
              onChange={e => setLyrics(e.target.value)}
              rows={12}
              className="w-full bg-[#1a1a1a] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500/40 resize-none font-mono leading-relaxed"
            />
          </Section>

          {/* Voice + Generate Song */}
          <Section>
            <Label>Song Voice (Gemini TTS)</Label>
            <div className="flex flex-wrap gap-1.5">
              {VOICES.map(v => (
                <button
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${voice === v.id ? 'border-pink-500/50 bg-pink-500/10 text-pink-300' : 'border-white/8 text-gray-600 hover:text-gray-400'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleMakeSong}
              disabled={isMakingSong || !lyrics}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-orange-600 hover:from-pink-500 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 rounded-xl transition-all active:scale-[0.98]"
            >
              {isMakingSong ? <Loader2 size={15} className="animate-spin" /> : <Music2 size={15} />}
              {isMakingSong ? 'Song ban raha hai…' : 'Song Banao (Gemini TTS)'}
            </button>

            {songError && <ErrBox msg={songError} />}

            {/* Audio player */}
            {songUrl && (
              <div className="bg-[#1a1a1a] border border-white/8 rounded-xl p-3 space-y-2">
                <audio
                  ref={audioRef}
                  src={songUrl}
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-600 to-orange-600 flex items-center justify-center shrink-0 active:scale-95"
                  >
                    {isPlaying ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white ml-0.5" />}
                  </button>
                  <div className="flex-1">
                    <div className="text-xs text-white font-medium">Song Audio Ready</div>
                    <div className="text-[11px] text-gray-500">Style: {style} · Voice: {voice}</div>
                  </div>
                  <button onClick={downloadSong} className="text-gray-600 hover:text-gray-400 p-2">
                    <Download size={15} />
                  </button>
                </div>

                {/* STT button */}
                <div className="border-t border-white/5 pt-2 space-y-2">
                  <button
                    onClick={handleTranscribe}
                    disabled={isTranscribing}
                    className="w-full flex items-center justify-center gap-2 border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs font-medium py-2.5 rounded-xl transition-all disabled:opacity-40"
                  >
                    {isTranscribing ? <Loader2 size={13} className="animate-spin" /> : <Mic2 size={13} />}
                    {isTranscribing ? 'Transcript ban raha hai…' : 'Google STT Transcript'}
                  </button>
                  {transcriptError && <ErrBox msg={transcriptError} />}
                  {transcript && (
                    <div className="bg-white/3 border border-white/5 rounded-xl px-3 py-2 text-[11px] text-gray-300 leading-relaxed max-h-28 overflow-y-auto">
                      {transcript}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Section>

          {/* Go to Video Canvas */}
          <button
            onClick={() => setPhase('canvas')}
            className="w-full flex items-center justify-center gap-2 border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 text-sm font-medium py-3 rounded-xl transition-all"
          >
            <Video size={15} /> Video Canvas pe dekho →
          </button>
        </div>
      )}

      {/* ── Phase: Canvas ─────────────────────────────────────────────── */}
      {phase === 'canvas' && (
        <div className="space-y-3">
          {!lyrics && (
            <div className="text-center py-10 text-gray-600 text-sm">
              Pehle lyrics generate karo
              <button onClick={() => setPhase('write')} className="block mx-auto mt-3 text-purple-400 hover:text-purple-300 text-xs">
                ← Lyrics tab pe jao
              </button>
            </div>
          )}
          {lyrics && (
            <button
              onClick={() => setShowCanvas(true)}
              className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm py-4 rounded-xl transition-all active:scale-[0.98] shadow-lg"
            >
              <Video size={18} /> Lyrics Video Canvas Kholein
            </button>
          )}
          {lyrics && (
            <Section>
              <Label>Preview (pehli jhalak)</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {lyricsLines.slice(0, 8).map((line, i) => {
                  const isSection = line.startsWith('[');
                  if (isSection) return (
                    <div key={i} className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest pt-1">{line}</div>
                  );
                  return (
                    <div key={i} className="flex items-start gap-2 bg-white/3 border border-white/5 rounded-xl px-3 py-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-600 to-purple-600 flex items-center justify-center shrink-0 text-[9px] text-white font-bold">A</div>
                      <div>
                        <div className="text-[10px] text-purple-400 font-semibold">@artist</div>
                        <div className="text-xs text-gray-300 leading-snug">{line}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* Bottom skip */}
      <div className="flex justify-end pt-2">
        <button onClick={onSkip} className="text-sm text-gray-600 hover:text-white transition-colors flex items-center gap-1">
          Skip to Generate <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default LyricsGenerator;
