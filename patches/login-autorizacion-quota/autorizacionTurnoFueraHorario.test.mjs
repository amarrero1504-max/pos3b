import assert from 'node:assert/strict';

const mem = new Map();
let failQuota = false;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    if (failQuota && String(k).includes('autorizacion_turno_fh')) {
      const err = new Error("Failed to execute 'setItem' on 'Storage': Setting the value of 'pos3b_autorizacion_turno_fh' exceeded the quota.");
      err.name = 'QuotaExceededError';
      throw err;
    }
    mem.set(k, String(v));
  },
  removeItem: (k) => { mem.delete(k); },
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
};

const {
  rolPuedeAutorizarFueraHorario,
  otorgarAutorizacionFueraHorario,
  tieneAutorizacionFueraHorario,
  revocarAutorizacionFueraHorario,
  AVISO_CUOTA_AUTORIZACION_LOCAL,
  __resetMemoriaAutorizacionTurnoFhParaTests,
} = await import('./autorizacionTurnoFueraHorario.js');

__resetMemoriaAutorizacionTurnoFhParaTests();

assert.equal(rolPuedeAutorizarFueraHorario('Administrador'), true);
assert.equal(rolPuedeAutorizarFueraHorario('administrador'), true);
assert.equal(rolPuedeAutorizarFueraHorario('Gerente'), true);
assert.equal(rolPuedeAutorizarFueraHorario('Cajero'), false);
assert.equal(rolPuedeAutorizarFueraHorario('Supervisor'), false);
assert.equal(rolPuedeAutorizarFueraHorario('Repartidor'), false);

const user = { id: 'u-cajero-1', nombre: 'Cajero Test' };
const admin = { id: 'u-admin-1', nombre: 'Admin Test' };
const suc = '3B5';

revocarAutorizacionFueraHorario(user.id, suc);
assert.equal(tieneAutorizacionFueraHorario(user, suc), false);

const entry = await otorgarAutorizacionFueraHorario({
  usuarioId: user.id,
  sucursal: suc,
  admin,
  duracionMs: 60 * 60 * 1000,
});
assert.ok(entry);
assert.equal(tieneAutorizacionFueraHorario(user, suc), true);
assert.equal(tieneAutorizacionFueraHorario(user, 'FUSION'), false);

revocarAutorizacionFueraHorario(user.id, suc);
assert.equal(tieneAutorizacionFueraHorario(user, suc), false);

// Quota llena: NO tumba la autorización; memoria + nube siguen vigentes.
failQuota = true;
mem.set('pos3b_movimientos_inventario_pesado', 'x'.repeat(1000));
let upsertOk = false;
const supabaseMock = {
  from() {
    return {
      upsert: async () => {
        upsertOk = true;
        return { error: null };
      },
    };
  },
};
const entryQuota = await otorgarAutorizacionFueraHorario({
  usuarioId: user.id,
  sucursal: suc,
  admin,
  duracionMs: 2 * 60 * 60 * 1000,
  supabase: supabaseMock,
});
assert.ok(entryQuota, 'debe devolver entry aunque falle localStorage');
assert.equal(upsertOk, true, 'debe guardar en nube aunque falle local');
assert.equal(
  tieneAutorizacionFueraHorario(user, suc),
  true,
  'memoria debe autorizar aunque localStorage esté lleno',
);
assert.ok(
  entryQuota.avisoLocal === AVISO_CUOTA_AUTORIZACION_LOCAL
    || /lleno|cuota|almacenamiento/i.test(String(entryQuota.avisoLocal || '')),
  'debe avisar cuota local',
);
failQuota = false;

console.log('autorizacionTurnoFueraHorario.test.mjs OK');
