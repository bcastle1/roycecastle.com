<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

respond_json([
    'ok' => true,
    'mailAvailable' => function_exists('mail'),
    'dataWritable' => is_writable(data_dir()) || is_writable(dirname(data_dir())),
    'time' => gmdate('c'),
]);
