'use strict';

// Ventanas de pregunta propias, en lugar de confirm()/prompt() del navegador:
// botones grandes y con textos claros, que funcionan igual en ordenador, iPad y Android
const Dialogo = (() => {
  let fondo, texto, entrada, botones, resolver = null, cancelar = null, abiertoEn = 0;

  function preparar() {
    if (fondo) return;
    fondo = $('#dialogo');
    texto = $('#dialogo-texto');
    entrada = $('#dialogo-entrada');
    botones = $('#dialogo-botones');
    document.addEventListener('keydown', e => {
      if (!resolver) return;
      if (e.key === 'Escape') { e.preventDefault(); cerrar(cancelar); }
      else if (e.key === 'Enter' && document.activeElement === entrada) { e.preventDefault(); cerrar(entrada.value); }
    }, true);
  }

  // opciones: [{ texto, valor, clase }]; valor puede ser una función que se evalúa al pulsar
  function abrir(mensaje, opciones, { conEntrada = false, valor = '', alCancelar = null } = {}) {
    preparar();
    if (resolver) cerrar(cancelar);
    return new Promise(res => {
      resolver = res;
      cancelar = alCancelar;
      abiertoEn = performance.now();
      texto.textContent = mensaje;
      entrada.classList.toggle('oculto', !conEntrada);
      entrada.value = valor;
      botones.innerHTML = '';
      opciones.forEach(o => {
        const b = document.createElement('button');
        b.className = 'btn grande ' + (o.clase || '');
        b.textContent = o.texto;
        b.onclick = () => {
          // En pantallas táctiles el mismo toque que abre la ventana no debe pulsar un botón
          if (performance.now() - abiertoEn < 350) return;
          cerrar(typeof o.valor === 'function' ? o.valor() : o.valor);
        };
        botones.appendChild(b);
      });
      fondo.classList.remove('oculto');
      if (conEntrada) { entrada.focus(); entrada.select(); }
    });
  }

  function cerrar(v) {
    const r = resolver;
    resolver = null;
    fondo.classList.add('oculto');
    if (r) r(v);
  }

  function confirmar(mensaje, { si = 'Sí', no = 'No', peligro = false } = {}) {
    return abrir(mensaje, [
      { texto: no, valor: false },
      { texto: si, valor: true, clase: peligro ? 'rojo' : 'verde' },
    ], { alCancelar: false });
  }

  function pedirTexto(mensaje, valor = '') {
    return abrir(mensaje, [
      { texto: 'Cancelar', valor: null },
      { texto: '✅ Aceptar', valor: () => entrada.value, clase: 'verde' },
    ], { conEntrada: true, valor, alCancelar: null });
  }

  // Al pulsar «Volver» con cambios sin guardar. guardar() devuelve true si se ha guardado.
  async function salirConCambios(sucio, guardar, salir) {
    if (!sucio) { salir(); return; }
    const r = await abrir('Tienes cambios sin guardar. ¿Qué quieres hacer?', [
      { texto: 'Seguir editando', valor: 'seguir' },
      { texto: 'Salir sin guardar', valor: 'salir', clase: 'rojo' },
      { texto: '💾 Guardar y salir', valor: 'guardar', clase: 'verde' },
    ], { alCancelar: 'seguir' });
    if (r === 'guardar') { if (guardar()) salir(); }
    else if (r === 'salir') salir();
  }

  return { abrir, confirmar, pedirTexto, salirConCambios };
})();
