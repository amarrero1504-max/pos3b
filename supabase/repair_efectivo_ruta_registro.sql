-- Repair: efectivo de Venta en Ruta bien tipado y diagnóstico de huérfanos
-- Fecha: 2026-10-28
--
-- 1) Cobros de crédito de ruta que se insertaron como «Venta Ruta» → «Cobro Crédito»
-- 2) Diagnóstico: ventas con efectivo sin fila de tránsito (Efectivo mercancía faltante)

-- ─── 1. Reclasificar cobros de crédito mal tipados ───────────────────────────
update public.transito_efectivo
set tipo_movimiento = 'Cobro Crédito'
where tipo_movimiento = 'Venta Ruta'
  and (
    num_traspaso ~* '^CXC-'
    or descripcion_gasto ~* 'cr[eé]dito.*(cobrado|parcial|liquidado)'
    or coalesce(foto_url, '') ~* 'cr[eé]dito.*(cobrado|parcial|liquidado)'
  );

-- ─── 2. Diagnóstico: ventas en efectivo/mixto sin tránsito enlazado ───────────
-- Revisa el resultado. Si hay filas, el efectivo NO está en Pendientes.
select
  v.id,
  v.folio,
  v.cliente_id,
  v.metodo_pago,
  v.total,
  v.transito_id,
  v.created_at,
  v.vendedor_nombre,
  t.id as transito_row_id,
  t.estatus as transito_estatus,
  t.tipo_movimiento,
  t.monto as transito_monto
from public.ruta_ventas v
left join public.transito_efectivo t
  on t.id::text = nullif(trim(v.transito_id), '')
  or t.num_traspaso = v.folio
  or t.num_traspaso = v.folio || '-E'
  or t.num_traspaso = v.folio || '-ME'
where coalesce(v.estado, '') not in ('cancelada', 'anulada')
  and lower(coalesce(v.metodo_pago, '')) in ('efectivo', 'mixto')
  and (
    nullif(trim(v.transito_id), '') is null
    or t.id is null
  )
order by v.created_at desc
limit 200;
