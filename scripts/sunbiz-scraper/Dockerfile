# Sunbiz Cloudflare-bypass scraper — production container.
#
# Build:  docker build -t sunbiz-scraper scripts/sunbiz-scraper
# Run:    docker run -p 3334:3334 -e SUNBIZ_PROXY_TOKEN=... sunbiz-scraper
#
# Deploys to any container host (Render, Railway, Fly.io, Cloud Run, Heroku).
# NOTE: Cloudflare frequently blocks datacenter IPs. If lookups start failing
# in production, set SUNBIZ_UPSTREAM_PROXY to a residential/CF-bypass proxy.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=3334

WORKDIR /app

# lxml needs libxml2/libxslt at runtime; build deps are pulled in by the wheel.
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY app.py ./

EXPOSE 3334

# 2 workers is plenty for low-volume entity lookups; 60s timeout covers the
# Cloudflare challenge + redirect + detail fetch. Bind to $PORT for PaaS hosts.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-3334} --workers 2 --timeout 60 app:app"]
