'use strict';
/* Звук и музыка целиком синтезируются Web Audio: в игре нет ни одного аудиофайла.
   Музыка — небольшой секвенсор с «напряжением» (tension): к концу дня темп растёт,
   фильтр открывается, добавляются высокие ноты и тиканье часов. */

const Snd = (() => {
  let ctx = null, master, sfxG, musicG, lp, ambG, noiseBuf;
  const MUSIC_GAIN = 1.7;       // громкость музыки относительно эффектов (была 0,5: музыка тонула; замер: с −36 до около −25 дБ по RMS)
  let musicOn = true, sfxOn = true, musicVol = 1, sfxVol = 1;      // *Vol: положение ползунка 0..1 (в усиление переводится степенью 1,5: громкость на слух меняется плавнее, чем по прямой)
  try {
    musicOn = localStorage.getItem('ip-music') !== '0';
    sfxOn = localStorage.getItem('ip-sfx') !== '0';
    const mv = parseFloat(localStorage.getItem('ip-music-vol')), sv = parseFloat(localStorage.getItem('ip-sfx-vol'));
    if (mv >= 0 && mv <= 1) musicVol = mv;
    if (sv >= 0 && sv <= 1) sfxVol = sv;
  } catch (e) { /* без сохранения */ }
  const gainMusic = () => musicOn ? MUSIC_GAIN * Math.pow(musicVol, 1.5) : 0;
  const gainSfx = () => sfxOn ? Math.pow(sfxVol, 1.5) : 0;
  const saveVol = (key, v) => { try { localStorage.setItem(key, String(v)); } catch (e) { /* без сохранения */ } };
  /* Подписка на любое изменение звука (клавиша M, выключатели, ползунки): так панель громкости всегда показывает правду */
  const listeners = [];
  const emit = () => listeners.slice().forEach(f => { try { f(); } catch (e) { /* подписчик не должен ломать звук */ } });

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  function ensure() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      } catch (e) { return null; }
      // общий компрессор выравнивает громкость: музыку можно сделать заметно громче, а пики (штамп, хлопок) всё равно не «хрипят»
      master = ctx.createGain(); master.gain.value = 1;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
      master.connect(comp); comp.connect(ctx.destination);
      sfxG = ctx.createGain(); sfxG.gain.value = gainSfx(); sfxG.connect(master);
      musicG = ctx.createGain(); musicG.gain.value = gainMusic();
      lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.7;
      lp.connect(musicG); musicG.connect(master);
      ambG = ctx.createGain(); ambG.gain.value = 0; ambG.connect(sfxG);           // шум помещения подчиняется громкости и выключателю «Звука»
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ---------- примитивы ---------- */
  function tone(freq, t, dur, type, vol, dest, o) {
    o = o || {};
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + (o.a || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(dest || sfxG);
    osc.start(t); osc.stop(t + dur + 0.03);
  }
  function noise(t, dur, vol, ftype, ffreq, dest, q) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = ftype || 'bandpass'; f.frequency.value = ffreq || 2000; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxG);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }
  const T = () => ctx.currentTime;
  function play(fn) { if (!sfxOn || sfxVol <= 0) return; if (!ensure()) return; try { fn(T()); } catch (e) { /* звук необязателен */ } }

  /* ---------- эффекты ---------- */
  const fx = {
    click() { play(t => tone(520, t, 0.06, 'square', 0.05)); },
    hover() { play(t => tone(880, t, 0.025, 'triangle', 0.02)); },
    pick() { play(t => { noise(t, 0.12, 0.12, 'bandpass', 1800, null, 0.8); noise(t + 0.03, 0.08, 0.08, 'highpass', 4000); }); },
    drop() { play(t => { noise(t, 0.14, 0.14, 'lowpass', 900, null, 0.6); tone(120, t, 0.08, 'sine', 0.08, null, { slide: 70 }); }); },
    flip() { play(t => noise(t, 0.1, 0.07, 'bandpass', 2600, null, 0.7)); },
    collect() { play(t => { tone(660, t, 0.07, 'square', 0.06); tone(990, t + 0.07, 0.1, 'square', 0.06); tone(1320, t + 0.13, 0.12, 'triangle', 0.05); }); },
    note() { play(t => { tone(740, t, 0.06, 'triangle', 0.06); tone(554, t + 0.06, 0.1, 'triangle', 0.06); }); },
    whoosh() { play(t => noise(t, 0.28, 0.1, 'bandpass', 700, null, 0.4)); },
    pickup() { play(t => { tone(180, t, 0.07, 'square', 0.09, null, { slide: 90 }); noise(t, 0.06, 0.1, 'lowpass', 1200); }); },
    hangup() { play(t => { tone(120, t, 0.09, 'square', 0.1, null, { slide: 70 }); noise(t, 0.08, 0.12, 'lowpass', 800); }); },
    stamp() { play(t => { tone(90, t, 0.18, 'sine', 0.3, null, { slide: 45 }); noise(t, 0.12, 0.25, 'lowpass', 1100); }); },
    bad() { play(t => { tone(220, t, 0.16, 'sawtooth', 0.07); tone(165, t + 0.12, 0.24, 'sawtooth', 0.07); }); },
    good() { play(t => { tone(523, t, 0.1, 'triangle', 0.08); tone(784, t + 0.09, 0.16, 'triangle', 0.08); }); },
    missed() { play(t => { tone(300, t, 0.12, 'square', 0.06, null, { slide: 150 }); tone(220, t + 0.12, 0.2, 'square', 0.06, null, { slide: 110 }); }); },
    gasp() { play(t => noise(t, 0.35, 0.16, 'bandpass', 1400, null, 0.5)); },
    bang() { play(t => { noise(t, 0.3, 0.35, 'lowpass', 700); tone(70, t, 0.3, 'sine', 0.35, null, { slide: 35 }); }); },
    star() { play(t => { tone(1046, t, 0.1, 'triangle', 0.07); tone(1568, t + 0.08, 0.18, 'triangle', 0.07); }); },
    /* звуки декора на столе */
    clack() { play(t => { noise(t, 0.04, 0.16, 'highpass', 3000, null, 1); tone(1500, t, 0.05, 'square', 0.05, null, { slide: 700 }); }); },
    sip() { play(t => { tone(260, t, 0.1, 'sine', 0.09, null, { slide: 170 }); tone(220, t + 0.15, 0.12, 'sine', 0.09, null, { slide: 150 }); noise(t, 0.1, 0.04, 'lowpass', 600); }); },
    coin() { play(t => { tone(1318, t, 0.06, 'square', 0.045); tone(1976, t + 0.05, 0.24, 'square', 0.045); }); },
    ouch() { play(t => { tone(520, t, 0.07, 'triangle', 0.08, null, { slide: 900 }); tone(780, t + 0.07, 0.07, 'triangle', 0.06, null, { slide: 420 }); }); },
    /* тик часов: нечётные и чётные звучат по-разному */
    tick(alt, urgent) {
      play(t => {
        noise(t, 0.035, urgent ? 0.2 : 0.12, 'highpass', alt ? 3200 : 2400, null, 1.2);
        tone(alt ? 1500 : 1100, t, 0.03, 'square', urgent ? 0.05 : 0.025);
      });
    },
    jingle(kind) {
      play(t => {
        const seqs = {
          perfect: [[72, 0], [76, 0.11], [79, 0.22], [84, 0.33], [79, 0.5], [84, 0.62], [88, 0.78]],
          good: [[67, 0], [72, 0.12], [76, 0.24], [79, 0.4]],
          ok: [[64, 0], [67, 0.14], [64, 0.28]],
          bad: [[60, 0], [57, 0.16], [53, 0.32], [48, 0.5]],
          finale: [[60, 0], [64, 0.14], [67, 0.28], [72, 0.42], [76, 0.6], [79, 0.78], [84, 0.98]]
        };
        (seqs[kind] || seqs.ok).forEach(n => tone(midi(n[0]), t + n[1], 0.28, kind === 'bad' ? 'sawtooth' : 'square', 0.07));
      });
    }
  };

  /* звонок: двойной трезвон, пока не остановят */
  let ringTimer = 0;
  function ringOnce() {
    play(t => {
      for (let i = 0; i < 2; i++) {
        const s = t + i * 0.22;
        [1380, 1720].forEach(f => {
          const osc = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
          osc.type = 'square'; osc.frequency.value = f;
          lfo.frequency.value = 26; lg.gain.value = 0.03; lfo.connect(lg); lg.connect(g.gain);
          g.gain.setValueAtTime(0.0001, s);
          g.gain.exponentialRampToValueAtTime(0.045, s + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
          osc.connect(g); g.connect(sfxG);
          osc.start(s); osc.stop(s + 0.2); lfo.start(s); lfo.stop(s + 0.2);
        });
      }
    });
  }
  function ringStart() { ringStop(); ringOnce(); ringTimer = setInterval(ringOnce, 1500); }
  function ringStop() { if (ringTimer) { clearInterval(ringTimer); ringTimer = 0; } }

  /* «голоса» диалогов в стиле Undertale: короткий блип на букву */
  const VOICES = {
    boss: { f: 110, type: 'square', vol: 0.05 }, lena: { f: 330, type: 'triangle', vol: 0.07 },
    boris: { f: 180, type: 'square', vol: 0.045 }, unknown: { f: 140, type: 'sawtooth', vol: 0.04 },
    citizen: { f: 250, type: 'triangle', vol: 0.06 }, narrator: { f: 400, type: 'triangle', vol: 0.04 },
    celeb: { f: 200, type: 'square', vol: 0.05 }, you: { f: 280, type: 'square', vol: 0.04 },
    fufel: { f: 118, type: 'sawtooth', vol: 0.05 }
  };
  function blip(voice) {
    play(t => {
      const v = VOICES[voice] || VOICES.narrator;
      tone(v.f * (0.9 + Math.random() * 0.25), t, 0.05, v.type, v.vol, null, { a: 0.004 });
    });
  }

  /* ---------- музыка ---------- */
  const CH = { min: [0, 3, 7], maj: [0, 4, 7], dom: [0, 4, 7, 10], sus: [0, 5, 7], dim: [0, 3, 6] };
  const TRACKS = {
    menu: {
      bpm: 80, root: 45, prog: [[0, 'min'], [-4, 'maj'], [-2, 'maj'], [7, 'dom']],
      bass: { 0: 0, 6: 7, 8: 0, 11: 12, 14: 7 }, arp: [2, 5, 8, 10, 13], hat: [2, 6, 10, 14], kick: [0, 8], snare: [4, 12], vol: 1, wave: 'triangle'
    },
    day: {
      bpm: 108, root: 40, prog: [[0, 'min'], [-4, 'maj'], [3, 'maj'], [-2, 'maj']],
      bass: { 0: 0, 3: 0, 6: 7, 8: 0, 11: 12, 14: 7 }, arp: [0, 2, 4, 6, 8, 10, 12, 14], hat: [2, 6, 10, 14], kick: [0, 4, 8, 12], snare: [4, 12], vol: 0.9, wave: 'triangle'
    },
    event: {
      bpm: 64, root: 43, prog: [[0, 'maj'], [-3, 'min'], [-7, 'maj'], [-5, 'maj']],
      bass: { 0: 0, 8: 7 }, arp: [4, 7, 12], hat: [], kick: [], snare: [], vol: 0.7, wave: 'sine'
    },
    interview: {
      bpm: 94, root: 38, prog: [[0, 'min'], [-4, 'maj'], [3, 'maj'], [7, 'dom']],
      bass: { 0: 0, 4: 0, 8: 0, 10: 7, 12: 0, 14: 3 }, arp: [3, 7, 11, 15], hat: [0, 2, 4, 6, 8, 10, 12, 14], kick: [0, 8], snare: [4, 12], vol: 0.9, wave: 'sawtooth'
    },
    finale: {
      bpm: 118, root: 48, prog: [[0, 'maj'], [7, 'maj'], [-3, 'min'], [-7, 'maj']],
      bass: { 0: 0, 4: 12, 8: 7, 12: 12 }, arp: [0, 2, 4, 6, 8, 10, 12, 14], hat: [2, 6, 10, 14], kick: [0, 4, 8, 12], snare: [4, 12], vol: 0.9, wave: 'square'
    }
  };
  let cur = null, curName = '', step = 0, nextT = 0, sched = 0, tension = 0;

  function playStep(tr, s, t) {
    const bar = Math.floor(s / 16) % tr.prog.length, st = s % 16;
    const [off, type] = tr.prog[bar];
    const root = tr.root + off, tones = CH[type];
    const v = tr.vol;
    if (tr.bass[st] != null) tone(midi(root + tr.bass[st]), t, 0.22, 'triangle', 0.16 * v, lp);
    if (tr.arp.indexOf(st) >= 0) {
      const idx = (st / 2 | 0) % tones.length;
      const n = root + 12 + tones[idx] + (st % 4 === 2 ? 12 : 0);
      tone(midi(n), t, 0.16, tr.wave, 0.05 * v, lp);
    }
    if (st === 0 && tr.wave !== 'sine') tone(midi(root + 12 + tones[0]), t, 60 / (tr.bpm * (1 + tension * 0.35)) * 3.8, 'sawtooth', 0.025 * v, lp);
    if (st === 0 && tr.wave === 'sine') tones.forEach(n => tone(midi(root + 12 + n), t, 3.2, 'sine', 0.05, lp, { a: 0.4 }));
    if (tr.kick.indexOf(st) >= 0) tone(95, t, 0.1, 'sine', 0.2 * v, lp, { slide: 45 });
    if (tr.snare.indexOf(st) >= 0) noise(t, 0.09, 0.07 * v, 'bandpass', 2200, lp, 0.6);
    const hats = tr.hat.concat(tension > 0.35 ? [0, 4, 8, 12] : []).concat(tension > 0.65 ? [1, 3, 5, 7, 9, 11, 13, 15] : []);
    if (hats.indexOf(st) >= 0) noise(t, 0.03, 0.035 * v, 'highpass', 6500, lp, 0.7);
    // «пульс» напряжения: высокая нота на каждую долю
    if (tension > 0.5 && st % 4 === 0) tone(midi(root + 24 + tones[2]), t, 0.08, 'square', 0.03 * tension, lp);
  }
  function scheduler() {
    if (!ctx || !cur) return;
    // вкладка могла «спать»: пропущенные ноты не догоняем (иначе они прозвучат разом и нагрузят процессор)
    if (nextT < T() - 0.08) nextT = T() + 0.03;
    while (nextT < T() + 0.16) {
      playStep(cur, step, nextT);
      nextT += 60 / (cur.bpm * (1 + tension * 0.35)) / 4;
      step++;
    }
  }
  function music(name) {
    if (!ensure()) return;
    if (name === curName) return;
    curName = name;
    cur = name ? TRACKS[name] : null;
    step = 0; nextT = T() + 0.08;
    if (!sched) sched = setInterval(scheduler, 30);
  }
  let filterStep = -1;
  function setTension(v) {
    tension = U.clamp(v, 0, 1);
    // команду фильтру шлём только когда значение заметно изменилось (раньше — на каждом кадре, и они копились весь день)
    const q = Math.round(tension * 40);
    if (q === filterStep) return;
    filterStep = q;
    if (lp && ctx) lp.frequency.setTargetAtTime(2200 + (q / 40) * 4200, T(), 0.3);
  }
  function ambience(on) {
    if (!ensure()) return;
    ambG.gain.setTargetAtTime(on ? 0.05 : 0, T(), 0.5);
    if (on && !ambience.src) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      s.connect(f); f.connect(ambG); s.start(); ambience.src = s;
    }
  }

  return {
    init: ensure,
    fx, ringStart, ringStop, blip, music, setTension, ambience,
    toggleMusic() {
      musicOn = !musicOn;
      try { localStorage.setItem('ip-music', musicOn ? '1' : '0'); } catch (e) { /* без сохранения */ }
      if (musicG) musicG.gain.setTargetAtTime(gainMusic(), T(), 0.1);
      emit();
      return musicOn;
    },
    /* Ползунки громкости: v от 0 до 1, значение запоминается в браузере */
    setMusicVol(v) { musicVol = U.clamp(v, 0, 1); saveVol('ip-music-vol', musicVol); if (musicG) musicG.gain.setTargetAtTime(gainMusic(), T(), 0.03); emit(); },
    setSfxVol(v) { sfxVol = U.clamp(v, 0, 1); saveVol('ip-sfx-vol', sfxVol); if (sfxG) sfxG.gain.setTargetAtTime(gainSfx(), T(), 0.03); emit(); },
    musicVol: () => musicVol, sfxVol: () => sfxVol,
    toggleSfx() {
      sfxOn = !sfxOn;
      try { localStorage.setItem('ip-sfx', sfxOn ? '1' : '0'); } catch (e) { /* без сохранения */ }
      if (sfxG) sfxG.gain.setTargetAtTime(gainSfx(), T(), 0.05);
      if (!sfxOn) ringStop();
      emit();
      return sfxOn;
    },
    isMusic: () => musicOn, isSfx: () => sfxOn,
    /* fn вызывается при любом изменении (включение, выключение, громкость); возвращает функцию отписки */
    onChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }
  };
})();
