'use strict';
/* Анимации: пружинные «тела» (как в модах на инвентарь в Minecraft) и простые твины.
   Один общий цикл requestAnimationFrame; он засыпает, когда двигаться нечему. */

const Anim = (() => {
  const bodies = new Set();
  const tweens = new Set();
  let raf = 0, last = 0;

  function report(e) {
    window.__animError = e;
    if (window.console) console.error('Anim:', e && e.stack || e);
  }
  /* Ошибка в одном теле не должна останавливать все анимации: изолируем и логируем. */
  function loop(now) {
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000) || 0.016);
    last = now;
    bodies.forEach(b => { try { b.step(dt); } catch (e) { bodies.delete(b); report(e); } });
    tweens.forEach(t => { try { t.step(dt); } catch (e) { tweens.delete(t); report(e); } });
    raf = (bodies.size || tweens.size) ? requestAnimationFrame(loop) : 0;
  }
  function kick() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }

  /* Тело с пружинами по x, y, масштабу и повороту. Двигает элемент через transform (GPU). */
  class Body {
    constructor(el, o) {
      o = o || {};
      this.el = el;
      this.p = { x: o.x || 0, y: o.y || 0, s: o.s == null ? 1 : o.s, r: o.r || 0 };
      this.t = Object.assign({}, this.p);
      this.v = { x: 0, y: 0, s: 0, r: 0 };
      this.k = o.k || 230;                       // жёсткость пружины
      this.c = o.c || 2 * Math.sqrt(this.k) * 0.78; // затухание
      this.tilt = o.tilt || 0;                   // наклон от скорости
      this.resolvers = [];
      this.apply();
    }
    to(t, o) {
      Object.assign(this.t, t);
      if (o && o.k) { this.k = o.k; this.c = o.c || 2 * Math.sqrt(o.k) * 0.78; }
      this.wake();
      return this.settled();
    }
    set(t) { Object.assign(this.p, t); Object.assign(this.t, t); this.v = { x: 0, y: 0, s: 0, r: 0 }; this.apply(); }
    wake() { bodies.add(this); kick(); }
    settled() { return new Promise(res => { this.resolvers.push(res); this.wake(); }); }
    step(dt) {
      let moving = false;
      for (const key of ['x', 'y', 's', 'r']) {
        let target = this.t[key];
        if (key === 'r' && this.tilt) target += U.clamp(this.v.x * this.tilt, -14, 14);
        const a = this.k * (target - this.p[key]) - this.c * this.v[key];
        this.v[key] += a * dt;
        this.p[key] += this.v[key] * dt;
        const eps = key === 's' ? 0.0008 : (key === 'r' ? 0.03 : 0.12);
        if (Math.abs(this.t[key] - this.p[key]) > eps || Math.abs(this.v[key]) > eps * 6) moving = true;
        else { this.p[key] = this.t[key]; this.v[key] = 0; }
      }
      this.apply();
      if (!moving) {
        bodies.delete(this);
        const r = this.resolvers; this.resolvers = [];
        r.forEach(f => f());
      }
    }
    apply() {
      this.el.style.transform = 'translate3d(' + this.p.x.toFixed(2) + 'px,' + this.p.y.toFixed(2) + 'px,0) rotate(' + this.p.r.toFixed(2) + 'deg) scale(' + this.p.s.toFixed(4) + ')';
    }
    destroy() { bodies.delete(this); this.resolvers.forEach(f => f()); this.resolvers = []; }
  }

  /* Простой твин: duration секунд, fn(t от 0 до 1). Возвращает Promise. */
  function tween(duration, fn, ease) {
    ease = ease || U.ease.out;
    return new Promise(res => {
      let t = 0;
      const tw = {
        step(dt) {
          t += dt;
          const k = Math.min(1, t / duration);
          fn(ease(k), k);
          if (k >= 1) { tweens.delete(tw); res(); }
        }
      };
      tweens.add(tw);
      kick();
    });
  }

  /* Покадровый вызов (например, таймер дня). Возвращает функцию остановки. */
  function every(fn) {
    const tw = { step(dt) { fn(dt); } };
    tweens.add(tw); kick();
    return () => tweens.delete(tw);
  }

  return { Body, tween, every, kick };
})();

/* Сцена фиксированного размера 960x540, масштабируется под окно. */
const Stage = {
  W: 960, H: 540, scale: 1, root: null, wrap: null,
  init() {
    this.wrap = U.$('#stage-wrap');
    this.root = U.$('#stage');
    // смещение и масштаб считаем один раз при изменении окна: так движение мыши не вызывает принудительный пересчёт вёрстки
    const fit = () => {
      const s = Math.min(window.innerWidth / this.W, window.innerHeight / this.H);
      this.scale = s;
      this.ox = (window.innerWidth - this.W * s) / 2;
      this.oy = (window.innerHeight - this.H * s) / 2;
      this.root.style.transform = 'scale(' + s + ')';
      this.root.style.left = this.ox + 'px';
      this.root.style.top = this.oy + 'px';
    };
    window.addEventListener('resize', fit);
    fit();
  },
  local(e) {
    return { x: (e.clientX - this.ox) / this.scale, y: (e.clientY - this.oy) / this.scale };
  }
};
