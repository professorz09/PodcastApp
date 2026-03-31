import { Muxer, ArrayBufferTarget, FileSystemWritableFileStreamTarget } from 'mp4-muxer';

export interface RenderVideoOptions {
  canvas: HTMLCanvasElement;
  audioChannels: Float32Array[];
  sampleRate: number;
  duration: number;
  fps: number;
  bitrate?: number;
  width?: number;
  height?: number;
  backgroundVideoUrl?: string;
  renderCallback: (
    time: number,
    audioLevel: number,
    backgroundVideo: HTMLVideoElement | null,
    offCtx: OffscreenCanvasRenderingContext2D
  ) => Promise<void> | void;
  onProgress: (progress: number) => void;
}

export const renderVideoOffline = async (
  options: RenderVideoOptions,
  fileStream?: any
): Promise<Blob | void> => {
  const { canvas, audioChannels, sampleRate, duration, fps, renderCallback, onProgress, backgroundVideoUrl } = options;
  const width  = options.width  || canvas.width;
  const height = options.height || canvas.height;
  const bitrate = options.bitrate || 2_500_000;

  if (!audioChannels || audioChannels.length === 0) {
    throw new Error("No audio channels provided for rendering");
  }

  // ── Dedicated OffscreenCanvas ─────────────────────────────────────────────
  // All export drawing happens here — completely isolated from the visible
  // preview canvas.  No rAF interference, no canvas-size mismatch.
  const offCanvas = new OffscreenCanvas(width, height);
  const offCtx = offCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

  // ── Background Video ──────────────────────────────────────────────────────
  let backgroundVideo: HTMLVideoElement | null = null;
  if (backgroundVideoUrl) {
    backgroundVideo = document.createElement('video');
    backgroundVideo.src = backgroundVideoUrl;
    backgroundVideo.muted = true;
    backgroundVideo.crossOrigin = 'anonymous';
    backgroundVideo.playsInline = true;
    backgroundVideo.preload = 'auto';
    await new Promise((resolve) => {
      backgroundVideo!.onloadedmetadata = () => resolve(null);
      backgroundVideo!.onerror = () => {
        console.warn("Failed to load background video for export.");
        resolve(null);
      };
    });
  }

  // ── Muxer ─────────────────────────────────────────────────────────────────
  let muxer: Muxer<ArrayBufferTarget | FileSystemWritableFileStreamTarget>;
  if (fileStream) {
    muxer = new Muxer({
      target: new FileSystemWritableFileStreamTarget(fileStream),
      video: { codec: 'avc', width, height },
      audio: { codec: 'aac', sampleRate, numberOfChannels: audioChannels.length },
      fastStart: false
    });
  } else {
    muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width, height },
      audio: { codec: 'aac', sampleRate, numberOfChannels: audioChannels.length },
      fastStart: false
    });
  }

  // ── Video Encoder ─────────────────────────────────────────────────────────
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("Video Encoder Error", e)
  });
  videoEncoder.configure({
    codec: 'avc1.640028',
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: 'quality',
  });

  // ── Audio Encoder ─────────────────────────────────────────────────────────
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => console.error("Audio Encoder Error", e)
  });
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate,
    numberOfChannels: audioChannels.length,
    bitrate: 192_000
  });

  // ── Encode Audio ──────────────────────────────────────────────────────────
  const totalSamples = audioChannels[0].length;
  const chunkDuration = 0.1;
  const samplesPerChunk = Math.floor(sampleRate * chunkDuration);

  for (let i = 0; i < totalSamples; i += samplesPerChunk) {
    let waitCount = 0;
    while (audioEncoder.encodeQueueSize > 10 && waitCount < 100) {
      await new Promise(r => setTimeout(r, 5));
      waitCount++;
    }
    const end = Math.min(i + samplesPerChunk, totalSamples);
    const frameCount = end - i;
    const chunkData = new Float32Array(frameCount * audioChannels.length);
    for (let j = 0; j < frameCount; j++) {
      for (let ch = 0; ch < audioChannels.length; ch++) {
        chunkData[j * audioChannels.length + ch] = audioChannels[ch][i + j];
      }
    }
    const audioData = new AudioData({
      format: 'f32',
      sampleRate,
      numberOfFrames: frameCount,
      numberOfChannels: audioChannels.length,
      timestamp: Math.round(i / sampleRate * 1_000_000),
      data: chunkData
    });
    audioEncoder.encode(audioData);
    audioData.close();
  }
  await audioEncoder.flush();

  // ── Render & Encode Video ─────────────────────────────────────────────────
  const frameDuration = 1 / fps;
  const totalFrames  = Math.ceil(duration * fps);

  // Keyframe every 2 s (smoother playback, better compression)
  const keyFrameInterval = Math.round(fps * 2);

  // Exponential smoothing state — same as live preview
  let smoothedAudioLevel = 0;

  // How often to yield to the main thread (every N frames)
  // Yielding too often slows render; too rarely freezes the tab.
  const YIELD_EVERY = 15;

  for (let i = 0; i < totalFrames; i++) {

    // Flow control: don't flood the encoder queue
    let waitCount = 0;
    while (videoEncoder.encodeQueueSize > 8 && waitCount < 200) {
      await new Promise(r => setTimeout(r, 2));
      waitCount++;
    }

    const time = i * frameDuration;

    // ── Background video seek ────────────────────────────────────────────
    if (backgroundVideo && isFinite(backgroundVideo.duration) && backgroundVideo.duration > 0) {
      const vidTime = time % backgroundVideo.duration;
      const alreadyThere =
        Math.abs(backgroundVideo.currentTime - vidTime) < 0.08 &&
        backgroundVideo.readyState >= 2;

      if (!alreadyThere) {
        backgroundVideo.currentTime = vidTime;
        await new Promise<void>(resolve => {
          const onSeeked = () => {
            backgroundVideo!.removeEventListener('seeked', onSeeked);
            resolve();
          };
          backgroundVideo!.addEventListener('seeked', onSeeked);
          // Hard timeout so a slow seek never stalls the export
          setTimeout(() => {
            backgroundVideo!.removeEventListener('seeked', onSeeked);
            resolve();
          }, 120);
        });
      }
    }

    // ── Audio level (all channels averaged) ──────────────────────────────
    const startSample = Math.floor(time * sampleRate);
    const endSample   = Math.min(startSample + Math.floor(sampleRate * frameDuration), totalSamples);
    let sum = 0;
    let count = 0;
    if (startSample < totalSamples) {
      const numCh = audioChannels.length;
      for (let j = startSample; j < endSample; j++) {
        let chSum = 0;
        for (let ch = 0; ch < numCh; ch++) chSum += audioChannels[ch][j] * audioChannels[ch][j];
        sum += chSum / numCh;
        count++;
      }
    }
    const rms = count > 0 ? Math.sqrt(sum / count) : 0;
    const rawLevel = Math.min(1, Math.pow(rms * 6, 0.7));
    const alpha = rawLevel > smoothedAudioLevel ? 0.55 : 0.18;
    smoothedAudioLevel += (rawLevel - smoothedAudioLevel) * alpha;
    const audioLevel = smoothedAudioLevel;

    // ── Draw frame on OffscreenCanvas ────────────────────────────────────
    await renderCallback(time, audioLevel, backgroundVideo, offCtx);

    // ── Encode frame ─────────────────────────────────────────────────────
    const frame = new VideoFrame(offCanvas as any, {
      timestamp: Math.round(time * 1_000_000),
      duration:  Math.round(frameDuration * 1_000_000)
    });
    videoEncoder.encode(frame, { keyFrame: i % keyFrameInterval === 0 });
    frame.close();

    onProgress(i / totalFrames);

    // Yield to main thread only every N frames to keep tab responsive
    // without constantly interrupting the render loop
    if (i % YIELD_EVERY === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  await videoEncoder.flush();
  muxer.finalize();

  if (backgroundVideo) {
    backgroundVideo.src = "";
    backgroundVideo.remove();
  }

  if (fileStream) {
    return;
  }
  const { buffer } = (muxer.target as ArrayBufferTarget);
  return new Blob([buffer], { type: 'video/mp4' });
};
