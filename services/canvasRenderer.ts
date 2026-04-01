import { DebateSegment } from '../types';
import { getTheme, getDefaultThemeConfig } from './themes';

export interface VisualConfig {
  theme: string;
  showSubtitles: boolean;
  subtitleBackground: boolean;
  speakerIds: string[];
  speakerLabels: string[];
  speakerScale: number;
  showTimer: boolean;
  showSideStats: boolean;
  showVuMeter: boolean;
  vuMeterStyle: 'ring' | 'bar' | 'glow' | 'wave' | 'dots';
  showSpeakers: boolean;
  showSpeakerImages: boolean[];
  showScores: boolean;
  backgroundDim: number;
  speakerPositions: { x: number; y: number }[];
  globalThemeConfig?: any;
  showSettings?: boolean;
  questionMode?: boolean;
  narratorTextColor?: string;
  showMinimalSpeakerName?: boolean;
  showMinimalSideVU?: boolean;
  showNameLabels?: boolean;
}

export interface RenderAssets {
  background: HTMLImageElement | null;
  backgroundVideo: HTMLVideoElement | null;
  backgroundColor?: string;
  speakerImages: (HTMLImageElement | null)[];
  segmentBackgrounds: Map<string, HTMLImageElement>;
}

export const drawDebateFrame = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  time: number,
  audioLevel: number,
  script: DebateSegment[],
  segmentOffsets: number[],
  currentSegmentIndex: number,
  totalDuration: number,
  scores: { scoreA: string; scoreB: string }, // This might need to be an array too
  config: VisualConfig,
  assets: RenderAssets
) => {
  const currentSegment = script[currentSegmentIndex];
  if (!currentSegment) return;

  // Determine Theme
  const themeId = currentSegment.visualConfig?.themeId || config.theme;
  const theme = getTheme(themeId);
  
  // Determine Theme Config (Merge global defaults with segment overrides)
  const defaultConfig = getDefaultThemeConfig(themeId);
  const globalOverrides = config.globalThemeConfig?.[themeId] || {};
  const segmentOverrides = currentSegment.visualConfig?.themeConfig || {};
  
  const themeConfig = {
      ...defaultConfig,
      ...globalOverrides,
      ...segmentOverrides
  };

  // Merge segment-level visual overrides into the main config
  const mergedConfig = {
      ...config,
      ...(currentSegment.visualConfig?.overrides || {})
  };

  // Merge subtitle config if present in segment visual config
  if (currentSegment.visualConfig?.subtitleConfig) {
      themeConfig.subtitleConfig = {
          ...themeConfig.subtitleConfig,
          ...currentSegment.visualConfig.subtitleConfig
      };
  }

  // Draw using the theme
  theme.draw({
      ctx,
      time,
      audioLevel,
      script,
      segmentOffsets,
      currentSegmentIndex,
      totalDuration,
      scores,
      config: mergedConfig,
      assets,
      themeConfig
  });
};
