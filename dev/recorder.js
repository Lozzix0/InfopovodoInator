'use strict';
/* Рекордер роликов (GIF) и скриншотов для презентации. Работает только на странице dev/capture.html.
   1) снимок сцены: DOM игры копируется с вычисленными стилями в SVG (foreignObject) и рисуется на холст;
   2) ролик: виртуальные часы (vclock.js) двигают игру ровно на кадр, после каждого кадра делается снимок;
   3) кодировщик GIF (медианный срез палитры, LZW, прозрачные «неизменные» пиксели) и отправка файла в dev/receiver.ps1. */
const Rec = (() => {
  const W = 960, H = 540, RECEIVER = 'http://localhost:5190';
  let fontCss = '';
  const canvasCache = new WeakMap();

  /* ---------- снимок сцены ---------- */
  async function loadFont() {
    const r = await fetch('../fonts/PressStart2P-Regular.ttf');
    const b = new Uint8Array(await r.arrayBuffer());
    let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    fontCss = "@font-face{font-family:'PS2P';src:url(data:font/ttf;base64," + btoa(s) + ")}";
  }
  function styleText(cs) {
    let s = '';
    for (let i = 0; i < cs.length; i++) { const p = cs[i]; s += p + ':' + cs.getPropertyValue(p) + ';'; }
    return s + 'animation:none !important;transition:none !important;';
  }
  function pseudo(src, which) {
    const ps = getComputedStyle(src, which), c = ps.content;
    if (!c || c === 'none' || c === 'normal' || ps.display === 'none') return null;
    const span = document.createElement('span');
    span.setAttribute('style', styleText(ps));
    span.textContent = /^["'].*["']$/.test(c) ? c.slice(1, -1).replace(/\\"/g, '"') : '';
    return span;
  }
  function build(src) {
    if (src.nodeType === 3) return src.cloneNode(false);
    if (src.nodeType !== 1 || src.tagName === 'SCRIPT' || src.tagName === 'STYLE') return null;
    const cs = getComputedStyle(src);
    let el;
    if (src.tagName === 'CANVAS') {
      el = document.createElement('img');
      const dynamic = src.classList.contains('steamcv') || src.classList.contains('cord');
      let url = !dynamic && canvasCache.get(src);
      if (!url) { url = src.toDataURL(); if (!dynamic) canvasCache.set(src, url); }
      el.setAttribute('src', url);
    } else el = src.cloneNode(false);
    if (cs.display === 'none') { el.setAttribute('style', 'display:none'); return el; }
    el.setAttribute('style', styleText(cs));
    const b = pseudo(src, '::before'), a = pseudo(src, '::after');
    if (b) el.appendChild(b);
    if (src.tagName !== 'CANVAS') src.childNodes.forEach(ch => { const c = build(ch); if (c) el.appendChild(c); });
    if (a) el.appendChild(a);
    return el;
  }
  async function snapshot(outW, outH) {
    const root = build(document.getElementById('stage'));
    root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    ['transform', 'left', 'top', 'inset-inline-start', 'inset-block-start'].forEach(p => root.style.setProperty(p, p === 'transform' ? 'none' : '0px'));     // сцена без масштаба окна и без сдвига
    const xml = new XMLSerializer().serializeToString(root);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><defs><style>' + fontCss + '</style></defs><foreignObject x="0" y="0" width="' + W + '" height="' + H + '">' + xml + '</foreignObject></svg>';
    // data:-адрес (а не blob:) — иначе Chrome считает холст «испачканным» и не даёт сохранить кадр
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('svg не загрузился')); img.src = url; });
    const c = document.createElement('canvas'); c.width = outW; c.height = outH;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, outW, outH);
    return c;
  }

  /* ---------- GIF ---------- */
  function makePalette(frames, n) {
    const hist = new Map();
    frames.forEach((f, fi) => {
      if (fi % 2) return;
      const d = f.data;
      for (let i = 0; i < d.length; i += 12) { const k = ((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2); hist.set(k, (hist.get(k) || 0) + 1); }
    });
    const items = []; hist.forEach((cnt, k) => items.push({ r: (k >> 12) & 63, g: (k >> 6) & 63, b: k & 63, n: cnt }));
    let boxes = [items];
    const range = (box) => {
      let r0 = 63, r1 = 0, g0 = 63, g1 = 0, b0 = 63, b1 = 0, tot = 0;
      box.forEach(p => { if (p.r < r0) r0 = p.r; if (p.r > r1) r1 = p.r; if (p.g < g0) g0 = p.g; if (p.g > g1) g1 = p.g; if (p.b < b0) b0 = p.b; if (p.b > b1) b1 = p.b; tot += p.n; });
      return { dr: r1 - r0, dg: g1 - g0, db: b1 - b0, tot: tot };
    };
    while (boxes.length < n) {
      let bi = -1, best = 0;
      boxes.forEach((b, i) => { if (b.length < 2) return; const q = range(b); const s = Math.max(q.dr, q.dg, q.db) * Math.sqrt(q.tot); if (s > best) { best = s; bi = i; } });
      if (bi < 0) break;
      const box = boxes[bi], q = range(box), ch = (q.dr >= q.dg && q.dr >= q.db) ? 'r' : (q.dg >= q.db ? 'g' : 'b');
      box.sort((a, b) => a[ch] - b[ch]);
      let half = q.tot / 2, acc = 0, cut = 1;
      for (let i = 0; i < box.length; i++) { acc += box[i].n; if (acc >= half) { cut = Math.min(Math.max(i + 1, 1), box.length - 1); break; } }
      boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut));
    }
    return boxes.map(box => {
      let r = 0, g = 0, b = 0, t = 0;
      box.forEach(p => { r += p.r * p.n; g += p.g * p.n; b += p.b * p.n; t += p.n; });
      return [Math.min(255, Math.round(r / t) * 4 + 2), Math.min(255, Math.round(g / t) * 4 + 2), Math.min(255, Math.round(b / t) * 4 + 2)];
    });
  }
  function lzw(idx, minCode) {
    const out = [];
    const clear = 1 << minCode, eoi = clear + 1;
    let next = eoi + 1, size = minCode + 1, cur = 0, shift = 0, table = new Map();
    const emit = c => { cur |= c << shift; shift += size; while (shift >= 8) { out.push(cur & 255); cur >>= 8; shift -= 8; } };
    emit(clear);
    let code = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], key = (code << 8) | k, found = table.get(key);
      if (found === undefined) {
        emit(code);
        if (next === 4096) { emit(clear); next = eoi + 1; size = minCode + 1; table = new Map(); }
        else { if (next >= (1 << size)) size++; table.set(key, next++); }
        code = k;
      } else code = found;
    }
    emit(code); emit(eoi);
    if (shift > 0) out.push(cur & 255);
    return out;
  }
  function encodeGIF(frames, w, h, delayCs, lastDelayCs) {
    const pal = makePalette(frames, 255);
    const lut = new Int16Array(64 * 64 * 64).fill(-1);
    const nearest = (r, g, b) => {
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let v = lut[key]; if (v >= 0) return v;
      let best = 1e9;
      for (let i = 0; i < pal.length; i++) { const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr * 3 + dg * dg * 4 + db * db * 2; if (d < best) { best = d; v = i; } }
      lut[key] = v; return v;
    };
    const out = [];
    const u16 = v => out.push(v & 255, (v >> 8) & 255);
    'GIF89a'.split('').forEach(c => out.push(c.charCodeAt(0)));
    u16(w); u16(h); out.push(0xF7, 0, 0);
    for (let i = 0; i < 256; i++) { const p = pal[i] || [0, 0, 0]; out.push(p[0], p[1], p[2]); }
    out.push(0x21, 0xFF, 0x0B); 'NETSCAPE2.0'.split('').forEach(c => out.push(c.charCodeAt(0))); out.push(3, 1, 0, 0, 0);
    let prev = null;
    frames.forEach((f, fi) => {
      const d = f.data, ix = new Uint8Array(w * h);
      for (let i = 0, j = 0; j < ix.length; i += 4, j++) ix[j] = nearest(d[i], d[i + 1], d[i + 2]);
      let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
      if (prev) {
        x0 = w; y0 = h; x1 = -1; y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ix[y * w + x] !== prev[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
      }
      const rw = x1 - x0 + 1, rh = y1 - y0 + 1, region = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const v = ix[(y + y0) * w + x + x0];
        region[y * rw + x] = (prev && prev[(y + y0) * w + x + x0] === v) ? 255 : v;     // не изменился — прозрачный
      }
      const delay = fi === frames.length - 1 ? lastDelayCs : delayCs;
      out.push(0x21, 0xF9, 4, (1 << 2) | 1); u16(delay); out.push(255, 0);
      out.push(0x2C); u16(x0); u16(y0); u16(rw); u16(rh); out.push(0);
      out.push(8);
      const data = lzw(region, 8);
      for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(data[i + j]); }
      out.push(0);
      prev = ix;
    });
    out.push(0x3B);
    return new Uint8Array(out);
  }
  async function upload(name, body) {
    const r = await fetch(RECEIVER + '/save?name=' + encodeURIComponent(name), { method: 'POST', body: body });
    if (!r.ok) throw new Error('не удалось сохранить ' + name);
  }

  /* ---------- управление записью и «руками» ---------- */
  const ART = [
    '#...........', '##..........', '#w#.........', '#ww#........', '#www#.......', '#wwww#......', '#wwwww#.....', '#wwwwww#....', '#wwwwwww#...', '#wwwwwwww#..',
    '#wwwwwwwww#.', '#wwwww######', '#ww#ww#.....', '#w#.#ww#....', '##..#ww#....', '#....#ww#...', '.....#ww#...', '......##....'
  ];
  const R = {
    fps: 15, fms: 1000 / 15, acc: 0, frames: null, outW: 640, outH: 360, x: 480, y: 300, hov: null, cursorEl: null, ready: false,
    async init() {
      await loadFont();
      const c = document.createElement('canvas'); c.width = 12; c.height = 18;
      const g = c.getContext('2d');
      ART.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch !== '.') { g.fillStyle = ch === '#' ? '#111' : '#fff'; g.fillRect(x, y, 1, 1); } }));
      const img = document.createElement('img'); img.src = c.toDataURL();
      img.style.cssText = 'width:24px;height:36px;image-rendering:pixelated;display:block';
      const el = document.createElement('div'); el.id = 'fakecur';
      el.style.cssText = 'position:absolute;left:0;top:0;z-index:99998;pointer-events:none;width:24px;height:36px';
      el.appendChild(img); document.getElementById('stage').appendChild(el);
      this.cursorEl = el; this.ready = true; this.setCursor(this.x, this.y);
    },
    setCursor(x, y) { this.x = x; this.y = y; this.cursorEl.style.transform = 'translate(' + x + 'px,' + y + 'px)'; },
    cursorVisible(v) { this.cursorEl.style.display = v ? 'block' : 'none'; },
    ptr(type, x, y, target) {
      const ev = new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: Stage.ox + x * Stage.scale, clientY: Stage.oy + y * Stage.scale, bubbles: true, cancelable: true });
      (target || document.elementFromPoint(ev.clientX, ev.clientY) || document.body).dispatchEvent(ev);
    },
    /* наведение: подсвечиваем элемент классом hov (настоящий :hover синтетическими событиями не включить) */
    hover(el) {
      if (this.hov && this.hov !== el) this.hov.classList.remove('hov');
      this.hov = el; if (el) el.classList.add('hov');
    },
    center(el) { const r = UI.rectOf(el); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; },
    async tick(fn) {
      VClock.step(1000 / 60);
      if (fn) fn();
      this.acc += 1000 / 60;
      if (this.acc >= this.fms - 1e-6) { this.acc -= this.fms; if (this.frames) await this.grab(); }
    },
    async tween(ms, fn, ease) {
      const n = Math.max(1, Math.round(ms / (1000 / 60)));
      for (let i = 1; i <= n; i++) { const k = i / n; await this.tick(() => { if (fn) fn(ease ? ease(k) : k); }); }
    },
    hold(ms) { return this.tween(ms); },
    /* плавное перемещение курсора; во время перетаскивания шлёт pointermove */
    async moveTo(x, y, ms, dragging, target) {
      const sx = this.x, sy = this.y, ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await this.tween(ms || 400, k => { const px = sx + (x - sx) * k, py = sy + (y - sy) * k; this.setCursor(px, py); this.ptr('pointermove', px, py, dragging ? undefined : target); }, ease);
    },
    /* нажать и отпустить: pointerdown/up и click */
    async press(target, ms) {
      const p = { x: this.x, y: this.y };
      this.ptr('pointerdown', p.x, p.y, target);
      await this.hold(ms || 90);
      this.ptr('pointerup', p.x, p.y, target);
      if (target && target.click) target.click();
      await this.hold(60);
    },
    async begin(w, h, fps) {
      this.outW = w || 640; this.outH = h || 360; this.fps = fps || 15; this.fms = 1000 / this.fps; this.acc = 0; this.frames = [];
      await this.grab();
    },
    async grab() { const c = await snapshot(this.outW, this.outH); this.frames.push(c.getContext('2d').getImageData(0, 0, this.outW, this.outH)); },
    async end(name, lastHoldMs) {
      const frames = this.frames; this.frames = null;
      const bytes = encodeGIF(frames, this.outW, this.outH, Math.round(100 / this.fps), Math.round((lastHoldMs || 1200) / 10));
      await upload(name + '.gif', bytes);
      return { name: name, frames: frames.length, kb: Math.round(bytes.length / 1024) };
    },
    async png(name, w, h) {
      const c = await snapshot(w || 1920, h || 1080);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await upload(name + '.png', blob);
      return { name: name, kb: Math.round(blob.size / 1024) };
    },
    snapshotCanvas: snapshot
  };
  return R;
})();
