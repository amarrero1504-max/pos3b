# Análisis de tablas Supabase — POS 3B

**Fecha:** 2026-10-20  
**Proyecto:** `bablzxlaospziombkpdd.supabase.co`  
**Método:** 104 tablas (código + SQL del repo) sondadas vía REST (anon). Cruce con `.from('…')` en `aba3bs-arch/pos3b`.

## Resumen

| Estado | Cantidad | Acción |
|--------|----------|--------|
| OK y en uso | ~84 | Mantener; las grandes → índices / retención |
| Existen pero **vacías** (feature lista, sin datos) | 11 | OK; no borrar |
| **Faltan** y el código las usa | **2** | Crear ya |
| Legacy / casi sin uso en app | 7 | No ocupar el POS actual; candidatas a retirar después |
| Errores de lectura (timeout/503) en este sondeo | 0* | *Antes sí hubo timeouts en inventarios bajo carga |

\* En este pase todas las tablas existentes respondieron; bajo Disk IO saturado `movimientos_inventario` ya había dado timeout.

---

## 1. Errores / tablas faltantes (prioridad alta)

Estas están en el código pero **no existen** en producción (`PGRST205`):

| Tabla | Dónde se usa | Efecto |
|-------|--------------|--------|
| `carrito_remociones` | `src/lib/proyeccionFaltante.js` | Proyección de faltante guarda en localStorage; no sincroniza a la nube |
| `consultas_precio` | `src/lib/proyeccionFaltante.js` | Igual: checador de precios sin persistencia en Supabase |

**Fix:** ejecutar en SQL Editor:

```text
supabase/fix_proyeccion_faltante.sql
```

(copiado también en este repo como `supabase/fix_tablas_faltantes_proyeccion.sql`)

---

## 2. Legacy / no se ocupan en el flujo actual

Existen en la DB; el POS **ya no escribe** en ellas (solo purga o SQL). Sustituidas por el modelo Venta en Ruta v2 (`ruta_cargas`, `ruta_ventas`, `pos_preinventario_*`, etc.).

| Tabla | Filas | Nota |
|-------|------:|------|
| `cedis_ruta_stock` | 11 | Inventario CEDIS-ruta viejo |
| `cedis_ruta_movimientos` | 0 | Movimientos del modelo viejo |
| `ruta_liquidaciones` | 0 | Liquidación legacy |
| `ruta_efectivo_movimientos` | 0 | Reemplazado por fondo / tránsito |
| `ruta_capital_solicitudes` | 0 | Capital ruta no cableado |
| `ruta_preinventario_sesiones` | 0 | App usa `pos_preinventario_sesiones` |
| `pos_proveedores_ocultos_cedis` | 0 | Solo definida en SQL; **ningún** `.from()` en la app |

**Recomendación:** no borrar aún sin backup. Si quieres limpiar, primero confirma que nadie usa reportes viejos; luego `DROP` solo las de 0 filas y documenta.

`pos_solicitud_extension_turno` (2 filas) **sí se usa** (vía constante en `solicitudExtensionTurno.js`) — no es legacy.

---

## 3. Vacías pero el código sí las usa (features sin datos)

No son error: la tabla está; simplemente nadie ha generado filas (o el módulo no se ha usado).

| Tabla | Módulo |
|-------|--------|
| `clientes` | AutoFin / Clientes clásico |
| `ruta_clientes` | Venta en Ruta — clientes externos |
| `ruta_cortes_caja` | Corte de ruta |
| `rifs` | RIF / fondos |
| `conciliaciones_abarrotes` | Conciliación Smoking |
| `proveedor_catalogo` | Catálogo CEDIS proveedor |
| `inversiones_oficina_proveedor` (+ `_abonos`) | Inversiones oficina→proveedor |
| `pos_push_subscriptions` | Web Push (Admin) |
| `rh_recontratacion_solicitudes` / `_pins` | Recontratación RH |

---

## 4. Tablas más pesadas (Disk IO)

| Tabla | Filas | Latencia count |
|-------|------:|---------------:|
| `movimientos_inventario` | **157 990** | ~870 ms (antes timeout) |
| `ventas` | 53 631 | ~790 ms |
| `pos_auditoria_eventos` | 19 762 | ~470 ms |
| `logins` | 11 367 | ~225 ms |
| `checklist_respuestas` | 7 944 | ~210 ms |
| `cortes_contabilidad_cierres` | 4 462 | ~505 ms |
| `cortes_contabilidad_gastos` | 4 153 | ~134 ms |

Estas son las que más empujan el Disk IO Budget. Prioridad: índices en `fix_disk_io_indexes.sql` + retención/archivo de movimientos e historial de logins/auditoría.

---

## 5. Inventario completo (estado live)

Ver machine-readable: generar de nuevo con el sondeo, o la tabla en el canvas del diagnóstico.

Clave de estados en el sondeo:

- `ok` — legible con anon key  
- `missing` — no está en schema cache / no existe  
- `timeout` / `overloaded` — Disk IO / statement timeout  

---

## Acciones sugeridas (orden)

1. **Correr** `supabase/fix_tablas_faltantes_proyeccion.sql` → crea `carrito_remociones` + `consultas_precio`.
2. **Correr** `supabase/fix_disk_io_indexes.sql` (versión segura) → índices en tablas grandes.
3. Revisar Disk IO Budget / plan Micro+ si sigue al 100%.
4. (Opcional) Plan de retención: archivar `movimientos_inventario` / `logins` / `pos_auditoria_eventos` > N meses.
5. (Opcional) Retirar tablas legacy vacías de la sección 2 tras backup.
