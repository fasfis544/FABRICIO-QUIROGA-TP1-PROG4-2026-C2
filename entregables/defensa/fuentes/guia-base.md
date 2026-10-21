# Defensa del código — Cine Aurora

Fabricio Quiroga · Programación IV · Comisión 141
Docente: Ricardo Gastón Plazas · Entrega indicada en la consigna: 13/10/2026
Guía de estudio basada en el código local revisado el 12/10/2026.

## 1. Cómo usar esta guía y qué está verificado

Esta guía explica el sistema que está en el repositorio, no un sistema ideal ni una promesa de cumplimiento total. Se tomó como fuente el Word solicitado: Sistema_de_Cine_Documento_de_Requerimientos_v2.1 (3) (1) (2).docx, ubicado en Downloads. Se contrastaron sus 85 RF, 17 RN y 14 RNF con src, las rutas, servicios, pruebas y los contratos backend relevantes. La portada original dice versión 3.2 y el historial llega a 2.1: no se corrigió esa diferencia por cuenta propia.

El inventario cubre cada archivo de src, incluidos HTML, SCSS, entornos y tests, y todas sus carpetas, incluso las vacías. Las líneas citadas corresponden a esta revisión; pueden desplazarse si editás el proyecto. Buscar el nombre de la clase o función es más estable que memorizar un número de línea.

Tres niveles que conviene distinguir: implementación localizada significa que existe código; prueba local significa que se ejecutó o inspeccionó una regresión con alcance limitado; funcionamiento remoto significa que el recorrido se comprobó contra la aplicación publicada. Esta guía no hizo compras reales de prueba, no consumió QR, no cambió roles ni aplicó migraciones remotas. Los estados de despliegue mencionados por README y docs son antecedentes, no una nueva auditoría de Cloud.

Las respuestas redactadas en primera persona son modelos para practicar. Usalas únicamente si entendés la explicación; no constituyen evidencia de quién escribió cada cambio ni reconstruyen conversaciones que no están en el repositorio. No es posible anticipar literalmente todas las preguntas del profesor, pero sí preparar las decisiones, límites y recorridos centrales.

Orden recomendado de estudio: resumen oral, arquitectura, flujo de compra, seguridad y concurrencia, sintaxis, problemas resueltos y preguntas. Después recorré el catálogo de archivos con el editor abierto y consultá las matrices de requisitos.

## 2. Presentación oral del proyecto

### 2.1 Explicación de aproximadamente dos minutos

“Desarrollé Cine Aurora, una aplicación web para un cine con varias salas. Angular concentra la interfaz pública, la cuenta del cliente, la operación del empleado y el backoffice. Supabase aporta autenticación, PostgreSQL, Storage, Realtime y funciones Edge. El visitante puede buscar películas, elegir una función, seleccionar butacas contiguas y agregar candy. Puede comprar como invitado o con cuenta; el pago es académico simulado.

Separé el frontend en core, data-access, features y shared. Los componentes presentan y coordinan la interacción; los servicios encapsulan consultas y validan respuestas. Las reglas económicas y de integridad se vuelven a validar en el servidor. El navegador no decide el precio final ni garantiza la disponibilidad.

La confirmación entra por una Edge Function que verifica identidad, cotiza y genera el PDF y el QR. Luego una única RPC SQL confirma todo con locks y restricciones, o rechaza sin efectos parciales. La solicitud idempotente permite reintentar si se pierde la respuesta sin duplicar la compra. Un QR habilita dos prestaciones independientes: ingreso y candy.

También implementé administración, reportes PDF y Excel, historial, reseñas y beneficios. La PWA conserva únicamente la cartelera pública offline, no compras ni datos de cuenta. Tengo tests de regresión y conozco los límites: OAuth depende de configuración externa, Push requiere prueba real en dispositivo y el plano normativo no es un editor libre de distribución.”

### 2.2 Qué problema de negocio resuelve

Evita que catálogo, programación, venta y acceso se manejen como sistemas aislados. Una función tiene sala, horario, idioma, formato y precio; una compra guarda lo efectivamente contratado; el empleado consume prestaciones; el administrador conserva historia y consulta métricas. No es un sistema fiscal ni una pasarela de cobro, y no administra una cadena de establecimientos.

### 2.3 Vocabulario que no tenés que confundir

- Película: la ficha de catálogo. Función: una proyección concreta de esa película. Cambiar de función cambia sala, horario y posiblemente modalidad o precio.
- Selección: datos del carrito en memoria. Compra: operación confirmada en PostgreSQL. La clase ReservaComponent y la tabla cine_reservas conservan nombres históricos, pero el checkout nuevo no crea una reserva para pagar en boletería.
- Vendida: entrada adquirida en compra confirmada. Vista: entrada cuyo ingreso se validó. El ranking público usa ventas; el gráfico de películas más vistas usa ingresos.
- Crédito: dinero virtual interno originado en compensación. Puntos: fidelización. Cupón: código con condiciones. Canje: operación que debita puntos y emite un beneficio personal.
- Token de comprobante: secreto que permite consultar la compra por posesión del enlace. qr_compra: secreto distinto que permite al operador validar una prestación. Ninguno debe publicarse en ejemplos reales.
- fin de función almacenado: incluye los 30 minutos de limpieza. Fin de proyección: fin menos esos 30 minutos.

## 3. Arquitectura y recorrido desde el arranque

### 3.1 Las cuatro capas de src/app

core contiene capacidades transversales: cliente Supabase, sesión, Auth, guards, red, fecha comercial, estrategia del router y Web Push. No es la carpeta para todas las pantallas ni para todos los datos del negocio.

data-access contiene modelos, servicios y parsers de películas, cine y perfiles. Encapsula nombres de tablas/RPC y convierte JSON desconocido en datos que el componente puede usar. No reemplaza las reglas de PostgreSQL.

features contiene casos de uso y pantallas: auth, cartelera, cine, compra, perfil, empleados, errores y admin. La carpeta cine mantiene componentes históricos usados desde otras rutas: su ubicación no significa que exista una segunda aplicación.

shared reúne piezas reutilizables: pipes, directivas, validadores, imágenes, estrellas, filtros de catálogo, QR, escáner, descarga de PDF y exportaciones. Reutilizable no significa que todo deba moverse allí; una pieza exclusiva de un dominio puede quedarse en su feature.

Dependencia habitual: pantalla → servicio de acceso a datos → Supabase → regla SQL. Algunas pantallas, como géneros y auditoría, todavía llaman Supabase directamente. La organización es por responsabilidad, no una arquitectura perfectamente pura sin excepciones.

### 3.2 Qué ocurre al abrir la aplicación

1. src/index.html aporta el documento HTML, lang="es", viewport, base href, manifest, iconos y el elemento app-root.
2. src/main.ts invoca bootstrapApplication(App, appConfig). No hay AppModule de arranque: se usan componentes standalone.
3. app.config.ts registra router, listeners globales de errores, RutaIdentidadStrategy y el worker de producción.
4. App representa la cabecera, navegación, cuenta, salida y router-outlet. El outlet muestra la pantalla de la ruta actual.
5. AuthService escucha eventos del SDK y restaura sesión. SesionService guarda la identidad y perfil; el rol usable se deriva de perfil activo, no de metadata editable.
6. El router carga de forma diferida los archivos .routes.ts y componentes requeridos. Los guards esperan la sesión y refrescan permisos cuando corresponde.

### 3.3 SPA, PWA y lazy loading

SPA significa que la navegación habitual cambia componentes sin solicitar un HTML distinto al servidor en cada enlace. El hosting debe devolver el index para una ruta profunda de la SPA. No significa que no haya llamadas HTTP: los datos siguen viniendo de Supabase.

PWA agrega manifest y Service Worker para instalación y respaldo offline acotado. No es una aplicación nativa y el comportamiento depende del navegador, HTTPS y permisos. El worker corre en otro contexto; no puede usar directamente el DOM de un componente.

loadChildren difiere una lista de rutas; loadComponent difiere una clase de componente. import() devuelve una Promise y permite crear chunks. También se cargan a demanda ZXing, qrcode y jsPDF para no exigir esas bibliotecas en cada pantalla inicial.

### 3.4 Rutas que conviene ubicar en vivo

- Público: /, /peliculas, /proximamente y /peliculas/:id.
- Compra: /compra/:funcionId/butacas, /candy, /checkout y /compra/confirmacion/:compraId. Los segmentos candy y checkout mantienen el mismo funcionId. compraId contiene el token del comprobante, aunque el nombre parezca un ID público.
- Cuenta: /perfil, /perfil/compras, /perfil/compras/:id, /perfil/peliculas y /perfil/{puntos,recompensas,canjes,credito,notificaciones}. Las últimas cinco reutilizan BeneficiosComponent con data.tipo.
- Empleado: /empleados/entrada y /empleados/candy reutilizan EntradaComponent. La segunda marca data.candy.
- Admin: /admin/peliculas, /salas, /salas/butacas, /funciones, /funciones/programacion, /precios, /candy/productos, /candy/combos, /cupones, /recompensas, /usuarios, /auditoria y /reportes/{ventas,peliculas,candy}.
- Auth: /auth/login, /auth/registro, /auth/confirmacion-email, /auth/recuperar-password, /auth/restablecer-password y /auth/oauth.
- Error: el comodín ** deriva a /errores/no-encontrado; sin-permiso es otra situación, no una página inexistente.

El administrador valida desde /admin/entradas. No “hereda” automáticamente la ruta exclusiva de empleado: el guard usa roles explícitos, mientras que el contrato de validación backend permite empleado o administrador.

## 4. Funcionalidades: cómo están implementadas

### 4.1 Cartelera, filtros y ranking

PeliculasService.listar(false) consulta cine_cartelera mediante GET; listar(true) solicita cine_catalogo con modo administrativo. El flag p_admin no convierte a un cliente en administrador: el servidor debe autorizarlo. El parser normaliza idiomas y formatos, conserva clasificación histórica y provee respaldo de afiche cuando falta imagen.

CatalogoComponent combina búsqueda, género, clasificación, idioma, formato y la separación por estreno. DiaCineService entrega el día civil de Buenos Aires, reactivo al cambio de día. Inicio muestra hasta cuatro películas estrenadas y el ranking aparece primero: hasta tres con ventas positivas, con desempate por título. Cero ventas no se reemplaza con películas inventadas.

Un filtro combinado de formato e idioma debe comprobar una pareja de la misma función. Ejemplo: una función castellano/3D y otra subtitulada/2D no autorizan mostrar subtitulada/3D. coincideModalidad usa some sobre modalidades. Matiz del código actual: si no hay pares, compara los defaults de la ficha; ese fallback permite filtrar una película sin funciones, pero no demuestra que pueda comprarse una función con esa modalidad. Este detalle es más preciso que decir que cualquier contrato antiguo se rechaza siempre.

### 4.2 Ficha, reseñas públicas y preventa

DetalleComponent obtiene catálogo y funciones en paralelo, busca la película actual y consulta reseñas separadamente. Si falla leer reseñas no dice “no hay reseñas”: conserva un error específico. Usa revisionCarga para que una respuesta antigua no sobrescriba una recarga reciente.

La UI presenta venta si la película ya estrenó o si hay precio especial dentro de siete días del estreno. Es orientación visual: la disponibilidad comercial real se valida en SQL con función, sala y butacas. Desde la fecha de estreno se aplica tarifa regular, sin tener que borrar el precio_preventa histórico.

El usuario registrado puede suscribirse a una alerta por película. Esa alerta y el consentimiento Push del dispositivo son cosas distintas. La bandeja de cuenta funciona aunque Push no esté disponible.

### 4.3 Plano de butacas y contigüidad

El plano normativo tiene 20 filas A–T. Las 18 filas no accesibles tienen 28 plazas; J y K tienen 14 cada una. Total: 18 × 28 + 2 × 14 = 532. R/S/T son VIP: 84 plazas. J/K son accesibles: 28. Las restantes normales: 420. Los tres bloques estándar son 4+20+4; los accesibles, 2+10+2.

ReservaComponent recibe el plano y precios por cine_disponibilidad, agrupa por fila y bloque, y conecta FormControl<string[]> con butacasContiguas. La selección debe tener 1–8 códigos existentes, no repetidos, de una sola fila y bloque, sin huecos. A1+A2 es válida; A1+A3 no; A4+A5 cruza pasillo aunque los números sean consecutivos. En J, J2+J3 también cruza un pasillo.

La fórmula del validator es máximo de columna − mínimo de columna + 1 = cantidad, después de verificar existencia, duplicados, fila y bloque. Sin esas comprobaciones previas la fórmula sola podría aceptar selecciones incorrectas. Devuelve null si es válido y { contiguas: true } si no lo es; no devuelve false para indicar error.

### 4.4 Realtime, reconexión y estados viejos

OperacionesService.observar escucha cine_eventos_publicos, una tabla de IDs y revisiones, no la compra completa. Al recibir evento, la pantalla vuelve a consultar el contrato autorizado. Así el canal no necesita transmitir identidad, QR ni contacto.

El mapa agrega polling cada 15 segundos con pestaña visible y reconsulta al recuperar conexión, visibilidad o suscripción. Si una butaca seleccionada se ocupa o bloquea, se retira de la selección con mensaje. DestroyRef limpia timer, listeners y canal; cerrada impide aplicar una respuesta después de destruir la pantalla.

Realtime mejora la experiencia, no asegura que el asiento permanezca libre hasta confirmar. También navigator.onLine es una señal orientativa, no prueba de que Supabase responda. La respuesta HTTP y la transacción final siguen siendo necesarias.

### 4.5 Candy y combos

CandyComponent muestra productos y combos de CheckoutService.catalogo. La clave de UI es tipo:id, porque un producto y un combo podrían compartir el mismo UUID sin ser la misma línea. Guarda textos de cantidad y errores por ítem; un valor inválido elimina la cantidad anterior del pedido para no enviar productos “ocultos”. Cero significa quitar; cantidades efectivas de servidor son enteros 1–20.

El catálogo puede estar vacío y la compra continúa sin candy. Si falló la carga no se trata como catálogo vacío. Sin butacas o con carrito de otra función, el paso no habilita continuar.

El stock final suma consumo suelto y componentes de combos. Un combo con entrada no crea un asiento adicional: sustituye una tarifa normal de una butaca elegida por unidad. Si el asiento es VIP mantiene la diferencia del recargo. Dos entradas normales de $5.000 más un combo con entrada de $7.000 dan $12.000: 10.000 + 7.000 − 5.000, antes de descuentos y crédito.

### 4.6 Checkout y compra atómica: explicación central

CheckoutComponent tiene un pedido computed a partir de función, butacas, candy, cupón y crédito. Cotiza en servidor y guarda una firma del pedido con JSON.stringify. Si cambia el pedido, la cotización anterior deja de estar vigente y no permite confirmar con datos desactualizados.

Antes de enviar exige función y película cargadas, conexión orientativa, carrito de esa función, datos válidos, conformidad etaria del invitado si corresponde y aceptación del pago simulado. Protege doble clic con ocupado y conserva campos cuando el servidor rechaza.

Recorrido completo:

1. Carrito mantiene datos de interacción en memoria; no bloquea ni reserva asientos.
2. cine_cotizar calcula precios, candy, descuento y crédito con el actor actual. Es cotización, no commit.
3. CheckoutService.reservar llama confirmar-compra con pedido, solicitud UUID, total_esperado y pago_simulado: true. El nombre reservar es legado; la operación nueva confirma una compra.
4. La Edge valida el cuerpo, método y origen. Un bearer de cuenta se verifica con getUser; una sesión inválida no se degrada a invitado. Revisa perfil activo.
5. Busca solicitud previa. Si propietario y contenido coinciden, devuelve su comprobante; si el pedido es distinto rechaza con conflicto.
6. Cotiza como comprador, verifica total esperado y prepara un QR UUID y el PDF en memoria antes de escribir.
7. cine_comprar_documento, accesible al backend service_role, toma locks, vuelve a calcular y compara la cotización completa. Persiste compra, entradas, consumo, movimientos, documento y notificación en la misma transacción.
8. Devuelve el token de comprobante. Angular limpia carrito y navega a confirmación.

La Edge hace varias llamadas HTTP y NO puede mantener una transacción PostgreSQL compartida entre ellas. La unidad atómica real es la RPC final. Generar PDF antes no “reserva” nada: si cambian precio o stock antes del commit, SQL rechaza y ese PDF no se convierte en compra emitida.

total_esperado detecta cambios, pero no se confía en él para cobrar. La cotización completa incluye otros datos relevantes; comparar sólo el total permitiría que cambiara el contenido sin cambiar el importe. El navegador tampoco envía usuario_id como identidad autoritativa.

### 4.7 Cupones, crédito y puntos con un ejemplo

Un cupón por pedido, sujeto a vigencia, estado, usos, mínimo, titular o segmento. Bienvenida se genera para primera compra con porcentaje configurable. Cancelar no devuelve el uso del cupón ni reinicia la condición de primera compra.

Ejemplo: subtotal $10.000, descuento $2.000 y crédito $3.000. total = $8.000; a_pagar = $5.000. El primero incluye la parte cubierta con crédito; el segundo es el resto de simulación y base de puntos. Se acreditan floor(5.000) = 5.000 puntos para una cuenta; $123,90 genera 123 puntos; invitado o pago neto cero genera cero.

La regla vigente es 1 punto por peso. Hay una migración histórica que cambió a 1/8 y otra que restauró la regla. No se recalculan compras anteriores: se conservan los puntos originalmente acreditados y la cancelación revierte esos puntos, no una tasa aplicada retroactivamente.

Saldos se derivan de movimientos. Puntos acreditados y disponibles pueden diferir: los de compras aún cancelables están protegidos contra canje. Es una decisión adicional que evita consumirlos y después generar una deuda al cancelar. El canje debita disponibles y emite cupón personal unitario en servidor, con UUID de solicitud estable.

### 4.8 Cancelación

El cliente titular puede cancelar al menos dos horas antes, sin ingreso ni candy usados. El servidor revalida el tiempo y la titularidad bajo locks. Devuelve el total como crédito, repone componentes de stock, revierte puntos originales, libera entradas y marca compra cancelada. Conserva snapshot y PDF; el QR deja de habilitar prestaciones. Repetir no crea otra compensación.

En el ejemplo anterior, al comprar se debitaron $3.000 de crédito y al cancelar se agregan $8.000. Respecto del saldo previo a la compra, el aumento neto es $5.000. No se devuelve dinero real. Invitado no tiene una cuenta de crédito ni cancelación propia por historial; la compensación invitada no está resuelta por ese circuito.

### 4.9 QR y operación de empleados

EscanerEntradaComponent usa ZXing por import dinámico y sólo acepta un texto UUID. Escanear completa el campo; no consume automáticamente. El empleado elige función y prestación y pulsa validar. También puede ingresar manualmente el mismo código.

EntradaComponent usa BeneficiosService.validar → cine_validar_compra. Ese es el flujo activo, no los métodos legados confirmar/validar de OperacionesService. Backend verifica rol activo, función, horario, estado y uso anterior.

Un QR por compra, ingreso conjunto y candy independiente. Con candy contratado: si ingreso se usó y candy no, el QR sigue sirviendo para candy; si candy se usó primero, ingreso sigue pendiente; agotado cuando ambas se consumieron. Sin candy, se agota con ingreso. Un intento repetido debe ser rechazado aunque se repita desde otro navegador.

La ventana actual de validación es desde inicio − 30 minutos hasta fin − 30 minutos, extremos incluidos. No se valida durante la limpieza posterior. Esta ventana es decisión del código, no un plazo explícito de RN-07. Nuevas compras no admiten ingreso fraccionado por persona; se consume el conjunto de butacas.

### 4.10 Historial y una reseña por película

ClienteService.reservas consulta identidad en el servidor; no manda usuario_id para elegir de quién leer. HistorialComponent reutiliza la vista con data.vistas: “Mis películas” filtra compras con ingreso usado, no sólo compras realizadas o candy retirado.

DetalleReservaComponent precarga la opinión vigente y protege el borrador al actualizar. Sólo permite guardar desde compra propia confirmada con ingreso validado. Exige resena_por_pelicula === true y comentario completo si existe reseña: no trata un campo ausente como una opinión vacía que pueda sobrescribirse.

La tabla vigente tiene clave cuenta/película. Repetir compras de la misma película no agrega votos al promedio; upsert reemplaza esa opinión. La tabla vieja conserva el archivo de opiniones por compra. No se archivan todas las futuras versiones de edición: último guardado exitoso prevalece. Es una interpretación elegida, porque el RF no fijó unicidad ni ponderación.

### 4.11 Administración y programación

AdminLayoutComponent y admin-navigation.ts organizan seis áreas; PanelComponent filtra herramientas sin ampliar los permisos del área. Dashboard no es un placeholder: muestra resumen autorizado de siete días y acceso al panel.

Películas: formulario reactivo con géneros, clasificación, duración, estreno y afiche. Después de crear se conserva el ID devuelto; otro guardado edita y no inserta otra película. Una clasificación histórica fuera de ATP/13/18 se muestra y exige selección explícita, no se convierte silenciosamente.

Salas: plano fijo normativo, adaptación de salas antiguas y mantenimiento por código. El mantenimiento tiene motivo, opera por lote y se bloquea si afecta plazas comprometidas. No reubica al comprador ni modifica filas/tipos libremente.

Funciones: película, fecha futura argentina, modalidad y precio. Sala se asigna automáticamente en SQL según intervalo completo. fin = inicio + duración + 30 minutos. Una película de 90 min a las 18:00 ocupa hasta las 20:00; iniciar otra a las 19:45 se rechaza. Cambiar duración o modalidad no puede invalidar compras emitidas. Reprogramación con compromisos se bloquea; cancelación administrativa tiene condiciones de compensación distintas de una cancelación propia.

Programación por rango: fechas inclusivas hasta 90 días y días ISO lunes=1/domingo=7. Mismo pedido mantiene solicitud; cambiar datos produce otra. Si una fecha no encuentra sala, se revierte el lote completo. No guardar “las que salieron” es parte de la integridad.

Ofertas: un componente reutilizado según tipo de ruta para producto, combo, cupón o recompensa. El UI valida campos según tipo, componentes y cantidades; evita cambiar editor durante subida. Preserva segundos/fracciones de vigencias no editadas. Categoría del producto es textual, no un CRUD independiente de categorías.

Baja normal: desactiva y permite restaurar sin borrar historia ni reenviar ficha completa. La UI modifica la lista sólo tras éxito. ATENCIÓN: existe además un botón de eliminación definitiva de sala en el editor y una migración 20261018000100. Es una excepción: sólo permite sala sin funciones ni filas de mantenimiento asociadas, valida admin y audita. Por eso sería falso afirmar que “el sistema nunca hace DELETE”. Esa ruta adicional no demuestra que la migración esté instalada ni que su concurrencia ya se haya probado.

### 4.12 Reportes, Excel y auditoría

AdministracionService.reporte obtiene agregados SQL. ReportesComponent usa el mismo resultado para tabla, meter, PDF y Excel. El período exportado es el consultado, no el formulario posiblemente editado después. Desde incluido/Hasta excluido, instantes argentinos convertidos a ISO, máximo 366 días.

Venta por fecha de compra confirmada no cancelada; vista por fecha de ingreso. Candy por unidades de productos, incluidos componentes de combos. “Semana” es últimos siete días y “mes” desde comienzo del mes, no necesariamente semana calendario. Importes no constituyen contabilidad fiscal ni reparto completo de descuentos entre películas/productos.

crearExcel construye un XLSX real: archivos XML de workbook, hojas y relaciones empaquetados en ZIP sin compresión. CRC32 protege integridad de entrada ZIP, no es una firma de seguridad. Números finitos se escriben como números; textos como inlineStr, no fórmulas. Un nombre que empiece con = no se convierte en fórmula ejecutable. No se renombra un CSV como .xlsx.

El PDF administrativo se carga a demanda con jsPDF, ajusta líneas y agrega páginas y numeración. El PDF de compra nueva se genera en Edge con pdf-lib y se persiste; el frontend lo descarga. El fallback jsPDF de compra sólo corresponde a historia sin PDF persistido.

Auditoría se genera en backend por triggers/RPC. El visor pide período y offset y devuelve metadatos, no secretos del comprobante. Las tablas privadas históricas pueden conservar snapshots sensibles; minimización y retención integral son pendientes distintos de no mostrarlos en pantalla.

### 4.13 PWA y Web Push

app.config.ts registra cine-sw.js en producción. Este importa ngsw-worker.js para assets y controla SWR exactamente para GET /rest/v1/rpc/cine_cartelera en hosts Supabase. Entrega copia de menos de siete días mientras revalida, avisa a pestañas si cambia, y sin red/copia válida devuelve 503. No cachea saldo, sesión, disponibilidad, validación, compra, QR o PDF privado. No hay cola de compras offline.

WebPushService consulta capacidad, origen, worker y configuración sin pedir permiso. Sólo activar, invocado por el botón, solicita consentimiento. Usa una InjectionToken para encapsular APIs del navegador y poder simularlas en tests. Una revisión y usuario esperado impiden asociar una respuesta vieja a otra cuenta. Logout intenta baja del dispositivo, con espera máxima de cinco segundos para no impedir salir si Push falla.

Backend usa outbox transaccional para eventos, entregas por dispositivo, lease y reintentos. Proveedor HTTP 2xx significa aceptado, no leído ni recibido por el sistema operativo. Puede haber reentrega si se pierde el ack; se deduplica con tag mientras la notificación sigue visible. No se promete exactamente una vez.

El payload no lleva QR, contacto, token ni datos privados de sala/horario. Abre la cuenta protegida; venta abre ficha pública. Es una mejora de privacidad respecto de mostrar QR en pantalla bloqueada, pero difiere del texto literal RF-79/80 y necesita aceptación docente. Backend configurado y tests con mocks no certifican recepción real en dispositivo.

## 5. Sintaxis TypeScript y Angular para explicar en el editor

### 5.1 Imports, export, clases y tipos

import trae símbolos de un módulo; export permite que otro archivo los importe. La ruta './' es relativa al archivo; '@angular/core' viene de una dependencia. import type expresa una dependencia sólo de tipos y no obliga a cargar runtime, como IScannerControls del escáner.

Una clase reúne estado y métodos. interface describe forma de objeto sin crear un objeto real; type permite alias y uniones como Rol = 'cliente' | 'empleado' | 'administrador'. Estos tipos se verifican al compilar y desaparecen del JavaScript: no prueban que un JSON remoto tenga esa forma.

private limita acceso desde TypeScript a la clase; protected permite clase/subclases y es habitual para miembros de plantilla; readonly evita reasignar la referencia. readonly estado = signal(false) no hace inmutable el valor interno: estado.set(true) sigue siendo válido. Tampoco readonly congela recursivamente un objeto en runtime.

Propiedad con ?: es opcional. string | null admite nulo; undefined puede representar campo omitido. Partial<Pelicula> vuelve campos opcionales; Omit<Butaca, 'precio'> reutiliza el tipo sin precio. Record<string, unknown> es diccionario con claves texto y valores aún no validados. keyof obtiene nombres de propiedades para acceder controles con seguridad de tipos.

Genéricos <T> parametrizan tipos: signal<Pelicula[]>([]) contiene arreglo de películas; Promise<void> promete finalizar sin dato de retorno; FormControl<string[]> limita el valor del control. as const conserva tipos literales; as TipoOferta afirma un tipo pero NO valida una cadena del usuario.

### 5.2 unknown, estrechamiento y errores

unknown exige comprobar antes de operar: typeof, Array.isArray, value !== null, 'clave' in value y Number.isFinite. objeto/lista/texto/numero implementan esa frontera. any permitiría operar sin comprobaciones y esconder errores. Number(null) da cero, por eso el parser no usa conversión numérica ciega.

esRol(rol: unknown): rol is Rol es un type guard: devuelve boolean y, si es true, TypeScript sabe que el valor es uno de los tres roles reconocidos. instanceof Error permite usar message con seguridad en catch (error: unknown). Esa comprobación no concede autorización; sólo valida una forma o un valor.

### 5.3 Operadores y expresiones frecuentes

- ?. acceso opcional: sesion.perfil()?.nombre no falla si no hay perfil.
- ?? fallback sólo si null o undefined: credito ?? 0 conserva cero válido. || usa cualquier valor falsy: '', 0, false, null, undefined o NaN.
- ! después de una expresión afirma que no es nula para el compilador, no genera verificación; ! antes niega un boolean. != null se usa intencionalmente para excluir null y undefined juntos.
- === compara sin coerción. === true no acepta 'true' como permiso. == mezcla conversiones y se evita salvo un caso consciente.
- condición ? valorA : valorB es ternario. Usar demasiados ternarios anidados hace más difícil leer reglas.
- ... en un objeto copia propiedades; {...d, nombre} reemplaza sólo nombre. En un arreglo agrega/copía elementos. Es copia superficial: los objetos anidados no se clonan automáticamente.
- const { data, error } = ... desestructura un resultado. const { generos, ...datos } separa géneros del resto del formulario.
- `Texto ${valor}` es template literal. [tipo] o [id] crea clave dinámica en un objeto. [] en HTML representa binding de propiedad, no lo mismo.
- => define función flecha y conserva this léxico. void llamadaAsync() descarta el valor de la Promise; no maneja automáticamente sus errores.

### 5.4 Arreglos, Set y Map

map transforma cada elemento; filter conserva los que cumplen; find obtiene el primero o undefined; some responde si existe alguno; every si todos; reduce acumula; flatMap transforma y aplana un nivel. sort muta el arreglo receptor: copiar antes si no se quiere modificar el estado original. Set elimina repetidos y da size/has; Map relaciona clave con dato, como solicitud de canje por recompensa.

En contigüidad, Set detecta repetidos y filas/bloques distintos. En resumen de butacas, Set permite consultar ocupación sin recorrer toda la lista repetidamente. En candy, filter elimina la línea anterior antes de incluir el nuevo valor, evitando duplicados tipo/id.

### 5.5 Promises, async/await y try/catch/finally

async devuelve Promise; await espera ese resultado sin bloquear todo el hilo del navegador. Promise.all ejecuta consultas independientes concurrentemente y rechaza si falla una; no crea transacción ni cancela las otras peticiones. Promise.race termina cuando la primera se resuelve/rechaza; las otras tareas pueden seguir, como la baja Push cuando vence el timeout.

try contiene operación; catch presenta o transforma error; finally restaura ocupado aunque haya fallo o return. Un throw de backend no debería convertirse en éxito visual. Un éxito de escritura seguido de fallo al refrescar tampoco debería decir “operación fallida”: podría provocar un segundo canje o compra.

setTimeout(..., 0) no significa ejecutar inmediatamente: programa otra tarea del event loop. AuthService usa esa separación para consultar el perfil fuera del callback que mantiene un lock del SDK.

### 5.6 Decoradores y servicios de la versión usada

@Component declara selector, imports y plantilla/estilo; @Directive comportamiento de elemento; @Pipe transformación de presentación. Standalone es el enfoque de este proyecto: las dependencias de plantilla se listan en imports del componente, sin un NgModule nuevo.

El código usa @Service() de la versión instalada de Angular: registra el servicio automáticamente en inyección salvo que se indique autoProvided:false. SupabaseService usa @Injectable({ providedIn: 'root' }). No reemplaces mentalmente todos los decoradores con ejemplos de Angular antiguo. inject(Servicio) obtiene la instancia del sistema de inyección; no equivale a new Servicio() ni a llamar una API.

providers define cómo resolver una dependencia. { provide: RouteReuseStrategy, useClass: RutaIdentidadStrategy } sustituye la estrategia base. InjectionToken permite inyectar una abstracción que no es una clase concreta, como NAVEGADOR_PUSH; en tests se reemplaza el navegador por un doble.

### 5.7 Signals: leer, escribir, derivar y efectos

signal(valor) crea estado reactivo. Se lee con estado(), se reemplaza con set y se actualiza en función del anterior con update. Para listas/objetos se construye otra referencia; mutar datos().campo directamente no es el patrón de actualización del proyecto.

computed calcula un valor derivado según las señales leídas, por ejemplo rol, total, filas o pedido. Evita mantener dos estados independientes que podrían divergir. effect ejecuta un efecto al cambiar dependencias, como regenerar imagen QR o reaccionar a pérdida de sesión. onCleanup impide aplicar generación QR vieja; no aborta necesariamente la Promise de la biblioteca.

asReadonly expone lectura sin set/update al consumidor. linkedSignal ofrece estado editable que se reinicializa al cambiar una fuente: borrador de función al cambiar el input, imagen al cambiar src, solicitud de lote al cambiar pedido. No se usa para afirmar un saldo autoritativo.

### 5.8 Inputs, outputs, model y consultas de vista

input.required<T>() obliga a que el padre pase un valor; input(default) tiene default. output<T>() emite un evento sin llamar por sí mismo a Supabase. model() admite entrada/salida para binding bidireccional del componente. No es la misma API que ngModel de formularios template-driven.

viewChild<ElementRef<...>> obtiene referencia a un elemento renderizado; puede ser undefined antes de aparecer. ElementRef.nativeElement permite focus, lectura de validity o cámara. afterNextRender espera a que Angular haya actualizado el DOM antes de enfocar un título; evita buscar un control que todavía no existe.

En campo-auth, campo() lee el input que contiene un FieldTree y campo()() obtiene el estado de ese campo. No son “paréntesis repetidos por error”: hay dos funciones/lecturas en niveles distintos.

### 5.9 Plantillas: bindings y control de flujo

{{ expresion }} interpola texto escapado. [disabled] enlaza propiedad DOM; [attr.aria-label] enlaza atributo ARIA; [class.vip] agrega/quita clase; (click) escucha evento; $event es el evento recibido. [(busqueda)] enlaza entrada y cambio de un model; no autoriza datos.

@if renderiza condicionalmente; @if (datos(); as d) guarda alias no nulo dentro del bloque. @for recorre y track b.codigo identifica una fila/elemento estable para reutilizar DOM. track $index es apropiado si la posición representa un contenido estable; IDs son mejores cuando se insertan/reordenan entidades. @empty muestra lista vacía; @switch selecciona una sección según tipo. No confundir vacío con error de carga.

{{ minutos | duracion }} aplica pipe; DatePipe recibe formato y zona '-0300'; precioArs usa Intl con es-AR/ARS. Pipe transforma presentación; directiva cambia comportamiento/atributos; componente aporta una vista con su propia plantilla. Los tres no reemplazan controles SQL.

### 5.10 Reactive Forms y Signal Forms

Reactive Forms: FormControl valor y validación; FormGroup conjunto; FormBuilder.nonNullable evita null tras reset; Validators y funciones custom devuelven errores. getRawValue incluye controles deshabilitados; value puede omitirlos. markAllAsTouched activa mensajes; reset debe ocurrir después del éxito y no borrar un borrador rechazado.

Signal Forms: form(datos, esquema) construye árbol de campos sobre señal; FormField conecta input; required/email/min/max/maxLength/validate declaran reglas. campo().invalid(), touched() y errors() son lecturas reactivas. disabled(f, ...) sincroniza estado de envío. Se usan ambas APIs de forma deliberada: RF-78 exige validator Reactive Forms, mientras otros flujos emplean Signal Forms. No se afirma que todo el proyecto use un único sistema de formularios.

Frontend valida rápido para UX. Servidor valida identidad, tiempos y economía porque el usuario puede evitar el formulario y mandar HTTP manualmente.

### 5.11 Fechas, expresiones regulares y dinero

Date es un instante; datetime-local es hora civil sin zona. instanteArgentina interpreta -03:00 explícito y convierte a ISO; valida partes para que 30 de febrero no se normalice silenciosamente. fechaArgentina usa America/Argentina/Buenos_Aires, no la zona del dispositivo. sv-SE se usa para salida YYYY-MM-DD, no porque el cine sea sueco.

RegExp /^...$/ exige coincidencia completa; \d es dígito; {n} repetición; (?:...) grupo sin captura; i ignora mayúsculas. Un regex de UUID comprueba formato, no existencia, propiedad ni derecho a usarlo. Igual con MIME o ruta: UX no equivale a autorización.

Number.isFinite rechaza NaN/Infinity; Number.isInteger exige entero; Math.floor trunca puntos positivos. toFixed produce texto con decimales, no una moneda exacta de backend. El servidor usa numeric y reglas de redondeo; no acepta total del cliente como autoridad económica.

### 5.12 SCSS, diseño y accesibilidad

styles.scss usa @use para parciales globales. El prefijo _ indica parcial SCSS; no es una carpeta ni un archivo que se ejecute en Angular. :root declara custom properties CSS como --surface; var(--surface) las consume en runtime. SCSS se transforma en CSS en build.

:host selecciona anfitrión del componente; & anida selector; @media adapta a tamaño; grid/flex ordenan layout; minmax y auto-fit acomodan columnas; :focus-visible marca foco de teclado. Los estilos de componentes normalmente usan encapsulación emulada, no Shadow DOM necesariamente.

label/for asocia campo; aria-describedby conecta ayuda/error; aria-pressed comunica selección; role=status anuncia novedades y role=alert errores. Texto, estado y etiquetas no dependen sólo de color. El plano tiene región desplazable y teclado. AXE sin fallos en tests no acredita WCAG completa.

## 6. Problemas difíciles y cómo los resuelve el código

### 6.1 Dos compradores eligen la misma butaca

Problema: ambos pueden leer “libre” antes de confirmar. Solución: UI orientativa y final SQL con lock de función, mutex económico, revalidación y unicidad parcial de (funcion_id,butaca) cuando activa. Si otro confirmó primero, el segundo recibe conflicto y todo su pedido revierte. El índice es segunda barrera incluso si la lógica de aplicación se equivoca. No basta disabled ni Realtime; falta prueba real multiconexión para certificar comportamiento remoto y capacidad.

### 6.2 Se pierde la respuesta después del commit

Problema: el cliente no sabe si compró y reintenta. Solución: misma solicitud UUID vinculada a propietario y contenido; la Edge y SQL recuperan la compra previa. Otro UUID podría crear otra operación válida, por eso no se genera uno nuevo en cada clic. La UI actual conserva la solicitud durante la vida de esa instancia; no la persiste como pedido recuperable universal después de recargar o cerrar navegador. Esa es una limitación que no debe ocultarse.

### 6.3 PDF o QR falla

Problema: comprar primero y generar documento después deja una compra incompleta. Solución: documento preparado antes del commit y persistido junto al snapshot. Si render falla no se llama al commit; si la cotización cambió mientras se renderiza, el commit rechaza. documento_pdf descarga el binario emitido y no lo reconstruye con precios actuales. El render Edge mide ancho tipográfico: una W y una i no ocupan lo mismo. Limpia sólo representación no soportada por Helvetica, no modifica ficha ni pedido original.

### 6.4 Auth puede quedar bloqueado o restaurar una sesión vieja

Problema: consultar perfil dentro del callback del SDK puede retener su lock; getSession viejo o consulta lenta puede terminar después de logout. Solución: programarSincronizacion separa con setTimeout, revision identifica estado vigente, cargarPerfil descarta resultados de otra revisión y esperarSincronizacion espera la última Promise. Ante fallo de perfil no se conceden permisos ni se toma rol de metadata. Tests cubren esos cruces.

### 6.5 Cambio de ID reutiliza pantalla con datos anteriores

Problema: el router podría conservar una instancia al pasar de película/función/compra A a B, y snapshot leído al construir seguiría apuntando a A. Solución: RutaIdentidadStrategy exige misma configuración y mismos parámetros de identidad. Cambiar sólo query mantiene estado; cambiar ID crea instancia distinta y limpia listeners de la anterior.

### 6.6 Se cruzan dos consultas

Problema: la respuesta más vieja llega última y pisa datos nuevos. Solución: revisionCarga y comparación antes de set en inicio, catálogo y detalle; destrucción incrementa revisión. Otros componentes bloquean carga paralela con enCarga/cargando. Son estrategias diferentes: no afirmar que todas las peticiones del proyecto se cancelan con AbortController.

### 6.7 Formulario válido al abrir, horario vencido al guardar

Problema: esperar varios minutos puede convertir la fecha en pasada. Solución: errorInicioFuncion compara contra Date.now al enviar y SQL revalida el reloj tras locks. El servidor no confía en reloj del comprador. Vigencias no editadas preservan segundos históricos para no cambiar condiciones por un formato visual de minutos.

### 6.8 Stock de combo se descuenta mal

Problema: un mismo producto está suelto y en varios combos. Solución: consumo agrupado por producto y multiplicado por cantidad de combo, validado bajo mutex. El carrito manda IDs/tipos/cantidades, no un stock nuevo. Cancelación repone los componentes efectivamente consumidos, no la composición actual de un combo cambiado.

### 6.9 Canje confirmado pero lectura de saldo falla

Problema: reportarlo como fallo incentiva repetir el canje. Solución: BeneficiosComponent.ejecutar distingue operación y refresh, muestra éxito y “no repitas”, limpia saldos obsoletos. El pedido idempotente protege además respuesta incierta. No toda UI administrativa distingue con idéntico detalle escritura/refresco: reconocer mejoras pendientes.

### 6.10 Reseña existente sin comentario recibido

Problema: un backend antiguo entrega estrellas pero no texto; precargar vacío y guardar destruiría comentario. Solución: parser distingue undefined/null/string y editor exige contrato nuevo y reseña completa. También conserva borrador si usuario escribió antes de actualizar. El archivo histórico se mantiene, una cuenta aporta un voto.

### 6.11 Subida de imagen fallida o engañosa

Problema: MIME falso, tamaño grande, sobrescritura que altera referencias históricas o URL arbitraria de producto. Solución: formatos admitidos, 5 MiB, firma binaria, usuario autenticado y UUID con upsert:false; producto almacena ruta validada. Storage/backend deben reforzar permisos y existencia. Si subió pero falló guardar ficha puede quedar objeto huérfano; no se limpia con DELETE global sin inventario.

### 6.12 Eliminar sin romper historia

Problema: borrar una película/producto puede invalidar compras, reportes y relaciones. Solución habitual: estado lógico y filtros Activos/Eliminados/Todos; misma identidad al restaurar; RPC cambia sólo estado. Excepción sala nunca usada: eliminación física específica, bloqueada si tuvo funciones/mantenimiento, con auditoría. La migración excepcional toma mutex antes de sala, mientras otras operaciones usan otro orden; revisar coordinación/posibles deadlocks es una mejora antes de certificar concurrencia.

### 6.13 Push con otra cuenta en navegador compartido

Problema: permiso y suscripción del dispositivo sobreviven a la cuenta; una respuesta tardía puede asociarse mal. Solución: consentimiento explícito por cuenta/dispositivo, revisión, comparación de usuario, baja al salir y backend con revisión de suscripción y descarte de pendientes del titular previo. Baja local/remota parcial informa límites. HTTP aceptado no garantiza recepción y en tránsito puede llegar después de desactivar; payload mínimo reduce exposición.

### 6.14 Cachear lo que no corresponde

Problema: guardar todas las respuestas Supabase podría mostrar saldo o QR de otra sesión. Solución: endpoint GET exacto de cartelera pública, clave sin JWT sólo porque los datos son públicos, antigüedad limitada y datos privados excluidos. cine_mis_beneficios materializa alertas: no es una lectura pura ni debe entrar al caché por llamarse “mis”.

### 6.15 Confundir Excel con texto y fórmulas

Problema: CSV renombrado no cumple Excel real; texto de catálogo podría interpretarse como fórmula. Solución: ZIP/OOXML con relaciones y inlineStr para todo texto. Tests inspeccionan firma ZIP y XML. Exportador propio evita dependencia pesada pero requiere mantener formatos, límites y pruebas de apertura: esa complejidad es un costo de la decisión.

## 7. Seguridad, datos y backend que también te pueden preguntar

Autenticación responde quién sos; autorización, qué podés hacer. Supabase Auth resuelve identidad y token; perfiles.rol/activo decide capacidad actual. Modificar metadata o localStorage no debería cambiar permisos de SQL. Un perfil inactivo con sesión no es un invitado autorizado a eludir controles.

Guardas sólo gobiernan navegación. Ocultar botón admin es UX. RLS gobierna filas, grants gobiernan operaciones y funciones privilegiadas verifican rol y titularidad internamente. SECURITY DEFINER ejecuta con permisos de su propietario: necesita search_path controlado, nombres cualificados y grants cerrados. No asumir que RLS habilitada protege TRUNCATE o una función mal autorizada.

Frontend incluye URL/anon pública desde environment generado. Es información visible por diseño, no service_role. Variables de entorno evitan versionar configuración, pero al compilar el frontend sus valores públicos son visibles. service_role y VAPID privada deben estar sólo en backend/Vault, nunca en src ni en el Word.

CORS limita orígenes de navegador, no autentica ni bloquea un cliente HTTP externo sin Origin. Invitado necesita medidas antiabuso adicionales antes de operar comercialmente. Un UUID impredecible reduce adivinación pero un enlace filtrado sigue otorgando acceso por posesión.

El código Angular escapa interpolación, pero eso no sustituye controles backend ni una auditoría de XSS. No se deben registrar JWT, QR, tokens, contactos ni PDF en logs. Mostrar menos en el visor tampoco elimina secretos conservados en la auditoría privada histórica.

Modelo físico principal: auth.users ↔ perfiles; peliculas ↔ generos mediante peliculas_generos; sala → funciones; función → compras; compra → entradas/candy/documento; usuario → movimientos/canjes/alertas/reseñas. La butaca normativa se genera en SQL y mantenimiento va aparte, no hay un editor geométrico persistido por asiento.

Índice parcial sólo impone unicidad a filas activas; permite conservar entradas canceladas. Foreign keys preservan relaciones; CHECK limita valores; transacción asegura todo o nada; locks coordinan escritores. Normalizar catálogo no impide guardar snapshot desnormalizado de emisión: ese snapshot conserva lo que se vendió y no debe seguir cambios del catálogo actual.

Migraciones son evolución SQL, no respaldo de ventas/cuentas/Storage. Ver archivo local no prueba instalación remota. Se debe consultar la última definición de función: varias migraciones reemplazan cuerpos anteriores. Reaplicar todo en un servidor existente o ejecutar db push sin inspección puede romper historia. Esta guía no autoriza ninguna instalación.

## 8. Pruebas y cómo defender la evidencia

Los archivos .spec.ts no son pantallas: Vitest ejecuta sus describe/it/expect y Angular TestBed construye componentes/servicios. Doble de Supabase, fake timers, DOM de jsdom e InjectionToken de navegador permiten repetir condiciones difíciles. El catálogo de archivos enumera los escenarios declarados de cada test.

Prueba unitaria verifica una función o servicio aislado. Prueba de componente verifica DOM e interacción con servicios simulados. Prueba SQL local verifica reglas y restricciones con PGlite. Prueba de integración remota verifica contratos instalados; concurrencia necesita conexiones independientes; end-to-end debe recorrer navegador/backend/dispositivo reales. Son niveles complementarios, no intercambiables.

Comandos útiles, desde la raíz:

```powershell
npm test -- --watch=false
npm run build
npm run verify:documento
npm run verify:integridad
npm run verify:catalogo
npm run verify:resena-unica
npm run verify:cache
npm run verify:push-worker
```

La suite Angular se volvió a ejecutar para preparar esta guía; el resultado exacto se adjunta en el capítulo de verificación. Los otros comandos son referencia, no se presenta su lista como ejecuciones realizadas aquí. pretest/prebuild generan environments desde configuración local. No divulgar esos valores en capturas.

Pruebas a mostrar: contigüidad cruzando pasillo, minoría de edad, idempotencia de reintento, descarte de respuesta vieja, selección que se ocupa, rechazo que conserva formulario, QR independiente y exportación OOXML. Pedir dos sesiones reales para concurrencia y consentimiento real para Push; no simular éxito remoto a partir de un mock.

Una cobertura numérica alta no demuestra ausencia de bugs. Tests comprueban las condiciones programadas y el runtime elegido; no todos los dispositivos ni todas las carreras. Hay un antecedente documentado de incompatibilidad Edge con encoding ECDH que no apareció en Deno local; refuerza la necesidad de probar el runtime de despliegue.

## 9. Preguntas probables con respuestas de defensa

### 9.1 ¿Por qué Angular y Supabase?

“Son tecnologías exigidas por la consigna. Angular me aporta componentes, rutas, formularios y estado reactivo; Supabase integra Auth, SQL, Storage, Realtime y Edge. No agregué Express porque no era necesario para esta escala. No significa que Supabase elimine diseñar reglas o seguridad.”

### 9.2 ¿Dónde está el backend si sólo me mostrás src?

“src contiene el cliente. El backend está en supabase/functions y supabase/migrations. La regla comercial crítica no está en el botón: la Edge verifica el pedido y una RPC SQL confirma de forma atómica.”

### 9.3 ¿Por qué cuatro carpetas y no una de componentes y otra de servicios?

“Separé capacidades globales, acceso a datos, casos de uso y reutilizables. Así ubico un cambio por dominio y limito mezcla de UI y contratos. Conservo algunas ubicaciones históricas y llamadas directas; no digo que sea una arquitectura sin excepciones.”

### 9.4 ¿Qué hace una signal que no hace una variable normal?

“Angular puede rastrear las lecturas y actualizar consumidores cuando cambia. computed deriva estado sin sincronización manual. Una variable normal no notifica por sí misma. La signal no guarda automáticamente en base ni persiste tras recargar.”

### 9.5 ¿Por qué no usaste NgRx?

“El estado compartido del alcance se resuelve con servicios y signals, como sesión y carrito. Un store externo habría agregado configuración. Si creciera la coordinación o trazabilidad del estado, revisaría esa decisión.”

### 9.6 ¿Todo es standalone? ¿Dónde está AppModule?

“La aplicación arranca con bootstrapApplication y cada componente declara imports. No necesito un AppModule nuevo. Standalone no significa sin inyección ni sin configuración global.”

### 9.7 ¿Un guard alcanza para seguridad?

“No: se puede evitar el router y hacer HTTP. El guard mejora navegación y refresca perfil; RLS, grants y RPC vuelven a autorizar en servidor. El rol se obtiene de perfiles, no de metadata editable.”

### 9.8 ¿Cómo evitás dos ventas simultáneas?

“No con el mapa. Al confirmar se bloquean función y recursos económicos, se vuelve a validar y el índice parcial impide dos entradas activas para función/butaca. La segunda compra falla sin efectos parciales. Necesito conexiones reales para certificar concurrencia remota.”

### 9.9 ¿Por qué Realtime si igual revalidás al comprar?

“Porque evita que el usuario trabaje mucho tiempo con disponibilidad vieja. Tiene polling de respaldo, pero puede haber latencia. Sólo el commit sabe si el asiento puede venderse en ese instante.”

### 9.10 ¿El carrito reserva la butaca durante quince minutos?

“No. Quince segundos es polling, no tiempo de reserva. El carrito está en memoria y otra persona puede comprar primero. Hay pendientes históricos, pero no son la etapa del checkout simulado actual.”

### 9.11 ¿La Edge Function es una transacción?

“No por tener async/await ni por hacer varias RPC. Las peticiones HTTP no comparten transacción. La Edge prepara PDF/QR y delega el commit completo a una RPC PostgreSQL.”

### 9.12 ¿Qué pasa si cambia precio después de cotizar?

“La firma detecta cambios locales; Edge y SQL recalculan. Si el snapshot esperado no coincide se rechaza y hay que recotizar. No se cobra el total que escribió el navegador.”

### 9.13 ¿Qué pasa si compro y se corta la respuesta?

“Reintento la misma solicitud y contenido. Recupero el comprobante, no inserto otra compra. La protección del UI no reemplaza idempotencia backend; la instancia actual no conserva ese pedido universalmente después de recargar.”

### 9.14 ¿PDF en frontend o backend?

“Compra nueva: PDF backend antes del commit y persistido con snapshot. Frontend descarga el emitido. jsPDF también se usa para reportes y compatibilidad de compras históricas; no para autorizar nuevas entradas.”

### 9.15 ¿El QR contiene los datos personales o el token del enlace?

“Contiene un UUID de compra para validar prestaciones, distinto del token de lectura. No contiene contacto. Es secreto portador y debe protegerse aunque no tenga nombre.”

### 9.16 ¿Escanear ya valida el ingreso?

“No, sólo lee un UUID y completa el campo. Operador elige función/prestación y confirma con el botón. El resultado de autorización y consumo lo decide SQL.”

### 9.17 ¿Por qué el mismo QR funciona después de ingresar?

“Si contrató candy y todavía no lo retiró, esa prestación sigue pendiente. Ingreso y candy se invalidan por separado. Al agotar todo no quedan prestaciones utilizables.”

### 9.18 ¿Un adulto acompañante permite comprar al registrado menor?

“No en esta consigna. Se exige impedir compra registrada por edad y además imprimir leyenda de adulto en restringidas. Son condiciones distintas. Invitado confirma edad declarada; no hay verificación documental de identidad.”

### 9.19 ¿Por qué el pipe edad no protege el sistema?

“Porque es presentación en navegador y puede eludirse. El servidor calcula edad comercial según perfil. La directiva sólo comunica/deshabilita visualmente.”

### 9.20 ¿Por qué dos APIs de formularios?

“Conservé Reactive Forms para editores y el custom validator pedido por RF-78, y usé Signal Forms en otros flujos. Una migración masiva no aportaba una mejora necesaria. Ambas dan UX; SQL valida integridad.”

### 9.21 ¿Por qué controlar el bloque además de la fila?

“Porque numeración consecutiva puede cruzar un pasillo. En A4+A5 o J2+J3 se corta contigüidad física. La fórmula de columnas se aplica después de exigir mismo bloque y ausencia de duplicados.”

### 9.22 ¿532 no debería ser 560?

“560 sería veinte filas de 28. J/K reemplazan cada una 28 por 14: 560 − 28 = 532. No es una fila combinada J/K.”

### 9.23 ¿Cumplís edición de distribución RF-15?

“Parcialmente: implementé plano fijo de la consigna, adaptación y bloqueo/restauración de mantenimiento, no edición libre de filas, columnas y tipos. Necesito aceptación de ese alcance; no lo presento como un editor geométrico completo.”

### 9.24 ¿Por qué no puedo reprogramar una función con compras?

“Porque cambiar horario/sala dejaría documentación ya emitida incorrecta. Bloqueo hasta tener un procedimiento seguro de compensación y reemisión. Conservar integridad es preferible a cambiar silenciosamente lo comprado.”

### 9.25 ¿Qué ocurre al borrar una película o una sala?

“La baja normal es lógica y recuperable, conserva identidad e historia y puede bloquearse por compromisos. Hay una excepción de sala vacía sin funciones/mantenimiento que permite DELETE auditado. No borro compras para aparentar cumplir.”

### 9.26 ¿Cómo elegís la sala automáticamente?

“SQL recorre salas activas/adaptadas disponibles con intervalo completo de duración y limpieza. Angular manda p_sala:null. Un orden determinista evita selección arbitraria; no es optimización de ocupación ni distribución entre edificios.”

### 9.27 ¿Qué significa todo o nada en programación por rango?

“No guardo sólo algunas fechas si otra falla. La RPC revierte el lote entero y puede reintentarse con la misma solicitud. La preview no asegura que siga habiendo sala al confirmar.”

### 9.28 ¿Por qué no usás la hora de mi computadora?

“La interfaz muestra hora civil argentina y convierte inputs de forma explícita. SQL usa reloj de servidor para plazos y venta. El reloj cliente sólo anticipa errores, no autoriza.”

### 9.29 ¿Por qué un punto por peso y no por total de compra?

“Se calcula sobre a_pagar después del cupón y crédito. En total $8.000 con crédito $3.000 sólo resto $5.000 genera puntos. Es la regla vigente; movimientos históricos mantienen su tasa original.”

### 9.30 ¿Por qué saldo de puntos total y disponible difieren?

“Protejo puntos de compras aún cancelables para no canjearlos y luego revertirlos provocando deuda. Es una regla adicional declarada, no una frase literal del Word.”

### 9.31 ¿Cancelar devuelve el cupón o borra el PDF?

“No. Compensa con crédito, repone stock y revierte puntos originales; no devuelve uso del cupón ni primera compra. Documento persiste como constancia; estado actual deshabilita prestaciones.”

### 9.32 ¿Reseñas por entrada, por compra o por película?

“Una vigente por cuenta/película. Distintas compras leen la misma. La cuenta aporta un voto al promedio; archivo por compra anterior se conserva. Para escribir exijo ingreso validado; candy no lo habilita.”

### 9.33 ¿Por qué validar JSON si TypeScript ya tiene interfaz?

“La interfaz desaparece al compilar y la red entrega datos externos. Un cast no verifica nada. Uso unknown y parsers para rechazar ausencia o forma inválida; un saldo faltante no se convierte en cero.”

### 9.34 ¿No hay categorías de candy separadas?

“En esta versión categoría es un texto de producto. La ruta de categorías redirige a productos; no sostengo que exista un ABM de entidad categoría con tabla propia.”

### 9.35 ¿Cuándo el ranking y el reporte dan cifras diferentes?

“Porque uno usa vendidas y el reporte de vistas usa ingreso validado y un período. También canceladas se excluyen. Hay que explicar fecha y métrica, no comparar cantidades sin contexto.”

### 9.36 ¿El Excel es un CSV disfrazado?

“No, es un ZIP OOXML con workbook, relaciones y worksheets. Strings son inlineStr y números se escriben numéricos. Se prueban estructuras; el exportador propio exige mantenimiento de formato.”

### 9.37 ¿CRC32 asegura que el reporte no fue manipulado?

“No: verifica integridad de ZIP, no autenticidad criptográfica. No es firma digital ni certificación fiscal.”

### 9.38 ¿Puedo comprar sin internet porque es PWA?

“No. Sólo cartelera pública reciente tiene respaldo. Operaciones económicas y privadas requieren red; la PWA no inventa disponibilidad ni guarda compras offline para enviarlas después.”

### 9.39 ¿La bandeja es una notificación Push?

“No, la bandeja vive en base y se consulta al entrar. Push usa suscripción de dispositivo, worker y emisor. Son canales diferentes y requieren consentimiento separado.”

### 9.40 ¿Los recordatorios muestran QR como pide RF-79/80?

“Actualmente no en el payload: abren cuenta protegida para ver sala/horario/QR. Priorizamos privacidad en pantalla bloqueada. Es una diferencia explícita pendiente de aceptación; recepción real también necesita prueba.”

### 9.41 ¿Recibir HTTP 200 del emisor significa que llegó Push?

“No. Puede ser un lote vacío o aceptación por proveedor. Hay TTL, permisos y comportamiento del SO. Sólo una prueba en dispositivo acredita recepción.”

### 9.42 ¿Por qué no se pide permiso Push apenas abro la página?

“Porque consentimiento debe ser explícito. Consultar estado no molesta ni suscribe; el botón inicia permiso y se vincula a cuenta/dispositivo vigentes.”

### 9.43 ¿Por qué apagar la cámara al salir?

“Para no dejar tracks de MediaStream ni callbacks vivos y liberar el dispositivo. DestroyRef llama detener y revision evita reactivar tras una inicialización tardía.”

### 9.44 ¿Cómo maneja login con Google/GitHub?

“Hay botones, signInWithOAuth y callback, pero necesitan proveedor configurado en Supabase y credenciales del propietario. Callback proveedor y retorno frontend son URLs distintas. Existencia de código no prueba login operativo.”

### 9.45 ¿Qué datos personales son necesarios?

“Fecha de nacimiento participa en edad y segmento. Sangre, ojos y vacaciones están por consigna aunque no tienen uso comercial directo. Antes de producción revisaría minimización, consentimiento y retención; no invento un uso médico del sistema.”

### 9.46 ¿Qué cambia logout?

“Intenta baja del dispositivo Push y cierra sesión local del SDK; no revoca todas las sesiones de todos los dispositivos. App redirige si una ruta protegida quedó sin autorización.”

### 9.47 ¿Qué pendiente priorizarías antes de producción?

“Aceptación de diferencias de alcance, OAuth y Push reales, pruebas multiconexión, revisión integral de permisos/defaults, privacidad de auditoría, antiabuso del invitado y estrategia de backup/restore. No agregaría pagos reales sin redefinir alcance y seguridad.”

### 9.48 ¿Qué refactor mejorarías sin cambiar reglas?

“Separaría más el componente extenso de programación/ofertas, movería las llamadas directas restantes a servicios, uniformaría estados de carga y distinguiría sistemáticamente escritura exitosa de refresh fallido. Lo haría con tests de regresión, sin reescribir todo por estética.”

### 9.49 ¿Qué límite tiene el mutex global?

“Prioriza integridad y simplifica stock/cupones/saldos, pero reduce paralelismo. No quitaría lock sin medir y diseñar coordinación más granular. También revisaría orden común de locks en nuevas operaciones.”

### 9.50 ¿Asegurás que está todo terminado?

“No. Puedo demostrar código y pruebas locales, distinguir recorridos publicados y reconocer dependencias/puntos parciales. El sistema no se presenta como certificado al 100% ni como fiscal, multiestablecimiento o cobro real.”

## 10. Plan de demostración y repaso

### 10.1 Demo segura de aproximadamente diez minutos

1. Abrir inicio: ranking primero y explicación ventas/vistas. Mostrar /peliculas y un filtro combinado real.
2. Abrir detalle: duración pipe, reseñas, fecha argentina, funciones y edad/directiva.
3. Seleccionar A1+A2 y luego probar A4+A5: mostrar validator. Explicar que no retiene asientos.
4. Candy: cambiar cantidad, generar inválida y corregir. Mostrar que producto/combo tienen clave distinta.
5. Checkout: cotizar, cambiar pedido y observar invalidez de cotización anterior. Explicar pago simulado e idempotencia.
6. Sólo con datos designados y permiso: confirmar una compra y descargar PDF. No exponer QR/token en proyector público ni consumir entradas ajenas.
7. Cuenta: historial, puntos/crédito y explicación de reseña antes/después de ingreso. Cancelar sólo compra autorizada y dentro de reglas.
8. Operación: explicar cámara/manual y funciones/prestaciones; consumir sólo compra de ensayo explícita. Dejar claro que escanear no confirma.
9. Administración: crear/editar con registro de prueba autorizado, preview de lote, reportes y exportación. No borrar salas/datos reales para una demo.
10. PWA/Push: explicar alcance offline y consentimiento. Mostrar estado real disponible o pendiente, no un éxito inventado.

Si no tenés autorización para escrituras, demostración de navegación, lectura y tests es válida pero no debe anunciarse como recorrido económico real completo.

### 10.2 Archivos para tener abiertos

src/main.ts; src/app/app.config.ts; src/app/app.routes.ts; core/auth/auth.service.ts; core/guards/rol.guard.ts; shared/cine/reglas.ts; features/cine/reserva.component.ts; features/compra/checkout.component.ts; data-access/cine/checkout.service.ts; shared/entradas/qr-compra.component.ts; shared/reportes/exportaciones.ts. Además supabase/functions/confirmar-compra/handler.ts y la definición SQL vigente de cine_comprar_documento.

### 10.3 Diez frases que debés poder explicar sin leer

- El carrito no reserva butacas.
- Auth identifica; perfil y SQL autorizan.
- El guard no reemplaza backend.
- Una Edge con varias llamadas no comparte una transacción.
- La RPC final hace el commit atómico y revalida.
- Misma solicitud permite recuperar la operación tras respuesta perdida.
- QR y token de lectura son distintos; las prestaciones se consumen por separado.
- Frontend valida UX; SQL valida negocio e integridad.
- PWA no implica compra offline ni Push recibido.
- Implementación local, despliegue y aceptación docente son evidencias diferentes.

### 10.4 Qué no decir

No decir “todo es tiempo real garantizado”, “RLS me da seguridad total”, “la anon key debe ocultarse al usuario”, “el PDF frontend confirma la compra”, “todas las salas se pueden borrar”, “el plano es totalmente editable”, “Push trae el QR”, “mocks prueban concurrencia”, “pago en boletería”, “se devuelven pesos reales”, “tipo interface valida JSON” ni “no hay ningún DELETE”. Cada frase contradice un límite o un mecanismo del código actual.
