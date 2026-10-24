'use strict';
/* Сценарии роликов и скриншотов для презентации. Запуск из консоли страницы dev/capture.html (рядом должен работать dev/receiver.ps1):
     await Scenes.init();                 // один раз после загрузки страницы
     Scenes.go('papers');                 // запустить ролик в фоне; прогресс: Scenes.job
     Scenes.go('shots');                  // набор скриншотов 1920x1080
   Готовые файлы попадают в presentation/media. */
const Scenes = (() => {
  const S = { job: null };
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const settle = async (ms) => { const n = Math.round(ms / (1000 / 60)); for (let i = 0; i < n; i++) { VClock.step(1000 / 60); await realSleep(0); } await realSleep(25); };     // пауза после каждого кадра нужна, чтобы успели выполниться обещания игры (цепочки await двигаются на шаг за такт)
  const clickBtn = (t, root) => { const b = Array.from((root || document).querySelectorAll('button')).find(b => b.textContent.indexOf(t) >= 0); if (b) { b.click(); return true; } return false; };
  const ring = () => {
    let r = document.getElementById('clickring');
    if (!r) { r = document.createElement('div'); r.id = 'clickring'; document.getElementById('stage').appendChild(r); }
    r.style.left = Rec.x + 'px'; r.style.top = Rec.y + 'px'; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go');
  };
  const click = async (target, ms) => { ring(); await Rec.press(target, ms); };
  const cursor = (x, y) => { Rec.cursorVisible(true); Rec.setCursor(x, y); };

  S.init = async () => { await Rec.init(); Rec.cursorVisible(false); return 'ok'; };

  /* Новая игра без вступительных карточек: заданное зерно, день, сложность. Карточки утра закрываются «в тихую». */
  S.startGame = async (o) => {
    o = o || {};
    const prog = Engine.newProgress('Джон Блохастый', o.diff || 'normal', o.seed || 8);
    prog.day = o.day || 2;
    if (o.interview) prog.interviewPending = true;
    Flow.prog = prog; Flow.skipIntro = true; Flow.skipDayCard = true;
    Flow.run();
    if (o.interview) { await settle(500); return true; }
    for (let k = 0; k < 400; k++) {
      await settle(120);
      if (Flow.desk && !$('#ov .screen')) break;
      const b = $$('#ov button').find(x => /^(ДАЛЕЕ|ЕСТЬ!?|ПОГНАЛИ|ПОНЯТНО)$/.test(x.textContent.trim()));
      if (b) b.click();
    }
    await settle(600);
    if (Flow.desk) Flow.desk.cfg.pauseOnCall = false;
    return !!Flow.desk;
  };
  const goodIds = (d, n, flag) => Object.keys(d.day.items).filter(id => d.day.items[id].v === flag && (flag === 0 || d.day.items[id].logical)).slice(0, n);
  const fillHand = (d, chs) => {
    const ids = goodIds(d, 4, 1).concat(goodIds(d, 2, 0));
    ids.forEach((id, i) => d.addToHand({ id: id, ch: chs[i % chs.length], by: 'Источник' }, { x: 440, y: 230, s: 1 }));
  };
  const finishRec = async (name, hold) => { Rec.hover(null); const r = await Rec.end(name, hold || 1400); Rec.cursorVisible(false); return r; };

  /* ---------- ролики ---------- */
  S.papers = async () => {                                  // газета из стопки → подсветка строк → инфоповоды в руку → газета в «Прочитанные»
    await S.startGame({ day: 2, seed: 8 });
    const d = Flow.desk; cursor(430, 330);
    await Rec.begin(640, 360, 15);
    await Rec.hold(350);
    await Rec.moveTo(95, 125, 450);
    Rec.ptr('pointerdown', Rec.x, Rec.y, d.stackEl); await Rec.hold(70);
    await Rec.moveTo(420, 280, 550, true);
    Rec.ptr('pointerup', Rec.x, Rec.y); await Rec.hold(750);
    for (let k = 0; k < 2; k++) {
      const b = $$('.paper-open .blk.item').filter(x => !x.classList.contains('got'))[0]; if (!b) break;
      const c = Rec.center(b);
      await Rec.moveTo(c.x - 30, c.y, 450); Rec.hover(b); await Rec.hold(380);
      await click(b); await Rec.hold(650);
    }
    const m = Rec.center($('.paper-open .p-mast'));
    await Rec.moveTo(m.x, m.y + 5, 350); Rec.hover(null);
    Rec.ptr('pointerdown', Rec.x, Rec.y, $('.paper-open .p-mast')); await Rec.hold(80);
    await Rec.moveTo(70, 440, 600, true);
    Rec.ptr('pointerup', Rec.x, Rec.y); await Rec.hold(750);
    return finishRec('papers', 1200);
  };

  S.phone = async () => {                                   // звонит босс → ответ → разговор в стиле Undertale → инфоповод в руке
    await S.startGame({ day: 2, seed: 8 });
    const d = Flow.desk; cursor(560, 330);
    const i = d.day.calls.findIndex(c => c.caller === 'boss');
    const call = d.day.calls.splice(i >= 0 ? i : 0, 1)[0];
    call.lines = call.lines.slice(0, 2);
    await Rec.begin(640, 360, 15);
    d.ring(call);
    await Rec.hold(1100);
    await Rec.moveTo(892, 110, 450);
    await click(d.phoneEl); await Rec.hold(1500);
    const dl = () => $('#dialog .dlg');
    for (let k = 0; k < 2; k++) {
      await Rec.moveTo(520, 430, 300);
      if (k === 0) await Rec.hold(500);
      await click(dl()); await Rec.hold(250);             // дописать реплику
      await click(dl()); await Rec.hold(k === 0 ? 1300 : 700);   // следующая реплика / закрыть
    }
    await Rec.hold(1000);
    return finishRec('phone', 1200);
  };

  S.hand = async () => {                                    // рука карточек: наведение раскрывает, нажатие меняет пометку «?», «ДА», «НЕТ»
    await S.startGame({ day: 2, seed: 8 });
    const d = Flow.desk; fillHand(d, ['paper', 'phone', 'interview', 'event', 'paper', 'phone']);
    await settle(900); cursor(420, 300);
    await Rec.begin(640, 360, 15);
    await Rec.hold(300);
    const g = d.handGeom();
    const at = i => g.x0 + i * g.step + 34;
    await Rec.moveTo(at(0), 470, 450, false, d.handHit); await Rec.hold(450);
    await Rec.moveTo(at(2), 470, 400, false, d.handHit); await Rec.hold(400);
    await click(d.handHit); await Rec.hold(350);
    await Rec.moveTo(at(3), 470, 350, false, d.handHit); await Rec.hold(300);
    await click(d.handHit); await Rec.hold(250); await click(d.handHit); await Rec.hold(500);
    await Rec.moveTo(at(5), 470, 400, false, d.handHit); await Rec.hold(500);
    await Rec.moveTo(430, 250, 400, false); await Rec.hold(400);
    return finishRec('hand', 1000);
  };

  S.page = async () => {                                    // финальная страница: слоты, заголовок, «Опубликовать», оценка и штамп
    await S.startGame({ day: 2, seed: 8 });
    const d = Flow.desk; fillHand(d, ['paper', 'phone', 'interview', 'event', 'paper', 'phone']);
    await settle(700);
    d.finish('manual'); await settle(900);
    cursor(300, 80);
    await Rec.begin(640, 360, 15);
    await Rec.hold(500);
    for (let k = 0; k < 4; k++) {
      const card = $$('.fp-hand .fcard:not(.used)')[0]; const slot = $$('.fp-slot')[k];
      const c = Rec.center(card), s = Rec.center(slot);
      await Rec.moveTo(c.x, c.y, 380); Rec.hover(card);
      Rec.ptr('pointerdown', Rec.x, Rec.y, card); await Rec.hold(60);
      await Rec.moveTo(s.x, s.y, 450, true);
      Rec.ptr('pointerup', Rec.x, Rec.y); Rec.hover(null); await Rec.hold(220);
    }
    const right = d.day.headlines.find(h => h.right).text;
    const hb = $$('.fp-hbtn').find(b => b.textContent === right);
    const hc = Rec.center(hb); await Rec.moveTo(hc.x, hc.y, 450); Rec.hover(hb); await Rec.hold(250); await click(hb); Rec.hover(null); await Rec.hold(400);
    const pub = $$('button').find(b => b.textContent.trim() === 'ОПУБЛИКОВАТЬ'); const pc = Rec.center(pub);
    await Rec.moveTo(pc.x, pc.y, 450); await click(pub);
    await Rec.hold(2800);
    return finishRec('page', 1500);
  };

  S.interview = async () => {                               // интервью со знаменитостью: карточка героя, вопросы, ответ
    await S.startGame({ day: 2, seed: 11, interview: true });
    cursor(560, 400);
    await Rec.begin(640, 360, 15);
    await Rec.hold(2200);
    const st = $$('#ov button').find(b => b.textContent.trim() === 'НАЧАТЬ'); const sc = Rec.center(st);
    await Rec.moveTo(sc.x, sc.y, 450); await click(st); await Rec.hold(900);
    const opts = $$('#ov .iv-opt'); const o = opts[1] || opts[0]; const oc = Rec.center(o);
    await Rec.moveTo(oc.x, oc.y, 500); Rec.hover(o); await Rec.hold(450); await click(o); Rec.hover(null);
    await Rec.hold(2400);
    return finishRec('interview', 1200);
  };

  S.living = async () => {                                  // живой стол: кружка, степлер, монеты, кактус, календарь
    await S.startGame({ day: 2, seed: 8 });
    const d = Flow.desk; cursor(430, 300);
    await Rec.begin(640, 360, 15);
    await Rec.hold(400);
    const poke = async (node, wait) => { const c = Rec.center(node); await Rec.moveTo(c.x, c.y, 420); Rec.hover(node.closest ? node : null); await Rec.hold(120); await click(node); Rec.hover(null); await Rec.hold(wait || 650); };
    await poke(d.mugEl.firstChild, 1000);
    await poke(d.decor.stapler.el, 500);
    await poke(d.decor.coins.el, 800);
    await poke(d.decor.cactus.el, 800);
    await poke(d.calEl, 800);
    await poke(d.decor.pen.el, 700);
    return finishRec('living', 900);
  };

  S.coffee = async () => {                                  // день пролетает: кофе остывает, таймер краснеет, экран темнеет по краям
    await S.startGame({ day: 2, seed: 8 });
    const d = Flow.desk; d.freeze = true; d.callIdx = d.day.calls.length; Rec.cursorVisible(false);
    const mid = d.day.time;
    await Rec.begin(640, 360, 15);
    await Rec.hold(600);
    await Rec.tween(6500, k => { d.timeLeft = mid * (1 - k * 0.975); });
    await Rec.hold(500);
    return finishRec('coffee', 900);
  };

  /* ---------- скриншоты 1920x1080 ---------- */
  S.shots = async () => {
    const out = [];
    const shot = async (name) => { out.push(await Rec.png(name, 1920, 1080)); };
    // меню
    Flow.menu(); await settle(600); await shot('shot_menu');
    // стол с открытой газетой, рукой и кружкой
    await S.startGame({ day: 3, seed: 21 });
    let d = Flow.desk; fillHand(d, ['paper', 'phone', 'interview', 'event', 'paper', 'phone']);
    d.callIdx = d.day.calls.length;
    const e = d.stackList.shift(); d.renderStack(); d.openPaper(e, { x: 30, y: 80, w: 128, h: 168 }, null, null);
    await settle(1300); d.cycleMark(1); d.cycleMark(2); d.timeLeft = d.day.time * 0.2; await settle(700);
    const b = $$('.paper-open .blk.item')[0]; if (b) { d.collectFromBlock(b); await settle(900); }
    await shot('shot_desk');
    d.setHover(2); await settle(500); await shot('shot_card'); d.setHover(-1); await settle(300);
    // разговор с боссом
    const i = d.day.calls.findIndex(c => c.caller === 'boss'); const call = d.day.calls.splice(i >= 0 ? i : 0, 1)[0];
    d.ring(call); await settle(500); d.answer(); await settle(2200); await shot('shot_dialog');
    // финальная страница и итог
    while ($('#dialog .dlg')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); await settle(200); }
    await settle(900); d.finish('manual'); await settle(900);
    const card = $$('.fp-hand .fcard:not(.used)'); for (let k = 0; k < 4; k++) { const c = $$('.fp-hand .fcard:not(.used)')[0]; if (!c) break; c.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true })); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await settle(150); }
    const right = d.day.headlines.find(h => h.right).text; const hb = $$('.fp-hbtn').find(x => x.textContent === right); if (hb) hb.click();
    await settle(400); await shot('shot_page');
    return out;
  };
  S.shotResult = async () => {                              // итог дня: оценка, штамп и реакция босса (отдельным чистым запуском: после остальных снимков экран итога не появлялся)
    await S.startGame({ day: 3, seed: 21 });
    const d = Flow.desk; fillHand(d, ['paper', 'phone', 'interview', 'event', 'paper', 'phone']); d.callIdx = d.day.calls.length; await settle(700);
    d.finish('manual'); await settle(900);
    for (let k = 0; k < 4; k++) { const c = $$('.fp-hand .fcard:not(.used)')[0]; if (!c) break; c.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true })); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await settle(150); }
    const right = d.day.headlines.find(h => h.right).text; const hb = $$('.fp-hbtn').find(x => x.textContent === right); if (hb) hb.click();
    await settle(400);
    $$('button').find(x => x.textContent.trim() === 'ОПУБЛИКОВАТЬ').click(); await settle(2200);
    return [await Rec.png('shot_result', 1920, 1080)];
  };
  S.shots2 = async () => {                                  // интервью и пауза отдельно (нужен другой старт игры)
    const out = [];
    await S.startGame({ day: 2, seed: 11, interview: true }); await settle(7000); out.push(await Rec.png('shot_interview_card', 1920, 1080));
    clickBtn('НАЧАТЬ', $('#ov')); await settle(900); out.push(await Rec.png('shot_interview_q', 1920, 1080));
    return out;
  };

  S.shots3 = async () => {                                  // звонящий телефон, блокнот с заметками и подсказки по интерфейсу (кадры для PPTX, где нельзя использовать ролики)
    const out = [];
    await S.startGame({ day: 3, seed: 21 });
    const d = Flow.desk; fillHand(d, ['paper', 'phone', 'interview', 'event', 'paper', 'phone']); d.callIdx = d.day.calls.length;
    d.timeLeft = d.day.time * 0.55; await settle(900);
    d.ring(d.day.calls[0]); await settle(700); out.push(await Rec.png('shot_ring', 1920, 1080));
    d.stopRing(); await settle(300);
    d.addNote({ by: 'Босс', text: 'Про Терешкову можешь не сомневаться: июнь 1963 года.' });
    d.addNote({ by: 'Лена', text: 'Белка и Стрелка потом летали на Луну! Точно-точно!' });
    await settle(500); d.notesPanel.classList.add('open'); await settle(500); out.push(await Rec.png('shot_notes', 1920, 1080));
    d.notesPanel.classList.remove('open'); await settle(300);
    Tour.run(d); await settle(600);
    for (let k = 0; k < 4; k++) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await settle(150); }
    await settle(900); out.push(await Rec.png('shot_tour', 1920, 1080));
    return out;
  };

  S.go = (name) => {
    S.job = { name: name, done: false, started: Date.now() };
    S[name]().then(r => { S.job.result = r; S.job.done = true; }).catch(e => { S.job.err = String(e && e.stack || e); S.job.done = true; });
    return 'started ' + name;
  };
  return S;
})();
