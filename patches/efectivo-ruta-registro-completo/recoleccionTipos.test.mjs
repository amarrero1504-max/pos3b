import assert from 'node:assert/strict';
import {
  esCreditoCobrado,
  etiquetaCobroRecoleccion,
  separarCreditosYEfectivo,
} from './recoleccionTipos.js';

assert.equal(esCreditoCobrado({ tipo_movimiento: 'Cobro Crédito' }), true);
assert.equal(esCreditoCobrado({ tipo_movimiento: 'Entrega Crédito' }), true);
assert.equal(esCreditoCobrado({ tipo_movimiento: 'Venta Ruta', num_traspaso: 'CXC-55-P' }), true);
assert.equal(esCreditoCobrado({ tipo_movimiento: 'Recolección', descripcion_gasto: 'Crédito cobrado' }), true);
assert.equal(
  esCreditoCobrado({ tipo_movimiento: 'Cobro Crédito', descripcion_gasto: 'Crédito ruta cobrado' }),
  true,
);
assert.equal(
  esCreditoCobrado({ tipo_movimiento: 'Venta Ruta', descripcion_gasto: 'Crédito ruta cobrado' }),
  true,
);
assert.equal(
  esCreditoCobrado({
    tipo_movimiento: 'Venta Ruta',
    num_traspaso: 'VR-ABC-E',
    descripcion_gasto: 'Venta en ruta · efectivo en tránsito',
  }),
  false,
);
assert.equal(esCreditoCobrado({ tipo_movimiento: 'Recolección', num_traspaso: '123' }), false);
assert.equal(etiquetaCobroRecoleccion({ tipo_movimiento: 'Venta Ruta' }), 'Efectivo mercancía');
assert.equal(etiquetaCobroRecoleccion({ tipo_movimiento: 'Cobro Crédito' }), 'Crédito cobrado');

const r = separarCreditosYEfectivo([
  { tipo_movimiento: 'Venta Ruta', monto: 370 },
  { tipo_movimiento: 'Cobro Crédito', monto: 570.5 },
  { tipo_movimiento: 'Recolección', monto: 100 },
  { tipo_movimiento: 'Cobro Crédito', num_traspaso: 'CXC-1', monto: 1471, descripcion_gasto: 'Crédito ruta cobrado' },
]);
assert.equal(r.totalCreditos, 2041.5);
assert.equal(r.totalEfectivo, 470);
assert.equal(r.total, 2511.5);
assert.equal(r.creditos.length, 2);
assert.equal(r.efectivo.length, 2);

// Pantalla del 27-oct: solo cobros de crédito → Efectivo mercancía = $0 (esperado si no hubo venta de contado).
const pantalla = separarCreditosYEfectivo([
  { tipo_movimiento: 'Cobro Crédito', monto: 1471, sucursal: 'FUSION' },
  { tipo_movimiento: 'Cobro Crédito', monto: 1200, sucursal: '3B6' },
  { tipo_movimiento: 'Cobro Crédito', monto: 578, sucursal: '3B7' },
  { tipo_movimiento: 'Cobro Crédito', monto: 500, sucursal: '3B5' },
]);
assert.equal(pantalla.totalCreditos, 3749);
assert.equal(pantalla.totalEfectivo, 0);
assert.equal(pantalla.total, 3749);

console.log('recoleccionTipos.test.mjs OK');
