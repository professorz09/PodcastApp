import React, { useState, useEffect } from 'react';
import { Youtube, Instagram, MessageCircle } from 'lucide-react';
import YoutubeImporter from './YoutubeImporter';
import InstagramImporter from './InstagramImporter';
import RedditImporter from './RedditImporter';
import { YoutubeImportData } from '../types';

type Platform = 'youtube' | 'instagram' | 'reddit';

const PLATFORM_KEY = 'content_importer_platform';

interface Props {
  onImportDone: (data: YoutubeImportData) => void;
  onTranscriptFetched: (transcript: YoutubeImportData['transcript'], fullText: string, videoId: string) => void;
  onAttachContext: (content: string, fileName: string) => void;
  onAttachPost: (content: string, fileName: string) => void;
  onSkip: () => void;
}

const PLATFORMS: { id: Platform; label: string; icon: React.ElementType; gradient: string; ring: string }[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    icon: Youtube,
    gradient: 'from-red-600 to-red-700',
    ring: 'border-red-500/50 bg-red-500/10 text-red-400',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: Instagram,
    gradient: 'from-purple-600 to-pink-600',
    ring: 'border-pink-500/50 bg-pink-500/10 text-pink-400',
  },
  {
    id: 'reddit',
    label: 'Reddit',
    icon: MessageCircle,
    gradient: 'from-orange-600 to-red-600',
    ring: 'border-orange-500/50 bg-orange-500/10 text-orange-400',
  },
];

const ContentImporter: React.FC<Props> = ({
  onImportDone,
  onTranscriptFetched,
  onAttachContext,
  onAttachPost,
  onSkip,
}) => {
  const [platform, setPlatform] = useState<Platform>(() => {
    try { return (sessionStorage.getItem(PLATFORM_KEY) as Platform) || 'youtube'; } catch { return 'youtube'; }
  });

  useEffect(() => {
    try { sessionStorage.setItem(PLATFORM_KEY, platform); } catch {}
  }, [platform]);

  const active = PLATFORMS.find(p => p.id === platform)!;
  const Icon = active.icon;

  return (
    <div className="flex flex-col h-full">
      {/* ── Platform Switcher ─────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/5 bg-[#050505]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {/* Active platform icon badge */}
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${active.gradient} flex items-center justify-center shadow-md shrink-0`}>
            <Icon size={14} className="text-white" />
          </div>

          {/* Tab buttons */}
          <div className="flex gap-1 flex-1">
            {PLATFORMS.map(p => {
              const PIcon = p.icon;
              const isActive = platform === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all active:scale-95 ${
                    isActive
                      ? p.ring
                      : 'border-white/5 text-gray-600 hover:text-gray-400 hover:border-white/10 hover:bg-white/3'
                  }`}
                >
                  <PIcon size={12} />
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Skip button */}
          <button
            onClick={onSkip}
            className="shrink-0 text-[11px] text-gray-600 hover:text-gray-400 border border-white/5 hover:border-white/10 px-3 py-1.5 rounded-xl transition-all"
          >
            Skip →
          </button>
        </div>
      </div>

      {/* ── Active Importer ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {platform === 'youtube' && (
          <YoutubeImporter
            onImportDone={onImportDone}
            onTranscriptFetched={onTranscriptFetched}
            onAttachContext={onAttachContext}
            onSkip={onSkip}
          />
        )}
        {platform === 'instagram' && (
          <InstagramImporter
            onAttachContext={onAttachContext}
            onSkip={onSkip}
          />
        )}
        {platform === 'reddit' && (
          <RedditImporter
            onAttachContext={onAttachContext}
            onAttachPost={onAttachPost}
            onSkip={onSkip}
          />
        )}
      </div>
    </div>
  );
};

export default ContentImporter;
