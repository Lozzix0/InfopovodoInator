'use strict';
/* Подсказки по интерфейсу: показываются один раз, при первом заходе в первый день, и по кнопке в меню паузы.
   Стол затемняется, предметы подсвечиваются по очереди, к каждому короткая подпись: что это и как с ним обращаться.
   О том, что правда, а что ложь, подсказки молчат: это игрок открывает сам. */

const Tour = {
  KEY: 'ip-tour-v1',
  seen() { try { return localStorage.getItem(this.KEY) === '1'; } catch (e) { return false; } },
  remember() { try { localStorage.setItem(this.KEY, '1'); } catch (e) { /* хранилище недоступно: подсказки покажутся снова */ } },

  steps(d) {
    const around = (el, p) => { const r = UI.rectOf(el); return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p }; };
    return [
      { none: true, title: 'ДОБРО ПОЖАЛОВАТЬ В РЕДАКЦИЮ', text: 'Покажем, что где лежит на вашем столе. Это займёт полминуты, а потом включится таймер дня.' },
      { r: around(d.stackEl, 6), title: 'ГАЗЕТЫ', text: 'Тяните газету из стопки в центр стола или просто нажмите на стопку. Жирные строки в газете — инфоповоды: наведите на строку и нажмите, чтобы взять её в «руку».' },
      { r: around(d.phoneEl, 8), title: 'ТЕЛЕФОН', text: 'Когда он звонит, нажмите на аппарат. Звонят босс, коллеги и незнакомые номера. Вызов можно сбросить кнопкой слева от телефона.' },
      { r: around(d.padEl, 8), title: 'БЛОКНОТ', text: 'Подсказки из звонков и утренних вестей записываются сюда. Наведите на блокнот, чтобы прочитать заметки.' },
      { r: { x: 520, y: 410, w: 430, h: 126 }, title: 'РУКА', text: 'Здесь собранные инфоповоды. Наведите на карточку, чтобы раскрыть её. Нажмите, чтобы поставить пометку: «?», «ДА» или «НЕТ». Это ваше мнение, на оценку оно не влияет.' },
      { r: around(d.pileEl, 6), title: 'ПРОЧИТАННЫЕ', text: 'Закончили с газетой? Перетащите её сюда. Наведите на стопку: газеты выдвинутся, и любую можно достать и перечитать.' },
      { r: around(d.timerEl, 6), title: 'ТАЙМЕР ДНЯ', text: 'Время ограничено. К концу зазвучит тиканье, а края экрана покраснеют.' },
      { r: { x: 385, y: 488, w: 190, h: 52 }, title: 'ЗАВЕРШИТЬ ДЕНЬ', text: 'Кнопка выезжает снизу по центру. Нажмите, когда соберёте достаточно: дальше вы составите страницу из четырёх инфоповодов. Удачи!', end: true }
    ];
  },

  /* Показывает подсказки; промис выполняется, когда игрок прошёл их или пропустил. */
  run(d) {
    return new Promise(resolve => {
      this.remember();
      const list = this.steps(d), ez = d.root.querySelector('.endzone');
      let i = -1;
      const wrap = U.el('div', 'tour'), hole = U.el('div', 'tour-hole'), tip = U.el('div', 'tour-tip pxbox');
      const h = U.el('h4'), p = U.el('p'), row = U.el('div', 'row'), no = U.el('span', 'no');
      let nextBtn;
      const done = () => {
        window.removeEventListener('keydown', key, true);
        if (ez) ez.classList.remove('show');
        wrap.remove(); resolve();
      };
      const next = () => { Snd.fx.click(); if (i + 1 >= list.length) done(); else show(i + 1); };
      const prev = () => { if (i > 0) { Snd.fx.click(); show(i - 1); } };
      const key = e => {
        if (!wrap.isConnected) { window.removeEventListener('keydown', key, true); return; }       // сцену закрыли (например, выход в меню)
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') next();
        else if (e.key === 'ArrowLeft') prev();
        else if (e.key === 'Escape') done();
        else return;
        e.stopImmediatePropagation(); e.preventDefault();          // Esc здесь только закрывает подсказки, а не открывает паузу
      };
      const show = k => {
        i = k; const s = list[k];
        h.textContent = s.title; p.textContent = s.text; no.textContent = (k + 1) + ' / ' + list.length;
        nextBtn.textContent = k === list.length - 1 ? 'В ИГРУ' : 'ДАЛЕЕ';
        if (ez) ez.classList.toggle('show', !!s.end);
        const r = s.none ? { x: 480, y: 270, w: 0, h: 0 } : s.r;
        hole.style.cssText = 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px;' + (s.none ? 'border-color:transparent;' : '');
        this.place(s, r, tip);
      };
      row.appendChild(no);
      row.appendChild(UI.btn('ПРОПУСТИТЬ', 'alt', done));
      nextBtn = UI.btn('ДАЛЕЕ', '', next); row.appendChild(nextBtn);
      tip.appendChild(h); tip.appendChild(p); tip.appendChild(row);
      wrap.appendChild(hole); wrap.appendChild(tip);
      wrap.addEventListener('pointerdown', e => { if (!tip.contains(e.target)) next(); });          // нажатие в затемнённой части тоже листает
      window.addEventListener('keydown', key, true);
      UI.ov.appendChild(wrap);
      show(0);
    });
  },

  /* Подпись рядом с подсвеченным предметом: справа или слева от него, у верхнего и нижнего краёв над или под ним. */
  place(s, r, tip) {
    const W = 960, H = 540, M = 16, tw = tip.offsetWidth, th = tip.offsetHeight, cx = r.x + r.w / 2;
    let x, y;
    if (s.none) { x = (W - tw) / 2; y = (H - th) / 2; }
    else if (r.y > 420 && cx > 300 && cx < 660) { x = cx - tw / 2; y = r.y - th - M; }
    else if (r.y + r.h / 2 < 90) { x = cx - tw / 2; y = r.y + r.h + M; }
    else if (cx < W / 2) { x = r.x + r.w + M; y = r.y; }
    else { x = r.x - tw - M; y = r.y; }
    tip.style.left = U.clamp(x, 10, W - tw - 10) + 'px';
    tip.style.top = U.clamp(y, 10, H - th - 10) + 'px';
  }
};
