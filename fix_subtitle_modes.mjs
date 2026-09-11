import fs from 'fs';

function fixModes(filepath) {
  let code = fs.readFileSync(filepath, 'utf8');

  const oldCodeStart = `    if (showSubtitles && currentSegment.text) {
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
        const currentTime = globalTime - segmentStartTime;`;

  const oldCodeEnd = `            if (mode === 'full-static') {
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
            }
        }`;

  if (code.includes(oldCodeStart) && code.includes(oldCodeEnd)) {
    const startIndex = code.indexOf(oldCodeStart);
    const endIndex = code.indexOf(oldCodeEnd) + oldCodeEnd.length;
    
    const newCode = `    if (showSubtitles && currentSegment.text) {
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

        // Base wrapping for the entire text
        const words = text.split(' ');
        const lines: string[] = [];
        let line = '';
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

        if (mode === 'full-static') {
            visibleLines = lines;
        } else if (mode === 'phrase') {
            if (currentSegment.phraseTimings && currentSegment.phraseTimings.length > 0) {
                // Phrase timings exist, use them
                const activePhrase = currentSegment.phraseTimings.find(p => currentTime >= p.start && currentTime <= p.end + 0.5);
                const pastPhrases = currentSegment.phraseTimings.filter(p => p.start <= currentTime);
                let currentText = "";
                if (activePhrase) {
                    currentText = activePhrase.text;
                } else if (pastPhrases.length > 0) {
                    const lastPhrase = pastPhrases[pastPhrases.length - 1];
                    if (currentTime <= lastPhrase.end + 1.0) currentText = lastPhrase.text;
                }
                
                // Wrap the active phrase
                const pWords = currentText.split(' ');
                let pLine = '';
                for(let n = 0; n < pWords.length; n++) {
                    const testLine = pLine + pWords[n] + ' ';
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > maxWidth && n > 0) {
                        visibleLines.push(pLine.trim());
                        pLine = pWords[n] + ' ';
                    } else {
                        pLine = testLine;
                    }
                }
                if (pLine.trim()) visibleLines.push(pLine.trim());
            } else {
                // No timings, show entire segment text wrapped (like full-static)
                visibleLines = lines;
            }
        } else {
            // Line, Word, or Mix modes
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

            if (mode === 'word') {
                const currentWordIndex = Math.min(visibleWordCount, words.length - 1);
                visibleLines = [words[currentWordIndex] || ''];
            } else if (mode === 'mix') {
                let currentLineWords = lines[activeLineIndex].split(' ');
                let wordsInPreviousLines = 0;
                for (let i = 0; i < activeLineIndex; i++) wordsInPreviousLines += lines[i].split(' ').length;
                let visibleWordsInCurrentLine = Math.max(1, visibleWordCount - wordsInPreviousLines);
                visibleLines = [currentLineWords.slice(0, visibleWordsInCurrentLine).join(' ')];
            } else {
                // 'line' mode
                visibleLines = [lines[activeLineIndex] || ''];
            }
        }`;
        
    code = code.substring(0, startIndex) + newCode + code.substring(endIndex);
    fs.writeFileSync(filepath, code);
    console.log("Patched subtitle modes cleanly in " + filepath);
  } else {
    console.log("Old code boundaries not found in " + filepath);
  }
}

fixModes('components/EnglishVideoMaker.tsx');
fixModes('components/DebateVisualizer.tsx');
