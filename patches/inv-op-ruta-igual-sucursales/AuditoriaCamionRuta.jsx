import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CampoCodigo from '../components/CampoCodigo.jsx';
import Icon from '../components/Icon.jsx';
import {
  construirLineasAuditoriaCamion,
  guardarAuditoriaCamionLocal,
  lineasAuditoriaPorDepartamento,
  listarAuditoriasCamionLocal,
  progresoDepartamentosAuditoria,
  resolverCamionDeRecolector,
  resumirAuditoriaCamion,
} from '../lib/auditoriaCamionRuta.js';
import {
  inventarioCamionDesdeLineas,
  lineasDeVariasCargas,
  listarCargasRuta,
  listarRecolectoresCargaRuta,
} from '../lib/ventaEnRuta.js';
import {
  etiquetaCamion,
  listarCamionesRuta,
} from '../lib/rutaCamiones.js';
import { etiquetaDepartamento } from '../lib/departamentos.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { fmtMxn } from '../lib/valorInventario.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { imprimirAuditoriaCamion } from '../lib/impresion.js';
import './VentaEnRuta.css';

function etiquetaDiferencia(l) {
  if (l.contado == null) return '—';
  if (l.diferencia === 0) return 'Cuadra';
  if (l.diferencia > 0) return `+${l.diferencia} sobrante`;
  return `${l.diferencia} faltante`;
}

/**
 * Venta en Ruta → Inv-op / Auditorías.
 * Misma UX que inv-op de sucursales (ConteoPorDepartamento):
 * artículo a artículo → existencia / contada / diferencia / valor → resumen + ticket.
 * No modifica inventario del camión.
 */
export default function AuditoriaCamionRuta({
  supabase,
  user,
  inventario = [],
  productoPorId,
  setAviso,
  onVolver,
}) {
  const [paso, setPaso] = useState('recolector'); // recolector | deptos | conteo | resumen
  const [recolectores, setRecolectores] = useState([]);
  const [camiones, setCamiones] = useState([]);
  const [recolectorId, setRecolectorId] = useState('');
  const [camionId, setCamionId] = useState('');
  const [cargas, setCargas] = useState([]);
  const [lineasCarga, setLineasCarga] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [conteos, setConteos] = useState({});
  const [codigoEscaneo, setCodigoEscaneo] = useState('');
  const [historial, setHistorial] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [deptoActivo, setDeptoActivo] = useState('');
  const [indiceActual, setIndiceActual] = useState(0);
  const [mostrarResumenDepto, setMostrarResumenDepto] = useState(false);
  const [folioCerrado, setFolioCerrado] = useState(null);
  const contadaInputRef = useRef(null);
  const scanInputRef = useRef(null);

  const cargarListas = useCallback(async () => {
    setCargandoLista(true);
    try {
      const [rCam, rRec] = await Promise.all([
        listarCamionesRuta(supabase, { soloActivos: true }),
        listarRecolectoresCargaRuta(supabase),
      ]);
      if (rCam.aviso) setAviso?.(rCam.aviso);
      if (rCam.error) setAviso?.(rCam.error);
      if (rRec.error) setAviso?.(rRec.error);
      setCamiones(rCam.data || []);
      setRecolectores(rRec.data || []);
    } finally {
      setCargandoLista(false);
    }
  }, [supabase, setAviso]);

  useEffect(() => {
    void cargarListas();
  }, [cargarListas]);

  const recolectorSel = useMemo(
    () => recolectores.find((r) => String(r.id) === String(recolectorId)) || null,
    [recolectores, recolectorId],
  );

  const camionResuelto = useMemo(
    () => resolverCamionDeRecolector(camiones, recolectorSel),
    [camiones, recolectorSel],
  );

  useEffect(() => {
    setCamionId(camionResuelto?.id ? String(camionResuelto.id) : '');
  }, [camionResuelto]);

  const refrescarCargas = useCallback(async () => {
    setCargando(true);
    try {
      if (!camionId) {
        setCargas([]);
        setLineasCarga([]);
        return;
      }
      const r = await listarCargasRuta(supabase, {
        estado: 'en_ruta',
        camionId,
        limit: 80,
      });
      if (r.aviso) setAviso?.(r.aviso);
      if (r.error) setAviso?.(r.error);
      const lista = r.data || [];
      setCargas(lista);
      if (!lista.length) {
        setLineasCarga([]);
        return;
      }
      const lin = await lineasDeVariasCargas(supabase, lista);
      if (lin.aviso) setAviso?.(lin.aviso);
      if (lin.error) setAviso?.(lin.error);
      setLineasCarga(lin.data || []);
    } finally {
      setCargando(false);
    }
  }, [supabase, camionId, setAviso]);

  useEffect(() => {
    void refrescarCargas();
  }, [refrescarCargas]);

  useEffect(() => {
    setConteos({});
    setDeptoActivo('');
    setIndiceActual(0);
    setMostrarResumenDepto(false);
    setFolioCerrado(null);
    setPaso(recolectorId && camionId ? 'deptos' : 'recolector');
    const h = listarAuditoriasCamionLocal({ camionId: camionId || undefined, limit: 8 });
    setHistorial(h.data || []);
  }, [camionId, recolectorId]);

  const inventarioCamion = useMemo(
    () => inventarioCamionDesdeLineas(lineasCarga, { productoPorId, inventario }),
    [lineasCarga, productoPorId, inventario],
  );

  const lineas = useMemo(
    () => construirLineasAuditoriaCamion(inventarioCamion, conteos),
    [inventarioCamion, conteos],
  );

  /** Líneas con campos iguales a inv-op de sucursales (existencia / contada / valor dif.). */
  const lineasUi = useMemo(
    () => lineas.map((l) => {
      const existencia = Number(l.teorico) || 0;
      const contadaNum = l.contado;
      const diferencia = l.diferencia;
      const precioVenta = Number(l.precioPublico) || 0;
      const valorDiferencia = contadaNum == null || diferencia === 0
        ? 0
        : Math.round(Math.abs(diferencia) * precioVenta * 100) / 100;
      let estado = 'pendiente';
      if (contadaNum != null) {
        if (diferencia === 0) estado = 'ok';
        else if (diferencia > 0) estado = 'sobrante';
        else estado = 'faltante';
      }
      return {
        ...l,
        productoId: l.id,
        codigo: l.id,
        existencia,
        contadaNum,
        valorDiferencia,
        precioVenta,
        estado,
      };
    }),
    [lineas],
  );

  const resumen = useMemo(() => resumirAuditoriaCamion(lineas), [lineas]);
  const progresoDeptos = useMemo(() => progresoDepartamentosAuditoria(lineas), [lineas]);

  const lineasDepto = useMemo(
    () => lineasAuditoriaPorDepartamento(lineasUi, deptoActivo),
    [lineasUi, deptoActivo],
  );

  const resumenDepto = useMemo(() => {
    let piezasExistencia = 0;
    let piezasContadas = 0;
    let piezasFaltantes = 0;
    let piezasSobrantes = 0;
    let valorFaltante = 0;
    let valorSobrante = 0;
    let skusPendientes = 0;
    let skusOk = 0;
    for (const l of lineasDepto) {
      piezasExistencia += l.existencia;
      if (l.contadaNum == null) {
        skusPendientes += 1;
        continue;
      }
      piezasContadas += l.contadaNum;
      if (l.diferencia === 0) skusOk += 1;
      else if (l.diferencia < 0) {
        piezasFaltantes += Math.abs(l.diferencia);
        valorFaltante += l.valorDiferencia;
      } else {
        piezasSobrantes += l.diferencia;
        valorSobrante += l.valorDiferencia;
      }
    }
    return {
      totalSkus: lineasDepto.length,
      skusPendientes,
      skusOk,
      piezasExistencia,
      piezasContadas,
      piezasFaltantes,
      piezasSobrantes,
      valorFaltante: Math.round(valorFaltante * 100) / 100,
      valorSobrante: Math.round(valorSobrante * 100) / 100,
      listo: lineasDepto.length > 0 && skusPendientes === 0,
    };
  }, [lineasDepto]);

  const progresoDeptoActivo = useMemo(
    () => progresoDeptos.find((d) => d.departamento === deptoActivo) || null,
    [progresoDeptos, deptoActivo],
  );

  const articuloActual = lineasDepto[indiceActual] || null;
  const camionSel = camiones.find((c) => String(c.id) === String(camionId));

  useEffect(() => {
    if (paso === 'conteo' && !mostrarResumenDepto && !folioCerrado) {
      contadaInputRef.current?.focus();
    }
  }, [paso, indiceActual, mostrarResumenDepto, folioCerrado, deptoActivo]);

  const setContada = (id, valor) => {
    setConteos((prev) => ({ ...prev, [id]: valor }));
  };

  const procesarEscaneo = (raw) => {
    const code = String(raw ?? codigoEscaneo).trim();
    if (!code) return;
    const rCamion = buscarProductoInventario(inventarioCamion, code);
    const hit = rCamion?.producto
      || buscarProductoInventario(inventario, code)?.producto
      || inventarioCamion.find((p) => String(p.id) === code);
    if (!hit || !inventarioCamion.some((p) => String(p.id) === String(hit.id))) {
      setAviso?.(`No está en el camión: ${code}`);
      setCodigoEscaneo('');
      return;
    }
    const id = String(hit.id);
    const cat = String(hit.cat || 'GENERAL').toUpperCase();
    const lineasCat = lineasAuditoriaPorDepartamento(
      construirLineasAuditoriaCamion(inventarioCamion, conteos),
      cat,
    );
    const idx = lineasCat.findIndex((l) => String(l.id) === id);
    setDeptoActivo(cat);
    setPaso('conteo');
    setMostrarResumenDepto(false);
    setIndiceActual(idx >= 0 ? idx : 0);
    setCodigoEscaneo('');
    window.setTimeout(() => {
      contadaInputRef.current?.focus();
      contadaInputRef.current?.select();
    }, 0);
  };

  const siguienteArticulo = () => {
    if (!articuloActual) return;
    const pid = articuloActual.id;
    const raw = conteos[pid];
    const contadaFinal = raw === undefined || String(raw).trim() === ''
      ? String(articuloActual.existencia)
      : String(raw);
    const nextConteos = { ...conteos, [pid]: contadaFinal };
    setConteos(nextConteos);

    const nextLineas = lineasAuditoriaPorDepartamento(
      construirLineasAuditoriaCamion(inventarioCamion, nextConteos),
      deptoActivo,
    );
    const nextIdx = nextLineas.findIndex((l, i) => i > indiceActual && l.contado == null);
    if (nextIdx >= 0) {
      setIndiceActual(nextIdx);
      return;
    }
    const firstPending = nextLineas.findIndex((l) => l.contado == null && String(l.id) !== String(pid));
    if (firstPending >= 0) {
      setIndiceActual(firstPending);
      return;
    }
    setMostrarResumenDepto(true);
  };

  const onContadaKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      siguienteArticulo();
    }
  };

  const onScanKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      procesarEscaneo(e.target.value);
    }
  };

  const elegirRecolector = (id) => {
    setRecolectorId(String(id || ''));
  };

  const entrarDepto = (dept) => {
    setDeptoActivo(dept);
    setIndiceActual(0);
    setMostrarResumenDepto(false);
    setPaso('conteo');
  };

  const lineasParaTicket = (soloDepto = false) => {
    const src = soloDepto ? lineasDepto : lineasUi;
    return src.map((l) => ({
      id: l.id,
      codigo: l.codigo || l.id,
      nombre: l.nombre,
      teorico: l.existencia ?? l.teorico,
      existencia: l.existencia ?? l.teorico,
      contado: l.contadaNum ?? l.contado,
      contadaNum: l.contadaNum ?? l.contado,
      diferencia: l.diferencia,
      valorDiferencia: l.valorDiferencia,
      perdidaCosto: l.perdidaCosto,
      perdidaPublico: l.perdidaPublico,
    }));
  };

  const imprimir = (opts = {}) => {
    const soloDepto = opts.soloDepto !== false && deptoActivo;
    const r = soloDepto
      ? {
          ...resumenDepto,
          contados: resumenDepto.totalSkus - resumenDepto.skusPendientes,
          productos: resumenDepto.totalSkus,
          faltante: resumenDepto.piezasFaltantes,
          sobrante: resumenDepto.piezasSobrantes,
          piezasFaltantes: resumenDepto.piezasFaltantes,
          piezasSobrantes: resumenDepto.piezasSobrantes,
          valorFaltante: resumenDepto.valorFaltante,
          valorSobrante: resumenDepto.valorSobrante,
          perdidaCosto: resumen.perdidaCosto,
          perdidaPublico: resumen.perdidaPublico,
        }
      : {
          ...resumen,
          contados: resumen.contados,
          productos: resumen.productos,
          faltante: resumen.piezasFaltantes,
          sobrante: resumen.piezasSobrantes,
          piezasFaltantes: resumen.piezasFaltantes,
          piezasSobrantes: resumen.piezasSobrantes,
          valorFaltante: resumen.perdidaPublico,
          valorSobrante: 0,
        };
    imprimirAuditoriaCamion({
      sucursal: 'RUTA',
      usuario: user?.nombre,
      recolector: recolectorSel?.nombre,
      camion: etiquetaCamion(camionSel),
      departamento: soloDepto ? etiquetaDepartamento(deptoActivo) : undefined,
      folio: opts.folio || folioCerrado || undefined,
      lineas: lineasParaTicket(Boolean(soloDepto)),
      resumen: r,
    });
  };

  const cerrarAuditoria = async () => {
    if (!camionId) return alert('Selecciona un recolector con camión asignado.');
    if (!resumen.contados) return alert('Captura al menos un conteo.');
    const nombreRec = recolectorSel?.nombre || '—';
    if (!confirm(
      `¿Cerrar auditoría de ${etiquetaCamion(camionSel)}?\n`
      + `Recolector: ${nombreRec}\n\n`
      + `Faltantes: ${resumen.piezasFaltantes} pza\n`
      + `Pérdida a costo: ${fmtMonto(resumen.perdidaCosto)}\n`
      + `Pérdida a precio público: ${fmtMonto(resumen.perdidaPublico)}\n\n`
      + 'No modifica el inventario del camión. Se imprime el ticket.',
    )) return;
    setGuardando(true);
    const r = guardarAuditoriaCamionLocal({
      camion_id: camionId,
      camion_etiqueta: etiquetaCamion(camionSel),
      recolector_id: recolectorSel?.repartidor_id || recolectorSel?.id || null,
      recolector_nombre: nombreRec,
      usuario_nombre: user?.nombre || null,
      usuario_id: user?.id || null,
      cargas: cargas.map((c) => ({ id: c.id, folio: c.folio })),
      resumen,
      progreso_deptos: progresoDeptos,
      lineas: lineas.filter((l) => l.contado != null || (Number(l.faltante) || 0) > 0),
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error || 'No se pudo guardar.');
    const folio = r.data?.id || `AUD-${Date.now().toString(36).toUpperCase()}`;
    setFolioCerrado(folio);
    setAviso?.(`Auditoría guardada · faltante ${resumen.piezasFaltantes} pza · público ${fmtMonto(resumen.perdidaPublico)}`);
    setHistorial(listarAuditoriasCamionLocal({ camionId, limit: 8 }).data || []);
    imprimir({ folio, soloDepto: false });
    setPaso('deptos');
  };

  const deptosCompletos = progresoDeptos.filter((d) => d.completo).length;

  return (
    <div className="ruta-invop">
      <header className="ruta-invop-hero">
        <div className="ruta-invop-hero-text">
          <p className="ruta-invop-kicker">Inv-op · Venta en ruta</p>
          <h3>Inventario operativo (igual que sucursales)</h3>
          <p className="ruta-invop-lead">
            Elige el recolector, abre un departamento y cuenta artículo a artículo
            (existencia, contada, diferencia y valor), con resumen y ticket.
            No modifica el stock del camión.
          </p>
        </div>
        {onVolver && (
          <button type="button" className="btn btn-ghost ruta-invop-volver" onClick={onVolver}>
            Volver
          </button>
        )}
      </header>

      <nav className="ruta-invop-steps" aria-label="Pasos">
        <button
          type="button"
          className={`ruta-invop-step${paso === 'recolector' ? ' activo' : ''}${recolectorId ? ' hecho' : ''}`}
          onClick={() => setPaso('recolector')}
        >
          <span className="ruta-invop-step-n">1</span>
          Recolector
        </button>
        <button
          type="button"
          className={`ruta-invop-step${paso === 'deptos' ? ' activo' : ''}${deptosCompletos > 0 ? ' hecho' : ''}`}
          onClick={() => recolectorId && camionId && setPaso('deptos')}
          disabled={!recolectorId || !camionId}
        >
          <span className="ruta-invop-step-n">2</span>
          Departamentos
        </button>
        <button
          type="button"
          className={`ruta-invop-step${paso === 'conteo' || paso === 'resumen' ? ' activo' : ''}`}
          onClick={() => deptoActivo && setPaso('conteo')}
          disabled={!deptoActivo}
        >
          <span className="ruta-invop-step-n">3</span>
          Conteo
        </button>
      </nav>

      {paso === 'recolector' && (
        <section className="ruta-invop-panel ruta-invop-panel--in">
          <div className="ruta-invop-panel-head">
            <h4>Selecciona el recolector</h4>
            <button type="button" className="btn btn-ghost" onClick={() => void cargarListas()} disabled={cargandoLista}>
              Actualizar
            </button>
          </div>
          {cargandoLista ? (
            <p className="muted">Cargando recolectores…</p>
          ) : recolectores.length === 0 ? (
            <p className="muted">
              No hay recolectores en Panel RT. Agrégalos en Contabilidad → Panel RT → Recolectores.
            </p>
          ) : (
            <div className="ruta-invop-rec-grid">
              {recolectores.map((r) => {
                const cam = resolverCamionDeRecolector(camiones, r);
                const activo = String(r.id) === String(recolectorId);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`ruta-invop-rec-card${activo ? ' activo' : ''}${cam ? '' : ' sin-camion'}`}
                    onClick={() => elegirRecolector(r.id)}
                  >
                    <span className="ruta-invop-rec-name">{r.nombre}</span>
                    <span className="ruta-invop-rec-meta">
                      {cam
                        ? `Camión ${etiquetaCamion(cam)}`
                        : 'Sin camión asignado'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {recolectorSel && (
            <div className="ruta-invop-rec-footer">
              {!camionResuelto ? (
                <p className="ruta-invop-warn">
                  {recolectorSel.nombre} no tiene camión activo. Asígnalo en Camiones.
                </p>
              ) : (
                <>
                  <p className="muted">
                    {recolectorSel.nombre} · {etiquetaCamion(camionResuelto)}
                    {cargando ? ' · cargando mercancía…' : cargas.length
                      ? ` · ${cargas.length} carga(s) · ${inventarioCamion.length} producto(s)`
                      : ' · sin cargas en ruta'}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!camionResuelto || cargando || !cargas.length}
                    onClick={() => setPaso('deptos')}
                  >
                    Continuar a departamentos
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {paso === 'deptos' && camionId && (
        <section className="ruta-invop-panel ruta-invop-panel--in">
          <div className="ruta-invop-panel-head">
            <div>
              <h4>Departamentos del camión</h4>
              <p className="muted ruta-invop-sub">
                {recolectorSel?.nombre || '—'} · {etiquetaCamion(camionSel)}
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => void refrescarCargas()} disabled={cargando}>
              Actualizar
            </button>
          </div>

          {cargando ? (
            <p className="muted">Cargando inventario del camión…</p>
          ) : !cargas.length ? (
            <p className="muted">Sin cargas en ruta para este recolector.</p>
          ) : (
            <>
              <div className="ruta-invop-kpi-row">
                <div className="ruta-invop-kpi">
                  <span>Avance</span>
                  <strong>{resumen.contados}/{resumen.productos}</strong>
                </div>
                <div className="ruta-invop-kpi">
                  <span>Deptos listos</span>
                  <strong>{deptosCompletos}/{progresoDeptos.length}</strong>
                </div>
                <div className={`ruta-invop-kpi${resumen.piezasFaltantes ? ' alerta' : ''}`}>
                  <span>Faltantes</span>
                  <strong>{resumen.piezasFaltantes}</strong>
                </div>
                <div className={`ruta-invop-kpi${resumen.perdidaPublico ? ' alerta' : ''}`}>
                  <span>$ público</span>
                  <strong>{fmtMonto(resumen.perdidaPublico)}</strong>
                </div>
              </div>

              <div className="ruta-invop-depto-grid">
                {progresoDeptos.map((d) => (
                  <button
                    key={d.departamento}
                    type="button"
                    className={`ruta-invop-depto-card${d.completo ? ' completo' : ''}${d.contados > 0 && !d.completo ? ' parcial' : ''}`}
                    onClick={() => entrarDepto(d.departamento)}
                  >
                    <div className="ruta-invop-depto-top">
                      <strong>{d.etiqueta}</strong>
                      <span className="ruta-invop-depto-pct">{d.pct}%</span>
                    </div>
                    <div className="ruta-invop-depto-bar" aria-hidden>
                      <i style={{ width: `${d.pct}%` }} />
                    </div>
                    <div className="ruta-invop-depto-meta">
                      <span>{d.contados}/{d.productos} prod.</span>
                      <span>{d.piezasTeoricas} pza teor.</span>
                      {d.piezasFaltantes > 0 && (
                        <span className="ruta-invop-falt">{d.piezasFaltantes} falt.</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="ruta-invop-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPaso('recolector')}>
                  Cambiar recolector
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={guardando || !resumen.contados}
                  onClick={() => void cerrarAuditoria()}
                >
                  {guardando ? 'Guardando…' : 'Cerrar auditoría e imprimir'}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {paso === 'conteo' && deptoActivo && (
        <section className="ruta-invop-panel ruta-invop-panel--in" style={{ display: 'grid', gap: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setPaso('deptos')}>
              ← Departamentos
            </button>
            <div>
              <strong style={{ color: 'var(--brand-blue)' }}>{etiquetaDepartamento(deptoActivo)}</strong>
              <span className="muted" style={{ marginLeft: '0.5rem', fontSize: '0.85rem' }}>
                {progresoDeptoActivo
                  ? `${progresoDeptoActivo.contados}/${progresoDeptoActivo.productos} · ${progresoDeptoActivo.pct}%`
                  : '—'}
              </span>
            </div>
          </div>

          {!mostrarResumenDepto && (
            <>
              <div className="card" style={{ borderTop: '4px solid var(--brand-gold)', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>
                    Artículo {lineasDepto.length ? indiceActual + 1 : 0} de {lineasDepto.length}
                  </h4>
                  <span className="badge">{etiquetaDepartamento(deptoActivo)}</span>
                </div>

                <label className="muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Icon name="scan" size={16} />
                    Escanear código
                  </span>
                  <div style={{ marginTop: '0.35rem' }}>
                    <CampoCodigo
                      inputRef={scanInputRef}
                      value={codigoEscaneo}
                      onChange={(e) => setCodigoEscaneo(e.target.value)}
                      onEscanear={procesarEscaneo}
                      onKeyDown={onScanKeyDown}
                      placeholder="Escanea para saltar al producto…"
                      tituloCamara={`Auditar · ${etiquetaDepartamento(deptoActivo)}`}
                      inputStyle={{ fontSize: '1.05rem', letterSpacing: '0.04em' }}
                    />
                  </div>
                </label>

                {articuloActual && (
                  <div style={{ padding: '1rem', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{articuloActual.nombre}</div>
                    <div className="muted" style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
                      Código / barras: <strong>{articuloActual.codigo}</strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.65rem', marginTop: '0.85rem' }}>
                      <div>
                        <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>En existencia</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-blue)' }}>{articuloActual.existencia}</div>
                      </div>
                      <div>
                        <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Cantidad contada</div>
                        <input
                          ref={contadaInputRef}
                          className="input"
                          type="number"
                          min={0}
                          style={{ marginTop: '0.2rem', fontSize: '1.35rem', fontWeight: 700, padding: '0.5rem' }}
                          value={conteos[articuloActual.id] ?? ''}
                          onChange={(e) => setContada(articuloActual.id, e.target.value)}
                          onKeyDown={onContadaKeyDown}
                          placeholder={String(articuloActual.existencia)}
                        />
                      </div>
                      <div>
                        <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Diferencia</div>
                        <div
                          style={{
                            fontSize: '1.15rem',
                            fontWeight: 700,
                            marginTop: '0.35rem',
                            color:
                              articuloActual.contadaNum == null
                                ? 'inherit'
                                : articuloActual.diferencia === 0
                                  ? 'var(--brand-green)'
                                  : articuloActual.diferencia > 0
                                    ? 'var(--brand-gold-dark)'
                                    : 'var(--brand-red)',
                          }}
                        >
                          {etiquetaDiferencia(articuloActual)}
                        </div>
                      </div>
                      <div>
                        <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Valor dif.</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.35rem' }}>
                          {articuloActual.valorDiferencia > 0 ? fmtMxn(articuloActual.valorDiferencia) : '—'}
                        </div>
                      </div>
                    </div>
                    <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.78rem' }}>
                      Si dejas vacío y pulsas Siguiente, se asume que coincide con existencia ({articuloActual.existencia}).
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" onClick={siguienteArticulo} disabled={!articuloActual}>
                    Siguiente artículo
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setIndiceActual((i) => Math.max(0, i - 1))}
                    disabled={indiceActual <= 0}
                  >
                    Anterior
                  </button>
                  <button type="button" className="btn btn-gold" onClick={() => setMostrarResumenDepto(true)}>
                    Ver resumen
                  </button>
                </div>
              </div>

              <div className="card" style={{ margin: 0 }}>
                <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Listado del departamento</h4>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Artículo</th>
                        <th>Existencia</th>
                        <th>Contada</th>
                        <th>Diferencia</th>
                        <th>Valor dif.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineasDepto.map((l, idx) => (
                        <tr
                          key={l.id}
                          style={{
                            background: idx === indiceActual ? 'rgba(59,105,181,0.08)' : l.estado === 'ok' ? 'rgba(34,139,34,0.04)' : undefined,
                            cursor: 'pointer',
                          }}
                          onClick={() => setIndiceActual(idx)}
                        >
                          <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }}>{l.codigo}</td>
                          <td>{l.nombre}</td>
                          <td>{l.existencia}</td>
                          <td>
                            <input
                              className="input"
                              type="number"
                              min={0}
                              style={{ width: '4.5rem', padding: '0.25rem 0.4rem', fontSize: '0.85rem' }}
                              value={conteos[l.id] ?? ''}
                              onChange={(e) => setContada(l.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td
                            style={{
                              fontWeight: 600,
                              color: l.estado === 'faltante' ? 'var(--brand-red)' : l.estado === 'sobrante' ? 'var(--brand-gold-dark)' : l.estado === 'ok' ? 'var(--brand-green)' : undefined,
                            }}
                          >
                            {etiquetaDiferencia(l)}
                          </td>
                          <td className="muted" style={{ fontSize: '0.82rem' }}>{l.valorDiferencia > 0 ? fmtMxn(l.valorDiferencia) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {(mostrarResumenDepto || resumenDepto.skusPendientes === 0) && lineasDepto.length > 0 && (
            <div className="card" style={{ borderTop: '4px solid var(--brand-green)', margin: 0 }}>
              <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>
                Resumen · {etiquetaDepartamento(deptoActivo)}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.65rem' }}>
                <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Artículos</div>
                  <div style={{ fontWeight: 700 }}>{resumenDepto.totalSkus}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>{resumenDepto.skusPendientes} pendientes</div>
                </div>
                <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Piezas contadas</div>
                  <div style={{ fontWeight: 700 }}>{resumenDepto.piezasContadas}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>Sistema: {resumenDepto.piezasExistencia}</div>
                </div>
                <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'rgba(220,53,69,0.06)', border: '1px solid rgba(220,53,69,0.2)' }}>
                  <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Faltante</div>
                  <div style={{ fontWeight: 700, color: 'var(--brand-red)' }}>{resumenDepto.piezasFaltantes} pzs</div>
                  <div style={{ fontWeight: 600, color: 'var(--brand-red)' }}>{fmtMxn(resumenDepto.valorFaltante)}</div>
                </div>
                <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'rgba(225,153,41,0.08)', border: '1px solid rgba(225,153,41,0.25)' }}>
                  <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Sobrante</div>
                  <div style={{ fontWeight: 700, color: 'var(--brand-gold-dark)' }}>{resumenDepto.piezasSobrantes} pzs</div>
                  <div style={{ fontWeight: 600, color: 'var(--brand-gold-dark)' }}>{fmtMxn(resumenDepto.valorSobrante)}</div>
                </div>
                <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Cuadran</div>
                  <div style={{ fontWeight: 700, color: 'var(--brand-green)' }}>{resumenDepto.skusOk} SKU</div>
                </div>
              </div>

              {resumenDepto.skusPendientes > 0 && (
                <p className="muted" style={{ margin: '0.75rem 0 0', color: 'var(--brand-gold-dark)' }}>
                  Faltan {resumenDepto.skusPendientes} producto(s) por contar. Usa «Siguiente artículo» en cada uno.
                </p>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={() => imprimir({ soloDepto: true })}>
                  Imprimir reporte del depto
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setPaso('deptos')}>
                  Listo · otro departamento
                </button>
                {mostrarResumenDepto && resumenDepto.skusPendientes > 0 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setMostrarResumenDepto(false)}>
                    Seguir contando
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {historial.length > 0 && paso !== 'conteo' && (
        <section className="ruta-invop-panel">
          <h4 style={{ margin: '0 0 0.5rem' }}>Últimas auditorías (este dispositivo)</h4>
          <div className="ruta-invop-hist">
            {historial.map((a) => (
              <div key={a.id} className="ruta-invop-hist-row">
                <div>
                  <strong>{a.recolector_nombre || a.camion_etiqueta || '—'}</strong>
                  <span className="muted">
                    {String(a.created_at || '').slice(0, 16).replace('T', ' ')}
                    {a.camion_etiqueta ? ` · ${a.camion_etiqueta}` : ''}
                  </span>
                </div>
                <div className="ruta-invop-hist-nums">
                  <span className="falt">{a.resumen?.piezasFaltantes ?? 0} pza</span>
                  <span>{fmtMonto(a.resumen?.perdidaPublico)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
