# Fuentes de la guía central de defensa

El archivo para estudiar en Word es `../Defensa_Codigo_Cine_Aurora.docx`.
La copia `../Defensa_Codigo_Cine_Aurora.md` contiene el mismo cuerpo de lectura.

- `guia-central.md`: texto vigente, centrado en decisiones y flujo del código.
- `generar-word.cjs`: punto de entrada de la generación actual.
- `generar-central.cjs`: inserta ocho fragmentos reales y genera DOCX/Markdown con un máximo de 1999 líneas de Markdown.
- `resultado-build.txt`: resultado del build realizado para esta revisión.
- `extraer-requerimientos.ps1`: lector ZIP/XML del Word original, sin modificarlo.
- `validar.cjs`: valida límite de líneas, fragmentos, rutas, hashes y omisión de valores del entorno.
- `verificar-en-word.ps1`: abre sólo el documento generado en Word local, actualiza campos y comprueba paginación y menos de 2000 líneas de Word; genera PDF temporal de revisión.
- `../Verificacion_Documento.json`: estadísticas y hashes de integridad; no se incluye como catálogo en la guía.

`guia-base.md` y `catalogo.cjs` son fuentes históricas de la primera versión exhaustiva. No participan en la generación actual ni se agregan al Word. Se retiraron del documento las fichas por archivo, las matrices completas y las preguntas repetidas.

La generación no modifica `src`, las dependencias del proyecto ni Supabase.
Requiere Node, las dependencias locales ya instaladas y la biblioteca `docx` aislada.

## Regenerar

Desde la raíz del proyecto, instalar la biblioteca **fuera del proyecto**:

```powershell
npm install --prefix "$env:LOCALAPPDATA\Temp\opencode\cine-word" --no-audit --no-fund docx
```

La guía central conserva la fuente de requerimientos y diferencias de alcance de la revisión anterior, sin volver a generar matrices. El lector del Word original sigue disponible si se necesita revisar nuevamente esa fuente; no modifica el original.

```powershell
node entregables/defensa/fuentes/generar-word.cjs
powershell -NoProfile -File entregables/defensa/fuentes/verificar-en-word.ps1
node entregables/defensa/fuentes/validar.cjs
```

Se puede seleccionar otro módulo instalado con `CINE_DOCX_MODULE`.
La verificación con Word requiere Microsoft Word instalado. El número de líneas visuales puede cambiar con otro renderizador; se registra el resultado del Word local además de las líneas de Markdown.
Si cambia el código desde la revisión registrada, el generador detiene la producción del documento: primero hay que revisar y actualizar las explicaciones y la evidencia, no ocultar el cambio de hashes.

Los resultados de tests/build y la fecha son de esta revisión. Actualizarlos
después de una ejecución nueva; no conservarlos como si certificaran código futuro.
