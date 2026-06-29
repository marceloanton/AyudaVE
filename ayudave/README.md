# AyudaVE

Aplicacion React + Tailwind con backend PHP opcional para IONOS.

## Desarrollo

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
npm run verify:local
```

El build queda en `dist/`. `verify:local` levanta temporalmente el paquete compilado con PHP local, revisa assets, metadatos, datos abiertos, privacidad y fuentes externas antes de subir.

## Subida a IONOS

1. Ejecutar `npm run build`.
2. Ejecutar `npm run verify:local`.
3. Subir el contenido de `dist/` a la carpeta `ayudave` del hosting sin borrar `config.php` ni `data/`.
4. Crear el subdominio apuntando a esa carpeta.
5. Copiar `config.sample.php` como `config.php` en el hosting.
6. Cambiar `site_url`, `admin_pin`, `cron_token` y completar la seccion `db` con la base MariaDB de IONOS.
7. Abrir `admin.html` para moderar reportes.

## Acceso admin

El panel esta en `admin.html`. Se entra con el `admin_pin` definido en `config.php`; despues del login, el navegador usa una sesion HttpOnly temporal para confirmar, resolver y sincronizar sin reenviar el PIN en cada accion. Usar el boton `Salir` al terminar la moderacion.

Si SFTP falla, generar un ZIP seguro para el administrador de archivos de IONOS:

```powershell
.\scripts\package-ionos.ps1
```

Subir y extraer el ZIP dentro del root `ayudave`. El paquete excluye `config.php` y `data/` para no pisar credenciales ni datos reales.

Despues de subir, verificar produccion:

```powershell
.\scripts\verify-production.ps1
```

## Datos abiertos

AyudaVE expone endpoints publicos sin contactos personales:

- `api.php?action=metadata`: endpoints, fuentes, estados y niveles de confianza.
- `api.php?action=sync_status`: frescura de sincronizacion, ultimo cron y resumen por fuente.
- `api.php?action=export_public`: JSON para sincronizar reportes y puntos de ayuda.
- `api.php?action=export_public&since=2026-06-28T00:00:00Z`: JSON incremental para traer solo cambios desde una fecha ISO 8601. Tambien acepta `updated_since`.
- `api.php?action=export_csv&dataset=reports`: reportes en CSV.
- `api.php?action=export_csv&dataset=helpPoints`: puntos de ayuda en CSV.
- `openapi.json`: contrato OpenAPI para integraciones automaticas.

Usar `trustLevel` para decidir si un dato viene verificado en origen, confirmado por comunidad o pendiente de validacion local.
Las respuestas `metadata` y `export_public` incluyen `license` y `usage`; mantener atribucion a AyudaVE y a la fuente indicada en cada registro.
Los endpoints publicos de lectura (`metadata`, `sync_status`, `export_public`, `export_csv`) envian CORS `Access-Control-Allow-Origin: *` para que otras webs puedan sincronizar sin proxy. Las acciones de reporte, admin y cron no exponen CORS publico.

## Cron de sincronizacion

El endpoint web existe en `api.php?action=cron_sync`, pero para IONOS conviene usar el script CLI para no poner el token en el panel:

```bash
php /ruta/real/a/ayudave/cron-sync.php
```

Programarlo cada 10 o 15 minutos. El script lee `cron_token` desde `config.php`, sincroniza las fuentes configuradas y escribe un resumen en `data/cron-sync.log`.
El cron usa `data/cron-sync.lock` y el backend usa `data/sync.lock` para evitar ejecuciones simultaneas.

## Archivos principales

- `src/`: componentes React.
- `dist/index.html`: app publica compilada.
- `dist/admin.html`: moderacion compilada.
- `dist/api.php`: lectura, creacion y cambio de estado de reportes. Usa MariaDB si `config.php` tiene `db`.
- `data/.htaccess`: evita lectura directa de datos en Apache/IONOS.

## Notas

- Si `api.php` no esta disponible, la app publica sigue funcionando con `localStorage`.
- No subir un PIN real a Git. `config.php` queda ignorado por `.gitignore`.
- El campo `database` debe ser el nombre real de la base en IONOS, no la descripcion visible.
- `api.php` crea la tabla `reports` automaticamente si la conexion MariaDB funciona.
- `dist/data/reports.json` no se genera en build para no pisar datos reales. `api.php` lo crea si falta.
