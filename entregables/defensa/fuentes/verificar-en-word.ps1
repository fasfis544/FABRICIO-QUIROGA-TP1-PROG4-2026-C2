param([string]$PdfTemporal = (Join-Path $env:LOCALAPPDATA 'Temp\opencode\Defensa_Cine_Render.pdf'))

# Sólo abre el documento generado; no interactúa con documentos originales del usuario.
$ErrorActionPreference = 'Stop'
$app = $null
$doc = $null
$CarpetaSalida = Split-Path $PSScriptRoot -Parent
try {
  $app = New-Object -ComObject Word.Application
  $app.Visible = $false
  $app.DisplayAlerts = 0
  $app.AutomationSecurity = 3
  $p = Join-Path $CarpetaSalida 'Defensa_Codigo_Cine_Aurora.docx'
  $doc = $app.Documents.Open($p, $false, $false, $false)
  $doc.Fields.Update() | Out-Null
  $doc.Repaginate()
  $pages = $doc.ComputeStatistics(2)
  $words = $doc.ComputeStatistics(0)
  $lines = $doc.ComputeStatistics(1)
  if ($lines -ge 2000) { throw "El documento supera el límite: $lines líneas de Word." }
  $doc.Save()
  $doc.ExportAsFixedFormat($PdfTemporal, 17)
  $metadataPath = Join-Path $CarpetaSalida 'Verificacion_Documento.json'
  $metadata = Get-Content -Raw -Encoding UTF8 $metadataPath | ConvertFrom-Json
  $metadata.docxBytes = (Get-Item $p).Length
  $metadata | Add-Member -NotePropertyName renderWord -NotePropertyValue @{
    abierto = $true
    paginas = $pages
    palabrasWord = $words
    lineas = $lines
    fecha = '2026-10-12'
    exportacionPdfTemporal = $true
  } -Force
  [IO.File]::WriteAllText($metadataPath, (($metadata | ConvertTo-Json -Depth 8) + "`n"), [Text.UTF8Encoding]::new($false))
  [pscustomobject]@{ AbiertoEnWord = $true; Paginas = $pages; PalabrasWord = $words; LineasWord = $lines; MenosDe2000Lineas = ($lines -lt 2000); PDFVerificacion = $PdfTemporal } | Format-List
} finally {
  if ($null -ne $doc) { $doc.Close($false) }
  if ($null -ne $app) { $app.Quit() }
}
