import assert from 'node:assert/strict';
import {
  cajaAnteriorDesdeFilasCierre,
  arrastreDesdeFilasCierre,
  borrariaCajaChicaAbarrotes,
  reconciliarArrastreAbarrotes,
} from './cajaChicaArrastre.js';

// Normalización de sucursal se cubre en el repo canónico (store + constants).
// Aquí se valida el arrastre puro que evita el quiebre Fusión.

assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { turno: 'RECOLECCION', caja_actual: 999 },
    { turno: 'DIURNO', caja_actual: 1850.5, detalle: {} },
  ]),
  1850.5,
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

assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { deleted_at: '2026-09-01', turno: 'DIURNO', caja_actual: 500 },
    { turno: 'DIURNO', caja_actual: 310 },
  ]),
  310,
);

assert.equal(cajaAnteriorDesdeFilasCierre([]), null);
assert.equal(cajaAnteriorDesdeFilasCierre([{ turno: 'RECOLECCION', caja_actual: 100 }]), null);

assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { turno: 'DIURNO', detalle: { caja_chica: 420, caja_anterior: 999 } },
  ]),
  420,
);
assert.equal(
  cajaAnteriorDesdeFilasCierre([
    { turno: 'DIURNO', detalle: { caja_anterior: 999 } },
  ]),
  null,
);

// Caso incidente: AB-186 entregó 1136; un default no debe poder pisarlo.
assert.equal(
  borrariaCajaChicaAbarrotes(
    { caja_anterior: 1136, fondo_fijo: 300 },
    { caja_anterior: 0, fondo_fijo: 0, venta: 0 },
  ),
  true,
);

assert.deepEqual(
  arrastreDesdeFilasCierre([
    { turno: 'Turno diurno', caja_actual: 1136, detalle: { fondo_fijo: 300 } },
  ]),
  { caja_anterior: 1136, fondo_fijo: 300 },
);

{
  const { estado, cambio } = reconciliarArrastreAbarrotes(
    { caja_anterior: 0, fondo_fijo: 0, venta: 952 },
    { caja_anterior: 1136, fondo_fijo: 300 },
  );
  assert.equal(cambio, true);
  assert.equal(estado.caja_anterior, 1136);
  assert.equal(estado.fondo_fijo, 300);
}

console.log('cajaChicaFusion.ok');
