'use strict';
/* Общие инструменты интерфейса: экраны-оверлеи, печатная машинка в духе Undertale,
   перетаскивание с порогом, всплывающие подсказки, подтверждения. */

const UI = {
  ov: null, dlg: null, toastBox: null,

  init() {
    this.ov = U.$('#ov'); this.dlg = U.$('#dialog'); this.toastBox = U.$('#toast');
  },

  /* ----- оверлеи ----- */
  clear() { this.ov.innerHTML = ''; },
  show(el) { this.clear(); this.ov.appendChild(el); return el; },
  screen(cls) { return U.el('div', 'screen' + (cls ? ' ' + cls : '')); },

  btn(label, cls, onclick) {
    const b = U.el('button', 'btn' + (cls ? ' ' + cls : ''));
    b.textContent = label;
    b.addEventListener('click', () => { Snd.fx.click(); onclick(b); });
    b.addEventListener('pointerenter', () => Snd.fx.hover());
    return b;
  },

  sndButtons(parent) {
    const box = U.el('div', 'snd-btns');
    // одна кнопка «Музыка & звуки» открывает панель: у каждого из двух каналов выключатель и ползунок
    const mb = U.el('button', 'btn alt'); mb.textContent = 'МУЗЫКА & ЗВУКИ';
    box.appendChild(mb);
    // полный экран: на компьютере и на Android; на iPhone Safari такого режима нет, там кнопка подскажет, как убрать адресную строку
    if (this.fsAvailable() || /iPhone|iPod/.test(navigator.userAgent)) {
      const fb = U.el('button', 'btn alt');
      const paint = () => { const on = !!this.fsElement(); fb.textContent = on ? 'ВЫЙТИ ИЗ ЭКРАНА' : 'ПОЛНЫЙ ЭКРАН'; fb.classList.toggle('open', on); };
      fb.addEventListener('click', () => {
        Snd.fx.click();
        if (!this.fsAvailable()) { this.toast('На iPhone Safari не умеет полный экран. Нажмите «Поделиться» → «На экран Домой»: игра откроется без адресной строки.', 6500); return; }
        this.toggleFullscreen();
      });
      let seen = false;
      const onChange = () => {
        if (fb.isConnected) seen = true; else if (seen) { ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.removeEventListener(ev, onChange)); return; }
        paint();
      };
      ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, onChange));
      paint();
      box.appendChild(fb);
    }
    parent.appendChild(box);

    const panel = U.el('div', 'vol-panel pxbox'); panel.style.display = 'none';
    const syncs = [];
    const row = (id, label, isOn, toggle, getVol, setVol) => {
      const r = U.el('div', 'vol-row');
      const tb = U.el('button', 'btn alt vol-tog');
      const inp = U.el('input'); inp.type = 'range'; inp.min = 0; inp.max = 100; inp.step = 5;
      const n = U.el('b');
      tb.addEventListener('click', () => { toggle(); Snd.fx.click(); });
      inp.addEventListener('input', () => {
        const v = inp.value / 100;
        setVol(v);
        if (v > 0 && !isOn()) toggle();                                              // сдвинули ползунок при выключенном звуке: звук включается
      });
      inp.addEventListener('change', () => { if (id === 'sfx') Snd.fx.click(); });   // пример звука на новой громкости
      inp.addEventListener('pointerup', () => inp.blur());                           // чтобы клавиши Esc и M продолжали работать
      r.appendChild(tb); r.appendChild(inp); r.appendChild(n); panel.appendChild(r);
      syncs.push(() => {
        tb.textContent = label + ': ' + (isOn() ? 'ВКЛ' : 'ВЫКЛ'); tb.classList.toggle('off', !isOn());
        inp.value = Math.round(getVol() * 100); n.textContent = inp.value + '%'; inp.classList.toggle('dim', !isOn());
      });
    };
    row('music', 'МУЗЫКА', () => Snd.isMusic(), () => Snd.toggleMusic(), () => Snd.musicVol(), v => Snd.setMusicVol(v));
    row('sfx', 'ЗВУКИ', () => Snd.isSfx(), () => Snd.toggleSfx(), () => Snd.sfxVol(), v => Snd.setSfxVol(v));
    parent.appendChild(panel);

    // панель всегда показывает настоящее состояние: меняется и от клавиши M, и от других экранов
    let seen = false, open = false;
    const sync = () => {
      if (panel.isConnected) seen = true; else if (seen) { off(); return; }          // экран закрыли: отписываемся
      syncs.forEach(f => f());
      mb.classList.toggle('muted', !Snd.isMusic() && !Snd.isSfx());                  // всё выключено: кнопка красная
    };
    const off = Snd.onChange(sync);
    sync();
    mb.addEventListener('click', () => {
      open = !open; panel.style.display = open ? 'flex' : 'none'; mb.classList.toggle('open', open); Snd.fx.click();
    });
    parent.addEventListener('pointerdown', e => {                                    // нажатие в стороне закрывает панель
      if (open && !panel.contains(e.target) && !mb.contains(e.target)) { open = false; panel.style.display = 'none'; mb.classList.remove('open'); }
    });
    return box;
  },

  /* ----- полный экран (с запасным вариантом для Safari) ----- */
  fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; },
  fsAvailable() { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); },
  toggleFullscreen() {
    if (this.fsElement()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    // на телефонах и планшетах после входа в полный экран просим горизонтальное положение (браузер может отказать)
    const lock = () => { try { if (screen.orientation && screen.orientation.lock && matchMedia('(pointer: coarse)').matches) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* не везде разрешено */ } };
    const p = req.call(el);
    if (p && p.then) p.then(lock, () => {}); else lock();
  },

  toast(text, ms) {
    const t = U.el('div', 'toast');
    t.textContent = text;
    this.toastBox.appendChild(t);
    while (this.toastBox.children.length > 3) this.toastBox.removeChild(this.toastBox.firstChild);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms || 2400);
  },

  /* ----- печатная машинка: блип на каждую вторую букву ----- */
  type(el, text, voice, opts) {
    opts = opts || {};
    const speed = opts.speed || 24;
    let shown = 0, done = false, timer = 0, fallback = 0, seen = false;
    const t0 = performance.now();
    el.textContent = '';
    const halt = () => { done = true; clearInterval(timer); clearTimeout(fallback); };
    const finish = () => {
      if (done) return;
      halt(); el.textContent = text;
      if (opts.onDone) opts.onDone();
    };
    // число букв считается по прошедшему времени, а не по числу тиков: если вкладка или страница на миг «зависла»
    // (первый запуск звука, фоновая вкладка), текст не отстаёт от времени и не остаётся пустым
    timer = setInterval(() => {
      if (done) return;
      if (el.isConnected) seen = true; else if (seen) { halt(); return; }       // экран закрыли, не дописав
      const n = Math.min(text.length, Math.floor((performance.now() - t0) / speed));
      if (n === shown) return;
      shown = n;
      el.textContent = text.slice(0, n);
      const ch = text[n - 1];
      if (ch && ch !== ' ' && n % 2 === 0) Snd.blip(voice || 'narrator');
      if (n >= text.length) finish();
    }, speed);
    fallback = setTimeout(finish, text.length * speed + 1500);              // страховка: текст всегда будет показан целиком
    return { skip: finish, isDone: () => done, stop() { halt(); } };
  },

  /* ----- перетаскивание с порогом (клик без движения = клик) ----- */
  drag(e, o) {
    const start = Stage.local(e);
    let moved = false;
    const th = o.threshold == null ? 6 : o.threshold;
    const mv = ev => {
      const p = Stage.local(ev);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) > th) { moved = true; if (o.start) o.start(p); }
      if (moved && o.move) o.move(p);
    };
    const up = ev => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (o.end) o.end(Stage.local(ev), moved);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return start;
  },

  inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; },

  /* Положение DOM-элемента в координатах сцены. */
  rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: (r.left - Stage.ox) / Stage.scale, y: (r.top - Stage.oy) / Stage.scale, w: r.width / Stage.scale, h: r.height / Stage.scale };
  },

  portrait(spec, scale) {
    const flat = spec.flat ? '#17120d' : null;
    return Sprites.portrait(spec, { scale: scale || 4, flat: flat, bg: spec.bg });
  },

  confirm(text, yes, no) {
    return new Promise(res => {
      const wrap = U.el('div', 'screen');
      const box = U.el('div', 'pxbox story-card');
      box.style.width = '460px';
      box.innerHTML = '<p>' + U.esc(text) + '</p>';
      const row = U.el('div', 'row');
      row.appendChild(this.btn(no || 'Нет', 'alt', () => { wrap.remove(); res(false); }));
      row.appendChild(this.btn(yes || 'Да', 'red', () => { wrap.remove(); res(true); }));
      box.appendChild(row); wrap.appendChild(box);
      this.ov.appendChild(wrap);
    });
  },

  short(t, n) { return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; }
};

/* Описание канала, откуда пришёл инфоповод. */
const CHANNELS = {
  paper: { label: 'ГАЗЕТА', pv: 'Вырезка' },
  phone: { label: 'ЗВОНОК', pv: 'Со слов по телефону' },
  event: { label: 'СОБЫТИЕ', pv: 'Утренняя весть' },
  interview: { label: 'ИНТЕРВЬЮ', pv: 'Из интервью' }
};
