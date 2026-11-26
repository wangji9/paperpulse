FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm config set registry https://registry.npmmirror.com && npm install --no-audit --no-fund

COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server

RUN npm run typecheck && npm run build

FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV TZ=Asia/Shanghai

WORKDIR /app

# Install Python3 + PyMuPDF + Pillow for PDF original figure/table extraction
RUN sed -i 's|http://deb.debian.org|http://mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl python3 python-is-python3 python3-pip python3-pil tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim \
    && pip3 install --no-cache-dir --break-system-packages -i https://pypi.tuna.tsinghua.edu.cn/simple pymupdf \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /app/data/paper-assets

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=6s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["npx", "tsx", "server/index.ts"]
