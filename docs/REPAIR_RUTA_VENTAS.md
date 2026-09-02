# Repair: ventas de ruta incompletas

**Fecha:** 2026-09-02  
**Alcance:** 6 folios de `ruta_ventas` con `compra_id` / `transito_id` / `estado_credito` en null

## Problema

Las ventas a sucursal debían generar:

| Método | Efectos esperados |
|--------|-------------------|
| efectivo | pedido en `compras` + fila en `transito_efectivo` + enlaces en la venta |
| crédito | pedido en `compras` + cargo en `ruta_cxc_movimientos` + `estado_credito` |

Varias ventas quedaron huérfanas porque:

1. `transito_efectivo.repartidor_id` exige un id de la tabla `repartidores` (`rep_luis`, etc.), pero el POS enviaba el UUID del usuario → el insert de tránsito fallaba.
2. Al fallar el tránsito, `registrarVentaRuta` hacía `return` **antes** de enlazar `compra_id`, aunque el pedido en Compras ya existía.
3. Ventas viejas (antes de POS v2) no tenían `estado_credito` ni `folio_venta` en CxC.

## Folios reparados (Supabase producción)

| Folio | Pago | Qué se corrigió |
|-------|------|-----------------|
| VR-MTHRKPJY | efectivo | Enlace a compra existente + tránsito **En Tránsito** (carga aún en ruta) |
| VR-MSHWR0PK | efectivo | Compra `recibida` + tránsito **Liquidado** (carga ya liquidada) |
| VR-MSHWRL9Y | efectivo | Compra `recibida` + tránsito **Liquidado** |
| VR-MSHWW24U | crédito | Compra `recibida` + CxC `pagado` + `estado_credito=pagado` |
| VR-MSHZZEH0 | crédito | Compra `recibida` + CxC marcado `pagado` + `folio_venta` + `estado_credito=pagado` |
| VR-MSI5OJCK | crédito | Compra `recibida` + CxC marcado `pagado` + `folio_venta` + `estado_credito=pagado` |

Los créditos 3B10 ya tenían abonos que dejaban saldo 0; solo faltaba marcar estatus. El crédito FUSION (carga liquidada sin CxC) se registró como `pagado` (asentado en liquidación).

## Prevención

Aplicar en el POS real (`las3b-pos` / `aba3bs-arch/pos3b`):

- `patches/fix-venta-ruta-enlace-parcial/` — enlaza `compra_id` de inmediato y resuelve un `repartidor_id` válido para tránsito.

## Re-ejecutar

```bash
# Con URL y anon key de pos3b-config.js / .env
node scripts/reparar-ruta-ventas-incompletas.mjs
```
