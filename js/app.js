'use strict';

// Navegación entre pantallas y pantalla de inicio
const App = (() => {
  let pantalla = 'inicio';

  function mostrar(nombre) {
    document.querySelectorAll('.pantalla').forEach(p => p.classList.toggle('oculto', p.id !== 'pantalla-' + nombre));
    pantalla = nombre;
    document.body.dataset.pantalla = nombre;
    if (nombre === 'inicio') pintarInicio();
    quitarZoom();
    window.scrollTo(0, 0);
  }

  // ---------- Zoom en iPad / iPhone ----------
  // Safari hace zoom con doble toque o pellizco aunque la CSS (touch-action) pida evitarlo,
  // y en la app instalada no hay forma fácil de deshacerlo. Se bloquea aquí con JavaScript.
  function bloquearZoom() {
    let ultimoToque = 0;
    document.addEventListener('touchend', e => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      const ahora = Date.now();
      // El segundo toque de un doble toque rápido no hace zoom (saltar va con el toque al pulsar, no afecta)
      if (ahora - ultimoToque < 400) e.preventDefault();
      ultimoToque = ahora;
    }, { passive: false });
    // Pellizco con dos dedos (fácil sin querer al pulsar ▶ y saltar a la vez)
    document.addEventListener('touchmove', e => {
      if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault();
    }, { passive: false });
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
    // Si aun así se amplía, se deshace solo
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => { if (window.visualViewport.scale > 1.01) quitarZoom(); });
    }
  }

  // Volver a escribir la etiqueta viewport hace que Safari vuelva al tamaño normal
  function quitarZoom() {
    if (!window.visualViewport || window.visualViewport.scale <= 1.01) return;
    const meta = document.querySelector('meta[name="viewport"]');
    const original = meta.getAttribute('content');
    meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1');
    setTimeout(() => meta.setAttribute('content', original), 50);
  }

  function boton(texto, clase, accion) {
    const b = document.createElement('button');
    b.className = 'btn ' + clase;
    b.textContent = texto;
    b.onclick = accion;
    return b;
  }

  function tarjeta(nombre, dibujar, botones) {
    const t = document.createElement('div');
    t.className = 'tarjeta';
    const c = document.createElement('canvas');
    c.width = c.height = 260;
    dibujar(c);
    const n = document.createElement('div');
    n.className = 'nombre';
    n.textContent = nombre;
    const b = document.createElement('div');
    b.className = 'botones';
    b.append(...botones);
    t.append(c, n, b);
    return t;
  }

  function pintarInicio() {
    const lj = $('#lista-juegos'), ln = $('#lista-niveles'), lp = $('#lista-personajes');
    const { juegos, niveles, personajes, elegido } = Almacen.datos;
    lp.innerHTML = personajes.length ? '' : '<p class="vacio">Todavía no hay personajes. Mientras tanto se juega con el de siempre.</p>';

    personajes.forEach(p => {
      const esElegido = p.id === elegido;
      const t = tarjeta(p.nombre, c => dibujarMiniatura(c, p.fotogramas.quieto), [
        esElegido ? Object.assign(document.createElement('span'), { className: 'etiqueta-elegido', textContent: '⭐ Elegido' })
          : boton('⭐ Elegir', 'morado', () => { Almacen.elegirPersonaje(p.id); pintarInicio(); }),
        boton('✏️', '', () => { Personaje.abrir(p, false); mostrar('personaje'); }),
        boton('🗑️', 'rojo', async () => {
          if (await preguntarBorrar(`¿Borrar el personaje «${p.nombre}»?`)) { Almacen.borrarPersonaje(p.id); pintarInicio(); }
        }),
      ]);
      lp.appendChild(t);
    });
    lj.innerHTML = juegos.length ? '' : '<p class="vacio">Todavía no hay juegos. Crea niveles y júntalos con «🌍 Nuevo juego».</p>';
    ln.innerHTML = niveles.length ? '' : '<p class="vacio">Todavía no hay niveles. ¡Haz una foto a tu tablero! 📸</p>';

    juegos.forEach(j => lj.appendChild(tarjeta(j.nombre, c => dibujarMiniaturaJuego(c, j), [
      boton('▶ Jugar', 'verde', () => Juego.iniciar(j, () => mostrar('inicio'))),
      boton('✏️', '', () => { Mundo.abrir(j); mostrar('mundo'); }),
      boton('🗑️', 'rojo', async () => {
        if (await preguntarBorrar(`¿Borrar el juego «${j.nombre}»?`)) { Almacen.borrarJuego(j.id); pintarInicio(); }
      }),
    ])));

    niveles.forEach(n => ln.appendChild(tarjeta(n.nombre, c => dibujarMiniatura(c, n.rejilla), [
      boton('▶ Probar', 'amarillo', () => probarNivel(n, 'inicio')),
      boton('✏️', '', () => { Editor.abrir(n, false); mostrar('editor'); }),
      boton('🗑️', 'rojo', async () => {
        const usos = juegos.filter(j => j.salas.some(s => s.nivelId === n.id)).length;
        const extra = usos ? ` Se quitará de ${usos} juego(s).` : '';
        if (await preguntarBorrar(`¿Borrar el nivel «${n.nombre}»?${extra}`)) { Almacen.borrarNivel(n.id); pintarInicio(); }
      }),
    ])));
  }

  function preguntarBorrar(texto) {
    return Dialogo.confirmar(texto, { si: '🗑️ Borrar', no: 'No, dejarlo', peligro: true });
  }

  function probarNivel(n, volverA) {
    Juego.iniciar({ nombre: n.nombre, salas: [{ x: 0, y: 0, nivel: n }], inicio: { x: 0, y: 0 } }, () => mostrar(volverA));
  }

  function nuevoNivel(rejilla, foto) {
    return {
      id: nuevoId(),
      nombre: 'Nivel ' + (Almacen.datos.niveles.length + 1),
      rejilla: rejilla || rejillaVacia(),
      historias: {},
      foto: foto || null,
      creado: Date.now(),
    };
  }

  async function exportar() {
    const nombre = `mi-bloxels-copia-${new Date().toISOString().slice(0, 10)}.json`;
    const archivo = new File([Almacen.exportar()], nombre, { type: 'application/json' });
    // En iPad y móvil se usa "Compartir": deja guardarlo en Archivos, enviarlo por AirDrop, etc.
    if (document.body.classList.contains('tactil') && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: 'Copia de Mi Bloxels' });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(archivo);
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function estaInstalada() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || navigator.standalone === true;
  }

  // Service worker (uso sin internet) y aviso para instalar la app
  function prepararApp() {
    if (location.protocol === 'file:') return;  // abierta como archivo: no hay instalación
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('Sin modo sin conexión:', e));
    }
    // Pide al navegador que no borre los niveles si se queda sin espacio
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    if (estaInstalada()) return;
    try { if (localStorage.getItem('mi-bloxels.no-instalar')) return; } catch (e) { /* sin almacenamiento */ }
    const caja = $('#instalar'), texto = $('#instalar-texto'), boton = $('#instalar-boton');
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) {
      texto.innerHTML = 'Pulsa el botón <b>Compartir</b> de Safari (el cuadrado con la flecha ↑) y elige <b>«Añadir a pantalla de inicio»</b>. '
        + 'Se abrirá a pantalla completa y funcionará sin internet.<br>'
        + '<small>Ojo: la app instalada guarda sus niveles aparte de Safari. Si ya tienes niveles aquí, pásalos con «Copias de seguridad» (abajo del todo).</small>';
      caja.classList.remove('oculto');
    }
    // Android y ordenadores con Chrome/Edge: el navegador ofrece su propio botón de instalar
    let peticion = null;
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      peticion = e;
      texto.textContent = 'Tendrás un icono en la pantalla de inicio, se abrirá a pantalla completa y funcionará sin internet.';
      boton.classList.remove('oculto');
      caja.classList.remove('oculto');
    });
    boton.onclick = async () => {
      if (!peticion) return;
      peticion.prompt();
      await peticion.userChoice.catch(() => {});
      peticion = null;
      caja.classList.add('oculto');
    };
    window.addEventListener('appinstalled', () => caja.classList.add('oculto'));
    $('#instalar-cerrar').onclick = () => {
      caja.classList.add('oculto');
      try { localStorage.setItem('mi-bloxels.no-instalar', '1'); } catch (e) { /* sin almacenamiento */ }
    };
  }

  function arrancar() {
    bloquearZoom();
    Almacen.cargar();
    Foto.iniciar();
    Editor.iniciar();
    Personaje.iniciar();
    Mundo.iniciar();
    Juego.iniciarUI();

    $('#btn-nuevo-foto').onclick = () => Foto.abrir((rejilla, foto) => {
      Editor.abrir(nuevoNivel(rejilla, foto), true);
      mostrar('editor');
    }, { titulo: '📸 Nivel desde foto', volverA: 'inicio' });
    $('#btn-nuevo-personaje').onclick = () => {
      Personaje.abrir({
        id: nuevoId(),
        nombre: 'Personaje ' + (Almacen.datos.personajes.length + 1),
        fotogramas: { quieto: rejillaVacia(), andar: null, saltar: null },
        creado: Date.now(),
      }, false);
      mostrar('personaje');
    };
    // Un nivel vacío no tiene nada que perder: no cuenta como "cambios sin guardar" hasta que se pinta
    $('#btn-nuevo-vacio').onclick = () => { Editor.abrir(nuevoNivel(), false); mostrar('editor'); };
    $('#btn-nuevo-juego').onclick = () => {
      if (!Almacen.datos.niveles.length) { alert('Primero crea algún nivel 🧱'); return; }
      Mundo.abrir({ id: nuevoId(), nombre: 'Juego ' + (Almacen.datos.juegos.length + 1), salas: [], inicio: null });
      mostrar('mundo');
    };
    $('#btn-exportar').onclick = exportar;
    $('#input-importar').onchange = async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const r = Almacen.importar(await f.text());
        alert(`Copia restaurada: ${r.niveles} niveles, ${r.juegos} juegos y ${r.personajes} personajes.`);
        pintarInicio();
      } catch (err) {
        alert('No se ha podido restaurar: ' + err.message);
      }
    };
    // El iPhone no deja poner una web a pantalla completa: ahí se oculta el botón
    const raiz = document.documentElement;
    const pedir = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
    const salirPC = document.exitFullscreen || document.webkitExitFullscreen;
    if (!pedir || !(document.fullscreenEnabled || document.webkitFullscreenEnabled) || estaInstalada()) {
      $('#btn-pantalla-completa').classList.add('oculto');
    }
    $('#btn-pantalla-completa').onclick = () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) salirPC.call(document);
        else Promise.resolve(pedir.call(raiz)).catch(() => {});
      } catch (e) { /* no disponible */ }
    };
    prepararApp();
    mostrar('inicio');
  }

  document.addEventListener('DOMContentLoaded', arrancar);
  return { mostrar, probarNivel, pantalla: () => pantalla };
})();
