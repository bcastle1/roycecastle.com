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
const RC_PUBLIC_ORIGIN = 'https://roycecastle.com';

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

function read_json_file(string $name, $default)
{
    $path = json_path($name);
    if (!is_file($path)) return $default;
    $raw = file_get_contents($path);
    if ($raw === false || trim($raw) === '') return $default;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : $default;
}

function write_json_file(string $name, $value): void
{
    file_put_contents(
        json_path($name),
        json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
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
        'sendMode' => 'server',
        'frequency' => 'manual',
        'day' => 'Monday',
        'time' => '09:00',
        'delaySeconds' => 4,
        'openDrafts' => false,
        'emailTemplate' => default_email_template(),
    ];
}

function load_settings(): array
{
    $settings = array_merge(default_settings(), read_json_file('settings.json', []));
    foreach (['forwardEmail', 'fromEmail', 'webmailEmail'] as $key) {
        if (empty($settings[$key])) $settings[$key] = RC_DEFAULT_MAILBOX;
    }
    if (empty($settings['webmailUrl'])) $settings['webmailUrl'] = RC_DEFAULT_WEBMAIL_URL;
    if (empty($settings['emailTemplate'])) $settings['emailTemplate'] = default_email_template();
    $settings['delaySeconds'] = max(1, (int)($settings['delaySeconds'] ?? 4));
    return $settings;
}

function public_settings(array $settings): array
{
    unset($settings['adminCodeHash']);
    return $settings;
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
    $configured = getenv('RC_ADMIN_CODE') ?: 'Patriot';
    return hash_equals($configured, $code);
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

function ensure_required_links(string $body, array $target): string
{
    $website = $target['websiteLink'] ?? RC_PUBLIC_ORIGIN . '/';
    $video = $target['videoLink'] ?? RC_PUBLIC_ORIGIN . '/#video';
    if (!preg_match('/roycecastle\.com\/?(\s|$)/i', $body)) {
        $body .= "\n\nRoyce profile:\n" . $website;
    }
    if (!preg_match('/roycecastle\.com\/?#video/i', $body)) {
        $body .= "\n\nHighlight video:\n" . $video;
    }
    return $body;
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
    return array_slice($items, 0, 1000);
}
