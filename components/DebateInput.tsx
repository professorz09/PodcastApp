import React, { useState, useRef } from 'react';
import { toast } from './Toast';
import { DebateConfig } from '../types';
import { Mic, FileText, Clock, Users, ArrowRight, Upload, X, FileCheck, Sparkles, Zap, Brain, Activity, Video, BookOpen } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import IntroVideoMaker from './IntroVideoMaker';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface DebateInputProps {
  onGenerate: (config: DebateConfig) => void;
  isLoading: boolean;
  initialContextContent?: string;
  initialFileName?: string;
  initialCommentsContent?: string;
  initialCommentsFileName?: string;
}

const DebateInput: React.FC<DebateInputProps> = ({
  onGenerate,
  isLoading,
  initialContextContent,
  initialFileName,
  initialCommentsContent,
  initialCommentsFileName,
}) => {
  const [showIntroMaker, setShowIntroMaker] = useState(false);
  const [mode, setMode] = useState<'topic' | 'script' | 'youtube'>('topic');
  const [topic, setTopic] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [specificDetails, setSpecificDetails] = useState('');
  const [customScript, setCustomScript] = useState('');
  const [includeNarrator, setIncludeNarrator] = useState(false);
  const [model, setModel] = useState<'gemini-3-flash-preview' | 'gemini-3.1-pro-preview'>('gemini-3-flash-preview');
  const [language, setLanguage] = useState('English');
  // Auto Joe Rogan Style when context file is attached from YoutubeImporter
  const [style, setStyle] = useState<'debate' | 'explained' | 'podcast_panel' | 'podcast_breakdown' | 'context_bridge' | 'situational' | 'documentary'>(
    initialContextContent ? 'podcast_panel' : 'situational'
  );
  // Auto speaker count + duration for Joe Rogan Style
  const [speakerCount, setSpeakerCount] = useState<number>(initialContextContent ? 3 : 3);
  const [duration, setDuration] = useState<number>(8);
  const [contextFileContent, setContextFileContent] = useState<string | undefined>(initialContextContent);
  const [fileName, setFileName] = useState<string | undefined>(initialFileName);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [speakerNames, setSpeakerNames] = useState<string[]>(['', '', '', '']);

  const languages = [
    'English',
    'Hindi'
  ];

  const durationOptions = [1, 2, 3, 5, 8, 10, 15, 20, 25];

  const handleSubmit = async () => {
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

    onGenerate({
      topic: finalTopic,
      specificDetails,
      duration: duration,
      includeNarrator,
      customScript: mode === 'script' ? customScript : undefined,
      contextFileContent: finalContext,
      commentsFileContent: initialCommentsContent,
      model,
      language,
      style,
      speakerCount,
      speakerNames: activeNames.length > 0 ? activeNames : undefined,
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
        </div>
      </div>

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
                  placeholder="Enter a controversial topic (e.g., 'Is AI dangerous?')"
                  className="w-full bg-transparent text-white px-5 py-4 text-base md:text-lg placeholder:text-gray-600 focus:outline-none font-medium"
                />
                <div className="px-5 pb-4">
                  <textarea
                    value={specificDetails}
                    onChange={(e) => setSpecificDetails(e.target.value)}
                    placeholder="Optional: Add specific details, context, or background info..."
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
                 {mode === 'topic' ? `${topic.length} chars` : mode === 'script' ? `${customScript.split(' ').length} words` : 'YouTube Mode'}
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
              <p className="text-[9px] text-gray-500 mt-2 flex items-center gap-1 opacity-80">
                <Sparkles size={8} />
                Leave empty to auto-detect.
              </p>
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
              
              {/* Duration & Style Row */}
              <div className="grid grid-cols-2 gap-3">
                {/* Duration */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-gray-300">
                    <Clock size={12} className="text-green-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Duration</span>
                  </div>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full bg-[#111111] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-green-500/50 outline-none appearance-none cursor-pointer"
                  >
                    {durationOptions.map(d => (
                      <option key={d} value={d}>{d} Min</option>
                    ))}
                  </select>
                </div>

                {/* Style */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-gray-300">
                    <Sparkles size={12} className="text-pink-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Style</span>
                  </div>
                  <select
                    value={style === 'context_bridge' ? 'context_bridge' : style}
                    onChange={(e) => {
                      const newStyle = e.target.value as 'debate' | 'explained' | 'podcast_panel' | 'podcast_breakdown' | 'context_bridge' | 'situational' | 'documentary';
                      setStyle(newStyle);
                      if (newStyle === 'podcast_panel') { setSpeakerCount(3); }
                      if (newStyle === 'situational') { setSpeakerCount(3); }
                      if (newStyle === 'context_bridge') { setSpeakerCount(1); }
                      if (newStyle === 'debate') { setSpeakerCount(2); }
                      if (newStyle === 'explained') { setSpeakerCount(2); }
                      if (newStyle === 'podcast_breakdown') { setSpeakerCount(2); }
                      if (newStyle === 'documentary') { setSpeakerCount(2); }
                    }}
                    className="w-full bg-[#111111] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-pink-500/50 outline-none appearance-none cursor-pointer capitalize"
                  >
                    <option value="debate">Debate</option>
                    <option value="explained">Explained</option>
                    <option value="situational">Situational</option>
                    <option value="documentary">Documentary</option>
                    <option value="podcast_panel">Podcast Panel</option>
                    <option value="podcast_breakdown">Podcast Breakdown</option>
                    <option value="context_bridge">Context Analyst</option>
                  </select>
                </div>
              </div>

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

                {/* Narrator */}
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
                        if (style === 'situational') setSpeakerCount(2);
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setModel('gemini-3-flash-preview')}
                  className={`p-2.5 rounded-lg border text-left transition-all flex flex-col gap-0.5 group ${
                    model === 'gemini-3-flash-preview'
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                      : 'bg-[#111111] border-transparent text-gray-400 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="font-bold text-[11px] group-hover:text-cyan-300 transition-colors">Gemini 3 Flash</div>
                    <Zap size={10} className={model === 'gemini-3-flash-preview' ? 'text-cyan-400' : 'text-gray-600'} />
                  </div>
                  <div className="text-[8px] opacity-70 uppercase tracking-wider font-semibold">Fast</div>
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
                    <div className="font-bold text-[11px] group-hover:text-cyan-300 transition-colors">Gemini 3.1 Pro</div>
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
          disabled={isLoading || (mode === 'topic' && !topic && !contextFileContent) || (mode === 'script' && !customScript) || (mode === 'youtube' && !youtubeUrl)}
          className="w-full mt-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 rounded-[16px] shadow-lg shadow-purple-900/20 transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-3 text-base group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <span>{mode === 'script' ? 'Process Script' : 'Generate Video'}</span>
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </div>

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
