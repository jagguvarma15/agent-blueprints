FROM python:3.12-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy dependency files first for layer caching
COPY pyproject.toml ./
COPY src/ src/

# Install dependencies (no dev extras in production image)
RUN uv sync --no-dev

CMD ["uv", "run", "python", "-m", "src.main"]
