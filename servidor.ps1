# Programa local de Casa de Noah para Windows. Lo abre "Abrir Casa de Noah.bat".
# Hace lo mismo que servidor.js:
# - Muestra la página en http://localhost:8642
# - /calendario?url=...  trae el calendario de Airbnb, Booking o Expedia (solo esos sitios).
# - /datos               lee y guarda datos\datos.json (y deja copia en datos\datos-anterior.json).
# Solo atiende a este mismo computador y solo a la página de Casa de Noah (encabezado X-Casa-Noah).

$ErrorActionPreference = 'Stop'
$Puerto = 8642
$Raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$CarpetaDatos = Join-Path $Raiz 'datos'
$Archivo = Join-Path $CarpetaDatos 'datos.json'
$Max = 5MB
$Dir = "http://localhost:$Puerto/"
$Host.UI.RawUI.WindowTitle = 'Casa de Noah (no cerrar)'

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Misma lista que DOMINIOS en js/engine.js (una prueba revisa que coincidan).
$Dominios = @('airbnb.com', 'airbnb.cl', 'booking.com', 'expedia.com', 'expediapartnercentral.com', 'vrbo.com', 'hotels.com')

$Tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.ico' = 'image/x-icon'; '.svg' = 'image/svg+xml'
}
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Enlace-Valido([string]$url) {
  $uri = $null
  if (-not [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$uri)) { return $false }
  if ($uri.Scheme -ne 'https') { return $false }
  $h = $uri.Host.ToLower()
  foreach ($d in $Dominios) { if ($h -eq $d -or $h.EndsWith('.' + $d)) { return $true } }
  return $false
}

function Responder($ctx, [int]$code, [string]$tipo, $cuerpo) {
  $res = $ctx.Response
  if ($cuerpo -is [string]) { $bytes = $Utf8.GetBytes($cuerpo) } else { $bytes = [byte[]]$cuerpo }
  $res.StatusCode = $code
  $res.ContentType = $tipo
  $res.Headers.Add('Cache-Control', 'no-store')
  $res.Headers.Add('X-Content-Type-Options', 'nosniff')
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.OutputStream.Close()
}

function Traer-Calendario([string]$url) {
  if (-not (Enlace-Valido $url)) { return @(400, 'Enlace no permitido: debe ser de Airbnb, Booking o Expedia.') }
  try {
    $req = [Net.HttpWebRequest]::Create($url)
    $req.UserAgent = 'CasaDeNoah-Calendario/1.0'
    $req.Timeout = 15000
    $req.AllowAutoRedirect = $true
    $resp = $req.GetResponse()
    try {
      if (-not (Enlace-Valido $resp.ResponseUri.AbsoluteUri)) { return @(400, 'La plataforma redirigió a un sitio no permitido.') }
      $sr = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
      $txt = $sr.ReadToEnd()
      $sr.Close()
    } finally { $resp.Close() }
    if ($txt.Length -gt $Max) { return @(502, 'El calendario es demasiado grande.') }
    return @(200, $txt)
  } catch [Net.WebException] {
    $r = $_.Exception.Response
    if ($r) { return @(502, "La plataforma respondió con error $([int]$r.StatusCode).") }
    return @(504, 'No se pudo conectar con la plataforma. Revisa el internet.')
  }
}

function Guardar-Datos([string]$txt) {
  $t = $txt.TrimStart()
  if (-not $t.StartsWith('{')) { throw 'no es JSON' }
  $null = ConvertFrom-Json $txt   # si no es JSON válido, lanza y no se toca nada
  if (-not (Test-Path $CarpetaDatos)) { $null = New-Item -ItemType Directory -Path $CarpetaDatos }
  $tmp = "$Archivo.tmp"
  [IO.File]::WriteAllText($tmp, $txt, $Utf8)
  if (Test-Path $Archivo) { Copy-Item $Archivo (Join-Path $CarpetaDatos 'datos-anterior.json') -Force }
  Move-Item $tmp $Archivo -Force
}

$l = New-Object Net.HttpListener
$l.Prefixes.Add($Dir)
try { $l.Start() } catch {
  Write-Host 'Casa de Noah ya está abierta. La abro en el navegador.'
  Start-Process $Dir
  Start-Sleep -Seconds 3
  exit
}

Write-Host ''
Write-Host '  Casa de Noah está abierta.'
Write-Host "  Si no se abrió sola, escribe en el navegador: $Dir"
Write-Host '  No cierres esta ventana mientras la uses (puedes minimizarla).'
Write-Host ''
Start-Process $Dir

$RaizCompleta = [IO.Path]::GetFullPath($Raiz).TrimEnd('\') + '\'
$DatosCompleta = [IO.Path]::GetFullPath($CarpetaDatos).TrimEnd('\') + '\'

while ($l.IsListening) {
  $ctx = $l.GetContext()
  try {
    $req = $ctx.Request
    $ruta = $req.Url.AbsolutePath
    $dePagina = $req.Headers['X-Casa-Noah'] -eq '1'
    $hostOk = ($req.Headers['Host'] -eq "localhost:$Puerto") -or ($req.Headers['Host'] -eq "127.0.0.1:$Puerto")

    if (-not $hostOk) { Responder $ctx 403 'text/plain' 'No permitido.'; continue }

    if ($ruta -eq '/calendario') {
      if (-not $dePagina) { Responder $ctx 403 'text/plain' 'No permitido.'; continue }
      $r = Traer-Calendario ($req.QueryString['url'])
      if ($r[0] -eq 200) { $tipo = 'text/calendar; charset=utf-8' } else { $tipo = 'text/plain; charset=utf-8' }
      Responder $ctx $r[0] $tipo $r[1]
      continue
    }

    if ($ruta -eq '/datos') {
      if (-not $dePagina) { Responder $ctx 403 'text/plain' 'No permitido.'; continue }
      if ($req.HttpMethod -eq 'GET') {
        if (Test-Path $Archivo) { Responder $ctx 200 'application/json; charset=utf-8' ([IO.File]::ReadAllBytes($Archivo)) }
        else { Responder $ctx 404 'text/plain' 'Sin datos todavía.' }
        continue
      }
      if ($req.HttpMethod -eq 'POST') {
        if ($req.ContentLength64 -gt $Max) { Responder $ctx 413 'text/plain' 'Demasiado grande.'; continue }
        $sr = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
        $txt = $sr.ReadToEnd(); $sr.Close()
        try { Guardar-Datos $txt; Responder $ctx 200 'text/plain' 'ok' }
        catch { Responder $ctx 400 'text/plain' 'Datos no válidos.' }
        continue
      }
      Responder $ctx 405 'text/plain' 'No permitido.'; continue
    }

    if ($req.HttpMethod -ne 'GET') { Responder $ctx 405 'text/plain' 'No permitido.'; continue }
    if ($ruta -eq '/') { $ruta = '/index.html' }
    $rel = [Uri]::UnescapeDataString($ruta).TrimStart('/').Replace('/', '\')
    $archivoPedido = [IO.Path]::GetFullPath((Join-Path $Raiz $rel))
    $ext = [IO.Path]::GetExtension($archivoPedido).ToLower()
    $dentro = $archivoPedido.StartsWith($RaizCompleta, [StringComparison]::OrdinalIgnoreCase) -and
              -not $archivoPedido.StartsWith($DatosCompleta, [StringComparison]::OrdinalIgnoreCase) -and
              -not $rel.Contains('\.')
    if ($Tipos.ContainsKey($ext) -and $dentro -and (Test-Path $archivoPedido -PathType Leaf)) {
      Responder $ctx 200 $Tipos[$ext] ([IO.File]::ReadAllBytes($archivoPedido))
    } else {
      Responder $ctx 404 'text/plain' 'No encontrado.'
    }
  } catch {
    try { Responder $ctx 500 'text/plain' 'Error interno.' } catch { }
  }
}
