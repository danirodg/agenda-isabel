// GENERADO a partir de Code.gs (construir-parser.js). No editar a mano.
// Intérprete de dictado y utilidades de fecha, siempre en hora de Madrid.
'use strict';
const ZONA = 'Europe/Madrid';
const Utilities = {
  formatDate: function (d, tz, formato) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const g = function (t) { return p.find(function (x) { return x.type === t; }).value; };
    const f = g('year') + '-' + g('month') + '-' + g('day');
    return formato === 'yyyy-MM-dd' ? f : f + ' ' + g('hour') + ':' + g('minute');
  }
};

// ------------------------------------------------------------- FECHAS (MADRID)

function hoyMadrid() {
  return Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
}

function ahoraMadrid() {
  return Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm');
}

// Las fechas se guardan como texto "AAAA-MM-DD" (día de Madrid) y se
// calculan con UTC puro: así no hay desfases por zona horaria ni por
// cambios de hora.
function partesFecha(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? { a: +m[1], m: +m[2], d: +m[3] } : null;
}

function fechaTexto(a, m, d) {
  return a + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}

function esFechaValida(s) {
  const p = partesFecha(s);
  if (!p) return false;
  const f = new Date(Date.UTC(p.a, p.m - 1, p.d));
  return f.getUTCFullYear() === p.a && f.getUTCMonth() === p.m - 1 && f.getUTCDate() === p.d;
}

function sumarDias(s, n) {
  const p = partesFecha(s);
  const f = new Date(Date.UTC(p.a, p.m - 1, p.d + n));
  return fechaTexto(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}

/** 0 = domingo … 6 = sábado */
function diaSemana(s) {
  const p = partesFecha(s);
  return new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay();
}

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga(s) {
  const p = partesFecha(s);
  const dia = NOMBRES_DIA[diaSemana(s)];
  return dia.charAt(0).toUpperCase() + dia.slice(1) + ' ' + p.d + ' de ' + NOMBRES_MES[p.m - 1];
}

// ------------------------------------------------------ INTÉRPRETE DE DICTADO

/**
 * Convierte una frase dictada en una propuesta para guardar.
 * Ej.: "Cardiólogo el jueves 23 a las 9 en La Paz"
 *   → { seccion:'medico', titulo:'Cardiólogo', fecha:'2026-10-23', hora:'09:00', lugar:'La Paz' }
 * La app enseña la propuesta y la persona confirma o corrige.
 */
function interpretar(texto, seccionForzada, hoy) {
  hoy = hoy || hoyMadrid();
  const original = String(texto || '').replace(/\s+/g, ' ').trim();
  // Trabajamos con dos copias de igual longitud: el texto original y una
  // versión en minúsculas sin tildes para buscar. Lo que se quita de una se
  // quita de la otra.
  const par = { o: original, n: normalizar(original) };

  const seccion = SECCIONES_VALIDAS.indexOf(seccionForzada) >= 0 ? seccionForzada : detectarSeccion(par.n);

  if (seccion === 'compra') {
    return { seccion: 'compra', productos: separarProductos(par), texto: original };
  }
  if (seccion === 'varios') {
    return { seccion: 'varios', texto: original };
  }
  if (seccion === 'receta') {
    quitarDe(par, /^(?:apunta(?:r)? |anota(?:r)? |guarda(?:r)? )?(?:la |una )?receta (?:de (?:la |el |los |las )?)?/);
    return { seccion: 'receta', titulo: mayuscula(compactar(par).o) || original };
  }

  // --- Hora
  let hora = '';
  let horas = null, minutos = 0, periodo = '';
  const NUM = '(\\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)';
  const reHora = new RegExp('\\ba (?:las|la) ' + NUM +
    '(?:(?::|\\.|h)(\\d{2})| y (media|cuarto)| menos (cuarto)| y (\\d{1,2}))?' +
    '(?: (?:de la|por la) (manana|tarde|noche)| en punto)?\\b');
  let m = quitarDe(par, reHora);
  if (m) {
    horas = numero(m[1]);
    if (m[2]) minutos = +m[2];
    else if (m[3] === 'media') minutos = 30;
    else if (m[3] === 'cuarto') minutos = 15;
    else if (m[4]) { horas -= 1; minutos = 45; }
    else if (m[5]) minutos = +m[5];
    periodo = m[6] || '';
  } else if ((m = quitarDe(par, /\b(\d{1,2}):(\d{2})\b/))) {
    horas = +m[1]; minutos = +m[2];
  } else if (quitarDe(par, /\b(?:a|al) mediodia\b/)) {
    horas = 12; minutos = 0; periodo = 'manana';
  }
  const mPeriodo = quitarDe(par, /\b(?:por|de) la (manana|tarde|noche)\b/);
  if (mPeriodo && !periodo) periodo = mPeriodo[1];
  if (horas !== null) {
    if ((periodo === 'tarde' || periodo === 'noche') && horas < 12) horas += 12;
    else if (!periodo && horas >= 1 && horas <= 6) horas += 12; // "cine a las 6" = 18:00
    if (horas >= 0 && horas <= 23 && minutos >= 0 && minutos <= 59) {
      hora = ('0' + horas).slice(-2) + ':' + ('0' + minutos).slice(-2);
    }
  }

  // --- Fecha
  let fecha = '';
  const DIAS = '(lunes|martes|miercoles|jueves|viernes|sabado|domingo)';
  const MESES = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';

  if (quitarDe(par, /\bpasado manana\b/)) fecha = sumarDias(hoy, 2);
  else if (quitarDe(par, /(?<!la )\bmanana\b/)) fecha = sumarDias(hoy, 1);
  else if (quitarDe(par, /\bhoy\b/)) fecha = hoy;

  if (!fecha && (m = quitarDe(par, /\b(?:el )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    fecha = fechaConDia(hoy, +m[1], +m[2], m[3] ? +m[3] : null);
  }

  if (!fecha) {
    const reDiaNumero = new RegExp('\\b(el (?:dia )?|dia |(?:el )?' + DIAS + ' (?:dia )?)?(\\d{1,2})' +
      '( de ' + MESES + ')?(?: de(?:l)? (\\d{4}))?\\b', 'g');
    let encontrado = null, r;
    while ((r = reDiaNumero.exec(par.n)) !== null) {
      if (r[1] || r[4]) { encontrado = r; break; }
    }
    if (encontrado) {
      quitarRango(par, encontrado.index, encontrado[0].length);
      const mes = encontrado[5] ? numeroMes(encontrado[5]) : null;
      fecha = fechaConDia(hoy, +encontrado[3], mes, encontrado[6] ? +encontrado[6] : null);
    }
  }

  if (!fecha && (m = quitarDe(par, new RegExp('\\b(?:el |este |el proximo |proximo )?' + DIAS + '(?: que viene| proximo)?\\b')))) {
    const objetivo = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].indexOf(m[1]);
    let dif = (objetivo - diaSemana(hoy) + 7) % 7;
    if (dif === 0) dif = 7;
    fecha = sumarDias(hoy, dif);
  }

  // --- Lugar: lo que va detrás del último "en ..."
  compactar(par);
  let lugar = '';
  const reEn = /(?:^| )en /g;
  let ultimoEn = null, e;
  while ((e = reEn.exec(par.n)) !== null) ultimoEn = e;
  if (ultimoEn) {
    const desde = ultimoEn.index + ultimoEn[0].length;
    // "en el centro de salud" → "Centro de salud", pero "en La Paz" → "La Paz"
    const candidato = par.o.slice(desde).trim().replace(/^(?:el|la|los|las) (?=\S)/, '');
    if (candidato && candidato.length <= 60) {
      lugar = mayuscula(candidato);
      quitarRango(par, ultimoEn.index, par.o.length - ultimoEn.index);
    }
  }

  // --- Título: lo que queda, sin muletillas
  [
    /^(?:apunta(?:r)?|anota(?:r)?|recuerda(?:me)?|recordar)(?: que)? /,
    /^(?:tengo|hay)(?: que ir)?(?: (?:al|a la|a))? /,
    /^(?:una )?cita(?: medica)?(?: (?:con|en|del|de|para))?(?: (?:el|la))? /,
    /^(?:al|a la|el|la|a) /
  ].forEach(function (re) { compactar(par); quitarDe(par, re); });
  let cambiado = true;
  while (cambiado) {
    compactar(par);
    cambiado = !!quitarDe(par, / (?:el|la|de|del|a|al|y|con|en|para|por)$/) ||
               !!quitarDe(par, /^(?:el|la|y|a) /);
  }
  const titulo = mayuscula(compactar(par).o.replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')) ||
    (seccion === 'medico' ? 'Cita médica' : 'Plan');

  return {
    seccion: seccion,
    titulo: titulo,
    fecha: fecha,
    hora: hora,
    lugar: lugar,
    faltaFecha: !fecha
  };
}

const SECCIONES_VALIDAS = ['medico', 'ocio', 'receta', 'compra', 'varios'];

function detectarSeccion(n) {
  if (/\b(?:comprar|compra|lista de la compra)\b/.test(n)) return 'compra';
  if (/\breceta\b/.test(n)) return 'receta';
  if (/\b(?:medic[oa]|doctor|doctora|dentista|\w+olog[oa]|analisis|hospital|centro de salud|ambulatorio|clinica|consulta|enfermer[oa]|fisio\w*|oculista|revision|vacuna|radiografia|ecografia|mamografia|resonancia|urgencias)\b/.test(n)) return 'medico';
  if (/\b(?:cine|teatro|concierto|exposicion|museo|cena|cenar|comida|comer|almuerzo|cafe|merienda|vermut|aperitivo|viaje|excursion|opera|zarzuela|baile|fiesta|cumpleanos|boda|quedada|quedar|quedo|paseo|partida|bingo)\b/.test(n)) return 'ocio';
  return 'varios';
}

function separarProductos(par) {
  quitarDe(par, /^(?:apunta(?:r)? |anota(?:r)? |anade |pon )?(?:en la lista(?: de la compra)? )?(?:que )?(?:hay que )?(?:comprar|compra)(?: de)?:? /);
  quitarDe(par, / (?:en|a) la lista(?: de la compra)?$/);
  const texto = compactar(par).o;
  // Si está escrito con comas o en líneas, se respeta tal cual.
  // Dictado sin comas ("leche pan y huevos"): se separa por palabras.
  const trozos = /[,;\n.]/.test(texto)
    ? texto.split(/\s*[,;\n.]\s*|\s+y\s+|\s+e\s+/)
    : separarSinComas(texto);
  return trozos
    .map(function (p) { return mayuscula(p.replace(/^[\s.;:,-]+|[\s.;:,-]+$/g, '')); })
    .filter(function (p) { return p; });
}

// Palabras que unen un producto con la siguiente ("pan DE molde", "agua CON gas")
const UNIONES = ['de', 'del', 'con', 'sin', 'para', 'al', 'a', 'en', 'la', 'el', 'los', 'las'];
// Cantidades ("UNA DOCENA de huevos", "2 KILOS de tomates", "MEDIO kilo")
const CANTIDADES = ['un', 'una', 'uno', 'unos', 'unas', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'medio', 'media', 'cuarto', 'kilo', 'kilos', 'kg', 'gramos', 'g', 'litro', 'litros', 'l',
  'paquete', 'paquetes', 'bote', 'botes', 'lata', 'latas', 'botella', 'botellas', 'docena', 'docenas', 'bolsa', 'bolsas',
  'caja', 'cajas', 'barra', 'barras', 'tarro', 'tarros', 'carton', 'cartones', 'brick', 'bricks', 'pack', 'packs',
  'sobre', 'sobres', 'trozo', 'trozos', 'pieza', 'piezas', 'bandeja', 'bandejas', 'rollo', 'rollos', 'tableta', 'tabletas'];
// Palabras que completan al producto anterior ("leche SEMIDESNATADA", "papel HIGIÉNICO")
const COMPLEMENTOS = ['semidesnatada', 'semidesnatado', 'desnatada', 'desnatado', 'entera', 'entero', 'integral', 'integrales',
  'natural', 'naturales', 'fresca', 'fresco', 'frescas', 'frescos', 'frito', 'frita', 'fritos', 'fritas', 'rallado', 'rallada',
  'molido', 'molida', 'cocido', 'cocida', 'picada', 'picado', 'congelado', 'congelada', 'congelados', 'congeladas',
  'curado', 'curada', 'tierno', 'tierna', 'serrano', 'iberico', 'york', 'cocido', 'manchego', 'azul', 'blanco', 'blanca',
  'blancos', 'blancas', 'negro', 'negra', 'negros', 'negras', 'verde', 'verdes', 'rojo', 'roja', 'rojos', 'rojas',
  'amarillo', 'amarilla', 'virgen', 'extra', 'mineral', 'higienico', 'sin', 'light', 'zero', 'cola', 'griego', 'griegos',
  'camperos', 'campera', 'ecologico', 'ecologica', 'ecologicos', 'ecologicas', 'grande', 'grandes', 'pequeno', 'pequena',
  'pequenos', 'pequenas', 'hidratante', 'liquido', 'liquida', 'dulce', 'salado', 'salada', 'tostado', 'tostada', 'bio'];

function separarSinComas(texto) {
  const palabras = texto.split(/\s+/).filter(function (p) { return p; });
  if (palabras.length < 3) return palabras.length === 2 && /^(y|e)$/i.test(palabras[1]) ? [palabras[0]] : [texto]; // "pan bimbo": un solo producto
  const productos = [];
  let actual = [];
  palabras.forEach(function (p, i) {
    const n = normalizar(p);
    if (n === 'y' || n === 'e') { // "y" siempre separa productos
      if (actual.length) productos.push(actual.join(' '));
      actual = [];
      return;
    }
    const previa = i ? normalizar(palabras[i - 1]) : '';
    const empiezaNuevo = actual.length > 0 &&
      UNIONES.indexOf(previa) < 0 && CANTIDADES.indexOf(previa) < 0 && !/^\d/.test(previa) &&
      UNIONES.indexOf(n) < 0 && COMPLEMENTOS.indexOf(n) < 0;
    if (empiezaNuevo) { productos.push(actual.join(' ')); actual = []; }
    actual.push(p);
  });
  if (actual.length) productos.push(actual.join(' '));
  return productos;
}

function fechaConDia(hoy, dia, mes, anio) {
  const h = partesFecha(hoy);
  if (anio !== null && anio < 100) anio += 2000;
  let candidato;
  if (mes) {
    candidato = fechaTexto(anio || h.a, mes, dia);
    if (!anio && candidato < hoy) candidato = fechaTexto(h.a + 1, mes, dia);
  } else {
    candidato = fechaTexto(h.a, h.m, dia);
    if (candidato < hoy) {
      const sig = h.m === 12 ? { a: h.a + 1, m: 1 } : { a: h.a, m: h.m + 1 };
      candidato = fechaTexto(sig.a, sig.m, dia);
    }
  }
  return esFechaValida(candidato) ? candidato : '';
}

function numero(s) {
  const palabras = { una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
  return palabras[s] || +s;
}

function numeroMes(s) {
  if (s === 'setiembre') return 9;
  return ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'].indexOf(s) + 1;
}

/** Minúsculas sin tildes, misma longitud que el original. */
function normalizar(s) {
  const mapa = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n', 'à': 'a', 'è': 'e', 'ò': 'o' };
  return s.toLowerCase().split('').map(function (c) { return mapa[c] || c; }).join('');
}

function quitarRango(par, desde, largo) {
  par.o = par.o.slice(0, desde) + ' ' + par.o.slice(desde + largo);
  par.n = par.n.slice(0, desde) + ' ' + par.n.slice(desde + largo);
}

function quitarDe(par, re) {
  const m = re.exec(par.n);
  if (!m) return null;
  quitarRango(par, m.index, m[0].length);
  return m;
}

function compactar(par) {
  let o = '', n = '', espacio = false;
  for (let i = 0; i < par.n.length; i++) {
    const esEsp = par.n[i] === ' ';
    if (esEsp && (espacio || n === '')) continue;
    o += par.o[i]; n += par.n[i]; espacio = esEsp;
  }
  if (n.endsWith(' ')) { o = o.slice(0, -1); n = n.slice(0, -1); }
  par.o = o; par.n = n;
  return par;
}

function mayuscula(s) {
  s = String(s || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

