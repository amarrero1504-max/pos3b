# pos3b

Mirror / herramientas del POS 3B.

**Repo canónico:** https://github.com/aba3bs-arch/pos3b

## Diagnóstico Supabase (2026-10-20)

Veredicto: saturación de **Disk IO Budget** (no es fallo de `usuarios` ni de credenciales).

- `docs/DIAGNOSTICO_SUPABASE.md` — informe completo + evidencia medida
- `supabase/diagnostico_disk_io.sql` — correr en SQL Editor
- `supabase/fix_disk_io_indexes.sql` — índices (seguro si falta alguna tabla)
- `supabase/check_tablas_indexes.sql` — si falló con 42P01, verifica tablas/proyecto
- `supabase/diagnostico_login_usuarios.sql` — si el login no encuentra usuarios
