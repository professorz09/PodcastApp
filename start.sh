#!/bin/bash
set -e

echo "=== DebateForge Production Startup ==="

# Install Python dependencies
echo "[1/3] Installing Python dependencies..."
pip install -r requirements.txt -q

# Start Flask server in background on port 8000
echo "[2/3] Starting Flask server (port 8000)..."
python flask_server.py &
FLASK_PID=$!

# Give Flask time to start
sleep 3

# Check Flask started successfully
if kill -0 $FLASK_PID 2>/dev/null; then
  echo "      Flask running (PID: $FLASK_PID)"
else
  echo "      Warning: Flask may not have started — YouTube download/comments may be unavailable"
fi

# Start Node.js production server (this blocks until server stops)
echo "[3/3] Starting Node.js server (port 5000)..."
npm run start
