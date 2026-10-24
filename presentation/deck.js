'use strict';
/* Презентация в стиле игры. Листать: стрелки, Пробел, PageUp/PageDown, свайп; Home/End; N: заметки докладчика; F: во весь экран; H: подсказка по клавишам.
   Адрес вида index.html#7 открывает седьмой слайд. Содержимое слайдов лежит в index.html, настройки (ссылки, команда) в config.js. */
(function () {
  const CFG = window.DECK || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const stage = $('#stage'), slides = $$('.slide'), hud = $('#hud'), notes = $('#notes'), help = $('#help');
  let cur = -1, clipTimer = 0, clipIdx = 0, clipManual = false, hudTimer = 0, restart = 0;

  /* ---------- масштаб под окно ---------- */
  function fit() { stage.style.transform = 'scale(' + Math.min(innerWidth / 1280, innerHeight / 720) + ')'; }
  addEventListener('resize', fit); fit();

  /* ---------- ролики подгружаются, только пока слайд на экране ---------- */
  function mediaOn(sl) { $$('img[data-gif]', sl).forEach(im => { im.src = im.dataset.gif; }); }
  function mediaOff(sl) { $$('img[data-gif]', sl).forEach(im => { im.removeAttribute('src'); }); }

  /* ---------- слайд 3: страница игры «как в магазине» ---------- */
  const CLIPS = [
    { id: 'papers', t: 'Берём газету, собираем инфоповоды', ms: 8760, still: 'shot_desk', pos: '50% 40%', size: '100%' },
    { id: 'phone', t: 'Звонит телефон: диалог с боссом', ms: 10020, still: 'shot_dialog', pos: '50% 50%', size: '100%' },
    { id: 'hand', t: 'Карточки в руке: ?, ДА, НЕТ', ms: 7160, still: 'shot_card', pos: '50% 50%', size: '100%' },
    { id: 'page', t: 'Собираем страницу, получаем оценку', ms: 11580, still: 'shot_page', pos: '50% 50%', size: '100%' },
    { id: 'interview', t: 'Интервью со знаменитостью', ms: 8760, still: 'shot_interview_q', pos: '50% 50%', size: '100%' },
    { id: 'living', t: 'Стол живой: на всё можно нажать', ms: 10420, still: 'shot_desk', pos: '98% 52%', size: '300%' },
    { id: 'coffee', t: 'День идёт: кофе остывает, время тает', ms: 8880, still: 'shot_desk', pos: '2% 60%', size: '300%' }
  ];
  function buildSteam() {
    const box = $('#thumbs');
    if (box.children.length) return;
    CLIPS.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'thumb'; d.dataset.n = i + 1;
      d.style.backgroundImage = "url('media/" + c.still + ".png')"; d.style.backgroundSize = c.size; d.style.backgroundPosition = c.pos;
      d.addEventListener('click', () => { clipManual = true; showClip(i); });
      box.appendChild(d);
    });
  }
  function showClip(i) {
    clearTimeout(clipTimer);
    clipIdx = i; restart++;
    const c = CLIPS[i], im = $('#steam-gif'), bar = $('#steam-bar');
    im.src = 'media/' + c.id + '.gif?r=' + restart;
    $('#steam-cap').textContent = '▶ ' + (i + 1) + '/' + CLIPS.length + ' · ' + c.t;
    $$('#thumbs .thumb').forEach((t, k) => t.classList.toggle('on', k === i));
    bar.style.transition = 'none'; bar.style.width = '0'; void bar.offsetWidth;
    if (!clipManual) { bar.style.transition = 'width ' + c.ms + 'ms linear'; bar.style.width = '100%'; clipTimer = setTimeout(() => showClip((i + 1) % CLIPS.length), c.ms + 300); }
  }
  function steamOn() { buildSteam(); clipManual = false; showClip(0); }
  function steamOff() { clearTimeout(clipTimer); const im = $('#steam-gif'); if (im) im.removeAttribute('src'); }

  /* ---------- слайд 14: 3D-скин на холсте (крутится и ходит, пока слайд на экране) ---------- */
  const skins = []; let skinRAF = 0, skinT0 = 0;
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function drawSkins(t) {
    skins.forEach(s => {
      if (!s.model) return;
      const ctx = s.cv.getContext('2d'), w = t * 0.0042;
      s.model.render(ctx, 144, 240, { S: 6, yaw: 0.6 + t * 0.0008, swing: Math.sin(w) * 0.55, bob: Math.abs(Math.sin(w)) * 1.6, pitch: 0.28 });
    });
  }
  function skinLoop(now) { skinRAF = requestAnimationFrame(skinLoop); drawSkins(now - skinT0); }
  function skinsOn() { if (!skins.length || reduceMotion) { drawSkins(0); return; } skinT0 = performance.now(); cancelAnimationFrame(skinRAF); skinRAF = requestAnimationFrame(skinLoop); }
  function skinsOff() { cancelAnimationFrame(skinRAF); skinRAF = 0; }

  /* ---------- слайд 14: команда из config.js ---------- */
  function buildTeam() {
    const box = $('#team'); if (!box || box.children.length) return;
    (CFG.team || []).forEach(m => {
      const d = document.createElement('div');
      d.className = 'mate card rise' + (m.nick || m.name ? '' : ' empty'); d.style.setProperty('--i', box.children.length);
      d.innerHTML = '<div class="av"></div><div class="tx"><div class="nk"></div><div class="nm"></div><div class="rl"></div></div>';
      $('.nk', d).textContent = m.nick || 'НИК';
      $('.nm', d).textContent = m.name || '';
      const rl = $('.rl', d); rl.textContent = m.role || 'роль в команде'; rl.className = 'rl ' + (m.tone || 'gold');
      const av = $('.av', d);
      if (m.skin && typeof Skin3D !== 'undefined') {                                  // скин Minecraft: 3D-фигура вертится и ходит на холсте
        const cv = document.createElement('canvas'); cv.width = 144; cv.height = 240; cv.className = 'skin3d'; av.classList.add('live'); av.appendChild(cv);
        const entry = { cv: cv, model: null }; skins.push(entry);
        const img = new Image(); img.onload = () => { entry.model = Skin3D.make(img, !!m.slim); if (!skinRAF) drawSkins(0); }; img.src = 'media/' + m.skin;
      } else if (m.avatar) { av.classList.add('img'); av.style.backgroundImage = "url('media/" + m.avatar + "')"; }
      box.appendChild(d);
    });
  }
  /* ---------- слайд 16: QR-коды из config.js ---------- */
  function buildQr() {
    [['qr-game', CFG.gameUrl], ['qr-repo', CFG.repoUrl]].forEach(p => {
      const box = document.getElementById(p[0]); if (!box || box.dataset.done === p[1]) return;
      box.dataset.done = p[1] || '';
      const q = $('.q', box), u = $('.url', box);
      if (!p[1]) { q.className = 'q ph'; q.textContent = 'Здесь будет QR-код. Впишите адрес в config.js'; u.textContent = '—'; return; }
      q.className = 'q'; q.textContent = '';
      const cv = document.createElement('canvas'); q.appendChild(cv);
      QR.draw(cv, p[1], 8, 2, '#000000', '#ffffff');
      u.textContent = p[1].replace(/^https?:\/\//, '');
    });
  }

  const HOOKS = { s3: [steamOn, steamOff], s14: [() => { buildTeam(); skinsOn(); }, skinsOff], s16: [buildQr] };

  /* ---------- переходы ---------- */
  function go(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === cur) return;
    if (cur >= 0) { const o = slides[cur], h = HOOKS[o.id]; o.classList.remove('on'); o.classList.toggle('past', i > cur); mediaOff(o); if (h && h[1]) h[1](); }
    cur = i;
    const s = slides[i], h = HOOKS[s.id];
    slides.forEach((x, k) => { if (k !== i) x.classList.toggle('past', k < i); });
    s.classList.remove('past'); s.classList.add('on');
    mediaOn(s); if (h && h[0]) h[0]();
    $('#pos').textContent = (i + 1) + ' / ' + slides.length;
    $('#notes .tx').textContent = ($('.notes', s) || { textContent: '' }).textContent.trim();
    $('#notes .who').textContent = 'ДОКЛАДЧИК · СЛАЙД ' + (i + 1);
    try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) { /* адрес не меняем, если браузер запрещает */ }
  }
  const next = () => go(cur + 1), prev = () => go(cur - 1);

  /* ---------- управление ---------- */
  function toggle(el) { el.classList.toggle('show'); }
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  }
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') next();
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') prev();
    else if (k === 'Home') go(0);
    else if (k === 'End') go(slides.length - 1);
    else if (k === 'n' || k === 'N' || k === 'т' || k === 'Т') toggle(notes);
    else if (k === 'f' || k === 'F' || k === 'а' || k === 'А') fullscreen();
    else if (k === 'h' || k === 'H' || k === '?' || k === 'р' || k === 'Р') toggle(help);
    else if (k === 'Escape') { notes.classList.remove('show'); help.classList.remove('show'); }
    else return;
    e.preventDefault();
  });
  let tx = null;
  addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  addEventListener('touchend', e => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 60) (dx < 0 ? next : prev)(); }, { passive: true });
  $('#pos').title = 'Нажмите, чтобы перейти к слайду по номеру';
  $('#pos').addEventListener('click', () => { const v = parseInt(prompt('Номер слайда (1-' + slides.length + ')', cur + 1), 10); if (v > 0) go(v - 1); });          // для тех, кто смотрит с телефона вместе с докладчиком
  $('#b-prev').addEventListener('click', prev); $('#b-next').addEventListener('click', next);
  $('#b-notes').addEventListener('click', () => toggle(notes)); $('#b-full').addEventListener('click', fullscreen);
  help.addEventListener('click', () => help.classList.remove('show'));
  function wake() { hud.classList.remove('hide'); clearTimeout(hudTimer); hudTimer = setTimeout(() => hud.classList.add('hide'), 2600); }
  addEventListener('mousemove', wake); addEventListener('touchstart', wake, { passive: true }); wake();

  const fromHash = () => { const n = parseInt((location.hash || '').slice(1), 10); return n > 0 ? n - 1 : 0; };
  addEventListener('hashchange', () => go(fromHash()));
  go(fromHash());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { /* шрифт загружен, слайды уже на месте */ });
})();
