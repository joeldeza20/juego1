(() => {
  'use strict';

  const LEVELS = [
    { name: 'PRIMER CONTACTO', goal: 300, time: 90, fall: 105, gap: 1.15 },
    { name: 'DESAFÍO ESCOLAR', goal: 650, time: 85, fall: 135, gap: .92 },
    { name: 'LLUVIA INTENSA', goal: 1000, time: 80, fall: 165, gap: .72 },
    { name: 'COMPETENCIA INSTITUCIONAL', goal: 1450, time: 75, fall: 195, gap: .58 },
    { name: 'EL GRAN RETO', goal: 2000, time: 70, fall: 230, gap: .48 }
  ];
  const SAVE_KEY = 'atlas-institutions-arcade-upload-v1';
  const $ = id => document.getElementById(id);

  const DEFAULT_INSTITUTIONS = [
    { id: 1, name: 'José Antonio Encinas', acronym: 'JAE', points: 150, active: true, imageSrc: './826bedacc490070c2c95ba4597b14b38.jpg' },
    { id: 2, name: 'Perú BIRF', acronym: 'BIRF', points: 160, active: true, imageSrc: './cc358b7d3d89295e07db52394d2e29d4.jpg' },
    { id: 3, name: 'San Martín', acronym: 'SM', points: 170, active: true, imageSrc: './san%20martin.jpg' },
    { id: 4, name: 'GCN 32', acronym: 'GCN', points: 180, active: true, imageSrc: './ca8ccb2601d5ca22aa9d229fa1daf27c.jpg' },
    { id: 5, name: 'INA 91 JIM', acronym: 'INA91', points: 190, active: true, imageSrc: './976a7d2229ab8c0ed3d0cfda68bebec4.jpg' },
    { id: 6, name: 'Politécnico Regional', acronym: 'PR', points: 200, active: true, imageSrc: './72eafe23cf8ce51e286052a3361ed4b2.jpg' }
  ];

  const makeBackgroundTrack = (base, second, duration = 2.4) => {
    const sampleRate = 22050;
    const totalSamples = Math.max(1, Math.round(sampleRate * duration));
    const buffer = new ArrayBuffer(44 + totalSamples * 2);
    const view = new DataView(buffer);
    const writeString = (offset, value) => {
      for (let index = 0; index < value.length; index++) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + totalSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, totalSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < totalSamples; i++) {
      const time = i / sampleRate;
      const envelope = Math.min(1, time / .06) * Math.max(0, 1 - (time / duration));
      const tone = Math.sin(Math.PI * 2 * (base + Math.sin(time * 3.3) * 12) * time) * .36 + Math.sin(Math.PI * 2 * second * time) * .18;
      const sample = Math.max(-1, Math.min(1, tone * envelope));
      view.setInt16(offset, sample * 32767, true);
      offset += 2;
    }

    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return `data:audio/wav;base64,${btoa(binary)}`;
  };

  const MUSIC_TRACKS = [
    makeBackgroundTrack(160, 220, 2.7),
    makeBackgroundTrack(190, 260, 2.8),
    makeBackgroundTrack(220, 300, 2.9)
  ];

  const canvas = $('arena');
  const ctx = canvas.getContext('2d');
  const backgroundMusic = $('background-music');
  const overlay = $('arena-overlay');
  const keys = new Set();
  const touch = { left: false, right: false };
  let saved = loadSave();
  let currentPlayer = saved.currentPlayer || null;
  let mode = 'intro';
  let gameFault = false;
  let levelIndex = 0;
  let run = null;
  let lastFrame = 0;
  let raf = 0;
  let spawnClock = 0;
  let audioEnabled = true;
  let audio;
  let lastTrackIndex = -1;
  let logoCache = [];
  let particles = [];
  let messageTimer = 0;
  let selectedAdminPlayer = null;

  function makeInstitutionLogo({ short, name, accent = '#00ffd5', bg = '#081f2e' }) {
    const safeText = value => String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    }[character]));
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120">
        <defs>
          <linearGradient id="g" x1="0" x2="1">
            <stop offset="0%" stop-color="${safeText(bg)}"/>
            <stop offset="100%" stop-color="#061827"/>
          </linearGradient>
        </defs>
        <rect width="220" height="120" rx="18" fill="url(#g)"/>
        <rect x="12" y="12" width="196" height="96" rx="16" fill="none" stroke="${safeText(accent)}" stroke-opacity="0.4"/>
        <circle cx="48" cy="60" r="26" fill="none" stroke="${safeText(accent)}" stroke-width="4"/>
        <path d="M36 60h24M48 48v24M26 41l44 38M70 41L26 79" stroke="${safeText(accent)}" stroke-width="3" stroke-linecap="round"/>
        <text x="88" y="55" fill="#eaf5ff" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="17" letter-spacing="2">${safeText(short)}</text>
        <text x="88" y="79" fill="#eaf5ff" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="8" letter-spacing="2">${safeText(name)}</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function loadSave() {
    try {
      const value = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      const institutions = Array.isArray(value.institutions)
        ? value.institutions.map(institution => {
          const legacyGcn = institution.id === 4 && institution.acronym === 'C32' && institution.name === 'Comercio 32';
          const savedInstitution = legacyGcn
            ? { ...institution, name: 'GCN 32', acronym: 'GCN' }
            : institution;
          const official = DEFAULT_INSTITUTIONS.find(item => item.id === savedInstitution.id);
          if (official && institution.imageSrc === placeholderFor(institution)) {
            return { ...savedInstitution, imageSrc: official.imageSrc };
          }
          return savedInstitution;
        })
        : DEFAULT_INSTITUTIONS.map(institution => ({ ...institution }));
      DEFAULT_INSTITUTIONS.forEach(institution => {
        if (!institutions.some(savedInstitution => savedInstitution.id === institution.id)) {
          institutions.push({ ...institution });
        }
      });
      return {
        institutions,
        players: value.players || [],
        participantId: Number(value.participantId) || 1,
        best: Math.max(0, Number(value.best) || 0),
        completed: Math.min(5, Math.max(0, Number(value.completed) || 0)),
        games: Math.max(0, Number(value.games) || 0),
        difficulty: 1,
        currentPlayer: value.currentPlayer || null,
        history: Array.isArray(value.history) ? value.history.slice(-10) : [],
        adminPass: value.adminPass || 'admin123'
      };
    } catch (error) {
      return {
        institutions: DEFAULT_INSTITUTIONS.map(i => ({ ...i })),
        players: [], participantId: 1, best: 0, completed: 0, games: 0, difficulty: 1, currentPlayer: null, history: [], adminPass: 'admin123'
      };
    }
  }

  function persist() {
    try {
      saved.currentPlayer = currentPlayer;
      localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
      updateHome();
    } catch (error) {}
  }

  function placeholderFor(institution) {
    return makeInstitutionLogo({
      short: institution.acronym,
      name: institution.name,
      accent: '#00ffd5',
      bg: '#0b1c2b'
    });
  }

  function initGameData() {
    saved.logos = saved.institutions.map(item => ({
      ...item,
      src: item.imageSrc || placeholderFor(item)
    }));
    if (!saved.logos.some(item => item.id === saved.participantId && item.active)) {
      const firstActive = saved.logos.find(item => item.active);
      saved.participantId = firstActive ? firstActive.id : 0;
    }
    refreshLogoCache();
    renderInstitutionSelect();
    updateHome();
    if (currentPlayer) {
      setCurrentPlayer(currentPlayer);
    }
  }

  function renderInstitutionSelect() {
    const select = $('institution-select');
    select.replaceChildren();
    saved.logos.filter(item => item.active !== false).forEach(item => {
      const option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = `${item.name} (${item.acronym})`;
      select.append(option);
    });
    select.value = String(saved.participantId || '');
    renderInstitutionGallery();
  }

  function renderInstitutionGallery() {
    const gallery = $('institution-gallery');
    gallery.replaceChildren();
    saved.logos.filter(item => item.active !== false).forEach(institution => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'institution-card';
      button.setAttribute('aria-pressed', String(institution.id === saved.participantId));
      button.setAttribute('aria-label', `Elegir ${institution.name}`);
      const image = document.createElement('img');
      image.src = institution.src;
      image.alt = `Logo de ${institution.name}`;
      const name = document.createElement('span');
      name.textContent = institution.name;
      button.append(image, name);
      button.addEventListener('click', () => {
        saved.participantId = institution.id;
        $('institution-select').value = String(institution.id);
        renderInstitutionGallery();
        persist();
      });
      gallery.append(button);
    });
  }

  function selectedInstitution() {
    return saved.logos.find(item => item.id === saved.participantId && item.active !== false);
  }

  function setCurrentPlayer(player) {
    currentPlayer = player;
    const forms = $('player-forms');
    const status = $('player-status');
    const profile = $('player-profile');
    const logout = $('logout-player');
    const select = $('institution-select');
    if (player) {
      select.disabled = false;
      forms.hidden = true;
      status.textContent = 'Sesión iniciada';
      profile.textContent = `Jugador: @${player.username}`;
      profile.hidden = false;
      logout.hidden = false;
      persist();
      return;
    }
    select.disabled = false;
    forms.hidden = false;
    status.textContent = 'Cuenta opcional · puedes jugar sin iniciar sesión';
    profile.hidden = true;
    logout.hidden = true;
  }

  function updateHome() {
    $('home-record').textContent = String(saved.best).padStart(4, '0');
    $('home-levels').textContent = `${String(saved.completed).padStart(2, '0')} / 05`;
    $('home-games').textContent = String(saved.games).padStart(2, '0');
    $('record-display').textContent = String(saved.best).padStart(4, '0');
  }

  function announce(message) {
    const node = $('toast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    node.classList.add('visible');
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => {
      node.classList.remove('visible');
      node.hidden = true;
    }, 3000);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(width / 960, 0, 0, height / 540, 0, 0);
  }

  function roundedRectPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function showOverlay({ symbol = 'A', eyebrow, title, description, extra = '', buttons = [] }) {
    $('modal-symbol').textContent = symbol;
    $('modal-eyebrow').textContent = eyebrow;
    $('modal-title').textContent = title;
    $('modal-description').textContent = description;
    $('modal-extra').textContent = extra;
    $('modal-extra').className = 'modal-extra';
    const actions = $('modal-actions');
    actions.replaceChildren();
    buttons.forEach(({ label, primary = false, action }) => {
      const button = document.createElement('button');
      button.className = primary ? 'primary-button' : 'secondary-button';
      button.textContent = label;
      button.addEventListener('click', action);
      actions.append(button);
    });
    overlay.hidden = false;
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function beginRun() {
    if (!selectedInstitution()) {
      announce('Selecciona una institución activa.');
      return;
    }
    levelIndex = 0;
    saved.games++;
    persist();
    startBackgroundMusic();
    startLevel();
  }

  function startBackgroundMusic() {
    if (!audioEnabled) return;
    const choices = MUSIC_TRACKS.map((_, index) => index).filter(index => index !== lastTrackIndex);
    lastTrackIndex = choices[Math.floor(Math.random() * choices.length)] ?? 0;
    backgroundMusic.src = MUSIC_TRACKS[lastTrackIndex];
    backgroundMusic.currentTime = 0;
    backgroundMusic.play().catch(() => {});
  }

  function resumeBackgroundMusic() {
    if (!audioEnabled || !backgroundMusic.src) return;
    backgroundMusic.play().catch(() => {});
  }

  function startLevel() {
    const spec = LEVELS[levelIndex];
    spawnClock = 0;
    gameFault = false;
    run = {
      score: levelIndex === 0 ? 0 : run.score,
      lives: levelIndex === 0 ? 3 : run.lives,
      time: spec.time,
      player: { x: 480, y: 493, w: 118, h: 16 },
      items: [],
      combo: 0,
      multiplier: 1,
      shield: 0,
      turbo: 0,
      freeze: 0,
      magnet: 0,
      wide: 0,
      elapsed: 0,
      spawn: 0,
      paused: false,
      levelStartScore: levelIndex === 0 ? 0 : run.score
    };
    mode = 'game';
    $('intro-panel').hidden = true;
    $('bottom-row').hidden = true;
    $('game-section').classList.add('active');
    $('level-name').textContent = spec.name;
    $('participant-display').textContent = selectedInstitution()?.acronym || '—';
    hideOverlay();
    $('arena').focus({ preventScroll: true });
    resumeBackgroundMusic();
    updateHud();
    playTone(480, .1);
    resizeCanvas();
    draw();
    startLoop();
  }

  function showIntro() {
    backgroundMusic.pause();
    mode = 'intro';
    run = null;
    gameFault = false;
    stopLoop();
    $('intro-panel').hidden = false;
    $('bottom-row').hidden = false;
    $('game-section').classList.remove('active');
    hideOverlay();
    updateHome();
  }

  function startLoop() {
    if (!raf) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    try {
      const dt = Math.min(.035, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      if (mode === 'game' && run && !gameFault && !run.paused && overlay.hidden) update(dt);
      if (mode === 'game' && run && !gameFault) draw();
    } catch (error) {
      gameFault = true;
      if (run) run.paused = true;
      backgroundMusic.pause();
    }
  }

  function update(dt) {
    const spec = LEVELS[levelIndex];
    const player = run.player;
    const moveLeft = keys.has('ArrowLeft') || keys.has('KeyA') || touch.left;
    const moveRight = keys.has('ArrowRight') || keys.has('KeyD') || touch.right;
    const speed = (run.turbo > 0 ? 560 : 420) * saved.difficulty;
    player.x += ((moveRight ? 1 : 0) - (moveLeft ? 1 : 0)) * speed * dt;
    player.x = Math.max(65, Math.min(895, player.x));
    run.elapsed += dt;
    run.time = Math.max(0, run.time - dt);
    run.shield = Math.max(0, run.shield - dt);
    run.turbo = Math.max(0, run.turbo - dt);
    run.freeze = Math.max(0, run.freeze - dt);
    run.magnet = Math.max(0, run.magnet - dt);
    run.wide = Math.max(0, run.wide - dt);
    player.w = run.wide > 0 ? 190 : 118;
    run.multiplier = run.multiplier > 1 && run.elapsed % 8 < dt ? run.multiplier - 1 : run.multiplier;
    spawnClock += dt;
    const interval = Math.max(.23, spec.gap / saved.difficulty);
    if (spawnClock >= interval) {
      spawnClock = 0;
      spawnItem();
      if (levelIndex >= 2 && Math.random() < .18) spawnItem();
    }
    for (let i = run.items.length - 1; i >= 0; i--) {
      const item = run.items[i];
      item.y += (item.speed || spec.fall * saved.difficulty) * (run.freeze > 0 ? .35 : 1) * dt;
      item.x += Math.sin(run.elapsed * 2 + item.seed) * item.drift * dt;
      if (run.magnet > 0 && item.type === 'logo' && item.logo.id === saved.participantId) {
        item.x += Math.sign(player.x - item.x) * Math.min(115 * dt, Math.abs(player.x - item.x));
      }
      item.rotation += item.spin * dt;
      if (item.y + item.size / 2 >= player.y && item.y - item.size / 2 <= player.y + player.h &&
          item.x + item.size / 2 > player.x - player.w / 2 && item.x - item.size / 2 < player.x + player.w / 2) {
        const pulse = item.type === 'pulse';
        collectItem(item);
        if (pulse && mode === 'game') {
          run.items = run.items.filter(falling => falling !== item && falling.type !== 'corrupt');
          break;
        }
        run.items.splice(i, 1);
        if (mode !== 'game') return;
        continue;
      }
      if (item.y - item.size / 2 > 540) {
        run.items.splice(i, 1);
        if (item.type === 'logo' && item.logo.id === saved.participantId) {
          run.combo = 0;
          loseLife('LOGOTIPO PERDIDO');
          if (mode !== 'game') return;
        }
      }
    }
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 110 * dt; p.life -= dt; });
    particles = particles.filter(p => p.life > 0);
    if (run.time <= 0) {
      if (run.score >= spec.goal) completeLevel();
      else finishRun(false, 'Se acabó el tiempo. ¡Inténtalo otra vez!');
      return;
    }
    if (run.score - run.levelStartScore >= spec.goal) completeLevel();
    updateHud();
  }

  function spawnItem() {
    const logos = saved.logos.filter(logo => logo.active !== false);
    const dangerChance = Math.min(.24, .08 + levelIndex * .035);
    const specialChance = .2 + levelIndex * .025;
    const roll = Math.random();
    let type = roll < dangerChance ? 'corrupt' : roll < dangerChance + specialChance ? chooseSpecial() : 'logo';
    let logo = null;
    if (type === 'logo') {
      if (!logos.length) return;
      logo = logos[Math.floor(Math.random() * logos.length)];
      const cached = logoCache.find(entry => entry.src === logo.src);
      if (!cached || !cached.image.complete || !cached.image.naturalWidth) return;
      logo = { ...logo, image: cached.image };
    }
    run.items.push({
      type, logo, x: 50 + Math.random() * 860, y: -30,
      size: type === 'logo' ? 58 : 36,
      speed: LEVELS[levelIndex].fall * saved.difficulty * (type === 'logo' ? .85 + Math.random() * .5 : 1.04),
      drift: type === 'logo' ? 10 + Math.random() * 18 : 6,
      rotation: 0, spin: (Math.random() - .5) * .55, seed: Math.random() * 10
    });
  }

  function chooseSpecial() {
    const choices = ['star', 'shield', 'turbo', 'multiplier', 'freeze', 'magnet', 'wide', 'pulse'];
    if (run.lives < 3 && Math.random() < .23) choices.push('heart');
    return choices[Math.floor(Math.random() * choices.length)];
  }

  function collectItem(item) {
    const x = item.x, y = item.y;
    let points = 0;
    if (item.type === 'logo') {
      if (item.logo.id !== saved.participantId) {
        run.combo = 0;
        addParticles(x, y, '#ff386b', 18);
        loseLife(`LOGO INCORRECTO · ${item.logo.name}`);
        return;
      }
      run.combo++;
      const comboMultiplier = Math.min(5, 1 + Math.floor((run.combo - 1) / 3));
      points = (Number(item.logo.points) || 100) * comboMultiplier * run.multiplier;
      addParticles(x, y, '#00ffd5', 14);
      playTone(700 + Math.min(run.combo, 8) * 55, .08);
      if (run.combo >= 3) $('combo-display').textContent = `COMBO ×${comboMultiplier}`;
    } else if (item.type === 'corrupt') {
      run.combo = 0;
      addParticles(x, y, '#ff386b', 15);
      if (run.shield > 0) {
        run.shield = 0;
        $('combo-display').textContent = 'ESCUDO ACTIVADO';
        playTone(370, .13);
        updateHud();
        return;
      }
      loseLife('OBJETO CORRUPTO');
      return;
    } else {
      const effects = {
        star: () => { points = 250; $('combo-display').textContent = 'ESTRELLA ATLAS +250'; },
        shield: () => { run.shield = 8; $('combo-display').textContent = 'ESCUDO DIGITAL'; },
        turbo: () => { run.turbo = 7; $('combo-display').textContent = 'TURBO ACTIVADO'; },
        multiplier: () => { run.multiplier = Math.min(3, run.multiplier + 1); $('combo-display').textContent = `MULTIPLICADOR ×${run.multiplier}`; },
        heart: () => { run.lives = Math.min(3, run.lives + 1); $('combo-display').textContent = 'VIDA RECUPERADA'; },
        freeze: () => { run.freeze = 6; $('combo-display').textContent = 'CONGELACIÓN · 6 S'; },
        magnet: () => { run.magnet = 8; $('combo-display').textContent = 'IMÁN DE LOGOS · 8 S'; },
        wide: () => { run.wide = 8; $('combo-display').textContent = 'RECOLECTOR AMPLIADO · 8 S'; },
        pulse: () => {
          const cleared = run.items.filter(falling => falling.type === 'corrupt').length;
          points = cleared * 50;
          $('combo-display').textContent = 'PULSO DE LIMPIEZA';
        }
      };
      effects[item.type]();
      addParticles(x, y, item.type === 'star' ? '#ffd166' : '#00a6ff', 16);
      playTone(980, .14);
    }
    if (points) {
      run.score += points;
      if (run.score > saved.best) saved.best = run.score;
      persist();
    }
    updateHud();
  }

  function loseLife(reason) {
    if (run.shield > 0) {
      run.shield = 0;
      $('combo-display').textContent = 'ESCUDO ACTIVADO';
      return;
    }
    run.lives--;
    run.combo = 0;
    $('combo-display').textContent = reason;
    playTone(135, .23, 'sawtooth');
    if (run.lives <= 0) {
      const message = reason === 'OBJETO CORRUPTO'
        ? 'El objeto corrupto acabó con tus vidas.'
        : reason.startsWith('LOGO INCORRECTO')
          ? 'Atrapar logos de otras instituciones consume vidas. ¡Se acabaron tus vidas!'
          : 'Perdiste tus vidas. ¡Prueba otra vez!';
      finishRun(false, message);
    }
    updateHud();
  }

  function completeLevel() {
    saved.completed = Math.max(saved.completed, levelIndex + 1);
    persist();
    playTone(990, .2);
    if (levelIndex === LEVELS.length - 1) {
      finishRun(true, '¡Has superado los cinco niveles! Eres el gran reto escolar.');
      return;
    }
    run.paused = true;
    backgroundMusic.pause();
    showOverlay({
      symbol: '✦', eyebrow: `NIVEL 0${levelIndex + 1} COMPLETADO`,
      title: '¡Buen trabajo!', description: `${LEVELS[levelIndex].name}: objetivo alcanzado.`,
      extra: `PUNTOS ${run.score}  ·  SIGUIENTE: ${LEVELS[levelIndex + 1].name}`,
      buttons: [{ label: 'SIGUIENTE NIVEL →', primary: true, action: () => { levelIndex++; startLevel(); } }]
    });
  }

  function finishRun(won, message) {
    mode = 'result';
    backgroundMusic.pause();
    if (run.score > saved.best) saved.best = run.score;
    saved.history.push({ score: run.score, level: levelIndex + 1, won, date: new Date().toLocaleDateString('es-PE') });
    saved.history = saved.history.slice(-10);

    if (currentPlayer) {
      const p = saved.players.find(x => x.username === currentPlayer.username);
      if (p) {
        p.gamesCount = (p.gamesCount || 0) + 1;
        if (run.score > (p.record || 0)) p.record = run.score;
        p.history = p.history || [];
        p.history.push({ score: run.score, level: levelIndex + 1, won, date: new Date().toLocaleString() });
      }
    }

    persist();
    playTone(won ? 1000 : 125, .24, won ? 'sine' : 'sawtooth');
    showOverlay({
      symbol: won ? '✦' : '×', eyebrow: won ? 'MISIÓN COMPLETADA' : 'PARTIDA FINALIZADA',
      title: won ? '¡Increíble, campeón!' : 'GAME OVER',
      description: message,
      extra: `PUNTOS ${run.score}  ·  RÉCORD ${saved.best}`,
      buttons: [
        { label: 'REINICIAR PARTIDA', primary: true, action: () => { mode = 'game'; beginRun(); } },
        { label: 'MENÚ PRINCIPAL', action: showIntro }
      ]
    });
  }

  function updateHud() {
    if (!run) return;
    const spec = LEVELS[levelIndex];
    $('score-display').textContent = String(run.score).padStart(4, '0');
    $('level-display').textContent = String(levelIndex + 1).padStart(2, '0');
    $('record-display').textContent = String(saved.best).padStart(4, '0');
    $('time-display').textContent = `${String(Math.floor(run.time / 60)).padStart(2, '0')}:${String(Math.ceil(run.time % 60)).padStart(2, '0')}`;
    $('lives-display').textContent = `${'♥ '.repeat(run.lives)}${'♡ '.repeat(3 - run.lives)}`.trim();
    $('progress-fill').style.width = `${Math.min(100, Math.max(0, ((run.score - run.levelStartScore) / spec.goal) * 100))}%`;
    renderPowerBelt();
  }

  function renderPowerBelt() {
    const powers = [
      ['shield', 'ESCUDO', run.shield],
      ['turbo', 'TURBO', run.turbo],
      ['freeze', 'CONGELAR', run.freeze],
      ['magnet', 'IMÁN', run.magnet],
      ['wide', 'RECOLECTOR +', run.wide],
      ['multiplier', `×${run.multiplier}`, run.multiplier > 1 ? 1 : 0]
    ];
    const belt = $('power-belt');
    belt.replaceChildren();
    powers.filter(([, , seconds]) => seconds > 0).forEach(([name, label, seconds]) => {
      const chip = document.createElement('span');
      chip.className = 'power-chip active';
      chip.textContent = `${label}${seconds > 1 ? ` · ${Math.ceil(seconds)}s` : ''}`;
      belt.append(chip);
    });
  }

  function addParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 150;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, life: .35 + Math.random() * .55, maxLife: .9, size: 2 + Math.random() * 3 });
    }
  }

  function draw() {
    resizeCanvas();
    const gradient = ctx.createLinearGradient(0, 0, 0, 540);
    gradient.addColorStop(0, '#071827');
    gradient.addColorStop(1, '#050d17');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 960, 540);
    ctx.strokeStyle = '#00a6ff0b';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 960; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 540); ctx.stroke(); }
    for (let y = 0; y <= 540; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(960, y); ctx.stroke(); }
    for (let i = 0; i < 20; i++) {
      const x = (i * 73 + performance.now() * .009) % 960;
      const y = (i * 113 + performance.now() * .016) % 490;
      ctx.fillStyle = i % 3 === 0 ? '#00ffd54f' : '#00a6ff35';
      ctx.fillRect(x, y, 2, 2);
    }
    if (run) {
      run.items.forEach(drawItem);
      drawCollector();
      particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      });
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#00ffd50d';
      ctx.fillRect(0, 526, 960, 14);
    } else {
      drawIdleLogo();
    }
  }

  function drawItem(item) {
    if (item.type === 'logo' && (!item.logo.image.complete || !item.logo.image.naturalWidth || !item.logo.image.naturalHeight)) return;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation);
    if (item.type === 'logo') {
      const image = item.logo.image;
      const selected = item.logo.id === saved.participantId;
      const color = selected ? '#00ffd5' : '#ff386b';
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#081a27';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      roundedRectPath(ctx, -31, -27, 62, 54, 8);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      const ratio = Math.min(46 / image.naturalWidth, 38 / image.naturalHeight);
      const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio;
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      if (!selected) {
        ctx.fillStyle = '#ff386b';
        ctx.font = 'bold 7px "DM Mono",monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('PELIGRO', 0, 26);
      }
    } else {
      const colors = { star: '#ffd166', shield: '#00a6ff', turbo: '#00ffd5', multiplier: '#a788ff', heart: '#ff668b', freeze: '#73d9ff', magnet: '#ff9b54', wide: '#8effa8', pulse: '#f783ff', corrupt: '#ff386b' };
      const icons = { star: '✦', shield: '⬡', turbo: '⚡', multiplier: '×2', heart: '♥', freeze: '❄', magnet: '↝', wide: '↔', pulse: '◎', corrupt: '!' };
      const color = colors[item.type];
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#081521';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, item.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.font = `bold ${['multiplier', 'magnet', 'wide', 'pulse'].includes(item.type) ? 14 : 21}px "Space Grotesk",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icons[item.type], 0, 1);
    }
    ctx.restore();
  }

  function drawCollector() {
    const p = run.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    const color = run.shield > 0 ? '#00a6ff' : run.magnet > 0 ? '#ff9b54' : run.freeze > 0 ? '#73d9ff' : '#00ffd5';
    ctx.shadowColor = color;
    ctx.shadowBlur = 19;
    ctx.fillStyle = '#061d25';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    roundedRectPath(ctx, -p.w / 2, 0, p.w, p.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillRect(-p.w / 2 + 10, 4, p.w - 20, 2);
    ctx.beginPath();
    ctx.moveTo(-p.w / 2 + 13, 16);
    ctx.lineTo(-p.w / 2 + 23, 24);
    ctx.lineTo(p.w / 2 - 23, 24);
    ctx.lineTo(p.w / 2 - 13, 16);
    ctx.stroke();
    if (run.shield > 0) {
      ctx.strokeStyle = '#00a6ff80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 10, 78, 35, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawIdleLogo() {
    const logos = saved.logos.filter(logo => logo.active !== false);
    if (!logos.length) return;
    const entry = logoCache.find(item => item.src === logos[0].src);
    if (!entry || !entry.image.complete) return;
    const image = entry.image;
    const scale = Math.min(100 / image.naturalWidth, 72 / image.naturalHeight);
    ctx.shadowColor = '#00ffd5';
    ctx.shadowBlur = 20;
    ctx.drawImage(image, 480 - image.naturalWidth * scale / 2, 240 - image.naturalHeight * scale / 2, image.naturalWidth * scale, image.naturalHeight * scale);
    ctx.shadowBlur = 0;
  }

  function pauseGame() {
    if (mode !== 'game' || !run || run.paused) return;
    run.paused = true;
    backgroundMusic.pause();
    showOverlay({
      symbol: 'Ⅱ', eyebrow: 'PARTIDA EN PAUSA', title: 'Tómate un respiro',
      description: 'Tu progreso en este nivel se conserva mientras estás en pausa.',
      buttons: [{ label: 'CONTINUAR', primary: true, action: () => { run.paused = false; hideOverlay(); resumeBackgroundMusic(); canvas.focus({ preventScroll: true }); } }, { label: 'SALIR', action: showIntro }]
    });
  }

  function refreshLogoCache() {
    logoCache = saved.logos.map(logo => {
      const image = new Image();
      image.src = logo.src;
      return { src: logo.src, image };
    });
  }

  function playTone(frequency, duration, type = 'sine') {
    if (!audioEnabled) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      gain.gain.setValueAtTime(.035, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + duration);
    } catch (error) {}
  }

  /* SISTEMA DE REGISTRO / LOGIN DE JUGADORES SIMPLIFICADO */
  $('player-register-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const username = form.elements.username.value.trim().toLowerCase();
    const password = form.elements.password.value;

    if (saved.players.some(p => p.username === username)) {
      announce('El usuario ya existe. Inicia sesión directamente.');
      return;
    }

    const newPlayer = {
      username, password,
      record: 0, gamesCount: 0, history: [],
      created_at: new Date().toLocaleDateString('es-PE')
    };

    saved.players.push(newPlayer);
    setCurrentPlayer(newPlayer);
    form.reset();
    announce(`¡Cuenta creada con éxito, @${username}!`);
  });

  $('player-login-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const username = form.elements.username.value.trim().toLowerCase();
    const password = form.elements.password.value;

    const player = saved.players.find(p => p.username === username && p.password === password);
    if (!player) {
      announce('Usuario o contraseña incorrectos.');
      return;
    }

    setCurrentPlayer(player);
    form.reset();
    announce(`¡Bienvenido de nuevo, @${player.username}!`);
  });

  $('logout-player').addEventListener('click', () => {
    setCurrentPlayer(null);
    announce('Sesión cerrada.');
  });

  /* LÓGICA DE PANEL ADMINISTRATIVO */
  $('open-admin-button').addEventListener('click', () => {
    $('admin-modal-backdrop').hidden = false;
  });

  $('close-admin-modal').addEventListener('click', () => {
    $('admin-modal-backdrop').hidden = true;
  });

  $('admin-login-form').addEventListener('submit', event => {
    event.preventDefault();
    const pass = $('admin-pass-input').value;
    if (pass === saved.adminPass) {
      $('admin-auth-section').hidden = true;
      $('admin-dashboard-section').hidden = false;
      renderAdminInstitutions();
      renderAdminPlayers();
    } else {
      announce('Contraseña de administrador incorrecta.');
    }
  });

  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      $(`admin-tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  function renderAdminInstitutions() {
    const list = $('admin-inst-list');
    list.replaceChildren();
    saved.institutions.forEach(inst => {
      const row = document.createElement('div');
      row.className = 'admin-institution-row';
      row.innerHTML = `
        <img src="${inst.imageSrc}" alt="Logo">
        <span><b>${inst.acronym}</b> - ${inst.name}</span>
        <span>${inst.points} PTS</span>
        <span style="color:${inst.active !== false ? '#00ffd5' : '#ff386b'}">${inst.active !== false ? 'ACTIVA' : 'INACTIVA'}</span>
        <button class="secondary-button edit-btn">EDITAR</button>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => {
        const form = $('admin-inst-form');
        form.elements.id.value = inst.id;
        form.elements.name.value = inst.name;
        form.elements.acronym.value = inst.acronym;
        form.elements.points.value = inst.points;
        form.elements.active.value = inst.active !== false ? '1' : '0';
        $('admin-inst-submit').textContent = 'GUARDAR CAMBIOS';
        $('admin-inst-cancel').hidden = false;
      });
      list.append(row);
    });
  }

  $('admin-inst-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.elements.id.value;
    const name = form.elements.name.value.trim();
    const acronym = form.elements.acronym.value.trim();
    const points = Number(form.elements.points.value);
    const active = form.elements.active.value === '1';
    const fileInput = form.elements.logo_file;

    const processSave = (imageSrc) => {
      if (id) {
        const inst = saved.institutions.find(x => String(x.id) === String(id));
        if (inst) {
          inst.name = name;
          inst.acronym = acronym;
          inst.points = points;
          inst.active = active;
          if (imageSrc) inst.imageSrc = imageSrc;
        }
      } else {
        const newId = saved.institutions.length ? Math.max(...saved.institutions.map(x => x.id)) + 1 : 1;
        saved.institutions.push({
          id: newId, name, acronym, points, active,
          imageSrc: imageSrc || placeholderFor({ name, acronym })
        });
      }
      resetAdminInstForm();
      initGameData();
      renderAdminInstitutions();
      persist();
      announce('Institución guardada correctamente.');
    };

    if (fileInput.files && fileInput.files[0]) {
      const reader = new FileReader();
      reader.onload = e => processSave(e.target.result);
      reader.readAsDataURL(fileInput.files[0]);
    } else {
      processSave(null);
    }
  });

  function resetAdminInstForm() {
    const form = $('admin-inst-form');
    form.reset();
    form.elements.id.value = '';
    $('admin-inst-submit').textContent = 'GUARDAR INSTITUCIÓN';
    $('admin-inst-cancel').hidden = true;
  }

  $('admin-inst-cancel').addEventListener('click', resetAdminInstForm);

  function renderAdminPlayers() {
    const table = $('admin-players-table');
    table.replaceChildren();
    if (!saved.players.length) {
      table.innerHTML = '<tr><td colspan="3">No hay jugadores registrados.</td></tr>';
      return;
    }
    saved.players.forEach(p => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><b>@${p.username}</b></td>
        <td>${p.gamesCount || 0}</td>
        <td>${p.record || 0}</td>
      `;
      row.addEventListener('click', () => {
        selectedAdminPlayer = p;
        $('admin-player-details').innerHTML = `
          <p><strong>Usuario:</strong> @${p.username}</p>
          <p><strong>Partidas jugadas:</strong> ${p.gamesCount || 0}</p>
          <p><strong>Mejor récord:</strong> ${p.record || 0}</p>
          <p><strong>Registrado:</strong> ${p.created_at}</p>
        `;
        $('admin-reset-pass-form').hidden = false;
      });
      table.append(row);
    });
  }

  $('admin-reset-pass-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!selectedAdminPlayer) return;
    const newPass = event.currentTarget.elements.new_password.value;
    selectedAdminPlayer.password = newPass;
    persist();
    event.currentTarget.reset();
    announce(`Contraseña actualizada para @${selectedAdminPlayer.username}.`);
  });

  /* EVENTOS GENERALES */
  $('start-button').addEventListener('click', beginRun);
  $('instructions-button').addEventListener('click', () => {
    showOverlay({
      symbol: '⌖', eyebrow: 'CONTROLES', title: '¿Cómo se juega?',
      description: 'Muévete con las flechas ← / → o desliza tu dedo en la pantalla del celular. Atrapa el logo de tu institución elegida y esquiva los demás y los obstáculos.',
      buttons: [{ label: '¡ENTENDIDO!', primary: true, action: hideOverlay }]
    });
  });
  $('credits-button').addEventListener('click', () => {
    showOverlay({
      symbol: 'A', eyebrow: 'CRÉDITOS', title: 'ATLAS INTERACTIVE STUDIOS',
      description: 'Un proyecto arcade escolar original. Diseñado para celebrar las instituciones educativas.',
      extra: 'INNOVATION IN EVERY GAME.',
      buttons: [{ label: 'CERRAR', primary: true, action: hideOverlay }]
    });
  });
  $('pause-button').addEventListener('click', pauseGame);
  $('quit-button').addEventListener('click', showIntro);
  $('institution-select').addEventListener('change', event => {
    saved.participantId = Number(event.currentTarget.value) || 0;
    renderInstitutionGallery();
    persist();
  });

  $('sound-button').addEventListener('click', event => {
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      if (mode === 'game' && run && !run.paused && overlay.hidden) resumeBackgroundMusic();
    } else {
      backgroundMusic.pause();
    }
    event.currentTarget.textContent = audioEnabled ? '♫' : '♪';
  });

  $('fullscreen-button').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (e) {}
  });

  document.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    if (event.code === 'Escape' && mode === 'game') {
      if (overlay.hidden) pauseGame();
      else if (run && run.paused && !gameFault) { run.paused = false; hideOverlay(); }
      return;
    }
    if (event.code === 'Space' && mode !== 'game') { beginRun(); return; }
    keys.add(event.code);
  });
  document.addEventListener('keyup', event => keys.delete(event.code));

  document.querySelectorAll('[data-move]').forEach(button => {
    const direction = button.dataset.move;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
      touch[direction] = true;
    });
    const stop = event => {
      event.preventDefault();
      touch[direction] = false;
    };
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
  });

  let activeCanvasPointer = null;
  canvas.addEventListener('pointerdown', event => {
    if (mode !== 'game' || !run) return;
    activeCanvasPointer = event.pointerId;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    moveCollector(event);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId === activeCanvasPointer && mode === 'game' && run) moveCollector(event);
  });
  const stopCanvasPointer = event => {
    if (event.pointerId === activeCanvasPointer) activeCanvasPointer = null;
  };
  canvas.addEventListener('pointerup', stopCanvasPointer);
  canvas.addEventListener('pointercancel', stopCanvasPointer);
  canvas.addEventListener('lostpointercapture', stopCanvasPointer);
  function moveCollector(event) {
    const rect = canvas.getBoundingClientRect();
    run.player.x = Math.max(65, Math.min(895, ((event.clientX - rect.left) / rect.width) * 960));
  }

  window.addEventListener('blur', () => { keys.clear(); touch.left = touch.right = false; if (mode === 'game' && run && !run.paused) pauseGame(); });
  window.addEventListener('resize', resizeCanvas);

  initGameData();
  resizeCanvas();
})();