FROM python:3.11-slim

WORKDIR /app

# Install system deps for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
  libgl1-mesa-glx \
  libglib2.0-0 \
  libsm6 \
  libxext6 \
  libxrender-dev \
  libgomp1 \
  && rm -rf /var/lib/apt/lists/*

# Install Python deps (this layer is cached)
RUN pip install --no-cache-dir \
  easyocr \
  pillow \
  numpy

# Copy the server script
COPY scripts/easyocr_server.py .

# Pre-load models at build time (optional — reduces first-request latency)
# RUN python -c "import easyocr; r = easyocr.Reader(['ch_sim','en'], gpu=False); print('Models downloaded')"

EXPOSE 8866

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8866/health')" || exit 1

CMD ["python", "easyocr_server.py", "--cpu", "--port", "8866"]
