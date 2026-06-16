# Flask server image — deployed to Render as a separate web service.
# The Vite frontend continues to live on Vercel and proxies /api/youtube
# (and similar) calls to whatever Render URL this service ends up on.
FROM python:3.11-slim

# ffmpeg is required by yt-dlp for merging audio/video tracks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (cache layer).
COPY requirements_flask.txt ./
RUN pip install --no-cache-dir -r requirements_flask.txt gunicorn

# Copy the Flask app + optional bundled yt-dlp-new binary. flask_server.py
# prefers ./yt-dlp-new when present and runnable, else falls back to the
# pip-installed yt-dlp (which we always have via requirements_flask.txt).
COPY flask_server.py ./
COPY yt-dlp-new ./yt-dlp-new
COPY yt_cookies.txt ./yt_cookies.txt
RUN chmod +x ./yt-dlp-new || true

# Render sets PORT automatically; we default to 8000 for local docker run.
ENV PORT=8000
EXPOSE 8000

# Single worker, long timeout for video download/transcribe operations
# (some take minutes). Frontend already retries on slow responses.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} flask_server:app --workers 1 --threads 4 --timeout 600 --access-logfile -"]