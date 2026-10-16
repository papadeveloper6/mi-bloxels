'use strict';

// Navegación entre pantallas y pantalla de inicio
const App = (() => {
  let pantalla = 'inicio';

  function mostrar(nombre) {
    document.querySelectorAll('.pantalla').forEach(p => p.classList.toggle('oculto', p.id !== 'pantalla-' + nombre));
    pantalla = nombre;
    document.body.dataset.pantalla = nombre;
    if (nombre === 'inicio') pintarInicio();
    window.scrollTo(0, 0);
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
        boton('🗑️', 'rojo', () => {
          if (confirm(`¿Borrar el personaje «${p.nombre}»?`)) { Almacen.borrarPersonaje(p.id); pintarInicio(); }
        }),
      ]);
      lp.appendChild(t);
    });
    lj.innerHTML = juegos.length ? '' : '<p class="vacio">Todavía no hay juegos. Crea niveles y júntalos con «🌍 Nuevo juego».</p>';
    ln.innerHTML = niveles.length ? '' : '<p class="vacio">Todavía no hay niveles. ¡Haz una foto a tu tablero! 📸</p>';

    juegos.forEach(j => lj.appendChild(tarjeta(j.nombre, c => dibujarMiniaturaJuego(c, j), [
      boton('▶ Jugar', 'verde', () => Juego.iniciar(j, () => mostrar('inicio'))),
      boton('✏️', '', () => { Mundo.abrir(j); mostrar('mundo'); }),
      boton('🗑️', 'rojo', () => {
        if (confirm(`¿Borrar el juego «${j.nombre}»?`)) { Almacen.borrarJuego(j.id); pintarInicio(); }
      }),
    ])));

    niveles.forEach(n => ln.appendChild(tarjeta(n.nombre, c => dibujarMiniatura(c, n.rejilla), [
      boton('▶ Probar', 'amarillo', () => probarNivel(n, 'inicio')),
      boton('✏️', '', () => { Editor.abrir(n, false); mostrar('editor'); }),
      boton('🗑️', 'rojo', () => {
        const usos = juegos.filter(j => j.salas.some(s => s.nivelId === n.id)).length;
        const extra = usos ? ` Se quitará de ${usos} juego(s).` : '';
        if (confirm(`¿Borrar el nivel «${n.nombre}»?${extra}`)) { Almacen.borrarNivel(n.id); pintarInicio(); }
      }),
    ])));
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

  function exportar() {
    const blob = new Blob([Almacen.exportar()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mi-bloxels-copia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function arrancar() {
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
      }, true);
      mostrar('personaje');
    };
    $('#btn-nuevo-vacio').onclick = () => { Editor.abrir(nuevoNivel(), true); mostrar('editor'); };
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
    $('#btn-pantalla-completa').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    };
    mostrar('inicio');
  }

  document.addEventListener('DOMContentLoaded', arrancar);
  return { mostrar, probarNivel, pantalla: () => pantalla };
})();
