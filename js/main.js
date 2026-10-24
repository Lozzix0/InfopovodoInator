'use strict';
/* Точка входа: масштабируем сцену, ждём шрифты, показываем меню. */
(function () {
  /* Проверка перед запуском: все ли файлы игры загрузились. Если нет (частая причина на телефоне: index.html открыт
     из файлового менеджера или папка скопирована не целиком), показываем понятное сообщение со списком файлов. */
  const NEEDED = [
    ['U', 'js/core/util.js'], ['Anim', 'js/core/tween.js'], ['Stage', 'js/core/tween.js'], ['Sprites', 'js/core/sprites.js'], ['Snd', 'js/core/audio.js'],
    ['GROUPS', 'js/content/groups.js'], ['CALLERS', 'js/content/world.js'], ['FUN_CALLS', 'js/content/extras.js'], ['Engine', 'js/core/engine.js'],
    ['UI', 'js/ui/common.js'], ['Desk', 'js/ui/desk.js'], ['FinalPage', 'js/ui/finalpage.js'], ['Interview', 'js/ui/interview.js'], ['Tour', 'js/ui/tour.js'], ['Flow', 'js/ui/flow.js'], ['Dev', 'js/ui/dev.js']
  ];
  function missingFiles() {
    const out = [];
    const stage = document.getElementById('stage');
    if (!stage || getComputedStyle(stage).position !== 'absolute') out.push('css/game.css');
    NEEDED.forEach(n => {
      let missing;
      try { missing = new Function('return typeof ' + n[0])() === 'undefined'; } catch (e) { missing = true; }
      if (missing && out.indexOf(n[1]) < 0) out.push(n[1]);
    });
    (window.__lf || []).forEach(f => { if (out.indexOf(f) < 0) out.push(f); });
    return out;
  }
  function bootFail(list) {
    const b = document.getElementById('boot-fail'), l = document.getElementById('lf-list');
    if (l) l.textContent = list.join(', ');
    if (b) b.style.display = 'block';
    if (window.console) console.error('Не загрузились файлы:', list);
  }
  /* iPhone Safari игнорирует user-scalable=no: щипок и двойное касание увеличивают страницу, а сцена не прокручивается, и вернуть масштаб нечем.
     Щипок блокируем событиями gesture* (они есть только в Safari на iOS), двойное касание блокируют стили (touch-action: manipulation, см. game.css),
     а если страница всё же оказалась увеличенной, масштаб возвращается подменой meta viewport на долю секунды. */
  function guardZoom() {
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
    const vv = window.visualViewport, meta = document.querySelector('meta[name="viewport"]');
    if (!vv || !meta || !(navigator.maxTouchPoints > 0)) return;
    const base = meta.getAttribute('content');
    let timer = 0;
    const reset = () => {
      if (vv.scale <= 1.02) return;
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no, viewport-fit=cover');
      setTimeout(() => { meta.setAttribute('content', base); window.scrollTo(0, 0); }, 150);
    };
    vv.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(reset, 350); });
  }
  function boot() {
    window.__booted = true;
    const lost = missingFiles();
    if (lost.length) { bootFail(lost); return; }
    try {
      Stage.init();
      guardZoom();
      UI.init();
      // звук на телефонах разрешается только после «настоящего» касания: пробуем и на pointerdown, и на touchend, и на click
      ['pointerdown', 'touchend', 'click'].forEach(ev => window.addEventListener(ev, () => Flow.unlockAudio(), { once: false, passive: true }));
      const rh = document.querySelector('#rotate-hint button');
      if (rh) rh.addEventListener('click', () => document.documentElement.classList.add('no-hint'));
      window.addEventListener('keydown', e => {
        if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range') return;      // в текстовом поле горячие клавиши не работают (ползунок громкости не в счёт)
        if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') { Snd.toggleMusic(); UI.toast(Snd.isMusic() ? 'Музыка включена' : 'Музыка выключена', 1200); }
        if (e.key === 'Escape') Flow.pauseMenu();      // пауза: переиграть день, начать заново, выйти
      });
      Dev.init();
      Flow.menu();
    } catch (err) {
      document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px;position:fixed;inset:0;z-index:9999;background:#000">Не удалось запустить игру: ' + String(err && err.stack || err).replace(/</g, '&lt;') + '</pre>');
      if (window.console) console.error(err);
    }
  }
  const fonts = (document.fonts && document.fonts.load)
    ? document.fonts.load('12px PS2P').catch(() => {})
    : Promise.resolve();
  const ready = new Promise(r => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', r); else r(); });
  Promise.all([fonts, ready]).then(boot);
})();
