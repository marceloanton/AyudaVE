# AyudaVE

Aplicacion React + Tailwind con backend PHP opcional para coordinar reportes comunitarios, puntos de ayuda, fuentes sincronizadas, datos abiertos y registro privado de colaboradores. El despliegue actual esta orientado a Venezuela, pero la app esta pensada para poder replicarse en otros paises o emergencias ajustando catalogos, fuentes, telefonos y configuracion publica.

## Desarrollo

```powershell
npm install
npm run dev
```

## Configuracion

Copiar `config.sample.php` como `config.php` en el entorno donde vaya a correr el backend.

Configurar como minimo:

- `site_url`: URL publica real de la instalacion, sin slash final.
- `admin_pin`: PIN privado para entrar a `admin.html`.
- `cron_token`: token largo para ejecutar sincronizacion automatica.
- `external_api_keys`: claves de fuentes externas. Si alguna clave no es publica/anonima, guardarla solo en `config.php` o variables de entorno del hosting.
- `db`: credenciales MariaDB/MySQL si se quiere sincronizacion compartida entre usuarios.

`config.php` esta ignorado por Git. No subir PIN, tokens, claves ni credenciales reales.

## Build

```powershell
npm run build
npm run verify:local
```

El build queda en `dist/`. `verify:local` levanta temporalmente el paquete compilado con PHP local, revisa assets, metadatos, datos abiertos, privacidad y endpoints publicos.

## Publicacion

Subir el contenido de `dist/` al directorio publico de cualquier hosting compatible con archivos estaticos + PHP.

Requisitos recomendados:

- PHP 8.1+.
- MariaDB/MySQL si se quiere persistencia y sincronizacion real.
- Apache o servidor equivalente que respete `.htaccess`, o reglas equivalentes para bloquear `config.php` y `data/`.

No reemplazar `config.php` ni `data/` durante despliegues de actualizacion. Esos archivos pertenecen a cada instalacion.

## Acceso admin

El panel esta en `admin.html`. Se entra con `admin_pin` definido en `config.php`; despues del login, el navegador usa una sesion HttpOnly temporal para confirmar, resolver y sincronizar sin reenviar el PIN en cada accion. Usar el boton `Salir` al terminar la moderacion.

## Datos abiertos

AyudaVE expone endpoints publicos sin contactos personales:

- `api.php?action=metadata`: endpoints, fuentes, estados y niveles de confianza.
- `api.php?action=sync_status`: frescura de sincronizacion, ultimo cron y resumen por fuente.
- `api.php?action=export_public`: JSON para sincronizar reportes y puntos de ayuda.
- `api.php?action=export_public&since=2026-06-28T00:00:00Z`: JSON incremental para traer solo cambios desde una fecha ISO 8601. Tambien acepta `updated_since`.
- `api.php?action=export_csv&dataset=reports`: reportes en CSV.
- `api.php?action=export_csv&dataset=helpPoints`: puntos de ayuda en CSV.
- `api.php?action=external_metrics`: metricas agregadas externas de personas, sin fichas personales.
- `openapi.json`: contrato OpenAPI para integraciones automaticas.

Usar `trustLevel` para decidir si un dato viene verificado en origen, confirmado por comunidad o pendiente de validacion local.
Las respuestas `metadata` y `export_public` incluyen `license` y `usage`; mantener atribucion a AyudaVE y a la fuente indicada en cada registro.
Los endpoints publicos de lectura (`metadata`, `sync_status`, `export_public`, `export_csv`) envian CORS `Access-Control-Allow-Origin: *` para que otras webs puedan sincronizar sin proxy. Las acciones de reporte, admin y cron no exponen CORS publico.

## Cron de sincronizacion

Programar el script cada 10 o 15 minutos.

En IONOS WebCron usar:

```text
https://ayudave.mranalytics.info/cron-sync.php?token=TU_TOKEN_LARGO
```

En CLI usar:

```bash
php /ruta/a/ayudave/cron-sync.php
```

El script lee `site_url` y `cron_token` desde `config.php`, valida el token del WebCron y llama al API interno por POST con `X-AyudaVE-Cron-Token`. Sincroniza las fuentes configuradas y escribe un resumen en `data/cron-sync.log`.
El cron usa `data/cron-sync.lock` y el backend usa `data/sync.lock` para evitar ejecuciones simultaneas.

## Snapshot de metricas externas

`external-metrics.json` guarda solo conteos agregados de fuentes externas de personas. No contiene fichas, fotos, documentos ni contactos. Se actualiza con:

```powershell
npm run metrics:update
```

El workflow `.github/workflows/update-external-metrics.yml` ejecuta ese comando cada hora y commitea el snapshot si cambian los totales. En hostings que bloquean salida HTTP desde PHP, `api.php?action=external_metrics` usa ese snapshot como respaldo.

## Archivos principales

- `src/`: componentes React.
- `api.php`: lectura, creacion, registro, validacion y sincronizacion. Usa MariaDB/MySQL si `config.php` tiene `db`.
- `admin.html`: moderacion compilada.
- `data/.htaccess`: evita lectura directa de datos en Apache.
- `config.sample.php`: plantilla segura de configuracion.

## Notas

- Si `api.php` no esta disponible, la app publica sigue funcionando con `localStorage`.
- `api.php` crea las tablas necesarias automaticamente si la conexion MariaDB/MySQL funciona.
- `dist/data/reports.json` no se genera en build para no pisar datos reales. `api.php` lo crea si falta.
- Los archivos SEO (`sitemap.xml`, `robots.txt`, `llms.txt`, OpenAPI y metadatos) deben apuntar al dominio publico real antes de publicar una instalacion.
