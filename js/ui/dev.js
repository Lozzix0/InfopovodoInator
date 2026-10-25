'use strict';
/* Режим разработчика: быстрые проверки без ожидания (звонок сейчас, время, инфоповоды в руку, прыжок на день, тема, интервью).
   Включается адресом ?dev=1 или набором слова DEVMODE на клавиатуре (любая раскладка).
   Панель открывается кнопкой DEV или клавишей F2 (также ё / `); команды можно набирать в строке внизу панели, help — список. */

const Dev = {
  on: false, panel: null, badge: null, logEl: null, input: null, buf: [], hist: [], hi: 0, freezeBtn: null, seedInput: null,

  init() {
    if (/[?&]dev=1/.test(location.search)) this.enable(true, true);
    window.addEventListener('keydown', e => this.onKey(e));
  },

  onKey(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    this.buf.push(e.code); if (this.buf.length > 7) this.buf.shift();
    if (this.buf.join() === 'KeyD,KeyE,KeyV,KeyM,KeyO,KeyD,KeyE') { this.buf = []; this.enable(!this.on); return; }
    if (this.on && (e.code === 'F2' || e.code === 'Backquote')) { e.preventDefault(); this.toggle(); }
  },

  enable(v, silent) {
    this.on = v;
    if (v) {
      if (!this.badge) {
        this.badge = U.el('div', 'dev-badge'); this.badge.textContent = 'DEV';
        this.badge.addEventListener('pointerdown', e => { e.stopPropagation(); this.toggle(); });
        U.$('#stage').appendChild(this.badge);
      }
      if (!silent) UI.toast('Режим разработчика включён. F2 — панель', 2600);
    } else {
      this.close();
      if (this.badge) { this.badge.remove(); this.badge = null; }
      if (!silent) UI.toast('Режим разработчика выключен', 1800);
    }
  },

  toggle() { if (this.panel) this.close(); else this.open(); },
  close() { if (this.panel) { this.panel.remove(); this.panel = null; this.logEl = null; this.input = null; this.seedInput = null; } },

  /* ---------- панель ---------- */
  open() {
    const p = this.panel = U.el('div', 'devbox');
    p.addEventListener('keydown', e => e.stopPropagation());
    const sec = t => { const h = U.el('h4'); h.textContent = t; p.appendChild(h); const r = U.el('div', 'dv-row'); p.appendChild(r); return r; };
    const btn = (row, label, cmd) => {
      const b = U.el('button'); b.textContent = label;
      b.addEventListener('click', () => { Snd.fx.click(); this.run(cmd); });
      row.appendChild(b); return b;
    };

    let r = sec('ЗВОНКИ');
    btn(r, 'Следующий', 'call'); btn(r, 'Босс', 'call boss'); btn(r, 'Лена', 'call lena'); btn(r, 'Борис', 'call boris');
    btn(r, 'Незнакомец', 'call unknown'); btn(r, 'ФуфелСмерч', 'call fufel');

    r = sec('ВРЕМЯ');
    btn(r, '+30 с', 'time +30'); btn(r, 'Осталось 10 с', 'time 10');
    this.freezeBtn = btn(r, 'Заморозить', 'freeze'); this.paintFreeze();
    btn(r, 'Закончить день', 'end'); btn(r, 'Идеальный день', 'perfect');

    r = sec('ИНФОПОВОДЫ');
    btn(r, 'Достоверные по теме в руку', 'hand true'); btn(r, 'Все в руку', 'hand all'); btn(r, 'Очистить руку', 'hand clear');
    btn(r, 'Метки ДА/НЕТ по правде', 'marks');

    r = sec('ДЕНЬ И СЮЖЕТ');
    for (let n = 1; n <= DAYS_TOTAL; n++) btn(r, 'День ' + n, 'day ' + n);
    btn(r, 'Интервью в начале дня', 'interview'); btn(r, 'Финал', 'finale');
    const sel = U.el('select');
    sel.innerHTML = '<option value="">Тема дня…</option>' + GROUPS.map(g => '<option value="' + g.id + '">' + U.esc(g.name) + '</option>').join('');
    sel.addEventListener('change', () => { if (sel.value) this.run('topic ' + sel.value); sel.value = ''; });
    p.appendChild(sel);

    // сид партии: из него (вместе с номером дня и попыткой) собирается каждый день; тот же сид и тот же день дают тот же день
    r = sec('СИД ПАРТИИ');
    const si = this.seedInput = U.el('input'); si.placeholder = 'сид (целое число)'; si.spellcheck = false; si.inputMode = 'numeric';
    si.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') this.run('seed ' + si.value.trim()); else if (e.key === 'Escape') si.blur(); });
    p.insertBefore(si, r);
    btn(r, 'Показать', 'seed');
    const go = U.el('button'); go.textContent = 'Запустить день с этим сидом';
    go.addEventListener('click', () => { Snd.fx.click(); this.run('seed ' + si.value.trim()); });
    r.appendChild(go);
    this.refreshSeed();

    const h = U.el('h4'); h.textContent = 'КОМАНДА (help — список)'; p.appendChild(h);
    const inp = this.input = U.el('input'); inp.placeholder = 'call lena, time 30, day 3 ...'; inp.spellcheck = false;
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && inp.value.trim()) { this.hist.push(inp.value); this.hi = this.hist.length; this.run(inp.value); inp.value = ''; }
      else if (e.key === 'ArrowUp' && this.hist.length) { this.hi = Math.max(0, this.hi - 1); inp.value = this.hist[this.hi]; }
      else if (e.key === 'ArrowDown' && this.hist.length) { this.hi = Math.min(this.hist.length, this.hi + 1); inp.value = this.hist[this.hi] || ''; }
      else if (e.key === 'Escape') inp.blur();
    });
    p.appendChild(inp);
    this.logEl = U.el('div', 'dv-log'); p.appendChild(this.logEl);
    U.$('#stage').appendChild(p);
  },
  /* Поле сида показывает сид текущей партии (если вы не печатаете в нём прямо сейчас). */
  refreshSeed() { if (this.seedInput && document.activeElement !== this.seedInput) this.seedInput.value = Flow.prog ? String(Flow.prog.seed) : ''; },
  /* Сид, день, попытка, сложность и тема: всё, что нужно, чтобы снова получить этот день командой seed. brief: короткая подсказка в начале дня. */
  seedInfo(brief) {
    const p = Flow.prog;
    if (!p) { this.say('Сид появится, когда начнётся игра. Заранее его можно задать в адресе: ?seed=число'); return; }
    const d = Flow.desk && Flow.desk.day, topic = d && d.group ? ', тема «' + d.group.name + '»' : '', diff = (Engine.CFG[p.diff] || {}).name || p.diff, att = (p.attempt || 0) + 1;
    this.say('Сид партии: ' + p.seed + '\nДень ' + p.day + ', попытка ' + att + ', сложность ' + diff + topic + (brief ? '' : '\nЗапустить этот день снова: seed ' + p.seed + ' ' + p.day + ' ' + att));
    this.refreshSeed();
  },
  parseSeed(s) {
    if (!/^\d{1,10}$/.test(String(s)) || parseInt(s, 10) > 2147483647) { this.say('Сид — целое число от 0 до 2147483647.'); return null; }
    return parseInt(s, 10);
  },
  /* Готовит запуск дня D партии с сидом S так, как его увидит игрок, прошедший дни 1..D-1 с первой попытки: темы прошлых дней берутся из самого генератора.
     Что не воспроизводится: день после интервью с бонусом (бонус зависит от ответов в интервью) и дни, которые игрок проваливал. */
  applySeed(seed, day, attempt) {
    const p = JSON.parse(JSON.stringify(Flow.snap));
    p.seed = seed; p.used = []; p.lastGroup = null; p.attempt = 0; p.bonus = 0; delete p.devGroup;
    for (let k = 1; k < day; k++) { p.day = k; const g = Engine.makeDay(p).group.id; p.used.push(g); p.lastGroup = g; }
    Object.assign(Flow.snap, { seed: seed, day: day, used: p.used, lastGroup: p.lastGroup, attempt: attempt, bonus: 0 });
    delete Flow.snap.devGroup;
  },
  paintFreeze() { if (this.freezeBtn) this.freezeBtn.classList.toggle('on', !!(Flow.desk && Flow.desk.freeze)); },

  say(msg) {
    UI.toast(msg, 1800);
    if (this.logEl) { this.logEl.textContent += (this.logEl.textContent ? '\n' : '') + msg; this.logEl.scrollTop = 1e6; }
  },

  /* ---------- команды ---------- */
  desk() {
    const d = Flow.desk;
    if (!d || d.finished) { this.say('Эта команда работает, пока идёт день за столом.'); return null; }
    return d;
  },
  flow() {
    if (!Flow.exitDef || !Flow.snap) { this.say('Сначала начните игру (НОВАЯ ИГРА).'); return false; }
    return true;
  },

  cmds: {
    help() {
      Dev.say('call [boss|lena|boris|unknown|fufel] — звонок прямо сейчас\ntime <сек> | time +30 — время дня\nfreeze — заморозить/вернуть время\nhand true|all|clear — инфоповоды в руку\nmarks — метки ДА/НЕТ по правде\nend — закончить день\nperfect — закончить день идеально (100)\nday <1-' + DAYS_TOTAL + '> [сид] — начать этот день (по желанию с сидом)\nseed — показать сид партии и как запустить этот день снова\nseed <сид> [день] [попытка] — запустить день с этим сидом (день по умолчанию текущий, попытка 1 — первая)\ntopic <id> — тема дня (topics — список)\ninterview — день начнётся с интервью\nfinale — финал главы\noff — выключить режим');
    },
    call(who) {
      const d = Dev.desk(); if (!d) return;
      if (d.ringing) { Dev.say('Телефон уже звонит: нажмите на него.'); return; }
      if (UI.dlg.firstChild) { Dev.say('Сейчас идёт разговор.'); return; }
      let c;
      if (who === 'fufel') c = { caller: 'fufel', mode: 'fun', kind: 'fun', lines: FUN_CALLS[Math.floor(Math.random() * FUN_CALLS.length)], window: 40, at: 0 };
      else {
        const rest = d.day.calls.slice(d.callIdx);
        const i = who ? rest.findIndex(x => x.caller === who) : 0;
        if (i < 0 || !rest.length) { Dev.say(who ? 'Звонков «' + who + '» в этом дне больше нет.' : 'Звонков больше нет.'); return; }
        c = d.day.calls.splice(d.callIdx + i, 1)[0];
      }
      d.ring(c);
    },
    time(v) {
      const d = Dev.desk(); if (!d) return;
      const s = parseFloat(v);
      if (isNaN(s)) { Dev.say('time <секунды> или time +30'); return; }
      d.timeLeft = U.clamp(/^[+-]/.test(v) ? d.timeLeft + s : s, 0, d.day.time);
      d.updateTimer(); Dev.say('Осталось ' + U.fmtTime(d.timeLeft));
    },
    freeze() {
      const d = Dev.desk(); if (!d) return;
      d.freeze = !d.freeze; Dev.paintFreeze(); Dev.say(d.freeze ? 'Время заморожено.' : 'Время идёт.');
    },
    hand(kind) {
      const d = Dev.desk(); if (!d) return;
      if (kind === 'clear') {
        d.hand.forEach(h => { h.el.remove(); h.body.destroy(); });
        d.hand = []; d.hoverIdx = -1; d.layoutHand(); Dev.say('Рука пуста.'); return;
      }
      const ids = Object.keys(d.day.items).filter(id => kind === 'all' || (d.day.items[id].v === 1 && d.day.items[id].logical));
      ids.forEach(id => d.addToHand({ id: id, ch: 'paper', by: 'Режим разработчика' }, { x: 440, y: 230, s: 1 }));
      Dev.say('В руке: ' + d.hand.length);
    },
    marks() {
      const d = Dev.desk(); if (!d) return;
      d.hand.forEach(h => {
        h.mark = d.day.items[h.id].v ? 1 : 2;
        h.markEl.className = 'mark m' + h.mark; h.markEl.textContent = h.mark === 1 ? 'ДА' : 'НЕТ';
      });
      Dev.say('Метки расставлены по правде.');
    },
    end() { const d = Dev.desk(); if (d) d.finish('manual'); },
    perfect() { const d = Dev.desk(); if (!d) return; Flow.devPerfect = true; d.finish('manual'); },
    day(v, s) {
      if (!Dev.flow()) return;
      const n = parseInt(v, 10);
      if (!(n >= 1 && n <= DAYS_TOTAL)) { Dev.say('day <1-' + DAYS_TOTAL + '> [сид]'); return; }
      if (s !== undefined) { const sd = Dev.parseSeed(s); if (sd === null) return; Dev.applySeed(sd, n, 0); }
      else { Flow.snap.day = n; Flow.snap.attempt = 0; delete Flow.snap.devGroup; }
      Flow.exit('day'); Dev.say('День ' + n + (s !== undefined ? ', сид ' + Flow.snap.seed : ''));
    },
    seed(s, v, a) {
      if (s === undefined || s === '') { Dev.seedInfo(false); return; }
      if (!Dev.flow()) return;
      const sd = Dev.parseSeed(s); if (sd === null) return;
      const n = v === undefined ? Flow.snap.day : parseInt(v, 10);
      if (!(n >= 1 && n <= DAYS_TOTAL)) { Dev.say('День: число от 1 до ' + DAYS_TOTAL); return; }
      const att = a === undefined ? 0 : parseInt(a, 10) - 1;
      if (!(att >= 0 && att <= 20)) { Dev.say('Попытка: число от 1 (первая) до 21'); return; }
      Dev.applySeed(sd, n, att); Flow.exit('day'); Dev.say('Запускаю день ' + n + ' с сидом ' + sd + (att ? ', попытка ' + (att + 1) : ''));
    },
    topic(id) {
      if (!Dev.flow()) return;
      const g = GROUPS.find(x => x.id === id);
      if (!g) { Dev.say('Темы: ' + GROUPS.map(x => x.id).join(', ')); return; }
      Flow.snap.devGroup = g.id; Flow.exit('day'); Dev.say('Тема: ' + g.name);
    },
    topics() { Dev.say('Темы: ' + GROUPS.map(x => x.id).join(', ')); },
    interview() {
      if (!Dev.flow()) return;
      Flow.snap.interviewPending = true; Flow.exit('day'); Dev.say('День начнётся с интервью.');
    },
    finale() { if (Dev.flow()) { Flow.exit('finale'); Dev.say('Финал главы.'); } },
    off() { Dev.enable(false); }
  },

  run(line) {
    const parts = String(line).trim().split(/\s+/), name = (parts.shift() || '').toLowerCase();
    if (this.logEl) this.logEl.textContent += (this.logEl.textContent ? '\n' : '') + '> ' + line;
    const fn = this.cmds[name];
    if (!fn) { this.say('Неизвестная команда: ' + name + '. help — список.'); return; }
    try { fn.apply(this, parts); } catch (e) { this.say('Ошибка: ' + e.message); if (window.console) console.error(e); }
  }
};
