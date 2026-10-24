'use strict';
/* Рабочий стол: стопка газет, чтение, «рука» с инфоповодами, телефон, блокнот, таймер дня. */

const PAPER_POS = { x: 200, y: 72 };           // где лежит открытая газета
const READ_ZONE = { x: 0, y: 330, w: 330, h: 210 };
const HAND_CX = 790;                           // центр «руки»
const HAND_W = 92, HAND_H = 124;               // размер карточки инфоповода
const HAND_OPEN_W = 158, HAND_OPEN_H = 200;    // размер раскрытой (наведённой) карточки
const HAND_SPAN = 206;                         // на сколько px максимум раскладывается веер (чтобы не выходить за край сцены)
const PILE_X = 20, PILE_Y = 372, PILE_TW = 60, PILE_TH = 78;   // стопка «Прочитанные»: положение и размер миниатюры (×2) — почти как у стопки новых газет
const WEEKDAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ'];
const MUG_STEAM = [1, 0.85, 0.65, 0.5, 0.3, 0];       // сила пара над кружкой по этапам дня
/* Положения трубки в пикселях относительно телефона: в гнезде, приподнята, в момент смены спрайта и лежащая на столе */
const HS_REST = { x: 10, y: 14, s: 1, r: 0 };
const HS_LIFT = { x: 12, y: 0, s: 1.15, r: -12 };
const HS_SWAP = { x: -38, y: 46, s: 1.15, r: -60 };
const HS_LYING = { x: -160, y: 46, s: 1, r: -4 };
const HS_SIZE = { up: [36, 134], lying: [136, 42] };
const CORD_PORT = { x: 35, y: 157 };                // разъём шнура на корпусе

class Desk {
  constructor(prog, day) {
    this.prog = prog; this.day = day; this.cfg = day.cfg;
    this.hand = []; this.notes = [];
    this.stackList = day.papers.map((p, i) => ({ p: p, i: i }));
    this.readList = [];
    this.open = null;
    this.timeLeft = day.time;
    this.paused = false; this.extPause = false; this.finished = false; this.dlgKey = null;
    this.callIdx = 0; this.ringing = null; this.dlg = null;
    this.lastSec = -1; this.tickAlt = 0; this.hoverIdx = -1;
    this.root = U.$('#desk');
    this.tensionEl = U.$('#tension'); this.hot = false;
    this.stop = null;
    this.promise = new Promise(res => { this.resolve = res; });
  }

  /* Кружка кофе на столе: спрайт по этапу дня, мягкий пар (клубы рисуются 15 раз в секунду, чем позже день, тем слабее) и блик на кофе. */
  static makeMug(step) {
    const w = U.el('div', 'mug'); w.dataset.s = step;
    w.appendChild(Sprites.clone(Sprites.mug(step), 2));
    const cv = Sprites.mk(44, 44, () => {}); cv.className = 'px steamcv';
    cv.style.width = '88px'; cv.style.height = '88px';
    w.appendChild(cv);
    w.appendChild(U.el('div', 'glint'));
    const ctx = cv.getContext('2d'), t0 = performance.now();
    let seen = false;
    const timer = setInterval(() => {
      if (!w.isConnected) { if (seen) clearInterval(timer); return; }       // кружку убрали со сцены: таймер больше не нужен
      seen = true;
      let k = MUG_STEAM[w.dataset.s | 0];
      if (k > 0 && w._burst > performance.now()) k = Math.min(1, k * 1.7 + 0.25);       // после нажатия пар на секунду-другую гуще
      if (k > 0) Sprites.steamFrame(ctx, 44, 44, (performance.now() - t0) / 1000, k);
      else if (!w._cleared) { ctx.clearRect(0, 0, 44, 44); w._cleared = true; }
      if (k > 0) w._cleared = false;
    }, 66);
    return w;
  }
  static setMug(w, step) { w.dataset.s = step; w.replaceChild(Sprites.clone(Sprites.mug(step), 2), w.firstChild); }

  /* Предметы декора (карандаш, ручка, степлер, монеты, линейка, стикеры, кактус) как отдельные элементы на пружинах.
     desk — стол, если на предметы можно нажимать; null — просто картинка (главное меню). */
  static buildDecor(root, desk) {
    const out = {};
    Sprites.DECOR.forEach(s => {
      const el = U.el('div', 'dc dc-' + s.id);
      el.style.cssText = 'left:0;top:0;width:' + s.w * 2 + 'px;height:' + s.h * 2 + 'px';
      el.appendChild(Sprites.clone(Sprites.decor(s.id), 2));
      const body = new Anim.Body(el, { x: (s.px != null ? s.px : s.x) * 2, y: (s.py != null ? s.py : s.y) * 2, s: 1, r: 0, k: 150 });
      root.appendChild(el);
      out[s.id] = { id: s.id, el: el, body: body, cv: el.firstChild };
      if (desk) el.addEventListener('pointerdown', e => { if (e.button === 0) desk.poke(out[s.id]); });
      else el.style.pointerEvents = 'none';
    });
    return out;
  }
  /* Короткая CSS-анимация на холсте предмета (перезапускается при каждом нажатии). */
  static play(el, name) { el.classList.remove('a-' + name); void el.offsetWidth; el.classList.add('a-' + name); }
  /* Декоративная реакция на нажатие: звук и движение, на игру никак не влияет. */
  poke(d) {
    const b = d.body, kick = (v) => { Object.keys(v).forEach(k => { b.v[k] += v[k]; }); b.wake(); };
    switch (d.id) {
      case 'stapler': Desk.play(d.cv, 'press'); Snd.fx.clack(); break;
      case 'coins': Desk.play(d.cv, 'coin'); Snd.fx.coin(); setTimeout(() => Snd.fx.coin(), 260); break;
      case 'pen': kick({ x: 240, r: 80 }); Snd.fx.clack(); setTimeout(() => Snd.fx.clack(), 120); break;
      case 'notes': Desk.play(d.cv, 'flutter'); Snd.fx.flip(); break;
      case 'ruler': kick({ x: 380 }); Snd.fx.pick(); break;
      case 'pencil': kick({ x: 120, r: 150 }); Snd.fx.pick(); break;
      case 'cactus': kick({ y: -240, r: 70 }); Desk.play(d.cv, 'shake'); Snd.fx.ouch(); UI.toast('Ай! Колется.', 1400); break;
    }
  }
  /* Нажали на кружку: глоток, пар на миг гуще, реплика зависит от того, какой кофе (горячий утром, остывший вечером). */
  sipMug() {
    const w = this.mugEl; w._burst = performance.now() + 1500;
    Desk.play(w.firstChild, 'sip'); Snd.fx.sip();
    UI.toast(['Ммм… горячий кофе!', 'Горячий. Язык цел.', 'Ещё тёплый.', 'Тёпленький, но пить можно.', 'Остыл. Зато бодрит.', 'Пусто. Одни воспоминания.'][this.mugStep], 1700);
  }
  /* Нажали на календарь: страничка «перелистывается», тост напоминает, где мы в неделе. */
  flipCalendar() {
    const dn = this.prog.day || 1, left = DAYS_TOTAL - dn, name = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница'][(dn - 1) % 5];
    Desk.play(this.calEl, 'tear'); Snd.fx.flip();
    UI.toast('Сегодня ' + name + (left > 0 ? '. До выходных ещё ' + left + (left === 1 ? ' день.' : ' дня.') : '. Завтра выходной!'), 2200);
  }

  /* ---------- построение сцены ---------- */
  build() {
    const root = this.root;
    root.innerHTML = '';
    root.style.pointerEvents = 'auto';
    const bg = Sprites.clone(Sprites.desk(), 2); bg.classList.add('bg'); root.appendChild(bg);
    this.decor = Desk.buildDecor(root, this);
    this.mugStep = 0; this.mugEl = Desk.makeMug(0); root.appendChild(this.mugEl);        // свежий горячий кофе в начале дня
    this.mugEl.addEventListener('pointerdown', e => { if (e.button === 0) this.sipMug(); });

    // стопка
    this.stackEl = U.el('div', 'stack'); this.stackEl.style.cssText = 'left:26px;top:34px;width:150px;height:190px;z-index:10';
    root.appendChild(this.stackEl);
    this.stackEl.addEventListener('pointerdown', e => { if (e.button === 0) this.grabFromStack(e); });
    this.stackEl.addEventListener('pointerenter', () => { if (this.stackList.length) Snd.fx.hover(); });

    // прочитанные
    this.pileEl = U.el('div', 'readpile'); this.pileEl.style.cssText = 'left:' + PILE_X + 'px;top:' + PILE_Y + 'px;width:' + (PILE_TW * 2 + 12) + 'px;height:' + (PILE_TH * 2 + 4) + 'px;z-index:12';
    root.appendChild(this.pileEl);
    this.pileEl.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') this.spreadPile(); });
    this.pileEl.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') this.pileEl.classList.remove('spread'); });

    // телефон
    this.phoneEl = U.el('div', 'phone'); this.phoneEl.style.cssText = 'left:836px;top:22px;width:112px;height:160px;z-index:22';
    // шнур рисуется отдельным холстом под корпусом: он тянется за трубкой, когда её снимают
    this.cordCv = Sprites.mk(120, 140, () => {}); this.cordCv.className = 'px cord';
    this.cordCv.style.cssText = 'position:absolute;left:-200px;top:0;width:240px;height:280px;z-index:0;pointer-events:none';
    this.cordCtx = this.cordCv.getContext('2d');
    this.phoneEl.appendChild(this.cordCv);
    const pb = Sprites.clone(Sprites.phoneBase(), 2); pb.style.cssText += ';position:absolute;left:0;top:0;z-index:1'; this.phoneEl.appendChild(pb);
    this.phoneEl.appendChild(U.el('div', 'lcd'));
    for (let i = 0; i < 3; i++) this.phoneEl.appendChild(U.el('div', 'ring-wave'));
    // трубка: два спрайта (на базе и лежачая), виден один
    this.handsetEl = U.el('div', 'handset');
    this.hsUp = Sprites.clone(Sprites.handsetUp(), 2); this.hsLy = Sprites.clone(Sprites.handsetLying(), 2);
    this.handsetEl.appendChild(this.hsUp); this.handsetEl.appendChild(this.hsLy);
    this.handsetEl.style.cssText += ';left:0;top:0';
    this.phoneEl.appendChild(this.handsetEl);
    root.appendChild(this.phoneEl);
    // табло звонка слева от телефона (отдельно от самого аппарата, который трясётся): кто звонит, кнопка сброса и полоска времени
    this.ringUi = U.el('div', 'ringui');
    this.callerId = U.el('div', 'caller-id pxbox ps'); this.callerId.style.fontSize = '9px';
    this.rejectBtn = UI.btn('СБРОС ВЫЗОВА', 'red rejectbtn', () => this.rejectCall());
    this.ringBar = U.el('div', 'ringbar');
    this.ringUi.appendChild(this.callerId); this.ringUi.appendChild(this.rejectBtn); this.ringUi.appendChild(this.ringBar);
    root.appendChild(this.ringUi);
    this.phoneEl.addEventListener('pointerdown', () => {
      if (this.ringing) this.answer();
      else if (!this.dlgKey && !this.hsLying) { Desk.play(this.phoneEl, 'rattle'); Snd.fx.hover(); }       // телефон молчит: просто дребезжит
    });
    this.hsToken = 0;
    this.setHandset(false);
    this.handsetBody = new Anim.Body(this.handsetEl, HS_REST);
    const applyHs = this.handsetBody.apply.bind(this.handsetBody);
    this.handsetBody.apply = () => { applyHs(); this.drawCord(); };      // шнур перерисовывается только когда трубка двигается
    this.drawCord();

    // блокнот
    this.padEl = U.el('div', 'pad'); this.padEl.style.cssText = 'left:880px;top:222px;width:76px;height:92px;z-index:14';
    this.padEl.appendChild(Sprites.clone(Sprites.pad(), 2));
    this.padCnt = U.el('div', 'cnt'); this.padCnt.textContent = '0'; this.padCnt.style.cssText = 'left:-6px;top:-6px';
    this.padEl.appendChild(this.padCnt);
    root.appendChild(this.padEl);
    this.notesPanel = U.el('div', 'notes-panel pxbox'); this.notesPanel.style.cssText += ';left:630px;top:176px';
    root.appendChild(this.notesPanel);
    // мышь: окно открывается при наведении и закрывается, когда курсор ушёл с блокнота и с самого окна (небольшая задержка, чтобы успеть перейти);
    // нажатие закрепляет окно, а нажатие в любом другом месте (или повторное по блокноту) его убирает; палец: нажатие открывает, нажатие в стороне закрывает
    this.notesPinned = false; this._notesTimer = 0;
    const showNotes = () => { clearTimeout(this._notesTimer); if (!this.notesPanel.classList.contains('open')) { this.notesPanel.classList.add('open'); Snd.fx.flip(); } };
    this.hideNotes = () => { clearTimeout(this._notesTimer); this.notesPinned = false; this.notesPanel.classList.remove('open'); };
    const hideSoon = () => { clearTimeout(this._notesTimer); if (!this.notesPinned) this._notesTimer = setTimeout(this.hideNotes, 260); };
    [this.padEl, this.notesPanel].forEach(el => {
      el.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') showNotes(); });
      el.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hideSoon(); });
    });
    this.padEl.addEventListener('click', () => {
      if (this.notesPinned) { this.hideNotes(); return; }
      this.notesPinned = true; showNotes();
    });
    this.renderNotes();

    // календарь: глава длится рабочую неделю, поэтому день игры совпадает с днём недели
    const dn = this.prog.day || 1;
    const cal = U.el('div', 'cal');
    cal.innerHTML = '<div class="cw">' + WEEKDAYS[(dn - 1) % WEEKDAYS.length] + '</div><div class="cn">' + dn + '</div><div class="cs">ДЕНЬ</div>';
    root.appendChild(cal); this.calEl = cal;
    cal.addEventListener('pointerdown', e => { if (e.button === 0) this.flipCalendar(); });

    // рука: карточки не принимают события сами, наведение считает невидимая зона по координате X,
    // поэтому поднятая карточка не «выскальзывает» из-под курсора и не дёргается
    this.handEl = U.el('div', 'hand'); this.handEl.style.cssText = 'left:0;top:0;width:960px;height:540px;z-index:31;pointer-events:none';
    root.appendChild(this.handEl);
    this.handHit = U.el('div', 'handhit'); this.handHit.style.display = 'none';
    root.appendChild(this.handHit);
    this.handHit.addEventListener('pointermove', e => this.onHandMove(e));
    this.handHit.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') this.setHover(-1); });     // палец ушёл — карточка остаётся раскрытой, закроется нажатием в другом месте
    this.handHit.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const was = this.hoverIdx;
      this.onHandMove(e);
      if (e.pointerType !== 'touch' || was === this.hoverIdx) this.cycleMark(this.hoverIdx);     // касание: первое раскрывает карточку, повторное по ней меняет пометку
    });
    // касание в стороне от руки и от стопки «Прочитанные» закрывает раскрытую карточку и раздвинутую стопку (наведения на телефоне нет)
    this._outside = e => {
      if (this.notesPinned && !this.padEl.contains(e.target) && !this.notesPanel.contains(e.target)) this.hideNotes();     // нажатие в стороне убирает закреплённое окно заметок
      if (e.pointerType !== 'touch') return;
      if (this.hoverIdx >= 0 && !this.handHit.contains(e.target)) this.setHover(-1);
      if (!this.pileEl.contains(e.target)) this.pileEl.classList.remove('spread');
    };
    window.addEventListener('pointerdown', this._outside);
    // таймер, кнопка меню и кнопка «Завершить день»
    this.timerEl = U.el('div', 'timer pxbox');
    this.timerEl.innerHTML = '<div class="tn">0:00</div><div class="tb"><i></i></div>' + (this.cfg.hint === 'group' ? '<div class="tt"></div>' : '');
    root.appendChild(this.timerEl);
    this.tn = U.$('.tn', this.timerEl); this.tbi = U.$('.tb i', this.timerEl);
    if (this.cfg.hint === 'group') U.$('.tt', this.timerEl).textContent = this.day.group.name.toUpperCase();
    const mb = UI.btn('МЕНЮ', 'alt menubtn', () => Flow.pauseMenu());
    root.appendChild(mb);
    const ez = U.el('div', 'endzone');
    ez.innerHTML = '<div class="peek"></div>';
    const eb = UI.btn('ЗАВЕРШИТЬ ДЕНЬ', 'red endbtn', () => this.askEnd());
    ez.appendChild(eb); root.appendChild(ez);

    this.renderStack(); this.renderPile(); this.updateTimer();
  }

  /* ---------- стопка и прочитанные ---------- */
  renderStack() {
    const el = this.stackEl; el.innerHTML = '';
    const n = this.stackList.length;
    for (let j = n - 1; j >= 0; j--) {
      const e = this.stackList[j];
      const c = Sprites.clone(Sprites.paperThumb(e.p.paper.rep, e.i, 64, 84), 2);
      c.classList.add('layer'); c.style.left = j * 3 + 'px'; c.style.top = j * 3 + 'px';
      el.appendChild(c);
    }
    if (n) {
      const cnt = U.el('div', 'cnt'); cnt.textContent = String(n); cnt.style.cssText = 'left:104px;top:-8px'; el.appendChild(cnt);
    }
    el.style.cursor = n ? 'grab' : 'default';
  }

  renderPile() {
    const el = this.pileEl; el.innerHTML = '';
    this.readList.forEach((e, i) => {
      // внешний div неподвижен и ловит курсор, поднимается только вложенный холст: край не «юлит»
      const w = U.el('div', 'rp'); w.style.setProperty('--i', i); w.style.zIndex = i + 1;
      const c = Sprites.clone(Sprites.paperThumb(e.p.paper.rep, e.i, PILE_TW, PILE_TH), 2);       // почти как в стопке слева вверху
      w.appendChild(c);
      w.title = e.p.paper.name;
      w.addEventListener('pointerdown', ev => {
        if (ev.button !== 0) return;
        if (ev.pointerType === 'touch' && !this.pileEl.classList.contains('spread')) { this.spreadPile(); return; }     // на телефоне первое касание раздвигает стопку
        this.grabFromPile(ev, e, c);
      });
      el.appendChild(w);
    });
    if (this.readList.length) {
      const cnt = U.el('div', 'cnt'); cnt.textContent = String(this.readList.length); cnt.style.cssText = 'left:-8px;top:-8px'; el.appendChild(cnt);
    }
  }

  spreadPile() {
    if (!this.readList.length || this.pileEl.classList.contains('spread')) return;
    this.pileEl.classList.add('spread'); Snd.fx.flip();
  }

  /* ---------- перетаскивание газеты ---------- */
  grabFromStack(e) {
    if (!this.stackList.length || this.finished) return;
    const entry = this.stackList[0];
    const rect = UI.rectOf(this.stackEl.querySelector('canvas.layer:last-of-type') || this.stackEl);
    this.lift(e, entry, { x: rect.x, y: rect.y, w: 128, h: 168 }, 'stack');
  }
  grabFromPile(e, entry, node) {
    if (this.finished) return;
    const rect = UI.rectOf(node);
    this.lift(e, entry, { x: rect.x, y: rect.y, w: PILE_TW * 2, h: PILE_TH * 2 }, 'pile');
  }

  lift(e, entry, rect, from) {
    const thumb = Sprites.clone(Sprites.paperThumb(entry.p.paper.rep, entry.i, from === 'stack' ? 64 : PILE_TW, from === 'stack' ? 84 : PILE_TH), 2);
    thumb.style.cssText += ';position:absolute;left:0;top:0;z-index:50;pointer-events:none;display:none';
    this.root.appendChild(thumb);
    const body = new Anim.Body(thumb, { x: rect.x, y: rect.y, s: 1, k: 420, tilt: 0.02 });
    const start = Stage.local(e);
    const ox = start.x - rect.x, oy = start.y - rect.y;
    let lifted = false;
    const back = () => {
      if (!lifted) { thumb.remove(); body.destroy(); return; }
      const f = { x: body.p.x, y: body.p.y, r: body.p.r };
      Anim.tween(0.2, e => body.set({ x: U.lerp(f.x, rect.x, e), y: U.lerp(f.y, rect.y, e), r: U.lerp(f.r, 0, e) }), U.ease.out).then(() => {
        thumb.remove(); body.destroy();
        if (from === 'stack') this.stackList.unshift(entry); else this.readList.push(entry);
        this.renderStack(); this.renderPile();
      });
    };
    const takeOut = () => {
      lifted = true;
      if (from === 'stack') this.stackList.shift(); else this.readList = this.readList.filter(x => x !== entry);
      this.renderStack(); this.renderPile();
      thumb.style.display = 'block'; Snd.fx.pick();
    };
    UI.drag(e, {
      threshold: 5,
      start: () => takeOut(),
      move: p => body.to({ x: p.x - ox, y: p.y - oy }),
      end: (p, moved) => {
        if (!moved) { takeOut(); thumb.style.display = 'none'; this.openPaper(entry, rect, thumb, body); return; }
        const inCenter = UI.inRect(p, { x: 190, y: 40, w: 560, h: 460 });
        const away = Math.hypot(p.x - start.x, p.y - start.y) > 70;
        if ((inCenter || away) && !UI.inRect(p, READ_ZONE) && !UI.inRect(p, { x: 0, y: 0, w: 190, h: 330 }) ) this.openPaper(entry, { x: p.x - ox, y: p.y - oy, w: rect.w, h: rect.h }, thumb, body);
        else back();
      }
    });
  }

  openPaper(entry, fromRect, thumb, thumbBody) {
    if (thumb) { thumb.remove(); thumbBody.destroy(); }
    if (this.open) this.stashOpen();          // на столе уже была газета: она сама уходит в «Прочитанные»
    const el = this.buildPaperEl(entry);
    this.root.appendChild(el);
    // газета вылетает из своей миниатюры: центр газеты совпадает с центром миниатюры (масштаб считается вокруг центра)
    const body = new Anim.Body(el, { x: fromRect.x + fromRect.w / 2 - 260, y: fromRect.y + fromRect.h / 2 - 220, s: Math.max(0.2, fromRect.w / 520 * 0.9), r: -6, k: 200, tilt: 0.02 });
    this.open = { entry: entry, el: el, body: body };
    Snd.fx.flip();
    body.to({ x: PAPER_POS.x, y: PAPER_POS.y, s: 1, r: 0 });
    el.addEventListener('pointerdown', e => { if (e.button === 0 && this.open && this.open.el === el) this.dragOpen(e); });
    this.hooks && this.hooks.onOpen && this.hooks.onOpen(entry);
  }

  buildPaperEl(entry) {
    const p = entry.p;
    const wrap = U.el('div', 'paper-open');
    const sheet = U.el('div', 'paper-sheet');
    const mast = U.el('div', 'p-mast');
    mast.innerHTML = '<div class="p-name" style="color:' + p.paper.color + '">' + U.esc(p.paper.name.toUpperCase()) + '</div>' +
      '<div class="p-sub"><span>' + U.esc(p.date) + '</span><span>«' + U.esc(p.paper.motto) + '»</span></div>';
    sheet.appendChild(mast);
    const body = U.el('div', 'p-body');
    p.blocks.forEach(b => {
      let d;
      if (b.k === 'item') {
        const it = this.day.items[b.id];
        d = U.el('div', 'blk item' + (this.has(b.id) ? ' got' : ''));
        d.dataset.id = b.id;
        d.innerHTML = '<span class="lab">' + U.esc(b.label) + '</span><br><span class="mk">' + U.esc(it.t) + '</span>';
      } else if (b.k === 'clue') {
        d = U.el('div', 'blk clue');
        d.innerHTML = '<span class="lab">' + U.esc(b.label) + '</span><br>' + U.esc(b.text);
      } else {
        d = U.el('div', 'blk fill'); d.textContent = b.text;
      }
      body.appendChild(d);
    });
    sheet.appendChild(body);
    wrap.appendChild(sheet);
    wrap.style.cursor = 'grab';
    return wrap;
  }

  dragOpen(e) {
    const o = this.open;
    if (!o || this.finished) return;
    const blk = e.target.closest ? e.target.closest('.blk.item') : null;
    const start = Stage.local(e);
    const ox = start.x - o.body.p.x, oy = start.y - o.body.p.y;
    const readEl = this.pileEl;
    UI.drag(e, {
      threshold: 7,
      start: () => { o.el.classList.add('dragging'); o.body.to({ s: 0.8 }); Snd.fx.pick(); },
      move: p => {
        o.body.to({ x: p.x - ox, y: p.y - oy });
        readEl.classList.toggle('dropglow', UI.inRect(p, READ_ZONE));
      },
      end: (p, moved) => {
        readEl.classList.remove('dropglow');
        o.el.classList.remove('dragging');
        if (!moved) { if (blk && !blk.classList.contains('got')) this.collectFromBlock(blk); return; }
        if (UI.inRect(p, READ_ZONE)) this.stashOpen();
        else { o.body.to({ x: PAPER_POS.x, y: PAPER_POS.y, s: 1, r: 0 }); Snd.fx.drop(); }
      }
    });
  }

  stashOpen() {
    const o = this.open; if (!o) return;
    this.open = null;
    o.el.style.pointerEvents = 'none';        // улетающая газета больше не ловит курсор
    o.el.classList.remove('dragging');
    Snd.fx.drop();
    // короткий полёт по времени, а не пружина: пружина «досыпается» больше секунды, и газета в стопке появлялась с задержкой
    // газета уменьшается вокруг своего центра, поэтому целимся центром в центр верхней газеты стопки «Прочитанные»
    const b = o.body, f = { x: b.p.x, y: b.p.y, s: b.p.s, r: b.p.r };
    const ts = PILE_TW * 2 / 520, tx = PILE_X + PILE_TW - 260, ty = PILE_Y + PILE_TH - 220;
    Anim.tween(0.26, e => b.set({ x: U.lerp(f.x, tx, e), y: U.lerp(f.y, ty, e), s: U.lerp(f.s, ts, e), r: U.lerp(f.r, -8, e) }), U.ease.out).then(() => {
      o.el.remove(); b.destroy();
      this.readList.push(o.entry); this.renderPile();
    });
  }

  /* ---------- «рука» ---------- */
  has(id) { return this.hand.some(h => h.id === id); }
  collectFromBlock(blk) {
    const id = blk.dataset.id;
    if (this.has(id)) return;
    blk.classList.add('got');
    const r = UI.rectOf(blk);
    this.addToHand({ id: id, ch: 'paper', by: this.open.entry.p.paper.name, mark: 0 }, { x: r.x + r.w / 2 - 46, y: r.y, s: 0.8 });
  }
  addToHand(entry, from) {
    if (this.has(entry.id)) return;
    entry.mark = 0;
    this.hand.push(entry);
    const el = U.el('div', 'hcard ch-' + entry.ch);
    const it = this.day.items[entry.id];
    entry.open = false;
    // две заранее собранные «версии» карточки: маленькая и большая с полным текстом; при наведении меняется только прозрачность и масштаб
    el.innerHTML = '<div class="face"><span class="ico">' + CHANNELS[entry.ch].label + '</span><div class="ct">' + U.esc(UI.short(it.t, 78)) + '</div></div>' +
      '<div class="big"><span class="ico">' + CHANNELS[entry.ch].pv.toUpperCase() + ' · ' + U.esc(entry.by).toUpperCase() + '</span><div class="ct">' + U.esc(it.t) + '</div></div><div class="mark">?</div>';
    this.handEl.appendChild(el);
    const f = from || { x: 440, y: 200, s: 1 };
    entry.el = el; entry.markEl = U.$('.mark', el);
    entry.body = new Anim.Body(el, { x: f.x, y: f.y, s: f.s || 1, r: 0, k: 170 });
    Snd.fx.collect();
    this.layoutHand();
    this.hooks && this.hooks.onCollect && this.hooks.onCollect(entry);
  }

  /* Геометрия «веера»: считается формулой, а не по элементам, поэтому наведение стабильно. */
  handGeom() {
    const n = this.hand.length;
    const step = n > 1 ? Math.min(30, HAND_SPAN / (n - 1)) : 0;
    return { n: n, step: step, x0: HAND_CX - HAND_W / 2 - (n - 1) * step / 2 };
  }
  layoutHand() {
    const g = this.handGeom(), n = g.n, mid = (n - 1) / 2;
    this.hand.forEach((h, i) => {
      const d = i - mid, hov = i === this.hoverIdx;
      const push = this.hoverIdx >= 0 && !hov ? (i < this.hoverIdx ? -8 : 8) : 0;     // соседи слегка расступаются
      h.el.style.zIndex = hov ? 99 : i + 1;
      const cx = g.x0 + i * g.step + push;
      if (h.open !== hov) { h.open = hov; h.el.classList.toggle('open', hov); }
      if (hov) {       // большая карточка не должна выходить за края сцены
        const ox = U.clamp(-(HAND_OPEN_W - HAND_W) / 2, 6 - cx, 960 - HAND_OPEN_W - 6 - cx);
        h.el.style.setProperty('--ox', ox.toFixed(0) + 'px');
      }
      const r = hov ? 0 : U.clamp(d * (n > 8 ? 2.4 : 4), -16, 16);
      h.el.style.setProperty('--cr', r.toFixed(1) + 'deg');       // метка «?/ДА/НЕТ» поворачивается обратно и остаётся ровной
      h.body.to({
        x: cx,
        y: hov ? 540 - HAND_H - 2 : 408 + d * d * (n > 6 ? 0.5 : 1.4),
        s: 1,
        r: r
      });
    });
    this.updateHandHit();
  }
  updateHandHit() {
    const g = this.handGeom(), hit = this.handHit;
    if (!g.n) { hit.style.display = 'none'; return; }
    const hov = this.hoverIdx >= 0;
    const top = hov ? 540 - HAND_OPEN_H - 12 : 402;   // пока карточка раскрыта, зона вытянута вверх вместе с ней
    const m = hov ? 34 : 6;
    hit.style.display = 'block';
    hit.style.left = (g.x0 - m) + 'px'; hit.style.width = ((g.n - 1) * g.step + HAND_W + 2 * m) + 'px';
    hit.style.top = top + 'px'; hit.style.height = (540 - top) + 'px';
  }
  onHandMove(e) {
    const g = this.handGeom(); if (!g.n) return;
    const p = Stage.local(e);
    let i = g.step ? U.clamp(Math.floor((p.x - g.x0) / g.step), 0, g.n - 1) : 0;
    if (this.hoverIdx >= 0 && i !== this.hoverIdx && g.step) {     // гистерезис: на границе полос не дёргаемся
      const lo = g.x0 + this.hoverIdx * g.step;
      if (p.x > lo - 4 && p.x < lo + g.step + 4) i = this.hoverIdx;
    }
    this.setHover(i);
  }
  setHover(i) {
    if (i === this.hoverIdx) return;
    this.hoverIdx = i;
    this.layoutHand();
    if (i >= 0) {
      const now = performance.now();
      if (now - (this._hs || 0) > 90) { Snd.fx.hover(); this._hs = now; }
    }
  }
  /* Нажатие на карточку целиком: «?» → «ДА» → «НЕТ» — личная пометка игрока, на счёт не влияет. */
  cycleMark(i) {
    if (i < 0 || !this.hand[i]) return;
    const h = this.hand[i];
    h.mark = (h.mark + 1) % 3;
    h.markEl.className = 'mark' + (h.mark ? ' m' + h.mark : '');
    h.markEl.textContent = ['?', 'ДА', 'НЕТ'][h.mark];
    Snd.fx.click();
  }

  /* ---------- блокнот ---------- */
  addNote(note) {
    this.notes.push(note);
    this.padCnt.textContent = String(this.notes.length);
    this.renderNotes();
    Snd.fx.note();
    const pb = new Anim.Body(this.padEl, { x: 0, y: 0, k: 300 });
    pb.set({ y: -8 }); pb.to({ y: 0 }).then(() => { this.padEl.style.transform = ''; pb.destroy(); });
  }
  renderNotes() {
    const p = this.notesPanel;
    p.innerHTML = '<h4>ЗАМЕТКИ</h4>';
    this.notes.slice().reverse().forEach(n => {
      const d = U.el('div', 'note');
      d.innerHTML = '<small>' + U.esc(n.by).toUpperCase() + '</small>' + U.esc(n.text);
      p.appendChild(d);
    });
  }

  /* ---------- звонки ---------- */
  ring(call) {
    this.ringing = call; call.left = call.window;
    const cid = call.caller === 'unknown' ? 'Неизвестный номер' : (CALLERS[call.caller].label || CALLERS[call.caller].name);
    this.callerId.textContent = cid;
    this.phoneEl.classList.add('ringing');
    this.ringUi.style.display = 'flex';
    Snd.ringStart();
  }
  stopRing() { this.phoneEl.classList.remove('ringing'); this.ringUi.style.display = 'none'; Snd.ringStop(); this.ringing = null; }
  /* Сбросить вызов: информация из него теряется, как при пропущенном звонке (незнакомый номер может быть и ловушкой). */
  rejectCall() {
    const c = this.ringing; if (!c || this.finished) return;
    this.stopRing(); c.missed = true; c.rejected = true;
    Snd.fx.hangup(); UI.toast('Вызов сброшен', 1600);
  }
  answer() {
    const call = this.ringing; if (!call) return;
    this.stopRing();
    Snd.fx.pickup();
    this.phoneEl.classList.add('talk');
    this.pickUp();
    this.openDialog(call);
  }

  /* ---------- трубка и шнур ---------- */
  setHandset(lying) {
    this.hsLying = lying;
    this.hsUp.style.display = lying ? 'none' : 'block';
    this.hsLy.style.display = lying ? 'block' : 'none';
    const sz = lying ? HS_SIZE.lying : HS_SIZE.up;
    this.handsetEl.style.width = sz[0] + 'px'; this.handsetEl.style.height = sz[1] + 'px';
  }
  /* Полёт по времени (а не пружина): пружина «досыпается» дольше секунды. */
  moveHandset(to, dur) {
    const hb = this.handsetBody, f = { x: hb.p.x, y: hb.p.y, s: hb.p.s, r: hb.p.r };
    return Anim.tween(dur, e => hb.set({ x: U.lerp(f.x, to.x, e), y: U.lerp(f.y, to.y, e), s: U.lerp(f.s, to.s, e), r: U.lerp(f.r, to.r, e) }));
  }
  async pickUp() {
    const id = ++this.hsToken;
    await this.moveHandset(HS_LIFT, 0.16);
    if (id !== this.hsToken) return;
    this.setHandset(true); this.handsetBody.set(HS_SWAP);       // в воздухе меняем спрайт на лежачий и роняем на стол
    await this.moveHandset(HS_LYING, 0.3);
  }
  async putDown() {
    const id = ++this.hsToken;
    if (this.hsLying) {
      await this.moveHandset(HS_SWAP, 0.2);
      if (id !== this.hsToken) return;
      this.setHandset(false); this.handsetBody.set(HS_LIFT);
    }
    await this.moveHandset(HS_REST, 0.2);
  }
  /* Точка крепления шнура на трубке (в пикселях телефона) с учётом её положения и поворота. */
  handsetPort() {
    const p = this.handsetBody.p, sz = this.hsLying ? HS_SIZE.lying : HS_SIZE.up;
    const cx = sz[0] / 2, cy = sz[1] / 2;
    const lx = this.hsLying ? sz[0] - 6 : 1, ly = this.hsLying ? 17 : 70;
    const dx = (lx - cx) * p.s, dy = (ly - cy) * p.s, a = p.r * Math.PI / 180;
    return { x: p.x + cx + dx * Math.cos(a) - dy * Math.sin(a), y: p.y + cy + dx * Math.sin(a) + dy * Math.cos(a) };
  }
  /* Витой шнур: кривая Безье от разъёма корпуса до трубки, витки — чередующиеся тёмные и светлые кружки. */
  drawCord() {
    const cv = this.cordCv, x = this.cordCtx; if (!cv) return;
    x.clearRect(0, 0, cv.width, cv.height);
    const A = CORD_PORT, B = this.handsetPort();
    const t = U.clamp((10 - B.x) / 50, 0, 1);                       // чем дальше трубка от корпуса, тем сильнее провисает петля
    const P1 = { x: A.x - 48, y: A.y + 44 }, P2 = { x: B.x + U.lerp(-62, 44, t), y: B.y + 30 };
    const N = 72, pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = 1 - u;
      pts.push({
        x: Math.round(((v * v * v * A.x + 3 * v * v * u * P1.x + 3 * v * u * u * P2.x + u * u * u * B.x) + 200) / 2),
        y: Math.round((v * v * v * A.y + 3 * v * v * u * P1.y + 3 * v * u * u * P2.y + u * u * u * B.y) / 2)
      });
    }
    pts.forEach(p => Sprites.disc(x, '#141010', p.x, p.y, 2));
    pts.forEach((p, i) => Sprites.disc(x, i % 4 < 2 ? '#6a645f' : '#3d3835', p.x, p.y, 1));
  }
  openDialog(call) {
    const cc = CALLERS[call.caller];
    const look = call.caller === 'unknown' ? CALLERS.unknown.look : cc.look;
    const voice = call.caller === 'unknown' ? (call.kind === 'competitor' ? 'unknown' : 'citizen') : cc.voice;
    const name = call.caller === 'unknown' ? 'Неизвестный номер' : (cc.label || cc.name);
    const box = U.el('div', 'dlg pxbox');
    const pic = U.el('div', 'pic'); pic.appendChild(UI.portrait(look, 3));
    const right = U.el('div'); right.style.flex = '1';
    right.innerHTML = '<div class="nm"></div><div class="tx"></div>';
    U.$('.nm', right).textContent = name.toUpperCase();
    const nx = U.el('div', 'nx'); nx.textContent = '▼';
    box.appendChild(pic); box.appendChild(right); box.appendChild(nx);
    if (cc && cc.trait && call.caller !== 'boss') { const m = U.el('div', 'meta'); m.textContent = cc.trait; box.appendChild(m); }
    UI.dlg.innerHTML = ''; UI.dlg.appendChild(box);
    if (this.cfg.pauseOnCall) this.paused = true;
    const tx = U.$('.tx', right);
    let i = 0, ctl = null;
    const showLine = () => {
      nx.style.visibility = 'hidden';
      ctl = UI.type(tx, call.lines[i], voice, { onDone: () => { nx.style.visibility = 'visible'; } });
    };
    const advance = () => {
      if (ctl && !ctl.isDone()) { ctl.skip(); return; }
      i++;
      if (i >= call.lines.length) { close(); return; }
      showLine();
    };
    const key = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(); } };
    this.dlgKey = key;
    const close = () => {
      window.removeEventListener('keydown', key); this.dlgKey = null;
      UI.dlg.innerHTML = '';
      this.paused = false;
      this.phoneEl.classList.remove('talk'); this.putDown(); Snd.fx.hangup();
      this.finishCall(call, name);
    };
    box.addEventListener('pointerdown', advance);
    window.addEventListener('keydown', key);
    showLine();
  }
  finishCall(call, name) {
    call.done = true;
    if (call.mode === 'item' && call.itemId) {
      this.addToHand({ id: call.itemId, ch: 'phone', by: name }, { x: 380, y: 330, s: 1 });
    } else if (call.clue) {
      this.addNote({ text: call.clue.text, by: name, ch: 'phone' });
    }
  }

  /* ---------- время ---------- */
  run() {
    Snd.music('day'); Snd.ambience(true);
    this.stop = Anim.every(dt => this.tick(dt));
    return this.promise;
  }
  /* Пауза из меню: время стоит, звонок не звонит. */
  pause() {
    if (this.extPause || this.finished) return;
    this.extPause = true;
    if (this.ringing) Snd.ringStop();
  }
  resume() {
    if (!this.extPause) return;
    this.extPause = false;
    if (this.ringing && !this.finished) Snd.ringStart();
  }
  tick(dt) {
    if (this.finished) return;
    if (!this.paused && !this.extPause) {
      if (!this.freeze) this.timeLeft = Math.max(0, this.timeLeft - dt);       // freeze — режим разработчика
      const elapsed = this.day.time - this.timeLeft;
      // кофе остывает и убывает по ходу дня
      const pd = elapsed / this.day.time, ms = pd < 0.15 ? 0 : pd < 0.3 ? 1 : pd < 0.5 ? 2 : pd < 0.7 ? 3 : pd < 0.88 ? 4 : 5;
      if (ms !== this.mugStep) { this.mugStep = ms; Desk.setMug(this.mugEl, ms); }
      // звонки
      const nc = this.day.calls[this.callIdx];
      if (nc && elapsed >= nc.at && !this.ringing && !this.dlg) { this.callIdx++; this.ring(nc); }
      if (this.ringing) {
        this.ringing.left -= dt;
        this.ringBar.style.transform = 'scaleX(' + Math.max(0, this.ringing.left / this.ringing.window).toFixed(3) + ')';
        if (this.ringing.left <= 0) { const c = this.ringing; this.stopRing(); c.missed = true; Snd.fx.missed(); UI.toast('Звонок пропущен. Вы что-то упустили…'); }
      }
      // напряжение: музыка, тиканье, красная пульсация
      const crit = Math.max(25, this.day.time * 0.25);
      const tension = this.timeLeft < crit ? U.clamp(1 - this.timeLeft / crit, 0, 1) : 0;
      Snd.setTension(tension);
      const hot = tension > 0.35;
      if (hot !== this.hot) { this.hot = hot; this.tensionEl.classList.toggle('on', hot); }
      const sec = Math.ceil(this.timeLeft);
      if (sec !== this.lastSec) {
        this.lastSec = sec;
        if (this.timeLeft < crit && this.timeLeft > 0) { this.tickAlt ^= 1; Snd.fx.tick(this.tickAlt, this.timeLeft < 10); }
        this.updateTimer();
      }
      this.tbi.style.transform = 'scaleX(' + (this.timeLeft / this.day.time).toFixed(4) + ')';
      if (this.timeLeft <= 0) this.finish('time');
    }
  }
  updateTimer() {
    this.tn.textContent = U.fmtTime(this.timeLeft);
    const crit = Math.max(25, this.day.time * 0.25);
    this.timerEl.classList.toggle('warn', this.timeLeft < crit * 1.6 && this.timeLeft >= crit);
    this.timerEl.classList.toggle('crit', this.timeLeft < crit);
  }
  askEnd() {
    if (this.finished) return;
    this.paused = true;
    const msg = this.timeLeft > 15 ? 'Завершить день досрочно? Оставшееся время пропадёт.' : 'Завершить день?';
    UI.confirm(msg, 'Завершить', 'Продолжить').then(yes => { this.paused = false; if (yes) this.finish('manual'); });
  }
  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    if (this.stop) this.stop();
    this.stopRing(); UI.dlg.innerHTML = '';
    Snd.setTension(0); Snd.ambience(false);
    U.$('#tension').classList.remove('on');
    this.root.style.pointerEvents = 'none';
    if (reason === 'time') Snd.fx.bad();
    this.resolve({ hand: this.hand.map(h => ({ id: h.id, ch: h.ch, by: h.by, mark: h.mark })), notes: this.notes, timeLeft: this.timeLeft, reason: reason });
  }
  destroy() {
    this.finished = true;
    if (this.stop) this.stop();
    this.stopRing();
    this.hsToken++;
    if (this._outside) window.removeEventListener('pointerdown', this._outside);
    clearTimeout(this._notesTimer);
    if (this.handsetBody) this.handsetBody.destroy();
    if (this.decor) Object.keys(this.decor).forEach(k => this.decor[k].body.destroy());
    if (this.dlgKey) { window.removeEventListener('keydown', this.dlgKey); this.dlgKey = null; }
    UI.dlg.innerHTML = '';
    Snd.setTension(0); Snd.ambience(false);
    U.$('#tension').classList.remove('on');
    this.root.innerHTML = '';
  }
}
