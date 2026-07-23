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
        $allowed = [
            'forwardEmail',
            'fromEmail',
            'webmailEmail',
            'webmailUrl',
            'ccEmail',
            'smtpHost',
            'smtpPort',
            'smtpSecurity',
            'smtpUser',
            'sendMode',
            'emailFormat',
            'trackOpens',
            'dailySendLimit',
            'frequency',
            'day',
            'time',
            'delaySeconds',
            'openDrafts',
            'emailTemplateVersion',
            'emailTemplate',
        ];
        update_json_file('settings.json', default_settings(), function (array $settings) use ($allowed, $incoming, $body): array {
            $settings = normalize_settings($settings);
            foreach ($allowed as $key) {
                if (array_key_exists($key, $incoming)) $settings[$key] = $incoming[$key];
            }
            if (array_key_exists('smtpPassword', $body) && (string)$body['smtpPassword'] !== '') {
                $settings['smtpPassword'] = (string)$body['smtpPassword'];
            }
            if (!empty($body['newCode'])) {
                $settings['adminCodeHash'] = password_hash((string)$body['newCode'], PASSWORD_DEFAULT);
            }
            return normalize_settings($settings);
        });
        respond_json(state_payload());
        break;

    case 'set-sending-enabled':
        $body = request_json();
        $enabled = ($body['enabled'] ?? null) === true;
        if ($enabled && !smtp_configured(load_settings())) {
            respond_json(['ok' => false, 'error' => 'Authenticated SMTP must be configured before live sending can be enabled.'], 422);
        }
        set_sending_enabled($enabled);
        respond_json(state_payload());
        break;

    case 'save-opt-outs':
        $body = request_json();
        $emails = normalize_requested_emails($body['optOutEmails'] ?? []);
        update_json_file('opt-outs.json', [], function (array $current) use ($emails): array {
            $merged = array_fill_keys(normalize_requested_emails($current), true);
            foreach ($emails as $email) $merged[$email] = true;
            $result = array_keys($merged);
            sort($result, SORT_STRING);
            return $result;
        }, true);
        if ($emails) {
            $remove = array_fill_keys($emails, true);
            update_json_file('consent-dates.json', [], function (array $current) use ($remove): array {
                $consentDates = normalize_requested_consents($current);
                foreach ($remove as $email => $_) unset($consentDates[$email]);
                ksort($consentDates, SORT_STRING);
                return $consentDates;
            }, true);
        }
        respond_json(state_payload());
        break;

    case 'remove-opt-outs':
        $body = request_json();
        $remove = array_fill_keys(normalize_requested_emails($body['optOutEmails'] ?? []), true);
        update_json_file('opt-outs.json', [], function (array $current) use ($remove): array {
            $result = array_values(array_filter(
                normalize_requested_emails($current),
                static fn(string $email): bool => empty($remove[$email])
            ));
            sort($result, SORT_STRING);
            return $result;
        }, true);
        respond_json(state_payload());
        break;

    case 'save-consents':
        $body = request_json();
        $requestedConsents = $body['consentDates'] ?? null;
        if (!is_array($requestedConsents) || count($requestedConsents) < 1) {
            respond_json(['ok' => false, 'error' => 'At least one dated consent is required.'], 422);
        }
        $consentDates = normalize_requested_consents($requestedConsents);
        if (count($consentDates) !== count($requestedConsents)) {
            respond_json(['ok' => false, 'error' => 'Every consent must use a valid email and a real, nonfuture UTC date.'], 422);
        }
        update_json_file('consent-dates.json', [], function (array $current) use ($consentDates): array {
            $merged = normalize_requested_consents($current);
            foreach ($consentDates as $email => $date) $merged[$email] = $date;
            ksort($merged, SORT_STRING);
            return $merged;
        }, true);

        $remove = array_fill_keys(array_keys($consentDates), true);
        update_json_file('opt-outs.json', [], function (array $current) use ($remove): array {
            $result = array_values(array_filter(
                normalize_requested_emails($current),
                static fn(string $email): bool => empty($remove[$email])
            ));
            sort($result, SORT_STRING);
            return $result;
        }, true);
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
        update_json_file('email-history.json', [], fn(array $history): array => upsert_by_id($history, $item));
        respond_json(state_payload());
        break;

    case 'log-run':
        $body = request_json();
        $item = is_array($body['logItem'] ?? null) ? $body['logItem'] : [];
        if (empty($item['message'])) respond_json(['ok' => false, 'error' => 'Missing log message.'], 422);
        if (empty($item['createdAt'])) $item['createdAt'] = gmdate('c');
        update_json_file('run-log.json', [], function (array $log) use ($item): array {
            array_unshift($log, $item);
            return array_slice($log, 0, 200);
        });
        respond_json(state_payload());
        break;

    case 'mark-history':
        $body = request_json();
        update_json_file('email-history.json', [], function (array $history) use ($body): array {
            foreach ($history as &$item) {
                if (($item['id'] ?? '') !== ($body['id'] ?? '')) continue;
                if (($body['field'] ?? '') === 'respondedAt') $item['respondedAt'] = gmdate('c');
                if (($body['field'] ?? '') === 'viewedAt') $item['viewedAt'] = gmdate('c');
            }
            unset($item);
            return $history;
        });
        respond_json(state_payload());
        break;

    case 'record-run':
        $body = request_json();
        $run = is_array($body['run'] ?? null) ? $body['run'] : [];
        try {
            $deliveryStats = record_delivery_run_state($run, (string)($body['phase'] ?? ''));
        } catch (InvalidArgumentException $exception) {
            respond_json(['ok' => false, 'error' => $exception->getMessage()], 422);
        }
        respond_json(['ok' => true, 'deliveryStats' => $deliveryStats]);
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
        'canSend' => !empty($settings['sendingEnabled']) && smtp_configured($settings),
        'smtpReady' => smtp_configured($settings),
        'mailAvailable' => function_exists('mail'),
        'settings' => public_settings($settings),
        'messages' => read_json_file('messages.json', []),
        'optOutEmails' => read_json_file('opt-outs.json', []),
        'consentDates' => normalize_requested_consents(read_json_file('consent-dates.json', [])),
        'emailHistory' => array_slice(read_json_file('email-history.json', []), 0, 500),
        'deliveryStats' => public_delivery_stats(load_delivery_stats()),
        'dailySendStatus' => daily_send_status((int)$settings['dailySendLimit']),
        'runLog' => array_slice(read_json_file('run-log.json', []), 0, 80),
    ];
}

function normalize_requested_emails($values): array
{
    $emails = [];
    foreach (is_array($values) ? $values : [] as $email) {
        $normalized = normalize_email((string)$email);
        if (filter_var($normalized, FILTER_VALIDATE_EMAIL)) $emails[$normalized] = $normalized;
    }
    return array_values($emails);
}

function normalize_requested_consents($values): array
{
    $consentDates = [];
    foreach (is_array($values) ? $values : [] as $email => $date) {
        $normalized = normalize_email((string)$email);
        $normalizedDate = normalize_utc_consent_date($date);
        if (!filter_var($normalized, FILTER_VALIDATE_EMAIL) || $normalizedDate === '') continue;
        $consentDates[$normalized] = $normalizedDate;
    }
    return $consentDates;
}

function normalize_utc_consent_date($value): string
{
    $date = trim((string)$value);
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $parts) !== 1) return '';
    if (!checkdate((int)$parts[2], (int)$parts[3], (int)$parts[1])) return '';
    return $date <= gmdate('Y-m-d') ? $date : '';
}
