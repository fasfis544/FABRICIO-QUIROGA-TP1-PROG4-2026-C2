# Reglas del negocio — Cine Aurora

**Revisión:** 09/10/2026. Este documento reúne las **17 RN originales**, las reglas aplicadas en el sistema y sus principales límites. Para consultar los requisitos, la arquitectura y las decisiones del proyecto, ver [requerimientos](requerimientos.md), [arquitectura](arquitectura.md) y [decisiones técnicas](decisiones-tecnicas.md).

> El pago es académico simulado: no hay cobro real ni importe pendiente en boletería. Las reglas agregadas para completar el funcionamiento se indican como decisiones de implementación. La información histórica no se recalcula.

## 1. Glosario operativo

| Término           | Significado                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Película          | Ficha de catálogo con estreno, clasificación, géneros e imagen. No es una función.                                       |
| Función           | Proyección con película, sala, inicio, fin almacenado, idioma/formato y tarifa.                                          |
| Compra            | Pedido confirmado con butacas, candy opcional, descuentos/crédito y documento. Persiste en tabla legada `cine_reservas`. |
| Reserva pendiente | Estado histórico válido hasta `vence`; el checkout nuevo no lo crea como etapa de pago.                                  |
| Prestación        | Ingreso de asientos o retiro de candy; estados de uso independientes.                                                    |
| Crédito           | Saldo personal por compensación/cancelación; no es punto ni devolución monetaria.                                        |
| Puntos            | Fidelización no transferible; saldo total y saldo disponible pueden diferir.                                             |
| Canje             | Débito de puntos que emite código personal para una entrada/unidad de producto.                                          |
| Baja lógica       | Desactivación de catálogo sin DELETE de su registro o historia.                                                          |
| Opinión vigente   | Única reseña/calificación actual de una cuenta sobre una película.                                                       |
| Día comercial     | Fecha de Buenos Aires; no fecha arbitraria del dispositivo.                                                              |

## 2. RN originales y aplicación

| ID    | Regla original resumida fielmente                                                            | Aplicación / precisión                                                            |
| ----- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| RN-01 | Una butaca no puede venderse ni reservarse dos veces para la misma función.                  | Locks y unicidad parcial de entradas activas; selección UI no reserva.            |
| RN-02 | VIP siempre en últimas tres filas R/S/T.                                                     | Plano normativo generado, sin cambio arbitrario de tipo.                          |
| RN-03 | VIP debe costar más que normal, porcentaje o monto configurable.                             | Implementación por porcentaje positivo, hasta 500%; default 25%.                  |
| RN-04 | J y K son dos filas accesibles independientes, 2+10+2 cada una.                              | 14 plazas por fila, 28 accesibles totales.                                        |
| RN-05 | No se superponen funciones de una misma sala.                                                | Intervalos activos con limpieza; asignación/edición SQL.                          |
| RN-06 | Mínimo 30 minutos entre fin de proyección y siguiente inicio.                                | `fin` almacenado ya incluye esos 30 minutos.                                      |
| RN-07 | QR con estado independiente y único uso por prestación; agotado al usar todas.               | Un QR por compra, ingreso conjunto y candy separados.                             |
| RN-08 | Cancelación hasta dos horas antes genera crédito, nunca devolución directa.                  | Titular activo, ninguna prestación usada; plazo inclusivo revalidado en servidor. |
| RN-09 | Crédito combinable con otro medio en la misma compra.                                        | Resto abonado mediante simulación académica.                                      |
| RN-10 | Bienvenida 20% sobre primera compra, configurable en cualquier momento.                      | Cupón personal; consumo/primera compra no se reinician por cancelación.           |
| RN-11 | Cupón con vigencia y límite/segmento opcionales; fuera de condiciones no aplica.             | Servidor valida tiempo, mínimo, dueño, película, registro, edad y usos.           |
| RN-12 | Un punto por peso efectivamente abonado; no transferible.                                    | `floor(a_pagar)` para compras nuevas registradas; historia preservada.            |
| RN-13 | Preventa siete días antes, precio especial por película y luego regular.                     | Ventana civil argentina, precio especial opcional, VIP mantiene recargo.          |
| RN-14 | Registrado menor no compra +13/+18; entrada restringida lleva leyenda de adulto.             | Perfil/edad SQL; acompañamiento no levanta prohibición.                           |
| RN-15 | Butacas contiguas en la misma fila, validator custom en formulario.                          | Además mismo bloque, máximo ocho y sin repetidos.                                 |
| RN-16 | Compra atómica servidor/Edge: asientos, candy, cupón, crédito/puntos, PDF y QR; todo o nada. | Edge prepara, RPC SQL privada confirma/revalida en un commit.                     |
| RN-17 | Sesión activa para funcionalidades de rol; público/compra anónima exceptuados.               | Rol/activo en perfil, guard + controles backend.                                  |

Las RN mantienen la numeración original. Los límites de ocho butacas, un cupón por compra, la condición de ingreso para reseñar y la protección de puntos cancelables son restricciones de implementación.

## 3. Catálogo, estreno y baja recuperable

### 3.1 Películas vs. Próximamente

Solo fichas **activas** aparecen en catálogo público. La sección se deriva de `fecha_estreno`:

- **Películas:** estreno hoy o anterior.
- **Próximamente:** estreno posterior a hoy.
- Al llegar la fecha argentina del estreno cambia automáticamente la sección; no se crea una nueva película ni se modifica la fila por Cron.
- Inicio muestra máximo **cuatro** películas ya estrenadas según orden del catálogo por título. No prioriza automáticamente las recién estrenadas. El resto está en «Ver todas».
- Ranking inicial independiente: hasta tres películas con ventas positivas, orden por entradas vendidas y desempate por título. **Vendidas no equivale a vistas.**

Alta: administrador → Películas → Nueva película; título/slug/sinopsis/duración/clasificación/fecha/géneros/afiche, estado activo. Fecha futura la ubica en Próximamente; fecha actual/pasada en Películas. Crear ficha no programa funciones ni garantiza venta.

El documento dice «próximas semanas», pero no fija una cantidad. Por eso el catálogo no aplica un límite de semanas. Las clasificaciones nuevas son ATP/13/18; valores antiguos como 16 se conservan en la historia y deben elegirse de forma explícita al editar.

### 3.2 Filtros

Búsqueda por título y filtros de género/clasificación/idioma/formato. Si se combinan idioma y formato, ambos deben existir **en la misma función activa futura de una sala activa**. No combinar «subtitulada» de una función con «3D» de otra para afirmar que existe subtitulada 3D. Contratos viejos sin pares verificables no habilitan esa combinación como si fuera segura.

### 3.3 Eliminar y restaurar

Películas, salas, géneros, productos, combos, cupones y recompensas usan baja lógica. Lista administrativa por defecto **Activos**, luego **Eliminados (recuperables)** o **Todos**. Eliminar pide confirmación; solo se oculta tras éxito servidor; Restaurar reactiva el mismo ID.

La operación específica de estado no regraba ficha, precio, stock, imagen, vigencia o composición y no reconstruye sala. Pueden ejecutarse timestamps/eventos/auditoría existentes. Un reintento con el mismo estado no cambia nuevamente el negocio.

Película/sala no se puede eliminar con compras confirmadas o pendientes válidas en funciones cuyo `fin` aún no pasó. Se usa fin con limpieza como frontera conservadora. No es cancelación de función ni compensación económica: esos procedimientos son separados.

Restaurar no renueva cupón vencido, no repone stock, no reactiva compras canceladas y no promete venta si sala/función/componentes están inactivos. Desactivar género conserva asociaciones previas; una película nueva no puede asociarse a género inactivo. La baja no autoriza borrar archivos Storage referenciados.

## 4. Salas, butacas y programación

### 4.1 Plano uniforme

| Grupo             | Filas          |             Plazas por fila |   Total |
| ----------------- | -------------- | --------------------------: | ------: |
| Accesibles        | J, K           |                 14 (2+10+2) |      28 |
| VIP               | R, S, T        |                 28 (4+20+4) |      84 |
| Normales          | Otras 15 filas |                 28 (4+20+4) |     420 |
| **Sala completa** | **A–T**        | Tres bloques y dos pasillos | **532** |

Los números son asientos, no posiciones transitables de pasillo. J/K numeran 1–14; demás 1–28. Un pasillo separa bloques y corta contigüidad aunque dos números sean consecutivos.

Sala nueva nace adaptada. Sala antigua se adapta explícitamente solo sin compras/reservas vigentes protegidas; no se cambian entradas existentes. Sala no adaptada no admite nuevas ventas. No hay editor libre de filas/columnas/tipos: esa elección de mantenimiento requiere aceptación docente para RF-15.

### 4.2 Selección y mantenimiento

Una compra elige **1–8 butacas existentes, distintas, consecutivas, de la misma fila y bloque**. Ejemplos estándar: A1–A4 válidas; A4+A5 inválidas por pasillo. En J: J2+J3 inválidas, J3–J12 comparten bloque central pero diez asientos exceden máximo por compra.

Butaca ocupada/reservada válida o bloqueada no se elige. El mantenimiento es por `(sala,código)`, se mantiene hasta restauración explícita y afecta todas las funciones de sala. Motivo de 5–500 caracteres, lotes sin duplicados de 1–532 plazas. Si el bloqueo toca una entrada activa comprometida en función futura/en curso, se rechaza **todo el lote**. No desplaza compradores ni cancela prestaciones.

### 4.3 Funciones

- Inicio futuro, película activa y estreno no posterior al día de esa función.
- Idioma castellano/subtitulada y formato 2D/3D/4D/5D por función; los valores de ficha son defaults, no reemplazan modalidades reales.
- Sala automática entre activas/adaptadas, disponible todo el intervalo de proyección + limpieza. Precio normal positivo y recargo VIP >0 hasta 500%.
- `fin=inicio+(duración+30 min)`. Una proyección 18:00 de 90 min termina 19:30; `fin=20:00`; siguiente función puede iniciar 20:00, no 19:45.
- Cambiar duración protege funciones en curso y compras/reservas futuras; si permitido, recalcula fin de funciones futuras activas y rechaza superposición de forma atómica.
- Cambiar idioma/formato con compras/reservas vigentes se bloquea. Cambiar precio no altera recibos ya emitidos.
- Reprogramar requiere futuro y motivo 5–500; con compras/reservas vigentes se bloquea para no dejar documentos incorrectos. Sin compromisos, prioriza sala previa si disponible.
- Lote por rango inclusivo de fechas de hasta **90 días**, días ISO 1=lunes a 7=domingo, horario argentino; si cualquier fecha falla, no se guarda ninguna. Misma solicitud/pedido recupera mismo lote.
- Cancelación administrativa de función futura es distinta de cancelar compra propia. Compensa registrados y revierte stock/puntos si es viable; compra invitada, prestación utilizada o puntos consumidos insuficientes bloquean lote completo hasta resolución aparte.

## 5. Identidad, edad y compra

### 5.1 Registro y acceso

Registro académico exige email, nombre/apellido, fecha de nacimiento, grupo sanguíneo, ojos y vacaciones anuales, más contraseña Auth. Nombre/apellido hasta 100; nacimiento válido desde 1900 y no futuro; grupo A±/B±/AB±/O±; ojos no vacío hasta 40; vacaciones entero 0–365.

Datos sanguíneos/ojos/vacaciones se incluyen por consigna y requieren revisión de minimización antes de uso real. Nacimiento declarado no es verificación documental de identidad. OAuth/cuentas previas completan datos faltantes antes de compra, sin defaults ficticios.

Cliente, empleado y administrador pueden comprar como cuenta activa; no comparten automáticamente permisos de backoffice. Metadata nunca cambia rol. No se crean cuentas invitadas Auth: la compra invitada permite correo indispensable y conformidad de edad cuando corresponde, sin beneficios de cuenta; nombre opcional en su presentación.

### 5.2 Edad y acompañamiento

Edad cumplida según fecha argentina; registrado menor no cotiza/compra clasificación 13 o 18 aunque marque un checkbox. ATP no tiene esa restricción. Invitado confirma explícitamente edad mínima en película restringida; no se inventa fecha de nacimiento.

Todas las entradas restringidas incluyen leyenda de asistencia acompañada por adulto, incluso para comprador mayor. Acompañamiento no habilita al registrado menor: son condiciones distintas pedidas por el original.

### 5.3 Confirmación

Carrito local no bloquea asiento ni garantiza disponibilidad; mapa informa estado actual y cotización se revalida al confirmar. Candy opcional, máximo 30 líneas de producto/combo, cantidades enteras 1–20 y sin líneas duplicadas del mismo tipo/ID.

Se exige aceptar simulación; no existe cobro real ni paso de pago del empleado. Compra nueva se crea confirmada con QR/PDF/snapshot en un único commit. Fallo de cualquier componente revierte escritura. Reintento usa misma solicitud y mismo pedido, no otro UUID; una solicitud reutilizada para otro contenido/titular se rechaza.

Estados visibles: confirmada, cancelada y pendiente/vencida de compras históricas. Vencida puede ser estado derivado de pendiente cuyo plazo expiró; no exige reescribir el registro. Pendientes antiguos no habilitan pago presencial retirado.

## 6. Precios, preventa, candy y combos

### 6.1 Tarifas

Importes comerciales en ARS, precisión monetaria de dos decimales. Normal usa tarifa de función o precio especial vigente. VIP multiplica tarifa normal por `1+porcentaje/100` y redondea a dos decimales. Accesible no recibe recargo VIP por pertenecer a J/K.

Preventa: desde **estreno−7 días hasta estreno−1**, inclusive por fecha argentina, requiere precio especial por película. Antes de ventana o sin especial, no vende futura. Desde estreno usa tarifa regular de cada función automáticamente; no requiere modificar el precio especial guardado.

Ejemplo estreno 15/10: precio especial aplicable 08–14/10; el 15/10 regular. Función debe estar programada, activa y en sala apta: una ficha futura visible no significa venta habilitada.

### 6.2 Stock y combos

Stock individual no negativo; combos agrupan componentes y cantidades multiplicadas por unidades. Servidor suma consumo del producto comprado suelto y dentro de combos; considera pendientes históricos vigentes, revalida y descuenta al confirmar. Desactivar un componente puede volver no comprable el combo aunque su ficha aparezca activa.

Combo con entrada tiene precio fijo y sustituye **una tarifa normal de una butaca ya elegida por unidad**. No crea una entrada extra ni cubre todas las butacas. No se aceptan más unidades de combo con entrada que asientos; VIP mantiene recargo.

Ejemplo: 2 entradas normales de $5.000 + combo con entrada de $7.000 → subtotal $12.000: `10.000+7.000−5.000`, antes de cupón/crédito. Con VIP, se conserva su diferencia sobre tarifa normal. Los nombres/componentes de emisión quedan preservados en el recibo.

## 7. Cupones, crédito, puntos y canjes

### 7.1 Secuencia de cálculo

```text
subtotal = suma de entradas + candy/combos − tarifas normales sustituidas por combos
descuento = beneficio de un único cupón válido
total = máximo(0, subtotal − descuento)
a_pagar = total − crédito_aplicado
puntos_nuevos = cuenta registrada ? floor(a_pagar) : 0
```

`total` es neto después de descuento, **incluye la parte pagada con crédito**. `a_pagar` es únicamente resto de simulación y base de puntos. Ningún total del navegador tiene autoridad sobre el cálculo final.

### 7.2 Cupón

Una compra aplica **un solo cupón**: bienvenida, promoción o canje. No acumular códigos. Código normalizado trim/mayúsculas. Vigencia Desde incluida/Hasta excluida; activo; mínimo de subtotal; película/usuario/solo registrado/edad mínima opcionales; límite positivo o sin límite.

Edad mínima 50 significa **50 años cumplidos o más** en esta implementación; el ejemplo «mayores de 50» del original no se traduce automáticamente a >50. Cupón personal no es transferible. Monto fijo se limita al subtotal, nunca genera total negativo. Porcentaje 1–100.

Bienvenida crea código personal con 20% inicial y un uso para primera compra. Administrador puede cambiar porcentaje; se actualizan cupones de bienvenida según configuración. Compra confirmada previa, incluso posteriormente cancelada conforme al registro histórico, impide volver a ser primera compra. Cancelar no devuelve uso del cupón ni condición de bienvenida.

### 7.3 Crédito y puntos

Crédito aplicado ≥0, dos decimales, no mayor a neto de compra ni saldo disponible. Invitado no tiene crédito. Crédito y puntos se calculan sumando movimientos, no editando un saldo desde UI.

**Vigente:** 1 punto por peso neto efectivamente simulado; fracciones se truncan. Ejemplo subtotal $10.000, cupón $2.000, crédito $3.000 → total $8.000, `a_pagar=$5.000`, **5.000 puntos**. `a_pagar=$123,90` → 123 puntos; compra gratis/invitada → cero.

Históricamente existió tasa 1/8: sus compras/movimientos/canjes permanecen con valores originales. No repetir esa migración ni recalcular saldos. Puntos no se transfieren ni sustituyen crédito.

**Protección adicional:** puntos de compras cuyo inicio aún permite cancelación (inicio ≥ ahora+2 h) figuran acreditados pero se restan de puntos disponibles para canje. Esto evita deuda al cancelar. También se descuenta crédito comprometido por pendientes históricos válidos. La UI muestra ambos saldos; un fallo de recarga no autoriza usar el saldo anterior.

### 7.4 Canje

Cuenta activa, recompensa activa/vigente, costo positivo configurable y puntos disponibles suficientes. Canje debita puntos y emite cupón personal de un uso en una transacción idempotente.

- Entrada: cubre **una entrada elegida** (servidor toma la de mayor precio), no toda la compra. No combinable con combo que incluya entrada.
- Producto: cubre **una unidad del producto individual** incluido en pedido, no un combo ni todas las unidades.
- Stock de producto se comprueba al usar el código/confirmar compra; canjear no reserva stock automáticamente.
- Premios viejos de porcentaje mantienen su promesa para canjes emitidos; recompensas antiguas no se convierten silenciosamente a una entrada/producto.
- Si canje ya terminó pero falla refresh, informar éxito y actualizar; no repetir para «arreglar» una lectura.

## 8. QR y prestaciones

Un código nuevo `qr_compra` por compra, distinto del token secreto del enlace. Operador activo empleado/admin selecciona función y prestación; código ajeno a función se rechaza. Escaneo/manual dan el mismo resultado de negocio.

Ventana servidor: desde **30 minutos antes de inicio hasta fin de proyección**, usando `fin−30 min`, **ambos extremos incluidos**. No validar después de ese límite durante limpieza. Función activa y compra confirmada necesarias. Es una restricción operativa del código, no un plazo escrito en RN-07.

| Ingreso  | Candy contratado | Candy usado | Estado del conjunto                            |
| -------- | ---------------- | ----------- | ---------------------------------------------- |
| No usado | No               | No aplica   | Ingreso pendiente.                             |
| Usado    | No               | No aplica   | Todas las prestaciones contratadas consumidas. |
| No usado | Sí               | No          | Ambas pendientes.                              |
| Usado    | Sí               | No          | Solo candy pendiente.                          |
| No usado | Sí               | Sí          | Solo ingreso pendiente.                        |
| Usado    | Sí               | Sí          | QR totalmente utilizado.                       |

Ingreso nuevo consume todas las butacas juntas; no hay ingreso fraccionado por persona. Candy consume pedido completo. Ninguno consume el otro. Segundo uso rechazado. Código histórico parcialmente usado autoriza solo plazas restantes, sin admitir otra vez un código de asiento ya utilizado. Resultados se auditan y cuenta recibe aviso interno. Push instalado encola ingreso por compra, no por asiento, y candy independiente, solo con dispositivo consentido; backend activo, recepción real pendiente. Envío/reintento no consume otra prestación.

Comprobante cancelado puede conservar PDF como constancia, pero no habilita prestaciones. No publicar códigos ni bearer links para probar; son secretos de acceso.

## 9. Cancelación y compensaciones

Compra propia de cuenta activa, ninguna entrada/candy utilizados, al menos dos horas antes inclusive, tiempo revalidado tras locks. Invitado no tiene cancelación por perfil/crédito personal; su compensación requiere circuito separado que hoy no está implementado.

Confirmada elegible:

1. Se agrega **`total`** como crédito: restaura la porción previamente pagada con crédito y convierte la parte simulada nueva en saldo.
2. Se revierten exactamente `puntos` de esa compra, no una tasa recalculada.
3. Se repone stock de componentes consumidos.
4. Se marca cancelada, entradas inactivas y prestaciones no utilizables.
5. Se conserva PDF/snapshot y se notifica. Repetición no duplica efectos.

Ejemplo anterior total $8.000 con $3.000 de crédito: el commit había debitado $3.000; al cancelar agrega $8.000. Comparado con saldo anterior a comprar, el incremento neto es $5.000, sin devolver dinero real. Cupón/primera compra no se restauran.

No forzar una cancelación fuera de plazo ni borrar filas para liberar asiento. Cancelación administrativa de función tiene controles propios y no evita resolver invitados/uso/puntos comprometidos.

## 10. Reseñas, historial y alertas

### 10.1 Opinión única

Decisión explícita del usuario posterior a revisar RF-40–42, que **no definen unicidad/ponderación**:

- Una reseña/calificación editable por **cuenta y película**, aunque compre varias funciones o varias veces la misma función.
- 1–5 estrellas; comentario trim de 1–2000 caracteres. Este límite es de implementación, no una definición docente de «corto».
- Guardar/editar requiere compra propia confirmada y algún ingreso utilizado; candy solo no habilita opinión. Desde compra sin ingreso puede leer opinión ya existente, no editar.
- Cada cuenta aporta una sola calificación al promedio de esa película; redondeo a una decimal. Sin opiniones devuelve cero y lista vacía, UI explica que aún no hay reseñas.
- Todas las originales por compra se conservan; la de mayor fecha de creación/UUID inicia opinión vigente. Ediciones viejas no tenían timestamp y no se inventa cronología.
- Antiguas adicionales dejan de figurar/votar públicamente, permanecen en archivo; nueva edición no reescribe originales ni guarda todas las versiones futuras.
- Último guardado exitoso prevalece si dos pestañas editan. No se ha probado concurrencia remota multiconexión.
- Si backend no devuelve marcador nuevo o falta texto de opinión existente, editor se bloquea para no duplicar/sobrescribir.

«Mis películas» usa compras con ingreso validado, póster/fecha y calificación vigente. Conserva los eventos de asistencia y las compras repetidas aunque exista una sola opinión por película. El archivo SQL incluye un lector privado; la verificación remota independiente todavía está pendiente.

### 10.2 Alertas de venta

Suscripción cuenta/película revocable. Habilitación **efectiva** requiere ficha/clasificación válidas, función activa futura, modalidad válida, sala activa/adaptada, ventana comercial y al menos una plaza libre no bloqueada/comprometida.

Backend registra primera apertura por película y crea aviso deduplicado por cuenta/película; usuario activo y venta efectiva al procesar. Triggers y Cron cada minuto cubren cambios/cruce de fecha. Desuscribir elimina suscripción, no borra avisos históricos. No se manda un nuevo aviso cada vez que se reactiva esa misma película.

Bandeja separa Nuevas/Leídas y muestra fecha argentina; marcar propia como leída es distinto de eliminar suscripción. `cine_mis_beneficios` materializa alertas además de consultar: **no es RPC puramente de lectura ni endpoint cacheable**. SMTP sigue solo Auth.

**Web Push backend activo, recepción real pendiente:** consentir por cuenta/dispositivo es independiente de la alerta por película. Alta no reenvía avisos históricos; baja conserva bandeja/alertas. Aviso de venta requiere disponibilidad efectiva y alerta vigente; ingreso/candy son eventos nuevos. Invitados/sin consentimiento no reciben Push. Recordatorios 24 h/2 h solo si compra ya existía al llegar la hora prevista, función activa y entrada pendiente; margen de recuperación `[hora, hora + 15 min)`. Cancelación/uso/baja/perfil inactivo o cambio de inicio invalida entregas antes de enviar. Retry respeta vencimiento y máximo seis intentos. Aviso no incorpora QR, sala, horario ni enlaces secretos: abre cuenta para consultarlos (venta abre ficha pública). Elección de privacidad aprobada por usuario, no todavía por docente frente al texto RF-79/80. Un mensaje ya enviado puede llegar después de la baja; no garantiza recepción exactamente una vez.

## 11. Reportes, auditoría y preservación

Reportes administrativos: rango válido hasta 366 días, Desde incluido/Hasta excluido, agrupación diaria argentina. Compras confirmadas no canceladas; neto simulado separado de crédito. Entrada vendida se cuenta por compra, película vista por fecha de uso, candy por unidades de componentes incluidos combos.

«Últimos 7 días» es ventana móvil, no necesariamente semana calendario; «Mes actual» desde primer día hasta instante de consulta. Word no define otra frontera. Reportes no son factura fiscal ni contabilidad de cobro real. Importes de entradas no son reparto exacto de descuentos/combos entre películas/productos.

Auditoría registra actor/acción/fecha desde backend, visor administrativo de metadatos. Puede contener snapshots privados sensibles en historia; queda minimización pendiente, no autorización para borrar evidencia. La baja de ficha, cambio de precio o nueva reseña no altera compras/documentos/movimientos antiguos.

## 12. Estado y comprobaciones

- Plano, compra, descuentos, puntos, crédito, QR, mantenimiento, baja y reseña única tienen controles SQL y regresiones locales.
- Hasta `20261015000300`: instalación observada remotamente en auditoría previa. `20261016000200`/003: instalación confirmada por usuario, sin verificación independiente posterior. No repetir migraciones ni aplicar lector 001 después de 003.
- Pruebas actuales: 352 Angular, SQL en dos variantes, 20 casos de caché; antecedentes Deno/navegador con alcance local. Detalle/comandos en [arquitectura](arquitectura.md).
- HTTPS y backend Push activados; faltan registros designados para recorridos, concurrencia real, OAuth, recepción en dispositivo y aceptación docente. Una regla escrita, un mock o un lote vacío HTTP 200 no demuestra cumplimiento completo.
