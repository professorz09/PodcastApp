"""
Flask server for Podcast-basiks
YouTube transcript scraping + video download + basic video editing
Run on Termux: python flask_server.py

Requirements: pip install flask flask-cors yt-dlp youtube-transcript-api
Also need: ffmpeg (pkg install ffmpeg in Termux)
"""

import os
import json
import subprocess
import tempfile
import threading
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    TRANSCRIPT_API_AVAILABLE = True
except ImportError:
    TRANSCRIPT_API_AVAILABLE = False

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


@app.route('/api/cookies/upload', methods=['POST'])
def upload_cookies():
    """Upload a Netscape-format cookies.txt file for YouTube authentication."""
    if 'file' in request.files:
        f = request.files['file']
        content = f.read().decode('utf-8', errors='replace')
    elif request.is_json:
        content = (request.json or {}).get('content', '')
    else:
        content = request.data.decode('utf-8', errors='replace')

    if not content.strip():
        return jsonify({'error': 'Empty cookies file'}), 400

    with open(COOKIES_FILE, 'w', encoding='utf-8') as out:
        out.write(content)

    return jsonify({'ok': True, 'size': len(content), 'path': COOKIES_FILE})


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

    # ── Attempt 1: list_transcripts — inspect all available, sort by preference
    ck = cookies_path()
    try:
        transcript_list = (
            YouTubeTranscriptApi.list_transcripts(video_id, cookies=ck)
            if ck else
            YouTubeTranscriptApi.list_transcripts(video_id)
        )
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

    # ── Attempt 2: explicit language fallback
    if raw is None:
        for lang_set in [
            ['hi', 'hi-IN', 'hi-Latn'],
            ['ur'],
            ['en', 'en-IN', 'en-US', 'en-GB'],
            None,
        ]:
            try:
                kwargs = {'cookies': ck} if ck else {}
                if lang_set is None:
                    fetched = YouTubeTranscriptApi.get_transcript(video_id, **kwargs)
                else:
                    fetched = YouTubeTranscriptApi.get_transcript(video_id, languages=lang_set, **kwargs)
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
                        'yt-dlp',
                        '--write-auto-subs', '--write-subs',
                        '--sub-langs', sub_langs,
                        '--sub-format', 'json3',
                        '--skip-download', '--no-playlist',
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
        }), 404

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

    # Fetch video title and description via yt-dlp (light, skip-download)
    video_title = ''
    video_description = ''
    try:
        meta_result = subprocess.run(
            ['yt-dlp', '--skip-download', '--no-playlist',
             *cookies_args(),
             '--print', '%(title)s\n%(description)s', url],
            capture_output=True, text=True, timeout=20
        )
        if meta_result.returncode == 0:
            parts = meta_result.stdout.strip().split('\n', 1)
            video_title = parts[0].strip() if parts else ''
            video_description = parts[1].strip()[:600] if len(parts) > 1 else ''
    except Exception:
        pass

    return jsonify({
        'video_id': video_id,
        'language': lang_used,
        'segments': segments,
        'full_text': full_text,
        'title': video_title,
        'description': video_description,
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
        mc_arg = 'youtube:comment_sort=top;max_comments=all'
        timeout_val = 300
    else:
        mc_arg = f'youtube:comment_sort=top;max_comments={max_comments}'
        timeout_val = 120

    with tempfile.TemporaryDirectory() as tmpdir:
        info_path = os.path.join(tmpdir, f'{video_id}.info.json')
        cmd = [
            'yt-dlp',
            '--write-info-json',
            '--write-comments',
            '--skip-download',
            '--no-playlist',
            '--extractor-args', mc_arg,
            *cookies_args(),
            '-o', os.path.join(tmpdir, '%(id)s'),
            url
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_val)

            if not os.path.exists(info_path):
                # Try without extractor-args (older yt-dlp fallback)
                cmd2 = [
                    'yt-dlp',
                    '--write-info-json',
                    '--write-comments',
                    '--skip-download',
                    '--no-playlist',
                    *cookies_args(),
                    '-o', os.path.join(tmpdir, '%(id)s'),
                    url
                ]
                result = subprocess.run(cmd2, capture_output=True, text=True, timeout=timeout_val)

            if not os.path.exists(info_path):
                return jsonify({'error': 'Could not fetch comments. ' + result.stderr[-500:]}), 500

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
        except subprocess.TimeoutExpired:
            return jsonify({'error': 'Timed out fetching comments (try a video with fewer comments)'}), 500
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
            format_str = f'bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<={quality}][ext=mp4]/best[ext=mp4]/best'
            cmd = [
                'yt-dlp',
                '-f', format_str,
                '--merge-output-format', 'mp4',
                '--newline',
                '-o', output_path,
                '--no-playlist',
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
            proc.wait(timeout=600)
            if proc.returncode == 0 and os.path.exists(output_path):
                active_jobs[job_id] = {
                    'job_id': job_id,
                    'status': 'done',
                    'progress': 100,
                    'filename': os.path.basename(output_path),
                    'download_url': f'/api/files/{os.path.basename(output_path)}'
                }
            else:
                active_jobs[job_id] = {'job_id': job_id, 'status': 'error', 'error': 'yt-dlp download failed'}
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
            'yt-dlp',
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
                'yt-dlp',
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


@app.route('/api/instagram/comments', methods=['POST'])
def instagram_comments():
    """Scrape Instagram comments using instaloader."""
    data = request.json or {}
    url = data.get('url', '').strip()
    max_comments = int(data.get('max_comments', 100))

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    shortcode = extract_instagram_shortcode(url)
    if not shortcode:
        return jsonify({'error': 'Invalid Instagram URL'}), 400

    try:
        import instaloader
        L = instaloader.Instaloader()
        ck = cookies_path()
        if ck:
            try:
                import browser_cookie3
            except ImportError:
                pass
            try:
                L.load_session_from_file('', filename=ck)
            except Exception:
                pass

        post = instaloader.Post.from_shortcode(L.context, shortcode)
        comments = []
        for comment in post.get_comments():
            if len(comments) >= max_comments:
                break
            text = comment.text.strip() if comment.text else ''
            if text:
                comments.append(text)

        return jsonify({
            'shortcode': shortcode,
            'count': len(comments),
            'comments': comments,
        })
    except ImportError:
        return jsonify({'error': 'instaloader is not installed. Run: pip install instaloader', 'error_code': 'MISSING_DEPENDENCY'}), 500
    except Exception as e:
        err = str(e)
        if 'login' in err.lower() or 'private' in err.lower() or '401' in err or '403' in err:
            return jsonify({'error': 'This post is private or requires Instagram login to access comments.', 'error_code': 'LOGIN_REQUIRED'}), 403
        return jsonify({'error': err, 'error_code': 'SCRAPE_ERROR'}), 500


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
