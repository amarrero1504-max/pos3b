# pos3b

Mirror / herramientas del POS 3B.

**Repo canónico:** https://github.com/aba3bs-arch/pos3b

## Diagnóstico Supabase (2026-10-20)

Veredicto: saturación de **Disk IO Budget** (no es fallo de `usuarios` ni de credenciales).

- `docs/DIAGNOSTICO_SUPABASE.md` — Disk IO + evidencia medida
- `docs/ANALISIS_TABLAS_SUPABASE.md` — 104 tablas: errores, legacy, vacías, pesadas
- `docs/tablas_supabase_inventario.json` — inventario machine-readable
- `supabase/fix_tablas_faltantes_proyeccion.sql` — crea `carrito_remociones` + `consultas_precio`
- `supabase/fix_disk_io_indexes.sql` — índices (seguro si falta alguna tabla)
- `supabase/check_tablas_indexes.sql` — si falló con 42P01, verifica tablas/proyecto
- `supabase/diagnostico_disk_io.sql` / `diagnostico_login_usuarios.sql`

## Preinventario ruta = inv-op (2026-10-21)

- `docs/PREINVENTARIO_RUTA_INV_OP.md`
- `src/modules/Preinventario.jsx` (+ Ruta) — copiar al repo canónico
- `patches/preinventario-ruta-inv-op/` — mismos archivos
