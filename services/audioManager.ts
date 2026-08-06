// Coordinates every audio/video preview in the app so:
//   1. Starting one playback stops whatever else was already playing.
//   2. Playback pauses automatically when the tab/app is backgrounded
//      (switching apps, locking the screen, switching browser tabs) —
//      the browser doesn't do this for us, so without this the last
//      thing you were listening to just keeps going.
//
// Every component that plays audio/video should call registerActivePlayback()
// with a `stop` callback right when it starts playing, and clear it (pass
// `null`, or let a new registration replace it) when playback ends naturally.

let activeStop: (() => void) | null = null;

export function registerActivePlayback(stop: () => void): void {
  if (activeStop && activeStop !== stop) {
    try { activeStop(); } catch { /* already stopped */ }
  }
  activeStop = stop;
}

export function clearActivePlayback(stop: () => void): void {
  if (activeStop === stop) activeStop = null;
}

export function stopActivePlayback(): void {
  if (activeStop) {
    try { activeStop(); } catch { /* already stopped */ }
    activeStop = null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopActivePlayback();
  });
  // Mobile Safari/PWA: visibilitychange isn't always reliable when the app
  // is fully backgrounded rather than just tab-switched — pagehide covers that.
  window.addEventListener('pagehide', stopActivePlayback);
}
