# postgres-mcp - PostgreSQL MCP Server
# Multi-stage build for optimized production image
FROM node:24-alpine AS builder

WORKDIR /app

# Upgrade packages for security and install curl from edge for CVE fixes
RUN apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/main curl && \
    apk upgrade --no-cache

# Upgrade npm globally to get fixed versions of bundled packages
RUN npm install -g npm@latest --force && npm cache clean --force

# Fix GHSA-73rr-hh4g-fpgx: Manually update npm's bundled diff@8.0.2 to 8.0.3
RUN cd /usr/local/lib/node_modules/npm && \
    npm pack diff@8.0.3 && \
    rm -rf node_modules/diff && \
    tar -xzf diff-8.0.3.tgz && \
    mv package node_modules/diff && \
    rm diff-8.0.3.tgz

# Fix CVE-2026-25547: Manually update npm's bundled @isaacs/brace-expansion@5.0.0 to 5.0.1
RUN cd /usr/local/lib/node_modules/npm && \
    npm pack @isaacs/brace-expansion@5.0.1 && \
    rm -rf node_modules/@isaacs/brace-expansion && \
    mkdir -p node_modules/@isaacs/brace-expansion && \
    tar -xzf isaacs-brace-expansion-5.0.1.tgz && \
    mv package/* node_modules/@isaacs/brace-expansion/ && \
    rm -rf package isaacs-brace-expansion-5.0.1.tgz

# Fix CVE-2026-23950, CVE-2026-24842: Manually update npm's bundled tar to 7.5.8
RUN cd /usr/local/lib/node_modules/npm && \
    npm pack tar@7.5.8 && \
    rm -rf node_modules/tar && \
    tar -xzf tar-7.5.8.tgz && \
    mv package node_modules/tar && \
    rm tar-7.5.8.tgz

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune devDependencies before production copy (P117)
RUN npm prune --omit=dev && npm cache clean --force

# Production stage
FROM node:24-alpine

WORKDIR /app

# Install runtime dependencies with security fixes
RUN apk add --no-cache ca-certificates && \
    apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/main curl && \
    apk upgrade --no-cache && \
    npm install -g npm@latest --force && npm cache clean --force

# Fix GHSA-73rr-hh4g-fpgx: Manually update npm's bundled diff@8.0.2 to 8.0.3
RUN cd /usr/local/lib/node_modules/npm && \
    npm pack diff@8.0.3 && \
    rm -rf node_modules/diff && \
    tar -xzf diff-8.0.3.tgz && \
    mv package node_modules/diff && \
    rm diff-8.0.3.tgz

# Fix CVE-2026-25547: Manually update npm's bundled @isaacs/brace-expansion@5.0.0 to 5.0.1
RUN cd /usr/local/lib/node_modules/npm && \
    npm pack @isaacs/brace-expansion@5.0.1 && \
    rm -rf node_modules/@isaacs/brace-expansion && \
    mkdir -p node_modules/@isaacs/brace-expansion && \
    tar -xzf isaacs-brace-expansion-5.0.1.tgz && \
    mv package/* node_modules/@isaacs/brace-expansion/ && \
    rm -rf package isaacs-brace-expansion-5.0.1.tgz

# Fix CVE-2026-23950, CVE-2026-24842: Manually update npm's bundled tar to 7.5.8
RUN cd /usr/local/lib/node_modules/npm && \
    npm pack tar@7.5.8 && \
    rm -rf node_modules/tar && \
    tar -xzf tar-7.5.8.tgz && \
    mv package node_modules/tar && \
    rm tar-7.5.8.tgz

# Copy built artifacts and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY LICENSE ./

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

# Set environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Switch to non-root user
USER appuser

# Expose HTTP port for SSE transport (optional)
EXPOSE 3000

# Health check — transport-aware:
# HTTP/SSE: curl the /health endpoint (verifies HTTP server + DB connectivity)
# stdio:    verify Node.js runtime is alive (no HTTP endpoint available)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD if [ "$MCP_TRANSPORT" = "http" ] || [ "$MCP_TRANSPORT" = "sse" ]; then \
        curl -sf http://localhost:${PORT:-3000}/health || exit 1; \
    else \
        node -e "console.log('healthy')" || exit 1; \
    fi

# Run the MCP server (default: stdio transport)
CMD ["node", "dist/cli.js"]

# Labels for Docker Hub
LABEL maintainer="Adamic.tech"
LABEL description="PostgreSQL MCP Server - AI-native PostgreSQL operations with 227 tools, 20 resources, 19 prompts"
LABEL version="1.3.0"
LABEL org.opencontainers.image.source="https://github.com/neverinfamous/postgres-mcp"
LABEL io.modelcontextprotocol.server.name="io.github.neverinfamous/postgres-mcp"
