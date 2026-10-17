<?php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$normalisiert = str_replace('\\', '/', rawurldecode($path));
if (preg_match('~(?:^|/)data(?:/|$)~i', $normalisiert)) {
    http_response_code(403);
    exit;
}
if ($path !== '/' && is_file(__DIR__ . $path)) {
    return false;
}
require __DIR__ . '/index.html';

