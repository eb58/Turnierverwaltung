<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('TURNIER_API_NO_DISPATCH', true);
require __DIR__ . '/api.php';

try {
    mitDateiSperre(leitungDatei() . '.lock', function () use ($argv): void {
        if (leitungKonfiguration() !== null && !in_array('--zuruecksetzen', $argv, true)) {
            echo "Eine PIN für die Gesamtverwaltung ist bereits eingerichtet.\n";
            return;
        }
        $eingabe = in_array('--stdin', $argv, true);
        $pin = $eingabe ? trim(stream_get_contents(STDIN)) : (string) random_int(10000000, 99999999);
        pinSpeichern(pinPruefen($pin));
        echo $eingabe ? "PIN der Gesamtverwaltung eingerichtet.\n" : "Neue PIN der Gesamtverwaltung: $pin\n";
    });
} catch (Throwable $error) { fwrite(STDERR, $error->getMessage() . "\n"); exit(1); }
