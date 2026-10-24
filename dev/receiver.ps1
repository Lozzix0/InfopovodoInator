# Receiver of recorded files (GIF/PNG) for the capture page dev/capture.html.
# Run:  powershell -ExecutionPolicy Bypass -File dev/receiver.ps1
# POST http://localhost:5190/save?name=file.gif saves the body into presentation\media (with &to=pptx into pptx\media). GET /quit stops the receiver.
param([int]$Port = 5190, [string]$OutDir = '')
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'presentation\media' }
$PptxDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'pptx\media'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null; New-Item -ItemType Directory -Force -Path $PptxDir | Out-Null
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "receiver on port $Port, saving to $OutDir"
while ($l.IsListening) {
  $c = $l.GetContext(); $rq = $c.Request; $rs = $c.Response
  $rs.Headers.Add('Access-Control-Allow-Origin', '*')
  $rs.Headers.Add('Access-Control-Allow-Headers', '*')
  $rs.Headers.Add('Access-Control-Allow-Methods', 'POST, OPTIONS, GET')
  try {
    $path = $rq.Url.AbsolutePath
    if ($rq.HttpMethod -eq 'OPTIONS') { $rs.StatusCode = 204 }
    elseif ($path -eq '/quit') { $rs.StatusCode = 200; $rs.Close(); $l.Stop(); break }
    elseif ($rq.HttpMethod -eq 'POST' -and $path -eq '/save') {
      $name = [IO.Path]::GetFileName($rq.QueryString['name'])
      $dir = $OutDir; if ($rq.QueryString['to'] -eq 'pptx') { $dir = $PptxDir }      # to=pptx: картинки для PPTX
      $target = Join-Path $dir $name
      $fs = [IO.File]::Create($target)
      $rq.InputStream.CopyTo($fs); $fs.Close()
      Write-Host ("saved {0} ({1} bytes)" -f $name, (Get-Item $target).Length)
      $rs.StatusCode = 200
    }
    else { $rs.StatusCode = 200 }
  } catch { $rs.StatusCode = 500; Write-Host $_.Exception.Message }
  try { $rs.Close() } catch {}
}
