<?php

declare(strict_types=1);

function leitungDatei(): string { return datenOrdner() . '/leitung.json'; }

function leitungKonfiguration(): ?array
{
    $config = jsonDatei(leitungDatei());
    if ($config !== null && (!is_array($config) || !is_string($config['pinHash'] ?? null) || !is_string($config['kennung'] ?? null))) {
        throw new ApiError('Die Leitungs-PIN konnte nicht geladen werden.', 500);
    }
    return $config;
}

function pinPruefen(mixed $pin): string
{
    if (!is_string($pin) || !preg_match('/^[0-9]{6,12}$/D', $pin)) throw new ApiError('Bitte eine PIN mit 6 bis 12 Ziffern eingeben.');
    return $pin;
}

function pinSpeichern(string $pin): array
{
    $config = ['pinHash' => password_hash(pinPruefen($pin), PASSWORD_DEFAULT), 'kennung' => bin2hex(random_bytes(16))];
    jsonAtomarSpeichern(leitungDatei(), $config);
    return $config;
}

function leitungStarten(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $dir = datenOrdner() . '/sitzungen';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) throw new ApiError('Die Anmeldung ist gerade nicht verfügbar.', 503);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', '28800');
    session_save_path($dir);
    session_name('turnierleitung');
    $pfad = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api.php'));
    session_set_cookie_params(['lifetime' => 0, 'path' => rtrim($pfad, '/') . '/',
        'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Strict']);
    if (!session_start()) throw new ApiError('Die Anmeldung ist gerade nicht verfügbar.', 503);
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}

function leitungInfo(): array
{
    leitungStarten();
    $config = leitungKonfiguration();
    $angemeldet = $config !== null && is_string($_SESSION['leitung'] ?? null)
        && hash_equals($config['kennung'], $_SESSION['leitung']) && ($_SESSION['aktiv'] ?? 0) > time() - 28800;
    if ($angemeldet) $_SESSION['aktiv'] = time();
    else unset($_SESSION['leitung'], $_SESSION['aktiv']);
    return ['eingerichtet' => $config !== null, 'angemeldet' => $angemeldet, 'csrf' => $_SESSION['csrf']];
}

function csrfPruefen(): void
{
    leitungStarten();
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($token) || !hash_equals($_SESSION['csrf'], $token)) throw new ApiError('Bitte die Seite neu laden und erneut versuchen.', 403);
}

function leitungPruefen(bool $schreiben = false): void
{
    if (!leitungInfo()['angemeldet']) throw new ApiError('Bitte zuerst als Turnierleitung anmelden.', 401);
    if ($schreiben) csrfPruefen();
}

function leitungAnmelden(mixed $pin): array
{
    csrfPruefen();
    $config = leitungKonfiguration();
    if ($config === null) throw new ApiError('Die Leitungs-PIN wurde noch nicht eingerichtet.', 503);
    $datei = datenOrdner() . '/anmeldeversuche.json';
    $erfolg = mitDateiSperre($datei . '.lock', function () use ($datei, $pin, $config): bool {
        $versuche = jsonDatei($datei, []); $jetzt = time();
        $versuche = array_filter($versuche, fn(array $versuch): bool => $versuch['seit'] > $jetzt - 900);
        $key = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unbekannt');
        $versuch = $versuche[$key] ?? ['seit' => $jetzt, 'anzahl' => 0];
        if ($versuch['anzahl'] >= 8) throw new ApiError('Zu viele Anmeldeversuche. Bitte nach 15 Minuten erneut versuchen.', 429);
        $erfolg = is_string($pin) && preg_match('/^[0-9]{6,12}$/D', $pin) && password_verify($pin, $config['pinHash']);
        if ($erfolg) unset($versuche[$key]);
        else { $versuch['anzahl']++; $versuche[$key] = $versuch; }
        jsonAtomarSpeichern($datei, $versuche);
        return (bool) $erfolg;
    });
    if (!$erfolg) throw new ApiError('Die PIN stimmt nicht.', 401);
    session_regenerate_id(true);
    $_SESSION['leitung'] = $config['kennung']; $_SESSION['aktiv'] = time(); $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return leitungInfo();
}

function leitungAbmelden(): array
{
    csrfPruefen();
    $_SESSION = ['csrf' => bin2hex(random_bytes(32))];
    session_regenerate_id(true);
    return leitungInfo();
}

function leitungPinAendern(array $payload): array
{
    leitungPruefen(true);
    $pin = pinPruefen($payload['neuePin'] ?? null);
    $config = mitDateiSperre(leitungDatei() . '.lock', function () use ($payload, $pin): array {
        $bisher = leitungKonfiguration();
        if (!is_string($payload['aktuellePin'] ?? null) || !password_verify($payload['aktuellePin'], $bisher['pinHash'])) throw new ApiError('Die bisherige PIN stimmt nicht.');
        return pinSpeichern($pin);
    });
    session_regenerate_id(true);
    $_SESSION['leitung'] = $config['kennung']; $_SESSION['csrf'] = bin2hex(random_bytes(32)); $_SESSION['aktiv'] = time();
    return leitungInfo();
}
