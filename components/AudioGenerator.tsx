import React, { useState, useEffect, useRef } from 'react';
import { DebateSegment, TranscriptSegment } from '../types';
import { toast } from './Toast';
import { generateSpeech, transcribeAudioBlob, generateClipIntro, generateSpeechChirp3HD } from '../services/geminiService';
import { getElevenLabsVoices, generateElevenLabsSpeech, ElevenLabsVoice } from '../services/elevenLabsService';
import { transcribeAudioGoogleCloud, getAudioDurationFromBlob, generateProportionalWordTimings } from '../services/googleCloudService';
import { mergeAudioUrls } from '../services/audioUtils';
import {
  Play, Check, ChevronLeft, Wand2, User, Mic2, MessageSquare,
  RefreshCw, Download, AlertCircle, FileText, Globe, Zap, FileAudio, ArrowRight,
  Copy, Loader2, X, Scissors
} from 'lucide-react';

interface AudioGeneratorProps {
  script: DebateSegment[];
  onUpdateScript: React.Dispatch<React.SetStateAction<DebateSegment[]>>;
  onNext: () => void;
  onBack: () => void;
  onVoicesChange?: (voices: Record<string, string>) => void;
  youtubeData?: import('../types').YoutubeImportData | null;
}

const AudioGenerator: React.FC<AudioGeneratorProps> = ({ script, onUpdateScript, onNext, onBack, onVoicesChange, youtubeData }) => {
  const [ttsProvider, setTtsProvider] = useState<'google' | 'elevenlabs' | 'chirp3hd'>('google');
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const isGeneratingRef = useRef(false);
  const isHindiScript = React.useMemo(() => script.some(s => /[\u0900-\u097F]/.test(s.text)), [script]);
  const [transcriptLanguage, setTranscriptLanguage] = useState<'en-US' | 'hi-IN'>(isHindiScript ? 'hi-IN' : 'en-US');

  useEffect(() => {
    setTranscriptLanguage(isHindiScript ? 'hi-IN' : 'en-US');
  }, [isHindiScript]);

  const NARRATOR_KEYS = ['Narrator', 'नैरेटर', 'नारेटर', 'Narator', 'narrator', 'NARRATOR'];
  const isNarrator = (s: string) => NARRATOR_KEYS.some(k => s.trim() === k || s.trim().toLowerCase() === k.toLowerCase());

  const uniqueSpeakers = React.useMemo(() => {
    const speakers = Array.from(new Set<string>(script.map(s => s.speaker)));
    const narratorKey = speakers.find(s => NARRATOR_KEYS.some(k => s.trim() === k || s.trim().toLowerCase() === k.toLowerCase()));
    if (narratorKey) {
      return [narratorKey, ...speakers.filter(s => s !== narratorKey)];
    }
    return speakers;
  }, [script]);

  const [voices, setVoices] = useState<Record<string, string>>({});

  useEffect(() => {
    setVoices(prev => {
      const newVoices = { ...prev };
      uniqueSpeakers.forEach((speaker) => {
        if (!newVoices[speaker]) {
          if (isNarrator(speaker)) newVoices[speaker] = 'Sulafat';
          else {
            const defaults = ['Puck', 'Zephyr', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Orus', 'Leda'];
            const speakerIndex = uniqueSpeakers.filter(s => !isNarrator(s)).indexOf(speaker);
            newVoices[speaker] = defaults[speakerIndex % defaults.length];
          }
        }
      });
      return newVoices;
    });
  }, [uniqueSpeakers]);

  useEffect(() => {
    if (onVoicesChange && Object.keys(voices).length > 0) {
      onVoicesChange(voices);
    }
  }, [voices]);

  const [globalGenerating, setGlobalGenerating] = useState(false);
  const [segmentStatus, setSegmentStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [progress, setProgress] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // ── Clip Intro ──
  const [clipIntro, setClipIntro] = useState<string | null>(null);
  const [isGeneratingIntro, setIsGeneratingIntro] = useState(false);
  const [introCopied, setIntroCopied] = useState(false);
  const [isGeneratingIntroAudio, setIsGeneratingIntroAudio] = useState(false);
  const [introAudioUrl, setIntroAudioUrl] = useState<string | null>(null);
  const introBlobUrlRef = useRef<string | null>(null);
  const [isPlayingIntro, setIsPlayingIntro] = useState(false);
  const introAudioRef = useRef<HTMLAudioElement | null>(null);

  const setIntroAudioUrlSafe = (url: string | null) => {
    if (introBlobUrlRef.current) {
      URL.revokeObjectURL(introBlobUrlRef.current);
      introBlobUrlRef.current = null;
    }
    if (url) introBlobUrlRef.current = url;
    setIntroAudioUrl(url);
  };

  useEffect(() => {
    return () => {
      introAudioRef.current?.pause();
      if (introBlobUrlRef.current) {
        URL.revokeObjectURL(introBlobUrlRef.current);
        introBlobUrlRef.current = null;
      }
    };
  }, []);

  const handleGenerateIntro = async () => {
    introAudioRef.current?.pause();
    introAudioRef.current = null;
    setIsPlayingIntro(false);
    setClipIntro(null);
    setIntroAudioUrlSafe(null);
    setIsGeneratingIntro(true);
    try {
      // Use original imported transcript — falls back to script text if no import
      const transcriptText = youtubeData?.contextFileContent || youtubeData?.fullText || script.map(s => s.text).join(' ');
      const nonNarrators = Array.from(new Set<string>(script.map(s => s.speaker).filter(s => !isNarrator(s))));
      const intro = await generateClipIntro(transcriptText, nonNarrators);
      setClipIntro(intro);
    } catch (e: any) {
      toast.error(e.message || 'Intro generation failed. Please try again.');
    } finally {
      setIsGeneratingIntro(false);
    }
  };

  const handleGenerateIntroAudio = async () => {
    if (!clipIntro) return;
    introAudioRef.current?.pause();
    introAudioRef.current = null;
    setIsPlayingIntro(false);
    setIntroAudioUrlSafe(null);
    setIsGeneratingIntroAudio(true);
    try {
      const firstSpeaker = uniqueSpeakers.find(s => !isNarrator(s)) || uniqueSpeakers[0] || '';
      const voice = voices[firstSpeaker] || 'Zephyr';
      let audioUrl: string;
      if (ttsProvider === 'elevenlabs') {
        const res = await generateElevenLabsSpeech(clipIntro, voice);
        audioUrl = res.audioUrl;
      } else if (ttsProvider === 'chirp3hd') {
        const res = await generateSpeechChirp3HD(clipIntro, voice, transcriptLanguage);
        audioUrl = res.audioUrl;
      } else {
        const res = await generateSpeech(clipIntro, voice);
        audioUrl = res.audioUrl;
      }
      setIntroAudioUrlSafe(audioUrl);
    } catch (e: any) {
      toast.error(e.message || 'Intro audio generation failed. Please try again.');
    } finally {
      setIsGeneratingIntroAudio(false);
    }
  };

  const handlePlayPauseIntro = () => {
    if (!introAudioUrl) return;
    if (!introAudioRef.current) {
      introAudioRef.current = new Audio(introAudioUrl);
      introAudioRef.current.onended = () => setIsPlayingIntro(false);
    }
    if (isPlayingIntro) {
      introAudioRef.current.pause();
      setIsPlayingIntro(false);
    } else {
      introAudioRef.current.play();
      setIsPlayingIntro(true);
    }
  };

  const handleDownloadIntroAudio = () => {
    if (!introAudioUrl) return;
    const ext = ttsProvider === 'google' ? 'wav' : 'mp3';
    const a = document.createElement('a');
    a.href = introAudioUrl;
    a.download = `clip-intro.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  useEffect(() => {
    const chirp3HdValidIds = ['Achernar','Achird','Algenib','Algieba','Alnilam','Aoede','Autonoe','Callirrhoe','Charon','Despina','Enceladus','Erinome','Fenrir','Gacrux','Iapetus','Kore','Laomedeia','Leda','Orus','Puck','Pulcherrima','Rasalgethi','Sadachbia','Sadaltager','Schedar','Sulafat','Umbriel','Vindemiatrix','Zephyr','Zubenelgenubi'];
    const chirp3HdDefaults = ['Zephyr', 'Puck', 'Aoede', 'Charon', 'Kore', 'Fenrir'];
    if (ttsProvider === 'elevenlabs') {
      if (elevenLabsVoices.length > 0) {
        setVoices(prev => {
          const newVoices = { ...prev };
          uniqueSpeakers.forEach((speaker, idx) => {
            if (!newVoices[speaker] || !elevenLabsVoices.find(v => v.voice_id === newVoices[speaker])) {
              const elIndex = idx % elevenLabsVoices.length;
              newVoices[speaker] = elevenLabsVoices[elIndex]?.voice_id || '';
            }
          });
          return newVoices;
        });
      } else {
        setLoadingVoices(true);
        setVoiceError(null);
        getElevenLabsVoices()
          .then(fetchedVoices => {
            setElevenLabsVoices(fetchedVoices);
            if (fetchedVoices.length > 0) {
              setVoices(prev => {
                const newVoices = { ...prev };
                uniqueSpeakers.forEach((speaker, idx) => {
                  const elIndex = idx % fetchedVoices.length;
                  newVoices[speaker] = fetchedVoices[elIndex]?.voice_id || '';
                });
                return newVoices;
              });
            }
          })
          .catch(err => {
            console.error(err);
            setVoiceError('Failed to load ElevenLabs voices. Please check if ELEVENLABS_API_KEY is set in .env');
          })
          .finally(() => setLoadingVoices(false));
      }
    } else if (ttsProvider === 'chirp3hd') {
      setVoices(prev => {
        const newVoices = { ...prev };
        uniqueSpeakers.forEach((speaker, idx) => {
          if (!newVoices[speaker] || !chirp3HdValidIds.includes(newVoices[speaker])) {
            newVoices[speaker] = chirp3HdDefaults[idx % chirp3HdDefaults.length];
          }
        });
        return newVoices;
      });
    }
  }, [ttsProvider, uniqueSpeakers]);

  if (!script || script.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 text-gray-500">
          <Wand2 size={32} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">No Script Available</h2>
        <p className="text-gray-400 mb-6">Please generate a script before creating audio.</p>
        <button
          onClick={onBack}
          className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2"
        >
          <ChevronLeft size={20} /> Go Back
        </button>
      </div>
    );
  }

  // Chirp 3 HD — all 30 official Cloud TTS voices (en-US & hi-IN supported)
  const chirp3HdVoices = [
    { id: 'Achernar',      label: 'Achernar',      desc: 'Soft',          gender: 'Female' },
    { id: 'Aoede',         label: 'Aoede',         desc: 'Breezy',        gender: 'Female' },
    { id: 'Autonoe',       label: 'Autonoe',       desc: 'Bright',        gender: 'Female' },
    { id: 'Callirrhoe',    label: 'Callirrhoe',    desc: 'Easy-going',    gender: 'Female' },
    { id: 'Despina',       label: 'Despina',       desc: 'Smooth',        gender: 'Female' },
    { id: 'Erinome',       label: 'Erinome',       desc: 'Clear',         gender: 'Female' },
    { id: 'Gacrux',        label: 'Gacrux',        desc: 'Mature',        gender: 'Female' },
    { id: 'Kore',          label: 'Kore',          desc: 'Firm',          gender: 'Female' },
    { id: 'Laomedeia',     label: 'Laomedeia',     desc: 'Upbeat',        gender: 'Female' },
    { id: 'Leda',          label: 'Leda',          desc: 'Youthful',      gender: 'Female' },
    { id: 'Pulcherrima',   label: 'Pulcherrima',   desc: 'Forward',       gender: 'Female' },
    { id: 'Sulafat',       label: 'Sulafat',       desc: 'Warm',          gender: 'Female' },
    { id: 'Vindemiatrix',  label: 'Vindemiatrix',  desc: 'Gentle',        gender: 'Female' },
    { id: 'Zephyr',        label: 'Zephyr',        desc: 'Bright',        gender: 'Female' },
    { id: 'Achird',        label: 'Achird',        desc: 'Friendly',      gender: 'Male'   },
    { id: 'Algenib',       label: 'Algenib',       desc: 'Gravelly',      gender: 'Male'   },
    { id: 'Algieba',       label: 'Algieba',       desc: 'Smooth',        gender: 'Male'   },
    { id: 'Alnilam',       label: 'Alnilam',       desc: 'Firm',          gender: 'Male'   },
    { id: 'Charon',        label: 'Charon',        desc: 'Informative',   gender: 'Male'   },
    { id: 'Enceladus',     label: 'Enceladus',     desc: 'Breathy',       gender: 'Male'   },
    { id: 'Fenrir',        label: 'Fenrir',        desc: 'Excitable',     gender: 'Male'   },
    { id: 'Iapetus',       label: 'Iapetus',       desc: 'Clear',         gender: 'Male'   },
    { id: 'Orus',          label: 'Orus',          desc: 'Firm',          gender: 'Male'   },
    { id: 'Puck',          label: 'Puck',          desc: 'Upbeat',        gender: 'Male'   },
    { id: 'Rasalgethi',    label: 'Rasalgethi',    desc: 'Informative',   gender: 'Male'   },
    { id: 'Sadachbia',     label: 'Sadachbia',     desc: 'Lively',        gender: 'Male'   },
    { id: 'Sadaltager',    label: 'Sadaltager',    desc: 'Knowledgeable', gender: 'Male'   },
    { id: 'Schedar',       label: 'Schedar',       desc: 'Even',          gender: 'Male'   },
    { id: 'Umbriel',       label: 'Umbriel',       desc: 'Easy-going',    gender: 'Male'   },
    { id: 'Zubenelgenubi', label: 'Zubenelgenubi', desc: 'Casual',        gender: 'Male'   },
  ];

  const googleVoices = [
    { id: 'Zephyr',        label: 'Zephyr',        desc: 'Bright',        gender: 'Female' },
    { id: 'Kore',          label: 'Kore',          desc: 'Firm',          gender: 'Female' },
    { id: 'Leda',          label: 'Leda',          desc: 'Youthful',      gender: 'Female' },
    { id: 'Aoede',         label: 'Aoede',         desc: 'Breezy',        gender: 'Female' },
    { id: 'Callirrhoe',    label: 'Callirrhoe',    desc: 'Easy-going',    gender: 'Female' },
    { id: 'Autonoe',       label: 'Autonoe',       desc: 'Bright',        gender: 'Female' },
    { id: 'Despina',       label: 'Despina',       desc: 'Smooth',        gender: 'Female' },
    { id: 'Erinome',       label: 'Erinome',       desc: 'Clear',         gender: 'Female' },
    { id: 'Gacrux',        label: 'Gacrux',        desc: 'Mature',        gender: 'Female' },
    { id: 'Laomedeia',     label: 'Laomedeia',     desc: 'Upbeat',        gender: 'Female' },
    { id: 'Achernar',      label: 'Achernar',      desc: 'Soft',          gender: 'Female' },
    { id: 'Pulcherrima',   label: 'Pulcherrima',   desc: 'Forward',       gender: 'Female' },
    { id: 'Vindemiatrix',  label: 'Vindemiatrix',  desc: 'Gentle',        gender: 'Female' },
    { id: 'Sulafat',       label: 'Sulafat',       desc: 'Warm',          gender: 'Female' },
    { id: 'Puck',          label: 'Puck',          desc: 'Upbeat',        gender: 'Male'   },
    { id: 'Charon',        label: 'Charon',        desc: 'Informative',   gender: 'Male'   },
    { id: 'Fenrir',        label: 'Fenrir',        desc: 'Excitable',     gender: 'Male'   },
    { id: 'Orus',          label: 'Orus',          desc: 'Firm',          gender: 'Male'   },
    { id: 'Enceladus',     label: 'Enceladus',     desc: 'Breathy',       gender: 'Male'   },
    { id: 'Iapetus',       label: 'Iapetus',       desc: 'Clear',         gender: 'Male'   },
    { id: 'Umbriel',       label: 'Umbriel',       desc: 'Easy-going',    gender: 'Male'   },
    { id: 'Algieba',       label: 'Algieba',       desc: 'Smooth',        gender: 'Male'   },
    { id: 'Algenib',       label: 'Algenib',       desc: 'Gravelly',      gender: 'Male'   },
    { id: 'Rasalgethi',    label: 'Rasalgethi',    desc: 'Informative',   gender: 'Male'   },
    { id: 'Alnilam',       label: 'Alnilam',       desc: 'Firm',          gender: 'Male'   },
    { id: 'Schedar',       label: 'Schedar',       desc: 'Even',          gender: 'Male'   },
    { id: 'Achird',        label: 'Achird',        desc: 'Friendly',      gender: 'Male'   },
    { id: 'Zubenelgenubi', label: 'Zubenelgenubi', desc: 'Casual',        gender: 'Male'   },
    { id: 'Sadachbia',     label: 'Sadachbia',     desc: 'Lively',        gender: 'Male'   },
    { id: 'Sadaltager',    label: 'Sadaltager',    desc: 'Knowledgeable', gender: 'Male'   },
  ];

  const generateSingleSegment = async (index: number) => {
    const seg = script[index];
    const voice = voices[seg.speaker as keyof typeof voices];
    if (!voice) {
      console.error(`No voice selected for ${seg.speaker}`);
      setSegmentStatus(prev => ({ ...prev, [seg.id]: 'error' }));
      return;
    }
    setSegmentStatus(prev => ({ ...prev, [seg.id]: 'loading' }));
    setAudioError(null);
    try {
      let audioUrl: string;
      if (ttsProvider === 'elevenlabs') {
        const res = await generateElevenLabsSpeech(seg.text, voice);
        audioUrl = res.audioUrl;
      } else if (ttsProvider === 'chirp3hd') {
        const res = await generateSpeechChirp3HD(seg.text, voice, transcriptLanguage);
        audioUrl = res.audioUrl;
      } else {
        const res = await generateSpeech(seg.text, voice);
        audioUrl = res.audioUrl;
      }
      const audio = new Audio();
      await new Promise<void>((resolve, reject) => {
        const onLoad = () => {
          audio.removeEventListener('loadedmetadata', onLoad);
          audio.removeEventListener('error', onError);
          onUpdateScript(prev => {
            const newScript = [...prev];
            const oldUrl = newScript[index]?.audioUrl;
            if (oldUrl?.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
            newScript[index] = { ...newScript[index], audioUrl, duration: audio.duration };
            return newScript;
          });
          resolve();
        };
        const onError = (e: Event) => {
          audio.removeEventListener('loadedmetadata', onLoad);
          audio.removeEventListener('error', onError);
          const target = e.target as HTMLAudioElement;
          const err = target?.error;
          const code = err?.code ?? 0;
          const message = err?.message ?? 'Unknown error';
          console.error('Audio load error:', code, message);
          reject(new Error(`Audio failed to load: ${code} ${message}`));
        };
        audio.addEventListener('loadedmetadata', onLoad);
        audio.addEventListener('error', onError);
        audio.src = audioUrl;
        if (audio.readyState >= 1) onLoad();
      });
      setSegmentStatus(prev => ({ ...prev, [seg.id]: 'success' }));
    } catch (error: any) {
      console.error(`Failed to generate segment ${index}`, error);
      setSegmentStatus(prev => ({ ...prev, [seg.id]: 'error' }));
      if (error.message?.includes('429') || error.status === 'RESOURCE_EXHAUSTED' || error.message?.includes('quota')) {
        setAudioError('Rate limit exceeded. Please wait a few moments and try again.');
      } else {
        setAudioError(error.message || 'Failed to generate audio. Please check your API keys and try again.');
      }
    }
  };

  const handleGenerateAll = async () => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setGlobalGenerating(true);
    setProgress(0);
    setAudioError(null);
    const allAudioGenerated = script.every(s => s.audioUrl);
    const targetSegments = allAudioGenerated ? script : script.filter(s => !s.audioUrl);
    if (targetSegments.length === 0) {
      isGeneratingRef.current = false;
      setGlobalGenerating(false);
      return;
    }
    setSegmentStatus(prev => {
      const next = { ...prev };
      targetSegments.forEach(seg => { next[seg.id] = 'loading'; });
      return next;
    });
    let completedCount = 0;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    for (let i = 0; i < targetSegments.length; i++) {
      const seg = targetSegments[i];
      const voice = voices[seg.speaker as keyof typeof voices];
      if (!voice) {
        console.error(`No voice selected for ${seg.speaker}`);
        setSegmentStatus(prev => ({ ...prev, [seg.id]: 'error' }));
        completedCount++;
        setProgress((completedCount / targetSegments.length) * 100);
        continue;
      }
      try {
        let audioUrl: string;
        if (ttsProvider === 'elevenlabs') {
          const res = await generateElevenLabsSpeech(seg.text, voice);
          audioUrl = res.audioUrl;
        } else if (ttsProvider === 'chirp3hd') {
          const res = await generateSpeechChirp3HD(seg.text, voice, transcriptLanguage);
          audioUrl = res.audioUrl;
        } else {
          const res = await generateSpeech(seg.text, voice);
          audioUrl = res.audioUrl;
        }
        const audio = new Audio();
        await new Promise<void>((resolve, reject) => {
          const onLoad = () => {
            audio.removeEventListener('loadedmetadata', onLoad);
            audio.removeEventListener('error', onError);
            resolve();
          };
          const onError = (e: Event) => {
            audio.removeEventListener('loadedmetadata', onLoad);
            audio.removeEventListener('error', onError);
            const target = e.target as HTMLAudioElement;
            const err = target?.error;
            reject(new Error(`Audio failed to load: ${err?.code ?? 0} ${err?.message ?? ''}`));
          };
          audio.addEventListener('loadedmetadata', onLoad);
          audio.addEventListener('error', onError);
          audio.src = audioUrl;
          if (audio.readyState >= 1) onLoad();
        });
        onUpdateScript(prev => {
          const idx = prev.findIndex(s => s.id === seg.id);
          if (idx === -1) return prev;
          const newScript = [...prev];
          const oldUrl = newScript[idx]?.audioUrl;
          if (oldUrl?.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
          newScript[idx] = { ...newScript[idx], audioUrl, duration: audio.duration || 0 };
          return newScript;
        });
        setSegmentStatus(prev => ({ ...prev, [seg.id]: 'success' }));
      } catch (error: any) {
        console.error(`Error generating segment ${seg.id}`, error);
        setSegmentStatus(prev => ({ ...prev, [seg.id]: 'error' }));
        if (error.message?.includes('429') || error.status === 'RESOURCE_EXHAUSTED' || error.message?.includes('quota')) {
          setAudioError('Rate limit exceeded. Please wait a few moments and try again.');
          break;
        }
      } finally {
        completedCount++;
        setProgress((completedCount / targetSegments.length) * 100);
        await delay(2000);
      }
    }
    isGeneratingRef.current = false;
    setGlobalGenerating(false);
  };

  // ── Split Generate ──
  type SplitChunk = { text: string; audioUrl?: string; status: 'idle' | 'loading' | 'success' | 'error' };
  const [splitChunks, setSplitChunks] = useState<SplitChunk[]>([]);
  const [isSplitGenerating, setIsSplitGenerating] = useState(false);

  const isSingleSpeaker = React.useMemo(
    () => uniqueSpeakers.filter(s => !isNarrator(s)).length === 1,
    [uniqueSpeakers]
  );

  const splitTextIntoChunks = (text: string, maxChars = 2000): string[] => {
    const sentenceEndRx = /[.!?।]+(?:\s|$)/g;
    const sentences: string[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = sentenceEndRx.exec(text)) !== null) {
      const s = text.slice(lastIdx, m.index + m[0].length).trim();
      if (s) sentences.push(s);
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) {
      const tail = text.slice(lastIdx).trim();
      if (tail) sentences.push(tail);
    }
    const chunks: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      if (current.length + sentence.length + 1 > maxChars && current.length > 0) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current = current ? current + ' ' + sentence : sentence;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  };

  const handleSplitGenerate = async () => {
    if (isSplitGenerating) return;
    const speaker = uniqueSpeakers.find(s => !isNarrator(s)) || uniqueSpeakers[0];
    const voice = voices[speaker];
    if (!voice) { toast.error('Please select a voice first.'); return; }
    const fullText = script.map(s => s.text).join(' ');
    const chunks = splitTextIntoChunks(fullText, 2000);
    if (chunks.length === 0) { toast.error('No text to generate.'); return; }
    setSplitChunks(chunks.map(text => ({ text, status: 'idle' })));
    setIsSplitGenerating(true);
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < chunks.length; i++) {
      setSplitChunks(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'loading' } : c));
      try {
        let audioUrl: string;
        if (ttsProvider === 'elevenlabs') {
          const res = await generateElevenLabsSpeech(chunks[i], voice);
          audioUrl = res.audioUrl;
        } else if (ttsProvider === 'chirp3hd') {
          const res = await generateSpeechChirp3HD(chunks[i], voice, transcriptLanguage);
          audioUrl = res.audioUrl;
        } else {
          const res = await generateSpeech(chunks[i], voice);
          audioUrl = res.audioUrl;
        }
        setSplitChunks(prev => prev.map((c, idx) => idx === i ? { ...c, audioUrl, status: 'success' } : c));
      } catch (e: any) {
        setSplitChunks(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'error' } : c));
        toast.error(`Part ${i + 1} failed: ${e.message}`);
      }
      if (i < chunks.length - 1) await delay(1500);
    }
    setIsSplitGenerating(false);
  };

  const [playingSegment, setPlayingSegment] = useState<string | null>(null);
  const [syncingSegments, setSyncingSegments] = useState<Record<string, boolean>>({});
  const [expandedSegments, setExpandedSegments] = useState<Record<string, boolean>>({});
  const audioPreviewRef = React.useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current.src = '';
        audioPreviewRef.current = null;
      }
    };
  }, []);

  const toggleExpand = (id: string) => setExpandedSegments(prev => ({ ...prev, [id]: !prev[id] }));

  const buildPhrases = (words: { word: string; start: number; end: number }[]) => {
    const phrases = [];
    let currentPhrase: string[] = [];
    let phraseStart = 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (currentPhrase.length === 0) phraseStart = w.start;
      currentPhrase.push(w.word);
      const isPunctuation = /[.!?।]$/.test(w.word);
      const isLong = currentPhrase.length >= 7;
      const nextGap = i < words.length - 1 ? words[i + 1].start - w.end : 0;
      const isGap = nextGap > 0.4;
      if (isPunctuation || isLong || isGap || i === words.length - 1) {
        phrases.push({ text: currentPhrase.join(' '), start: phraseStart, end: w.end });
        currentPhrase = [];
      }
    }
    return phrases;
  };

  const playSegment = (id: string, url: string) => {
    if (playingSegment === id) {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current.src = '';
        audioPreviewRef.current = null;
      }
      setPlayingSegment(null);
      return;
    }
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current.src = '';
    }
    const audio = new Audio(url);
    audioPreviewRef.current = audio;
    setPlayingSegment(id);
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(e => {
        if (e.name !== 'AbortError') console.error('Preview play failed', e);
        if (audioPreviewRef.current === audio) setPlayingSegment(null);
      });
    }
    audio.onended = () => {
      if (audioPreviewRef.current === audio) {
        setPlayingSegment(null);
        audioPreviewRef.current = null;
      }
    };
  };

  const syncTranscript = async (index: number) => {
    const seg = script[index];
    if (!seg.audioUrl) return;
    setSyncingSegments(prev => ({ ...prev, [seg.id]: true }));
    try {
      const response = await fetch(seg.audioUrl);
      if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
      const blob = await response.blob();

      let wordTimings: { word: string; start: number; end: number }[];
      let usedFallback = false;
      try {
        wordTimings = await transcribeAudioGoogleCloud(blob, transcriptLanguage);
      } catch (cloudErr) {
        console.warn('Cloud STT unavailable, using offline proportional timing:', cloudErr);
        usedFallback = true;
        const duration = seg.duration ?? await getAudioDurationFromBlob(blob);
        wordTimings = generateProportionalWordTimings(seg.text, duration);
      }

      const phraseTimings = buildPhrases(wordTimings);
      onUpdateScript(prev => {
        const newScript = [...prev];
        newScript[index] = { ...newScript[index], wordTimings, phraseTimings };
        return newScript;
      });
      if (usedFallback) {
        toast.info('Offline mode: approximate timings applied (Google Cloud STT unavailable)');
      }
    } catch (error) {
      console.error('Failed to sync transcript', error);
      toast.error('Failed to sync transcript: ' + (error as Error).message);
    } finally {
      setSyncingSegments(prev => ({ ...prev, [seg.id]: false }));
    }
  };

  const handleSyncAll = async () => {
    setSyncStatus('loading');
    let fallbackCount = 0;
    try {
      const syncResults: Record<number, { wordTimings: any[]; phraseTimings: any[] }> = {};
      for (let i = 0; i < script.length; i++) {
        const seg = script[i];
        if (!seg.audioUrl) continue;
        try {
          const response = await fetch(seg.audioUrl);
          if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
          const blob = await response.blob();

          let wordTimings: { word: string; start: number; end: number }[];
          try {
            wordTimings = await transcribeAudioGoogleCloud(blob, transcriptLanguage);
          } catch (cloudErr) {
            console.warn(`Segment ${i}: Cloud STT unavailable, using offline fallback`, cloudErr);
            fallbackCount++;
            const duration = seg.duration ?? await getAudioDurationFromBlob(blob);
            wordTimings = generateProportionalWordTimings(seg.text, duration);
          }

          const phraseTimings = buildPhrases(wordTimings);
          syncResults[i] = { wordTimings, phraseTimings };
        } catch (err) {
          console.error(`Failed to sync segment ${i}`, err);
        }
        await new Promise(r => setTimeout(r, 200));
      }
      onUpdateScript(prev => {
        const newScript = [...prev];
        Object.keys(syncResults).forEach(key => {
          const idx = parseInt(key);
          newScript[idx] = {
            ...newScript[idx],
            wordTimings: syncResults[idx].wordTimings,
            phraseTimings: syncResults[idx].phraseTimings,
          };
        });
        return newScript;
      });
      setSyncStatus('success');
      if (fallbackCount > 0) {
        toast.info(`Offline mode: ${fallbackCount} segment(s) used approximate timings (Google Cloud STT unavailable)`);
      }
    } catch (error) {
      console.error('Sync All Failed', error);
      setSyncStatus('error');
    }
  };

  const downloadSegment = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleFetchTranscript = () => {
    const content = script.map(s => `[${s.speaker}]: ${s.text}`).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    downloadSegment(url, 'transcript.txt');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadMergedAudio = async () => {
    const urls = script.map(s => s.audioUrl).filter(Boolean) as string[];
    if (urls.length === 0) return;
    setIsMerging(true);
    try {
      const { blob } = await mergeAudioUrls(urls);
      const url = URL.createObjectURL(blob);
      downloadSegment(url, 'full_debate_audio.wav');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Failed to merge audio', error);
      toast.error('Failed to merge audio files.');
    } finally {
      setIsMerging(false);
    }
  };

  const handleDownloadSingleTranscript = (seg: DebateSegment, index: number) => {
    const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60).toString().padStart(2, '0');
      const s = (seconds % 60).toFixed(2).padStart(5, '0');
      return `[${m}:${s}]`;
    };
    const timingsText = seg.phraseTimings
      ? seg.phraseTimings.map(p => `${formatTime(p.start)} ${p.text}`).join('\n')
      : 'Not synced';
    const content = `[${seg.speaker}]\n${seg.text}\n\nTimings:\n${timingsText}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    downloadSegment(url, `segment_${index + 1}_transcript.txt`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const allAudioGenerated = script.every(s => s.audioUrl);
  const audioReadyCount = script.filter(s => s.audioUrl).length;

  const speakerCardStyles = (role: string) => {
    const narratorRole = isNarrator(role);
    const speakerIndex = uniqueSpeakers.filter(s => !isNarrator(s)).indexOf(role);
    if (narratorRole) return { card: 'bg-zinc-900/60 border-zinc-700/40', icon: 'bg-zinc-700/60 text-zinc-300' };
    if (speakerIndex === 0) return { card: 'bg-blue-950/30 border-blue-800/30', icon: 'bg-blue-900/40 text-blue-400' };
    if (speakerIndex === 1) return { card: 'bg-purple-950/30 border-purple-800/30', icon: 'bg-purple-900/40 text-purple-400' };
    if (speakerIndex === 2) return { card: 'bg-green-950/30 border-green-800/30', icon: 'bg-green-900/40 text-green-400' };
    return { card: 'bg-orange-950/30 border-orange-800/30', icon: 'bg-orange-900/40 text-orange-400' };
  };

  const speakerTimelineColor = (role: string) => {
    if (isNarrator(role)) return { dot: 'bg-gray-800 text-gray-400', card: 'bg-[#0a0a0a] border-white/5 hover:border-white/10', label: 'text-gray-500' };
    const idx = uniqueSpeakers.filter(s => !isNarrator(s)).indexOf(role);
    if (idx === 0) return { dot: 'bg-blue-900/20 text-blue-400', card: 'bg-blue-950/5 border-blue-900/20 hover:border-blue-500/30', label: 'text-blue-400' };
    if (idx === 1) return { dot: 'bg-purple-900/20 text-purple-400', card: 'bg-purple-950/5 border-purple-900/20 hover:border-purple-500/30', label: 'text-purple-400' };
    if (idx === 2) return { dot: 'bg-green-900/20 text-green-400', card: 'bg-green-950/5 border-green-900/20 hover:border-green-500/30', label: 'text-green-400' };
    return { dot: 'bg-orange-900/20 text-orange-400', card: 'bg-orange-950/5 border-orange-900/20 hover:border-orange-500/30', label: 'text-orange-400' };
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>

      {/* ── Full-width Header ── */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 md:py-4 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-sm shrink-0">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-800 rounded-xl text-gray-400 transition-colors active:scale-95"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h2 className="text-lg md:text-2xl font-bold text-white">Voice Settings</h2>
          <p className="text-xs text-gray-500 hidden sm:block">Assign voices and generate audio</p>
        </div>
        {audioError && (
          <div className="ml-auto flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-2 md:px-3 py-1.5 rounded-xl max-w-[160px] md:max-w-none truncate">
            <AlertCircle size={13} className="shrink-0" /> <span className="truncate">{audioError}</span>
          </div>
        )}
      </div>

      {/* ── Mobile Top Controls ── */}
      <div className="md:hidden bg-[#0b0b0b] border-b border-white/5 px-3 py-2 flex items-center gap-2 overflow-x-auto scrollbar-hide shrink-0">
        {/* Engine */}
        <button onClick={() => setTtsProvider('google')} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all ${ttsProvider === 'google' ? 'bg-purple-600/20 border border-purple-500/40 text-purple-300' : 'text-gray-500 border border-white/5 hover:bg-white/5'}`}>
          <Globe size={13} /> Gemini
        </button>
        <button onClick={() => setTtsProvider('chirp3hd')} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all ${ttsProvider === 'chirp3hd' ? 'bg-cyan-600/20 border border-cyan-500/40 text-cyan-300' : 'text-gray-500 border border-white/5 hover:bg-white/5'}`}>
          <Mic2 size={13} /> Chirp HD
        </button>
        <button onClick={() => setTtsProvider('elevenlabs')} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all ${ttsProvider === 'elevenlabs' ? 'bg-purple-600/20 border border-purple-500/40 text-purple-300' : 'text-gray-500 border border-white/5 hover:bg-white/5'}`}>
          <Zap size={13} /> ElevenLabs
        </button>
        <div className="w-px h-6 bg-white/10 shrink-0" />
        <button onClick={() => setTranscriptLanguage('en-US')} className={`px-3 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all ${transcriptLanguage === 'en-US' ? 'bg-blue-600/20 border border-blue-500/40 text-blue-300' : 'text-gray-500 border border-white/5'}`}>EN</button>
        <button onClick={() => setTranscriptLanguage('hi-IN')} className={`px-3 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all ${transcriptLanguage === 'hi-IN' ? 'bg-blue-600/20 border border-blue-500/40 text-blue-300' : 'text-gray-500 border border-white/5'}`}>HI</button>
        <div className="w-px h-6 bg-white/10 shrink-0" />
        <div className="text-[11px] font-bold text-white whitespace-nowrap">{audioReadyCount}/{script.length} done</div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button onClick={handleGenerateAll} disabled={globalGenerating || isSplitGenerating} className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-[11px] font-bold px-3 py-2 rounded-xl transition-all active:scale-95">
            <Wand2 size={13} className={globalGenerating ? 'animate-spin' : ''} /> {globalGenerating ? 'Generating' : allAudioGenerated ? 'Regen All' : 'Gen All'}
          </button>
          {isSingleSpeaker && (
            <button onClick={handleSplitGenerate} disabled={isSplitGenerating || globalGenerating} title="Split generate — under 3 min parts" className="flex items-center gap-1 bg-teal-600/20 border border-teal-500/30 text-teal-300 text-[11px] font-bold px-2.5 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50">
              {isSplitGenerating ? <Loader2 size={13} className="animate-spin" /> : <Scissors size={13} />}
            </button>
          )}
          <button onClick={onNext} disabled={!allAudioGenerated} className={`flex items-center gap-1 text-[11px] font-bold px-3 py-2 rounded-xl transition-all active:scale-95 ${allAudioGenerated ? 'bg-white text-black hover:bg-gray-200' : 'bg-white/8 text-gray-600 cursor-not-allowed'}`}>
            Next <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* ── Body: Sidebar + Content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ══ Left Sidebar (Desktop only) ══ */}
        <div className="hidden md:flex w-[128px] shrink-0 bg-[#0b0b0b] border-r border-white/5 flex-col gap-1.5 p-2.5 overflow-y-auto">

          {/* ENGINE */}
          <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest px-1 mt-1 mb-0.5">Engine</p>
          <button
            onClick={() => setTtsProvider('google')}
            className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-[10px] font-medium transition-all w-full ${
              ttsProvider === 'google'
                ? 'bg-purple-600/20 border border-purple-500/40 text-purple-300'
                : 'text-gray-600 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Globe size={15} />
            Gemini 2.5
          </button>
          <button
            onClick={() => setTtsProvider('chirp3hd')}
            className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-[10px] font-medium transition-all w-full ${
              ttsProvider === 'chirp3hd'
                ? 'bg-cyan-600/20 border border-cyan-500/40 text-cyan-300'
                : 'text-gray-600 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Mic2 size={15} />
            Chirp 3 HD
          </button>
          <button
            onClick={() => setTtsProvider('elevenlabs')}
            className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-[10px] font-medium transition-all w-full ${
              ttsProvider === 'elevenlabs'
                ? 'bg-purple-600/20 border border-purple-500/40 text-purple-300'
                : 'text-gray-600 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Zap size={15} />
            ElevenLabs
          </button>

          <div className="h-px bg-white/5 my-1" />

          {/* LANGUAGE */}
          <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest px-1 mb-0.5">Lang</p>
          <button
            onClick={() => setTranscriptLanguage('en-US')}
            className={`py-2 rounded-xl text-[10px] font-semibold transition-all w-full ${
              transcriptLanguage === 'en-US'
                ? 'bg-blue-600/20 border border-blue-500/40 text-blue-300'
                : 'text-gray-600 hover:bg-white/5 border border-transparent'
            }`}
          >
            English
          </button>
          <button
            onClick={() => setTranscriptLanguage('hi-IN')}
            className={`py-2 rounded-xl text-[10px] font-semibold transition-all w-full ${
              transcriptLanguage === 'hi-IN'
                ? 'bg-blue-600/20 border border-blue-500/40 text-blue-300'
                : 'text-gray-600 hover:bg-white/5 border border-transparent'
            }`}
          >
            Hindi
          </button>

          <div className="flex-1" />

          {/* Progress counter */}
          <div className="text-center py-1">
            <div className="text-xl font-bold text-white tabular-nums">{audioReadyCount}/{script.length}</div>
            <div className="text-[9px] text-gray-600">done</div>
          </div>

          {/* Generate All */}
          <button
            onClick={handleGenerateAll}
            disabled={globalGenerating || isSplitGenerating}
            className="w-full flex flex-col items-center gap-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[10px] font-bold py-2.5 rounded-xl transition-all shadow-lg shadow-purple-900/30"
          >
            <Wand2 size={14} className={globalGenerating ? 'animate-spin' : ''} />
            {globalGenerating ? 'Generating' : allAudioGenerated ? 'Regen All' : 'Gen All'}
          </button>

          {/* Split Generate — single speaker only */}
          {isSingleSpeaker && (
            <button
              onClick={handleSplitGenerate}
              disabled={isSplitGenerating || globalGenerating}
              title="Generate as separate audio parts, each under 3 minutes"
              className="w-full flex flex-col items-center gap-1 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-teal-300 text-[9px] font-bold py-2 rounded-xl transition-all"
            >
              {isSplitGenerating ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />}
              {isSplitGenerating ? 'Splitting…' : 'Split Gen'}
            </button>
          )}

          {/* Sync All */}
          <button
            onClick={handleSyncAll}
            disabled={audioReadyCount === 0 || syncStatus === 'loading'}
            className={`w-full flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              syncStatus === 'success' ? 'bg-green-500/20 border border-green-500/30 text-green-400'
              : syncStatus === 'error' ? 'bg-red-500/20 border border-red-500/30 text-red-400'
              : 'bg-white/5 hover:bg-white/10 text-gray-400 border border-transparent'
            }`}
          >
            {syncStatus === 'loading'
              ? <RefreshCw size={12} className="animate-spin" />
              : syncStatus === 'success' ? <Check size={12} />
              : <RefreshCw size={12} />}
            {syncStatus === 'loading' ? 'Syncing' : syncStatus === 'success' ? 'Synced' : 'Sync All'}
          </button>

          {/* Download buttons */}
          <div className="flex gap-1">
            <button
              onClick={handleFetchTranscript}
              className="flex-1 flex justify-center py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-all"
              title="Download Full Transcript"
            >
              <FileText size={12} />
            </button>
            <button
              onClick={handleDownloadMergedAudio}
              disabled={audioReadyCount === 0 || isMerging}
              className="flex-1 flex justify-center py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-all disabled:opacity-40"
              title="Download Merged Audio"
            >
              {isMerging ? <RefreshCw size={12} className="animate-spin" /> : <FileAudio size={12} />}
            </button>
          </div>

          {/* Next */}
          <button
            onClick={onNext}
            disabled={!allAudioGenerated}
            className={`w-full flex items-center justify-center gap-1 text-[10px] font-bold py-2.5 rounded-xl transition-all mb-1 ${
              allAudioGenerated
                ? 'bg-white text-black hover:bg-gray-200 shadow-lg'
                : 'bg-white/8 text-gray-600 cursor-not-allowed'
            }`}
          >
            Next <ArrowRight size={11} />
          </button>
        </div>

        {/* ══ Right Panel ══ */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 md:p-4 space-y-3">

            {/* ── Progress bar (when generating) ── */}
            {globalGenerating && (
              <div className="bg-[#0a0a0a] p-4 rounded-2xl border border-white/5 shadow-lg shadow-purple-900/10">
                <div className="flex justify-between text-xs text-gray-300 font-medium mb-2.5">
                  <span className="flex items-center gap-2 text-purple-400">
                    <Wand2 size={13} className="animate-spin" /> Synthesizing Audio...
                  </span>
                  <span className="font-mono">{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-800/50 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-600 to-blue-600 h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(147,51,234,0.5)]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── Split Chunks Display ── */}
            {splitChunks.length > 0 && (
              <div className="bg-teal-950/20 border border-teal-500/20 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Scissors size={13} className="text-teal-400" />
                    <span className="text-xs font-bold text-teal-300">Split Parts</span>
                    <span className="text-[10px] text-teal-600">{splitChunks.filter(c => c.status === 'success').length}/{splitChunks.length} ready</span>
                  </div>
                  <button onClick={() => setSplitChunks([])} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
                    <X size={12} />
                  </button>
                </div>
                {splitChunks.map((chunk, i) => (
                  <div key={i} className="flex items-center gap-2 bg-black/30 rounded-xl px-3 py-2">
                    <span className="text-[10px] font-bold text-teal-500 w-12 shrink-0">Part {i + 1}</span>
                    <span className="text-[10px] text-gray-500 flex-1 truncate">{chunk.text.slice(0, 60)}…</span>
                    {chunk.status === 'loading' && <Loader2 size={12} className="text-teal-400 animate-spin shrink-0" />}
                    {chunk.status === 'success' && chunk.audioUrl && (
                      <a href={chunk.audioUrl} download={`part_${i + 1}.${ttsProvider === 'google' ? 'wav' : 'mp3'}`}
                        className="flex items-center gap-1 text-[10px] font-semibold text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 px-2 py-1 rounded-lg transition-all shrink-0">
                        <Download size={10} /> Download
                      </a>
                    )}
                    {chunk.status === 'error' && <span className="text-[10px] text-red-400 shrink-0">Failed</span>}
                    {chunk.status === 'idle' && <span className="text-[10px] text-gray-600 shrink-0">Pending</span>}
                  </div>
                ))}
              </div>
            )}

            {/* ── Voice assignment cards ── */}
            {uniqueSpeakers.map((role) => {
              const styles = speakerCardStyles(role);
              const speakerSegs = script.filter(s => s.speaker === role);
              const speakerReady = speakerSegs.filter(s => s.audioUrl).length;
              const voiceLabel = ttsProvider === 'google'
                ? googleVoices.find(v => v.id === voices[role])
                  ? `${voices[role]} · ${googleVoices.find(v => v.id === voices[role])!.gender}, ${googleVoices.find(v => v.id === voices[role])!.desc}`
                  : voices[role]
                : ttsProvider === 'chirp3hd'
                  ? chirp3HdVoices.find(v => v.id === voices[role])
                    ? `${voices[role]} · ${chirp3HdVoices.find(v => v.id === voices[role])!.gender}, ${chirp3HdVoices.find(v => v.id === voices[role])!.desc}`
                    : voices[role]
                  : elevenLabsVoices.find(v => v.voice_id === voices[role])?.name || voices[role];

              return (
                <div key={role} className={`rounded-2xl border p-3.5 ${styles.card}`}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${styles.icon}`}>
                      <User size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-200 tracking-wider uppercase">{role}</p>
                      <p className="text-[10px] text-gray-500">{speakerReady}/{speakerSegs.length} segments ready</p>
                    </div>
                    {speakerReady === speakerSegs.length && speakerSegs.length > 0 && (
                      <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center shrink-0">
                        <Check size={10} className="text-green-400" />
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      value={voices[role] || ''}
                      onChange={(e) => setVoices({ ...voices, [role]: e.target.value })}
                      className="w-full bg-black/30 border border-white/5 text-white text-xs rounded-xl px-3 py-2.5 appearance-none focus:outline-none focus:ring-1 focus:ring-purple-500/50 cursor-pointer hover:border-white/10 transition-colors"
                      disabled={loadingVoices}
                    >
                      {ttsProvider === 'google'
                        ? (['Female', 'Male'] as const).map(g => (
                            <optgroup key={g} label={g === 'Female' ? '♀ Female' : '♂ Male'}>
                              {googleVoices.filter(v => v.gender === g).map(v => (
                                <option key={v.id} value={v.id}>{v.label} · {v.desc}</option>
                              ))}
                            </optgroup>
                          ))
                        : ttsProvider === 'chirp3hd'
                          ? (['Female', 'Male'] as const).map(g => (
                              <optgroup key={g} label={g === 'Female' ? '♀ Female' : '♂ Male'}>
                                {chirp3HdVoices.filter(v => v.gender === g).map(v => (
                                  <option key={v.id} value={v.id}>{v.label} · {v.desc}</option>
                                ))}
                              </optgroup>
                            ))
                          : elevenLabsVoices.length > 0
                            ? elevenLabsVoices.map(v => (
                                <option key={v.voice_id} value={v.voice_id}>
                                  {v.name}{v.labels?.accent ? ` · ${v.labels.accent}` : ''}
                                </option>
                              ))
                            : <option disabled>Loading voices...</option>}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      {loadingVoices ? <RefreshCw size={12} className="animate-spin" /> : <Mic2 size={12} />}
                    </div>
                  </div>
                  {voiceError && ttsProvider === 'elevenlabs' && (
                    <p className="text-[10px] text-red-400 mt-1.5">{voiceError}</p>
                  )}
                </div>
              );
            })}

            {/* ── Clip Intro ── */}
            <div className="bg-[#0a0a0a] rounded-2xl border border-violet-500/20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Play size={13} className="text-violet-400" />
                  <span className="text-xs font-semibold text-violet-300 uppercase tracking-widest">Clip Intro</span>
                  <span className="text-[10px] text-zinc-600 ml-1">— separate download, main audio me merge nahi hoga</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {clipIntro && (
                    <>
                      <button
                        onClick={() => { navigator.clipboard.writeText(clipIntro!).then(() => { setIntroCopied(true); setTimeout(() => setIntroCopied(false), 2000); }); }}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                      >
                        {introCopied ? <><Check size={10} className="text-green-400" /> Copied!</> : <><Copy size={10} /> Copy</>}
                      </button>
                      <button
                        onClick={handleGenerateIntroAudio}
                        disabled={isGeneratingIntroAudio}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 transition-all disabled:opacity-50"
                      >
                        {isGeneratingIntroAudio ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                        {isGeneratingIntroAudio ? 'Gen...' : 'Audio'}
                      </button>
                      {introAudioUrl && (
                        <>
                          <button onClick={handlePlayPauseIntro} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-sky-500/10 text-sky-400 transition-all">
                            {isPlayingIntro
                              ? <><span className="flex gap-0.5 items-center"><span className="w-0.5 h-3 bg-sky-400 rounded" /><span className="w-0.5 h-3 bg-sky-400 rounded" /></span>Pause</>
                              : <><Play size={10} />Play</>}
                          </button>
                          <button onClick={handleDownloadIntroAudio} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-green-500/10 text-green-400 transition-all">
                            <Download size={10} /> Download
                          </button>
                        </>
                      )}
                      <button onClick={() => { introAudioRef.current?.pause(); introAudioRef.current = null; setIsPlayingIntro(false); setClipIntro(null); setIntroAudioUrlSafe(null); }} className="text-zinc-600 hover:text-zinc-300 transition-colors ml-1">
                        <X size={13} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleGenerateIntro}
                    disabled={isGeneratingIntro}
                    className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg transition-all disabled:opacity-50 ${clipIntro ? 'bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-zinc-200' : 'bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30'}`}
                  >
                    {isGeneratingIntro ? <Loader2 size={10} className="animate-spin" /> : clipIntro ? <RefreshCw size={10} /> : <Play size={10} />}
                    {clipIntro ? '' : 'Generate'}
                  </button>
                </div>
              </div>
              {isGeneratingIntro && !clipIntro && (
                <div className="flex items-center gap-2 px-4 py-3 text-zinc-500 text-xs">
                  <Loader2 size={13} className="animate-spin text-violet-400" /> Generating intro…
                </div>
              )}
              {clipIntro && (
                <div className="px-4 py-3">
                  <p className="text-sm text-zinc-200 leading-relaxed">{clipIntro}</p>
                </div>
              )}
              {!clipIntro && !isGeneratingIntro && (
                <div className="px-4 py-3 text-xs text-zinc-600">
                  Generate a catchy intro line from the script — download separately as audio.
                </div>
              )}
            </div>

            {/* ── Script Timeline ── */}
            <div className="bg-[#0a0a0a] rounded-2xl border border-white/5 shadow-inner overflow-hidden">
              <div className="p-3.5 border-b border-white/5 flex items-center gap-2.5 sticky top-0 bg-[#0a0a0a]/95 backdrop-blur-sm z-10">
                <div className="p-1.5 bg-gray-800 rounded-lg text-gray-400">
                  <MessageSquare size={15} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-200 text-sm">Script Timeline</h3>
                  <p className="text-[10px] text-gray-500">
                    {script.length} segments · {Math.round(script.reduce((acc, s) => acc + (s.duration || 0), 0))}s total
                  </p>
                </div>
              </div>

              <div className="p-3 space-y-0 bg-[#0c0c0e]/50">
                {script.map((seg, idx) => {
                  const status = segmentStatus[seg.id] || 'idle';
                  const hasAudio = !!seg.audioUrl;
                  const isLast = idx === script.length - 1;
                  const isExpanded = expandedSegments[seg.id];
                  const isPlaying = playingSegment === seg.id;
                  const colors = speakerTimelineColor(seg.speaker);

                  return (
                    <div key={seg.id} className="flex gap-3 group">
                      {/* Timeline dot + line */}
                      <div className="shrink-0 flex flex-col items-center relative">
                        {!isLast && (
                          <div className="absolute top-10 bottom-[-16px] w-px bg-gray-800/50 z-0 group-hover:bg-gray-700/50 transition-colors" />
                        )}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold z-10 relative ring-4 ring-[#0c0c0e] transition-transform group-hover:scale-110 ${colors.dot}`}>
                          {isNarrator(seg.speaker) ? 'N' : seg.speaker.charAt(0)}
                        </div>
                      </div>

                      {/* Content card */}
                      <div className={`flex-1 mb-4 p-3 md:p-4 rounded-xl border transition-all duration-200 ${colors.card}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-bold uppercase tracking-wider ${colors.label}`}>
                            {seg.speaker}
                          </span>
                          {hasAudio && (
                            <span className="text-[10px] font-mono text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Check size={9} className="text-green-500" /> {Math.round(seg.duration || 0)}s
                            </span>
                          )}
                        </div>

                        <div className="relative cursor-pointer" onClick={() => toggleExpand(seg.id)}>
                          <p className={`text-gray-300 text-sm leading-relaxed mb-3 ${isNarrator(seg.speaker) ? 'italic text-gray-400' : ''} ${!isExpanded ? 'line-clamp-2' : ''}`}>
                            {seg.text}
                          </p>
                          {!isExpanded && seg.text.length > 100 && (
                            <div className="absolute bottom-0 right-0 bg-gradient-to-l from-[#18181b] to-transparent pl-8 text-xs text-purple-400 font-medium">
                              Show more
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {status === 'loading' ? (
                            <span className="text-xs text-purple-400 flex items-center gap-2 bg-purple-900/10 px-3 py-1.5 rounded-lg border border-purple-500/20">
                              <Wand2 size={12} className="animate-spin" /> Generating...
                            </span>
                          ) : hasAudio ? (
                            <>
                              <button
                                onClick={() => playSegment(seg.id, seg.audioUrl!)}
                                className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-sm active:scale-95 ${isPlaying ? 'bg-purple-600 text-white' : 'bg-white text-black hover:bg-gray-200'}`}
                              >
                                {isPlaying ? <span className="animate-pulse">Playing...</span> : <><Play size={12} fill="currentColor" /> Play</>}
                              </button>
                              <button
                                onClick={() => generateSingleSegment(idx)}
                                className="flex items-center gap-2 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors border border-gray-700 hover:border-gray-600"
                              >
                                <RefreshCw size={12} /> Regenerate
                              </button>
                              <div className="h-4 w-px bg-gray-800 mx-1" />
                              <button
                                onClick={() => syncTranscript(idx)}
                                disabled={syncingSegments[seg.id]}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors border disabled:opacity-50 ${
                                  seg.wordTimings && seg.wordTimings.length > 0
                                    ? 'text-green-400 border-green-500/30 bg-green-900/10 hover:bg-green-900/30'
                                    : 'text-blue-400 border-blue-500/30 bg-blue-900/10 hover:bg-blue-900/30 hover:text-white'
                                }`}
                              >
                                {syncingSegments[seg.id] ? <RefreshCw size={14} className="animate-spin" /> : seg.wordTimings && seg.wordTimings.length > 0 ? <Check size={14} /> : <RefreshCw size={14} />}
                                <span className="text-xs font-medium">{seg.wordTimings && seg.wordTimings.length > 0 ? 'Synced' : 'Sync'}</span>
                              </button>
                              <button
                                onClick={() => handleDownloadSingleTranscript(seg, idx)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors border border-gray-700"
                              >
                                <FileText size={14} />
                                <span className="text-xs font-medium">TXT</span>
                              </button>
                              <button
                                onClick={() => downloadSegment(seg.audioUrl!, `segment_${idx + 1}.mp3`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors border border-gray-700"
                              >
                                <Download size={14} />
                                <span className="text-xs font-medium">MP3</span>
                              </button>
                            </>
                          ) : status === 'error' ? (
                            <div className="flex items-center gap-3 bg-red-900/10 px-3 py-1.5 rounded-lg border border-red-500/20">
                              <span className="text-xs text-red-400 flex items-center gap-1">
                                <AlertCircle size={14} /> Failed
                              </span>
                              <button onClick={() => generateSingleSegment(idx)} className="text-xs font-bold text-red-400 hover:text-red-300 underline">
                                Retry
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => generateSingleSegment(idx)}
                              className="flex items-center gap-2 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors border border-gray-700 hover:border-gray-600"
                            >
                              <Wand2 size={12} /> Generate
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioGenerator;
