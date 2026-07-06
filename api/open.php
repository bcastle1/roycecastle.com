<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

$id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($_GET['id'] ?? ''));
if ($id !== '') {
    $history = read_json_file('email-history.json', []);
    $changed = false;
    foreach ($history as &$item) {
        if (($item['trackingId'] ?? '') !== $id && ($item['id'] ?? '') !== $id) continue;
        $now = gmdate('c');
        if (empty($item['viewedAt'])) $item['viewedAt'] = $now;
        if (empty($item['openedAt'])) $item['openedAt'] = $now;
        $item['lastOpenedAt'] = $now;
        $item['openCount'] = (int)($item['openCount'] ?? 0) + 1;
        if (($item['status'] ?? '') === 'Sent') $item['status'] = 'Opened';
        $changed = true;
        break;
    }
    unset($item);
    if ($changed) write_json_file('email-history.json', $history);
}

header('Content-Type: image/gif');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
echo base64_decode('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==');
