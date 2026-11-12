# --- Stage 1: download on-device speech models (served from our own domain) ---
FROM alpine:3.20 AS models
# Space-separated list. See local-asr.js for the available models.
ARG VOSK_MODELS="vosk-model-small-en-us-0.15"
RUN apk add --no-cache curl && mkdir -p /models && \
    for m in $VOSK_MODELS; do \
      curl -fsSL --retry 3 -o "/models/$m.tar.gz" "https://ccoreilly.github.io/vosk-browser/models/$m.tar.gz" \
      || { echo "WARN: could not download $m (the app will use the public mirror)"; rm -f "/models/$m.tar.gz"; }; \
    done

# --- Stage 2: static site ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css app.js matcher.js local-asr.js sw.js manifest.webmanifest /usr/share/nginx/html/
COPY icons /usr/share/nginx/html/icons
COPY vendor /usr/share/nginx/html/vendor
COPY .well-known /usr/share/nginx/html/.well-known
COPY --from=models /models /usr/share/nginx/html/models
EXPOSE 80 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
