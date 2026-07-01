<?php
return [
    // Copiar este archivo como config.php y cambiar valores antes de publicar.
    // Usar la URL publica real de tu instalacion, sin slash final.
    'site_url' => 'https://example.org',
    'admin_pin' => 'cambiar-este-pin',
    'cron_token' => 'cambiar-este-token-largo',
    'sync_sources' => [
        'terremotovenezuela_reports',
        'centros_acopio',
        'venezuela_reporta_sitios',
        'refugios_venezuela',
        'acopios_refugios',
        'venezuela_reporta_personas',
        'venezuela_reporta_ingresos',
        'localizados_venezuela',
    ],
    'public_export' => [
        'enabled' => true,
        'max_reports' => 500,
        'max_help_points' => 1000,
        'max_missing_people' => 5000,
    ],
    'external_api_keys' => [
        // Clave publishable/public anon de la API de Refugios Venezuela.
        // Tambien puede definirse como AYUDAVE_REFUGIOS_VENEZUELA_API_KEY.
        'refugios_venezuela' => '',
    ],

    // MariaDB/MySQL. Completar solo en config.php, no subir secretos a Git.
    'db_required' => true,
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'database' => 'nombre_real_de_la_base',
        'username' => 'dbu0000000',
        'password' => 'cambiar-esta-clave',
        'charset' => 'utf8mb4',
    ],
];
