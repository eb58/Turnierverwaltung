<?php

// Router für den lokalen PHP-Webserver: php -S localhost:8001 -t client server/router.php
// Statische Dateien kommen aus client/, die API aus server/; Daten und Servercode sind gesperrt.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$normalisiert = str_replace('\\', '/', rawurldecode($path));
if (preg_match('~(?:^|/)(?:data|server|client)(?:/|$)~i', $normalisiert)) {
    http_response_code(403);
    exit;
}
if ($path === '/api.php') {
    require __DIR__ . '/api.php';
    return true;
}
return false;
