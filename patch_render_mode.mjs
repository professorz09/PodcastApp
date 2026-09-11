import fs from 'fs';

function patchRenderMode(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  // Find the start of subtitle logic
  const oldLogic = `    if (showSubtitles && currentSegment.text) {
        const subtitleConfig = currentSegment.visualConfig?.subtitleConfig || {
            x: 192, y: 550, w: 896, h: 150, fontSize: 1.4, backgroundColor: 'rgba(0,0,0,0.85)', textColor: '#ffffff', borderColor: '#ffffff', borderWidth: 0, borderRadius: 20
        };

        const text = currentSegment.text;
        const fontSize = 32 * subtitleConfig.fontSize;
        ctx.font = \`bold \${fontSize}px sans-serif\`;
        ctx.textAlign = 'center';
        
        const maxWidth = subtitleConfig.w - (60 * subtitleConfig.fontSize);
        
        let visibleLines: string[] = [];
        const globalTime = audioRef.current ? audioRef.current.currentTime : 0;
        const segmentStartTime = segmentOffsets[currentSegmentIndex] || 0;
        const currentTime = globalTime - segmentStartTime;

        if (currentSegment.phraseTimings && currentSegment.phraseTimings.length > 0) {`;

  const newLogic = `    if (showSubtitles && currentSegment.text) {
        const isIntro = currentSegmentIndex === 0 && (!currentSegment.speaker || ['narrator', 'intro', 'i', 'scene', 'context', 'setting', 'background'].includes(currentSegment.speaker.toLowerCase().trim()));
        const subtitleConfig = currentSegment.visualConfig?.subtitleConfig || {
            x: 192, y: 550, w: 896, h: 150, fontSize: 1.4, backgroundColor: 'rgba(0,0,0,0.85)', textColor: '#ffffff', borderColor: '#ffffff', borderWidth: 0, borderRadius: 20
        };
        
        // Force mode to 'line' if it's the Intro segment
        const mode = isIntro ? 'line' : (subtitleConfig.mode || 'phrase');

        const text = currentSegment.text;
        const fontSize = 32 * subtitleConfig.fontSize;
        ctx.font = \`bold \${fontSize}px sans-serif\`;
        ctx.textAlign = 'center';
        
        const maxWidth = subtitleConfig.w - (60 * subtitleConfig.fontSize);
        
        let visibleLines: string[] = [];
        const globalTime = audioRef.current ? audioRef.current.currentTime : 0;
        const segmentStartTime = segmentOffsets[currentSegmentIndex] || 0;
        const currentTime = globalTime - segmentStartTime;

        if (mode === 'phrase' && currentSegment.phraseTimings && currentSegment.phraseTimings.length > 0) {`;

  if (code.includes(oldLogic)) {
    code = code.replace(oldLogic, newLogic);
    
    // Also patch the fallback logic to properly handle all UI modes
    const oldFallback = `            const mode = subtitleConfig.mode || 'full-word';
            if (mode === 'full-static') {
                visibleLines = lines;
            } else if (mode === 'line-static' || mode === 'line-word' || mode === 'full-word') {
                visibleLines = [lines[activeLineIndex] || ''];
            }`;
            
    const newFallback = `            if (mode === 'full-static') {
                visibleLines = lines;
            } else if (mode === 'word') {
                // Karaoke style: just the current word
                const currentWordIndex = Math.min(visibleWordCount, words.length - 1);
                visibleLines = [words[currentWordIndex] || ''];
            } else if (mode === 'mix') {
                // Show words up to the current word within the current line
                let currentLineWords = lines[activeLineIndex].split(' ');
                let wordsInPreviousLines = 0;
                for (let i = 0; i < activeLineIndex; i++) wordsInPreviousLines += lines[i].split(' ').length;
                let visibleWordsInCurrentLine = Math.max(1, visibleWordCount - wordsInPreviousLines);
                visibleLines = [currentLineWords.slice(0, visibleWordsInCurrentLine).join(' ')];
            } else {
                // 'line' mode or default fallback
                visibleLines = [lines[activeLineIndex] || ''];
            }`;
            
    code = code.replace(oldFallback, newFallback);
    
    fs.writeFileSync(filepath, code);
    console.log("Patched render mode logic in " + filepath);
  } else {
    console.log("Old logic not found in " + filepath);
  }
}

patchRenderMode('components/EnglishVideoMaker.tsx');
patchRenderMode('components/DebateVisualizer.tsx');
