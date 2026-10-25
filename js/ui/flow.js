'use strict';
/* Сценарий игры: меню, сюжетные карточки, дни, итоги, пауза/перезапуск, сохранение, финал. */

const TUTORIAL = [
  'Берите газету из стопки в левом верхнем углу и тяните её в центр стола (или просто нажмите на стопку).',
  'Наведите курсор на жирные строки — они подсветятся. Нажмите, и инфоповод окажется у вас в руке (справа внизу). Из газеты он не вырывается, только подсвечивается.',
  'Прочитанную газету перетащите в «Прочитанные» (слева внизу). Наведите на стопку, и газеты выдвинутся: любую можно вытянуть и перечитать.',
  'Нажатие на карточку в руке меняет вашу пометку: «?», «ДА», «НЕТ». Это ваши личные заметки, на оценку они не влияют.',
  'Когда звонит телефон (справа вверху), нажмите на него. Подсказки из звонков и утренних вестей лежат в блокноте под телефоном.',
  'Не всё, что написано, — правда. Ищите подсказки в газетах, звонках и событиях. Внизу по центру выдвигается кнопка «Завершить день». В конце дня вы соберёте страницу из достоверных и подходящих друг другу инфоповодов.',
  'Клавиша Esc или кнопка «Меню» ставит игру на паузу: оттуда можно переиграть день, начать заново, выйти или ещё раз посмотреть подсказки по интерфейсу. Кнопка «Полный экран» есть в главном меню и на паузе.'
];

/* Выход из сценария: «день» (переиграть), «игра» (с нуля) или «меню». */
class Exit { constructor(kind) { this.kind = kind; } }

const Flow = {
  prog: null, diff: 'normal', desk: null, audioOn: false, skipIntro: false, skipDayCard: false,
  snap: null, exitDef: null, pauseOpen: false, _pauseClose: null,
  jury: /[?&]jury=1/.test(location.search), forceInterview: false,
  /* ?seed=12345 в адресе: новая игра начинается с этим сидом, поэтому одни и те же дни можно показать снова */
  seedParam: (() => { const m = /[?&]seed=(\d{1,10})(?:&|$)/.exec(location.search), v = m ? parseInt(m[1], 10) : null; return v !== null && v <= 2147483647 ? v : null; })(),

  /* ---------- служебное ---------- */
  unlockAudio() {
    if (this.audioOn) return;
    this.audioOn = true; Snd.init();
    if (this.onMenu) Snd.music('menu');
  },

  /* Все долгие ожидания идут через wait(): тогда выход в меню или перезапуск прерывает любой экран. */
  newExit() {
    const d = {};
    d.promise = new Promise((_, rej) => { d.reject = rej; });
    d.promise.catch(() => {});
    this.exitDef = d;
  },
  wait(p) { return this.exitDef ? Promise.race([p, this.exitDef.promise]) : p; },
  exit(kind) {
    if (!this.exitDef) return;
    const d = this.exitDef; this.exitDef = null;
    this.pauseOpen = false; this._pauseClose = null;
    this.cleanupScene();
    d.reject(new Exit(kind));
  },
  cleanupScene() {
    UI.clear(); UI.dlg.innerHTML = '';
    if (this.desk) { this.desk.destroy(); this.desk = null; }
    Snd.ringStop(); Snd.setTension(0); Snd.ambience(false);
    if (this._jury) { window.removeEventListener('keydown', this._jury); this._jury = null; }
  },

  menuButton(parent) {
    const w = U.el('div', 'menu-top');
    w.appendChild(UI.btn('МЕНЮ', 'alt', () => this.pauseMenu()));
    parent.appendChild(w);
  },

  /* Меню паузы: продолжить, переиграть день, начать заново, выйти. Работает и за столом, и на экранах после дня. */
  pauseMenu() {
    if (!this.exitDef) return;
    if (this.pauseOpen) { if (this._pauseClose) this._pauseClose(); return; }
    this.pauseOpen = true;
    const d = this.desk; if (d) d.pause();
    const scr = UI.screen();
    UI.sndButtons(scr);
    const box = U.el('div', 'pxbox story-card'); box.style.width = '460px';
    box.innerHTML = '<h2>ПАУЗА</h2>';
    const col = U.el('div', 'menu-col'); col.style.cssText = 'width:100%;gap:12px';
    const close = () => { scr.remove(); this.pauseOpen = false; this._pauseClose = null; if (d) d.resume(); };
    this._pauseClose = close;
    const ask = (text, yes, kind) => async () => { if (await UI.confirm(text, yes, 'Отмена')) this.exit(kind); };
    col.appendChild(UI.btn('ПРОДОЛЖИТЬ', '', close));
    if (d && !d.finished) col.appendChild(UI.btn('ПОДСКАЗКИ ПО ИНТЕРФЕЙСУ', 'alt', async () => {
      scr.remove(); this.pauseOpen = false; this._pauseClose = null;          // стол остаётся на паузе, пока идут подсказки
      await this.wait(Tour.run(d));
      d.resume();
    }));
    col.appendChild(UI.btn('ПЕРЕИГРАТЬ ДЕНЬ', 'alt', ask('Начать этот день с начала? Всё, что вы собрали сегодня, пропадёт.', 'Переиграть', 'day')));
    col.appendChild(UI.btn('НАЧАТЬ ИГРУ ЗАНОВО', 'alt', ask('Начать игру с первого дня? Текущий прогресс пропадёт.', 'Начать заново', 'game')));
    col.appendChild(UI.btn('ВЫЙТИ В МЕНЮ', 'red', ask('Выйти в главное меню? Несохранённый прогресс пропадёт: сохраниться можно между днями.', 'Выйти', 'menu')));
    box.appendChild(col); scr.appendChild(box);
    UI.ov.appendChild(scr);
  },

  /* Универсальная карточка: портрет, печатный текст, кнопка. */
  card(o) {
    return this.wait(new Promise(res => {
      const scr = UI.screen(o.clear ? 'clear' : '');
      const box = U.el('div', 'pxbox story-card');
      if (o.width) box.style.width = o.width + 'px';
      let head = '';
      if (o.title) head = '<h2>' + U.esc(o.title) + '</h2>';
      const pic = U.el('div'); pic.style.flex = 'none';
      if (o.look) pic.appendChild(UI.portrait(o.look, 4));
      const txt = U.el('div'); txt.style.flex = '1';
      txt.innerHTML = head + (o.who ? '<div class="ps" style="font-size:9px;color:var(--yellow);margin-bottom:8px">' + U.esc(o.who.toUpperCase()) + '</div>' : '') + '<p class="ctx"></p>';
      const row = U.el('div', 'row');
      const wrap = U.el('div'); wrap.style.cssText = 'display:flex;gap:16px;align-items:flex-start';
      if (o.look) wrap.appendChild(pic); wrap.appendChild(txt); box.appendChild(wrap);
      const ctx = U.$('.ctx', txt);
      ctx.style.whiteSpace = 'pre-line';
      let ctl;
      if (o.instant) {              // длинный справочный текст: сразу целиком, без печатной машинки
        ctx.textContent = o.text;
        ctl = { skip() {}, stop() {}, isDone() { return true; } };
      } else ctl = UI.type(ctx, o.text, o.voice || 'narrator', { speed: o.speed || 20 });
      if (o.scroll) {               // прокрутка колёсиком, перетаскиванием полосы или пальцем
        ctx.classList.add('scroll');
        const hint = U.el('div', 'scroll-hint'); hint.textContent = 'ПРОКРУТИТЕ ТЕКСТ ВНИЗ';
        txt.appendChild(hint);
        const upd = () => { hint.style.visibility = (ctx.scrollHeight - ctx.clientHeight - ctx.scrollTop > 6) ? 'visible' : 'hidden'; };
        ctx.addEventListener('scroll', upd);
        setTimeout(upd, 60);
      }
      const go = UI.btn(o.btn || 'ДАЛЕЕ', '', () => { ctl.stop(); scr.remove(); res(); });
      row.appendChild(go); box.appendChild(row);
      box.addEventListener('pointerdown', e => { if (e.target.tagName !== 'BUTTON') ctl.skip(); });
      scr.appendChild(box);
      UI.show(scr);
    }));
  },

  /* ---------- меню ---------- */
  menu() {
    this.onMenu = true;
    this.exitDef = null; this.pauseOpen = false;
    if (this.audioOn) Snd.music('menu');
    Snd.setTension(0);
    this.desk && this.desk.destroy(); this.desk = null;
    U.$('#desk').innerHTML = '';
    const bg = Sprites.clone(Sprites.desk(), 2); bg.classList.add('bg'); bg.style.cssText += ';position:absolute;left:0;top:0';
    U.$('#desk').appendChild(bg);
    Desk.buildDecor(U.$('#desk'), null);
    U.$('#desk').appendChild(Desk.makeMug(0));
    U.$('#desk').style.pointerEvents = 'none';
    const scr = UI.screen();
    UI.sndButtons(scr);
    scr.insertAdjacentHTML('beforeend', '<div class="title-logo">ИНФОПОВОДО<br>ИНАТОР</div><div class="title-sub">Игра о профессии журналиста</div>');
    const col = U.el('div', 'menu-col');
    col.appendChild(UI.btn('НОВАЯ ИГРА', '', () => { this.unlockAudio(); this.askName(); }));
    const fileIn = U.el('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json'; fileIn.style.display = 'none';
    fileIn.addEventListener('change', () => { if (fileIn.files[0]) this.loadFile(fileIn.files[0]); });
    col.appendChild(UI.btn('ЗАГРУЗИТЬ СОХРАНЕНИЕ', 'alt', () => { this.unlockAudio(); fileIn.click(); }));
    col.appendChild(UI.btn('КАК ИГРАТЬ', 'alt', () => { this.unlockAudio(); this.howTo(); }));
    const dl = U.el('div', 'ps'); dl.style.cssText = 'font-size:8px;color:var(--paperD);text-align:center;margin-top:4px'; dl.textContent = 'СЛОЖНОСТЬ';
    col.appendChild(dl);
    const row = U.el('div', 'diff-row');
    const diffs = [['easy', 'ЛЁГКАЯ'], ['normal', 'НОРМАЛЬНАЯ'], ['hard', 'СЛОЖНАЯ']];
    const btns = [];
    const info = U.el('div', 'diff-desc');
    const show = id => { info.textContent = this.diffInfo(id); info.className = 'diff-desc d-' + id; };
    const paint = () => btns.forEach((x, i) => { x.className = 'btn d-' + diffs[i][0] + (diffs[i][0] === this.diff ? ' sel' : ' dim'); });
    diffs.forEach(d => {
      const b = UI.btn(d[1], '', () => { this.diff = d[0]; paint(); show(d[0]); });
      b.addEventListener('pointerenter', () => show(d[0]));      // описание уровня при наведении
      b.addEventListener('pointerleave', () => show(this.diff));
      btns.push(b); row.appendChild(b);
    });
    paint(); show(this.diff);
    col.appendChild(row); col.appendChild(info);
    scr.appendChild(col);
    if (this.jury) {
      const note = U.el('div', 'menu-note');
      note.innerHTML = '<b style="color:var(--yellow)">РЕЖИМ ЖЮРИ: клавиша I — гарантированное интервью после дня, 9 — быстро закончить день.</b>';
      scr.appendChild(note);
    }
    UI.show(scr);
  },

  /* Описание уровня сложности: числа берутся из настроек, поэтому не расходятся с игрой. */
  diffInfo(id) {
    const c = Engine.CFG[id];
    const topic = c.hint === 'group' ? 'Босс прямо называет тему дня.' : (c.hint === 'text' ? 'Босс лишь намекает на тему.' : 'Босс о теме молчит: догадывайтесь сами.');
    const trick = id === 'easy' ? 'Подвохов мало, а звонок ставит время на паузу.' : (id === 'normal' ? 'Подвохов больше: звонят и незнакомцы.' : 'Много ложных новостей и обманчивых подсказок.');
    return 'Время дня: ' + U.fmtTime(c.time) + '. ' + topic + ' ' + trick + ' Интервью: ' + c.interviewTime + ' с на вопрос.' + (id === 'normal' ? ' Рекомендуется.' : '');
  },

  async howTo() {
    await this.card({ title: 'КАК ИГРАТЬ', text: TUTORIAL.join('\n\n'), width: 720, scroll: true, instant: true, btn: 'НАЗАД' });
    this.menu();
  },

  askName() {
    const scr = UI.screen();
    const box = U.el('div', 'pxbox story-card'); box.style.width = '520px';
    box.innerHTML = '<h2>КАК ВАС ЗОВУТ?</h2><p>Назовите вашего журналиста. Если оставить поле пустым, он будет зваться «' + DEFAULT_NICK + '».</p>';
    const inp = U.el('input', 'name-input'); inp.maxLength = 24; inp.placeholder = DEFAULT_NICK;
    box.appendChild(inp);
    const row = U.el('div', 'row');
    row.appendChild(UI.btn('НАЗАД', 'alt', () => this.menu()));
    row.appendChild(UI.btn('НАЧАТЬ', '', () => { this.start(inp.value); }));
    box.appendChild(row);
    scr.appendChild(box); UI.show(scr);
    setTimeout(() => inp.focus(), 50);
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') this.start(inp.value); });
  },

  loadFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      const r = Engine.importSave(String(rd.result));
      if (!r.ok) { UI.toast(r.err, 4200); Snd.fx.bad(); return; }
      this.diff = r.prog.diff;
      this.prog = r.prog; this.skipIntro = true; this.skipDayCard = false;
      UI.toast('Сохранение загружено: день ' + Math.min(r.prog.day, DAYS_TOTAL) + ', ' + r.prog.nick, 3000);
      this.run();
    };
    rd.onerror = () => UI.toast('Не удалось прочитать файл.', 3000);
    rd.readAsText(file);
  },

  start(nick) {
    this.prog = Engine.newProgress(nick, this.diff, this.seedParam);
    if (this.seedParam !== null) UI.toast('Сид партии из адреса: ' + this.seedParam, 3200);
    this.skipIntro = false; this.skipDayCard = false;
    this.run();
  },

  /* ---------- основной сценарий ---------- */
  async run() {
    this.onMenu = false;
    U.$('#desk').style.pointerEvents = 'auto';
    for (;;) {
      this.newExit();
      try {
        if (!this.skipIntro) {
          Snd.music('event');
          for (const t of STORY.intro) await this.card({ text: t, width: 600 });
        }
        while (this.prog.day <= DAYS_TOTAL) {
          await this.playDay();
          if (this.prog.day <= DAYS_TOTAL) await this.betweenDays();
        }
        await this.finale();
        this.menu();
        return;
      } catch (e) {
        if (!(e instanceof Exit)) throw e;
        if (e.kind === 'menu') { this.menu(); return; }
        if (e.kind === 'finale') {                                // из режима разработчика: сразу к финалу главы
          this.prog.day = DAYS_TOTAL + 1; this.skipIntro = true; this.skipDayCard = false;
        } else if (e.kind === 'day') {                                   // вернуть прогресс на начало дня и сыграть его заново
          this.prog = JSON.parse(JSON.stringify(this.snap));
          this.skipIntro = true; this.skipDayCard = true;
        } else {                                                  // «игра заново»: тот же журналист и сложность, новый seed
          this.prog = Engine.newProgress(this.prog.nick, this.prog.diff, this.seedParam);
          this.skipIntro = true; this.skipDayCard = false;
        }
        this.onMenu = false;
        U.$('#desk').style.pointerEvents = 'auto';
      }
    }
  },

  async playDay() {
    const prog = this.prog, n = prog.day;
    this.snap = JSON.parse(JSON.stringify(prog));                 // точка возврата для «переиграть день»
    Snd.music('event');
    if (!this.skipDayCard) {
      const di = STORY.days[Math.min(n, DAYS_TOTAL) - 1];
      let text = di.text.replace(/\{n\}/g, prog.nick);
      if (prog.attempt > 0) text = STORY.retry[prog.seed % STORY.retry.length].replace(/\{n\}/g, prog.nick) + '\n\n' + text;
      await this.card({ title: di.title.toUpperCase(), text: text, width: 660 });
    }
    this.skipDayCard = false;

    // интервью после идеального дня
    let celebName = '';
    if (prog.interviewPending) {
      const rng = new RNG(U.hash(prog.seed + ':iv:' + n));
      const celeb = Engine.pickCeleb(prog, rng);
      prog.celebsSeen.push(celeb.id); prog.interviewDay = n;
      const res = await this.wait(Interview.run(prog, celeb, rng));
      prog.bonus = res.bonus; prog.interviewPending = false; celebName = celeb.name;
    } else prog.bonus = 0;

    const day = Engine.makeDay(prog);
    delete prog.devGroup;                                         // тема из режима разработчика действует один день
    const problems = Engine.validateDay(day);
    if (problems.length && window.console) console.warn('День нерешаем:', problems);
    this.lastDay = day;

    const desk = this.desk = new Desk(prog, day);
    this.onMenu = false;
    desk.build();
    if (Dev.on) Dev.seedInfo(true);                                 // режим разработчика: в начале каждого дня показываем сид
    day.bonus.forEach(id => desk.addToHand({ id: id, ch: 'interview', by: celebName || 'Знаменитость' }, { x: 440, y: 240, s: 1 }));

    // подводка босса: на сложной темы не называет и ничего не говорит, поэтому карточки нет
    if (day.hint) await this.card({ who: CALLERS.boss.label + ', главный редактор', look: CALLERS.boss.look, voice: 'boss', text: day.hint, width: 560, btn: 'ЕСТЬ!' });
    await this.morningEvent(day, desk);

    if (this.jury) this.bindJury(desk);
    // подсказки по интерфейсу: один раз в первый день новой игры (таймер ещё не запущен); потом их можно позвать из меню паузы
    if (n === 1 && prog.attempt === 0 && !Tour.seen()) await this.wait(Tour.run(desk));
    const res = await this.wait(desk.run());
    const fp = this.devPerfect ? Engine.perfectPage(day) : await this.wait(FinalPage.run(day, res.hand));
    this.devPerfect = false;
    const sc = Engine.scorePage(day, fp.placed, fp.headline);
    await this.result(day, sc, fp, res.hand);
    desk.destroy(); this.desk = null;

    // прогресс
    prog.scores.push({ day: n, score: sc.score, attempt: prog.attempt });
    const advance = sc.score >= 50 || prog.attempt >= 1;
    prog.lastGroup = day.group.id; prog.bonus = 0;
    if (advance) {
      prog.used.push(day.group.id); prog.attempt = 0;
      if (n < DAYS_TOTAL && ((sc.perfect && prog.interviewDay !== n) || ((this.jury || Dev.on) && this.forceInterview))) prog.interviewPending = true;
      prog.day++;
    } else prog.attempt++;
    this.forceInterview = false;
  },

  async morningEvent(day, desk) {
    const ev = day.event;
    if (!ev) return;
    Snd.music('event');
    if (ev.kind === 'flavor') {
      await this.card({ text: ev.text, width: 560, btn: 'ПОГНАЛИ' });
      return;
    }
    const nar = NARRATORS[ev.narrator];
    await this.card({ who: nar.name + ', ' + nar.role, look: nar.look, voice: nar.reliable ? 'citizen' : 'lena', text: ev.text, width: 620, btn: 'ПОНЯТНО' });
    if (ev.kind === 'item') desk.addToHand({ id: ev.itemId, ch: 'event', by: nar.name }, { x: 440, y: 230, s: 1 });
    else desk.addNote({ text: ev.clue.text, by: nar.name, ch: 'event' });
  },

  bindJury(desk) {
    if (this._jury) window.removeEventListener('keydown', this._jury);
    this._jury = e => {
      if (e.key === '9' && this.desk) { this.desk.timeLeft = Math.min(this.desk.timeLeft, 4); UI.toast('Режим жюри: день почти закончен'); }
      if ((e.key === 'i' || e.key === 'I' || e.key === 'ш' || e.key === 'Ш')) { this.forceInterview = !this.forceInterview; UI.toast('Интервью после дня: ' + (this.forceInterview ? 'ВКЛ' : 'ВЫКЛ')); }
    };
    window.addEventListener('keydown', this._jury);
  },

  /* ---------- итог дня ---------- */
  result(day, sc, fp, hand) {
    return this.wait(new Promise(res => {
      Snd.fx.jingle(sc.score === 100 ? 'perfect' : sc.score >= 75 ? 'good' : sc.score >= 50 ? 'ok' : 'bad');
      const scr = UI.screen();
      const box = U.el('div', 'res pxbox');
      box.innerHTML = '<h2>ДЕНЬ ' + this.prog.day + ' · ТЕМА: ' + U.esc(day.group.name.toUpperCase()) + '</h2>' +
        '<div class="big">0</div><div class="msg"></div><div class="boss"></div>';
      if (sc.perfect) { const st = U.el('div', 'stamp'); st.textContent = 'ИДЕАЛЬНО!'; box.appendChild(st); setTimeout(() => Snd.fx.stamp(), 300); }
      else if (sc.score < 50) { const st = U.el('div', 'stamp'); st.textContent = 'ПРОВАЛ'; box.appendChild(st); setTimeout(() => Snd.fx.stamp(), 300); }
      U.$('.msg', box).textContent = sc.msg;
      U.$('.boss', box).textContent = sc.boss;
      const big = U.$('.big', box);
      Anim.tween(1.2, k => { big.textContent = Math.round(sc.score * k); }, U.ease.out);

      const placedSet = new Set(fp.placed), handSet = new Set(hand.map(h => h.id));
      const ids = Object.keys(day.items).sort((a, b) => (placedSet.has(b) ? 1 : 0) - (placedSet.has(a) ? 1 : 0) || (handSet.has(b) ? 1 : 0) - (handSet.has(a) ? 1 : 0));
      const list = U.el('div', 'debrief');
      const head = U.el('div', 'ps'); head.style.cssText = 'font-size:9px;color:var(--yellow);margin:8px 0';
      head.textContent = 'РАЗБОР НА ПЛАНЁРКЕ';
      box.appendChild(head);
      ids.forEach(id => {
        const it = day.items[id];
        const url = srcUrl(it.src);
        const d = U.el('div', 'dr ' + (it.v ? 'true' : 'false'));
        const where = placedSet.has(id) ? 'НА СТРАНИЦЕ' : (handSet.has(id) ? 'В РУКЕ' : 'НЕ НАЙДЕНО');
        d.innerHTML = '<div class="ic">' + (it.v ? 'OK' : 'X') + '</div><div><div>' + U.esc(it.t) + '</div><div class="meta">' +
          '<span class="tagu">' + (it.v ? 'ДОСТОВЕРНО' : 'ЛОЖЬ') + '</span><span class="tagu">' + (it.logical ? 'ПО ТЕМЕ' : 'НЕ ПО ТЕМЕ') + '</span><span class="tagu">' + where + '</span><br>' +
          U.esc(it.why) + ' Источник: ' + (url ? '<a href="' + url + '" target="_blank" rel="noopener">' + U.esc(it.src) + '</a>' : U.esc(it.src)) + '</div></div>';
        list.appendChild(d);
      });
      box.appendChild(list);
      const actions = U.el('div', 'actions');
      if (sc.perfect && this.prog.day < DAYS_TOTAL) {
        const n = U.el('div'); n.style.cssText = 'flex:1;color:var(--yellow);font-size:9px;line-height:1.7;align-self:center';
        n.textContent = this.prog.interviewDay === this.prog.day
          ? 'Идеальный день! Знаменитости не дают интервью два дня подряд: завтра работаем без подсказок.'
          : 'Идеальный день! Завтра вас ждёт интервью со знаменитостью.';
        actions.appendChild(n);
      }
      actions.appendChild(UI.btn('ПЕРЕИГРАТЬ ДЕНЬ', 'alt', async () => {
        if (await UI.confirm('Переиграть этот день? Результат не засчитается.', 'Переиграть', 'Отмена')) this.exit('day');
      }));
      actions.appendChild(UI.btn('ДАЛЕЕ', '', () => { scr.remove(); res(); }));
      box.appendChild(actions);
      scr.appendChild(box);
      this.menuButton(scr);
      UI.show(scr);
      Snd.music('event');
    }));
  },

  /* ---------- между днями: сохранение ---------- */
  betweenDays() {
    return this.wait(new Promise(res => {
      const prog = this.prog;
      const last = prog.scores[prog.scores.length - 1];
      const failed = !!last && last.day === prog.day;          // день не засчитан: идёт повтор того же дня
      const scr = UI.screen();
      const box = U.el('div', 'pxbox story-card'); box.style.width = '720px';
      const rows = prog.scores.map(s => 'День ' + s.day + (s.attempt ? ' (повтор)' : '') + ': ' + s.score + '/100').join('\n');
      box.innerHTML = '<h2>' + (failed ? 'ДЕНЬ ПРОВАЛЕН' : 'ДЕНЬ ЗАВЕРШЁН') + '</h2><p style="white-space:pre-line;font-size:11px;line-height:1.9;color:var(--paperD)">' + U.esc(rows) + '</p>' +
        '<p>' + (failed ? 'Босс Аркадий Семёнович даёт ещё один шанс: тема дня будет другой.' : 'Можно сохраниться: файл скачается на компьютер, а загрузить его получится в главном меню.') + '</p>';
      const row = U.el('div', 'row');
      row.appendChild(UI.btn('СОХРАНИТЬ В ФАЙЛ', 'alt', () => this.download()));
      row.appendChild(UI.btn('ПЕРЕИГРАТЬ ДЕНЬ', 'alt', async () => {
        if (await UI.confirm('Переиграть последний день?', 'Переиграть', 'Отмена')) this.exit('day');
      }));
      const nextLabel = failed ? 'ПОВТОРИТЬ ДЕНЬ ' + prog.day : (prog.interviewPending ? 'ДАЛЕЕ: ИНТЕРВЬЮ' : 'СЛЕДУЮЩИЙ ДЕНЬ');
      row.appendChild(UI.btn(nextLabel, failed ? 'red' : '', () => { scr.remove(); res(); }));
      box.appendChild(row); scr.appendChild(box);
      this.menuButton(scr);
      UI.show(scr);
    }));
  },
  /* Имя файла сохранения читается без открытия: игра_журналист_день, с которого продолжится партия_сложность. */
  saveName() {
    const p = this.prog;
    const clean = s => String(s || '').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-').slice(0, 24);
    const diff = (Engine.CFG[p.diff] || {}).name || p.diff;
    return ['Инфоповодоинатор', clean(p.nick) || 'Журналист', 'день-' + Math.min(p.day, DAYS_TOTAL), diff.toLowerCase()].join('_') + '.json';
  },
  download() {
    const text = Engine.exportSave(this.prog);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    const name = this.saveName();
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    UI.toast('Сохранение скачано: ' + name, 4200);
  },

  /* ---------- финал главы ---------- */
  async finale() {
    Snd.music('finale'); Snd.fx.jingle('finale');
    const total = this.prog.scores.reduce((s, x) => s + x.score, 0);
    for (let i = 0; i < STORY.outro.length - 1; i++) await this.card({ title: i === 0 ? 'КОНЕЦ ГЛАВЫ' : '', text: STORY.outro[i], width: 640 });
    const avg = Math.round(total / Math.max(1, this.prog.scores.length));
    await this.card({ title: 'СПАСИБО ЗА ИГРУ!', text: STORY.outro[STORY.outro.length - 1] + '\n\nСредняя оценка ваших заметок: ' + avg + '/100.', width: 640, btn: 'В ГЛАВНОЕ МЕНЮ' });
  }
};
