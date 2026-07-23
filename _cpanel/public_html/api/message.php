<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_json(['ok' => false, 'error' => 'POST required.'], 405);
}

$message = request_json();
$name = trim(substr((string)($message['name'] ?? ''), 0, 120));
$email = normalize_email(substr((string)($message['email'] ?? ''), 0, 180));
$program = trim(substr((string)($message['program'] ?? ''), 0, 180));
$role = trim(substr((string)($message['role'] ?? ''), 0, 120));
$bodyText = trim(substr((string)($message['body'] ?? ''), 0, 4000));

if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || $program === '' || $bodyText === '') {
    respond_json(['ok' => false, 'error' => 'Valid name, email, program, and message are required.'], 422);
}

$message['id'] = (string)($message['id'] ?? ('message-' . time() . '-' . bin2hex(random_bytes(3))));
$message['createdAt'] = (string)($message['createdAt'] ?? gmdate('c'));
$message['status'] = 'New';

$savedMessage = [
    'id' => $message['id'],
    'name' => $name,
    'email' => $email,
    'program' => $program,
    'role' => $role,
    'body' => $bodyText,
    'createdAt' => $message['createdAt'],
    'status' => 'New',
];
update_json_file('messages.json', [], function (array $messages) use ($savedMessage): array {
    array_unshift($messages, $savedMessage);
    return array_slice($messages, 0, 300);
});

$settings = load_settings();
$to = normalize_email((string)($settings['forwardEmail'] ?? RC_DEFAULT_MAILBOX));
if (!filter_var($to, FILTER_VALIDATE_EMAIL)) $to = RC_DEFAULT_MAILBOX;

$sender = $email;
$subject = 'Royce Castle recruiting inquiry from ' . safe_header_value($program);
$body = "Name: " . $name . "\n"
    . "Email: " . $sender . "\n"
    . "Program: " . $program . "\n"
    . "Role: " . ($role ?: 'Not provided') . "\n\n"
    . "Royce profile: " . RC_PUBLIC_ORIGIN . "/\n"
    . "Highlight video: " . RC_PUBLIC_ORIGIN . "/#video\n\n"
    . $bodyText;

$headers = [
    'From: Royce Castle Site <' . RC_DEFAULT_MAILBOX . '>',
    'Reply-To: ' . $sender,
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: Royce Castle Recruiting',
];

$notified = function_exists('mail') ? mail($to, $subject, $body, implode("\r\n", $headers), '-f' . RC_DEFAULT_MAILBOX) : false;

respond_json(['ok' => true, 'notified' => $notified]);
