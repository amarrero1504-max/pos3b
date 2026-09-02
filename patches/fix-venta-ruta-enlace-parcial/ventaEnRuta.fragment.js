/**
 * Fragmento a aplicar en src/lib/ventaEnRuta.js → registrarVentaRuta
 *
 * Problema: si fallaba el tránsito/CxC después de crear el pedido en Compras,
 * se hacía return sin escribir compra_id en ruta_ventas.
 *
 * Cambio: enlazar compra_id (y lo que haya) apenas se crea, y también en
 * early-return parcial. Ver docs/REPAIR_RUTA_VENTAS.md.
 *
 * Sustituye el bloque desde `let compraId = null;` hasta el `return { ok: true, ...}`
 * final de registrarVentaRuta.
 */

/*
  let compraId = null;
  let transitoId = null;
  const avisos = [];

  async function enlazarVenta(extra = {}) {
    const patch = { ...extra };
    if (compraId) patch.compra_id = compraId;
    if (transitoId) patch.transito_id = String(transitoId);
    if (!Object.keys(patch).length) return;
    const { error: eLink } = await supabase.from('ruta_ventas').update(patch).eq('id', venta.id);
    if (eLink) avisos.push(`enlace venta: ${eLink.message}`);
  }

  // Sucursal propia → pedido pendiente de recepción
  if (tipoCli === 'sucursal') {
    const ped = await crearPedidoCompraDesdeVentaRuta(supabase, {
      sucursalId: clienteId,
      folioVenta: folio,
      articulos: arts,
      total,
      vendedorNombre,
    });
    if (!ped.ok) return { ok: false, error: ped.error || 'No se creó el pedido en Compras.' };
    compraId = ped.id;
    await enlazarVenta(); // no perder el enlace si falla tránsito/CxC después
  }

  if (mp === 'efectivo') {
    const tr = await registrarEfectivoTransitoVentaRuta(supabase, {
      sucursalOrigen: tipoCli === 'sucursal' ? clienteId : ALMACEN_CENTRAL,
      monto: total,
      folioVenta: folio,
      vendedorId,
      vendedorNombre,
      nota: `Venta ruta ${folio} · efectivo · ${clienteNombre || clienteId}`,
    });
    if (!tr.ok) {
      await enlazarVenta();
      return {
        ok: false,
        error: tr.error || 'No se registró efectivo en tránsito.',
        compraId,
        venta: { ...venta, compra_id: compraId },
      };
    }
    transitoId = tr.id;
  } else {
    const cxc = await registrarCargoCreditoRuta(supabase, {
      clienteTipo: tipoCli,
      clienteId,
      clienteNombre: clienteNombre || String(clienteId),
      monto: total,
      ventaId: venta.id,
      cargaId,
      folioVenta: folio,
      usuarioNombre: vendedorNombre,
      notas: `Venta ${folio}`,
    });
    if (!cxc.ok) {
      await enlazarVenta();
      return {
        ok: false,
        error: cxc.error || 'No se registró el crédito.',
        compraId,
        venta: { ...venta, compra_id: compraId },
      };
    }
  }

  await enlazarVenta();

  return {
    ok: true,
    venta: { ...venta, compra_id: compraId, transito_id: transitoId },
    cuenta: mp === 'credito' ? 'credito' : 'efectivo',
    compraId,
    transitoId,
    avisos: avisos.length ? avisos : undefined,
  };
*/
