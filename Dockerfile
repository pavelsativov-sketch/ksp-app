FROM node:22-bookworm-slim

# Environment setup for Hugging Face Spaces & Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PORT=7860
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Install system dependencies required for Chromium/Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Pre-create non-root user (Hugging Face Spaces runs as user 1000)
RUN useradd -m -u 1000 appuser

# Install Node dependencies
COPY package*.json ./
RUN npm ci --include=dev

# Install Playwright Chromium into /ms-playwright and ensure access permissions
RUN npx playwright install chromium \
    && chmod -R 777 /ms-playwright

# Copy source code and build Next.js
COPY . .
RUN npm run build

# Change ownership of application folder to appuser
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 7860

CMD ["npm", "run", "start", "--", "-p", "7860", "-H", "0.0.0.0"]
