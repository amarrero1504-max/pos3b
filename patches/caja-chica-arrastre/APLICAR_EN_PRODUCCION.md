# Aplicar en `aba3bs-arch/pos3b` (producción)

El Cloud Agent **no tiene permiso de push** en ese repo (`cursor[bot]` → 403).

## Opción A — dar acceso a Cursor y pedir “reintenta”
1. GitHub → org/user `aba3bs-arch` → repo `pos3b`
2. Settings → Collaborators / Installed GitHub Apps → **Cursor** con acceso **Write**
3. En el chat: “ya di acceso, sube el fix a aba3bs-arch/pos3b”

## Opción B — tú lo aplicas en 1 minuto
```bash
git clone https://github.com/aba3bs-arch/pos3b.git
cd pos3b
git checkout -b cursor/caja-chica-arrastre-7531
git am /ruta/a/0001-caja-chica-arrastre.patch
# o copia los archivos de este folder a src/lib/corteContabilidad/ y docs/
git push -u origin cursor/caja-chica-arrastre-7531
# Abre PR a main y mergea → Netlify despliega
```

Archivos del parche:
- `cajaChicaArrastre.js` (nuevo)
- `cajaChicaArrastre.test.mjs` (nuevo)
- `cajaChicaFusion.test.mjs`
- `store.js`
- `useCorteContabilidad.js`
- `docs/CAJA_CHICA_ARRASTRE.md`
