'use strict';
/* Виртуальные часы для записи роликов. Подключается ПЕРВЫМ, до скриптов игры.
   Подменяет performance.now, Date.now, setTimeout/setInterval и requestAnimationFrame: время идёт только когда вызывают VClock.step(мс).
   Так каждый кадр ролика получается точным и плавным, не зависит от скорости компьютера и от того, видна ли вкладка.
   CSS-анимации и переходы тоже ставятся на паузу и двигаются вручную через Web Animations API. */
(function () {
  let t = 0, tid = 1, rid = 1;
  const timers = new Map(), rafs = new Map();
  const realSetTimeout = window.setTimeout.bind(window);
  window.realSleep = ms => new Promise(r => realSetTimeout(r, ms));    // настоящая пауза (обычный setTimeout после подмены стоит на месте)
  performance.now = () => t;
  Date.now = () => 1.7e12 + t;
  window.setTimeout = (fn, ms, ...a) => { const id = tid++; timers.set(id, { at: t + Math.max(0, +ms || 0), fn: fn, a: a, every: 0 }); return id; };
  window.setInterval = (fn, ms, ...a) => { const id = tid++; const e = Math.max(1, +ms || 0); timers.set(id, { at: t + e, fn: fn, a: a, every: e }); return id; };
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  window.requestAnimationFrame = cb => { const id = rid++; rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = id => { rafs.delete(id); };

  window.VClock = {
    now: () => t,
    step(dt) {
      const end = t + dt;
      for (;;) {                                                   // таймеры, которым пора, в порядке срабатывания
        let best = null, bid = 0;
        timers.forEach((v, id) => { if (v.at <= end && (!best || v.at < best.at)) { best = v; bid = id; } });
        if (!best) break;
        t = Math.max(t, best.at);
        if (best.every) best.at += best.every; else timers.delete(bid);
        try { best.fn.apply(null, best.a); } catch (e) { console.error(e); }
      }
      t = end;
      const cbs = Array.from(rafs.values()); rafs.clear();       // один проход анимационного цикла
      cbs.forEach(cb => { try { cb(t); } catch (e) { console.error(e); } });
      document.getAnimations().forEach(a => {                       // CSS-анимации и переходы двигаем сами
        try {
          if (!a._v) { a._v = 1; a.pause(); a.currentTime = 0; }
          a.currentTime = (a.currentTime || 0) + dt;
        } catch (e) { /* уже завершилась */ }
      });
    }
  };
})();
