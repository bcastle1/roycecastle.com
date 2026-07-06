<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_json(['ok' => false, 'error' => 'POST required.'], 405);
}

$message = request_json();
$message['id'] = (string)($message['id'] ?? ('message-' . time() . '-' . bin2hex(random_bytes(3))));
$message['createdAt'] = (string)($message['createdAt'] ?? gmdate('c'));
$message['status'] = 'New';

$messages = read_json_file('messages.json', []);
array_unshift($messages, [
    'id' => $message['id'],
    'name' => trim((string)($message['name'] ?? '')),
    'email' => normalize_email((string)($message['email'] ?? '')),
    'program' => trim((string)($message['program'] ?? '')),
    'role' => trim((string)($message['role'] ?? '')),
    'body' => trim((string)($message['body'] ?? '')),
    'createdAt' => $message['createdAt'],
    'status' => 'New',
]);
write_json_file('messages.json', array_slice($messages, 0, 300));

$settings = load_settings();
$to = normalize_email((string)($settings['forwardEmail'] ?? RC_DEFAULT_MAILBOX));
if (!filter_var($to, FILTER_VALIDATE_EMAIL)) $to = RC_DEFAULT_MAILBOX;

$sender = normalize_email((string)($message['email'] ?? ''));
$subject = 'Royce Castle recruiting inquiry from ' . safe_header_value((string)($message['program'] ?? 'a coach/contact'));
$body = "Name: " . (string)($message['name'] ?? '') . "\n"
    . "Email: " . $sender . "\n"
    . "Program: " . (string)($message['program'] ?? '') . "\n"
    . "Role: " . (string)($message['role'] ?? '') . "\n\n"
    . "Royce profile: " . RC_PUBLIC_ORIGIN . "/\n"
    . "Highlight video: " . RC_PUBLIC_ORIGIN . "/#video\n\n"
    . (string)($message['body'] ?? '');

$headers = [
    'From: Royce Castle Site <' . RC_DEFAULT_MAILBOX . '>',
    'Reply-To: ' . (filter_var($sender, FILTER_VALIDATE_EMAIL) ? $sender : $to),
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: Royce Castle Recruiting',
];

$notified = function_exists('mail') ? mail($to, $subject, $body, implode("\r\n", $headers)) : false;

respond_json(['ok' => true, 'notified' => $notified]);
