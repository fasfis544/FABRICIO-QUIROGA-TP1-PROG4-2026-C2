# Cine Aurora — Angular + Supabase + PWA

Aplicación académica de gestión/venta de cine. **Pago simulado: no cobra dinero real.** Frontend publicado: **https://cine-aurora.vercel.app**. Los flujos centrales están implementados; la entrega completa todavía tiene módulos y verificaciones pendientes. Estado y trazabilidad: [documento de requerimientos](docs/requerimientos.md).

## Ejecutar

Node compatible con Angular 22.2 (`node --version`), npm y proyecto Supabase. Instalar:

```powershell
npm ci
```

Copiar `.env.example` a `.env.local` y completar **solo URL y clave pública anon**. En esta PC ya se preservó el entorno anterior en ese archivo. Nunca poner `service_role` en frontend. Los `environment*.ts` son generados/ignorados, no archivos a publicar en Git.

```powershell
npm start
```

Abrir `http://localhost:4200`. Para otro puerto: `npm start -- --port 4325`. Si usás `ng` directamente: ejecutar primero `npm run env:setup`.

## Supabase / activación imprescindible

Consultar [instalación, migraciones y despliegue](docs/arquitectura.md#9-instalación-migraciones-y-despliegue): comprobar esquema existente, ejecutar SOLO un nuevo bloque autorizado, desplegar `confirmar-compra` y configurar CORS, Realtime y OAuth. El repositorio no modifica automáticamente la base remota.

En el proyecto existente las migraciones hasta **`20261015000300`** fueron verificadas en Dashboard: **no repetirlas**. El usuario confirmó baja lógica `20261016000200` y reseña única `20261016000300`. La inspección remota posterior encontró la tabla de reseña única, pero **no encontró `cine_estado_catalogo`**: revisar esa discrepancia antes de usar Eliminar/Restaurar, sin reaplicar bloques a ciegas. **No aplicar después el lector anterior `20261016000100`**: 003 ya incluye lectura propia. Estado detallado en [arquitectura](docs/arquitectura.md#9-instalación-migraciones-y-despliegue).

**Web Push activado en Supabase:** SQL 001 ya instalado y verificado sin repetirlo, claves nuevas privadas, Edge, Vault y Cron cada minuto con HTTP 200. También se instaló una vez `20261017000200_cierre_eventos_publicos.sql`, cierre de permisos de escritura/TRUNCATE autorizado. [Procedimiento y estado](docs/arquitectura.md#94-activación-web-push--procedimiento-y-estado). **Falta consentir dispositivos y comprobar recepción real**; un lote vacío HTTP 200 no demuestra entrega. `npm run push:claves` no debe repetirse sobre claves activas.

`confirmar-compra` fue redesplegada con el ajuste de ancho PDF y CORS del dominio público, sin regenerar comprobantes. Site URL y retornos Auth públicos se configuraron conservando retornos locales; OAuth y plantillas españolas siguen pendientes. No se crearon compras ni se consumieron QR para verificar esta publicación.

## Publicación en Vercel

`vercel.json` define Angular, salida `dist/sistema-cine/browser`, rutas SPA y revalidación de workers. `.vercelignore` excluye entorno privado, backend e IDE; solo URL/anon públicas son variables de build. Proyecto `cine-aurora` en el espacio Hobby autorizado; publicado por CLI, sin commit/push ni enlace automático a GitHub. Futuras publicaciones: `npx vercel deploy --prod --scope plazitas`, con la cuenta correcta autenticada. No subir `.env.push.local`, tokens ni `service_role` al frontend.

En proyecto nuevo las migraciones son ordenadas por nombre (incluido afiches); el esquema inicial es reconstruido y no prueba compatibilidad con un servidor ya existente. No usar `db push` indiscriminadamente después de pegados manuales en SQL Editor.

## Rutas principales

- Público: `/`, `/peliculas`, `/proximamente`, `/peliculas/:id`, `/compra/**`.
- Cuenta activa: `/perfil/**`.
- Administrador: catálogo, salas/funciones, programación por rango, ofertas, auditoría, usuarios/roles y `/admin/reportes/{ventas,peliculas,candy}`.
- Empleado: `/empleados/entrada`, `/empleados/candy` (mismo QR, prestación distinta).
- Login: `/auth/login`, registro, recuperación, callback OAuth.

El rol/estado vienen de `perfiles`, jamás de metadata del navegador. Compra registrada pertenece al usuario verificado; invitado conserva un enlace secreto. No publicar enlaces, QR ni tokens en analítica/capturas.

## Pruebas y build

```powershell
npm test -- --watch=false
npm run verify:documento
npm run verify:experiencia
npm run verify:catalogo
npm run verify:resena-unica
 npm run verify:push
 npm run verify:push-worker
npm run verify:publicacion
npm run verify:cache
npm run verify:estructura
npm run build
```

`verify:documento` usa PostgreSQL local PGlite, no conecta a Supabase. Pruebas del bloque anterior: `npm run verify:db` y `npm run verify:db -- --columnas-existentes` (solo esquema previo, no comportamiento actual completo).

Edge (Deno, o `npx --yes deno`; backend/HTTP simulados en tests):

```powershell
npx --yes deno check --no-config --no-lock --node-modules-dir=none supabase/functions/confirmar-compra/index.ts
npx --yes deno test --allow-env --no-config --no-lock --node-modules-dir=none supabase/functions/confirmar-compra/handler_test.ts supabase/functions/confirmar-compra/handler_adversarial_test.ts
 npx --yes deno check --no-config --no-lock --node-modules-dir=none supabase/functions/enviar-push/index.ts
 npx --yes deno test --allow-env --no-config --no-lock --node-modules-dir=none supabase/functions/enviar-push/handler_test.ts supabase/functions/enviar-push/transport_test.ts
```

Salida de producción: `dist/sistema-cine/browser`. Hosting estático con rewrite a `index.html`, variables públicas y HTTPS. PWA/SWR solo se prueba en producción, no `ng serve`.

## Documentación

- [Arquitectura documentada](docs/arquitectura.md): capas, rutas, contratos, DER, seguridad, PWA, despliegue y pruebas.
- [Decisiones técnicas documentadas](docs/decisiones-tecnicas.md): contexto, alternativas, consecuencias y propuestas pendientes.
- [Documento de requerimientos](docs/requerimientos.md): 85 RF, 14 RNF, prioridades, trazabilidad, casos de uso y aceptación.
- [Reglas del negocio](docs/reglas-negocio.md): 17 RN, precios, plazos, ejemplos, historial y decisiones operativas.

`docs/` contiene solo esos cuatro archivos. La documentación anterior y su copia Word se respaldaron fuera del repositorio antes de retirarlos. **No se afirma cumplimiento integral de los 85 RF**: recepción Web Push, OAuth, discrepancia del catálogo, aceptación docente del plano+mantenimiento/QR privado y varias verificaciones reales siguen pendientes.
