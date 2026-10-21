# Defensa del código — Cine Aurora

Guía central para justificar la implementación ante el profesor.
Fabricio Quiroga · Programación IV · Comisión 141 · Docente: Ricardo Gastón Plazas.

## 1. Qué construí y qué debo poder explicar

Cine Aurora es una aplicación web de un cine con varias salas. Angular implementa las pantallas y Supabase aporta autenticación, PostgreSQL, almacenamiento, Realtime y funciones Edge. El recorrido principal es elegir película y función, seleccionar butacas, agregar candy y confirmar una compra con pago académico simulado. También hay cuenta del cliente, validación del empleado y administración.

Para defender el proyecto no hace falta memorizar cada archivo: hace falta seguir un dato desde la pantalla hasta su persistencia y explicar por qué cada control está en esa capa. Esta guía reemplaza el inventario exhaustivo por ese recorrido, fragmentos reales y decisiones justificadas.

### Presentación oral de un minuto

“Organicé el frontend por responsabilidades: infraestructura común, acceso a datos, funcionalidades y piezas compartidas. Los componentes manejan la interacción y los servicios encapsulan los contratos con Supabase. El navegador orienta al usuario, pero las reglas críticas se ejecutan en el servidor. En la compra, una Edge Function verifica el pedido y prepara el comprobante; una RPC PostgreSQL confirma toda la operación de forma atómica. Así evito ventas parciales y duplicaciones al reintentar. El QR permite consumir ingreso y candy por separado. El pago es simulado y la PWA sólo permite consultar cartelera pública offline.”

### Cuatro distinciones de negocio

- **Película / función:** la película es la ficha; la función añade sala, inicio, idioma, formato y condiciones de venta. Se compra para una función concreta.
- **Carrito / compra:** el carrito es selección temporal en memoria; la compra existe después de confirmarse en PostgreSQL. El nombre histórico `reservar` no significa reserva para pagar luego en boletería.
- **Venta / vista:** una entrada vendida no demuestra asistencia. El ingreso validado habilita “Mis películas” y la reseña; por eso ventas y vistas pueden dar cifras diferentes.
- **Crédito / puntos / cupón:** crédito es saldo monetario interno de compensación; puntos son fidelización; cupón aplica un descuento sujeto a condiciones.

## 2. Arquitectura: dónde empieza y cómo llega a los datos

### Organización que conviene justificar

- `src/app/core`: cliente Supabase, sesión, Auth, guards, red y otros mecanismos transversales. Evita repetir infraestructura en cada pantalla.
- `src/app/data-access`: modelos, consultas y parsers. Traduce contratos externos a datos utilizables por Angular.
- `src/app/features`: pantallas y casos de uso: cartelera, compra, perfil, empleados y administración.
- `src/app/shared`: validadores, pipes, directivas, QR y exportaciones reutilizables.

**Justificación:** separar UI, comunicación y reglas compartidas permite cambiar un contrato sin reescribir todas las vistas y probar una regla sin abrir la aplicación completa. No es una separación perfecta: algunas pantallas administrativas todavía consultan Supabase directamente. Un refactor razonable sería llevar esas consultas a servicios, no reescribir todo por estética.

### Recorrido del arranque

1. `src/index.html` contiene el elemento raíz `app-root` y los metadatos del documento.
2. `src/main.ts` llama a `bootstrapApplication(App, appConfig)`.
3. `src/app/app.config.ts` registra router, estrategia de reutilización, manejo global de errores y worker de producción.
4. `src/app/app.ts` representa la estructura general; `router-outlet` muestra el componente de la ruta actual.
5. `src/app/app.routes.ts` distribuye las áreas y aplica guards a cuenta, empleados y administración.

Se usa Angular **standalone**: los componentes declaran sus dependencias de plantilla en `imports`; no se necesita un `AppModule` de arranque. `inject(Servicio)` pide una dependencia a Angular, no construye manualmente otra instancia ni hace una llamada HTTP.

### Rutas y carga diferida

`loadChildren` carga listas de rutas cuando se necesitan; `loadComponent` carga un componente. El `import()` dinámico devuelve una Promise y permite separar el JavaScript en chunks. También se cargan a demanda bibliotecas como el escáner y los exportadores.

**Por qué:** no tiene sentido exigir las herramientas administrativas o la cámara a quien sólo abre la cartelera. La aplicación sigue siendo una SPA: cambia vistas sin cargar otro documento HTML en cada navegación, pero sí solicita datos al backend.

`src/app/core/routing/ruta-identidad.strategy.ts` evita reutilizar una pantalla cuando cambia su parámetro de identidad. Si una vista leyó `funcionId` mediante `snapshot`, navegar de A a B debe crear otra instancia; cambiar sólo query params puede conservarla. Esto impide mostrar datos de la función anterior.

### Frontera entre frontend y backend

Recorrido habitual: **componente → servicio → Supabase → función SQL → parser → estado → plantilla**.

- Una **RPC** llama una función de PostgreSQL, por ejemplo `cine_cotizar`.
- Una **Edge Function** ejecuta código backend TypeScript, por ejemplo `confirmar-compra`.
- Las migraciones de `supabase/migrations` definen tablas, restricciones, permisos y evolución de reglas.

`src` no contiene todo el backend. La compra se entiende leyendo también `supabase/functions/confirmar-compra/handler.ts` y las definiciones SQL vigentes. Varias migraciones pueden reemplazar una función: la primera definición no necesariamente describe el comportamiento actual.

## 3. Estado, formularios y sintaxis que uso de verdad

### Signals y estado derivado

`signal(valor)` mantiene estado reactivo: se lee con `estado()`, se reemplaza con `set` y se modifica a partir del anterior con `update`. `computed` deriva otro valor de las señales que lee. Por ejemplo, el pedido del checkout se calcula desde carrito y formulario:

{{fragmento:pedido}}

**Cómo explicar el fragmento:** `computed<PedidoCheckout>` tipa el resultado; `this.id` fija la función; las lecturas del carrito y `datos()` son dependencias reactivas. `trim()` limpia espacios del cupón; `?? 0` usa cero sólo ante `null` o `undefined`. Si cambia una dependencia, Angular vuelve a calcular el pedido.

**Justificación:** no guardo un segundo pedido manual que pueda quedar desincronizado de la selección. Servicios con signals alcanzan para el estado compartido de este alcance; agregar un store externo no era imprescindible. Estas señales no guardan por sí mismas en base ni sobreviven automáticamente a una recarga.

`readonly` impide reasignar la propiedad, no impide `signal.set()`. Para listas se usa otra referencia, por ejemplo `[...butacas]`: es una copia superficial. `asReadonly()` expone lectura sin ofrecer `set/update` al consumidor. `effect` se reserva para efectos secundarios y `linkedSignal` para estado editable que se reinicia al cambiar su fuente.

### Formularios: experiencia rápida, no autorización

Hay dos APIs en el proyecto:

- **Reactive Forms:** `FormControl`, `FormGroup` y validators, empleados en el plano y editores. Un validator devuelve `null` si el valor es válido o un objeto de errores si no lo es.
- **Signal Forms:** `form(datos, esquema)` y `FormField`, utilizados en checkout y otros flujos. Reglas como `required`, `email`, `min` y `max` producen estado de campo y mensajes reactivos.

No se unificaron mediante una migración masiva: Reactive Forms conserva el custom validator exigido por RF-78 y Signal Forms integra otros formularios con su estado reactivo. Se bloquea el envío durante la operación y los datos se limpian tras el éxito, no ante un rechazo que el usuario todavía debe corregir.

### Plantillas, componentes, directivas y pipes

- `{{ expresion }}` muestra texto escapado; `[disabled]` enlaza una propiedad; `(click)` llama un manejador; `$event` contiene el evento recibido.
- `@if` muestra un bloque condicional; `@for (...; track b.codigo)` recorre con identidad estable. Distinguir cargando, error y vacío evita presentar un fallo como “no hay datos”.
- Un **componente** tiene vista propia; una **directiva** añade comportamiento a un elemento; un **pipe** transforma presentación, por ejemplo `precioArs` para moneda.
- `@Component` describe la vista. El Angular instalado usa `@Service()` con autoaprovisionamiento; el cliente Supabase también usa `@Injectable({ providedIn: 'root' })`.

El pipe de edad o la directiva que deshabilita una opción ayudan a la UI: no garantizan que un comprador cumpla la regla en el servidor. Los estilos globales y SCSS de componentes organizan presentación, no integridad de datos. Etiquetas, foco visible y mensajes `role="alert"`/`role="status"` permiten operar sin depender únicamente del color.

### Tipos y datos que vienen de la red

Una `interface` describe una forma durante la compilación; no comprueba el JSON recibido. `as Tipo` tampoco lo valida. Por eso los servicios reciben datos como `unknown` y aplican parsers antes de utilizarlos:

{{fragmento:numero}}

**Cómo explicar el fragmento:** se admite número o cadena numérica no vacía; `Number.isFinite` rechaza `NaN` e infinito. Ausencia, `null` o cadena vacía no se convierten silenciosamente en cero. Si falta un saldo, mostrar cero podría ocultar una respuesta rota.

Operadores centrales: `?.` evita acceder sobre nulo; `??` conserva cero/false válidos, a diferencia de `||`; `===` compara sin coerción; `...` copia o combina propiedades; `{ data, error }` desestructura la respuesta. `private` restringe acceso desde TypeScript y no transforma un valor enviado al navegador en secreto.

### Asincronía y limpieza

`async` devuelve una Promise; `await` espera su resultado sin bloquear todo el navegador. `try/catch/finally` permite mostrar el error y siempre restablecer `ocupado`. `Promise.all` coordina consultas independientes, pero **no crea una transacción de base de datos**.

`DestroyRef` limpia timers, suscripciones y cámara al salir. Las revisiones de carga descartan respuestas viejas; no equivalen necesariamente a cancelar la petición HTTP. Esto importa si la respuesta de A llega después de haber empezado a mostrar B.

## 4. Sesión y permisos: quién sos y qué podés hacer

### Responsabilidades separadas

`src/app/core/auth/auth.service.ts` coordina el SDK: restaura sesión, inicia/cierra sesión y consulta perfil. `src/app/core/auth/sesion.service.ts` expone el estado reactivo que consumen las vistas.

El SDK aporta identidad; el perfil activo y su rol determinan las capacidades. El estado local exige además que perfil y usuario correspondan:

{{fragmento:sesion}}

**Cómo explicar el fragmento:** `&&` exige todas las condiciones; `=== true` no acepta una cadena como permiso; la comparación de IDs impide combinar el usuario nuevo con el perfil anterior. El rol se deriva de un estado válido, no de metadata que el usuario pueda editar.

### El guard no es la barrera de seguridad final

{{fragmento:guard}}

**Cómo explicar el fragmento:** `...permitidos` es un parámetro rest con los roles admitidos. La función externa devuelve un guard asíncrono; refresca el perfil y devuelve `true` o un `UrlTree` de redirección. Si no está autenticado conserva `returnUrl`; si tiene otro rol envía a “sin permiso”.

**Justificación:** el guard evita navegación improcedente y permisos viejos en la interfaz. Pero se puede saltar Angular y enviar HTTP manualmente. Por eso RLS restringe filas, los grants restringen operaciones y las RPC privilegiadas verifican rol/titularidad internamente. Ocultar un botón no autoriza una escritura.

Las funciones `SECURITY DEFINER` ejecutan con permisos de su propietario: requieren permisos cerrados, `search_path` controlado y validaciones internas. La clave pública del frontend es visible por diseño; `service_role` y claves privadas deben permanecer en backend. CORS limita orígenes de navegador, no sustituye autenticación.

### Problema real resuelto: respuestas Auth fuera de orden

Consultar perfil dentro del callback `onAuthStateChange` puede retener el lock del SDK. `programarSincronizacion` separa la consulta con `setTimeout(..., 0)` e incrementa una revisión. `cargarPerfil` sólo aplica el resultado si esa revisión sigue vigente; `esperarSincronizacion` espera la tarea actual.

**Qué evita:** una consulta lenta no restaura permisos de una sesión anterior después de logout. Si falla el perfil no se otorga un rol por defecto. Se eligió control de vigencia en lugar de confiar en el orden de llegada de las Promises.

## 5. Flujo central: de elegir butacas a confirmar la compra

### Paso 1: película y función

`PeliculasService` consulta el catálogo; las pantallas filtran y muestran funciones. Idioma y formato deben pertenecer a la **misma función**: castellano/3D y subtitulada/2D no implican subtitulada/3D. `coincideModalidad` comprueba pares cuando existen; sin pares usa valores de la ficha, por lo que filtrar no demuestra que exista una función comprable.

La preventa se presenta dentro de los siete días previos al estreno cuando hay precio especial. Desde el estreno se utiliza tarifa regular. La UI anticipa estas condiciones; SQL decide si la venta sigue habilitada.

### Paso 2: disponibilidad y contigüidad

`src/app/features/cine/reserva.component.ts` obtiene plano, ocupación y precios mediante `OperacionesService.disponibilidad`. El plano normativo tiene 532 plazas: 18 filas de 28 y J/K de 14; R/S/T son VIP y J/K accesibles. Está dividido en bloques por pasillos.

La selección debe contener 1–8 butacas existentes, sin duplicados, de una misma fila y bloque, sin huecos. El tramo central de `butacasContiguas` es:

{{fragmento:contiguidad}}

**Cómo explicar el fragmento:** primero se rechazan códigos inexistentes y repetidos. El predicado `b is Butaca` informa a TypeScript que quedaron butacas definidas. Dos `Set` comprueban fila y bloque únicos. Finalmente, máximo − mínimo + 1 igual a cantidad demuestra que no hay huecos. Devuelve `null` o `{ contiguas: true }`.

En ese algoritmo, `map` transforma cada código en su butaca, `find` busca en el plano, `some` detecta si alguna búsqueda falló y `filter` descarta `undefined`. `Set` elimina repetidos y permite contar cuántas filas o bloques diferentes quedaron.

Ejemplos: A1+A2 es válida; A1+A3 deja hueco; A4+A5 cruza pasillo aunque los números sean consecutivos. En J, J2+J3 también cambia de bloque. Comprobar sólo diferencia de columnas sería insuficiente.

El validator está conectado al formulario, no sólo declarado:

{{fragmento:control}}

`nonNullable` evita que reset produzca `null`; el callback obtiene el plano actual al validar. La plantilla usa `formulario.invalid` para impedir continuar con una selección incorrecta.

### Paso 3: actualizar sin prometer una reserva

Realtime avisa mediante `cine_eventos_publicos`, que transporta IDs/revisiones, no datos privados de compras. La pantalla vuelve a consultar disponibilidad. Hay polling de respaldo cada 15 segundos y actualización al recuperar conexión o visibilidad. Si una seleccionada deja de estar libre, se retira con aviso.

**Justificación:** esto reduce estados viejos, pero no retiene la butaca. El carrito de `src/app/features/compra/services/carrito.service.ts` sólo guarda función, códigos y candy en memoria. Cambiar de función limpia candy y una compra exitosa limpia todo. No hay una reserva de quince minutos: quince segundos es la frecuencia de actualización.

### Paso 4: candy y composición de combos

El carrito manda tipo, ID y cantidad, no precios ni stock autoritativos. La clave `tipo:id` distingue un producto de un combo. Una cantidad inválida se quita del pedido para no enviar una línea anterior que ya no coincide con el campo visible; cero significa quitar.

SQL agrupa el consumo de cada producto vendido suelto y dentro de combos. Si un combo trae entrada, sustituye la tarifa normal de una butaca elegida; no agrega otro asiento. Un VIP conserva su recargo. Ejemplo: dos entradas de $5.000 y un combo con entrada de $7.000 producen $12.000 antes de beneficios: 10.000 + 7.000 − 5.000.

### Paso 5: cotizar y detectar cambios

`CheckoutComponent` calcula `pedido`; `CheckoutService.cotizar` llama a `cine_cotizar`. El servidor calcula entradas, candy, descuento y crédito. La pantalla guarda el JSON del pedido cotizado y sólo considera vigente la cotización si coincide con el pedido actual.

**Por qué:** cambiar butacas o cupón no debe permitir confirmar el total anterior. La comparación local es una firma de contenido, no criptografía ni autorización. Antes de enviar se exigen datos válidos, selección de la función correcta, conformidad etaria del invitado cuando corresponde y aceptación expresa del pago simulado.

### Paso 6: conservar identidad al reintentar

{{fragmento:solicitud}}

**Cómo explicar el fragmento:** se combina pedido, datos de contacto y total para identificar el intento. Si cambia el contenido, se genera otro UUID. Si el contenido sigue igual, el reintento conserva la solicitud.

**Problema que resuelve:** el servidor puede haber confirmado aunque la respuesta se pierda. Misma solicitud y contenido permiten recuperar el comprobante sin duplicar compra. `ocupado` evita doble clic local, pero no basta frente a reintentos HTTP. El backend verifica además propietario y contenido.

Esta propiedad se llama **idempotencia**: repetir el mismo pedido no repite sus efectos.

**Límite concreto:** la solicitud vive en esa instancia del checkout; no se conserva como pedido recuperable universal al recargar o cerrar el navegador. No debe afirmarse que cualquier nueva visita recupera el mismo intento.

### Paso 7: Edge Function y commit SQL

`CheckoutService.reservar` invoca `confirmar-compra` con pedido, solicitud, total esperado y `pago_simulado: true`. El nombre del método es legado; esta operación confirma la compra.

La Edge valida método/cuerpo/origen, verifica el bearer con Auth y comprueba perfil activo. Una sesión inválida no se transforma silenciosamente en invitado. Busca una solicitud anterior compatible antes de generar otra compra y vuelve a cotizar como el comprador.

Después prepara el comprobante y delega la escritura final:

{{fragmento:commit}}

**Cómo explicar el fragmento:** `crypto.randomUUID()` genera el código; `documento` arma QR y PDF en memoria. La RPC final recibe identidad verificada, pedido con cotización y documento. La clave privilegiada usada por `backend` está sólo en Edge.

**Por qué documento antes:** si falla generarlo, no queda una compra confirmada sin comprobante. Prepararlo no reserva recursos. Si precio o stock cambia durante el render, SQL vuelve a validar y rechaza el commit.

La unidad atómica real es **`cine_comprar_documento`**, no toda la Edge. Sus llamadas HTTP previas no comparten una transacción PostgreSQL. La RPC toma locks, revalida reglas y cotización completa, y persiste compra, entradas, consumo, movimientos, documento y notificación en la misma transacción. Si una condición falla, no deben quedar efectos parciales.

### Dos compradores quieren la misma butaca

Los dos pueden haber visto “libre”. Al confirmar, locks coordinan escritores y un índice único parcial sobre función/butaca activa agrega una barrera de integridad. El primero que confirma obtiene la compra; el segundo recibe conflicto y su pedido se revierte. Cancelar desactiva la entrada, permitiendo conservar historia sin impedir una venta posterior.

**Justificación:** la transacción protege todo o nada; el lock coordina acceso; la restricción protege la unicidad incluso ante un error de lógica. Realtime y `disabled` no reemplazan ninguna de esas barreras. El mutex económico simplifica coordinación de stock, cupones y saldos, con costo de menor paralelismo; no conviene quitarlo sin medir y diseñar otra estrategia.

### El total del navegador no decide la economía

`total_esperado` detecta un cambio respecto de lo mostrado; el servidor recalcula, no acepta ese importe como precio autorizado. Comparar sólo el importe sería insuficiente: dos pedidos diferentes pueden tener el mismo total. Por eso la RPC compara también la cotización completa.

La compra conserva un **snapshot** de lo vendido. Cambiar después título, precio o composición del combo no debe alterar el comprobante ni la reposición de una cancelación. El catálogo se normaliza para administrarlo; el snapshot se guarda deliberadamente para preservar la historia de emisión.

## 6. Reglas posteriores y administración que debo defender

### QR: lectura, ingreso y candy

`EscanerEntradaComponent` carga ZXing y sólo interpreta un UUID. Escanear completa el campo: el operador elige función y prestación y luego confirma. `EntradaComponent` usa `BeneficiosService.validar` → `cine_validar_compra`; SQL verifica rol activo, estado, horario y uso previo.

Hay **un QR por compra**, ingreso conjunto y candy independiente. Si se usó ingreso pero candy sigue pendiente, el código aún sirve para candy; si se retiró candy primero, ingreso sigue habilitado. Sin candy, se agota con ingreso. Repetir desde otro navegador también debe ser rechazado por backend.

El token para consultar el comprobante y `qr_compra` son distintos: uno permite leer por posesión del enlace y otro consume prestaciones con un operador autorizado. Ambos son secretos portadores aunque el QR no contenga nombres. Presentar el PDF no reemplaza consultar el estado actual: si la compra fue cancelada, SQL rechaza su uso.

La ventana implementada va de inicio − 30 minutos a fin − 30 minutos. `fin` incluye limpieza, por eso no se habilita durante esa etapa. Es una decisión del código; no un plazo literal fijado por RN-07.

### Descuento, crédito, puntos y cancelación

Ejemplo único para no confundir las variables: subtotal $10.000, descuento $2.000, crédito $3.000. Entonces **total = $8.000** y **a_pagar = $5.000**. La regla vigente acredita `floor(a_pagar)` puntos a la cuenta: 5.000; invitado no recibe puntos. El uso de crédito no genera otra vez puntos sobre esa parte.

Cupones se validan por estado, vigencia, usos, mínimo y titular/segmento. Los saldos se derivan de movimientos. Los puntos de compras todavía cancelables no están disponibles para canje, evitando gastarlos y luego generar deuda al revertirlos. El canje debita puntos y emite un cupón personal en servidor.

El titular puede cancelar al menos dos horas antes, sin ingreso ni candy consumidos. SQL revalida bajo locks, devuelve el total como crédito, repone lo efectivamente consumido, revierte puntos originales y libera entradas. No devuelve dinero real, uso de cupón ni condición de primera compra; conserva snapshot y PDF. Repetir no debe generar otra compensación.

En el ejemplo se habían debitado $3.000 de crédito y se acreditan $8.000 al cancelar: respecto del saldo previo, el aumento neto es $5.000. Este circuito propio requiere cuenta; no resuelve una compensación invitada mediante historial. Los puntos históricos conservan la tasa original, no se recalculan con la regla vigente.

### Reseñas: asistencia y un voto por película

El historial se consulta con identidad del servidor; no se envía un `usuario_id` libre para leer otra cuenta. La reseña exige compra propia confirmada e ingreso utilizado. Hay una opinión vigente por cuenta/película: otra compra no multiplica su peso en el promedio; `upsert` reemplaza esa opinión.

El editor conserva borradores y rechaza contratos incompletos. Un backend que devuelve estrellas pero omite comentario no debe precargar vacío y destruir el texto anterior al guardar. Se conserva el archivo histórico anterior, no un historial de todas las futuras ediciones.

### Programar funciones sin superposición

La administración envía película, inicio y modalidad; SQL asigna sala disponible y calcula **fin = inicio + duración + 30 minutos de limpieza**. Una película de 90 minutos a las 18:00 ocupa hasta las 20:00: programar otra a las 19:45 superpone el intervalo.

`datetime-local` contiene hora civil, no zona. Las utilidades de `shared/cine/fecha-argentina.ts` interpretan la fecha argentina explícitamente y la convierten a ISO; el servidor revalida con su reloj. Un formulario válido al abrir puede haber vencido al guardar.

Programación por rango es un lote atómico: si una fecha no encuentra sala, no se guardan sólo las restantes. Reprogramar con compromisos se bloquea para no volver falsos los documentos emitidos. La preview ayuda a revisar, pero no asegura disponibilidad al commit.

### Bajas, imágenes y reportes

La baja habitual es lógica: desactiva y permite restaurar con la misma identidad, preservando relaciones. **Excepción:** `EditorButacasComponent.eliminarSala` y la migración `20261018000100_eliminar_sala_vacia.sql` permiten DELETE auditado de sala sin funciones ni mantenimiento asociados. No sería correcto decir “nunca se borra físicamente”.

Imágenes: se validan formato, tamaño y firma binaria; se usa nombre UUID y `upsert: false` para no sobrescribir referencias históricas. Storage debe reforzar permisos. Si la carga funciona pero guardar la ficha falla, puede quedar un objeto huérfano: es un pendiente de limpieza controlada, no motivo para borrar el bucket.

`ReportesComponent` usa el mismo resultado consultado para tabla, PDF y Excel. Exporta el período ya obtenido, no filtros que el usuario modificó después. Diferencia ventas por fecha de compra de vistas por fecha de ingreso. `shared/reportes/exportaciones.ts` genera un XLSX real ZIP/OOXML, no CSV renombrado; escribe textos como `inlineStr`, evitando convertir nombres que empiezan con `=` en fórmulas. El PDF administrativo usa jsPDF; el de compra nueva se emite en Edge y se descarga persistido.

## 7. Robustez, pruebas y límites reales

### Cuatro fallos de UI y su solución

- **Respuesta vieja pisa una nueva:** revisiones de carga y comprobación antes de actualizar estado. No se confía en el orden de respuestas.
- **Una operación falla y pierde el borrador:** `catch` informa, `finally` libera el bloqueo y el reset espera al éxito.
- **Canje exitoso pero falla refrescar saldo:** se distingue escritura de lectura posterior; se informa éxito y no se induce a repetir. `BeneficiosComponent` aplica esta separación, aunque no todas las pantallas la uniforman igual.
- **Salir deja recursos activos:** `DestroyRef` detiene timers, canal y cámara; las comprobaciones de vigencia evitan aplicar inicializaciones tardías.

### PWA y Push: alcance acotado

`public/cine-sw.js` integra el worker de Angular y cachea sólo el GET exacto de cartelera pública de Supabase, con antigüedad limitada y revalidación. No cachea saldo, disponibilidad, sesión, QR ni compras; no hay cola de compras offline. La decisión evita mostrar información privada o vender con disponibilidad vieja.

`WebPushService` solicita permiso mediante acción explícita y vincula dispositivo con cuenta vigente. Logout intenta dar de baja esa asociación. La cola backend usa reintentos: aceptación HTTP del proveedor no demuestra recepción en el dispositivo ni entrega exactamente una vez. Bandeja de cuenta y Push son canales diferentes.

### Qué pruebas puedo mostrar

Los `.spec.ts` usan Vitest (`describe`, `it`, `expect`) y, cuando corresponde, Angular TestBed, mocks y reloj simulado. Un test vale por el comportamiento incorrecto que detecta, no por la cantidad de archivos.

- `shared/cine/reglas.spec.ts`: probar duplicados, huecos y cruce de pasillo; justifica el algoritmo de contigüidad.
- `core/auth/auth.service.spec.ts`: reproducir cruces de restauración/logout y perfiles tardíos.
- `features/compra/checkout.component.spec.ts`: cotización vigente, rechazo sin perder datos y conservación de solicitud al reintentar.
- `features/cine/reserva.component.spec.ts`: refresco y selección que deja de estar disponible.
- `shared/reportes/exportaciones.spec.ts`: inspeccionar ZIP/XML y escritura segura de celdas.

Resultado de la revisión del **12/10/2026**: `npm test -- --watch=false` aprobó **390 pruebas en 45 archivos**; `npm run build` compiló. El bundle inicial fue 534,53 kB, con advertencias de presupuesto y dependencias CommonJS. Son resultados locales previos usados para esta guía, no una nueva certificación remota ni ausencia de bugs.

Una prueba con Supabase simulado comprueba reacción del cliente, no transacciones instaladas. Concurrencia exige conexiones independientes; un recorrido completo requiere navegador/backend reales; Push exige dispositivo y consentimiento reales. Esta edición documental no hizo compras, consumió QR ni aplicó migraciones remotas.

### Diferencias que debo reconocer ante la consigna

La referencia sigue siendo `Sistema_de_Cine_Documento_de_Requerimientos_v2.1 (3) (1) (2).docx`, contrastada en la revisión original. Se quitaron las matrices completas para priorizar la explicación, **no para afirmar cumplimiento total**:

- **RF-15:** plano normativo y mantenimiento, no editor libre de filas, columnas y tipos.
- **RF-79/80:** Push abre la cuenta protegida; el payload no lleva QR, sala ni horario. Es una decisión de privacidad distinta del texto literal, pendiente de aceptación.
- **RF-83:** hay integración OAuth, pero funcionamiento real depende de configuración de proveedores y prueba de retorno.
- Antes de producción faltan pruebas multiconexión/dispositivos, revisión integral de permisos y privacidad/retención, antiabuso invitado y estrategia de backup. Una migración local no prueba que esté instalada.

## 8. Preparación concreta para la defensa

### Archivos centrales, en orden de lectura

No abrir 182 archivos: seguir este recorrido y ubicar la responsabilidad de cada uno.

1. `src/main.ts` y `src/app/app.routes.ts`: arranque y distribución de rutas.
2. `src/app/core/auth/sesion.service.ts`, `auth.service.ts` y `src/app/core/guards/rol.guard.ts`: estado, sincronización y permisos de navegación.
3. `src/app/shared/cine/reglas.ts` y `src/app/features/cine/reserva.component.ts`: regla pura, formulario y actualización de disponibilidad.
4. `src/app/features/compra/services/carrito.service.ts` y `src/app/features/compra/checkout.component.ts`: selección, cotización y solicitud de compra.
5. `src/app/data-access/cine/checkout.service.ts` y `validacion.ts`: comunicación y validación del contrato.
6. `supabase/functions/confirmar-compra/handler.ts` y definición vigente de `cine_comprar_documento` en migraciones: identidad, documento y commit.
7. `src/app/features/cine/entrada.component.ts` y `src/app/data-access/perfiles/beneficios.service.ts`: consumo de prestaciones; la ubicación en `cine` es histórica, las rutas la usan para empleados y administración.

En cada archivo debo poder señalar: **entrada de datos, estado, operación, resultado y tratamiento del error**. Un nombre de método es más estable que memorizar su número de línea.

### Preguntas para practicar decisiones, no definiciones sueltas

1. **¿Por qué separar componente y servicio?** Para no mezclar presentación con el contrato remoto y poder probarlos por separado. El servicio no reemplaza reglas SQL.
2. **¿Por qué `computed` para el pedido?** Porque deriva del estado actual sin mantener otra copia que pueda quedar vieja.
3. **¿Por qué validar en cliente y servidor?** El cliente da feedback rápido; el servidor protege reglas aunque se eluda el formulario.
4. **¿Por qué controlar fila y bloque?** La numeración consecutiva no demuestra contigüidad física si hay un pasillo.
5. **¿Por qué Realtime y transacción a la vez?** Resuelven problemas distintos: frescura de UI e integridad del commit.
6. **¿Por qué guardar snapshot y PDF?** Para que la compra siga describiendo lo emitido aunque cambie el catálogo.
7. **¿Por qué UUID estable y no sólo deshabilitar el botón?** Un reintento puede venir después de perder la respuesta; debe recuperar la operación, no repetirla.
8. **¿Por qué no hacer todas las escrituras desde Angular?** Porque no tendría una unidad atómica para coordinar entradas, stock, saldos y documento.
9. **¿Qué costo tiene un mutex económico común?** Simplifica integridad, pero reduce paralelismo. Más escalabilidad exige rediseño y medición.
10. **¿Qué mejoraría primero?** Completar pruebas reales y límites de alcance; después uniformar acceso a datos y escritura/refresco con regresiones, sin cambiar reglas accidentalmente.

### Demostración breve con el editor abierto

1. Mostrar ruta de compra y explicar componente → servicio → RPC/Edge.
2. Comparar A1+A2 con A4+A5; señalar validator y `FormControl`.
3. Mostrar carrito y `pedido` derivado; cambiar cupón/butacas y explicar cotización desactualizada.
4. Señalar UUID de solicitud, preparación del PDF y RPC final. Explicar el caso de respuesta perdida y dos compradores, sin inventar una prueba remota.
5. Mostrar validación de QR y una prueba de regresión; aclarar qué dependencia se simuló.

Hacer escrituras o consumir prestaciones sólo con datos de ensayo autorizados. No proyectar claves, JWT, tokens ni QR reales. Si algo depende de configuración externa, explicar su estado real en vez de presentar un mock como una integración completada.

**Criterio de cierre:** puedo justificar una decisión cuando explico qué problema resuelve, dónde está implementada, qué alternativa descarté y qué límite todavía tiene.
