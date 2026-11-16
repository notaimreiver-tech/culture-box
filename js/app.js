/* Culture Box — moteur de quiz perso.
 * Apprentissage : rappel actif (format Cash), répétition espacée (révisions dues), entrelacement (mélange).
 * Tout est stocké dans le localStorage du navigateur. Les questions viennent de data/*.js (window.THEMES).
 */
(() => {
  'use strict';

  // ---------- utilitaires ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const shuffle = (arr, r = Math.random) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const DAY = 86400000;

  // ---------- comparaison des réponses tapées (Cash) ----------
  const norm = (s) => String(s).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(le|la|les|l|un|une|des|de|du|d|et|en|au|aux|a|the|environ|celui|celle)\b/g, ' ').replace(/\s+/g, ' ').trim();
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  const close = (x, c) => x === c || lev(x, c) <= (c.length <= 4 ? 0 : c.length <= 8 ? 1 : 2);
  function checkCash(input, q) {
    const x = norm(input); if (!x) return false;
    return [q.a, ...(q.k || [])].map(norm).some((c) => {
      if (close(x, c)) return true;
      const words = c.split(' ');
      if (words.length > 1 && x.length >= 4 && close(x, words[words.length - 1])) return true; // nom de famille seul
      const digits = (c.match(/\d+/g) || []).join('');
      return digits && x.replace(/\D/g, '') === digits && /^\d/.test(x);
    });
  }

  // ---------- données (les fichiers de même id fusionnent) ----------
  const THEMES = [], themeById = {};
  (window.THEMES || []).forEach((t) => {
    if (themeById[t.id]) { themeById[t.id].questions.push(...t.questions); return; }
    const th = { ...t, questions: t.questions.slice() }; themeById[t.id] = th; THEMES.push(th);
  });
  THEMES.forEach((t) => t.questions.forEach((q) => { q.id = t.id + '-' + hash(q.q); q.theme = t.id; }));
  const ALL = THEMES.flatMap((t) => t.questions);
  const byId = Object.fromEntries(ALL.map((q) => [q.id, q]));

  const srcUrl = (s) => /^https?:\/\//.test(s) ? s
    : s.startsWith('wikt:') ? 'https://fr.wiktionary.org/wiki/Special:Search?go=Go&search=' + encodeURIComponent(s.slice(5))
      : 'https://fr.wikipedia.org/wiki/Special:Search?go=Go&search=' + encodeURIComponent(s);
  const srcLabel = (s) => /^https?:\/\//.test(s) ? new URL(s).hostname.replace('www.', '') : s.startsWith('wikt:') ? 'Wiktionnaire — ' + s.slice(5) : 'Wikipédia — ' + s;

  // ---------- sauvegarde ----------
  const STORE = 'culturebox_v1';
  const IV = [0, 1, 3, 7, 14, 30, 60, 120]; // intervalles de révision (jours) selon la "boîte"
  const fresh = () => ({ xp: 0, history: [], q: {}, daily: {}, streak: { last: null, count: 0, best: 0 }, badges: {}, settings: { timer: false }, maxCombo: 0, records: {} });
  let S = load();
  function load() {
    let s;
    try { s = Object.assign(fresh(), JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) { s = fresh(); }
    Object.values(s.q).forEach((st) => { if (st.due == null) st.due = (st.last || 0) + IV[Math.min(st.box || 0, 7)] * DAY; });
    s.records = s.records || {};
    return s;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ } }

  // ---------- niveaux ----------
  const TITLES = ['Curieux', 'Apprenti', 'Amateur éclairé', 'Connaisseur', 'Érudit', 'Savant', 'Encyclopédiste', 'Puits de science', 'Maître de midi', 'Légende vivante'];
  const xpFor = (lvl) => 60 * lvl * (lvl - 1);
  const levelOf = (xp) => { let l = 1; while (xp >= xpFor(l + 1)) l++; return l; };
  const titleOf = (lvl) => TITLES[Math.min(TITLES.length - 1, Math.floor((lvl - 1) / 3))];

  // ---------- statistiques ----------
  const totals = () => { let seen = 0, ok = 0; Object.values(S.q).forEach((s) => { seen += s.seen; ok += s.ok; }); return { seen, ok }; };
  const themeStats = (t) => {
    let seen = 0, ok = 0, covered = 0, mastered = 0;
    t.questions.forEach((q) => { const s = S.q[q.id]; if (s) { seen += s.seen; ok += s.ok; covered++; if (s.box >= 3) mastered++; } });
    const best = Math.max(0, ...S.history.filter((h) => h.theme === t.id).map((h) => pct(h.score, h.total)));
    return { seen, ok, covered, mastered, best, total: t.questions.length };
  };
  const reviewPool = () => { const now = Date.now(); return ALL.filter((q) => S.q[q.id] && S.q[q.id].due <= now).sort((a, b) => S.q[a.id].due - S.q[b.id].due); };
  const masteredCount = () => Object.values(S.q).filter((s) => s.box >= 3).length;

  // Sélection : jamais vues > révisions dues > le reste (les mieux sues en dernier).
  function pick(pool, n) {
    const now = Date.now();
    const score = (q) => { const s = S.q[q.id]; if (!s) return -4 + Math.random() * 3; if (s.due <= now) return -2 + Math.random() * 2; return s.box * 2 + Math.random() * 3; };
    return pool.map((q) => [score(q), q]).sort((a, b) => a[0] - b[0]).slice(0, n).map((x) => x[1]);
  }

  // ---------- badges ----------
  const BADGES = [
    { id: 'first', e: '🎉', n: 'Premier pas', d: 'Terminer un premier quiz', test: () => S.history.length >= 1 },
    { id: 'perfect', e: '💯', n: 'Sans faute', d: 'Faire un 20/20', test: (r) => r && r.total >= 20 && r.score === r.total && !r.fast },
    { id: 'cash10', e: '💰', n: 'Cash machine', d: '10 bonnes réponses en Cash dans un quiz', test: (r) => r && r.cashOk >= 10 },
    { id: 'cash20', e: '🤑', n: 'Tout en Cash', d: '20/20 uniquement en Cash', test: (r) => r && r.cashOk >= 20 && r.score === r.total },
    { id: 'combo10', e: '🔥', n: 'En feu', d: '10 bonnes réponses d\'affilée', test: () => S.maxCombo >= 10 },
    { id: 'combo25', e: '☄️', n: 'Inarrêtable', d: '25 bonnes réponses d\'affilée', test: () => S.maxCombo >= 25 },
    { id: 'eclair20', e: '⚡', n: 'Éclair', d: '20 bonnes réponses en mode Éclair', test: () => (S.records.eclair || 0) >= 20 },
    { id: 'survie15', e: '🛡️', n: 'Survivant', d: '15 bonnes réponses en Survie', test: () => (S.records.survie || 0) >= 15 },
    { id: 'survie40', e: '🦾', n: 'Immortel', d: '40 bonnes réponses en Survie', test: () => (S.records.survie || 0) >= 40 },
    { id: 'streak3', e: '📅', n: 'Régulier', d: 'Jouer 3 jours de suite', test: () => S.streak.best >= 3 },
    { id: 'streak7', e: '🗓️', n: 'Assidu', d: 'Jouer 7 jours de suite', test: () => S.streak.best >= 7 },
    { id: 'streak30', e: '🏆', n: 'Discipline de fer', d: 'Jouer 30 jours de suite', test: () => S.streak.best >= 30 },
    { id: 'explorer', e: '🧭', n: 'Explorateur', d: 'Un quiz dans chaque thème', test: () => THEMES.every((t) => S.history.some((h) => h.theme === t.id)) },
    { id: 'm100', e: '📚', n: 'Bibliothèque', d: '100 questions maîtrisées', test: () => masteredCount() >= 100 },
    { id: 'm300', e: '🎓', n: 'Encyclopédie', d: '300 questions maîtrisées', test: () => masteredCount() >= 300 },
    { id: 'review', e: '🔁', n: 'Tête dure', d: 'Terminer une séance de révision', test: (r) => r && r.mode === 'review' },
    { id: 'daily', e: '☀️', n: 'Lève-tôt', d: 'Réussir 10/10 au défi du jour', test: (r) => r && r.mode === 'daily' && r.score === r.total },
    { id: 'master', e: '🧠', n: 'Maître d\'un thème', d: 'Maîtriser toutes les questions d\'un thème', test: () => THEMES.some((t) => themeStats(t).mastered === t.questions.length) },
    { id: 'polymath', e: '🦉', n: 'Polymathe', d: '≥ 80 % de réussite dans tous les thèmes', test: () => THEMES.every((t) => { const s = themeStats(t); return s.seen >= 10 && pct(s.ok, s.seen) >= 80; }) },
  ];
  function checkBadges(run) {
    const earned = [];
    BADGES.forEach((b) => { if (!S.badges[b.id] && b.test(run)) { S.badges[b.id] = Date.now(); earned.push(b); } });
    return earned;
  }

  // ---------- toast & navigation ----------
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }
  function setNav(name) { $$('.navbtn').forEach((b) => b.classList.toggle('active', b.dataset.act === name)); }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    if (el.dataset.act === 'home') { e.preventDefault(); if (confirmLeave()) renderHome(); }
    else if (el.dataset.act === 'stats') { if (confirmLeave()) renderStats(); }
  });
  function confirmLeave() {
    if (Q && !Q.done && Q.list.some((x) => x.done)) return confirm('Quitter le quiz en cours ? Tes réponses comptent pour les révisions, mais tu perds l\'XP de la partie.');
    return true;
  }

  // =====================================================================
  // ACCUEIL
  // =====================================================================
  function renderHome() {
    Q = null; stopTimers(); setNav('home');
    const lvl = levelOf(S.xp), cur = xpFor(lvl), next = xpFor(lvl + 1);
    const today = dayKey(), dailyDone = S.daily[today], due = reviewPool().length;
    const streakAlive = S.streak.last && dayDiff(S.streak.last, today) <= 1 ? S.streak.count : 0;

    app.innerHTML = `
      <section class="card hero">
        <div>
          <div class="muted">Niveau ${lvl} · ${esc(titleOf(lvl))}</div>
          <h1>${greeting()}</h1>
          <div class="levelbar"><div style="width:${pct(S.xp - cur, next - cur)}%"></div></div>
          <div class="muted" style="font-size:.85rem;margin-top:4px">${S.xp - cur} / ${next - cur} XP vers le niveau ${lvl + 1}</div>
          <div class="pills">
            <span class="pill">🔥 ${streakAlive} jour${streakAlive > 1 ? 's' : ''} de suite</span>
            <span class="pill">🧠 ${masteredCount()}/${ALL.length} maîtrisées</span>
            <span class="pill">🏅 ${Object.keys(S.badges).length}/${BADGES.length} badges</span>
          </div>
        </div>
        <div class="bigemoji">🧠</div>
      </section>

      <div class="routine card">
        <b>🎯 Ta routine du jour :</b>
        <span class="${dailyDone ? 'done' : ''}">☀️ Défi du jour</span>
        <span class="${due ? '' : 'done'}">🔁 ${due ? due + ' révision' + (due > 1 ? 's' : '') + ' à faire' : 'Révisions à jour'}</span>
        <span>➕ un quiz de thème</span>
      </div>

      <div class="section-title"><h2>Modes de jeu</h2>
        <label class="toggle" title="25 secondes par question, bonus d'XP si tu réponds vite">
          <input type="checkbox" id="timerToggle" ${S.settings.timer ? 'checked' : ''}><span class="sw"></span> ⏱️ Chrono
        </label>
      </div>
      <div class="modes">
        <button class="card mode" id="m-review" ${due ? '' : 'disabled'}>
          ${due ? `<span class="chip badge-done" style="--c:var(--ko)">${due}</span>` : ''}
          <div class="icon">🔁</div><h3>Révisions</h3>
          <p>${due ? 'Les questions qui arrivent à échéance. Le cœur de la méthode : à faire en priorité.' : 'Rien à réviser aujourd\'hui. Tes erreurs reviendront ici au bon moment.'}</p>
        </button>
        <button class="card mode" id="m-daily">
          ${dailyDone ? `<span class="chip badge-done" style="--c:var(--ok)">✓ ${dailyDone.score}/${dailyDone.total}</span>` : ''}
          <div class="icon">☀️</div><h3>Défi du jour</h3>
          <p>10 questions, les mêmes toute la journée. ${dailyDone ? 'Déjà fait, tu peux le rejouer.' : 'Garde ta série en vie !'}</p>
        </button>
        <button class="card mode" id="m-mix">
          <div class="icon">🎲</div><h3>Grand mélange</h3>
          <p>20 questions tous thèmes confondus. Mélanger les sujets aide à mieux retenir.</p>
        </button>
        <button class="card mode" id="m-eclair">
          ${S.records.eclair ? `<span class="chip badge-done">🏆 ${S.records.eclair}</span>` : ''}
          <div class="icon">⚡</div><h3>Éclair</h3>
          <p>60 secondes, un maximum de bonnes réponses. Le chrono se fige quand tu te trompes, le temps de lire l'explication.</p>
        </button>
        <button class="card mode" id="m-survie">
          ${S.records.survie ? `<span class="chip badge-done">🏆 ${S.records.survie}</span>` : ''}
          <div class="icon">🛡️</div><h3>Survie</h3>
          <p>Mort subite : tu joues jusqu'à la première erreur. Jusqu'où iras-tu ?</p>
        </button>
      </div>
      <p class="tip">💡 <b>Le secret des champions :</b> réponds en <b>💰 Cash</b> dès que tu as une petite idée. Aller chercher la réponse dans ta mémoire, sans propositions, est ce qui l'ancre le mieux. Et fais tes révisions chaque jour : chaque question revient juste avant que tu l'oublies (1 j, 3 j, 7 j, 14 j, 1 mois…).</p>

      <div class="section-title"><h2>Par thème</h2><span class="muted">${ALL.length} questions</span></div>
      <div class="themes">
        ${THEMES.map((th) => { const s = themeStats(th); return `
          <button class="card theme" data-theme="${th.id}" style="--c:${th.color}">
            <div class="emoji">${th.emoji}</div>
            <h3>${esc(th.name)}</h3>
            <div class="sub">${s.covered}/${s.total} vues · ${s.mastered} maîtrisées</div>
            <div class="mini"><div style="width:${pct(s.mastered, s.total)}%"></div></div>
          </button>`; }).join('')}
      </div>`;

    $('#timerToggle').onchange = (e) => { S.settings.timer = e.target.checked; save(); toast(S.settings.timer ? '⏱️ Chrono activé : 25 s par question' : 'Chrono désactivé'); };
    $('#m-review').onclick = startReview;
    $('#m-daily').onclick = startDaily;
    $('#m-mix').onclick = () => startQuiz({ mode: 'mix', title: 'Grand mélange', questions: pick(ALL, 20) });
    $('#m-eclair').onclick = () => startQuiz({ mode: 'eclair', title: 'Éclair', questions: pick(ALL, 120), fast: true });
    $('#m-survie').onclick = () => startQuiz({ mode: 'survie', title: 'Survie', questions: shuffle(ALL), fast: true });
    $$('[data-theme]').forEach((b) => b.onclick = () => {
      const th = themeById[b.dataset.theme];
      startQuiz({ mode: 'theme', theme: th.id, title: th.name, questions: pick(th.questions, 20) });
    });
  }

  function greeting() {
    const h = new Date().getHours();
    const list = h < 6 ? ['Insomnie culturelle ?', 'Un quiz avant de dormir ?'] : h < 12 ? ['Bonjour, cerveau !', 'Prêt à apprendre un truc ?'] : h < 18 ? ['On muscle la culture ?', 'C\'est l\'heure du quiz !'] : ['Bonsoir, l\'érudit !', 'Un dernier pour la route ?'];
    return list[new Date().getDate() % list.length];
  }
  function startReview() { const p = reviewPool(); if (p.length) startQuiz({ mode: 'review', title: 'Révisions', questions: shuffle(p.slice(0, 20)) }); else renderHome(); }
  function startDaily() {
    const today = dayKey(), r = rng(parseInt(hash('daily' + today), 36));
    startQuiz({ mode: S.daily[today] ? 'daily-replay' : 'daily', title: 'Défi du jour', questions: shuffle(ALL, r).slice(0, 10), seed: r });
  }

  // =====================================================================
  // QUIZ
  // =====================================================================
  const FMT = {
    cash: { e: '💰', n: 'Cash', mult: 3, d: 'tu tapes la réponse · XP x3' },
    carre: { e: '🃏', n: 'Carré', mult: 1, d: '4 propositions · XP x1' },
    duo: { e: '✌️', n: 'Duo', mult: 0.5, d: '2 propositions · XP x0,5' },
  };
  const QTIME = 25, ECLAIR_MS = 60000;
  let Q = null, timerId = null, globalId = null;

  function startQuiz({ mode, theme, title, questions, seed, fast }) {
    stopTimers();
    Q = {
      mode, theme, title, fast: !!fast, timer: S.settings.timer && mode !== 'eclair',
      list: questions.map((q) => ({ q, choices: shuffle([q.a, ...q.w], seed || Math.random) })),
      i: 0, combo: 0, maxCombo: 0, xp: 0, done: false, left: ECLAIR_MS,
    };
    setNav('');
    renderQuestion();
    if (mode === 'eclair') startGlobal();
  }

  function renderQuestion() {
    const item = Q.list[Q.i], th = themeById[item.q.theme];
    Q.phase = 'format'; Q.t0 = Date.now();
    const answered = Q.list.filter((x) => x.done).length;
    const progress = Q.mode === 'eclair' ? `<div class="progress"><div id="gbar" style="width:${(Q.left / ECLAIR_MS) * 100}%"></div></div><span class="count" id="gleft">${Math.ceil(Q.left / 1000)} s</span>`
      : Q.mode === 'survie' ? `<div class="progress"><div style="width:0"></div></div><span class="count">🛡️ ${answered}</span>`
        : `<div class="progress"><div style="width:${(Q.i / Q.list.length) * 100}%"></div></div><span class="count">${Q.i + 1}/${Q.list.length}</span>`;
    app.innerHTML = `
      <div class="quiz">
        <div class="quiz-top"><button class="iconbtn" data-act="home" title="Quitter">✕</button>${progress}</div>
        ${Q.timer ? '<div class="timer" id="timer"><div></div></div>' : ''}
        <div class="meta">
          <span class="chip" style="--c:${th.color}">${th.emoji} ${esc(th.name)}</span>
          ${Q.combo >= 2 ? `<span class="combo">🔥 x${Q.combo}</span>` : ''}
          <span class="muted" style="margin-left:auto;font-weight:600">+${Q.xp} XP</span>
        </div>
        <h2 class="question">${esc(item.q.q)}</h2>
        <div id="zone"></div>
        <div id="feedback"></div>
      </div>`;
    if (Q.fast) chooseFormat('carre');
    else {
      $('#zone').innerHTML = `<div class="formats">
        ${['cash', 'carre', 'duo'].map((f) => `<button class="fmt fmt-${f}" data-f="${f}"><span class="fe">${FMT[f].e}</span><b>${FMT[f].n}</b><small>${FMT[f].d}</small><kbd>${{ cash: 'C', carre: 'Entrée', duo: 'D' }[f]}</kbd></button>`).join('')}
      </div>`;
      $$('[data-f]').forEach((b) => b.onclick = () => chooseFormat(b.dataset.f));
    }
    if (Q.timer) startTimer();
  }

  function chooseFormat(f) {
    if (Q.phase !== 'format') return;
    const item = Q.list[Q.i];
    item.fmt = f;
    if (f === 'cash') {
      Q.phase = 'cash';
      $('#zone').innerHTML = `<form class="cash" id="cashForm" autocomplete="off">
          <input id="cashIn" placeholder="Ta réponse…" autocapitalize="off" spellcheck="false">
          <button class="btn primary">Valider</button>
          <button type="button" class="btn" id="pass">Je sèche</button>
        </form><div class="hint" style="margin-top:6px">Pas besoin d'accents ni de majuscules, et les petites fautes de frappe passent.</div>`;
      $('#cashIn').focus();
      $('#cashForm').onsubmit = (e) => { e.preventDefault(); const v = $('#cashIn').value; if (!v.trim()) return; grade(checkCash(v, item.q), v.trim()); };
      $('#pass').onclick = () => grade(false, null);
      return;
    }
    Q.phase = 'choices';
    item.shown = f === 'duo' ? shuffle([item.q.a, item.choices.find((c) => c !== item.q.a && Math.random() < 0.5) || item.q.w[0]]) : item.choices;
    $('#zone').innerHTML = `<div class="choices">${item.shown.map((c, k) => `<button class="choice" data-k="${k}"><kbd>${k + 1}</kbd><span>${esc(c)}</span></button>`).join('')}</div>`;
    $$('.choice').forEach((b) => b.onclick = () => { const k = +b.dataset.k; grade(item.shown[k] === item.q.a, item.shown[k], k); });
  }

  // --- chronos ---
  function startTimer() {
    clearInterval(timerId);
    let left = QTIME; const bar = $('#timer > div'), wrap = $('#timer');
    timerId = setInterval(() => {
      left--; bar.style.width = (left / QTIME) * 100 + '%';
      if (left <= 5) wrap.classList.add('low');
      if (left <= 0) { clearInterval(timerId); grade(false, null); }
    }, 1000);
  }
  function startGlobal() {
    clearInterval(globalId);
    globalId = setInterval(() => {
      if (!Q || Q.done) return clearInterval(globalId);
      if (Q.phase === 'answered' && !Q.list[Q.i].ok) return; // pause pendant la lecture d'une explication
      Q.left -= 100;
      const bar = $('#gbar'), lab = $('#gleft');
      if (bar) bar.style.width = Math.max(0, (Q.left / ECLAIR_MS) * 100) + '%';
      if (lab) lab.textContent = Math.max(0, Math.ceil(Q.left / 1000)) + ' s';
      if (Q.left <= 0) { clearInterval(globalId); finish(); }
    }, 100);
  }
  function stopTimers() { clearInterval(timerId); clearInterval(globalId); timerId = globalId = null; }

  // --- correction ---
  function grade(ok, picked, k) {
    if (!Q || Q.phase === 'answered' || Q.phase === 'format' && !Q.timer) return;
    Q.phase = 'answered'; clearInterval(timerId);
    const item = Q.list[Q.i];
    if (!item.fmt) item.fmt = 'carre'; // temps écoulé avant le choix du format
    item.prev = S.q[item.q.id] ? { ...S.q[item.q.id] } : null;
    item.prevCombo = Q.combo; item.prevXp = Q.xp; item.k = k;
    item.secs = (Date.now() - Q.t0) / 1000;
    apply(item, ok, picked);
    showFeedback(item);
  }

  // Applique le résultat à partir de l'état d'avant la question (rejouable pour "J'avais bon").
  function apply(item, ok, picked) {
    const q = item.q, now = Date.now();
    const st = item.prev ? { ...item.prev } : { seen: 0, ok: 0, box: 0, last: 0, due: 0 };
    st.seen++; st.last = now;
    if (ok) {
      st.ok++;
      st.box = Math.min(7, item.fmt === 'cash' ? st.box + 2 : item.fmt === 'carre' ? st.box + 1 : Math.max(st.box, 1));
    } else st.box = 0;
    st.due = now + IV[st.box] * DAY;
    S.q[q.id] = st;

    Q.combo = ok ? item.prevCombo + 1 : 0;
    Q.maxCombo = Math.max(Q.maxCombo, Q.combo);
    item.gained = ok ? Math.round((10 + Math.min(Q.combo - 1, 5) * 2 + (Q.timer && item.secs < 8 ? 5 : 0)) * FMT[item.fmt].mult) : 0;
    Q.xp = item.prevXp + item.gained;
    item.ok = ok; item.picked = picked; item.done = true;
    S.maxCombo = Math.max(S.maxCombo || 0, Q.maxCombo);
    save();
  }

  function showFeedback(item) {
    const q = item.q;
    $$('.choice').forEach((b, idx) => {
      b.disabled = true;
      if (item.shown[idx] === q.a) b.classList.add('correct'); else if (idx === item.k) b.classList.add('wrong'); else b.classList.add('dim');
    });
    $$('#cashForm input, #cashForm button').forEach((el) => { el.disabled = true; });
    const cashIn = $('#cashIn'); if (cashIn) cashIn.classList.add(item.ok ? 'good' : 'bad');
    $$('.fmt').forEach((b) => { b.disabled = true; });

    if (Q.fast && item.ok) { setTimeout(next, 450); return; }
    if (Q.mode === 'survie' && !item.ok) Q.over = true;

    const last = Q.over || (!Q.fast && Q.i === Q.list.length - 1);
    const verdict = item.ok ? `✅ ${cheer()} <span class="muted">+${item.gained} XP${item.fmt === 'cash' ? ' 💰' : ''}</span>`
      : item.picked == null ? `${item.secs >= QTIME - 1 && Q.timer ? '⏰ Temps écoulé !' : '🤷 Pas grave.'} C'était <b>${esc(q.a)}</b>`
        : `❌ Raté, c'était <b>${esc(q.a)}</b>`;
    $('#feedback').innerHTML = `
      <div class="card feedback ${item.ok ? 'ok' : 'ko'}">
        <div class="verdict">${verdict}</div>
        <p>${esc(q.e)}</p>
        <span class="source">📚 Source : <a href="${srcUrl(q.s)}" target="_blank" rel="noopener">${esc(srcLabel(q.s))}</a></span>
        <div class="row">
          ${item.fmt === 'cash' && !item.ok && item.picked ? '<button class="btn small" id="override">J\'avais bon (faute de frappe)</button>' : '<span class="hint">Entrée pour continuer</span>'}
          <button class="btn primary" id="next">${last ? 'Voir le résultat 🏁' : Q.fast ? 'Continuer ▶' : 'Question suivante →'}</button>
        </div>
      </div>`;
    $('#next').onclick = next;
    const ov = $('#override');
    if (ov) ov.onclick = () => { apply(item, true, item.picked); Q.over = false; $('#feedback').innerHTML = ''; showFeedback(item); };
    $('#next').focus({ preventScroll: true });
    $('#feedback').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cheer() { const l = ['Bien vu !', 'Exact !', 'Bravo !', 'Parfait !', 'Yes !', 'Impeccable !', 'Tu gères !', 'Digne d\'un maître de midi !']; return l[Math.floor(Math.random() * l.length)]; }

  function next() {
    if (!Q || Q.phase !== 'answered' || Q.done) return;
    if (Q.over || Q.i >= Q.list.length - 1) return finish();
    Q.i++; renderQuestion(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('keydown', (e) => {
    if (!Q || Q.done || e.target.id === 'cashIn' && Q.phase === 'cash') return;
    const key = e.key.toLowerCase();
    if (Q.phase === 'format') {
      if (key === 'c') { e.preventDefault(); chooseFormat('cash'); }
      else if (key === 'd') { e.preventDefault(); chooseFormat('duo'); }
      else if (key === 'enter' || key === ' ') { e.preventDefault(); chooseFormat('carre'); }
    } else if (Q.phase === 'choices' && /^[1-4]$/.test(key)) {
      const item = Q.list[Q.i], k = +key - 1;
      if (k < item.shown.length) grade(item.shown[k] === item.q.a, item.shown[k], k);
    } else if (Q.phase === 'answered' && (key === 'enter' || key === ' ') && e.target.id !== 'override') { e.preventDefault(); next(); }
  });

  // =====================================================================
  // FIN DE QUIZ
  // =====================================================================
  function finish() {
    if (Q.done) return;
    Q.done = true; stopTimers();
    const res = Q.list.filter((x) => x.done);
    const score = res.filter((r) => r.ok).length, total = res.length;
    const cashOk = res.filter((r) => r.ok && r.fmt === 'cash').length;
    const bonus = !Q.fast && score === total && total >= 10 ? total * 5 : 0;
    Q.xp += bonus;
    const lvlBefore = levelOf(S.xp);
    S.xp += Q.xp;

    const today = dayKey();
    if (total > 0 && S.streak.last !== today) {
      S.streak.count = S.streak.last && dayDiff(S.streak.last, today) === 1 ? S.streak.count + 1 : 1;
      S.streak.last = today; S.streak.best = Math.max(S.streak.best, S.streak.count);
    }
    if (Q.mode === 'daily') S.daily[today] = { score, total };
    let record = false;
    if (Q.fast && score > (S.records[Q.mode] || 0)) { S.records[Q.mode] = score; record = true; }

    const run = { d: Date.now(), mode: Q.mode, theme: Q.theme || null, title: Q.title, score, total, xp: Q.xp, timer: Q.timer, fast: Q.fast, cashOk };
    S.history.push(run);
    if (S.history.length > 500) S.history = S.history.slice(-500);
    const earned = checkBadges(run);
    save();
    const lvlAfter = levelOf(S.xp);
    renderResult(run, res, bonus, earned, lvlAfter > lvlBefore ? lvlAfter : 0, record);
  }

  function verdictFor(p) {
    if (p === 100) return ['🏆', 'Score parfait. Respect.'];
    if (p >= 85) return ['🤩', 'Énorme ! Tu es une vraie encyclopédie.'];
    if (p >= 70) return ['😎', 'Très solide, quelques détails à revoir.'];
    if (p >= 50) return ['🙂', 'Pas mal ! Les révisions vont te faire progresser vite.'];
    if (p >= 30) return ['🤔', 'Ça rentre petit à petit. Lis bien les explications.'];
    return ['🌱', 'Chaque erreur, c\'est une chose de plus que tu vas retenir.'];
  }

  function renderResult(run, res, bonus, earned, newLevel, record) {
    const p = pct(run.score, run.total);
    const [emo, msg] = run.fast
      ? [record ? '🏆' : '⚡', record ? `Nouveau record : ${run.score} !` : `${run.score} bonne${run.score > 1 ? 's' : ''} réponse${run.score > 1 ? 's' : ''} (record : ${S.records[run.mode] || 0})`]
      : verdictFor(p);
    app.innerHTML = `
      <div class="quiz">
        <section class="card result-head">
          <div class="muted">${esc(run.title)}${run.timer ? ' · ⏱️ chrono' : ''}</div>
          <h2 style="font-size:1.8rem">${emo} ${msg}</h2>
          <div class="ring" id="ring"><div><span>${run.score}<small>sur ${run.total}</small></span></div></div>
          <div class="pills" style="justify-content:center">
            <span class="pill">✨ +${run.xp} XP${bonus ? ` (dont ${bonus} de bonus sans-faute)` : ''}</span>
            <span class="pill">🔥 meilleure série : ${Q.maxCombo}</span>
            ${run.cashOk ? `<span class="pill">💰 ${run.cashOk} en Cash</span>` : ''}
            ${newLevel ? `<span class="pill" style="border-color:var(--accent)">⬆️ Niveau ${newLevel} : ${esc(titleOf(newLevel))} !</span>` : ''}
          </div>
          ${earned.length ? `<div class="newbadges">${earned.map((b) => `<span class="chip" style="font-size:1rem;padding:8px 14px">${b.e} Nouveau badge : ${esc(b.n)}</span>`).join('')}</div>` : ''}
          <div class="actions">
            <button class="btn primary" id="again">🔄 Rejouer</button>
            ${reviewPool().length ? '<button class="btn" id="rev">🔁 Mes révisions</button>' : ''}
            <button class="btn" data-act="home">🏠 Accueil</button>
          </div>
        </section>

        <div class="section-title"><h2>Récap</h2><span class="muted">Les erreurs sont dépliées : relis-les une fois</span></div>
        <div class="recap">
          ${res.map((r, i) => { const q = r.q; return `
            <details ${r.ok ? '' : 'open'}>
              <summary>${r.ok ? '✅' : '❌'} <span>${i + 1}. ${esc(q.q)} <small class="muted">${FMT[r.fmt].e}</small></span></summary>
              <div class="ans">Réponse : <b class="ok">${esc(q.a)}</b>${r.ok ? '' : ` · toi : <b class="ko">${r.picked ? esc(r.picked) : 'pas de réponse'}</b>`}</div>
              <p class="muted" style="margin:6px 0">${esc(q.e)}</p>
              <span class="source">📚 <a href="${srcUrl(q.s)}" target="_blank" rel="noopener">${esc(srcLabel(q.s))}</a></span>
            </details>`; }).join('') || '<p class="muted">Aucune question jouée.</p>'}
        </div>
      </div>`;
    animateRing(p);
    const prev = { mode: Q.mode, theme: Q.theme, title: Q.title };
    $('#again').onclick = () => {
      if (prev.mode.startsWith('daily')) return startDaily();
      if (prev.mode === 'review') return startReview();
      if (prev.mode === 'eclair') return startQuiz({ ...prev, questions: pick(ALL, 120), fast: true });
      if (prev.mode === 'survie') return startQuiz({ ...prev, questions: shuffle(ALL), fast: true });
      startQuiz({ ...prev, questions: pick(prev.theme ? themeById[prev.theme].questions : ALL, 20) });
    };
    const rev = $('#rev'); if (rev) rev.onclick = startReview;
    window.scrollTo({ top: 0 });
  }

  function animateRing(target) {
    const ring = $('#ring'); let v = 0;
    const step = () => { v = Math.min(target, v + Math.max(1, target / 30)); ring.style.setProperty('--p', v); if (v < target) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // =====================================================================
  // PROGRESSION
  // =====================================================================
  function renderStats() {
    Q = null; stopTimers(); setNav('stats');
    const t = totals(), lvl = levelOf(S.xp);
    const weak = ALL.filter((q) => S.q[q.id] && S.q[q.id].seen >= 2 && S.q[q.id].ok / S.q[q.id].seen < 0.5)
      .sort((a, b) => S.q[a.id].ok / S.q[a.id].seen - S.q[b.id].ok / S.q[b.id].seen).slice(0, 10);
    const hist = S.history.slice(-15).reverse();
    const fmt = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    // prévision des révisions sur 7 jours
    const now = Date.now(), fc = Array(7).fill(0);
    Object.values(S.q).forEach((s) => { const d = Math.max(0, Math.floor((s.due - now) / DAY)); if (d < 7) fc[d]++; });
    const fmax = Math.max(1, ...fc);

    app.innerHTML = `
      <h1>Ma progression</h1>
      <div class="grid4">
        <div class="card stat"><div class="v">${lvl}</div><div class="l">Niveau · ${esc(titleOf(lvl))}</div></div>
        <div class="card stat"><div class="v">${masteredCount()}</div><div class="l">Questions maîtrisées sur ${ALL.length}</div></div>
        <div class="card stat"><div class="v">${Object.keys(S.q).length}</div><div class="l">Questions découvertes</div></div>
        <div class="card stat"><div class="v">${pct(t.ok, t.seen)} %</div><div class="l">${t.ok}/${t.seen} bonnes réponses</div></div>
        <div class="card stat"><div class="v">${S.streak.best}</div><div class="l">Record de jours de suite</div></div>
        <div class="card stat"><div class="v">${S.records.eclair || 0} · ${S.records.survie || 0}</div><div class="l">Records Éclair · Survie</div></div>
      </div>

      <div class="section-title"><h2>Révisions à venir</h2><span class="muted">7 prochains jours</span></div>
      <div class="card forecast">
        ${fc.map((n, i) => `<div><div class="fbar"><div style="height:${(n / fmax) * 100}%"></div></div><b>${n}</b><span>${i === 0 ? 'Auj.' : new Date(now + i * DAY).toLocaleDateString('fr-FR', { weekday: 'short' })}</span></div>`).join('')}
      </div>

      <div class="section-title"><h2>Par thème</h2><span class="muted">réussite · couverture · maîtrise</span></div>
      <div class="card bars">
        ${THEMES.map((th) => { const s = themeStats(th); return `
          <div class="bar-row" style="--c:${th.color}">
            <span class="name">${th.emoji} ${esc(th.name)}</span>
            <div class="track"><div style="width:${pct(s.ok, s.seen)}%"></div></div>
            <span class="pct">${s.seen ? pct(s.ok, s.seen) + ' %' : '—'}</span>
            <span class="cov">${s.covered}/${s.total} vues · ${s.mastered} maîtrisées</span>
          </div>`; }).join('')}
      </div>

      ${weak.length ? `
        <div class="section-title"><h2>Tes bêtes noires</h2><span class="muted">tu les rates souvent</span></div>
        <div class="card"><ul class="weak">${weak.map((q) => `<li><b>${esc(q.q)}</b><br><span class="muted">→ ${esc(q.a)}</span></li>`).join('')}</ul></div>` : ''}

      <div class="section-title"><h2>Badges</h2><span class="muted">${Object.keys(S.badges).length}/${BADGES.length}</span></div>
      <div class="badges">
        ${BADGES.map((b) => `<div class="card bdg ${S.badges[b.id] ? '' : 'locked'}"><div class="e">${b.e}</div><div class="n">${esc(b.n)}</div><div class="d">${esc(b.d)}</div></div>`).join('')}
      </div>

      <div class="section-title"><h2>Historique</h2></div>
      <div class="card" style="overflow-x:auto">
        ${hist.length ? `<table class="history"><tr><th>Date</th><th>Quiz</th><th>Score</th><th>XP</th></tr>
          ${hist.map((h) => `<tr><td>${fmt(h.d)}</td><td>${esc(h.title)}${h.timer ? ' ⏱️' : ''}</td><td><b>${h.score}/${h.total}</b></td><td>+${h.xp}</td></tr>`).join('')}</table>`
        : '<p class="muted" style="margin:0">Aucun quiz terminé pour l\'instant.</p>'}
      </div>

      <div class="section-title"><h2>Sauvegarde</h2></div>
      <div class="card">
        <p class="muted" style="margin-top:0">Ta progression est enregistrée dans ce navigateur. Exporte-la pour la sauvegarder ou la passer sur un autre appareil.</p>
        <div class="actions" style="justify-content:flex-start">
          <button class="btn small" id="exp">⬇️ Exporter</button>
          <button class="btn small" id="imp">⬆️ Importer</button>
          <button class="btn small danger" id="rst">🗑️ Tout réinitialiser</button>
          <input type="file" id="file" accept=".json,application/json" hidden>
        </div>
      </div>`;

    $('#exp').onclick = () => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
      a.download = `culturebox-${dayKey()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#imp').onclick = () => $('#file').click();
    $('#file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const data = JSON.parse(await f.text()); if (typeof data.xp !== 'number') throw 0; localStorage.setItem(STORE, JSON.stringify(data)); S = load(); save(); toast('✅ Progression importée'); renderStats(); }
      catch (err) { toast('❌ Fichier invalide'); }
    };
    $('#rst').onclick = () => { if (confirm('Effacer toute ta progression ? (exporte-la avant si tu veux la garder)')) { S = fresh(); save(); toast('Progression remise à zéro'); renderStats(); } };
    window.scrollTo({ top: 0 });
  }

  // ---------- go ----------
  if (!ALL.length) { app.innerHTML = '<p>Aucune question chargée. Vérifie les fichiers du dossier data/.</p>'; return; }
  renderHome();
})();
