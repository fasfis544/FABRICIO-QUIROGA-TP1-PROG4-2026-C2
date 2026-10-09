# Documento de requerimientos — Sistema de Cine Aurora

**Autor del proyecto:** Fabricio Quiroga. **Materia:** Programación IV. **Comisión:** 141. **Docente:** Ricardo Gastón Plazas. **Entrega original:** 13/10/2026.

**Fuente:** `Sistema_de_Cine_Documento_de_Requerimientos_v2.1 (3) (1).docx`. La portada indica **3.2**, mientras que el nombre y el historial llegan a **2.1**. Esa diferencia se mantiene hasta definir una versión única. Fecha de actualización: **09/10/2026**.

Este archivo resume los requisitos y los relaciona con la implementación actual. No reemplaza el documento original.

## Índice

1. [Propósito, alcance y actores](#1-propósito-alcance-y-actores)
2. [Convenciones y estado de la entrega](#2-convenciones-y-estado-de-la-entrega)
3. [Requerimientos funcionales RF-01–85](#3-requerimientos-funcionales-rf-0185)
4. [Requerimientos no funcionales RNF-01–14](#4-requerimientos-no-funcionales-rnf-0114)
5. [Reglas y modelo conceptual](#5-reglas-y-modelo-conceptual)
6. [Casos de uso y aceptación](#6-casos-de-uso-y-aceptación)
7. [Trazabilidad técnica](#7-trazabilidad-técnica)
8. [Ambigüedades y decisiones de alcance](#8-ambigüedades-y-decisiones-de-alcance)
9. [Entregables, evidencias y cierre pendiente](#9-entregables-evidencias-y-cierre-pendiente)

## 1. Propósito, alcance y actores

### 1.1 Propósito

Especificar qué debe permitir el sistema, sus restricciones y la forma de contrastarlo con la implementación. Se conservan las prioridades y los identificadores originales para facilitar el seguimiento de cada requisito.

La documentación del proyecto se completa con [arquitectura](arquitectura.md), [decisiones técnicas](decisiones-tecnicas.md) y [reglas del negocio](reglas-negocio.md). README contiene las instrucciones breves de instalación y navegación.

### 1.2 Alcance incluido

Una aplicación web progresiva para un **único establecimiento con varias salas**, que integra:

- Catálogo, búsqueda, filtros, estrenos y ranking.
- Compra registrada/invitada de asientos y candy; promociones, crédito y fidelización.
- PDF digital y QR de compra con dos prestaciones independientes.
- Reseñas, historial visual, alertas de disponibilidad y notificaciones.
- Backoffice de películas, salas/funciones/butacas, precios, productos/combos, cupones/recompensas.
- Accesos por rol, reportes/exportación y auditoría.
- Auth email/password y OAuth Google/GitHub; PWA y cartelera offline.

**Supuestos explícitos originales:** pago simulado sin pasarela real; comprobante digital sin impresión física requerida; PWA en lugar de aplicaciones nativas; mapa de ubicación del cine/sala como mejora futura no aprobada y excluida. No se incorporan cobros reales, email de entradas, MFA, CAPTCHA ni soporte para varios establecimientos.

### 1.3 Actores

| Actor              | Capacidades esperadas                                                                          | Restricción principal                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Invitado           | Cartelera, ficha/funciones, compra con contacto indispensable, comprobante por enlace secreto. | Sin beneficios ni historial de cuenta; conformidad explícita de edad en restringidas. |
| Cliente registrado | Compra, reseña, crédito/puntos/canjes, historial y suscripciones.                              | Sesión/perfil activos y titularidad; edad mínima servidor.                            |
| Empleado           | Escaneo/manual de ingreso y candy de función seleccionada.                                     | No es administrador ni aprobador de cobros.                                           |
| Administrador      | Catálogo/operación, roles, reportes y auditoría.                                               | Autorización backend; conservar compromisos e historia.                               |

### 1.4 Datos de registro del original

Email, nombre, apellido, fecha de nacimiento, grupo sanguíneo, color de ojos y días de vacaciones anuales. Contraseña corresponde al acceso Auth. El Word observa expresamente que grupo sanguíneo/ojos/vacaciones no tienen relación directa con el resto del negocio y recomienda validar necesidad real por minimización. La implementación los conserva por consigna; no se inventan datos para cuentas OAuth/antiguas.

## 2. Convenciones y estado de la entrega

### 2.1 Leyenda

- **I:** implementación localizada en código conectado y comprobada localmente donde existe prueba. **No implica certificación de producción.**
- **P:** parcial respecto del alcance original o dependencia externa aún no operativa.
- **F:** funcionalidad requerida no implementada.
- **V:** necesita configuración/aceptación/prueba externa adicional. Puede combinarse con I/P/F.
- Prioridad **A/M/B**: Alta, Media o Baja según el documento original.

Los RF-77/78/79–81/82–85 aparecen en secciones distintas en el original. Aquí se conservan sus IDs y se agrupan por dominio. Los resúmenes no reemplazan el texto literal del Word.

### 2.2 Estado general conocido

Los flujos centrales y la administración están implementados y probados localmente. Migraciones hasta `20261015000300` revisadas previamente; publicación posterior verificó Push y cierre específico de eventos. Reseña única tiene tabla remota, falta auditoría integral. Baja lógica fue confirmada por usuario, pero la inspección posterior no encuentra `cine_estado_catalogo`: discrepancia pendiente, no reaplicar a ciegas.

**La entrega todavía no está cerrada:** frontend HTTPS publicado en **https://cine-aurora.vercel.app** y backend Web Push activado/verificado con lotes vacíos; falta consentimiento y recepción real. También faltan OAuth operativo, revisión de la discrepancia del catálogo y concurrencia real. RF-15 no contempla edición libre en el código actual; requiere aceptación. Plantillas españolas Auth pendientes; ajuste PDF ya redesplegado, sin alterar documentos históricos.

## 3. Requerimientos funcionales RF-01–85

### 3.1 Películas y cartelera

| ID    | Prio. | Requisito original resumido                                  | Estado / trazabilidad                                                                |
| ----- | ----- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| RF-01 | A     | Registrar películas con nombre, imagen, sinopsis y duración. | I: editor películas, Storage/fallback y RPC validada.                                |
| RF-02 | A     | Asociar uno o más géneros a cada película.                   | I: selección/RPC; asociación histórica inactiva preservada.                          |
| RF-03 | A     | Clasificar sin restricción, +13 o +18.                       | I: ATP/13/18; clasificaciones antiguas no se convierten automáticamente.             |
| RF-04 | A     | Definir formatos por función: 2D, 3D, 4D y 5D.               | I: programación y edición SQL/modalidad.                                             |
| RF-05 | A     | Definir idioma por función: castellano o subtitulada.        | I: programación/edición, no solo campo de película.                                  |
| RF-06 | A     | Buscar películas por nombre.                                 | I: catálogo público y búsqueda.                                                      |
| RF-07 | A     | Filtrar por género, clasificación, formato e idioma.         | I/V: pares de misma función futura/sala activa; entrega real de cambios a verificar. |
| RF-08 | M     | Distinguir cartelera y próximos estrenos.                    | I: fecha civil argentina y cambio diario reactivo.                                   |
| RF-09 | M     | Ranking de tres películas más vendidas, primero en inicio.   | I: muestra hasta tres películas con ventas positivas.                                |

### 3.2 Salas, funciones y programación

| ID    | Prio. | Requisito original resumido                                               | Estado / trazabilidad                                                                                |
| ----- | ----- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| RF-10 | A     | Alta, baja y modificación de salas y distribución.                        | P/V: sala/adaptación/mantenimiento locales; edición libre no. RPC de baja no encontrada remotamente, investigar. |
| RF-11 | A     | Crear función con película, fecha/hora, formato/idioma y sala automática. | I: formulario y `cine_crear_funcion`.                                                                |
| RF-12 | A     | Asignar sala disponible automáticamente según duración/disponibilidad.    | I: SQL, activas/adaptadas y locks.                                                                   |
| RF-13 | A     | Impedir funciones simultáneas/superpuestas en misma sala.                 | I/V: validación SQL, falta multiconexión real.                                                       |
| RF-14 | A     | Mínimo 30 minutos entre fin de función y siguiente inicio.                | I: fin almacenado incorpora limpieza.                                                                |
| RF-15 | A     | Administrar filas, columnas y tipo de butaca de la sala.                  | P/V: plano normativo fijo y mantenimiento; aceptación docente del alcance pendiente.                 |
| RF-16 | M     | Cancelar o reprogramar función desde backoffice.                          | I/V: restricciones de historia/uso/compensación; invitados y reemisión no resueltos automáticamente. |
| RF-77 | M     | Programación por patrón de días/horario en rango para una película.       | I/V: lote atómico/idempotente, máximo 90 días; falta concurrencia remota.                            |

### 3.3 Butacas inteligentes

| ID    | Prio. | Requisito original resumido                                         | Estado / trazabilidad                                                             |
| ----- | ----- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| RF-17 | A     | Mapa interactivo por función.                                       | I: pantalla de butacas con tres bloques.                                          |
| RF-18 | A     | Disponibilidad en tiempo real ante acciones de otros usuarios.      | I/V: eventos públicos + polling 15 s; pendiente dos clientes reales y reconexión. |
| RF-19 | A     | Diferenciar accesibles J/K visualmente.                             | I: dos filas independientes de 14, etiquetas/leyenda.                             |
| RF-20 | A     | Identificar VIP en R/S/T.                                           | I: plano servidor y UI.                                                           |
| RF-21 | A     | Precio diferencial VIP.                                             | I: recargo positivo configurable, conservado con preventa/combos.                 |
| RF-22 | A     | Mostrar tipo y precio por butaca antes de confirmar.                | I: disponibilidad y cotización.                                                   |
| RF-78 | A     | Custom validator de contigüidad integrado al formulario de butacas. | I: Reactive Forms, misma fila/bloque y validación SQL adicional.                  |

### 3.4 Compra de entradas

| ID    | Prio. | Requisito original resumido                                     | Estado / trazabilidad                                                                            |
| ----- | ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| RF-23 | A     | Solicitar todos los datos de registro de §2.3.                  | I/V: formulario y SQL; entrega/confirmación Auth real por verificar.                             |
| RF-24 | A     | Comprar como usuario registrado.                                | I/V: checkout Edge; evidencia previa del usuario del recorrido central, no todos los beneficios. |
| RF-25 | A     | Compra anónima con contacto indispensable.                      | I/V: invitado sin Auth; falta prueba remota completa designada.                                  |
| RF-26 | A     | Elegir función y butacas disponibles.                           | I: mapa/carrito/cotización.                                                                      |
| RF-27 | A     | Impedir compra registrada de menor que clasificación requerida. | I/V: rechazo SQL y pruebas locales; cuenta menor real designada pendiente.                       |
| RF-28 | M     | Invitado confirma explícitamente edad mínima en restringida.    | I: checkbox y validación backend.                                                                |
| RF-29 | M     | Leyenda de adulto en toda entrada restringida.                  | I/V: QR/PDF; verificar documento remoto restringido.                                             |
| RF-30 | A     | Aplicar cupones al comprar.                                     | I/V: porcentual/monto y condiciones SQL; recorrido real completo pendiente.                      |
| RF-31 | A     | Crédito combinable con otro medio.                              | I/V: crédito + resto simulado, saldo autorizado servidor.                                        |
| RF-32 | A     | Generar PDF de compra.                                          | I/V: PDF antes de commit y persistido; ajuste de ancho local aún no desplegado.                  |
| RF-33 | A     | QR único por compra.                                            | I: UUID backend, distinto del token de enlace.                                                   |
| RF-34 | A     | No vender butaca reservada/ocupada de misma función.            | I/V: locks/índice parcial; no concurrencia multiconexión certificada.                            |

### 3.5 Validación por QR

| ID    | Prio. | Requisito original resumido                                            | Estado / trazabilidad                                                                |
| ----- | ----- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| RF-35 | A     | Validar entrada por escaneo QR.                                        | I/V: ZXing; usuario informó cámara/lectura física, pendiente matriz de dispositivos. |
| RF-36 | M     | Validar con ingreso manual de código.                                  | I: mismo contrato, recorrido informado por usuario.                                  |
| RF-37 | A     | Mismo QR para ingreso/candy, estados independientes.                   | I/V: SQL y UI; circuito real completo de ambas prestaciones pendiente.               |
| RF-38 | A     | Invalidar cada prestación en primer uso; QR agotado al consumir todas. | I/V: uso único bajo locks; falta prueba real designada de repetición/agotamiento.    |
| RF-39 | M     | Motivo de rechazo: usado, inexistente u otra función.                  | I: función seleccionada, mensajes y registro backend.                                |

### 3.6 Experiencia, candy y beneficios

| ID    | Prio. | Requisito original resumido                                             | Estado / trazabilidad                                                                                                    |
| ----- | ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| RF-40 | M     | Registrados califican con estrellas y comentario corto.                 | I/V: opinión única elegida por usuario y condición de ingreso adicional; SQL 003 confirmado, falta auditoría remota.     |
| RF-41 | M     | Calcular/mostrar promedio por película.                                 | I/V: un voto por cuenta, probado SQL local; regla no especificada por Word.                                              |
| RF-42 | M     | Reseñas/promedio en ficha antes de comprar.                             | I: ficha pública, independiente del checkout.                                                                            |
| RF-43 | A     | Gestionar candy por categoría y precio.                                 | I: producto con categoría textual/stock/imagen opcional; no catálogo separado de categorías.                             |
| RF-44 | M     | Armar combos, opcionalmente entrada, a precio fijo configurable.        | I: componentes/cantidades y sustitución de una tarifa normal.                                                            |
| RF-45 | M     | Destacar combos vigentes en compra.                                     | I: pantalla candy del flujo de compra.                                                                                   |
| RF-46 | A     | Incorporar candy en compra.                                             | I/V: consumo agregado/snapshot; comprobación stock/QR remoto pendiente.                                                  |
| RF-47 | A     | Bienvenida 20% en primera compra, porcentaje configurable.              | I/V: trigger/cupón personal y configuración; falta registro/uso real completos.                                          |
| RF-48 | A     | Cupones porcentaje/monto, vigencia y usos.                              | I/V: editor/RPC; frontera real de cupón designado pendiente.                                                             |
| RF-49 | M     | Segmentar cupón, por ejemplo mayores de 50.                             | I/V: edad mínima/película/usuario/registro; interpretación >=edad declarada.                                             |
| RF-50 | M     | Un punto por peso efectivamente abonado registrado.                     | I/V: vigente `floor(a_pagar)` y restauración observada; historia 1/8 intacta.                                            |
| RF-51 | M     | Canjear puntos por entrada gratis o candy.                              | I/V: cupón personal unitario y débito atómico; recorrido remoto pendiente.                                               |
| RF-52 | M     | Costo de premio en puntos configurable.                                 | I: editor de recompensas.                                                                                                |
| RF-53 | M     | Perfil con puntos e historial de canjes.                                | I: total/disponible, movimientos y códigos privados.                                                                     |
| RF-54 | M     | Próximamente para próximas semanas.                                     | I/V: futuras; original no fija número de semanas, sin límite explícito actual.                                           |
| RF-55 | M     | Suscripción y aviso al habilitar venta de próxima película.             | I/V: evento/bandeja y backend Web Push activos, Cron HTTP 200; falta dispositivo consentido y recepción real. |
| RF-56 | M     | Preventa hasta siete días antes, precio especial por película.          | I/V: ventana argentina servidor, función programada; prueba remota controlada pendiente.                                 |
| RF-57 | M     | Precio regular automático al vencer preventa.                           | I/V: por fecha servidor, sin reescribir precio; frontera remota pendiente.                                               |
| RF-58 | B     | Mis películas con póster/fecha/calificación basada en ingreso validado. | I/V: historial privado, opinión por película, visitas conservadas; confirmar recarga real.                               |
| RF-79 | M     | Push 24 h antes con sala, horario y QR.                                 | P/V: backend y scheduler activos; aviso privado abre cuenta. Recepción y aceptación docente del QR pendientes. |
| RF-80 | M     | Push 2 h antes con sala, horario y QR.                                  | P/V: canal activo, margen 15 min y revalidación; no QR en payload. Recepción/docente pendientes. |
| RF-81 | M     | Push al validar ingreso o candy.                                        | I/V: triggers/outbox/emisor instalados, unicidad por evento/dispositivo; falta recepción real con registros designados. |

### 3.7 Administración, reportes y auditoría

| ID    | Prio. | Requisito original resumido                                              | Estado / trazabilidad                                                                                        |
| ----- | ----- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| RF-59 | A     | Gestión integral de películas, salas, funciones y butacas.               | P/V: seis áreas operativas y baja recuperable; límites RF-15/compensaciones.                                 |
| RF-60 | A     | Gestión de productos, precios, cupones, combos y premios.                | I/V: ofertas y baja/restauración locales; RPC de baja ausente en inspección remota, instalación declarada por revisar. |
| RF-61 | A     | Backoffice restringido por rol.                                          | I/V: guard + SQL/privilegios; ampliar matriz real de cuentas activas/inactivas.                              |
| RF-62 | A     | Reporte de facturación diaria.                                           | I/V: totales operativos simulados, no fiscal; conciliación previa parcial.                                   |
| RF-63 | A     | Entradas vendidas por período.                                           | I/V: confirmadas no canceladas, período de compra; reconciliación de más casos pendiente.                    |
| RF-64 | M     | Películas más vistas por semana.                                         | I/V: ingresos usados en últimos siete días, no venta; definición calendario no fijada.                       |
| RF-65 | M     | Películas más vistas por mes.                                            | I/V: validaciones desde comienzo de mes; falta muestra real más amplia.                                      |
| RF-66 | M     | Producto candy más vendido.                                              | I/V: unidades incluidas en combos; no ingreso monetario atribuido.                                           |
| RF-67 | M     | Gráficos estadísticos acompañan reportes.                                | I: barras semánticas `meter` y tabla accesible.                                                              |
| RF-68 | A     | Exportar reportes PDF.                                                   | I/V: resumen/período y multipágina; conciliación remota de exportación pendiente.                            |
| RF-69 | A     | Exportar reportes Excel.                                                 | I/V: XLSX OOXML real y apertura previa de tres archivos en Excel lectura; falta todos los escenarios reales. |
| RF-70 | A     | Registrar usuario, acción y fecha/hora de operaciones relevantes.        | I/V: triggers/RPC y metadatos; minimización de snapshots y alcance integral por revisar.                     |
| RF-71 | A     | Auditar al menos creación de función, cambio de precios y validación QR. | I: registros backend independientes del cliente.                                                             |
| RF-72 | M     | Consultar auditoría desde backoffice.                                    | I: visor unificado, paginado y sin secretos de snapshots.                                                    |

### 3.8 Cancelaciones y autenticación

| ID    | Prio. | Requisito original resumido                       | Estado / trazabilidad                                                                   |
| ----- | ----- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| RF-73 | A     | Usuario cancela compra hasta dos horas antes.     | I/V: propietario/plazo/no uso; cancelación propia invitada no disponible.               |
| RF-74 | A     | No devolución directa de dinero.                  | I: solo crédito y simulación académica.                                                 |
| RF-75 | A     | Cancelación genera crédito personal.              | I/V: restaura stock y revierte puntos, idempotente; prueba remota pendiente.            |
| RF-76 | A     | Crédito + otro medio en compra futura.            | I/V: resto simulado, no pasarela.                                                       |
| RF-82 | A     | Login email/password explícito y sesión.          | I/V: Auth real usado; ampliar recuperación/confirmación reales.                         |
| RF-83 | A     | Login OAuth Google/GitHub mediante Supabase Auth. | P/V: código/callback/botones, proveedores observados deshabilitados y sin URL pública.  |
| RF-84 | A     | Sesión vinculada a rol y funcionalidades.         | I/V: perfil/activo, no metadata; matriz real completa pendiente.                        |
| RF-85 | M     | Cerrar sesión.                                    | I: logout de sesión local y sincronización; no cierre global de todos los dispositivos. |

## 4. Requerimientos no funcionales RNF-01–14

| ID     | Categoría y requisito original                                                  | Estado / criterio de comprobación                                                                       |
| ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| RNF-01 | Usabilidad: interfaz propia/coherente/intuitiva.                                | I/V: Aurora negro/grafito/plata, seis áreas, estados/foco; evaluación humana y WCAG integral pendiente. |
| RNF-02 | Usabilidad: fechas/horas con pocos clics, sin navegación mes a mes obligatoria. | I/V: inputs editables, rango/días y Argentina; confirmar móvil/compatibilidad.                          |
| RNF-03 | Disponibilidad: URL pública funcional.                                          | I/V: Vercel HTTPS público, rutas/assets HTTP 200 y Chrome real; no aceptación integral de módulos. |
| RNF-04 | Instalabilidad: PWA móvil/escritorio.                                           | I/V: manifest/iconos y worker propio controlando Chrome HTTPS real; instalación en dispositivos pendiente. |
| RNF-05 | Continuidad: SWR offline de cartelera.                                          | I/V: 20 escenarios locales y worker activo público; offline/actualización completos en dispositivos pendientes. |
| RNF-06 | Seguridad: datos gobernados por RLS según rol.                                  | I/V: cierre específico de eventos instalado, lectura conservada y TRUNCATE denegado; defaults/revisión integral pendientes. |
| RNF-07 | Concurrencia: evitar doble venta en compras simultáneas.                        | I/V: locks/constraints, falta prueba multiconexión real con registros autorizados.                      |
| RNF-08 | Rendimiento: mapa/cartelera actualizados sin recarga manual.                    | I/V: Realtime/polling/SWR; latencia/recuperación real pendiente.                                        |
| RNF-09 | Mantenibilidad: módulos por dominio independientes.                             | I: capas/lazy routes y grafo sin archivos desconectados; tres carpetas vacías históricas.               |
| RNF-10 | Compatibilidad: Chrome, Edge, Firefox y Safari modernos.                        | P/V: Chrome/Edge local, no certificación Firefox/Safari/dispositivos.                                   |
| RNF-11 | Trazabilidad: acción crítica registrada íntegramente desde backend.             | I/V: triggers/RPC, falta auditoría global y endurecimiento/minimización autorizados.                    |
| RNF-12 | Tecnología: Angular y Supabase.                                                 | I: stack implementado.                                                                                  |
| RNF-13 | Documentación: README, arquitectura y decisiones.                               | I: cuatro documentos consolidados, DER integrado y README.                                              |
| RNF-14 | Seguridad: credenciales desde variables y fuera del repositorio.                | I/V: lista de subida revisada, claves nuevas solo Edge/Vault y anon pública en hosting; Git/publicación de código pendientes. |

Objetivo adicional del desarrollo: accesibilidad WCAG AA y controles AXE. El Word no los enumera con un nuevo RNF; las pruebas locales no son una certificación global.

## 5. Reglas y modelo conceptual

Las **RN-01–17** se conservan íntegramente como matriz resumida y se desarrollan con ejemplos, límites y validación servidor en [reglas del negocio](reglas-negocio.md). No crear numeración paralela para ellas.

Entidades conceptuales originales: Usuario/Perfil, Película, Género, Sala, Butaca, Función, Entrada/Compra, detalle de butacas, Producto candy, Combo, Cupón, Fidelización, Recompensa, Alerta, Reseña, Crédito, QR y Auditoría.

Correspondencia física: usuarios Auth/perfiles; compra en `cine_reservas`; plazas emitidas en `cine_entradas`; plano generado por SQL y mantenimiento separado; saldos por movimientos; QR/snapshot/PDF en compra; opinión vigente en tabla nueva y reseñas originales archivadas. DER y diccionario de tablas en [arquitectura, modelo de datos](arquitectura.md#5-modelo-de-datos-y-der).

## 6. Casos de uso y aceptación

Los tres casos de uso originales son compra, validación y cancelación. Los siguientes escenarios detallan su aceptación y extensiones implementadas; **no añaden RF nuevos**. Una prueba indicada es criterio a comprobar, no resultado realizado.

### CU-01 — Comprar entradas y candy

**Actor:** cliente registrado o invitado. **Precondición:** función futura comercialmente habilitada, sala/película válidas y conexión.

1. Buscar/filtrar, abrir ficha y consultar reseñas/precio antes de elegir.
2. Seleccionar función y 1–8 butacas contiguas de misma fila/bloque.
3. Incorporar candy/combos opcionales.
4. Registrado usa identidad/perfil/edad, cupón y crédito autorizados; invitado contacto y conformidad etaria correspondiente.
5. Cotizar; revisar subtotal/descuento/crédito/neto y aceptar simulación.
6. Edge verifica actor, cotiza y renderiza; SQL confirma todo o rechaza.
7. Mostrar compra confirmada, PDF y QR único; cuenta obtiene movimientos/aviso.

**Postcondición:** asientos/stock/movimientos/documento de una misma compra consistentes. **Alternativas:** asiento ocupado, mantenimiento, edad, cupón, stock o precio cambiados → rechazo sin efectos parciales. Pérdida de respuesta → retry mismo pedido/solicitud, no otra compra. Invitado no recibe puntos ni crédito personal.

### CU-02 — Validar prestación

**Actor:** empleado, o administrador por su ruta operativa. **Precondición:** sesión/rol activo, función seleccionada, horario permitido, compra confirmada.

Escanear/ingresar mismo QR, seleccionar ingreso/candy, verificar función y estado, consumir solo esa prestación, mostrar resultado y auditar. Ingreso conjunto nuevo; candy conjunto e independiente. **Postcondición:** prestación usada no se admite de nuevo; QR agotado solo si todas las contratadas lo están. **Alternativas:** inexistente/usado/otra función/fuera de horario/cancelada → motivo de rechazo, sin consumir otra prestación.

El aviso de bandeja se conserva. Push RF-81 tiene outbox/triggers instalados sin duplicar ingreso por asiento y con candy independiente; requiere consentimiento y comprobar recepción real con registro designado. No cambia la decisión de consumo ni contiene QR.

### CU-03 — Cancelar compra propia

**Actor:** cliente registrado activo y titular. **Precondición:** mínimo dos horas antes y ninguna prestación usada.

Consultar detalle, aceptar condiciones, solicitar cancelación; servidor bloquea/revalida, genera crédito por total, revierte puntos originales y stock, libera entradas y notifica. **Postcondición:** constancia preservada, QR inutilizable, crédito personal reutilizable. Repetir genera una única compensación. **Alternativas:** otro titular, fuera de plazo, uso o invitado sin cuenta → rechazo, no borrado ni devolución monetaria.

### CU-04 — Administrar programación/mantenimiento

Crear función o lote con días/rango; sala automática sin superposición y limpieza. Mantenimiento por sala no altera tipo/ubicación. **Aceptación:** lote con fecha sin sala se revierte completo; bloqueo con una plaza comprometida rechaza todo; restaurar no cambia plano/precios. Reprogramación con compra vigente se rechaza sin cambiar documento.

### CU-05 — Baja recuperable

Administrador confirma Eliminar; solo después del éxito desaparece de Activos. Está en Eliminados recuperables; Restaurar conserva ID/ficha/historia. **Aceptación:** cancelar confirmación no llama servidor; fallo conserva fila/editor; sala/película comprometida se rechaza; repetir estado no duplica efecto comercial.

### CU-06 — Una reseña por película

Cuenta con ingreso usado guarda/edita estrellas/texto. Otra compra/función de la misma película precarga la misma opinión. **Aceptación:** una cuenta = un voto, archivo antiguo intacto, otra película independiente, otra cuenta no edita, sin ingreso no guarda, servidor anterior bloqueado por marcador, borrador conservado ante fallo.

### CU-07 — Beneficios y alertas

Canjear con puntos disponibles emite cupón personal unitario; uso se revalida en compra. Suscripción a próxima película produce aviso cuando existe venta efectiva, no por mera creación de función. **Aceptación:** retry no duplica canje, refresh fallido no cambia éxito; cron repetido no duplica aviso de película/cuenta; bajar suscripción no promete borrar avisos anteriores. Web Push usa consentimiento separado por cuenta/dispositivo; alta no reenvía avisos antiguos. Baja de dispositivo conserva alertas/bandeja.

**Aceptación Push local y remota:** consultar nunca pide permiso; activación explícita/no sesión/denegación; suscripción repetida idempotente y traspaso consentido entre cuentas; recordatorio en margen de quince minutos, solo compras anteriores a la hora prevista; cancelación/uso/perfil inactivo/baja de alerta invalida pendientes. Reintentos limitados, expiración 404/410, lease vieja no confirma. Click abre ficha pública o cuenta protegida, nunca QR/enlace portador/query arbitraria. Mensajes en tránsito pueden llegar tras baja y son mínimos. Tests locales no prueban recepción del SO ni aprobación del docente respecto a RF-79/80.

### Matriz de aceptación transversal

| Escenario                                        | Resultado esperado                                                   | Nivel pendiente para cierre integral                           |
| ------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| Dos conexiones compran misma butaca              | Solo una confirma; otra falla sin compra parcial.                    | Multiconexión Supabase con registros aprobados.                |
| Stock/cupón/crédito límite compartido            | No sobreventa ni saldo negativo por carrera.                         | Conexiones reales y pedidos designados.                        |
| Registered menor / checkbox invitado falsificado | SQL impide el primero y exige conformidad del segundo.               | Cuentas reales autorizadas y PDF restringido.                  |
| 7 días / día del estreno                         | Precio especial en ventana, regular desde estreno argentino.         | Frontera controlada servidor, no alterar reloj de navegador.   |
| QR mismo en ingreso/candy y repetición           | Consumo independiente; segundo uso de cada prestación falla.         | Compra dedicada sin consumir entradas ajenas.                  |
| Cancelación doble                                | Un crédito, reversión correcta, cupón no restituido, PDF conservado. | Compra futura específica con autorización.                     |
| Roles/inactivo/titular diferente                 | Ninguna lectura/escritura privada fuera de rol/titular.              | Matriz real de cuentas, sin cambiar roles indiscriminadamente. |
| Realtime cortado/reconectado                     | Reconsulta y respaldo; UI no garantiza asiento viejo.                | Navegadores/clientes reales.                                   |
| Offline catálogo / intento de compra             | Catálogo reciente disponible; privado/economía no cacheados.         | Hosting producción/PWA real.                                   |
| Reporte con descuento/crédito/cancelación/combos | Totales consistentes y exportaciones fieles al rango.                | Agregados remotos independientes y lectores PDF/XLSX.          |
| OAuth/correo/Push                                | Ida/vuelta real, permiso/entrega y baja correctos.                   | Proveedores, plantillas, HTTPS y emisor Push.                  |

## 7. Trazabilidad técnica

Rutas activas y tabla de contratos están en [arquitectura](arquitectura.md). Esta matriz conserva los conceptos académicos específicos del Word:

| Concepto              | Tipo y archivo en `src/app/`                                 | Aplicación y vínculo                                                              |
| --------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `duracion`            | Pipe, `shared/cine/pipes.ts`                                 | Minutos → h/min en catálogo/ficha; RF-01.                                         |
| `precioArs`           | Pipe, mismo archivo                                          | ARS en mapa/candy/reportes; RF-22/43.                                             |
| `edad`                | Pipe, mismo archivo; cálculo base en `shared/cine/reglas.ts` | Perfil/ficha; RN-14/11. Servidor revalida edad/segmento, no se autoriza por pipe. |
| `appHighlightButaca`  | Directiva, `shared/cine/directivas.ts`                       | Estados/resaltado del mapa; RF-17/18.                                             |
| `appRestrictEdad`     | Directiva, mismo archivo                                     | Bloqueo visual de función para menor; RF-27/RN-14, SQL autoritativo.              |
| Validator contigüidad | `butacasContiguas`, `shared/cine/reglas.ts`                  | Reactive Forms del mapa y validación servidor; RF-78/RN-15.                       |
| DER                   | Mermaid en `arquitectura.md`                                 | Modelo físico principal, complemento de §6 original.                              |
| Confirmación Edge/SQL | `supabase/functions/confirmar-compra/`, migrations           | RN-16; PDF preparado antes del commit, snapshot completo revalidado.              |

## 8. Ambigüedades y decisiones de alcance

| Punto                                             | Original / decisión actual / pendiente                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Versión del documento                             | Portada 3.2 y control/archivo 2.1 se conservan; no corregidos sin acuerdo.                                                            |
| Distribución administrable RF-15                  | Word describe plano fijo y edición de distribución. Usuario eligió mantenimiento sin editor libre; docente debe confirmar aceptación. |
| Reseña/cálculo promedio                           | Word no define unicidad ni ponderación. Usuario eligió una opinión por cuenta/película y archivo íntegro; no se atribuye al docente.  |
| Elegibilidad de reseña                            | Ingreso validado y 2000 caracteres son restricciones actuales adicionales, no literalidad RF-40.                                      |
| QR en Push                                        | RF-79/80 solicitan QR; usuario eligió e implementó aviso privado que abre cuenta. Falta aprobación docente y entrega real.            |
| Ratio puntos                                      | Vigente restaurado a 1/peso conforme Word; etapa 1/8 histórica se conserva sin recalcular.                                            |
| Protección de puntos cancelables                  | Extensión para evitar deuda de puntos; no regla textual adicional del original.                                                       |
| Próximamente                                      | «Próximas semanas» sin cantidad concreta; implementación muestra todas futuras activas.                                               |
| Segmentación mayor de 50                          | Parámetro mínimo 50 permite 50 cumplidos o más; aclarar si docente exige >50.                                                         |
| Semana/mes de vistas                              | Últimos siete días y mes actual, con fecha de validación. No consta semana calendario obligatoria.                                    |
| Cancelación invitada / reprogramación con compras | Compensación sin perfil y reemisión segura no implementadas; no borrar compras para aparentar cumplimiento.                           |
| Recibo/métricas                                   | Pago académico, no factura fiscal ni cobro en boletería. SMTP solo Auth; no añadir correo de entradas como requisito implícito.       |

La decisión técnica completa y consecuencias están en [decisiones técnicas](decisiones-tecnicas.md); plazos/fórmulas en [reglas](reglas-negocio.md).

## 9. Entregables, evidencias y cierre pendiente

### 9.1 Entregables originales §8

| Entregable                                | Estado conocido                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Documento de requerimientos               | Fuente original leída/preservada en respaldo y síntesis actual trazable.                                             |
| Aplicación funcional de todos los módulos | Circuitos centrales y backend Push existen; recepción/OAuth, catálogo remoto, RF-15 y pruebas externas impiden cierre completo. |
| URL pública accesible                     | https://cine-aurora.vercel.app — SPA/assets públicos y worker verificados, sin certificación integral. |
| Código publicado en GitHub                | Proyecto local con cambios sin commit/push al cierre conocido; publicación final no acreditada.                      |
| README de instalación/ejecución           | Presente, actualizado para estos cuatro documentos.                                                                  |
| Arquitectura documentada                  | `arquitectura.md`, capas/rutas/contratos/seguridad/operación.                                                        |
| DER                                       | Mermaid integrado en arquitectura; comprobar renderizado en entrega.                                                 |
| Decisiones técnicas                       | `decisiones-tecnicas.md`, alternativas/consecuencias y propuestas diferenciadas.                                     |

### 9.2 Evidencia disponible

Lectura del Word y 352 tests Angular/43 archivos como base. Estado actual: **390 Angular/45 archivos**, **40 SQL Push por variante (80 ejecuciones)**, **59 Deno Push + 22 Edge compra**, **32 worker Push**, **20 caché** y regresión de permisos/publicación. Activación posterior autorizada: claves/Edge/Vault/Cron, Auth/CORS, Vercel y cierre específico de grants; sin compras, consumos ni envíos a dispositivos.

Build actual: **534,53 kB**, aprobado con warnings previos de presupuesto/CommonJS. Interfaz Push: **48 combinaciones Chrome/Edge** con Auth/RPC/PushManager simulados y red externa bloqueada, sin violaciones AXE detectadas, overflow ni errores JS. Documentación: **51 enlaces/anclas**, IDs/85 prioridades contra Word y **33 respaldos SHA256** íntegros. Antecedentes de navegador, Excel y auditoría remota de lectura permanecen diferenciados. Detalles/comandos en [arquitectura, pruebas](arquitectura.md#10-pruebas-mantenimiento-y-pendientes). No se suman suites históricas como cobertura distinta ni se presentan mocks como recepción/concurrencia real o certificación WCAG.
