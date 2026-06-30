# AyudaVE - fuentes externas para sincronizacion

Relevamiento hecho el 2026-06-28. Toda fuente externa debe entrar como
`Sin validar` salvo que sea una entidad institucional o una fuente ya moderada.
No guardar telefonos, emails ni contactos personales en vistas publicas.

## Fuentes recomendadas

| Fuente | URL tecnica | Datos | Conteo probado | Uso recomendado |
| --- | --- | --- | --- | --- |
| terremotovenezuela.app | `https://terremotovenezuela.app/api/missing?status=all` | Personas desaparecidas/encontradas | 48 personas | Importar como reportes externos, ocultando contacto privado. |
| terremotovenezuela.app | `https://terremotovenezuela.app/api/reports` | Reportes de mapa: desaparecidos, edificios, criticos, energia, refugio, insumos | 143 reportes | Mapear a necesidades AyudaVE y marcar fuente externa. |
| terremotovenezuela.com | Supabase REST `buildings` | Edificios danados | 853 edificios | Importar como reportes tipo refugio/seguridad estructural, con severidad. |
| centrosdeacopiove.com | `https://centrosdeacopiove.com/data/centros_v2.js?v=12` | Centros de acopio | 676 centros activos | Importar como puntos de ayuda. Telefono solo si es de organizacion. |
| centrosdeacopiove.com | `https://centrosdeacopiove.com/data/phones_v2.js?v=8` | Telefonos de emergencia | No contado | Mostrar como directorio, no mezclar con reportes. |
| centrosdeacopiove.com | `https://centrosdeacopiove.com/voluntarios-proxy.php` | Voluntarios | 1000 voluntarios | No publicar contactos personales. Usar solo para derivacion privada/admin. |
| acopios-refugios.vercel.app | Apps Script JSONP | Acopios y refugios moderados | 203 puntos: 174 acopios, 29 refugios | Importar como puntos de ayuda. Respeta columnas publicas del origen. |
| ayuda-venezuela.talosware.com.ve | Google Sheet CSV | Centros/puntos de ayuda | 144 filas | Importar como puntos de ayuda, deduplicando contra centrosdeacopiove. |

## Fuentes viables pero con cautela

| Fuente | Estado | Motivo |
| --- | --- | --- |
| venezuelatebusca.com | Inestable al probar | El repo de Venezuela Ayuda la usa via Supabase, pero el host Supabase no resolvio DNS durante la prueba. Reintentar antes de implementar. |
| desaparecidosterremotovenezuela.com | No recomendada para estado encontrado | Tiene API `desaparecidos-terremoto-api.theempire.tech`, pero Venezuela Ayuda la dejo desactivada por riesgo de estados `localizado` comprometidos. Si se usa, importar todo como `Sin validar`/busqueda activa. |
| terremotovenezuela2026.vercel.app | No usar por ahora | El script de Venezuela Ayuda indica que su API devuelve `410 Gone`. |
| reportavnzla.com | Requiere revision posterior | Tiene repo publico y usa Neon/Postgres. No se encontro API publica directa en la primera pasada. |
| veneconnect.com/apoyo-terremoto | Referencia manual | Tiene datos embebidos de fundaciones/acopios, pero no se detecto array facil de centros en la primera pasada. |

## Reglas de sincronizacion

- Guardar `source`, `source_url`, `external_id`, `synced_at` y `status`.
- Dedupe por `source + external_id` y por clave normalizada de `tipo + nombre + ciudad + coordenadas`.
- No pisar reportes locales de AyudaVE.
- No publicar ni versionar `reports.json` local de una instalacion real.
- No exponer contactos personales de desaparecidos, voluntarios o reportantes.
- Mostrar etiqueta visible: `Fuente externa - sin validar`.
- Si la fuente marca algo como encontrado/resuelto, mantenerlo como `Sin validar` salvo fuente confiable o moderacion propia.

## Prioridad de implementacion

1. `terremotovenezuela.app/api/reports`
2. `centrosdeacopiove.com/data/centros_v2.js`
3. `acopios-refugios` JSONP - implementado como `acopios_refugios`
4. `terremotovenezuela.com` edificios
5. `terremotovenezuela.app/api/missing`
6. Google Sheet de Talosware
