'use strict';
/* Фигура из скина Minecraft в 3D, нарисованная на обычном 2D-холсте (WebGL не нужен, работает везде и без интернета).
   Каждая часть тела (голова, тело, руки, ноги, слой одежды поверх) состоит из граней; при ортографической проекции грань куба превращается
   в параллелограмм, а значит её текстуру можно положить одним аффинным преобразованием, а соседние части упорядочить по глубине.
   Под стиль игры: холст небольшой (тексель = 6 пикселей, по умолчанию), текстура заранее приведена к палитре игры (Skin3D.grade), свет делится на четыре
   ступени, как у мультяшной раскраски, по краю тёмная обводка цвета чернил, под ногами плоская тень. Чтение пикселей не нужно,
   поэтому всё работает и при открытии страницы из файла. */
const Skin3D = (() => {
  const INK = '#17120d', UNDER = '#3a2f26', LIGHT = (() => { const l = [-0.45, 0.65, 0.62], n = Math.hypot(l[0], l[1], l[2]); return [l[0] / n, l[1] / n, l[2] / n]; })();

  /* Части тела: c — центр (в текселях, ноги стоят на y = 0), s — размеры, uv — начало в текстуре 64x64, ov — начало слоя одежды, inf — насколько он больше,
     pivot — ось качания конечности, limb — направление качания (руки и ноги качаются в противофазе). */
  function partsOf(slim) {
    const aw = slim ? 3 : 4, ax = slim ? 5.5 : 6;
    return [
      { c: [-2, 6, 0], s: [4, 12, 4], uv: [0, 16], ov: [0, 32], inf: 0.25, pivot: [-2, 12, 0], limb: -1 },
      { c: [2, 6, 0], s: [4, 12, 4], uv: [16, 48], ov: [0, 48], inf: 0.25, pivot: [2, 12, 0], limb: 1 },
      { c: [0, 18, 0], s: [8, 12, 4], uv: [16, 16], ov: [16, 32], inf: 0.25 },
      { c: [-ax, 18, 0], s: [aw, 12, 4], uv: [40, 16], ov: [40, 32], inf: 0.25, pivot: [-ax, 22, 0], limb: 1 },
      { c: [ax, 18, 0], s: [aw, 12, 4], uv: [32, 48], ov: [48, 48], inf: 0.25, pivot: [ax, 22, 0], limb: -1 },
      { c: [0, 28, 0], s: [8, 8, 8], uv: [0, 0], ov: [32, 0], inf: 0.5 }
    ];
  }

  /* Пять видимых сторон куба. O — угол, U и V — стороны текстуры в пространстве; src — кусок текстуры (x, y, ширина, высота в текселях). */
  function facesOf(c, s, uv, inf) {
    const w = s[0], h = s[1], d = s[2], u = uv[0], v = uv[1];
    const hx = w / 2 + inf, hy = h / 2 + inf, hz = d / 2 + inf, x = c[0], y = c[1], z = c[2];
    return [
      { n: [0, 0, 1], O: [x - hx, y + hy, z + hz], U: [2 * hx, 0, 0], V: [0, -2 * hy, 0], src: [u + d, v + d, w, h] },            // спереди
      { n: [0, 0, -1], O: [x + hx, y + hy, z - hz], U: [-2 * hx, 0, 0], V: [0, -2 * hy, 0], src: [u + 2 * d + w, v + d, w, h] },    // сзади
      { n: [-1, 0, 0], O: [x - hx, y + hy, z - hz], U: [0, 0, 2 * hz], V: [0, -2 * hy, 0], src: [u, v + d, d, h] },                 // правая сторона персонажа
      { n: [1, 0, 0], O: [x + hx, y + hy, z + hz], U: [0, 0, -2 * hz], V: [0, -2 * hy, 0], src: [u + d + w, v + d, d, h] },         // левая сторона персонажа
      { n: [0, 1, 0], O: [x - hx, y + hy, z - hz], U: [2 * hx, 0, 0], V: [0, 0, 2 * hz], src: [u + d, v, w, d] }                    // сверху
    ];
  }

  /* tex — картинка или холст со скином 64x64, slim — тонкие руки (3 текселя). */
  function make(tex, slim) {
    const parts = partsOf(!!slim), fig = document.createElement('canvas'), ink = document.createElement('canvas'), scratch = document.createElement('canvas');
    return {
      /* ctx — холст W на H (подходит 144 на 240); o.yaw — поворот (радианы), o.pitch — наклон камеры, o.swing — размах рук и ног, o.bob — подпрыгивание в пикселях, o.S — пикселей на тексель */
      render(ctx, W, H, o) {
        o = o || {};
        const S = o.S || 6, u = S / 3, yaw = o.yaw || 0, pitch = o.pitch == null ? 0.28 : o.pitch, swing = o.swing || 0, bob = (o.bob || 0) * u, cx = W / 2, gy = H - 14 * u;
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        const cam = p => { const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy; return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp]; };
        const scr = q => [cx + S * q[0], gy - S * q[1] - bob];
        fig.width = ink.width = scratch.width = W; fig.height = ink.height = scratch.height = H;
        const g = fig.getContext('2d'), sc = scratch.getContext('2d'); g.imageSmoothingEnabled = false;

        const order = parts.map(pt => {
          const a = pt.limb ? pt.limb * swing : 0, ca = Math.cos(a), sa = Math.sin(a), pv = pt.pivot;
          const rot = v => [v[0], v[1] * ca - v[2] * sa, v[1] * sa + v[2] * ca];                       // качание вокруг оси X
          const tr = pv ? (p => { const r = rot([p[0] - pv[0], p[1] - pv[1], p[2] - pv[2]]); return [r[0] + pv[0], r[1] + pv[1], r[2] + pv[2]]; }) : (p => p);
          return { pt: pt, rot: rot, tr: tr, depth: cam(tr(pt.c))[2] };
        }).sort((p, q) => p.depth - q.depth);                                                           // дальние части рисуются первыми

        order.forEach(item => {
          [0, 1].forEach(layer => {
            const pt = item.pt;
            facesOf(pt.c, pt.s, layer ? pt.ov : pt.uv, layer ? pt.inf : 0).forEach(f => {
              const n = cam(item.rot(f.n));
              if (n[2] <= 0.02) return;                                                                 // грань смотрит от камеры
              const O = scr(cam(item.tr(f.O))), Us = cam(item.rot(f.U)), Vs = cam(item.rot(f.V));
              const ux = S * Us[0], uy = -S * Us[1], vx = S * Vs[0], vy = -S * Vs[1], sw = f.src[2], sh = f.src[3];
              const quad = c => { c.beginPath(); c.moveTo(O[0], O[1]); c.lineTo(O[0] + ux, O[1] + uy); c.lineTo(O[0] + ux + vx, O[1] + uy + vy); c.lineTo(O[0] + vx, O[1] + vy); c.closePath(); };
              if (!layer) { g.fillStyle = UNDER; quad(g); g.fill(); }                                   // подложка закрывает щели между гранями
              // грань рисуется на временном холсте вместе со светом: свет ложится только на её собственные пиксели (у слоя одежды много прозрачных мест)
              sc.globalCompositeOperation = 'source-over'; sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, W, H); sc.imageSmoothingEnabled = false;
              sc.setTransform(ux / sw, uy / sw, vx / sh, vy / sh, O[0], O[1]);
              sc.drawImage(tex, f.src[0], f.src[1], sw, sh, 0, 0, sw, sh);
              sc.setTransform(1, 0, 0, 1, 0, 0);
              const lit = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];                         // четыре ступени света
              const k = lit > 0.7 ? 1.12 : lit > 0.4 ? 1 : lit > 0.1 ? 0.84 : 0.68;
              if (k !== 1) { sc.globalCompositeOperation = 'source-atop'; sc.fillStyle = k > 1 ? 'rgba(255,244,214,' + (k - 1).toFixed(2) + ')' : 'rgba(23,18,13,' + (1 - k).toFixed(2) + ')'; quad(sc); sc.fill(); sc.globalCompositeOperation = 'source-over'; }
              g.drawImage(scratch, 0, 0);
            });
          });
        });

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(23,18,13,.28)';                                                          // плоская тень под ногами, ступенями, как пиксель-арт
        for (let dy = -3; dy <= 3; dy++) { const hw = Math.round(15 * u * Math.sqrt(1 - (dy / 3.4) * (dy / 3.4))); ctx.fillRect(Math.round(cx - hw), Math.round(gy + (1 + dy) * u), hw * 2, Math.ceil(u)); }
        const ig = ink.getContext('2d'); ig.globalCompositeOperation = 'source-over'; ig.clearRect(0, 0, W, H); ig.drawImage(fig, 0, 0);
        ig.globalCompositeOperation = 'source-in'; ig.fillStyle = INK; ig.fillRect(0, 0, W, H);
        const w = Math.max(1, Math.round(u));                                                                  // толщина обводки: треть текселя\r\n        [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(d => ctx.drawImage(ink, d[0] * w, d[1] * w));      // обводка цвета чернил игры
        ctx.drawImage(fig, 0, 0);
      }
    };
  }

  /* Приводит скин к палитре игры: приглушает насыщенность, чуть теплит, делит яркость на ступени, чёрное делает цветом чернил.
     Нужна один раз при сборке картинок (читает пиксели, поэтому работает только на http, см. dev/assets.html). Возвращает холст 64x64. */
  function grade(src) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64), p = d.data, q = v => Math.max(0, Math.min(255, Math.round(v / 32) * 32));
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      let r = p[i], gg = p[i + 1], b = p[i + 2];
      const l = 0.3 * r + 0.59 * gg + 0.11 * b;
      r = (l + (r - l) * 0.74) * 1.04; gg = (l + (gg - l) * 0.74) * 0.98; b = (l + (b - l) * 0.74) * 0.9;
      r = q(r); gg = q(gg); b = q(b);
      if (r < 64 && gg < 64 && b < 64) { r = 23; gg = 18; b = 13; }
      p[i] = r; p[i + 1] = gg; p[i + 2] = b;
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  return { make: make, grade: grade };
})();
