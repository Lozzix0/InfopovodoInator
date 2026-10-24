'use strict';
/* ДВИЖОК: уровни сложности, генератор дня, оценка работы, интервью, сохранение.
   Ничего не знает про интерфейс. Один и тот же seed всегда даёт один и тот же день. */

const FILLERS = [
  'ПОГОДА: завтра облачно, местами дождь. Зонт рекомендуется.',
  'Продаётся самовар. Почти не кипел. Тел. 555-01-01.',
  'ГОРОСКОП: Овны сегодня найдут деньги. Тельцы их потеряют.',
  'Потерялась кошка Муся. Отзывается на «кис-кис» и на «ты где?».',
  'КРОССВОРД: река в России, пять букв, начинается на «Д». (Ответ — на следующей странице.)',
  'Куплю старый холодильник. Дорого, но не очень.',
  'В районной библиотеке открылась выставка носков знаменитых писателей.',
  'РЕЦЕПТ: борщ без свёклы. Получится суп, но вкусный.',
  'Фонтан на площади опять включили. Голуби довольны.',
  'Ищу попутчика для поездки на дачу. Рассаду везу я, лопаты — ты.',
  'ОБЪЯВЛЕНИЕ: во вторник в ЖЭКе пройдёт собрание. Тема — лампочка в подъезде.',
  'Автобус №7 изменил маршрут и теперь едет туда, куда надо.',
  'ШАХМАТНЫЙ ЭТЮД: белые начинают и обычно выигрывают.',
  'Сдаётся комната. Рядом остановка. И ещё одна — на всякий случай.',
  'В пятницу в парке пройдёт ярмарка мёда, сыра и умных разговоров.',
  'Найден зонт. Хозяин — приходите, если дождь идёт именно у вас.',
  'ЮБИЛЕЙ: заводу «Красный утюг» исполняется сто лет. Утюг — всё ещё горячий.',
  'Требуется дворник со знанием трёх языков: русского, мата и кошачьего.',
  'Пятая школа проводит субботник. Приносите грабли и хорошее настроение.',
  'Курсы английского по вторникам. Преподаватель настоящий, акцент — тоже.',
  'АНЕКДОТ ДНЯ: приходит журналист к редактору с новостью. Редактор: «А она проверена?» — Журналист: «Она вчера была».',
  'На набережной появилась скамейка с розеткой. Скоро сядут все.',
  'Требуется курьер. Бегаем быстро, думаем медленно.',
  'Продаю пианино. Состояние хорошее, соседи — не очень.',
  'Читатель из Ростова пишет: «Верните лето!» Редакция передала в службу погоды.',
  'Кондитерская «Сладкий день» открылась на углу. Пахнет так, что мимо не пройти.'
];

const CFG = {
  easy: {
    id: 'easy', name: 'Лёгкая', time: 300, slots: 4, bonusMax: 2, TL: 7, FL: 2, TN: 2, FN: 1, papers: 4, calls: 3, eventP: 0.9,
    misleadP: 0.3, maxBad: 1, hint: 'group', pauseOnCall: true, interviewTime: 12, rounds: 3, tabs: 1
  },
  normal: {
    id: 'normal', name: 'Нормальная', time: 240, slots: 4, bonusMax: 2, TL: 6, FL: 3, TN: 2, FN: 2, papers: 5, calls: 4, eventP: 0.6,
    misleadP: 0.5, maxBad: 3, hint: 'text', pauseOnCall: false, interviewTime: 9, rounds: 4, tabs: 1
  },
  hard: {
    id: 'hard', name: 'Сложная', time: 190, slots: 4, bonusMax: 1, TL: 5, FL: 4, TN: 2, FN: 3, papers: 5, calls: 4, eventP: 0.5,
    misleadP: 0.7, maxBad: 4, hint: 'none', pauseOnCall: false, interviewTime: 6, rounds: 5, tabs: 2
  }
};
const DAYS_TOTAL = 5;

// дополнительные намёки по темам (разные подводки босса)
GROUPS.forEach(g => {
  g.hints2 = g.hints2 || (typeof GROUP_HINT_EXTRA !== 'undefined' && GROUP_HINT_EXTRA[g.id]) || [];
  g.notice = g.notice || (typeof GROUP_NOTICE !== 'undefined' && GROUP_NOTICE[g.id]) || [g.hint.charAt(0).toLowerCase() + g.hint.slice(1).replace(/\.$/, '')];
});

const Engine = (() => {

  /* ---------- состояние игры ---------- */
  function newProgress(nick, diff, seed) {
    return {
      game: 'infopovodoinator', v: 1, nick: (nick || '').trim().slice(0, 24) || DEFAULT_NICK,
      diff: CFG[diff] ? diff : 'normal', seed: seed == null ? (Math.random() * 1e9) | 0 : seed,
      day: 1, used: [], scores: [], attempt: 0, bonus: 0, lastGroup: null,
      interviewPending: false, interviewDay: 0, celebsSeen: []
    };
  }

  /* ---------- генерация дня ---------- */
  function makeDay(prog) {
    const cfg = CFG[prog.diff];
    const n = prog.day;
    const rng = new RNG(U.hash(prog.seed + ':' + n + ':' + prog.attempt));

    // тема дня
    let pool = GROUPS.filter(g => prog.used.indexOf(g.id) < 0 && g.id !== prog.lastGroup);
    if (!pool.length) pool = GROUPS.filter(g => g.id !== prog.lastGroup);
    const picked = rng.pick(pool);
    const group = (prog.devGroup && GROUPS.find(g => g.id === prog.devGroup)) || picked;     // devGroup: тема из режима разработчика

    // набор новостей дня
    // интервью даёт не больше половины страницы (bonusMax), остальное игрок находит сам: иначе идеальные дни шли бы подряд
    const bonusN = Math.min(prog.bonus || 0, cfg.bonusMax);
    const trueIn = group.items.filter(i => i.v === 1), falseIn = group.items.filter(i => i.v === 0);
    const others = GROUPS.filter(g => g.id !== group.id);
    const trueOut = [].concat(...others.map(g => g.items.filter(i => i.v === 1)));
    const falseOut = NOISE_FALSE.concat(...others.map(g => g.items.filter(i => i.v === 0)));
    const TLall = rng.sample(trueIn, cfg.TL + bonusN);
    const bonus = TLall.slice(0, bonusN);
    const TL = TLall.slice(bonusN);
    const FL = rng.sample(falseIn, cfg.FL);
    const TN = rng.sample(trueOut, cfg.TN);
    const FN = rng.sample(falseOut, cfg.FN);
    if (n === 1) TN.push(EGG);

    const items = {};
    [].concat(TL, FL, TN, FN, bonus).forEach(i => { items[i.id] = Object.assign({}, i, { logical: i.g === group.id }); });
    const deliver = {};       // id -> {ch, by}
    bonus.forEach(i => { deliver[i.id] = { ch: 'interview' }; });
    let rest = rng.shuffle([].concat(TL, FL, TN, FN));
    const takeItem = (pred) => {
      const k = rest.findIndex(pred);
      if (k < 0) return null;
      return rest.splice(k, 1)[0];
    };
    const isTrueItem = i => i.v === 1 && i.id !== 'egg1';

    // --- звонки ---
    const bp = [{ c: 'boss', m: 'item' }, { c: 'boss', m: 'clue' }];
    if (n >= 2) bp.push(n >= 3 && cfg.calls < 4 ? { c: 'unknown' } : { c: rng.pick(['lena', 'boris']) });
    if (n >= 3 && cfg.calls >= 4) bp.push({ c: 'unknown' });
    const calls = [];
    const preClue = [];       // звонки-подсказки, подсказки заполним позже
    bp.forEach(b => {
      const call = { caller: b.c, mode: b.m || rng.pick(['item', 'clue']), kind: b.c === 'boss' ? 'boss' : (b.c === 'unknown' ? (rng.chance(0.5) ? 'competitor' : 'citizen') : 'colleague') };
      if (call.mode === 'item') {
        let it = null;
        if (call.kind === 'boss') it = takeItem(i => isTrueItem(i) && i.g === group.id && !(i.id === 'egg1'));
        else if (call.kind === 'competitor') it = takeItem(i => i.v === 0 && !i.obv) || takeItem(i => i.v === 0);
        else if (call.kind === 'citizen') it = takeItem(isTrueItem);
        else {
          const truthful = rng.chance(CALLERS[call.caller].acc);
          it = takeItem(i => truthful ? isTrueItem(i) : i.v === 0) || takeItem(i => true);
        }
        if (it) { call.itemId = it.id; deliver[it.id] = { ch: 'phone', by: call.caller, kind: call.kind }; }
        else call.mode = 'clue';
      }
      if (call.mode === 'clue') preClue.push(call);
      calls.push(call);
    });

    // --- событие перед днём ---
    let event = null;
    if (n >= 2) {
      if (rng.chance(cfg.eventP)) {
        const r = rng.next();
        if (r < 0.3) {
          const it = takeItem(i => true);
          if (it) {
            const nid = rng.pick(UNRELIABLE_NARRATORS);
            event = { narrator: nid, kind: 'item', itemId: it.id };
            deliver[it.id] = { ch: 'event', by: nid };
          }
        }
        if (!event && r < 0.62) event = { narrator: rng.pick(RELIABLE_NARRATORS), kind: 'clue', reliable: true };
        else if (!event && r < 0.78) event = { narrator: rng.pick(UNRELIABLE_NARRATORS), kind: 'clue', reliable: false };
        if (!event) event = { narrator: null, kind: 'flavor', text: rng.pick(FLAVOR_EVENTS) };
      } else if (rng.chance(0.4)) event = { narrator: null, kind: 'flavor', text: rng.pick(FLAVOR_EVENTS) };
    } else event = { narrator: null, kind: 'flavor', text: rng.pick(FLAVOR_EVENTS) };

    // --- газеты ---
    const reliableP = PAPERS.filter(p => p.rep >= 2), tabP = PAPERS.filter(p => p.rep === 1);
    const nt = Math.min(cfg.tabs, tabP.length);
    const chosenPapers = rng.sample(reliableP, cfg.papers - nt).concat(rng.sample(tabP, nt));
    const papers = rng.shuffle(chosenPapers).map((p, i) => ({
      id: p.id + '_' + i, paper: p, date: paperDate(rng), blocks: [], itemCount: 0, clueCount: 0
    }));
    // новости: по газетам, равномерно
    rest.forEach(it => {
      const cands = papers.filter(p => p.itemCount < 4);
      const minC = Math.min(...cands.map(p => p.itemCount));
      const p = rng.pick(cands.filter(x => x.itemCount === minC));
      p.blocks.push({ k: 'item', id: it.id, label: rng.pick(PAPER_LABELS.item[Math.max(0, 3 - p.paper.rep)]) });
      p.itemCount++;
      deliver[it.id] = { ch: 'paper', by: p.id };
    });

    // --- подсказки ---
    // кому нужна надёжная подсказка: всем, кроме новостей от босса, из интервью и очевидных нелепиц
    const needs = Object.keys(items).filter(id => {
      const d = deliver[id];
      return d && d.ch !== 'interview' && !(d.ch === 'phone' && d.by === 'boss') && !items[id].obv;
    });
    const needList = rng.shuffle(needs);
    const clues = [];       // {forId, text, reliable, channel...}

    // 1) босс по телефону
    const bossClue = preClue.find(c => c.caller === 'boss');
    if (bossClue && needList.length) {
      const id = needList.shift();
      bossClue.clue = { forId: id, text: items[id].ok, reliable: true, misleading: false };
      clues.push(bossClue.clue);
    } else if (bossClue) { bossClue.mode = 'item'; }
    // 2) Тамара Павловна
    if (event && event.kind === 'clue' && event.reliable && needList.length) {
      const id = needList.shift();
      event.clue = { forId: id, text: items[id].ok, reliable: true, misleading: false };
      clues.push(event.clue);
    } else if (event && event.kind === 'clue' && event.reliable) event = { narrator: null, kind: 'flavor', text: rng.pick(FLAVOR_EVENTS) };
    // 3) надёжные газеты
    const relPapers = papers.filter(p => p.paper.rep >= 2);
    needList.forEach(id => {
      const itemPaper = deliver[id].ch === 'paper' ? deliver[id].by : null;
      let cands = relPapers.filter(p => p.clueCount < 4 && p.id !== itemPaper);
      if (!cands.length) cands = relPapers.filter(p => p.clueCount < 6);
      if (!cands.length) cands = relPapers;
      const minC = Math.min(...cands.map(p => p.clueCount));
      const p = rng.pick(cands.filter(x => x.clueCount === minC));
      const clue = { forId: id, text: items[id].ok, reliable: true, misleading: false };
      p.blocks.push({ k: 'clue', forId: id, text: clue.text, label: rng.pick(['Справка редакции', 'Уточнение', 'Из архива']) });
      p.clueCount++;
      clues.push(clue);
    });

    // 4) ненадёжные каналы: вводящие в заблуждение и «правдивые, но недоказуемые» подсказки
    const badIds = rng.shuffle(Object.keys(items).filter(id => items[id].bad && deliver[id] && deliver[id].ch !== 'interview' && !(deliver[id].ch === 'phone' && deliver[id].by === 'boss')));
    let badCount = 0;
    const takeBad = () => { if (badCount >= cfg.maxBad) return null; const id = badIds.shift(); if (!id) return null; badCount++; return id; };
    // колонки-подсказки от коллег и незнакомцев
    preClue.forEach(c => {
      if (c.caller === 'boss' || c.clue) return;
      const mislead = c.kind === 'competitor' || (c.kind === 'colleague' && !rng.chance(CALLERS[c.caller].acc));
      let id = null, text = null, misleading = false;
      if (mislead) { id = takeBad(); if (id) { text = items[id].bad; misleading = true; } }
      if (!id) { id = rng.pick(Object.keys(items).filter(i => deliver[i] && deliver[i].ch !== 'interview')); text = items[id].ok; misleading = false; }
      c.clue = { forId: id, text: text, reliable: false, misleading: misleading };
      clues.push(c.clue);
    });
    // пенные подсказки в жёлтых газетах и от болтливых друзей
    const tabPapers = papers.filter(p => p.paper.rep === 1);
    if (event && event.kind === 'clue' && !event.reliable) {
      const id = takeBad() || rng.pick(Object.keys(items).filter(i => deliver[i] && deliver[i].ch !== 'interview'));
      event.clue = { forId: id, text: items[id].bad || items[id].ok, reliable: false, misleading: !!items[id].bad };
      clues.push(event.clue);
    }
    tabPapers.forEach(p => {
      const rounds = rng.int(1, 2);
      for (let k = 0; k < rounds; k++) {
        const id = takeBad();
        if (!id) break;
        p.blocks.push({ k: 'clue', forId: id, text: items[id].bad, label: 'Наши источники сообщают' });
        p.clueCount++;
        clues.push({ forId: id, text: items[id].bad, reliable: false, misleading: true });
      }
    });

    // --- текст утренней вести: выбираем вариант рассказчика ---
    if (event && event.narrator) {
      const nar = NARRATORS[event.narrator];
      if (event.kind === 'item') event.text = rng.pick(nar.items).replace('{t}', items[event.itemId].t);
      else if (event.kind === 'clue' && event.clue) event.text = rng.pick(nar.clues).replace('{c}', event.clue.text);
    }

    // --- наполнение газет «водой», порядок блоков ---
    const eggPaper = rng.chance(EGG_LINE_CHANCE) ? rng.pick(papers) : null;     // редкая пасхальная строка
    const claudePaper = rng.chance(CLAUDE_LINE_CHANCE) ? rng.pick(papers) : null;   // слух про Claude Code
    papers.forEach(p => {
      const fill = Math.max(1, Math.min(2, 7 - p.blocks.length));
      rng.sample(FILLERS, fill).forEach(t => p.blocks.push({ k: 'fill', text: t }));
      if (p === eggPaper) p.blocks.push({ k: 'fill', text: rng.pick(EGG_LINES) });
      if (p === claudePaper) p.blocks.push({ k: 'fill', text: rng.pick(CLAUDE_LINES) });
      p.blocks = rng.shuffle(p.blocks);
    });

    // --- редкий смешной звонок: доктор ФуфелСмерч под видом «неизвестного номера» (информации не несёт) ---
    if (n >= 2 && rng.chance(FUN_CALL_CHANCE)) calls.push({ caller: 'fufel', mode: 'fun', kind: 'fun', lines: rng.pick(FUN_CALLS) });

    // --- расписание звонков ---
    const dur = cfg.time;
    const win = (cfg.id === 'easy' ? 22 : cfg.id === 'normal' ? 15 : 11);
    const startAt = 0.1 * dur, endAt = 0.82 * dur;
    const slotLen = (endAt - startAt) / calls.length;
    calls.forEach((c, i) => {
      c.at = Math.round(startAt + slotLen * i + rng.next() * Math.max(2, slotLen - win - 2));
      c.window = win;
      if (c.mode !== 'fun') c.lines = buildCallLines(c, items, prog.nick, rng);
    });
    // босс всегда первым и в начале дня
    calls.sort((a, b) => a.at - b.at);

    // --- заголовки ---
    const wrongHeads = [].concat(...others.map(g => g.heads));
    const click = rng.sample(CLICKBAIT, 1);
    const headlines = rng.shuffle([{ id: 'h_ok', text: rng.pick(group.heads), right: true }]
      .concat(rng.sample(wrongHeads, cfg.id === 'easy' ? 1 : 2).map((t, i) => ({ id: 'h_w' + i, text: t, right: false })))
      .concat(click.map((t, i) => ({ id: 'h_c' + i, text: t, right: false, click: true }))));

    // подсказка по теме дня
    // на сложной босс тему не называет и ничего не говорит: подсказки нет вовсе
    let hint = '';
    const sub = s => s.replace(/\{n\}/g, prog.nick).replace('{g}', group.name).replace('{h}', rng.pick(group.notice));
    if (cfg.hint === 'group') hint = sub(rng.pick(BOSS_HINTS.easy));
    else if (cfg.hint === 'text') hint = sub(rng.pick(BOSS_HINTS.normal));

    return {
      n: n, nick: prog.nick, cfg: cfg, group: group, time: cfg.time, slots: cfg.slots, items: items, deliver: deliver,
      papers: papers, calls: calls, event: event, bonus: bonus.map(i => i.id), headlines: headlines, hint: hint, clues: clues
    };
  }

  function paperDate(rng) {
    const wd = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    const mo = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return rng.pick(wd) + ', ' + rng.int(1, 28) + ' ' + rng.pick(mo);
  }

  /* Реплики звонка: приветствие — суть — прощание. */
  function buildCallLines(call, items, nick, rng) {
    const key = call.caller === 'boss' ? 'boss' : (call.caller === 'lena' ? 'lena' : (call.caller === 'boris' ? 'boris' : (call.kind === 'competitor' ? 'competitor' : 'citizen')));
    const tpl = CALL_SCRIPT[key + '_' + call.mode];
    const mid = call.mode === 'item' ? items[call.itemId].t : (call.clue ? call.clue.text : '...');
    const subst = s => s.replace(/\{n\}/g, nick);
    return [subst(rng.pick(tpl.pre)), mid, subst(rng.pick(tpl.post))];
  }

  /* ---------- проверка решаемости дня ---------- */
  function validateDay(day) {
    const problems = [];
    const ids = Object.keys(day.items);
    const K = day.slots;
    // 1) каждая новость доставлена ровно одним каналом
    ids.forEach(id => { if (!day.deliver[id]) problems.push('Новость ' + id + ' нигде не встречается'); });
    // 2) для каждой новости есть способ определить правду
    ids.forEach(id => {
      const d = day.deliver[id], it = day.items[id];
      if (!d || d.ch === 'interview' || (d.ch === 'phone' && d.by === 'boss') || it.obv) return;
      const ok = day.clues.some(c => c.forId === id && c.reliable && !c.misleading && c.text === it.ok);
      if (!ok) problems.push('Для «' + id + '» нет надёжной подсказки');
    });
    // 3) надёжные подсказки не должны вводить в заблуждение
    day.clues.forEach(c => { if (c.reliable && c.misleading) problems.push('Надёжная подсказка вводит в заблуждение: ' + c.forId); });
    // 4) можно собрать идеальную страницу: достоверных логичных не меньше, чем слотов
    const tl = ids.filter(id => day.items[id].v === 1 && day.items[id].logical).length;
    if (tl < K) problems.push('Достоверных логичных новостей меньше, чем слотов (' + tl + ' < ' + K + ')');
    // 5) босс не передаёт ложь
    day.calls.forEach(c => { if (c.caller === 'boss' && c.itemId && day.items[c.itemId].v !== 1) problems.push('Босс передал ложь'); });
    // 6) газеты не пусты, верные подсказки лежат в газетах с rep >= 2
    day.papers.forEach(p => {
      if (!p.blocks.some(b => b.k !== 'fill')) problems.push('Газета ' + p.id + ' без содержания');
      p.blocks.forEach(b => { if (b.k === 'clue' && b.label !== 'Наши источники сообщают' && p.paper.rep < 2) problems.push('Верная подсказка в жёлтой газете'); });
    });
    // 7) звонки не накладываются
    for (let i = 1; i < day.calls.length; i++) {
      if (day.calls[i].at < day.calls[i - 1].at + day.calls[i - 1].window) problems.push('Звонки накладываются');
    }
    return problems;
  }

  /* ---------- оценка ---------- */
  function scorePage(day, placed, headlineId) {
    const K = day.slots;
    let pts = 0, falsePlaced = 0;
    const rows = placed.map(id => {
      const it = day.items[id];
      let p = 0;
      if (it.v === 1 && it.logical) p = 1;
      else if (it.v === 1) p = 0.35;
      else falsePlaced++;
      pts += p;
      return { id: id, v: it.v, logical: it.logical, pts: p };
    });
    const h = day.headlines.find(x => x.id === headlineId);
    const headOk = !!(h && h.right);
    let score = (pts / K) * 80 + (headOk ? 20 : 0) - falsePlaced * 12 - (h && h.click ? 5 : 0);
    score = Math.round(U.clamp(score, 0, 100));
    const pickV = (arr, k) => arr[(day.n * 7 + score + k) % arr.length];       // вариант текста детерминирован
    const msg = pickV(SCORE_MSGS.find(m => score >= m[0])[1], 0);
    const boss = pickV(BOSS_REACTIONS.find(m => score >= m[0])[1], 1).replace(/\{n\}/g, day.nick || '');
    return { score: score, rows: rows, headOk: headOk, falsePlaced: falsePlaced, msg: msg, boss: boss, perfect: score === 100 };
  }

  /* Идеальная страница дня (для режима разработчика): лучшие слоты и верный заголовок. */
  function perfectPage(day) {
    const good = Object.keys(day.items).filter(id => day.items[id].v === 1 && day.items[id].logical);
    return { placed: good.slice(0, day.slots), headline: 'h_ok' };
  }

  /* ---------- интервью ---------- */
  function pickCeleb(prog, rng) {
    let pool = CELEBS.filter(c => prog.celebsSeen.indexOf(c.id) < 0);
    if (!pool.length) pool = CELEBS;
    return rng.pick(pool);
  }
  function interviewRounds(celeb, cfg, rng) {
    const all = Object.keys(QUESTIONS);
    const neutral = all.filter(t => celeb.likes.indexOf(t) < 0 && celeb.danger.indexOf(t) < 0);
    const rounds = [];
    for (let r = 0; r < cfg.rounds; r++) {
      const good = rng.pick(celeb.likes);
      const risky = rng.chance(0.65);
      const options = [{ topic: good, kind: 'good' }];
      if (risky) options.push({ topic: rng.pick(celeb.danger), kind: 'risky' });
      const pool = rng.shuffle(neutral);
      while (options.length < 3) options.push({ topic: pool.shift(), kind: 'meh' });
      options.forEach(o => { o.text = rng.pick(QUESTIONS[o.topic]); });
      rounds.push(rng.shuffle(options));
    }
    return rounds;
  }
  function riskyOutcome(celeb, rng) {
    const pRage = U.clamp(0.35 + celeb.temper * 0.5, 0.4, 0.8);
    if (rng.chance(pRage)) return 'rage';
    return rng.chance(celeb.candor) ? 'double' : 'plain';
  }

  /* ---------- сохранение ---------- */
  function checksum(obj) { return U.hash(JSON.stringify(obj) + '|ip-v1'); }
  function exportSave(prog) {
    const body = JSON.parse(JSON.stringify(prog));
    return JSON.stringify({ body: body, sum: checksum(body) });
  }
  function importSave(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { return { ok: false, err: 'Файл повреждён: это не сохранение игры.' }; }
    if (!o || !o.body || o.body.game !== 'infopovodoinator') return { ok: false, err: 'Это не файл сохранения «ИнфоповодоИнатора».' };
    if (o.sum !== checksum(o.body)) return { ok: false, err: 'Файл сохранения изменён или повреждён.' };
    const b = o.body;
    if (!CFG[b.diff] || !(b.day >= 1 && b.day <= DAYS_TOTAL + 1) || !Array.isArray(b.used) || !Array.isArray(b.scores)) return { ok: false, err: 'В сохранении неверные данные.' };
    return { ok: true, prog: b };
  }

  return { newProgress, makeDay, validateDay, scorePage, perfectPage, pickCeleb, interviewRounds, riskyOutcome, exportSave, importSave, CFG };
})();
