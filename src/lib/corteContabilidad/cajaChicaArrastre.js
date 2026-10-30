/**
 * Arrastre de caja chica (Abarrotes): helpers puros para no perder el saldo
 * entre turnos cuando un cliente pisa el estado abierto con defaults.
 */

export function round2Caja(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function montoPositivo(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0.001 ? round2Caja(v) : null;
}

function absMonto(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.abs(v) : 0;
}

/** ¿El estado abierto parece el default vacío de Abarrotes (sin movimiento)? */
export function estadoAbarrotesVacio(estado) {
  if (!estado || typeof estado !== 'object') return true;
  return (
    absMonto(estado.caja_anterior) < 0.001
    && absMonto(estado.fondo_fijo) < 0.001
    && absMonto(estado.venta) < 0.001
    && absMonto(estado.tarjeta) < 0.001
    && absMonto(estado.faltante) < 0.001
    && absMonto(estado.recoleccion) < 0.001
    && absMonto(estado.recoleccion_turno) < 0.001
  );
}

/**
 * True si guardar `next` borraría un arrastre válido que ya estaba en nube.
 * Cubre el caso Fusión AB-186→AB-187: post-cierre con $1136 pisado por defaults.
 */
export function borrariaCajaChicaAbarrotes(prevEstado, nextEstado) {
  if (!prevEstado || !nextEstado) return false;
  const prevCaja = Number(prevEstado.caja_anterior) || 0;
  const prevFondo = Number(prevEstado.fondo_fijo) || 0;
  const prevTeniaArrastre = Math.abs(prevCaja) > 0.001 || prevFondo > 0.001;
  if (!prevTeniaArrastre) return false;
  return estadoAbarrotesVacio(nextEstado);
}

/**
 * Extrae arrastre (caja + fondo) desde filas de cierre (sin RECOLECCIÓN).
 * `caja_actual` del cierre es autoritativo (incluido 0).
 */
export function arrastreDesdeFilasCierre(rows) {
  for (const h of rows || []) {
    if (h?.deleted_at) continue;
    const turno = String(h.turno || h.detalle?.tipo_cierre || '').toUpperCase();
    if (turno.includes('RECOLEC')) continue;
    const d = h.detalle || {};

    if (h.caja_actual != null && h.caja_actual !== '') {
      const v = Number(h.caja_actual);
      if (Number.isFinite(v)) {
        const fondoRaw = d.fondo_fijo;
        const fondo =
          fondoRaw != null && fondoRaw !== '' && Number.isFinite(Number(fondoRaw))
            ? round2Caja(fondoRaw)
            : null;
        return { caja_anterior: round2Caja(v), fondo_fijo: fondo };
      }
    }

    const desdeDet =
      montoPositivo(d.caja_anterior_siguiente)
      ?? montoPositivo(d.caja_chica)
      ?? montoPositivo(d.caja_actual);
    if (desdeDet != null) {
      const fondoRaw = d.fondo_fijo;
      const fondo =
        fondoRaw != null && fondoRaw !== '' && Number.isFinite(Number(fondoRaw))
          ? round2Caja(fondoRaw)
          : null;
      return { caja_anterior: desdeDet, fondo_fijo: fondo };
    }

    return null;
  }
  return null;
}

/** Compat: solo el monto de caja arrastrable. */
export function cajaAnteriorDesdeFilasCierre(rows) {
  const a = arrastreDesdeFilasCierre(rows);
  return a ? a.caja_anterior : null;
}

/**
 * Si el estado abierto tiene caja_anterior≈0 pero el último cierre dejó otro
 * saldo, hay que restaurar (aunque ya hayan capturado venta).
 * También rellena fondo_fijo si quedó en 0 y el cierre lo traía.
 */
export function reconciliarArrastreAbarrotes(estado, arrastre) {
  if (!arrastre || typeof arrastre !== 'object') {
    return { estado, cambio: false };
  }
  const actual = Number(estado?.caja_anterior) || 0;
  const objetivo = Number(arrastre.caja_anterior);
  if (!Number.isFinite(objetivo)) return { estado, cambio: false };

  let next = { ...estado };
  let cambio = false;

  // Restaurar si abierto está en ~0 y el cierre dejó un saldo distinto de 0.
  if (Math.abs(actual) < 0.001 && Math.abs(objetivo) > 0.001) {
    next.caja_anterior = round2Caja(objetivo);
    cambio = true;
  }

  const fondoActual = Number(estado?.fondo_fijo) || 0;
  const fondoObj = arrastre.fondo_fijo;
  if (
    Math.abs(fondoActual) < 0.001
    && fondoObj != null
    && Number(fondoObj) > 0.001
  ) {
    next.fondo_fijo = round2Caja(fondoObj);
    cambio = true;
  }

  return { estado: cambio ? next : estado, cambio };
}
