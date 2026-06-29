# Deploy AyudaVE en IONOS

Cuando SFTP no responda, usar el administrador de archivos de IONOS:

1. Ejecutar `npm run build`.
2. Ejecutar `npm run verify:local`.
3. Ejecutar `.\scripts\package-ionos.ps1`.
4. Abrir el administrador de archivos de IONOS.
5. Entrar al root `ayudave`.
6. Subir el ZIP generado en `deploy/`.
7. Extraerlo dentro de `ayudave`.
8. No borrar ni reemplazar `config.php`.
9. No borrar ni reemplazar `data/`.
10. Ejecutar `.\scripts\verify-production.ps1`.

El admin queda en `admin.html`. El PIN se lee desde `config.php`; al entrar se crea una sesion HttpOnly temporal y el boton `Salir` la cierra.

Si el verificador informa `sensitiveTextHits` mayor que cero y el backend nuevo todavia no quedo activo, ejecutar una vez desde el hosting:

```bash
php /ruta/real/a/ayudave/scripts/sanitize-db.php
```

Ese script lee `config.php`, sanea `detail` y `contact` en MariaDB, y marca los registros con `privacy_review`.

El verificador debe devolver:

- `appDeployed: true`
- `adminDeployed: true`
- `healthOk: true`
- `database: true`
- `syncStatusOk: true`
- `openApiOk: true`
- `sensitiveTextHits: 0`

Si `sensitiveTextHits` es mayor que cero, produccion todavia no tiene la version con redaccion defensiva.
