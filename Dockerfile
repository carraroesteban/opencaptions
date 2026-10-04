# syntax=docker/dockerfile:1
# OpenCaptions server image (Linux, amd64/arm64). Published as ghcr.io/carraroesteban/opencaptions (.github/workflows/docker.yml).
#   docker build -t opencaptions .
#   docker build --build-arg WITH_YTDLP=1 -t opencaptions .   # + yt-dlp for YouTube demos / latency tests
FROM node:22-bookworm-slim

ARG WITH_YTDLP=0
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && if [ "$WITH_YTDLP" = "1" ]; then \
      apt-get install -y --no-install-recommends python3 curl \
      && curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      && chmod 0755 /usr/local/bin/yt-dlp \
      && apt-get purge -y curl && apt-get autoremove -y; \
    fi \
 && rm -rf /var/lib/apt/lists/*

# cloudflared: the dashboard's one-click public HTTPS address (src/tunnel.js). The container's filesystem is
# read-only, so it can't be downloaded on demand like outside Docker. TARGETARCH (amd64 | arm64) comes from BuildKit.
ARG TARGETARCH
ADD --chmod=755 https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${TARGETARCH} /usr/local/bin/cloudflared

WORKDIR /app
COPY package*.json ./
# System ffmpeg is installed above, so the optional ffmpeg-static binary is not needed.
RUN npm ci --omit=dev --omit=optional && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown -R node:node /app/data /app/config

# OC_DOCKER: the startup message prints a dashboard link with the token (in a container, localhost isn't trusted).
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 OC_DOCKER=1
USER node
EXPOSE 8080
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
