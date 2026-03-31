// Utility to merge multiple audio URLs into a single WAV Blob
export const mergeAudioUrls = async (audioUrls: string[]): Promise<{ blob: Blob, durations: number[] }> => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContext();
  
  try {
    // 1. Fetch and Decode all buffers
    const audioBuffers: AudioBuffer[] = [];
    const durations: number[] = [];
    
    for (const url of audioUrls) {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        ctx.decodeAudioData(arrayBuffer, resolve, reject);
      });
      audioBuffers.push(audioBuffer);
      durations.push(audioBuffer.duration);
    }

    // 2. Calculate total length
    const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.length, 0);
    
    // 3. Create output buffer
    // Use the sample rate of the first buffer or default context rate
    const sampleRate = audioBuffers[0]?.sampleRate || ctx.sampleRate;
    const numberOfChannels = Math.max(...audioBuffers.map(b => b.numberOfChannels));
    
    const outputBuffer = ctx.createBuffer(
      numberOfChannels,
      totalLength,
      sampleRate
    );

    // 4. Copy data
    let offset = 0;
    for (const buf of audioBuffers) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        // If the buffer has fewer channels, duplicate the first channel or silence
        const inputData = buf.getChannelData(channel < buf.numberOfChannels ? channel : 0);
        const outputData = outputBuffer.getChannelData(channel);
        outputData.set(inputData, offset);
      }
      offset += buf.length;
    }

    // 5. Convert AudioBuffer to WAV Blob
    return {
        blob: bufferToWav(outputBuffer),
        durations
    };
  } finally {
    if (ctx.state !== 'closed') {
      await ctx.close();
    }
  }
};

// Simple WAV encoder
const bufferToWav = (buffer: AudioBuffer): Blob => {
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
  setUint16(16); // 16-bit (hardcoded in this encoder)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  let sampleIdx = 0;
  while (sampleIdx < buffer.length) {
    for (i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][sampleIdx])); // clamp
      sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true); // write 16-bit sample
      offset += 2;
    }
    sampleIdx++;
  }

  return new Blob([bufferArr], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};
