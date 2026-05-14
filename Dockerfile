FROM node:22-alpine

WORKDIR /app

# Install Playwright system deps (only needed for URL screenshot mode)
# If you only use image comparison, you can remove these lines
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  udev

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install npm deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/
COPY config/ ./config/
COPY examples/ ./examples/
COPY tsconfig.json ./

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3100/health').then(r=>r.ok?process.exit(0):process.exit(1))"

# Default: start the web server
# For CLI mode, override CMD: docker run ... visual-proofreader npx tsx src/index.ts
CMD ["npx", "tsx", "src/server.ts"]
