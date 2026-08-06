import React, { useState } from 'react';
import { Key, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);
    if (signInError) setError(signInError.message);
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#0f0f0f] border border-white/8 rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-purple-600 to-purple-400" />
        <form onSubmit={handleSubmit} className="p-6 pt-5">
          <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-center mb-4">
            <Key size={22} className="text-purple-400" />
          </div>
          <h1 className="text-white font-bold text-lg leading-snug mb-1">
            Debate<span className="text-purple-400">Forge</span>
          </h1>
          <p className="text-gray-500 text-sm mb-5">Sign in to your project</p>

          <div className="space-y-3">
            <input
              type="email"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="username"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/8 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              required
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/8 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              required
            />
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2.5 bg-red-500/5 border border-red-500/15 rounded-xl px-3.5 py-3">
              <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-300/80 text-xs leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-5 py-3 rounded-xl text-sm font-bold bg-purple-600/90 hover:bg-purple-600 disabled:opacity-50 text-white transition-all shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 size={14} className="animate-spin" />}
            {isLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
