# Diagnóstico Supabase — POS 3B

**Fecha:** 2026-10-20  
**Proyecto:** `bablzxlaospziombkpdd.supabase.co`  
**Repo canónico del POS:** https://github.com/aba3bs-arch/pos3b

## Veredicto

La causa principal es **agotamiento / saturación del Disk IO Budget** de Supabase (plan Nano ≈ 5 MB/s). No es un fallo de credenciales ni de la tabla `usuarios`.

Cuando el burst de disco se agota, PostgREST responde lento o con errores; el login y pantallas pesadas (inventarios) se traban.

## Evidencia en vivo (REST, anon key)

| Señal | Resultado |
|-------|-----------|
| `GET /auth/v1/health` | OK (~640 ms) |
| `usuarios` count | **53** filas (30 activos) — legible |
| PINs duplicados `(sucursal_id, pin)` | **0** |
| Latencia 20× `usuarios?select=id&limit=1` | min 65 · p50 124 · **p90 1429** · max 1912 ms (otro spike **4974 ms**) |
| Error intermitente | HTTP **503** `PGRST002` — *Could not query the database for the schema cache* |
| `movimientos_inventario` count | HTTP **500** `57014` — *statement timeout* (~3.5 s) |

### Tamaños observados

| Tabla | Filas (count) | Nota |
|-------|---------------|------|
| `movimientos_inventario` | timeout | La más problemática |
| `ventas` | 53 606 | Grande |
| `logins` | ~11 300 | Crece con cada acceso |
| `productos` | 2 232 | OK |
| `transito_efectivo` | 1 375 | OK |
| `usuarios` | 53 | OK — no es la causa |

## Qué NO es la causa (ahora)

1. URL / anon key mal configuradas — el cliente responde.
2. Tabla `usuarios` vacía o bloqueada por RLS — se leyeron las 53 filas.
3. PINs duplicados en la misma tienda (histórico `maybeSingle` / PGRST116) — no hay duplicados hoy.

## Acciones recomendadas

### Ya en Supabase (dashboard)

1. **Reports → Disk IO**: si está al 100%, esperar recarga diaria **o** subir a **Micro+**.
2. SQL Editor → ejecutar `supabase/fix_disk_io_indexes.sql` (del repo canónico, PR #416).
3. SQL Editor → ejecutar `supabase/diagnostico_disk_io.sql` y revisar seq scans / tablas grandes.

### En el código (`aba3bs-arch/pos3b`)

1. Confirmar que el deploy incluye el merge de **PR #416** (menos polling, catálogo con debounce, inventarios sin `SELECT *` / OFFSET).
2. Usar **PR #420** (`diagnostico_tablas_login.sql` + botón en login) si vuelve a fallar la entrada.
3. No saturar con `count=exact` ni páginas enormes sobre `movimientos_inventario` / `ventas`.

## Relación con trabajo reciente

| PR | Estado | Tema |
|----|--------|------|
| [#416](https://github.com/aba3bs-arch/pos3b/pull/416) | Merged | Reducir Disk IO (polling / catálogo / inventarios) |
| [#417](https://github.com/aba3bs-arch/pos3b/pull/417) | Merged | Login sin `maybeSingle` + mensajes Disk IO |
| [#419](https://github.com/aba3bs-arch/pos3b/pull/419) | Open | Revert de #417 |
| [#420](https://github.com/aba3bs-arch/pos3b/pull/420) | Draft | Diagnóstico de tablas de login |

## Nota sobre este repo

`amarrero1504-max/pos3b` es un mirror casi vacío. Para cambios de código del POS, el agente debe apuntar a **aba3bs-arch/pos3b**.
