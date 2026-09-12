import { DebateSegment } from '../types';
import { getTheme, getDefaultThemeConfig } from './themes';
import { drawLearnEnglishOverlay } from './learnEnglishOverlay';

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
  showNameBadge?: boolean;
  nameBadgeStyle?: 'classic' | 'comic' | 'pill' | 'minimal';
  nameBadgeColorA?: string;
  nameBadgeColorB?: string;
  nameBadgeColorC?: string;
  introSubtitleColor?: string;
}

export interface RenderAssets {
  background: HTMLImageElement | null;
  backgroundVideo: HTMLVideoElement | null;
  backgroundColor?: string;
  speakerImages: (HTMLImageElement | null)[];
  segmentBackgrounds: Map<string, HTMLImageElement>;
  /** Learn English only — Narrator's own avatar, shown in the teaching card. */
  narratorImage?: HTMLImageElement | null;
  /** Per-speaker full-frame background, keyed by exact speaker name — used
   *  when a segment has no explicit backgroundUrl override of its own. */
  speakerBackgrounds?: Map<string, HTMLImageElement>;
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
  const rawSegment = script[currentSegmentIndex];
  if (!rawSegment) return;

  // Learn English "Generate Scenes" — a segment (usually the intro) can carry
  // multiple cinematic scene-beats across its own duration instead of one
  // static image. Pick whichever beat covers the current moment within this
  // segment and use ITS image for this frame, via the same
  // visualConfig.backgroundUrl mechanism every theme already reads.
  let currentSegment = rawSegment;
  const introScenes = rawSegment.learnEnglish?.introScenes;
  if (introScenes?.length) {
      const segStart = segmentOffsets[currentSegmentIndex] ?? 0;
      const localTime = time - segStart;
      const scene = introScenes.find(s => localTime >= s.startOffset && localTime < s.endOffset) || introScenes[introScenes.length - 1];
      if (scene?.imageUrl && assets.segmentBackgrounds.has(scene.imageUrl)) {
          currentSegment = { ...rawSegment, visualConfig: { ...rawSegment.visualConfig, backgroundUrl: scene.imageUrl } };
      }
  } else if (!currentSegment.visualConfig?.backgroundUrl) {
      // If the current segment has no background, look backwards for the most recent intro scene's background.
      // This ensures different situations in a multi-situation script persist their respective backgrounds across dialogue.
      for (let i = currentSegmentIndex - 1; i >= 0; i--) {
          const prevScenes = script[i].learnEnglish?.introScenes;
          if (prevScenes && prevScenes.length > 0) {
              const lastScene = prevScenes[prevScenes.length - 1];
              if (lastScene?.imageUrl && assets.segmentBackgrounds.has(lastScene.imageUrl)) {
                  currentSegment = { ...rawSegment, visualConfig: { ...rawSegment.visualConfig, backgroundUrl: lastScene.imageUrl } };
              }
              break;
          } else if (script[i].visualConfig?.backgroundUrl) {
              if (assets.segmentBackgrounds.has(script[i].visualConfig!.backgroundUrl)) {
                  currentSegment = { ...rawSegment, visualConfig: { ...rawSegment.visualConfig, backgroundUrl: script[i].visualConfig!.backgroundUrl } };
              }
              break;
          }
      }
  }

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

  const isQuizSeg = currentSegment.learnEnglish?.segmentType === 'quiz' || currentSegment.speaker === 'Question' || Boolean(currentSegment.learnEnglish?.quiz);
  if (isQuizSeg && currentSegment.learnEnglish?.quiz?.hideSubtitles !== false) {
      mergedConfig.showSubtitles = false;
  }

  // Merge subtitle config if present in segment visual config
  if (currentSegment.visualConfig?.subtitleConfig) {
      themeConfig.subtitleConfig = {
          ...themeConfig.subtitleConfig,
          ...currentSegment.visualConfig.subtitleConfig
      };
  }

  // Themes independently re-read script[currentSegmentIndex] internally, so
  // swap the resolved (possibly scene-overridden) segment into the array at
  // that index rather than passing currentSegment separately.
  const effectiveScript = currentSegment === rawSegment
      ? script
      : script.map((s, i) => (i === currentSegmentIndex ? currentSegment : s));

  // Draw using the theme
  theme.draw({
      ctx,
      time,
      audioLevel,
      script: effectiveScript,
      segmentOffsets,
      currentSegmentIndex,
      totalDuration,
      scores,
      config: mergedConfig,
      assets,
      themeConfig
  });

  // Additive Learn English overlay (narrator teaching card / quiz panel) — no-ops
  // for scripts without learnEnglish tags, so this never affects other renders.
  const isQuizOverlay = currentSegment.learnEnglish?.segmentType === 'quiz' || Boolean(currentSegment.learnEnglish?.quiz);
  drawLearnEnglishOverlay(
    ctx, 
    effectiveScript, 
    segmentOffsets, 
    currentSegmentIndex, 
    time, 
    isQuizOverlay ? null : (assets.narratorImage ?? null)
  );
};
