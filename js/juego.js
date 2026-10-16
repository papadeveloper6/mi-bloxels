'use strict';

// Motor de plataformas: convierte los niveles en un mundo jugable
const Juego = (() => {
  const T = 48;            // píxeles por bloque
  const PASO = 1 / 120;    // paso fijo de física
  const SOLIDOS = new Set(['G', 'R', 'O', 'W', '#']);
  const F = { grav: 42, gravAgua: 10, salto: 15.5, saltoAgua: 7, vel: 6.5, caidaMax: 20, caidaAgua: 3.5 };
  const TONOS = {
    G: ['#43b047', '#7ddc6f', '#2a7a2d'],
    R: ['#e53935', '#ff7b72', '#9c1f1c'],
    O: ['#fb8c00', '#ffb74d', '#b85e00'],
    W: ['#eeeeee', '#ffffff', '#b0b0b0'],
  };

  let lienzo, ctx, def = null, alSalir = null, activo = false, pausa = false, conSonido = true;
  let mapa, W, H, VW, VH, historias, enemigos, particulas, jugador, seguro, tiempoSeguro;
  let monedas, totalMonedas, vidas, estado, tiempo = 0, camX = 0, camY = 0;
  let teclas = {}, bufferSalto = 0, raf = 0, ultimo = 0, acum = 0, historiaTiempo = 0;
  let audio = null, hudTexto = '', mechas = new Map(), sprite = null, medida = '';

  // ---------- Interfaz ----------
  function iniciarUI() {
    lienzo = $('#juego-lienzo');
    ctx = lienzo.getContext('2d');
    window.addEventListener('keydown', e => {
      if (!activo) return;
      const salto = e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
      if (salto || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'Escape') { salir(); return; }
      if (e.code === 'KeyP' && estado === 'jugando') { alternarPausa(); return; }
      if ((e.code === 'Enter') && estado !== 'jugando') { empezar(); return; }
      teclas[e.code] = true;
      if (salto && !e.repeat) bufferSalto = 0.15;
    });
    window.addEventListener('keyup', e => { teclas[e.code] = false; });
    window.addEventListener('blur', () => { teclas = {}; });
    window.addEventListener('resize', ajustar);
    window.addEventListener('keydown', desbloquearAudio);
    // Si la app pasa a segundo plano (botón de inicio del iPad, llamada...), se pausa
    document.addEventListener('visibilitychange', () => {
      teclas = {};
      if (document.hidden && activo && estado === 'jugando' && !pausa) alternarPausa();
    });
    $('#juego-salir').onclick = salir;
    $('#juego-volver').onclick = salir;
    $('#juego-otra').onclick = empezar;
    $('#juego-pausar').onclick = () => { if (estado === 'jugando') alternarPausa(); };
    $('#juego-pausa').onclick = () => { if (pausa) alternarPausa(); };
    $('#juego-sonido').onclick = () => {
      conSonido = !conSonido;
      $('#juego-sonido').textContent = conSonido ? '🔊' : '🔇';
    };
    iniciarTactil();
  }

  // ---------- Controles táctiles ----------
  function iniciarTactil() {
    const marcar = () => { document.body.classList.add('tactil'); ajustar(); };
    if (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches) marcar();
    window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') marcar(); });

    const capturar = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* puntero simulado */ } };

    // Cruceta: mitad izquierda = ◀, mitad derecha = ▶. Se puede deslizar el dedo de una a otra.
    const cruceta = $('#tactil-cruceta'), toques = new Map();
    const lado = e => {
      const r = cruceta.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2 ? 'izq' : 'der';
    };
    const aplicar = () => {
      const v = [...toques.values()];
      teclas.TactilIzq = v.includes('izq');
      teclas.TactilDer = v.includes('der');
      cruceta.classList.toggle('izq', teclas.TactilIzq);
      cruceta.classList.toggle('der', teclas.TactilDer);
    };
    cruceta.addEventListener('pointerdown', e => {
      e.preventDefault();
      capturar(cruceta, e);
      desbloquearAudio();
      toques.set(e.pointerId, lado(e));
      aplicar();
    });
    cruceta.addEventListener('pointermove', e => {
      if (!toques.has(e.pointerId)) return;
      toques.set(e.pointerId, lado(e));
      aplicar();
    });
    const soltarCruceta = e => { toques.delete(e.pointerId); aplicar(); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => cruceta.addEventListener(t, soltarCruceta));

    // Botón de salto
    const boton = $('#tactil-salto');
    boton.addEventListener('pointerdown', e => {
      e.preventDefault();
      capturar(boton, e);
      desbloquearAudio();
      teclas.TactilSalto = true;
      bufferSalto = 0.15;
      boton.classList.add('pulsado');
    });
    const soltarSalto = () => { teclas.TactilSalto = false; boton.classList.remove('pulsado'); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => boton.addEventListener(t, soltarSalto));

    // Evita el menú de pulsación larga y la selección de texto en iOS
    $('#pantalla-juego').addEventListener('contextmenu', e => e.preventDefault());
  }

  // iOS solo deja sonar el audio si se crea durante un toque o una tecla
  function desbloquearAudio() {
    if (!conSonido) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { /* sin sonido */ }
  }

  function iniciar(definicion, cbSalir) {
    def = definicion;
    alSalir = cbSalir;
    App.mostrar('juego');
    if (document.activeElement) document.activeElement.blur();
    activo = true;
    if (!empezar()) return;
    ultimo = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(bucle);
  }

  function salir() {
    if (!activo) return;
    activo = false;
    cancelAnimationFrame(raf);
    teclas = {};
    if (alSalir) alSalir();
  }

  function alternarPausa() {
    pausa = !pausa;
    $('#juego-pausa').classList.toggle('oculto', !pausa);
  }

  function ajustar() {
    if (!lienzo || !W) return;
    medida = window.innerWidth + 'x' + window.innerHeight;
    // En tablet y móvil el marcador va encima del juego, así que se usa toda la pantalla
    const tactil = document.body.classList.contains('tactil');
    const maxW = window.innerWidth - (tactil ? 8 : 24), maxH = window.innerHeight - (tactil ? 8 : 110);
    // En pantallas apaisadas se ve más mundo a lo ancho (sin pasarse del mundo ni de 24 bloques)
    const ancho = Math.min(W, Math.max(N, Math.min(24, Math.round(VH * maxW / maxH))));
    if (ancho !== VW || lienzo.height !== VH * T) {
      VW = ancho;
      lienzo.width = VW * T;
      lienzo.height = VH * T;
      camX = Math.max(0, Math.min(W - VW, camX));
    }
    const s = Math.min(maxW / lienzo.width, maxH / lienzo.height);
    lienzo.style.width = Math.floor(lienzo.width * s) + 'px';
    lienzo.style.height = Math.floor(lienzo.height * s) + 'px';
  }

  // ---------- Construcción del mundo ----------
  function construir() {
    const salas = def.salas
      .map(s => ({ x: s.x, y: s.y, nivel: s.nivel || Almacen.nivel(s.nivelId) }))
      .filter(s => s.nivel);
    if (!salas.length) {
      alert('Este juego no tiene niveles.');
      salir();
      return false;
    }
    const minX = Math.min(...salas.map(s => s.x)), maxX = Math.max(...salas.map(s => s.x));
    const minY = Math.min(...salas.map(s => s.y)), maxY = Math.max(...salas.map(s => s.y));
    W = (maxX - minX + 1) * N;
    H = (maxY - minY + 1) * N;
    mapa = Array.from({ length: H }, () => Array(W).fill('.'));
    historias = {};
    enemigos = [];
    particulas = [];
    mechas = new Map();
    totalMonedas = 0;
    sprite = crearSprite(def.personaje || Almacen.personaje(def.personajeId) || Almacen.personajeElegido());

    salas.forEach(s => {
      const ox = (s.x - minX) * N, oy = (s.y - minY) * N;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          let b = s.nivel.rejilla[r][c];
          if (!BLOQUES[b]) b = '.';
          const x = ox + c, y = oy + r;
          if (b === 'P') { enemigos.push(crearEnemigo(x, y)); b = '.'; }
          if (b === 'Y') totalMonedas++;
          if (b === 'W') {
            const t = (s.nivel.historias || {})[`${r},${c}`];
            if (t) historias[`${x},${y}`] = t;
          }
          mapa[y][x] = b;
        }
      }
    });

    const ini = salas.find(s => def.inicio && s.x === def.inicio.x && s.y === def.inicio.y) || salas[0];
    const salida = buscarSalida((ini.x - minX) * N, (ini.y - minY) * N);
    jugador = { x: salida.x, y: salida.y, w: 0.7, h: 0.9, vx: 0, vy: 0, suelo: false, mira: 1, invul: 1, poder: 0, coyote: 0, paso: 0 };
    seguro = { x: jugador.x, y: jugador.y };

    VW = 0;              // ajustar() elige el ancho de la vista según la pantalla
    VH = Math.min(H, N);
    ajustar();
    camX = Math.max(0, Math.min(W - VW, jugador.x - VW / 2));
    camY = Math.max(0, Math.min(H - VH, jugador.y - VH / 2));
    return true;
  }

  // Primer hueco libre (de izquierda a derecha) con suelo debajo
  function buscarSalida(ox, oy) {
    const cercaEnemigo = (x, y) => enemigos.some(e => Math.abs(e.x - x) < 2 && Math.abs(e.y - y) < 2);
    for (let c = 0; c < N; c++) {
      for (let r = 0; r < N - 1; r++) {
        const x = ox + c, y = oy + r, abajo = mapa[y + 1][x];
        if (mapa[y][x] === '.' && SOLIDOS.has(abajo) && abajo !== 'R' && !cercaEnemigo(x, y)) {
          return { x: x + 0.15, y: y + 0.1 };
        }
      }
    }
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (mapa[oy + r][ox + c] === '.') return { x: ox + c + 0.15, y: oy + r + 0.1 };
      }
    }
    return { x: ox + 0.15, y: oy };
  }

  function crearEnemigo(x, y) {
    return { x: x + 0.1, y: y + 0.2, w: 0.8, h: 0.8, vx: -2, vy: 0, suelo: false, vivo: true, fase: Math.random() * 6 };
  }

  function empezar() {
    if (!construir()) return false;
    monedas = 0;
    vidas = 3;
    estado = 'jugando';
    pausa = false;
    tiempoSeguro = 0;
    historiaTiempo = 0;
    acum = 0;
    teclas = {};
    hudTexto = '';
    $('#juego-mensaje').classList.add('oculto');
    $('#juego-pausa').classList.add('oculto');
    $('#juego-historia').classList.add('oculto');
    actualizarHUD();
    return true;
  }

  // ---------- Física ----------
  function celda(x, y) {
    if (x < 0 || x >= W) return '#';           // paredes invisibles a los lados
    if (y < 0 || y >= H) return '.';
    return mapa[y][x];
  }

  function moverX(e, dt) {
    e.x += e.vx * dt;
    const golpes = [];
    if (e.vx === 0) return golpes;
    const col = e.vx > 0 ? Math.floor(e.x + e.w) : Math.floor(e.x);
    const y0 = Math.floor(e.y), y1 = Math.floor(e.y + e.h - 0.001);
    for (let y = y0; y <= y1; y++) {
      const t = celda(col, y);
      if (SOLIDOS.has(t)) golpes.push({ x: col, y, t });
    }
    if (golpes.length) e.x = e.vx > 0 ? col - e.w - 0.001 : col + 1.001;
    return golpes;
  }

  function moverY(e, dt) {
    e.y += e.vy * dt;
    e.suelo = false;
    const golpes = [];
    if (e.vy === 0) return golpes;
    const fila = e.vy > 0 ? Math.floor(e.y + e.h) : Math.floor(e.y);
    const x0 = Math.floor(e.x), x1 = Math.floor(e.x + e.w - 0.001);
    for (let x = x0; x <= x1; x++) {
      const t = celda(x, fila);
      if (SOLIDOS.has(t)) golpes.push({ x, y: fila, t });
    }
    if (golpes.length) {
      if (e.vy > 0) { e.y = fila - e.h - 0.001; e.suelo = true; }
      else e.y = fila + 1.001;
    }
    return golpes;
  }

  function solapa(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function actualizar(dt) {
    const j = jugador;
    const izq = teclas.ArrowLeft || teclas.KeyA || teclas.TactilIzq;
    const der = teclas.ArrowRight || teclas.KeyD || teclas.TactilDer;
    const saltoPulsado = teclas.Space || teclas.ArrowUp || teclas.KeyW || teclas.TactilSalto;
    const dir = (der ? 1 : 0) - (izq ? 1 : 0);
    if (dir) j.mira = dir;
    const enAgua = celda(Math.floor(j.x + j.w / 2), Math.floor(j.y + j.h / 2)) === 'B';

    // Movimiento horizontal con aceleración
    const objetivo = dir * F.vel * (enAgua ? 0.6 : 1);
    const acel = (j.suelo ? 70 : 45) * dt;
    if (j.vx < objetivo) j.vx = Math.min(objetivo, j.vx + acel);
    else if (j.vx > objetivo) j.vx = Math.max(objetivo, j.vx - acel);

    // Salto (con un poquito de margen al borde de las plataformas)
    j.coyote = j.suelo ? 0.1 : Math.max(0, j.coyote - dt);
    bufferSalto = Math.max(0, bufferSalto - dt);
    if (bufferSalto > 0 && (j.coyote > 0 || enAgua)) {
      j.vy = enAgua ? -F.saltoAgua : -F.salto;
      j.coyote = 0;
      bufferSalto = 0;
      j.suelo = false;
      sonido(enAgua ? 'nadar' : 'salto');
    }
    if (!saltoPulsado && j.vy < -6 && !enAgua) j.vy = -6; // salto más corto si se suelta
    j.vy = Math.min(j.vy + (enAgua ? F.gravAgua : F.grav) * dt, enAgua ? F.caidaAgua : F.caidaMax);

    const gx = moverX(j, dt);
    if (gx.length) j.vx = 0;
    const gy = moverY(j, dt);
    if (gy.length) {
      // Golpear un explosivo con la cabeza o caer encima lo enciende
      gy.filter(g => g.t === 'O').forEach(g => encender(g.x, g.y, 0.6));
      j.vy = 0;
    }
    const tocados = gx.concat(gy);
    if (tocados.some(g => g.t === 'R')) herir(-j.mira);
    const libro = tocados.find(g => g.t === 'W');
    if (libro) mostrarHistoria(historias[`${libro.x},${libro.y}`] || '…');

    // Recoger monedas y superpoderes
    for (let y = Math.floor(j.y); y <= Math.floor(j.y + j.h - 0.001); y++) {
      for (let x = Math.floor(j.x); x <= Math.floor(j.x + j.w - 0.001); x++) {
        const t = celda(x, y);
        if (t === 'Y') {
          mapa[y][x] = '.';
          monedas++;
          chispas(x + 0.5, y + 0.5, '#fdd835', 10);
          sonido('moneda');
          if (monedas === totalMonedas) ganar();
        } else if (t === 'K') {
          mapa[y][x] = '.';
          j.poder = 8;
          vidas = Math.min(vidas + 1, 5);
          chispas(x + 0.5, y + 0.5, '#e8408f', 16);
          sonido('poder');
        }
      }
    }

    // Explosivos encendidos
    mechas.forEach((t, clave) => {
      t -= dt;
      if (t > 0) { mechas.set(clave, t); return; }
      mechas.delete(clave);
      const [x, y] = clave.split(',').map(Number);
      explotar(x, y);
    });

    // Enemigos
    enemigos.forEach(e => {
      if (!e.vivo) return;
      e.fase += dt * 8;
      e.vy = Math.min(e.vy + F.grav * dt, F.caidaMax);
      if (moverX(e, dt).length) e.vx = -e.vx;
      if (moverY(e, dt).length) e.vy = 0;
      if (e.suelo) {
        const delante = e.vx > 0 ? Math.floor(e.x + e.w + 0.05) : Math.floor(e.x - 0.05);
        if (!SOLIDOS.has(celda(delante, Math.floor(e.y + e.h + 0.05)))) e.vx = -e.vx;
      }
      if (e.y > H + 2) e.vivo = false;
      if (estado !== 'jugando' || !solapa(j, e)) return;
      if (j.poder > 0) { aplastar(e); return; }
      if (j.vy > 0 && j.y + j.h - e.y < 0.45) {
        aplastar(e);
        j.vy = saltoPulsado ? -F.salto : -10;
      } else {
        herir(e.x + e.w / 2 < j.x + j.w / 2 ? 1 : -1);
      }
    });
    enemigos = enemigos.filter(e => e.vivo);

    // Caída al vacío
    if (j.y > H + 1) caer();

    // Guardar un sitio seguro donde reaparecer
    if (j.suelo && gy.every(g => g.t === 'G' || g.t === 'W')) {
      tiempoSeguro += dt;
      if (tiempoSeguro > 0.3) { seguro = { x: j.x, y: j.y }; tiempoSeguro = 0; }
    }

    j.invul = Math.max(0, j.invul - dt);
    j.poder = Math.max(0, j.poder - dt);
    if (j.suelo && Math.abs(j.vx) > 0.5) j.paso += dt * 12;

    // Cámara
    const objX = Math.max(0, Math.min(W - VW, j.x + j.w / 2 - VW / 2));
    const objY = Math.max(0, Math.min(H - VH, j.y + j.h / 2 - VH / 2));
    camX += (objX - camX) * Math.min(1, dt * 8);
    camY += (objY - camY) * Math.min(1, dt * 8);

    if (historiaTiempo > 0) {
      historiaTiempo -= dt;
      if (historiaTiempo <= 0) $('#juego-historia').classList.add('oculto');
    }
    actualizarHUD();
  }

  function aplastar(e) {
    e.vivo = false;
    chispas(e.x + e.w / 2, e.y + e.h / 2, '#8e44ad', 14);
    sonido('pisar');
  }

  function encender(x, y, mecha) {
    const clave = `${x},${y}`;
    if (!mechas.has(clave)) mechas.set(clave, mecha);
  }

  // Un explosivo desaparece, enciende a los explosivos de al lado y elimina enemigos cercanos
  function explotar(x, y) {
    if (celda(x, y) !== 'O') return;
    mapa[y][x] = '.';
    chispas(x + 0.5, y + 0.5, '#fb8c00', 14);
    chispas(x + 0.5, y + 0.5, '#fdd835', 10);
    sonido('boom');
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      if (celda(x + dx, y + dy) === 'O') encender(x + dx, y + dy, 0.15);
    });
    enemigos.forEach(e => {
      if (e.vivo && Math.hypot(e.x + e.w / 2 - x - 0.5, e.y + e.h / 2 - y - 0.5) < 1.6) aplastar(e);
    });
  }

  function herir(empuje) {
    const j = jugador;
    if (j.invul > 0 || j.poder > 0 || estado !== 'jugando') return;
    vidas--;
    j.invul = 1.5;
    j.vy = -12; // rebote fuerte para poder salir de un foso de pinchos
    j.vx = empuje * 7;
    sonido('golpe');
    if (vidas <= 0) perder();
  }

  function caer() {
    const j = jugador;
    vidas--;
    sonido('golpe');
    if (vidas <= 0) { perder(); j.y = H + 1; j.vy = 0; return; }
    j.x = seguro.x; j.y = seguro.y;
    j.vx = j.vy = 0;
    j.invul = 1.5;
  }

  function ganar() {
    estado = 'ganado';
    sonido('ganar');
    for (let i = 0; i < 120; i++) {
      particulas.push({
        x: camX + Math.random() * VW, y: camY - Math.random() * 3,
        vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vida: 4,
        color: ['#43b047', '#e53935', '#fdd835', '#29a8e0', '#8e44ad', '#fb8c00', '#f06292'][i % 7],
      });
    }
    mostrarMensaje('🎉 ¡Has ganado!', `Has cogido las ${totalMonedas} monedas`);
  }

  function perder() {
    estado = 'perdido';
    mostrarMensaje('😵 ¡Ay!', 'Se acabaron las vidas. ¿Lo intentas otra vez?');
  }

  function mostrarMensaje(titulo, texto) {
    $('#juego-mensaje-titulo').textContent = titulo;
    $('#juego-mensaje-texto').textContent = texto;
    setTimeout(() => { if (estado !== 'jugando') $('#juego-mensaje').classList.remove('oculto'); }, 700);
  }

  function mostrarHistoria(texto) {
    const b = $('#juego-historia');
    if (b.textContent !== texto) b.textContent = texto;
    b.classList.remove('oculto');
    historiaTiempo = 3;
  }

  function chispas(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5;
      particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, vida: 0.6 + Math.random() * 0.4, color });
    }
  }

  function actualizarHUD() {
    const j = jugador;
    const texto = `${vidas}|${monedas}|${Math.ceil(j.poder)}`;
    if (texto === hudTexto) return;
    hudTexto = texto;
    $('#hud-vidas').textContent = vidas > 0 ? '❤️'.repeat(vidas) : '💔';
    $('#hud-monedas').textContent = totalMonedas ? `🪙 ${monedas} / ${totalMonedas}` : `🪙 ${monedas}`;
    $('#hud-poder').textContent = j.poder > 0 ? `⚡ ${Math.ceil(j.poder)}` : '';
  }

  // ---------- Sonido (pitidos sencillos, sin archivos) ----------
  function sonido(tipo) {
    if (!conSonido) return;
    const cfg = {
      salto: [420, 760, 0.12, 'square'], nadar: [300, 450, 0.1, 'sine'],
      moneda: [988, 1480, 0.12, 'square'], golpe: [300, 70, 0.3, 'sawtooth'],
      boom: [160, 40, 0.35, 'sawtooth'], poder: [500, 1300, 0.45, 'triangle'],
      pisar: [650, 180, 0.15, 'square'], ganar: [520, 1560, 0.8, 'triangle'],
    }[tipo];
    if (!cfg) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
      o.type = cfg[3];
      o.frequency.setValueAtTime(cfg[0], t);
      o.frequency.exponentialRampToValueAtTime(cfg[1], t + cfg[2]);
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + cfg[2]);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t);
      o.stop(t + cfg[2] + 0.02);
    } catch (e) { /* sin sonido */ }
  }

  // ---------- Bucle ----------
  function bucle(ahora) {
    if (!activo) return;
    raf = requestAnimationFrame(bucle);
    // Al girar la tablet o el móvil el evento resize no siempre llega a tiempo
    if (window.innerWidth + 'x' + window.innerHeight !== medida) ajustar();
    const dt = Math.min(0.1, (ahora - ultimo) / 1000 || 0);
    ultimo = ahora;
    if (!pausa) {
      tiempo += dt;
      if (estado === 'jugando') {
        acum += dt;
        while (acum >= PASO) { actualizar(PASO); acum -= PASO; }
      }
      particulas.forEach(p => { p.vy += 12 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= dt; });
      particulas = particulas.filter(p => p.vida > 0);
    }
    dibujar();
  }

  // ---------- Dibujo ----------
  function dibujar() {
    const w = lienzo.width, h = lienzo.height;
    const cielo = ctx.createLinearGradient(0, 0, 0, h);
    cielo.addColorStop(0, '#1e3270');
    cielo.addColorStop(1, '#4a2f7a');
    ctx.fillStyle = cielo;
    ctx.fillRect(0, 0, w, h);
    // Colinas de fondo
    [[0.2, 0.62, 'rgba(120,140,255,.12)'], [0.45, 0.75, 'rgba(120,140,255,.16)']].forEach(([par, alt, col]) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) {
        const wx = x + camX * T * par;
        ctx.lineTo(x, h * alt + Math.sin(wx / 160) * 40 + Math.sin(wx / 61) * 14);
      }
      ctx.lineTo(w, h);
      ctx.fill();
    });

    ctx.save();
    ctx.translate(-Math.round(camX * T), -Math.round(camY * T));
    const x0 = Math.max(0, Math.floor(camX)), x1 = Math.min(W - 1, Math.ceil(camX + VW));
    const y0 = Math.max(0, Math.floor(camY)), y1 = Math.min(H - 1, Math.ceil(camY + VH));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = mapa[y][x];
        if (t === '.' || t === 'B') continue;
        const px = x * T, py = y * T, arriba = celda(x, y - 1), libre = !SOLIDOS.has(arriba) && arriba !== '#';
        if (t === 'G') {
          bloque(px, py, TONOS.G);
          if (libre) {
            ctx.fillStyle = '#9be37f';
            ctx.fillRect(px, py, T, 8);
            for (let i = 0; i < 4; i++) ctx.fillRect(px + 4 + i * 12, py + 8, 5, 4);
          }
        } else if (t === 'R') {
          bloque(px, py, TONOS.R);
          if (libre) pinchos(px, py);
        } else if (t === 'O') {
          bloque(px, py, TONOS.O);
          explosion(px + T / 2, py + T / 2, 13, '#b85e00');
          if (mechas.has(`${x},${y}`) && Math.floor(tiempo * 16) % 2) {
            ctx.fillStyle = 'rgba(255,255,255,.7)';
            ctx.fillRect(px, py, T, T);
          }
        } else if (t === 'W') {
          bloque(px, py, TONOS.W);
          ctx.fillStyle = historias[`${x},${y}`] ? '#3a6ee0' : '#999';
          ctx.font = 'bold 30px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', px + T / 2, py + T / 2 + 2);
        } else if (t === 'Y') {
          moneda(px, py, x);
        } else if (t === 'K') {
          rayo(px + T / 2, py + T / 2);
        }
      }
    }

    enemigos.forEach(dibujarEnemigo);
    dibujarJugador();

    // Agua por encima del personaje (para que parezca que está dentro)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (mapa[y][x] !== 'B') continue;
        ctx.fillStyle = 'rgba(41,168,224,.55)';
        ctx.fillRect(x * T, y * T, T, T);
        if (celda(x, y - 1) !== 'B') {
          ctx.fillStyle = 'rgba(190,235,255,.8)';
          const ola = Math.sin(tiempo * 3 + x) * 3;
          ctx.fillRect(x * T, y * T + 2 + ola, T, 4);
        }
      }
    }

    particulas.forEach(p => {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.vida * 2));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * T - 4, p.y * T - 4, 8, 8);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function bloque(px, py, [base, claro, oscuro]) {
    ctx.fillStyle = oscuro;
    ctx.fillRect(px, py, T, T);
    ctx.fillStyle = base;
    ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
    ctx.fillStyle = claro;
    ctx.fillRect(px + 3, py + 3, T - 6, 5);
    ctx.fillRect(px + 3, py + 3, 5, T - 6);
  }

  function pinchos(px, py) {
    ctx.fillStyle = '#e8e8f0';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(px + i * 16, py + 14);
      ctx.lineTo(px + i * 16 + 8, py - 2);
      ctx.lineTo(px + i * 16 + 16, py + 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  function moneda(px, py, x) {
    const ancho = Math.abs(Math.cos(tiempo * 3 + x * 0.7)) * 13 + 2;
    const cx = px + T / 2, cy = py + T / 2 + Math.sin(tiempo * 4 + x) * 2;
    ctx.fillStyle = '#c99a00';
    ctx.beginPath();
    ctx.ellipse(cx, cy, ancho + 2, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fdd835';
    ctx.beginPath();
    ctx.ellipse(cx, cy, ancho, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff59d';
    ctx.fillRect(cx - ancho * 0.3, cy - 8, Math.max(1, ancho * 0.25), 12);
  }

  // Superpoder (rosa): un rayo que late
  function rayo(cx, cy) {
    const s = 1 + Math.sin(tiempo * 6) * 0.08;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.rotate(Math.sin(tiempo * 2) * 0.15);
    ctx.fillStyle = '#e8408f';
    ctx.strokeStyle = '#ffd6ea';
    ctx.lineWidth = 3;
    ctx.beginPath();
    [[4, -20], [-10, 2], [-1, 2], [-5, 20], [10, -3], [1, -3]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Dibujo de "explosión" (estrella de 8 puntas) sobre los bloques naranjas
  function explosion(cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  function dibujarEnemigo(e) {
    const px = e.x * T, py = e.y * T, w = e.w * T, h = e.h * T;
    const pie = Math.sin(e.fase) * 3;
    ctx.fillStyle = '#4a1f63';
    ctx.fillRect(px + 4, py + h - 8 + pie, 10, 8);
    ctx.fillRect(px + w - 14, py + h - 8 - pie, 10, 8);
    ctx.fillStyle = '#8e44ad';
    ctx.beginPath();
    ctx.roundRect(px, py, w, h - 5, [w / 2, w / 2, 6, 6]);
    ctx.fill();
    ctx.fillStyle = '#b06fd0';
    ctx.fillRect(px + 8, py + 8, 6, 6);
    const mira = e.vx > 0 ? 3 : -3;
    [w * 0.32, w * 0.68].forEach(ox => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px + ox, py + h * 0.42, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(px + ox - 2 + mira, py + h * 0.42 - 3, 4, 6);
    });
    // Cejas enfadadas
    ctx.strokeStyle = '#2b0f3b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px + w * 0.2, py + h * 0.22); ctx.lineTo(px + w * 0.42, py + h * 0.3);
    ctx.moveTo(px + w * 0.8, py + h * 0.22); ctx.lineTo(px + w * 0.58, py + h * 0.3);
    ctx.stroke();
  }

  function dibujarJugador() {
    const j = jugador;
    if (j.invul > 0 && Math.floor(tiempo * 15) % 2 && estado === 'jugando') return;
    if (sprite) { dibujarSprite(j); return; }
    const px = j.x * T, py = j.y * T, w = j.w * T, h = j.h * T, m = j.mira;
    const cuerpo = j.poder > 0 ? `hsl(${(tiempo * 400) % 360},90%,55%)` : '#2f6fde';
    const pierna = j.suelo ? Math.sin(j.paso) * 4 : 0;
    // Piernas
    ctx.fillStyle = '#3b2a1a';
    ctx.fillRect(px + 5, py + h - 9 + pierna, 10, 9 - pierna);
    ctx.fillRect(px + w - 15, py + h - 9 - pierna, 10, 9 + pierna);
    // Cuerpo
    ctx.fillStyle = cuerpo;
    ctx.beginPath();
    ctx.roundRect(px + 3, py + h * 0.48, w - 6, h * 0.36, 5);
    ctx.fill();
    // Cabeza
    ctx.fillStyle = '#ffcc99';
    ctx.fillRect(px + 5, py + h * 0.16, w - 10, h * 0.34);
    // Gorra con visera hacia donde mira
    ctx.fillStyle = '#e53935';
    ctx.fillRect(px + 3, py, w - 6, h * 0.2);
    ctx.fillRect(m > 0 ? px + w / 2 : px - 4, py + h * 0.13, w / 2 + 4, 5);
    // Ojo
    ctx.fillStyle = '#111';
    ctx.fillRect(px + w / 2 + m * 6 - 2, py + h * 0.27, 4, 7);
  }

  // Personaje dibujado por el niño: ocupa como mucho un bloque y mira hacia donde camina
  function dibujarSprite(j) {
    const foto = fotogramaSprite(sprite, j.suelo, Math.abs(j.vx) > 0.5, j.paso / Math.PI);
    const p = Math.min(T * 1.05 / sprite.h, T * 1.05 / sprite.w);
    const dw = sprite.w * p, dh = sprite.h * p;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate((j.x + j.w / 2) * T, (j.y + j.h) * T);
    if (j.mira < 0) ctx.scale(-1, 1);
    if (j.poder > 0) {
      ctx.shadowColor = `hsl(${(tiempo * 400) % 360},90%,60%)`;
      ctx.shadowBlur = 20;
    }
    ctx.drawImage(foto, -dw / 2, -dh, dw, dh);
    ctx.restore();
  }

  return { iniciarUI, iniciar };
})();
