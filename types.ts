export interface TranscriptSegment {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface ImageFile {
  file: File;
  previewUrl: string;
  cleanName: string; // "in this video"
  originalName: string; // "1_in_this_video.jpg"
  sequence: number; // Extracted from "1_" or default
}

export interface VideoScene {
  id: string;
  image: ImageFile;
  segment: TranscriptSegment;
  duration: number;
}

export enum AppState {
  IMPORT = 'IMPORT',                   // Step 0  - Unified importer (YT / IG / Reddit, skippable)
  LYRICS = 'LYRICS',                   // Step 0b - Lyrics / Song Studio (skippable)
  // Legacy states kept for backward-compat with persisted storage
  YOUTUBE_IMPORT = 'YOUTUBE_IMPORT',
  INSTAGRAM_IMPORT = 'INSTAGRAM_IMPORT',
  REDDIT_IMPORT = 'REDDIT_IMPORT',
  INPUT = 'INPUT',
  SCRIPT = 'SCRIPT',
  AUDIO = 'AUDIO',
  THUMBNAIL = 'THUMBNAIL',
  VISUALIZER = 'VISUALIZER',
  STORYBOARD = 'STORYBOARD',
  // Deprecated but kept for compatibility if needed during migration
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  EDITOR = 'EDITOR',
}

// Data imported from YouTube via Flask server
export interface YoutubeImportData {
  url: string;
  videoId: string;
  transcript: {
    text: string;
    start: number;
    end: number;
    duration: number;
  }[];
  fullText: string;
  downloadedFilename?: string;       // filename in Flask server's downloads/
  editedFilename?: string;           // after video edit
  cuts?: { start: number; end: number }[];
  zoom?: number;
  blackBars?: 'none' | 'top_bottom' | 'sides' | 'both';
  flaskUrl?: string;                 // user-configured Flask server URL
  contextFileContent?: string;       // transcript sent as context
  contextFileName?: string;          // label shown in DebateInput
  commentsFileContent?: string;      // comments file sent as separate context
  commentsFileName?: string;         // label for comments file
  videoTitle?: string;               // YouTube video title
  videoDescription?: string;         // YouTube video description (first 600 chars)
}

export type DebateSpeaker = string;

export interface DebateSegment {
  id: string;
  speaker: DebateSpeaker;
  text: string;
  audioUrl?: string;
  duration?: number; // seconds
  wordTimings?: { word: string; start: number; end: number }[];
  phraseTimings?: { text: string; start: number; end: number }[];
  scores?: {
    model: string;
    score: number;
  }[];
  averageScore?: number;
  sourceTimestamp?: string; // For context_bridge style: timestamp in source video where this context is relevant
  visualConfig?: {
    backgroundUrl?: string;
    backgroundColor?: string;
    themeId?: string;
    themeConfig?: any;
    overrides?: {
      showSpeakers?: boolean;
      showTimer?: boolean;
      showScores?: boolean;
      showVuMeter?: boolean;
      showSideStats?: boolean;
      backgroundDim?: number;
      speakerScale?: number;
    };
    subtitleConfig?: {
      x: number;
      y: number;
      w: number;
      h: number;
      fontSize: number;
      backgroundColor: string;
      textColor: string;
      mode?: 'full-static' | 'full-word' | 'line-static' | 'line-word';
      borderWidth?: number;
      borderColor?: string;
      borderRadius?: number;
    };
  };
}

export interface ThumbnailState {
  extraInstructions?: string;
  titles: string[];
  selectedTitle: string;
  thumbnailTexts: string[];
  selectedThumbnailText: string;
  comboPairs?: { title: string; thumbnailText: string; description?: string }[];
  hostName: string;
  guestName: string;
  thumbnailUrl: string | null;
  referenceImage: { data: string, mimeType: string, url: string } | null;
  videoStyle?: 'situational' | 'debate' | 'podcast';
  scriptSignature?: string;
}

export interface StoryboardScene {
  id: string;
  sceneNumber: number;
  prompt: string;
  startTime: number;   // seconds into full audio
  endTime: number;     // seconds into full audio
  segmentIndices: number[];
  imageUrl?: string;   // base64 data URL once generated
  isGenerating?: boolean;
  error?: string;
}

export interface DebateConfig {
  topic: string;
  duration: number;
  includeNarrator: boolean;
  customScript?: string;
  contextFileContent?: string;
  commentsFileContent?: string;
  model: 'gemini-3-flash-preview' | 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite-preview';
  language: string;
  style: 'debate' | 'debate2' | 'conversational' | 'formal debate' | 'explained' | 'explained_solo' | 'image' | 'podcast_breakdown' | 'podcast_panel' | 'context_bridge' | 'situational' | 'documentary' | 'joe_rogan' | 'finance_deep_dive' | 'professor_jiang' | 'book_summary';
  speakerCount: number;
  speakerNames?: string[]; // Optional, if user provides them. Otherwise auto-detected.
  specificDetails?: string;
  youtubeUrl?: string;
}
