#!/usr/bin/env bash
set -euo pipefail

TARGET="${ROYCE_TARGET:-/home/xromiats/roycecastle.com}"
ARCHIVE_URL="${ROYCE_ARCHIVE_URL:-https://github.com/bcastle1/roycecastle.com/archive/refs/heads/main.zip}"
TMP="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "Deploying Royce Castle from GitHub main to $TARGET"
cd "$TMP"

if command -v curl >/dev/null 2>&1; then
  curl -L --fail -o source.zip "$ARCHIVE_URL"
else
  wget -O source.zip "$ARCHIVE_URL"
fi

unzip -q source.zip
SRC="$(find "$TMP" -maxdepth 1 -type d -name 'roycecastle.com-*' | head -n 1)"
if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
  echo "Could not find extracted GitHub source folder" >&2
  exit 1
fi

mkdir -p "$TARGET/data"

for item in \
  .htaccess \
  CNAME \
  app.js \
  assets \
  contacts-data.js \
  contacts-page.js \
  contacts.html \
  flyer.html \
  index.html \
  respond.html \
  respond.js \
  robots.txt \
  sitemap.xml \
  styles.css \
  admin
do
  if [ ! -e "$SRC/$item" ]; then
    echo "Missing source item: $item" >&2
    exit 1
  fi
  rm -rf "$TARGET/$item"
  cp -a "$SRC/$item" "$TARGET/"
done

rm -rf "$TARGET/api"
cp -a "$SRC/_cpanel/public_html/api" "$TARGET/"
cp -a "$SRC/_cpanel/public_html/data/.htaccess" "$TARGET/data/.htaccess"

find "$TARGET" -type d -exec chmod 755 {} +
find "$TARGET" -type f -exec chmod 644 {} +

echo "ROYCE_DEPLOY_DONE $(date -u +%Y-%m-%dT%H:%M:%SZ)"
