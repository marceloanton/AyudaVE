# AyudaVE

AyudaVE es una web operativa para coordinar ayuda comunitaria: reportes de necesidades, mapa, directorio de puntos de ayuda, sincronizacion de fuentes externas, datos abiertos y registro privado de colaboradores. Nacio para Venezuela, pero la base puede adaptarse a otros paises, ciudades o emergencias cambiando fuentes, telefonos, textos y configuracion.

La aplicacion esta en [`ayudave/`](ayudave/).

## Publicacion segura

Este repositorio no incluye `config.php`, credenciales, datos operativos locales ni artefactos de despliegue. Para instalar en cualquier hosting con PHP:

1. Entrar a `ayudave/`.
2. Ejecutar `npm install`.
3. Copiar `config.sample.php` como `config.php`.
4. Completar URL publica, PIN, token, claves externas y MariaDB/MySQL en `config.php`.
5. Ejecutar `npm run build`.

Ver mas detalles en [`ayudave/README.md`](ayudave/README.md).
