<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

$settings = load_settings();
$dailySendStatus = daily_send_status((int)$settings['dailySendLimit']);
respond_json([
    'ok' => true,
    'mailAvailable' => function_exists('mail'),
    'smtpReady' => smtp_configured($settings),
    'sendingEnabled' => !empty($settings['sendingEnabled']),
    'dailySendStatus' => $dailySendStatus,
    'dataWritable' => is_writable(data_dir()) || is_writable(dirname(data_dir())),
    'time' => gmdate('c'),
]);
