import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Instagram,
  Download,
  MessageSquare,
  Info,
  Loader2,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  X,
  Copy,
  FileText,
  Upload,
} from 'lucide-react';

type Tab = 'info' | 'comments' | 'download';

const IG_STORAGE_KEY = 'ig_importer_v1';
function readSaved<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(IG_STORAGE_KEY);
    if (!raw) return fallback;
    const obj = JSON.parse(raw);
    return key in obj ? (obj[key] as T) : fallback;
  } catch { return fallback; }
}

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (text.trimStart().startsWith('<')) {
      throw new Error('Server returned HTML instead of JSON. Try restarting the Flask Server workflow.');
    }
    throw new Error(text.slice(0, 200) || 'Invalid response from server');
  }
}

interface PostInfo {
  shortcode: string;
  title: string;
  uploader: string;
  thumbnail: string;
  duration: string;
  like_count: string;
  view_count: string;
  description: string;
}

interface Props {
  onAttachContext?: (content: string, fileName: string) => void;
  onSkip: () => void;
}

const ErrBox = ({ msg, code }: { msg: string; code?: string }) => {
  const tips: Record<string, string> = {
    LOGIN_REQUIRED: 'Upload an Instagram cookies.txt file (exported from your browser) to access private or login-required content.',
    MISSING_DEPENDENCY: 'On Flask server run: pip install instaloader',
    SCRAPE_ERROR: 'Make sure the post is public and try again.',
  };
  const tip = code ? tips[code] : null;
  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mt-2 space-y-2">
      <div className="flex items-start gap-2 text-red-400 text-xs">
        <AlertCircle size={13} className="mt-0.5 shrink-0" />
        <span>{msg}</span>
      </div>
      {tip && <div className="text-[11px] text-yellow-400/80 pl-5">💡 {tip}</div>}
    </div>
  );
};

const Section = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-[#0f0f0f] border border-white/5 rounded-2xl p-4 space-y-3 ${className}`}>
    {children}
  </div>
);

const InstagramImporter: React.FC<Props> = ({ onAttachContext, onSkip }) => {
  const [url, setUrl] = useState(() => readSaved('url', ''));
  const [activeTab, setActiveTab] = useState<Tab>(() => readSaved<Tab>('activeTab', 'info'));

  // Info
  const [infoLoading, setInfoLoading] = useState(false);
  const [postInfo, setPostInfo] = useState<PostInfo | null>(() => readSaved('postInfo', null));
  const [infoError, setInfoError] = useState('');
  const [infoErrorCode, setInfoErrorCode] = useState('');

  // Comments
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [comments, setComments] = useState<string[] | null>(() => readSaved('comments', null));
  const [commentsError, setCommentsError] = useState('');
  const [commentsErrorCode, setCommentsErrorCode] = useState('');
  const [maxComments, setMaxComments] = useState<50 | 100 | 500>(() => readSaved<50 | 100 | 500>('maxComments', 100));
  const [showAllComments, setShowAllComments] = useState(false);
  const [attachedLabel, setAttachedLabel] = useState<string | null>(null);

  // Download
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadedFilename, setDownloadedFilename] = useState(() => readSaved('downloadedFilename', ''));
  const [downloadError, setDownloadError] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [downloadEta, setDownloadEta] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cookies
  const [hasCookies, setHasCookies] = useState<boolean | null>(null);
  const [cookiesUploading, setCookiesUploading] = useState(false);
  const cookiesInputRef = useRef<HTMLInputElement>(null);

  // Persist state
  useEffect(() => {
    try {
      sessionStorage.setItem(IG_STORAGE_KEY, JSON.stringify({
        url, activeTab, postInfo, comments, maxComments, downloadedFilename,
      }));
    } catch { }
  }, [url, activeTab, postInfo, comments, maxComments, downloadedFilename]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Check cookies on mount
  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(d => setHasCookies(!!d.cookies)).catch(() => setHasCookies(false));
  }, []);

  const handleGetInfo = async () => {
    if (!url.trim()) return;
    setInfoLoading(true);
    setInfoError('');
    setInfoErrorCode('');
    setPostInfo(null);
    try {
      const res = await fetch('/api/instagram/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setInfoErrorCode(data.error_code || '');
        throw new Error(data.error || 'Failed to fetch post info');
      }
      setPostInfo(data);
    } catch (e: any) {
      if (e.message?.includes('fetch') || e.message?.includes('connect')) {
        setInfoError('Could not connect to Flask server. Make sure the "Flask Server" workflow is running.');
      } else {
        setInfoError(e.message || 'Something went wrong');
      }
    } finally {
      setInfoLoading(false);
    }
  };

  const handleGetComments = async () => {
    if (!url.trim()) return;
    setCommentsLoading(true);
    setCommentsError('');
    setCommentsErrorCode('');
    setComments(null);
    try {
      const res = await fetch('/api/instagram/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, max_comments: maxComments }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setCommentsErrorCode(data.error_code || '');
        throw new Error(data.error || 'Failed to fetch comments');
      }
      setComments(data.comments);
    } catch (e: any) {
      if (e.message?.includes('fetch') || e.message?.includes('connect')) {
        setCommentsError('Could not connect to Flask server. Make sure the "Flask Server" workflow is running.');
        setCommentsErrorCode('CONNECTION_ERROR');
      } else {
        setCommentsError(e.message || 'Something went wrong');
      }
    } finally {
      setCommentsLoading(false);
    }
  };

  const startPoll = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/instagram/download/status/${jobId}`);
        const data = await safeJson(res);
        if (data.status === 'downloading') {
          if (typeof data.progress === 'number') setDownloadProgress(data.progress);
          if (data.speed) setDownloadSpeed(data.speed);
          if (data.eta) setDownloadEta(data.eta);
        } else if (data.status === 'done') {
          clearInterval(pollRef.current!);
          setDownloadProgress(100);
          setDownloadLoading(false);
          setDownloadedFilename(data.filename);
        } else if (data.status === 'error') {
          clearInterval(pollRef.current!);
          setDownloadLoading(false);
          setDownloadError(data.error || 'Download failed');
        }
      } catch { }
    }, 1500);
  }, []);

  const handleDownload = async () => {
    if (!url.trim()) return;
    setDownloadLoading(true);
    setDownloadError('');
    setDownloadedFilename('');
    setDownloadProgress(0);
    setDownloadSpeed('');
    setDownloadEta('');
    try {
      const res = await fetch('/api/instagram/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Download start failed');
      if (data.status === 'done') {
        setDownloadLoading(false);
        setDownloadedFilename(data.filename);
      } else {
        startPoll(data.job_id);
      }
    } catch (e: any) {
      setDownloadLoading(false);
      setDownloadError(e.message || 'Download could not start.');
    }
  };

  const handleCookiesUpload = async (file: File) => {
    setCookiesUploading(true);
    try {
      const content = await file.text();
      const r = await fetch('/api/cookies/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const d = await safeJson(r);
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      setHasCookies(true);
    } catch (e: any) {
      alert('Failed to upload cookies: ' + (e.message || 'Unknown error'));
    } finally {
      setCookiesUploading(false);
    }
  };

  const attachComments = () => {
    if (!comments || comments.length === 0) return;
    const content = comments.map(c => `• ${c}`).join('\n\n');
    const label = `Instagram Comments (${postInfo?.uploader || 'post'})`;
    onAttachContext?.(content, label);
    setAttachedLabel(label);
  };

  const attachDescription = () => {
    if (!postInfo?.description) return;
    const content = `Instagram Post by @${postInfo.uploader}\n\n${postInfo.description}`;
    const label = `Instagram Caption (@${postInfo.uploader})`;
    onAttachContext?.(content, label);
    setAttachedLabel(label);
  };

  const downloadComments = () => {
    if (!comments || comments.length === 0) return;
    const content = comments.map(c => `• ${c}`).join('\n\n');
    downloadTextFile(content, `ig_comments_${postInfo?.shortcode || 'post'}.txt`);
  };

  const tabs: { id: Tab; label: string; icon: React.FC<{ size?: number }> }[] = [
    { id: 'info', label: 'Post Info', icon: Info },
    { id: 'comments', label: 'Comments', icon: MessageSquare },
    { id: 'download', label: 'Download', icon: Download },
  ];

  const isValidUrl = url.includes('instagram.com') && (
    url.includes('/p/') || url.includes('/reel/') || url.includes('/reels/') || url.includes('/tv/')
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center shadow-lg">
            <Instagram size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-white leading-tight">Instagram Import</h2>
            <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">
              Video · Comments · Caption
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
        <label className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">Instagram URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && isValidUrl) handleGetInfo(); }}
            placeholder="https://www.instagram.com/reel/..."
            className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500/50 transition-colors"
          />
          {url && (
            <button onClick={() => { setUrl(''); setPostInfo(null); setComments(null); setDownloadedFilename(''); }}
              className="p-2.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-all">
              <X size={16} />
            </button>
          )}
        </div>
        {url && !isValidUrl && (
          <p className="text-[11px] text-yellow-500/80">
            Supported URLs: instagram.com/p/..., /reel/..., /reels/..., /tv/...
          </p>
        )}

        {/* Cookies badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider ${hasCookies ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-gray-600 border-white/10'}`}>
              {hasCookies ? '🍪 Cookies loaded' : 'No cookies (public only)'}
            </span>
          </div>
          <label className="cursor-pointer flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
            <Upload size={11} />
            {cookiesUploading ? 'Uploading…' : 'Upload cookies.txt'}
            <input
              ref={cookiesInputRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCookiesUpload(f); }}
            />
          </label>
        </div>
      </Section>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0f0f0f] border border-white/5 rounded-2xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Post Info */}
      {activeTab === 'info' && (
        <Section>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Fetch post details</span>
            <button
              onClick={handleGetInfo}
              disabled={!isValidUrl || infoLoading}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-xl transition-all active:scale-95"
            >
              {infoLoading ? <Loader2 size={13} className="animate-spin" /> : <Info size={13} />}
              {infoLoading ? 'Fetching…' : 'Get Info'}
            </button>
          </div>

          {infoError && <ErrBox msg={infoError} code={infoErrorCode} />}

          {postInfo && (
            <div className="space-y-3 mt-1">
              {postInfo.thumbnail && (
                <img
                  src={postInfo.thumbnail}
                  alt="Post thumbnail"
                  className="w-full max-h-52 object-cover rounded-xl border border-white/10"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="space-y-1.5">
                {postInfo.uploader && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest w-20 shrink-0">Account</span>
                    <span className="text-sm text-white font-medium">@{postInfo.uploader}</span>
                  </div>
                )}
                {postInfo.title && postInfo.title !== postInfo.description && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest w-20 shrink-0 mt-0.5">Title</span>
                    <span className="text-xs text-gray-300">{postInfo.title}</span>
                  </div>
                )}
                {postInfo.duration && postInfo.duration !== 'NA' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest w-20 shrink-0">Duration</span>
                    <span className="text-xs text-gray-400">{postInfo.duration}s</span>
                  </div>
                )}
                {(postInfo.like_count && postInfo.like_count !== 'NA') && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest w-20 shrink-0">Likes</span>
                    <span className="text-xs text-gray-400">{Number(postInfo.like_count).toLocaleString()}</span>
                  </div>
                )}
                {postInfo.description && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest w-20 shrink-0 mt-0.5">Caption</span>
                    <p className="text-xs text-gray-300 leading-relaxed line-clamp-5">{postInfo.description}</p>
                  </div>
                )}
              </div>

              {postInfo.description && (
                <button
                  onClick={attachDescription}
                  className="w-full flex items-center justify-center gap-2 border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 text-xs font-medium px-4 py-2.5 rounded-xl transition-all"
                >
                  {attachedLabel?.includes('Caption') ? <CheckCircle size={13} /> : <FileText size={13} />}
                  {attachedLabel?.includes('Caption') ? 'Caption Attached!' : '→ Send Caption to Script Context'}
                </button>
              )}
            </div>
          )}
        </Section>
      )}

      {/* Tab: Comments */}
      {activeTab === 'comments' && (
        <Section>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400">Scrape comments</span>
              <select
                value={maxComments}
                onChange={e => setMaxComments(Number(e.target.value) as 50 | 100 | 500)}
                className="bg-[#1a1a1a] border border-white/10 text-gray-400 text-[11px] rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value={50}>Top 50</option>
                <option value={100}>Top 100</option>
                <option value={500}>Top 500</option>
              </select>
            </div>
            <button
              onClick={handleGetComments}
              disabled={!isValidUrl || commentsLoading}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-xl transition-all active:scale-95"
            >
              {commentsLoading ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
              {commentsLoading ? 'Scraping…' : 'Get Comments'}
            </button>
          </div>
          <p className="text-[11px] text-gray-600">Works on public posts. Private posts require a cookies.txt login file.</p>

          {commentsError && <ErrBox msg={commentsError} code={commentsErrorCode} />}

          {comments && comments.length === 0 && (
            <div className="text-center py-6 text-gray-600 text-sm">No comments found on this post.</div>
          )}

          {comments && comments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>{comments.length} comments scraped</span>
                <div className="flex items-center gap-2">
                  <button onClick={downloadComments} className="hover:text-gray-300 transition-colors">Download .txt</button>
                  <span>·</span>
                  <button onClick={attachComments} className="hover:text-gray-300 transition-colors">
                    {attachedLabel?.includes('Comment') ? '✓ Attached' : 'Attach to Context'}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                {(showAllComments ? comments : comments.slice(0, 10)).map((c, i) => (
                  <div key={i} className="bg-white/3 rounded-lg px-3 py-2 text-xs text-gray-300 leading-relaxed border border-white/5">
                    {c}
                  </div>
                ))}
              </div>

              {comments.length > 10 && (
                <button
                  onClick={() => setShowAllComments(p => !p)}
                  className="w-full text-center text-[11px] text-gray-500 hover:text-gray-300 py-1 transition-colors"
                >
                  {showAllComments ? 'Show less' : `Show all ${comments.length} comments`}
                </button>
              )}

              <button
                onClick={attachComments}
                className="w-full flex items-center justify-center gap-2 border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 text-xs font-medium px-4 py-2.5 rounded-xl transition-all"
              >
                {attachedLabel?.includes('Comment') ? <CheckCircle size={13} /> : <Copy size={13} />}
                {attachedLabel?.includes('Comment') ? 'Comments Attached!' : '→ Send Comments to Script Context'}
              </button>
            </div>
          )}
        </Section>
      )}

      {/* Tab: Download */}
      {activeTab === 'download' && (
        <Section>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Download video / reel</span>
            <button
              onClick={handleDownload}
              disabled={!isValidUrl || downloadLoading}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-xl transition-all active:scale-95"
            >
              {downloadLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {downloadLoading ? 'Downloading…' : 'Download'}
            </button>
          </div>
          <p className="text-[11px] text-gray-600">Downloads best available quality. Private posts require cookies.txt.</p>

          {downloadLoading && (
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>{downloadProgress.toFixed(0)}%</span>
                <span>{downloadSpeed}{downloadEta ? ` · ETA ${downloadEta}` : ''}</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          )}

          {downloadError && <ErrBox msg={downloadError} />}

          {downloadedFilename && !downloadLoading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-400 text-xs">
                <CheckCircle size={13} />
                <span>Downloaded: {downloadedFilename}</span>
              </div>
              <a
                href={`/api/files/${downloadedFilename}`}
                download={downloadedFilename}
                className="block w-full text-center bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-medium px-4 py-2.5 rounded-xl transition-all"
              >
                Save to device
              </a>
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

export default InstagramImporter;
