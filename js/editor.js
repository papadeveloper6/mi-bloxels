'use strict';

// Editor de un nivel 13x13: pintar bloques y escribir textos de historia
const Editor = (() => {
  let nivel = null, bloque = 'G', modoTexto = false, pintando = null, sucio = false, avisoTimer = 0;
  const celdas = [];

  function iniciar() {
    const paleta = $('#editor-paleta');
    ORDEN_BLOQUES.forEach(b => {
      const info = BLOQUES[b];
      const btn = document.createElement('button');
      btn.className = 'paleta-btn';
      btn.dataset.b = b;
      btn.innerHTML = `<span class="muestra" style="background:${info.color}"></span><span><b>${info.nombre}</b><small>${info.funcion}</small></span>`;
      btn.onclick = () => elegir(b);
      paleta.appendChild(btn);
    });

    const rej = $('#editor-rejilla');
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
      if (modoTexto) { escribirTexto(+d.dataset.r, +d.dataset.c); return; }
      pintando = e.button === 2 ? '.' : bloque;
      poner(d, pintando);
    });
    rej.addEventListener('pointerover', e => {
      if (!pintando) return;
      if (!e.buttons) { pintando = null; return; }
      const d = e.target.closest('.celda');
      if (d) poner(d, pintando);
    });
    window.addEventListener('pointerup', () => { pintando = null; });
    rej.addEventListener('contextmenu', e => e.preventDefault());

    $('#editor-texto').onclick = () => {
      modoTexto = !modoTexto;
      $('#editor-texto').classList.toggle('activo', modoTexto);
      if (modoTexto) aviso('Toca un bloque para escribir 💬');
    };
    $('#editor-guardar').onclick = guardar;
    $('#editor-probar').onclick = () => { leerNombre(); App.probarNivel(copiar(nivel), 'editor'); };
    $('#editor-limpiar').onclick = () => {
      if (!confirm('¿Borrar todos los bloques?')) return;
      nivel.rejilla = rejillaVacia();
      nivel.historias = {};
      sucio = true;
      pintarTodo();
    };
    $('#editor-volver').onclick = () => {
      if (sucio && !confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) return;
      App.mostrar('inicio');
    };
    $('#editor-nombre').addEventListener('input', () => { sucio = true; });
  }

  function abrir(n, esNuevo) {
    nivel = copiar(n);
    if (!nivel.historias) nivel.historias = {};
    sucio = !!esNuevo;
    modoTexto = false;
    $('#editor-texto').classList.remove('activo');
    $('#editor-nombre').value = nivel.nombre || '';
    const img = $('#editor-foto');
    if (nivel.foto) { img.src = nivel.foto; img.classList.remove('oculto'); }
    else img.classList.add('oculto');
    $('#editor-aviso').textContent = '';
    elegir('G');
    pintarTodo();
  }

  function elegir(b) {
    bloque = b;
    document.querySelectorAll('#editor-paleta .paleta-btn').forEach(x => x.classList.toggle('activo', x.dataset.b === b));
    if (modoTexto) { modoTexto = false; $('#editor-texto').classList.remove('activo'); }
  }

  function poner(d, b) {
    const r = +d.dataset.r, c = +d.dataset.c;
    if (nivel.rejilla[r][c] === b) return;
    nivel.rejilla[r][c] = b;
    if (b !== 'W') delete nivel.historias[`${r},${c}`];
    sucio = true;
    pintarCelda(r, c);
  }

  function escribirTexto(r, c) {
    const clave = `${r},${c}`;
    if (nivel.rejilla[r][c] !== 'W') { nivel.rejilla[r][c] = 'W'; sucio = true; }
    const t = prompt('¿Qué dice este bloque de historia? 💬', nivel.historias[clave] || '');
    if (t !== null) {
      if (t.trim()) nivel.historias[clave] = t.trim(); else delete nivel.historias[clave];
      sucio = true;
    }
    pintarCelda(r, c);
  }

  function pintarCelda(r, c) {
    const d = celdas[r * N + c], b = nivel.rejilla[r][c];
    const info = BLOQUES[b] || BLOQUES['.'];
    d.style.background = info.color;
    d.classList.toggle('lleno', b !== '.');
    const texto = b === 'W' && nivel.historias[`${r},${c}`];
    d.classList.toggle('texto', !!texto);
    d.title = texto ? `${info.funcion}: «${texto}»` : info.funcion;
  }

  function pintarTodo() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) pintarCelda(r, c);
  }

  function leerNombre() {
    nivel.nombre = $('#editor-nombre').value.trim() || 'Mi nivel';
  }

  function guardar() {
    leerNombre();
    if (Almacen.guardarNivel(copiar(nivel))) {
      sucio = false;
      aviso('✅ ¡Guardado!');
    }
  }

  function aviso(texto) {
    const a = $('#editor-aviso');
    a.textContent = texto;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { a.textContent = ''; }, 2500);
  }

  return { iniciar, abrir };
})();
