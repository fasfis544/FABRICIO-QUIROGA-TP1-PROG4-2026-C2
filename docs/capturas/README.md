# Galería del producto

Las imágenes de esta carpeta son capturas **de página completa**: desde la
cabecera hasta el pie, incluyendo el contenido fuera del primer viewport.
No son recortes de la ventana ni imágenes compuestas con fragmentos de scroll.

- **Público:** demo de Cine Aurora, sin sesión, escritorio y móvil.
- **Cuenta:** vistas de compras, películas vistas y beneficios compartidas por las
  cuentas registradas, capturadas con la sesión autorizada de Pepe, sin cambiar roles.
- **Administración:** panel y módulos, con acceso administrativo autorizado en local.
- **Fecha:** 21 de octubre de 2026.

Las imágenes conservan el contenido real y sus estados vacíos. Los importes
corresponden a compras simuladas. No se crearon compras ni se modificó el
catálogo para obtenerlas. La ausencia de funciones futuras impide documentar
visualmente una compra nueva en esta sesión; no se presenta un checkout ficticio.

## Privacidad

Antes de publicar, ocultar nombres completos, correos, códigos de cupones
personales, QR y enlaces privados. Estas ocultaciones se aplican **a la imagen**,
no a la base de datos, y no recortan la página.

## Mantener las capturas

1. Abrir la página y esperar a que terminen de cargar datos, afiches y fuentes.
2. Usar «Capture full size screenshot» en las herramientas de Chrome, o
   `page.screenshot({ fullPage: true })` con Playwright.
3. Verificar cabecera, contenido y pie. Los scrolls internos siguen siendo parte
   de la interfaz; no confundirlos con una página cortada.
4. Revisar y ocultar información sensible antes de copiar el PNG al repositorio.
5. Actualizar los enlaces y la explicación en el README principal.

La galería se muestra por áreas desplegables para mantener legible la
presentación del portafolio sin perder las imágenes completas.
