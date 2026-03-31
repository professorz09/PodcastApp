export const transcribeAudioGoogleCloud = async (audioBlob: Blob, languageCode: string = 'en-US'): Promise<{ word: string; start: number; end: number }[]> => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass();

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const CHUNK_DURATION = 45; // 45 seconds chunks (safer margin below 60s limit)
    
    console.log(`Audio decoded: duration=${duration.toFixed(2)}s, sampleRate=${sampleRate}Hz`);

    if (isNaN(duration) || duration === Infinity) {
      throw new Error('Invalid audio duration detected');
    }
    
    let allTimings: { word: string; start: number; end: number }[] = [];

    if (duration > CHUNK_DURATION) {
      console.log(`Audio duration exceeds ${CHUNK_DURATION}s, splitting into chunks...`);
      const chunks = Math.ceil(duration / CHUNK_DURATION);
      
      for (let i = 0; i < chunks; i++) {
        const startTime = i * CHUNK_DURATION;
        const endTime = Math.min((i + 1) * CHUNK_DURATION, duration);
        
        console.log(`Transcribing chunk ${i + 1}/${chunks} (${startTime.toFixed(2)}-${endTime.toFixed(2)}s)...`);
        
        const chunkBuffer = extractChunk(audioBuffer, startTime, endTime, audioContext);
        const chunkBlob = await audioBufferToWav(chunkBuffer);
        
        const chunkTimings = await transcribeChunk(chunkBlob, sampleRate, languageCode);
        
        // Adjust timings
        chunkTimings.forEach(t => {
          allTimings.push({
            word: t.word,
            start: t.start + startTime,
            end: t.end + startTime
          });
        });
      }
    } else {
      allTimings = await transcribeChunk(audioBlob, sampleRate, languageCode);
    }
    
    return allTimings;

  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  } finally {
    // Always close AudioContext to free system resources, even on error
    if (audioContext.state !== 'closed') {
      await audioContext.close();
    }
  }
};

const transcribeChunk = async (audioBlob: Blob, sampleRate?: number, languageCode: string = 'en-US'): Promise<{ word: string; start: number; end: number }[]> => {
  const base64Audio = await blobToBase64(audioBlob);
  const audioContent = base64Audio.split(',')[1];
  const mimeType = audioBlob.type;

  const response = await fetch('/api/google/speech-to-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioContent, mimeType, sampleRate, languageCode })
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse transcription response:', text);
    throw new Error(`Invalid response from server: ${text.slice(0, 100)}`);
  }

  if (!response.ok) {
    throw new Error(data.error || 'Failed to transcribe with Google Cloud');
  }
  
  // Handle long-running operation (fallback if still returned, though unlikely with chunks)
  if (data.operationName) {
    console.log('Long running operation started (unexpected for chunk):', data.operationName);
    return await pollOperation(data.operationName);
  }

  const wordTimings: { word: string; start: number; end: number }[] = [];

  if (data.results) {
    processResults(data.results, wordTimings);
  }

  return wordTimings;
};

const extractChunk = (audioBuffer: AudioBuffer, startTime: number, endTime: number, context: AudioContext): AudioBuffer => {
  const startSample = Math.floor(startTime * audioBuffer.sampleRate);
  const endSample = Math.floor(endTime * audioBuffer.sampleRate);
  const frameCount = endSample - startSample;
  
  // Create a new buffer for the chunk
  const newBuffer = context.createBuffer(audioBuffer.numberOfChannels, frameCount, audioBuffer.sampleRate);
  
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    const channelData = audioBuffer.getChannelData(i);
    const newChannelData = newBuffer.getChannelData(i);
    // Copy the segment
    newChannelData.set(channelData.subarray(startSample, endSample));
  }
  return newBuffer;
};

const audioBufferToWav = async (buffer: AudioBuffer): Promise<Blob> => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this example)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  const dataLength = buffer.length;
  for (let j = 0; j < dataLength; j++) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][j])); // clamp
      sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true); // write 16-bit sample
      offset += 2;
    }
  }

  return new Blob([bufferArr], { type: 'audio/wav' });

  function setUint16(data: any) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: any) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};

const pollOperation = async (operationName: string): Promise<{ word: string; start: number; end: number }[]> => {
  const maxRetries = 60; // 2 minutes max (assuming 2s interval)
  let retries = 0;

  while (retries < maxRetries) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const response = await fetch(`/api/google/operations?name=${encodeURIComponent(operationName)}`);
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse operation status response:', text);
      throw new Error(`Invalid response from server: ${text.slice(0, 100)}`);
    }

    if (!response.ok) {
      throw new Error(data.error || 'Failed to check operation status');
    }
    
    if (data.error) {
      throw new Error(data.error.message || 'Operation failed');
    }

    if (data.done) {
      const wordTimings: { word: string; start: number; end: number }[] = [];
      if (data.response && data.response.results) {
        processResults(data.response.results, wordTimings);
      }
      return wordTimings;
    }
    
    retries++;
  }
  
  throw new Error('Transcription timed out');
};

const processResults = (results: any[], wordTimings: { word: string; start: number; end: number }[]) => {
  results.forEach((result: any) => {
    if (result.alternatives && result.alternatives[0] && result.alternatives[0].words) {
      result.alternatives[0].words.forEach((w: any) => {
        const startStr = w.startTime ? String(w.startTime) : '0s';
        const endStr = w.endTime ? String(w.endTime) : '0s';
        const start = parseFloat(startStr.replace('s', ''));
        const end = parseFloat(endStr.replace('s', ''));
        wordTimings.push({ word: w.word, start, end });
      });
    }
  });
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};
