# First, build the application in the `/app` directory.
# See `Dockerfile` for details.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Disable Python downloads, because we want to use the system interpreter
# across both images. If using a managed Python version, it needs to be
# copied from the build image into the final image; see `standalone.Dockerfile`
# for an example.
ENV UV_PYTHON_DOWNLOADS=0

WORKDIR /app
RUN apt-get update \
  && apt-get install -y libpq-dev gcc \
  && rm -rf /var/lib/apt/lists/*
RUN --mount=type=cache,target=/root/.cache/uv \
  --mount=type=bind,source=uv.lock,target=uv.lock \
  --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
  uv sync --frozen --no-install-project --no-dev
ADD . /app
RUN --mount=type=cache,target=/root/.cache/uv \
  uv sync --frozen --no-dev


FROM python:3.12-slim-bookworm
# It is important to use the image that matches the builder, as the path to the
# Python executable must be the same, e.g., using `python:3.11-slim-bookworm`
# will fail.

# Security: Create non-root user
RUN groupadd -r app && useradd -r -g app -u 1000 app

# Install runtime system dependencies
# Removed dnsutils to fix CVE-2025-40777 (bind9 vulnerability)
RUN apt-get update && apt-get install -y \
  libpq-dev \
  iputils-ping \
  net-tools \
  && rm -rf /var/lib/apt/lists/* \
  && apt-get clean

# Security: Upgrade pip to fix CVE-2025-8869
RUN pip install --no-cache-dir --upgrade pip>=25.3

COPY --from=builder --chown=app:app /app /app
COPY --chown=app:app docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

ENV PATH="/app/.venv/bin:$PATH"

ARG TARGETPLATFORM
ARG BUILDPLATFORM
LABEL org.opencontainers.image.description="Enterprise PostgreSQL MCP Server - Enhanced fork with comprehensive security and AI-native operations (${TARGETPLATFORM})"
LABEL org.opencontainers.image.source="https://github.com/neverinfamous/postgres-mcp"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="Chris LeRoux"
LABEL org.opencontainers.image.url="https://github.com/neverinfamous/postgres-mcp"
LABEL org.opencontainers.image.authors="Chris LeRoux <admin@adamic.tech>"
LABEL org.opencontainers.image.title="postgres-mcp-enhanced"
LABEL io.modelcontextprotocol.server.name="io.github.neverinfamous/postgres-mcp-server"

# Expose the SSE port
EXPOSE 8000

# Security: Switch to non-root user
USER app

# Run the postgres-mcp server
# Users can pass a database URI or individual connection arguments:
#   docker run -it --rm postgres-mcp-enhanced postgres://user:pass@host:port/dbname
#   docker run -it --rm postgres-mcp-enhanced -h myhost -p 5432 -U myuser -d mydb
ENTRYPOINT ["/app/docker-entrypoint.sh", "postgres-mcp"]
CMD []
