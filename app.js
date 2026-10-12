/* Agenda Isabel — app del iPhone (PWA)
 * Todo en hora de Madrid. Los datos viven en la hoja de Google de Daniel;
 * la clave se escribe una vez en cada iPhone y no está en este código.
 * Usa las funciones de parser.js (interpretar, hoyMadrid, fechaLarga…).
 */
'use strict';

const API = 'https://script.google.com/macros/s/AKfycbzVH0s4MHjfH50HQnPandgVEtyL-q036agcPir_SIomSYOCZA514_-BrD6cK5h7TlkJfw/exec';
const VERSION = '1.0.7';
const LS_CLAVE = 'agendaIsabel.clave';
const LS_DATOS = 'agendaIsabel.datos';

// ------------------------------------------------------------------ ESTADO

let clave = leerLS(LS_CLAVE) || '';
let datos = leerJSON(LS_DATOS) || { citas: [], recetas: [], compra: [], varios: [] };
let tab = 'inicio';
const pasadasAbiertas = { medico: false, ocio: false };
let recetaAbierta = null;
let hojaActual = null; // { tipo:'apuntar'|'editar', ... }
let reconocimiento = null;

const TABS = [
  { id: 'inicio', nombre: 'Inicio' },
  { id: 'medico', nombre: 'Médico' },
  { id: 'ocio', nombre: 'Ocio' },
  { id: 'compra', nombre: 'Compra' },
  { id: 'varios', nombre: 'Varios' },
  { id: 'recetas', nombre: 'Recetas' }
];

const SECCIONES = [
  { id: 'medico', nombre: 'Médico' },
  { id: 'ocio', nombre: 'Ocio' },
  { id: 'compra', nombre: 'Compra' },
  { id: 'varios', nombre: 'Varios' },
  { id: 'receta', nombre: 'Receta' }
];

const SVG = function (cuerpo, tam) {
  tam = tam || 26;
  return '<svg aria-hidden="true" width="' + tam + '" height="' + tam + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + cuerpo + '</svg>';
};
const ICONOS = {
  inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  medico: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  ocio: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M15 7v10"/>',
  compra: '<path d="M3 4h2l2.4 11h11.2L21 8H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  varios: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>',
  recetas: '<path d="M4 10h16v3a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z"/><path d="M9 3v4M15 3v4"/>',
  micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  abajo: '<path d="M6 9l6 6 6-6"/>',
  arriba: '<path d="M6 15l6-6 6 6"/>',
  derecha: '<path d="M9 6l6 6-6 6"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  chincheta: '<path d="M9 4h6l-1 6 4 3H6l4-3z"/><path d="M12 13v7"/>'
};

// --------------------------------------------------------------- UTILIDADES

function leerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function escribirLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
function borrarLS(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
function leerJSON(k) { try { return JSON.parse(leerLS(k) || 'null'); } catch (e) { return null; } }

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const $ = function (sel, raiz) { return (raiz || document).querySelector(sel); };

const DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function horaMadrid() { return +Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm').slice(11, 13); }

function cuandoCita(c) {
  if (!c.fecha) return c.hora ? 'Sin fecha · ' + c.hora : 'Sin fecha';
  return fechaLarga(c.fecha) + (c.hora ? ' · ' + c.hora : '');
}

function cuandoNota(creado) {
  const f = String(creado || '').slice(0, 10);
  if (!partesFecha(f)) return '';
  const hoy = hoyMadrid();
  if (f === hoy) return 'Hoy';
  if (f === sumarDias(hoy, -1)) return 'Ayer';
  const p = partesFecha(f);
  return p.d + ' ' + MESES_CORTOS[p.m - 1] + (p.a !== partesFecha(hoy).a ? ' ' + p.a : '');
}

function ordenar(citas) {
  return citas.slice().sort(function (a, b) {
    return ((a.fecha || '9999') + (a.hora || '99')).localeCompare((b.fecha || '9999') + (b.hora || '99'));
  });
}

let temporizadorAviso = null;
function avisar(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.remove('oculto');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(function () { el.classList.add('oculto'); }, 2800);
}

// ---------------------------------------------------------------------- API

let pendientes = 0;
function api(accion, extra) {
  pendientes++;
  $('#cargando').classList.remove('oculto');
  const control = new AbortController();
  const limite = setTimeout(function () { control.abort(); }, 25000);
  // Cuerpo como texto simple: así Google no exige permisos CORS extra.
  return fetch(API, {
    method: 'POST',
    body: JSON.stringify(Object.assign({ clave: clave, accion: accion }, extra || {})),
    signal: control.signal
  })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j.ok) {
        const err = new Error(j.error || 'Error');
        err.deServidor = true;
        throw err;
      }
      return j.resultado;
    })
    .catch(function (e) {
      if (!e.deServidor) e.message = 'No hay conexión. Inténtalo otra vez.';
      throw e;
    })
    .finally(function () {
      clearTimeout(limite);
      pendientes--;
      if (!pendientes) $('#cargando').classList.add('oculto');
    });
}

function guardarCache() { escribirLS(LS_DATOS, JSON.stringify(datos)); }

function cargar(silencioso) {
  if (!clave) return Promise.resolve();
  return api('listar')
    .then(function (r) { datos = r; guardarCache(); if (puedeRepintar()) render(); })
    .catch(function (e) {
      if (/clave/i.test(e.message)) { olvidarClave(); return; }
      if (!silencioso) avisar('Sin conexión: se muestra lo último guardado');
    });
}

/** No repintar mientras se escribe en la pantalla (se perdería lo escrito). */
function puedeRepintar() {
  const a = document.activeElement;
  return !(a && $('#contenido').contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'));
}

function olvidarClave() {
  clave = '';
  borrarLS(LS_CLAVE);
  render();
}

// ---------------------------------------------------------------- PANTALLAS

function render() {
  const cont = $('#contenido');
  if (!clave) {
    $('#barra').classList.add('oculto');
    $('#apuntar-fab').classList.add('oculto');
    cont.innerHTML = pantallaConfig();
    return;
  }
  $('#barra').classList.remove('oculto');
  $('#apuntar-fab').classList.toggle('oculto', tab === 'compra');
  renderBarra();
  if (tab === 'inicio') cont.innerHTML = pantallaInicio();
  else if (tab === 'medico' || tab === 'ocio') cont.innerHTML = pantallaCitas(tab);
  else if (tab === 'compra') cont.innerHTML = pantallaCompra();
  else if (tab === 'varios') cont.innerHTML = pantallaVarios();
  else if (tab === 'recetas') { cont.innerHTML = pantallaRecetas(); filtrarRecetas(); }
}

function renderBarra() {
  $('#barra .dentro').innerHTML = TABS.map(function (t) {
    return '<button type="button" data-tab="' + t.id + '" class="' + (t.id === tab ? 'activo' : '') + '"' +
      (t.id === tab ? ' aria-current="page"' : '') + '>' + SVG(ICONOS[t.id]) + t.nombre + '</button>';
  }).join('');
}

function cabecera(id, nombre) {
  return '<div class="cabecera"><div class="icono-seccion ' + id + '">' + SVG(ICONOS[id], 28) + '</div><h1>' + nombre + '</h1></div>';
}

function pantallaConfig() {
  return '<div class="config">' +
    '<div class="marca">AGENDA ISABEL</div>' +
    '<h1 style="font-size:32px">Bienvenida</h1>' +
    '<p>Escribe la clave de la agenda. Solo hace falta hacerlo una vez en este iPhone.</p>' +
    '<label class="etiqueta" for="campo-clave">Clave</label>' +
    '<input id="campo-clave" class="campo" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">' +
    '<p id="error-clave" class="error oculto"></p>' +
    '<button type="button" class="boton-principal" data-accion="entrar">Entrar</button>' +
    '</div>';
}

function tarjetaCita(c) {
  const p = partesFecha(c.fecha);
  const sub = [c.hora, c.lugar].filter(Boolean).join(' · ');
  return '<button type="button" class="cita ' + c.seccion + '" data-accion="editar-cita" data-id="' + esc(c.id) + '">' +
    '<div class="dia"><div class="ds">' + (p ? DIAS_CORTOS[diaSemana(c.fecha)] : '') + '</div><div class="dn">' + (p ? p.d : '—') + '</div></div>' +
    '<div class="info"><div class="t">' + esc(c.titulo) + '</div>' +
    (sub ? '<div class="s">' + esc(sub) + '</div>' : '') +
    '<div class="etq">' + (c.seccion === 'medico' ? 'MÉDICO' : 'OCIO') + '</div></div></button>';
}

function pantallaInicio() {
  const hoy = hoyMadrid();
  const fin = sumarDias(hoy, 6);
  const citas = ordenar(datos.citas || []);
  const deHoy = citas.filter(function (c) { return c.fecha === hoy; });
  const semana = citas.filter(function (c) { return c.fecha > hoy && c.fecha <= fin; });
  const despues = citas.filter(function (c) { return c.fecha > fin; });
  const sinFecha = citas.filter(function (c) { return !c.fecha; });
  const h = horaMadrid();
  const saludo = h >= 6 && h < 14 ? 'Buenos días' : h >= 14 && h < 21 ? 'Buenas tardes' : 'Buenas noches';

  let html = '<div class="marca">AGENDA ISABEL</div>' +
    '<div class="saludo">' + saludo + ', Isabel</div>' +
    '<div class="fecha-hoy">' + fechaLarga(hoy) + '</div>' +
    '<h2 class="titulo-bloque" style="margin-top:0">Hoy</h2><div class="lista">' +
    (deHoy.length ? deHoy.map(tarjetaCita).join('') : '<div class="vacio">No tienes nada apuntado para hoy</div>') +
    '</div>';
  if (semana.length) html += '<h2 class="titulo-bloque">Esta semana</h2><div class="lista">' + semana.map(tarjetaCita).join('') + '</div>';
  // Lo de más adelante, separado por meses: "Octubre", "Noviembre", "Enero 2027"…
  const anioHoy = partesFecha(hoy).a;
  let mesActual = '';
  despues.forEach(function (c) {
    const p = partesFecha(c.fecha);
    const clave = p.a + '-' + p.m;
    if (clave !== mesActual) {
      if (mesActual) html += '</div>';
      mesActual = clave;
      const nombre = NOMBRES_MES[p.m - 1];
      const esEsteMes = p.a === anioHoy && p.m === partesFecha(hoy).m;
      const titulo = esEsteMes ? 'Este mes'
        : nombre.charAt(0).toUpperCase() + nombre.slice(1) + (p.a !== anioHoy ? ' ' + p.a : '');
      html += '<h2 class="titulo-bloque">' + titulo + '</h2><div class="lista">';
    }
    html += tarjetaCita(c);
  });
  if (mesActual) html += '</div>';
  if (sinFecha.length) html += '<h2 class="titulo-bloque">Sin fecha</h2><div class="lista">' + sinFecha.map(tarjetaCita).join('') + '</div>';
  html += '<button type="button" class="enlace-config" data-accion="ajustes">Ajustes</button>' +
    '<div style="text-align:center;font-size:13px;color:var(--suave);margin-top:6px">Versión ' + VERSION + '</div>';
  return html;
}

function tarjetaCitaLarga(c, pasada) {
  return '<button type="button" class="cita-larga ' + c.seccion + (pasada ? ' pasada' : '') + '" data-accion="editar-cita" data-id="' + esc(c.id) + '">' +
    '<div class="cuando">' + esc(cuandoCita(c)) + '</div>' +
    '<div class="t">' + esc(c.titulo) + '</div>' +
    (c.lugar ? '<div class="s">' + esc(c.lugar) + '</div>' : '') +
    (c.notas ? '<div class="nota">' + esc(c.notas) + '</div>' : '') +
    '</button>';
}

function pantallaCitas(sec) {
  const hoy = hoyMadrid();
  const todas = ordenar((datos.citas || []).filter(function (c) { return c.seccion === sec; }));
  const proximas = todas.filter(function (c) { return !c.fecha || c.fecha >= hoy; });
  const pasadas = todas.filter(function (c) { return c.fecha && c.fecha < hoy; }).reverse();
  const nombre = sec === 'medico' ? 'Médico' : 'Ocio';
  let html = cabecera(sec, nombre) +
    '<h2 class="titulo-bloque" style="margin-top:0">' + (sec === 'medico' ? 'Próximas citas' : 'Próximos planes') + '</h2><div class="lista">' +
    (proximas.length ? proximas.map(function (c) { return tarjetaCitaLarga(c, false); }).join('')
      : '<div class="vacio">No hay nada apuntado. Pulsa «Apuntar» para añadir.</div>') + '</div>';
  if (pasadas.length) {
    const abierta = pasadasAbiertas[sec];
    html += '<button type="button" class="plegable" data-accion="pasadas" data-sec="' + sec + '" aria-expanded="' + abierta + '">' +
      '<span>' + (sec === 'medico' ? 'Citas pasadas' : 'Planes pasados') + ' (' + pasadas.length + ')</span>' +
      SVG(abierta ? ICONOS.arriba : ICONOS.abajo, 22) + '</button>';
    if (abierta) html += '<div class="lista" style="margin-top:12px">' + pasadas.map(function (c) { return tarjetaCitaLarga(c, true); }).join('') + '</div>';
  }
  return html;
}

function pantallaCompra() {
  const lista = datos.compra || [];
  const pendientesC = lista.filter(function (p) { return !p.comprado; });
  const hechos = lista.filter(function (p) { return p.comprado; });
  const fila = function (p) {
    return '<button type="button" class="producto' + (p.comprado ? ' hecho' : '') + '" data-accion="marcar" data-id="' + esc(p.id) + '" aria-pressed="' + p.comprado + '">' +
      '<span class="casilla" aria-hidden="true">' + (p.comprado ? SVG(ICONOS.check, 18) : '') + '</span>' + esc(p.producto) + '</button>';
  };
  let html = cabecera('compra', 'La compra') +
    '<div class="fila-anadir"><input id="nuevo-producto" class="campo" type="text" placeholder="Añadir: leche, pan…" aria-label="Añadir a la lista" enterkeyhint="done" autocomplete="off">' +
    '<button type="button" id="boton-compra" class="boton-cuadrado" data-accion="dictar-compra" aria-label="Añadir por voz">' + SVG(ICONOS.micro) + '</button></div>' +
    '<h2 class="titulo-bloque pequeno" style="color:var(--compra)">POR COMPRAR (' + pendientesC.length + ')</h2>' +
    (pendientesC.length ? '<div class="caja-lista">' + pendientesC.map(fila).join('') + '</div>' : '<div class="vacio">La lista está vacía</div>');
  if (hechos.length) {
    html += '<div class="fila-titulo"><h2 class="titulo-bloque pequeno" style="color:var(--suave)">EN EL CARRO (' + hechos.length + ')</h2>' +
      '<button type="button" class="boton-suave" data-accion="quitar-comprados">Quitar tachados</button></div>' +
      '<div class="caja-lista carro">' + hechos.map(fila).join('') + '</div>';
  }
  return html;
}

function pantallaVarios() {
  const notas = (datos.varios || []).slice().sort(function (a, b) {
    if (a.fijada !== b.fijada) return a.fijada ? -1 : 1;
    return String(b.creado).localeCompare(String(a.creado));
  });
  const fijadas = notas.filter(function (n) { return n.fijada; });
  const resto = notas.filter(function (n) { return !n.fijada; });
  const tarjeta = function (n) {
    const cuando = cuandoNota(n.creado);
    return '<button type="button" class="nota-varios' + (n.fijada ? ' fijada' : '') + '" data-accion="editar-varios" data-id="' + esc(n.id) + '">' +
      '<span>' + esc(n.texto) + '</span>' + (cuando && !n.fijada ? '<span class="cuando">' + cuando + '</span>' : '') + '</button>';
  };
  let html = cabecera('varios', 'Varios');
  if (!notas.length) return html + '<div class="vacio">Aquí puedes apuntar lo que quieras. Pulsa «Apuntar».</div>';
  if (fijadas.length) {
    html += '<h2 class="titulo-bloque pequeno" style="color:var(--varios);margin-top:0;display:flex;align-items:center;gap:8px">' + SVG(ICONOS.chincheta, 20) + 'FIJADAS</h2>' +
      '<div class="lista">' + fijadas.map(tarjeta).join('') + '</div>';
  }
  if (resto.length) {
    html += '<h2 class="titulo-bloque pequeno" style="color:var(--suave)' + (fijadas.length ? '' : ';margin-top:0') + '">NOTAS</h2>' +
      '<div class="lista">' + resto.map(tarjeta).join('') + '</div>';
  }
  return html;
}

function pantallaRecetas() {
  const recetas = (datos.recetas || []).slice().sort(function (a, b) { return a.titulo.localeCompare(b.titulo, 'es'); });
  let html = cabecera('recetas', 'Recetas');
  if (!recetas.length) return html + '<div class="vacio">Todavía no hay recetas. Pulsa «Apuntar» y di, por ejemplo, «receta de lentejas».</div>';
  html += '<div class="buscador">' + SVG(ICONOS.buscar, 24) +
    '<input id="buscar-receta" class="campo" type="search" placeholder="Buscar receta o ingrediente" aria-label="Buscar receta" autocomplete="off"></div>' +
    '<div class="lista">';
  recetas.forEach(function (r) {
    const abierta = recetaAbierta === r.id;
    const buscable = normalizar(r.titulo + ' ' + r.ingredientes + ' ' + r.preparacion);
    html += '<div class="receta" data-busqueda="' + esc(buscable) + '">' +
      '<button type="button" class="cab" data-accion="abrir-receta" data-id="' + esc(r.id) + '" aria-expanded="' + abierta + '"><span>' + esc(r.titulo) + '</span>' +
      SVG(abierta ? ICONOS.arriba : ICONOS.derecha, 22) + '</button>';
    if (abierta) {
      if (r.ingredientes) html += '<div class="sub">INGREDIENTES</div><div class="txt">' + esc(r.ingredientes) + '</div>';
      if (r.preparacion) html += '<div class="sub">PREPARACIÓN</div><div class="txt">' + esc(r.preparacion) + '</div>';
      html += '<button type="button" class="boton-suave" style="align-self:flex-start" data-accion="editar-receta" data-id="' + esc(r.id) + '">Editar receta</button>';
    }
    html += '</div>';
  });
  html += '<div id="sin-resultados" class="vacio oculto">No hay ninguna receta con eso</div></div>';
  return html;
}

let textoBusqueda = '';
function filtrarRecetas() {
  const campo = $('#buscar-receta');
  if (!campo) return;
  campo.value = textoBusqueda;
  const q = normalizar(textoBusqueda.trim());
  let visibles = 0;
  document.querySelectorAll('.receta').forEach(function (el) {
    const ok = !q || el.getAttribute('data-busqueda').indexOf(q) >= 0;
    el.classList.toggle('oculto', !ok);
    if (ok) visibles++;
  });
  $('#sin-resultados').classList.toggle('oculto', visibles > 0);
}

// ------------------------------------------------------- HOJA: APUNTAR / EDITAR

function abrirHoja(estado) {
  hojaActual = estado;
  const hoja = $('#hoja');
  hoja.innerHTML = '<div class="dentro">' + contenidoHoja() + '</div>';
  hoja.classList.remove('oculto');
  hoja.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function cerrarHoja() {
  pararDictado();
  hojaActual = null;
  $('#hoja').classList.add('oculto');
  $('#hoja').innerHTML = '';
  document.body.style.overflow = '';
}

function enMadrid() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone === ZONA; } catch (e) { return true; }
}

function contenidoHoja() {
  const h = hojaActual;
  const titulo = h.tipo === 'apuntar' ? 'Apuntar' : 'Editar';
  let html = '<div class="hoja-cab"><h1>' + titulo + '</h1>' +
    '<button type="button" class="cerrar" data-accion="cerrar-hoja" aria-label="Cerrar">' + SVG(ICONOS.cerrar, 24) + '</button></div>';
  if (!enMadrid() && (h.seccion === 'medico' || h.seccion === 'ocio' || h.tipo === 'apuntar')) {
    html += '<div class="aviso-madrid">Fechas y horas en hora de Madrid</div>';
  }
  if (h.tipo === 'apuntar') {
    html += '<button type="button" id="boton-micro" class="micro" data-accion="dictar" aria-label="Dictar por voz">' + SVG(ICONOS.micro, 44) + '</button>' +
      '<label class="etiqueta" for="texto-dictado" style="margin-bottom:-6px">Lo que has dicho</label>' +
      '<textarea id="texto-dictado" class="area" rows="2" placeholder="Pulsa el micrófono o escribe aquí">' + esc(h.texto) + '</textarea>';
  }
  html += '<div class="tarjeta-propuesta" id="propuesta">' + contenidoPropuesta() + '</div>';
  html += '<div class="pie-hoja">' +
    '<button type="button" class="boton-principal" data-accion="guardar-hoja">' + (h.tipo === 'apuntar' ? 'Guardar' : 'Guardar cambios') + '</button>';
  if (h.tipo === 'editar') html += '<button type="button" class="boton-borrar" data-accion="borrar-hoja">Borrar</button>';
  html += '<button type="button" class="boton-texto" data-accion="cerrar-hoja">Cancelar</button></div>';
  return html;
}

function contenidoPropuesta() {
  const h = hojaActual;
  const c = h.campos;
  let html = '';
  let opciones = SECCIONES;
  if (h.tipo === 'editar') opciones = h.tabla === 'citas' ? SECCIONES.slice(0, 2) : [];
  if (h.tipo === 'apuntar') html += '<div style="font-size:18px;font-weight:700">He entendido esto:</div>';
  if (opciones.length) {
    html += '<div class="chips" style="grid-template-columns:repeat(' + opciones.length + ',minmax(0,1fr))">' + opciones.map(function (s) {
      const sel = s.id === h.seccion;
      return '<button type="button" class="chip' + (sel ? ' sel' : '') + '" data-accion="elegir-seccion" data-sec="' + s.id + '" aria-pressed="' + sel + '">' + s.nombre + '</button>';
    }).join('') + '</div>';
  }
  const fila = function (id, etiqueta, tipo, valor, falta) {
    return '<div class="fila-campo' + (falta ? ' falta' : '') + '"><label for="f-' + id + '">' + etiqueta + '</label>' +
      '<input id="f-' + id + '" data-campo="' + id + '" type="' + tipo + '" value="' + esc(valor) + '" autocomplete="off"></div>';
  };
  const area = function (id, etiqueta, valor, filas, clase) {
    return '<div style="display:flex;flex-direction:column;gap:6px"><label class="etiqueta" for="f-' + id + '">' + etiqueta + '</label>' +
      '<textarea id="f-' + id + '" data-campo="' + id + '" class="' + (clase || 'area') + '" rows="' + filas + '">' + esc(valor) + '</textarea></div>';
  };
  if (h.seccion === 'medico' || h.seccion === 'ocio') {
    html += '<div style="display:flex;flex-direction:column;gap:8px">' +
      fila('titulo', 'Qué', 'text', c.titulo) +
      fila('fecha', 'Día', 'date', c.fecha, !c.fecha) +
      fila('hora', 'Hora', 'time', c.hora) +
      fila('lugar', 'Dónde', 'text', c.lugar) + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px"><label class="etiqueta" for="f-notas">Notas</label>' +
      '<textarea id="f-notas" data-campo="notas" class="notas" rows="2" placeholder="Lo que quieras: llevar los análisis, pedir un Uber…">' + esc(c.notas) + '</textarea></div>';
  } else if (h.seccion === 'compra') {
    html += area('productos', 'Productos (uno por línea)', c.productos, 4);
  } else if (h.seccion === 'varios') {
    html += area('texto', 'Nota', c.texto, 4);
    if (h.tipo === 'editar') {
      html += '<label class="interruptor"><span>Fijar arriba</span><input type="checkbox" data-campo="fijada"' + (c.fijada ? ' checked' : '') + '></label>';
    }
  } else if (h.seccion === 'receta') {
    html += fila('titulo', 'Título', 'text', c.titulo) +
      area('ingredientes', 'Ingredientes', c.ingredientes, 5) +
      area('preparacion', 'Preparación', c.preparacion, 5);
  }
  return html;
}

function camposVacios() {
  return { titulo: '', fecha: '', hora: '', lugar: '', notas: '', productos: '', texto: '', ingredientes: '', preparacion: '', fijada: false };
}

function abrirApuntar(seccion, dictarYa) {
  const porDefecto = seccion || { medico: 'medico', ocio: 'ocio', varios: 'varios', recetas: 'receta', compra: 'compra' }[tab] || '';
  abrirHoja({
    tipo: 'apuntar',
    texto: '',
    seccion: porDefecto || 'varios',
    forzada: !!porDefecto, // desde una sección, ya viene elegida
    campos: camposVacios(),
    tocados: {}
  });
  // Desde el micro de Compra: empieza a escuchar directamente.
  if (dictarYa) dictarEnHoja();
}

function dictarEnHoja() {
  dictar($('#texto-dictado'), $('#boton-micro'), null, ' ');
}

/** Rellena la propuesta a partir de lo dictado, sin pisar lo que se haya corregido a mano. */
function interpretarDictado() {
  const h = hojaActual;
  if (!h || h.tipo !== 'apuntar') return;
  const texto = h.texto.trim();
  const anterior = h.seccion;
  const p = interpretar(texto, h.forzada ? h.seccion : null, hoyMadrid());
  if (!h.forzada) h.seccion = texto ? p.seccion : 'varios';
  const nuevo = {};
  if (h.seccion === 'medico' || h.seccion === 'ocio') {
    nuevo.titulo = texto ? p.titulo : '';
    nuevo.fecha = p.fecha || '';
    nuevo.hora = p.hora || '';
    nuevo.lugar = p.lugar || '';
  } else if (h.seccion === 'compra') {
    nuevo.productos = (p.productos || []).join('\n');
  } else if (h.seccion === 'varios') {
    nuevo.texto = texto;
  } else if (h.seccion === 'receta') {
    nuevo.titulo = texto ? p.titulo : '';
  }
  Object.keys(nuevo).forEach(function (k) { if (!h.tocados[k]) h.campos[k] = nuevo[k]; });

  if (anterior !== h.seccion) {
    $('#propuesta').innerHTML = contenidoPropuesta();
  } else {
    Object.keys(nuevo).forEach(function (k) {
      const el = $('#f-' + k);
      if (el && !h.tocados[k] && el.value !== h.campos[k]) el.value = h.campos[k];
      if (k === 'fecha' && el) el.parentNode.classList.toggle('falta', !h.campos.fecha);
    });
  }
}

function abrirEditarCita(id) {
  const c = (datos.citas || []).find(function (x) { return x.id === id; });
  if (!c) return;
  const campos = Object.assign(camposVacios(), {
    titulo: c.titulo, fecha: c.fecha, hora: c.hora, lugar: c.lugar, notas: c.notas
  });
  abrirHoja({ tipo: 'editar', tabla: 'citas', id: id, seccion: c.seccion, campos: campos, tocados: {} });
}

function abrirEditarVarios(id) {
  const n = (datos.varios || []).find(function (x) { return x.id === id; });
  if (!n) return;
  abrirHoja({ tipo: 'editar', tabla: 'varios', id: id, seccion: 'varios',
    campos: Object.assign(camposVacios(), { texto: n.texto, fijada: n.fijada }), tocados: {} });
}

function abrirEditarReceta(id) {
  const r = (datos.recetas || []).find(function (x) { return x.id === id; });
  if (!r) return;
  abrirHoja({ tipo: 'editar', tabla: 'recetas', id: id, seccion: 'receta',
    campos: Object.assign(camposVacios(), { titulo: r.titulo, ingredientes: r.ingredientes, preparacion: r.preparacion }), tocados: {} });
}

function guardarHoja(boton) {
  pararDictado();
  const h = hojaActual;
  const c = h.campos;
  let promesa, mensaje;

  if (h.seccion === 'medico' || h.seccion === 'ocio') {
    const d = {
      seccion: h.seccion,
      titulo: c.titulo.trim() || (h.seccion === 'medico' ? 'Cita médica' : 'Plan'),
      fecha: c.fecha, hora: c.hora, lugar: c.lugar.trim(), notas: c.notas.trim()
    };
    promesa = h.tipo === 'apuntar'
      ? api('crear', { tabla: 'citas', datos: d }).then(function (r) { datos.citas.push(r); })
      : api('actualizar', { tabla: 'citas', id: h.id, datos: d }).then(function (r) { reemplazar('citas', r); });
    mensaje = 'Guardado en ' + (h.seccion === 'medico' ? 'Médico' : 'Ocio') + (d.fecha ? ' · ' + fechaLarga(d.fecha) : '');
  } else if (h.seccion === 'compra') {
    const productos = c.productos.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!productos.length) { avisar('Escribe o dicta algún producto'); return; }
    promesa = api('anadirCompra', { productos: productos }).then(function (r) { datos.compra = datos.compra.concat(r); });
    mensaje = productos.length === 1 ? 'Añadido a la compra' : 'Añadidos ' + productos.length + ' productos a la compra';
  } else if (h.seccion === 'varios') {
    if (!c.texto.trim()) { avisar('La nota está vacía'); return; }
    const d = { texto: c.texto.trim(), fijada: !!c.fijada };
    promesa = h.tipo === 'apuntar'
      ? api('crear', { tabla: 'varios', datos: d }).then(function (r) { datos.varios.push(r); })
      : api('actualizar', { tabla: 'varios', id: h.id, datos: d }).then(function (r) { reemplazar('varios', r); });
    mensaje = 'Guardado en Varios';
  } else if (h.seccion === 'receta') {
    if (!c.titulo.trim()) { avisar('Ponle un título a la receta'); return; }
    const d = { titulo: c.titulo.trim(), ingredientes: c.ingredientes.trim(), preparacion: c.preparacion.trim() };
    promesa = h.tipo === 'apuntar'
      ? api('crear', { tabla: 'recetas', datos: d }).then(function (r) { datos.recetas.push(r); recetaAbierta = r.id; })
      : api('actualizar', { tabla: 'recetas', id: h.id, datos: d }).then(function (r) { reemplazar('recetas', r); });
    mensaje = 'Receta guardada';
  }

  boton.disabled = true;
  boton.textContent = 'Guardando…';
  promesa.then(function () {
    guardarCache();
    cerrarHoja();
    render();
    if (!soltarMicro(mensaje)) avisar(mensaje);
  }).catch(function (e) {
    boton.disabled = false;
    boton.textContent = h.tipo === 'apuntar' ? 'Guardar' : 'Guardar cambios';
    avisar(e.message);
  });
}

function reemplazar(tabla, item) {
  datos[tabla] = datos[tabla].map(function (x) { return x.id === item.id ? item : x; });
}

function borrarHoja() {
  const h = hojaActual;
  if (!window.confirm('¿Seguro que quieres borrarlo?')) return;
  api('borrar', { tabla: h.tabla, id: h.id }).then(function () {
    datos[h.tabla] = datos[h.tabla].filter(function (x) { return x.id !== h.id; });
    guardarCache();
    cerrarHoja();
    render();
    avisar('Borrado');
  }).catch(function (e) { avisar(e.message); });
}

// ------------------------------------------------------------------- COMPRA

function anadirProductosDesdeCampo() {
  const campo = $('#nuevo-producto');
  const texto = campo.value.trim();
  if (!texto) return;
  const p = interpretar(texto, 'compra', hoyMadrid());
  const productos = p.productos.length ? p.productos : [texto];
  campo.value = '';
  actualizarBotonCompra();
  api('anadirCompra', { productos: productos }).then(function (r) {
    datos.compra = datos.compra.concat(r);
    guardarCache();
    render();
    avisar(productos.length === 1 ? 'Añadido' : 'Añadidos ' + productos.length + ' productos');
  }).catch(function (e) { campo.value = texto; actualizarBotonCompra(); avisar(e.message); });
}

function actualizarBotonCompra() {
  const campo = $('#nuevo-producto');
  const boton = $('#boton-compra');
  if (!campo || !boton) return;
  const hayTexto = !!campo.value.trim();
  boton.setAttribute('data-accion', hayTexto ? 'anadir-compra' : 'dictar-compra');
  boton.setAttribute('aria-label', hayTexto ? 'Añadir a la lista' : 'Añadir por voz');
  boton.innerHTML = SVG(hayTexto ? ICONOS.mas : ICONOS.micro);
}

function marcarProducto(id) {
  const p = datos.compra.find(function (x) { return x.id === id; });
  if (!p) return;
  p.comprado = !p.comprado;
  render();
  api('actualizar', { tabla: 'compra', id: id, datos: { comprado: p.comprado } })
    .then(function () { guardarCache(); })
    .catch(function (e) { p.comprado = !p.comprado; render(); avisar(e.message); });
}

function quitarComprados() {
  const antes = datos.compra;
  datos.compra = antes.filter(function (p) { return !p.comprado; });
  render();
  api('quitarComprados').then(function () { guardarCache(); })
    .catch(function (e) { datos.compra = antes; render(); avisar(e.message); });
}

// ------------------------------------------------------------------ DICTADO

let temporizadorSilencio = null;
let temporizadorMaximo = null;
let microUsado = false;
const SS_RESTAURAR = 'agendaIsabel.restaurar';

function esIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * En el iPhone, una web que ha usado el dictado no suelta el micrófono
 * aunque se le mande parar (fallo de iOS). Lo único que lo libera es
 * cerrar la página, así que la app se recarga ella sola, guardando antes
 * lo que había en pantalla para dejarlo exactamente igual.
 * Devuelve true si va a recargar.
 */
function soltarMicro(aviso) {
  if (!microUsado || !esIOS()) { microUsado = false; return false; }
  microUsado = false;
  try {
    sessionStorage.setItem(SS_RESTAURAR, JSON.stringify({
      tab: tab,
      hoja: hojaActual ? JSON.parse(JSON.stringify(hojaActual)) : null,
      aviso: aviso || ''
    }));
  } catch (e) { /* sin almacenamiento: se recarga igualmente */ }
  setTimeout(function () { location.reload(); }, 350);
  return true;
}

function restaurarTrasSoltarMicro() {
  let estado = null;
  try {
    estado = JSON.parse(sessionStorage.getItem(SS_RESTAURAR) || 'null');
    sessionStorage.removeItem(SS_RESTAURAR);
  } catch (e) { estado = null; }
  return estado;
}

/**
 * Apaga el micrófono del todo. En el iPhone, "stop" a veces deja el
 * micrófono encendido; "abort" lo suelta en el momento.
 */
function pararDictado() {
  clearTimeout(temporizadorSilencio);
  clearTimeout(temporizadorMaximo);
  const r = reconocimiento;
  reconocimiento = null;
  if (r) {
    r.onresult = r.onerror = r.onend = null;
    try { r.abort(); } catch (e) { try { r.stop(); } catch (e2) { /* nada */ } }
  }
  document.querySelectorAll('.escuchando').forEach(function (el) { el.classList.remove('escuchando'); });
}

/**
 * Dicta con el reconocimiento de voz del navegador. Si el iPhone no lo
 * permite dentro de la app, se abre el teclado para usar su micrófono.
 */
function dictar(campo, boton, alTerminar, separador) {
  if (reconocimiento) { pararDictado(); soltarMicro(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const usarTeclado = function (msg) {
    pararDictado();
    campo.focus();
    avisar(msg || 'Toca el micrófono del teclado para dictar');
  };
  if (!SR) { usarTeclado(); return; }
  let r;
  try { r = new SR(); } catch (e) { usarTeclado(); return; }
  reconocimiento = r;
  r.lang = 'es-ES';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  const base = campo.value.trim();
  let huboTexto = false;
  boton.classList.add('escuchando');

  // El iPhone no siempre deja de escuchar solo: se apaga tras unos segundos
  // de silencio, y como mucho al minuto.
  const terminar = function () {
    if (reconocimiento !== r) return;
    const habiaTexto = huboTexto;
    pararDictado();
    if (habiaTexto && alTerminar) alTerminar();
    soltarMicro();
  };
  const esperarSilencio = function (ms) {
    clearTimeout(temporizadorSilencio);
    temporizadorSilencio = setTimeout(terminar, ms);
  };
  esperarSilencio(7000);                       // margen para empezar a hablar
  temporizadorMaximo = setTimeout(terminar, 60000);

  r.onresult = function (ev) {
    esperarSilencio(2500);                     // 2,5 s sin hablar = fin
    // Cada pausa al hablar llega como un trozo aparte; se unen con espacios
    // y la compra se separa después por palabras.
    const trozos = [];
    for (let i = 0; i < ev.results.length; i++) {
      const s = ev.results[i][0].transcript.trim();
      if (s) trozos.push(s);
    }
    let t = trozos.join(separador || ' ');
    if (t) huboTexto = true;
    campo.value = (base ? base + ' ' : '') + t;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  };
  r.onerror = function (ev) {
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'audio-capture') {
      usarTeclado('No tengo permiso para el micrófono: usa el del teclado');
    } else if (ev.error === 'no-speech') {
      avisar('No te he oído. Pulsa el micrófono y habla');
    }
  };
  r.onend = terminar;
  try { r.start(); microUsado = true; } catch (e) { usarTeclado(); }
}

// ------------------------------------------------------------------ EVENTOS

document.addEventListener('click', function (e) {
  const tabBtn = e.target.closest('#barra button[data-tab]');
  if (tabBtn) {
    tab = tabBtn.getAttribute('data-tab');
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (e.target.closest('#apuntar-fab')) { abrirApuntar(); return; }

  const el = e.target.closest('[data-accion]');
  if (!el) return;
  const id = el.getAttribute('data-id');
  switch (el.getAttribute('data-accion')) {
    case 'entrar': entrar(); break;
    case 'ajustes': ajustes(); break;
    case 'editar-cita': abrirEditarCita(id); break;
    case 'editar-varios': abrirEditarVarios(id); break;
    case 'editar-receta': abrirEditarReceta(id); break;
    case 'abrir-receta': recetaAbierta = recetaAbierta === id ? null : id; render(); break;
    case 'pasadas': {
      const sec = el.getAttribute('data-sec');
      pasadasAbiertas[sec] = !pasadasAbiertas[sec];
      render();
      break;
    }
    case 'marcar': marcarProducto(id); break;
    case 'quitar-comprados': quitarComprados(); break;
    case 'anadir-compra': anadirProductosDesdeCampo(); break;
    case 'dictar-compra': abrirApuntar('compra', true); break;
    case 'dictar': dictarEnHoja(); break;
    case 'cerrar-hoja': cerrarHoja(); soltarMicro(); break;
    case 'guardar-hoja': guardarHoja(el); break;
    case 'borrar-hoja': borrarHoja(); break;
    case 'elegir-seccion': {
      const h = hojaActual;
      h.seccion = el.getAttribute('data-sec');
      h.forzada = true;
      if (h.tipo === 'apuntar') {
        // Al cambiar de sección se vuelve a interpretar lo dictado en la nueva.
        h.tocados = {};
        h.campos = Object.assign(camposVacios(), { notas: h.campos.notas });
        $('#propuesta').innerHTML = contenidoPropuesta();
        interpretarDictado();
      } else {
        $('#propuesta').innerHTML = contenidoPropuesta();
      }
      break;
    }
  }
});

document.addEventListener('input', function (e) {
  const t = e.target;
  if (t.id === 'texto-dictado' && hojaActual) {
    hojaActual.texto = t.value;
    interpretarDictado();
  } else if (t.hasAttribute && t.hasAttribute('data-campo') && hojaActual) {
    const k = t.getAttribute('data-campo');
    hojaActual.campos[k] = t.type === 'checkbox' ? t.checked : t.value;
    hojaActual.tocados[k] = true;
    if (k === 'fecha') t.parentNode.classList.toggle('falta', !t.value);
  } else if (t.id === 'nuevo-producto') {
    actualizarBotonCompra();
  } else if (t.id === 'buscar-receta') {
    textoBusqueda = t.value;
    filtrarRecetas();
  }
});
document.addEventListener('change', function (e) {
  const t = e.target;
  if (t.type === 'checkbox' && t.hasAttribute('data-campo') && hojaActual) {
    hojaActual.campos[t.getAttribute('data-campo')] = t.checked;
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'nuevo-producto') { e.preventDefault(); anadirProductosDesdeCampo(); }
  if (e.target.id === 'campo-clave') { e.preventDefault(); entrar(); }
});

function entrar() {
  const campo = $('#campo-clave');
  const err = $('#error-clave');
  const valor = campo.value.trim();
  if (!valor) return;
  clave = valor;
  err.classList.add('oculto');
  api('listar').then(function (r) {
    escribirLS(LS_CLAVE, clave);
    datos = r;
    guardarCache();
    tab = 'inicio';
    render();
  }).catch(function (e) {
    clave = '';
    err.textContent = /clave/i.test(e.message) ? 'Esa clave no es correcta' : e.message;
    err.classList.remove('oculto');
  });
}

function ajustes() {
  const ok = window.confirm('Agenda Isabel ' + VERSION + '\n\n¿Quieres quitar la clave de este iPhone? Tendrás que volver a escribirla.');
  if (ok) olvidarClave();
}

// ------------------------------------------------------------------- INICIO

/** Instalación con enlace: .../#clave=XXXX  (lo que va tras # no sale del iPhone) */
function claveDesdeEnlace() {
  const m = /[#&]clave=([^&]+)/.exec(location.hash);
  if (!m) return false;
  clave = decodeURIComponent(m[1]);
  escribirLS(LS_CLAVE, clave);
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}

(function iniciar() {
  claveDesdeEnlace();
  const previo = restaurarTrasSoltarMicro();
  if (previo && previo.tab) tab = previo.tab;
  render();
  if (previo && previo.hoja && clave) abrirHoja(previo.hoja);
  if (previo && previo.aviso) avisar(previo.aviso);
  cargar(true);
  window.addEventListener('hashchange', function () {
    if (claveDesdeEnlace()) { render(); cargar(); }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      if (!soltarMicro()) cargar(true); // si se usó el micro al salir, se libera al volver
    } else {
      pararDictado(); // al salir de la app, el dictado se para
    }
  });
  window.addEventListener('pagehide', pararDictado);
  setInterval(function () {
    if (document.visibilityState === 'visible' && !hojaActual) cargar(true);
  }, 60000);

  if ('serviceWorker' in navigator) {
    // Cuando llega una versión nueva de la app, se recarga una vez para usarla.
    const habiaControlador = !!navigator.serviceWorker.controller;
    let recargada = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (habiaControlador && !recargada && !hojaActual) { recargada = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(function (reg) {
        // Busca actualizaciones cada vez que se vuelve a la app
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') reg.update().catch(function () {});
        });
      })
      .catch(function () { /* sin modo offline */ });
  }
})();
