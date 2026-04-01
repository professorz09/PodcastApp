import React, { useState, useRef, useEffect } from 'react';
import { DebateSegment, YoutubeImportData } from '../types';
import { ChevronLeft, ArrowRight, Edit2, Sparkles, Loader2, Save, RefreshCw, Trash2, User, AlignLeft, Clock, Languages, Quote, Copy, Check, RotateCcw, X, Scissors, Play, Download, BookOpen, MapPin } from 'lucide-react';
import { rewriteScriptSegment, translateScriptToHindi, generateTopicQuote, analyzeTimelineCuts, analyzeContextBridgeTimeline, TimelineCut } from '../services/geminiService';

interface ScriptEditorProps {
  script: DebateSegment[];
  onUpdateScript: React.Dispatch<React.SetStateAction<DebateSegment[]>>;
  speakerVoices?: Record<string, string>;
  onNext: () => void;
  onBack: () => void;
  youtubeData?: YoutubeImportData | null;
  scriptStyle?: string;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({ script, onUpdateScript, onNext, onBack, youtubeData, speakerVoices, scriptStyle }) => {
  const [editMode, setEditMode] = useState<boolean>(false);
  
  // Translate State
  const [translateView, setTranslateView] = useState<boolean>(false);
  const [translatedTexts, setTranslatedTexts] = useState<string[] | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Inline Rewrite State
  const [activeRewriteId, setActiveRewriteId] = useState<string | null>(null);
  const [rewritePrompt, setRewritePrompt] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  
  // Delete Confirmation State
  const [segmentToDelete, setSegmentToDelete] = useState<string | null>(null);

  // Topic Quote State
  const [quoteData, setQuoteData] = useState<{ quote: string; author: string; title: string } | null>(null);
  const [isGeneratingQuote, setIsGeneratingQuote] = useState(false);
  const [quoteCopied, setQuoteCopied] = useState(false);

  // Timeline Cuts State
  const [timelineCuts, setTimelineCuts] = useState<TimelineCut[] | null>(null);
  const [isAnalyzingTimeline, setIsAnalyzingTimeline] = useState(false);
  const [timelineCutsCopied, setTimelineCutsCopied] = useState(false);

  // Source Timeline State (for context_bridge style)
  const [showSourceTimeline, setShowSourceTimeline] = useState(false);
  const [sourceTimelineCopied, setSourceTimelineCopied] = useState(false);

  // Context Bridge panel state — 2 compact buttons (timeline + quote)
  const [activeContextPanel, setActiveContextPanel] = useState<'timeline' | 'quote' | null>(null);
  const [contextTimeline, setContextTimeline] = useState<TimelineCut[] | null>(null);
  const [isAnalyzingContextTimeline, setIsAnalyzingContextTimeline] = useState(false);
  const [contextTimelineCopied, setContextTimelineCopied] = useState(false);

  if (!script || script.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 bg-[#0a0a0a]">
        <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 text-zinc-500 border border-zinc-800">
          <Edit2 size={32} />
        </div>
        <h2 className="text-3xl font-light text-white mb-3 tracking-tight">No Script Generated</h2>
        <p className="text-zinc-400 mb-8 font-light">Please go back and generate a script first.</p>
        <button 
          onClick={onBack}
          className="bg-white text-black hover:bg-zinc-200 px-8 py-3 rounded-full font-medium transition-colors flex items-center gap-2"
        >
          <ChevronLeft size={20} /> Go Back
        </button>
      </div>
    );
  }

  const NARRATOR_KEYS = ['Narrator', 'नैरेटर'];
  const isNarrator = (s: string) => NARRATOR_KEYS.includes(s);

  // Extract unique speakers
  const uniqueSpeakers: string[] = Array.from(new Set(script.map(s => s.speaker).filter(s => !isNarrator(s))));
  if (uniqueSpeakers.length === 0) {
      uniqueSpeakers.push('Speaker 1', 'Speaker 2');
  }

  const handleSpeakerChange = (id: string) => {
    const updatedScript = script.map(seg => {
      if (seg.id === id) {
        const allOptions = ['Narrator', ...uniqueSpeakers];
        const currentIndex = allOptions.indexOf(seg.speaker);
        const nextIndex = (currentIndex + 1) % allOptions.length;
        return { ...seg, speaker: allOptions[nextIndex] };
      }
      return seg;
    });
    onUpdateScript(updatedScript);
  };

  const handleTextChange = (id: string, newText: string) => {
    const updatedScript = script.map(seg => 
      seg.id === id ? { ...seg, text: newText } : seg
    );
    onUpdateScript(updatedScript);
  };

  const handleDelete = (id: string) => {
    setSegmentToDelete(id);
  };

  const toggleInlineRewrite = (id: string) => {
    if (activeRewriteId === id) {
      setActiveRewriteId(null);
    } else {
      setActiveRewriteId(id);
      setRewritePrompt("");
    }
  };

  const confirmRewrite = async () => {
    if (!activeRewriteId) return;
    
    const segment = script.find(s => s.id === activeRewriteId);
    if (!segment) return;

    setIsRewriting(true);
    try {
      const instruction = rewritePrompt.trim() || "Make it more persuasive and engaging.";
      const newText = await rewriteScriptSegment(segment.text, segment.speaker, instruction);
      handleTextChange(activeRewriteId, newText);
      setActiveRewriteId(null);
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to rewrite segment. Please try again.");
    } finally {
      setIsRewriting(false);
    }
  };

  const handleTranslate = async () => {
    // If translation already exists, just toggle view — no re-fetch
    if (translatedTexts) {
      setTranslateView(prev => !prev);
      return;
    }
    setIsTranslating(true);
    try {
      const texts = await translateScriptToHindi(script);
      setTranslatedTexts(texts);
      setTranslateView(true);
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Translation failed. Please try again.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleGenerateQuote = async () => {
    setIsGeneratingQuote(true);
    setQuoteData(null);
    try {
      const fullText = script.map(s => s.text).join(' ');
      const result = await generateTopicQuote(fullText);
      setQuoteData(result);
    } catch (e: any) {
      alert(e.message || 'Quote generation failed. Please try again.');
    } finally {
      setIsGeneratingQuote(false);
    }
  };

  const handleCopyQuote = () => {
    if (!quoteData) return;
    navigator.clipboard.writeText(`"${quoteData.quote}" — ${quoteData.author}`).then(() => {
      setQuoteCopied(true);
      setTimeout(() => setQuoteCopied(false), 2500);
    });
  };

  // ── Timeline Cuts ──────────────────────────────────────────────────────
  const formatSec = (sec: number): string => {
    if (sec < 0) return '?';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getTimedTranscript = (): { text: string; start: number; end: number; duration: number }[] => {
    // 1. Try youtubeData prop first
    if (youtubeData?.transcript && youtubeData.transcript.length > 0) {
      return youtubeData.transcript;
    }
    // 2. Fallback: read directly from YoutubeImporter's sessionStorage
    try {
      const raw = sessionStorage.getItem('yt_importer_v1');
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.transcript) && saved.transcript.length > 0) {
          return saved.transcript;
        }
      }
    } catch { /* ignore */ }
    return [];
  };

  const handleAnalyzeTimeline = async () => {
    setIsAnalyzingTimeline(true);
    setTimelineCuts(null);
    try {
      const transcript = getTimedTranscript();
      if (transcript.length === 0) {
        alert('Please fetch the transcript in the YouTube Import section first — the timestamped transcript will be used.');
        return;
      }
      // Group segments into points: each point starts at a Narrator segment
      // and includes all following Speaker segments until the next Narrator
      const points: { index: number; text: string }[] = [];
      let currentGroup: string[] = [];
      let pointIndex = 1;

      for (const seg of script) {
        if (isNarrator(seg.speaker)) {
          if (currentGroup.length > 0) {
            points.push({ index: pointIndex++, text: currentGroup.join(' | ') });
          }
          currentGroup = [`[Narrator] ${seg.text}`];
        } else {
          currentGroup.push(`[${seg.speaker}] ${seg.text}`);
        }
      }
      if (currentGroup.length > 0) {
        points.push({ index: pointIndex++, text: currentGroup.join(' | ') });
      }

      // Fallback: no Narrator at all — treat each segment as its own point
      const finalPoints = points.length > 0 ? points : script.map((s, i) => ({
        index: i + 1,
        text: `[${s.speaker}] ${s.text}`,
      }));

      if (finalPoints.length === 0) {
        alert('No segments found in the script.');
        return;
      }
      const cuts = await analyzeTimelineCuts(finalPoints, transcript);
      setTimelineCuts(cuts);
    } catch (e: any) {
      alert(e.message || 'Timeline analysis failed. Please try again.');
    } finally {
      setIsAnalyzingTimeline(false);
    }
  };

  // Context Bridge: match each analyst segment against the actual timed transcript
  const runContextBridgeTimeline = () => {
    setActiveContextPanel('timeline');
    const transcript = getTimedTranscript();
    if (transcript.length === 0) {
      // No timed transcript — show sourceTimestamp fallback
      setContextTimeline([]);
      return;
    }
    const segments = script.map((s, i) => ({
      index: i + 1,
      text: s.text,
      sourceTimestamp: s.sourceTimestamp,
    }));
    if (segments.length === 0) return;
    const cuts = analyzeContextBridgeTimeline(segments, transcript);
    setContextTimeline(cuts);
  };

  const handleAnalyzeContextTimeline = () => {
    if (contextTimeline && contextTimeline.length > 0) {
      // Already analyzed — just show it
      setActiveContextPanel('timeline');
      return;
    }
    runContextBridgeTimeline();
  };

  const handleCopyTimeline = () => {
    if (!timelineCuts) return;
    const text = timelineCuts
      .map(c => {
        if (c.startSec < 0) return `${c.index}. [Not Found] — ${c.text}`;
        const ts = `${c.index}. ${formatSec(c.startSec)} - ${formatSec(c.endSec)}`;
        const preview = c.transcriptPreview ? `\n   "${c.transcriptPreview}"` : '';
        return ts + preview;
      })
      .join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setTimelineCutsCopied(true);
      setTimeout(() => setTimelineCutsCopied(false), 2500);
    });
  };

  const getSpeakerColorClass = (speaker: string) => {
      if (isNarrator(speaker)) return 'bg-zinc-800 text-zinc-300';
      const index = uniqueSpeakers.indexOf(speaker);
      if (index === 0) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      if (index === 1) return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      if (index === 2) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  };

  const getStats = (text: string) => {
    const words = text.trim().split(/\s+/).length;
    const seconds = Math.ceil((words / 150) * 60);
    return { words, seconds };
  };

  const speakerAccent = (speaker: string) => {
    if (isNarrator(speaker)) return { bar: 'bg-zinc-600', badge: 'bg-zinc-800/80 text-zinc-400 border-zinc-700/50' };
    const idx = uniqueSpeakers.indexOf(speaker);
    const palette = [
      { bar: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
      { bar: 'bg-rose-500', badge: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
      { bar: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
      { bar: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
    ];
    return palette[idx] ?? palette[0];
  };

  return (
    <div className="w-full h-full bg-[#050505] text-zinc-100 flex flex-col overflow-hidden relative font-sans">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="h-14 md:h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-6 bg-[#050505]/95 backdrop-blur-xl z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-zinc-500 hover:text-white flex items-center gap-1.5 transition-colors px-2 py-1.5 rounded-lg hover:bg-white/5">
            <ChevronLeft size={16} />
            <span className="hidden sm:inline text-sm font-medium">Back</span>
          </button>
          <div className="h-5 w-px bg-white/8 hidden sm:block" />
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Script Editor</h2>
            <span className="text-[10px] font-mono bg-white/8 text-zinc-400 px-1.5 py-0.5 rounded-md border border-white/5">{script.length} segments</span>
            {translateView && <span className="text-[10px] bg-orange-500/15 text-orange-300 px-1.5 py-0.5 rounded-md border border-orange-500/20">Hindi View</span>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          <button
            onClick={handleTranslate}
            disabled={isTranslating}
            className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
              translateView ? 'bg-orange-500/15 text-orange-300 border-orange-500/25' : 'bg-white/5 text-zinc-400 border-white/5 hover:text-zinc-200 hover:bg-white/8'
            }`}
          >
            {isTranslating ? <Loader2 size={13} className="animate-spin" /> : <Languages size={13} />}
            <span className="hidden sm:inline">{translateView ? 'Original' : 'Hindi'}</span>
          </button>

          <button
            onClick={() => { setEditMode(!editMode); if (translateView) setTranslateView(false); }}
            className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
              editMode ? 'bg-white/10 text-white border-white/15' : 'bg-white/5 text-zinc-400 border-white/5 hover:text-zinc-200 hover:bg-white/8'
            }`}
          >
            {editMode ? <Save size={13} /> : <Edit2 size={13} />}
            <span className="hidden sm:inline">{editMode ? 'Done' : 'Edit'}</span>
          </button>

          <button
            onClick={onNext}
            className="h-8 bg-white text-black px-4 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 hover:bg-zinc-200"
          >
            <span className="hidden sm:inline">Next</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Translation notice */}
      {translateView && (
        <div className="shrink-0 bg-orange-500/8 border-b border-orange-500/15 px-4 py-2 text-[11px] text-orange-300/80 flex items-center gap-2">
          <Languages size={12} />
          Hindi translation preview — audio will use the original script.
        </div>
      )}

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 md:p-6 custom-scrollbar">
        <div className="max-w-2xl mx-auto pb-12 space-y-3">

          {script.map((seg, idx) => {
            const displayText = translateView && translatedTexts?.[idx] != null ? translatedTexts[idx] : seg.text;
            const stats = getStats(seg.text);
            const accent = speakerAccent(seg.speaker);
            const isRewiting = isRewriting && activeRewriteId === seg.id;

            return (
              <div key={seg.id} className="rounded-2xl border border-white/6 bg-[#0c0c0c] overflow-hidden transition-all">

                {/* ── Card header row ── */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.015]">
                  <div className="flex items-center gap-2.5">
                    {/* Segment number */}
                    <span className="text-[10px] font-mono text-zinc-600 w-5 text-center">{idx + 1}</span>

                    {/* Speaker badge */}
                    <button
                      onClick={() => editMode && !translateView && handleSpeakerChange(seg.id)}
                      disabled={!editMode || translateView}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 border transition-all ${accent.badge} ${editMode && !translateView ? 'cursor-pointer hover:brightness-125 active:scale-95' : 'cursor-default'}`}
                    >
                      <User size={11} />
                      {seg.speaker}
                      {editMode && !translateView && <RefreshCw size={9} className="opacity-40" />}
                    </button>

                    {/* Stats */}
                    <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-600">
                      <span>{stats.words}w</span>
                      <span className="text-zinc-700">·</span>
                      <span>~{stats.seconds}s</span>
                    </div>
                  </div>

                  {/* ── Action buttons — ALWAYS visible in edit mode ── */}
                  {editMode && !translateView && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleInlineRewrite(seg.id)}
                        className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all ${
                          activeRewriteId === seg.id
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : 'bg-purple-500/8 text-purple-400/70 border-purple-500/15 hover:bg-purple-500/15 hover:text-purple-300'
                        }`}
                      >
                        <Sparkles size={12} />
                        <span className="hidden sm:inline">Rewrite</span>
                      </button>
                      <button
                        onClick={() => handleDelete(seg.id)}
                        className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border bg-rose-500/8 text-rose-400/70 border-rose-500/15 hover:bg-rose-500/15 hover:text-rose-300 transition-all ml-0.5"
                      >
                        <Trash2 size={12} />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Card body ── */}
                <div className="px-4 py-3">
                  {/* Coloured left accent bar */}
                  <div className="flex gap-3">
                    <div className={`w-0.5 rounded-full shrink-0 ${accent.bar} opacity-40 self-stretch`} />
                    <div className="flex-1 min-w-0">
                      {editMode && !translateView ? (
                        <textarea
                          value={seg.text}
                          onChange={(e) => handleTextChange(seg.id, e.target.value)}
                          className="w-full bg-transparent border-none p-0 focus:ring-0 resize-none text-sm md:text-base font-light leading-relaxed text-zinc-200 placeholder-zinc-700 font-sans"
                          rows={Math.max(2, Math.ceil(seg.text.length / 60))}
                          spellCheck={false}
                          placeholder="Enter dialogue here..."
                        />
                      ) : (
                        <p className={`text-sm md:text-base font-light leading-relaxed whitespace-pre-wrap font-sans ${translateView ? 'text-orange-100/80' : 'text-zinc-300'}`}>
                          {displayText}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Inline AI Rewrite Panel ── */}
                {editMode && !translateView && activeRewriteId === seg.id && (
                  <div className="mx-3 mb-3 p-3 bg-purple-950/20 border border-purple-500/20 rounded-xl">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <Sparkles size={12} className="text-purple-400" />
                      <span className="text-[11px] font-semibold text-purple-300 uppercase tracking-wide">AI Rewrite</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={rewritePrompt}
                        onChange={(e) => setRewritePrompt(e.target.value)}
                        placeholder="Make it shorter, funnier, more formal..."
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-purple-500/40 focus:outline-none transition-all"
                        onKeyDown={(e) => { if (e.key === 'Enter') confirmRewrite(); }}
                        autoFocus
                      />
                      <button
                        onClick={() => setActiveRewriteId(null)}
                        className="px-2.5 py-2 rounded-lg text-xs text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all"
                      >
                        <X size={13} />
                      </button>
                      <button
                        onClick={confirmRewrite}
                        disabled={isRewiting}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5 min-w-[72px] justify-center"
                      >
                        {isRewiting ? <Loader2 size={12} className="animate-spin" /> : <><Sparkles size={12} /> Go</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Context Bridge: 3-button row + panels ────────────────────── */}
          {scriptStyle === 'context_bridge' && (
            <div className="mt-6 mb-2">
              {/* 3 compact buttons in a row */}
              <div className="grid grid-cols-3 gap-2">
                {/* Source Timeline */}
                <button
                  onClick={() => {
                    if (activeContextPanel === 'timeline') { setActiveContextPanel(null); return; }
                    handleAnalyzeContextTimeline();
                  }}
                  disabled={isAnalyzingContextTimeline}
                  className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border transition-all disabled:opacity-50 ${
                    activeContextPanel === 'timeline'
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {isAnalyzingContextTimeline
                    ? <Loader2 size={15} className="animate-spin text-cyan-400" />
                    : <MapPin size={15} className={activeContextPanel === 'timeline' ? 'text-cyan-400' : ''} />
                  }
                  <span className="text-[11px] font-medium">Source Timeline</span>
                </button>

                {/* Quote */}
                <button
                  onClick={() => {
                    if (activeContextPanel === 'quote') { setActiveContextPanel(null); return; }
                    setActiveContextPanel('quote');
                    if (!quoteData) handleGenerateQuote();
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border transition-all ${
                    activeContextPanel === 'quote'
                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Quote size={15} className={activeContextPanel === 'quote' ? 'text-amber-400' : ''} />
                  <span className="text-[11px] font-medium">Quote</span>
                </button>
              </div>

              {/* ── Source Timeline Panel ── */}
              {activeContextPanel === 'timeline' && (
                <div className="mt-3 rounded-2xl overflow-hidden border border-cyan-500/20 bg-[#050e12]">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-cyan-400" />
                      <span className="text-xs font-semibold text-cyan-300 uppercase tracking-widest">Source Timeline</span>
                      <span className="text-[10px] text-zinc-600 ml-1">
                        ({contextTimeline && contextTimeline.length > 0 ? contextTimeline.length : script.length} pts)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const lines = (contextTimeline && contextTimeline.length > 0)
                            ? contextTimeline.map((c, i) => {
                                const seg = script[c.index - 1] || script[i];
                                const ts = c.startSec >= 0 ? formatSec(c.startSec) : (seg?.sourceTimestamp || '?');
                                return `[${ts}] ${(seg?.text || c.text || '').slice(0, 120)}`;
                              })
                            : script.map(s => `[${s.sourceTimestamp || '?'}] ${s.text.slice(0, 120)}`);
                          navigator.clipboard.writeText(lines.join('\n')).then(() => {
                            setContextTimelineCopied(true);
                            setTimeout(() => setContextTimelineCopied(false), 2500);
                          });
                        }}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                      >
                        {contextTimelineCopied ? <><Check size={12} className="text-green-400" /> Copied!</> : <><Copy size={12} /> Copy All</>}
                      </button>
                      <button onClick={() => setActiveContextPanel(null)} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={14} /></button>
                    </div>
                  </div>

                  {/* Loading state */}
                  {isAnalyzingContextTimeline && (
                    <div className="flex items-center gap-3 px-4 py-6 text-zinc-500 text-sm">
                      <Loader2 size={15} className="animate-spin text-cyan-400 shrink-0" />
                      <span>Matching timestamps from transcript… ({script.length} segments)</span>
                    </div>
                  )}

                  {/* Entries */}
                  {!isAnalyzingContextTimeline && (
                  <div className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
                    {(contextTimeline && contextTimeline.length > 0
                      ? contextTimeline.map((c, i) => {
                          const seg = script[c.index - 1] || script[i];
                          return { idx: i, hasReal: c.startSec >= 0, ts: c.startSec >= 0 ? formatSec(c.startSec) : (seg?.sourceTimestamp || '?'), text: seg?.text || c.text || '', preview: c.transcriptPreview };
                        })
                      : script.map((s, i) => ({ idx: i, hasReal: false, ts: s.sourceTimestamp || '?', text: s.text, preview: undefined }))
                    ).map(item => (
                      <div key={item.idx} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 flex flex-col items-center gap-1 mt-0.5">
                            <span className="w-5 h-5 rounded-full bg-cyan-500/10 flex items-center justify-center text-[10px] font-bold text-cyan-400">{item.idx + 1}</span>
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${item.hasReal ? 'text-cyan-400 bg-cyan-500/10' : 'text-zinc-500 bg-white/5'}`}>{item.ts}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-zinc-300 leading-relaxed">{item.text.slice(0, 160)}{item.text.length > 160 ? '…' : ''}</p>
                            {item.hasReal && item.preview && (
                              <p className="text-[10px] text-zinc-600 mt-1 italic line-clamp-1">"{item.preview}"</p>
                            )}
                          </div>
                          <a
                            href={`https://www.google.com/search?q=${encodeURIComponent(item.text.slice(0, 100))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-200 transition-all"
                          >
                            <BookOpen size={11} />
                            Search
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                  )}

                  <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between gap-2">
                    <p className="text-[10px] text-zinc-600">
                      {contextTimeline && contextTimeline.length > 0
                        ? 'Timestamps source transcript se match kiye gaye hain'
                        : 'AI ke estimated timestamps — import karo timed transcript for precision'}
                    </p>
                    <button
                      onClick={() => { setContextTimeline(null); runContextBridgeTimeline(); }}
                      disabled={isAnalyzingContextTimeline}
                      className="shrink-0 flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-zinc-200 transition-all disabled:opacity-50"
                    >
                      {isAnalyzingContextTimeline ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                      Re-match
                    </button>
                  </div>
                </div>
              )}


              {/* ── Quote Panel ── */}
              {activeContextPanel === 'quote' && (
                <div className="mt-3">
                  {isGeneratingQuote && !quoteData && (
                    <div className="flex items-center gap-2 py-4 px-4 rounded-2xl border border-white/5 bg-white/[0.02] text-zinc-500 text-sm">
                      <Loader2 size={15} className="animate-spin text-amber-400" />
                      Finding quote…
                    </div>
                  )}
                  {quoteData && (
                    <div className="relative rounded-2xl overflow-hidden border border-white/8 bg-gradient-to-br from-[#0f0f1a] via-[#0d0d16] to-[#0a0a12]">
                      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/60 via-orange-400/80 to-rose-500/60" />
                      <div className="absolute top-3 left-4 text-[100px] leading-none text-white/[0.03] font-serif pointer-events-none select-none">"</div>
                      <div className="px-7 pt-9 pb-6">
                        <p className="text-xl font-light leading-relaxed text-white/90 font-serif italic mb-6 relative z-10">"{quoteData.quote}"</p>
                        <div className="flex items-center gap-3 mb-5">
                          <div className="w-8 h-[2px] bg-amber-500/60 rounded-full shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-amber-300/90">{quoteData.author}</p>
                            {quoteData.title && <p className="text-[11px] text-zinc-500 mt-0.5">{quoteData.title}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                          <button onClick={handleCopyQuote} className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all">
                            {quoteCopied ? <><Check size={13} className="text-green-400" /> Copied!</> : <><Copy size={13} /> Copy Quote</>}
                          </button>
                          <button onClick={handleGenerateQuote} disabled={isGeneratingQuote} className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all disabled:opacity-50">
                            {isGeneratingQuote ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                            New Quote
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Topic Quote Card (non-context_bridge only) ───────────────────── */}
          {scriptStyle !== 'context_bridge' && (
          <div className="mt-6 mb-4">
              {!quoteData && (
                <button
                  onClick={handleGenerateQuote}
                  disabled={isGeneratingQuote}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isGeneratingQuote ? (
                    <>
                      <Loader2 size={17} className="animate-spin text-amber-400" />
                      <span className="text-sm text-zinc-400 font-medium">Finding a quote for this topic…</span>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                        <Quote size={15} className="text-amber-400" />
                      </div>
                      <span className="text-sm text-zinc-400 font-medium group-hover:text-zinc-200 transition-colors">
                        Topic Quote Generate Karo
                      </span>
                    </>
                  )}
                </button>
              )}
              {quoteData && (
                <div className="relative rounded-2xl overflow-hidden border border-white/8 bg-gradient-to-br from-[#0f0f1a] via-[#0d0d16] to-[#0a0a12]">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/60 via-orange-400/80 to-rose-500/60" />
                  <div className="absolute top-3 left-4 text-[100px] leading-none text-white/[0.03] font-serif pointer-events-none select-none">"</div>
                  <div className="px-7 pt-9 pb-6">
                    <p className="text-xl md:text-2xl font-light leading-relaxed text-white/90 font-serif italic mb-6 relative z-10">"{quoteData.quote}"</p>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-8 h-[2px] bg-amber-500/60 rounded-full shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-amber-300/90">{quoteData.author}</p>
                        {quoteData.title && (<p className="text-[11px] text-zinc-500 mt-0.5">{quoteData.title}</p>)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                      <button onClick={handleCopyQuote} className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all">
                        {quoteCopied ? (<><Check size={13} className="text-green-400" /> Copied!</>) : (<><Copy size={13} /> Copy Quote</>)}
                      </button>
                      <button onClick={handleGenerateQuote} disabled={isGeneratingQuote} className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all disabled:opacity-50">
                        {isGeneratingQuote ? (<Loader2 size={13} className="animate-spin" />) : (<RotateCcw size={13} />)}
                        New Quote
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
          )}

          {/* ── Timeline Cuts Card (non-context_bridge only) ─────────────── */}
          {scriptStyle !== 'context_bridge' && (
          <div className="mt-4 mb-4">
            <div>
              {!timelineCuts && (
                <button
                  onClick={handleAnalyzeTimeline}
                  disabled={isAnalyzingTimeline}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isAnalyzingTimeline ? (
                    <>
                      <Loader2 size={17} className="animate-spin text-sky-400" />
                      <span className="text-sm text-zinc-400 font-medium">Matching timestamps in transcript…</span>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center group-hover:bg-sky-500/20 transition-colors">
                        <Scissors size={15} className="text-sky-400" />
                      </div>
                      <span className="text-sm text-zinc-400 font-medium group-hover:text-zinc-200 transition-colors">
                        Timeline Cuts Nikalo
                      </span>
                    </>
                  )}
                </button>
              )}

              {timelineCuts && timelineCuts.length > 0 && (
                <div className="rounded-2xl overflow-hidden border border-white/8 bg-[#0d0d14]">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Scissors size={14} className="text-sky-400" />
                      <span className="text-xs font-semibold text-sky-300 uppercase tracking-widest">Timeline Cuts</span>
                      <span className="text-[10px] text-zinc-600 ml-1">({timelineCuts.length} segments)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyTimeline}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                      >
                        {timelineCutsCopied ? <><Check size={12} className="text-green-400" /> Copied!</> : <><Copy size={12} /> Copy All</>}
                      </button>
                      <button
                        onClick={() => setTimelineCuts(null)}
                        className="text-zinc-600 hover:text-zinc-300 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Cuts List */}
                  <div className="divide-y divide-white/[0.04] max-h-72 overflow-y-auto">
                    {timelineCuts.map(cut => (
                      <div key={cut.index} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-start gap-3">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-sky-500/10 flex items-center justify-center text-[11px] font-bold text-sky-400 mt-0.5">
                            {cut.index}
                          </span>
                          <div className="flex-1 min-w-0">
                            {/* Point label */}
                            <p className="text-[10px] text-zinc-600 truncate mb-1">
                              Point {cut.index}: {cut.text}{cut.text.length >= 60 ? '…' : ''}
                            </p>
                            {/* YouTube transcript preview — what was actually said */}
                            {cut.startSec >= 0 && cut.transcriptPreview && (
                              <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-3">
                                "{cut.transcriptPreview}"
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right ml-3">
                            {cut.startSec < 0 ? (
                              <span className="text-xs text-zinc-600 italic">Not found</span>
                            ) : (
                              <span className="text-sm font-mono font-semibold text-sky-300 whitespace-nowrap">
                                {formatSec(cut.startSec)}
                                <span className="text-zinc-600 mx-1">–</span>
                                {formatSec(cut.endSec)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Re-analyze button */}
                  <div className="px-4 py-2.5 border-t border-white/5 flex justify-end">
                    <button
                      onClick={handleAnalyzeTimeline}
                      disabled={isAnalyzingTimeline}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-zinc-200 transition-all disabled:opacity-50"
                    >
                      {isAnalyzingTimeline ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Re-analyze
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}


        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {segmentToDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Segment</h3>
            <p className="text-zinc-400 text-sm mb-6">Are you sure you want to delete this segment? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setSegmentToDelete(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  onUpdateScript(script.filter(seg => seg.id !== segmentToDelete));
                  setSegmentToDelete(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScriptEditor;
