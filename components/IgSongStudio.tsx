import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Instagram, Link2, MessageSquare, Sparkles, Music2, Video, Download,
  Loader2, AlertCircle, CheckCircle, ChevronRight, RefreshCw, Play, Pause,
  ExternalLink, FileText, X, Trash2, Wand2,
} from 'lucide-react';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  generateLyrics,
  generateSongAudio,
  pickFunnyCommentsForSong,
} from '../services/geminiService';
import LyricsCanvas from './LyricsCanvas';
import { toast } from './Toast';

// ── Constants ─────────────────────────────────────────────────────────────────
const LS_KEY  = 'ig_song_studio_v1';
const IDB_KEY = 'ig_song_studio_audio_v1';

type Phase = 'url' | 'comments' | 'curate' | 'lyrics' | 'song' | 'video';

const LYRIA_MODELS = [
  { id: 'lyria-3-clip-preview', label: 'Lyria 3 Clip', desc: '~30 sec · Fast', badge: '⚡' },
  { id: 'lyria-3-pro-preview',  label: 'Lyria 3 Pro',  desc: '~3 min · Studio', badge: '🎵' },
];

const LANGS = ['Hindi', 'English'] as const;
type LangKey = (typeof LANGS)[number];

const PICK_COUNTS = [12, 20, 30, 50];
const MAX_COMMENT_FETCH = [100, 500, 1000, 2000] as const;

// ── Small helpers ─────────────────────────────────────────────────────────────
async function safeJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return {}; }
}

const isValidIgUrl = (u: string) =>
  /instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/i.test(u.trim());

// ── Tiny atoms ────────────────────────────────────────────────────────────────
const Section: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-[#0f0f0f] border border-white/5 rounded-2xl p-4 space-y-3 ${className}`}>{children}</div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">{children}</span>
);

const ErrBox: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-red-400 text-xs">
    <AlertCircle size={13} className="mt-0.5 shrink-0" />
    <span>{msg}</span>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const IgSongStudio: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('url');

  // ── URL + post info ──
  const [url, setUrl] = useState('');
  const [postInfo, setPostInfo] = useState<{ uploader?: string; shortcode?: string; description?: string; thumbnail?: string } | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');

  // ── Cookies (warn if missing) ──
  const [hasCookies, setHasCookies] = useState<boolean | null>(null);

  // ── Comments scrape ──
  const [maxFetch, setMaxFetch] = useState<number>(500);
  const [comments, setComments] = useState<string[] | null>(null);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState('');
  const [scrapeError, setScrapeError] = useState('');
  const scrapePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Curated comments (Gemini-picked) ──
  const [picked, setPicked] = useState<string[]>([]);
  const [pickCount, setPickCount] = useState<number>(20);
  const [curateLoading, setCurateLoading] = useState(false);
  const [curateError, setCurateError] = useState('');

  // ── Language + model ──
  const [language, setLanguage] = useState<LangKey>('Hindi');
  const [lyricsModel, setLyricsModel] = useState('gemini-3-flash');

  // ── Lyrics ──
  const [lyrics, setLyrics] = useState('');
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState('');

  // ── Song (Lyria) ──
  const [lyriaModel, setLyriaModel] = useState('lyria-3-clip-preview');
  const [songBlob, setSongBlob] = useState<Blob | null>(null);
  const [songUrl, setSongUrl] = useState('');
  const [songLoading, setSongLoading] = useState(false);
  const [songError, setSongError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // ── IG video download (background) ──
  const [dlLoading, setDlLoading] = useState(false);
  const [dlProgress, setDlProgress] = useState(0);
  const [dlSpeed, setDlSpeed] = useState('');
  const [dlEta, setDlEta] = useState('');
  const [dlFilename, setDlFilename] = useState('');
  const [dlError, setDlError] = useState('');
  const dlPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Final video canvas ──
  const [showCanvas, setShowCanvas] = useState(false);

  // ── Init: mount-once persistence load ──
  const isInitialized = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.url) setUrl(d.url);
        if (d.postInfo) setPostInfo(d.postInfo);
        if (d.comments) setComments(d.comments);
        if (d.picked) setPicked(d.picked);
        if (d.lyrics) setLyrics(d.lyrics);
        if (d.language) setLanguage(d.language);
        if (d.lyricsModel) setLyricsModel(d.lyricsModel);
        if (d.lyriaModel) setLyriaModel(d.lyriaModel);
        if (d.pickCount) setPickCount(d.pickCount);
        if (d.maxFetch) setMaxFetch(d.maxFetch);
        if (d.dlFilename) setDlFilename(d.dlFilename);
        if (d.phase) setPhase(d.phase);
      }
    } catch {}
    idbGet(IDB_KEY).then((b: Blob | undefined) => {
      if (b && b.size > 0) {
        setSongBlob(b);
        setSongUrl(URL.createObjectURL(b));
      }
    }).catch(() => {});
    isInitialized.current = true;

    // Check cookies (used by /api/instagram/*)
    fetch('/api/health').then(r => r.json()).then(d => setHasCookies(!!d.cookies)).catch(() => setHasCookies(false));
  }, []);

  // Persist key state
  useEffect(() => {
    if (!isInitialized.current) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        url, postInfo, comments, picked, lyrics, language, lyricsModel,
        lyriaModel, pickCount, maxFetch, dlFilename, phase,
      }));
    } catch {}
  }, [url, postInfo, comments, picked, lyrics, language, lyricsModel, lyriaModel, pickCount, maxFetch, dlFilename, phase]);

  // Persist song blob
  useEffect(() => {
    if (songBlob) idbSet(IDB_KEY, songBlob).catch(() => {});
    else idbDel(IDB_KEY).catch(() => {});
  }, [songBlob]);

  // Cleanup poll timers + object URL
  useEffect(() => {
    return () => {
      if (scrapePollRef.current) clearInterval(scrapePollRef.current);
      if (dlPollRef.current) clearInterval(dlPollRef.current);
      if (songUrl) URL.revokeObjectURL(songUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Step 1: validate URL + fetch post info (optional preview) ───────────────
  const handleFetchInfo = useCallback(async () => {
    if (!isValidIgUrl(url)) {
      setInfoError('Valid Instagram URL daalo (/p/, /reel/, /reels/, /tv/).');
      return;
    }
    setInfoLoading(true); setInfoError(''); setPostInfo(null);
    try {
      const res = await fetch('/api/instagram/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || 'Info fetch failed');
      setPostInfo(d);
    } catch (e: any) {
      setInfoError(e.message || 'Could not fetch post info.');
    } finally {
      setInfoLoading(false);
    }
  }, [url]);

  // ── Step 2: scrape comments (polls bg job) ──────────────────────────────────
  const handleScrape = useCallback(async () => {
    if (!isValidIgUrl(url)) {
      setScrapeError('URL valid nahi hai.');
      return;
    }
    if (scrapePollRef.current) clearInterval(scrapePollRef.current);
    setScrapeLoading(true); setScrapeError(''); setScrapeStatus('Starting…'); setComments(null);
    try {
      const res = await fetch('/api/instagram/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), max_comments: maxFetch }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || 'Scrape start failed');

      if (d.status === 'done' && Array.isArray(d.comments)) {
        setComments(d.comments);
        setScrapeStatus('');
        setScrapeLoading(false);
        if (d.comments.length === 0) setScrapeError('Is post pe koi comment nahi mila.');
        return;
      }

      const jobId = d.job_id;
      scrapePollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/instagram/comments/status/${jobId}`);
          const sd = await safeJson(sr);
          if (sd.status === 'scraping') {
            setScrapeStatus(sd.message || 'Scraping…');
          } else if (sd.status === 'done') {
            clearInterval(scrapePollRef.current!);
            setComments(sd.comments || []);
            setScrapeStatus('');
            setScrapeLoading(false);
            if (!sd.comments || sd.comments.length === 0) {
              setScrapeError('Is post pe koi comment nahi mila.');
            }
          } else if (sd.status === 'error' || sd.status === 'not_found') {
            clearInterval(scrapePollRef.current!);
            setScrapeError(sd.error || 'Scraping failed');
            setScrapeStatus('');
            setScrapeLoading(false);
          }
        } catch { /* keep polling */ }
      }, 1500);
    } catch (e: any) {
      setScrapeError(e.message || 'Could not start scraping.');
      setScrapeStatus('');
      setScrapeLoading(false);
    }
  }, [url, maxFetch]);

  // ── Step 3: Gemini curates funniest/best comments ───────────────────────────
  const handleCurate = useCallback(async () => {
    if (!comments || comments.length === 0) return;
    setCurateLoading(true); setCurateError(''); setPicked([]);
    try {
      const picks = await pickFunnyCommentsForSong(comments, pickCount, language, lyricsModel);
      if (picks.length === 0) throw new Error('Gemini ne koi comment select nahi kiya.');
      setPicked(picks);
      setPhase('lyrics');
    } catch (e: any) {
      setCurateError(e.message || 'Curation failed');
    } finally {
      setCurateLoading(false);
    }
  }, [comments, pickCount, language, lyricsModel]);

  // ── Step 4: Gemini writes lyrics from picked comments ───────────────────────
  const handleGenerateLyrics = useCallback(async () => {
    if (picked.length === 0) return;
    setLyricsLoading(true); setLyricsError(''); setLyrics('');
    try {
      const commentsText = picked.map(c => `• ${c}`).join('\n');
      const result = await generateLyrics({
        comments: commentsText,
        context: postInfo?.description ? `Instagram post by @${postInfo.uploader}: ${postInfo.description.slice(0, 300)}` : '',
        directLyrics: '',
        style: 'auto',
        language,
        model: lyricsModel,
      });
      setLyrics(result);
      setPhase('song');
    } catch (e: any) {
      setLyricsError(e.message || 'Lyrics generation failed');
    } finally {
      setLyricsLoading(false);
    }
  }, [picked, postInfo, language, lyricsModel]);

  // ── Step 5: Lyria generates song ────────────────────────────────────────────
  const handleMakeSong = useCallback(async () => {
    if (!lyrics) return;
    setSongLoading(true); setSongError(''); setSongBlob(null);
    if (songUrl) URL.revokeObjectURL(songUrl);
    setSongUrl('');
    try {
      const blob = await generateSongAudio(lyrics, 'auto', lyriaModel);
      setSongBlob(blob);
      setSongUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setSongError(e.message || 'Song generation failed');
    } finally {
      setSongLoading(false);
    }
  }, [lyrics, lyriaModel, songUrl]);

  // ── IG video download (separate, runs in parallel) ──────────────────────────
  const handleDownloadVideo = useCallback(async () => {
    if (!isValidIgUrl(url)) return;
    if (dlPollRef.current) clearInterval(dlPollRef.current);
    setDlLoading(true); setDlError(''); setDlProgress(0); setDlSpeed(''); setDlEta(''); setDlFilename('');
    try {
      const res = await fetch('/api/instagram/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || 'Download start failed');
      if (d.status === 'done' && d.filename) {
        setDlFilename(d.filename);
        setDlProgress(100);
        setDlLoading(false);
        return;
      }
      const jobId = d.job_id;
      dlPollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/instagram/download/status/${jobId}`);
          const sd = await safeJson(sr);
          if (sd.status === 'downloading') {
            if (typeof sd.progress === 'number') setDlProgress(sd.progress);
            if (sd.speed) setDlSpeed(sd.speed);
            if (sd.eta)   setDlEta(sd.eta);
          } else if (sd.status === 'done') {
            clearInterval(dlPollRef.current!);
            setDlFilename(sd.filename || '');
            setDlProgress(100);
            setDlLoading(false);
          } else if (sd.status === 'error') {
            clearInterval(dlPollRef.current!);
            setDlError(sd.error || 'Download failed');
            setDlLoading(false);
          }
        } catch { /* keep polling */ }
      }, 1500);
    } catch (e: any) {
      setDlError(e.message || 'Could not start download.');
      setDlLoading(false);
    }
  }, [url]);

  // ── Reset entire project state ──────────────────────────────────────────────
  const resetAll = () => {
    if (!confirm('Sab kuch reset ho jayega — pakka?')) return;
    if (scrapePollRef.current) clearInterval(scrapePollRef.current);
    if (dlPollRef.current) clearInterval(dlPollRef.current);
    if (songUrl) URL.revokeObjectURL(songUrl);
    setUrl(''); setPostInfo(null);
    setComments(null); setPicked([]); setLyrics('');
    setSongBlob(null); setSongUrl('');
    setDlFilename(''); setDlProgress(0);
    setPhase('url');
    try { localStorage.removeItem(LS_KEY); } catch {}
    idbDel(IDB_KEY).catch(() => {});
  };

  const togglePlay = () => {
    if (!audioRef.current || !songUrl) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  // ── Phase tabs ──
  const PHASES: { id: Phase; label: string; icon: React.ElementType; ready: boolean }[] = [
    { id: 'url',      label: 'IG URL',   icon: Link2,         ready: !!url && isValidIgUrl(url) },
    { id: 'comments', label: 'Scrape',   icon: MessageSquare, ready: !!comments && comments.length > 0 },
    { id: 'curate',   label: 'Curate',   icon: Sparkles,      ready: picked.length > 0 },
    { id: 'lyrics',   label: 'Lyrics',   icon: FileText,      ready: !!lyrics },
    { id: 'song',     label: 'Song',     icon: Music2,        ready: !!songUrl },
    { id: 'video',    label: 'Video',    icon: Video,         ready: !!songUrl && picked.length > 0 },
  ];

  // Open the LyricsCanvas with comments-as-lines (each picked comment = 1 "line")
  if (showCanvas) {
    const commentsAsLines = picked.join('\n');
    return (
      <LyricsCanvas
        lyricsText={commentsAsLines}
        audioUrl={songUrl}
        songStyle="comments"
        wordTimings={[]}
        onBack={() => setShowCanvas(false)}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-600 via-purple-600 to-orange-500 flex items-center justify-center shadow-lg">
            <Instagram size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-white">IG → Song Studio</h2>
            <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">Link → Comments → Song → Scroll Video</p>
          </div>
        </div>
        <button
          onClick={resetAll}
          className="text-xs text-gray-600 hover:text-red-400 border border-white/5 px-3 py-2 rounded-xl transition-all flex items-center gap-1.5"
          title="Reset all"
        >
          <Trash2 size={12} /> Reset
        </button>
      </div>

      {/* Cookie warning */}
      {hasCookies === false && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 flex items-start gap-2 text-yellow-300 text-xs">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold mb-0.5">Instagram cookies missing</div>
            <span className="text-yellow-200/80">Private posts ya rate-limit hit hone par scrape fail ho sakta hai. Cookies.txt upload karne ke liye IG Importer section use karo.</span>
          </div>
        </div>
      )}

      {/* Phase tabs */}
      <div className="flex gap-1 bg-[#0f0f0f] border border-white/5 rounded-2xl p-1 overflow-x-auto">
        {PHASES.map(p => {
          const Icon = p.icon;
          const active = phase === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPhase(p.id)}
              className={`flex-1 min-w-[68px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-medium transition-all ${active ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {p.ready && !active ? <CheckCircle size={12} className="text-green-400" /> : <Icon size={13} />}
              {p.label}
            </button>
          );
        })}
      </div>

      {/* ── PHASE: URL ───────────────────────────────────────────── */}
      {phase === 'url' && (
        <div className="space-y-3">
          <Section>
            <Label>Instagram Post / Reel URL</Label>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://www.instagram.com/reel/..."
                className="flex-1 bg-[#1a1a1a] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-gray-200 placeholder-gray-700 focus:outline-none focus:border-pink-500/40"
                onKeyDown={e => { if (e.key === 'Enter') handleFetchInfo(); }}
              />
              <button
                onClick={handleFetchInfo}
                disabled={infoLoading || !url.trim()}
                className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/8 hover:bg-white/10 text-xs text-gray-300 font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {infoLoading ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                Info
              </button>
            </div>
            <div className="text-[10px] text-gray-700">Supported: /p/, /reel/, /reels/, /tv/</div>
            {infoError && <ErrBox msg={infoError} />}
            {postInfo && (
              <div className="bg-white/3 border border-white/5 rounded-xl p-3 flex gap-3 items-start">
                {postInfo.thumbnail && (
                  <img src={postInfo.thumbnail} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-white font-semibold truncate">@{postInfo.uploader || 'unknown'}</div>
                  {postInfo.description && (
                    <div className="text-[11px] text-gray-500 line-clamp-3 leading-snug mt-1">{postInfo.description}</div>
                  )}
                </div>
              </div>
            )}
          </Section>

          <Section>
            <Label>Comments fetch limit</Label>
            <div className="flex flex-wrap gap-1.5">
              {MAX_COMMENT_FETCH.map(n => (
                <button
                  key={n}
                  onClick={() => setMaxFetch(n)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${maxFetch === n ? 'border-pink-500/50 bg-pink-500/10 text-pink-300' : 'border-white/8 text-gray-600 hover:text-gray-400'}`}
                >
                  {n.toLocaleString()}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-700">Zyada limit = zyada variety, par scrape bhi slow hoga.</div>
          </Section>

          <button
            onClick={() => { handleScrape(); setPhase('comments'); }}
            disabled={!isValidIgUrl(url) || scrapeLoading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-pink-900/30"
          >
            <MessageSquare size={16} />
            Scrape Comments →
          </button>
        </div>
      )}

      {/* ── PHASE: COMMENTS ────────────────────────────────────── */}
      {phase === 'comments' && (
        <div className="space-y-3">
          <Section>
            <div className="flex items-center justify-between">
              <Label>Scraped comments</Label>
              <button
                onClick={handleScrape}
                disabled={scrapeLoading}
                className="text-[11px] text-gray-600 hover:text-pink-400 flex items-center gap-1"
              >
                <RefreshCw size={11} className={scrapeLoading ? 'animate-spin' : ''} /> Re-scrape
              </button>
            </div>
            {scrapeLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 size={13} className="animate-spin" /> {scrapeStatus || 'Scraping…'}
              </div>
            )}
            {scrapeError && <ErrBox msg={scrapeError} />}
            {comments && comments.length > 0 && (
              <>
                <div className="text-xs text-green-400 flex items-center gap-1.5"><CheckCircle size={12} /> {comments.length} comments scraped</div>
                <div className="bg-[#1a1a1a] border border-white/5 rounded-xl p-2.5 max-h-56 overflow-y-auto space-y-1.5">
                  {comments.slice(0, 30).map((c, i) => (
                    <div key={i} className="text-[11px] text-gray-300 leading-snug border-b border-white/3 pb-1.5 last:border-0">{c}</div>
                  ))}
                  {comments.length > 30 && (
                    <div className="text-[10px] text-gray-700 italic pt-1">+{comments.length - 30} more…</div>
                  )}
                </div>
              </>
            )}
          </Section>

          {comments && comments.length > 0 && (
            <button
              onClick={() => setPhase('curate')}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold text-sm py-3.5 rounded-xl transition-all active:scale-[0.98]"
            >
              <Sparkles size={16} /> Curate Best Comments →
            </button>
          )}
        </div>
      )}

      {/* ── PHASE: CURATE ───────────────────────────────────────── */}
      {phase === 'curate' && (
        <div className="space-y-3">
          <Section>
            <Label>Kitne comments pick karein</Label>
            <div className="flex flex-wrap gap-1.5">
              {PICK_COUNTS.map(n => (
                <button
                  key={n}
                  onClick={() => setPickCount(n)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${pickCount === n ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-white/8 text-gray-600 hover:text-gray-400'}`}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-2 border-t border-white/5">
              <div className="flex-1 min-w-[120px] space-y-1.5">
                <Label>Language</Label>
                <div className="flex flex-wrap gap-1.5">
                  {LANGS.map(l => (
                    <button
                      key={l}
                      onClick={() => setLanguage(l)}
                      className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${language === l ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-white/8 text-gray-600 hover:text-gray-400'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-[140px] space-y-1.5">
                <Label>AI Model</Label>
                <div className="flex flex-col gap-1.5">
                  {[
                    { id: 'gemini-3-flash', label: 'Gemini 3 Flash', badge: 'Fast' },
                    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', badge: 'Best' },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setLyricsModel(m.id)}
                      className={`flex items-center justify-between text-[11px] px-3 py-1.5 rounded-lg border transition-all ${lyricsModel === m.id ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-white/8 text-gray-600 hover:text-gray-400'}`}
                    >
                      {m.label}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${lyricsModel === m.id ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-gray-700'}`}>{m.badge}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {curateError && <ErrBox msg={curateError} />}

          <button
            onClick={handleCurate}
            disabled={curateLoading || !comments || comments.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-purple-900/30"
          >
            {curateLoading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {curateLoading ? 'Gemini picking…' : `Pick ${pickCount} best comments`}
          </button>

          {picked.length > 0 && (
            <Section>
              <Label>Picked ({picked.length})</Label>
              <div className="bg-[#1a1a1a] border border-white/5 rounded-xl p-2.5 max-h-72 overflow-y-auto space-y-2">
                {picked.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-gray-200 leading-snug border-b border-white/3 pb-2 last:border-0">
                    <span className="text-purple-400 font-semibold shrink-0">{i + 1}.</span>
                    <div className="flex-1">{c}</div>
                    <button
                      onClick={() => setPicked(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-gray-700 hover:text-red-400 shrink-0"
                      title="Remove"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setPhase('lyrics')}
                className="w-full flex items-center justify-center gap-2 mt-2 border border-pink-500/30 text-pink-400 hover:bg-pink-500/10 text-sm font-medium py-2.5 rounded-xl transition-all"
              >
                <FileText size={14} /> Lyrics likhwao →
              </button>
            </Section>
          )}
        </div>
      )}

      {/* ── PHASE: LYRICS ───────────────────────────────────────── */}
      {phase === 'lyrics' && (
        <div className="space-y-3">
          <Section>
            <Label>Picked Comments ({picked.length})</Label>
            <div className="bg-[#1a1a1a] border border-white/5 rounded-xl p-2.5 max-h-32 overflow-y-auto space-y-1">
              {picked.slice(0, 8).map((c, i) => (
                <div key={i} className="text-[10px] text-gray-500 leading-snug">• {c}</div>
              ))}
              {picked.length > 8 && <div className="text-[9px] text-gray-700">+{picked.length - 8} more…</div>}
            </div>
          </Section>

          {lyricsError && <ErrBox msg={lyricsError} />}

          {!lyrics && (
            <button
              onClick={handleGenerateLyrics}
              disabled={lyricsLoading || picked.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 text-white font-semibold text-sm py-3.5 rounded-xl transition-all active:scale-[0.98]"
            >
              {lyricsLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {lyricsLoading ? 'Writing lyrics…' : 'Generate Lyrics'}
            </button>
          )}

          {lyrics && (
            <Section>
              <div className="flex items-center justify-between">
                <Label>Generated Lyrics</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(lyrics); toast.info('Copied'); }}
                    className="text-[11px] text-gray-600 hover:text-gray-400"
                  >Copy</button>
                  <button
                    onClick={handleGenerateLyrics}
                    disabled={lyricsLoading}
                    className="text-[11px] text-gray-600 hover:text-pink-400 flex items-center gap-1"
                  >
                    <RefreshCw size={11} className={lyricsLoading ? 'animate-spin' : ''} /> Regenerate
                  </button>
                </div>
              </div>
              <textarea
                value={lyrics}
                onChange={e => setLyrics(e.target.value)}
                rows={12}
                className="w-full bg-[#1a1a1a] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500/40 resize-none font-mono leading-relaxed"
              />
              <button
                onClick={() => setPhase('song')}
                className="w-full flex items-center justify-center gap-2 border border-pink-500/30 text-pink-400 hover:bg-pink-500/10 text-sm font-medium py-2.5 rounded-xl transition-all"
              >
                <Music2 size={14} /> Song banao →
              </button>
            </Section>
          )}
        </div>
      )}

      {/* ── PHASE: SONG ─────────────────────────────────────────── */}
      {phase === 'song' && (
        <div className="space-y-3">
          <Section>
            <Label>Music Model (Google Lyria 3)</Label>
            <div className="grid grid-cols-2 gap-2">
              {LYRIA_MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setLyriaModel(m.id)}
                  className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border transition-all text-left ${lyriaModel === m.id ? 'border-pink-500/50 bg-pink-500/10 text-white' : 'border-white/8 text-gray-600 hover:text-gray-400 hover:border-white/15'}`}
                >
                  <span className="text-sm">{m.badge} <span className="text-xs font-semibold">{m.label}</span></span>
                  <span className="text-[10px] opacity-60">{m.desc}</span>
                </button>
              ))}
            </div>
            <button
              onClick={handleMakeSong}
              disabled={songLoading || !lyrics}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-orange-600 hover:from-pink-500 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-3 rounded-xl transition-all active:scale-[0.98]"
            >
              {songLoading ? <Loader2 size={15} className="animate-spin" /> : <Music2 size={15} />}
              {songLoading ? 'Creating song…' : (songUrl ? 'Re-generate Song' : 'Make Song (Lyria 3)')}
            </button>
            {songError && <ErrBox msg={songError} />}
            {songUrl && (
              <div className="bg-[#1a1a1a] border border-white/8 rounded-xl p-3 space-y-2">
                <audio ref={audioRef} src={songUrl} onEnded={() => setIsPlaying(false)} className="hidden" />
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-600 to-orange-600 flex items-center justify-center shrink-0 active:scale-95"
                  >
                    {isPlaying ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white ml-0.5" />}
                  </button>
                  <div className="flex-1">
                    <div className="text-xs text-white font-medium">Song Ready</div>
                    <div className="text-[11px] text-gray-500">{LYRIA_MODELS.find(m => m.id === lyriaModel)?.label}</div>
                  </div>
                  <a
                    href={songUrl}
                    download={`ig_song_${Date.now()}.wav`}
                    className="text-gray-600 hover:text-gray-400 p-2"
                    title="Download song"
                  >
                    <Download size={15} />
                  </a>
                </div>
              </div>
            )}
          </Section>

          {/* IG Video download (parallel, optional) */}
          <Section>
            <div className="flex items-center justify-between">
              <Label>Original IG Video (download)</Label>
              {dlFilename && (
                <a
                  href={`/api/files/${dlFilename}`}
                  download
                  className="text-[11px] text-pink-400 hover:text-pink-300 flex items-center gap-1"
                >
                  <Download size={11} /> Save
                </a>
              )}
            </div>
            {!dlFilename && !dlLoading && (
              <button
                onClick={handleDownloadVideo}
                className="w-full flex items-center justify-center gap-2 border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-medium py-2.5 rounded-xl transition-all"
              >
                <Download size={13} /> Download IG video
              </button>
            )}
            {dlLoading && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>{dlProgress.toFixed(1)}%</span>
                  <span>{dlSpeed} · ETA {dlEta}</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-pink-500 to-orange-500 transition-all"
                    style={{ width: `${dlProgress}%` }}
                  />
                </div>
              </div>
            )}
            {dlFilename && (
              <div className="bg-green-500/5 border border-green-500/15 rounded-xl px-3 py-2 flex items-center gap-2 text-[11px] text-green-300">
                <CheckCircle size={12} /> {dlFilename}
                <a
                  href={`/api/files/${dlFilename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-green-400 hover:text-green-300"
                  title="Open"
                >
                  <ExternalLink size={11} />
                </a>
              </div>
            )}
            {dlError && <ErrBox msg={dlError} />}
          </Section>

          {songUrl && picked.length > 0 && (
            <button
              onClick={() => { setPhase('video'); setShowCanvas(true); }}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-purple-900/30"
            >
              <Video size={16} /> Final Scrolling Video Banao →
            </button>
          )}
        </div>
      )}

      {/* ── PHASE: VIDEO (canvas opens above) ────────────────── */}
      {phase === 'video' && (
        <div className="space-y-3">
          <Section>
            <Label>Final Scrolling Video</Label>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Picked comments black background pe scroll honge, song background me chalega.
              Canvas khol kar play / export kar sakte ho.
            </p>
            <div className="text-[10px] text-gray-700">
              {picked.length} comments · {songUrl ? 'song ready' : 'song missing'}
            </div>
            <button
              onClick={() => setShowCanvas(true)}
              disabled={!songUrl || picked.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm py-3.5 rounded-xl transition-all active:scale-[0.98]"
            >
              <Video size={16} /> Open Canvas
            </button>
            {(!songUrl || picked.length === 0) && (
              <ErrBox msg="Pehle song bana lo aur comments curate kar lo." />
            )}
          </Section>
        </div>
      )}
    </div>
  );
};

export default IgSongStudio;
