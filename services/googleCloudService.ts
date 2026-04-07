// ── Offline fallback: decode audio duration purely in the browser ──────────
export const getAudioDurationFromBlob = async (blob: Blob): Promise<number> => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buf.duration;
  } finally {
    if (ctx.state !== 'closed') await ctx.close();
  }
};

// ── Offline fallback: proportional word timings from text + duration ────────
// No server or API key needed — just divides audio time evenly across words.
export const generateProportionalWordTimings = (
  text: string,
  duration: number,
): { word: string; start: number; end: number }[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || duration <= 0) return [];
  const timePerWord = duration / words.length;
  return words.map((word, i) => ({
    word,
    start: parseFloat((i * timePerWord).toFixed(3)),
    end: parseFloat(((i + 1) * timePerWord).toFixed(3)),
  }));
};

export const transcribeAudioGoogleCloud = async (
  audioBlob: Blob,
  languageCode: string = 'en-US'
): Promise<{ word: string; start: number; end: number }[]> => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass();

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const duration = audioBuffer.duration;
    console.log(`Audio decoded: duration=${duration.toFixed(2)}s, sampleRate=${audioBuffer.sampleRate}Hz`);

    if (isNaN(duration) || duration === Infinity) {
      throw new Error('Invalid audio duration detected');
    }

    // ── Resample to 16kHz mono ──────────────────────────────────────────────
    // Google STT recommends 16kHz mono.  At 16kHz/mono, a 45 s WAV chunk is
    // only ~1.4 MB raw → ~1.9 MB base64, well under the 10 MB inline limit.
    const TARGET_RATE = 16000;
    const resampled = await resampleMono(audioBuffer, TARGET_RATE);
    console.log(`Resampled to ${TARGET_RATE}Hz mono: duration=${resampled.duration.toFixed(2)}s`);

    // ── Chunk into 55 s pieces (safe margin under 60 s sync limit) ──────────
    const CHUNK_DURATION = 55;
    let allTimings: { word: string; start: number; end: number }[] = [];

    if (resampled.duration > CHUNK_DURATION) {
      const chunks = Math.ceil(resampled.duration / CHUNK_DURATION);
      console.log(`Splitting into ${chunks} chunks of ≤${CHUNK_DURATION}s`);

      for (let i = 0; i < chunks; i++) {
        const startTime = i * CHUNK_DURATION;
        const endTime = Math.min((i + 1) * CHUNK_DURATION, resampled.duration);
        console.log(`Chunk ${i + 1}/${chunks}: ${startTime.toFixed(1)}-${endTime.toFixed(1)}s`);

        const chunkBuffer = extractChunk(resampled, startTime, endTime);
        const chunkBlob = audioBufferToWav(chunkBuffer);

        const chunkTimings = await transcribeChunk(chunkBlob, TARGET_RATE, languageCode);
        chunkTimings.forEach(t => {
          allTimings.push({ word: t.word, start: t.start + startTime, end: t.end + startTime });
        });
      }
    } else {
      const blob = audioBufferToWav(resampled);
      allTimings = await transcribeChunk(blob, TARGET_RATE, languageCode);
    }

    return allTimings;
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  } finally {
    if (audioContext.state !== 'closed') {
      await audioContext.close();
    }
  }
};

// ── Resample to target sample rate + mix down to mono ──────────────────────
const resampleMono = async (buffer: AudioBuffer, targetRate: number): Promise<AudioBuffer> => {
  const duration = buffer.duration;
  const outputLength = Math.ceil(duration * targetRate);

  const offlineCtx = new OfflineAudioContext(1, outputLength, targetRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  return offlineCtx.startRendering();
};

// ── Extract a sub-segment from an AudioBuffer ──────────────────────────────
const extractChunk = (
  audioBuffer: AudioBuffer,
  startTime: number,
  endTime: number
): AudioBuffer => {
  const sr = audioBuffer.sampleRate;
  const startSample = Math.floor(startTime * sr);
  const endSample = Math.min(Math.floor(endTime * sr), audioBuffer.length);
  const frameCount = endSample - startSample;

  // Use OfflineAudioContext to create a standalone buffer (avoids closed ctx issues)
  const tmp = new OfflineAudioContext(1, frameCount, sr);
  const newBuffer = tmp.createBuffer(1, frameCount, sr);
  const src = audioBuffer.getChannelData(0);
  newBuffer.getChannelData(0).set(src.subarray(startSample, endSample));
  return newBuffer;
};

// ── Encode an AudioBuffer (mono assumed) to a PCM WAV Blob ────────────────
const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  let pos = 0;

  const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
  const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };

  // RIFF header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"

  // fmt chunk
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1);           // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * numOfChan * 2);
  setUint16(numOfChan * 2);
  setUint16(16);

  // data chunk
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  const channels: Float32Array[] = [];
  for (let i = 0; i < numOfChan; i++) channels.push(buffer.getChannelData(i));

  let offset = 0;
  for (let j = 0; j < buffer.length; j++) {
    for (let i = 0; i < numOfChan; i++) {
      const sample = Math.max(-1, Math.min(1, channels[i][j]));
      const int = (sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(44 + offset, int, true);
      offset += 2;
    }
  }

  return new Blob([bufferArr], { type: 'audio/wav' });
};

// ── Send a WAV blob to the Flask/Node STT endpoint ────────────────────────
const transcribeChunk = async (
  audioBlob: Blob,
  sampleRate: number,
  languageCode: string
): Promise<{ word: string; start: number; end: number }[]> => {
  const base64Audio = await blobToBase64(audioBlob);
  const audioContent = base64Audio.split(',')[1];

  const response = await fetch('/api/google/speech-to-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioContent, mimeType: 'audio/wav', sampleRate, languageCode }),
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('Failed to parse STT response:', text);
    throw new Error(`Invalid response from server: ${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(data.error || 'Failed to transcribe with Google Cloud');
  }

  // Long-running operation (shouldn't happen with ≤55 s chunks, but handle anyway)
  if (data.operationName) {
    console.log('Long-running operation returned (unexpected):', data.operationName);
    return await pollOperation(data.operationName);
  }

  const wordTimings: { word: string; start: number; end: number }[] = [];
  if (data.results) processResults(data.results, wordTimings);
  return wordTimings;
};

// ── Poll a long-running STT operation ─────────────────────────────────────
const pollOperation = async (
  operationName: string
): Promise<{ word: string; start: number; end: number }[]> => {
  const maxRetries = 90; // 3 minutes (2 s interval)
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const response = await fetch(
      `/api/google/operations?name=${encodeURIComponent(operationName)}`
    );
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch {
      throw new Error(`Invalid operation status response: ${text.slice(0, 120)}`);
    }
    if (!response.ok) throw new Error(data.error || 'Failed to check operation status');
    if (data.error) throw new Error(data.error.message || 'Operation failed');

    if (data.done) {
      const wordTimings: { word: string; start: number; end: number }[] = [];
      if (data.response?.results) processResults(data.response.results, wordTimings);
      return wordTimings;
    }
  }
  throw new Error('Transcription timed out after 3 minutes');
};

// ── Parse STT result objects into flat word timing array ──────────────────
const processResults = (
  results: any[],
  wordTimings: { word: string; start: number; end: number }[]
) => {
  results.forEach((result: any) => {
    const words = result.alternatives?.[0]?.words;
    if (!words) return;
    words.forEach((w: any) => {
      const start = parseFloat(String(w.startTime ?? '0s').replace('s', ''));
      const end   = parseFloat(String(w.endTime   ?? '0s').replace('s', ''));
      wordTimings.push({ word: w.word, start, end });
    });
  });
};

// ── Util: FileReader blob → base64 data URL ───────────────────────────────
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
