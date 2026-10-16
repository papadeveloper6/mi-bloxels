'use strict';

// Lee una foto del tablero de Bloxels y la convierte en una rejilla 13x13 de colores
const Foto = (() => {
  const MAX = 1400; // tamaño máximo de trabajo (px) para que vaya rápido
  let lienzo, ctx, preview, trabajo = null, pixeles = null, ancho = 0, alto = 0;
  let esquinas = [], arrastrando = -1, rejilla = rejillaVacia(), miniatura = null;
  let alListo = null, volverA = 'inicio', flujo = null, pendiente = false;

  function iniciar() {
    lienzo = $('#foto-lienzo');
    ctx = lienzo.getContext('2d');
    preview = $('#foto-preview');

    $('#foto-input').addEventListener('change', e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) cargarArchivo(f);
    });
    $('#foto-camara').onclick = abrirCamara;
    $('#foto-disparar').onclick = disparar;
    $('#foto-cerrar-camara').onclick = cerrarCamara;
    $('#foto-girar').onclick = () => { esquinas.unshift(esquinas.pop()); actualizar(); };
    $('#foto-usar').onclick = () => {
      cerrarCamara();
      alListo(rejilla.map(f => f.slice()), miniatura);
    };
    $('#foto-volver').onclick = () => { cerrarCamara(); App.mostrar(volverA); };

    // Mover esquinas: se coge la más cercana al punto pulsado
    lienzo.addEventListener('pointerdown', e => {
      if (!pixeles) return;
      const p = posRaton(e);
      let dmin = Infinity;
      esquinas.forEach((q, i) => {
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < dmin) { dmin = d; arrastrando = i; }
      });
      esquinas[arrastrando] = p;
      lienzo.setPointerCapture(e.pointerId);
      programar();
    });
    lienzo.addEventListener('pointermove', e => {
      if (arrastrando < 0) return;
      esquinas[arrastrando] = posRaton(e);
      programar();
    });
    // Al girar la tablet cambia el tamaño en pantalla: se redibujan los círculos
    window.addEventListener('resize', () => { if (pixeles && App.pantalla() === 'foto') programar(); });
    const soltar = () => { arrastrando = -1; };
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);

    // Arrastrar y soltar / pegar una imagen
    const zona = $('#pantalla-foto');
    zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('soltando'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('soltando'));
    zona.addEventListener('drop', e => {
      e.preventDefault();
      zona.classList.remove('soltando');
      const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/'));
      if (f) cargarArchivo(f);
    });
    document.addEventListener('paste', e => {
      if (App.pantalla() !== 'foto') return;
      const item = [...e.clipboardData.items].find(x => x.type.startsWith('image/'));
      if (item) cargarArchivo(item.getAsFile());
    });
  }

  // Abre la pantalla de foto; cb recibe la rejilla detectada (para un nivel o un personaje)
  function abrir(cb, opciones = {}) {
    alListo = cb;
    volverA = opciones.volverA || 'inicio';
    $('#foto-titulo').textContent = opciones.titulo || '📸 Nivel desde foto';
    cerrarCamara();
    pixeles = null;
    $('#foto-trabajo').classList.add('oculto');
    App.mostrar('foto');
  }

  function posRaton(e) {
    const r = lienzo.getBoundingClientRect();
    const x = (e.clientX - r.left) * ancho / r.width;
    const y = (e.clientY - r.top) * alto / r.height;
    return [Math.max(0, Math.min(ancho - 1, x)), Math.max(0, Math.min(alto - 1, y))];
  }

  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => { pendiente = false; actualizar(); });
  }

  function cargarArchivo(f) {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { usarImagen(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); };
    img.onerror = () => alert('No he podido abrir esa imagen.');
    img.src = url;
  }

  function usarImagen(fuente, w, h) {
    const escala = Math.min(1, MAX / Math.max(w, h));
    ancho = Math.round(w * escala);
    alto = Math.round(h * escala);
    trabajo = document.createElement('canvas');
    trabajo.width = ancho;
    trabajo.height = alto;
    const tctx = trabajo.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(fuente, 0, 0, ancho, alto);
    pixeles = tctx.getImageData(0, 0, ancho, alto).data;
    lienzo.width = ancho;
    lienzo.height = alto;

    // Miniatura pequeña de la foto para guardarla con el nivel
    const m = document.createElement('canvas');
    const em = 320 / Math.max(ancho, alto);
    m.width = Math.round(ancho * em);
    m.height = Math.round(alto * em);
    m.getContext('2d').drawImage(trabajo, 0, 0, m.width, m.height);
    miniatura = m.toDataURL('image/jpeg', 0.7);

    // Esquinas iniciales: un cuadrado centrado
    const lado = Math.min(ancho, alto) * 0.7, cx = ancho / 2, cy = alto / 2;
    esquinas = [
      [cx - lado / 2, cy - lado / 2], [cx + lado / 2, cy - lado / 2],
      [cx + lado / 2, cy + lado / 2], [cx - lado / 2, cy + lado / 2],
    ];
    $('#foto-trabajo').classList.remove('oculto');
    actualizar();
  }

  // ---- Cámara ----
  async function abrirCamara() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Este navegador no deja usar la cámara aquí. Usa «Elegir foto».');
      return;
    }
    try {
      flujo = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'environment' },
      });
      $('#foto-video').srcObject = flujo;
      $('#foto-video-caja').classList.remove('oculto');
    } catch (e) {
      alert('No he podido abrir la cámara: ' + e.message);
    }
  }

  function disparar() {
    const v = $('#foto-video');
    if (!v.videoWidth) return;
    usarImagen(v, v.videoWidth, v.videoHeight);
    cerrarCamara();
  }

  function cerrarCamara() {
    if (flujo) { flujo.getTracks().forEach(t => t.stop()); flujo = null; }
    const v = $('#foto-video');
    if (v) v.srcObject = null;
    $('#foto-video-caja').classList.add('oculto');
  }

  // ---- Geometría: homografía del cuadrado unidad al cuadrilátero de la foto ----
  function homografia(dst) {
    const src = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = resolver(A, b);
    return h ? [...h, 1] : null;
  }

  function resolver(A, b) {
    const n = b.length;
    const M = A.map((fila, i) => [...fila, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-9) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((fila, i) => fila[n] / fila[i]);
  }

  function proyectar(h, x, y) {
    const w = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  }

  // ---- Colores ----
  function clasificar(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max / 255, s = max ? (max - min) / max : 0;
    let h = 0;
    if (max !== min) {
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    if (v < 0.22) return '.';                    // hueco negro del tablero
    if (s < 0.25) return v > 0.6 ? 'W' : '.';    // blanco o gris oscuro
    if (s < 0.4 && v < 0.45) return '.';
    if (h < 12 || h >= 345) return (s < 0.5 && v > 0.75) ? 'K' : 'R';
    if (h < 40) return 'O';
    if (h < 70) return 'Y';
    if (h < 165) return 'G';
    if (h < 250) return 'B';
    if (h < 290) return 'P';
    return 'K';
  }

  function detectar(h) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        let sr = 0, sg = 0, sb = 0, n = 0;
        // Se promedian 25 puntos del centro de cada casilla
        for (let i = -2; i <= 2; i++) {
          for (let j = -2; j <= 2; j++) {
            const [x, y] = proyectar(h, (c + 0.5 + i * 0.09) / N, (r + 0.5 + j * 0.09) / N);
            const px = Math.round(x), py = Math.round(y);
            if (px < 0 || py < 0 || px >= ancho || py >= alto) continue;
            const k = (py * ancho + px) * 4;
            sr += pixeles[k]; sg += pixeles[k + 1]; sb += pixeles[k + 2]; n++;
          }
        }
        rejilla[r][c] = n ? clasificar(sr / n, sg / n, sb / n) : '.';
      }
    }
  }

  function actualizar() {
    if (!pixeles) return;
    const h = homografia(esquinas);
    if (h) detectar(h);
    dibujar(h);
    dibujarMiniatura(preview, rejilla);
  }

  function dibujar(h) {
    ctx.drawImage(trabajo, 0, 0);
    // Tamaños en píxeles de pantalla (la foto se ve reducida, sobre todo en el móvil)
    const visto = lienzo.getBoundingClientRect().width;
    const px = visto ? ancho / visto : 1;
    const grosor = 2 * px;
    if (h) {
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.lineWidth = grosor;
      ctx.beginPath();
      for (let k = 0; k <= N; k++) {
        let a = proyectar(h, k / N, 0), b = proyectar(h, k / N, 1);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        a = proyectar(h, 0, k / N); b = proyectar(h, 1, k / N);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
      // Puntito con el color detectado en cada casilla
      const rad = 3.5 * px;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const [x, y] = proyectar(h, (c + 0.5) / N, (r + 0.5) / N);
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fillStyle = rejilla[r][c] === '.' ? '#000' : BLOQUES[rejilla[r][c]].color;
          ctx.fill();
          ctx.lineWidth = grosor * 0.6;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
        }
      }
    }
    // Asas de las esquinas
    const radio = 18 * px;
    esquinas.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(x, y, radio, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? 'rgba(253,216,53,.85)' : 'rgba(41,168,224,.85)';
      ctx.fill();
      ctx.lineWidth = grosor;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.round(radio * 1.1)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y + 1);
    });
  }

  return { iniciar, abrir, clasificar };
})();
