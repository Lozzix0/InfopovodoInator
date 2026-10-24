# Собирает ОДИН html-файл со всем внутри: стили, шрифт (base64) и все скрипты.
# Такой файл открывается на телефоне прямо из файлового менеджера, мессенджера или почты,
# где обычный index.html не находит остальные файлы (css, js, fonts) и показывает пустую страницу.
# Запуск:  powershell -ExecutionPolicy Bypass -File dev/build.ps1
# Результат: dist/infopovodoinator.html

$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$html = [IO.File]::ReadAllText((Join-Path $root 'index.html'), $utf8)

# стили: шрифт вшиваем как data-URI
$css = [IO.File]::ReadAllText((Join-Path $root 'css\game.css'), $utf8)
$fontBytes = [IO.File]::ReadAllBytes((Join-Path $root 'fonts\PressStart2P-Regular.ttf'))
$font = 'data:font/ttf;base64,' + [Convert]::ToBase64String($fontBytes)
$css = $css.Replace("url('../fonts/PressStart2P-Regular.ttf')", "url('" + $font + "')")
$html = [regex]::Replace($html, '<link rel="stylesheet"[^>]*>', { param($m) '<style>' + "`n" + $css + "`n" + '</style>' })

# скрипты: подставляем содержимое файлов в том же порядке
$count = 0
$html = [regex]::Replace($html, '<script src="([^"]+)"[^>]*></script>', {
  param($m)
  $path = Join-Path $root ($m.Groups[1].Value -replace '/', '\')
  $js = [IO.File]::ReadAllText($path, $utf8)
  if ($js -match '</script') { throw "В файле $path есть </script: его нельзя вшить в html" }
  $script:count++
  '<script>' + "`n" + $js + "`n" + '</script>'
})

$dist = Join-Path $root 'dist'
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }
$out = Join-Path $dist 'infopovodoinator.html'
[IO.File]::WriteAllText($out, $html, $utf8)
$kb = [Math]::Round((Get-Item $out).Length / 1024)
Write-Host ("Готово: dist\infopovodoinator.html, {0} КБ, скриптов вшито: {1}" -f $kb, $count)
