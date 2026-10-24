'use strict';
/* Финальная страница дня: слоты под инфоповоды и выбор заголовка.
   Карточки можно перетаскивать (пружинная физика) или ставить кликом. */

const FinalPage = {
  run(day, hand) {
    return new Promise(resolve => {
      const K = day.slots;
      const placed = new Array(K).fill(null);      // id в каждом слоте
      let headline = null;
      Snd.music('event');

      const scr = UI.screen();
      const fp = U.el('div', 'fp');
      scr.appendChild(fp);

      // страница
      const page = U.el('div', 'fp-page paperbox');
      page.innerHTML = '<h3>ВАША СТАТЬЯ</h3>';
      const headEl = U.el('div', 'fp-head empty');
      headEl.textContent = 'Заголовок';
      page.appendChild(headEl);
      const slotsEl = U.el('div', 'fp-slots');
      const slotEls = [];
      for (let i = 0; i < K; i++) {
        const s = U.el('div', 'fp-slot');
        s.innerHTML = '<span class="no">' + (i + 1) + '</span>';
        const em = U.el('span'); s.appendChild(em);
        slotsEl.appendChild(s); slotEls.push(s);
      }
      page.appendChild(slotsEl);
      // выбор заголовка под слотами, чтобы вся правая панель принадлежала карточкам
      const hl = U.el('div', 'fp-hl'); hl.textContent = 'ВЫБЕРИТЕ ЗАГОЛОВОК';
      page.appendChild(hl);
      const heads = U.el('div', 'fp-heads');
      day.headlines.forEach(h => {
        const b = U.el('button', 'fp-hbtn'); b.textContent = h.text;
        b.addEventListener('click', () => {
          headline = h.id; Snd.fx.click();
          U.$$('.fp-hbtn', heads).forEach(x => x.classList.remove('on')); b.classList.add('on');
          headEl.classList.remove('empty'); headEl.textContent = h.text;
        });
        heads.appendChild(b);
      });
      page.appendChild(heads);
      fp.appendChild(page);

      // правая панель: инфоповоды в руке
      const side = U.el('div', 'fp-side pxbox');
      const h3 = U.el('h3'); h3.textContent = 'ИНФОПОВОДЫ В РУКЕ (' + hand.length + ')'; side.appendChild(h3);
      const legend = U.el('div', 'fp-legend');
      legend.innerHTML = 'Внизу карточки ваша пометка: <b class="v1">ДА</b> — правда, <b class="v2">НЕТ</b> — ложь, <b class="v0">?</b> — не проверено. На оценку она не влияет.';
      side.appendChild(legend);
      const grid = U.el('div', 'fp-hand');
      side.appendChild(grid);
      fp.appendChild(side);

      const actions = U.el('div', 'fp-actions');
      const pub = UI.btn('ОПУБЛИКОВАТЬ', 'red', async () => {
        const filled = placed.filter(Boolean).length;
        if (!headline || filled < K) {
          const miss = (!headline ? 'не выбран заголовок' : '') + (!headline && filled < K ? ' и ' : '') + (filled < K ? 'заполнено слотов: ' + filled + ' из ' + K : '');
          const yes = await UI.confirm('На странице ' + miss + '. Опубликовать так?', 'Опубликовать', 'Доработаю');
          if (!yes) return;
        }
        Snd.fx.stamp();
        scr.remove();
        resolve({ placed: placed.filter(Boolean), headline: headline });
      });
      actions.appendChild(pub);
      side.appendChild(actions);
      UI.show(scr);
      Flow.menuButton(scr);

      /* ----- карточки ----- */
      // текст карточки целиком и внизу полоса с пометкой игрока: «?», «ДА» или «НЕТ» видно всегда
      const MARKS = [['v0', '? НЕ ПРОВЕРЕНО'], ['v1', 'ДА · ПРАВДА'], ['v2', 'НЕТ · ЛОЖЬ']];
      const cardHTML = e => {
        const m = MARKS[e.mark | 0] || MARKS[0];
        return U.esc(day.items[e.id].t) + '<span class="vd ' + m[0] + '">' + m[1] + '</span>';
      };
      // в слоте карточка занимает всё место: если текст длинный, шрифт уменьшается ровно настолько, чтобы он поместился
      const fit = c => { let fs = 13; c.style.fontSize = fs + 'px'; while (c.scrollHeight > c.clientHeight + 1 && fs > 9) { fs -= 0.5; c.style.fontSize = fs + 'px'; } };
      const entryOf = id => hand.find(h => h.id === id);
      function renderAll() {
        grid.innerHTML = '';
        hand.forEach(e => {
          const c = U.el('div', 'fcard ch-' + e.ch + (placed.indexOf(e.id) >= 0 ? ' used' : ''));
          c.innerHTML = cardHTML(e); c.dataset.lab = CHANNELS[e.ch].label;
          c.title = day.items[e.id].t;
          c.addEventListener('pointerdown', ev => { if (ev.button === 0 && placed.indexOf(e.id) < 0) dragFromHand(ev, e, c); });
          grid.appendChild(c);
        });
        slotEls.forEach((s, i) => {
          U.$$('.fcard', s).forEach(n => n.remove());
          const em = s.querySelector('span:not(.no)');
          if (placed[i]) {
            const e = entryOf(placed[i]);
            const c = U.el('div', 'fcard placed ch-' + e.ch);
            c.innerHTML = cardHTML(e); c.dataset.lab = CHANNELS[e.ch].label;
            c.title = 'Нажмите, чтобы вернуть в руку';
            c.addEventListener('click', () => { placed[i] = null; Snd.fx.flip(); renderAll(); });
            s.appendChild(c); em.style.display = 'none'; fit(c);
          } else em.style.display = '';
        });
      }

      function place(id, slot) {
        const i = placed.indexOf(id);
        if (i >= 0) placed[i] = null;
        placed[slot] = id;
        Snd.fx.drop(); renderAll();
      }

      function dragFromHand(ev, e, node) {
        const r = UI.rectOf(node);
        const ghost = U.el('div', 'dragging-card fcard ch-' + e.ch);
        ghost.innerHTML = cardHTML(e); ghost.dataset.lab = CHANNELS[e.ch].label;
        ghost.style.display = 'none';
        UI.ov.appendChild(ghost);
        const body = new Anim.Body(ghost, { x: r.x, y: r.y, k: 520, tilt: 0.03 });
        const st = Stage.local(ev);
        const ox = st.x - r.x, oy = st.y - r.y;
        const slotAt = p => slotEls.findIndex(s => UI.inRect(p, UI.rectOf(s)));
        UI.drag(ev, {
          threshold: 5,
          start: () => { ghost.style.display = 'block'; node.style.opacity = '.3'; Snd.fx.pick(); },
          move: p => {
            body.to({ x: p.x - ox, y: p.y - oy });
            const s = slotAt(p);
            slotEls.forEach((el, i) => el.classList.toggle('over', i === s));
          },
          end: (p, moved) => {
            slotEls.forEach(el => el.classList.remove('over'));
            ghost.remove(); body.destroy(); node.style.opacity = '';
            if (!moved) {                       // клик: в первый свободный слот
              const free = placed.indexOf(null);
              if (free >= 0) place(e.id, free); else UI.toast('Все слоты заняты');
              return;
            }
            const s = slotAt(p);
            if (s >= 0) place(e.id, s);
          }
        });
      }
      renderAll();
    });
  }
};
