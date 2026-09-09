# ----------------------------------------------------
# Stage 1: Build Frontend (React / Vite)
# ----------------------------------------------------
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend/dealpilot-ui

# Install frontend dependencies
COPY frontend/dealpilot-ui/package*.json ./
RUN npm ci

# Allow build-time Google Client ID (default to current OAuth client ID)
ARG VITE_GOOGLE_CLIENT_ID=1051036456747-hle6p87b05kstp0463jg4gfk2iu4tu0v.apps.googleusercontent.com
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# Copy frontend source and build production assets
COPY frontend/dealpilot-ui/ ./
RUN npm run build

# ----------------------------------------------------
# Stage 2: Python Runtime & Production Server
# ----------------------------------------------------
FROM python:3.11-slim

# Prevent python from buffering stdout/stderr and writing bytecode
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Copy built frontend dist from Stage 1
COPY --from=frontend-builder /app/frontend/dealpilot-ui/dist /app/frontend/dealpilot-ui/dist

# Expose Cloud Run default port
EXPOSE 8080

# Run FastAPI app with uvicorn listening on 0.0.0.0 and $PORT
CMD exec uvicorn run_agent:app --host 0.0.0.0 --port ${PORT:-8080}
