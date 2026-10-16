'use strict';

// Editor de personajes: un dibujo 13x13 por fotograma (quieto, andando, saltando)
const Personaje = (() => {
  const FOTOGRAMAS = [
    ['quieto', '😐 Quieto', 'Dibuja tu personaje mirando hacia la derecha ➡️'],
    ['andar', '🚶 Andando', 'Cambia las piernas para que parezca que camina. El dibujo «Quieto» se ve en transparente para ayudarte.'],
    ['saltar', '🦘 Saltando', '¿Cómo se ve cuando salta? (Si lo dejas vacío, usará el «Quieto».)'],
  ];
  const SECUENCIA = ['quieto', 'andar', 'quieto', 'andar', 'quieto', 'andar', 'saltar', 'saltar'];
  let pj = null, actual = 'quieto', color = 'G', pintando = null, sucio = false, avisoTimer = 0, paso = 0;
  const celdas = [], pestanas = {};

  function iniciar() {
    const paleta = $('#pj-paleta');
    ORDEN_BLOQUES.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'paleta-btn';
      btn.dataset.b = b;
      btn.innerHTML = `<span class="muestra" style="background:${BLOQUES[b].color}"></span><b>${BLOQUES[b].nombre}</b>`;
      btn.onclick = () => elegirColor(b);
      paleta.appendChild(btn);
    });

    const tiras = $('#pj-fotogramas');
    FOTOGRAMAS.forEach(([clave, nombre]) => {
      const btn = document.createElement('button');
      btn.className = 'fotograma-btn';
      const c = document.createElement('canvas');
      c.width = c.height = 52;
      const t = document.createElement('span');
      t.textContent = nombre;
      btn.append(c, t);
      btn.onclick = () => elegirFotograma(clave);
      tiras.appendChild(btn);
      pestanas[clave] = { btn, canvas: c };
    });

    const rej = $('#pj-rejilla');
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const d = document.createElement('div');
        d.className = 'celda';
        d.dataset.r = r;
        d.dataset.c = c;
        rej.appendChild(d);
        celdas.push(d);
      }
    }
    rej.addEventListener('pointerdown', e => {
      const d = e.target.closest('.celda');
      if (!d) return;
      e.preventDefault();
      pintando = e.button === 2 ? '.' : color;
      pintar(d, pintando);
    });
    rej.addEventListener('pointerover', e => {
      if (!pintando) return;
      if (!e.buttons) { pintando = null; return; }
      const d = e.target.closest('.celda');
      if (d) pintar(d, pintando);
    });
    window.addEventListener('pointerup', () => { pintando = null; });
    rej.addEventListener('contextmenu', e => e.preventDefault());

    $('#pj-foto').onclick = () => Foto.abrir(rejilla => {
      pj.fotogramas[actual] = rejilla;
      sucio = true;
      App.mostrar('personaje');
      pintarTodo();
    }, { titulo: '📸 Personaje desde foto', volverA: 'personaje' });
    $('#pj-copiar').onclick = () => {
      if (actual === 'quieto') { aviso('Ya estás en «Quieto»'); return; }
      pj.fotogramas[actual] = copiar(pj.fotogramas.quieto);
      sucio = true;
      pintarTodo();
    };
    $('#pj-limpiar').onclick = () => {
      if (!confirm('¿Borrar este dibujo?')) return;
      pj.fotogramas[actual] = actual === 'quieto' ? rejillaVacia() : null;
      sucio = true;
      pintarTodo();
    };
    $('#pj-guardar').onclick = guardar;
    $('#pj-elegir').onclick = () => {
      if (!guardar()) return;
      Almacen.elegirPersonaje(pj.id);
      aviso('⭐ ¡Ya es tu personaje!');
    };
    $('#pj-probar').onclick = () => {
      if (!tieneDibujo(pj.fotogramas.quieto)) { aviso('Dibuja algo en «Quieto» primero'); return; }
      leerNombre();
      const nivel = Almacen.datos.niveles[0] || { id: 'demo', nombre: 'Demo', rejilla: NIVEL_DEMO, historias: {} };
      Juego.iniciar({ salas: [{ x: 0, y: 0, nivel }], inicio: { x: 0, y: 0 }, personaje: copiar(pj) }, () => App.mostrar('personaje'));
    };
    $('#pj-volver').onclick = () => {
      if (sucio && !confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) return;
      App.mostrar('inicio');
    };
    $('#pj-nombre').addEventListener('input', () => { sucio = true; });

    setInterval(animar, 220);
  }

  function abrir(p, esNuevo) {
    pj = copiar(p);
    if (!pj.fotogramas) pj.fotogramas = {};
    if (!pj.fotogramas.quieto) pj.fotogramas.quieto = rejillaVacia();
    sucio = !!esNuevo;
    $('#pj-nombre').value = pj.nombre || '';
    $('#pj-aviso').textContent = '';
    elegirColor('G');
    elegirFotograma('quieto');
  }

  function elegirColor(b) {
    color = b;
    document.querySelectorAll('#pj-paleta .paleta-btn').forEach(x => x.classList.toggle('activo', x.dataset.b === b));
  }

  function elegirFotograma(clave) {
    actual = clave;
    FOTOGRAMAS.forEach(([k, , pista]) => {
      pestanas[k].btn.classList.toggle('activo', k === clave);
      if (k === clave) $('#pj-pista').textContent = pista;
    });
    $('#pj-copiar').classList.toggle('oculto', clave === 'quieto');
    pintarTodo();
  }

  function pintar(d, b) {
    const r = +d.dataset.r, c = +d.dataset.c;
    if (!pj.fotogramas[actual]) pj.fotogramas[actual] = rejillaVacia();
    const g = pj.fotogramas[actual];
    if (g[r][c] === b) return;
    g[r][c] = b;
    sucio = true;
    pintarCelda(r, c);
    pintarPestana(actual);
  }

  function pintarCelda(r, c) {
    const g = pj.fotogramas[actual], b = g ? g[r][c] : '.';
    const q = pj.fotogramas.quieto;
    // En «andar» y «saltar» se ve el «quieto» en transparente como guía
    const fantasma = b === '.' && actual !== 'quieto' && q[r][c] !== '.' && BLOQUES[q[r][c]];
    const d = celdas[r * N + c];
    d.style.background = (BLOQUES[fantasma ? q[r][c] : b] || BLOQUES['.']).color;
    d.classList.toggle('lleno', b !== '.');
    d.classList.toggle('fantasma', !!fantasma);
  }

  function pintarPestana(clave) {
    const g = pj.fotogramas[clave];
    dibujarMiniatura(pestanas[clave].canvas, g || rejillaVacia());
    pestanas[clave].btn.classList.toggle('vacio-f', !tieneDibujo(g));
  }

  function pintarTodo() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) pintarCelda(r, c);
    FOTOGRAMAS.forEach(([k]) => pintarPestana(k));
  }

  // Vista previa animada del personaje caminando y saltando
  function animar() {
    if (!pj || App.pantalla() !== 'personaje') return;
    paso++;
    const cv = $('#pj-preview'), x = cv.getContext('2d');
    x.fillStyle = '#1e3270';
    x.fillRect(0, 0, cv.width, cv.height);
    x.fillStyle = '#43b047';
    x.fillRect(0, cv.height - 36, cv.width, 36);
    x.fillStyle = '#9be37f';
    x.fillRect(0, cv.height - 36, cv.width, 6);
    const sp = crearSprite(pj);
    if (!sp) {
      x.fillStyle = '#a9aecb';
      x.font = 'bold 16px sans-serif';
      x.textAlign = 'center';
      x.fillText('Aquí verás tu personaje', cv.width / 2, cv.height / 2);
      return;
    }
    const clave = SECUENCIA[paso % SECUENCIA.length];
    const foto = sp.fotos[clave] || sp.fotos.quieto;
    const p = Math.min(130 / sp.h, 130 / sp.w);
    const alto = clave === 'saltar' ? 34 : 0;
    x.imageSmoothingEnabled = false;
    x.drawImage(foto, (cv.width - sp.w * p) / 2, cv.height - 36 - sp.h * p - alto, sp.w * p, sp.h * p);
  }

  function leerNombre() {
    pj.nombre = $('#pj-nombre').value.trim() || 'Mi personaje';
  }

  function guardar() {
    if (!tieneDibujo(pj.fotogramas.quieto)) { aviso('Dibuja algo en «Quieto» primero'); return false; }
    leerNombre();
    if (!Almacen.guardarPersonaje(copiar(pj))) return false;
    sucio = false;
    aviso('✅ ¡Guardado!');
    return true;
  }

  function aviso(texto) {
    const a = $('#pj-aviso');
    a.textContent = texto;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { a.textContent = ''; }, 2500);
  }

  return { iniciar, abrir };
})();
