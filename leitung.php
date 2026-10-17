<?php

declare(strict_types=1);

function leitungDatei(): string { return datenOrdner() . '/leitung.json'; }

// pinHash/kennung gehören zum Superadmin; unter "turniere" stehen die PINs der einzelnen Turnierleitungen.
function leitungKonfiguration(): ?array
{
    $config = jsonDatei(leitungDatei());
    if ($config === null) return null;
    $gueltig = fn(mixed $eintrag): bool => is_array($eintrag) && is_string($eintrag['pinHash'] ?? null) && is_string($eintrag['kennung'] ?? null);
    if (!$gueltig($config) || !is_array($config['turniere'] ?? []) || array_filter($config['turniere'] ?? [], fn(mixed $eintrag): bool => !$gueltig($eintrag))) {
        throw new ApiError('Die Leitungs-PIN konnte nicht geladen werden.', 500);
    }
    $config['turniere'] ??= [];
    return $config;
}

function leitungKonfigurationSpeichern(array $config): void
{
    if ($config['turniere'] === []) unset($config['turniere']);
    jsonAtomarSpeichern(leitungDatei(), $config);
}

function pinPruefen(mixed $pin): string
{
    if (!is_string($pin) || !preg_match('/^[0-9]{6,12}$/D', $pin)) throw new ApiError('Bitte eine PIN mit 6 bis 12 Ziffern eingeben.');
    return $pin;
}

function pinEintrag(string $pin): array
{
    return ['pinHash' => password_hash(pinPruefen($pin), PASSWORD_DEFAULT), 'kennung' => bin2hex(random_bytes(16))];
}

// Setzt die Superadmin-PIN; die PINs der Turnierleitungen bleiben erhalten.
function pinSpeichern(string $pin): array
{
    $config = pinEintrag($pin) + ['turniere' => leitungKonfiguration()['turniere'] ?? []];
    leitungKonfigurationSpeichern($config);
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

// Eine Sitzung gilt nur, solange die Kennung der zugehörigen PIN unverändert ist.
function leitungInfo(): array
{
    leitungStarten();
    $config = leitungKonfiguration();
    $aktiv = $config !== null && ($_SESSION['aktiv'] ?? 0) > time() - 28800;
    $superadmin = $aktiv && is_string($_SESSION['leitung'] ?? null) && hash_equals($config['kennung'], $_SESSION['leitung']);
    $turniere = [];
    if ($aktiv && is_array($_SESSION['turniere'] ?? null)) foreach ($_SESSION['turniere'] as $id => $kennung) {
        $eintrag = $config['turniere'][(string) $id] ?? null;
        if ($eintrag !== null && is_string($kennung) && hash_equals($eintrag['kennung'], $kennung)) $turniere[(int) $id] = $kennung;
    }
    $angemeldet = $superadmin || $turniere !== [];
    if (!$superadmin) unset($_SESSION['leitung']);
    $_SESSION['turniere'] = $turniere;
    if ($angemeldet) $_SESSION['aktiv'] = time(); else unset($_SESSION['aktiv']);
    $info = ['eingerichtet' => $config !== null, 'angemeldet' => $angemeldet, 'superadmin' => $superadmin,
        'turniere' => array_keys($turniere), 'csrf' => $_SESSION['csrf']];
    if ($superadmin) $info['turnierPins'] = array_map('intval', array_keys($config['turniere']));
    return $info;
}

function csrfPruefen(): void
{
    leitungStarten();
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($token) || !hash_equals($_SESSION['csrf'], $token)) throw new ApiError('Bitte die Seite neu laden und erneut versuchen.', 403);
}

function leitungPruefen(bool $schreiben = false): array
{
    $info = leitungInfo();
    if (!$info['angemeldet']) throw new ApiError('Bitte zuerst als Turnierleitung anmelden.', 401);
    if ($schreiben) csrfPruefen();
    return $info;
}

function superadminPruefen(): void
{
    if (!leitungInfo()['superadmin']) throw new ApiError('Das darf nur der Superadmin.', 403);
}

function darfTurnier(array $info, mixed $id): bool
{
    return $info['superadmin'] || (is_int($id) && in_array($id, $info['turniere'], true));
}

function turnierRechtPruefen(mixed $id): void
{
    if (!darfTurnier(leitungInfo(), $id)) throw new ApiError('Für dieses Turnier bist du nicht als Turnierleitung angemeldet.', 403);
}

// Prüft zuerst die Superadmin-PIN, sonst die PIN des angegebenen Turniers.
function leitungAnmelden(mixed $pin, mixed $turnierId = null): array
{
    csrfPruefen();
    $config = leitungKonfiguration();
    if ($config === null) throw new ApiError('Die Leitungs-PIN wurde noch nicht eingerichtet.', 503);
    $turnierEintrag = is_int($turnierId) ? $config['turniere'][(string) $turnierId] ?? null : null;
    $datei = datenOrdner() . '/anmeldeversuche.json';
    $rolle = mitDateiSperre($datei . '.lock', function () use ($datei, $pin, $config, $turnierEintrag): ?string {
        $versuche = jsonDatei($datei, []); $jetzt = time();
        $versuche = array_filter($versuche, fn(array $versuch): bool => $versuch['seit'] > $jetzt - 900);
        $key = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unbekannt');
        $versuch = $versuche[$key] ?? ['seit' => $jetzt, 'anzahl' => 0];
        if ($versuch['anzahl'] >= 8) throw new ApiError('Zu viele Anmeldeversuche. Bitte nach 15 Minuten erneut versuchen.', 429);
        $format = is_string($pin) && preg_match('/^[0-9]{6,12}$/D', $pin);
        $rolle = match (true) {
            $format && password_verify($pin, $config['pinHash']) => 'superadmin',
            $format && $turnierEintrag !== null && password_verify($pin, $turnierEintrag['pinHash']) => 'turnier',
            default => null,
        };
        if ($rolle !== null) unset($versuche[$key]);
        else { $versuch['anzahl']++; $versuche[$key] = $versuch; }
        jsonAtomarSpeichern($datei, $versuche);
        return $rolle;
    });
    if ($rolle === null) throw new ApiError('Die PIN stimmt nicht.', 401);
    // Bestehende Berechtigungen dieser Sitzung bleiben erhalten, die neue kommt hinzu.
    session_regenerate_id(true);
    if ($rolle === 'superadmin') $_SESSION['leitung'] = $config['kennung'];
    else $_SESSION['turniere'][$turnierId] = $turnierEintrag['kennung'];
    $_SESSION['aktiv'] = time(); $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return leitungInfo();
}

function leitungAbmelden(): array
{
    csrfPruefen();
    $_SESSION = ['csrf' => bin2hex(random_bytes(32))];
    session_regenerate_id(true);
    return leitungInfo();
}

// Ohne "turnier" ändert der Superadmin seine PIN, mit "turnier" die Turnierleitung die PIN ihres Turniers.
function leitungPinAendern(array $payload): array
{
    $info = leitungPruefen(true);
    $pin = pinPruefen($payload['neuePin'] ?? null);
    $turnierId = $payload['turnier'] ?? null;
    if ($turnierId === null && !$info['superadmin']) throw new ApiError('Bitte das Turnier angeben, dessen PIN geändert werden soll.');
    if ($turnierId !== null && (!is_int($turnierId) || !in_array($turnierId, $info['turniere'], true))) {
        throw new ApiError('Die PIN eines Turniers kann nur dessen angemeldete Turnierleitung ändern.', 403);
    }
    $config = mitDateiSperre(leitungDatei() . '.lock', function () use ($payload, $pin, $turnierId): array {
        $config = leitungKonfiguration();
        $bisher = $turnierId === null ? $config : $config['turniere'][(string) $turnierId];
        if (!is_string($payload['aktuellePin'] ?? null) || !password_verify($payload['aktuellePin'], $bisher['pinHash'])) throw new ApiError('Die bisherige PIN stimmt nicht.');
        if ($turnierId === null) return pinSpeichern($pin);
        $config['turniere'][(string) $turnierId] = pinEintrag($pin);
        leitungKonfigurationSpeichern($config);
        return $config;
    });
    session_regenerate_id(true);
    if ($turnierId === null) $_SESSION['leitung'] = $config['kennung'];
    else $_SESSION['turniere'][$turnierId] = $config['turniere'][(string) $turnierId]['kennung'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32)); $_SESSION['aktiv'] = time();
    return leitungInfo();
}

// Superadmin vergibt oder ersetzt (pin) bzw. entfernt (pin = null) die PIN einer Turnierleitung.
function turnierPinSetzen(int $turnierId, mixed $pin): array
{
    if ($pin !== null) pinPruefen($pin);
    mitDateiSperre(leitungDatei() . '.lock', function () use ($turnierId, $pin): void {
        $config = leitungKonfiguration();
        if ($pin === null) unset($config['turniere'][(string) $turnierId]);
        else $config['turniere'][(string) $turnierId] = pinEintrag($pin);
        leitungKonfigurationSpeichern($config);
    });
    return leitungInfo();
}
