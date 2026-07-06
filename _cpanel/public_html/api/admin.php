<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';

$action = $_GET['action'] ?? '';

if ($action === 'login') {
    $body = request_json();
    if (admin_code_matches((string)($body['code'] ?? ''))) {
        $_SESSION['rc_admin'] = true;
        respond_json(state_payload());
    }
    respond_json(['ok' => false, 'error' => 'Invalid admin code.'], 403);
}

require_admin();

switch ($action) {
    case 'state':
        respond_json(state_payload());
        break;

    case 'save-settings':
        $body = request_json();
        $incoming = is_array($body['settings'] ?? null) ? $body['settings'] : [];
        $settings = load_settings();
        $allowed = [
            'forwardEmail',
            'fromEmail',
            'webmailEmail',
            'webmailUrl',
            'ccEmail',
            'sendMode',
            'frequency',
            'day',
            'time',
            'delaySeconds',
            'openDrafts',
            'emailTemplateVersion',
            'emailTemplate',
        ];
        foreach ($allowed as $key) {
            if (array_key_exists($key, $incoming)) $settings[$key] = $incoming[$key];
        }
        if (!empty($body['newCode'])) {
            $settings['adminCodeHash'] = password_hash((string)$body['newCode'], PASSWORD_DEFAULT);
        }
        write_json_file('settings.json', normalize_settings($settings));
        respond_json(state_payload());
        break;

    case 'save-opt-outs':
        $body = request_json();
        $emails = [];
        foreach (($body['optOutEmails'] ?? []) as $email) {
            $normalized = normalize_email((string)$email);
            if (filter_var($normalized, FILTER_VALIDATE_EMAIL)) $emails[$normalized] = $normalized;
        }
        write_json_file('opt-outs.json', array_values($emails));
        respond_json(state_payload());
        break;

    case 'clear-messages':
        write_json_file('messages.json', []);
        respond_json(state_payload());
        break;

    case 'record-history':
        $body = request_json();
        $item = is_array($body['historyItem'] ?? null) ? $body['historyItem'] : [];
        if (empty($item['id'])) $item['id'] = 'email-' . time() . '-' . bin2hex(random_bytes(3));
        $history = upsert_by_id(read_json_file('email-history.json', []), $item);
        write_json_file('email-history.json', $history);
        respond_json(state_payload());
        break;

    case 'log-run':
        $body = request_json();
        $item = is_array($body['logItem'] ?? null) ? $body['logItem'] : [];
        if (empty($item['message'])) respond_json(['ok' => false, 'error' => 'Missing log message.'], 422);
        if (empty($item['createdAt'])) $item['createdAt'] = gmdate('c');
        $log = read_json_file('run-log.json', []);
        array_unshift($log, $item);
        write_json_file('run-log.json', array_slice($log, 0, 200));
        respond_json(state_payload());
        break;

    case 'mark-history':
        $body = request_json();
        $history = read_json_file('email-history.json', []);
        foreach ($history as &$item) {
            if (($item['id'] ?? '') !== ($body['id'] ?? '')) continue;
            if (($body['field'] ?? '') === 'respondedAt') $item['respondedAt'] = gmdate('c');
            if (($body['field'] ?? '') === 'viewedAt') $item['viewedAt'] = gmdate('c');
        }
        unset($item);
        write_json_file('email-history.json', $history);
        respond_json(state_payload());
        break;

    default:
        respond_json(['ok' => false, 'error' => 'Unknown action.'], 404);
}

function state_payload(): array
{
    $settings = load_settings();
    return [
        'ok' => true,
        'serverMode' => true,
        'canSend' => function_exists('mail'),
        'settings' => public_settings($settings),
        'messages' => read_json_file('messages.json', []),
        'optOutEmails' => read_json_file('opt-outs.json', []),
        'emailHistory' => read_json_file('email-history.json', []),
        'runLog' => read_json_file('run-log.json', []),
    ];
}
