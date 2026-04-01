import React, { useState, useEffect } from 'react';
import {
  MessageCircle,
  ArrowUp,
  User,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Copy,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

type Tab = 'info' | 'comments';
type MaxComments = 50 | 100 | 500 | 'all';
type SortOrder = 'top' | 'best' | 'new' | 'controversial';

const RD_STORAGE_KEY = 'reddit_importer_v1';

function readSaved<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(RD_STORAGE_KEY);
    if (!raw) return fallback;
    const obj = JSON.parse(raw);
    return key in obj ? (obj[key] as T) : fallback;
  } catch { return fallback; }
}

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    if (text.trimStart().startsWith('<'))
      throw new Error('Server returned HTML. Make sure Flask Server workflow is running.');
    throw new Error(text.slice(0, 200) || 'Invalid server response');
  }
}

interface PostInfo {
  post_id: string;
  title: string;
  author: string;
  subreddit: string;
  subreddit_prefixed: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  selftext: string;
  url: string;
  permalink: string;
  flair: string;
}

interface Props {
  onAttachContext?: (content: string, fileName: string) => void;
  onAttachPost?: (content: string, fileName: string) => void;
  onSkip: () => void;
}

const ErrBox = ({ msg }: { msg: string }) => (
  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mt-1">
    <div className="flex items-start gap-2 text-red-400 text-xs">
      <AlertCircle size={13} className="mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  </div>
);

const Section = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-[#0f0f0f] border border-white/5 rounded-2xl p-4 space-y-3 ${className}`}>
    {children}
  </div>
);

const Pill = ({ label }: { label: string }) => (
  <span className="text-[10px] bg-white/8 text-gray-400 px-2 py-0.5 rounded-full">{label}</span>
);

const RedditImporter: React.FC<Props> = ({ onAttachContext, onAttachPost, onSkip }) => {
  const [url, setUrl] = useState(() => readSaved('url', ''));
  const [activeTab, setActiveTab] = useState<Tab>(() => readSaved<Tab>('activeTab', 'info'));

  // Info
  const [infoLoading, setInfoLoading] = useState(false);
  const [postInfo, setPostInfo] = useState<PostInfo | null>(() => readSaved('postInfo', null));
  const [infoError, setInfoError] = useState('');
  const [postAttached, setPostAttached] = useState(false);

  // Comments
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [comments, setComments] = useState<string[] | null>(() => readSaved('comments', null));
  const [commentsError, setCommentsError] = useState('');
  const [maxComments, setMaxComments] = useState<MaxComments>(() => readSaved<MaxComments>('maxComments', 100));
  const [includeReplies, setIncludeReplies] = useState(false);
  const [sort, setSort] = useState<SortOrder>('top');
  const [showAll, setShowAll] = useState(false);
  const [commentsAttached, setCommentsAttached] = useState(false);

  // Persist
  useEffect(() => {
    try {
      sessionStorage.setItem(RD_STORAGE_KEY, JSON.stringify({ url, activeTab, postInfo, comments, maxComments }));
    } catch {}
  }, [url, activeTab, postInfo, comments, maxComments]);

  const isValidUrl = /reddit\.com\/|redd\.it\//.test(url);

  const handleGetInfo = async () => {
    if (!url.trim()) return;
    setInfoLoading(true); setInfoError(''); setPostInfo(null); setPostAttached(false);
    try {
      const res = await fetch('/api/reddit/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to fetch post info');
      setPostInfo(data);
    } catch (e: any) {
      setInfoError(e.message || 'Something went wrong');
    } finally {
      setInfoLoading(false);
    }
  };

  const handleGetComments = async () => {
    if (!url.trim()) return;
    setCommentsLoading(true); setCommentsError(''); setComments(null); setCommentsAttached(false);
    try {
      const res = await fetch('/api/reddit/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, max_comments: maxComments, include_replies: includeReplies, sort }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to fetch comments');
      setComments(data.comments);
    } catch (e: any) {
      setCommentsError(e.message || 'Something went wrong');
    } finally {
      setCommentsLoading(false);
    }
  };

  const attachPost = () => {
    if (!postInfo) return;
    const parts = [
      `Reddit Post: ${postInfo.title}`,
      `Posted by u/${postInfo.author} in ${postInfo.subreddit_prefixed}`,
      postInfo.flair ? `Flair: ${postInfo.flair}` : '',
      `Score: ${postInfo.score.toLocaleString()} · ${Math.round(postInfo.upvote_ratio * 100)}% upvoted · ${postInfo.num_comments.toLocaleString()} comments`,
      '',
      postInfo.selftext || '[No text body — link post]',
    ].filter(Boolean).join('\n');
    onAttachPost?.(parts, `Reddit Post — ${postInfo.title.slice(0, 50)}`);
    setPostAttached(true);
  };

  const attachComments = () => {
    if (!comments || comments.length === 0) return;
    const content = comments.map((c, i) => `${i + 1}. ${c}`).join('\n\n');
    const label = `comments_reddit_${postInfo?.post_id || postInfo?.title?.slice(0, 30).replace(/\s+/g, '_') || 'post'}`;
    onAttachContext?.(content, label);
    setCommentsAttached(true);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'info', label: 'Post Info' },
    { id: 'comments', label: 'Comments' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg">
            <MessageCircle size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-white leading-tight">Reddit Import</h2>
            <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">
              Post · Comments · Replies
            </p>
          </div>
        </div>
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white border border-white/10 hover:border-white/20 px-3 py-2 rounded-xl transition-all"
        >
          Skip <ChevronRight size={13} />
        </button>
      </div>

      {/* URL Input */}
      <Section>
        <label className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">Reddit Post URL</label>
        <input
          type="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setPostInfo(null); setComments(null); }}
          onKeyDown={e => { if (e.key === 'Enter' && isValidUrl) handleGetInfo(); }}
          placeholder="https://www.reddit.com/r/india/comments/abc123/..."
          className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
        />
        {url && !isValidUrl && (
          <p className="text-[11px] text-yellow-500/80">
            Supported: reddit.com/r/.../comments/[id]/... · old.reddit.com · redd.it/[id]
          </p>
        )}
        <div className="text-[11px] text-gray-700">
          Uses Reddit's public JSON API — no login required for public posts.
        </div>
      </Section>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0f0f0f] border border-white/5 rounded-2xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Post Info ── */}
      {activeTab === 'info' && (
        <Section>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Fetch post details</span>
            <button
              onClick={handleGetInfo}
              disabled={!isValidUrl || infoLoading}
              className="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-xl transition-all active:scale-95"
            >
              {infoLoading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
              {infoLoading ? 'Fetching…' : 'Get Info'}
            </button>
          </div>

          {infoError && <ErrBox msg={infoError} />}

          {postInfo && (
            <div className="space-y-3 mt-1">
              {/* Subreddit + flair */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-orange-400">{postInfo.subreddit_prefixed}</span>
                {postInfo.flair && <Pill label={postInfo.flair} />}
              </div>

              {/* Title */}
              <p className="text-sm font-semibold text-white leading-snug">{postInfo.title}</p>

              {/* Author + stats */}
              <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
                <span className="flex items-center gap-1"><User size={11} /> u/{postInfo.author}</span>
                <span className="flex items-center gap-1"><ArrowUp size={11} /> {postInfo.score.toLocaleString()} ({Math.round(postInfo.upvote_ratio * 100)}%)</span>
                <span className="flex items-center gap-1"><MessageCircle size={11} /> {postInfo.num_comments.toLocaleString()} comments</span>
              </div>

              {/* Self text */}
              {postInfo.selftext && (
                <div className="bg-white/3 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-gray-300 leading-relaxed max-h-40 overflow-y-auto">
                  {postInfo.selftext.slice(0, 1000)}{postInfo.selftext.length > 1000 ? '…' : ''}
                </div>
              )}

              {/* Link */}
              <a
                href={postInfo.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
              >
                <ExternalLink size={10} /> Open on Reddit
              </a>

              {/* Attach button */}
              <button
                onClick={attachPost}
                className="w-full flex items-center justify-center gap-2 border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-xs font-medium px-4 py-2.5 rounded-xl transition-all"
              >
                {postAttached ? <CheckCircle size={13} /> : <FileText size={13} />}
                {postAttached ? 'Post Attached to Context!' : '→ Use Post as Debate Topic Context'}
              </button>

              {/* Go to comments */}
              <button
                onClick={() => setActiveTab('comments')}
                className="w-full text-center text-[11px] text-gray-600 hover:text-gray-400 py-1 transition-colors"
              >
                Fetch comments → Comments tab
              </button>
            </div>
          )}
        </Section>
      )}

      {/* ── Tab: Comments ── */}
      {activeTab === 'comments' && (
        <Section>
          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 shrink-0">Scrape comments</span>

            {/* Count */}
            <select
              value={String(maxComments)}
              onChange={e => {
                const v = e.target.value;
                setMaxComments(v === 'all' ? 'all' : Number(v) as MaxComments);
              }}
              className="bg-[#1a1a1a] border border-white/10 text-gray-400 text-[11px] rounded-lg px-2 py-1 focus:outline-none"
            >
              <option value="50">Top 50</option>
              <option value="100">Top 100</option>
              <option value="500">Top 500</option>
              <option value="all">All</option>
            </select>

            {/* Sort */}
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortOrder)}
              className="bg-[#1a1a1a] border border-white/10 text-gray-400 text-[11px] rounded-lg px-2 py-1 focus:outline-none"
            >
              <option value="top">Top</option>
              <option value="best">Best</option>
              <option value="new">New</option>
              <option value="controversial">Controversial</option>
            </select>

            {/* Replies toggle */}
            <button
              onClick={() => setIncludeReplies(p => !p)}
              className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border transition-all ${includeReplies ? 'border-orange-500/40 text-orange-400 bg-orange-500/10' : 'border-white/10 text-gray-500'}`}
            >
              {includeReplies ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
              Replies
            </button>

            <button
              onClick={handleGetComments}
              disabled={!isValidUrl || commentsLoading}
              className="ml-auto flex items-center gap-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-xl transition-all active:scale-95"
            >
              {commentsLoading ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
              {commentsLoading ? 'Scraping…' : 'Get Comments'}
            </button>
          </div>

          <p className="text-[11px] text-gray-700">
            Reddit's public API — works for all public posts without login. NSFW / quarantined posts may be blocked.
          </p>

          {commentsError && <ErrBox msg={commentsError} />}

          {comments && comments.length === 0 && (
            <div className="text-center py-6 text-gray-600 text-sm">No comments found on this post.</div>
          )}

          {comments && comments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>{comments.length} comments fetched</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadTextFile(comments.map((c, i) => `${i + 1}. ${c}`).join('\n\n'), `reddit_comments_${postInfo?.post_id || 'post'}.txt`)}
                    className="hover:text-gray-300 transition-colors"
                  >
                    Download .txt
                  </button>
                  <span>·</span>
                  <button onClick={attachComments} className="hover:text-gray-300 transition-colors">
                    {commentsAttached ? '✓ Attached' : 'Attach to Context'}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {(showAll ? comments : comments.slice(0, 12)).map((c, i) => (
                  <div key={i} className="bg-white/3 rounded-lg px-3 py-2 text-xs text-gray-300 leading-relaxed border border-white/5">
                    <span className="text-gray-600 mr-1.5 text-[10px]">{i + 1}.</span>{c}
                  </div>
                ))}
              </div>

              {comments.length > 12 && (
                <button
                  onClick={() => setShowAll(p => !p)}
                  className="w-full text-center text-[11px] text-gray-600 hover:text-gray-400 py-1 transition-colors"
                >
                  {showAll ? 'Show less' : `Show all ${comments.length} comments`}
                </button>
              )}

              <button
                onClick={attachComments}
                className="w-full flex items-center justify-center gap-2 border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-xs font-medium px-4 py-2.5 rounded-xl transition-all"
              >
                {commentsAttached ? <CheckCircle size={13} /> : <Copy size={13} />}
                {commentsAttached ? 'Comments Attached!' : '→ Send Comments to Lyrics & Script'}
              </button>
            </div>
          )}
        </Section>
      )}

      {/* Skip footer */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors"
        >
          Skip to Script Generator <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
};

export default RedditImporter;
