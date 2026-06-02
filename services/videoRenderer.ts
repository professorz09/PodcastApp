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
    // CORS attribute MUST be set BEFORE src — otherwise the browser issues a
    // non-CORS request and Safari/iOS taints the canvas (export fails).
    backgroundVideo.crossOrigin = 'anonymous';
    backgroundVideo.muted = true;
    backgroundVideo.playsInline = true;
    backgroundVideo.preload = 'auto';
    backgroundVideo.src = backgroundVideoUrl;
    await new Promise((resolve) => {
      backgroundVideo!.onloadedmetadata = () => resolve(null);
      backgroundVideo!.onerror = () => {
        console.warn("Failed to load background video for export.");
        resolve(null);
      };
    });
  }

  // ── Pick a supported audio codec ──────────────────────────────────────────
  // Chrome Android also lacks an AAC encoder in WebCodecs — configure() succeeds
  // but the encoder enters closed state on first encode (cryptic "Cannot call
  // 'encode' on a closed codec"). Opus is always available on Chromium, and
  // mp4-muxer can put Opus inside MP4 fine.
  type AudioFamily = 'aac' | 'opus';
  const audioCandidates: { family: AudioFamily; codec: string }[] = [
    { family: 'aac',  codec: 'mp4a.40.2'  },
    { family: 'aac',  codec: 'mp4a.40.5'  },
    { family: 'aac',  codec: 'mp4a.40.29' },
    { family: 'opus', codec: 'opus'       },
  ];
  let pickedAudio: { family: AudioFamily; codec: string } | null = null;
  const audioErrors: string[] = [];
  for (const { family, codec } of audioCandidates) {
    const cfg = { codec, sampleRate, numberOfChannels: audioChannels.length, bitrate: 192_000 };
    try {
      const sup = await AudioEncoder.isConfigSupported(cfg);
      if (!sup?.supported) { audioErrors.push(`${codec}: isConfigSupported=false`); continue; }
      const probe = new AudioEncoder({ output: () => {}, error: () => {} });
      probe.configure(cfg);
      probe.close();
      pickedAudio = { family, codec };
      break;
    } catch (e: any) {
      audioErrors.push(`${codec}: ${e?.message ?? e}`);
    }
  }
  if (!pickedAudio) {
    console.error('All audio codec candidates failed:\n' + audioErrors.join('\n'));
    throw new Error('Is device pe koi audio codec (AAC/Opus) WebCodecs me supported nahi hai.');
  }
  console.log(`[videoRenderer] picked audio codec=${pickedAudio.codec} family=${pickedAudio.family}`);

  // ── Pick a supported video codec ──────────────────────────────────────────
  // Chrome Android often doesn't expose H.264 to WebCodecs (no hw encoder
  // available) but VP9 always works. Try AVC family first (best MP4
  // compatibility), then VP9. Test with isConfigSupported AND a real
  // configure() since isConfigSupported can lie on some builds.
  const pixels = width * height;
  let avcLevels: string[];
  if      (pixels >= 3840 * 2160) avcLevels = ['34', '33', '32'];
  else if (pixels >= 1920 * 1080) avcLevels = ['28', '29', '2A', '32'];
  else if (pixels >= 1280 *  720) avcLevels = ['1F', '20', '28'];
  else                            avcLevels = ['1E', '1F', '28'];
  const avcProfiles = ['6400', '4D40', '42E0', '4200'];

  let vp9Level: string;
  if      (pixels >= 3840 * 2160) vp9Level = '60';
  else if (pixels >= 1920 * 1080) vp9Level = '50';
  else if (pixels >= 1280 *  720) vp9Level = '40';
  else                            vp9Level = '30';
  const vp9Codecs = [`vp09.00.${vp9Level}.08`, `vp09.00.31.08`, `vp09.00.21.08`];

  type Family = 'avc' | 'vp9';
  const candidates: { family: Family; codec: string }[] = [
    ...avcProfiles.flatMap(p => avcLevels.map(l => ({ family: 'avc' as Family, codec: `avc1.${p}${l}` }))),
    ...vp9Codecs.map(c => ({ family: 'vp9' as Family, codec: c })),
  ];

  let picked: { family: Family; codec: string; latencyMode: 'quality' | 'realtime'; hwAccel: 'no-preference' | 'prefer-hardware' | 'prefer-software' } | null = null;
  const triedErrors: string[] = [];

  outer: for (const latencyMode of ['quality', 'realtime'] as const) {
    for (const hwAccel of ['no-preference', 'prefer-hardware', 'prefer-software'] as const) {
      for (const { family, codec } of candidates) {
        const cfg = { codec, width, height, bitrate, framerate: fps, latencyMode, hardwareAcceleration: hwAccel };
        try {
          const sup = await VideoEncoder.isConfigSupported(cfg);
          if (!sup?.supported) continue;
          // Actually attempt configure — isConfigSupported lies on Chrome Android sometimes.
          const probe = new VideoEncoder({ output: () => {}, error: () => {} });
          probe.configure(cfg);
          probe.close();
          picked = { family, codec, latencyMode, hwAccel };
          break outer;
        } catch (e: any) {
          triedErrors.push(`${codec} (${latencyMode}/${hwAccel}): ${e?.message ?? e}`);
        }
      }
    }
  }
  if (!picked) {
    console.error('All video codec candidates failed:\n' + triedErrors.join('\n'));
    throw new Error('Is device pe koi bhi video codec (H.264/VP9) WebCodecs me supported nahi hai. Chrome/Edge latest version try karo.');
  }
  console.log(`[videoRenderer] picked codec=${picked.codec} family=${picked.family} latency=${picked.latencyMode} hw=${picked.hwAccel}`);

  // ── Muxer (codec family must match the encoder we picked) ─────────────────
  const muxerVideoCfg = { codec: picked.family, width, height } as const;
  let muxer: Muxer<ArrayBufferTarget | FileSystemWritableFileStreamTarget>;
  if (fileStream) {
    muxer = new Muxer({
      target: new FileSystemWritableFileStreamTarget(fileStream),
      video: muxerVideoCfg,
      audio: { codec: pickedAudio.family, sampleRate, numberOfChannels: audioChannels.length },
      fastStart: false
    });
  } else {
    muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: muxerVideoCfg,
      audio: { codec: pickedAudio.family, sampleRate, numberOfChannels: audioChannels.length },
      fastStart: 'in-memory'
    });
  }

  // ── Video Encoder ─────────────────────────────────────────────────────────
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("Video Encoder Error", e)
  });
  videoEncoder.configure({
    codec: picked.codec,
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: picked.latencyMode,
    hardwareAcceleration: picked.hwAccel,
  });

  // ── Audio Encoder ─────────────────────────────────────────────────────────
  let audioFatal: Error | null = null;
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { audioFatal = e instanceof Error ? e : new Error(String(e)); console.error("Audio Encoder Error", e); }
  });
  audioEncoder.configure({
    codec: pickedAudio.codec,
    sampleRate,
    numberOfChannels: audioChannels.length,
    bitrate: 192_000
  });

  // ── Encode Audio ──────────────────────────────────────────────────────────
  const totalSamples = audioChannels[0].length;
  const chunkDuration = 0.1;
  const samplesPerChunk = Math.floor(sampleRate * chunkDuration);

  for (let i = 0; i < totalSamples; i += samplesPerChunk) {
    if (audioFatal) throw new Error(`Audio encoder failed (${pickedAudio.codec}): ${audioFatal.message}`);
    if (audioEncoder.state === 'closed') throw new Error(`Audio encoder closed unexpectedly (${pickedAudio.codec}) — codec not actually supported on this device.`);
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
  if (audioFatal) throw new Error(`Audio encoder failed (${pickedAudio.codec}): ${audioFatal.message}`);

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
          let timerId: ReturnType<typeof setTimeout> | null = null;
          const cleanup = () => {
            backgroundVideo!.removeEventListener('seeked', onSeeked);
            if (timerId !== null) { clearTimeout(timerId); timerId = null; }
          };
          const onSeeked = () => { cleanup(); resolve(); };
          backgroundVideo!.addEventListener('seeked', onSeeked);
          // Hard timeout so a slow seek never stalls the export
          timerId = setTimeout(() => { cleanup(); resolve(); }, 120);
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
