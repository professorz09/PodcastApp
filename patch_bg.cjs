const fs = require('fs');
let content = fs.readFileSync('./components/EnglishVideoMaker.tsx', 'utf8');

const bgLoadOld = `  // Load Segment Background
  useEffect(() => {
      const bgUrl = currentSegment?.visualConfig?.backgroundUrl;
      if (bgUrl) {`;

const bgLoadNew = `  // Load Segment Background
  useEffect(() => {
      let bgUrl = currentSegment?.visualConfig?.backgroundUrl;
      if (!bgUrl) {
          for (let i = currentSegmentIndex - 1; i >= 0; i--) {
              const prevScenes = script[i]?.learnEnglish?.introScenes;
              if (prevScenes && prevScenes.length > 0) {
                  const lastScene = prevScenes[prevScenes.length - 1];
                  if (lastScene?.imageUrl) {
                      bgUrl = lastScene.imageUrl;
                      break;
                  }
              }
              if (script[i]?.visualConfig?.backgroundUrl) {
                  bgUrl = script[i].visualConfig!.backgroundUrl;
                  break;
              }
          }
      }
      if (bgUrl) {`;

content = content.replace(bgLoadOld, bgLoadNew);

const bgAssetOld = `    const realTimeSegment = script[realTimeIndex];
    if (realTimeSegment && realTimeSegment.visualConfig?.backgroundUrl && currentSegmentBackground) {
        // Only use the loaded background if it matches the current segment (via index check or URL check)
        // Since currentSegmentBackground is loaded based on currentSegmentIndex, we check if indices match
        if (realTimeIndex === currentSegmentIndex) {
            assets.segmentBackgrounds.set(realTimeSegment.visualConfig.backgroundUrl, currentSegmentBackground);
        }
    }`;

const bgAssetNew = `    const realTimeSegment = script[realTimeIndex];
    let activeBgUrl = realTimeSegment?.visualConfig?.backgroundUrl;
    if (!activeBgUrl && realTimeSegment) {
        for (let i = realTimeIndex - 1; i >= 0; i--) {
            const prevScenes = script[i]?.learnEnglish?.introScenes;
            if (prevScenes && prevScenes.length > 0) {
                const lastScene = prevScenes[prevScenes.length - 1];
                if (lastScene?.imageUrl) {
                    activeBgUrl = lastScene.imageUrl;
                    break;
                }
            }
            if (script[i]?.visualConfig?.backgroundUrl) {
                activeBgUrl = script[i].visualConfig!.backgroundUrl;
                break;
            }
        }
    }
    if (activeBgUrl && currentSegmentBackground) {
        if (realTimeIndex === currentSegmentIndex) {
            assets.segmentBackgrounds.set(activeBgUrl, currentSegmentBackground);
        }
    }`;

content = content.replace(bgAssetOld, bgAssetNew);

fs.writeFileSync('./components/EnglishVideoMaker.tsx', content);
