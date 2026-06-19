"""
Flask server for Podcast-basiks
YouTube transcript scraping + video download + basic video editing
Run on Termux: python flask_server.py

Requirements: pip install flask flask-cors yt-dlp youtube-transcript-api
Also need: ffmpeg (pkg install ffmpeg in Termux)
"""

import os
import json
import shutil
import subprocess
import tempfile
import threading
import http.cookiejar as _http_cookiejar
import requests as _requests_lib
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# yt-dlp binary: prefer the locally downloaded newer version, fall back to system one
_YTDLP_LOCAL = os.path.join(os.path.dirname(__file__), 'yt-dlp-new')
_YTDLP_BIN = _YTDLP_LOCAL if os.path.isfile(_YTDLP_LOCAL) and os.access(_YTDLP_LOCAL, os.X_OK) else (shutil.which('yt-dlp') or 'yt-dlp')
_YTDLP_IS_NEW = (_YTDLP_BIN == _YTDLP_LOCAL)  # True if using 2026.03.17+ binary

_NODE_BIN = shutil.which('node') or ''

def _js_runtime_args():
    """Return --js-runtimes and --remote-components if using new yt-dlp + Node.js.
    yt-dlp 2026.03.17+ supports these flags for EJS n-challenge solving."""
    if _YTDLP_IS_NEW and _NODE_BIN:
        return [
            '--js-runtimes', f'node:{_NODE_BIN}',
            '--remote-components', 'ejs:github',
        ]
    return []

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    TRANSCRIPT_API_AVAILABLE = True
except ImportError:
    TRANSCRIPT_API_AVAILABLE = False

try:
    from google import genai as _genai
    from google.genai import types as _genai_types
    GEMINI_SDK_AVAILABLE = True
except ImportError:
    GEMINI_SDK_AVAILABLE = False

def make_transcript_api():
    """Create YouTubeTranscriptApi instance (v1.x instance-based API).
    Loads yt_cookies.txt into a requests.Session if the file exists."""
    if not TRANSCRIPT_API_AVAILABLE:
        return None
    ck = cookies_path()
    if ck:
        try:
            cj = _http_cookiejar.MozillaCookieJar(ck)
            cj.load(ignore_discard=True, ignore_expires=True)
            session = _requests_lib.Session()
            session.cookies = cj
            return YouTubeTranscriptApi(http_client=session)
        except Exception:
            pass
    return YouTubeTranscriptApi()

app = Flask(__name__)
CORS(app)  # Allow React app to call this server

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': f'Route not found: {request.method} {request.path}'}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'error': f'Method not allowed: {request.method} {request.path}'}), 405

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': f'Internal server error: {str(e)}'}), 500

DOWNLOAD_DIR = os.path.join(os.path.dirname(__file__), "downloads")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Cookies file — export from browser and upload via /api/cookies/upload
COOKIES_FILE = os.path.join(os.path.dirname(__file__), "yt_cookies.txt")

# Track active downloads
active_jobs = {}


def cookies_args():
    """Return ['--cookies', path] if cookies file exists and is non-empty, else []."""
    if os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0:
        return ['--cookies', COOKIES_FILE]
    return []


def cookies_path():
    """Return cookies file path string if it exists, else None."""
    if os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0:
        return COOKIES_FILE
    return None


def get_instagram_cookies():
    """Extract all Instagram cookies from the saved cookies file.
    Accepts Netscape format (preferred) or auto-converts JSON cookies in place.
    URL-decodes values so requests/instaloader gets the raw cookie values."""
    from urllib.parse import unquote
    ck = cookies_path()
    if not ck:
        return {}
    try:
        with open(ck, 'r', encoding='utf-8') as f:
            raw = f.read()
    except Exception:
        return {}

    # If file is JSON cookies, convert in place to Netscape and re-read
    if raw.lstrip().startswith(('"', '[')):
        converted = _json_cookies_to_netscape(raw)
        if converted:
            try:
                with open(ck, 'w', encoding='utf-8') as f:
                    f.write(converted)
                raw = converted
            except Exception:
                pass

    cookies = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split('\t')
        if len(parts) >= 7:
            domain = parts[0].lstrip('.')
            name = parts[5]
            value = parts[6].strip('"')
            if 'instagram.com' in domain:
                cookies[name] = unquote(value)
    return cookies


def extract_video_id(url: str) -> str | None:
    """Extract YouTube video ID from URL."""
    import re
    patterns = [
        r'(?:v=|youtu\.be/|embed/|shorts/)([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


@app.route('/api/health', methods=['GET'])
def health():
    ck = cookies_path()
    return jsonify({
        'status': 'ok',
        'transcript_api': TRANSCRIPT_API_AVAILABLE,
        'download_dir': DOWNLOAD_DIR,
        'cookies': bool(ck),
        'cookies_size': os.path.getsize(COOKIES_FILE) if ck else 0,
    })


def _json_cookies_to_netscape(content: str) -> str | None:
    """If `content` is a JSON array of cookie objects (Chrome/EditThisCookie
    extension exports — possibly double-encoded as a JSON string), convert it
    to Netscape cookies.txt format. Returns the converted string, or None if
    the content is not JSON cookies.
    """
    import json, time
    try:
        first = json.loads(content)
        # Double-encoded case: outer string wraps the actual JSON array
        if isinstance(first, str):
            cookies = json.loads(first)
        else:
            cookies = first
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(cookies, list) or not cookies or not isinstance(cookies[0], dict):
        return None

    lines = [
        "# Netscape HTTP Cookie File",
        "# This is a generated file! Do not edit.",
        "",
    ]
    far_future = str(int(time.time()) + 365 * 24 * 3600 * 2)
    for c in cookies:
        domain = c.get('domain', '')
        name = c.get('name', '')
        if not domain or not name:
            continue
        if not domain.startswith('.') and not c.get('hostOnly', True):
            domain = '.' + domain
        flag_subdomains = "TRUE" if domain.startswith('.') else "FALSE"
        path   = c.get('path', '/')
        secure = "TRUE" if c.get('secure') else "FALSE"
        exp    = c.get('expirationDate', c.get('expires'))
        if exp is None or c.get('session', False):
            expires = far_future
        else:
            try:
                expires = str(int(float(exp)))
            except (TypeError, ValueError):
                expires = far_future
        value = str(c.get('value', ''))
        lines.append('\t'.join([domain, flag_subdomains, path, secure, expires, name, value]))
    return '\n'.join(lines) + '\n'


@app.route('/api/cookies/upload', methods=['POST'])
def upload_cookies():
    """Upload a cookies file. Accepts Netscape (.txt) format directly, or
    Chrome/EditThisCookie JSON exports (auto-converted to Netscape)."""
    if 'file' in request.files:
        f = request.files['file']
        content = f.read().decode('utf-8', errors='replace')
    elif request.is_json:
        content = (request.json or {}).get('content', '')
    else:
        content = request.data.decode('utf-8', errors='replace')

    if not content.strip():
        return jsonify({'error': 'Empty cookies file'}), 400

    # Auto-convert JSON cookies to Netscape — required for yt-dlp + instagrapi
    converted = _json_cookies_to_netscape(content)
    fmt = 'json→netscape' if converted else 'netscape'
    if converted:
        content = converted

    with open(COOKIES_FILE, 'w', encoding='utf-8') as out:
        out.write(content)

    return jsonify({'ok': True, 'size': len(content), 'path': COOKIES_FILE, 'format': fmt})


@app.route('/api/cookies/delete', methods=['POST'])
def delete_cookies():
    """Delete saved cookies."""
    if os.path.exists(COOKIES_FILE):
        os.remove(COOKIES_FILE)
    return jsonify({'ok': True})


@app.route('/api/youtube/transcript', methods=['POST'])
def get_transcript():
    """Fetch YouTube transcript — fully automatic language detection."""
    data = request.json or {}
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'URL is required.', 'error_code': 'MISSING_URL'}), 400

    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({'error': 'Invalid YouTube URL. Example: youtube.com/watch?v=... or youtu.be/...', 'error_code': 'INVALID_URL'}), 400

    if not TRANSCRIPT_API_AVAILABLE:
        return jsonify({'error': 'youtube-transcript-api is not installed. Run: pip install youtube-transcript-api', 'error_code': 'MISSING_DEPENDENCY'}), 500

    raw = None
    lang_used = 'auto'
    available_langs = []
    failure_reason = None  # Track why transcript fetch failed

    # Language priority: Hindi first, then English, then anything
    LANG_PRIORITY = ['hi', 'hi-IN', 'hi-Latn', 'ur', 'en', 'en-IN', 'en-GB', 'en-US']

    def lang_rank(code):
        try:
            return LANG_PRIORITY.index(code)
        except ValueError:
            return len(LANG_PRIORITY)

    def clean_caption_text(text: str) -> str:
        """Remove YouTube auto-caption noise from a single caption segment."""
        import html as _html
        import re as _re

        # 1. Decode HTML entities  (&amp; &#39; etc.)
        text = _html.unescape(text)

        # 2. Strip XML/HTML tags  (<i>, <b>, <font ...>, etc.)
        text = _re.sub(r'<[^>]+>', '', text)

        # 3. Remove YouTube speaker arrows  ">>" / ">>>" at start of segment
        text = _re.sub(r'^[>\s]+', '', text)

        # 4. Remove [__] / [ __ ] / [_ _] inaudible markers
        text = _re.sub(r'\[\s*_+\s*\]', '', text)

        # 5. Remove common sound-effect labels  [Music] [Applause] [Laughter] etc.
        #    Keep letters inside brackets only if all-caps or mixed — these are noise
        text = _re.sub(r'\[\s*[A-Za-z ]+\s*\]', '', text)

        # 6. Remove leftover lone punctuation / stray arrows after cleaning
        text = _re.sub(r'^\s*[>\-–—|]+\s*', '', text)

        # 7. Normalize whitespace
        text = ' '.join(text.split())

        return text

    def normalize_raw(fetched):
        """Convert any transcript format to list of dicts with text cleaning."""
        result = []
        for item in fetched:
            try:
                text = item['text'] if isinstance(item, dict) else item.text
                start = item['start'] if isinstance(item, dict) else item.start
                duration = item.get('duration', 0) if isinstance(item, dict) else getattr(item, 'duration', 0)
                if text:
                    text = clean_caption_text(text)
                if text:
                    result.append({'text': text, 'start': start, 'duration': duration})
            except Exception:
                continue
        return result

    # ── Attempt 1: list() — inspect all available transcripts, sort by preference
    # youtube-transcript-api v1.x uses instance-based API: YouTubeTranscriptApi().list(video_id)
    try:
        api = make_transcript_api()
        transcript_list = api.list(video_id)
        all_t = list(transcript_list)
        available_langs = [{'code': t.language_code, 'name': t.language, 'auto': t.is_generated} for t in all_t]
        # Sort: manual transcripts first, then by language priority rank
        all_t.sort(key=lambda t: (1 if t.is_generated else 0, lang_rank(t.language_code)))
        for t in all_t:
            try:
                fetched = t.fetch()
                candidate = normalize_raw(fetched)
                if candidate:
                    raw = candidate
                    lang_used = t.language_code
                    break
            except Exception as fe:
                failure_reason = str(fe)
                continue
    except Exception as e:
        err_str = str(e).lower()
        if 'disabled' in err_str or 'no transcript' in err_str:
            failure_reason = 'TRANSCRIPTS_DISABLED'
        elif 'unavailable' in err_str or 'private' in err_str or 'not available' in err_str:
            failure_reason = 'VIDEO_UNAVAILABLE'
        elif 'too many requests' in err_str or '429' in err_str:
            failure_reason = 'RATE_LIMITED'
        elif 'age' in err_str or 'inappropriate' in err_str:
            failure_reason = 'AGE_RESTRICTED'
        else:
            failure_reason = str(e)

    # ── Attempt 2: explicit language fallback via fetch()
    # youtube-transcript-api v1.x: api.fetch(video_id, languages=[...])
    if raw is None:
        for lang_set in [
            ['hi', 'hi-IN', 'hi-Latn'],
            ['ur'],
            ['en', 'en-IN', 'en-US', 'en-GB'],
            None,
        ]:
            try:
                api2 = make_transcript_api()
                if lang_set is None:
                    fetched = api2.fetch(video_id)
                else:
                    fetched = api2.fetch(video_id, languages=lang_set)
                candidate = normalize_raw(fetched)
                if candidate:
                    raw = candidate
                    lang_used = lang_set[0] if lang_set else 'auto'
                    break
            except Exception as e:
                if not failure_reason:
                    failure_reason = str(e)
                continue

    # ── Attempt 3: yt-dlp subtitle fallback
    if raw is None:
        for sub_langs in ['hi.*,hi-IN,ur.*', 'en.*', 'all']:
            try:
                with tempfile.TemporaryDirectory() as tmpdir:
                    out_tmpl = os.path.join(tmpdir, '%(id)s')
                    cmd = [
                        _YTDLP_BIN,
                        '--write-auto-subs', '--write-subs',
                        '--sub-langs', sub_langs,
                        '--sub-format', 'json3',
                        '--skip-download', '--no-playlist',
                        '--no-check-certificates',
                        '--extractor-args', 'youtube:player_client=android,android_vr,ios',
                        *cookies_args(),
                        '-o', out_tmpl,
                        url
                    ]
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                    # Detect yt-dlp specific errors
                    if result.returncode != 0:
                        stderr = result.stderr.lower()
                        if 'private video' in stderr:
                            failure_reason = 'VIDEO_PRIVATE'
                        elif 'age' in stderr:
                            failure_reason = 'AGE_RESTRICTED'
                        elif 'not available' in stderr or 'unavailable' in stderr:
                            failure_reason = 'VIDEO_UNAVAILABLE'

                    files = [f for f in os.listdir(tmpdir) if f.endswith('.json3')]
                    files.sort(key=lambda f: lang_rank(f.split('.')[-2]) if '.' in f else 99)
                    for fname in files:
                        try:
                            lcode = fname.split('.')[-2] if fname.count('.') >= 2 else 'auto'
                            with open(os.path.join(tmpdir, fname), 'r', encoding='utf-8') as f:
                                sub_data = json.load(f)
                            events = sub_data.get('events', [])
                            candidate = []
                            for ev in events:
                                segs = ev.get('segs', [])
                                raw_text = ''.join(s.get('utf8', '') for s in segs)
                                text = clean_caption_text(raw_text)
                                if text:
                                    candidate.append({
                                        'text': text,
                                        'start': ev.get('tStartMs', 0) / 1000,
                                        'duration': ev.get('dDurationMs', 0) / 1000
                                    })
                            if candidate:
                                raw = candidate
                                lang_used = lcode
                                break
                        except Exception:
                            continue
                if raw:
                    break
            except Exception as e:
                if not failure_reason:
                    failure_reason = str(e)
                continue

    # ── Attempt 4: Gemini AI fallback — passes YouTube URL directly to Gemini
    # Gemini 3.x models can watch the video and produce a transcript natively.
    if raw is None and GEMINI_SDK_AVAILABLE:
        try:
            import re as _re
            gemini_key = os.environ.get('GEMINI_API_KEY', '')
            gcp_sa_key = os.environ.get('GCP_SA_KEY', '')
            gcp_project = os.environ.get('GCP_PROJECT_ID', '')
            gcp_region = os.environ.get('GCP_REGION', 'global')
            gemini_model = os.environ.get('GEMINI_TRANSCRIPT_MODEL', 'gemini-3.5-flash')

            if gcp_sa_key and gcp_project:
                import google.oauth2.service_account as _sa_creds
                _sa_info = json.loads(gcp_sa_key)
                _credentials = _sa_creds.Credentials.from_service_account_info(
                    _sa_info,
                    scopes=['https://www.googleapis.com/auth/cloud-platform']
                )
                _gemini_client = _genai.Client(
                    vertexai=True,
                    project=gcp_project,
                    location=gcp_region,
                    credentials=_credentials,
                )
            elif gemini_key:
                _gemini_client = _genai.Client(api_key=gemini_key)
            else:
                raise ValueError('No Gemini credentials in environment (GEMINI_API_KEY or GCP_SA_KEY+GCP_PROJECT_ID)')

            _prompt = (
                'Watch this YouTube video carefully and provide a complete, word-for-word transcript.\n\n'
                'Return ONLY a valid JSON array — no markdown, no explanation, nothing else:\n'
                '[{"text": "exact spoken words", "start": 0.0, "duration": 5.0}, ...]\n\n'
                'Rules:\n'
                '- "text": verbatim speech (Hindi, English, or mixed — preserve as-is)\n'
                '- "start": seconds from video beginning\n'
                '- "duration": how long this segment plays (seconds)\n'
                '- Each segment = one natural sentence or ~5-15 seconds of speech\n'
                '- If exact timestamps are uncertain, space them evenly based on pacing'
            )

            _response = _gemini_client.models.generate_content(
                model=gemini_model,
                contents=[
                    _genai_types.Content(parts=[
                        _genai_types.Part(
                            file_data=_genai_types.FileData(file_uri=url)
                        ),
                        _genai_types.Part(text=_prompt),
                    ])
                ],
            )

            _text = (_response.text or '').strip()
            _json_match = _re.search(r'\[[\s\S]*\]', _text)
            if _json_match:
                _segs = json.loads(_json_match.group())
                _candidate = []
                for _s in _segs:
                    _t = clean_caption_text(str(_s.get('text', '')))
                    if _t:
                        _candidate.append({
                            'text': _t,
                            'start': float(_s.get('start', 0)),
                            'duration': float(_s.get('duration', 5)),
                        })
                if _candidate:
                    raw = _candidate
                    lang_used = 'gemini'
        except Exception as _ge:
            if not failure_reason:
                failure_reason = str(_ge)

    if not raw:
        # Build specific, actionable error message
        error_code = 'NO_TRANSCRIPT'
        if failure_reason == 'TRANSCRIPTS_DISABLED':
            error_msg = 'Transcripts are disabled for this video. The creator has turned off captions.'
            error_code = 'TRANSCRIPTS_DISABLED'
        elif failure_reason in ('VIDEO_UNAVAILABLE', 'VIDEO_PRIVATE'):
            error_msg = 'This video is private or unavailable. Please try a public video.'
            error_code = 'VIDEO_UNAVAILABLE'
        elif failure_reason == 'RATE_LIMITED':
            error_msg = 'YouTube is blocking too many requests. Please wait a minute and try again.'
            error_code = 'RATE_LIMITED'
        elif failure_reason == 'AGE_RESTRICTED':
            error_msg = 'This video is age-restricted. Transcript could not be fetched.'
            error_code = 'AGE_RESTRICTED'
        else:
            error_msg = 'No transcript found for this video. The creator may have disabled captions, or the video may be too new.'

        available_hint = ''
        if available_langs:
            lang_names = [f"{l['name']} ({l['code']})" for l in available_langs[:5]]
            available_hint = f" Available languages: {', '.join(lang_names)}"

        return jsonify({
            'error': error_msg + available_hint,
            'error_code': error_code,
            'available_languages': available_langs,
        }), 200

    segments = [
        {
            'text': item['text'],
            'start': round(item['start'], 2),
            'end': round(item['start'] + item.get('duration', 0), 2),
            'duration': round(item.get('duration', 0), 2)
        }
        for item in raw
    ]
    full_text = ' '.join(item['text'] for item in raw)

    # Fetch video title, channel, and description via yt-dlp (light, skip-download)
    video_title = ''
    video_description = ''
    video_uploader = ''
    try:
        # Use a unique separator so multi-line description doesn't get truncated by splits.
        SEP = '<<|FIELDSEP|>>'
        meta_result = subprocess.run(
            [_YTDLP_BIN, '--skip-download', '--no-playlist',
             '--no-check-certificates',
             '--extractor-args', 'youtube:player_client=android,android_vr,ios',
             *cookies_args(),
             '--print', f'%(title)s{SEP}%(uploader)s{SEP}%(description)s', url],
            capture_output=True, text=True, timeout=20
        )
        if meta_result.returncode == 0:
            parts = meta_result.stdout.strip().split(SEP)
            video_title = (parts[0].strip() if len(parts) > 0 else '')
            video_uploader = (parts[1].strip() if len(parts) > 1 else '')
            # Cap description at 3000 chars — enough to capture host/guest intros + bios
            video_description = (parts[2].strip()[:3000] if len(parts) > 2 else '')
    except Exception:
        pass

    return jsonify({
        'video_id': video_id,
        'language': lang_used,
        'transcript_source': 'gemini' if lang_used == 'gemini' else 'youtube',
        'segments': segments,
        'full_text': full_text,
        'title': video_title,
        'description': video_description,
        'uploader': video_uploader,
    })


@app.route('/api/youtube/comments', methods=['POST'])
def get_comments():
    """
    Fetch YouTube comments using yt-dlp.
    Returns plain comment texts only (no author, no metadata).
    max_comments: 500 | 5000 | 'all'
    """
    data = request.json or {}
    url = data.get('url', '').strip()
    max_comments = data.get('max_comments', 500)  # 500, 5000, or 'all'

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({'error': 'Invalid YouTube URL'}), 400

    # Build max_comments arg string
    if str(max_comments) == 'all':
        mc_count = 'all'
        timeout_val = 300
    else:
        mc_count = str(max_comments)
        timeout_val = 120

    # Player clients to try in order — web is required for comments scraping
    # yt-dlp 2025+ needs explicit player_client to avoid "not available on this app" error
    COMMENT_CLIENT_ATTEMPTS = [
        f'youtube:comment_sort=top;max_comments={mc_count};player_client=web',
        f'youtube:comment_sort=top;max_comments={mc_count};player_client=mweb',
        f'youtube:max_comments={mc_count};player_client=web',
        f'youtube:player_client=web',
    ]

    with tempfile.TemporaryDirectory() as tmpdir:
        info_path = os.path.join(tmpdir, f'{video_id}.info.json')
        result = None

        for ext_arg in COMMENT_CLIENT_ATTEMPTS:
            if os.path.exists(info_path):
                break
            cmd = [
                _YTDLP_BIN,
                '--write-info-json',
                '--write-comments',
                '--skip-download',
                '--no-playlist',
                '--no-check-certificates',
                *_js_runtime_args(),
                '--extractor-args', ext_arg,
                *cookies_args(),
                '-o', os.path.join(tmpdir, '%(id)s'),
                url
            ]
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_val)
            except subprocess.TimeoutExpired:
                return jsonify({'error': 'Timed out fetching comments (try a video with fewer comments)'}), 500

        if not os.path.exists(info_path):
            stderr_tail = result.stderr[-600:] if result else 'No output'
            return jsonify({'error': 'Could not fetch comments. ' + stderr_tail}), 500

        try:
            with open(info_path, 'r', encoding='utf-8') as f:
                info = json.load(f)

            raw_comments = info.get('comments', [])

            # Top-level comments only:
            # newer yt-dlp sets parent='root' for top-level
            # older yt-dlp sets parent=None/False for top-level
            comments = []
            for c in raw_comments:
                text = c.get('text', '').strip()
                if not text:
                    continue
                parent = c.get('parent')
                # Keep only top-level (root-level) comments
                if parent in (None, False, 'root', ''):
                    comments.append(text)

            return jsonify({
                'video_id': video_id,
                'count': len(comments),
                'comments': comments
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500


@app.route('/api/youtube/download', methods=['POST'])
def download_video():
    """Download YouTube video using yt-dlp."""
    data = request.json or {}
    url = data.get('url', '').strip()
    quality = data.get('quality', '720')  # '360', '480', '720', '1080'

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({'error': 'Invalid YouTube URL'}), 400

    job_id = video_id + '_' + quality
    output_path = os.path.join(DOWNLOAD_DIR, f"{video_id}_{quality}.mp4")

    # Already downloaded
    if os.path.exists(output_path):
        return jsonify({
            'job_id': job_id,
            'status': 'done',
            'filename': os.path.basename(output_path),
            'download_url': f'/api/files/{os.path.basename(output_path)}'
        })

    # Already in progress
    if job_id in active_jobs and active_jobs[job_id]['status'] == 'downloading':
        return jsonify(active_jobs[job_id])

    def do_download():
        import re as _re
        active_jobs[job_id] = {'job_id': job_id, 'status': 'downloading', 'progress': 0, 'speed': '', 'eta': ''}
        try:
            # Format selector: combined formats (like android's format 18) first, then split streams
            format_str = (
                f'bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]'
                f'/best[height<={quality}][ext=mp4]'
                f'/mp4[height<={quality}]'
                f'/bestvideo[height<={quality}]+bestaudio'
                f'/best[height<={quality}]'
                f'/best'
            )

            # Try multiple player clients to bypass SABR/bot restrictions
            # android confirmed working for most videos; android_vr as fallback
            clients_to_try = ['android', 'android_vr', 'ios', None]
            success = False
            last_error = 'yt-dlp download failed'

            for client in clients_to_try:
                if os.path.exists(output_path):
                    os.remove(output_path)

                extractor_args = ['--extractor-args', f'youtube:player_client={client}'] if client else []
                cmd = [
                    _YTDLP_BIN,
                    '-f', format_str,
                    '--merge-output-format', 'mp4',
                    '--newline',
                    '-o', output_path,
                    '--no-playlist',
                    '--no-check-certificates',
                    *_js_runtime_args(),
                    *extractor_args,
                    *cookies_args(),
                    url
                ]
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                for line in proc.stdout:
                    line = line.strip()
                    if '[download]' in line and '%' in line:
                        m = _re.search(r'(\d+\.?\d*)%', line)
                        speed_m = _re.search(r'at\s+([\d.]+\s*\w+/s)', line)
                        eta_m = _re.search(r'ETA\s+([\d:]+)', line)
                        if m:
                            active_jobs[job_id]['progress'] = round(float(m.group(1)), 1)
                        if speed_m:
                            active_jobs[job_id]['speed'] = speed_m.group(1)
                        if eta_m:
                            active_jobs[job_id]['eta'] = eta_m.group(1)
                    elif 'ERROR' in line:
                        last_error = line
                proc.wait(timeout=600)
                if proc.returncode == 0 and os.path.exists(output_path):
                    success = True
                    break

            if success:
                active_jobs[job_id] = {
                    'job_id': job_id,
                    'status': 'done',
                    'progress': 100,
                    'filename': os.path.basename(output_path),
                    'download_url': f'/api/files/{os.path.basename(output_path)}'
                }
            else:
                active_jobs[job_id] = {'job_id': job_id, 'status': 'error', 'error': last_error}
        except subprocess.TimeoutExpired:
            active_jobs[job_id] = {'job_id': job_id, 'status': 'error', 'error': 'Download timed out'}
        except Exception as e:
            active_jobs[job_id] = {'job_id': job_id, 'status': 'error', 'error': str(e)}

    thread = threading.Thread(target=do_download, daemon=True)
    thread.start()

    return jsonify({'job_id': job_id, 'status': 'downloading', 'progress': 0})


@app.route('/api/youtube/download/status/<job_id>', methods=['GET'])
def download_status(job_id):
    """Check download status."""
    if job_id not in active_jobs:
        return jsonify({'status': 'not_found'}), 404
    return jsonify(active_jobs[job_id])


@app.route('/api/files/<filename>', methods=['GET'])
def serve_file(filename):
    """Serve a downloaded file with Range request support for video streaming."""
    from flask import Response
    safe_path = os.path.join(DOWNLOAD_DIR, os.path.basename(filename))
    if not os.path.exists(safe_path):
        return jsonify({'error': 'File not found'}), 404

    file_size = os.path.getsize(safe_path)
    range_header = request.headers.get('Range')

    # Determine MIME type
    ext = os.path.splitext(filename)[1].lower()
    mime = 'video/mp4' if ext == '.mp4' else 'application/octet-stream'

    if range_header:
        # Parse Range: bytes=start-end
        import re as _re
        m = _re.match(r'bytes=(\d+)-(\d*)', range_header)
        if m:
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else file_size - 1
            end = min(end, file_size - 1)
            length = end - start + 1

            with open(safe_path, 'rb') as f:
                f.seek(start)
                data = f.read(length)

            resp = Response(data, status=206, mimetype=mime)
            resp.headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
            resp.headers['Accept-Ranges'] = 'bytes'
            resp.headers['Content-Length'] = str(length)
            return resp

    # Full file — use context manager to avoid file handle leak
    with open(safe_path, 'rb') as f:
        data = f.read()
    resp = Response(data, status=200, mimetype=mime)
    resp.headers['Accept-Ranges'] = 'bytes'
    resp.headers['Content-Length'] = str(file_size)
    return resp


@app.route('/api/youtube/video-info', methods=['POST'])
def video_info():
    """Get video duration using ffprobe."""
    import re as _re
    data = request.json or {}
    filename = data.get('filename', '')
    safe_path = os.path.join(DOWNLOAD_DIR, os.path.basename(filename))
    if not os.path.exists(safe_path):
        return jsonify({'error': 'File not found'}), 404

    try:
        cmd = [
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', '-show_streams', safe_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        info = json.loads(result.stdout)
        duration = float(info.get('format', {}).get('duration', 0))
        # Get width/height from first video stream
        width, height = 0, 0
        for stream in info.get('streams', []):
            if stream.get('codec_type') == 'video':
                width = stream.get('width', 0)
                height = stream.get('height', 0)
                break
        return jsonify({'duration': duration, 'width': width, 'height': height})
    except Exception as e:
        return jsonify({'error': str(e), 'duration': 0}), 200


@app.route('/api/video/edit', methods=['POST'])
def edit_video():
    """
    Apply simple edits to a video using ffmpeg.
    Operations supported:
      - cuts: list of {start, end} to keep (trim)
      - zoom: float (e.g. 1.5 = 150% zoom, centered)
      - black_bars: 'none' | 'top_bottom' | 'sides' | 'both' (9:16 letterbox/pillarbox)
    """
    data = request.json or {}
    filename = data.get('filename', '')
    cuts = data.get('cuts', [])          # [{start, end, zoom?, pan_x?, pan_y?}, ...]
    zoom = data.get('zoom', 1.0)         # 1.0 = no zoom (global, for no-cut mode)
    pan_x = data.get('pan_x', 0)        # % offset from center, global
    pan_y = data.get('pan_y', 0)
    black_bars = data.get('black_bars', 'none')  # 'none','top_bottom','sides','both'
    output_name = data.get('output_name', 'edited_output.mp4')

    safe_name = os.path.basename(filename)
    input_path = os.path.join(DOWNLOAD_DIR, safe_name)
    if not os.path.exists(input_path):
        return jsonify({'error': f'File not found: {safe_name}'}), 404

    output_path = os.path.join(DOWNLOAD_DIR, os.path.basename(output_name))

    try:
        # Build pad filter (black bars) — applied globally or per-segment
        pad_filter = None
        if black_bars == 'top_bottom':
            pad_filter = "pad=iw:iw*16/9:0:(oh-ih)/2:black"
        elif black_bars == 'sides':
            pad_filter = "pad=ih*9/16:ih:(ow-iw)/2:0:black"
        elif black_bars == 'both':
            pad_filter = "pad=iw:iw*16/9:0:(oh-ih)/2:black"

        # Build full vf_filter for no-cut mode (global zoom + pad)
        vf_parts = []
        if zoom and float(zoom) != 1.0:
            z = float(zoom)
            px = float(pan_x)
            py = float(pan_y)
            crop_w = f"iw/{z}"
            crop_h = f"ih/{z}"
            crop_x = f"(iw-iw/{z})/2+iw*{px}/(100*{z})"
            crop_y = f"(ih-ih/{z})/2+ih*{py}/(100*{z})"
            vf_parts.append(f"scale=iw*{z}:ih*{z}")
            vf_parts.append(f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}")
        if pad_filter:
            vf_parts.append(pad_filter)
        vf_filter = ','.join(vf_parts) if vf_parts else None

        # Step 3: cuts - if cuts provided, use complex filter with concat
        if cuts:
            # Each cut may have its own zoom/pan_x/pan_y override
            segments = []
            for i, cut in enumerate(cuts):
                s = float(cut.get('start', 0))
                e = float(cut.get('end', 0))
                # Per-segment zoom/pan (overrides global)
                seg_z = float(cut.get('zoom', zoom if zoom else 1.0))
                seg_px = float(cut.get('pan_x', 0))  # % offset from center
                seg_py = float(cut.get('pan_y', 0))

                v_ops = f"trim=start={s}:end={e},setpts=PTS-STARTPTS"
                if seg_z and seg_z != 1.0:
                    # After scale, iw/ih refer to scaled dims (orig * seg_z).
                    # Crop output = original dims = iw/seg_z x ih/seg_z.
                    # Center crop x = (iw - iw/seg_z) / 2
                    # Pan offset x = pan_x% of original = iw * pan_x / (100 * seg_z)
                    crop_w = f"iw/{seg_z}"
                    crop_h = f"ih/{seg_z}"
                    crop_x = f"(iw-iw/{seg_z})/2+iw*{seg_px}/(100*{seg_z})"
                    crop_y = f"(ih-ih/{seg_z})/2+ih*{seg_py}/(100*{seg_z})"
                    v_ops += f",scale=iw*{seg_z}:ih*{seg_z},crop={crop_w}:{crop_h}:{crop_x}:{crop_y}"
                # Apply black_bars pad filter per segment (separate from zoom)
                if pad_filter:
                    v_ops += f",{pad_filter}"
                segments.append(f"[0:v]{v_ops}[v{i}]")
                segments.append(f"[0:a]atrim=start={s}:end={e},asetpts=PTS-STARTPTS[a{i}]")

            n = len(cuts)
            concat_v = ''.join(f'[v{i}]' for i in range(n))
            concat_a = ''.join(f'[a{i}]' for i in range(n))
            filter_complex = ';'.join(segments) + f';{concat_v}{concat_a}concat=n={n}:v=1:a=1[outv][outa]'
            map_v = '[outv]'

            cmd = [
                'ffmpeg', '-y', '-i', input_path,
                '-filter_complex', filter_complex,
                '-map', map_v,
                '-map', '[outa]',
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-c:a', 'aac',
                output_path
            ]
        else:
            # No cuts, just apply video filters
            cmd = ['ffmpeg', '-y', '-i', input_path]
            if vf_filter:
                cmd += ['-vf', vf_filter]
            cmd += ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'copy', output_path]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0 and os.path.exists(output_path):
            return jsonify({
                'status': 'done',
                'filename': os.path.basename(output_path),
                'download_url': f'/api/files/{os.path.basename(output_path)}'
            })
        else:
            return jsonify({'error': result.stderr[-1000:]}), 500

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Video editing timed out'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/video/merge', methods=['POST'])
def merge_videos():
    """
    Merge two videos: [intro (YouTube/edited)] + [main (rendered by browser)].
    Intro file is already on the server (by filename).
    Main video is uploaded as multipart form data.

    Form fields:
      - intro_filename: filename already in downloads/ (YouTube or edited video)
      - rendered_video: uploaded .mp4 file (the browser-rendered debate video)
      - output_name: (optional) output filename
    """
    import time as _time
    intro_filename = request.form.get('intro_filename', '')
    output_name = request.form.get('output_name', f'merged_{int(_time.time() * 1000)}.mp4')

    if not intro_filename:
        return jsonify({'error': 'intro_filename is required'}), 400

    if 'rendered_video' not in request.files:
        return jsonify({'error': 'rendered_video file is required'}), 400

    # Validate intro file
    safe_intro = os.path.basename(intro_filename)
    intro_path = os.path.join(DOWNLOAD_DIR, safe_intro)
    if not os.path.exists(intro_path):
        return jsonify({'error': f'Intro file not found: {safe_intro}'}), 404

    # Save uploaded rendered video
    rendered_file = request.files['rendered_video']
    unique_id = int(_time.time() * 1000)
    rendered_filename = f'rendered_upload_{unique_id}.mp4'
    rendered_path = os.path.join(DOWNLOAD_DIR, rendered_filename)
    rendered_file.save(rendered_path)

    # Use a unique concat list per request to avoid race conditions
    list_path = os.path.join(DOWNLOAD_DIR, f'_concat_list_{unique_id}.txt')
    output_path = os.path.join(DOWNLOAD_DIR, os.path.basename(output_name))

    try:
        with open(list_path, 'w') as f:
            f.write(f"file '{intro_path}'\n")
            f.write(f"file '{rendered_path}'\n")

        # Use ffmpeg concat demuxer - fastest for same-codec videos
        # Re-encode to ensure compatibility between YT video and rendered video
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0', '-i', list_path,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '192k',
            '-movflags', '+faststart',
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

        if result.returncode == 0 and os.path.exists(output_path):
            return jsonify({
                'status': 'done',
                'filename': os.path.basename(output_path),
                'download_url': f'/api/files/{os.path.basename(output_path)}',
                'size_mb': round(os.path.getsize(output_path) / (1024 * 1024), 2)
            })
        else:
            return jsonify({'error': result.stderr[-1000:]}), 500

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Merge timed out (video too long)'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Always clean up temp files regardless of success or failure
        for p in (list_path, rendered_path):
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass



# ──────────────────────────────────────────────────────────────────────────────
# Instagram Routes
# ──────────────────────────────────────────────────────────────────────────────

def shortcode_to_mediaid(shortcode: str) -> str | None:
    """Convert Instagram shortcode to numeric media ID (base64 with IG alphabet)."""
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    n = 0
    for char in shortcode:
        if char not in alphabet:
            return None
        n = n * 64 + alphabet.index(char)
    return str(n)


def extract_instagram_shortcode(url: str):
    """Extract Instagram post shortcode from URL."""
    import re
    patterns = [
        r'instagram\.com/p/([A-Za-z0-9_-]+)',
        r'instagram\.com/reel/([A-Za-z0-9_-]+)',
        r'instagram\.com/reels/([A-Za-z0-9_-]+)',
        r'instagram\.com/tv/([A-Za-z0-9_-]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def shortcode_to_mediaid(shortcode: str) -> str:
    """Convert Instagram shortcode to numeric media ID (base64 with IG alphabet)."""
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    n = 0
    for char in shortcode:
        n = n * 64 + alphabet.index(char)
    return str(n)


def extract_reddit_post_id(url: str):
    """Extract Reddit post ID from URL."""
    import re
    m = re.search(r'/comments/([a-zA-Z0-9]+)', url)
    if m:
        return m.group(1)
    m = re.search(r'redd\.it/([a-zA-Z0-9]+)', url)
    return m.group(1) if m else None


@app.route('/api/instagram/info', methods=['POST'])
def instagram_info():
    """Get Instagram post info using yt-dlp."""
    data = request.json or {}
    url = data.get('url', '').strip()
    if not url:
        return jsonify({'error': 'URL is required'}), 400

    shortcode = extract_instagram_shortcode(url)
    if not shortcode:
        return jsonify({'error': 'Invalid Instagram URL. Supported: /p/, /reel/, /reels/, /tv/'}), 400

    try:
        cmd = [
            _YTDLP_BIN,
            '--skip-download',
            '--no-playlist',
            '--print', '%(title)s\n%(uploader)s\n%(thumbnail)s\n%(duration)s\n%(like_count)s\n%(view_count)s\n%(description)s',
            *cookies_args(),
            url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
        if result.returncode != 0:
            err = result.stderr
            if 'login' in err.lower() or 'log in' in err.lower():
                return jsonify({'error': 'This post requires Instagram login. Upload a cookies file to proceed.', 'error_code': 'LOGIN_REQUIRED'}), 403
            return jsonify({'error': 'Could not fetch post info: ' + err[-400:]}), 500

        lines = result.stdout.strip().split('\n')
        return jsonify({
            'shortcode': shortcode,
            'title': lines[0] if len(lines) > 0 else '',
            'uploader': lines[1] if len(lines) > 1 else '',
            'thumbnail': lines[2] if len(lines) > 2 else '',
            'duration': lines[3] if len(lines) > 3 else '',
            'like_count': lines[4] if len(lines) > 4 else '',
            'view_count': lines[5] if len(lines) > 5 else '',
            'description': '\n'.join(lines[6:]) if len(lines) > 6 else '',
        })
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Request timed out'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/instagram/download', methods=['POST'])
def instagram_download():
    """Download Instagram video/reel using yt-dlp (background job)."""
    data = request.json or {}
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    shortcode = extract_instagram_shortcode(url)
    if not shortcode:
        return jsonify({'error': 'Invalid Instagram URL'}), 400

    job_id = f'ig_{shortcode}'
    output_path = os.path.join(DOWNLOAD_DIR, f'ig_{shortcode}.mp4')

    if os.path.exists(output_path):
        return jsonify({
            'job_id': job_id,
            'status': 'done',
            'progress': 100,
            'filename': os.path.basename(output_path),
            'download_url': f'/api/files/{os.path.basename(output_path)}'
        })

    if job_id in active_jobs and active_jobs[job_id]['status'] == 'downloading':
        return jsonify(active_jobs[job_id])

    def do_download():
        import re as _re
        active_jobs[job_id] = {'job_id': job_id, 'status': 'downloading', 'progress': 0, 'speed': '', 'eta': ''}
        try:
            cmd = [
                _YTDLP_BIN,
                '-f', 'best[ext=mp4]/best',
                '--merge-output-format', 'mp4',
                '--newline',
                '--no-playlist',
                *cookies_args(),
                '-o', output_path,
                url
            ]
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            for line in proc.stdout:
                line = line.strip()
                if '[download]' in line and '%' in line:
                    m = _re.search(r'(\d+\.?\d*)%', line)
                    speed_m = _re.search(r'at\s+([\d.]+\s*\w+/s)', line)
                    eta_m = _re.search(r'ETA\s+([\d:]+)', line)
                    if m:
                        active_jobs[job_id]['progress'] = round(float(m.group(1)), 1)
                    if speed_m:
                        active_jobs[job_id]['speed'] = speed_m.group(1)
                    if eta_m:
                        active_jobs[job_id]['eta'] = eta_m.group(1)
            proc.wait(timeout=300)
            if proc.returncode == 0 and os.path.exists(output_path):
                active_jobs[job_id] = {
                    'job_id': job_id, 'status': 'done', 'progress': 100,
                    'filename': os.path.basename(output_path),
                    'download_url': f'/api/files/{os.path.basename(output_path)}'
                }
            else:
                active_jobs[job_id] = {'job_id': job_id, 'status': 'error', 'error': 'yt-dlp download failed. The post may be private or require login.'}
        except subprocess.TimeoutExpired:
            active_jobs[job_id] = {'job_id': job_id, 'status': 'error', 'error': 'Download timed out'}
        except Exception as e:
            active_jobs[job_id] = {'job_id': job_id, 'status': 'error', 'error': str(e)}

    thread = threading.Thread(target=do_download, daemon=True)
    thread.start()

    return jsonify({'job_id': job_id, 'status': 'downloading', 'progress': 0})


@app.route('/api/instagram/download/status/<job_id>', methods=['GET'])
def instagram_download_status(job_id):
    """Check Instagram download status."""
    if job_id not in active_jobs:
        return jsonify({'status': 'not_found'}), 404
    return jsonify(active_jobs[job_id])


def _scrape_instagram_comments(job_id: str, url: str, shortcode: str, max_comments: int):
    """
    Background worker: scrape Instagram comments.
    Strategy chain:
      1. curl_cffi + Chrome TLS impersonation + web cookies — best for browser-exported cookies
      2. instagrapi + Android API — only works if cookies came from an Android app session
    Updates active_jobs[job_id] with status/result.
    max_comments: 0 = no limit.
    """
    active_jobs[job_id] = {'status': 'scraping', 'job_id': job_id, 'message': 'Starting…'}

    def update(msg: str):
        active_jobs[job_id]['message'] = msg

    last_error = None
    last_error_code = 'SCRAPE_ERROR'

    def finish_ok(comments, source):
        print(f'[IG Comments] ✓ SUCCESS via [{source}] — {len(comments)} comments  (shortcode={shortcode})')
        active_jobs[job_id] = {
            'status': 'done', 'job_id': job_id,
            'shortcode': shortcode, 'count': len(comments),
            'comments': comments, 'source': source,
        }

    def finish_err(msg, code='SCRAPE_ERROR'):
        print(f'[IG Comments] ✗ ALL STRATEGIES FAILED (shortcode={shortcode}): {msg}')
        active_jobs[job_id] = {
            'status': 'error', 'job_id': job_id,
            'error': msg, 'error_code': code,
        }

    # ── Strategy 1: curl_cffi — Chrome TLS + web cookies (best for web sessions) ─
    # Web-browser cookies don't work with the Android instagrapi API
    # (causes challenge_required/unsupported_version errors). This strategy uses
    # the same i.instagram.com endpoint via Chrome TLS impersonation + web headers,
    # which is what works when the user uploaded cookies from a browser.
    update('Connecting via Chrome TLS…')
    try:
        from curl_cffi import requests as cffi_req
        import json as _json
        import time as _time

        ig_cookies = get_instagram_cookies()
        media_id = shortcode_to_mediaid(shortcode)
        if not media_id:
            raise Exception(f'Invalid shortcode: {shortcode}')

        sess_cffi = cffi_req.Session(impersonate='chrome124')
        if ig_cookies:
            for name, val in ig_cookies.items():
                sess_cffi.cookies.set(name, val, domain='.instagram.com')

        cffi_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': f'https://www.instagram.com/p/{shortcode}/',
            'Origin': 'https://www.instagram.com',
        }

        collected = []
        min_id = None
        page = 0
        for _page in range(60):   # safety cap — ~1500 comments at 25/page
            params = {'can_support_threading': 'true', 'permalink_enabled': 'false'}
            if min_id:
                params['min_id'] = min_id
            r = sess_cffi.get(
                f'https://i.instagram.com/api/v1/media/{media_id}/comments/',
                params=params, headers=cffi_headers, timeout=20,
            )
            if r.status_code == 401 or r.status_code == 403:
                raise Exception(f'HTTP {r.status_code} (Unauthorized — cookies may be expired)')
            if r.status_code == 429:
                raise Exception('HTTP 429 (Rate limited — wait a few minutes)')
            if r.status_code != 200:
                raise Exception(f'HTTP {r.status_code}: {r.text[:120]}')

            try:
                d = r.json()
            except Exception:
                raise Exception(f'Non-JSON response: {r.text[:120]}')

            for c in d.get('comments', []):
                text = (c.get('text') or '').strip()
                if text:
                    collected.append(text)
                if max_comments > 0 and len(collected) >= max_comments:
                    break

            page += 1
            update(f'Fetching comments… {len(collected)} so far (page {page})')

            if max_comments > 0 and len(collected) >= max_comments:
                break
            next_min = d.get('next_min_id')
            if not next_min or not d.get('has_more_comments'):
                break
            min_id = next_min
            _time.sleep(0.4)

        comments = collected[:max_comments] if max_comments > 0 else collected

        # If main endpoint returned nothing, try GraphQL fallback (older posts)
        if not comments:
            update('Trying GraphQL fallback…')
            try:
                gql_params = {
                    'doc_id': '9310670392322965',
                    'variables': _json.dumps({'shortcode': shortcode, 'first': 50}),
                }
                gr = sess_cffi.get('https://www.instagram.com/graphql/query/', params=gql_params,
                                   headers=cffi_headers, timeout=20)
                if gr.status_code == 200:
                    edges = (gr.json().get('data', {}).get('xdt_shortcode_media', {})
                             .get('edge_media_to_parent_comment', {}).get('edges', []))
                    for edge in edges:
                        text = (edge.get('node', {}).get('text') or '').strip()
                        if text:
                            comments.append(text)
                            if max_comments > 0 and len(comments) >= max_comments:
                                break
            except Exception:
                pass

        if comments:
            return finish_ok(comments, 'curl_cffi')
        last_error = 'curl_cffi: 0 comments returned'

    except ImportError:
        last_error = 'curl_cffi not installed'
    except Exception as e0:
        err0 = str(e0)
        if any(k in err0.lower() for k in ['401', '403', 'login', 'forbidden', 'challenge', 'unauthorized', 'cookie']):
            last_error_code = 'LOGIN_REQUIRED'
        last_error = f'curl_cffi: {err0}'

    # ── Strategy 2: instagrapi — only useful if cookies are from Android app ─
    update('Trying instagrapi fallback…')
    try:
        import time as _time
        from instagrapi import Client as IGClient

        ig_cookies = get_instagram_cookies()
        if not ig_cookies or 'sessionid' not in ig_cookies:
            raise Exception('No session cookies')

        cl = IGClient()
        cl.set_settings({'authorization_data': {'sessionid': ig_cookies.get('sessionid', '')}})
        for name, val in ig_cookies.items():
            cl.private.cookies.set(name, val, domain='.instagram.com', path='/')
        cl.private.headers.update({
            'User-Agent': 'Instagram 380.0.0.40.110 Android (33/13; 420dpi; 1080x2400; samsung; SM-G998B; o1s; exynos2100; en_US; 670268615)',
        })

        mpk = cl.media_pk_from_url(url)
        collected = []
        min_id = None
        page = 0
        while True:
            try:
                chunk, min_id = cl.media_comments_chunk(mpk, 20, min_id=min_id)
            except (AttributeError, TypeError):
                raw_all = cl.media_comments(mpk, amount=max_comments if max_comments > 0 else 0)
                for c in raw_all:
                    text = (c.text or '').strip()
                    if text:
                        collected.append(text)
                min_id = None
                break

            for c in chunk:
                text = (c.text or '').strip()
                if text:
                    collected.append(text)
                if max_comments > 0 and len(collected) >= max_comments:
                    break

            page += 1
            update(f'instagrapi: {len(collected)} comments (page {page})')
            if not min_id:
                break
            if max_comments > 0 and len(collected) >= max_comments:
                break
            _time.sleep(0.4)

        comments = collected[:max_comments] if max_comments > 0 else collected
        if comments:
            return finish_ok(comments, 'instagrapi')
        if not last_error:
            last_error = 'instagrapi: 0 comments'

    except ImportError:
        if not last_error:
            last_error = 'instagrapi not installed'
    except Exception as e1:
        err1 = str(e1)
        if 'challenge_required' in err1.lower() or 'unsupported_version' in err1.lower():
            # Specific message — web cookies hit Android API mismatch
            if not last_error or 'curl_cffi' in (last_error or ''):
                last_error = (last_error or '') + ' | instagrapi: web cookies incompatible with Android API'
        elif any(k in err1.lower() for k in ['401', '403', 'login', 'forbidden', 'unauthorized']):
            last_error_code = 'LOGIN_REQUIRED'
            if not last_error:
                last_error = f'instagrapi: {err1}'

    # ── Failed ────────────────────────────────────────────────────────────────
    if last_error_code == 'LOGIN_REQUIRED':
        msg = 'Instagram blocked the request (login/auth required). Cookies may be expired or rate-limited — upload fresh cookies.txt from a logged-in browser session.'
    else:
        msg = last_error or 'Could not fetch comments. Try uploading fresh cookies.txt or wait a few minutes if rate-limited.'
    finish_err(msg, last_error_code)


@app.route('/api/instagram/comments', methods=['POST'])
def instagram_comments():
    """
    Start a background comment-scraping job.
    Returns {job_id, status:'scraping'} immediately.
    Poll /api/instagram/comments/status/<job_id> for result.
    max_comments: 50 | 100 | 500 | 1000 | 5000 | 'all'
    """
    data = request.json or {}
    url = data.get('url', '').strip()
    raw_max = data.get('max_comments', 100)
    if str(raw_max).lower() == 'all' or raw_max == 0:
        max_comments = 0
    else:
        max_comments = int(raw_max)

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    shortcode = extract_instagram_shortcode(url)
    if not shortcode:
        return jsonify({'error': 'Invalid Instagram URL'}), 400

    job_id = f'igc_{shortcode}_{max_comments}'

    # Return cached result if job already finished successfully
    existing = active_jobs.get(job_id, {})
    if existing.get('status') == 'done':
        return jsonify(existing)

    # Already running — return current status
    if existing.get('status') == 'scraping':
        return jsonify(existing)

    # Start background thread
    thread = threading.Thread(
        target=_scrape_instagram_comments,
        args=(job_id, url, shortcode, max_comments),
        daemon=True
    )
    thread.start()

    return jsonify({'job_id': job_id, 'status': 'scraping', 'message': 'Starting…'})


@app.route('/api/instagram/comments/status/<job_id>', methods=['GET'])
def instagram_comments_status(job_id):
    """Poll background comment-scraping job."""
    job = active_jobs.get(job_id)
    if not job:
        return jsonify({'status': 'not_found'}), 404
    return jsonify(job)


# ═══════════════════════════════════════════════════════════════════════════════
# Reddit API — uses Reddit's public JSON API (no auth required for public posts)
# ═══════════════════════════════════════════════════════════════════════════════

REDDIT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 DebateForge/1.0 (comment scraper; contact@debateforge.app)',
    'Accept': 'application/json',
}


def _reddit_get(path: str, params: dict = None):
    """GET from Reddit JSON API with retries."""
    import requests as req_lib
    url = f'https://www.reddit.com{path}'
    r = req_lib.get(url, headers=REDDIT_HEADERS, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def _flatten_comments(listing: dict, include_replies: bool, max_depth: int, depth: int = 0) -> list:
    """Recursively extract comment text from Reddit comment listing."""
    results = []
    for child in (listing.get('data') or {}).get('children', []):
        kind = child.get('kind')
        if kind != 't1':
            continue
        data = child['data']
        body = (data.get('body') or '').strip()
        if body and body not in ('[deleted]', '[removed]'):
            results.append(body)
        if include_replies and depth < max_depth:
            replies = data.get('replies')
            if isinstance(replies, dict):
                results.extend(_flatten_comments(replies, include_replies, max_depth, depth + 1))
    return results


@app.route('/api/reddit/info', methods=['POST'])
def reddit_info():
    """Get Reddit post metadata."""
    data = request.json or {}
    url = data.get('url', '').strip()
    if not url:
        return jsonify({'error': 'URL is required'}), 400

    post_id = extract_reddit_post_id(url)
    if not post_id:
        return jsonify({'error': 'Invalid Reddit URL. Supported: reddit.com/r/.../comments/{id}/... or redd.it/{id}', 'error_code': 'INVALID_URL'}), 400

    try:
        res = _reddit_get(f'/comments/{post_id}.json', {'limit': 1, 'depth': 0})
        post = res[0]['data']['children'][0]['data']
        return jsonify({
            'post_id': post_id,
            'title': post.get('title', ''),
            'author': post.get('author', ''),
            'subreddit': post.get('subreddit', ''),
            'subreddit_prefixed': post.get('subreddit_name_prefixed', f"r/{post.get('subreddit','')}"),
            'score': post.get('score', 0),
            'upvote_ratio': post.get('upvote_ratio', 0),
            'num_comments': post.get('num_comments', 0),
            'selftext': post.get('selftext', ''),
            'url': post.get('url', ''),
            'permalink': f"https://www.reddit.com{post.get('permalink', '')}",
            'thumbnail': post.get('thumbnail', ''),
            'is_self': post.get('is_self', True),
            'flair': post.get('link_flair_text', ''),
        })
    except Exception as e:
        err = str(e)
        if '403' in err or '401' in err:
            return jsonify({'error': 'Reddit blocked the request. Post may be private or NSFW.', 'error_code': 'REDDIT_BLOCKED'}), 403
        if '404' in err:
            return jsonify({'error': 'Post not found. Check the URL.', 'error_code': 'NOT_FOUND'}), 404
        return jsonify({'error': f'Failed to fetch post info: {err}', 'error_code': 'SCRAPE_ERROR'}), 500


@app.route('/api/reddit/comments', methods=['POST'])
def reddit_comments():
    """
    Scrape Reddit post comments using the public JSON API.
    No authentication required for public posts.
    """
    data = request.json or {}
    url = data.get('url', '').strip()
    raw_max = data.get('max_comments', 100)
    include_replies = bool(data.get('include_replies', False))
    sort = data.get('sort', 'top')  # top, best, new, controversial, old

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    max_comments = 0 if str(raw_max).lower() == 'all' else int(raw_max)

    post_id = extract_reddit_post_id(url)
    if not post_id:
        return jsonify({'error': 'Invalid Reddit URL', 'error_code': 'INVALID_URL'}), 400

    try:
        limit = min(max_comments * 3, 500) if max_comments > 0 else 500
        res = _reddit_get(
            f'/comments/{post_id}.json',
            {'limit': limit, 'depth': 6 if include_replies else 1, 'sort': sort},
        )

        post = res[0]['data']['children'][0]['data']
        all_comments = _flatten_comments(res[1], include_replies, max_depth=5)

        if max_comments > 0:
            all_comments = all_comments[:max_comments]

        return jsonify({
            'post_id': post_id,
            'title': post.get('title', ''),
            'author': post.get('author', ''),
            'subreddit': post.get('subreddit_name_prefixed', ''),
            'count': len(all_comments),
            'comments': all_comments,
            'source': 'reddit-json-api',
        })

    except Exception as e:
        err = str(e)
        if '403' in err or 'blocked' in err.lower():
            return jsonify({'error': 'Reddit blocked the request. Post may be private, NSFW-gated, or quarantined.', 'error_code': 'REDDIT_BLOCKED'}), 403
        if '404' in err:
            return jsonify({'error': 'Post not found.', 'error_code': 'NOT_FOUND'}), 404
        return jsonify({'error': f'Failed to fetch comments: {err}', 'error_code': 'SCRAPE_ERROR'}), 500


@app.route('/api/shorts/render', methods=['POST'])
def render_short_clip():
    """
    Download a YouTube video, trim it to the selected segment,
    and optionally overlay subtitle images at their timestamps.
    Body JSON:
      videoId: str
      trimStart: float   (seconds from start of full video)
      trimEnd: float     (seconds from start of full video)
      subtitleLayers: list of {start, end, text, imageDataUrl}  (optional)
    Returns: mp4 video file
    """
    import base64
    from flask import Response

    data = request.get_json(force=True) or {}
    video_id = data.get('videoId', '').strip()
    try:
        trim_start = float(data.get('trimStart', 0))
        trim_end   = float(data.get('trimEnd', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'trimStart/trimEnd must be numbers'}), 400

    subtitle_layers = data.get('subtitleLayers', []) or []
    aspect_ratio = data.get('aspectRatio', '16:9')  # '9:16' for Shorts, '16:9' for Long
    is_vertical = aspect_ratio == '9:16'

    if not video_id:
        return jsonify({'error': 'videoId is required'}), 400
    if trim_end <= trim_start:
        return jsonify({'error': 'trimEnd must be greater than trimStart'}), 400

    duration = trim_end - trim_start
    yt_url = f'https://www.youtube.com/watch?v={video_id}'

    with tempfile.TemporaryDirectory() as tmpdir:
        raw_path = os.path.join(tmpdir, 'raw.mp4')

        # Step 1 — Download with yt-dlp (try multiple clients to bypass SABR)
        base_yt_args = [
            _YTDLP_BIN,
            *cookies_args(),
            '--no-check-certificates',
            *_js_runtime_args(),
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '-o', raw_path,
            yt_url,
        ]
        dl_success = False
        last_dl_err = ''
        for client in ['android', 'web', 'mweb', 'ios', None]:
            if os.path.exists(raw_path):
                os.remove(raw_path)
            ext_args = ['--extractor-args', f'youtube:player_client={client}'] if client else []
            r = subprocess.run(base_yt_args[:1] + ext_args + base_yt_args[1:],
                               capture_output=True, text=True, timeout=480)
            if r.returncode == 0 and os.path.exists(raw_path):
                dl_success = True
                break
            last_dl_err = r.stderr[-600:] if r.stderr else r.stdout[-600:]
        if not dl_success:
            return jsonify({'error': f'Download failed: {last_dl_err}'}), 500

        # Step 2 — Trim + optional 9:16 conversion for Shorts
        trimmed_path = os.path.join(tmpdir, 'trimmed.mp4')
        # For 9:16 Shorts: center-crop the 16:9 frame to 9:16, then scale to 1080×1920
        # crop=ih*9/16:ih crops width to 9/16 of height, keeps full height, centered
        vf_filter = 'crop=ih*9/16:ih,scale=1080:1920' if is_vertical else None
        trim_cmd = [
            'ffmpeg', '-y',
            '-ss', str(trim_start),
            '-i', raw_path,
            '-t', str(duration),
            *(['-vf', vf_filter] if vf_filter else []),
            '-c:v', 'libx264', '-c:a', 'aac',
            '-movflags', '+faststart',
            trimmed_path,
        ]
        r = subprocess.run(trim_cmd, capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            return jsonify({'error': f'Trim failed: {r.stderr[-600:]}'}), 500

        # Step 3 — Image overlays (if any subtitle layers have images)
        image_layers = [l for l in subtitle_layers if l.get('imageDataUrl')]

        if not image_layers:
            with open(trimmed_path, 'rb') as f:
                video_bytes = f.read()
            return Response(
                video_bytes,
                mimetype='video/mp4',
                headers={'Content-Disposition': f'attachment; filename="{"short_9x16" if is_vertical else "long_16x9"}_clip.mp4"'}
            )

        # Save each image and compute time relative to clip start
        overlay_info = []
        for i, layer in enumerate(image_layers):
            img_data = layer['imageDataUrl']
            if ',' in img_data:
                img_data = img_data.split(',', 1)[1]
            img_bytes = base64.b64decode(img_data)
            img_path = os.path.join(tmpdir, f'img_{i}.png')
            with open(img_path, 'wb') as f:
                f.write(img_bytes)
            rel_start = max(0.0, float(layer.get('start', 0)) - trim_start)
            rel_end   = min(duration, float(layer.get('end', duration)) - trim_start)
            overlay_info.append({'path': img_path, 'start': rel_start, 'end': rel_end})

        # Build ffmpeg filter_complex for overlays
        ffmpeg_inputs = ['-i', trimmed_path]
        for ov in overlay_info:
            ffmpeg_inputs += ['-loop', '1', '-i', ov['path']]

        filter_parts = []
        last_label = '[0:v]'
        for i, ov in enumerate(overlay_info):
            enable = f"enable='between(t,{ov['start']:.3f},{ov['end']:.3f})'"
            scale_label = f'[sc{i}]'
            out_label   = f'[ov{i}]'
            # Scale image to 25% of video width, position bottom-right with 20px padding
            filter_parts.append(f'[{i+1}:v]scale=iw*0.25:-1{scale_label}')
            filter_parts.append(f'{last_label}{scale_label}overlay=W-w-20:H-h-20:{enable}{out_label}')
            last_label = out_label

        final_path = os.path.join(tmpdir, 'final.mp4')
        overlay_cmd = [
            'ffmpeg', '-y',
            *ffmpeg_inputs,
            '-filter_complex', ';'.join(filter_parts),
            '-map', last_label,
            '-map', '0:a',
            '-c:v', 'libx264', '-c:a', 'aac',
            '-movflags', '+faststart',
            final_path,
        ]
        r = subprocess.run(overlay_cmd, capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            return jsonify({'error': f'Overlay failed: {r.stderr[-600:]}'}), 500

        with open(final_path, 'rb') as f:
            video_bytes = f.read()

    return Response(
        video_bytes,
        mimetype='video/mp4',
        headers={'Content-Disposition': f'attachment; filename="{"short_9x16" if is_vertical else "long_16x9"}_clip.mp4"'}
    )


@app.route('/api/files', methods=['GET'])
def list_files():
    """List all downloaded/edited files."""
    files = []
    for f in os.listdir(DOWNLOAD_DIR):
        if f.endswith('.mp4') or f.endswith('.webm') or f.endswith('.mkv'):
            path = os.path.join(DOWNLOAD_DIR, f)
            files.append({
                'filename': f,
                'size_mb': round(os.path.getsize(path) / (1024 * 1024), 2),
                'download_url': f'/api/files/{f}'
            })
    return jsonify({'files': files})


if __name__ == '__main__':
    print("=" * 50)
    print("Podcast-basiks Flask Server")
    print("=" * 50)
    print(f"Downloads folder: {DOWNLOAD_DIR}")
    print(f"Transcript API: {'Available' if TRANSCRIPT_API_AVAILABLE else 'NOT installed'}")
    print()
    print("Termux setup commands:")
    print("  pkg install python ffmpeg")
    print("  pip install flask flask-cors yt-dlp youtube-transcript-api")
    print()
    print("Starting server on http://0.0.0.0:8000")
    print("From React app use: http://<your-phone-ip>:8000")
    print("=" * 50)
    app.run(host='0.0.0.0', port=8000, debug=False)
