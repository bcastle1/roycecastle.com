<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

$id = substr((string)(preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($_GET['id'] ?? '')) ?? ''), 0, 120);
if ($id !== '') {
    $historySnapshot = read_json_file('email-history.json', []);
    $hasMatch = false;
    foreach ($historySnapshot as $item) {
        if (($item['trackingId'] ?? '') === $id || ($item['id'] ?? '') === $id) {
            $hasMatch = true;
            break;
        }
    }

    if ($hasMatch) {
        update_json_file('email-history.json', [], function (array $history) use ($id): ?array {
            $matched = false;
            foreach ($history as &$item) {
                if (($item['trackingId'] ?? '') !== $id && ($item['id'] ?? '') !== $id) continue;
                $now = gmdate('c');
                if (empty($item['viewedAt'])) $item['viewedAt'] = $now;
                if (empty($item['openedAt'])) $item['openedAt'] = $now;
                $item['lastOpenedAt'] = $now;
                $item['openCount'] = (int)($item['openCount'] ?? 0) + 1;
                if (in_array(($item['status'] ?? ''), ['Sent', 'Accepted by SMTP', 'Accepted by sending server'], true)) {
                    $item['status'] = 'Opened (tracked)';
                }
                $matched = true;
                break;
            }
            unset($item);
            return $matched ? $history : null;
        });
    }
}

header('Content-Type: image/gif');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
echo base64_decode('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==');
