'use strict';

// Constructor de juegos: se colocan niveles en un mapa; los que se tocan quedan conectados
const Mundo = (() => {
  const COLS = 8, FILAS = 5;
  let juego = null, seleccionado = null, herramienta = 'poner', sucio = false, avisoTimer = 0;
  const huecos = [];

  function iniciar() {
    const mapa = $('#mundo-mapa');
    for (let y = 0; y < FILAS; y++) {
      for (let x = 0; x < COLS; x++) {
        const d = document.createElement('div');
        d.className = 'hueco';
        const c = document.createElement('canvas');
        c.width = c.height = 104;
        d.appendChild(c);
        d.onclick = () => pulsarHueco(x, y);
        mapa.appendChild(d);
        huecos.push(d);
      }
    }
    document.querySelectorAll('[data-herr]').forEach(b => {
      b.onclick = () => elegirHerramienta(b.dataset.herr);
    });
    $('#mundo-guardar').onclick = guardar;
    $('#mundo-jugar').onclick = () => {
      if (!juego.salas.length) { aviso('Pon al menos un nivel en el mapa'); return; }
      leerNombre();
      Juego.iniciar(copiar(juego), () => App.mostrar('mundo'));
    };
    $('#mundo-volver').onclick = () => {
      if (sucio && !confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) return;
      App.mostrar('inicio');
    };
    $('#mundo-nombre').addEventListener('input', () => { sucio = true; });
    $('#mundo-personaje').addEventListener('change', e => {
      juego.personajeId = e.target.value || null;
      sucio = true;
    });
  }

  function pintarSelector() {
    const sel = $('#mundo-personaje');
    sel.innerHTML = '';
    const opcion = (valor, texto) => {
      const o = document.createElement('option');
      o.value = valor;
      o.textContent = texto;
      sel.appendChild(o);
    };
    const elegido = Almacen.personajeElegido();
    opcion('', `⭐ El elegido (${elegido ? elegido.nombre : 'el de siempre'})`);
    Almacen.datos.personajes.forEach(p => opcion(p.id, p.nombre));
    sel.value = juego.personajeId && Almacen.personaje(juego.personajeId) ? juego.personajeId : '';
  }

  function abrir(j) {
    juego = copiar(j);
    // Quitar salas de niveles que ya no existen
    juego.salas = juego.salas.filter(s => Almacen.nivel(s.nivelId));
    sucio = false;
    seleccionado = null;
    $('#mundo-nombre').value = juego.nombre || '';
    $('#mundo-aviso').textContent = '';
    elegirHerramienta('poner');
    pintarLista();
    pintarMapa();
    pintarSelector();
  }

  function elegirHerramienta(h) {
    herramienta = h;
    document.querySelectorAll('[data-herr]').forEach(b => b.classList.toggle('activo', b.dataset.herr === h));
  }

  function pintarLista() {
    const lista = $('#mundo-lista');
    lista.innerHTML = '';
    if (!Almacen.datos.niveles.length) {
      lista.innerHTML = '<p class="pista">Todavía no hay niveles.</p>';
      return;
    }
    Almacen.datos.niveles.forEach(n => {
      const b = document.createElement('button');
      b.className = 'mini-nivel' + (n.id === seleccionado ? ' activo' : '');
      const c = document.createElement('canvas');
      c.width = c.height = 130;
      dibujarMiniatura(c, n.rejilla);
      const t = document.createElement('span');
      t.textContent = n.nombre;
      b.append(c, t);
      b.onclick = () => { seleccionado = n.id; elegirHerramienta('poner'); pintarLista(); };
      lista.appendChild(b);
    });
  }

  function sala(x, y) {
    return juego.salas.find(s => s.x === x && s.y === y);
  }

  function pintarMapa() {
    for (let y = 0; y < FILAS; y++) {
      for (let x = 0; x < COLS; x++) {
        const d = huecos[y * COLS + x], c = d.firstChild, ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
        const s = sala(x, y), n = s && Almacen.nivel(s.nivelId);
        if (n) dibujarMiniatura(c, n.rejilla);
        d.classList.toggle('inicio', !!(s && juego.inicio && juego.inicio.x === x && juego.inicio.y === y));
        d.title = n ? n.nombre : '';
      }
    }
  }

  function pulsarHueco(x, y) {
    const s = sala(x, y);
    if (herramienta === 'poner') {
      if (!seleccionado) { aviso('👈 Primero elige un nivel'); return; }
      if (s) s.nivelId = seleccionado;
      else juego.salas.push({ x, y, nivelId: seleccionado });
      if (!juego.inicio || !sala(juego.inicio.x, juego.inicio.y)) juego.inicio = { x, y };
    } else if (herramienta === 'quitar') {
      if (!s) return;
      juego.salas = juego.salas.filter(o => o !== s);
      if (juego.inicio && juego.inicio.x === x && juego.inicio.y === y) {
        juego.inicio = juego.salas.length ? { x: juego.salas[0].x, y: juego.salas[0].y } : null;
      }
    } else if (herramienta === 'inicio') {
      if (!s) { aviso('La salida tiene que estar en un nivel'); return; }
      juego.inicio = { x, y };
    }
    sucio = true;
    pintarMapa();
  }

  function leerNombre() {
    juego.nombre = $('#mundo-nombre').value.trim() || 'Mi juego';
  }

  function guardar() {
    leerNombre();
    if (Almacen.guardarJuego(copiar(juego))) {
      sucio = false;
      aviso('✅ ¡Guardado!');
    }
  }

  function aviso(texto) {
    const a = $('#mundo-aviso');
    a.textContent = texto;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { a.textContent = ''; }, 2500);
  }

  return { iniciar, abrir };
})();
