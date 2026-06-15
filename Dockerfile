# syntax=docker/dockerfile:1.6
# Dockerfile untuk Hugging Face Spaces (Docker SDK) — FastAPI backend.
# Build: HF Spaces otomatis build dari Dockerfile ini.
# Port: HF Spaces require port 7860 (default) — kita ekspose ke 7860.

FROM python:3.11-slim

# System deps minimal
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy & install Python deps
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend source
COPY backend/ /app/

# Hugging Face Spaces port
ENV PORT=7860
EXPOSE 7860

# Start FastAPI
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-7860}"]
