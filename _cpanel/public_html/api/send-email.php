<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

require_admin();

$target = request_json();
$settings = load_settings();

if (empty($settings['sendingEnabled'])) {
    respond_json([
        'ok' => false,
        'sent' => false,
        'paused' => true,
        'error' => 'Live sending is paused in Admin & Email Settings.',
    ], 423);
}
if (!smtp_configured($settings)) {
    respond_json([
        'ok' => false,
        'sent' => false,
        'error' => 'Authenticated SMTP is required for every live send.',
    ], 503);
}

$emails = parse_emails((string)($target['email'] ?? ''));
if (count($emails) !== 1) {
    respond_json(['ok' => false, 'sent' => false, 'error' => 'Live sends must contain exactly one individualized recipient.'], 422);
}
$recipient = $emails[0];

try {
    $optOutMap = send_normalized_email_set(read_json_file('opt-outs.json', [], true));
    $consentDates = send_normalize_consent_dates(read_json_file('consent-dates.json', [], true));
} catch (Throwable $exception) {
    pause_sending_after_safety_state_failure($exception);
    respond_json([
        'ok' => false,
        'sent' => false,
        'paused' => true,
        'error' => 'Recipient eligibility records could not be verified, so live sending was paused.',
    ], 503);
}

if (isset($optOutMap[$recipient])) {
    respond_json(['ok' => false, 'sent' => false, 'error' => 'The recipient is suppressed from live sending.'], 422);
}
if (!array_key_exists($recipient, $consentDates)) {
    respond_json(['ok' => false, 'sent' => false, 'error' => 'The recipient does not have an active saved consent date that is a valid nonfuture UTC date.'], 422);
}

$runId = trim((string)($target['runId'] ?? ''));
$runTotal = (int)($target['runTotal'] ?? 0);
$runPosition = (int)($target['runPosition'] ?? 0);
$dailySendLimit = min(RC_MAX_DAILY_SEND_ATTEMPTS, max(1, (int)($settings['dailySendLimit'] ?? 1)));
if (
    $runId === '' ||
    preg_match('/^[a-zA-Z0-9._:-]{1,120}$/', $runId) !== 1 ||
    empty($target['runConfirmed']) ||
    $runTotal !== RC_LIVE_RUN_RECIPIENT_LIMIT ||
    $runPosition !== 1
) {
    respond_json([
        'ok' => false,
        'sent' => false,
        'error' => 'Every live send requires a separate confirmation for exactly one recipient.',
    ], 422);
}
$dailyStatus = daily_send_status($dailySendLimit);
$remainingRunAttempts = $runTotal - $runPosition + 1;
if ($remainingRunAttempts > (int)$dailyStatus['remaining']) {
    respond_json([
        'ok' => false,
        'sent' => false,
        'dailyLimitReached' => true,
        'dailySendStatus' => $dailyStatus,
        'error' => 'This run exceeds the remaining UTC daily live-send attempt quota.',
    ], 429);
}

$from = normalize_email((string)($settings['smtpUser'] ?? RC_DEFAULT_MAILBOX));
$replyTo = normalize_email((string)($settings['forwardEmail'] ?? $from));
if (!filter_var($from, FILTER_VALIDATE_EMAIL)) {
    respond_json(['ok' => false, 'sent' => false, 'error' => 'The authenticated SMTP mailbox is not a valid sender address.'], 503);
}
if (!filter_var($replyTo, FILTER_VALIDATE_EMAIL)) $replyTo = $from;

$subject = safe_header_value((string)($target['subject'] ?? "Royce Castle | Basketball Recruiting"));
$bodyText = trim((string)($target['body'] ?? ''));
if ($subject === '' || $bodyText === '') {
    respond_json(['ok' => false, 'sent' => false, 'error' => 'A nonblank subject and message body are required.'], 422);
}
$emailFormat = ($settings['emailFormat'] ?? 'plain') === 'html' ? 'html' : 'plain';
$trackOpens = $emailFormat === 'html' && !empty($settings['trackOpens']);
$trackingId = $trackOpens ? 'open-' . bin2hex(random_bytes(12)) : '';
$historyId = 'email-' . time() . '-' . bin2hex(random_bytes(4));

$historyItem = [
    'id' => $historyId,
    'trackingId' => $trackingId,
    'runId' => (string)($target['runId'] ?? ''),
    'runPosition' => (int)($target['runPosition'] ?? 0),
    'contactId' => (string)($target['contactId'] ?? ''),
    'school' => (string)($target['label'] ?? ''),
    'email' => implode(', ', $emails),
    'subject' => $subject,
    'body' => $bodyText,
    'status' => 'Sending',
    'sentAt' => gmdate('c'),
    'respondedAt' => '',
    'viewedAt' => '',
    'openedAt' => '',
    'openCount' => 0,
    'emailFormat' => $emailFormat,
    'trackingEnabled' => $trackOpens,
];

$sent = false;
$error = '';
$transport = 'smtp';
$slot = claim_smtp_send_slot(max(RC_PRIVATE_EMAIL_MIN_DELAY_SECONDS, (int)($settings['delaySeconds'] ?? 0)));
if (empty($slot['allowed'])) {
    $retryAfter = max(1, (int)($slot['retryAfter'] ?? 1));
    header('Retry-After: ' . $retryAfter);
    respond_json([
        'ok' => false,
        'sent' => false,
        'rateLimited' => true,
        'retryAfter' => $retryAfter,
        'error' => 'Mailbox pacing is active. Retry this recipient shortly.',
    ], 429);
}
$runClaim = claim_live_run_target($runId, $runTotal, $runPosition, $emails[0]);
if (empty($runClaim['allowed'])) {
    respond_json([
        'ok' => false,
        'sent' => false,
        'error' => (string)($runClaim['error'] ?? 'This recipient was already submitted for the live run.'),
    ], 409);
}
if ($runPosition === $runTotal) {
    set_sending_enabled(false);
}
$dailyClaim = claim_daily_send_attempt($dailySendLimit);
if (empty($dailyClaim['allowed'])) {
    respond_json([
        'ok' => false,
        'sent' => false,
        'dailyLimitReached' => true,
        'dailySendStatus' => $dailyClaim,
        'error' => 'The UTC daily live-send attempt limit has been reached.',
    ], 429);
}
$sent = send_recruiting_email_smtp($emails, $subject, $bodyText, $settings, $target, $trackingId, $from, $replyTo, $error);

$historyItem['status'] = $sent ? 'Accepted by SMTP' : 'Send failed';
$historyItem['transport'] = $transport;
$accountingWarnings = [];
$historySaved = false;
$deliveryStats = null;
try {
    $deliveryStats = record_delivery_result($target, $sent, $transport, $error);
} catch (Throwable $exception) {
    $accountingWarnings[] = 'Delivery totals could not be updated.';
    error_log('Royce delivery stats save failed: ' . $exception->getMessage());
}

try {
    update_json_file(
        'email-history.json',
        [],
        fn(array $items): array => upsert_by_id($items, $historyItem)
    );
    $historySaved = true;
} catch (Throwable $exception) {
    $accountingWarnings[] = 'Detailed history could not be saved.';
    error_log('Royce email history save failed: ' . $exception->getMessage());
}

$transportLabel = 'SMTP';
$logMessage = ($sent ? 'Accepted' : 'Could not send') . ' recruiting email to ' . implode(', ', $emails) . ' via ' . $transportLabel . '.';
if (!$sent && $error !== '') $logMessage .= ' ' . $error;
try {
    update_json_file('run-log.json', [], function (array $log) use ($logMessage): array {
        array_unshift($log, [
            'createdAt' => gmdate('c'),
            'message' => $logMessage,
        ]);
        return array_slice($log, 0, 200);
    });
} catch (Throwable $exception) {
    $accountingWarnings[] = 'The server run log could not be updated.';
    error_log('Royce run log save failed: ' . $exception->getMessage());
}

respond_json([
    'ok' => true,
    'sent' => $sent,
    'error' => $error,
    'transport' => $transport,
    'historySaved' => $historySaved,
    'accountingWarning' => implode(' ', $accountingWarnings),
    'deliveryStats' => $deliveryStats,
    'dailySendStatus' => $dailyClaim,
    'historyItem' => $historyItem,
]);

function send_normalized_email_set($values): array
{
    $emails = [];
    foreach (is_array($values) ? $values : [] as $value) {
        $email = normalize_email((string)$value);
        if (filter_var($email, FILTER_VALIDATE_EMAIL)) $emails[$email] = true;
    }
    return $emails;
}

function send_normalize_consent_dates($values): array
{
    $consentDates = [];
    foreach (is_array($values) ? $values : [] as $email => $date) {
        $normalized = normalize_email((string)$email);
        $normalizedDate = send_normalize_utc_consent_date($date);
        if (!filter_var($normalized, FILTER_VALIDATE_EMAIL) || $normalizedDate === '') continue;
        $consentDates[$normalized] = $normalizedDate;
    }
    return $consentDates;
}

function send_normalize_utc_consent_date($value): string
{
    $date = trim((string)$value);
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $parts) !== 1) return '';
    if (!checkdate((int)$parts[2], (int)$parts[3], (int)$parts[1])) return '';
    return $date <= gmdate('Y-m-d') ? $date : '';
}

function send_recruiting_email_smtp(array $emails, string $subject, string $text, array $settings, array $target, string $trackingId, string $from, string $replyTo, string &$error): bool
{
    $smtpUser = normalize_email((string)($settings['smtpUser'] ?? $from));
    $smtpPassword = smtp_password($settings);
    $host = trim((string)($settings['smtpHost'] ?? RC_DEFAULT_SMTP_HOST));
    $port = max(1, (int)($settings['smtpPort'] ?? RC_DEFAULT_SMTP_PORT));
    $security = (string)($settings['smtpSecurity'] ?? RC_DEFAULT_SMTP_SECURITY);
    if (!$host || !$smtpUser || !$smtpPassword) {
        $error = 'SMTP is missing host, username, or password.';
        return false;
    }

    $headers = [
        'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
        'Message-ID: <rc-' . bin2hex(random_bytes(12)) . '@roycecastle.com>',
        'To: ' . implode(', ', $emails),
        'Subject: ' . $subject,
        'MIME-Version: 1.0',
        'From: Royce Castle Recruiting <' . $from . '>',
        'Reply-To: ' . $replyTo,
    ];

    if (($settings['emailFormat'] ?? 'plain') !== 'html') {
        $headers[] = 'Content-Type: text/plain; charset=UTF-8';
        $headers[] = 'Content-Transfer-Encoding: 8bit';
        $body = normalize_email_body($text);
    } else {
        $boundary = 'rc-' . bin2hex(random_bytes(12));
        $headers[] = 'Content-Type: multipart/alternative; boundary="' . $boundary . '"';
        $html = email_html($text, $settings, $trackingId, !empty($settings['trackOpens']));
        $body = "--{$boundary}\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . normalize_email_body($text) . "\r\n\r\n"
            . "--{$boundary}\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . $html . "\r\n\r\n"
            . "--{$boundary}--";
    }
    $message = implode("\r\n", $headers) . "\r\n\r\n" . $body;

    return smtp_send($host, $port, $security, $smtpUser, $smtpPassword, $from, $emails, $message, $error);
}

function smtp_send(string $host, int $port, string $security, string $username, string $password, string $from, array $recipients, string $message, string &$error): bool
{
    $remote = ($security === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $context = stream_context_create([
        'ssl' => [
            'peer_name' => $host,
            'verify_peer' => true,
            'verify_peer_name' => true,
            'allow_self_signed' => false,
        ],
    ]);
    $errno = 0;
    $errstr = '';
    $socket = @stream_socket_client($remote, $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        $error = 'SMTP connection failed: ' . ($errstr ?: 'unknown error');
        return false;
    }
    stream_set_timeout($socket, 20);

    try {
        if (!smtp_expect($socket, [220], $error)) return false;
        if (!smtp_command($socket, 'EHLO roycecastle.com', [250], $error)) return false;
        if ($security === 'tls') {
            if (!smtp_command($socket, 'STARTTLS', [220], $error)) return false;
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                $error = 'SMTP STARTTLS negotiation failed.';
                return false;
            }
            if (!smtp_command($socket, 'EHLO roycecastle.com', [250], $error)) return false;
        }
        if (!smtp_command($socket, 'AUTH LOGIN', [334], $error)) return false;
        if (!smtp_command($socket, base64_encode($username), [334], $error, true)) return false;
        if (!smtp_command($socket, base64_encode($password), [235], $error, true)) return false;
        if (!smtp_command($socket, 'MAIL FROM:<' . $from . '>', [250], $error)) return false;
        foreach ($recipients as $recipient) {
            if (!smtp_command($socket, 'RCPT TO:<' . $recipient . '>', [250, 251], $error)) return false;
        }
        if (!smtp_command($socket, 'DATA', [354], $error)) return false;
        $payload = smtp_dot_stuff($message) . "\r\n.";
        if (!smtp_command($socket, $payload, [250], $error, true)) return false;
        $quitError = '';
        smtp_command($socket, 'QUIT', [221], $quitError);
        return true;
    } finally {
        fclose($socket);
    }
}

function smtp_command($socket, string $command, array $expected, string &$error, bool $redactCommand = false): bool
{
    fwrite($socket, $command . "\r\n");
    return smtp_expect($socket, $expected, $error, $redactCommand ? '[redacted]' : $command);
}

function smtp_expect($socket, array $expected, string &$error, string $command = ''): bool
{
    $response = '';
    do {
        $line = fgets($socket, 2048);
        if ($line === false) {
            $error = 'SMTP did not return a response' . ($command ? ' after ' . $command : '') . '.';
            return false;
        }
        $response .= $line;
    } while (isset($line[3]) && $line[3] === '-');

    $code = (int)substr($response, 0, 3);
    if (!in_array($code, $expected, true)) {
        $error = 'SMTP command failed' . ($command ? ' after ' . $command : '') . ': ' . trim($response);
        return false;
    }
    return true;
}

function smtp_dot_stuff(string $message): string
{
    $normalized = preg_replace("/\r\n|\r|\n/", "\r\n", $message) ?? $message;
    return preg_replace('/^\./m', '..', $normalized) ?? $normalized;
}

function normalize_email_body(string $text): string
{
    return preg_replace("/\r\n|\r|\n/", "\r\n", $text) ?? $text;
}

function email_html(string $text, array $settings, string $trackingId, bool $trackOpens): string
{
    $replyTo = safe_text((string)($settings['forwardEmail'] ?? $settings['fromEmail'] ?? RC_DEFAULT_MAILBOX));
    $profile = nl2br(link_urls(safe_text($text)));
    $trackingPixel = '';
    if ($trackOpens && $trackingId !== '') {
        $pixel = RC_PUBLIC_ORIGIN . '/api/open.php?id=' . rawurlencode($trackingId);
        $trackingPixel = '<img src="' . safe_text($pixel) . '" width="1" height="1" alt="" style="display:none;width:1px;height:1px;">';
    }

    return '<!doctype html><html><body style="margin:0;background:#eef2f6;padding:28px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#07111f;">'
        . '<div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d9e0ea;border-radius:8px;overflow:hidden;box-shadow:0 18px 44px rgba(9,17,31,.12);">'
        . '<div style="background:#06101d;color:#ffffff;padding:24px 28px;">'
        . '<div style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#f0b323;">Royce Castle Recruiting</div>'
        . '<h1 style="margin:8px 0 0;font-size:28px;line-height:1.1;font-weight:400;">6\'5" guard with size, shooting touch, and a defensive motor.</h1>'
        . '</div>'
        . '<div style="padding:26px 28px;font-size:16px;line-height:1.62;">' . $profile . '</div>'
        . '<div style="padding:0 28px 28px;display:block;">'
        . '<p style="margin:0;color:#5e6879;font-size:13px;line-height:1.5;">Replying to this email will go to ' . $replyTo . '.</p>'
        . '</div>'
        . '</div>'
        . $trackingPixel
        . '</body></html>';
}

function link_urls(string $escapedText): string
{
    return preg_replace(
        '~(https?://[^\s<]+)~',
        '<a href="$1" style="color:#7a1026;text-decoration:underline;">$1</a>',
        $escapedText
    ) ?: $escapedText;
}
