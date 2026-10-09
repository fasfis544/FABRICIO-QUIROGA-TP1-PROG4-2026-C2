# Decisiones técnicas documentadas — Cine Aurora

**Revisión:** 09/10/2026. Registro de las decisiones vigentes, sus motivos, alternativas y consecuencias. Referencias: [arquitectura](arquitectura.md), [requerimientos](requerimientos.md) y [reglas del negocio](reglas-negocio.md).

## 1. Estados

- **Adoptada:** está implementada en el código conectado. El despliegue o la validación externa pueden estar pendientes.
- **Elegida para el proyecto:** resuelve una ambigüedad o una preferencia de alcance.
- **Propuesta pendiente:** todavía no está implementada.

Las decisiones se agrupan por tema y no siguen la numeración de los requisitos. Los identificadores DT solo sirven para referenciarlas.

## 2. Registro de decisiones adoptadas

### DT-01 — Fuente única de alcance y numeración original

**Estado:** adoptada. **Vínculos:** todos los RF/RN/RNF.

**Contexto:** el Word usa portada 3.2 y nombre/control de versiones 2.1. Documentación anterior acumulaba matrices internas, estados de distintos días y decisiones ya sustituidas.

**Decisión:** conservar RF-01–85, RN-01–17 y RNF-01–14, junto con sus prioridades, fecha de entrega y diferencia de versiones. La documentación del proyecto queda concentrada en cuatro archivos dentro de `docs`; las instrucciones breves de instalación permanecen en README.

**Alternativa descartada:** renumerar los requisitos o mezclar decisiones de implementación con el texto original. **Consecuencia:** queda separado el alcance definido, la operación del sistema y lo que todavía requiere validación.

### DT-02 — SPA Angular standalone organizada por dominios

**Estado:** adoptada. **Vínculos:** RNF-09/12; arquitectura §7 del Word.

**Decisión:** una misma aplicación para público, cuenta, empleado y admin; `core`, `data-access`, `features`, `shared`; lazy loading por rutas y componentes. Señales para estado y derivados, `inject` para servicios y control de flujo moderno.

**Alternativas:** aplicaciones separadas, NgModules nuevos, store externo para todo. **Motivo:** aumentarían duplicación/configuración sin necesidad con este alcance. **Consecuencia:** separación lógica, no aislamiento físico entre portales; los permisos deben vivir en backend. Carpetas operativas históricas no se renombran solo para embellecer el árbol.

### DT-03 — Signal Forms sin reescritura total de formularios

**Estado:** adoptada. **Vínculos:** RF-78/RN-15.

**Decisión:** Signal Forms en flujos nuevos; mantener Reactive Forms en editores previos y custom validator de butacas. No formularios template-driven nuevos. Estado derivado por `computed`, mensajes/foco y validación duplicada en servidor para integridad.

**Alternativa descartada:** migrar todos los formularios a la vez o eliminar el validator de butacas. **Consecuencia:** conviven dos APIs; un formulario válido no autoriza una compra sin la validación SQL.

### DT-04 — Identidad Auth separada de autorización de perfil

**Estado:** adoptada. **Vínculos:** RF-61/82–85, RN-17, RNF-06.

**Decisión:** Supabase Auth identifica; `perfiles.rol/activo` autoriza. Perfil creado como cliente, sin aceptar roles administrativos de metadata. Guardas refrescan perfil; RPC y Edge verifican rol/actividad/titular. Sincronización fuera de callbacks del SDK para no retener su lock.

**Alternativa descartada:** confiar en localStorage, metadata, botones ocultos o JWT sin estado del perfil. **Consecuencia:** una cuenta Auth inactiva no equivale a invitado. Error al consultar perfil no habilita acceso. OAuth debe completar datos antes de comprar; providers aún requieren configuración del propietario.

### DT-05 — Compra académica simulada, no pago presencial

**Estado:** adoptada. **Vínculos:** alcance §1.2, RF-24/25/31/74/76.

**Decisión:** aceptación explícita de pago simulado, compra nueva confirmada por servidor sin cobrar ni requerir aprobación de boletería. Empleado consume prestaciones, no confirma pagos.

**Alternativas descartadas:** pasarela real o conservar flujo de reserva para pago presencial. **Consecuencia:** ni tarjeta ni cargo real ni factura fiscal. Los estados/recibos presenciales históricos siguen representándose como historia, sin activar los endpoints antiguos revocados.

### DT-06 — Atomicidad SQL orquestada desde Edge

**Estado:** adoptada. **Vínculos:** RN-16, RF-30–34/46/50.

**Contexto:** una Edge con varias peticiones HTTP no comparte una transacción PostgreSQL entre ellas.

**Decisión:** Edge verifica Auth, cotiza como actor, genera QR/PDF y llama una RPC privada. `cine_comprar_documento` revalida la cotización completa bajo locks y guarda compra, asientos, consumo de stock, movimientos y documento juntos. Solo `service_role` puede llamarla.

**Alternativas descartadas:** INSERT sucesivos del navegador o confirmar primero y generar PDF después. **Consecuencia:** falla de documento anterior al commit no crea compra; precio/stock/asiento cambiado produce rollback. La ejecución económica autoritativa está en SQL, aunque el punto de entrada sea Edge.

### DT-07 — Idempotencia por solicitud y pedido, no por botón

**Estado:** adoptada. **Vínculos:** RF-34/51/77, RNF-07.

**Decisión:** UUID `solicitud` estable para reintentar el mismo pedido/compra, canje o lote. Comparar propietario y contenido; rechazar reutilización para otro pedido. UI bloquea dobles envíos, pero backend arbitra.

**Alternativa descartada:** generar un UUID nuevo en cada reintento o depender solo de `disabled`. **Consecuencia:** una respuesta perdida puede recuperarse sin duplicar la operación; cambiar el pedido implica una nueva solicitud.

### DT-08 — Locks y constraint como protección de concurrencia

**Estado:** adoptada. **Vínculos:** RN-01/05/16, RNF-07.

**Decisión:** mutex económico para stock/cupones/saldos, locks de funciones/salas en orden coordinado, índices únicos de entradas activas y solicitudes; locks advisory para lotes/cambios de acceso. Revalidar tiempo tras esperas críticas.

**Alternativa descartada:** consultar disponibilidad y confiar en que nadie cambió mientras el cliente confirma. **Consecuencia:** se prioriza la integridad sobre el paralelismo. El mutex puede limitar el rendimiento y debe medirse antes de modificarlo. PGlite cubre escenarios secuenciales y constraints; la concurrencia remota requiere pruebas aparte.

### DT-09 — Un QR por compra, dos prestaciones y otro token de lectura

**Estado:** adoptada. **Vínculos:** RF-33/35–39, RN-07.

**Decisión:** `qr_compra` UUID generado backend, distinto del token de comprobante. El ingreso consume todas las butacas nuevas juntas; candy es independiente y de único uso. Función operada explícita y ventana de validación. Códigos por asiento/candy antiguos solo para compras históricas; usados siguen rechazados.

**Alternativas descartadas:** un QR nuevo por asiento, usar token de lectura como QR o consumir todo al primer escaneo. **Consecuencia:** no hay ingreso fraccionado nuevo; una compra legada parcialmente usada autoriza solo asientos restantes. El QR no contiene datos personales pero es un secreto portador. La cámara tiene alternativa manual y depende de permisos/HTTPS/dispositivo.

### DT-10 — Comprobante emitido inmutable

**Estado:** adoptada. **Vínculos:** RF-32/33/73–76, RN-16.

**Decisión:** persistir snapshot y PDF de emisión junto a la compra; modificaciones de catálogo/precio no regeneran recibos antiguos. Estado actual de cancelación/uso se consulta aparte y restringe la prestación.

**Alternativa descartada:** reconstruir siempre el recibo con fichas y tarifas actuales. **Consecuencia:** snapshot/PDF consumen espacio, pero conservan lo comprado. Cancelar no borra PDF y sí inhabilita QR. El fallback frontend cubre documentos históricos sin PDF persistido, no reemplaza la autoridad del backend nuevo.

### DT-11 — Plano normativo y mantenimiento, sin editor libre

**Estado:** adoptada; aceptación del alcance de RF-15 pendiente. **Vínculos:** RF-10/15/17–22/59, RN-02/04.

**Decisión:** A–T, estándar 4+20+4, J/K 2+10+2 cada una, VIP R/S/T, 532 plazas. Plano derivado por SQL. Administrar bloqueo/restauración por sala, motivo y lote atómico; no alterar arbitrariamente filas/tipos. Adaptación explícita de sala antigua, nunca con plazas comprometidas.

**Alternativa descartada:** editor geométrico sin límites que cambie VIP/accesibles y entradas emitidas. **Consecuencia:** mantenimiento afecta todas las funciones de esa sala hasta restaurar. Se rechaza lote que toque una plaza comprometida; no cancela ni compensa automáticamente. No se afirma que mantenimiento satisfaga por sí solo toda la edición exigida en RF-15.

### DT-12 — Programación automática protegida y lotes todo o nada

**Estado:** adoptada. **Vínculos:** RF-11–16/77, RN-05/06.

**Decisión:** asignar sala activa/adaptada disponible automáticamente, ordenada por nombre/ID; almacenar `fin=inicio+duración+30 min`. Lotes por días/rango ≤90 días e idempotencia. Proteger cambio de duración/modalidad, reprogramación y cancelación contra operaciones comprometidas.

**Alternativas descartadas:** asignación manual obligatoria, guardar mitad del lote o mover compras sin reemitir/compensar. **Consecuencia:** falta de sala en una fecha revierte lote. Reprogramación con compras/reservas válidas se bloquea. Cancelación administrativa compensa registrados elegibles; invitados, uso previo o puntos insuficientes requieren resolución separada.

### DT-13 — Fecha civil argentina como referencia comercial

**Estado:** adoptada. **Vínculos:** RF-08/54/56/57/62/64/65, RN-13/14.

**Decisión:** fechas comerciales/edad de Buenos Aires; instantes persistidos como `timestamptz`; inputs administrativos UTC−03 explícitos. No truncar segundos/fracciones históricos si no se edita la vigencia. Cambio diario reactivo en frontend.

**Alternativa descartada:** `new Date()` del dispositivo como autoridad comercial o reinterpretar `datetime-local` en su huso actual. **Consecuencia:** cartelera/preventa y backend concuerdan; cliente sigue siendo presentación, reloj servidor decide. Los reportes usan rango Desde incluido/Hasta excluido. Próximamente pasa automáticamente al catálogo al llegar estreno, sin UPDATE programado.

### DT-14 — Precios/combos/beneficios calculados en servidor

**Estado:** adoptada. **Vínculos:** RF-21/30/31/43–49/51/52/56/57.

**Decisión:** precio normal según función/preventa, recargo VIP por porcentaje, consumo agrupado de componentes, una entrada elegida sustituida por cada combo con entrada, un cupón por pedido, crédito limitado al neto/saldo. Canjes nuevos de una entrada o unidad de producto con código propio.

**Alternativas descartadas:** confiar en total enviado, descontar stock solo de combos o convertir premios viejos a promesas nuevas. **Consecuencia:** VIP mantiene recargo; combo no crea asientos adicionales; canje de entrada no se mezcla con combo con entrada. Canjes antiguos de descuento se respetan y sus recompensas quedan fuera de nuevos canjes hasta edición explícita.

### DT-15 — Restaurar 1 punto por peso sin recalcular historia

**Estado:** adoptada y restaurada según RN-12. **Vínculos:** RF-50/RN-12.

**Contexto:** existió cambio solicitado a `floor(a_pagar/8)`; luego se eligió volver al Word.

**Decisión vigente:** compras registradas nuevas acreditan `floor(a_pagar)`; invitado/cero no generan puntos. Se conservan movimientos, saldos/canjes originales y migración por ocho como historial de evolución.

**Alternativas descartadas:** volver a ejecutar la migración por ocho o recalcular compras antiguas. **Consecuencia:** puede coexistir historia con tasas distintas; cancelación revierte puntos de aquella compra, no puntos recomputados. Puntos de compras aún cancelables se acreditan pero no están disponibles para canje: protección adicional declarada, no requisito literal. Costos de premios se revisan aparte, sin cambiar saldos silenciosamente.

### DT-16 — Baja lógica recuperable con cambio mínimo de estado

**Estado:** implementada localmente; instalación confirmada antes por usuario, pero inspección remota posterior no encuentra RPC `cine_estado_catalogo`. Investigar sin reaplicar bloques automáticamente. **Vínculos:** RF-10/59/60, historia.

**Decisión:** Eliminar desactiva películas, salas, géneros, productos, combos, cupones y recompensas; Activos por defecto, Eliminados recuperables para restaurar, Todos para combinar. RPC de whitelist cerrada modifica solo `activo`/`activa`, con timestamp/triggers/eventos existentes y auditoría mínima.

**Alternativas descartadas:** DELETE físico o reenviar toda la ficha para desactivar. **Consecuencia:** no se reconstruyen salas ni precios/stock/vigencias/relaciones. Película/sala con compras o reservas válidas futuras/en curso bloquea la baja específica. Restore no revive stock/cupón vencido/compra cancelada; dependencias comerciales se revalidan. Los filtros no implementan paginación de servidor.

### DT-17 — Una opinión vigente por cuenta y película, con archivo intacto

**Estado:** implementada; la migración está instalada, pero todavía falta una auditoría independiente. **Vínculos:** RF-40–42/58.

**Contexto:** el Word no especifica unicidad o ponderación. El sistema previo permitía una reseña por cuenta/compra y cada compra sumaba un voto.

**Decisión:** nueva `cine_resenas_pelicula`, PK cuenta/película y upsert; promedio un voto por cuenta. Inicio desde la histórica de mayor `creada`, desempate por UUID descendente. Todas las originales permanecen intactas en `cine_resenas`, ahora archivo protegido. Solo compra propia confirmada con ingreso utilizado habilita guardar/editar.

**Alternativas descartadas:** borrar duplicados, imponer unicidad sobre la tabla antigua o promediar todas las compras de una cuenta. **Consecuencia:** promedio público puede cambiar, sin perder filas históricas; las antiguas adicionales ya no son votos públicos. Fecha de edición antigua no existe y no se inventa. Nuevas ediciones sustituyen la vigente, sin archivo de todas las versiones futuras. Dos pestañas: último guardado exitoso prevalece.

Lectores privados exponen marcador `resena_por_pelicula=true`, estrellas/texto desde cualquier compra de esa película. El editor se protege si falta bloque nuevo o comentario existente; lectura sin ingreso no habilita edición. No se amplía comentario privado del acceso portador. `20261016000300` incluye el lector anterior: no aplicar `20261016000100` después. Trigger histórico evita que llamadas legadas en vuelo escriban fuera de la copia; ese cruce temporal no fue probado con conexiones reales.

### DT-18 — Realtime público mínimo y polling de respaldo

**Estado:** adoptada. **Vínculos:** RF-18, RNF-08.

**Decisión:** solo tabla de ID/revisión publicada, reconsulta segura por RPC; polling visible a 15 s y recarga tras reconexión. No usar Presence ni publicar tablas de compras/perfiles para conseguir actualizaciones.

**Alternativa descartada:** emitir entradas completas o garantizar disponibilidad definitiva en UI. **Consecuencia:** hay latencia entre evento y lectura; cotización/commit siguen arbitrando. Suscripciones se limpian y se ignoran respuestas viejas. Grants excesivos de esa tabla fueron cerrados por corrección separada autorizada `20261017000200`, manteniendo SELECT/RLS/triggers; no implica revisar todos los privilegios.

### DT-19 — Offline mínimo solo para cartelera pública

**Estado:** adoptada. **Vínculos:** RNF-04/05.

**Decisión:** worker propio para SWR exacto del GET de cartelera; Angular SW para assets. Copia <7 días, revalidación paralela y aviso de cambios; tolerancia de fallas CacheStorage. Nada privado/económico offline.

**Alternativas descartadas:** cachear RPC POST o todo Supabase, caché por JWT, cola offline de compras. **Consecuencia:** catálogo offline es informativo y puede estar viejo; no asegura stock/precio/asiento. Compras, QR de cuenta, saldos y validaciones requieren conexión. PWA instalable/caché no demuestra Web Push operativo.

### DT-20 — Imágenes públicas inmutables y documentos privados

**Estado:** adoptada. **Vínculos:** RF-01/43 y Storage §7.

**Decisión:** buckets de afiches/productos públicos, subidas admin en carpeta propia con UUID, límites 5 MiB/JPG/PNG/WebP, sin upsert/borrado global. Producto conserva ruta controlada; placeholder y proporción fija en UI. PDF/QR no se alojan en esos buckets.

**Alternativa descartada:** sobreescribir nombre de objeto fijo o aceptar URL arbitraria para producto. **Consecuencia:** cache estable y referencias anteriores conservadas; posible objeto huérfano tras guardar ficha fallido. Limpieza requiere inventario/autorización, no DELETE general.

### DT-21 — Reportes agregados y exportaciones sin formato ficticio

**Estado:** adoptada. **Vínculos:** RF-62–69.

**Decisión:** SQL autorizado calcula métricas; Angular muestra resumen, barras semánticas/tablas y exporta mismo resultado consultado. Ventas por compra, vistas por validación, candy por unidades componentes incluidos combos. XLSX ZIP/OOXML real, números numéricos y cadenas `inlineStr`; PDF multipágina.

**Alternativas descartadas:** CSV renombrado `.xlsx`, gráficos sin datos tabulares, fórmulas ejecutables desde nombres del catálogo o llamar recaudación fiscal a simulación. **Consecuencia:** el exportador propio necesita controles de ZIP/XML, nombres y textos, además de una lectura independiente en Excel. El importe atribuido a una entrada no es un reparto contable completo de descuentos y combos; los reportes no calculan facturación por película o producto.

### DT-22 — Auditoría backend unificada, sin secretos en visor

**Estado:** adoptada con endurecimiento pendiente. **Vínculos:** RF-70–72/RNF-11.

**Decisión:** triggers/RPC registran usuario/acción/fecha; visor une `cine_auditoria` y `eventos_auditoria`, soporta `accion`/`operacion`, pagina 100 y no devuelve snapshot, token, PDF o contacto. Roles pagan su autorización en SQL.

**Alternativa descartada:** registro solo en navegador o exponer `to_jsonb` completo en la pantalla. **Consecuencia:** auditoría privada actual puede duplicar secretos/documentos por triggers históricos; no se afirma fuga pública, pero queda propuesta de allowlist para registros futuros y retención autorizada. No borrar evidencia anterior para minimizar sin respaldo/acuerdo.

### DT-23 — Migraciones aditivas, configuración manual y conservación

**Estado:** adoptada. **Vínculos:** RNF-13/14 y datos históricos.

**Decisión:** conservar SQL histórico; corregir con nuevos bloques, comprobar diferencias remotas (`activo`/`activa`, `accion`/`operacion`, helpers). Entorno público generado e ignorado. Activación manual de SQL/Auth/Edge separada y permisos remotos explícitos.

**Alternativas descartadas:** reconstruir proyecto existente, `db push` indiscriminado, `audit fix --force`, borrar índices/políticas por alerta automática o exportar credenciales en docs. **Consecuencia:** versión local no demuestra servidor instalado. No repetir hasta `20261015000300` verificado ni 002/003 confirmados por usuario; original 001 queda supersedido. URL/anon pública visible no equivale a filtración de service_role.

### DT-24 — Prueba por niveles y no certificación por mocks

**Estado:** adoptada. **Vínculos:** RNF-07/10/11, aceptación integral.

**Decisión:** Angular unitario, SQL PGlite con dos variantes, worker y Deno adversarial, build/tipado, navegador/AXE local, auditoría remota lectura y recorridos reales autorizados como niveles diferentes.

**Alternativa descartada:** llamar producción a un render mock o convertir ausencia de AXE en WCAG certificado. **Consecuencia:** se preservan límites de evidencia. Reglas de concurrencia requieren dos conexiones reales; instalación de Cron no demuestra entrega push; bucket configurado no prueba upload; proveedor Auth declarado no prueba OAuth.

### DT-25 — Web Push consentido, privado y con outbox transaccional

**Estado:** implementada y backend activado con autorización; SQL/Edge/Vault/Cron y frontend HTTPS verificados, recepción real con consentimiento pendiente. **Vínculos:** RF-55/79/80/81, RNF-04/06/14.

**Decisión:** preferencias en la bandeja conectada, permiso solo por gesto explícito. Suscripciones privadas por dispositivo/cuenta, máximo diez; traspaso consentido descarta pendientes previas. Eventos nuevos de venta efectiva e ingreso/candy por triggers, recordatorios 24 h/2 h del emisor programado. Cada evento/cuenta y evento/dispositivo tienen unicidad; lease, SKIP LOCKED, revalidación y seis intentos con backoff/Retry-After. 404/410 da baja; no reenvía historia. Avisos vencen según negocio y recordatorios tienen margen de quince minutos, no mensajes atrasados fuera de hora.

**Alternativas descartadas:** convertir bandeja en Push, emisor en Angular con clave privada, cron con secreto literal, texto/QR/link portador en pantalla bloqueada, envío síncrono al validar una entrada, redirects/host libre y promesa de entrega exactamente una vez. Se usa biblioteca `web-push` para aes128gcm/VAPID y fetch acotado sin redirects, allowlist FCM/Mozilla/Apple/Windows. El emisor exige secreto backend; la Data API no da acceso directo a endpoints/keys ni TRUNCATE.

**Consecuencias:** app y consumo no dependen del proveedor Push. Textos genéricos abren cuenta protegida (venta: ficha pública), QR/sala/horario tras autenticación. Logout intenta baja local/remota hasta cinco segundos sin bloquear salida ni bajar otros dispositivos. Al menos una vez con tag; ack perdido puede reentregar, OS/TTL/baja en tránsito no garantizan recepción. Dispositivos/retención/docente pendientes. Activación no modificó datos económicos/reseñas/bandeja histórica. Se corrigió encoding ECDH no soportado por runtime Edge y se añadió autocheck de cifrado sin red; Deno local no había detectado esa incompatibilidad. [Procedimiento y evidencia](arquitectura.md#94-activación-web-push--procedimiento-y-estado).

## 3. Decisiones pendientes, no implementaciones

| Tema                       | Propuesta / dependencia                                                                                                      | Qué NO se debe asumir                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Recepción Web Push         | Backend/HTTPS activados y Cron HTTP 200 con lotes vacíos; consentir dispositivo y probar eventos designados. | Lote vacío o mock no acredita recepción del sistema operativo. |
| Privacidad de recordatorio | Usuario eligió aviso mínimo que abre cuenta, sin QR/token en payload, URL o pantalla bloqueada.                              | RF-79/80 piden QR; falta aprobación docente de esta interpretación.             |
| RF-15                      | Confirmar alcance normativo+mantenimiento con docente.                                                                       | No se promete edición libre de filas/columnas/tipos que el código no tiene.     |
| OAuth                      | HTTPS y retornos Auth configurados; faltan apps de Google/GitHub, credenciales del propietario y pruebas reales. | Botones/retornos no prueban proveedor habilitado. |
| Emails                     | Activar cinco HTML españoles conservando `ConfirmationURL`, probar confirmación/recuperación.                                | SMTP solo Auth, no entradas/comerciales; una plantilla no activa nuevos flujos. |
| Seguridad mínima           | Grants de eventos cerrados con autorización; quedan defaults, minimización audit y antiabuso invitado. | El cierre específico no autoriza modificar otras tablas/datos. |
| Recuperación               | Backup seguro de DB y Storage separado; restauración en proyecto aislado.                                                    | Migraciones/docs no recuperan ventas, imágenes ni cuentas reales.               |
| Rendimiento                | EXPLAIN/índices selectivos, paginación, agrupar eventos, medir bundle/latencia.                                              | No se crean todos los índices de Advisor ni se borra un índice por poco uso.    |
| Economía futura            | Revisar costos de premios frente a 1 punto/peso.                                                                             | No recalcular puntos/canjes históricos o activar premios de prueba sin acuerdo. |

No se agregan búsquedas vectoriales, GraphQL, Presence ni integraciones que no formen parte del alcance. MFA y CAPTCHA quedan fuera de esta versión.

## 4. Criterio para modificar estas decisiones

1. Identificar RF/RN afectados y si la nueva regla fue especificada o elegida.
2. Explicar alternativa, datos históricos implicados, autorización y consecuencias.
3. Preparar cambio mínimo y regresiones; mantener compatibilidad o migración explícita.
4. Registrar por separado prueba local, activación y verificación independiente.
5. Actualizar estos cuatro documentos y enlaces README, sin añadir otro informe duplicado a `docs/`.

Las referencias exactas de código y procedimientos están en [arquitectura](arquitectura.md); los ejemplos económicos, plazos y excepciones en [reglas](reglas-negocio.md). Si código y documento divergen, investigar: no transformar automáticamente ninguno para ocultar la diferencia.
