param(
  [string]$Documento = (Join-Path $env:USERPROFILE 'Downloads\Sistema_de_Cine_Documento_de_Requerimientos_v2.1 (3) (1) (2).docx'),
  [string]$Salida = (Join-Path $env:LOCALAPPDATA 'Temp\opencode\cine-requerimientos-original.txt')
)

# Lee el Word original sin modificarlo. Un párrafo por línea en UTF-8.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($Documento)
try {
  $entry = $zip.GetEntry('word/document.xml')
  if ($null -eq $entry) { throw 'El archivo no contiene el documento Word esperado.' }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $ns = [Xml.XmlNamespaceManager]::new($xml.NameTable)
  $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
  $text = ($xml.SelectNodes('//w:p', $ns) | ForEach-Object {
    ($_.SelectNodes('.//w:t', $ns) | ForEach-Object { $_.InnerText }) -join ''
  }) -join "`n"
  [IO.File]::WriteAllText($Salida, $text, [Text.UTF8Encoding]::new($false))
  Write-Output "Requerimientos extraídos en: $Salida. El Word original no se modificó."
} finally {
  $zip.Dispose()
}
