import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { DebateSegment, YoutubeImportData } from '../types';
import { toast } from './Toast';
import { ChevronLeft, ChevronDown, ChevronUp, Play, Pause, Upload, Video, Settings, Type, Layout, Activity, Palette, Loader2, Layers, X, Wand2, Merge, Download, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { mergeAudioUrls } from '../services/audioUtils';
import { renderVideoOffline } from '../services/videoRenderer';
import { drawDebateFrame, VisualConfig, RenderAssets } from '../services/canvasRenderer';
import { themes, getThemeProperties, getDefaultThemeConfig } from '../services/themes';
import { generateSegmentImage, generateSpeakerImage, generateVideoBackground } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';

interface DebateVisualizerProps {
  script: DebateSegment[];
  onBack: () => void;
  youtubeData?: YoutubeImportData | null;
}

const DebateVisualizer: React.FC<DebateVisualizerProps> = ({ script: initialScript, onBack, youtubeData }) => {
  // Initialize script with default visual config if missing
  const [script, setScript] = useState<DebateSegment[]>(() => {
      return initialScript.map(seg => ({
          ...seg,
          visualConfig: {
              ...seg.visualConfig,
              subtitleConfig: seg.visualConfig?.subtitleConfig || {
                  x: 192,
                  y: 550,
                  w: 896,
                  h: 150,
                  fontSize: 1,
                  backgroundColor: 'rgba(0,0,0,0.85)',
                  textColor: '#ffffff',
                  borderColor: '#ffffff',
                  borderWidth: 0,
                  borderRadius: 20
              }
          }
      }));
  });

  const uniqueSpeakers = useMemo(() => {
    const speakers = Array.from(new Set<string>(script.map(s => s.speaker)));
    if (speakers.includes('Narrator')) {
        return ['Narrator', ...speakers.filter(s => s !== 'Narrator')];
    }
    return speakers;
  }, [script]);
  
  const activeSpeakers = useMemo(() => uniqueSpeakers.filter(s => s !== 'Narrator'), [uniqueSpeakers]);

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  const [backgroundVideo, setBackgroundVideo] = useState<HTMLVideoElement | null>(null);
  const [backgroundVideoUrl, setBackgroundVideoUrl] = useState<string | null>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement>(null);
  
  const [speakerPositions, setSpeakerPositions] = useState<{x: number, y: number}[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null); // Index of speaker being dragged
  
  // Customization State
  const [theme, setTheme] = useState<string>('transparent-avatars');
  const [globalThemeConfig, setGlobalThemeConfig] = useState<Record<string, any>>({});
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [subtitleBackground, setSubtitleBackground] = useState(true);
  
  const [speakerLabels, setSpeakerLabels] = useState<string[]>([]);
  const [speakerImages, setSpeakerImages] = useState<(HTMLImageElement | null)[]>([]);
  const [speakerImageLoading, setSpeakerImageLoading] = useState<boolean[]>([]);
  const speakerBlobUrls = React.useRef<(string | null)[]>([]);

  // Initialize labels, images, and loading state
  useEffect(() => {
      if (activeSpeakers.length > 0) {
          setSpeakerLabels(prev => {
              if (prev.length === activeSpeakers.length) return prev;
              return activeSpeakers;
          });
          setSpeakerImages(prev => {
              if (prev.length === activeSpeakers.length) return prev;
              return new Array(activeSpeakers.length).fill(null);
          });
          setSpeakerImageLoading(prev => {
              if (prev.length === activeSpeakers.length) return prev;
              return new Array(activeSpeakers.length).fill(false);
          });
      }
  }, [activeSpeakers]);

  const [showVuMeter, setShowVuMeter] = useState(true);
  const [vuMeterStyle, setVuMeterStyle] = useState<'ring' | 'bar' | 'glow' | 'wave' | 'dots'>('ring');
  const [showSpeakerImages, setShowSpeakerImages] = useState<boolean[]>([]);
  const [showSpeakers, setShowSpeakers] = useState(true);
  const [showNameLabels, setShowNameLabels] = useState(true);
  const [showTimer, setShowTimer] = useState(true);
  const [speakerScale, setSpeakerScale] = useState(1);
  const [showSideStats, setShowSideStats] = useState(true);
  const [showScores, setShowScores] = useState(false);
  const [backgroundDim, setBackgroundDim] = useState(0);
  const [globalBackgroundColor, setGlobalBackgroundColor] = useState<string | undefined>('#ffffff');
  const [narratorTextColor, setNarratorTextColor] = useState<string>('#ef4444');
  const [showMinimalSpeakerName, setShowMinimalSpeakerName] = useState<boolean>(true);
  const [showMinimalSideVU, setShowMinimalSideVU] = useState<boolean>(true);
  const [syncSubtitlePosition, setSyncSubtitlePosition] = useState(true);
  const [subtitleBgHex, setSubtitleBgHex] = useState('#000000');
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState(80);
  const [showNameBadge, setShowNameBadge] = useState(true);
  const [nameBadgeStyle, setNameBadgeStyle] = useState<'classic' | 'comic' | 'pill' | 'minimal'>('comic');
  const [nameBadgeColorA, setNameBadgeColorA] = useState('#3b82f6');
  const [nameBadgeColorB, setNameBadgeColorB] = useState('#ef4444');
  const [nameBadgeColorC, setNameBadgeColorC] = useState('#eab308');
  const [segmentScores, setSegmentScores] = useState<number[]>([]);
  const [showScorecard, setShowScorecard] = useState(false);
  const [scorecardData, setScorecardData] = useState<{ scores: { model: string, score: number }[], average: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [questionMode, setQuestionMode] = useState(false);

  // Subtitle Interaction State
  const [draggingSubtitle, setDraggingSubtitle] = useState(false);
  const [resizingSubtitle, setResizingSubtitle] = useState<string | null>(null); // 'tl', 'tr', 'bl', 'br'
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [currentSegmentBackground, setCurrentSegmentBackground] = useState<HTMLImageElement | null>(null);
  
  // Merged Audio State
  const mergedAudioUrlRef = useRef<string | null>(null);
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
  const [segmentOffsets, setSegmentOffsets] = useState<number[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportResolution, setExportResolution] = useState<'1080p' | '720p'>('720p');
  const [exportQuality, setExportQuality] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [showExportSettings, setShowExportSettings] = useState(false);
  // Settings tab state
  const [settingsTab, setSettingsTab] = useState<'speakers'|'background'|'subtitle'|'options'>('speakers');
  const [statusMessage, setStatusMessage] = useState("");
  // Rendered video blob kept in memory for merge
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);
  // Merge state
  const [mergeFlaskUrl, setMergeFlaskUrl] = useState(() => youtubeData?.flaskUrl || '');
  const [isMergingVideos, setIsMergingVideos] = useState(false);
  const [mergeVideoError, setMergeVideoError] = useState('');
  const [mergeVideoResult, setMergeVideoResult] = useState<{ filename: string; downloadUrl: string } | null>(null);

  // Image Generation State
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageGenProgress, setImageGenProgress] = useState(0);

  // Update positions and settings based on theme
  useEffect(() => {
    const count = activeSpeakers.length || 2;
    let newPositions: {x: number, y: number}[] = [];

    if (theme === 'split') {
        if (count === 2) {
             newPositions = [{ x: 0.25, y: 0.6 }, { x: 0.75, y: 0.6 }];
        } else {
             for (let i = 0; i < count; i++) {
                newPositions.push({ x: (i + 1) / (count + 1), y: 0.6 });
            }
        }
    } else if (theme === 'arena') {
        if (count === 2) {
            newPositions = [{ x: 0.2, y: 0.6 }, { x: 0.8, y: 0.6 }];
        } else {
             for (let i = 0; i < count; i++) {
                newPositions.push({ x: (i + 1) / (count + 1), y: 0.6 });
            }
        }
    } else if (theme === 'broadcast') {
        if (count === 2) {
            newPositions = [{ x: 0.15, y: 0.6 }, { x: 0.85, y: 0.6 }];
        } else {
             for (let i = 0; i < count; i++) {
                newPositions.push({ x: (i + 1) / (count + 1), y: 0.6 });
            }
        }
    } else if (theme === 'minimal') {
        for (let i = 0; i < count; i++) {
            newPositions.push({ x: (i + 1) / (count + 1), y: 0.5 });
        }
    } else if (theme === 'transparent-avatars') {
        if (count === 2) {
            newPositions = [{ x: 0.2, y: 0.45 }, { x: 0.2, y: 0.8 }];
        } else {
            for (let i = 0; i < count; i++) {
                newPositions.push({ x: 0.2, y: 0.45 + (i * (0.4 / Math.max(1, count - 1))) });
            }
        }
    } else {
        // Default distribution
        for (let i = 0; i < count; i++) {
            newPositions.push({ x: (i + 1) / (count + 1), y: 0.6 });
        }
    }
    setSpeakerPositions(newPositions);

  }, [theme, activeSpeakers.length]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const smoothedAudioLevelRef = useRef(0);

  const currentSegment = script?.[currentSegmentIndex];
  const currentSubtitleConfig = currentSegment?.visualConfig?.subtitleConfig || { 
      x: 192, y: 550, w: 896, h: 150, fontSize: 1, backgroundColor: 'rgba(0,0,0,0.85)', textColor: '#ffffff', borderColor: '#ffffff', borderWidth: 0, borderRadius: 20
  };

  const applySubtitleBg = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    const rgba = `rgba(${r},${g},${b},${(opacity/100).toFixed(2)})`;
    setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), backgroundColor: rgba } } })));
  };

  // Merge Audio on Mount
  useEffect(() => {
      const mergeAudio = async () => {
          if (!script || script.length === 0) return;
          
          // Check if all segments have audio
          const audioUrls = script.map(s => s.audioUrl).filter(Boolean) as string[];
          if (audioUrls.length !== script.length) {
              setMergeError("Some segments are missing audio.");
              return;
          }

          setIsMerging(true);
          try {
              const { blob, durations } = await mergeAudioUrls(audioUrls);
              const url = URL.createObjectURL(blob);
              mergedAudioUrlRef.current = url;
              setMergedAudioUrl(url);
              
              // Calculate offsets
              let offset = 0;
              const offsets = [0];
              for (let i = 0; i < durations.length - 1; i++) {
                  offset += durations[i];
                  offsets.push(offset);
              }
              setSegmentOffsets(offsets);
              
              // Update script with accurate durations if needed
              // setScript(prev => prev.map((s, i) => ({ ...s, duration: durations[i] })));
              
          } catch (e) {
              console.error("Failed to merge audio", e);
              setMergeError("Failed to prepare audio playback.");
          } finally {
              setIsMerging(false);
          }
      };
      
      mergeAudio();
      
      return () => {
          if (mergedAudioUrlRef.current) {
              URL.revokeObjectURL(mergedAudioUrlRef.current);
              mergedAudioUrlRef.current = null;
          }
          if (bgBlobUrlRef.current) {
              URL.revokeObjectURL(bgBlobUrlRef.current);
              bgBlobUrlRef.current = null;
          }
      };
  }, [initialScript]); // Only run once on mount/initialScript change

  // Load Segment Background
  useEffect(() => {
      const bgUrl = currentSegment?.visualConfig?.backgroundUrl;
      if (bgUrl) {
          const img = new Image();
          img.crossOrigin = "anonymous"; // Enable CORS to prevent canvas tainting
          img.src = bgUrl;
          img.onload = () => setCurrentSegmentBackground(img);
          img.onerror = () => {
              console.warn(`Failed to load background image: ${bgUrl}`);
              setCurrentSegmentBackground(null);
          };
      } else {
          setCurrentSegmentBackground(null);
      }
  }, [currentSegmentIndex, currentSegment?.visualConfig?.backgroundUrl]);

  // Initialize Audio Context
  const initAudioContext = useCallback(() => {
    if (!audioRef.current || audioContextRef.current) return;

    try {
      const audioEl = audioRef.current as any;
      
      // Reuse existing context and source if they exist on the element
      let ctx = audioEl._audioContext;
      if (!ctx || ctx.state === 'closed') {
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          ctx = new AudioContext();
          audioEl._audioContext = ctx;
      }
      
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024; // larger → better RMS resolution for time-domain
      analyser.smoothingTimeConstant = 0.15; // low smoothing → snappy response
      
      let source = audioEl._audioSource;
      if (!source) {
          source = ctx.createMediaElementSource(audioRef.current);
          audioEl._audioSource = source;
      }
      
      // We can reconnect the source to the new analyser
      source.disconnect();
      source.connect(analyser);
      analyser.connect(ctx.destination);
      
      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
    } catch (e) {
      console.warn("Audio context init failed or source already connected", e);
    }
  }, []);

  useEffect(() => {
    initAudioContext();

    return () => {
      // Do NOT close the context here, as it causes issues with Strict Mode
      // when the DOM node is reused but the context is closed.
      if (sourceRef.current) {
          sourceRef.current.disconnect();
      }
      if (analyserRef.current) {
          analyserRef.current.disconnect();
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, [initAudioContext]);

  // Handle Merged Audio Playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !mergedAudioUrl) return;

    if (audio.src !== mergedAudioUrl) {
        audio.src = mergedAudioUrl;
        audio.load();
    }
  }, [mergedAudioUrl]);

  // Sync Current Segment with Audio Time
  useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      const handleTimeUpdate = () => {
          const time = audio.currentTime;
          // Find segment based on time and offsets
          // We need accurate durations. The offsets array helps.
          // offsets[i] is start time of segment i.
          // offsets[i+1] is start time of segment i+1 (or end of i).
          
          let index = 0;
          for (let i = 0; i < segmentOffsets.length; i++) {
              if (time >= segmentOffsets[i]) {
                  index = i;
              } else {
                  break;
              }
          }
          
          if (index !== currentSegmentIndex) {
              setCurrentSegmentIndex(index);
          }
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);
      return () => {
          audio.removeEventListener('timeupdate', handleTimeUpdate);
      };
  }, [segmentOffsets, currentSegmentIndex]);

  // Handle Play/Pause Toggle
  const togglePlay = () => {
    if (isRecording) {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        return;
    }

    if (audioRef.current) {
      // Ensure context is initialized
      if (!audioContextRef.current) {
        initAudioContext();
      }

      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(e => console.error("Ctx resume failed", e));
      }

      if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
      } else {
          setIsPlaying(true);
          const playPromise = audioRef.current.play();
          if (playPromise !== undefined) {
              playPromise.catch(e => {
                  if (e.name !== 'AbortError') {
                      console.error("Play error", e);
                      setIsPlaying(false);
                  }
              });
          }
      }
    }
  };

  const handleAudioEnded = () => {
      finishPlayback();
  };

  const finishPlayback = () => {
      setIsPlaying(false);
      setCurrentSegmentIndex(0);
      if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.pause();
      }
      if (isRecording && mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
  };

  const [isGeneratingBg, setIsGeneratingBg] = useState(false);

  const handleGenerateVideoBackground = async () => {
    const speakerNames = activeSpeakers.slice(0, 2);
    const hostName = speakerLabels[0] || speakerNames[0] || 'Host';
    const guestName = speakerLabels[1] || speakerNames[1] || 'Guest';
    setIsGeneratingBg(true);
    try {
      const dataUrl = await generateVideoBackground(hostName, guestName);
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        setBackground(img);
        setBackgroundVideoUrl(null);
        setBackgroundVideo(null);
      };
    } catch (e: any) {
      toast.error(e.message || 'Background generation failed. Please try again.');
    } finally {
      setIsGeneratingBg(false);
    }
  };

  const bgBlobUrlRef = useRef<string | null>(null);

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      // Revoke previous blob URL to avoid memory leaks
      if (bgBlobUrlRef.current) {
          URL.revokeObjectURL(bgBlobUrlRef.current);
      }
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      bgBlobUrlRef.current = url;
      
      if (file.type.startsWith('video/')) {
          setBackgroundVideoUrl(url);
          setBackground(null);
      } else {
          const img = new Image();
          img.src = url;
          img.onload = () => setBackground(img);
          setBackgroundVideoUrl(null);
          setBackgroundVideo(null);
      }
    }
  };

  useEffect(() => {
      if (backgroundVideoRef.current && backgroundVideoUrl) {
          backgroundVideoRef.current.src = backgroundVideoUrl;
          backgroundVideoRef.current.load();
          setBackgroundVideo(backgroundVideoRef.current);
      }
  }, [backgroundVideoUrl]);

  useEffect(() => {
      if (backgroundVideo) {
          if (isPlaying) {
              backgroundVideo.play().catch(e => console.warn("Video play failed", e));
          } else {
              backgroundVideo.pause();
          }
      }
  }, [isPlaying, backgroundVideo]);

  const handleGenerateSpeakerImage = async (index: number) => {
    setSpeakerImageLoading(prev => { const a = [...prev]; a[index] = true; return a; });
    const clearLoading = () =>
      setSpeakerImageLoading(prev => { const a = [...prev]; a[index] = false; return a; });
    try {
      const dataUrl = await generateSpeakerImage(index, speakerLabels[index], theme === 'transparent-avatars');
      const img = new Image();
      img.onload = () => {
        setSpeakerImages(prev => { const a = [...prev]; a[index] = img; return a; });
        clearLoading();
      };
      img.onerror = () => {
        toast.error('Speaker image could not be loaded.');
        clearLoading();
      };
      img.src = dataUrl;
    } catch (e: any) {
      toast.error(`Image generation failed: ${e.message}`);
      clearLoading();
    }
  };

  const handleGenerateAllSpeakers = () => {
    activeSpeakers.forEach((_, idx) => handleGenerateSpeakerImage(idx));
  };

  const handleSpeakerImageUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    if (e.target.files && e.target.files[0]) {
      // Revoke previous blob URL to free memory
      if (speakerBlobUrls.current[index]) {
        URL.revokeObjectURL(speakerBlobUrls.current[index]!);
      }
      const objectUrl = URL.createObjectURL(e.target.files[0]);
      speakerBlobUrls.current[index] = objectUrl;
      const img = new Image();
      img.src = objectUrl;
      img.onload = () => {
          setSpeakerImages(prev => {
              const newImages = [...prev];
              newImages[index] = img;
              return newImages;
          });
      };
    }
  };

  const handleLabelChange = (index: number, value: string) => {
      setSpeakerLabels(prev => {
          const newLabels = [...prev];
          newLabels[index] = value;
          return newLabels;
      });
  };

  // Generate scores when script changes
  useEffect(() => {
      const newScores = script.map(() => {
          return Math.floor((Math.random() * 3.9 + 6) * 10) / 10;
      });
      setSegmentScores(newScores);
  }, [script.length]);

  // Manual: regenerate all segment scores at once
  const handleRegenerateAllScores = useCallback(() => {
      const newScores = script.map(() => Math.floor((Math.random() * 3.9 + 6) * 10) / 10);
      setSegmentScores(newScores);
  }, [script]);

  // Canvas Rendering Loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !script || script.length === 0) return;

    // Resume audio context if suspended (browsers suspend it on focus loss)
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
    }

    // Get Audio Data — float time-domain RMS
    let rawAudioLevel = 0;
    if (analyserRef.current && isPlaying) {
        const floatData = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(floatData);
        let sum = 0;
        for (let i = 0; i < floatData.length; i++) sum += floatData[i] * floatData[i];
        const rms = Math.sqrt(sum / floatData.length);
        // float time-domain values are in [-1,1]; typical speech rms ≈ 0.02-0.18
        // Use moderate multiplier so meter shows real dynamics instead of always being full
        rawAudioLevel = Math.min(1, Math.pow(rms * 6, 0.7));
    }

    // Simulated fallback — only when analyser isn't yielding real data
    if (isPlaying && rawAudioLevel < 0.04) {
        const t = Date.now() / 1000;
        const sim = 0.30
            + Math.sin(t * 7.2)         * 0.22
            + Math.sin(t * 13.5 + 1.4)  * 0.14
            + Math.sin(t * 23.0 + 2.7)  * 0.07
            + Math.sin(t * 41.0 + 0.5)  * 0.04;
        rawAudioLevel = Math.max(rawAudioLevel, Math.max(0, Math.min(0.75, sim)));
    }

    // Fast attack, moderate decay — feels punchy and responsive
    const currentSmoothed = smoothedAudioLevelRef.current;
    if (rawAudioLevel > currentSmoothed) {
        smoothedAudioLevelRef.current += (rawAudioLevel - currentSmoothed) * 0.55;
    } else {
        smoothedAudioLevelRef.current += (rawAudioLevel - currentSmoothed) * 0.18;
    }

    const audioLevel = smoothedAudioLevelRef.current;

    const currentTime = audioRef.current ? audioRef.current.currentTime : 0;

    // Calculate real-time index
    let realTimeIndex = 0;
    for (let i = 0; i < segmentOffsets.length; i++) {
        if (currentTime >= segmentOffsets[i]) {
            realTimeIndex = i;
        } else {
            break;
        }
    }

    // Calculate Scores
    // This needs to be updated to handle multiple speakers if we want per-speaker scores.
    // For now, let's assume we just sum up scores for "Person A" and "Person B" if they exist,
    // or we might need a more generic score tracking.
    // The current `scores` prop in drawDebateFrame expects { scoreA, scoreB }.
    // We should probably update that signature too, but for now let's map the first two speakers to A and B.
    
    let currentScoreA = 0;
    let currentScoreB = 0;
    const speakerA = activeSpeakers[0];
    const speakerB = activeSpeakers[1];

    for (let i = 0; i < realTimeIndex; i++) {
        const seg = script[i];
        const score = segmentScores[i] || 0;
        if (seg.speaker === speakerA) currentScoreA += score;
        if (seg.speaker === speakerB) currentScoreB += score;
    }

    const config: VisualConfig = {
        theme,
        showSubtitles,
        subtitleBackground,
        speakerIds: activeSpeakers,
        speakerLabels,
        speakerScale,
        showTimer,
        showSideStats,
        showVuMeter,
        vuMeterStyle,
        showSpeakerImages,
        showSpeakers,
        showScores,
        backgroundDim,
        speakerPositions,
        globalThemeConfig,
        showSettings,
        questionMode,
        narratorTextColor,
        showMinimalSpeakerName,
        showMinimalSideVU,
        showNameLabels,
        showNameBadge,
        nameBadgeStyle,
        nameBadgeColorA,
        nameBadgeColorB,
        nameBadgeColorC,
    };

    const assets: RenderAssets = {
        background,
        backgroundVideo,
        backgroundColor: globalBackgroundColor,
        speakerImages,
        segmentBackgrounds: new Map()
    };
    
    const realTimeSegment = script[realTimeIndex];
    if (realTimeSegment && realTimeSegment.visualConfig?.backgroundUrl && currentSegmentBackground) {
        // Only use the loaded background if it matches the current segment (via index check or URL check)
        // Since currentSegmentBackground is loaded based on currentSegmentIndex, we check if indices match
        if (realTimeIndex === currentSegmentIndex) {
            assets.segmentBackgrounds.set(realTimeSegment.visualConfig.backgroundUrl, currentSegmentBackground);
        }
    }

    drawDebateFrame(
        ctx,
        currentTime,
        audioLevel,
        script,
        segmentOffsets,
        realTimeIndex,
        audioRef.current?.duration || 0,
        { scoreA: currentScoreA.toFixed(1), scoreB: currentScoreB.toFixed(1) },
        config,
        assets
    );

    animationRef.current = requestAnimationFrame(render);
  }, [
      script, isPlaying, theme, showSubtitles, subtitleBackground, speakerLabels,
      speakerScale, showTimer, showSideStats, showVuMeter, vuMeterStyle, showSpeakerImages, showSpeakers, showScores, backgroundDim, speakerPositions, showNameLabels,
      background, speakerImages, currentSegmentBackground, segmentOffsets, currentSegmentIndex, segmentScores, activeSpeakers, showSettings, globalBackgroundColor, questionMode,
      globalThemeConfig, narratorTextColor, showMinimalSpeakerName, showMinimalSideVU,
      showNameBadge, nameBadgeStyle, nameBadgeColorA, nameBadgeColorB, nameBadgeColorC
  ]);

  /* OLD RENDER
    // Get Audio Data
    let audioLevel = 0;
    if (analyserRef.current && isPlaying) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteTimeDomainData(dataArray);
        
        let sum = 0;
        for(let i = 0; i < dataArray.length; i++) {
            const amplitude = (dataArray[i] - 128) / 128.0;
            sum += amplitude * amplitude;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        
        // Linear scale with moderate gain (less sensitive than sqrt version)
        audioLevel = Math.min(1, rms * 2.5);
    }

    // Fallback: If playing but no audio data (e.g. context suspended or CORS issue), simulate activity
    if (isPlaying && audioLevel < 0.01) {
        // Create a pseudo-random wave based on time
        const time = Date.now() / 100;
        const noise = Math.sin(time) * 0.3 + Math.cos(time * 1.7) * 0.2 + 0.5;
        audioLevel = noise * 0.6 + 0.2; // Keep it between 0.2 and 0.8
    }

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ... (Background drawing remains same)
    const segmentBgUrl = currentSegment?.visualConfig?.backgroundUrl;
    let bgToDraw = background;
    if (currentSegmentBackground) {
        bgToDraw = currentSegmentBackground;
    }

    if (bgToDraw) {
      const scale = Math.max(canvas.width / bgToDraw.width, canvas.height / bgToDraw.height);
      const x = (canvas.width / 2) - (bgToDraw.width / 2) * scale;
      const y = (canvas.height / 2) - (bgToDraw.height / 2) * scale;
      ctx.drawImage(bgToDraw, x, y, bgToDraw.width * scale, bgToDraw.height * scale);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(1, '#16213e');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const isSpeakingA = isPlaying && currentSegment.speaker === activeSpeakers[0];
    const isSpeakingB = isPlaying && currentSegment.speaker === activeSpeakers[1];

    // ... (Side Stats, Theme Broadcast, Neon, Timer, Speakers logic remains same - assuming it works)
    // We will focus on Subtitles logic below

    // --- SIDE STATS ---
    if (showSideStats && theme !== 'minimal' && theme !== 'split') {
        // ... (Keep existing logic)
        let totalA = 0;
        let totalB = 0;
        let currentA = 0;
        let currentB = 0;

        script.forEach((seg, idx) => {
            if (seg.speaker === 'Person A') {
                totalA++;
                if (idx <= currentSegmentIndex) currentA++;
            } else if (seg.speaker === 'Person B') {
                totalB++;
                if (idx <= currentSegmentIndex) currentB++;
            }
        });

        const drawSidePanel = (isLeft: boolean, total: number, current: number, isActive: boolean, color: string) => {
            const margin = 30;
            const boxSize = 12;
            const gap = 8;
            
            // Dots Height (Actual)
            const dotsHeight = Math.max(0, total * (boxSize + gap) - gap);
            const dotsY = canvas.height / 2 - dotsHeight / 2;
            
            const x = isLeft ? margin : canvas.width - margin - boxSize;

            // Draw Dots
            for (let i = 0; i < total; i++) {
                const y = dotsY + i * (boxSize + gap);
                ctx.beginPath();
                const isCompleted = i < current;
                const isCurrent = i === current - 1;

                if (isCompleted) {
                    ctx.fillStyle = color;
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 10;
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.shadowBlur = 0;
                }

                if (isCurrent && isActive) {
                    ctx.fillStyle = '#fff';
                    ctx.shadowColor = '#fff';
                    ctx.shadowBlur = 15;
                }

                ctx.fillRect(x, y, boxSize, boxSize);
                ctx.shadowBlur = 0;
            }

            // VU Meter
            // Fixed height to at least 8 dots
            const minDots = 8;
            const meterDots = Math.max(total, minDots);
            const meterHeight = Math.max(0, meterDots * (boxSize + gap) - gap);
            const meterY = canvas.height / 2 - meterHeight / 2;

            if (meterDots > 0) {
                const meterWidth = 12;
                const meterX = isLeft ? x + boxSize + 15 : x - 15 - meterWidth;
                
                // Always draw meter background
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.fillRect(meterX, meterY, meterWidth, meterHeight);

                if (isActive) {
                    // Ensure minimum visibility if active
                    const effectiveLevel = Math.max(0.05, audioLevel); 
                    const activeHeight = meterHeight * effectiveLevel;
                    const activeY = meterY + meterHeight - activeHeight;
                    
                    ctx.fillStyle = color;
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 15;
                    ctx.fillRect(meterX, activeY, meterWidth, activeHeight);
                    ctx.shadowBlur = 0;
                }
            }
        };

        drawSidePanel(true, totalA, currentA, isSpeakingA, theme === 'neon' ? '#00ff00' : '#3b82f6');
        drawSidePanel(false, totalB, currentB, isSpeakingB, theme === 'neon' ? '#ff0000' : '#ef4444');
    }

    const isNarrator = currentSegment.speaker === 'Narrator';

    // ... (Themes logic)
    if (theme === 'broadcast') {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, 100);
        if (showTimer && !isNarrator) {
             // Calculate segment duration and elapsed time
             const segmentStartTime = segmentOffsets[currentSegmentIndex] || 0;
             const segmentEndTime = segmentOffsets[currentSegmentIndex + 1] || (audioRef.current?.duration || 0);
             const segmentDuration = Math.max(0, segmentEndTime - segmentStartTime);
             
             const globalTime = audioRef.current ? audioRef.current.currentTime : 0;
             const segmentElapsed = Math.max(0, globalTime - segmentStartTime);
             const timeLeft = Math.max(0, Math.ceil(segmentDuration - segmentElapsed));

             ctx.fillStyle = '#1e293b';
             ctx.fillRect(20, 20, 120, 60);
             ctx.fillStyle = '#fff';
             ctx.font = 'bold 32px sans-serif';
             ctx.textAlign = 'center';
             ctx.textBaseline = 'middle';
             ctx.fillText(`${timeLeft.toString().padStart(2, '0')}s`, 80, 50);
        }
        // ... Names ...
        const drawName = (label: string, x: number, align: CanvasTextAlign, active: boolean, color: string) => {
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = align;
            ctx.textBaseline = 'middle';
            
            if (active) {
                const textMetrics = ctx.measureText(label.toUpperCase());
                const textWidth = textMetrics.width;
                const paddingX = 20;
                const paddingY = 10;
                
                const badgeWidth = textWidth + paddingX * 2;
                const badgeHeight = 40 + paddingY * 2;
                
                const badgeX = align === 'right' ? x - textWidth - paddingX : x - paddingX;
                const badgeY = 50 - badgeHeight / 2;
                
                // Draw red background box
                const gradient = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeHeight);
                gradient.addColorStop(0, '#ff4b4b');
                gradient.addColorStop(1, '#dc2626');
                ctx.fillStyle = gradient;
                
                ctx.beginPath();
                ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 10);
                ctx.fill();
                
                // Add a subtle glow
                ctx.shadowColor = 'rgba(220, 38, 38, 0.6)';
                ctx.shadowBlur = 15;
                ctx.fill();
                ctx.shadowBlur = 0;
                
                ctx.fillStyle = '#000000';
            } else {
                ctx.fillStyle = '#64748b';
            }
            
            ctx.fillText(label.toUpperCase(), x, 50);
        };
        if (showNameLabels) {
          drawName(speakerALabel, canvas.width / 2 - 50, 'right', isSpeakingA, '#3b82f6');
          drawName(speakerBLabel, canvas.width / 2 + 50, 'left', isSpeakingB, '#ef4444');
        }
        ctx.fillStyle = '#334155';
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VS', canvas.width / 2, 50);
    } else if (theme === 'neon') {
        // ... Neon logic ...
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, canvas.width, 80);
        const drawNeonText = (text: string, x: number, color: string, active: boolean) => {
            ctx.font = 'bold 48px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = active ? '#fff' : '#333';
            ctx.strokeStyle = active ? color : '#333';
            ctx.lineWidth = 2;
            if (active) {
                ctx.shadowColor = color;
                ctx.shadowBlur = 20;
                ctx.strokeText(text, x, 40);
                ctx.fillText(text, x, 40);
            } else {
                ctx.shadowBlur = 0;
                ctx.strokeText(text, x, 40);
            }
            ctx.shadowBlur = 0;
        };
        if (showNameLabels) {
          drawNeonText(speakerALabel, canvas.width * 0.3, '#00ff00', isSpeakingA);
          drawNeonText(speakerBLabel, canvas.width * 0.7, '#ff0000', isSpeakingB);
        }
    } else if (theme === 'minimal') {
        // Minimal Theme (Image 1 style)
        // Top Bar Background
        const barHeight = 100;
        const barWidth = canvas.width - 100;
        const barX = 50;
        const barY = 30;
        
        ctx.fillStyle = '#1e1e1e';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, 20);
        ctx.fill();
        
        // Timer (Center)
        if (showTimer && !isNarrator) {
             const segmentStartTime = segmentOffsets[currentSegmentIndex] || 0;
             const segmentEndTime = segmentOffsets[currentSegmentIndex + 1] || (audioRef.current?.duration || 0);
             const segmentDuration = Math.max(0, segmentEndTime - segmentStartTime);
             const globalTime = audioRef.current ? audioRef.current.currentTime : 0;
             const segmentElapsed = Math.max(0, globalTime - segmentStartTime);
             const timeLeft = Math.max(0, Math.ceil(segmentDuration - segmentElapsed));

             ctx.fillStyle = '#fff';
             ctx.font = 'bold 48px sans-serif';
             ctx.textAlign = 'center';
             ctx.textBaseline = 'middle';
             ctx.fillText(`${timeLeft}`, canvas.width / 2, barY + barHeight / 2);
        }

        // Left Side (A)
        const leftX = barX + 30;
        const centerY = barY + barHeight / 2;
        
        // Circle A
        ctx.beginPath();
        ctx.arc(leftX + 25, centerY, 25, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6'; // Blue
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('A', leftX + 25, centerY);

        // Name A
        ctx.textAlign = 'left';
        ctx.font = 'bold 28px sans-serif';
        ctx.textBaseline = 'middle';
        if (isSpeakingA) {
            const textMetrics = ctx.measureText(speakerALabel.toUpperCase());
            const textWidth = textMetrics.width;
            const paddingX = 12;
            const paddingY = 8;
            const badgeWidth = textWidth + paddingX * 2;
            const badgeHeight = 28 + paddingY * 2;
            const badgeX = leftX + 65 - paddingX;
            const badgeY = centerY - 5 - badgeHeight / 2;
            
            const gradient = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeHeight);
            gradient.addColorStop(0, '#ff4b4b');
            gradient.addColorStop(1, '#dc2626');
            ctx.fillStyle = gradient;
            
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 6);
            ctx.fill();
            
            ctx.shadowColor = 'rgba(220, 38, 38, 0.6)';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = '#000000';
        } else {
            ctx.fillStyle = '#ffffff';
        }
        ctx.fillText(speakerALabel.toUpperCase(), leftX + 65, centerY - 5);
        
        // Dots A (Inside bar)
        // We need to calculate dots here instead of side panel
        let totalA = 0;
        let currentA = 0;
        script.forEach((seg, idx) => {
            if (seg.speaker === 'Person A') {
                totalA++;
                if (idx <= currentSegmentIndex) currentA++;
            }
        });
        const dotSize = 10;
        const dotGap = 6;
        for(let i=0; i<totalA; i++) {
            ctx.beginPath();
            ctx.fillStyle = i < currentA ? '#22c55e' : '#333'; // Green active
            if (i === currentA - 1 && isSpeakingA) {
                ctx.shadowColor = '#22c55e';
                ctx.shadowBlur = 10;
            }
            ctx.arc(leftX + 65 + (i * (dotSize + dotGap)) + dotSize/2, centerY + 20, dotSize/2, 0, Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Right Side (B)
        const rightX = barX + barWidth - 30;
        
        // Circle B
        ctx.beginPath();
        ctx.arc(rightX - 25, centerY, 25, 0, Math.PI * 2);
        ctx.fillStyle = '#ec4899'; // Pink
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('B', rightX - 25, centerY);

        // Name B
        ctx.textAlign = 'right';
        ctx.font = 'bold 28px sans-serif';
        ctx.textBaseline = 'middle';
        if (isSpeakingB) {
            const textMetrics = ctx.measureText(speakerBLabel.toUpperCase());
            const textWidth = textMetrics.width;
            const paddingX = 12;
            const paddingY = 8;
            const badgeWidth = textWidth + paddingX * 2;
            const badgeHeight = 28 + paddingY * 2;
            const badgeX = rightX - 65 - textWidth - paddingX;
            const badgeY = centerY - 5 - badgeHeight / 2;
            
            const gradient = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeHeight);
            gradient.addColorStop(0, '#ff4b4b');
            gradient.addColorStop(1, '#dc2626');
            ctx.fillStyle = gradient;
            
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 6);
            ctx.fill();
            
            ctx.shadowColor = 'rgba(220, 38, 38, 0.6)';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = '#000000';
        } else {
            ctx.fillStyle = '#ffffff';
        }
        ctx.fillText(speakerBLabel.toUpperCase(), rightX - 65, centerY - 5);

        // Dots B (Inside bar)
        let totalB = 0;
        let currentB = 0;
        script.forEach((seg, idx) => {
            if (seg.speaker === 'Person B') {
                totalB++;
                if (idx <= currentSegmentIndex) currentB++;
            }
        });
        for(let i=0; i<totalB; i++) {
            ctx.beginPath();
            ctx.fillStyle = i < currentB ? '#ec4899' : '#333'; // Pink active
             if (i === currentB - 1 && isSpeakingB) {
                ctx.shadowColor = '#ec4899';
                ctx.shadowBlur = 10;
            }
            // Draw from right to left
            ctx.arc(rightX - 65 - (i * (dotSize + dotGap)) - dotSize/2, centerY + 20, dotSize/2, 0, Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

    } else if (theme === 'split') {
        // Split Screen Theme (Image 2 style)
        
        // Timer (Center Top)
        if (showTimer && !isNarrator) {
             const segmentStartTime = segmentOffsets[currentSegmentIndex] || 0;
             const segmentEndTime = segmentOffsets[currentSegmentIndex + 1] || (audioRef.current?.duration || 0);
             const segmentDuration = Math.max(0, segmentEndTime - segmentStartTime);
             const globalTime = audioRef.current ? audioRef.current.currentTime : 0;
             const segmentElapsed = Math.max(0, globalTime - segmentStartTime);
             const timeLeft = Math.max(0, Math.ceil(segmentDuration - segmentElapsed));

             ctx.fillStyle = '#eab308'; // Yellow
             ctx.font = 'bold 60px sans-serif';
             ctx.textAlign = 'center';
             ctx.textBaseline = 'middle';
             ctx.fillText(`${timeLeft}`, canvas.width / 2, 70);
        }
    }

    // Timer (Non-Broadcast, Non-Minimal, Non-Split)
    if (showTimer && theme !== 'broadcast' && theme !== 'minimal' && theme !== 'split') {
        // ... (Existing timer logic)
        const segmentStartTime = segmentOffsets[currentSegmentIndex] || 0;
        const segmentEndTime = segmentOffsets[currentSegmentIndex + 1] || (audioRef.current?.duration || 0);
        const segmentDuration = Math.max(0, segmentEndTime - segmentStartTime);
        
        const globalTime = audioRef.current ? audioRef.current.currentTime : 0;
        const segmentElapsed = Math.max(0, globalTime - segmentStartTime);
        
        // Hide timer for Narrator
        if (!isNarrator) {
            const timeLeft = Math.max(0, Math.ceil(segmentDuration - segmentElapsed));
            const timeStr = `${timeLeft.toString().padStart(2, '0')}s`;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.beginPath();
            ctx.roundRect(canvas.width - 140, 20, 120, 50, 10);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(timeStr, canvas.width - 80, 45);
        }
    }

    // ── Broadcast lower-third name label (drawn inside the frame, bottom-left corner) ──
    const drawNameLowerThird = (
      label: string, color: string,
      rectX: number, rectY: number, w: number, h: number, radius: number
    ) => {
      if (!showNameLabels) return;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, w, h, radius);
      ctx.clip();

      // Dark scrim gradient at the bottom
      const scrimH = h * 0.48;
      const scrimGrad = ctx.createLinearGradient(rectX, rectY + h - scrimH, rectX, rectY + h);
      scrimGrad.addColorStop(0, 'rgba(0,0,0,0)');
      scrimGrad.addColorStop(0.5, 'rgba(0,0,0,0.52)');
      scrimGrad.addColorStop(1, 'rgba(0,0,0,0.82)');
      ctx.fillStyle = scrimGrad;
      ctx.fillRect(rectX, rectY + h - scrimH, w, scrimH);

      // Colored accent bar (left side, near bottom)
      const barW = Math.max(3, 4 * speakerScale);
      const barH = Math.max(18, 24 * speakerScale);
      const barX = rectX + Math.max(8, 10 * speakerScale);
      const barY = rectY + h - barH - Math.max(8, 10 * speakerScale);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, barW / 2);
      ctx.fill();

      // Name text next to accent bar
      const fontSize = Math.max(10, 13 * speakerScale);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 5;
      ctx.fillText(label.toUpperCase(), barX + barW + Math.max(6, 8 * speakerScale), barY + barH / 2);
      ctx.shadowBlur = 0;

      ctx.restore();
    };

    // Speakers
    const drawSpeaker = (label: string, xPct: number, yPct: number, isActive: boolean, color: string, image: HTMLImageElement | null) => {
      const x = xPct * canvas.width;
      const y = yPct * canvas.height;
      
      if (theme === 'minimal') {
          // Minimal: Large Vertical Rectangles with audio-reactive pulse + VU meter
          const baseW = 240 * speakerScale;
          const baseH = 320 * speakerScale;
          const pulse = isActive ? 1 + (audioLevel * 0.06) : 1;
          const w = baseW * pulse;
          const h = baseH * pulse;
          const rectX = x - w/2;
          const rectY = y - h/2 + 50; // Shift down a bit

          // Glow halo when active
          if (isActive) {
              ctx.save();
              ctx.shadowColor = color;
              ctx.shadowBlur = 36 * audioLevel;
              ctx.beginPath();
              ctx.roundRect(rectX - 4, rectY - 4, w + 8, h + 8, 32);
              ctx.strokeStyle = color;
              ctx.lineWidth = 3;
              ctx.stroke();
              ctx.restore();
          }

          ctx.save();
          ctx.beginPath();
          ctx.roundRect(rectX, rectY, w, h, 30);
          ctx.clip();

          if (image) {
              // Draw image cover to fill the entire rectangle
              const scale = Math.max(w / image.width, h / image.height);
              const imgW = image.width * scale;
              const imgH = image.height * scale;
              ctx.drawImage(image, rectX + w/2 - imgW/2, rectY + h/2 - imgH/2, imgW, imgH);
          } else {
              // Fallback to avatar rectangle if no image
              ctx.fillStyle = '#1e1e1e';
              ctx.fill();

              const boxW = 120 * speakerScale * pulse;
              const boxH = 120 * speakerScale * pulse;
              ctx.beginPath();
              ctx.roundRect(x - boxW/2, rectY + h/2 - 40 - boxH/2, boxW, boxH, 20);
              ctx.fillStyle = '#27272a';
              ctx.fill();

              ctx.fillStyle = '#fff';
              ctx.font = `bold ${40 * pulse}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label.charAt(0), x, rectY + h/2 - 40);
          }
          ctx.restore();

          // Border
          ctx.beginPath();
          ctx.roundRect(rectX, rectY, w, h, 30);
          ctx.lineWidth = isActive ? 4 : 2;
          ctx.strokeStyle = isActive ? color : '#333';
          ctx.stroke();

          drawNameLowerThird(label, color, rectX, rectY, w, h, 30);

          // ── VU meter (same styles as transparent-avatars) ───────────────────
          if (showVuMeter && isActive) {

              // ── RING: semicircular arc on top of frame ──────────────────────
              if (vuMeterStyle === 'ring') {
                  const lv = Math.max(0.02, audioLevel);
                  const cx = rectX + w / 2;
                  const cy = rectY;
                  const R  = w / 2 + 20;
                  const TW = 11;
                  ctx.save();
                  ctx.lineCap = 'round';
                  ctx.beginPath();
                  ctx.arc(cx, cy, R, Math.PI, 0, false);
                  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                  ctx.lineWidth = TW + 4;
                  ctx.stroke();
                  const endA = Math.PI + lv * Math.PI;
                  const grd2 = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
                  grd2.addColorStop(0,    '#6366f1');
                  grd2.addColorStop(0.25, '#06b6d4');
                  grd2.addColorStop(0.5,  '#10b981');
                  grd2.addColorStop(0.75, '#f59e0b');
                  grd2.addColorStop(1,    '#ef4444');
                  ctx.beginPath();
                  ctx.arc(cx, cy, R, Math.PI, endA, false);
                  ctx.strokeStyle = grd2;
                  ctx.lineWidth = TW;
                  ctx.shadowColor = lv > 0.7 ? '#f59e0b' : lv > 0.4 ? '#06b6d4' : '#6366f1';
                  ctx.shadowBlur  = 14 + lv * 18;
                  ctx.stroke();
                  const capX2 = cx + Math.cos(endA) * R;
                  const capY2 = cy + Math.sin(endA) * R;
                  ctx.beginPath();
                  ctx.arc(capX2, capY2, TW / 2, 0, Math.PI * 2);
                  ctx.fillStyle = '#ffffff';
                  ctx.shadowColor = '#ffffff';
                  ctx.shadowBlur  = 12;
                  ctx.fill();
                  ctx.restore();
              }

              // ── GLOW: pulsing concentric rings around entire photo frame ────
              if (vuMeterStyle === 'glow') {
                  const lv = Math.max(0.05, audioLevel);
                  const RING_COUNT = 4;
                  ctx.save();
                  for (let ri = 0; ri < RING_COUNT; ri++) {
                      const spread = 8 + ri * 14 + lv * (ri + 1) * 18;
                      const alpha  = (0.55 - ri * 0.11) * lv;
                      const lw     = Math.max(0.5, 3.5 - ri * 0.7);
                      ctx.globalAlpha = alpha;
                      ctx.shadowColor = color;
                      ctx.shadowBlur  = 18 + ri * 8 + lv * 20;
                      ctx.strokeStyle = color;
                      ctx.lineWidth   = lw;
                      ctx.beginPath();
                      ctx.roundRect(
                          rectX - spread, rectY - spread,
                          w + spread * 2, h + spread * 2,
                          30 + spread * 0.5
                      );
                      ctx.stroke();
                      ctx.shadowBlur = 0;
                  }
                  ctx.globalAlpha = lv * 0.7;
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth   = 1.5;
                  ctx.shadowColor = '#ffffff';
                  ctx.shadowBlur  = 12 + lv * 16;
                  ctx.beginPath();
                  ctx.roundRect(rectX - 3, rectY - 3, w + 6, h + 6, 33);
                  ctx.stroke();
                  ctx.globalAlpha = 1;
                  ctx.restore();
              }

              // ── WAVE: waveform bars below the photo frame ──────────────────
              if (vuMeterStyle === 'wave') {
                  const lv  = Math.max(0.04, audioLevel);
                  const BAR = 30;
                  const BAR_W   = (w * 0.92) / (BAR * 1.45);
                  const GAP_W   = BAR_W * 0.45;
                  const MAX_H   = h * 0.55;
                  const MIN_H   = 3 * speakerScale;
                  const waveY   = rectY + h + 10 * speakerScale;
                  const startX  = rectX + w * 0.04;
                  const t       = audioRef.current ? audioRef.current.currentTime : (Date.now() / 1000);

                  ctx.save();
                  for (let bi = 0; bi < BAR; bi++) {
                      const frac = bi / (BAR - 1);
                      const centreBoost = 1 - Math.abs(frac - 0.5) * 1.3;
                      const sineA = Math.sin(t * 4.5 + bi * 0.55) * 0.35;
                      const sineB = Math.sin(t * 7.0 + bi * 0.9  + 1.2) * 0.15;
                      const raw   = Math.max(0, centreBoost * lv + sineA * lv + sineB);
                      const barH  = Math.max(MIN_H, raw * MAX_H);
                      const bx2   = startX + bi * (BAR_W + GAP_W);
                      const stops = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444'];
                      const ci    = Math.min(stops.length - 1, Math.floor(frac * stops.length));
                      const barColor = stops[ci];
                      ctx.globalAlpha = 0.5 + 0.5 * lv;
                      ctx.shadowColor = barColor;
                      ctx.shadowBlur  = 6 + lv * 10;
                      ctx.fillStyle   = barColor;
                      ctx.beginPath();
                      ctx.roundRect(bx2, waveY - barH, BAR_W, barH, 2);
                      ctx.fill();
                      ctx.shadowBlur  = 0;
                  }
                  ctx.globalAlpha = 1;
                  ctx.restore();
              }
          }

          return; // VU effects drawn — skip outer ring block

      } else if (theme === 'split') {
          // Split: Wide Rectangles with LIVE badge
          const baseW = 320 * speakerScale;
          const baseH = 240 * speakerScale;
          
          // Scale up if active
          const scaleFactor = isActive ? 1.1 : 1.0;
          const w = baseW * scaleFactor;
          const h = baseH * scaleFactor;
          
          const rectX = x - w/2;
          const rectY = y - h/2 + 30;
          
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(rectX, rectY, w, h, 20);
          ctx.clip();

          if (image) {
              // Draw image cover to fill the entire rectangle
              const scale = Math.max(w / image.width, h / image.height);
              const imgW = image.width * scale;
              const imgH = image.height * scale;
              ctx.drawImage(image, rectX + w/2 - imgW/2, rectY + h/2 - imgH/2, imgW, imgH);
          } else {
              // Fallback to avatar rectangle
              ctx.fillStyle = '#1e1e1e';
              ctx.fill();

              const boxSize = 100 * speakerScale * scaleFactor;
              ctx.beginPath();
              ctx.roundRect(x - boxSize/2, rectY + h/2 - boxSize/2, boxSize, boxSize, 20);
              ctx.fillStyle = '#27272a';
              ctx.fill();
              
              // Initial
              ctx.fillStyle = '#fff';
              ctx.font = `bold ${32 * scaleFactor}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label.charAt(0), x, rectY + h/2);
          }
          ctx.restore();
          
          // Border with Neon Glow
          ctx.beginPath();
          ctx.roundRect(rectX, rectY, w, h, 20);
          ctx.lineWidth = isActive ? 6 : 2;
          ctx.strokeStyle = isActive ? color : '#333';
          
          if (isActive) {
              ctx.shadowColor = color;
              ctx.shadowBlur = 30;
          } else {
              ctx.shadowBlur = 0;
          }
          
          ctx.stroke();
          ctx.shadowBlur = 0; // Reset after stroke

          // LIVE Badge
          if (isActive) {
              ctx.fillStyle = '#000';
              ctx.beginPath();
              ctx.roundRect(rectX + w - 80, rectY + h - 40, 60, 25, 4);
              ctx.fill();
              ctx.fillStyle = '#fff';
              ctx.font = 'bold 14px sans-serif';
              ctx.fillText('LIVE', rectX + w - 50, rectY + h - 27);
          }

          drawNameLowerThird(label, color, rectX, rectY, w, h, 20);

      } else if (theme === 'transparent-avatars') {
          // 16:9 wide cinematic frame for transparent-avatars theme
          const baseW = 310 * speakerScale;
          const baseH = Math.round(baseW * 9 / 16); // strict 16:9
          const pulse = isActive ? 1 + (audioLevel * 0.06) : 1;
          const w = baseW * pulse;
          const h = baseH * pulse;
          const rectX = x - w / 2;
          const rectY = y - h / 2;

          // Glow halo when active
          if (isActive) {
              ctx.save();
              ctx.shadowColor = color;
              ctx.shadowBlur = 36 * audioLevel;
              ctx.beginPath();
              ctx.roundRect(rectX - 4, rectY - 4, w + 8, h + 8, 18);
              ctx.strokeStyle = color;
              ctx.lineWidth = 3;
              ctx.stroke();
              ctx.restore();
          }

          ctx.save();
          ctx.beginPath();
          ctx.roundRect(rectX, rectY, w, h, 14);
          ctx.clip();

          if (image) {
              // Cover fill — 16:9 image fills 16:9 frame perfectly
              const scale = Math.max(w / image.width, h / image.height);
              const imgW = image.width * scale;
              const imgH = image.height * scale;
              ctx.drawImage(image, rectX + w / 2 - imgW / 2, rectY + h / 2 - imgH / 2, imgW, imgH);
          } else {
              // Fallback gradient placeholder
              const fbGrad = ctx.createLinearGradient(rectX, rectY, rectX, rectY + h);
              fbGrad.addColorStop(0, '#1e293b');
              fbGrad.addColorStop(1, '#0f172a');
              ctx.fillStyle = fbGrad;
              ctx.fill();
              ctx.fillStyle = '#fff';
              ctx.font = `bold ${40 * speakerScale}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label.charAt(0), rectX + w / 2, rectY + h / 2);
          }
          ctx.restore();

          // Border
          ctx.beginPath();
          ctx.roundRect(rectX, rectY, w, h, 14);
          ctx.lineWidth = isActive ? 3 : 1.5;
          ctx.strokeStyle = isActive ? color : 'rgba(255,255,255,0.18)';
          ctx.stroke();

          drawNameLowerThird(label, color, rectX, rectY, w, h, 14);

          // ── VU meter / Photo effect ───────────────────────────────────────────
          if (showVuMeter && isActive) {

              // ── RING: semicircular arc on top of frame ──────────────────────
              if (vuMeterStyle === 'ring') {
                  const lv = Math.max(0.02, audioLevel);
                  const cx = rectX + w / 2;
                  const cy = rectY;
                  const R  = w / 2 + 20;
                  const TW = 11;
                  ctx.save();
                  ctx.lineCap = 'round';
                  ctx.beginPath();
                  ctx.arc(cx, cy, R, Math.PI, 0, false);
                  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                  ctx.lineWidth = TW + 4;
                  ctx.stroke();
                  const endA = Math.PI + lv * Math.PI;
                  const grd2 = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
                  grd2.addColorStop(0,    '#6366f1');
                  grd2.addColorStop(0.25, '#06b6d4');
                  grd2.addColorStop(0.5,  '#10b981');
                  grd2.addColorStop(0.75, '#f59e0b');
                  grd2.addColorStop(1,    '#ef4444');
                  ctx.beginPath();
                  ctx.arc(cx, cy, R, Math.PI, endA, false);
                  ctx.strokeStyle = grd2;
                  ctx.lineWidth = TW;
                  ctx.shadowColor = lv > 0.7 ? '#f59e0b' : lv > 0.4 ? '#06b6d4' : '#6366f1';
                  ctx.shadowBlur  = 14 + lv * 18;
                  ctx.stroke();
                  const capX2 = cx + Math.cos(endA) * R;
                  const capY2 = cy + Math.sin(endA) * R;
                  ctx.beginPath();
                  ctx.arc(capX2, capY2, TW / 2, 0, Math.PI * 2);
                  ctx.fillStyle = '#ffffff';
                  ctx.shadowColor = '#ffffff';
                  ctx.shadowBlur  = 12;
                  ctx.fill();
                  ctx.restore();
              }

              // ── GLOW: pulsing concentric rings around entire photo frame ────
              if (vuMeterStyle === 'glow') {
                  const lv = Math.max(0.05, audioLevel);
                  const RING_COUNT = 4;
                  ctx.save();
                  for (let ri = 0; ri < RING_COUNT; ri++) {
                      const spread = 8 + ri * 14 + lv * (ri + 1) * 18;
                      const alpha  = (0.55 - ri * 0.11) * lv;
                      const lw     = Math.max(0.5, 3.5 - ri * 0.7);
                      ctx.globalAlpha = alpha;
                      ctx.shadowColor = color;
                      ctx.shadowBlur  = 18 + ri * 8 + lv * 20;
                      ctx.strokeStyle = color;
                      ctx.lineWidth   = lw;
                      ctx.beginPath();
                      ctx.roundRect(
                          rectX - spread, rectY - spread,
                          w + spread * 2, h + spread * 2,
                          14 + spread * 0.5
                      );
                      ctx.stroke();
                      ctx.shadowBlur = 0;
                  }
                  // Bright inner edge pulse
                  ctx.globalAlpha = lv * 0.7;
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth   = 1.5;
                  ctx.shadowColor = '#ffffff';
                  ctx.shadowBlur  = 12 + lv * 16;
                  ctx.beginPath();
                  ctx.roundRect(rectX - 3, rectY - 3, w + 6, h + 6, 16);
                  ctx.stroke();
                  ctx.globalAlpha = 1;
                  ctx.restore();
              }

              // ── WAVE: waveform bars below the photo frame ──────────────────
              if (vuMeterStyle === 'wave') {
                  const lv  = Math.max(0.04, audioLevel);
                  const BAR = 30;
                  const BAR_W   = (w * 0.92) / (BAR * 1.45);
                  const GAP_W   = BAR_W * 0.45;
                  const MAX_H   = h * 0.55;
                  const MIN_H   = 3 * speakerScale;
                  const waveY   = rectY + h + 10 * speakerScale;
                  const startX  = rectX + w * 0.04;
                  const t       = audioRef.current ? audioRef.current.currentTime : (Date.now() / 1000);

                  ctx.save();
                  for (let bi = 0; bi < BAR; bi++) {
                      const frac = bi / (BAR - 1);
                      // Organic shape: centre bars taller, outer bars shorter
                      const centreBoost = 1 - Math.abs(frac - 0.5) * 1.3;
                      // Time-based wave so bars animate even at low level
                      const sineA = Math.sin(t * 4.5 + bi * 0.55) * 0.35;
                      const sineB = Math.sin(t * 7.0 + bi * 0.9  + 1.2) * 0.15;
                      const raw   = Math.max(0, centreBoost * lv + sineA * lv + sineB);
                      const barH  = Math.max(MIN_H, raw * MAX_H);
                      const bx2   = startX + bi * (BAR_W + GAP_W);

                      // Colour gradient: blue→cyan→green→amber→red by position
                      const stops = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444'];
                      const ci    = Math.min(stops.length - 1, Math.floor(frac * stops.length));
                      const barColor = stops[ci];

                      ctx.globalAlpha = 0.5 + 0.5 * lv;
                      ctx.shadowColor = barColor;
                      ctx.shadowBlur  = 6 + lv * 10;
                      ctx.fillStyle   = barColor;
                      ctx.beginPath();
                      ctx.roundRect(bx2, waveY - barH, BAR_W, barH, 2);
                      ctx.fill();
                      ctx.shadowBlur  = 0;
                  }
                  ctx.globalAlpha = 1;
                  ctx.restore();
              }
          }

          return; // photo effects drawn above — skip outer ring block

      } else {
          // Default Rectangle Style
          const baseW = 160 * speakerScale;
          const baseH = 240 * speakerScale;
          const pulse = isActive ? 1 + (audioLevel * 0.1) : 1;
          const w = baseW * pulse;
          const h = baseH * pulse;
          const rectX = x - w/2;
          const rectY = y - h/2;

          if (isActive) {
              const gradient = ctx.createRadialGradient(x, y, Math.max(w, h) * 0.4, x, y, Math.max(w, h) * 1.2);
              gradient.addColorStop(0, color);
              gradient.addColorStop(1, 'rgba(0,0,0,0)');
              ctx.fillStyle = gradient;
              ctx.beginPath();
              ctx.roundRect(rectX - 20, rectY - 20, w + 40, h + 40, 30);
              ctx.fill();
          }

          ctx.save();
          ctx.beginPath();
          ctx.roundRect(rectX, rectY, w, h, 20);
          ctx.clip();

          if (image) {
              const scale = Math.max(w / image.width, h / image.height);
              const imgW = image.width * scale;
              const imgH = image.height * scale;
              ctx.drawImage(image, x - imgW/2, y - imgH/2, imgW, imgH);
          } else {
              ctx.fillStyle = '#1e293b';
              ctx.fill();
              ctx.fillStyle = '#fff';
              ctx.font = 'bold 32px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label.charAt(0), x, y);
          }
          ctx.restore();

          ctx.beginPath();
          ctx.roundRect(rectX, rectY, w, h, 20);
          ctx.lineWidth = isActive ? 6 : 2;
          ctx.strokeStyle = isActive ? color : '#475569';
          ctx.stroke();

          drawNameLowerThird(label, color, rectX, rectY, w, h, 20);

          if (showVuMeter && isActive && vuMeterStyle === 'ring') {
              const lv = Math.max(0.02, audioLevel);
              // Arc "nali" — sits on TOP of speaker frame, curved pipe style
              const cx = rectX + w / 2;
              const cy = rectY;           // top-center of frame
              const R  = w / 2 + 24;     // radius slightly wider than frame
              const TW = 13;             // track width (pipe thickness)

              ctx.save();
              ctx.lineCap = 'round';

              // ── Background track (dim pipe) ────────────────────────────────
              ctx.beginPath();
              ctx.arc(cx, cy, R, Math.PI, 0, false); // left → over TOP → right
              ctx.strokeStyle = 'rgba(255,255,255,0.07)';
              ctx.lineWidth = TW + 4;
              ctx.stroke();

              // ── Coloured fill based on audioLevel ─────────────────────────
              // fill goes from π (left) clockwise through top to endAngle
              const endAngle = Math.PI + lv * Math.PI; // lv=1 → full semicircle

              // Gradient: left → top → right  (blue → cyan → green → yellow → red)
              const grd = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
              grd.addColorStop(0,    '#6366f1'); // indigo (left start)
              grd.addColorStop(0.25, '#06b6d4'); // cyan
              grd.addColorStop(0.5,  '#10b981'); // green (top peak)
              grd.addColorStop(0.75, '#f59e0b'); // amber
              grd.addColorStop(1,    '#ef4444'); // red (right end)

              ctx.beginPath();
              ctx.arc(cx, cy, R, Math.PI, endAngle, false);
              ctx.strokeStyle = grd;
              ctx.lineWidth = TW;
              ctx.shadowColor = lv > 0.7 ? '#f59e0b' : lv > 0.4 ? '#06b6d4' : '#6366f1';
              ctx.shadowBlur  = 16 + lv * 22;
              ctx.stroke();

              // ── Bright glowing cap dot at live position ───────────────────
              const capX = cx + Math.cos(endAngle) * R;
              const capY = cy + Math.sin(endAngle) * R;
              ctx.beginPath();
              ctx.arc(capX, capY, TW / 2 + 1, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.shadowColor = '#ffffff';
              ctx.shadowBlur  = 14;
              ctx.fill();

              ctx.restore();
          }
      }
    };

    if (!isNarrator) {
        drawSpeaker(speakerALabel, posA.x, posA.y, isSpeakingA, theme === 'neon' ? '#00ff00' : '#3b82f6', speakerAImage);
        drawSpeaker(speakerBLabel, posB.x, posB.y, isSpeakingB, theme === 'neon' ? '#ff0000' : '#ef4444', speakerBImage);
    } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NARRATOR', canvas.width / 2, canvas.height / 2 - 50);
    }

    // --- SUBTITLES (Improved Phrase-wise Sync) ---
    if (showSubtitles && currentSegment.text) {
        const subtitleConfig = currentSegment.visualConfig?.subtitleConfig || {
            x: 192, y: 550, w: 896, h: 150, fontSize: 1, backgroundColor: 'rgba(0,0,0,0.85)', textColor: '#ffffff', borderColor: '#ffffff', borderWidth: 0, borderRadius: 20
        };

        const text = currentSegment.text;
        const fontSize = 32 * subtitleConfig.fontSize;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        
        const maxWidth = subtitleConfig.w - (60 * subtitleConfig.fontSize);
        
        let visibleLines: string[] = [];
        const globalTime = audioRef.current ? audioRef.current.currentTime : 0;
        const segmentStartTime = segmentOffsets[currentSegmentIndex] || 0;
        const currentTime = globalTime - segmentStartTime;

        if (currentSegment.phraseTimings && currentSegment.phraseTimings.length > 0) {
            // Find the active phrase based on current time
            const activePhrase = currentSegment.phraseTimings.find(p => currentTime >= p.start && currentTime <= p.end + 0.5);
            const pastPhrases = currentSegment.phraseTimings.filter(p => p.start <= currentTime);
            
            let currentText = "";
            if (activePhrase) {
                currentText = activePhrase.text;
            } else if (pastPhrases.length > 0) {
                const lastPhrase = pastPhrases[pastPhrases.length - 1];
                // Keep showing the last phrase for a short moment after it ends
                if (currentTime <= lastPhrase.end + 1.0) {
                    currentText = lastPhrase.text;
                }
            }

            // Word wrap the current phrase
            const words = currentText.split(' ');
            let line = '';
            for(let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && n > 0) {
                    visibleLines.push(line.trim());
                    line = words[n] + ' ';
                } else {
                    line = testLine;
                }
            }
            if (line.trim()) visibleLines.push(line.trim());

        } else {
            // Fallback to old linear logic if no phrase timings
            const words = text.split(' ');
            let line = '';
            const lines: string[] = [];
            for(let n = 0; n < words.length; n++) {
              const testLine = line + words[n] + ' ';
              const metrics = ctx.measureText(testLine);
              if (metrics.width > maxWidth && n > 0) {
                lines.push(line.trim());
                line = words[n] + ' ';
              } else {
                line = testLine;
              }
            }
            lines.push(line.trim());

            let duration = currentSegment.duration || 1;
            if (!isFinite(duration) || duration <= 0) duration = 1;
            
            const progress = Math.min(currentTime / duration, 1);
            const visibleWordCount = Math.floor(progress * words.length);

            let wordCounter = 0;
            let activeLineIndex = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineWords = lines[i].split(' ').length;
                if (visibleWordCount >= wordCounter && visibleWordCount < wordCounter + lineWords) {
                    activeLineIndex = i;
                    break;
                }
                wordCounter += lineWords;
            }
            if (visibleWordCount >= words.length) activeLineIndex = lines.length - 1;

            const mode = subtitleConfig.mode || 'full-word';
            if (mode === 'full-static') {
                visibleLines = lines;
            } else if (mode === 'line-static' || mode === 'line-word' || mode === 'full-word') {
                visibleLines = [lines[activeLineIndex] || ''];
            }
        }

        const lineHeight = fontSize * 1.5;
        const totalHeight = visibleLines.length * lineHeight;
        const bx = subtitleConfig.x;
        const by = subtitleConfig.y;
        const bw = subtitleConfig.w;
        const bh = Math.max(subtitleConfig.h, totalHeight + (60 * subtitleConfig.fontSize));

        const br = (subtitleConfig.borderRadius ?? 20) * subtitleConfig.fontSize;

        if (subtitleBackground) {
            ctx.fillStyle = subtitleConfig.backgroundColor;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, br);
            ctx.fill();

            if ((subtitleConfig.borderWidth ?? 0) > 0) {
                ctx.strokeStyle = subtitleConfig.borderColor || '#ffffff';
                ctx.lineWidth = subtitleConfig.borderWidth! * subtitleConfig.fontSize;
                ctx.beginPath();
                ctx.roundRect(bx, by, bw, bh, br);
                ctx.stroke();
            }
        }

        if (showSettings) {
            const handleSize = 14;
            const corners = [
              [bx, by],
              [bx + bw, by],
              [bx, by + bh],
              [bx + bw, by + bh],
            ];

            // Dashed selection border
            ctx.save();
            ctx.setLineDash([8, 5]);
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, bw, bh);
            ctx.setLineDash([]);
            ctx.restore();

            // Corner handles — yellow fill with black border so always visible
            corners.forEach(([cx, cy]) => {
              ctx.save();
              // Black outer ring for contrast
              ctx.fillStyle = '#000000';
              ctx.fillRect(cx - handleSize/2 - 1, cy - handleSize/2 - 1, handleSize + 2, handleSize + 2);
              // Yellow inner square
              ctx.fillStyle = '#facc15';
              ctx.fillRect(cx - handleSize/2, cy - handleSize/2, handleSize, handleSize);
              ctx.restore();
            });
        }

        if (!isNarrator && showNameBadge) {
            const speakerName = isSpeakingA ? speakerALabel : speakerBLabel;
            const fontSize = 24 * subtitleConfig.fontSize;
            ctx.font = `bold ${fontSize}px sans-serif`;
            
            const textMetrics = ctx.measureText(speakerName.toUpperCase());
            const textWidth = textMetrics.width;
            const paddingX = 16 * subtitleConfig.fontSize;
            const paddingY = 8 * subtitleConfig.fontSize;
            
            const badgeWidth = textWidth + paddingX * 2;
            const badgeHeight = fontSize + paddingY * 2;
            
            const badgeX = bx + 20;
            const badgeY = by - badgeHeight - 10;
            
            // Draw red background box
            const gradient = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeHeight);
            gradient.addColorStop(0, '#ff4b4b');
            gradient.addColorStop(1, '#dc2626');
            ctx.fillStyle = gradient;
            
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8 * subtitleConfig.fontSize);
            ctx.fill();
            
            // Add a subtle glow
            ctx.shadowColor = 'rgba(220, 38, 38, 0.6)';
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // Draw black text
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(speakerName.toUpperCase(), badgeX + paddingX, badgeY + badgeHeight / 2 + 2);
        }

        if (showVuMeter && vuMeterStyle === 'bar' && (isSpeakingA || isSpeakingB)) {
            const barW = 16 * subtitleConfig.fontSize;
            const barX = isSpeakingA ? bx - barW - 12 : bx + bw + 12;
            const lv   = Math.min(1, audioLevel);
            const SEG  = 22;
            const gap  = 3;
            const segH = (bh - gap * (SEG - 1)) / SEG;
            ctx.save();
            ctx.lineCap = 'round';
            // Gradient colors matching the arc: indigo→cyan→green→amber→red from bottom→top
            const COLORS = [
                '#6366f1','#6366f1','#6366f1','#6366f1', // bottom 4: indigo
                '#06b6d4','#06b6d4','#06b6d4','#06b6d4', // cyan
                '#10b981','#10b981','#10b981','#10b981', // green (middle)
                '#34d399','#34d399','#34d399',            // light green
                '#f59e0b','#f59e0b','#f59e0b',            // amber
                '#f97316','#ef4444','#ef4444','#ef4444',  // red (top)
            ];
            for (let s = 0; s < SEG; s++) {
                const segY    = by + bh - (s + 1) * (segH + gap) + gap;
                const segFrac = s / (SEG - 1); // 0 = bottom, 1 = top
                const active  = segFrac < lv;
                const c = COLORS[s] || '#6366f1';
                ctx.globalAlpha = active ? 1 : 0.08;
                if (active) {
                    ctx.shadowColor = c;
                    ctx.shadowBlur  = s > SEG * 0.7 ? 10 : 5;
                }
                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.roundRect(barX, segY, barW, segH, 3);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            // White peak cap dot
            const peakIdx = Math.floor(lv * (SEG - 1));
            const peakY   = by + bh - (peakIdx + 1) * (segH + gap) + gap;
            ctx.globalAlpha = 0.9;
            ctx.fillStyle   = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur  = 10;
            ctx.beginPath();
            ctx.roundRect(barX, peakY - 3, barW, 3, 2);
            ctx.fill();
            ctx.shadowBlur  = 0;
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        ctx.fillStyle = subtitleConfig.textColor;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        const textBlockHeight = visibleLines.length * lineHeight;
        const textStartY = by + (bh - textBlockHeight) / 2 + (fontSize * 0.3);

        visibleLines.forEach((l, i) => {
            ctx.fillText(l, bx + bw / 2, textStartY + (i * lineHeight));
        });
    }

    // ... (Scorecard logic remains same)
    if (showScorecard && scorecardData) {
        // ... (Keep existing scorecard logic)
        const cardWidth = 800;
        const cardHeight = 300;
        const cardX = (canvas.width - cardWidth) / 2;
        const cardY = 80;
        const grad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardHeight);
        grad.addColorStop(0, '#1e3a8a');
        grad.addColorStop(1, '#172554');
        ctx.fillStyle = grad;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 20);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardWidth, 60, [20, 20, 0, 0]);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('AI JUDGE SCORECARD', canvas.width / 2, cardY + 30);
        const models = scorecardData.scores;
        const spacing = cardWidth / (models.length);
        models.forEach((m, i) => {
            const mx = cardX + (spacing * i) + (spacing / 2);
            const my = cardY + 100;
            ctx.fillStyle = '#bfdbfe';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText(m.model.toUpperCase(), mx, my);
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.beginPath();
            ctx.roundRect(mx - 30, my + 20, 60, 50, 10);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 32px sans-serif';
            ctx.fillText(m.score.toString(), mx, my + 45);
        });
        const avgY = cardY + 220;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 80px sans-serif';
        ctx.fillText(scorecardData.average.toFixed(1), canvas.width / 2, avgY);
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = '#60a5fa';
        ctx.fillText('AVERAGE RATING', canvas.width / 2, avgY + 40);
    }

   */

  useEffect(() => {
    animationRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationRef.current);
  }, [render]);

  if (!script || script.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 text-gray-500">
          <Video size={32} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">No Script Available</h2>
        <p className="text-gray-400 mb-6">Please generate a script and audio before visualizing.</p>
        <button 
          onClick={onBack}
          className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2"
        >
          <ChevronLeft size={20} /> Go Back
        </button>
      </div>
    );
  }

  if (isMerging) {
      return (
          <div className="w-full h-full flex flex-col items-center justify-center bg-black/90 z-50">
              <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
              <h2 className="text-xl font-bold text-white">Preparing Audio...</h2>
              <p className="text-gray-400 text-sm mt-2">Merging audio segments for seamless playback</p>
          </div>
      );
  }

  if (mergeError) {
      return (
          <div className="w-full h-full flex flex-col items-center justify-center bg-black/90 z-50 p-8 text-center">
              <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-500">
                  <Activity size={32} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Audio Error</h2>
              <p className="text-red-400 mb-6">{mergeError}</p>
              <button 
                onClick={onBack}
                className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-bold transition-colors"
              >
                Go Back
              </button>
          </div>
      );
  }

  // Mouse/Touch Handling
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    
    // Canvas scaling
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const { x, y } = getCanvasCoords(e);
    
    // Check Subtitle Handles first (if settings visible)
    if (showSettings && showSubtitles) {
        const subtitleConfig = currentSegment.visualConfig?.subtitleConfig || { x: 192, y: 550, w: 896, h: 150 };
        const bx = subtitleConfig.x;
        const by = subtitleConfig.y;
        const bw = subtitleConfig.w;
        const bh = subtitleConfig.h;
        const handleSize = 20; // Hit area

        // BR
        if (Math.abs(x - (bx + bw)) < handleSize && y >= (by + bh - handleSize) && y <= (by + bh + 200)) {
            setResizingSubtitle('br');
            return;
        }
        // BL
        if (Math.abs(x - bx) < handleSize && y >= (by + bh - handleSize) && y <= (by + bh + 200)) {
            setResizingSubtitle('bl');
            return;
        }
        // TR
        if (Math.abs(x - (bx + bw)) < handleSize && Math.abs(y - by) < handleSize) {
            setResizingSubtitle('tr');
            return;
        }
        // TL
        if (Math.abs(x - bx) < handleSize && Math.abs(y - by) < handleSize) {
            setResizingSubtitle('tl');
            return;
        }

        // Check Subtitle Drag
        if (x > bx && x < bx + bw && y > by && y < by + bh + 200) {
            setDraggingSubtitle(true);
            setDragOffset({ x: x - bx, y: y - subtitleConfig.y }); 
            return;
        }
    }

    // Check Speakers (Only if settings visible)
    if (showSettings) {
        // Iterate over all speakers to find hit
        for (let i = 0; i < speakerPositions.length; i++) {
            const pos = speakerPositions[i];
            if (!pos) continue;

            const sx = pos.x * 1280;
            const sy = pos.y * 720;
            let hit = false;

            if (theme === 'minimal') {
                const w = 240 * speakerScale;
                const h = 320 * speakerScale;
                // rectX = x - w/2, rectY = y - h/2 + 50
                const rectX = sx - w/2;
                const rectY = sy - h/2 + 50;
                if (x >= rectX && x <= rectX + w && y >= rectY && y <= rectY + h) hit = true;
            } else if (theme === 'split') {
                const w = 200 * speakerScale;
                const h = 150 * speakerScale;
                // rectX = x - w/2, rectY = y - h/2 + 30
                const rectX = sx - w/2;
                const rectY = sy - h/2 + 30;
                if (x >= rectX && x <= rectX + w && y >= rectY && y <= rectY + h) hit = true;
            } else if (theme === 'arena') {
                const w = 240 * speakerScale;
                const h = 320 * speakerScale;
                // rectX = x - w/2, rectY = y - h/2 + 50 (matches arena drawSpeaker)
                const rectX = sx - w/2;
                const rectY = sy - h/2 + 50;
                if (x >= rectX && x <= rectX + w && y >= rectY && y <= rectY + h) hit = true;
            } else {
                // Default Circle Hit Detection
                const dist = Math.hypot(x - sx, y - sy);
                const threshold = 80 * speakerScale; 
                if (dist < threshold) hit = true;
            }

            if (hit) {
                setDragging(i);
                return;
            }
        }
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const { x, y } = getCanvasCoords(e);
    const subtitleConfig = currentSegment.visualConfig?.subtitleConfig || { x: 192, y: 550, w: 896, h: 150 };

    if (resizingSubtitle) {
        const bx = subtitleConfig.x;
        const by = subtitleConfig.y; // Base Y
        const bw = subtitleConfig.w;
        const bh = subtitleConfig.h;
        const minSize = 100;

        let newBox = { ...subtitleConfig };

        if (resizingSubtitle === 'br') {
            newBox.w = Math.max(minSize, x - bx);
            newBox.h = Math.max(minSize, y - by);
        } else if (resizingSubtitle === 'bl') {
            const newW = Math.max(minSize, (bx + bw) - x);
            newBox.x = (bx + bw) - newW;
            newBox.w = newW;
            newBox.h = Math.max(minSize, y - by);
        } else if (resizingSubtitle === 'tr') {
            newBox.w = Math.max(minSize, x - bx);
            const currentVisualY = by;
            const newVisualY = y;
            const deltaY = newVisualY - currentVisualY;
            newBox.y = by + deltaY;
            newBox.h = bh - deltaY;
        } else if (resizingSubtitle === 'tl') {
             const newW = Math.max(minSize, (bx + bw) - x);
             newBox.x = (bx + bw) - newW;
             newBox.w = newW;
             
             const currentVisualY = by;
             const newVisualY = y;
             const deltaY = newVisualY - currentVisualY;
             newBox.y = by + deltaY;
             newBox.h = bh - deltaY;
        }
        
        setScript(prev => {
            return prev.map((seg, idx) => {
                if (syncSubtitlePosition || idx === currentSegmentIndex) {
                    return {
                        ...seg,
                        visualConfig: {
                            ...seg.visualConfig,
                            subtitleConfig: {
                                ...(seg.visualConfig?.subtitleConfig || subtitleConfig),
                                ...newBox
                            }
                        }
                    };
                }
                return seg;
            });
        });
        return;
    }

    if (draggingSubtitle) {
        const newX = x - dragOffset.x;
        const newY = y - dragOffset.y;
        
        setScript(prev => {
            return prev.map((seg, idx) => {
                if (syncSubtitlePosition || idx === currentSegmentIndex) {
                    return {
                        ...seg,
                        visualConfig: {
                            ...seg.visualConfig,
                            subtitleConfig: {
                                ...(seg.visualConfig?.subtitleConfig || subtitleConfig),
                                x: newX,
                                y: newY
                            }
                        }
                    };
                }
                return seg;
            });
        });
        return;
    }

    if (dragging !== null) {
        // Convert back to 0-1 range
        const xPct = Math.max(0, Math.min(1, x / 1280));
        const yPct = Math.max(0, Math.min(1, y / 720));
        
        setSpeakerPositions(prev => {
            const newPos = [...prev];
            if (newPos[dragging]) {
                newPos[dragging] = { x: xPct, y: yPct };
            }
            return newPos;
        });
    }
  };

  const handlePointerUp = () => {
      setDragging(null);
      setDraggingSubtitle(false);
      setResizingSubtitle(null);
  };

  const getSupportedMimeType = () => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  };



  // Export Logic
  const handleExport = async () => {
      setStatusMessage("Initializing...");
      
      try {
        if (!mergedAudioUrl) {
            setStatusMessage("Error: Audio not ready");
            toast.warning("Audio is still processing. Please wait for the audio to finish generating.");
            return;
        }

        if (!('VideoEncoder' in window)) {
            setStatusMessage("Error: Browser not supported");
            toast.error("High-quality video export is not supported in this browser. Please use Chrome, Edge, or Safari 16+.");
            return;
        }

        // Check for long video risk
        let duration = audioRef.current?.duration || 0;
        if (!isFinite(duration)) {
            // Estimate from last segment end
            if (segmentOffsets.length > 0 && script.length > 0) {
                const lastOffset = segmentOffsets[segmentOffsets.length - 1];
                const lastDur = script[script.length - 1].duration || 5;
                duration = lastOffset + lastDur;
            } else {
                duration = 600; // Fallback to 10 mins to be safe
            }
        }
        
        
        /* 
        // Removed warning to unblock user
        if (duration > 300) { 
            const proceed = window.confirm(
                `⚠️ Long Video Warning (${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s)\n\n` +
                "This video is over 5 minutes long. Exporting might take a while and use significant memory.\n\n" +
                "Do you want to proceed?"
            );
            if (!proceed) {
                setStatusMessage("Cancelled by user");
                setTimeout(() => setStatusMessage(""), 3000);
                return;
            }
        }
        */

        setIsExporting(true);
        setExportProgress(0);
        setShowExportSettings(false);
        setStatusMessage("Starting export...");

        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 100));

        // --- HIGH QUALITY OFFLINE RENDER ---
        // 1. Load all assets
        setStatusMessage("Loading assets...");
        const assets: RenderAssets = {
            background,
            backgroundVideo: null, // Will be overridden by offline video during render
            backgroundColor: globalBackgroundColor,
            speakerImages: speakerImages,
            segmentBackgrounds: new Map()
        };

        // Load all segment backgrounds
        const bgPromises = script.map(async (seg) => {
            const url = seg.visualConfig?.backgroundUrl;
            if (url && !assets.segmentBackgrounds.has(url)) {
                try {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.src = url;
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                    });
                    assets.segmentBackgrounds.set(url, img);
                } catch (e) {
                    console.warn("Failed to load bg", url);
                }
            }
        });
        await Promise.all(bgPromises);

        // 2. Get Audio Blob and Decode
        setStatusMessage("Decoding audio...");
        const audioRes = await fetch(mergedAudioUrl);
        const audioBlob = await audioRes.blob();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new AudioContext();
        let audioBuffer: AudioBuffer;
        try {
            audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
                audioContext.decodeAudioData(arrayBuffer, resolve, reject);
            });
        } finally {
            if (audioContext.state !== 'closed') {
                await audioContext.close();
            }
        }

        // Extract channels
        const audioChannels: Float32Array[] = [];
        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            audioChannels.push(audioBuffer.getChannelData(i));
        }

        // 3. Render Video
        setStatusMessage("Rendering video...");
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("No canvas");

        // Determine Bitrate based on Quality and Resolution
        let bitrate = 2_500_000; // Default Medium 720p
        
        if (exportResolution === '1080p') {
            if (exportQuality === 'Low') bitrate = 3_000_000;
            else if (exportQuality === 'Medium') bitrate = 5_000_000;
            else bitrate = 8_000_000;
        } else {
            // 720p
            if (exportQuality === 'Low') bitrate = 1_000_000;
            else if (exportQuality === 'Medium') bitrate = 2_500_000;
            else bitrate = 4_000_000;
        }

        const config: VisualConfig = {
            theme,
            showSubtitles,
            subtitleBackground,
            speakerIds: activeSpeakers,
            speakerLabels: speakerLabels,
            speakerPositions: speakerPositions,
            speakerScale,
            showTimer,
            showSideStats,
            showVuMeter,
            vuMeterStyle,
            showSpeakerImages,
            showSpeakers,
            showScores,
            backgroundDim,
            globalThemeConfig,
            questionMode,
            narratorTextColor,
            showMinimalSpeakerName,
            showMinimalSideVU,
            showNameLabels,
            showNameBadge,
            nameBadgeStyle,
            nameBadgeColorA,
            nameBadgeColorB,
            nameBadgeColorC,
        };

        const videoBlob = await renderVideoOffline({
            canvas,
            audioChannels,
            sampleRate: audioBuffer.sampleRate,
            duration: duration,
            fps: 30,
            bitrate,
            width: exportResolution === '1080p' ? 1920 : 1280,
            height: exportResolution === '1080p' ? 1080 : 720,
            backgroundVideoUrl: backgroundVideoUrl || undefined,
            renderCallback: (time, audioLevel, offlineVideoElement, offCtx) => {
                // Draw onto the dedicated OffscreenCanvas (completely isolated
                // from the visible preview canvas — no flicker, no rAF interference)
                if (!offCtx) return;

                // Calculate index
                let index = 0;
                for (let i = 0; i < segmentOffsets.length; i++) {
                    if (time >= segmentOffsets[i]) {
                        index = i;
                    } else {
                        break;
                    }
                }

                // Calculate Scores
                let currentScoreA = 0;
                let currentScoreB = 0;
                const spA = activeSpeakers[0];
                const spB = activeSpeakers[1];
                for (let i = 0; i < index; i++) {
                    const seg = script[i];
                    const score = segmentScores[i] || 0;
                    if (seg.speaker === spA) currentScoreA += score;
                    if (seg.speaker === spB) currentScoreB += score;
                }

                const currentAssets: RenderAssets = {
                    ...assets,
                    backgroundVideo: offlineVideoElement || null
                };

                drawDebateFrame(
                    offCtx,
                    time,
                    audioLevel,
                    script,
                    segmentOffsets,
                    index,
                    duration,
                    { scoreA: currentScoreA.toFixed(1), scoreB: currentScoreB.toFixed(1) },
                    config,
                    currentAssets
                );
            },
            onProgress: (p) => {
                setExportProgress(p * 100);
                setStatusMessage(`Rendering: ${Math.round(p * 100)}%`);
            }
        });

        // 4. Download + keep blob for merge
        if (videoBlob) {
            setStatusMessage("Download ready! (Merge available in Settings)");
            setRenderedBlob(videoBlob as Blob);
            const url = URL.createObjectURL(videoBlob as Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `debate_video_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Clear success message after a delay
            setTimeout(() => setStatusMessage(""), 6000);
        }
        

      } catch (err: any) {
          console.error("Export error:", err);
          setStatusMessage(`Error: ${err.message}`);
          toast.error(`Export failed: ${err.message}`);
      } finally {
          setIsExporting(false);
      }
  };

  const handleMergeVideos = async () => {
      if (!renderedBlob) {
          toast.warning('Please export the video first before merging.');
          return;
      }
      const introFilename = youtubeData?.editedFilename || youtubeData?.downloadedFilename;
      if (!introFilename) {
          toast.error('YouTube video filename not found. Please download the video in the YouTube Import step.');
          return;
      }
      setIsMergingVideos(true);
      setMergeVideoError('');
      setMergeVideoResult(null);
      try {
          const formData = new FormData();
          formData.append('intro_filename', introFilename);
          formData.append('rendered_video', renderedBlob, 'rendered_debate.mp4');
          formData.append('output_name', `final_merged_${Date.now()}.mp4`);

          const res = await fetch(`${mergeFlaskUrl}/api/video/merge`, {
              method: 'POST',
              body: formData,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Merge failed');
          setMergeVideoResult({
              filename: data.filename,
              downloadUrl: `${mergeFlaskUrl}${data.download_url}`,
          });
      } catch (e: any) {
          setMergeVideoError(e.message || 'Merge failed');
      } finally {
          setIsMergingVideos(false);
      }
  };

  const handleGenerateSegmentImages = async () => {
      if (isGeneratingImages) return;
      setIsGeneratingImages(true);
      setImageGenProgress(0);
      setStatusMessage("Generating images...");

      try {
          const total = script.length;
          let completed = 0;

          // Process in batches of 3 to avoid rate limits
          const batchSize = 3;
          for (let i = 0; i < script.length; i += batchSize) {
              const batch = script.slice(i, i + batchSize);
              
              const results = await Promise.all(batch.map(async (seg, batchIdx) => {
                  try {
                      const url = await generateSegmentImage(seg.text);
                      return { idx: i + batchIdx, url };
                  } catch (e) {
                      console.error(`Failed to generate image for segment ${i + batchIdx}`, e);
                      return null;
                  }
              }));

              setScript(prev => {
                  const newScript = [...prev];
                  results.forEach(res => {
                      if (res) {
                          newScript[res.idx] = {
                              ...newScript[res.idx],
                              visualConfig: {
                                  ...newScript[res.idx].visualConfig,
                                  backgroundUrl: res.url
                              }
                          };
                      }
                  });
                  return newScript;
              });
              
              completed += batch.length;
              setImageGenProgress(Math.round((completed / total) * 100));
          }
          
          setStatusMessage("Images generated!");
          setTimeout(() => setStatusMessage(""), 3000);

      } catch (e) {
          console.error("Image generation failed", e);
          setStatusMessage("Generation failed");
      } finally {
          setIsGeneratingImages(false);
      }
  };

  const TABS = ['Speakers', 'Background', 'Subtitle', 'Options'] as const;

  return (
    <div className="w-full h-full bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 sticky top-0 z-30 bg-[#050505]/95 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <button
            onClick={onBack}
            disabled={isRecording}
            className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50 text-gray-400 hover:text-white"
        >
          <ChevronLeft size={24} />
        </button>

        <h2 className="text-base font-bold text-white tracking-tight">Video Maker</h2>

        <div className="flex items-center gap-2">
          {statusMessage && (
            <span className="text-[10px] text-gray-400 max-w-[100px] truncate">{statusMessage}</span>
          )}
          {mergeError && (
            <span className="text-[10px] text-red-400">Error</span>
          )}
        </div>
      </header>

      {/* Scrollable content - with padding-bottom so fixed button doesn't overlap */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-40 md:pb-24">
        <div className="flex flex-col p-3 gap-3 max-w-2xl mx-auto w-full">

          {/* Canvas Preview */}
          <div className="w-full aspect-video bg-[#050505] rounded-2xl overflow-hidden shadow-2xl border border-white/5 relative shrink-0">
                    <canvas
                        ref={canvasRef}
                        width={1280}
                        height={720}
                        className="w-full h-full object-contain touch-none"
                        onMouseDown={handlePointerDown}
                        onMouseMove={handlePointerMove}
                        onMouseUp={handlePointerUp}
                        onMouseLeave={handlePointerUp}
                        onTouchStart={handlePointerDown}
                        onTouchMove={handlePointerMove}
                        onTouchEnd={handlePointerUp}
                    />
                    <video 
                        ref={backgroundVideoRef} 
                        className="hidden" 
                        loop 
                        muted 
                        playsInline 
                        crossOrigin="anonymous"
                    />
                </div>

          {/* Playback Controls */}
          <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-3 flex items-center gap-3">
            <button
              onClick={togglePlay}
              className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-full shadow-lg transition-all active:scale-95 ${
                isRecording ? 'bg-red-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {isRecording ? (
                <div className="w-4 h-4 bg-white rounded-sm" />
              ) : (
                isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`h-1.5 rounded-full overflow-hidden ${isRecording ? 'bg-red-900/30' : 'bg-gray-800'}`}>
                <div
                  className={`h-full transition-all duration-300 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-red-500'}`}
                  style={{ width: `${((currentSegmentIndex + 1) / script.length) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>{currentSegmentIndex + 1} / {script.length}</span>
                <span className={isRecording ? 'text-red-400 font-bold' : ''}>{isRecording ? '● REC' : 'Preview'}</span>
              </div>
            </div>
          </div>

          {/* Timeline Strip */}
          <div className="overflow-x-auto scrollbar-hide rounded-xl">
            <div className="flex gap-1.5 min-w-max p-1">
              {script.map((seg, idx) => {
                const spIdx = activeSpeakers.indexOf(seg.speaker);
                const colors = ['bg-blue-900/30 text-blue-400', 'bg-red-900/30 text-red-400', 'bg-purple-900/30 text-purple-400'];
                return (
                  <button
                    key={seg.id}
                    onClick={() => {
                      if (audioRef.current && segmentOffsets[idx] !== undefined) {
                        audioRef.current.currentTime = segmentOffsets[idx] + 0.1;
                        setCurrentSegmentIndex(idx);
                      }
                    }}
                    className={`relative flex flex-col items-center gap-0.5 p-1.5 rounded-lg border transition-all min-w-[52px] ${
                      currentSegmentIndex === idx
                        ? 'bg-white/10 border-white/20'
                        : 'bg-white/3 border-transparent hover:bg-white/8'
                    }`}
                  >
                    <div className={`w-full h-6 rounded-md flex items-center justify-center text-[9px] font-bold ${
                      seg.speaker === 'Narrator' ? 'bg-gray-800 text-gray-400' : (colors[spIdx] || colors[1])
                    }`}>
                      {seg.speaker === 'Narrator' ? 'N' : (speakerLabels[spIdx]?.charAt(0) || seg.speaker.charAt(0))}
                    </div>
                    <div className="text-[8px] text-gray-600 font-mono">{Math.round(seg.duration || 0)}s</div>
                    {currentSegmentIndex === idx && (
                      <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Visual Settings Panel (inline, collapsible) ── */}
          <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl overflow-hidden">
            {/* Collapsible header */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full flex items-center justify-between px-4 py-4"
            >
              <div className="flex items-center gap-2">
                <Settings size={15} className="text-red-500" />
                <span className="font-bold text-white text-sm">Visual Settings</span>
              </div>
              {showSettings
                ? <ChevronUp size={18} className="text-gray-500" />
                : <ChevronDown size={18} className="text-gray-500" />
              }
            </button>

            {showSettings && (
              <>
                {/* Tabs */}
                <div className="flex border-b border-white/5">
                  {TABS.map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSettingsTab(tab.toLowerCase() as any)}
                      className={`flex-1 py-3 text-xs font-semibold border-b-2 transition-colors ${
                        settingsTab === tab.toLowerCase()
                          ? 'text-red-400 border-red-500'
                          : 'text-gray-500 border-transparent hover:text-gray-300'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="p-4 space-y-4">

                {/* ── SPEAKERS TAB ── */}
                {settingsTab === 'speakers' && (
                  <div className="space-y-4">
                    {isMerging && (
                      <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-2">
                        <Loader2 size={12} className="animate-spin" /> Merging audio...
                      </div>
                    )}
                    {mergeError && (
                      <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{mergeError}</p>
                    )}
                    {/* Generate All button */}
                    <button
                      onClick={handleGenerateAllSpeakers}
                      disabled={speakerImageLoading.some(Boolean)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-bold bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/20 text-purple-300 transition-all disabled:opacity-40 disabled:cursor-wait"
                    >
                      {speakerImageLoading.some(Boolean)
                        ? <><Loader2 size={11} className="animate-spin" /> Generating…</>
                        : <><Wand2 size={11} /> Sabke AI Photos Banao ({activeSpeakers.length})</>
                      }
                    </button>

                    <div className={`grid gap-3 ${activeSpeakers.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      {activeSpeakers.map((speakerName, idx) => (
                        <div key={idx} className="space-y-2">
                          {/* Square image area (original size) */}
                          <div className="relative aspect-square bg-[#111] rounded-2xl border-2 border-dashed border-white/10 overflow-hidden">
                            {speakerImageLoading[idx] ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[#111]">
                                <Loader2 size={20} className="text-purple-400 animate-spin" />
                                <span className="text-[10px] text-gray-500">AI…</span>
                              </div>
                            ) : speakerImages[idx] ? (
                              <>
                                <img src={speakerImages[idx]!.src} alt={speakerName} className="w-full h-full object-cover" />
                                <button
                                  onClick={() => setSpeakerImages(prev => { const n = [...prev]; n[idx] = null; return n; })}
                                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center hover:bg-black/90 transition-colors"
                                >
                                  <X size={10} className="text-white" />
                                </button>
                              </>
                            ) : (
                              <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer gap-2 hover:bg-white/5 transition-colors">
                                <Upload size={22} className="text-gray-500" />
                                <span className="text-xs text-gray-500">{speakerLabels[idx] || speakerName}</span>
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleSpeakerImageUpload(e, idx)} />
                              </label>
                            )}
                            <button
                              onClick={() => setShowSpeakerImages(prev => {
                                const next = [...prev];
                                next[idx] = next[idx] === false ? true : false;
                                return next;
                              })}
                              title={showSpeakerImages[idx] === false ? 'Show image' : 'Hide image'}
                              className="absolute top-2 left-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                            >
                              {showSpeakerImages[idx] === false
                                ? <EyeOff size={12} className="text-gray-400" />
                                : <Eye size={12} className="text-white" />
                              }
                            </button>
                          </div>

                          {/* Compact action row below image */}
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleGenerateSpeakerImage(idx)}
                              disabled={!!speakerImageLoading[idx]}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/20 text-purple-300 transition-all disabled:opacity-40 disabled:cursor-wait"
                            >
                              {speakerImageLoading[idx]
                                ? <Loader2 size={9} className="animate-spin" />
                                : <Wand2 size={9} />
                              }
                              AI
                            </button>
                            <label className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium bg-white/3 hover:bg-white/8 border border-white/5 text-gray-500 hover:text-gray-300 cursor-pointer transition-all">
                              <Upload size={9} /> Upload
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleSpeakerImageUpload(e, idx)} />
                            </label>
                          </div>

                          <div className="text-center space-y-0.5">
                            <input
                              type="text"
                              value={speakerLabels[idx] || speakerName}
                              onChange={(e) => handleLabelChange(idx, e.target.value)}
                              className="w-full text-center text-xs font-medium text-white bg-transparent border-b border-white/10 focus:border-red-500/50 outline-none pb-0.5 transition-colors"
                            />
                            <p className="text-[10px] text-gray-600">Label in video: <span className="text-red-400 font-semibold">{speakerLabels[idx] || speakerName}</span></p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-xs text-gray-500">Speaker Size</label>
                        <span className="text-xs text-red-400 font-mono">{speakerScale.toFixed(1)}x</span>
                      </div>
                      <input type="range" min={0.5} max={2} step={0.1} value={speakerScale}
                        onChange={(e) => setSpeakerScale(parseFloat(e.target.value))}
                        className="w-full accent-red-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs text-gray-400">Show Speakers</span>
                      <input type="checkbox" checked={showSpeakers} onChange={(e) => setShowSpeakers(e.target.checked)} className="accent-red-500" />
                    </label>

                    {/* ── VU METER ── */}
                    <div className="bg-[#111] border border-white/5 rounded-xl p-3 space-y-2.5">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">VU Meter</p>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs text-gray-300">Show VU Meter</span>
                        <input type="checkbox" checked={showVuMeter} onChange={(e) => setShowVuMeter(e.target.checked)} className="accent-red-500" />
                      </label>
                      {showVuMeter && (
                        <>
                          <p className="text-[10px] text-gray-600">Style</p>
                          <div className="flex gap-1 bg-black/40 rounded-lg p-1 flex-wrap">
                            {(theme === 'transparent-avatars'
                              ? ['ring', 'glow', 'wave', 'dots'] as const
                              : ['ring', 'bar', 'dots'] as const
                            ).map(s => (
                              <button key={s} onClick={() => setVuMeterStyle(s as any)}
                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${vuMeterStyle === s ? 'bg-white/15 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                              >{s}</button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* ── BACKGROUND TAB ── */}
                {settingsTab === 'background' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block mb-2">Layout Theme</label>
                      <div className="grid grid-cols-3 gap-2">
                        {Object.values(themes).map(t => (
                          <button
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            className={`py-2.5 rounded-xl text-xs font-bold capitalize border-2 transition-all ${
                              theme === t.id
                                ? 'bg-red-600/20 border-red-500 text-red-300'
                                : 'bg-[#111] border-white/5 text-gray-400 hover:border-white/15 hover:text-gray-200'
                            }`}
                          >{t.name}</button>
                        ))}
                      </div>
                    </div>
                    {getThemeProperties(theme).length > 0 && (
                      <div className="bg-[#111] p-3 rounded-xl border border-white/5 space-y-3">
                        <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block">Theme Options</label>
                        {getThemeProperties(theme).map(prop => {
                          const currentValue = globalThemeConfig[theme]?.[prop.id] ?? prop.defaultValue;
                          return (
                            <div key={prop.id} className="space-y-1">
                              <div className="flex justify-between">
                                <span className="text-[11px] text-gray-500">{prop.label}</span>
                                {prop.type === 'number' && <span className="text-[10px] font-mono text-red-400">{currentValue}</span>}
                              </div>
                              {prop.type === 'color' && (
                                <div className="flex items-center gap-2">
                                  <input type="color" value={currentValue}
                                    onChange={(e) => setGlobalThemeConfig(prev => ({ ...prev, [theme]: { ...(prev[theme] || {}), [prop.id]: e.target.value } }))}
                                    className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
                                  />
                                  <span className="text-[10px] text-gray-400 font-mono">{currentValue}</span>
                                </div>
                              )}
                              {prop.type === 'boolean' && (
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" checked={currentValue === true}
                                    onChange={(e) => setGlobalThemeConfig(prev => ({ ...prev, [theme]: { ...(prev[theme] || {}), [prop.id]: e.target.checked } }))}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
                                </label>
                              )}
                              {prop.type === 'number' && (
                                <input type="range" min={prop.min} max={prop.max} step={prop.step || 1} value={currentValue}
                                  onChange={(e) => setGlobalThemeConfig(prev => ({ ...prev, [theme]: { ...(prev[theme] || {}), [prop.id]: parseFloat(e.target.value) } }))}
                                  className="w-full accent-red-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                                />
                              )}
                              {prop.type === 'select' && prop.options && (
                                <div className="flex gap-1.5 flex-wrap">
                                  {prop.options.map((opt: string) => (
                                    <button key={opt}
                                      onClick={() => setGlobalThemeConfig(prev => ({ ...prev, [theme]: { ...(prev[theme] || {}), [prop.id]: opt } }))}
                                      className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg border-2 capitalize transition-all ${currentValue === opt ? 'border-red-500 text-red-300 bg-red-500/10' : 'border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}
                                    >{opt}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block">Global Color</label>
                      <div className="flex items-center gap-2 bg-[#111] border border-white/5 rounded-xl p-2">
                        <input type="color" value={globalBackgroundColor || '#ffffff'}
                          onChange={(e) => setGlobalBackgroundColor(e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
                        />
                        <span className="text-xs text-gray-400 font-mono flex-1">{globalBackgroundColor || '#ffffff'}</span>
                        {globalBackgroundColor && <button onClick={() => setGlobalBackgroundColor(undefined)} className="text-[10px] text-gray-500 hover:text-white uppercase font-bold">Reset</button>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={handleGenerateVideoBackground}
                        disabled={isGeneratingBg}
                        className="w-full flex items-center justify-center gap-2 text-xs text-purple-300 hover:text-purple-200 bg-purple-500/10 px-3 py-2.5 rounded-xl border border-purple-500/20 hover:border-purple-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                      >
                        {isGeneratingBg ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : <><Wand2 size={13} /> Generate AI Background</>}
                      </button>
                      <div className="flex items-center gap-2">
                        <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 text-xs text-blue-400 hover:text-blue-300 bg-[#111] px-3 py-2.5 rounded-xl border border-white/5 hover:border-blue-500/30 transition-all">
                          <Upload size={13} />
                          {background || backgroundVideo ? 'Change BG Asset' : 'Upload BG (Image/Video)'}
                          <input type="file" accept="image/*,video/*" onChange={handleBackgroundUpload} className="hidden" />
                        </label>
                        {(background || backgroundVideo) && (
                          <button onClick={() => { setBackground(null); setBackgroundVideo(null); setBackgroundVideoUrl(null); }}
                            className="text-xs text-red-400 hover:text-red-300 px-2 py-2.5 font-bold uppercase">Clear</button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <label className="text-xs text-gray-500">Background Dim</label>
                        <span className="text-xs font-mono text-gray-400">{Math.round(backgroundDim * 100)}%</span>
                      </div>
                      <input type="range" min={0} max={1} step={0.05} value={backgroundDim}
                        onChange={(e) => setBackgroundDim(parseFloat(e.target.value))}
                        className="w-full accent-red-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div className="border-t border-white/5 pt-4 space-y-3">
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block">Segment {currentSegmentIndex + 1} Background</label>
                      <div className="flex items-center gap-2 bg-[#111] border border-white/5 rounded-xl p-2">
                        <input type="color" value={currentSegment.visualConfig?.backgroundColor || '#ffffff'}
                          onChange={(e) => {
                            const val = e.target.value;
                            setScript(prev => { const s = [...prev]; s[currentSegmentIndex] = { ...s[currentSegmentIndex], visualConfig: { ...s[currentSegmentIndex].visualConfig, backgroundColor: val, backgroundUrl: undefined } }; return s; });
                          }}
                          className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
                        />
                        <span className="text-xs text-gray-400 font-mono flex-1">{currentSegment.visualConfig?.backgroundColor || 'default'}</span>
                        {currentSegment.visualConfig?.backgroundColor && (
                          <button onClick={() => setScript(prev => { const s = [...prev]; s[currentSegmentIndex] = { ...s[currentSegmentIndex], visualConfig: { ...s[currentSegmentIndex].visualConfig, backgroundColor: undefined } }; return s; })}
                            className="text-[10px] text-gray-500 hover:text-white uppercase font-bold">Reset</button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 text-xs text-purple-400 bg-[#111] px-3 py-2.5 rounded-xl border border-white/5 hover:border-purple-500/30 transition-all">
                          <Upload size={13} />
                          {currentSegment.visualConfig?.backgroundUrl ? 'Change Image' : 'Upload Image'}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            if (e.target.files?.[0]) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const result = ev.target?.result as string;
                                setScript(prev => { const s = [...prev]; s[currentSegmentIndex] = { ...s[currentSegmentIndex], visualConfig: { ...s[currentSegmentIndex].visualConfig, backgroundUrl: result, backgroundColor: undefined } }; return s; });
                              };
                              reader.readAsDataURL(e.target.files[0]);
                            }
                          }} />
                        </label>
                        {currentSegment.visualConfig?.backgroundUrl && (
                          <button onClick={() => setScript(prev => { const s = [...prev]; s[currentSegmentIndex] = { ...s[currentSegmentIndex], visualConfig: { ...s[currentSegmentIndex].visualConfig, backgroundUrl: undefined } }; return s; })}
                            className="text-xs text-red-400 px-2 py-2.5 font-bold uppercase">Clear</button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SUBTITLE TAB ── */}
                {settingsTab === 'subtitle' && (
                  <div className="space-y-3">

                    {/* Master toggle */}
                    <label className="flex items-center justify-between cursor-pointer bg-[#111] border border-white/5 rounded-xl px-4 py-3">
                      <span className="text-sm font-semibold text-white">Show Subtitles</span>
                      <input type="checkbox" checked={showSubtitles} onChange={(e) => setShowSubtitles(e.target.checked)} className="accent-red-500 w-4 h-4" />
                    </label>

                    <div className={`space-y-3 transition-opacity ${showSubtitles ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>

                      {/* ─── 1. VISIBILITY ─── */}
                      <div className="bg-[#111] border border-white/5 rounded-xl p-3 space-y-2.5">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Visibility</p>
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="text-xs text-gray-300">Background Box</span>
                          <input type="checkbox" checked={subtitleBackground} onChange={(e) => setSubtitleBackground(e.target.checked)} className="accent-red-500" />
                        </label>
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="text-xs text-gray-300">Speaker Name Badge</span>
                          <input type="checkbox" checked={showNameBadge} onChange={(e) => setShowNameBadge(e.target.checked)} className="accent-red-500" />
                        </label>
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="text-xs text-gray-300">Sync Position (All Segments)</span>
                          <input type="checkbox" checked={syncSubtitlePosition} onChange={(e) => setSyncSubtitlePosition(e.target.checked)} className="accent-red-500" />
                        </label>
                      </div>

                      {/* ─── 1b. BADGE STYLE ─── */}
                      {showNameBadge && (
                        <div className="bg-[#111] border border-white/5 rounded-xl p-3 space-y-3">
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Badge Style</p>

                          {/* Style selector */}
                          <div className="grid grid-cols-4 gap-1.5">
                            {([
                              { key: 'classic', label: 'Classic', icon: '▬' },
                              { key: 'comic', label: 'Comic', icon: '💬' },
                              { key: 'pill', label: 'Pill', icon: '⬭' },
                              { key: 'minimal', label: 'Text', icon: 'T' },
                            ] as const).map(opt => (
                              <button key={opt.key}
                                onClick={() => setNameBadgeStyle(opt.key)}
                                className={`py-2 text-xs font-bold rounded-lg border-2 transition-all flex flex-col items-center gap-0.5 ${nameBadgeStyle === opt.key ? 'border-red-500 text-red-300 bg-red-500/10' : 'border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}
                              >
                                <span className="text-sm leading-none">{opt.icon}</span>
                                <span className="text-[9px]">{opt.label}</span>
                              </button>
                            ))}
                          </div>

                          {/* Badge Colors */}
                          <div className="space-y-2 pt-1 border-t border-white/5">
                            <p className="text-[10px] text-gray-500">Badge Colors</p>
                            <div className="flex gap-2 flex-wrap">
                              <div className="flex-1 min-w-[80px] flex items-center gap-2 bg-black/30 rounded-lg p-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: nameBadgeColorA }} />
                                <span className="text-[10px] text-gray-400 flex-1">{speakerLabels[0] || 'Speaker 1'}</span>
                                <input type="color" value={nameBadgeColorA}
                                  onChange={(e) => setNameBadgeColorA(e.target.value)}
                                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0"
                                />
                              </div>
                              <div className="flex-1 min-w-[80px] flex items-center gap-2 bg-black/30 rounded-lg p-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: nameBadgeColorB }} />
                                <span className="text-[10px] text-gray-400 flex-1">{speakerLabels[1] || 'Speaker 2'}</span>
                                <input type="color" value={nameBadgeColorB}
                                  onChange={(e) => setNameBadgeColorB(e.target.value)}
                                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0"
                                />
                              </div>
                              {activeSpeakers.length >= 3 && (
                                <div className="flex-1 min-w-[80px] flex items-center gap-2 bg-black/30 rounded-lg p-2">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: nameBadgeColorC }} />
                                  <span className="text-[10px] text-gray-400 flex-1">{speakerLabels[2] || 'Speaker 3'}</span>
                                  <input type="color" value={nameBadgeColorC}
                                    onChange={(e) => setNameBadgeColorC(e.target.value)}
                                    className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0"
                                  />
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => { setNameBadgeColorA('#3b82f6'); setNameBadgeColorB('#ef4444'); setNameBadgeColorC('#eab308'); }}
                              className="text-[10px] text-gray-600 hover:text-gray-300 font-semibold uppercase tracking-wide"
                            >Reset to defaults</button>
                          </div>
                        </div>
                      )}

                      {/* ─── 2. TEXT ─── */}
                      <div className="bg-[#111] border border-white/5 rounded-xl p-3 space-y-3">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Text</p>

                        {/* Font Size */}
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-400">Font Size</span>
                            <span className="text-xs font-mono text-red-400">{currentSubtitleConfig.fontSize.toFixed(1)}x</span>
                          </div>
                          <input type="range" min={0.5} max={2} step={0.1} value={currentSubtitleConfig.fontSize}
                            onChange={(e) => { const val = parseFloat(e.target.value); setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), fontSize: val } } }))); }}
                            className="w-full accent-red-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Subtitle Text Color */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">Subtitle Text Color</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-gray-500">{currentSubtitleConfig.textColor}</span>
                              <input type="color" value={currentSubtitleConfig.textColor}
                                onChange={(e) => { const val = e.target.value; setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), textColor: val } } }))); }}
                                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
                              />
                            </div>
                          </div>
                          {/* Quick color presets */}
                          <div className="flex gap-1.5 flex-wrap">
                            {[
                              { label: 'White', hex: '#ffffff' },
                              { label: 'Yellow', hex: '#facc15' },
                              { label: 'Cyan', hex: '#22d3ee' },
                              { label: 'Green', hex: '#4ade80' },
                              { label: 'Orange', hex: '#fb923c' },
                              { label: 'Pink', hex: '#f472b6' },
                              { label: 'Red', hex: '#ef4444' },
                              { label: 'Black', hex: '#000000' },
                            ].map(({ label, hex }) => (
                              <button
                                key={hex}
                                title={label}
                                onClick={() => setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), textColor: hex } } })))}
                                className={`w-6 h-6 rounded-lg border-2 transition-all shrink-0 ${currentSubtitleConfig.textColor === hex ? 'border-white scale-110' : 'border-white/10 hover:border-white/40'}`}
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Narrator Text Color */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Narrator Color</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setNarratorTextColor('#ef4444')} className="text-[10px] text-gray-500 hover:text-red-400 uppercase font-bold">Reset</button>
                            <span className="text-[10px] font-mono text-gray-500">{narratorTextColor}</span>
                            <input type="color" value={narratorTextColor}
                              onChange={(e) => setNarratorTextColor(e.target.value)}
                              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
                            />
                          </div>
                        </div>
                      </div>

                      {/* ─── 3. BOX BACKGROUND ─── */}
                      <div className={`bg-[#111] border border-white/5 rounded-xl p-3 space-y-3 transition-opacity ${subtitleBackground ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Box Background</p>

                        {/* Presets */}
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { label: 'Dark', value: 'rgba(0,0,0,0.85)' },
                            { label: 'Semi', value: 'rgba(0,0,0,0.50)' },
                            { label: 'Light', value: 'rgba(255,255,255,0.90)' },
                            { label: 'Blue', value: 'rgba(10,20,60,0.85)' },
                            { label: 'Red', value: 'rgba(80,10,10,0.85)' },
                            { label: 'Green', value: 'rgba(10,40,20,0.85)' },
                            { label: 'None', value: 'transparent' },
                          ].map(opt => (
                            <button key={opt.label}
                              onClick={() => setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), backgroundColor: opt.value } } })))}
                              className={`py-1.5 text-xs font-bold rounded-lg border-2 transition-all ${currentSubtitleConfig.backgroundColor === opt.value ? 'border-red-500 text-red-300 bg-red-500/10' : 'border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}
                            >{opt.label}</button>
                          ))}
                        </div>

                        {/* Custom Color + Opacity */}
                        <div className="flex items-center gap-3 pt-1 border-t border-white/5">
                          <input type="color" value={subtitleBgHex}
                            onChange={(e) => { setSubtitleBgHex(e.target.value); applySubtitleBg(e.target.value, subtitleBgOpacity); }}
                            className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border-0 p-0 shrink-0"
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-[10px] text-gray-500">Custom Opacity</span>
                              <span className="text-[10px] font-mono text-red-400">{subtitleBgOpacity}%</span>
                            </div>
                            <input type="range" min={0} max={100} step={5} value={subtitleBgOpacity}
                              onChange={(e) => { const v = parseInt(e.target.value); setSubtitleBgOpacity(v); applySubtitleBg(subtitleBgHex, v); }}
                              className="w-full accent-red-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      {/* ─── 4. BOX SHAPE & BORDER ─── */}
                      <div className={`bg-[#111] border border-white/5 rounded-xl p-3 space-y-3 transition-opacity ${subtitleBackground ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Box Shape & Border</p>

                        {/* Corner Shape presets */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] text-gray-500">Corner Radius</span>
                          <div className="flex gap-1.5">
                            {[
                              { label: 'Sharp', radius: 0 },
                              { label: 'Slight', radius: 6 },
                              { label: 'Round', radius: 20 },
                              { label: 'Pill', radius: 60 },
                            ].map(opt => (
                              <button key={opt.label}
                                onClick={() => setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), borderRadius: opt.radius } } })))}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${(currentSubtitleConfig.borderRadius ?? 20) === opt.radius ? 'border-red-500 text-red-300 bg-red-500/10' : 'border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}
                              >
                                <span className={`inline-block w-4 h-3 border border-current ${opt.radius === 0 ? '' : opt.radius <= 6 ? 'rounded-sm' : opt.radius <= 20 ? 'rounded' : 'rounded-full'}`} />
                                <span className="text-[9px]">{opt.label}</span>
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <input type="range" min={0} max={80} step={2}
                              value={currentSubtitleConfig.borderRadius ?? 20}
                              onChange={(e) => { const val = parseInt(e.target.value); setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), borderRadius: val } } }))); }}
                              className="flex-1 accent-red-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                            />
                            <span className="text-xs font-mono text-red-400 w-9 text-right">{currentSubtitleConfig.borderRadius ?? 20}px</span>
                          </div>
                        </div>

                        {/* Border Width */}
                        <div className="space-y-1.5 pt-2 border-t border-white/5">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-gray-500">Border Width</span>
                            <span className="text-xs font-mono text-red-400">{Math.round(currentSubtitleConfig.borderWidth ?? 0)}px</span>
                          </div>
                          <input type="range" min={0} max={8} step={1}
                            value={currentSubtitleConfig.borderWidth ?? 0}
                            onChange={(e) => { const val = parseInt(e.target.value); setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), borderWidth: val } } }))); }}
                            className="w-full accent-red-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                          />
                          {(currentSubtitleConfig.borderWidth ?? 0) > 0 && (
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[10px] text-gray-500">Border Color</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-gray-500">{currentSubtitleConfig.borderColor || '#ffffff'}</span>
                                <input type="color"
                                  value={currentSubtitleConfig.borderColor || '#ffffff'}
                                  onChange={(e) => { const val = e.target.value; setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), borderColor: val } } }))); }}
                                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ─── 5. LAYOUT & BEHAVIOR ─── */}
                      <div className="bg-[#111] border border-white/5 rounded-xl p-3 space-y-3">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Layout & Behavior</p>

                        {/* Vertical Position */}
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-400">Vertical Position</span>
                            <span className="text-xs font-mono text-gray-400">{Math.round(currentSubtitleConfig.y)}px</span>
                          </div>
                          <input type="range" min={0} max={720} step={10} value={currentSubtitleConfig.y}
                            onChange={(e) => { const val = parseInt(e.target.value); setScript(prev => prev.map((seg, i) => { if (syncSubtitlePosition || i === currentSegmentIndex) { return { ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), y: val } } }; } return seg; })); }}
                            className="w-full accent-red-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Display Mode */}
                        <div className="space-y-1">
                          <span className="text-xs text-gray-400 block">Display Mode</span>
                          <select value={currentSubtitleConfig.mode || 'phrase'}
                            onChange={(e) => { const val = e.target.value; setScript(prev => prev.map(seg => ({ ...seg, visualConfig: { ...seg.visualConfig, subtitleConfig: { ...(seg.visualConfig?.subtitleConfig || currentSubtitleConfig), mode: val as any } } }))); }}
                            className="w-full bg-[#0a0a0a] text-gray-200 text-xs rounded-lg px-3 py-2 border border-white/5 focus:border-red-500 outline-none appearance-none cursor-pointer"
                          >
                            <option value="phrase">Phrase — show whole phrase at once</option>
                            <option value="word">Word — one word at a time</option>
                            <option value="mix">Mix — words build up in phrase</option>
                            <option value="line">Line — one line at a time</option>
                            <option value="full-static">Full Static — all text always visible</option>
                          </select>
                          <p className="text-[10px] text-gray-600 mt-1">
                            {currentSubtitleConfig.mode === 'phrase' && 'Shows each phrase/sentence at once. Clean & readable.'}
                            {currentSubtitleConfig.mode === 'word' && 'One word at a time — very minimal, karaoke style.'}
                            {currentSubtitleConfig.mode === 'mix' && 'Words appear one-by-one within each phrase, then reset.'}
                            {currentSubtitleConfig.mode === 'line' && 'Shows one wrapped line at a time.'}
                            {currentSubtitleConfig.mode === 'full-static' && 'Always shows the full segment text — no animation.'}
                            {!currentSubtitleConfig.mode && 'Shows each phrase/sentence at once. Clean & readable.'}
                          </p>
                        </div>

                        {/* Question Mode */}
                        <label className="flex items-center justify-between cursor-pointer pt-1 border-t border-white/5">
                          <div>
                            <span className="text-xs text-gray-300 block">Question Mode</span>
                            <span className="text-[10px] text-gray-600">Show last Narrator text while others speak</span>
                          </div>
                          <input type="checkbox" checked={questionMode} onChange={(e) => setQuestionMode(e.target.checked)} className="accent-red-500 shrink-0" />
                        </label>
                      </div>

                    </div>
                  </div>
                )}

                {/* ── OPTIONS TAB ── */}
                {settingsTab === 'options' && (
                  <div className="space-y-4">
                    <div className="bg-[#111] border border-white/5 rounded-xl p-3 space-y-3">
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block">Visibility</label>
                      {[
                        { label: 'Show Timer', state: showTimer, set: setShowTimer },
                        { label: 'Show Scores', state: showScores, set: setShowScores },
                        { label: 'Show Side Stats', state: showSideStats, set: setShowSideStats },
                        { label: 'Show Name Labels', state: showNameLabels, set: setShowNameLabels },
                      ].map(({ label, state, set }) => (
                        <label key={label} className="flex items-center justify-between cursor-pointer">
                          <span className="text-xs text-gray-300">{label}</span>
                          <input type="checkbox" checked={state} onChange={(e) => set(e.target.checked)} className="accent-red-500" />
                        </label>
                      ))}
                      {theme === 'minimal' && (
                        <>
                          <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-xs text-gray-300">Show Speaker Name (Minimal)</span>
                            <input type="checkbox" checked={showMinimalSpeakerName} onChange={(e) => setShowMinimalSpeakerName(e.target.checked)} className="accent-red-500" />
                          </label>
                          <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-xs text-gray-300">Show Side VU Bar (Minimal)</span>
                            <input type="checkbox" checked={showMinimalSideVU} onChange={(e) => setShowMinimalSideVU(e.target.checked)} className="accent-red-500" />
                          </label>
                        </>
                      )}
                    </div>

                    {/* Score Generator */}
                    <div className="bg-[#111] border border-white/5 rounded-xl p-3 space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block">Score Generator</label>
                      <p className="text-[10px] text-gray-600 leading-relaxed">Sabke segments ke liye naye random scores generate karo (6.0 – 9.9 range)</p>
                      <button
                        onClick={handleRegenerateAllScores}
                        disabled={script.length === 0}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-bold bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/25 text-yellow-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <RefreshCw size={12} />
                        Generate All Scores ({script.length} segments)
                      </button>
                    </div>

                    <div className="bg-[#111] border border-white/5 rounded-xl p-3 space-y-3">
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block">Export</label>
                      <div className="space-y-2">
                        <label className="text-xs text-gray-400">Resolution</label>
                        <div className="flex gap-2">
                          {(['720p', '1080p'] as const).map(r => (
                            <button key={r} onClick={() => setExportResolution(r)}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${exportResolution === r ? 'bg-green-600/20 border-green-500/50 text-green-300' : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'}`}
                            >{r}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-gray-400">Quality</label>
                        <div className="flex gap-2">
                          {(['Low', 'Medium', 'High'] as const).map(q => (
                            <button key={q} onClick={() => setExportQuality(q)}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${exportQuality === q ? 'bg-green-600/20 border-green-500/50 text-green-300' : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'}`}
                            >{q}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block">Segment Theme Override</label>
                      <select value={currentSegment.visualConfig?.themeId || ''}
                        onChange={(e) => { const val = e.target.value; setScript(prev => { const s = [...prev]; s[currentSegmentIndex] = { ...s[currentSegmentIndex], visualConfig: { ...s[currentSegmentIndex].visualConfig, themeId: val || undefined } }; return s; }); }}
                        className="w-full bg-[#111] text-gray-200 text-xs rounded-xl px-3 py-2.5 border border-white/5 focus:border-red-500 outline-none appearance-none cursor-pointer"
                      >
                        <option value="">Use Global ({themes[theme]?.name})</option>
                        {Object.values(themes).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="bg-[#111] border border-white/5 rounded-xl p-3 space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block">AI Segment Images</label>
                      {isGeneratingImages && (
                        <div className="flex items-center gap-2 text-xs text-purple-400">
                          <Loader2 size={12} className="animate-spin" /> Generating... {imageGenProgress}%
                        </div>
                      )}
                      <button onClick={handleGenerateSegmentImages} disabled={isGeneratingImages}
                        className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 transition-all disabled:opacity-40"
                      >
                        <Wand2 size={13} /> Generate All Segment Images
                      </button>
                      <button
                        onClick={async () => {
                          if (!currentSegment.text) return;
                          try {
                            const url = await generateSegmentImage(currentSegment.text);
                            setScript(prev => { const s = [...prev]; s[currentSegmentIndex] = { ...s[currentSegmentIndex], visualConfig: { ...s[currentSegmentIndex].visualConfig, backgroundUrl: url } }; return s; });
                            setStatusMessage("Image generated!");
                            setTimeout(() => setStatusMessage(""), 3000);
                          } catch (e) { setStatusMessage("Generation failed"); }
                        }}
                        disabled={isGeneratingImages}
                        className="w-full py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 transition-all disabled:opacity-40"
                      >
                        <Wand2 size={12} /> Current Segment Only
                      </button>
                    </div>
                    <div className="bg-[#111] border border-white/5 rounded-xl p-3 space-y-3">
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1.5"><Merge size={11} /> Merge with YT Video</label>
                      {!youtubeData?.downloadedFilename && !youtubeData?.editedFilename ? (
                        <p className="text-xs text-gray-600 italic">YouTube Import step mein video download karein.</p>
                      ) : (
                        <>
                          <div className="text-xs text-gray-500 space-y-1">
                            <p>YT: <code className="text-orange-400">{youtubeData.editedFilename || youtubeData.downloadedFilename}</code></p>
                            <p>Rendered: <span className={renderedBlob ? 'text-green-400' : 'text-gray-600'}>{renderedBlob ? 'Ready' : 'Export first'}</span></p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600 uppercase tracking-wider">Flask Server URL</label>
                            <input type="text" value={mergeFlaskUrl} onChange={(e) => setMergeFlaskUrl(e.target.value)}
                              className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500/50"
                            />
                          </div>
                          <button onClick={handleMergeVideos} disabled={isMergingVideos || !renderedBlob}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                          >
                            {isMergingVideos ? <><Loader2 size={13} className="animate-spin" /> Merging...</> : <><Merge size={13} /> Merge Videos</>}
                          </button>
                          {mergeVideoError && <p className="text-xs text-red-400">{mergeVideoError}</p>}
                          {mergeVideoResult && (
                            <a href={mergeVideoResult.downloadUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 py-2 bg-green-600/20 border border-green-500/30 text-green-300 rounded-xl text-xs font-semibold"
                            >
                              <Download size={13} /> Download Merged Video
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                </div>{/* end tab content */}
              </>
            )}
          </div>{/* end Visual Settings panel */}

        </div>{/* end max-w-2xl inner col */}
      </div>{/* end scrollable content */}

      {/* Fixed bottom: Render button — above mobile nav on small screens */}
      <div className="fixed bottom-[60px] md:bottom-0 left-0 right-0 z-[60] p-3 bg-[#050505]/95 backdrop-blur border-t border-white/5 md:left-72">
        {isExporting && (
          <div className="mb-2 h-1.5 rounded-full overflow-hidden bg-gray-800">
            <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${exportProgress}%` }} />
          </div>
        )}
        <button
          onClick={handleExport}
          disabled={isExporting || isMerging}
          className="w-full py-4 bg-red-600/80 hover:bg-red-500 active:bg-red-700 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait shadow-lg shadow-red-900/20"
        >
          {isExporting ? (
            <><Loader2 className="animate-spin" size={20} /> Rendering... {Math.round(exportProgress)}%</>
          ) : isMerging ? (
            <><Loader2 className="animate-spin" size={20} /> Preparing audio...</>
          ) : (
            <><Video size={20} /> Render Podcast Video</>
          )}
        </button>
      </div>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        crossOrigin="anonymous"
        className="hidden"
      />
    </div>
  );
};

export default DebateVisualizer;
