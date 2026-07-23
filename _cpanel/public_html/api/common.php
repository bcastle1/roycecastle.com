<?php
declare(strict_types=1);

$secureCookie = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $secureCookie,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

const RC_DEFAULT_MAILBOX = 'info@roycecastle.com';
const RC_DEFAULT_WEBMAIL_URL = 'https://privateemail.com/';
const RC_DEFAULT_SMTP_HOST = 'mail.privateemail.com';
const RC_DEFAULT_SMTP_PORT = 465;
const RC_DEFAULT_SMTP_SECURITY = 'ssl';
const RC_PUBLIC_ORIGIN = 'https://roycecastle.com';
const RC_EMAIL_TEMPLATE_VERSION = 3;
const RC_EMAIL_HISTORY_LIMIT = 1000;
const RC_RUN_HISTORY_LIMIT = 50;
const RC_RUN_POSITION_RETENTION = RC_RUN_HISTORY_LIMIT;
const RC_MAX_RUN_TOTAL = 100000;
const RC_PRIVATE_EMAIL_MIN_DELAY_SECONDS = 300;
const RC_LIVE_RUN_RECIPIENT_LIMIT = 1;
const RC_MAX_DAILY_SEND_ATTEMPTS = 25;

function data_dir(): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
}

function ensure_data_dir(): void
{
    $dir = data_dir();
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
}

function json_path(string $name): string
{
    ensure_data_dir();
    return data_dir() . DIRECTORY_SEPARATOR . basename($name);
}

function read_json_file(string $name, $default, bool $strictExisting = false)
{
    $path = json_path($name);
    if (!is_file($path)) return $default;
    $handle = fopen($path, 'rb');
    if ($handle === false) {
        if ($strictExisting) throw new RuntimeException('Could not open required data file.');
        return $default;
    }
    try {
        if (!flock($handle, LOCK_SH)) {
            if ($strictExisting) throw new RuntimeException('Could not lock required data file.');
            return $default;
        }
        $raw = stream_get_contents($handle);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
    if ($raw === false || trim($raw) === '') {
        if ($strictExisting) throw new RuntimeException('Required data file is empty or unreadable.');
        return $default;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        if ($strictExisting) throw new RuntimeException('Required data file contains invalid JSON.');
        return $default;
    }
    return $decoded;
}

function write_json_file(string $name, $value): void
{
    $json = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false) throw new RuntimeException('Could not encode data file.');
    $written = file_put_contents(
        json_path($name),
        $json,
        LOCK_EX
    );
    if ($written === false || $written !== strlen($json)) {
        throw new RuntimeException('Could not fully write data file.');
    }
}

function write_stream_fully($handle, string $data): void
{
    $length = strlen($data);
    $written = 0;
    while ($written < $length) {
        $bytes = fwrite($handle, substr($data, $written));
        if ($bytes === false || $bytes === 0) throw new RuntimeException('Could not fully write locked data file.');
        $written += $bytes;
    }
}

function update_json_file(string $name, $default, callable $mutator, bool $strictExisting = false)
{
    $path = json_path($name);
    $lockPath = $path . '.lock';
    $lockHandle = fopen($lockPath, 'c+');
    if ($lockHandle === false) throw new RuntimeException('Could not open data lock for update.');
    @chmod($lockPath, 0600);
    $tempPath = null;

    try {
        if (!flock($lockHandle, LOCK_EX)) throw new RuntimeException('Could not lock data file for update.');
        $exists = is_file($path);
        $existingPermissions = $exists ? @fileperms($path) : false;
        $replacementMode = is_int($existingPermissions) ? ($existingPermissions & 0777) : 0600;
        $raw = $exists ? file_get_contents($path) : '';
        if ($raw === false) throw new RuntimeException('Could not read data file for update.');
        if ($exists && trim($raw) === '' && $strictExisting) {
            throw new RuntimeException('Required data file is empty.');
        }
        $decoded = trim($raw) !== '' ? json_decode($raw, true) : $default;
        if ($strictExisting && trim($raw) !== '' && !is_array($decoded)) {
            throw new RuntimeException('Required data file contains invalid JSON.');
        }
        $current = is_array($decoded) ? $decoded : $default;
        $updated = $mutator($current);
        if ($updated === null) return $current;
        $json = json_encode($updated, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($json === false) throw new RuntimeException('Could not encode data file update.');
        $tempPath = tempnam(dirname($path), '.json-update-');
        if ($tempPath === false) throw new RuntimeException('Could not create temporary data file.');
        $tempHandle = fopen($tempPath, 'wb');
        if ($tempHandle === false) throw new RuntimeException('Could not open temporary data file.');
        try {
            write_stream_fully($tempHandle, $json);
            if (!fflush($tempHandle)) throw new RuntimeException('Could not flush temporary data file.');
            if (function_exists('fsync') && !fsync($tempHandle)) {
                throw new RuntimeException('Could not sync temporary data file.');
            }
        } finally {
            fclose($tempHandle);
        }
        @chmod($tempPath, $replacementMode);
        if (!rename($tempPath, $path)) throw new RuntimeException('Could not atomically replace data file.');
        $tempPath = null;
        return $updated;
    } finally {
        if (is_string($tempPath) && is_file($tempPath)) @unlink($tempPath);
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
    }
}

function default_email_template(): string
{
    return "Coach {{coach_last_name}},\n\n"
        . "My name is Royce Castle. I am a {{height}} {{primary_role}} / {{secondary_role}} from {{high_school}} in Idaho, class of {{grad_year}}. I am reaching out because I am interested in the {{school_name}} men's basketball program and would be grateful for a chance to learn the best process for being evaluated by your staff.\n\n"
        . "On the court, I am a coachable, team-first guard who can stretch the floor with a jump shot and three-point shot, create for teammates as a playmaker, post smaller guards, rebound hard from the perimeter, and defend high-level assignments. In high school, opponents often game-planned their defense around limiting my scoring opportunities, and I was often asked to guard the other team's best player.\n\n"
        . "I try to bring lockdown defensive effort and high-motor workhorse energy every day. I do not use alcohol or drugs, take my health seriously, and would work to be a positive leader in the locker room and a strong representative of your program.\n\n"
        . "Would your staff prefer that I complete a questionnaire, send full game film, schedule a phone call, attend a tryout or camp, or continue the conversation by email? I am happy to provide references, eligibility information, stats, and additional video.\n\n"
        . "You can view my recruiting profile, highlight video, and action photo library here:\n{{website_link}}\n\n"
        . "Direct highlight video section:\n{{video_link}}\n\n"
        . "Quick reply option, no typing required:\n{{quick_response_link}}\n\n"
        . "That link lets your staff choose highly interested, moderately interested, or still exploring fit, and it opens a prefilled response email.\n\n"
        . "Thank you for your time and consideration.\n\n"
        . "Sincerely,\nRoyce Castle\n{{from_email}}";
}

function default_settings(): array
{
    return [
        'forwardEmail' => RC_DEFAULT_MAILBOX,
        'fromEmail' => RC_DEFAULT_MAILBOX,
        'webmailEmail' => RC_DEFAULT_MAILBOX,
        'webmailUrl' => RC_DEFAULT_WEBMAIL_URL,
        'ccEmail' => '',
        'smtpHost' => RC_DEFAULT_SMTP_HOST,
        'smtpPort' => RC_DEFAULT_SMTP_PORT,
        'smtpSecurity' => RC_DEFAULT_SMTP_SECURITY,
        'smtpUser' => RC_DEFAULT_MAILBOX,
        'smtpPassword' => '',
        'sendMode' => 'server',
        'sendingEnabled' => false,
        'emailFormat' => 'plain',
        'trackOpens' => false,
        'dailySendLimit' => 1,
        'frequency' => 'manual',
        'day' => 'Monday',
        'time' => '09:00',
        'delaySeconds' => RC_PRIVATE_EMAIL_MIN_DELAY_SECONDS,
        'openDrafts' => false,
        'emailTemplateVersion' => RC_EMAIL_TEMPLATE_VERSION,
        'emailTemplate' => default_email_template(),
    ];
}

function load_settings(): array
{
    return normalize_settings(read_json_file('settings.json', []));
}

function normalize_settings(array $raw): array
{
    $settings = array_merge(default_settings(), $raw);
    $savedTemplateVersion = $raw['emailTemplateVersion'] ?? 0;
    foreach (['forwardEmail', 'fromEmail', 'webmailEmail'] as $key) {
        if (empty($settings[$key])) $settings[$key] = RC_DEFAULT_MAILBOX;
    }
    if (empty($settings['smtpHost'])) $settings['smtpHost'] = RC_DEFAULT_SMTP_HOST;
    $settings['smtpPort'] = max(1, (int)($settings['smtpPort'] ?? RC_DEFAULT_SMTP_PORT));
    if (empty($settings['smtpSecurity']) || !in_array($settings['smtpSecurity'], ['ssl', 'tls'], true)) {
        $settings['smtpSecurity'] = RC_DEFAULT_SMTP_SECURITY;
    }
    if (empty($settings['smtpUser'])) $settings['smtpUser'] = $settings['fromEmail'] ?: RC_DEFAULT_MAILBOX;
    if (empty($settings['webmailUrl'])) $settings['webmailUrl'] = RC_DEFAULT_WEBMAIL_URL;
    $settings['sendingEnabled'] = ($raw['sendingEnabled'] ?? false) === true;
    $settings['emailFormat'] = strtolower(trim((string)($settings['emailFormat'] ?? 'plain'))) === 'html' ? 'html' : 'plain';
    $settings['trackOpens'] = $settings['emailFormat'] === 'html' && ($raw['trackOpens'] ?? false) === true;
    $settings['dailySendLimit'] = min(
        RC_MAX_DAILY_SEND_ATTEMPTS,
        max(1, (int)($settings['dailySendLimit'] ?? 1))
    );
    $settings['openDrafts'] = ($raw['openDrafts'] ?? false) === true;
    if (empty($settings['emailTemplate'])) $settings['emailTemplate'] = default_email_template();
    if (should_upgrade_legacy_template((string)$settings['emailTemplate'], $savedTemplateVersion)) {
        $settings['emailTemplate'] = default_email_template();
    }
    $settings['emailTemplateVersion'] = RC_EMAIL_TEMPLATE_VERSION;
    $settings['delaySeconds'] = max(
        RC_PRIVATE_EMAIL_MIN_DELAY_SECONDS,
        (int)($settings['delaySeconds'] ?? RC_PRIVATE_EMAIL_MIN_DELAY_SECONDS)
    );
    return $settings;
}

function should_upgrade_legacy_template(string $template, $version): bool
{
    if ((int)$version >= RC_EMAIL_TEMPLATE_VERSION) return false;
    return preg_match('/Royce Castle would be grateful for an evaluation conversation\s+with\s+\{\{school_name\}\}/i', $template) === 1;
}

function public_settings(array $settings): array
{
    $settings['smtpPasswordSet'] = smtp_configured($settings);
    unset($settings['adminCodeHash']);
    unset($settings['smtpPassword']);
    return $settings;
}

function smtp_password(array $settings): string
{
    return (string)(getenv('RC_SMTP_PASSWORD') ?: ($settings['smtpPassword'] ?? ''));
}

function smtp_configured(array $settings): bool
{
    return !empty($settings['smtpHost'])
        && !empty($settings['smtpUser'])
        && smtp_password($settings) !== '';
}

function claim_smtp_send_slot(int $minimumSeconds = RC_PRIVATE_EMAIL_MIN_DELAY_SECONDS): array
{
    $decision = ['allowed' => false, 'retryAfter' => $minimumSeconds];
    try {
        update_json_file('smtp-throttle.json', [], function (array $state) use ($minimumSeconds, &$decision): array {
            $now = microtime(true);
            $lastReservedAt = (float)($state['lastReservedTimestamp'] ?? 0);
            $remaining = $minimumSeconds - ($now - $lastReservedAt);
            if ($lastReservedAt > 0 && $remaining > 0) {
                $decision = ['allowed' => false, 'retryAfter' => max(1, (int)ceil($remaining))];
                return $state;
            }

            $state['lastReservedTimestamp'] = $now;
            $state['lastReservedAt'] = gmdate('c');
            $decision = ['allowed' => true, 'retryAfter' => 0];
            return $state;
        }, true);
    } catch (Throwable $exception) {
        pause_sending_after_safety_state_failure($exception);
        throw new RuntimeException('SMTP pacing state is unavailable; live sending was paused.', 0, $exception);
    }
    return $decision;
}

function claim_live_run_target(string $runId, int $runTotal, int $runPosition, string $email): array
{
    $decision = ['allowed' => false, 'error' => 'This live-run recipient was already submitted.'];
    $emailHash = hash('sha256', normalize_email($email));
    update_json_file('live-run-claims.json', [], function (array $runs) use ($runId, $runTotal, $runPosition, $emailHash, &$decision): array {
        $cutoff = time() - (7 * 24 * 60 * 60);
        $runs = array_values(array_filter($runs, static function ($run) use ($cutoff): bool {
            if (!is_array($run)) return false;
            $updatedAt = strtotime((string)($run['updatedAt'] ?? '')) ?: 0;
            return $updatedAt >= $cutoff;
        }));

        $runIndex = -1;
        foreach ($runs as $index => $run) {
            if (($run['id'] ?? '') === $runId) {
                $runIndex = $index;
                break;
            }
        }
        if ($runIndex < 0) {
            array_unshift($runs, [
                'id' => $runId,
                'total' => $runTotal,
                'positions' => [],
                'updatedAt' => gmdate('c'),
            ]);
            $runIndex = 0;
        }

        $run = $runs[$runIndex];
        $positions = is_array($run['positions'] ?? null) ? $run['positions'] : [];
        $positionKey = (string)$runPosition;
        if ((int)($run['total'] ?? 0) !== $runTotal) {
            $decision['error'] = 'Live run total cannot change after submission begins.';
            return $runs;
        }
        if (array_key_exists($positionKey, $positions) || in_array($emailHash, $positions, true)) {
            $decision['error'] = 'Duplicate recipients and repeated run positions are blocked.';
            return $runs;
        }
        if (count($positions) >= RC_LIVE_RUN_RECIPIENT_LIMIT) {
            $decision['error'] = 'The live run recipient limit has been reached.';
            return $runs;
        }

        $positions[$positionKey] = $emailHash;
        $run['positions'] = $positions;
        $run['updatedAt'] = gmdate('c');
        $runs[$runIndex] = $run;
        usort($runs, static fn(array $a, array $b): int => strcmp((string)($b['updatedAt'] ?? ''), (string)($a['updatedAt'] ?? '')));
        $decision = ['allowed' => true, 'error' => ''];
        return array_slice($runs, 0, RC_RUN_HISTORY_LIMIT);
    });
    return $decision;
}

function daily_send_status(int $limit): array
{
    $limit = min(RC_MAX_DAILY_SEND_ATTEMPTS, max(1, $limit));
    $today = gmdate('Y-m-d');
    try {
        $state = read_json_file('daily-send-quota.json', [], true);
    } catch (Throwable $exception) {
        pause_sending_after_safety_state_failure($exception);
        throw new RuntimeException('Daily quota state is unavailable; live sending was paused.', 0, $exception);
    }
    $attempts = ($state['date'] ?? '') === $today ? max(0, (int)($state['attempts'] ?? 0)) : 0;
    return [
        'date' => $today,
        'attempts' => $attempts,
        'limit' => $limit,
        'remaining' => max(0, $limit - $attempts),
    ];
}

function claim_daily_send_attempt(int $limit): array
{
    $limit = min(RC_MAX_DAILY_SEND_ATTEMPTS, max(1, $limit));
    $decision = ['allowed' => false, 'date' => gmdate('Y-m-d'), 'attempts' => 0, 'limit' => $limit, 'remaining' => 0];
    try {
        update_json_file('daily-send-quota.json', [], function (array $state) use ($limit, &$decision): array {
            $today = gmdate('Y-m-d');
            if (($state['date'] ?? '') !== $today) {
                $state = ['date' => $today, 'attempts' => 0];
            }
            $attempts = max(0, (int)($state['attempts'] ?? 0));
            if ($attempts >= $limit) {
                $decision = ['allowed' => false, 'date' => $today, 'attempts' => $attempts, 'limit' => $limit, 'remaining' => 0];
                return $state;
            }
            $attempts++;
            $state['attempts'] = $attempts;
            $state['lastAttemptAt'] = gmdate('c');
            $decision = [
                'allowed' => true,
                'date' => $today,
                'attempts' => $attempts,
                'limit' => $limit,
                'remaining' => max(0, $limit - $attempts),
            ];
            return $state;
        }, true);
    } catch (Throwable $exception) {
        pause_sending_after_safety_state_failure($exception);
        throw new RuntimeException('Daily quota state is unavailable; live sending was paused.', 0, $exception);
    }
    return $decision;
}

function pause_sending_after_safety_state_failure(Throwable $exception): void
{
    error_log('Royce safety-state failure: ' . $exception->getMessage());
    try {
        set_sending_enabled(false);
    } catch (Throwable $pauseException) {
        error_log('Royce live-send pause failed after safety-state error: ' . $pauseException->getMessage());
    }
}

function set_sending_enabled(bool $enabled): array
{
    return update_json_file('settings.json', default_settings(), function (array $settings) use ($enabled): array {
        $settings = normalize_settings($settings);
        $settings['sendingEnabled'] = $enabled;
        return normalize_settings($settings);
    });
}

function request_json(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $json = json_decode($raw, true);
    return is_array($json) ? $json : [];
}

function respond_json(array $payload, int $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function require_admin(): void
{
    if (!empty($_SESSION['rc_admin'])) return;
    respond_json(['ok' => false, 'error' => 'Admin session required.'], 401);
}

function admin_code_matches(string $code): bool
{
    $settings = load_settings();
    $hash = $settings['adminCodeHash'] ?? (getenv('RC_ADMIN_CODE_HASH') ?: '');
    if ($hash && password_verify($code, $hash)) return true;
    $configured = (string)(getenv('RC_ADMIN_CODE') ?: '');
    return $configured !== '' && hash_equals($configured, $code);
}

function normalize_email(string $value): string
{
    return strtolower(trim($value));
}

function parse_emails(string $value): array
{
    $parts = preg_split('/[\s,;]+/', $value) ?: [];
    $emails = [];
    foreach ($parts as $part) {
        $email = normalize_email($part);
        if (filter_var($email, FILTER_VALIDATE_EMAIL)) $emails[$email] = $email;
    }
    return array_values($emails);
}

function safe_header_value(string $value): string
{
    return trim(str_replace(["\r", "\n"], '', $value));
}

function safe_text(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function upsert_by_id(array $items, array $item): array
{
    $id = (string)($item['id'] ?? '');
    foreach ($items as $index => $existing) {
        if (($existing['id'] ?? '') === $id || (!empty($item['trackingId']) && ($existing['trackingId'] ?? '') === $item['trackingId'])) {
            $items[$index] = array_merge($existing, $item);
            return $items;
        }
    }
    array_unshift($items, $item);
    return array_slice($items, 0, RC_EMAIL_HISTORY_LIMIT);
}

function default_delivery_stats(): array
{
    $history = read_json_file('email-history.json', []);
    $stats = [
        'attempted' => 0,
        'accepted' => 0,
        'failed' => 0,
        'smtpAccepted' => 0,
        'mailAccepted' => 0,
        'unknownAccepted' => 0,
        'baselineLimited' => count($history) > 0,
        'initializedAt' => gmdate('c'),
        'lastResultAt' => '',
        'lastRun' => null,
        'runs' => [],
    ];

    foreach ($history as $item) {
        $status = strtolower(trim((string)($item['status'] ?? '')));
        $transport = strtolower(trim((string)($item['transport'] ?? '')));
        $acceptedStatus = in_array($status, ['opened', 'opened (tracked)', 'accepted by smtp', 'accepted by sending server'], true)
            || ($status === 'sent' && in_array($transport, ['smtp', 'php-mail', 'smtp-fallback-mail'], true));
        if ($acceptedStatus) {
            $stats['attempted']++;
            $stats['accepted']++;
            if ($transport === 'smtp') $stats['smtpAccepted']++;
            elseif ($transport === 'php-mail' || $transport === 'smtp-fallback-mail') $stats['mailAccepted']++;
            else $stats['unknownAccepted']++;
        } elseif ($status === 'send failed') {
            $stats['attempted']++;
            $stats['failed']++;
        }
    }

    return $stats;
}

function normalize_run_timestamp($value): string
{
    $timestamp = substr(trim((string)$value), 0, 64);
    return $timestamp !== '' && strtotime($timestamp) !== false ? $timestamp : '';
}

function normalize_delivery_run(array $run, bool $keepPositions = true): array
{
    $id = substr((string)(preg_replace('/[^a-zA-Z0-9._:-]/', '', (string)($run['id'] ?? '')) ?? ''), 0, 120);
    $rawProcessed = min(RC_MAX_RUN_TOTAL, max(0, (int)($run['processed'] ?? 0)));
    $rawAccepted = min(RC_MAX_RUN_TOTAL, max(0, (int)($run['accepted'] ?? 0)));
    $rawFailed = min(RC_MAX_RUN_TOTAL, max(0, (int)($run['failed'] ?? 0)));
    $rawPrepared = min(RC_MAX_RUN_TOTAL, max(0, (int)($run['prepared'] ?? 0)));
    $total = min(RC_MAX_RUN_TOTAL, max(0, (int)($run['total'] ?? 0)));
    if ($total === 0 && ($rawProcessed > 0 || $rawAccepted > 0 || $rawFailed > 0 || $rawPrepared > 0)) {
        $total = min(RC_MAX_RUN_TOTAL, max($rawProcessed, $rawAccepted + $rawFailed + $rawPrepared));
    }
    $accepted = min($rawAccepted, $total);
    $failed = min($rawFailed, max(0, $total - $accepted));
    $prepared = min($rawPrepared, max(0, $total - $accepted - $failed));
    $processed = min($total, max($rawProcessed, $accepted + $failed + $prepared));
    $smtpAccepted = min(max(0, (int)($run['smtpAccepted'] ?? 0)), $accepted);
    $mailAccepted = min(max(0, (int)($run['mailAccepted'] ?? 0)), max(0, $accepted - $smtpAccepted));
    $unknownAccepted = max(0, $accepted - $smtpAccepted - $mailAccepted);
    $normalized = [
        'id' => $id,
        'mode' => ($run['mode'] ?? '') === 'draft' ? 'draft' : 'send',
        'total' => $total,
        'processed' => $processed,
        'accepted' => $accepted,
        'failed' => $failed,
        'prepared' => $prepared,
        'smtpAccepted' => $smtpAccepted,
        'mailAccepted' => $mailAccepted,
        'unknownAccepted' => $unknownAccepted,
        'startedAt' => normalize_run_timestamp($run['startedAt'] ?? ''),
        'updatedAt' => normalize_run_timestamp($run['updatedAt'] ?? ''),
        'completedAt' => normalize_run_timestamp($run['completedAt'] ?? ''),
        'lastError' => substr((string)($run['lastError'] ?? ''), 0, 500),
    ];
    if ($keepPositions) {
        $normalized['positions'] = [];
        $positions = is_array($run['positions'] ?? null) ? $run['positions'] : [];
        foreach ($positions as $position => $result) {
            $position = (int)$position;
            if ($position < 1 || $position > RC_MAX_RUN_TOTAL) continue;
            $normalized['positions'][(string)$position] = $result === 'accepted' ? 'accepted' : 'failed';
        }
    }
    return $normalized;
}

function public_delivery_run(array $run): array
{
    return normalize_delivery_run($run, false);
}

function normalize_delivery_stats(array $stats): array
{
    foreach (['attempted', 'accepted', 'failed', 'smtpAccepted', 'mailAccepted', 'unknownAccepted'] as $key) {
        $stats[$key] = max(0, (int)($stats[$key] ?? 0));
    }
    $stats['baselineLimited'] = !empty($stats['baselineLimited']);
    $stats['initializedAt'] = (string)($stats['initializedAt'] ?? '');
    $stats['lastResultAt'] = (string)($stats['lastResultAt'] ?? '');
    $rawRuns = is_array($stats['runs'] ?? null) ? $stats['runs'] : [];
    if (!$rawRuns && is_array($stats['lastRun'] ?? null) && !empty($stats['lastRun']['id'])) {
        $rawRuns[] = $stats['lastRun'];
    }
    $stats['runs'] = [];
    $seenRunIds = [];
    foreach ($rawRuns as $run) {
        if (!is_array($run)) continue;
        $normalizedRun = normalize_delivery_run($run);
        if ($normalizedRun['id'] === '' || isset($seenRunIds[$normalizedRun['id']])) continue;
        $seenRunIds[$normalizedRun['id']] = true;
        $stats['runs'][] = $normalizedRun;
        if (count($stats['runs']) >= RC_RUN_HISTORY_LIMIT) break;
    }
    $stats['lastRun'] = $stats['runs'] ? public_delivery_run($stats['runs'][0]) : null;
    return $stats;
}

function load_delivery_stats(): array
{
    $stats = read_json_file('delivery-stats.json', []);
    if (!$stats) {
        $stats = update_json_file('delivery-stats.json', [], function (array $current): array {
            return $current ?: default_delivery_stats();
        });
    }
    return normalize_delivery_stats($stats);
}

function public_delivery_stats(array $stats): array
{
    $runs = array_map(
        fn(array $run): array => public_delivery_run($run),
        array_values(array_filter($stats['runs'] ?? [], 'is_array'))
    );
    return [
        'attempted' => max(0, (int)($stats['attempted'] ?? 0)),
        'accepted' => max(0, (int)($stats['accepted'] ?? 0)),
        'failed' => max(0, (int)($stats['failed'] ?? 0)),
        'smtpAccepted' => max(0, (int)($stats['smtpAccepted'] ?? 0)),
        'mailAccepted' => max(0, (int)($stats['mailAccepted'] ?? 0)),
        'unknownAccepted' => max(0, (int)($stats['unknownAccepted'] ?? 0)),
        'baselineLimited' => !empty($stats['baselineLimited']),
        'initializedAt' => (string)($stats['initializedAt'] ?? ''),
        'lastResultAt' => (string)($stats['lastResultAt'] ?? ''),
        'lastRun' => $runs[0] ?? (is_array($stats['lastRun'] ?? null) ? public_delivery_run($stats['lastRun']) : null),
        'runs' => $runs,
    ];
}

function store_delivery_run(array $stats, array $run): array
{
    $run = normalize_delivery_run($run);
    $stats['runs'] = array_values(array_filter(
        $stats['runs'] ?? [],
        fn($existing): bool => is_array($existing) && ($existing['id'] ?? '') !== $run['id']
    ));
    array_unshift($stats['runs'], $run);
    $stats['runs'] = array_slice($stats['runs'], 0, RC_RUN_HISTORY_LIMIT);
    foreach ($stats['runs'] as $index => &$storedRun) {
        if ($index >= RC_RUN_POSITION_RETENTION) $storedRun['positions'] = [];
    }
    unset($storedRun);
    $stats['lastRun'] = public_delivery_run($stats['runs'][0]);
    return $stats;
}

function record_delivery_run_state(array $incomingRun, string $phase): array
{
    $runId = substr((string)(preg_replace('/[^a-zA-Z0-9._:-]/', '', (string)($incomingRun['id'] ?? '')) ?? ''), 0, 120);
    if ($runId === '') throw new InvalidArgumentException('Run id is required.');
    if (!in_array($phase, ['start', 'progress', 'finish'], true)) throw new InvalidArgumentException('Unknown run phase.');

    $lock = fopen(json_path('delivery-stats.lock'), 'c');
    if ($lock === false) throw new RuntimeException('Could not open delivery stats lock.');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Could not lock delivery stats.');
        $stats = load_delivery_stats();
        $existingRun = null;
        foreach ($stats['runs'] as $run) {
            if (($run['id'] ?? '') !== $runId) continue;
            $existingRun = $run;
            break;
        }
        $incomingTotal = min(RC_MAX_RUN_TOTAL, max(0, (int)($incomingRun['total'] ?? 0)));
        if ($existingRun === null && $incomingTotal === 0) throw new InvalidArgumentException('Run total is required.');
        $run = normalize_delivery_run($existingRun ?: [
            'id' => $runId,
            'mode' => ($incomingRun['mode'] ?? '') === 'draft' ? 'draft' : 'send',
            'total' => $incomingTotal,
            'startedAt' => (string)($incomingRun['startedAt'] ?? gmdate('c')),
        ]);
        if ($run['total'] === 0) $run['total'] = $incomingTotal;
        if ($incomingTotal > 0 && $run['total'] > 0 && $incomingTotal !== $run['total']) {
            throw new InvalidArgumentException('Run total cannot change after the run starts.');
        }
        if ($run['startedAt'] === '') {
            $run['startedAt'] = normalize_run_timestamp($incomingRun['startedAt'] ?? '') ?: gmdate('c');
        }

        if ($phase !== 'start') {
            $incomingCounts = [];
            foreach (['processed', 'accepted', 'failed', 'prepared', 'smtpAccepted', 'mailAccepted', 'unknownAccepted'] as $key) {
                $rawCount = (int)($incomingRun[$key] ?? 0);
                if ($rawCount < 0 || $rawCount > RC_MAX_RUN_TOTAL) throw new InvalidArgumentException('Run counts are invalid.');
                $incomingCounts[$key] = $rawCount;
                $run[$key] = max($run[$key], $rawCount);
            }
            if (
                $incomingCounts['processed'] > $run['total'] ||
                $incomingCounts['accepted'] + $incomingCounts['failed'] + $incomingCounts['prepared'] > $incomingCounts['processed'] ||
                $incomingCounts['smtpAccepted'] + $incomingCounts['mailAccepted'] + $incomingCounts['unknownAccepted'] > $incomingCounts['accepted']
            ) {
                throw new InvalidArgumentException('Run counts do not form a valid summary.');
            }
            if (!empty($incomingRun['lastError'])) $run['lastError'] = substr((string)$incomingRun['lastError'], 0, 500);
        }
        $run['updatedAt'] = normalize_run_timestamp($incomingRun['updatedAt'] ?? '') ?: gmdate('c');
        if ($phase === 'finish') {
            $run['completedAt'] = normalize_run_timestamp($incomingRun['completedAt'] ?? '') ?: gmdate('c');
        }

        $stats = store_delivery_run($stats, normalize_delivery_run($run));
        write_json_file('delivery-stats.json', $stats);
        return public_delivery_stats($stats);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function record_delivery_result(array $target, bool $sent, string $transport, string $error): array
{
    $lock = fopen(json_path('delivery-stats.lock'), 'c');
    if ($lock === false) throw new RuntimeException('Could not open delivery stats lock.');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Could not lock delivery stats.');
        $stats = load_delivery_stats();
        $runId = substr((string)(preg_replace('/[^a-zA-Z0-9._:-]/', '', (string)($target['runId'] ?? '')) ?? ''), 0, 120);
        $runTotal = min(RC_MAX_RUN_TOTAL, max(0, (int)($target['runTotal'] ?? 0)));
        $runPosition = min(RC_MAX_RUN_TOTAL, max(0, (int)($target['runPosition'] ?? 0)));
        if ($runTotal > 0) $runPosition = min($runPosition, $runTotal);
        $runStartedAt = normalize_run_timestamp($target['runStartedAt'] ?? '');
        $isNewResult = true;
        $run = null;
        $runIndex = -1;

        if ($runId !== '' && $runPosition > 0) {
            foreach ($stats['runs'] as $index => $existingRun) {
                if (($existingRun['id'] ?? '') !== $runId) continue;
                $runIndex = $index;
                break;
            }
            if ($runIndex >= 0) {
                $run = normalize_delivery_run($stats['runs'][$runIndex]);
                array_splice($stats['runs'], $runIndex, 1);
            } else {
                $run = normalize_delivery_run([
                    'id' => $runId,
                    'mode' => ($target['runMode'] ?? '') === 'draft' ? 'draft' : 'send',
                    'total' => $runTotal,
                    'startedAt' => $runStartedAt ?: gmdate('c'),
                ]);
            }

            $positionKey = (string)$runPosition;
            if (array_key_exists($positionKey, $run['positions'])) {
                $isNewResult = false;
            } else {
                $run['positions'][$positionKey] = $sent ? 'accepted' : 'failed';
            }
        }

        if ($isNewResult) {
            $stats['attempted']++;
            if ($sent) {
                $stats['accepted']++;
                if ($transport === 'smtp') $stats['smtpAccepted']++;
                elseif ($transport === 'php-mail') $stats['mailAccepted']++;
                else $stats['unknownAccepted']++;
            } else {
                $stats['failed']++;
            }

            if (is_array($run)) {
                $run['total'] = max($run['total'], $runTotal);
                $run['processed']++;
                if ($sent) {
                    $run['accepted']++;
                    if ($transport === 'smtp') $run['smtpAccepted']++;
                    elseif ($transport === 'php-mail') $run['mailAccepted']++;
                    else $run['unknownAccepted']++;
                } else {
                    $run['failed']++;
                    $run['lastError'] = substr(trim($error), 0, 500);
                }
                $run['updatedAt'] = gmdate('c');
                if ($run['total'] > 0 && $run['processed'] >= $run['total'] && $run['completedAt'] === '') {
                    $run['completedAt'] = gmdate('c');
                }
            }
        }

        if (is_array($run)) {
            $stats = store_delivery_run($stats, $run);
        }

        $stats['lastResultAt'] = gmdate('c');
        write_json_file('delivery-stats.json', $stats);
        return public_delivery_stats($stats);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
