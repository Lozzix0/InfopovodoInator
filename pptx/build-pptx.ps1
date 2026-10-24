# Сборка презентации в PPTX через установленный PowerPoint (COM).
# Запуск:  powershell -ExecutionPolicy Bypass -File pptx\build-pptx.ps1
# Правила хакатона к PPTX: никаких GIF, анимаций, видео, звука, OLE-объектов и встроенных документов; всё, что нельзя вставить,
# заменяется QR-кодом на прямую ссылку. Поэтому здесь только статичные картинки, а ролики открываются по QR на сайт-презентацию.
# Источники: pptx\media (фон, логотип и QR делает dev\assets.html), presentation\media (скриншоты игры, их снимает dev\scenes.js),
#            presentation\index.html (тексты для заметок докладчика), presentation\config.js (ссылки, команда, название файла).
# Результат: pptx\<команда>_<кейс>_<заказчик>.pptx и pptx\preview\*.png (для проверки глазами).
param([switch]$NoPreview)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$web = Join-Path (Split-Path -Parent $here) 'presentation'
$media = Join-Path $here 'media'
$webMedia = Join-Path $web 'media'
$prev = Join-Path $here 'preview'

function C([string]$hex) { $r = [Convert]::ToInt32($hex.Substring(0, 2), 16); $g = [Convert]::ToInt32($hex.Substring(2, 2), 16); $b = [Convert]::ToInt32($hex.Substring(4, 2), 16); return ($r + 256 * $g + 65536 * $b) }
$INK = '241C16'; $PAPER = 'EADFC2'; $PAPERD = 'CFC29C'; $PAPERL = 'F6EFD9'; $RED = 'B8392D'; $BLUE = '3B5E8C'; $GREEN = '4D7A47'; $YEL = 'E2B64C'; $PURPLE = '7A4AA8'; $UI = '1A1511'; $UIL = '3A2F26'; $WHITE = 'F2ECE0'
$HEAD = 'Courier New'; $BODY = 'Georgia'

# ---------- чтение настроек и заметок ----------
$html = [IO.File]::ReadAllText((Join-Path $web 'index.html'), [Text.Encoding]::UTF8)
$notes = @{}
foreach ($m in [regex]::Matches($html, '<section class="slide" id="(s\d+)".*?<aside class="notes">(.*?)</aside>', 'Singleline')) {
  $notes[$m.Groups[1].Value] = [System.Net.WebUtility]::HtmlDecode($m.Groups[2].Value.Trim()) -replace "`r?`n", "`r"
}
# для слайдов, где в PPTX другое содержимое (нет роликов), в index.html лежит отдельный текст <aside class="notes-pptx">
foreach ($m in [regex]::Matches($html, '<section class="slide" id="(s\d+)"[^>]*>(?:(?!</section>).)*?<aside class="notes-pptx">(.*?)</aside>', 'Singleline')) {
  $notes[$m.Groups[1].Value] = [System.Net.WebUtility]::HtmlDecode($m.Groups[2].Value.Trim()) -replace "`r?`n", "`r"
}
$cfg = [IO.File]::ReadAllText((Join-Path $web 'config.js'), [Text.Encoding]::UTF8)
$gameUrl = [regex]::Match($cfg, "gameUrl:\s*'([^']*)'").Groups[1].Value
$repoUrl = [regex]::Match($cfg, "repoUrl:\s*'([^']*)'").Groups[1].Value
$clipsUrl = [regex]::Match($cfg, "clipsUrl:\s*'([^']*)'").Groups[1].Value
$deckUrl = [regex]::Match($cfg, "deckUrl:\s*'([^']*)'").Groups[1].Value
$teamName = [regex]::Match($cfg, "teamName:\s*'([^']*)'").Groups[1].Value
$caseName = [regex]::Match($cfg, "caseName:\s*'([^']*)'").Groups[1].Value
$customer = [regex]::Match($cfg, "customer:\s*'([^']*)'").Groups[1].Value
# имя файла по правилам хакатона: название команды, кейс, чей кейс решаем (всё из presentation\config.js)
$safe = { param($s, $d) $x = ($s -replace '[\\/:*?"<>|]', '').Trim(); if ($x) { $x } else { $d } }
$out = Join-Path $here ((& $safe $teamName 'КОМАНДА') + '_' + (& $safe $caseName 'КЕЙС') + '_' + (& $safe $customer 'ЗАКАЗЧИК') + '.pptx')
$showAi = [regex]::Match($cfg, 'showAiNote:\s*(true|false)').Groups[1].Value -ne 'false'
$team = @(); foreach ($m in [regex]::Matches($cfg, "\{\s*nick:\s*'([^']*)',\s*name:\s*'([^']*)',\s*role:\s*'([^']*)',\s*tone:\s*'([^']*)',\s*avatar:\s*'([^']*)'(?:,\s*skin:\s*'[^']*')?\s*\}")) { $team += , @($m.Groups[1].Value, $m.Groups[2].Value, $m.Groups[3].Value, $m.Groups[4].Value, $m.Groups[5].Value) }

# ---------- помощники ----------
function T($s, [string]$text, $x, $y, $w, $h, $size, [string]$color, [bool]$bold = $false, [string]$font = $BODY, [int]$align = 1) {
  $tb = $s.Shapes.AddTextbox(1, $x, $y, $w, $h); $tf = $tb.TextFrame
  $tf.WordWrap = -1; $tf.AutoSize = 0; $tf.MarginLeft = 0; $tf.MarginRight = 0; $tf.MarginTop = 0; $tf.MarginBottom = 0
  $r = $tf.TextRange; $r.Text = $text; $r.Font.Name = $font; $r.Font.Size = [single]$size; $r.Font.Color.RGB = (C $color)
  if ($bold) { $r.Font.Bold = -1 } else { $r.Font.Bold = 0 }
  $r.ParagraphFormat.Alignment = $align
  $tb.Height = [single]$h; $tb.Width = [single]$w
  return $tb
}
function Box($s, $x, $y, $w, $h, [string]$fill, [string]$line = '', $lw = 2.25, [bool]$shadow = $true) {
  $b = $s.Shapes.AddShape(1, $x, $y, $w, $h)
  $b.Fill.Solid(); $b.Fill.ForeColor.RGB = (C $fill)
  if ($line) { $b.Line.Visible = -1; $b.Line.ForeColor.RGB = (C $line); $b.Line.Weight = [single]$lw } else { $b.Line.Visible = 0 }
  if ($shadow) { $b.Shadow.Visible = -1; $b.Shadow.ForeColor.RGB = 0; $b.Shadow.OffsetX = [single]3.5; $b.Shadow.OffsetY = [single]3.5; $b.Shadow.Transparency = [single]0.5; $b.Shadow.Blur = 0 } else { $b.Shadow.Visible = 0 }
  return $b
}
function Pic($s, [string]$file, $x, $y, $w, $h, [string]$alt = '', [bool]$frame = $true) {
  $f = Join-Path $media $file; if (-not (Test-Path $f)) { $f = Join-Path $webMedia $file }
  $p = $s.Shapes.AddPicture($f, 0, -1, $x, $y, $w, $h)
  if ($frame) { $p.Line.Visible = -1; $p.Line.ForeColor.RGB = (C $PAPERL); $p.Line.Weight = [single]2.5; $p.Shadow.Visible = -1; $p.Shadow.ForeColor.RGB = 0; $p.Shadow.OffsetX = [single]4; $p.Shadow.OffsetY = [single]4; $p.Shadow.Transparency = [single]0.5; $p.Shadow.Blur = 0 }
  if ($alt) { $p.AlternativeText = $alt }
  return $p
}
function Band($s, $x, $y, $w, [string]$text, [string]$fill, [string]$fg = 'FFFFFF', $h = 24, $size = 10.5) {
  $null = Box $s $x $y $w $h $fill '' 0 $false
  $null = T $s $text ($x + 9) ($y + ($h - $size) / 2 - 1) ($w - 14) ($size + 4) $size $fg $true $HEAD 1
}
$script:pres = $null; $script:lay = $null
function New-Slide([string]$id, [string]$kick, [string]$title) {
  $s = $script:pres.Slides.AddSlide($script:pres.Slides.Count + 1, $script:lay)
  $s.Shapes.Title.TextFrame.TextRange.Text = $title
  if ($kick) { $null = T $s $kick 48 22 700 14 10 $PAPERD $true $HEAD 1 }
  if ($notes.ContainsKey($id)) { $s.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = $notes[$id] }
  return $s
}

# ---------- приложение, шаблон ----------
foreach ($f in 'bg_wood.png', 'logo.png', 'shot_desk.png', 'shot_ring.png', 'shot_notes.png', 'bg_404.png', 'err404.png', 'skin_lozzix.png', 'qr_deck.png') { if (-not ((Test-Path (Join-Path $media $f)) -or (Test-Path (Join-Path $webMedia $f)))) { throw "Нет картинки ${f}: снимите кадры (dev\scenes.js) и фон, логотип, QR (dev\assets.html)." } }
Get-ChildItem $here -Filter '*.pptx' | Remove-Item -Force -ErrorAction SilentlyContinue
$app = New-Object -ComObject PowerPoint.Application
$pres = $app.Presentations.Add(0); $script:pres = $pres
$pres.PageSetup.SlideWidth = 960; $pres.PageSetup.SlideHeight = 540
$master = $pres.SlideMaster
$master.Background.Fill.UserPicture((Join-Path $media 'bg_wood.png'))
$lay = $master.CustomLayouts.Item(6); $script:lay = $lay
foreach ($holder in @($master, $lay)) {
  $ti = $holder.Shapes.Title
  $ti.Left = 48; $ti.Top = 38; $ti.Width = 864; $ti.Height = 54
  $ti.TextFrame.WordWrap = -1; $ti.TextFrame.MarginLeft = 0; $ti.TextFrame.MarginTop = 0; $ti.TextFrame.VerticalAnchor = 1
  $r = $ti.TextFrame.TextRange; $r.Font.Name = $HEAD; $r.Font.Bold = -1; $r.Font.Size = [single]25; $r.Font.Color.RGB = (C $YEL); $r.ParagraphFormat.Alignment = 1
}

# ---------- 0. для зала: QR на презентацию с анимациями (этот слайд без номера, нумерация идёт со следующего) ----------
$s = New-Slide 'intro' 'ДЛЯ ВСЕХ В ЗАЛЕ' 'Полная версия: в вашем телефоне'
$s.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = "Это слайд-подсказка для зала. На экране идёт обычная презентация без анимаций и роликов (так требуют правила), а полную версию с анимациями и роликами игры можно открыть на телефоне по QR-коду и листать вместе с докладчиком. На каждом слайде внизу справа написан его номер: тот же номер и на сайте.`r`r[Перед защитой отсканируйте код телефоном. Он ведёт на http-адрес сервера: если сервер недоступен, этот слайд можно просто пропустить.]"
$null = T $s 'На большом экране идёт обычная презентация. Версия с анимациями и роликами игры открывается по QR-коду и ничем не отличается по содержанию.' 48 118 540 90 19 $WHITE $false $BODY 1
$stp = @('Наведите камеру телефона на код справа.', 'Откроется презентация с анимациями и роликами игры.', 'Листайте вместе с докладчиком: номер слайда подписан внизу справа.')
$i = 0
foreach ($t1 in $stp) {
  $y = 238 + $i * 62
  $null = Box $s 48 $y 28 28 $YEL $INK 1.5 $false
  $null = T $s ([string]($i + 1)) 48 ($y + 7) 28 14 11 $INK $true $HEAD 2
  $null = T $s $t1 92 ($y - 1) 470 54 16 $WHITE $false $BODY 1
  $i++
}
$null = Pic $s 'logo.png' 48 446 210 54 'Логотип ИнфоповодоИнатор' $false
$null = T $s 'Телефон лучше держать горизонтально.' 280 462 300 20 12 $PAPERD $false $BODY 1
if ($deckUrl -and (Test-Path (Join-Path $media 'qr_deck.png'))) {
  $p = Pic $s 'qr_deck.png' 650 108 250 250 ('QR-код: ' + $deckUrl) $true; $p.Line.Weight = [single]4
  $null = T $s 'ПРЕЗЕНТАЦИЯ' 650 376 250 20 15 $YEL $true $HEAD 1
  $null = T $s ($deckUrl -replace '^https?://', '') 650 404 270 40 10.5 $WHITE $true $HEAD 1
} else {
  $b = Box $s 650 108 250 250 '3A2C22' $PAPERD 3 $false; $b.Line.DashStyle = 4
  $null = T $s 'Здесь будет QR-код. Впишите deckUrl в presentation\config.js и пересоберите.' 666 214 218 60 11 $PAPERD $true $HEAD 2
}

# ---------- 1. титул ----------
$s = New-Slide 's1' '' 'Пиксельная игра о профессии журналиста'
$null = Pic $s 'shot_desk.png' 0 0 960 540 'Рабочий стол из игры' $false
$ov = Box $s 0 0 960 540 '0A0604' '' 0 $false; $ov.Fill.Transparency = [single]0.12
$ti = $s.Shapes.Title; $ti.ZOrder(0); $ti.Left = 56; $ti.Top = 262; $ti.Width = 520; $ti.Height = 50
$ti.TextFrame.TextRange.Font.Size = 17; $ti.TextFrame.TextRange.Font.Color.RGB = (C $WHITE)
$null = Pic $s 'logo.png' 52 84 560 143 'Логотип ИнфоповодоИнатор' $false
$px = 56
foreach ($pill in @(@('БРАУЗЕР', 82), @('БЕЗ РЕГИСТРАЦИИ', 148), @('ПК · ПЛАНШЕТ · ТЕЛЕФОН', 206))) {
  $null = Box $s $px 336 $pill[1] 24 $UIL $INK 1.5 $false
  $null = T $s $pill[0] ($px + 8) 343 ($pill[1] - 12) 12 9 $PAPERD $true $HEAD 1
  $px += $pill[1] + 8
}
$null = T $s 'Хакатон «Центр-инвест» · кейс «Разработка игры»' 56 478 600 22 14 $PAPERD $false $BODY 1
$cards = @(
  @(640, 74, 'ГАЗЕТА', $RED, $PAPER, $INK, 'Белка и Стрелка в 1960 году слетали в космос и вернулись на Землю.', -2.2),
  @(690, 214, 'ЗВОНОК', $BLUE, 'CFE0F5', '1C2F4D', 'Валентина Терешкова стала первой в мире женщиной-космонавтом.', 2),
  @(650, 354, 'СОБЫТИЕ', $PURPLE, 'EAD3F5', $INK, 'Космическая станция летает на высоте около 400 километров.', -2.2))
$ci = 0
foreach ($cd in $cards) {
  $ci++
  $b1 = Box $s $cd[0] $cd[1] 236 112 $cd[4] $INK 2.25 $true; $b1.Name = "fc$ci-a"
  $b2 = Box $s $cd[0] $cd[1] 236 22 $cd[3] '' 0 $false; $b2.Name = "fc$ci-b"
  $t1 = T $s $cd[2] ($cd[0] + 9) ($cd[1] + 6) 200 12 9.5 'FFFFFF' $true $HEAD 1; $t1.Name = "fc$ci-c"
  $t2 = T $s $cd[6] ($cd[0] + 10) ($cd[1] + 32) 216 74 14 $cd[5] $true $BODY 1; $t2.Name = "fc$ci-d"
  try { $g = $s.Shapes.Range([object[]]@("fc$ci-a", "fc$ci-b", "fc$ci-c", "fc$ci-d")).Group(); $g.Rotation = [single]$cd[7] } catch { }
}

# ---------- 2. цель ----------
$s = New-Slide 's2' 'ЦЕЛЬ КЕЙСА' 'Журналист — это не «просто пишет текст»'
$sk = @(
  @('ИНФОПОВОД', $RED, 'Что вообще достойно заметки? В сотне строк нужно найти ту, о которой заговорят.', 'в игре: строки газет, звонки, утренние вести'),
  @('ПРОВЕРКА', $BLUE, 'Кому и когда верить? Босс не врёт, конкурент врёт, коллега приукрашивает.', 'в игре: источники, подсказки, пометки ДА / НЕТ'),
  @('СТРУКТУРА', $PURPLE, 'Из фактов складывается история: всё по теме, главное вынесено в заголовок.', 'в игре: страница из четырёх слотов и заголовок'))
$i = 0
foreach ($k in $sk) {
  $x = 48 + $i * 294
  $null = Box $s $x 108 276 190 $PAPER $INK 2.25 $true
  Band $s $x 108 276 $k[0] $k[1]
  $null = T $s $k[2] ($x + 14) 146 248 100 17 $INK $true $BODY 1
  $it = T $s $k[3] ($x + 14) 256 248 34 12 '5B4C38' $false $BODY 1; $it.TextFrame.TextRange.Font.Italic = -1
  $i++
}
$null = Box $s 48 336 864 118 $UI $PAPERL 2.25 $true
$null = T $s 'ЧТО МЫ СДЕЛАЛИ' 70 354 400 14 11 $YEL $true $HEAD 1
$null = T $s 'Не рассказываем о профессии, а даём её прожить: каждое действие игрока — действие журналиста, а подросток сам открывает правила.' 70 380 820 60 19 $WHITE $false $BODY 1

# ---------- 3. игра за 30 секунд ----------
$s = New-Slide 's3' 'ВСЕ ИГРЫ > ГОЛОВОЛОМКИ > ИНФОПОВОДОИНАТОР' 'Игра за 30 секунд'
$null = Pic $s 'shot_desk.png' 48 100 520 292 'Рабочий стол игры: газета с подсвеченными инфоповодами'
$mx = 48
foreach ($m in @('shot_ring.png', 'shot_card.png', 'shot_page.png', 'shot_notes.png')) { $null = Pic $s $m $mx 404 124 70 'Кадр из игры' $true; $mx += 132 }
$null = T $s 'Кадры из самой игры: звонок босса, карточки в руке, страница, заметки.' 48 486 520 30 12 $PAPERD $false $BODY 1
$null = Pic $s 'shot_menu.png' 592 100 300 169 'Главное меню игры'
$null = T $s 'Вас по счастливой случайности взяли в газету. Читайте вырезки, отвечайте на звонки, собирайте инфоповоды и проверяйте их раньше, чем выложите заметку.' 592 280 320 72 13.5 $WHITE $false $BODY 1
$facts = @(@('ЖАНР', 'головоломка, симулятор редакции'), @('ПЛАТФОРМА', 'браузер: ПК, планшет, телефон'), @('ГЛАВА', '5 дней, 3–5 минут каждый'), @('ЯЗЫК', 'русский'))
$fy = 356
foreach ($f in $facts) { $null = T $s $f[0] 592 ($fy + 2) 80 14 8.5 '8AA0B8' $true $HEAD 1; $null = T $s $f[1] 676 $fy 236 16 11.5 $PAPERD $false $BODY 1; $fy += 18 }
if ($clipsUrl -and (Test-Path (Join-Path $media 'qr_clips.png'))) {
  $null = Pic $s 'qr_clips.png' 592 436 84 84 ('QR-код: ' + $clipsUrl) $true
  $null = T $s 'Геймплей в движении: наведите камеру на QR-код, откроется сайт с роликами.' 688 446 224 60 12 $WHITE $false $BODY 1
}
# ---------- 4. день в редакции ----------
$s = New-Slide 's4' 'ГЕЙМПЛЕЙ' 'Один день в редакции'
$st = @(
  @('shot_desk.png', 'СТОЛ', 'Газеты и таймер. Дедлайн идёт, музыка к концу ускоряется.'),
  @('shot_dialog.png', 'ЗВОНКИ', 'Босс, коллеги, незнакомцы. Можно сбросить вызов.'),
  @('shot_page.png', 'СТРАНИЦА', 'Четыре слота и заголовок: что опубликуем.'),
  @('shot_result.png', 'ПЛАНЁРКА', 'Оценка и разбор каждой новости: правда ли и откуда известно.'),
  @('shot_interview_card.png', 'ИНТЕРВЬЮ', 'Награда за идеальный день: бонус на следующий.'))
$i = 0
foreach ($k in $st) {
  $x = 48 + $i * 176
  $null = Pic $s $k[0] $x 106 160 90 $k[1]
  $null = T $s ([string]($i + 1)) $x 212 60 30 24 $YEL $true $HEAD 1
  $null = T $s $k[1] $x 248 160 16 12 $WHITE $true $HEAD 1
  $null = T $s $k[2] $x 272 156 90 14 $PAPERL $false $BODY 1
  if ($i -lt 4) { $null = T $s '▶' ($x + 162) 142 14 14 11 $YEL $true $HEAD 2 }
  $i++
}
$null = T $s 'Перед днём: карточка с сюжетом, подсказка босса про тему и, с некоторым шансом, «утренняя весть» от друга или библиотекаря.' 48 392 864 50 17 $PAPERD $false $BODY 1

# ---------- 5. газеты и телефон ----------
$s = New-Slide 's5' 'МЕХАНИКА 1' 'Читаем газеты, снимаем трубку'
$null = Pic $s 'shot_desk.png' 48 104 410 231 'Газета на столе: инфоповоды подсвечены'
$null = Pic $s 'shot_ring.png' 502 104 410 231 'Звонит телефон: табло звонящего и кнопка сброса'
$null = T $s 'ГАЗЕТА' 48 358 300 16 13 $YEL $true $HEAD 1
$null = T $s 'Наводим на жирную строку и нажимаем: инфоповод уходит в «руку», а в газете строка лишь подсвечивается. Прочитанное тащим в стопку, она выдвигается веером.' 48 384 410 100 15 $WHITE $false $BODY 1
$null = T $s 'ТЕЛЕФОН' 502 358 300 16 13 $YEL $true $HEAD 1
$null = T $s 'Звонит босс, коллега или незнакомый номер. Диалог в духе Undertale: у каждого свой «голос». Звонок можно пропустить или сбросить.' 502 384 410 100 15 $WHITE $false $BODY 1

# ---------- 6. проверка ----------
$s = New-Slide 's6' 'МЕХАНИКА 2' 'Проверка, а не угадывание'
$null = Box $s 48 100 438 342 $PAPER $INK 2.25 $true
$rows = @(
  @('Босс', 'всегда говорит правду', 4, $GREEN), @('Библиотекарь', 'справки проверены', 4, $GREEN), @('Серьёзная газета', '«Справка редакции»', 3, $GREEN),
  @('Борис', 'иногда путает цифры', 2, $YEL), @('Лена', 'любит преувеличивать', 2, $YEL), @('Жёлтая газета', 'громко, но не всегда верно', 1, $RED), @('Незнакомый номер', 'конкурент или честный гражданин', 0, 'BDB08C'))
$i = 0
foreach ($r in $rows) {
  $y = 112 + $i * 46
  $null = T $s $r[0] 66 $y 220 18 15 $INK $true $BODY 1
  $sm = T $s $r[1] 66 ($y + 19) 230 14 10.5 '7A6A52' $false $BODY 1; $sm.TextFrame.TextRange.Font.Italic = -1
  for ($q = 0; $q -lt 4; $q++) {
    $col = 'BDB08C'; if ($q -lt $r[2]) { $col = $r[3] }
    $null = Box $s (330 + $q * 28) ($y + 8) 22 13 $col $INK 1.25 $false
  }
  if ($r[2] -eq 0) { $null = T $s '?' 446 ($y + 6) 20 16 12 '7A6A52' $true $HEAD 1 }
  $i++
}
$bt = T $s 'Игра не говорит, что правда. Подсказки спрятаны в газетах, звонках и утренних вестях, а надёжность канала решает всё.' 516 100 396 70 17 $WHITE $false $BODY 1
$idx = $bt.TextFrame.TextRange.Text.IndexOf('надёжность канала решает всё'); if ($idx -ge 0) { $bt.TextFrame.TextRange.Characters($idx + 1, 28).Font.Color.RGB = (C $YEL) }
$null = Pic $s 'shot_card.png' 516 184 396 223 'Карточки в руке, одна раскрыта'
$null = T $s 'СВОЙ ВЕРДИКТ: «?» → «ДА» → «НЕТ». ПОМЕТКА ДЛЯ СЕБЯ, НА СЧЁТ НЕ ВЛИЯЕТ' 516 418 396 30 9 $PAPERD $true $HEAD 1

# ---------- 7. страница и оценка ----------
$s = New-Slide 's7' 'МЕХАНИКА 3' 'Собираем страницу — получаем оценку'
$null = Pic $s 'shot_page.png' 48 100 420 236 'Страница статьи: слоты, заголовок и инфоповоды в руке'
$null = T $s 'СЛОТЫ → ЗАГОЛОВОК → «ОПУБЛИКОВАТЬ» → ОЦЕНКА И ШТАМП' 48 348 420 14 9 $PAPERD $true $HEAD 1
$sc = @(@('1', '3F7A35', 'достоверно и по теме'), @('0,35', 'B88A1F', 'достоверно, но не по теме'), @('0 и -12', $RED, 'ложь: ноль баллов и штраф'), @('-5', $RED, 'заголовок-кликбейт'))
$i = 0
foreach ($k in $sc) {
  $x = 498 + ($i % 2) * 216; $y = 100 + [math]::Floor($i / 2) * 84
  $null = Box $s $x $y 204 74 $PAPER $INK 2.25 $true
  $null = T $s $k[0] ($x + 12) ($y + 10) 180 28 22 $k[1] $true $HEAD 1
  $null = T $s $k[2] ($x + 12) ($y + 44) 184 24 13 $INK $false $BODY 1
  $i++
}
$null = Box $s 498 278 420 108 $UI $PAPERL 2.25 $true
$fm = T $s ("ОЦЕНКА = БАЛЛЫ СЛОТОВ × 80 / ЧИСЛО СЛОТОВ`r+ 20 ЗА ВЕРНЫЙ ЗАГОЛОВОК`r100 — ИДЕАЛЬНО · МЕНЬШЕ 50 — ПРОВАЛ") 514 294 392 80 12 $WHITE $true $HEAD 1
$fm.TextFrame.TextRange.Paragraphs(3).Font.Color.RGB = (C $YEL); $fm.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 6

# ---------- 8. интервью ----------
$s = New-Slide 's8' 'МЕХАНИКА 4' 'Интервью: риск и награда'
$null = Pic $s 'shot_interview_q.png' 48 100 420 236 'Интервью: три вопроса на выбор'
$null = T $s 'КАРТОЧКА ГЕРОЯ → ТРИ ВОПРОСА НА ВЫБОР → ОТВЕТ' 48 348 420 14 9 $PAPERD $true $HEAD 1
$rl = @('Открывается только при оценке 100 из 100.', 'Три вопроса и 12, 9 или 6 секунд на выбор: один удачный, остальные мимо.', 'Опасная тема — риск: герой вспылит, и весь бонус сгорит, а может дать двойной успех.', 'Награда: золотые инфоповоды на следующий день, достоверные и логичные.', 'Не «вечная сотня»: интервью закрывает не больше половины страницы и два дня подряд не бывает.')
$i = 0
foreach ($t in $rl) {
  $y = 100 + $i * 72
  $null = Box $s 498 $y 22 22 $YEL $INK 1.5 $false
  $null = T $s ([string]($i + 1)) 498 ($y + 5) 22 12 10 $INK $true $HEAD 2
  $null = T $s $t 534 ($y - 1) 378 62 16 $WHITE $false $BODY 1
  $i++
}

# ---------- 9. игра -> профессия ----------
$s = New-Slide 's9' 'ЦЕЛЬ КЕЙСА' 'Что делает игрок — что делает журналист'
$mp = @(
  @('Строка газеты уходит «в руку»', 'Мониторинг СМИ, отбор инфоповодов'), @('Звонки: босс, коллега, незнакомец', 'Работа с источниками: кому доверять'),
  @('Подсказки в газетах и блокнот', 'Проверка факта по второму источнику'), @('Таймер и «Завершить день»', 'Дедлайн выпуска'),
  @('Страница: четыре слота и заголовок', 'Вёрстка полосы, главное в заголовок'), @('Планёрка с разбором и источниками', 'Работа над ошибками, опровержение'),
  @('Интервью: вопросы по характеру героя', 'Подготовка к разговору, риск острых тем'))
$i = 0
foreach ($k in $mp) {
  $y = 102 + $i * 52
  $null = Box $s 48 $y 410 42 $PAPER $INK 2 $true
  $null = T $s $k[0] 62 ($y + 12) 390 20 15 $INK $true $BODY 1
  $null = T $s '▶' 462 ($y + 13) 34 16 13 $YEL $true $HEAD 2
  $null = Box $s 498 $y 414 42 $UI $PAPERD 1.5 $true
  $null = T $s $k[1] 512 ($y + 12) 392 20 15 $WHITE $false $BODY 1
  $i++
}

# ---------- 10. визуальный стиль ----------
$s = New-Slide 's10' 'ВИЗУАЛЬНЫЙ СТИЛЬ' 'Пиксельный стол, нарисованный кодом'
$gl = @(@('shot_menu.png', 'МЕНЮ'), @('shot_desk.png', 'СТОЛ'), @('shot_dialog.png', 'ЗВОНОК'), @('shot_page.png', 'СТРАНИЦА'), @('shot_result.png', 'ПЛАНЁРКА'), @('shot_interview_card.png', 'ИНТЕРВЬЮ'))
$i = 0
foreach ($g in $gl) {
  $x = 48 + ($i % 3) * 297; $y = 100 + [math]::Floor($i / 3) * 168
  $null = Pic $s $g[0] $x $y 270 152 $g[1]
  $null = Box $s ($x + 4) ($y + 134) 58 14 '000000' '' 0 $false
  $null = T $s $g[1] ($x + 8) ($y + 137) 64 10 7.5 'FFFFFF' $true $HEAD 1
  $i++
}
$pal = @($INK, $PAPER, $RED, $BLUE, $GREEN, $YEL, '6C4630'); $i = 0
foreach ($c in $pal) { $null = Box $s (48 + $i * 52) 446 46 28 $c $PAPERL 1.5 $false; $i++ }
$null = T $s 'Палитра из семи цветов, шрифт Press Start 2P для интерфейса, Georgia для газет. Всё нарисовано кодом: картинок в игре нет.' 430 442 482 44 14 $WHITE $false $BODY 1

# ---------- 11. сложность и сохранение ----------
$s = New-Slide 's11' 'ЗАДАНИЯ СО ЗВЁЗДОЧКОЙ' 'Три сложности и сохранение в файл'
$df = @(
  @('ЛЁГКАЯ', '3F6B45', 'FFFFFF', @('5:00', '4', '3', '7', '2', '12 с', 'названа')),
  @('НОРМАЛЬНАЯ', 'D9962A', $INK, @('4:00', '5', '4', '6', '3', '9 с', 'намёк')),
  @('СЛОЖНАЯ', '7A3128', 'FFFFFF', @('3:10', '5', '4', '5', '4', '6 с', 'молчит')))
$lb = @('Время дня', 'Газет', 'Звонков', 'Верных по теме', 'Подвохов', 'Вопрос в интервью', 'Тема от босса')
$i = 0
foreach ($d in $df) {
  $x = 48 + $i * 208
  $null = Box $s $x 100 196 300 $PAPER $INK 2.25 $true
  Band $s $x 100 196 $d[0] $d[1] $d[2] 34 13
  for ($r = 0; $r -lt 7; $r++) {
    $y = 150 + $r * 34
    $null = T $s $lb[$r] ($x + 12) $y 110 16 12 $INK $false $BODY 1
    $null = T $s $d[3][$r] ($x + 100) ($y + 1) 84 16 11.5 $INK $true $HEAD 3
    if ($r -lt 6) { $ln = $s.Shapes.AddLine(($x + 12), ($y + 24), ($x + 184), ($y + 24)); $ln.Line.ForeColor.RGB = (C 'B3A67F'); $ln.Line.Weight = [single]0.75; $ln.Line.DashStyle = 4 }
  }
  $i++
}
$null = Box $s 684 100 228 300 $UI $PAPERL 2.25 $true
$null = T $s 'СОХРАНЕНИЕ' 702 118 190 16 12 $YEL $true $HEAD 1
$null = T $s 'Прогресс сохраняется файлом между днями, а загружается в главном меню.' 702 144 194 70 14 $WHITE $false $BODY 1
$null = Box $s 702 224 190 50 $PAPER $PAPERD 1.5 $false
$null = T $s 'Инфоповодоинатор_Джон-Блохастый_день-3_нормальная.json' 708 230 178 40 8.5 $INK $true $HEAD 1
$null = T $s 'Контрольная сумма: вручную изменённый файл не загрузится.' 702 290 194 70 14 $WHITE $false $BODY 1
$null = T $s 'Глава длится пять дней, как рабочая неделя. Тема дня каждый раз новая, а число слотов на странице всегда четыре.' 48 424 864 44 16 $PAPERD $false $BODY 1

# ---------- 12. стек ----------
$s = New-Slide 's12' 'СТЕК И КАЧЕСТВО' 'Чистый браузер, без зависимостей'
$tk = @(@('HTML5 + CSS3', 'без фреймворков и сборки'), @('JavaScript', 'обычные скрипты, ES2017'), @('Canvas 2D', 'пиксель-арт из кода'), @('Web Audio', 'музыка и звуки без файлов'), @('Своя физика', 'пружинная анимация'))
$i = 0
foreach ($k in $tk) {
  $x = 48 + $i * 175
  $null = Box $s $x 100 164 56 $PAPER $INK 2 $true
  $null = T $s $k[0] ($x + 10) 108 148 16 12 $INK $true $HEAD 1
  $null = T $s $k[1] ($x + 10) 130 148 20 11 '5B4C38' $false $BODY 1
  $i++
}
$sts = @(@('6000', 'игровых дней прошёл автотест решаемости без единой ошибки'), @('60', 'кадров в секунду в замерах на тестовом ПК'), @('550 КБ', 'вся игра одним файлом для телефонов'), @('203', 'новости в 14 темах, у каждой разбор и источник'))
$i = 0
foreach ($k in $sts) {
  $x = 48 + $i * 220
  $null = Box $s $x 188 204 150 $UI $PAPERL 2.25 $true
  $null = T $s $k[0] ($x + 14) 204 180 40 32 $YEL $true $HEAD 1
  $null = T $s $k[1] ($x + 14) 256 178 70 15 $WHITE $false $BODY 1
  $i++
}
if ($showAi) { $null = T $s 'Разработка шла вместе с ИИ-помощником (Claude Code): требования, концепцию и приёмку задавала команда, код и тексты писались и проверялись вместе с ним.' 48 366 864 50 15 $PAPERD $false $BODY 1 }

# ---------- 13. масштабируемость ----------
$s = New-Slide 's13' 'МАСШТАБИРУЕМОСТЬ' 'Новая тема — один объект данных'
$null = Box $s 48 100 510 196 $UI $PAPERL 2.25 $true
$code = "// упрощённый пример новости в js/content/groups.js`r{ v: 1,                // 1 — правда, 0 — ложь`r  t: 'Валентина Терешкова стала первой…',`r  why: 'Разбор для планёрки',`r  src: 'Источник со ссылкой',`r  ok: 'Верная подсказка',`r  bad: 'Вводящая в заблуждение' }"
$cb = T $s $code 66 116 480 170 13 'E8DCC0' $true $HEAD 1; $cb.TextFrame.TextRange.Paragraphs(1).Font.Color.RGB = (C '8E8A7A'); $cb.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 4
$null = T $s 'КУДА ДАЛЬШЕ' 596 104 300 14 10 $PAPERD $true $HEAD 1
$rd = @('Больше тем: регион, кино, музыка', 'Сюжет с выбором и новые звонящие', 'Ежедневные задания босса, таблица рекордов', 'Озвучка героев', 'Проверка на живых подростках')
$i = 0
foreach ($t in $rd) { $y = 134 + $i * 48; $null = T $s '▶' 596 ($y + 4) 14 14 10 $YEL $true $HEAD 1; $null = T $s $t 618 $y 294 44 18 $WHITE $false $BODY 1; $i++ }

# ---------- 14. команда ----------
$s = New-Slide 's14' 'КОМАНДА' 'Кто делал игру'
$tones = @{ gold = @('C4961F', $INK); blue = @($BLUE, 'FFFFFF'); green = @($GREEN, 'FFFFFF'); purple = @($PURPLE, 'FFFFFF'); red = @($RED, 'FFFFFF') }
$i = 0
foreach ($m in $team) {
  $x = 48 + ($i % 3) * 292; $y = 104 + [math]::Floor($i / 3) * 190
  $null = Box $s $x $y 280 172 $PAPER $INK 2.25 $true
  $null = Box $s ($x + 3) ($y + 3) 92 166 'CFC7AC' '' 0 $false
  if ($m[4] -and ((Test-Path (Join-Path $media $m[4])) -or (Test-Path (Join-Path $webMedia $m[4])))) {
    $null = Pic $s $m[4] ($x + 3) ($y + 12) 92 153 ('Картинка участника: ' + $m[0]) $false          # 3D-фигура скина Minecraft вместо силуэта (картинка 3:5)
  } else {
    $null = Box $s ($x + 31) ($y + 30) 34 34 '1D1713' '' 0 $false
    $null = Box $s ($x + 17) ($y + 72) 62 97 '1D1713' '' 0 $false
  }
  $nick = $m[0]; $real = $m[1]; $role = $m[2]; $tone = $tones[$m[3]]; $c1 = $INK; $c3 = $tone[1]
  if (-not $nick) { $nick = 'НИК'; $c1 = '8A7D62' }
  if (-not $role) { $role = 'роль в команде'; $tone = @('CFC7AC', '6D5D44'); $c3 = '6D5D44' }
  $null = T $s $nick ($x + 108) ($y + 14) 164 22 15 $c1 $true $HEAD 1
  $null = T $s $real ($x + 108) ($y + 44) 164 40 14 $INK $false $BODY 1
  $null = Box $s ($x + 108) ($y + 112) 164 46 $tone[0] '' 0 $false
  $rt = T $s $role ($x + 116) ($y + 112) 148 46 11.5 $c3 $true $HEAD 1; $rt.TextFrame.VerticalAnchor = 3          # текст плашки по центру по вертикали
  $i++
}
# ---------- 15. референсы ----------
$s = New-Slide 's15' 'РЕФЕРЕНСЫ' 'Чем мы вдохновлялись'
$rf = @(
  @('UNDERTALE', $BLUE, 'ВЗЯЛИ', 'диалоговое окно с побуквенным текстом и «голосом» героя', 'СДЕЛАЛИ СВОЁ', 'у каждого звонящего свой звук голоса, а характер слышно ещё до слов'),
  @('INVENTORY INTERACTIONS', $RED, 'ВЗЯЛИ', 'плавное перетаскивание предметов, как в моде для Minecraft', 'СДЕЛАЛИ СВОЁ', 'собственная пружинная физика: газета наклоняется в руке, прочитанные выдвигаются веером'),
  @('PAPERS, PLEASE', $PURPLE, 'ОБЩЕЕ', 'работа за столом с документами и давление времени', 'СДЕЛАЛИ СВОЁ', 'не «пропустить или отказать», а проверить факт и сложить из проверенного заметку'))
$i = 0
foreach ($k in $rf) {
  $x = 48 + $i * 294
  $null = Box $s $x 108 276 310 $PAPER $INK 2.25 $true
  Band $s $x 108 276 $k[0] $k[1]
  $null = T $s $k[2] ($x + 16) 148 240 12 9 '6D5D44' $true $HEAD 1
  $null = T $s $k[3] ($x + 16) 166 244 70 16 $INK $false $BODY 1
  $null = T $s $k[4] ($x + 16) 250 240 12 9 '6D5D44' $true $HEAD 1
  $null = T $s $k[5] ($x + 16) 268 244 130 16 $INK $false $BODY 1
  $i++
}

# ---------- 16. играйте ----------
$s = New-Slide 's16' 'ИГРАЙТЕ' 'Попробуйте сами'
$qr = @(@('qr_game.png', $gameUrl, 'ИГРА'), @('qr_repo.png', $repoUrl, 'КОД'), @('qr_deck.png', $deckUrl, 'ПРЕЗЕНТАЦИЯ'))
$i = 0
foreach ($q in $qr) {
  $x = 48 + $i * 224
  if ($q[1] -and (Test-Path (Join-Path $media $q[0]))) {
    $p = Pic $s $q[0] $x 104 204 204 ('QR-код: ' + $q[1]) $true; $p.Line.Weight = [single]4
    $null = T $s ($q[1] -replace '^https?://', '') $x 352 208 40 10.5 $WHITE $true $HEAD 1
  } else {
    $b = Box $s $x 104 204 204 '3A2C22' $PAPERD 3 $false; $b.Line.DashStyle = 4
    $null = T $s 'Здесь будет QR-код. Впишите адрес в presentation\config.js и пересоберите.' ($x + 16) 180 172 60 10.5 $PAPERD $true $HEAD 2
  }
  $null = T $s $q[2] $x 322 204 22 15 $YEL $true $HEAD 1
  $i++
}
$null = T $s 'Наведите камеру телефона на нужный код: игра открывается сразу, регистрация не нужна.' 48 420 640 30 14 $PAPERD $false $BODY 1
$null = Pic $s 'logo.png' 716 100 196 50 'Логотип ИнфоповодоИнатор' $false
$null = T $s 'Спасибо! Регистрация не нужна, телефон лучше держать горизонтально.' 716 170 196 70 15 $WHITE $false $BODY 1
# ---------- 17. 404: финальный слайд-шутка ----------
$s = New-Slide 's17' '' 'Вопросы?'
$null = Pic $s 'bg_404.png' 0 0 960 540 'Огромный тёмный силуэт доктора ФуфелСмерча над ошибкой 404' $false
$ti = $s.Shapes.Title; $ti.ZOrder(0); $ti.Top = 48
$null = T $s 'КОНЕЦ' 48 24 300 14 10 $PAPERD $true $HEAD 1
$null = Pic $s 'err404.png' 36 112 370 180 'Надпись 404 NOT FOUND' $false
$null = T $s 'Страница не найдена. Зато найдутся ответы на ваши вопросы.' 50 306 300 56 15 $WHITE $false $BODY 1
$it = T $s 'Доктор ФуфелСмерч уже ищет виноватых.' 50 372 300 40 12 'FF8A78' $false $BODY 1; $it.TextFrame.TextRange.Font.Italic = -1
# ---------- номера слайдов («3 / 17», как на сайте-презентации; вводный слайд без номера) ----------
$totalNo = $pres.Slides.Count - 1
for ($k = 2; $k -le $pres.Slides.Count; $k++) {
  $nb = T $pres.Slides.Item($k) ('{0} / {1}' -f ($k - 1), $totalNo) 846 514 84 14 9.5 $PAPERD $true $HEAD 3
  $nb.Name = 'slide-no'
}

# ---------- сохранение и проверочные картинки ----------
if (Test-Path $out) { Remove-Item $out -Force }
$pres.SaveAs($out)
if (-not $NoPreview) {
  if (Test-Path $prev) { Remove-Item $prev -Recurse -Force }
  New-Item -ItemType Directory -Path $prev | Out-Null
  $pres.Export($prev, 'PNG', 1280, 720)
}
$count = $pres.Slides.Count
$pres.Close(); $app.Quit()
[void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
"Готово: $out, слайдов: $count"
