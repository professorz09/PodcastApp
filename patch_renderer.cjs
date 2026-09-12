const fs = require('fs');
let content = fs.readFileSync('./services/canvasRenderer.ts', 'utf8');

const logicOld = `  // Learn English "Generate Scenes" — a segment (usually the intro) can carry
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
  }`;

const logicNew = `  // Learn English "Generate Scenes" — a segment (usually the intro) can carry
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
  }`;

content = content.replace(logicOld, logicNew);

fs.writeFileSync('./services/canvasRenderer.ts', content);
