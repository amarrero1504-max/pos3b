import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');

const venta = readFileSync(join(dir, 'ventaEnRuta.js'), 'utf8');
assert.ok(venta.includes('limpiarSiFallaRegistroEfectivo'), 'debe revertir venta si falla el tránsito de efectivo');
assert.ok(
  venta.includes('La venta se revirtió para no dejar efectivo sin registrar'),
  'mensaje claro al usuario cuando el efectivo no entra a Pendientes',
);
assert.ok(
  !/if \(!tr\.ok\) \{\s*await enlazarVenta\(\);/.test(venta),
  'ya no debe dejar la venta enlazada sin tránsito cuando falla el efectivo',
);

const sql = readFileSync(join(root, 'supabase/fix_ruta_cxc_pagos_atomicos.sql'), 'utf8');
assert.ok(
  /'En Tránsito','Cobro Crédito','Crédito ruta cobrado'/.test(sql),
  'cobro de crédito de ruta debe tiparse Cobro Crédito (no Venta Ruta)',
);
assert.ok(
  !/'En Tránsito','Venta Ruta','Crédito ruta cobrado'/.test(sql),
  'no debe insertar cobros de crédito como Venta Ruta',
);

const repair = readFileSync(join(root, 'supabase/repair_efectivo_ruta_registro.sql'), 'utf8');
assert.ok(repair.includes("tipo_movimiento = 'Cobro Crédito'"));
assert.ok(repair.includes('metodo_pago'));

console.log('efectivoRutaRegistro.test.mjs OK');
