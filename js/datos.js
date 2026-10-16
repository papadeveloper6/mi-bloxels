'use strict';

// Tamaño de la cuadrícula de Bloxels
const N = 13;

// Cada color de bloque y lo que hace en el juego
const BLOQUES = {
  G: { nombre: 'Verde', color: '#43b047', funcion: 'Suelo' },
  R: { nombre: 'Rojo', color: '#e53935', funcion: 'Peligro' },
  Y: { nombre: 'Amarillo', color: '#fdd835', funcion: 'Moneda' },
  B: { nombre: 'Azul', color: '#29a8e0', funcion: 'Agua' },
  P: { nombre: 'Morado', color: '#8e44ad', funcion: 'Enemigo' },
  O: { nombre: 'Naranja', color: '#fb8c00', funcion: 'Explosivo' },
  K: { nombre: 'Rosa', color: '#e8408f', funcion: 'Superpoder' },
  W: { nombre: 'Blanco', color: '#f2f2f2', funcion: 'Historia' },
  '.': { nombre: 'Borrar', color: '#2a2c3d', funcion: 'Aire' },
};
// Mismo orden que en la caja de Bloxels
const ORDEN_BLOQUES = ['G', 'Y', 'K', 'B', 'P', 'W', 'O', 'R', '.'];

// Nivel de ejemplo para probar personajes cuando aún no hay niveles
const NIVEL_DEMO = [
  '.............',
  '......W......',
  '.............',
  '..YYY....K...',
  '.............',
  '....OOO......',
  '.........P...',
  'GGGG...GGGGGG',
  'GGGG...GGGGGG',
  'GGGGRRRGGGGGG',
  'GGGGBBBGGGGGG',
  'GGGGBBBGGGGGG',
  'GGGGGGGGGGGGG',
].map(f => f.split(''));

const $ = s => document.querySelector(s);

function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function rejillaVacia() {
  return Array.from({ length: N }, () => Array(N).fill('.'));
}

function copiar(obj) {
  return JSON.parse(JSON.stringify(obj));
}

const Almacen = {
  CLAVE: 'mi-bloxels.v1',
  datos: { niveles: [], juegos: [], personajes: [], elegido: null },

  cargar() {
    try {
      const d = JSON.parse(localStorage.getItem(this.CLAVE) || 'null');
      if (d && Array.isArray(d.niveles)) {
        this.datos = {
          niveles: d.niveles,
          juegos: Array.isArray(d.juegos) ? d.juegos : [],
          personajes: Array.isArray(d.personajes) ? d.personajes : [],
          elegido: d.elegido || null,
        };
      }
    } catch (e) {
      console.warn('No se pudieron cargar los datos', e);
    }
  },

  guardar() {
    try {
      localStorage.setItem(this.CLAVE, JSON.stringify(this.datos));
      return true;
    } catch (e) {
      alert('No se ha podido guardar (¿memoria llena?): ' + e.message);
      return false;
    }
  },

  nivel(id) { return this.datos.niveles.find(n => n.id === id) || null; },
  juego(id) { return this.datos.juegos.find(j => j.id === id) || null; },

  guardarNivel(nivel) {
    nivel.actualizado = Date.now();
    const i = this.datos.niveles.findIndex(n => n.id === nivel.id);
    if (i >= 0) this.datos.niveles[i] = nivel; else this.datos.niveles.unshift(nivel);
    return this.guardar();
  },

  borrarNivel(id) {
    this.datos.niveles = this.datos.niveles.filter(n => n.id !== id);
    this.datos.juegos.forEach(j => { j.salas = j.salas.filter(s => s.nivelId !== id); });
    this.guardar();
  },

  guardarJuego(juego) {
    juego.actualizado = Date.now();
    const i = this.datos.juegos.findIndex(j => j.id === juego.id);
    if (i >= 0) this.datos.juegos[i] = juego; else this.datos.juegos.unshift(juego);
    return this.guardar();
  },

  borrarJuego(id) {
    this.datos.juegos = this.datos.juegos.filter(j => j.id !== id);
    this.guardar();
  },

  personaje(id) { return this.datos.personajes.find(p => p.id === id) || null; },
  personajeElegido() { return this.personaje(this.datos.elegido); },

  guardarPersonaje(pj) {
    pj.actualizado = Date.now();
    const i = this.datos.personajes.findIndex(p => p.id === pj.id);
    if (i >= 0) this.datos.personajes[i] = pj; else this.datos.personajes.unshift(pj);
    return this.guardar();
  },

  borrarPersonaje(id) {
    this.datos.personajes = this.datos.personajes.filter(p => p.id !== id);
    if (this.datos.elegido === id) this.datos.elegido = null;
    this.datos.juegos.forEach(j => { if (j.personajeId === id) j.personajeId = null; });
    this.guardar();
  },

  elegirPersonaje(id) {
    this.datos.elegido = id;
    this.guardar();
  },

  exportar() {
    const { niveles, juegos, personajes, elegido } = this.datos;
    return JSON.stringify({ app: 'mi-bloxels', version: 2, niveles, juegos, personajes, elegido });
  },

  importar(texto) {
    const d = JSON.parse(texto);
    if (!d || d.app !== 'mi-bloxels' || !Array.isArray(d.niveles)) throw new Error('Este archivo no es una copia de Mi Bloxels');
    const mezclar = (lista, nuevos) => nuevos.forEach(x => {
      const i = lista.findIndex(y => y.id === x.id);
      if (i >= 0) lista[i] = x; else lista.push(x);
    });
    mezclar(this.datos.niveles, d.niveles);
    mezclar(this.datos.juegos, d.juegos || []);
    mezclar(this.datos.personajes, d.personajes || []);
    if (d.elegido && !this.datos.elegido) this.datos.elegido = d.elegido;
    this.guardar();
    return { niveles: d.niveles.length, juegos: (d.juegos || []).length, personajes: (d.personajes || []).length };
  },
};

// Convierte los fotogramas 13x13 de un personaje en pequeños canvas (1 px por bloque),
// recortados todos al mismo rectángulo para que no "salten" al animar
const FOTOGRAMAS_PJ = ['quieto', 'andar', 'saltar'];

function tieneDibujo(rejilla) {
  return !!rejilla && rejilla.some(f => f.some(b => b !== '.' && BLOQUES[b]));
}

function crearSprite(pj) {
  if (!pj || !pj.fotogramas || !tieneDibujo(pj.fotogramas.quieto)) return null;
  const usados = FOTOGRAMAS_PJ.filter(k => tieneDibujo(pj.fotogramas[k]));
  let r0 = N, r1 = -1, c0 = N, c1 = -1;
  usados.forEach(k => pj.fotogramas[k].forEach((f, r) => f.forEach((b, c) => {
    if (b === '.' || !BLOQUES[b]) return;
    r0 = Math.min(r0, r); r1 = Math.max(r1, r);
    c0 = Math.min(c0, c); c1 = Math.max(c1, c);
  })));
  const w = c1 - c0 + 1, h = r1 - r0 + 1, fotos = {};
  usados.forEach(k => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const x = cv.getContext('2d');
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const b = pj.fotogramas[k][r][c];
        if (b === '.' || !BLOQUES[b]) continue;
        x.fillStyle = BLOQUES[b].color;
        x.fillRect(c - c0, r - r0, 1, 1);
      }
    }
    fotos[k] = cv;
  });
  return { fotos, w, h };
}

// Elige el fotograma según lo que esté haciendo el personaje
function fotogramaSprite(sp, enSuelo, andando, fase) {
  if (!enSuelo && sp.fotos.saltar) return sp.fotos.saltar;
  if (enSuelo && andando && sp.fotos.andar && Math.floor(fase) % 2) return sp.fotos.andar;
  return sp.fotos.quieto;
}

// Pintar una rejilla de .celda con ratón o con el dedo, arrastrando.
// Con el dedo el navegador "captura" el toque, así que la celda se busca por coordenadas.
// empezar(r, c, e) devuelve el bloque con el que pintar (o null para no pintar).
function rejillaPintable(contenedor, { empezar, pintar }) {
  let activo = null;
  const celdaEn = e => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const d = el && el.closest('.celda');
    return d && contenedor.contains(d) ? d : null;
  };
  contenedor.addEventListener('pointerdown', e => {
    const d = e.target.closest('.celda');
    if (!d) return;
    e.preventDefault();
    activo = empezar(+d.dataset.r, +d.dataset.c, e);
    if (activo == null) return;
    try { contenedor.setPointerCapture(e.pointerId); } catch (err) { /* puntero simulado */ }
    pintar(+d.dataset.r, +d.dataset.c, activo);
  });
  contenedor.addEventListener('pointermove', e => {
    if (activo == null) return;
    const d = celdaEn(e);
    if (d) pintar(+d.dataset.r, +d.dataset.c, activo);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => contenedor.addEventListener(t, () => { activo = null; }));
  contenedor.addEventListener('contextmenu', e => e.preventDefault());
}

// Dibuja una rejilla 13x13 dentro de un canvas, en la posición y tamaño de celda indicados
function pintarRejilla(ctx, rejilla, ox, oy, t) {
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const b = rejilla[r][c];
      if (b === '.' || !BLOQUES[b]) continue;
      ctx.fillStyle = BLOQUES[b].color;
      ctx.fillRect(ox + c * t + t * 0.06, oy + r * t + t * 0.06, t * 0.88, t * 0.88);
    }
  }
}

function dibujarMiniatura(canvas, rejilla) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1b1d2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  pintarRejilla(ctx, rejilla, 0, 0, canvas.width / N);
}

function dibujarMiniaturaJuego(canvas, juego) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1b1d2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const salas = juego.salas.map(s => ({ ...s, nivel: Almacen.nivel(s.nivelId) })).filter(s => s.nivel);
  if (!salas.length) return;
  const minX = Math.min(...salas.map(s => s.x)), maxX = Math.max(...salas.map(s => s.x));
  const minY = Math.min(...salas.map(s => s.y)), maxY = Math.max(...salas.map(s => s.y));
  const cols = maxX - minX + 1, filas = maxY - minY + 1;
  const t = Math.min(canvas.width / (cols * N), canvas.height / (filas * N));
  const ox = (canvas.width - cols * N * t) / 2, oy = (canvas.height - filas * N * t) / 2;
  salas.forEach(s => {
    const x = ox + (s.x - minX) * N * t, y = oy + (s.y - minY) * N * t;
    ctx.fillStyle = '#26293b';
    ctx.fillRect(x, y, N * t, N * t);
    pintarRejilla(ctx, s.nivel.rejilla, x, y, t);
  });
}
