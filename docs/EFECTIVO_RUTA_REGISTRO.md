# Efectivo de Venta en Ruta: que todo lo recolectado se registre

**Repo canónico:** https://github.com/aba3bs-arch/pos3b  
**Fecha:** 2026-10-28 (America/Phoenix)

## Análisis de la pantalla (27/10/2026 · Francisco · Pendientes)

| Concepto | Monto | ¿Se está cobrando / registrando? |
|----------|------:|----------------------------------|
| Créditos cobrados (5 mov.) | **$3,749.00** | **Sí.** Es efectivo ya en `transito_efectivo` (cobros de crédito de FUSION, 3B6, 3B7, 3B5). Al pulsar **Sellar todo** se acredita a la cuenta RT Francisco. |
| Efectivo por mercancía vendida | **$0.00** | No hay movimientos tipo «Venta Ruta» pendientes. O no hubo ventas de contado, o esas ventas **no llegaron a tránsito** (bug corregido abajo). |
| Neto a acreditar | **$3,749.00** | Correcto: créditos cobrados + efectivo mercancía − gastos. |

Conclusión de esa captura: **sí se está registrando el efectivo recolectado de cobros de crédito**. La columna «Efectivo mercancía» en $0 no significa que el dinero no cuente; significa que esos $3,749 no son ventas de contado del camión, sino pagos de créditos.

## Qué fallaba en el código

1. **Venta en efectivo sin tránsito:** si `registrarEfectivoTransitoVentaRuta` fallaba (p. ej. recolector inválido), la venta y el pedido en Compras **quedaban** y el camión ya descontaba, pero **Pendientes no veía el efectivo** → «Efectivo mercancía» en $0 con ventas reales.
2. **Cobro de crédito tipado como «Venta Ruta»:** el RPC `pagar_creditos_ruta_atomico` insertaba cobros de ruta con `tipo_movimiento = 'Venta Ruta'`. La UI los clasificaba como crédito por el folio `CXC-…`, pero confundía reportes e históricos.
3. **Import histórico a cuenta RT:** `TIPOS_LIQUIDACION_RT` no incluía «Venta Ruta», así que liquidaciones selladas de mercancía de contado podían **no acreditarse** a Francisco al importar históricos.

## Fix (aplicar en aba3bs-arch/pos3b)

Copiar desde este espejo:

| Archivo | Cambio |
|---------|--------|
| `src/lib/ventaEnRuta.js` | Si falla el tránsito de efectivo → revierte camión, anula pedido y cancela la venta. |
| `src/lib/rtCuentas.js` | `TIPOS_LIQUIDACION_RT` incluye `Venta Ruta`. |
| `src/lib/recoleccionTipos.js` | Detecta «Crédito ruta cobrado» aunque haya palabras en medio. |
| `supabase/fix_ruta_cxc_pagos_atomicos.sql` | Cobros de crédito de ruta → tipo `Cobro Crédito`. |
| `supabase/repair_efectivo_ruta_registro.sql` | Reclasifica filas viejas + lista ventas efectivo sin tránsito. |

También en `patches/efectivo-ruta-registro-completo/`.

**Importante:** este espejo no puede pushear a `aba3bs-arch/pos3b`. Relanza el Cloud Agent apuntando a ese repo, o copia los archivos y vuelve a ejecutar el SQL del RPC en Supabase.

## SQL en producción

```bash
# 1) Actualizar la función atómica (cobros nuevos bien tipados)
#    Pegar supabase/fix_ruta_cxc_pagos_atomicos.sql en SQL Editor

# 2) Reparar / diagnosticar
#    Pegar supabase/repair_efectivo_ruta_registro.sql
```

Si el diagnóstico (query 2) devuelve filas, esas ventas de contado **no están en Pendientes**: hay que recrear el tránsito a mano o con el script de repair de ventas incompletas (`docs/REPAIR_RUTA_VENTAS.md` en la rama de repair).
