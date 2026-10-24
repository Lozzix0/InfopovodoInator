'use strict';
/* Интервью со знаменитостью: карточка с подсказками, раунды с таймером на выбор вопроса,
   рискованные вопросы (двойной успех или срыв интервью). Ответ героя читается без спешки:
   следующий вопрос появляется только после нажатия. */

const Interview = {
  /* Возвращает {bonus, outcome, stars}. */
  run(prog, celeb, rng) {
    return new Promise(resolve => {
      const cfg = Engine.CFG[prog.diff];
      Snd.music('interview');
      const rounds = Engine.interviewRounds(celeb, cfg, rng);
      let stars = 0, round = 0, ended = false;

      const scr = UI.screen();
      const root = U.el('div', 'iv pxbox');
      scr.appendChild(root);

      // карточка знаменитости: сверху силуэт, снизу информация
      const card = U.el('div', 'celeb-card paperbox');
      const sil = U.el('div', 'sil'); sil.appendChild(UI.portrait(Object.assign({}, celeb.look, { flat: true }), 5));
      card.appendChild(sil);
      card.insertAdjacentHTML('beforeend',
        '<div class="cn">' + U.esc(celeb.name.toUpperCase()) + '</div>' +
        '<div class="ct"><b>ЧЕМ ЗНАМЕНИТ</b>' + U.esc(celeb.fame) + '</div>' +
        '<div class="ct"><b>ОПИСАНИЕ</b>' + U.esc(celeb.desc) + '</div>' +
        '<div class="ct"><b>ХАРАКТЕР</b>' + U.esc(celeb.char) + '</div>' +
        '<div class="ct dg"><b>ОПАСНЫЕ ТЕМЫ</b>' + celeb.danger.map(t => TOPIC_NAMES[t]).join(', ') + '</div>');
      card.style.cssText += ';left:20px;top:16px';
      root.appendChild(card);

      const main = U.el('div', 'iv-main');
      root.appendChild(main);
      UI.show(scr);

      // вступление: об опасных темах — только намёк, без объяснения механики
      const intro = U.el('div');
      main.appendChild(intro);
      intro.innerHTML = '<h2 class="ps" style="font-size:12px;color:var(--yellow);line-height:1.5;margin:0 0 12px">ИНТЕРВЬЮ</h2>' +
        '<div class="iv-say" style="min-height:130px"></div>';
      UI.type(U.$('.iv-say', intro),
        celeb.name + ' согласился на разговор: ваша заметка произвела впечатление. Изучите карточку слева. Об опасных темах герой говорит неохотно, но, говорят, иногда именно они развязывают язык.',
        'narrator', { speed: 20 });
      const start = UI.btn('НАЧАТЬ', '', () => { next(); });
      start.style.marginTop = '14px'; intro.appendChild(start);

      function alive() { return scr.isConnected; }

      function next() {
        if (round >= rounds.length) return end('done');
        main.innerHTML = '';
        const opts = rounds[round];
        const top = U.el('div');
        top.innerHTML = '<div class="iv-stars">ВОПРОС ' + (round + 1) + '/' + rounds.length + '  ·  УСПЕХОВ: ' + stars + '</div><div class="iv-bar"><i></i></div>';
        main.appendChild(top);
        const sayEl = U.el('div', 'iv-say pxbox'); sayEl.textContent = '…'; main.appendChild(sayEl);
        const box = U.el('div', 'iv-q'); main.appendChild(box);
        const bar = U.$('i', top);
        let left = cfg.interviewTime, answered = false;
        const stop = Anim.every(dt => {
          if (!alive()) { stop(); return; }
          if (answered) return;
          left -= dt; bar.style.width = Math.max(0, left / cfg.interviewTime * 100) + '%';
          if (left < cfg.interviewTime * 0.3) bar.style.background = 'var(--red)';
          if (left <= 0) { answered = true; stop(); pick(null); }
        });
        opts.forEach(o => {
          const b = U.el('button', 'iv-opt'); b.textContent = o.text;
          b.addEventListener('click', () => { if (answered) return; answered = true; stop(); pick(o); });
          b.addEventListener('pointerenter', () => Snd.fx.hover());
          box.appendChild(b);
        });

        function pick(o) {
          U.$$('.iv-opt', box).forEach(b => { b.disabled = true; });
          let line, gain = 0, rage = false, tag = '';
          if (!o) { line = MEH_REPLIES[0]; tag = 'Время вышло…'; Snd.fx.bad(); }
          else if (o.kind === 'good') { line = celeb.say[o.topic]; gain = 1; tag = 'Удачный вопрос!'; Snd.fx.star(); }
          else if (o.kind === 'meh') { line = rng.pick(MEH_REPLIES); tag = 'Мимо.'; Snd.fx.bad(); }
          else {
            const r = Engine.riskyOutcome(celeb, rng);
            if (r === 'rage') { line = celeb.rage; rage = true; tag = 'Знаменитость вспылила!'; Snd.fx.bang(); }
            else if (r === 'double') { line = celeb.say[o.topic]; gain = 2; tag = 'ДВОЙНОЙ УСПЕХ! Опасная тема сыграла.'; Snd.fx.star(); setTimeout(() => Snd.fx.star(), 160); }
            else { line = celeb.say[o.topic]; gain = 1; tag = 'Знаменитость ответила, хоть и неохотно.'; Snd.fx.good(); }
          }
          stars += gain;
          UI.toast(tag, 2600);
          // ответ читается в своём темпе; дальше — только по нажатию
          const go = UI.btn(rage ? 'ДАЛЕЕ' : (round + 1 >= rounds.length ? 'ЗАВЕРШИТЬ' : 'СЛЕДУЮЩИЙ ВОПРОС'), '', () => {
            if (rage) end('rage'); else { round++; next(); }
          });
          go.style.cssText += ';margin-top:12px;visibility:hidden';
          main.appendChild(go);
          const ctl = UI.type(sayEl, celeb.name.toUpperCase() + ': «' + line + '»', 'celeb', { speed: 22, onDone: () => { go.style.visibility = 'visible'; } });
          sayEl.addEventListener('pointerdown', () => ctl.skip());
        }
      }

      function end(kind) {
        if (ended) return; ended = true;
        main.innerHTML = '';
        const cap = cfg.bonusMax;                                         // интервью закрывает не больше половины страницы
        const bonus = kind === 'rage' ? 0 : Math.min(cap, stars);
        const box = U.el('div');
        let text;
        if (kind === 'rage') text = 'Знаменитость вспылила, и запись оборвалась. Интервью сорвано, бонус сгорел. Опасные темы надо задевать осторожно.';
        else if (stars > cap) text = 'Блестяще! Интервью получилось живым и откровенным, материала даже больше, чем нужно. Но редактор оставляет в номере место и для вашей работы: готовых достоверных инфоповодов на завтра — ' + bonus + ', остальное найдёте сами.';
        else if (bonus > 0) text = 'Интервью прошло неплохо. Вы получаете достоверные инфоповоды на завтра: ' + bonus + '.';
        else text = 'Интервью получилось сухим: ничего полезного узнать не удалось.';
        box.innerHTML = '<h2 class="ps" style="font-size:12px;color:var(--yellow);margin:0 0 12px">ИТОГ ИНТЕРВЬЮ</h2><div class="iv-say pxbox" style="min-height:130px"></div><div class="iv-stars" style="margin-top:10px">УСПЕХОВ: ' + stars + ' · БОНУС: ' + bonus + '</div>';
        main.appendChild(box);
        UI.type(U.$('.iv-say', box), text, 'narrator', { speed: 20 });
        const go = UI.btn('ДАЛЕЕ', '', () => { scr.remove(); resolve({ bonus: bonus, outcome: kind, stars: stars }); });
        go.style.marginTop = '14px'; box.appendChild(go);
        Snd.fx.jingle(kind === 'rage' ? 'bad' : (stars >= 3 ? 'perfect' : 'ok'));
      }
    });
  }
};
