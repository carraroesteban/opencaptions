# syntax=docker/dockerfile:1
# OpenCaptions server image (Linux, amd64/arm64). Published as ghcr.io/carraroesteban/opencaptions (.github/workflows/docker.yml).
#   docker build -t opencaptions .
#   docker build --build-arg WITH_YTDLP=1 -t opencaptions .   # + yt-dlp for YouTube demos / latency tests
FROM node:22-bookworm-slim

# Downloaded tools are pinned and checked against GitHub's published SHA-256 (same versions as src/tunnel.js).
# cloudflared: the dashboard's one-click public HTTPS address. The container's filesystem is read-only, so it can't
# be downloaded on demand like outside Docker. TARGETARCH (amd64 | arm64) comes from BuildKit.
ARG WITH_YTDLP=0
ARG TARGETARCH
ARG CLOUDFLARED=2026.9.3
ARG CLOUDFLARED_SHA256_AMD64=77e26d8d900e0b8469f416239d14b5f296525fdf79fee6f511ef55609e3fbac2
ARG CLOUDFLARED_SHA256_ARM64=aaeb2d7d0da3614634c7e03ab13487a1522c2e79165ed2929cfe23d5e95b326d
ARG YTDLP=2026.08.19
ARG YTDLP_SHA256=1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && case "$TARGETARCH" in amd64) sum="$CLOUDFLARED_SHA256_AMD64" ;; arm64) sum="$CLOUDFLARED_SHA256_ARM64" ;; *) echo "no cloudflared for $TARGETARCH" && exit 1 ;; esac \
 && curl -fsSL -o /usr/local/bin/cloudflared "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED}/cloudflared-linux-${TARGETARCH}" \
 && echo "$sum  /usr/local/bin/cloudflared" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/cloudflared \
 && if [ "$WITH_YTDLP" = "1" ]; then \
      apt-get install -y --no-install-recommends python3 \
      && curl -fsSL -o /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP}/yt-dlp" \
      && echo "$YTDLP_SHA256  /usr/local/bin/yt-dlp" | sha256sum -c - \
      && chmod 0755 /usr/local/bin/yt-dlp; \
    fi \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

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
