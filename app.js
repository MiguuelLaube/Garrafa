/* =========================================================
   Sequência de Cores — lógica
   Narração 100% no navegador via Web Speech API (pt-BR).
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Dados ---------- */
  const COLORS = [
    { id: 'vermelho', name: 'Vermelho', hex: '#ef4444', ink: '#ffffff' },
    { id: 'azul',     name: 'Azul',     hex: '#3b82f6', ink: '#ffffff' },
    { id: 'verde',    name: 'Verde',    hex: '#22c55e', ink: '#052e16' },
    { id: 'amarelo',  name: 'Amarelo',  hex: '#facc15', ink: '#422006' },
    { id: 'roxo',     name: 'Roxo',     hex: '#a855f7', ink: '#ffffff' },
    { id: 'laranja',  name: 'Laranja',  hex: '#f97316', ink: '#ffffff' },
    { id: 'rosa',     name: 'Rosa',     hex: '#f472b6', ink: '#500724' },
    { id: 'branco',   name: 'Branco',   hex: '#f8fafc', ink: '#0f172a' },
    { id: 'preto',    name: 'Preto',    hex: '#0b0b10', ink: '#ffffff', glow: '#e2e8f0' },
    { id: 'marrom',   name: 'Marrom',   hex: '#8b5a2b', ink: '#ffffff' },
  ];
  const COLOR_BY_ID = Object.fromEntries(COLORS.map((c) => [c.id, c]));
  const DEFAULT_SEQUENCE = ['amarelo', 'vermelho', 'verde', 'azul', 'roxo'];
  const MIN_POSITIONS = 1;
  const MAX_POSITIONS = 20;

  // rate = velocidade da fala; intro/gap = pausas (ms) após "Começando" e entre as cores
  const SPEEDS = {
    slow:   { rate: 0.75, intro: 900, gap: 750 },
    normal: { rate: 0.95, intro: 600, gap: 420 },
    fast:   { rate: 1.2,  intro: 320, gap: 180 },
  };
  const INTRO_TEXT = 'Começando';
  const TEST_TEXT = 'Olá! Esta é a voz que vai narrar a sequência de cores.';
  const STORAGE_KEY = 'sequencia-cores:v1';

  const synth = ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) ? window.speechSynthesis : null;

  /* ---------- Estado ---------- */
  const state = {
    sequence: [...DEFAULT_SEQUENCE], // null = posição vazia
    active: 0,
    speed: 'normal',
    preferredVoiceURI: null, // escolha salva do usuário
    voiceURI: null,          // voz efetivamente usada
    voices: [],
    playing: false,
    status: null,            // 'done' | null
    hasPlayed: false,
  };

  /* ---------- Elementos ---------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    bottles: $('bottles'),
    seqText: $('sequence-text'),
    badge: $('status-badge'),
    positions: $('positions'),
    palette: $('palette'),
    posCount: $('pos-count'),
    activeLabel: $('active-label'),
    btnAddPos: $('btn-add-pos'),
    btnRemovePos: $('btn-remove-pos'),
    btnAddRow: $('btn-add-row'),
    btnPlay: $('btn-play'),
    btnPlayMobile: $('btn-play-mobile'),
    btnRepeat: $('btn-repeat'),
    btnStop: $('btn-stop'),
    btnStopMobile: $('btn-stop-mobile'),
    btnReplay: $('btn-replay'),
    speed: $('speed'),
    voiceSelect: $('voice-select'),
    voiceHint: $('voice-hint'),
    btnTestVoice: $('btn-test-voice'),
    btnShuffle: $('btn-shuffle'),
    btnCopy: $('btn-copy'),
    btnClear: $('btn-clear'),
    toast: $('toast'),
    unsupported: $('unsupported'),
  };

  /* ---------- Utilidades ---------- */
  const colorStyle = (c) => (c ? `--c:${c.hex};--glow:${c.glow || c.hex};--ink:${c.ink}` : '');
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const missingPositions = () => state.sequence.reduce((acc, id, i) => { if (!id) acc.push(i + 1); return acc; }, []);
  const sequenceNames = () => state.sequence.map((id) => COLOR_BY_ID[id].name);

  function joinPt(items) {
    if (items.length <= 1) return String(items[0] ?? '');
    return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
  }
  function missingMessage(miss, action) {
    return miss.length === 1
      ? `Preencha a posição ${miss[0]} ${action}.`
      : `Preencha as posições ${joinPt(miss)} ${action}.`;
  }
  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- Persistência ---------- */
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!data) return;
      if (Array.isArray(data.sequence) && data.sequence.length >= MIN_POSITIONS && data.sequence.length <= MAX_POSITIONS) {
        state.sequence = data.sequence.map((id) => (id && COLOR_BY_ID[id] ? id : null));
      }
      if (SPEEDS[data.speed]) state.speed = data.speed;
      if (typeof data.voiceURI === 'string') state.preferredVoiceURI = data.voiceURI;
    } catch (_) { /* ignora dados inválidos */ }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sequence: state.sequence,
        speed: state.speed,
        voiceURI: state.preferredVoiceURI,
      }));
    } catch (_) { /* armazenamento indisponível */ }
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(message, type = 'info', action = null) {
    clearTimeout(toastTimer);
    els.toast.className = `toast ${type}`;
    els.toast.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = message;
    els.toast.appendChild(text);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => { hideToast(); action.fn(); });
      els.toast.appendChild(btn);
    }
    void els.toast.offsetWidth;
    els.toast.classList.add('show');
    toastTimer = setTimeout(hideToast, action ? 5000 : 2800);
  }
  function hideToast() { els.toast.classList.remove('show'); }

  /* ---------- Renderização ---------- */
  function bottleSvg(empty) {
    return `<svg viewBox="0 0 40 100" aria-hidden="true">
      <rect class="cap" x="14" y="2" width="12" height="9" rx="2.5"/>
      <path class="glass" d="M16 11H24V24C24 29 35 31 35 40V89Q35 96 28 96H12Q5 96 5 89V40C5 31 16 29 16 24Z"/>
      ${empty
        ? '<text class="q" x="20" y="74">?</text>'
        : '<rect class="label-band" x="5" y="56" width="30" height="14"/><path class="shine" d="M10 44V84"/>'}
    </svg>`;
  }

  function renderPalette() {
    els.palette.innerHTML = COLORS.map((c, i) => `
      <button type="button" class="chip" id="chip-${c.id}" data-color="${c.id}" style="${colorStyle(c)}" title="${c.name} (tecla ${(i + 1) % 10})">
        <span class="chip-dot" aria-hidden="true"></span>
        <span class="chip-name">${c.name}</span>
        <kbd aria-hidden="true">${(i + 1) % 10}</kbd>
      </button>`).join('');
  }

  function renderBottles() {
    els.bottles.innerHTML = state.sequence.map((id, i) => {
      const c = id ? COLOR_BY_ID[id] : null;
      const cls = ['bottle', c ? '' : 'is-empty', i === state.active ? 'is-active' : ''].filter(Boolean).join(' ');
      return `<li class="${cls}" style="${colorStyle(c)};--i:${i}">
        <button type="button" class="bottle-btn" data-bottle="${i}" aria-label="Posição ${i + 1}: ${c ? c.name : 'vazia'}" title="${c ? c.name : 'Vazia'}">
          ${bottleSvg(!c)}
          <span class="bottle-num">${i + 1}</span>
        </button>
      </li>`;
    }).join('');
  }

  function renderSequenceText() {
    const words = state.sequence.map((id, i) => {
      const c = id ? COLOR_BY_ID[id] : null;
      const word = c
        ? `<span class="seq-word" data-word="${i}" style="${colorStyle(c)}">${c.name}</span>`
        : `<span class="seq-word is-missing" data-word="${i}">${i + 1}º ?</span>`;
      return (i ? '<span class="seq-arrow" aria-hidden="true">→</span>' : '') + word;
    });
    els.seqText.innerHTML = `<span class="seq-intro" data-word="intro">${INTRO_TEXT}…</span>${words.join('')}`;
  }

  const REMOVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function renderPositions() {
    const focusedIndex = document.activeElement?.dataset?.selectIndex;
    const options = COLORS.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
    els.positions.innerHTML = state.sequence.map((id, i) => {
      const c = id ? COLOR_BY_ID[id] : null;
      const cls = ['pos-row', c ? '' : 'is-empty', i === state.active ? 'is-active' : ''].filter(Boolean).join(' ');
      return `<li class="${cls}" data-index="${i}" style="${colorStyle(c)}">
        <span class="pos-num" aria-hidden="true">${i + 1}</span>
        <span class="pos-swatch" aria-hidden="true"></span>
        <div class="select-wrap">
          <select id="pos-select-${i}" data-select-index="${i}" aria-label="Cor da posição ${i + 1}">
            <option value="">Escolher cor…</option>${options}
          </select>
        </div>
        <button type="button" class="icon-btn" data-remove="${i}" aria-label="Remover posição ${i + 1}" title="Remover posição">${REMOVE_ICON}</button>
      </li>`;
    }).join('');
    els.positions.querySelectorAll('select').forEach((s, i) => { s.value = state.sequence[i] || ''; });
    if (focusedIndex != null) els.positions.querySelector(`[data-select-index="${focusedIndex}"]`)?.focus();
  }

  function renderCounters() {
    const n = state.sequence.length;
    els.posCount.textContent = n;
    els.btnRemovePos.disabled = n <= MIN_POSITIONS;
    els.btnAddPos.disabled = n >= MAX_POSITIONS;
    els.btnAddRow.disabled = n >= MAX_POSITIONS;
    els.activeLabel.textContent = state.active + 1;
  }

  function renderAll() {
    state.active = Math.min(state.active, state.sequence.length - 1);
    renderBottles();
    renderSequenceText();
    renderPositions();
    renderCounters();
    refreshIdleBadge();
  }

  function setBadge(text, mode) {
    els.badge.textContent = text;
    els.badge.className = `badge${mode ? ` is-${mode}` : ''}`;
  }
  function refreshIdleBadge() {
    if (state.playing) return;
    const miss = missingPositions().length;
    if (miss) setBadge(miss === 1 ? 'Falta 1 cor' : `Faltam ${miss} cores`, 'warn');
    else if (state.status === 'done') setBadge('Concluído', 'done');
    else setBadge('Pronto', 'ready');
  }

  function setActive(i) {
    state.active = Math.max(0, Math.min(i, state.sequence.length - 1));
    [...els.positions.children].forEach((r, idx) => r.classList.toggle('is-active', idx === state.active));
    [...els.bottles.children].forEach((b, idx) => b.classList.toggle('is-active', idx === state.active));
    els.activeLabel.textContent = state.active + 1;
  }

  function flagMissing(miss) {
    miss.forEach((n) => {
      els.positions.children[n - 1]?.classList.add('is-missing');
      els.bottles.children[n - 1]?.classList.add('is-missing');
    });
    setActive(miss[0] - 1);
    const row = els.positions.children[miss[0] - 1];
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ---------- Alterações na sequência ---------- */
  function beforeMutate() {
    // Garante que a fala nunca divirja da sequência exibida.
    if (state.playing) {
      stopAudio({ silent: true });
      toast('Áudio parado porque a sequência foi alterada.', 'info');
    }
    state.status = null;
  }
  function commit() { save(); renderAll(); }

  function undoAction(prevSequence, prevActive) {
    return {
      label: 'Desfazer',
      fn: () => {
        beforeMutate();
        state.sequence = prevSequence;
        state.active = prevActive;
        commit();
        toast('Sequência restaurada.', 'success');
      },
    };
  }

  function setColor(i, id, { advance = false } = {}) {
    beforeMutate();
    state.sequence[i] = id;
    state.active = advance && i < state.sequence.length - 1 ? i + 1 : i;
    commit();
    els.bottles.children[i]?.classList.add('pop');
  }

  function addPosition() {
    if (state.sequence.length >= MAX_POSITIONS) { toast(`Máximo de ${MAX_POSITIONS} posições.`, 'error'); return; }
    beforeMutate();
    state.sequence.push(null);
    state.active = state.sequence.length - 1;
    commit();
  }

  function removePosition(i = state.sequence.length - 1) {
    if (state.sequence.length <= MIN_POSITIONS) { toast('A sequência precisa de pelo menos 1 posição.', 'error'); return; }
    beforeMutate();
    state.sequence.splice(i, 1);
    if (state.active > i) state.active--;
    state.active = Math.min(state.active, state.sequence.length - 1);
    commit();
  }

  function clearSequence() {
    if (state.sequence.every((id) => !id)) { toast('A sequência já está vazia.'); return; }
    const prev = [...state.sequence];
    const prevActive = state.active;
    beforeMutate();
    state.sequence = state.sequence.map(() => null);
    state.active = 0;
    commit();
    toast('Sequência limpa. Toque nas cores para preencher.', 'info', undoAction(prev, prevActive));
  }

  function shuffleSequence() {
    const n = state.sequence.length;
    const prev = [...state.sequence];
    const prevActive = state.active;
    let next = prev;
    for (let attempt = 0; attempt < 8; attempt++) {
      next = n <= COLORS.length
        ? shuffleArray(COLORS.map((c) => c.id)).slice(0, n) // sem repetir quando possível
        : Array.from({ length: n }, () => COLORS[Math.floor(Math.random() * COLORS.length)].id);
      if (next.join() !== prev.join()) break;
    }
    beforeMutate();
    state.sequence = next;
    state.active = 0;
    commit();
    els.bottles.classList.remove('is-shuffling');
    void els.bottles.offsetWidth;
    els.bottles.classList.add('is-shuffling');
    toast('Sequência embaralhada.', 'success', undoAction(prev, prevActive));
  }

  async function copySequence() {
    const miss = missingPositions();
    if (miss.length) { flagMissing(miss); toast(missingMessage(miss, 'antes de copiar'), 'error'); return; }
    const text = sequenceNames().join(', ');
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (_) { /* tenta o método antigo */ }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove();
    }
    toast(ok ? `Copiado: ${text}` : 'Não foi possível copiar automaticamente.', ok ? 'success' : 'error');
  }

  /* ---------- Vozes ---------- */
  const FEMALE_RE = /(francisca|maria|luciana|thalita|brenda|el[zs]a|fernanda|giovanna|leila|let[ií]cia|manuela|yara|raquel|vit[oó]ria|camila|joana|catarina|helena|\bana\b|google portugu[eê]s)/i;
  const MALE_RE = /(ant[oô]nio|daniel|felipe|f[aá]bio|j[uú]lio|humberto|donato|nicolau|val[eé]rio|duarte|ricardo|cristiano|eduardo|macerio)/i;

  const normLang = (lang) => String(lang || '').replace('_', '-').toLowerCase();
  function voiceGender(v) {
    if (FEMALE_RE.test(v.name)) return 'feminina';
    if (MALE_RE.test(v.name)) return 'masculina';
    return '';
  }
  function voiceRegion(v) {
    const l = normLang(v.lang);
    if (l === 'pt-br') return 'Brasil';
    if (l === 'pt-pt') return 'Portugal';
    return v.lang;
  }
  function voiceName(v) {
    return v.name
      .replace(/^Microsoft\s+/i, '')
      .replace(/\s+Online\s*\(Natural\)/i, ' (natural)')
      .replace(/\s*-\s*Portugu[eê]s.*$/i, '')
      .replace(/\s*-\s*Portuguese.*$/i, '')
      .trim();
  }
  function voiceScore(v) {
    const l = normLang(v.lang);
    let s = l === 'pt-br' ? 100 : 40;
    if (/natural|neural|online|enhanced|premium/i.test(v.name)) s += 30;
    if (/google/i.test(v.name)) s += 20;
    if (/francisca|thalita|antonio|luciana|felipe/i.test(v.name)) s += 10;
    return s;
  }

  function loadVoices() {
    if (!synth) return;
    const all = synth.getVoices() || [];
    const pt = all.filter((v) => normLang(v.lang).startsWith('pt'));
    pt.sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
    state.voices = pt;

    if (!pt.length) {
      state.voiceURI = null;
      els.voiceSelect.innerHTML = '<option value="">Padrão do navegador (pt-BR)</option>';
      els.voiceSelect.disabled = true;
      els.voiceHint.textContent = all.length
        ? 'Nenhuma voz em português encontrada neste dispositivo. Instale uma voz "Português (Brasil)" nas configurações do sistema para melhor resultado.'
        : 'Carregando vozes do navegador…';
      return;
    }

    const chosen = pt.find((v) => v.voiceURI === state.preferredVoiceURI) || pt[0];
    state.voiceURI = chosen.voiceURI;
    els.voiceSelect.disabled = false;
    els.voiceSelect.innerHTML = pt.map((v, i) => {
      const g = voiceGender(v);
      const label = [voiceName(v), g, voiceRegion(v)].filter(Boolean).join(' · ');
      return `<option value="${i}">${escapeHtml(label)}</option>`;
    }).join('');
    els.voiceSelect.value = String(pt.indexOf(chosen));
    const br = pt.filter((v) => normLang(v.lang) === 'pt-br').length;
    els.voiceHint.textContent = br
      ? `${br} ${br === 1 ? 'voz disponível' : 'vozes disponíveis'} em português do Brasil.`
      : 'Só há vozes de Portugal neste dispositivo.';
  }

  const currentVoice = () => state.voices.find((v) => v.voiceURI === state.voiceURI) || null;

  /* ---------- Motor de fala ---------- */
  let session = 0;           // cada narração tem um id; trocar o id cancela a anterior
  const timers = new Set();
  let liveUtterance = null;  // referência evita bug do Chrome (onend não dispara após GC)

  function wait(ms) {
    return new Promise((resolve) => {
      const t = { resolve };
      t.id = setTimeout(() => { timers.delete(t); resolve(); }, ms);
      timers.add(t);
    });
  }
  function clearTimers() {
    timers.forEach((t) => { clearTimeout(t.id); t.resolve(); });
    timers.clear();
  }

  function speakOne(text, mySession) {
    return new Promise((resolve) => {
      if (mySession !== session) { resolve(false); return; }
      const u = new SpeechSynthesisUtterance(text);
      const voice = currentVoice();
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'pt-BR'; }
      u.rate = SPEEDS[state.speed].rate;
      u.pitch = 1;
      u.volume = 1;

      let finished = false;
      // Rede de segurança: se o navegador não disparar onend, segue em frente.
      const guard = setTimeout(() => finish(), 4000 + (text.length * 220) / u.rate);
      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(guard);
        if (liveUtterance === u) liveUtterance = null;
        resolve(mySession === session);
      }
      u.onend = finish;
      u.onerror = finish;

      liveUtterance = u;
      if (synth.paused) synth.resume();
      synth.speak(u);
    });
  }

  /**
   * Executa uma fila de falas, uma por vez, com pausas.
   * items: [{ text, mark, badge, pause: 'intro' | 'gap' | null }]
   */
  async function runQueue(items, { delay = 0, isSequence = true } = {}) {
    const my = ++session;
    setPlaying(true);
    if (delay) { await wait(delay); if (my !== session) return; }

    for (const item of items) {
      highlight(item.mark);
      setBadge(item.badge, 'playing');
      const ok = await speakOne(item.text, my);
      if (!ok || my !== session) return;
      if (item.pause) {
        await wait(SPEEDS[state.speed][item.pause]);
        if (my !== session) return;
      }
    }

    highlight(null);
    if (isSequence) { state.status = 'done'; state.hasPlayed = true; }
    setPlaying(false);
  }

  function prepareSpeech() {
    // Evita sobreposição: encerra qualquer fala anterior antes de começar.
    const needsCancel = state.playing || synth.speaking || synth.pending;
    if (state.playing) stopAudio({ silent: true });
    else if (needsCancel) synth.cancel();
    return needsCancel ? 150 : 0; // pequena folga após cancelar (Chrome)
  }

  function play({ restart = false } = {}) {
    if (!synth) { toast('Seu navegador não suporta narração por voz.', 'error'); return; }
    const miss = missingPositions();
    if (miss.length) {
      flagMissing(miss);
      toast(missingMessage(miss, 'antes de escutar'), 'error');
      return;
    }
    if (state.playing && !restart) { toast('O áudio já está tocando. Use “Parar” ou “Repetir”.'); return; }

    // Snapshot exato da sequência exibida na tela.
    const names = sequenceNames();
    const items = [
      { text: INTRO_TEXT, mark: 'intro', badge: 'Começando…', pause: 'intro' },
      ...names.map((name, i) => ({
        text: name,
        mark: i,
        badge: `${i + 1} de ${names.length}`,
        pause: i < names.length - 1 ? 'gap' : null,
      })),
    ];
    const delay = prepareSpeech();
    runQueue(items, { delay, isSequence: true });
  }

  function testVoice() {
    if (!synth) { toast('Seu navegador não suporta narração por voz.', 'error'); return; }
    const delay = prepareSpeech();
    runQueue([{ text: TEST_TEXT, mark: null, badge: 'Testando voz', pause: null }], { delay, isSequence: false });
  }

  function stopAudio({ silent = false } = {}) {
    const wasPlaying = state.playing;
    session++;
    clearTimers();
    if (synth) synth.cancel();
    highlight(null);
    setPlaying(false);
    if (!silent && wasPlaying) toast('Áudio interrompido.');
  }

  function setPlaying(on) {
    state.playing = on;
    document.body.classList.toggle('is-playing', on);
    [els.btnPlay, els.btnPlayMobile].forEach((b) => {
      b.classList.toggle('is-playing', on);
      b.querySelector('.btn-label').textContent = on ? 'Reproduzindo…' : 'Escutar áudio';
    });
    els.btnStop.disabled = !on;
    els.btnStopMobile.disabled = !on;
    els.btnReplay.hidden = !(state.hasPlayed && !on);
    if (!on) refreshIdleBadge();
  }

  function highlight(mark) {
    document.querySelectorAll('.is-speaking').forEach((el) => el.classList.remove('is-speaking'));
    if (mark === null || mark === undefined) return;
    if (mark === 'intro') {
      els.seqText.querySelector('[data-word="intro"]')?.classList.add('is-speaking');
      return;
    }
    els.bottles.children[mark]?.classList.add('is-speaking');
    els.positions.children[mark]?.classList.add('is-speaking');
    els.seqText.querySelector(`[data-word="${mark}"]`)?.classList.add('is-speaking');
  }

  function setSpeed(speed) {
    if (!SPEEDS[speed]) return;
    state.speed = speed;
    els.speed.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.speed === speed)));
    save();
  }

  /* ---------- Eventos ---------- */
  function bindEvents() {
    els.palette.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-color]');
      if (chip) setColor(state.active, chip.dataset.color, { advance: true });
    });

    els.positions.addEventListener('change', (e) => {
      const s = e.target.closest('select[data-select-index]');
      if (s) setColor(Number(s.dataset.selectIndex), s.value || null);
    });
    els.positions.addEventListener('focusin', (e) => {
      const s = e.target.closest('select[data-select-index]');
      if (s) setActive(Number(s.dataset.selectIndex));
    });
    els.positions.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-remove]');
      if (rm) { removePosition(Number(rm.dataset.remove)); return; }
      if (e.target.closest('select')) return;
      const row = e.target.closest('.pos-row');
      if (row) setActive(Number(row.dataset.index));
    });

    els.bottles.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bottle]');
      if (b) setActive(Number(b.dataset.bottle));
    });
    els.bottles.addEventListener('animationend', (e) => {
      if (e.target.closest('.bottle.pop')) e.target.closest('.bottle').classList.remove('pop');
    });

    els.btnAddPos.addEventListener('click', () => addPosition());
    els.btnAddRow.addEventListener('click', () => addPosition());
    els.btnRemovePos.addEventListener('click', () => removePosition());

    els.btnPlay.addEventListener('click', () => play());
    els.btnPlayMobile.addEventListener('click', () => play());
    els.btnRepeat.addEventListener('click', () => play({ restart: true }));
    els.btnReplay.addEventListener('click', () => play({ restart: true }));
    els.btnStop.addEventListener('click', () => stopAudio());
    els.btnStopMobile.addEventListener('click', () => stopAudio());

    els.speed.addEventListener('click', (e) => {
      const b = e.target.closest('[data-speed]');
      if (b) setSpeed(b.dataset.speed);
    });

    els.voiceSelect.addEventListener('change', () => {
      const v = state.voices[Number(els.voiceSelect.value)];
      if (!v) return;
      state.voiceURI = v.voiceURI;
      state.preferredVoiceURI = v.voiceURI;
      save();
    });
    els.btnTestVoice.addEventListener('click', testVoice);

    els.btnShuffle.addEventListener('click', shuffleSequence);
    els.btnCopy.addEventListener('click', copySequence);
    els.btnClear.addEventListener('click', clearSequence);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (state.playing) stopAudio(); return; }
      const tag = e.target.tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.code === 'Space' && tag !== 'BUTTON') {
        e.preventDefault();
        if (state.playing) stopAudio(); else play();
      } else if (/^[0-9]$/.test(e.key)) {
        const idx = e.key === '0' ? 9 : Number(e.key) - 1;
        setColor(state.active, COLORS[idx].id, { advance: true });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault(); setActive(state.active + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); setActive(state.active - 1);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.sequence[state.active]) { e.preventDefault(); setColor(state.active, null); }
      }
    });

    // Não deixa a fala continuar após sair/recarregar a página.
    window.addEventListener('pagehide', () => { if (synth) synth.cancel(); });
  }

  /* ---------- Início ---------- */
  function init() {
    load();
    renderPalette();
    renderAll();
    setSpeed(state.speed);
    bindEvents();

    if (!synth) {
      els.unsupported.hidden = false;
      els.voiceSelect.innerHTML = '<option>Indisponível</option>';
      els.voiceSelect.disabled = true;
      els.btnTestVoice.disabled = true;
    } else {
      synth.cancel(); // limpa fila antiga; nunca reproduz nada sozinho
      loadVoices();
      if ('onvoiceschanged' in synth) synth.onvoiceschanged = loadVoices;
      // Alguns navegadores (Safari) carregam vozes sem disparar o evento.
      let tries = 0;
      const poll = setInterval(() => {
        tries++;
        if (state.voices.length || tries > 20) { clearInterval(poll); if (!state.voices.length) loadVoices(); return; }
        loadVoices();
      }, 300);
    }
    setPlaying(false);
  }

  init();
})();
