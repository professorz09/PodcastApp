import React, { Component } from 'react';
import { clearState } from '../services/storageService';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// Without this, an uncaught render error anywhere in the tree leaves the
// user staring at a completely blank page with no indication anything went
// wrong — impossible to diagnose remotely. This catches it, shows what
// actually broke, and offers a way to recover if corrupted saved state
// (IndexedDB) is what's causing the crash on every reload.
class ErrorBoundary extends Component<Props, State> {
  public state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  handleReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) await caches.delete(k);
      }
    } catch {
      // ignore
    }
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ error: null });
  };

  handleClearAndReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) await caches.delete(k);
      }
      await clearState();
    } catch (e) {
      console.error('Failed to clear saved state', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      const isDynamicImportError =
        this.state.error.message?.includes('dynamically imported module') ||
        this.state.error.message?.includes('Failed to fetch') ||
        this.state.error.message?.includes('Loading chunk');

      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          background: '#0a0a0a', color: '#fff', padding: 24, textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {isDynamicImportError ? 'Component load hone me waqt laga' : 'Kuch gadbad ho gaya'}
          </h1>
          <p style={{ color: '#f87171', maxWidth: 480, fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-word' }}>
            {this.state.error.message}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleRetry}
              style={{ padding: '10px 20px', borderRadius: 10, background: '#7c3aed', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}
            >
              Dobara Try Karo (Retry)
            </button>
            <button
              onClick={this.handleReload}
              style={{ padding: '10px 20px', borderRadius: 10, background: '#dc2626', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}
            >
              Reload Page
            </button>
            <button
              onClick={this.handleClearAndReload}
              style={{ padding: '10px 20px', borderRadius: 10, background: '#27272a', color: '#fff', fontWeight: 700, border: '1px solid #3f3f46', cursor: 'pointer' }}
            >
              Saved data clear karke Reload
            </button>
          </div>
          <p style={{ color: '#71717a', fontSize: 11, maxWidth: 420 }}>
            {isDynamicImportError
              ? 'Server update ya network glitch ki wajah se module fetch nahi ho paya. "Dobara Try Karo" ya "Reload Page" dabayein.'
              : 'Agar reload se bhi yeh screen wapas aaye, to "Saved data clear karke Reload" try karo — koi corrupted saved project isko baar-baar crash kara sakta hai.'}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
