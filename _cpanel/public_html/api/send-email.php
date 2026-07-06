<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

require_admin();

$target = request_json();
$settings = load_settings();
$emails = parse_emails((string)($target['email'] ?? ''));
$optOuts = read_json_file('opt-outs.json', []);
$optOutMap = array_fill_keys(array_map('normalize_email', $optOuts), true);
$emails = array_values(array_filter($emails, fn($email) => empty($optOutMap[$email])));

if (!$emails) {
    respond_json(['ok' => false, 'sent' => false, 'error' => 'No active recipients.'], 422);
}

$from = normalize_email((string)($settings['fromEmail'] ?? RC_DEFAULT_MAILBOX));
$replyTo = normalize_email((string)($settings['forwardEmail'] ?? $from));
if (!filter_var($from, FILTER_VALIDATE_EMAIL)) $from = RC_DEFAULT_MAILBOX;
if (!filter_var($replyTo, FILTER_VALIDATE_EMAIL)) $replyTo = $from;

$subject = safe_header_value((string)($target['subject'] ?? "Royce Castle | Basketball Recruiting"));
$bodyText = ensure_required_links((string)($target['body'] ?? ''), $target);
$trackingId = 'open-' . bin2hex(random_bytes(12));
$historyId = 'email-' . time() . '-' . bin2hex(random_bytes(4));

$historyItem = [
    'id' => $historyId,
    'trackingId' => $trackingId,
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
];

$sent = false;
$error = '';
if (function_exists('mail')) {
    $sent = send_recruiting_email($emails, $subject, $bodyText, $settings, $target, $trackingId, $from, $replyTo);
    if (!$sent) $error = 'PHP mail() returned false.';
} else {
    $error = 'PHP mail() is not available on this host.';
}

$historyItem['status'] = $sent ? 'Sent' : 'Send failed';
$history = upsert_by_id(read_json_file('email-history.json', []), $historyItem);
write_json_file('email-history.json', $history);

$log = read_json_file('run-log.json', []);
array_unshift($log, [
    'createdAt' => gmdate('c'),
    'message' => ($sent ? 'Sent' : 'Could not send') . ' recruiting email to ' . implode(', ', $emails) . '.',
]);
write_json_file('run-log.json', array_slice($log, 0, 200));

respond_json([
    'ok' => true,
    'sent' => $sent,
    'error' => $error,
    'historyItem' => $historyItem,
]);

function send_recruiting_email(array $emails, string $subject, string $text, array $settings, array $target, string $trackingId, string $from, string $replyTo): bool
{
    $boundary = 'rc-' . bin2hex(random_bytes(12));
    $toLine = implode(', ', $emails);
    $cc = implode(', ', parse_emails((string)($settings['ccEmail'] ?? '')));
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        'From: Royce Castle Recruiting <' . $from . '>',
        'Reply-To: ' . $replyTo,
        'X-Mailer: Royce Castle Recruiting',
    ];
    if ($cc !== '') $headers[] = 'Cc: ' . $cc;

    $html = email_html($text, $settings, $target, $trackingId);
    $message = "--{$boundary}\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: 8bit\r\n\r\n"
        . $text . "\r\n\r\n"
        . "--{$boundary}\r\n"
        . "Content-Type: text/html; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: 8bit\r\n\r\n"
        . $html . "\r\n\r\n"
        . "--{$boundary}--";

    return mail($toLine, $subject, $message, implode("\r\n", $headers), '-f' . $from);
}

function email_html(string $text, array $settings, array $target, string $trackingId): string
{
    $website = safe_text((string)($target['websiteLink'] ?? RC_PUBLIC_ORIGIN . '/'));
    $video = safe_text((string)($target['videoLink'] ?? RC_PUBLIC_ORIGIN . '/#video'));
    $quick = safe_text((string)($target['quickResponseLink'] ?? RC_PUBLIC_ORIGIN . '/respond.html'));
    $replyTo = safe_text((string)($settings['forwardEmail'] ?? $settings['fromEmail'] ?? RC_DEFAULT_MAILBOX));
    $profile = nl2br(link_urls(safe_text($text)));
    $pixel = RC_PUBLIC_ORIGIN . '/api/open.php?id=' . rawurlencode($trackingId);

    return '<!doctype html><html><body style="margin:0;background:#eef2f6;padding:28px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#07111f;">'
        . '<div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d9e0ea;border-radius:8px;overflow:hidden;box-shadow:0 18px 44px rgba(9,17,31,.12);">'
        . '<div style="background:#06101d;color:#ffffff;padding:24px 28px;">'
        . '<div style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#f0b323;">Royce Castle Recruiting</div>'
        . '<h1 style="margin:8px 0 0;font-size:28px;line-height:1.1;font-weight:500;">6\'5" guard with size, shooting touch, and a defensive motor.</h1>'
        . '</div>'
        . '<div style="padding:26px 28px;font-size:16px;line-height:1.62;">' . $profile . '</div>'
        . '<div style="padding:0 28px 28px;display:block;">'
        . '<a href="' . $video . '" style="display:inline-block;margin:0 8px 10px 0;padding:12px 16px;border-radius:8px;background:#7a1026;color:#ffffff;text-decoration:none;font-weight:500;">Watch Highlight Video</a>'
        . '<a href="' . $website . '" style="display:inline-block;margin:0 8px 10px 0;padding:12px 16px;border-radius:8px;background:#07111f;color:#ffffff;text-decoration:none;font-weight:500;">View Recruiting Site</a>'
        . '<a href="' . $quick . '" style="display:inline-block;margin:0 0 10px 0;padding:12px 16px;border-radius:8px;background:#f0b323;color:#07111f;text-decoration:none;font-weight:500;">Quick Reply</a>'
        . '<p style="margin:12px 0 0;color:#5e6879;font-size:13px;line-height:1.5;">Replying to this email will go to ' . $replyTo . '.</p>'
        . '</div>'
        . '</div>'
        . '<img src="' . safe_text($pixel) . '" width="1" height="1" alt="" style="display:none;width:1px;height:1px;">'
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
