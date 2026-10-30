import assert from 'node:assert/strict';
import {
  arrastreDesdeFilasCierre,
  borrariaCajaChicaAbarrotes,
  cajaAnteriorDesdeFilasCierre,
  estadoAbarrotesVacio,
  reconciliarArrastreAbarrotes,
} from './cajaChicaArrastre.js';

// --- Wipe detection (Fusión AB-186→AB-187) ---
assert.equal(
  borrariaCajaChicaAbarrotes(
    { caja_anterior: 1136, fondo_fijo: 300, venta: 0 },
    { caja_anterior: 0, fondo_fijo: 0, venta: 0, tarjeta: 0, faltante: 0, recoleccion: 0 },
  ),
  true,
);

// Post-cierre legítimo (caja arrastrada, venta en 0) NO es wipe.
assert.equal(
  borrariaCajaChicaAbarrotes(
    { caja_anterior: 48, fondo_fijo: 300, venta: 1338 },
    { caja_anterior: 1136, fondo_fijo: 300, venta: 0, tarjeta: 0, faltante: 0, recoleccion: 0 },
  ),
  false,
);

// Recolección total con fondo intacto: no bloquea.
assert.equal(
  borrariaCajaChicaAbarrotes(
    { caja_anterior: 1136, fondo_fijo: 300 },
    { caja_anterior: 0, fondo_fijo: 300, venta: 0 },
  ),
  false,
);

assert.equal(estadoAbarrotesVacio({}), true);
assert.equal(estadoAbarrotesVacio({ caja_anterior: 10 }), false);

// --- Reconciliar arrastre aunque ya haya venta ---
{
  const { estado, cambio } = reconciliarArrastreAbarrotes(
    { caja_anterior: 0, fondo_fijo: 0, venta: 500 },
    { caja_anterior: 1136, fondo_fijo: 300 },
  );
  assert.equal(cambio, true);
  assert.equal(estado.caja_anterior, 1136);
  assert.equal(estado.fondo_fijo, 300);
  assert.equal(estado.venta, 500);
}

// Si ya hay caja abierta, no pisar con el cierre.
{
  const { estado, cambio } = reconciliarArrastreAbarrotes(
    { caja_anterior: 200, fondo_fijo: 300, venta: 100 },
    { caja_anterior: 1136, fondo_fijo: 300 },
  );
  assert.equal(cambio, false);
  assert.equal(estado.caja_anterior, 200);
}

// Restaurar también saldos negativos del cierre anterior.
{
  const { estado, cambio } = reconciliarArrastreAbarrotes(
    { caja_anterior: 0, fondo_fijo: 0 },
    { caja_anterior: -440, fondo_fijo: 0 },
  );
  assert.equal(cambio, true);
  assert.equal(estado.caja_anterior, -440);
}

// --- Filas de cierre (compat + arrastre) ---
assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { turno: 'RECOLECCION', caja_actual: 999 },
    { turno: 'DIURNO', caja_actual: 1850.5, detalle: {} },
  ]),
  1850.5,
);

assert.deepEqual(
  arrastreDesdeFilasCierre([
    {
      turno: 'Turno diurno',
      caja_actual: 1136,
      detalle: { fondo_fijo: 300, tipo_cierre: 'cierre' },
    },
  ]),
  { caja_anterior: 1136, fondo_fijo: 300 },
);

assert.equal(
  cajaAnteriorDesdeFilasCierre([
    {
      turno: 'NOCTURNO',
      caja_actual: 0,
      detalle: { caja_anterior: 1940, recoleccion: '1940', tipo_cierre: 'cierre' },
    },
    { turno: 'NOCTURNO', caja_actual: 1940, detalle: {} },
  ]),
  0,
);

console.log('cajaChicaArrastre.ok');
