import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, 'rtCuentas.js'), 'utf8');
const match = src.match(/export const TIPOS_LIQUIDACION_RT = \[([\s\S]*?)\];/);
assert.ok(match, 'TIPOS_LIQUIDACION_RT debe exportarse');
const tipos = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
assert.ok(tipos.includes('Venta Ruta'), 'Venta Ruta debe acreditarse a cuenta RT al sellar / importar históricos');
assert.ok(tipos.includes('Cobro Crédito'));
assert.ok(tipos.includes('Cobro Servicio'));
assert.equal(new Set(tipos).size, tipos.length);

console.log('rtCuentas.tiposLiquidacion.test.mjs OK');
