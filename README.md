## Cine Aurora — Sistema de cine
![Uploading Captura de pantalla 2026-10-07 182625.png…]()


Aplicación web progresiva para administrar un cine de varias salas y permitir la
compra **simulada** de entradas y productos de candy. El proyecto está pensado
para una entrega académica: no procesa dinero real, no reemplaza un sistema
contable y no incluye aplicaciones nativas.

**Demo publicada:** <https://cine-aurora.vercel.app>

## 1. ¿Qué resuelve?

El sistema reúne en una misma aplicación:

- Cartelera, próximos estrenos, búsqueda, filtros, géneros y ranking de ventas.
- Compra como invitado o cliente registrado, con selección de 1 a 8 butacas.
- Candy, combos, cupones, crédito, puntos y recompensas.
- Comprobante digital PDF, QR y consulta segura de la compra.
- Historial, películas vistas, reseñas, alertas y notificaciones Web Push.
- Operación de empleado: validar entrada o retirar candy desde el mismo QR.
- Backoffice de administrador: películas, géneros, salas, butacas, funciones,
  programación por rango, precios, ofertas, usuarios, reportes y auditoría.

### Actores

| Actor | Puede hacer |
| --- | --- |
| Invitado | Consultar cartelera y comprar con un enlace privado; no tiene beneficios ni historial de cuenta. |
| Cliente | Comprar, cancelar dentro de las reglas, consultar historial, reseñar y usar beneficios. |
| Empleado | Validar una entrada o la prestación de candy de una función seleccionada. |
| Administrador | Gestionar catálogo y operación, usuarios, reportes y auditoría. |

## 2. Flujo principal

1. El visitante consulta una película y una función.
2. Selecciona butacas disponibles y, opcionalmente, productos o combos.
3. El checkout vuelve a cotizar y valida edad, stock, modalidad, sala y
   disponibilidad en el servidor.
4. `confirmar-compra` genera el QR y el PDF antes de confirmar el conjunto.
5. PostgreSQL ejecuta la compra como una operación atómica: entradas, stock,
   beneficios, puntos, comprobante y notificación se guardan juntos o se
   rechazan juntos.
6. El QR permite consumir **una** prestación: entrada o candy. El token del
   comprobante es distinto del QR y no se expone en logs.

El carrito del navegador es solo una ayuda visual: no reserva butacas. La
autoridad final siempre es la base de datos, que usa locks, restricciones e
idempotencia para evitar sobreventa y compras duplicadas.

## 3. Arquitectura

```text
Angular SPA/PWA
├── core/          Auth, sesión, guards, Supabase, día civil y Web Push
├── data-access/   Servicios, modelos y validación de respuestas
├── features/      Cartelera, compra, perfil, empleados y administración
└── shared/        Componentes, QR/PDF, exportaciones y utilidades

Supabase
├── Auth           Identidad y sesiones
├── PostgreSQL     Datos, RPC, RLS, reglas, locks y auditoría
├── Storage        Afiches y productos públicos
├── Realtime       Eventos públicos para actualizar disponibilidad
└── Edge Functions confirmar-compra y enviar-push
```

Tecnologías principales: Angular 22.2, TypeScript 6, Supabase JS,
PostgreSQL/PLpgSQL, Deno Edge Functions, ZXing, jsPDF, qrcode, Vitest/jsdom y
PGlite. La aplicación usa componentes standalone, lazy loading, signals,
Reactive Forms y Service Worker. En producción el worker cachea únicamente la
cartelera pública; nunca cachea sesión, compras, QR ni datos personales.

## 4. Navegación

- Público: `/`, `/peliculas`, `/proximamente`, `/peliculas/:id`.
- Compra: `/compra/:funcionId/butacas`, `/compra/:funcionId/candy`,
  `/compra/:funcionId/checkout` y `/compra/confirmacion/:compraId`.
- Cuenta: `/perfil`, `/perfil/compras`, `/perfil/peliculas`,
  `/perfil/puntos`, `/recompensas`, `/canjes`, `/credito` y
  `/notificaciones`.
- Auth: `/auth/login`, `/registro`, `/recuperar-password`,
  `/restablecer-password`, `/confirmacion-email` y `/oauth`.
- Administración: `/admin/**`, con catálogo, programación, candy,
  promociones, accesos, reportes y auditoría.
- Empleados: `/empleados/entrada` y `/empleados/candy`.

`authGuard` protege la cuenta; `rolGuard` protege administración y empleados.
Los guards mejoran la navegación, pero la autorización se verifica nuevamente
en Supabase mediante el rol activo de `perfiles`, nunca mediante metadata del
navegador.

## 5. Reglas de negocio importantes

- Las películas activas se separan automáticamente entre cartelera y
  próximamente usando la fecha civil argentina.
- Una función define sala, idioma, formato y precio. Su fin incluye duración
  más 30 minutos de limpieza; no puede superponerse con otra de la sala.
- Las salas tienen 532 plazas distribuidas en filas accesibles, VIP y normales.
  Las butacas pueden mantenerse bloqueadas por mantenimiento.
- Una compra acepta entre 1 y 8 butacas distintas, consecutivas, de la misma
  fila y bloque. La edad y la clasificación se validan en el servidor.
- Stock, descuentos, crédito y puntos se calculan en PostgreSQL, no en el
  navegador. La compra es un pago simulado.
- Las bajas de catálogo son lógicas y recuperables para conservar historia,
  compras y auditoría.
- Una cuenta puede mantener una reseña vigente por película; el historial de
  reseñas se conserva.

## 6. Instalación local

Requisitos: Node compatible con Angular 22.2, npm y un proyecto Supabase
configurado. El repositorio incluye `package-lock.json`, por lo que se instala
con `npm ci`.

```powershell
Copy-Item .env.example .env.local
# Editar .env.local con SUPABASE_URL y SUPABASE_ANON_KEY
npm ci
npm start
```

Abrir <http://localhost:4200>. Para otro puerto:
`npm start -- --port 4325`. Los scripts `prestart`, `prebuild` y `pretest`
generan automáticamente los archivos ignorados de `src/environments/`.
También puede ejecutarse `npm run env:setup`.

Solo se permiten en el frontend la URL y la clave pública `anon`. Nunca
colocar `service_role`, claves VAPID, secretos de Push ni tokens en `.env.local`,
el código Angular o el repositorio.

### Supabase existente

Las migraciones de `supabase/migrations/` deben aplicarse en orden únicamente
en un proyecto nuevo. En el proyecto remoto de esta entrega hay bloques
aplicados manualmente y no se deben repetir ni ejecutar con `db push` a ciegas.
Antes de modificarlo hay que inspeccionar el esquema, respaldar y aplicar solo
un bloque autorizado. El detalle de compatibilidad y despliegue está en
[`docs/arquitectura.md`](docs/arquitectura.md).

## 7. Pruebas y comandos útiles

```powershell
npm test -- --watch=false
npm run build
npm run verify:documento
npm run verify:admin
npm run verify:integridad
npm run verify:experiencia
npm run verify:catalogo
npm run verify:resena-unica
npm run verify:push
npm run verify:push-worker
npm run verify:cache
npm run verify:estructura
npm run verify:publicacion
```

Los verificadores ejecutan regresiones locales de cliente, SQL/PGlite,
administración, documento, PWA, publicación y Web Push. No sustituyen pruebas
de concurrencia real, recepción Push en un dispositivo ni una auditoría del
proyecto Supabase remoto. Las Edge Functions se pueden comprobar con
`deno check` y `deno test` en `supabase/functions/`.


## 8. Documentación complementaria

- [`docs/arquitectura.md`](docs/arquitectura.md): capas, contratos, datos,
  seguridad, PWA, migraciones, despliegue y pruebas.
- [`docs/requerimientos.md`](docs/requerimientos.md): alcance original,
  requerimientos funcionales/no funcionales y trazabilidad.
- [`docs/reglas-negocio.md`](docs/reglas-negocio.md): reglas, tarifas,
  beneficios, cancelaciones, QR y reportes.
- [`docs/decisiones-tecnicas.md`](docs/decisiones-tecnicas.md): decisiones,
  alternativas y pendientes de diseño.

Este README es la explicación ejecutiva para comprender y ejecutar el
proyecto; `docs/` conserva la especificación y la evidencia técnica detallada.
