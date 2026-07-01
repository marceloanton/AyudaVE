# AyudaVE - fuentes externas para sincronizacion

Relevamiento hecho el 2026-06-28. Toda fuente externa debe entrar como
`Sin validar` salvo que sea una entidad institucional o una fuente ya moderada.
No guardar telefonos, emails ni contactos personales en vistas publicas.
Actualizado el 2026-07-01 para ampliar el registro unico de fuentes,
separar sincronizacion automatica de referencias manuales y bloquear por
defecto las fuentes con cedulas, telefonos, fotos o datos de menores.

## Fuentes recomendadas

| Fuente | URL tecnica | Datos | Conteo probado | Uso recomendado |
| --- | --- | --- | --- | --- |
| venezuelareporta.org/recursos | Pagina publica | Telefonos de emergencia, ambulancias, proteccion civil, bomberos, policia, rescate, hospitales y centros de acopio | Directorio extenso en web publica | Registrar como directorio manual. Confirmar antes de actuar; no importar telefonos personales sin validacion. |
| terremotovenezuela.app | `https://terremotovenezuela.app/api/missing?status=all` | Personas desaparecidas/encontradas | 48 personas | Importar como reportes externos, ocultando contacto privado. |
| terremotovenezuela.app | `https://terremotovenezuela.app/api/reports` | Reportes de mapa: desaparecidos, edificios, criticos, energia, refugio, insumos | 143 reportes | Mapear a necesidades AyudaVE y marcar fuente externa. |
| terremotovenezuela.com | Supabase REST `buildings` | Edificios danados | 853 edificios | Importar como reportes tipo refugio/seguridad estructural, con severidad. |
| centrosdeacopiove.com | `https://centrosdeacopiove.com/data/centros_v2.js?v=12` | Centros de acopio | 676 centros activos | Importar como puntos de ayuda. Telefono solo si es de organizacion. |
| centrosdeacopiove.com | `https://centrosdeacopiove.com/data/phones_v2.js?v=8` | Telefonos de emergencia | No contado | Mostrar como directorio, no mezclar con reportes. |
| centrosdeacopiove.com | `https://centrosdeacopiove.com/voluntarios-proxy.php` | Voluntarios | 1000 voluntarios | No publicar contactos personales. Usar solo para derivacion privada/admin. |
| acopios-refugios.vercel.app | Apps Script JSONP | Acopios y refugios moderados | 203 puntos: 174 acopios, 29 refugios | Importar como puntos de ayuda. Respeta columnas publicas del origen. |
| acopiove.org | Sitio/API a revisar | Acopios, refugios y techo solidario | No contado en esta pasada | Candidato para puntos de ayuda regionales. Activar solo despues de confirmar API/licencia. |
| ayuda-venezuela.talosware.com.ve | Web publica / Google Sheet CSV | Acopios, voluntarios, servicios, canales y listados | 163 centros, 11 profesionales, 23 estados, 5 paises en web publica | Importar solo puntos publicos y deduplicar. No copiar contactos personales ni personas/listados sin permiso. |
| infovenezuelaterremoto2026.vercel.app/docs | API documentada a revisar | Centros de acopio | No contado en esta pasada | Candidato para sincronizar puntos publicos si la documentacion sigue operativa. |

## Fuentes viables pero con cautela

| Fuente | Estado | Motivo |
| --- | --- | --- |
| venezuelatebusca.com | Inestable al probar | El repo de Venezuela Ayuda la usa via Supabase, pero el host Supabase no resolvio DNS durante la prueba. Reintentar antes de implementar. |
| desaparecidosterremotovenezuela.com | No recomendada para estado encontrado | Tiene API `desaparecidos-terremoto-api.theempire.tech`, pero Venezuela Ayuda la dejo desactivada por riesgo de estados `localizado` comprometidos. Si se usa, importar todo como `Sin validar`/busqueda activa. |
| terremotovenezuela2026.vercel.app | No usar por ahora | El script de Venezuela Ayuda indica que su API devuelve `410 Gone`. |
| reportavnzla.com | Requiere revision posterior | Tiene repo publico y usa Neon/Postgres. No se encontro API publica directa en la primera pasada. |
| veneconnect.com/apoyo-terremoto | Referencia manual | Tiene datos embebidos de fundaciones/acopios, pero no se detecto array facil de centros en la primera pasada. |
| ayuda.quedate.net | Requiere revision posterior | Figura como plataforma aliada. Activar solo si hay API publica y permiso claro. |
| sosvenezuela2026.com | Requiere revision posterior | Mapa colaborativo con ubicaciones sensibles. Revisar licencia, API y proteccion anti-saqueo antes de copiar datos. |

## Referencias manuales / no sincronizar todavia

| Fuente | Uso recomendado | Por que no sincronizar automaticamente |
| --- | --- | --- |
| vzlayuda.com | Enlazar como referencia comunitaria para solicitudes y ofrecimientos. | Puede contener datos de contacto o situaciones personales. No se encontro API publica documentada. |
| venezuela-ayuda.vercel.app | Comparar mapa, telefonos, medidas de apoyo y fuentes activas. | No importar personas desaparecidas ni voluntarios directos en AyudaVE. Solo usar API publica con atribucion y privacidad. |
| Hazlo Hoy / hzl.app | Fuente de contexto y telefonos de emergencia. | Enlazar como informacion externa; no copiar contenido sensible ni contactos personales. |
| reportavnzla.com | Derivar busquedas sensibles y contrastar cifras. | Publica datos personales visibles. No importar automaticamente hasta tener API/permiso y reglas de redaccion. |
| venezuelatebusca.com | Derivar busquedas de personas. | Fuente de personas desaparecidas; requiere revisar API, permiso, menores y estados. |
| desaparecidosterremotovenezuela.com | Derivar busquedas de personas y contrastar estados. | No mezclar estados localizado/encontrado sin validacion independiente. |
| lonecesitovenezuela.com | Derivar solicitudes/ofrecimientos. | Puede contener datos personales o contactos. No sincronizar sin contrato de datos. |
| caracasayuda.com | Referencia local de ayuda. | Revisar disponibilidad tecnica y licencia antes de reutilizar. |
| veneconnect.com/apoyo-terremoto | Referencia de diaspora, fundaciones y acopios. | No se detecto dataset publico estable para copiar automaticamente. |
| icrc.org | Enlazar busqueda familiar institucional. | No copiar casos personales; usar como recurso oficial complementario. |
| Reuters Connect | Contrastar cifras publicas y contexto periodistico de rescate/ayuda. | Contenido licenciable y, en algunos items, provisto por terceros. No copiar texto, imagenes o video; no usar como reporte operativo sin fuente primaria. |

## Registro unico en sources.json

`sources.json` es el inventario publico de AyudaVE. Cada fuente debe tener
`id`, `name`, `url`, `category`, `sync` y `privacy`.

Valores recomendados de `sync`:

- `active_sync`: el cron o el admin pueden sincronizarla con reglas actuales.
- `review_before_enable`: candidata tecnica; falta confirmar API/licencia o
  redaccion de datos.
- `manual_reference`: se muestra como fuente de consulta o derivacion, pero no
  entra al import automatico.
- `private_admin_only`: contiene datos personales; no debe exponerse en vistas
  publicas.

Categorias usadas:

- `aid_points`: centros de acopio, servicios, puntos de ayuda.
- `shelters`: refugios y albergues.
- `reports`: necesidades, alertas y reportes de mapa.
- `damage_reports`: estructuras o zonas danadas.
- `people`: personas desaparecidas, localizadas, rescatadas o fallecidas.
- `emergency_directory`: telefonos y canales de emergencia.
- `community_aid`: solicitudes/ofrecimientos comunitarios.
- `live_map`: mapas colaborativos con datos mixtos.
- `institutional_reference`: fuentes oficiales o humanitarias para enlazar.
- `news_context`: cobertura periodistica para contraste y contexto, no para
  importacion automatica.

## Metricas agregadas de personas

AyudaVE expone `api.php?action=external_metrics` para mostrar conteos agregados
de `desaparecidosterremotovenezuela.com` sin importar fichas personales. La
respuesta incluye solo totales como personas unicas aproximadas, aun sin
contacto y localizadas.

Estas cifras no se suman a `missingPeopleTotal` porque pertenecen a otra
plataforma con su propio proceso de deduplicacion y moderacion. Usarlas solo
como referencia visible con atribucion y link al origen.

## Alcance regional

AyudaVE debe poder reutilizarse para otros paises, ciudades o emergencias.
Para eso cada fuente nueva debe indicar:

- Pais o zona cubierta.
- Tipo de dato: reporte, punto de ayuda, refugio, acopio, telefono, alerta.
- Si tiene coordenadas validadas en origen.
- Si contiene datos personales y que campos deben descartarse.
- Licencia o permiso de republicacion.

Las instalaciones que no sean Venezuela pueden mantener el mismo codigo y
cambiar `site_url`, fuentes, idiomas, telefonos de emergencia y paises de
acopio desde configuracion/datos publicos sin exponer credenciales.

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
