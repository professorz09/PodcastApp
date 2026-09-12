const fs = require('fs');
let content = fs.readFileSync('./components/AudioGenerator.tsx', 'utf8');

// Replace syncTranscript fetch
content = content.replace(
`    try {
      const response = await fetch(seg.audioUrl);
      if (!response.ok) throw new Error(\`Failed to fetch audio: \${response.status} \${response.statusText}\`);
      const blob = await response.blob();

      let wordTimings: { word: string; start: number; end: number }[];
      let usedFallback = false;
      try {
        wordTimings = await transcribeAudioGoogleCloud(blob, transcriptLanguage);
      } catch (cloudErr: any) {
        console.warn('Cloud STT unavailable, using offline proportional timing:', cloudErr);
        usedFallback = true;
        const duration = seg.duration ?? await getAudioDurationFromBlob(blob);
        wordTimings = generateProportionalWordTimings(seg.text, duration);
        const reason = cloudErr?.message ? cloudErr.message.slice(0, 120) : 'Google Cloud STT unavailable';
        toast.warning(\`Offline mode: approximate timings used. Reason: \${reason}\`);
      }`,
`    try {
      let wordTimings: { word: string; start: number; end: number }[];
      let usedFallback = false;
      try {
        const response = await fetch(seg.audioUrl);
        if (!response.ok) throw new Error(\`Failed to fetch audio: \${response.status} \${response.statusText}\`);
        const blob = await response.blob();
        wordTimings = await transcribeAudioGoogleCloud(blob, transcriptLanguage);
      } catch (cloudErr: any) {
        console.warn('Cloud STT or fetch unavailable, using offline proportional timing:', cloudErr);
        usedFallback = true;
        const duration = seg.duration && seg.duration > 0 ? seg.duration : Math.max(1, seg.text.split(' ').length / 2.5);
        wordTimings = generateProportionalWordTimings(seg.text, duration);
        const reason = cloudErr?.message ? cloudErr.message.slice(0, 120) : 'Google Cloud STT unavailable';
        toast.warning(\`Offline mode: approximate timings used. Reason: \${reason}\`);
      }`
);

// Replace syncAll fetch
content = content.replace(
`        while (attempt < 3 && !success) {
          try {
            const response = await fetch(seg.audioUrl!);
            if (!response.ok) throw new Error(\`Fetch failed: \${response.status}\`);
            const blob = await response.blob();

            let wordTimings: { word: string; start: number; end: number }[];
            let usedFallback = false;
            try {
              wordTimings = await transcribeAudioGoogleCloud(blob, transcriptLanguage);
            } catch (cloudErr: any) {
              console.warn(\`Segment \${i}: Cloud STT unavailable, using offline fallback\`, cloudErr);
              fallbackCount++;
              usedFallback = true;
              const duration = seg.duration ?? await getAudioDurationFromBlob(blob);
              wordTimings = generateProportionalWordTimings(seg.text, duration);
            }`,
`        while (attempt < 3 && !success) {
          try {
            let wordTimings: { word: string; start: number; end: number }[];
            let usedFallback = false;
            try {
              const response = await fetch(seg.audioUrl!);
              if (!response.ok) throw new Error(\`Fetch failed: \${response.status}\`);
              const blob = await response.blob();
              wordTimings = await transcribeAudioGoogleCloud(blob, transcriptLanguage);
            } catch (cloudErr: any) {
              console.warn(\`Segment \${i}: Cloud STT or fetch unavailable, using offline fallback\`, cloudErr);
              fallbackCount++;
              usedFallback = true;
              const duration = seg.duration && seg.duration > 0 ? seg.duration : Math.max(1, seg.text.split(' ').length / 2.5);
              wordTimings = generateProportionalWordTimings(seg.text, duration);
            }`
);

fs.writeFileSync('./components/AudioGenerator.tsx', content);
