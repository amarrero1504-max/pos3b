# Fix: caja chica de Abarrotes se reinicia a $0 entre turnos

## Qué fallaba

Tras un cierre correcto (p. ej. Fusión AB-186, Esthela, caja actual **$1,136**), el siguiente turno a veces arrancaba con **caja chica anterior $0** y **fondo fijo $0**.

No era un error de cálculo del ticket: el historial del cierre sí tenía `caja_actual = 1136`. Se perdía el **estado abierto** (`cortes_contabilidad_estado`).

### Casos vistos (sep–oct 2026)

| Sucursal | Folios | Entregó → arrancó |
|---|---|---|
| FUSION | AB-186→AB-187 | $1,136 → $0 |
| FUSION | AB-067→AB-068 | $1,045 → $0 |
| 3B5 | AB-171→AB-172 | $1,516 → $0 |

Otras anomalías de arrastre (montos distintos, no “reset a ceros”) aparecen de vez en cuando; el patrón peligroso es **ant=0 y fondo=0** tras una entrega > 0.

## Causas

1. **Carrera de debounce (400 ms)** al editar campos: un `guardarEstadoCorte` viejo podía ejecutarse *después* del post-cierre y pisar el arrastre.
2. **Guardado de defaults**: un cliente con estado vacío (carga fallida / folio asignado sobre default) hacía upsert y borraba la caja viva.
3. **Recuperación incompleta**: solo se restauraba desde el último cierre si el estado “parecía vacío”; si el cajero ya había capturado venta con caja en $0, no se recuperaba.

## Fix

1. Invalidar guardados pendientes al **cerrar corte** y al **recolectar** (`saveGen` + clear timeout).
2. `guardarEstadoCorte` (abarrotes): **bloquea** upsert vacío sobre un arrastre existente.
3. Al cargar: si `caja_anterior ≈ 0` pero el último cierre dejó otro saldo (incluso con venta ya capturada), **restaura** caja y, si aplica, fondo fijo.
4. Si falla el guardado post-cierre, avisa al cajero para recargar.

### Archivos a copiar a `aba3bs-arch/pos3b`

- `src/lib/corteContabilidad/cajaChicaArrastre.js` *(nuevo)*
- `src/lib/corteContabilidad/store.js`
- `src/lib/corteContabilidad/useCorteContabilidad.js`
- `src/lib/corteContabilidad/cajaChicaArrastre.test.mjs`
- `src/lib/corteContabilidad/cajaChicaFusion.test.mjs`

También en `patches/caja-chica-arrastre/`.

```bash
node src/lib/corteContabilidad/cajaChicaArrastre.test.mjs
node src/lib/corteContabilidad/cajaChicaFusion.test.mjs
```

**Importante:** este espejo no puede pushear a `aba3bs-arch/pos3b`. Relanza el Cloud Agent apuntando a ese repo, o copia los archivos y despliega en Netlify.
