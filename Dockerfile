# postgres-mcp - PostgreSQL MCP Server
# Multi-stage build for optimized production image
FROM node:24-alpine AS builder

WORKDIR /app

# Upgrade packages for security and install curl from edge for CVE fixes
RUN apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/main curl && \
    apk upgrade --no-cache && \
    apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/main 'zlib>=1.3.2-r0'

# Upgrade npm globally to get fixed versions of bundled packages
RUN npm install -g npm@latest --force && npm cache clean --force

# Patch npm's bundled dependencies for known CVEs (shared script — single source of truth)
COPY scripts/patch-npm-deps.sh ./scripts/
RUN sh scripts/patch-npm-deps.sh


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

# Install runtime dependencies with security fixes (curl intentionally excluded — reduces attack surface)
RUN apk add --no-cache ca-certificates && \
    apk upgrade --no-cache && \
    apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/main 'zlib>=1.3.2-r0' && \
    npm install -g npm@latest --force && npm cache clean --force

# Patch npm's bundled dependencies for known CVEs (with cache cleanup for lean image)
COPY scripts/patch-npm-deps.sh ./scripts/
RUN sh scripts/patch-npm-deps.sh --clean-cache

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
# HTTP/SSE: fetch the /health endpoint via Node.js (curl intentionally excluded from production image)
# stdio:    verify Node.js runtime is alive (no HTTP endpoint available)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD if [ "$MCP_TRANSPORT" = "http" ] || [ "$MCP_TRANSPORT" = "sse" ]; then \
        node -e "fetch('http://localhost:' + (process.env.PORT || '3000') + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))" || exit 1; \
    else \
        node -e "console.log('healthy')" || exit 1; \
    fi

# Run the MCP server
ENTRYPOINT ["node", "dist/cli.js"]

# Labels for Docker Hub
LABEL maintainer="Adamic.tech"
LABEL description="PostgreSQL MCP Server - AI-native PostgreSQL operations with 248 tools, 23 resources, 20 prompts"
LABEL version="3.0.5"
LABEL org.opencontainers.image.source="https://github.com/neverinfamous/postgres-mcp"
LABEL io.modelcontextprotocol.server.name="io.github.neverinfamous/postgres-mcp"
