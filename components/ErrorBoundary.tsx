import React from 'react';
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
class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  public state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearAndReload = async () => {
    try {
      await clearState();
    } catch (e) {
      console.error('Failed to clear saved state', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          background: '#0a0a0a', color: '#fff', padding: 24, textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Kuch gadbad ho gaya</h1>
          <p style={{ color: '#f87171', maxWidth: 480, fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-word' }}>
            {this.state.error.message}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={this.handleReload}
              style={{ padding: '10px 20px', borderRadius: 10, background: '#dc2626', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}
            >
              Reload
            </button>
            <button
              onClick={this.handleClearAndReload}
              style={{ padding: '10px 20px', borderRadius: 10, background: '#27272a', color: '#fff', fontWeight: 700, border: '1px solid #3f3f46', cursor: 'pointer' }}
            >
              Saved data clear karke Reload
            </button>
          </div>
          <p style={{ color: '#71717a', fontSize: 11, maxWidth: 420 }}>
            Agar reload se bhi yeh screen wapas aaye, to "Saved data clear karke Reload" try karo — koi corrupted saved project isko baar-baar crash kara sakta hai. Isse current script/audio delete ho jayega.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
