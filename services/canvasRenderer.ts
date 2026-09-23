import { DebateSegment } from '../types';
import { getTheme, getDefaultThemeConfig } from './themes';
import { drawLearnEnglishOverlay } from './learnEnglishOverlay';
import { drawWhiteboardRoadmap, WhiteboardBoardConfig, drawWhiteboardSubtitles, drawSummaryCard } from './whiteboardRenderer';

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
  narratorBoard?: WhiteboardBoardConfig | null;
  roadmapSpeakerName?: string;
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
  speakerBackgrounds?: Map<string, HTMLImageElement | HTMLVideoElement>;
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
  const segStart = segmentOffsets[currentSegmentIndex] ?? 0;
  const segNext = segmentOffsets[currentSegmentIndex + 1] ?? (segStart + (rawSegment.duration || 4));
  const segDuration = Math.max(0.1, segNext - segStart);
  const localTime = Math.max(0, time - segStart);

  const isIntro = rawSegment.speaker === 'Intro' ||
                  rawSegment.speaker?.toLowerCase() === 'intro' ||
                  rawSegment.learnEnglish?.segmentType === 'intro' ||
                  (currentSegmentIndex === 0 && (rawSegment.speaker === 'Narrator' || rawSegment.speaker?.toLowerCase() === 'narrator')) ||
                  Boolean(rawSegment.learnEnglish?.introScenes?.length);

  let introMotion: {
    active: boolean;
    progress: number;
    sceneIndex: number;
    localTime: number;
  } | undefined = undefined;

  const introScenes = rawSegment.learnEnglish?.introScenes;
  if (introScenes?.length) {
      const activeIdx = introScenes.findIndex(s => localTime >= s.startOffset && localTime < s.endOffset);
      const sceneIndex = activeIdx >= 0 ? activeIdx : introScenes.length - 1;
      const scene = introScenes[sceneIndex];
      if (scene?.imageUrl && assets.segmentBackgrounds.has(scene.imageUrl)) {
          currentSegment = { ...rawSegment, visualConfig: { ...rawSegment.visualConfig, backgroundUrl: scene.imageUrl } };
      }
      const sStart = scene?.startOffset ?? 0;
      const sEnd = scene?.endOffset ?? segDuration;
      const sDur = Math.max(0.1, sEnd - sStart);
      const sceneLocalTime = Math.max(0, localTime - sStart);
      const sProg = Math.min(1, Math.max(0, sceneLocalTime / sDur));
      introMotion = {
        active: true,
        progress: sProg,
        sceneIndex,
        localTime: sceneLocalTime,
      };
  } else if (isIntro) {
      const sProg = Math.min(1, Math.max(0, localTime / segDuration));
      introMotion = {
        active: true,
        progress: sProg,
        sceneIndex: 0,
        localTime,
      };
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

  if (introMotion) {
      currentSegment = { ...currentSegment, introMotion };
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

  // Whiteboard question sheet (Phone Studio 2 style): ONLY active if explicitly configured & enabled!
  // If disabled (or narratorBoard is null/undefined), NEVER show whiteboard;
  // it cleanly falls back to standard narrator/speaker background and normal subtitles.
  const board = mergedConfig.narratorBoard;
  const isWhiteboardEnabled = Boolean(
    board &&
    board.enabled !== false &&
    board.questions &&
    board.questions.length > 0
  );

  const configuredSpeaker = (board?.speakerName || mergedConfig.roadmapSpeakerName || 'Narrator').trim().toLowerCase();
  const curSpeaker = (currentSegment.speaker || '').trim().toLowerCase();

  const isSpeakerMatch =
    configuredSpeaker === 'all' ||
    configuredSpeaker === 'any' ||
    curSpeaker === configuredSpeaker ||
    (configuredSpeaker === 'narrator' && (curSpeaker === 'narrator' || currentSegment.learnEnglish?.segmentType === 'narrator'));

  const isRoadmapSegment = isWhiteboardEnabled && (
    isSpeakerMatch ||
    (Boolean(currentSegment.boardPoint) && (configuredSpeaker === 'all' || configuredSpeaker === 'any' || isSpeakerMatch))
  );

  const hasBoardOverlay = Boolean(isWhiteboardEnabled && isRoadmapSegment);

  if (hasBoardOverlay) {
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

  // Whiteboard Question Sheet Roadmap (Phone Studio 2 style) for debate dilemmas
  if (hasBoardOverlay && board) {
    // Solid black background behind the whiteboard card as requested
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();

    let doneCount = 0;
    let activeIndex = -1;

    const currentPoint = currentSegment.boardPoint?.trim().toLowerCase();
    let matchIdx = -1;
    if (currentPoint) {
      matchIdx = board.questions.findIndex(q => 
        q.toLowerCase() === currentPoint ||
        q.toLowerCase().includes(currentPoint) ||
        currentPoint.includes(q.toLowerCase())
      );
    }

    if (matchIdx !== -1) {
      doneCount = matchIdx;
      activeIndex = matchIdx;
    } else {
      let nIdx = 0;
      for (let i = 0; i < effectiveScript.length; i++) {
        const s = effectiveScript[i];
        const sSpeaker = (s.speaker || '').trim().toLowerCase();
        const sMatch =
          configuredSpeaker === 'all' ||
          configuredSpeaker === 'any' ||
          sSpeaker === configuredSpeaker ||
          (configuredSpeaker === 'narrator' && (sSpeaker === 'narrator' || s.learnEnglish?.segmentType === 'narrator'));
        const isN = sMatch || (Boolean(s.boardPoint) && (configuredSpeaker === 'all' || configuredSpeaker === 'any' || sMatch));
        if (isN) {
          if (i === currentSegmentIndex) {
            matchIdx = nIdx;
          }
          nIdx++;
        }
      }
      if (matchIdx >= 0 && matchIdx < board.questions.length) {
        doneCount = matchIdx;
        activeIndex = matchIdx;
      } else {
        // Closing turn — all questions covered
        doneCount = board.questions.length;
        activeIndex = -1;
      }
    }

    const segStart = segmentOffsets[currentSegmentIndex] ?? 0;
    const segNext = segmentOffsets[currentSegmentIndex + 1] ?? (segStart + (currentSegment.duration || 4));
    const segDur = Math.max(0.1, segNext - segStart);
    const progress = Math.min(1, Math.max(0, (time - segStart) / segDur));

    // Determine if this is the closing/summary card turn (at the end of debate)
    const isEndClosingTurn = activeIndex === -1 && doneCount >= board.questions.length;
    const segTypeStr = String(currentSegment.learnEnglish?.segmentType || '');
    const isSummarySegment = isEndClosingTurn || 
      segTypeStr === 'summary' ||
      segTypeStr === 'conclusion' ||
      currentSegment.speaker?.toLowerCase() === 'summary' ||
      currentSegment.speaker?.toLowerCase() === 'conclusion' ||
      /summary|conclusion|takeaway|in conclusion|to sum up|final thoughts/i.test(currentSegment.text || '');

    if (isSummarySegment) {
      // End Summary Card: reveals points sequentially as spoken!
      const totalPoints = board.questions.length;
      let revealCount = 1;
      let activeRevealIdx = 0;

      const relTime = Math.max(0, time - segStart);
      const ptDuration = segDur / Math.max(1, totalPoints);
      const computedStep = Math.min(totalPoints, Math.floor(relTime / ptDuration) + 1);

      revealCount = Math.max(1, computedStep);
      activeRevealIdx = Math.min(totalPoints - 1, revealCount - 1);

      drawSummaryCard(
        ctx,
        ctx.canvas.width,
        ctx.canvas.height,
        progress,
        board,
        revealCount,
        activeRevealIdx
      );
    } else {
      drawWhiteboardRoadmap(
        ctx,
        ctx.canvas.width,
        ctx.canvas.height,
        currentSegment.text,
        progress,
        board,
        doneCount,
        activeIndex,
        { showSpokenSubtitle: false }
      );
    }

    // Draw white subtitles at the bottom
    if (config.showSubtitles !== false && currentSegment.text) {
      const relTime = Math.max(0, time - segStart);
      const whiteColor = '#ffffff';
      drawWhiteboardSubtitles(
        ctx,
        ctx.canvas.width,
        ctx.canvas.height,
        currentSegment,
        relTime,
        whiteColor
      );
    }
  }

  // Additive Learn English overlay (narrator teaching card / quiz panel) — no-ops
  // for scripts without learnEnglish tags, so this never affects other renders.
  const isQuizOverlay = currentSegment.learnEnglish?.segmentType === 'quiz' || Boolean(currentSegment.learnEnglish?.quiz);
  if (!hasBoardOverlay) {
    drawLearnEnglishOverlay(
      ctx, 
      effectiveScript, 
      segmentOffsets, 
      currentSegmentIndex, 
      time, 
      isQuizOverlay ? null : (assets.narratorImage ?? null)
    );
  }
};

// Helper: Auto-derive whiteboard question sheet from script if not explicitly provided
function deriveNarratorBoard(script: DebateSegment[]): WhiteboardBoardConfig | null {
  const introSeg = script.find(s => (s.speaker === 'Intro' || s.speaker?.toLowerCase() === 'intro' || s.learnEnglish?.segmentType === 'intro') && s.boardPoint);
  const title = introSeg?.boardPoint?.trim() || 'DEBATE ROADMAP';

  const questions: string[] = [];
  script.forEach(s => {
    const isNarrator = s.speaker === 'Narrator' || s.speaker?.toLowerCase() === 'narrator' || s.learnEnglish?.segmentType === 'narrator';
    if (isNarrator && s.boardPoint && s.boardPoint.trim()) {
      questions.push(s.boardPoint.trim());
    }
  });

  if (questions.length > 0) {
    return { title, questions };
  }
  return null;
}
