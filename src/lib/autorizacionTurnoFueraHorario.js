import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { rolSistemaEfectivo } from './roles.js';
import { normalizarPinComparacion } from './cubreTurno.js';
import { usuarioEstaActivo } from './usuariosAuth.js';

export const LS_AUTORIZACION_TURNO_FH = 'pos3b_autorizacion_turno_fh';
export const DURACION_AUTORIZACION_TURNO_MS = 8 * 60 * 60 * 1000;
/** Tope de autorizaciones vigentes en este equipo (evita QuotaExceeded). */
const MAX_AUTORIZACIONES_LOCAL = 40;
const MAX_AUTORIZACIONES_EMERGENCIA = 5;

export const AVISO_FALTA_AUTORIZACION_TURNO_FH =
  'Ejecuta supabase/fix_autorizacion_turno_fuera_horario.sql para autorizar entrada fuera de horario desde el panel admin (nube).';

export const AVISO_CUOTA_AUTORIZACION_LOCAL =
  'Almacenamiento del celular lleno: la autorización quedó en la nube; el empleado ya puede entrar. Limpia caché del POS si el aviso se repite.';

/**
 * Caché en memoria (sesión actual). Si localStorage está lleno, igual
 * sirve para autorizar login en este dispositivo sin tumbar la aprobación.
 */
const memoriaAuth = new Map(); // clave → entry

/** Roles que pueden autorizar entrada fuera de horario (login / checador). */
export function rolPuedeAutorizarFueraHorario(rol) {
  const r = rolSistemaEfectivo(rol);
  return r === 'Administrador' || r === 'Gerente';
}

function claveAutorizacion(usuarioId, sucursal) {
  return `${String(usuarioId)}|${normalizarCodigoTienda(sucursal)}`;
}

function limpiarExpiradas(lista, ahora = Date.now()) {
  return (lista || []).filter((a) => Number(a?.expiraEn) > ahora);
}

function esErrorCuota(err) {
  const name = String(err?.name || '');
  const msg = String(err?.message || err || '');
  return (
    name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || /quota|exceeded|storage/i.test(msg)
  );
}

/** Quita claves temporales pesadas para liberar cuota (sin tocar sesión/tienda/auth). */
function liberarEspacioTemporalLocal() {
  if (typeof localStorage === 'undefined') return 0;
  const preservar = new Set([
    LS_AUTORIZACION_TURNO_FH,
    'pos3b_sucursal',
    'pos3b_tienda_bloqueada',
    'pos3b_dispositivo_id',
    'pos3b_privilegios',
    'pos3b_sesion_persistente_movil_v1',
    'pos3b_login_biometrico_v1',
  ]);
  let borradas = 0;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const clave of keys) {
      if (!clave.startsWith('pos3b_')) continue;
      if (preservar.has(clave)) continue;
      if (clave.startsWith('pos3b_turnos_caja')) continue;
      if (clave.startsWith('pos3b_carrito_')) continue;
      if (clave.startsWith('pos3b_resultado_inv_')) continue;
      if (
        /movim|auditor|historial|reporte|correccion|ajuste|ruta_auditor|offline|cache|favoritos|buffer/i.test(clave)
        || clave.includes('_espera')
        || clave.includes('consolid')
      ) {
        try {
          localStorage.removeItem(clave);
          borradas += 1;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return borradas;
}

function slimAuthEntry(a) {
  return {
    clave: String(a.clave || ''),
    usuarioId: String(a.usuarioId || ''),
    sucursal: String(a.sucursal || ''),
    adminId: String(a.adminId || ''),
    adminNombre: String(a.adminNombre || 'Administrador').slice(0, 80),
    otorgadoEn: Number(a.otorgadoEn) || 0,
    expiraEn: Number(a.expiraEn) || 0,
  };
}

function podarAutorizaciones(lista, max = MAX_AUTORIZACIONES_LOCAL) {
  const vigentes = limpiarExpiradas(lista)
    .map(slimAuthEntry)
    .filter((a) => a.clave && a.expiraEn > 0);
  if (vigentes.length <= max) return vigentes;
  vigentes.sort((a, b) => (a.expiraEn || 0) - (b.expiraEn || 0));
  return vigentes.slice(-max);
}

function faltaTablaAuthFh(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('pos_autorizacion_turno_fh') ||
    (msg.includes('schema cache') && msg.includes('autorizacion_turno'))
  );
}

function actualizarMemoria(lista) {
  const ahora = Date.now();
  for (const [k, v] of [...memoriaAuth.entries()]) {
    if (!v || Number(v.expiraEn) <= ahora) memoriaAuth.delete(k);
  }
  for (const a of limpiarExpiradas(lista, ahora)) {
    const e = slimAuthEntry(a);
    if (e.clave) memoriaAuth.set(e.clave, e);
  }
}

function leerSoloLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LS_AUTORIZACION_TURNO_FH);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? limpiarExpiradas(list) : [];
  } catch {
    return [];
  }
}

export function leerAutorizacionesTurnoFueraHorario() {
  const ahora = Date.now();
  const fromLs = leerSoloLocalStorage();
  const fromMem = [...memoriaAuth.values()].filter((a) => Number(a?.expiraEn) > ahora);
  const map = new Map();
  for (const a of fromLs) {
    const e = slimAuthEntry(a);
    if (e.clave) map.set(e.clave, e);
  }
  for (const a of fromMem) {
    const e = slimAuthEntry(a);
    if (e.clave) map.set(e.clave, e);
  }
  const merged = [...map.values()];
  if (fromLs.length && fromLs.length !== merged.length) {
    // Intentar podar LS sin tumbar lectura
    try {
      localStorage.setItem(LS_AUTORIZACION_TURNO_FH, JSON.stringify(podarAutorizaciones(fromLs)));
    } catch {
      /* ignore */
    }
  }
  return merged;
}

/**
 * Persiste autorizaciones: siempre actualiza memoria; localStorage es best-effort.
 * NUNCA lanza (ni QuotaExceeded).
 * @returns {{ ok: boolean, aviso?: string }}
 */
function escribirAutorizacionesLocal(lista) {
  const podadas = podarAutorizaciones(lista, MAX_AUTORIZACIONES_LOCAL);
  actualizarMemoria(podadas);

  if (typeof localStorage === 'undefined') {
    return { ok: true, aviso: undefined };
  }

  const intentos = [
    podadas,
    podarAutorizaciones(lista, MAX_AUTORIZACIONES_EMERGENCIA),
    podarAutorizaciones(lista, 1),
  ];

  for (let i = 0; i < intentos.length; i += 1) {
    const payload = intentos[i];
    try {
      localStorage.setItem(LS_AUTORIZACION_TURNO_FH, JSON.stringify(payload));
      if (i === 0) return { ok: true };
      return {
        ok: true,
        aviso: 'Almacenamiento local lleno: se conservaron solo autorizaciones recientes en este celular.',
      };
    } catch (err) {
      if (!esErrorCuota(err)) {
        // Memoria ya quedó; no tumbar flujo.
        return { ok: true, aviso: AVISO_CUOTA_AUTORIZACION_LOCAL };
      }
      if (i === 0) liberarEspacioTemporalLocal();
    }
  }

  // Memoria vigente → el login de esta sesión sigue funcionando.
  return { ok: true, aviso: AVISO_CUOTA_AUTORIZACION_LOCAL };
}

export function tieneAutorizacionFueraHorario(user, sucursal, date = new Date()) {
  if (!user?.id || !sucursal) return false;
  const clave = claveAutorizacion(user.id, sucursal);
  const ahora = date.getTime();
  const mem = memoriaAuth.get(clave);
  if (mem && Number(mem.expiraEn) > ahora) return true;
  return leerAutorizacionesTurnoFueraHorario().some((a) => a.clave === clave && a.expiraEn > ahora);
}

/**
 * Otorga autorización en nube (fuente de verdad) + caché local/memoria best-effort.
 * Duración por defecto 8 h; el overlay de solicitud puede pasar 2–12 h.
 * Nunca falla por QuotaExceeded de localStorage.
 */
export async function otorgarAutorizacionFueraHorario({
  usuarioId,
  sucursal,
  admin,
  duracionMs = DURACION_AUTORIZACION_TURNO_MS,
  supabase = null,
} = {}) {
  if (!usuarioId || !sucursal || !admin?.id) return null;
  const ahora = Date.now();
  const expiraEn = ahora + Math.max(15 * 60 * 1000, duracionMs);
  const sid = normalizarCodigoTienda(sucursal);
  const entry = {
    clave: claveAutorizacion(usuarioId, sid),
    usuarioId: String(usuarioId),
    sucursal: sid,
    adminId: String(admin.id),
    adminNombre: String(admin.nombre || 'Administrador'),
    otorgadoEn: ahora,
    expiraEn,
  };

  // 1) Nube primero — es lo que usa el empleado al sincronizar en login.
  let avisoNube = null;
  let nubeOk = !supabase;
  if (supabase) {
    const row = {
      usuario_id: String(usuarioId),
      sucursal_id: sid,
      admin_id: String(admin.id),
      admin_nombre: String(admin.nombre || 'Administrador'),
      otorgado_en: new Date(ahora).toISOString(),
      expira_en: new Date(expiraEn).toISOString(),
    };
    try {
      const { error } = await supabase
        .from('pos_autorizacion_turno_fh')
        .upsert(row, { onConflict: 'usuario_id,sucursal_id' });
      if (error && !faltaTablaAuthFh(error)) {
        console.warn('autorizacion turno FH nube:', error.message);
        avisoNube = error.message;
        nubeOk = false;
      } else {
        nubeOk = true;
        if (error && faltaTablaAuthFh(error)) {
          avisoNube = AVISO_FALTA_AUTORIZACION_TURNO_FH;
        }
      }
    } catch (err) {
      avisoNube = err?.message || String(err);
      nubeOk = false;
    }
  }

  // 2) Memoria + local best-effort (nunca lanza).
  const next = [...leerAutorizacionesTurnoFueraHorario().filter((a) => a.clave !== entry.clave), entry];
  const local = escribirAutorizacionesLocal(next);
  if (local.aviso) entry.avisoLocal = local.aviso;
  if (avisoNube) entry.avisoNube = avisoNube;

  // Sin nube y sin poder persistir: igual devolvemos entry (memoria ya tiene la auth).
  if (!nubeOk && !supabase) {
    return entry;
  }
  return entry;
}

export function revocarAutorizacionFueraHorario(usuarioId, sucursal) {
  const clave = claveAutorizacion(usuarioId, sucursal);
  memoriaAuth.delete(clave);
  const next = leerAutorizacionesTurnoFueraHorario().filter((a) => a.clave !== clave);
  escribirAutorizacionesLocal(next);
}

/** Revoca en local + nube. */
export async function revocarAutorizacionFueraHorarioNube(supabase, usuarioId, sucursal) {
  revocarAutorizacionFueraHorario(usuarioId, sucursal);
  if (!supabase || !usuarioId || !sucursal) return { ok: true };
  const sid = normalizarCodigoTienda(sucursal);
  const { error } = await supabase
    .from('pos_autorizacion_turno_fh')
    .delete()
    .eq('usuario_id', String(usuarioId))
    .eq('sucursal_id', sid);
  if (error && faltaTablaAuthFh(error)) {
    return { ok: true, aviso: AVISO_FALTA_AUTORIZACION_TURNO_FH };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Trae autorización vigente de la nube al local/memoria (antes de validar login).
 * Si localStorage está lleno, igual marca vigente vía memoria.
 */
export async function sincronizarAutorizacionFueraHorarioDesdeNube(supabase, usuarioId, sucursal) {
  if (!supabase || !usuarioId || !sucursal) return { ok: true, vigente: false };
  const sid = normalizarCodigoTienda(sucursal);
  const ahoraIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('pos_autorizacion_turno_fh')
    .select('usuario_id,sucursal_id,admin_id,admin_nombre,otorgado_en,expira_en')
    .eq('usuario_id', String(usuarioId))
    .eq('sucursal_id', sid)
    .gt('expira_en', ahoraIso)
    .maybeSingle();
  if (error) {
    if (faltaTablaAuthFh(error)) return { ok: true, vigente: false, aviso: AVISO_FALTA_AUTORIZACION_TURNO_FH };
    return { ok: false, error: error.message, vigente: false };
  }
  if (!data) return { ok: true, vigente: false };
  const entry = {
    clave: claveAutorizacion(data.usuario_id, data.sucursal_id),
    usuarioId: String(data.usuario_id),
    sucursal: normalizarCodigoTienda(data.sucursal_id),
    adminId: String(data.admin_id || ''),
    adminNombre: String(data.admin_nombre || 'Administrador'),
    otorgadoEn: new Date(data.otorgado_en).getTime(),
    expiraEn: new Date(data.expira_en).getTime(),
  };
  const next = [...leerAutorizacionesTurnoFueraHorario().filter((a) => a.clave !== entry.clave), entry];
  const local = escribirAutorizacionesLocal(next);
  return {
    ok: true,
    vigente: true,
    entry,
    aviso: local.aviso || undefined,
  };
}

/** Lista autorizaciones vigentes (panel admin). */
export async function listarAutorizacionesFueraHorarioVigentes(supabase, { sucursal = null } = {}) {
  if (!supabase) return { ok: false, data: [], error: 'Sin conexión.' };
  const ahoraIso = new Date().toISOString();
  let q = supabase
    .from('pos_autorizacion_turno_fh')
    .select('usuario_id,sucursal_id,admin_id,admin_nombre,otorgado_en,expira_en')
    .gt('expira_en', ahoraIso)
    .order('expira_en', { ascending: true });
  if (sucursal) q = q.eq('sucursal_id', normalizarCodigoTienda(sucursal));
  const { data, error } = await q;
  if (error) {
    if (faltaTablaAuthFh(error)) return { ok: true, data: [], aviso: AVISO_FALTA_AUTORIZACION_TURNO_FH };
    return { ok: false, data: [], error: error.message };
  }
  return { ok: true, data: data || [] };
}

/** Busca administrador/gerente por PIN en cualquier sucursal (para autorizar fuera de horario). */
export async function verificarPinAdministradorGlobal(supabase, pin) {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const p = normalizarPinComparacion(pin);
  if (!p) return { ok: false, error: 'Indica el PIN del administrador.' };

  const variantes = new Set([p]);
  // Variantes frecuentes: ceros a la izquierda / sin ceros (seeds y cajas antiguas).
  if (/^\d+$/.test(p)) {
    const sinCeros = p.replace(/^0+/, '') || '0';
    variantes.add(sinCeros);
    if (p.length < 6) variantes.add(p.padStart(4, '0'));
  }

  let lista = [];
  let lastError = null;
  for (const candidato of variantes) {
    const { data, error } = await supabase.from('usuarios').select('*').eq('pin', candidato);
    if (error) {
      lastError = error;
      continue;
    }
    const hits = (data || []).filter(usuarioEstaActivo);
    if (hits.length) {
      lista = hits;
      break;
    }
    // Conservar inactivos solo si no hay activos en ninguna variante
    if (!lista.length && (data || []).length) lista = data || [];
  }

  if (lastError && !lista.length) return { ok: false, error: lastError.message };

  const activos = lista.filter(usuarioEstaActivo);
  if (!activos.length) {
    if (lista.length) return { ok: false, error: 'Ese usuario está dado de baja.' };
    return { ok: false, error: 'PIN incorrecto.' };
  }

  // Incluye roles personalizados con plantilla Administrador/Gerente.
  const autorizadores = activos.filter((u) => rolPuedeAutorizarFueraHorario(u.rol));
  if (!autorizadores.length) {
    return {
      ok: false,
      error: 'Solo un administrador o gerente puede autorizar la entrada. Verifica que tu usuario tenga ese rol.',
    };
  }
  // Preferir Administrador (sistema) sobre Gerente si hay varios con el mismo PIN.
  const admin = autorizadores.find((u) => rolSistemaEfectivo(u.rol) === 'Administrador') || autorizadores[0];
  return { ok: true, user: admin, nombre: admin.nombre };
}

export function etiquetaAutorizacionActiva(user, sucursal) {
  if (!tieneAutorizacionFueraHorario(user, sucursal)) return null;
  const clave = claveAutorizacion(user.id, sucursal);
  const entry = leerAutorizacionesTurnoFueraHorario().find((a) => a.clave === clave);
  if (!entry) return null;
  const restante = Math.max(0, entry.expiraEn - Date.now());
  const horas = Math.floor(restante / (60 * 60 * 1000));
  const mins = Math.floor((restante % (60 * 60 * 1000)) / (60 * 1000));
  const vigencia = horas > 0 ? `${horas} h ${mins} min` : `${mins} min`;
  return `Entrada autorizada por ${entry.adminNombre} (vigente ${vigencia} más)`;
}

/** Solo tests: limpia caché en memoria. */
export function __resetMemoriaAutorizacionTurnoFhParaTests() {
  memoriaAuth.clear();
}
