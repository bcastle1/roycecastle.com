<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

$settings = load_settings();
respond_json([
    'ok' => true,
    'mailAvailable' => function_exists('mail'),
    'smtpReady' => smtp_configured($settings),
    'dataWritable' => is_writable(data_dir()) || is_writable(dirname(data_dir())),
    'time' => gmdate('c'),
]);
