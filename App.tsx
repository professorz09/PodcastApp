import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import DebateInput from './components/DebateInput';
import ScriptEditor from './components/ScriptEditor';
import AudioGenerator from './components/AudioGenerator';
import ThumbnailGenerator from './components/ThumbnailGenerator';
import DebateVisualizer from './components/DebateVisualizer';
import ContentImporter from './components/ContentImporter';
import LyricsGenerator from './components/LyricsGenerator';
import { generateDebateScript, generateContextBridgeConclusion } from './services/geminiService';
import { AppState, DebateConfig, DebateSegment, ThumbnailState, YoutubeImportData } from './types';
import { saveState, loadState, clearState } from './services/storageService';
import { Key, ExternalLink, RotateCcw, AlertTriangle, X } from 'lucide-react';
import { ToastContainer, toast } from './components/Toast';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IMPORT);
  const [youtubeData, setYoutubeData] = useState<YoutubeImportData | null>(null);
  const [script, setScript] = useState<DebateSegment[]>([]);
  const [thumbnailState, setThumbnailState] = useState<ThumbnailState>({
    titles: [],
    selectedTitle: '',
    thumbnailTexts: [],
    selectedThumbnailText: '',
    hostName: 'Joe Rogan',
    guestName: '',
    thumbnailUrl: null,
    referenceImage: null,
    extraInstructions: '',
  });
  const [audioVoices, setAudioVoices] = useState<Record<string, string>>({});
  const [scriptStyle, setScriptStyle] = useState<string>('debate');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Check for API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      // 1. Check if aistudio object exists and has a key selected
      if (window.aistudio) {
        const hasSelected = await window.aistudio.hasSelectedApiKey();
        if (hasSelected) {
          setHasApiKey(true);
          return;
        }
      }

      // 2. Check if key is already in environment (process.env or import.meta.env)
      const envKey = (window as any).process?.env?.API_KEY ||
                     (window as any).process?.env?.GEMINI_API_KEY ||
                     process.env.API_KEY || 
                     process.env.GEMINI_API_KEY || 
                     (import.meta as any).env?.VITE_API_KEY || 
                     (import.meta as any).env?.VITE_GEMINI_API_KEY;
      
      if (envKey && envKey !== "") {
        setHasApiKey(true);
      } else if (!window.aistudio) {
        // Fallback for dev environments without the aistudio object
        // but still check if we have a key
        setHasApiKey(!!envKey);
      } else {
        setHasApiKey(false);
      }
    };
    checkKey();
  }, []);

  // Load state on mount
  useEffect(() => {
    const init = async () => {
      const stored = await loadState();
      if (stored) {
        // Restore youtubeData regardless of script length
        if (stored.youtubeData) {
          setYoutubeData(stored.youtubeData);
        }

        const isImportState = (s: AppState) =>
          s === AppState.IMPORT ||
          s === AppState.YOUTUBE_IMPORT || s === AppState.INSTAGRAM_IMPORT || s === AppState.REDDIT_IMPORT;

        if (stored.script.length > 0) {
          // Don't restore to import screen if user had a project in progress
          const restoredState = isImportState(stored.appState) ? AppState.INPUT : stored.appState;
          setAppState(restoredState);
          setScript(stored.script);
          if (stored.thumbnailState) {
            setThumbnailState({
              thumbnailTexts: [],
              selectedThumbnailText: '',
              extraInstructions: '',
              ...stored.thumbnailState,
            });
          }
        } else if (stored.youtubeData) {
          // Had transcript but no script — go to INPUT step
          const restoredState = isImportState(stored.appState) ? AppState.INPUT : stored.appState;
          setAppState(restoredState);
        }
      }
      setIsInitialized(true);
    };
    init();
  }, []);

  // Save state on change
  useEffect(() => {
    if (isInitialized) {
      saveState(appState, script, thumbnailState, youtubeData);
    }
  }, [appState, script, thumbnailState, youtubeData, isInitialized]);

  const handleGenerateScript = async (config: DebateConfig) => {
    setIsLoading(true);
    try {
      const isContextBridge = config.style === 'context_bridge';

      // For context_bridge: run main script + conclusion in parallel
      if (isContextBridge) {
        const speakerName = (config.speakerNames && config.speakerNames[0]) || 'Analyst';
        const contextContent = config.contextFileContent || config.customScript || config.specificDetails || config.topic;

        const [mainSegments, conclusionSegments] = await Promise.all([
          generateDebateScript(
            config.topic, config.duration, config.includeNarrator,
            config.customScript, config.contextFileContent, config.model,
            config.language, config.style, config.speakerCount,
            config.speakerNames, config.specificDetails, config.youtubeUrl,
            config.commentsFileContent
          ),
          generateContextBridgeConclusion(
            config.topic, config.language, speakerName,
            contextContent, config.model
          ),
        ]);

        // Re-index conclusion segments so IDs don't clash
        const reindexed = conclusionSegments.map((seg, i) => ({
          ...seg,
          id: `conclusion-${mainSegments.length + i}`,
        }));

        if (reindexed.length === 0) {
          toast.info('Script generated — conclusion segment could not be added.');
        }

        setScript([...mainSegments, ...reindexed]);
      } else {
        const generatedScript = await generateDebateScript(
          config.topic, config.duration, config.includeNarrator,
          config.customScript, config.contextFileContent, config.model,
          config.language, config.style, config.speakerCount,
          config.speakerNames, config.specificDetails, config.youtubeUrl,
          config.commentsFileContent
        );
        setScript(generatedScript);
      }

      setScriptStyle(config.style);
      setAppState(AppState.SCRIPT);
    } catch (error: any) {
      const errorMessage = error.message || "Failed to generate script.";
      if (errorMessage.includes("API Key is missing")) {
        setHasApiKey(false);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewProject = () => setShowResetModal(true);

  const confirmReset = async () => {
    setShowResetModal(false);
    await clearState();
    setScript([]);
    setYoutubeData(null);
    setIsLoading(false);
    setScriptStyle('debate');
    setAudioVoices({});
    setThumbnailState({
      titles: [],
      selectedTitle: '',
      thumbnailTexts: [],
      selectedThumbnailText: '',
      hostName: 'Joe Rogan',
      guestName: '',
      thumbnailUrl: null,
      referenceImage: null,
      extraInstructions: '',
    });
    // Clear importer sessionStorage so it starts fresh
    try { sessionStorage.removeItem('yt_importer_v1'); } catch {}
    try { sessionStorage.removeItem('ig_importer_v1'); } catch {}
    try { sessionStorage.removeItem('reddit_importer_v1'); } catch {}
    try { sessionStorage.removeItem('content_importer_platform'); } catch {}
    setAppState(AppState.IMPORT);
  };

  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-white p-6">
        <div className="max-w-md w-full bg-[#0a0a0a] border border-white/5 rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-16 h-16 bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <Key size={32} className="text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold mb-3">API Key Required</h1>
          <p className="text-gray-400 mb-8 leading-relaxed">
            To use the advanced features like <strong>Gemini 3.1 Flash Image</strong> generation, you need to select a Google Cloud project with billing enabled.
          </p>
          
          <button 
            onClick={async () => {
              if (window.aistudio) {
                await window.aistudio.openSelectKey();
                // Assume success and proceed
                setHasApiKey(true);
              }
            }}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-purple-900/20 transition-all active:scale-[0.98] mb-6"
          >
            Select API Key
          </button>
          
          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Learn more about billing <ExternalLink size={14} />
          </a>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white text-black flex items-center justify-center shadow-lg shadow-purple-900/20">
          <Key size={22} />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <p className="text-gray-600 text-sm font-medium">Restoring your project…</p>
      </div>
    );
  }

  return (
    <>
    <ToastContainer />
    {/* ── Custom Reset Confirmation Modal ───────────────────────────────── */}
    {showResetModal && (
      <div
        className="fixed inset-0 z-[999] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
        onClick={() => setShowResetModal(false)}
      >
        <div
          className="relative w-full max-w-sm bg-[#0f0f0f] border border-white/8 rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Top danger bar */}
          <div className="h-1 w-full bg-gradient-to-r from-red-600 to-red-400" />

          {/* Close */}
          <button
            onClick={() => setShowResetModal(false)}
            className="absolute top-3 right-3 p-1.5 text-gray-600 hover:text-gray-300 rounded-lg hover:bg-white/5 transition-all"
          >
            <X size={16} />
          </button>

          <div className="p-6 pt-5">
            {/* Icon */}
            <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mb-4">
              <RotateCcw size={22} className="text-red-400" />
            </div>

            {/* Text */}
            <h2 className="text-white font-bold text-lg leading-snug mb-1">
              Start a New Project?
            </h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-1">
              All current project <span className="text-gray-300 font-medium">progress will be permanently deleted.</span>
            </p>
            <p className="text-gray-700 text-xs">Script, audio, thumbnail — everything.</p>

            {/* Warning box */}
            <div className="mt-4 flex items-start gap-2.5 bg-red-500/5 border border-red-500/15 rounded-xl px-3.5 py-3">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-300/80 text-xs leading-relaxed">
                This action cannot be undone.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white/5 hover:bg-white/10 text-gray-300 border border-white/8 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmReset}
                className="flex-1 py-3 rounded-xl text-sm font-bold bg-red-600/80 hover:bg-red-600 text-white border border-red-500/30 transition-all shadow-lg shadow-red-900/30"
              >
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    <Layout activeStep={appState} onStepChange={setAppState} onNewProject={handleNewProject}>
      {appState === AppState.IMPORT && (
        <ContentImporter
          onImportDone={(data) => {
            setYoutubeData(data);
            setAppState(AppState.INPUT);
          }}
          onTranscriptFetched={(transcript, fullText, videoId) => {
            setYoutubeData(prev => ({
              ...(prev ?? { url: '', videoId: '', transcript: [], fullText: '' }),
              transcript,
              fullText,
              videoId,
            }));
          }}
          onAttachContext={(content, fileName) => {
            const isComments = fileName.startsWith('comments_');
            setYoutubeData(prev => ({
              ...(prev ?? { url: '', videoId: '', transcript: [], fullText: '' }),
              ...(isComments
                ? { commentsFileContent: content, commentsFileName: fileName }
                : { contextFileContent: content, contextFileName: fileName }
              ),
            }));
          }}
          onAttachPost={(content, fileName) => {
            setYoutubeData(prev => ({
              ...(prev ?? { url: '', videoId: '', transcript: [], fullText: '' }),
              contextFileContent: content,
              contextFileName: fileName,
            }));
          }}
          onSkip={() => setAppState(AppState.INPUT)}
        />
      )}

      {appState === AppState.LYRICS && (
        <LyricsGenerator
          initialComments={youtubeData?.commentsFileContent || ''}
          onSkip={() => setAppState(AppState.INPUT)}
        />
      )}

      {appState === AppState.INPUT && (
        <DebateInput 
          onGenerate={handleGenerateScript} 
          isLoading={isLoading}
          initialContextContent={youtubeData?.contextFileContent}
          initialFileName={youtubeData?.contextFileName}
          initialCommentsContent={youtubeData?.commentsFileContent}
          initialCommentsFileName={youtubeData?.commentsFileName}
        />
      )}

      {appState === AppState.SCRIPT && (
        <ScriptEditor 
          script={script} 
          onUpdateScript={setScript}
          onNext={() => setAppState(AppState.THUMBNAIL)}
          onBack={() => setAppState(AppState.INPUT)}
          youtubeData={youtubeData}
          speakerVoices={audioVoices}
          scriptStyle={scriptStyle}
        />
      )}

      {appState === AppState.THUMBNAIL && (
        <ThumbnailGenerator 
          script={script}
          youtubeData={youtubeData}
          thumbnailState={thumbnailState}
          onUpdateThumbnailState={setThumbnailState}
          onNext={() => setAppState(AppState.AUDIO)}
          onBack={() => setAppState(AppState.SCRIPT)}
        />
      )}

      {appState === AppState.AUDIO && (
        <AudioGenerator 
          script={script}
          onUpdateScript={setScript}
          onNext={() => setAppState(AppState.VISUALIZER)}
          onBack={() => setAppState(AppState.THUMBNAIL)}
          onVoicesChange={setAudioVoices}
          youtubeData={youtubeData}
        />
      )}

      {appState === AppState.VISUALIZER && (
        <DebateVisualizer
          script={script}
          onBack={() => setAppState(AppState.AUDIO)}
          youtubeData={youtubeData}
        />
      )}
    </Layout>
    </>
  );
};

export default App;
