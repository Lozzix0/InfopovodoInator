# Выкладка игры (и по желанию презентации) на сервер по SSH. Запускается двойным щелчком по dev\ЗАЛИТЬ_НА_СЕРВЕР.bat.
# Пароль скрипт не хранит и не принимает параметром: его спрашивают сами ssh/scp в этом окне. Адрес и логин спрашиваются при запуске.
# Что делает: собирает одиночный файл для телефонов, складывает всё нужное во временную папку, пакует, отправляет (scp), раскладывает на сервере
# (при входе под root и отсутствии веб-сервера ставит nginx) и в конце проверяет с вашего компьютера, что сайт открывается.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Need([string]$cmd, [string]$hint) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Не найден $cmd. $hint" } }
Need 'ssh' 'Включите «Клиент OpenSSH»: Параметры, Приложения, Дополнительные компоненты.'
Need 'scp' 'Он идёт вместе с «Клиентом OpenSSH» (Параметры, Приложения, Дополнительные компоненты).'
Need 'tar' 'Он встроен в Windows 10 (версия 1803 и новее).'

Write-Host ''
Write-Host '=== Выкладка ИнфоповодоИнатора на сервер ===' -ForegroundColor Yellow
Write-Host ''
Write-Host 'Сейчас окно задаст три коротких вопроса. Если подходит значение в скобках, просто нажмите Enter.'
Write-Host ''
$server = Read-Host 'Адрес сервера (Enter = 84.21.191.32)'
if (-not $server) { $server = '84.21.191.32' }
$login = Read-Host 'Логин (Enter = root)'
if (-not $login) { $login = 'root' }
$ans = Read-Host 'Выложить и презентацию тоже? (Enter = да, n = только игру)'
$withPres = -not ($ans -match '^(n|N|н|Н)')

Write-Host ''
Write-Host '1/4  Собираю сайт...' -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build.ps1') | Out-Null
$stage = Join-Path $env:TEMP 'ipi-upload'
$tgz = Join-Path $env:TEMP 'ipi.tgz'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $stage 'site') | Out-Null
$site = Join-Path $stage 'site'
Copy-Item (Join-Path $root 'index.html') $site
foreach ($d in 'css', 'js', 'fonts') { Copy-Item (Join-Path $root $d) (Join-Path $site $d) -Recurse }
Copy-Item (Join-Path $root 'dist\infopovodoinator.html') $site
if ($withPres) { Copy-Item (Join-Path $root 'presentation') (Join-Path $site 'presentation') -Recurse }

$sh = @'
#!/bin/bash
# Раскладывает присланный сайт по месту. Запускается на сервере.
set -e
SRC=/tmp/ipi/site
if [ "$(id -u)" = "0" ]; then
  if ! command -v nginx >/dev/null 2>&1 && ! command -v apache2 >/dev/null 2>&1 && ! command -v httpd >/dev/null 2>&1; then
    echo "Веб-сервер не найден, ставлю nginx..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq && apt-get install -y -qq nginx
  fi
  systemctl enable --now nginx >/dev/null 2>&1 || true
  DEST=/var/www/html
else
  DEST=""
  for d in "$HOME/public_html" "$HOME/www" "$HOME/html" "$HOME/htdocs" "$HOME/web"; do
    if [ -d "$d" ]; then DEST="$d"; break; fi
  done
  if [ -z "$DEST" ] && [ -d /var/www/html ] && [ -w /var/www/html ]; then DEST=/var/www/html; fi
  if [ -z "$DEST" ]; then DEST="$HOME/site"; fi
fi
mkdir -p "$DEST"
cp -a "$SRC"/. "$DEST"/
chmod -R a+rX "$DEST" 2>/dev/null || true
echo "Готово. Файлы лежат в папке: $DEST"
ls "$DEST"
'@
[IO.File]::WriteAllText((Join-Path $stage '_install.sh'), ($sh -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding($false)))
if (Test-Path $tgz) { Remove-Item $tgz -Force }
& tar -czf $tgz -C $stage .
if ($LASTEXITCODE -ne 0) { throw 'Не удалось упаковать сайт (tar).' }
Write-Host ('     готово, размер архива: {0:N1} МБ' -f ((Get-Item $tgz).Length / 1MB))

$opts = @('-o', "User=$login", '-o', 'StrictHostKeyChecking=accept-new')
Write-Host ''
Write-Host '2/4  Отправляю на сервер.' -ForegroundColor Cyan
Write-Host '     Сейчас появится строка «password:». Вставьте пароль правой кнопкой мыши и нажмите Enter.' -ForegroundColor Green
Write-Host '     Пока вы вставляете, на экране ничего не появляется: так и задумано, это не ошибка.' -ForegroundColor Green
& scp @opts $tgz "${server}:/tmp/ipi.tgz"
if ($LASTEXITCODE -ne 0) { throw "Не удалось отправить файл (код $LASTEXITCODE). Скорее всего, неверный логин или пароль: запустите заново и попробуйте другую пару." }

Write-Host ''
Write-Host '3/4  Раскладываю на сервере. Пароль спросят ещё раз, так же вставьте его и нажмите Enter:' -ForegroundColor Cyan
& ssh @opts $server 'rm -rf /tmp/ipi && mkdir -p /tmp/ipi && tar -xzf /tmp/ipi.tgz -C /tmp/ipi && bash /tmp/ipi/_install.sh && rm -rf /tmp/ipi /tmp/ipi.tgz'
if ($LASTEXITCODE -ne 0) { throw "На сервере что-то пошло не так (код $LASTEXITCODE). Покажите весь текст из этого окна." }

Write-Host ''
Write-Host '4/4  Проверяю, что сайт открывается...' -ForegroundColor Cyan
$checks = @("http://$server/", "http://$server/infopovodoinator.html")
if ($withPres) { $checks += "http://$server/presentation/index.html" }
$bad = 0
foreach ($u in $checks) {
  try { $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 15; Write-Host ("     OK   {0}  ({1})" -f $u, $r.StatusCode) -ForegroundColor Green }
  catch { $bad++; Write-Host ("     НЕТ  {0}  ({1})" -f $u, $_.Exception.Message) -ForegroundColor Red }
}
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item $tgz -Force -ErrorAction SilentlyContinue
Write-Host ''
if ($bad -eq 0) { Write-Host "Готово! Игра открывается по адресу: http://$server/" -ForegroundColor Green }
else { Write-Host 'Файлы отправлены, но часть адресов не открылась. Скопируйте весь текст из этого окна и пришлите: подскажу, что поправить.' -ForegroundColor Yellow }
