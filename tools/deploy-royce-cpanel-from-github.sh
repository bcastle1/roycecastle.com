#!/usr/bin/env bash
set -euo pipefail

TARGET="${ROYCE_TARGET:-/home/xromiats/roycecastle.com}"
EXPECTED_USER="${ROYCE_EXPECTED_USER:-xromiats}"
ARCHIVE_SHA="${ROYCE_ARCHIVE_SHA:-}"
ARCHIVE_REPOSITORY="bcastle1/roycecastle.com"

TMP=""
STAGE=""
BACKUP=""
DEPLOY_STARTED=0
DEPLOY_COMMITTED=0
KEEP_BACKUP=0
DATA_PROTECTION_BACKED_UP=0
DATA_PROTECTION_INSTALLED=0
declare -a INSTALLED_ITEMS=()
declare -a BACKED_UP_ITEMS=()

fail() {
  echo "Deployment stopped: $*" >&2
  exit 1
}

path_exists() {
  [ -e "$1" ] || [ -L "$1" ]
}

rollback_deploy() {
  local item index rollback_failed=0

  echo "Deployment failed after target replacement began; restoring the previous managed files." >&2

  if [ "$DATA_PROTECTION_INSTALLED" -eq 1 ] && [ "$DATA_PROTECTION_BACKED_UP" -eq 1 ]; then
    if path_exists "$BACKUP/data/.htaccess"; then
      mkdir -p -- "$TARGET/data" || rollback_failed=1
      mv -f -- "$BACKUP/data/.htaccess" "$TARGET/data/.htaccess" || rollback_failed=1
    else
      rollback_failed=1
    fi
  fi

  for ((index=${#INSTALLED_ITEMS[@]} - 1; index >= 0; index--)); do
    item="${INSTALLED_ITEMS[$index]}"
    if path_exists "$TARGET/$item"; then
      rm -rf -- "$TARGET/$item" || rollback_failed=1
    fi
  done

  for ((index=${#BACKED_UP_ITEMS[@]} - 1; index >= 0; index--)); do
    item="${BACKED_UP_ITEMS[$index]}"
    if path_exists "$BACKUP/$item"; then
      mkdir -p -- "$(dirname "$TARGET/$item")" || rollback_failed=1
      mv -- "$BACKUP/$item" "$TARGET/$item" || rollback_failed=1
    fi
  done

  if [ "$rollback_failed" -ne 0 ]; then
    KEEP_BACKUP=1
    echo "Automatic rollback was incomplete. Preserved recovery files at: $BACKUP" >&2
    return 1
  fi

  DEPLOY_STARTED=0
  echo "Previous managed files restored. Live sending remains paused." >&2
  return 0
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM

  if [ "$status" -ne 0 ] && [ "$DEPLOY_STARTED" -eq 1 ] && [ "$DEPLOY_COMMITTED" -eq 0 ]; then
    rollback_deploy || status=1
  fi

  if [ -n "$TMP" ] && [ -d "$TMP" ]; then
    rm -rf -- "$TMP" || true
  fi
  if [ -n "$STAGE" ] && [ -d "$STAGE" ]; then
    rm -rf -- "$STAGE" || true
  fi
  if [ -n "$BACKUP" ] && [ -d "$BACKUP" ] && [ "$KEEP_BACKUP" -eq 0 ]; then
    rm -rf -- "$BACKUP" || true
  fi

  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

[[ "$EXPECTED_USER" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
  || fail "ROYCE_EXPECTED_USER contains unsupported characters."
[[ "$ARCHIVE_SHA" =~ ^[0-9a-fA-F]{40}$ ]] \
  || fail "ROYCE_ARCHIVE_SHA must be the exact 40-character Git commit SHA to deploy."
ARCHIVE_SHA="${ARCHIVE_SHA,,}"

EXPECTED_HOME="/home/$EXPECTED_USER"
EXPECTED_PREFIX="$EXPECTED_HOME/"
[[ "$TARGET" == "$EXPECTED_PREFIX"* ]] \
  || fail "ROYCE_TARGET must be directly beneath $EXPECTED_HOME."
TARGET_NAME="${TARGET#"$EXPECTED_PREFIX"}"
[ "$TARGET_NAME" = "roycecastle.com" ] \
  || fail "ROYCE_TARGET must be exactly $EXPECTED_HOME/roycecastle.com."

[ -d "$TARGET" ] || fail "The validated deployment target does not already exist: $TARGET"
[ ! -L "$TARGET" ] || fail "The deployment target must not be a symbolic link."
TARGET_PARENT="$(dirname "$TARGET")"
TARGET_PARENT_REAL="$(cd "$TARGET_PARENT" && pwd -P)"
TARGET_REAL="$(cd "$TARGET" && pwd -P)"
[ "$TARGET_PARENT_REAL" = "$EXPECTED_HOME" ] \
  || fail "The deployment target parent resolves outside $EXPECTED_HOME."
[ "$TARGET_REAL" = "$TARGET_PARENT_REAL/$TARGET_NAME" ] \
  || fail "The deployment target resolves outside its validated path."

for required_command in php unzip find cp mv rm mkdir mktemp chmod flock stat; do
  command -v "$required_command" >/dev/null 2>&1 \
    || fail "Required remote command is unavailable: $required_command"
done
if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
  fail "Either curl or wget is required to download the immutable source archive."
fi

TMP="$(mktemp -d)"
ARCHIVE_URL="https://github.com/$ARCHIVE_REPOSITORY/archive/$ARCHIVE_SHA.zip"
echo "Preflighting Royce Castle commit $ARCHIVE_SHA for $TARGET"
cd "$TMP"

if command -v curl >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -L --fail --output source.zip "$ARCHIVE_URL"
else
  wget --https-only --output-document=source.zip "$ARCHIVE_URL"
fi

unzip -q source.zip
SRC="$TMP/roycecastle.com-$ARCHIVE_SHA"
[ -d "$SRC" ] || fail "The archive did not extract to the expected commit-specific source folder."

SOURCE_ITEMS=(
  .htaccess
  CNAME
  app.js
  assets
  contacts-data.js
  contacts-page.js
  contacts.html
  flyer.html
  index.html
  respond.html
  respond.js
  robots.txt
  sitemap.xml
  styles.css
  admin
)

for item in "${SOURCE_ITEMS[@]}"; do
  path_exists "$SRC/$item" || fail "Missing source item: $item"
  [ ! -L "$SRC/$item" ] || fail "Top-level source item must not be a symbolic link: $item"
done
[ -d "$SRC/_cpanel/public_html/api" ] \
  || fail "Missing cPanel API source directory."
[ ! -L "$SRC/_cpanel/public_html/api" ] \
  || fail "The cPanel API source directory must not be a symbolic link."
[ -f "$SRC/_cpanel/public_html/data/.htaccess" ] \
  || fail "Missing cPanel data protection file."
[ ! -L "$SRC/_cpanel/public_html/data/.htaccess" ] \
  || fail "The cPanel data protection file must not be a symbolic link."

PHP_LINT_FAILED=0
PHP_FILE_COUNT=0
while IFS= read -r -d '' PHP_FILE; do
  PHP_FILE_COUNT=$((PHP_FILE_COUNT + 1))
  if ! php -l "$PHP_FILE"; then
    PHP_LINT_FAILED=1
  fi
done < <(find "$SRC/_cpanel/public_html/api" -type f -name '*.php' -print0)
[ "$PHP_FILE_COUNT" -gt 0 ] || fail "No PHP API files were found to lint."
[ "$PHP_LINT_FAILED" -eq 0 ] || fail "PHP lint failed."
echo "Source preflight passed, including PHP lint for the cPanel API package."

DEPLOY_LOCK_PATH="$TARGET_PARENT/.${TARGET_NAME}.deploy.lock"
exec 9>"$DEPLOY_LOCK_PATH"
chmod 600 "$DEPLOY_LOCK_PATH"
flock -n 9 || fail "Another deployment already holds $DEPLOY_LOCK_PATH."
echo "Acquired persistent remote deployment lock."

if path_exists "$TARGET/data"; then
  [ -d "$TARGET/data" ] && [ ! -L "$TARGET/data" ] \
    || fail "The preserved data path must be a real directory."
fi

SETTINGS_PATH="$TARGET/data/settings.json"
SETTINGS_LOCK_PATH="$SETTINGS_PATH.lock"
if path_exists "$SETTINGS_PATH"; then
  [ -f "$SETTINGS_PATH" ] && [ ! -L "$SETTINGS_PATH" ] \
    || fail "The preserved settings path must be a regular file."
fi
if path_exists "$SETTINGS_LOCK_PATH"; then
  [ -f "$SETTINGS_LOCK_PATH" ] && [ ! -L "$SETTINGS_LOCK_PATH" ] \
    || fail "The settings lock path must be a regular file."
fi

ADMIN_AUTH_READY=0
if [ -n "${RC_ADMIN_CODE:-}" ] || [ -n "${RC_ADMIN_CODE_HASH:-}" ]; then
  ADMIN_AUTH_READY=1
elif [ -f "$SETTINGS_PATH" ]; then
  if php -r '$s=json_decode((string)@file_get_contents($argv[1]), true); exit(!empty($s["adminCodeHash"]) ? 0 : 1);' "$SETTINGS_PATH"; then
    ADMIN_AUTH_READY=1
  fi
fi

if [ "$ADMIN_AUTH_READY" -ne 1 ] && [ "${ROYCE_ALLOW_UNCONFIGURED_ADMIN:-0}" != "1" ]; then
  fail "Configure a private admin code/hash before removing the legacy fallback. Save a new code in the current dashboard, set RC_ADMIN_CODE/RC_ADMIN_CODE_HASH, or explicitly set ROYCE_ALLOW_UNCONFIGURED_ADMIN=1 for a controlled recovery deploy."
fi

STAGE="$(mktemp -d "$TARGET_PARENT/.${TARGET_NAME}.deploy-stage.XXXXXXXX")"
BACKUP="$(mktemp -d "$TARGET_PARENT/.${TARGET_NAME}.deploy-backup.XXXXXXXX")"
chmod 700 "$STAGE" "$BACKUP"

TARGET_DEVICE="$(stat -c %d "$TARGET_PARENT")"
[ "$(stat -c %d "$STAGE")" = "$TARGET_DEVICE" ] \
  || fail "The deployment staging directory is not on the target filesystem."
[ "$(stat -c %d "$BACKUP")" = "$TARGET_DEVICE" ] \
  || fail "The deployment rollback directory is not on the target filesystem."

for item in "${SOURCE_ITEMS[@]}"; do
  cp -a -- "$SRC/$item" "$STAGE/"
done
cp -a -- "$SRC/_cpanel/public_html/api" "$STAGE/"
mkdir -p "$STAGE/data"
cp -a -- "$SRC/_cpanel/public_html/data/.htaccess" "$STAGE/data/.htaccess"

find "$STAGE" -type d -exec chmod 755 {} +
find "$STAGE" -type f -exec chmod 644 {} +
chmod 644 "$STAGE/data/.htaccess"

DEPLOY_ITEMS=("${SOURCE_ITEMS[@]}" api)
for item in "${DEPLOY_ITEMS[@]}"; do
  path_exists "$STAGE/$item" || fail "Staged deployment item is missing: $item"
done
path_exists "$STAGE/data/.htaccess" || fail "Staged data protection file is missing."
echo "Same-filesystem staging preflight passed."

if ! path_exists "$TARGET/data"; then
  mkdir "$TARGET/data"
  chmod 700 "$TARGET/data"
fi

php -r '
  $path = $argv[1];
  $lockPath = $path . ".lock";
  $lockHandle = @fopen($lockPath, "c+");
  if ($lockHandle === false) {
    fwrite(STDERR, "Could not open settings.json.lock.\n");
    exit(1);
  }
  @chmod($lockPath, 0600);

  $tempPath = null;
  $tempHandle = null;
  $locked = false;
  $error = null;
  try {
    if (!flock($lockHandle, LOCK_EX)) {
      throw new RuntimeException("Could not lock settings.json.lock.");
    }
    $locked = true;

    $raw = is_file($path) ? file_get_contents($path) : "";
    if ($raw === false) {
      throw new RuntimeException("Could not read settings JSON.");
    }
    $settings = trim((string)$raw) === "" ? [] : json_decode((string)$raw, true);
    if (!is_array($settings)) {
      throw new RuntimeException("Invalid settings JSON.");
    }
    $settings["sendingEnabled"] = false;
    $json = json_encode($settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
      throw new RuntimeException("Could not encode paused settings.");
    }

    $tempPath = tempnam(dirname($path), ".settings-deploy-");
    if ($tempPath === false) {
      throw new RuntimeException("Could not allocate settings temp file.");
    }
    $tempHandle = @fopen($tempPath, "wb");
    if ($tempHandle === false) {
      throw new RuntimeException("Could not open settings temp file.");
    }

    $offset = 0;
    $length = strlen($json);
    while ($offset < $length) {
      $written = fwrite($tempHandle, substr($json, $offset));
      if ($written === false || $written === 0) {
        throw new RuntimeException("Could not fully write paused settings.");
      }
      $offset += $written;
    }
    if (!fflush($tempHandle)) {
      throw new RuntimeException("Could not flush paused settings.");
    }
    if (function_exists("fsync") && !fsync($tempHandle)) {
      throw new RuntimeException("Could not sync paused settings.");
    }
    fclose($tempHandle);
    $tempHandle = null;
    if (!chmod($tempPath, 0600)) {
      throw new RuntimeException("Could not secure paused settings.");
    }
    if (!rename($tempPath, $path)) {
      throw new RuntimeException("Could not atomically install paused settings.");
    }
    $tempPath = null;
  } catch (Throwable $exception) {
    $error = $exception->getMessage();
  } finally {
    if (is_resource($tempHandle)) {
      fclose($tempHandle);
    }
    if (is_string($tempPath) && $tempPath !== "") {
      @unlink($tempPath);
    }
    if ($locked) {
      flock($lockHandle, LOCK_UN);
    }
    fclose($lockHandle);
    @chmod($lockPath, 0600);
  }
  if ($error !== null) {
    fwrite(STDERR, $error . "\n");
    exit(1);
  }
' "$SETTINGS_PATH"
echo "Live sending forced paused under settings.json.lock before deployment."

if path_exists "$TARGET/data/.htaccess"; then
  [ -f "$TARGET/data/.htaccess" ] && [ ! -L "$TARGET/data/.htaccess" ] \
    || fail "The live data protection path must be a regular file."
  mkdir -p -- "$BACKUP/data"
  cp -a -- "$TARGET/data/.htaccess" "$BACKUP/data/.htaccess"
  DATA_PROTECTION_BACKED_UP=1
fi

DEPLOY_STARTED=1
DATA_PROTECTION_INSTALLED=1
mv -f -- "$STAGE/data/.htaccess" "$TARGET/data/.htaccess"

for item in "${DEPLOY_ITEMS[@]}"; do
  TARGET_ITEM="$TARGET/$item"
  BACKUP_ITEM="$BACKUP/$item"
  STAGED_ITEM="$STAGE/$item"

  if path_exists "$TARGET_ITEM"; then
    mkdir -p -- "$(dirname "$BACKUP_ITEM")"
    BACKED_UP_ITEMS+=("$item")
    mv -- "$TARGET_ITEM" "$BACKUP_ITEM"
  fi

  mkdir -p -- "$(dirname "$TARGET_ITEM")"
  INSTALLED_ITEMS+=("$item")
  mv -- "$STAGED_ITEM" "$TARGET_ITEM"
done

for item in "${DEPLOY_ITEMS[@]}"; do
  path_exists "$TARGET/$item" || fail "Post-deployment item is missing: $item"
done
path_exists "$TARGET/data/.htaccess" || fail "Post-deployment data protection file is missing."

chmod 644 "$TARGET/data/.htaccess"
find "$TARGET/data" -maxdepth 1 -type f \( -name '*.json' -o -name '*.lock' \) -exec chmod 600 {} +

DEPLOY_COMMITTED=1
echo "ROYCE_DEPLOY_DONE commit=$ARCHIVE_SHA $(date -u +%Y-%m-%dT%H:%M:%SZ)"
