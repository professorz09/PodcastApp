import React, { useState, useEffect, useRef } from 'react';
import { DebateSegment, ThumbnailState, YoutubeImportData } from '../types';
import { generateThumbnail, generateTitles, generateThumbnailText, ThumbnailVideoStyle } from '../services/geminiService';
import {
  Image, Loader2, RefreshCw, Download, ChevronLeft, X, ArrowRight,
  Upload, FileText, AlignLeft, Zap, Copy, Check, Wand2, Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type TitleSource = 'script' | 'transcript';

interface ThumbnailGeneratorProps {
  script: DebateSegment[];
  youtubeData: YoutubeImportData | null;
  thumbnailState: ThumbnailState;
  onUpdateThumbnailState: (state: ThumbnailState) => void;
  onNext: () => void;
  onBack: () => void;
}

const ThumbnailGenerator: React.FC<ThumbnailGeneratorProps> = ({
  script,
  youtubeData,
  thumbnailState,
  onUpdateThumbnailState,
  onNext,
  onBack,
}) => {
  const {
    titles = [],
    selectedTitle = '',
    thumbnailTexts = [],
    selectedThumbnailText = '',
    hostName = '',
    guestName = '',
    thumbnailUrl,
    referenceImage,
    extraInstructions = '',
  } = thumbnailState;

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<'inspecting' | 'generating' | null>(null);
  const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);
  const [isGeneratingThumbnailText, setIsGeneratingThumbnailText] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [titleSource, setTitleSource] = useState<TitleSource>('script');
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [videoStyle, setVideoStyle] = useState<ThumbnailVideoStyle>('situational');
  const [isDefaultStyle, setIsDefaultStyle] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const styleOptions: { value: ThumbnailVideoStyle; label: string; desc: string; color: string }[] = [
    { value: 'situational', label: 'Situational', desc: 'Emotional & personal story', color: 'rose' },
    { value: 'debate', label: 'Debate', desc: 'Confrontational & bold', color: 'amber' },
    { value: 'podcast', label: 'Podcast', desc: 'Shocking clickbait', color: 'purple' },
  ];

  const hasScript = script.length > 0;
  const hasTranscript = !!(youtubeData?.fullText && youtubeData.fullText.trim().length > 0);
  const hasEitherSource = hasScript || hasTranscript;
  const isStyleCopyMode = !!referenceImage;

  // Only initialize speaker names on mount — NO auto-generate
  useEffect(() => {
    const speakers = Array.from(new Set<string>(script.map(s => s.speaker))).filter(s => s !== 'Narrator');
    const updates: Partial<ThumbnailState> = {};
    let changed = false;

    if (!hostName && speakers.length >= 1) {
      updates.hostName = speakers[0];
      changed = true;
    }
    if (!guestName && speakers.length >= 2) {
      updates.guestName = speakers[1];
      changed = true;
    } else if (!guestName && speakers.length === 1) {
      updates.guestName = speakers[0];
      changed = true;
    }

    const effectiveSource: TitleSource = hasScript ? 'script' : 'transcript';
    setTitleSource(effectiveSource);

    // Pre-load default thumbnail style image if none is set
    if (!referenceImage) {
      fetch('/default-thumbnail-style.jpg')
        .then(r => r.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const result = ev.target?.result as string;
            const match = result.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
            if (match) {
              updates.referenceImage = { mimeType: match[1], data: match[2], url: result };
              changed = true;
              setIsDefaultStyle(true);
              onUpdateThumbnailState({ ...thumbnailState, ...updates });
            }
          };
          reader.readAsDataURL(blob);
        })
        .catch(() => {});
      return;
    }

    if (changed) {
      onUpdateThumbnailState({ ...thumbnailState, ...updates });
    }
  }, []);

  const getSourceText = (source: TitleSource): string => {
    if (source === 'transcript' && hasTranscript) return youtubeData!.fullText;
    return script.map(s => `${s.speaker}: ${s.text}`).join('\n');
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(id);
      setTimeout(() => setCopiedIndex(null), 1800);
    });
  };

  const handleGenerateTitles = async () => {
    if (!hasEitherSource) return;
    setIsGeneratingTitles(true);
    setGenerateError(null);
    try {
      const text = getSourceText(titleSource);
      const generatedTitles = await generateTitles(text, videoStyle);
      onUpdateThumbnailState({
        ...thumbnailState,
        titles: generatedTitles,
        selectedTitle: generatedTitles[0] || '',
      });
    } catch (e: any) {
      setGenerateError(e?.message || 'Title generation failed. Please try again.');
    } finally {
      setIsGeneratingTitles(false);
    }
  };

  const handleGenerateThumbnailText = async () => {
    if (!hasEitherSource) return;
    setIsGeneratingThumbnailText(true);
    setGenerateError(null);
    try {
      const text = getSourceText(titleSource);
      const generatedTexts = await generateThumbnailText(text, videoStyle);
      onUpdateThumbnailState({
        ...thumbnailState,
        thumbnailTexts: generatedTexts,
        selectedThumbnailText: generatedTexts[0] || '',
      });
    } catch (e: any) {
      setGenerateError(e?.message || 'Thumbnail text generation failed. Please try again.');
    } finally {
      setIsGeneratingThumbnailText(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const match = result.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (match) {
        onUpdateThumbnailState({
          ...thumbnailState,
          referenceImage: { mimeType: match[1], data: match[2], url: result },
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    onUpdateThumbnailState({ ...thumbnailState, referenceImage: null, extraInstructions: '' });
    setIsDefaultStyle(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUploadWithFlag = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsDefaultStyle(false);
    handleImageUpload(e);
  };

  const handleGenerateThumbnail = async () => {
    const textForThumbnail = selectedThumbnailText || selectedTitle;
    if (!textForThumbnail || !guestName) return;
    setIsLoading(true);
    setLoadingStep(referenceImage ? 'inspecting' : 'generating');
    try {
      const refImgData = referenceImage
        ? { data: referenceImage.data, mimeType: referenceImage.mimeType }
        : undefined;
      const url = await generateThumbnail(
        textForThumbnail, hostName, guestName, refImgData, extraInstructions,
        (step) => setLoadingStep(step)
      );
      onUpdateThumbnailState({ ...thumbnailState, thumbnailUrl: url });
    } catch (error: any) {
      setGenerateError(error.message || 'Thumbnail generation failed. Please try again.');
    } finally {
      setIsLoading(false);
      setLoadingStep(null);
    }
  };

  const handleDownload = () => {
    if (!thumbnailUrl) return;
    const link = document.createElement('a');
    link.href = thumbnailUrl;
    link.download = `thumbnail-${(guestName || 'video').replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const textForThumbnail = selectedThumbnailText || selectedTitle;
  const canGenerate = !!(textForThumbnail && guestName);

  return (
    <div className="w-full h-full bg-[#050505] text-zinc-100 flex flex-col overflow-hidden relative font-sans">

      {/* Header */}
      <div className="h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-8 bg-[#050505]/90 backdrop-blur-xl z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-zinc-400 hover:text-white flex items-center gap-2 transition-colors hover:bg-white/5 px-3 py-2 rounded-lg">
            <ChevronLeft size={18} />
            <span className="hidden md:inline font-medium text-sm">Back</span>
          </button>
          <div className="h-5 w-px bg-white/10 hidden md:block" />
          <h2 className="text-base font-semibold text-white">Thumbnail Generator</h2>
        </div>
        <button
          onClick={onNext}
          className="bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2"
        >
          <span className="hidden sm:inline">Next Step</span>
          <ArrowRight size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-6xl mx-auto p-4 md:p-8 pb-20">

          {/* Errors */}
          {generateError && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
              <span className="text-red-400 text-sm">{generateError}</span>
              <button onClick={() => setGenerateError(null)} className="text-red-400 hover:text-red-300 shrink-0 mt-0.5">
                <X size={16} />
              </button>
            </div>
          )}

          {!hasEitherSource && (
            <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-yellow-300 text-sm">
              Koi script ya transcript nahi mili. Pehle script generate karo ya YouTube video import karo.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── LEFT: Controls ── */}
            <div className="space-y-4">

              {/* ── Content Style Selector ── */}
              <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl p-5 space-y-3">
                <div>
                  <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">Content Style</p>
                  <p className="text-xs text-gray-600 mt-0.5">Title aur thumbnail text ka tone is pe depend karta hai</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {styleOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setVideoStyle(opt.value)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                        videoStyle === opt.value
                          ? opt.color === 'rose'
                            ? 'bg-rose-600/20 border-rose-500/60 text-white'
                            : opt.color === 'amber'
                            ? 'bg-amber-600/20 border-amber-500/60 text-white'
                            : 'bg-purple-600/20 border-purple-500/60 text-white'
                          : 'bg-white/3 border-white/8 text-gray-400 hover:bg-white/6 hover:border-white/15'
                      }`}
                    >
                      <span className="text-sm font-bold">{opt.label}</span>
                      <span className="text-[10px] leading-tight opacity-70">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Source toggle */}
              {hasScript && hasTranscript && (
                <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl p-5">
                  <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold mb-3">Source</p>
                  <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
                    {(['script', 'transcript'] as TitleSource[]).map(src => (
                      <button
                        key={src}
                        onClick={() => setTitleSource(src)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                          titleSource === src
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        }`}
                      >
                        {src === 'script' ? <AlignLeft size={13} /> : <FileText size={13} />}
                        {src === 'script' ? 'Generated Script' : 'Transcript'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── STEP 1: Video Title ── */}
              <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">Step 1 — Video Title</p>
                    <p className="text-xs text-gray-600 mt-0.5">Full title shown on YouTube</p>
                  </div>
                  <button
                    onClick={handleGenerateTitles}
                    disabled={isGeneratingTitles || !hasEitherSource}
                    className="flex items-center gap-1.5 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
                  >
                    {isGeneratingTitles
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Wand2 size={12} />
                    }
                    {titles.length > 0 ? 'Regenerate' : 'Generate'}
                  </button>
                </div>

                {isGeneratingTitles ? (
                  <div className="flex items-center gap-2 text-gray-500 py-3">
                    <Loader2 className="animate-spin" size={14} />
                    <span className="text-sm">Titles generate ho rahe hain...</span>
                  </div>
                ) : titles.length > 0 ? (
                  <div className="space-y-2">
                    {titles.map((title, idx) => (
                      <div
                        key={idx}
                        className={`group flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedTitle === title
                            ? 'bg-purple-600/20 border-purple-500/60 text-white'
                            : 'bg-white/3 border-white/8 text-gray-300 hover:bg-white/6 hover:border-white/15'
                        }`}
                        onClick={() => onUpdateThumbnailState({ ...thumbnailState, selectedTitle: title })}
                      >
                        <span className="flex-1 text-sm leading-snug">{title}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopy(title, `title-${idx}`); }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded"
                          title="Copy"
                        >
                          {copiedIndex === `title-${idx}`
                            ? <Check size={13} className="text-green-400" />
                            : <Copy size={13} className="text-gray-400" />
                          }
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 py-2">Generate button dabao → AI 4 viral titles banayega</p>
                )}

                <input
                  type="text"
                  value={selectedTitle}
                  onChange={(e) => onUpdateThumbnailState({ ...thumbnailState, selectedTitle: e.target.value })}
                  placeholder="Or type a title directly..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-gray-600"
                />
              </div>

              {/* ── STEP 2: Thumbnail Text ── */}
              <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-orange-400/80 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                      <Zap size={11} />
                      Step 2 — Thumbnail Text
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">Thumbnail image par bada dikhne wala short hook</p>
                  </div>
                  <button
                    onClick={handleGenerateThumbnailText}
                    disabled={isGeneratingThumbnailText || !hasEitherSource}
                    className="flex items-center gap-1.5 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/30 text-orange-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
                  >
                    {isGeneratingThumbnailText
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Wand2 size={12} />
                    }
                    {thumbnailTexts.length > 0 ? 'Regenerate' : 'Generate'}
                  </button>
                </div>

                {isGeneratingThumbnailText ? (
                  <div className="flex items-center gap-2 text-gray-500 py-3">
                    <Loader2 className="animate-spin" size={14} />
                    <span className="text-sm">Clickbait lines generate ho rahe hain...</span>
                  </div>
                ) : thumbnailTexts.length > 0 ? (
                  <div className="space-y-2">
                    {thumbnailTexts.map((text, idx) => (
                      <div
                        key={idx}
                        className={`group flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedThumbnailText === text
                            ? 'bg-orange-600/20 border-orange-500/60 text-white'
                            : 'bg-white/3 border-white/8 text-gray-300 hover:bg-white/6 hover:border-white/15'
                        }`}
                        onClick={() => onUpdateThumbnailState({ ...thumbnailState, selectedThumbnailText: text })}
                      >
                        <span className="flex-1 text-sm font-bold">{text}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopy(text, `thumb-${idx}`); }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded"
                          title="Copy"
                        >
                          {copiedIndex === `thumb-${idx}`
                            ? <Check size={13} className="text-green-400" />
                            : <Copy size={13} className="text-gray-400" />
                          }
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 py-2">Generate dabao → 5 short clickbait lines milenge (thumbnail par jaayenge)</p>
                )}

                <input
                  type="text"
                  value={selectedThumbnailText}
                  onChange={(e) => onUpdateThumbnailState({ ...thumbnailState, selectedThumbnailText: e.target.value })}
                  placeholder='Ya khud likho... (e.g. "He QUIT Everything")'
                  className="w-full bg-white/5 border border-orange-500/20 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors placeholder-gray-600"
                />

                {textForThumbnail && (
                  <div className="flex items-center gap-2 bg-orange-500/8 border border-orange-500/20 rounded-lg px-3 py-2">
                    <Zap size={12} className="text-orange-400 shrink-0" />
                    <p className="text-xs text-orange-300">Thumbnail par dikhega: <span className="font-bold">{textForThumbnail}</span></p>
                  </div>
                )}
              </div>

              {/* ── STEP 3: Speakers ── */}
              <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl p-5 space-y-3">
                <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">Step 3 — Speakers</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500 font-medium">Host (right side)</label>
                    <input
                      type="text"
                      value={hostName}
                      onChange={(e) => onUpdateThumbnailState({ ...thumbnailState, hostName: e.target.value })}
                      placeholder="Joe Rogan"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-gray-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500 font-medium">Guest (left side) *</label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => onUpdateThumbnailState({ ...thumbnailState, guestName: e.target.value })}
                      placeholder="Guest ka naam..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-gray-600"
                    />
                  </div>
                </div>
              </div>

              {/* ── STEP 4: Style ── */}
              <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl p-5 space-y-3">
                <div>
                  <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">Step 4 — Style</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {isDefaultStyle
                      ? 'Default style loaded — isko replace kar sakte ho apni image se'
                      : isStyleCopyMode
                      ? 'Style Copy Mode — reference image ki style copy hogi, topic nayi hogi'
                      : 'Apni thumbnail ki reference image upload karo'}
                  </p>
                </div>

                {/* Reference image area */}
                {!referenceImage ? (
                  <div
                    className="w-full border-2 border-dashed border-white/10 rounded-xl p-5 flex flex-col items-center justify-center text-gray-500 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all cursor-pointer gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={20} />
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-400">Style copy ke liye upload karo</p>
                      <p className="text-xs text-gray-600 mt-0.5">JPEG · PNG · WEBP — optional</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Preview */}
                    <div className="relative w-full h-28 rounded-xl overflow-hidden border border-orange-500/30 group">
                      <img src={referenceImage.url} alt="Reference" className="w-full h-full object-cover" />
                      <div className={`absolute top-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${isDefaultStyle ? 'bg-blue-600' : 'bg-orange-500'}`}>
                        {isDefaultStyle ? '⭐ Default Style' : <><Copy size={9} /> Style Copy Mode</>}
                      </div>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          onClick={handleRemoveImage}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          <X size={12} /> Remove
                        </button>
                      </div>
                    </div>

                    {/* Info note */}
                    <div className="flex items-start gap-2 bg-orange-500/8 border border-orange-500/20 rounded-lg px-3 py-2">
                      <Info size={12} className="text-orange-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-300/80">
                        Only the <strong>visual style</strong> will be copied (color, layout, font style). Topic and faces will stay new.
                      </p>
                    </div>

                    {/* Extra instructions */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-500 font-medium flex items-center gap-1.5">
                        Extra Instructions <span className="text-gray-700">(optional)</span>
                      </label>
                      <textarea
                        value={extraInstructions}
                        onChange={(e) => onUpdateThumbnailState({ ...thumbnailState, extraInstructions: e.target.value })}
                        placeholder="e.g. Dark background, red text, dramatic expression, bold layout..."
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors placeholder-gray-600 resize-none"
                      />
                    </div>
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUploadWithFlag}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />
              </div>

              {/* ── Generate Button ── */}
              <button
                onClick={handleGenerateThumbnail}
                disabled={isLoading || !canGenerate}
                className="w-full bg-gradient-to-r from-orange-600 to-purple-600 hover:from-orange-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Generating thumbnail...
                  </>
                ) : (
                  <>
                    <Image size={18} />
                    Generate Thumbnail
                    {isStyleCopyMode && <span className="text-xs bg-orange-500/30 px-1.5 py-0.5 rounded ml-1">Style Copy</span>}
                  </>
                )}
              </button>

              {!canGenerate && (
                <p className="text-center text-xs text-gray-600">
                  {!textForThumbnail ? 'Thumbnail text ya title chahiye' : 'Guest ka naam daalo'}
                </p>
              )}

            </div>

            {/* ── RIGHT: Preview ── */}
            <div className="lg:sticky lg:top-4">
              <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center min-h-[380px] relative overflow-hidden">
                <AnimatePresence mode="wait">
                  {thumbnailUrl ? (
                    <motion.div
                      key="thumbnail"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="w-full space-y-4"
                    >
                      <div className="aspect-video w-full rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                        <img src={thumbnailUrl} alt="Generated Thumbnail" className="w-full h-full object-cover" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={handleDownload}
                          className="bg-white/8 hover:bg-white/15 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                        >
                          <Download size={16} /> Download
                        </button>
                        <button
                          onClick={handleGenerateThumbnail}
                          disabled={isLoading}
                          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                        >
                          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                          Regenerate
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="placeholder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center space-y-3 px-4"
                    >
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                        <Image size={32} className="text-gray-600" />
                      </div>
                      <div>
                        <p className="text-gray-400 font-medium text-sm">Thumbnail Preview</p>
                        <p className="text-gray-600 text-xs mt-1">Left side form fill karo, phir Generate button dabao</p>
                      </div>
                      {textForThumbnail && (
                        <div className="mt-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-left">
                          <p className="text-[10px] text-orange-400 uppercase tracking-wider mb-1 font-semibold">Thumbnail par dikhega</p>
                          <p className="text-white font-black text-xl leading-tight">{textForThumbnail}</p>
                        </div>
                      )}
                      {isStyleCopyMode && (
                        <div className="p-3 bg-orange-500/8 border border-orange-500/20 rounded-xl text-left">
                          <p className="text-[10px] text-orange-400 uppercase tracking-wider mb-1 font-semibold flex items-center gap-1">
                            <Copy size={9} /> Style Copy Mode Active
                          </p>
                          <p className="text-gray-400 text-xs">Reference image ki style use hogi — topic nayi hogi</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {isLoading && (
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-10">
                    <Loader2 className="animate-spin text-purple-400" size={40} />
                    <div className="text-center">
                      {loadingStep === 'inspecting' ? (
                        <>
                          <p className="text-white font-semibold text-sm">Step 1: Inspecting reference image...</p>
                          <p className="text-gray-400 text-xs mt-1">Style extract ho rahi hai</p>
                        </>
                      ) : (
                        <>
                          <p className="text-white font-semibold text-sm">
                            {isStyleCopyMode ? 'Step 2: Generating thumbnail...' : 'Generating thumbnail...'}
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            {isStyleCopyMode ? 'Style apply ho rahi hai' : '15-30 seconds lag sakte hain'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default ThumbnailGenerator;
