import React, { useState, useRef, lazy, Suspense } from 'react';
import { toast } from './Toast';
import { DebateConfig, DebateSegment } from '../types';
import { Mic, FileText, Clock, Users, ArrowRight, Upload, X, FileCheck, Sparkles, Zap, Brain, Activity, Video, BookOpen, Smartphone, Link2, Scissors, Loader2 } from 'lucide-react';
import type { PhoneConvoStyle, TranscriptChunk } from '../services/geminiService';
import { splitTranscriptByTopics } from '../services/geminiService';
import IntroVideoMaker from './IntroVideoMaker';

const PhoneConvoStudio = lazy(() => import('./PhoneConvoStudio'));

interface DebateInputProps {
  onGenerate: (config: DebateConfig) => void;
  isLoading: boolean;
  initialContextContent?: string;
  initialFileName?: string;
  initialCommentsContent?: string;
  initialCommentsFileName?: string;
  /** Fired by the "New Phone Studio" tab once its embedded generator commits a script. Caller routes to PHONE_STUDIO. */
  onPhoneStudioReady?: (script: DebateSegment[]) => void;
}

const DebateInput: React.FC<DebateInputProps> = ({
  onGenerate,
  isLoading,
  initialContextContent,
  initialFileName,
  initialCommentsContent,
  initialCommentsFileName,
  onPhoneStudioReady,
}) => {
  const [showIntroMaker, setShowIntroMaker] = useState(false);
  const [mode, setMode] = useState<'topic' | 'script' | 'youtube' | 'phone' | 'phone_new'>('topic');
  const [topic, setTopic] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [specificDetails, setSpecificDetails] = useState('');
  const [customScript, setCustomScript] = useState('');
  const [includeNarrator, setIncludeNarrator] = useState(false);
  const [model, setModel] = useState<'gemini-3.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.5-flash'>('gemini-3.5-flash');
  const [language, setLanguage] = useState('English');
  // Auto Joe Rogan Style when context file is attached from YoutubeImporter
  const [style, setStyle] = useState<'debate' | 'debate2' | 'explained' | 'explained_solo' | 'image' | 'podcast_panel' | 'podcast_breakdown' | 'context_bridge' | 'situational' | 'documentary' | 'joe_rogan' | 'finance_deep_dive' | 'professor_jiang' | 'book_summary' | 'questioning' | 'transcript_review' | 'summarizer_pov'>(
    initialContextContent ? 'podcast_panel' : 'situational'
  );
  const [joeRoganGuest, setJoeRoganGuest] = useState<string>('Elon Musk');
  // Auto speaker count + duration for Joe Rogan Style
  const [speakerCount, setSpeakerCount] = useState<number>(initialContextContent ? 3 : 3);
  const [duration, setDuration] = useState<number>(8);
  const [contextFileContent, setContextFileContent] = useState<string | undefined>(initialContextContent);
  const [fileName, setFileName] = useState<string | undefined>(initialFileName);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [speakerNames, setSpeakerNames] = useState<string[]>(['', '', '', '']);

  // ── Phone Studio state ──────────────────────────────────────────────────────
  const [phoneConvoStyle, setPhoneConvoStyle] = useState<PhoneConvoStyle>('podcast');
  const [phoneDescription, setPhoneDescription] = useState('');
  const [useImportTranscript, setUseImportTranscript] = useState(false);
  const [phoneNarrator, setPhoneNarrator] = useState(false);
  const [phoneYtMode, setPhoneYtMode] = useState(false);
  const [phoneYtUrl, setPhoneYtUrl] = useState('');
  const [phoneUseComments, setPhoneUseComments] = useState(false);
  // ── Segment Picker state ───────────────────────────────────────────────────
  const [phoneSegmentPicker, setPhoneSegmentPicker] = useState(false);
  const [phoneSegments, setPhoneSegments] = useState<TranscriptChunk[]>([]);
  const [phoneSegmentsLoading, setPhoneSegmentsLoading] = useState(false);
  const [phoneSelectedSegs, setPhoneSelectedSegs] = useState<Set<number>>(new Set());

  const phoneFileInputRef = useRef<HTMLInputElement>(null);
  const [phoneFileName, setPhoneFileName] = useState<string | undefined>();
  const [phoneFileContent, setPhoneFileContent] = useState<string | undefined>();
  const [isReadingPhoneFile, setIsReadingPhoneFile] = useState(false);

  const languages = [
    'English',
    'Hindi'
  ];

  const durationOptions = [1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50];

  const handlePhoneFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoneFileName(file.name);
    setIsReadingPhoneFile(true);
    try {
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          fullText += tc.items.map((item: any) => item.str).join(' ') + '\n';
        }
        setPhoneFileContent(fullText);
      } else {
        setPhoneFileContent(await file.text());
      }
    } catch {
      toast.error('File read nahi hua');
      setPhoneFileName(undefined);
    } finally {
      setIsReadingPhoneFile(false);
    }
  };

  const clearPhoneFile = () => {
    setPhoneFileName(undefined);
    setPhoneFileContent(undefined);
    if (phoneFileInputRef.current) phoneFileInputRef.current.value = '';
  };

  const fmtSec = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const analyzeSegments = async () => {
    if (!phoneYtUrl.trim()) { toast.warning('Pehle YouTube URL daalein'); return; }
    setPhoneSegmentsLoading(true);
    setPhoneSegments([]);
    setPhoneSelectedSegs(new Set());
    try {
      const res = await fetch('/api/youtube/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: phoneYtUrl.trim(), lang: '' }),
      });
      if (!res.ok) throw new Error('Transcript fetch failed');
      const data = await res.json();
      const segs: { text: string; start: number; end: number }[] = (data.segments || []).map((s: any) => ({
        text: s.text,
        start: s.start,
        end: (s.start || 0) + (s.duration || 5),
      }));
      if (!segs.length) throw new Error('Transcript empty hai');
      const chunks = await splitTranscriptByTopics(segs);
      setPhoneSegments(chunks);
    } catch (e: any) {
      toast.error(e.message || 'Segment analysis fail hua');
    } finally {
      setPhoneSegmentsLoading(false);
    }
  };

  const toggleSeg = (idx: number) => {
    setPhoneSelectedSegs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) { next.delete(idx); return next; }
      if (next.size >= 2) { toast.warning('Max 2 segments select kar sakte ho'); return prev; }
      next.add(idx);
      return next;
    });
  };

  const handleSubmit = async () => {
    // ── Phone Studio mode ──────────────────────────────────────────────────
    if (mode === 'phone') {
      const phoneCtx = [
        useImportTranscript ? (initialContextContent || '') : '',
        phoneFileContent || '',
      ].filter(Boolean).join('\n\n---\n\n') || undefined;

      if (!topic.trim() && !phoneDescription.trim() && !phoneCtx && !(phoneYtMode && phoneYtUrl.trim())) {
        toast.warning('Topic, YouTube URL, context ya file zaroor daalein');
        return;
      }
      if (phoneYtMode && !phoneYtUrl.trim()) {
        toast.warning('YouTube URL daalein');
        return;
      }
      if (phoneYtMode && phoneSegmentPicker && phoneSegments.length > 0 && phoneSelectedSegs.size === 0) {
        toast.warning('Kam se kam ek segment select karo');
        return;
      }

      // If segment picker is active and segments are selected, inject their text as context
      let segmentCtx: string | undefined;
      if (phoneYtMode && phoneSegmentPicker && phoneSelectedSegs.size > 0) {
        const selected = phoneSegments
          .filter((_, i) => phoneSelectedSegs.has(i))
          .map(s => `[${fmtSec(s.start)} – ${fmtSec(s.end)}] ${s.title}\n${s.text}`)
          .join('\n\n---\n\n');
        segmentCtx = `SELECTED_SEGMENTS:\n${selected}`;
      }

      const activePhoneSpeakers = speakerNames.slice(0, speakerCount).map(n => n.trim()).filter(Boolean);
      // When segment picker is used, don't re-fetch full video — pass segment text as context instead
      const ytUrlForDetails = (phoneYtMode && !segmentCtx) ? phoneYtUrl.trim() : '';
      onGenerate({
        topic: topic.trim() || 'AI Discussion',
        specificDetails: `PHONE_STYLE:${phoneConvoStyle}\n${ytUrlForDetails ? `PHONE_YT_URL:${ytUrlForDetails}\n` : ''}${phoneYtMode && phoneUseComments ? `PHONE_USE_COMMENTS:true\n` : ''}---\n${phoneDescription}`,
        duration,
        includeNarrator: phoneNarrator,
        contextFileContent: segmentCtx || phoneCtx,
        model,
        language,
        style: 'phone_studio',
        speakerCount,
        speakerNames: activePhoneSpeakers.length >= 2 ? activePhoneSpeakers : undefined,
      });
      return;
    }

    // ── Regular modes ─────────────────────────────────────────────────────
    // Filter out empty names or use defaults if needed, but we want auto-detect if empty
    // We pass the names that are filled in.
    const activeNames = speakerNames.slice(0, speakerCount).map(n => n.trim()).filter(n => n);
    
    let finalContext = contextFileContent;
    let finalTopic = topic || (contextFileContent ? "the provided document" : "");

    if (mode === 'topic' && !finalTopic.trim()) {
      toast.warning('Please enter a topic to generate a script');
      return;
    }

    if (mode === 'script' && !customScript.trim()) {
      toast.warning('Please paste your script before generating');
      return;
    }

    if (mode === 'youtube') {
      if (!youtubeUrl) {
        toast.warning('Please enter a YouTube URL');
        return;
      }
      finalTopic = "YouTube Podcast Review";
    }

    const isJoeRogan = style === 'joe_rogan';
    const finalSpeakerNames = isJoeRogan
      ? ['Joe Rogan', joeRoganGuest]
      : (activeNames.length > 0 ? activeNames : undefined);

    onGenerate({
      topic: finalTopic,
      specificDetails,
      duration: duration,
      includeNarrator: isJoeRogan ? false : includeNarrator,
      customScript: mode === 'script' ? customScript : undefined,
      contextFileContent: finalContext,
      commentsFileContent: initialCommentsContent,
      model,
      language,
      style,
      speakerCount: isJoeRogan ? 2 : speakerCount,
      speakerNames: finalSpeakerNames,
      youtubeUrl: mode === 'youtube' ? youtubeUrl : undefined
    });
  };

  const handleSpeakerNameChange = (index: number, value: string) => {
    const newNames = [...speakerNames];
    newNames[index] = value;
    setSpeakerNames(newNames);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsReadingFile(true);

    try {
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n';
        }
        setContextFileContent(fullText);
      } else {
        // Assume text-based for other types
        const text = await file.text();
        setContextFileContent(text);
      }
    } catch (error) {
      console.error('Error reading file:', error);
      toast.error('Failed to read file. Please try a different format.');
      setFileName(undefined);
      setContextFileContent(undefined);
    } finally {
      setIsReadingFile(false);
    }
  };

  const clearFile = () => {
    setFileName(undefined);
    setContextFileContent(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full max-w-4xl mx-auto animate-fade-in pb-20 md:pb-0 px-4 py-6">
      {/* Mode Selection Toggle */}
      <div className="flex justify-center mb-6">
        <div className="bg-[#0a0a0a] p-1 rounded-xl inline-flex border border-white/5 shadow-lg shadow-purple-900/10 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setMode('topic')}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex-1 sm:flex-none whitespace-nowrap ${
              mode === 'topic' 
                ? 'bg-white/10 text-white shadow-md ring-1 ring-white/10' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <Mic size={16} className={mode === 'topic' ? 'text-purple-400' : ''} />
            From Topic
          </button>
          <button
            onClick={() => setMode('script')}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex-1 sm:flex-none whitespace-nowrap ${
              mode === 'script' 
                ? 'bg-white/10 text-white shadow-md ring-1 ring-white/10' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <FileText size={16} className={mode === 'script' ? 'text-purple-400' : ''} />
            Paste Script
          </button>
          <button
            onClick={() => { setMode('youtube'); setStyle('podcast_breakdown'); setSpeakerCount(2); }}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex-1 sm:flex-none whitespace-nowrap ${
              mode === 'youtube' 
                ? 'bg-white/10 text-white shadow-md ring-1 ring-white/10' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <Activity size={16} className={mode === 'youtube' ? 'text-purple-400' : ''} />
            YouTube Link
          </button>
          <button
            onClick={() => { setMode('phone'); setSpeakerCount(2); }}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex-1 sm:flex-none whitespace-nowrap ${
              mode === 'phone'
                ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 text-white shadow-md ring-1 ring-purple-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <Smartphone size={16} className={mode === 'phone' ? 'text-purple-400' : ''} />
            Phone Studio
          </button>
          <button
            onClick={() => setMode('phone_new')}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex-1 sm:flex-none whitespace-nowrap ${
              mode === 'phone_new'
                ? 'bg-gradient-to-r from-red-600/30 to-pink-600/30 text-white shadow-md ring-1 ring-red-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <Sparkles size={16} className={mode === 'phone_new' ? 'text-red-400' : ''} />
            New Phone Studio
          </button>
        </div>
      </div>

      {/* ── "New Phone Studio" tab: render the embedded script generator directly here. ── */}
      {mode === 'phone_new' && (
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-pink-600 rounded-[18px] opacity-25 group-hover:opacity-50 transition duration-500 blur"></div>
          <div className="relative bg-[#0a0a0a] rounded-[16px] border border-white/5 overflow-hidden" style={{ height: '78vh', minHeight: 600 }}>
            <Suspense fallback={
              <div className="flex items-center justify-center h-full text-gray-500 text-sm gap-2">
                <Loader2 size={16} className="animate-spin" /> Loading Phone Studio Generator…
              </div>
            }>
              <PhoneConvoStudio
                mainScript={[]}
                embedded
                onGeneratorComplete={(turns, phones) => {
                  // Convert ScriptTurn[] → DebateSegment[] for the rest of the app pipeline.
                  const phoneToSpeaker = new Map(phones.map(p => [p.id, p.name]));
                  const segments: DebateSegment[] = turns.map(t => ({
                    id: t.id,
                    speaker: t.isNarrator ? 'NARRATOR' : (phoneToSpeaker.get(t.phoneId) ?? 'Speaker'),
                    text: t.text,
                    audioUrl: t.audioUrl,
                    duration: t.durationMs / 1000,
                    wordTimings: t.wordTimings?.map(w => ({ word: w.word, start: w.startTime, end: w.endTime })),
                  }));
                  if (onPhoneStudioReady) {
                    onPhoneStudioReady(segments);
                  } else {
                    toast.error('Phone Studio route configured nahi hai — app ko reload karo.');
                  }
                }}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* All other modes share the standard input layout below. */}
      {mode !== 'phone_new' && (
      <div className="space-y-5">
        {/* Main Input Area */}
        <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-[18px] opacity-20 group-hover:opacity-40 transition duration-500 blur"></div>
            <div className="relative bg-[#0a0a0a] rounded-[16px] border border-white/5 p-1 overflow-hidden">
             {mode === 'topic' ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={
                    style === 'book_summary'
                      ? "Book ka naam likhо (e.g. '48 Laws of Power') ya chapter (e.g. 'Atomic Habits - Chapter 1')"
                      : style === 'questioning'
                      ? "Enter any topic or situation (e.g. 'Is money the key to happiness?' or 'Which AI is actually the smartest?')"
                      : style === 'transcript_review'
                      ? "Video info likhо — Guest, Show, Topic (e.g. 'Dr. Huberman on Joe Rogan - Addiction')"
                      : "Enter a controversial topic (e.g., 'Is AI dangerous?')"
                  }
                  className="w-full bg-transparent text-white px-5 py-4 text-base md:text-lg placeholder:text-gray-600 focus:outline-none font-medium"
                />
                {style === 'book_summary' && (
                  <div className="px-5">
                    <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs text-emerald-300/80">
                      📚 <strong>Puri book</strong> ke liye: "Atomic Habits" ya "The Psychology of Money" — sab key concepts cover honge.<br/>
                      📖 <strong>Ek chapter/law</strong> ke liye: "48 Laws of Power - Law 1" ya "Atomic Habits Chapter 3" — sirf usi ka deep breakdown.
                    </div>
                  </div>
                )}
                {style === 'questioning' && (
                  <div className="px-5">
                    <div className="bg-violet-500/8 border border-violet-500/20 rounded-lg px-3 py-2 text-xs text-violet-300/80">
                      ❓ <strong>Koi bhi topic</strong> — AI auto-picks the 4 best perspectives for it.<br/>
                      🧠 Religious: Christian · Muslim · Buddhist · Atheist<br/>
                      🤖 AI: ChatGPT · Grok · Claude · Gemini<br/>
                      💰 Finance: Warren Buffett · Elon Musk · Dave Ramsey · broke 25yr old<br/>
                      <span className="text-violet-400/60">Ya Speaker Names mein apne custom characters likho — exactly wahi names use honge.</span>
                    </div>
                  </div>
                )}
                {style === 'transcript_review' && (
                  <div className="px-5">
                    <div className="bg-cyan-500/8 border border-cyan-500/20 rounded-lg px-3 py-2 text-xs text-cyan-300/80">
                      🎬 <strong>Transcript attach karo</strong> (neeche file upload se) — AI us content ka review script banayega.<br/>
                      📝 Topic mein likho: Guest name, Show name, aur kya topic tha<br/>
                      <span className="text-cyan-400/60">Output: intro → key points walkthrough → 1 paragraph personal opinion. No speaker tags.</span>
                    </div>
                  </div>
                )}
                <div className="px-5 pb-4">
                  <textarea
                    value={specificDetails}
                    onChange={(e) => setSpecificDetails(e.target.value)}
                    placeholder={
                      style === 'book_summary'
                        ? "Optional: Koi specific angle ya focus? (e.g. 'Business ke liye apply karna' ya 'Relationships pe focus karo')"
                        : style === 'questioning'
                        ? "Optional: Add any specific scenario details or constraints..."
                        : style === 'transcript_review'
                        ? "Optional: Koi extra context — jaise kitni videos cover karni hain, ya koi specific angle..."
                        : "Optional: Add specific details, context, or background info..."
                    }
                    rows={2}
                    className="w-full bg-[#111111] border border-white/5 rounded-lg px-3 py-2 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 resize-none"
                  />
                </div>
              </div>
            ) : mode === 'script' ? (
              <textarea
                value={customScript}
                onChange={(e) => setCustomScript(e.target.value)}
                placeholder="Paste your full debate script here..."
                rows={6}
                className="w-full bg-transparent text-white px-5 py-4 text-sm placeholder:text-gray-600 focus:outline-none resize-none custom-scrollbar font-mono leading-relaxed"
              />
            ) : mode === 'phone' ? (
              <div className="space-y-2">
                {/* YouTube toggle */}
                <div
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer border-b transition-colors ${phoneYtMode ? 'border-red-500/20 bg-red-500/5' : 'border-white/5 hover:bg-white/[0.02]'}`}
                  onClick={() => setPhoneYtMode(p => !p)}
                >
                  <span className="text-lg">▶️</span>
                  <div className="flex-1">
                    <div className={`text-sm font-semibold ${phoneYtMode ? 'text-red-300' : 'text-gray-300'}`}>YouTube se Generate</div>
                    <div className="text-[11px] text-gray-500">Transcript extract → Gemini analyze → Script banega</div>
                  </div>
                  <div className={`relative w-9 h-5 rounded-full transition-all shrink-0 ${phoneYtMode ? 'bg-red-500' : 'bg-white/10'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${phoneYtMode ? 'translate-x-4' : ''}`} />
                  </div>
                </div>
                {phoneYtMode ? (
                  <div className="px-5 pb-2 space-y-2">
                    <input
                      type="text"
                      value={phoneYtUrl}
                      onChange={(e) => { setPhoneYtUrl(e.target.value); setPhoneSegments([]); setPhoneSelectedSegs(new Set()); }}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full bg-[#111111] border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white focus:border-red-500/50 focus:outline-none placeholder:text-gray-600"
                    />

                    {/* Segment Picker toggle */}
                    <div
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${phoneSegmentPicker ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-white/[0.03] border border-white/5 hover:bg-white/[0.05]'}`}
                      onClick={() => { setPhoneSegmentPicker(p => !p); setPhoneSegments([]); setPhoneSelectedSegs(new Set()); }}
                    >
                      <Scissors size={13} className={phoneSegmentPicker ? 'text-purple-400' : 'text-gray-500'} />
                      <div className="flex-1">
                        <div className={`text-xs font-semibold ${phoneSegmentPicker ? 'text-purple-300' : 'text-gray-400'}`}>Segment Picker</div>
                        <div className="text-[10px] text-gray-600">Ek specific hissa chunno (max 2)</div>
                      </div>
                      <div className={`relative w-8 h-4 rounded-full transition-all shrink-0 ${phoneSegmentPicker ? 'bg-purple-500' : 'bg-white/10'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${phoneSegmentPicker ? 'translate-x-4' : ''}`} />
                      </div>
                    </div>

                    {/* Segment Picker panel */}
                    {phoneSegmentPicker && (
                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                        {/* Analyze button / loading */}
                        <button
                          onClick={analyzeSegments}
                          disabled={phoneSegmentsLoading || !phoneYtUrl.trim()}
                          className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                            border-b border-white/[0.06]
                            text-purple-300 hover:bg-purple-500/10"
                        >
                          {phoneSegmentsLoading
                            ? <><Loader2 size={12} className="animate-spin" />Analyzing…</>
                            : <><Scissors size={12} />{phoneSegments.length ? 'Re-analyze' : 'Topics nikalo'}</>}
                        </button>

                        {/* Segment cards */}
                        {phoneSegments.length > 0 && (
                          <div>
                            <div className="px-3 py-1.5 flex items-center justify-between">
                              <span className="text-[10px] text-gray-600">Select 1–2 segments</span>
                              <span className={`text-[10px] font-semibold ${phoneSelectedSegs.size === 2 ? 'text-purple-400' : 'text-gray-500'}`}>
                                {phoneSelectedSegs.size}/2
                              </span>
                            </div>
                            {phoneSegments.map((seg, i) => {
                              const selected = phoneSelectedSegs.has(i);
                              const blocked = !selected && phoneSelectedSegs.size >= 2;
                              return (
                                <div
                                  key={i}
                                  onClick={() => !blocked && toggleSeg(i)}
                                  className={`flex items-start gap-2.5 px-3 py-2.5 border-t border-white/[0.04] transition-colors
                                    ${selected ? 'bg-purple-500/10' : blocked ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer hover:bg-white/[0.03]'}`}
                                >
                                  {/* Checkbox */}
                                  <div className={`mt-0.5 w-3.5 h-3.5 rounded-sm border shrink-0 flex items-center justify-center transition-colors
                                    ${selected ? 'bg-purple-500 border-purple-500' : 'border-white/20'}`}>
                                    {selected && <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-3.5" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-xs font-medium leading-snug ${selected ? 'text-white' : 'text-gray-300'}`}>{seg.title}</div>
                                    <div className="text-[10px] text-gray-600 mt-0.5 font-mono">{fmtSec(seg.start)} – {fmtSec(seg.end)}</div>
                                    {seg.summary && <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{seg.summary}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Comments toggle — only when YouTube mode ON */}
                    <div
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${phoneUseComments ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-white/[0.03] border border-white/5 hover:bg-white/[0.05]'}`}
                      onClick={() => setPhoneUseComments(p => !p)}
                    >
                      <span className="text-base">💬</span>
                      <div className="flex-1">
                        <div className={`text-xs font-semibold ${phoneUseComments ? 'text-orange-300' : 'text-gray-400'}`}>Comments bhi use karo</div>
                        <div className="text-[10px] text-gray-600">Funny, sarcastic, skeptical comments conversation mein aayenge</div>
                      </div>
                      <div className={`relative w-8 h-4 rounded-full transition-all shrink-0 ${phoneUseComments ? 'bg-orange-500' : 'bg-white/10'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${phoneUseComments ? 'translate-x-4' : ''}`} />
                      </div>
                    </div>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Extra focus (optional) — e.g. 'Focus on AI claims only'"
                      className="w-full bg-transparent text-white px-0 py-1 text-sm placeholder:text-gray-600 focus:outline-none"
                    />
                  </div>
                ) : (
                <div className="px-5 pt-1">
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Conversation topic (e.g. 'AI ka future', 'Cryptocurrency worth it hai?')"
                    className="w-full bg-transparent text-white py-3 text-base md:text-lg placeholder:text-gray-600 focus:outline-none font-medium"
                  />
                </div>
                )}
                <div className="px-5 pb-4 space-y-3">
                  <textarea
                    value={phoneDescription}
                    onChange={(e) => setPhoneDescription(e.target.value)}
                    placeholder="Context ya description — kya discuss karein?"
                    rows={2}
                    className="w-full bg-[#111111] border border-white/5 rounded-lg px-3 py-2 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 resize-none"
                  />
                  {/* Context file for phone mode */}
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={phoneFileInputRef}
                      onChange={handlePhoneFileUpload}
                      accept=".txt,.pdf,.md,.csv"
                      className="hidden"
                    />
                    {phoneFileName ? (
                      <div className="flex items-center gap-2 flex-1 bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-1.5">
                        <FileCheck size={12} className="text-purple-400 shrink-0" />
                        <span className="text-[11px] text-purple-300 truncate flex-1">{phoneFileName}</span>
                        <button onClick={clearPhoneFile} className="text-gray-500 hover:text-red-400 shrink-0">
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => phoneFileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-white/15 text-gray-500 hover:text-gray-300 hover:border-white/25 text-[11px] transition-all"
                      >
                        {isReadingPhoneFile ? (
                          <><div className="w-3 h-3 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" /> Reading...</>
                        ) : (
                          <><Upload size={11} /> Attach Context File (PDF, TXT, MD)</>
                        )}
                      </button>
                    )}
                    {/* Use Import Transcript button */}
                    {initialContextContent && (
                      <button
                        onClick={() => setUseImportTranscript(p => !p)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all shrink-0 ${
                          useImportTranscript
                            ? 'border-green-500/40 bg-green-500/10 text-green-300'
                            : 'border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                        }`}
                        title="Import section se jo transcript/context aaya hai usse use karo"
                      >
                        <Link2 size={11} />
                        {useImportTranscript ? '✓ Transcript Attached' : 'Use Import Transcript'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="Paste YouTube Podcast URL here..."
                  className="w-full bg-transparent text-white px-5 py-4 text-base md:text-lg placeholder:text-gray-600 focus:outline-none font-medium"
                />
                <div className="px-5 pb-4">
                  <p className="text-xs text-gray-400">
                    We will extract the transcript from this YouTube video and generate a detailed breakdown of its key points and insights.
                  </p>
                </div>
              </div>
            )}
            
            <div className="px-4 py-2 border-t border-white/5 flex justify-between items-center bg-[#050505]/50 backdrop-blur-sm">
               <div className="text-[10px] text-gray-500 font-mono flex items-center gap-1.5">
                 <Sparkles size={10} className="text-purple-500" />
                 {mode === 'topic' ? `${topic.length} chars` : mode === 'script' ? `${customScript.split(' ').length} words` : mode === 'phone' ? `📱 Phone Studio · ${phoneConvoStyle}` : 'YouTube Mode'}
               </div>
            </div>
          </div>
        </div>

        {/* Configuration Grid — hidden when pasting a script directly */}
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${mode === 'script' ? 'hidden' : ''}`}>
          
          {/* Left Column (Speakers & Context) */}
          <div className="space-y-4">
             {/* Speaker Names */}
            <div className="bg-[#0a0a0a] p-4 rounded-[16px] border border-white/5 hover:border-white/10 transition-colors shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-gray-200">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg">
                    <Users size={14} className="text-purple-400" />
                  </div>
                  <span className="font-semibold text-sm">Speakers</span>
                </div>
                
                {/* Speaker Count Selector */}
                <div className={`flex bg-[#111111] p-0.5 rounded-lg border border-white/5 ${mode === 'youtube' ? 'opacity-50 pointer-events-none' : ''}`}>
                  {[1, 2, 3, 4].map((count) => (
                    <button
                      key={count}
                      onClick={() => setSpeakerCount(count)}
                      className={`w-6 h-6 flex items-center justify-center rounded-md text-[10px] font-bold transition-all ${
                        speakerCount === count
                          ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/20'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              {style === 'joe_rogan' ? (
                <div className="grid gap-2 grid-cols-2">
                  <div className="group">
                    <div className="w-full bg-[#111111] border border-orange-500/30 rounded-lg px-2.5 py-1.5 text-xs text-orange-300 font-semibold flex items-center gap-1.5">
                      <Mic size={10} className="text-orange-400 shrink-0" /> Joe Rogan
                    </div>
                  </div>
                  <div className="group">
                    <div className="w-full bg-[#111111] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white truncate">
                      {joeRoganGuest || 'Select guest above'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2 grid-cols-2">
                  {Array.from({ length: speakerCount }).map((_, index) => (
                    <div key={index} className="group">
                      <input
                        type="text"
                        value={speakerNames[index]}
                        onChange={(e) => handleSpeakerNameChange(index, e.target.value)}
                        placeholder={
                          index === 0
                            ? (style.includes('podcast') ? "Host (e.g. Joe Rogan)" : "e.g. Pro")
                            : index === 1
                              ? (style.includes('podcast') ? "Guest Name" : "e.g. Con")
                              : `Speaker ${index + 1}`
                        }
                        className="w-full bg-[#111111] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all group-hover:border-white/10 placeholder:text-gray-700"
                      />
                    </div>
                  ))}
                </div>
              )}
              {style !== 'joe_rogan' && (
                <p className="text-[9px] text-gray-500 mt-2 flex items-center gap-1 opacity-80">
                  <Sparkles size={8} />
                  Leave empty to auto-detect.
                </p>
              )}
            </div>

            {/* Context File Upload */}
            <div className="bg-[#0a0a0a] p-4 rounded-[16px] border border-white/5 hover:border-white/10 transition-colors shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-gray-200">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg">
                    <Upload size={14} className="text-blue-400" />
                  </div>
                  <span className="font-semibold text-sm">Context / Research</span>
                </div>
                {fileName && (
                  <button 
                    onClick={clearFile}
                    className="text-gray-500 hover:text-red-400 transition-colors p-1 hover:bg-red-500/10 rounded-md"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded-lg p-3 text-center cursor-pointer transition-all duration-300 group ${
                  fileName 
                    ? 'border-purple-500/50 bg-purple-500/5' 
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".txt,.pdf,.md,.csv"
                  className="hidden"
                />
                
                {isReadingFile ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-3 h-3 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                    <span className="text-[9px] text-gray-400 font-medium">Reading...</span>
                  </div>
                ) : fileName ? (
                  <div className="flex items-center justify-center gap-1.5 text-purple-400">
                    <div className="p-1 bg-purple-500/10 rounded">
                      <FileCheck size={12} />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-[10px] truncate max-w-[120px] text-white">{fileName}</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-gray-400 font-medium group-hover:text-gray-200 transition-colors">Click to upload</div>
                    <div className="text-[8px] text-gray-600 font-mono bg-[#111111] inline-block px-1.5 py-0.5 rounded-sm">PDF, TXT, MD, CSV</div>
                  </div>
                )}
              </div>

              {/* Comments file badge — attached from YoutubeImporter */}
              {initialCommentsContent && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                    <FileCheck size={12} className="text-green-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-green-300">Comments Attached</div>
                      <div className="text-[9px] text-green-500 truncate">{initialCommentsFileName || 'comments.txt'}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowIntroMaker(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 transition-all text-[10px] font-semibold shrink-0"
                    title="Create intro video from comments"
                  >
                    <Video size={11} />
                    Intro
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (Settings) */}
          <div className="space-y-4">
            
            {/* Combined Settings Card */}
            <div className="bg-[#0a0a0a] p-4 rounded-[16px] border border-white/5 hover:border-white/10 transition-colors shadow-sm space-y-4">
              
              {/* Duration row — always full width */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 shrink-0 text-gray-300">
                  <Clock size={12} className="text-green-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">Duration</span>
                </div>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="bg-[#111111] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-green-500/50 outline-none appearance-none cursor-pointer"
                >
                  {durationOptions.map(d => (
                    <option key={d} value={d}>{d} Min</option>
                  ))}
                </select>
              </div>

              {/* Style — phone mode chips, other modes dropdown */}
              {mode === 'phone' ? (
                <div className="space-y-2">
                  {/* Label */}
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Sparkles size={12} className="text-pink-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Conversation Style</span>
                  </div>
                  {/* Horizontal scrollable chips */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
                    {([
                      { id: 'podcast',          emoji: '🎙️', label: 'Podcast'         },
                      { id: 'roast',            emoji: '🔥', label: 'Roast'            },
                      { id: 'debate',           emoji: '⚔️', label: 'Debate'           },
                      { id: 'debate_sarcasm',   emoji: '🗡️', label: 'Debate+Sarcasm'  },
                      { id: 'fight',            emoji: '🥊', label: 'Fight'            },
                      { id: 'sarcastic',        emoji: '😏', label: 'Sarcastic'        },
                      { id: 'funny',            emoji: '😂', label: 'Funny'            },
                      { id: 'factual',          emoji: '🧠', label: 'Factual'          },
                      { id: 'devils_advocate',  emoji: '😈', label: "Devil's"          },
                      { id: 'hot_takes',        emoji: '🌶️', label: 'Hot Takes'        },
                      { id: 'factcheck',        emoji: '📋', label: 'Fact-Check'       },
                      { id: 'react',            emoji: '🎬', label: 'React'            },
                      { id: 'experts',          emoji: '🔬', label: 'Experts'          },
                      { id: 'detailed',         emoji: '📝', label: 'Detailed'         },
                      { id: 'romantic',         emoji: '💕', label: 'Romantic'         },
                      { id: 'celebrity_call',   emoji: '⭐', label: 'Celebrity'        },
                      { id: 'ground_search',    emoji: '🔍', label: 'Ground Search'    },
                      { id: 'explain_examples', emoji: '💡', label: 'w/ Examples'      },
                      { id: 'explain_funny',    emoji: '🤪', label: 'Explain Funny'    },
                      { id: 'explain_deep',     emoji: '🌊', label: 'Explain Deep'     },
                    ] as { id: PhoneConvoStyle; emoji: string; label: string }[]).map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setPhoneConvoStyle(opt.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
                          phoneConvoStyle === opt.id
                            ? 'bg-purple-500/20 border-purple-500/50 text-purple-200'
                            : 'bg-white/[0.03] border-white/8 text-gray-400 hover:border-white/20 hover:text-gray-200'
                        }`}
                      >
                        <span>{opt.emoji}</span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  {/* Narrator toggle */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-gray-400">Narrator cards</span>
                    <button
                      onClick={() => setPhoneNarrator(p => !p)}
                      className={`relative w-8 h-4 rounded-full transition-all ${phoneNarrator ? 'bg-purple-600' : 'bg-white/10'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${phoneNarrator ? 'translate-x-4' : ''}`} />
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-gray-300">
                    <Sparkles size={12} className="text-pink-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Style</span>
                  </div>
                  <select
                    value={style === 'context_bridge' ? 'context_bridge' : style}
                    onChange={(e) => {
                      const newStyle = e.target.value as 'debate' | 'debate2' | 'explained' | 'explained_solo' | 'image' | 'podcast_panel' | 'podcast_breakdown' | 'context_bridge' | 'situational' | 'documentary' | 'joe_rogan' | 'finance_deep_dive' | 'professor_jiang' | 'book_summary' | 'questioning' | 'transcript_review' | 'summarizer_pov';
                      setStyle(newStyle);
                      if (newStyle === 'podcast_panel') { setSpeakerCount(3); }
                      if (newStyle === 'situational') { setSpeakerCount(3); }
                      if (newStyle === 'context_bridge') { setSpeakerCount(1); }
                      if (newStyle === 'debate') { setSpeakerCount(2); }
                      if (newStyle === 'debate2') { setSpeakerCount(2); setIncludeNarrator(true); }
                      if (newStyle === 'explained') { setSpeakerCount(2); }
                      if (newStyle === 'explained_solo') { setSpeakerCount(1); }
                      if (newStyle === 'image') { setSpeakerCount(1); setIncludeNarrator(false); }
                      if (newStyle === 'podcast_breakdown') { setSpeakerCount(2); }
                      if (newStyle === 'documentary') { setSpeakerCount(2); }
                      if (newStyle === 'joe_rogan') { setSpeakerCount(2); }
                      if (newStyle === 'finance_deep_dive') { setSpeakerCount(3); }
                      if (newStyle === 'professor_jiang') { setSpeakerCount(1); setIncludeNarrator(false); }
                      if (newStyle === 'book_summary') { setSpeakerCount(2); setIncludeNarrator(false); }
                      if (newStyle === 'questioning') { setSpeakerCount(4); setIncludeNarrator(true); }
                      if (newStyle === 'transcript_review') { setSpeakerCount(1); setIncludeNarrator(false); }
                      if (newStyle === 'summarizer_pov') { setSpeakerCount(1); setIncludeNarrator(false); }
                    }}
                    className="w-full bg-[#111111] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-pink-500/50 outline-none appearance-none cursor-pointer capitalize"
                  >
                    <option value="debate">Debate</option>
                    <option value="debate2">⚔️ Debate 2 (Rounds)</option>
                    <option value="situational">Situational</option>
                    <option value="finance_deep_dive">💰 Finance Deep Dive</option>
                    <option value="explained">Explained</option>
                    <option value="explained_solo">🎙 Explained Solo</option>
                    <option value="image">🖼 Imagen Style</option>
                    <option value="documentary">Documentary</option>
                    <option value="joe_rogan">🎙 Joe Rogan Experience</option>
                    <option value="podcast_panel">Podcast Panel</option>
                    <option value="podcast_breakdown">Podcast Breakdown</option>
                    <option value="context_bridge">Context Analyst</option>
                    <option value="professor_jiang">🎓 Prof. Jiang Xueqin</option>
                    <option value="book_summary">📚 Book Summarizer</option>
                    <option value="questioning">❓ Questioning Style</option>
                    <option value="transcript_review">🎬 Transcript Review</option>
                    <option value="summarizer_pov">🎯 Summarizer POV</option>
                  </select>
                </div>
              )}

              {/* Joe Rogan Experience — guest picker */}
              {style === 'joe_rogan' && (
                <div className="flex items-start gap-3 px-3 py-3 rounded-xl border border-orange-500/30 bg-orange-500/8">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-orange-500/20 mt-0.5">
                    <Mic size={13} className="text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div>
                      <div className="text-[11px] font-semibold text-orange-300 leading-tight">Joe Rogan Experience</div>
                      <div className="text-[10px] text-orange-200/50 leading-tight mt-0.5">Joe Rogan interviews a guest — pick who sits across from him</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">Guest</div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {['Elon Musk', 'Andrew Tate', 'Donald Trump', 'Bill Gates', 'Mark Zuckerberg', 'Kanye West', 'Bernie Sanders', 'Jordan Peterson'].map(name => (
                          <button key={name} onClick={() => setJoeRoganGuest(name)}
                            className={`px-2 py-1 text-[10px] font-semibold rounded-lg border transition-all ${joeRoganGuest === name ? 'border-orange-500 text-orange-300 bg-orange-500/15' : 'border-white/10 text-gray-400 hover:border-white/25 hover:text-white'}`}
                          >{name}</button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={joeRoganGuest}
                        onChange={(e) => setJoeRoganGuest(e.target.value)}
                        placeholder="Or type any name..."
                        className="w-full bg-[#111] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-orange-500/50 outline-none placeholder:text-gray-700"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Context Analyst info — shown when selected from dropdown */}
              {style === 'context_bridge' && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/8 text-cyan-300">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-cyan-500/20">
                    <BookOpen size={13} className="text-cyan-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold leading-tight">Context Analyst</div>
                    <div className="text-[10px] opacity-60 leading-tight mt-0.5">1 speaker · Deep analysis · Source timeline</div>
                  </div>
                  <div className="ml-auto text-[9px] font-bold text-cyan-400 bg-cyan-500/15 px-2 py-0.5 rounded-full shrink-0">ACTIVE</div>
                </div>
              )}

              {/* Language & Narrator Row */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                {/* Language */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-gray-300">
                    <Activity size={12} className="text-orange-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Language</span>
                  </div>
                  <div className="flex bg-[#111111] p-0.5 rounded-lg border border-white/5">
                    {languages.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${
                          language === lang
                            ? 'bg-white/10 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Narrator — hidden for Joe Rogan style */}
                {style !== 'joe_rogan' && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-gray-300">
                    <Mic size={12} className="text-blue-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Narrator</span>
                  </div>
                  <div className="flex bg-[#111111] p-0.5 rounded-lg border border-white/5">
                    <button
                      onClick={() => {
                        setIncludeNarrator(true);
                        setSpeakerCount(2);
                      }}
                      className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${
                        includeNarrator
                          ? 'bg-white/10 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      On
                    </button>
                    <button
                      onClick={() => {
                        setIncludeNarrator(false);
                        if (style === 'situational') setSpeakerCount(3);
                      }}
                      className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${
                        !includeNarrator
                          ? 'bg-white/10 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      Off
                    </button>
                  </div>
                </div>
                )}
              </div>
            </div>

            {/* AI Model Selection */}
            <div className="bg-[#0a0a0a] p-4 rounded-[16px] border border-white/5 hover:border-white/10 transition-colors shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-gray-200">
                <div className="p-1.5 bg-cyan-500/10 rounded-lg">
                  <Brain size={14} className="text-cyan-400" />
                </div>
                <span className="font-semibold text-sm">AI Model</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setModel('gemini-3.5-flash')}
                  className={`p-2.5 rounded-lg border text-left transition-all flex flex-col gap-0.5 group ${
                    model === 'gemini-3.5-flash'
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                      : 'bg-[#111111] border-transparent text-gray-400 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="font-bold text-[11px] group-hover:text-cyan-300 transition-colors">3 Flash</div>
                    <Zap size={10} className={model === 'gemini-3.5-flash' ? 'text-cyan-400' : 'text-gray-600'} />
                  </div>
                  <div className="text-[8px] opacity-70 uppercase tracking-wider font-semibold">Fast</div>
                </button>
                <button
                  onClick={() => setModel('gemini-3.5-flash')}
                  className={`p-2.5 rounded-lg border text-left transition-all flex flex-col gap-0.5 group ${
                    model === 'gemini-3.5-flash'
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                      : 'bg-[#111111] border-transparent text-gray-400 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="font-bold text-[11px] group-hover:text-cyan-300 transition-colors">3.5 Flash</div>
                    <Sparkles size={10} className={model === 'gemini-3.5-flash' ? 'text-cyan-400' : 'text-gray-600'} />
                  </div>
                  <div className="text-[8px] opacity-70 uppercase tracking-wider font-semibold">Stable</div>
                </button>
                <button
                  onClick={() => setModel('gemini-3.1-pro-preview')}
                  className={`p-2.5 rounded-lg border text-left transition-all flex flex-col gap-0.5 group ${
                    model === 'gemini-3.1-pro-preview'
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                      : 'bg-[#111111] border-transparent text-gray-400 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="font-bold text-[11px] group-hover:text-cyan-300 transition-colors">3.1 Pro</div>
                    <Brain size={10} className={model === 'gemini-3.1-pro-preview' ? 'text-cyan-400' : 'text-gray-600'} />
                  </div>
                  <div className="text-[8px] opacity-70 uppercase tracking-wider font-semibold">Smart</div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleSubmit}
          disabled={
            isLoading
            || (mode === 'topic' && !topic && !contextFileContent)
            || (mode === 'script' && !customScript)
            || (mode === 'youtube' && !youtubeUrl)
            || (mode === 'phone' && !topic.trim() && !phoneDescription.trim() && !phoneFileContent && !useImportTranscript && !(phoneYtMode && phoneYtUrl.trim()))
          }
          className={`w-full mt-2 bg-gradient-to-r ${mode === 'phone' ? 'from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600' : 'from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500'} disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 rounded-[16px] shadow-lg shadow-purple-900/20 transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-3 text-base group relative overflow-hidden`}
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              {mode === 'phone' && <Smartphone size={18} />}
              <span>{mode === 'script' ? 'Process Script' : mode === 'phone' ? 'Generate Phone Script' : 'Generate Video'}</span>
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </div>
      )}

      {showIntroMaker && initialCommentsContent && (
        <IntroVideoMaker
          comments={initialCommentsContent
            .split('\n')
            .map(l => l.replace(/^[•\-]\s*/, '').trim())
            .filter(l => l.length > 10)}
          onClose={() => setShowIntroMaker(false)}
        />
      )}
    </div>
  );
};

export default DebateInput;
