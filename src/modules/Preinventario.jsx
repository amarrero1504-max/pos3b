import React, { useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaDepartamento, listarDepartamentos } from '../lib/departamentos.js';
import {
  construirLineaConteo,
  productosEnDepartamento,
  resumirConteoDepartamento,
} from '../lib/conteoDepartamento.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  eliminarPlantillaPreinventario,
  guardarPlantillaPreinventario,
  guardarSesionPreinventario,
  listarPlantillasPreinventario,
  productosParaPlantilla,
} from '../lib/preinventario.js';
import { productoCoincideBusqueda, productoPorCodigoExacto } from '../lib/buscarProductoTexto.js';
import { fmtMxn } from '../lib/valorInventario.js';
import { imprimirPreinventario } from '../lib/impresion.js';
import CampoCodigo from '../components/CampoCodigo.jsx';
import Icon, { BtnLabel } from '../components/Icon.jsx';

/**
 * Misma UX que inv-op (ConteoPorDepartamento): artículo a artículo, por depto,
 * resumen y ticket. En ruta/preinventario NO aplica stock teórico.
 */
export default function Preinventario({
  supabase,
  inventario,
  user,
  sucursal,
  onVolver,
  teoricoFn = null,
  titulo = null,
  ayudaExtra = null,
  /** Si true, al abrir entra al flujo por departamento con la mercancía del inventario (camión). */
  autoContarInventario = false,
  /** Etiqueta de la plantilla virtual de conteo directo. */
  etiquetaConteoDirecto = 'Mercancía del camión',
}) {
  const [plantillas, setPlantillas] = useState([]);
  const [aviso, setAviso] = useState('');
  const [msg, setMsg] = useState('');
  const [modo, setModo] = useState(autoContarInventario && (inventario || []).length ? 'conteo' : 'lista');
  const [nombrePlantilla, setNombrePlantilla] = useState('');
  const [tipoPlantilla, setTipoPlantilla] = useState('personal');
  const [departamentoPlantilla, setDepartamentoPlantilla] = useState('GENERAL');
  const [qProd, setQProd] = useState('');
  const [selIds, setSelIds] = useState(() => new Set());

  const [plantillaActiva, setPlantillaActiva] = useState(() => {
    if (!autoContarInventario || !(inventario || []).length) return null;
    return {
      id: '__inventario__',
      nombre: etiquetaConteoDirecto,
      tipo: 'camion',
      productos: (inventario || []).map((p) => ({ id: p.id, nombre: p.nombre })),
      virtual: true,
    };
  });

  const [departamento, setDepartamento] = useState('GENERAL');
  const [conteoActivo, setConteoActivo] = useState(false);
  const [conteos, setConteos] = useState({});
  const [indiceActual, setIndiceActual] = useState(0);
  const [codigoEscaneo, setCodigoEscaneo] = useState('');
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [folioCerrado, setFolioCerrado] = useState(null);
  const contadaInputRef = useRef(null);
  const scanInputRef = useRef(null);

  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario]);

  const recargar = async () => {
    const r = await listarPlantillasPreinventario(supabase, sucursal);
    setPlantillas(r.data || []);
    if (r.aviso) setAviso(r.aviso);
  };

  useEffect(() => {
    void recargar();
  }, [supabase, sucursal]);

  useEffect(() => {
    if (!autoContarInventario) return;
    if (!(inventario || []).length) return;
    setPlantillaActiva((prev) => {
      if (prev && !prev.virtual) return prev;
      return {
        id: '__inventario__',
        nombre: etiquetaConteoDirecto,
        tipo: 'camion',
        productos: (inventario || []).map((p) => ({ id: p.id, nombre: p.nombre })),
        virtual: true,
      };
    });
    setModo((m) => (m === 'nueva' ? m : 'conteo'));
  }, [autoContarInventario, inventario, etiquetaConteoDirecto]);

  // Si el depto actual no está en la lista (inventario cambió), tomar el primero.
  useEffect(() => {
    if (!departamentos.length) return;
    if (!departamentos.includes(departamento)) {
      setDepartamento(departamentos[0]);
    }
  }, [departamentos, departamento]);

  const productosFiltro = useMemo(() => {
    const t = qProd.trim();
    let list = inventario || [];
    if (t) list = list.filter((p) => productoCoincideBusqueda(p, t));
    return list.slice(0, 80);
  }, [inventario, qProd]);

  const mapaProd = useMemo(() => {
    const m = new Map();
    for (const p of inventario || []) m.set(String(p.id), p);
    return m;
  }, [inventario]);

  /** Universo de productos de la plantilla / camión (antes de filtrar depto). */
  const productosBase = useMemo(() => {
    if (!plantillaActiva) return [];
    let prods = (plantillaActiva.productos || [])
      .map((ref) => mapaProd.get(String(ref.id)))
      .filter(Boolean);
    if (!prods.length && (inventario || []).length) {
      if (plantillaActiva.tipo === 'departamento' && plantillaActiva.departamento) {
        prods = productosEnDepartamento(inventario, plantillaActiva.departamento);
      }
      if (!prods.length) prods = [...(inventario || [])];
    }
    return prods;
  }, [plantillaActiva, mapaProd, inventario]);

  const departamentosConteo = useMemo(() => listarDepartamentos(productosBase), [productosBase]);

  const productosDept = useMemo(
    () => productosEnDepartamento(productosBase, departamento),
    [productosBase, departamento],
  );

  const lineas = useMemo(
    () => productosDept.map((p) => {
      const existencia = teoricoFn
        ? Math.max(0, Math.floor(Number(teoricoFn(p)) || 0))
        : undefined;
      return construirLineaConteo(
        p,
        conteos[p.id] ?? '',
        teoricoFn ? '' : sucursal,
        existencia != null ? { existencia } : {},
      );
    }),
    [productosDept, conteos, teoricoFn, sucursal],
  );

  const resumen = useMemo(() => resumirConteoDepartamento(lineas), [lineas]);
  const articuloActual = lineas[indiceActual] || null;

  useEffect(() => {
    if (conteoActivo && !mostrarResumen && !folioCerrado) contadaInputRef.current?.focus();
  }, [conteoActivo, indiceActual, mostrarResumen, folioCerrado]);

  const abrirConteoCamion = () => {
    if (!(inventario || []).length) {
      setMsg('No hay mercancía en el camión para contar.');
      return;
    }
    setPlantillaActiva({
      id: '__inventario__',
      nombre: etiquetaConteoDirecto,
      tipo: 'camion',
      productos: (inventario || []).map((p) => ({ id: p.id, nombre: p.nombre })),
      virtual: true,
    });
    setConteos({});
    setConteoActivo(false);
    setMostrarResumen(false);
    setFolioCerrado(null);
    setIndiceActual(0);
    setModo('conteo');
    setMsg('');
  };

  const crearPlantilla = async () => {
    setMsg('');
    const productos = productosParaPlantilla(inventario, {
      tipo: tipoPlantilla,
      departamento: departamentoPlantilla,
      idsSeleccionados: [...selIds],
    });
    if (!productos.length) {
      setMsg('Agrega productos o elige un departamento con mercancía.');
      return;
    }
    const res = await guardarPlantillaPreinventario(supabase, {
      sucursal_id: sucursal,
      nombre: nombrePlantilla || (tipoPlantilla === 'departamento' ? `Depto ${departamentoPlantilla}` : 'Mi plantilla'),
      tipo: tipoPlantilla,
      departamento: tipoPlantilla === 'departamento' ? departamentoPlantilla : null,
      creado_por: user?.nombre,
      creado_por_id: user?.id,
      productos,
    });
    if (!res.ok) {
      setMsg(res.error || 'No se pudo guardar.');
      return;
    }
    if (res.aviso) setAviso(res.aviso);
    setMsg('Plantilla guardada. No afecta el inventario teórico.');
    setModo('lista');
    setNombrePlantilla('');
    setSelIds(new Set());
    await recargar();
  };

  const abrirConteo = (plantilla) => {
    setPlantillaActiva(plantilla);
    setConteos({});
    setConteoActivo(false);
    setMostrarResumen(false);
    setFolioCerrado(null);
    setIndiceActual(0);
    if (plantilla?.tipo === 'departamento' && plantilla.departamento) {
      setDepartamento(String(plantilla.departamento).toUpperCase());
    }
    setModo('conteo');
    setMsg('');
  };

  const iniciarConteo = () => {
    if (!productosDept.length) {
      setMsg('No hay productos en este departamento.');
      return;
    }
    setConteos({});
    setIndiceActual(0);
    setMostrarResumen(false);
    setFolioCerrado(null);
    setConteoActivo(true);
    setCodigoEscaneo('');
    setMsg('');
  };

  const cambiarDepartamento = (dept) => {
    setDepartamento(dept);
    setConteoActivo(false);
    setConteos({});
    setMostrarResumen(false);
    setFolioCerrado(null);
    setIndiceActual(0);
  };

  const setContada = (productoId, valor) => {
    setConteos((prev) => ({ ...prev, [productoId]: valor }));
  };

  const irAProducto = (productoId) => {
    const idx = lineas.findIndex((l) => String(l.productoId) === String(productoId));
    if (idx >= 0) {
      setIndiceActual(idx);
      setMostrarResumen(false);
    }
  };

  const procesarEscaneo = (raw) => {
    const codigo = String(raw ?? codigoEscaneo).trim();
    if (!codigo) return;
    const prod = productoPorCodigoExacto(productosBase, codigo)
      || productoPorCodigoExacto(inventario, codigo);
    if (!prod) {
      setCodigoEscaneo('');
      scanInputRef.current?.focus();
      setMsg(`No está en el inventario del conteo: ${codigo}`);
      return;
    }
    if (String(prod.cat || 'GENERAL').toUpperCase() !== String(departamento).toUpperCase()) {
      setCodigoEscaneo('');
      setMsg(`"${prod.nombre}" pertenece a ${etiquetaDepartamento(prod.cat)}, no a ${etiquetaDepartamento(departamento)}.`);
      return;
    }
    irAProducto(prod.id);
    setCodigoEscaneo('');
    setMsg('');
    contadaInputRef.current?.focus();
    contadaInputRef.current?.select();
  };

  const siguienteArticulo = () => {
    if (!articuloActual) return;
    const pid = articuloActual.productoId;
    const raw = conteos[pid];
    const contadaFinal = raw === undefined || String(raw).trim() === ''
      ? String(articuloActual.existencia)
      : String(raw);
    const nextConteos = { ...conteos, [pid]: contadaFinal };
    setConteos(nextConteos);

    const lineasNext = productosDept.map((p) => {
      const existencia = teoricoFn
        ? Math.max(0, Math.floor(Number(teoricoFn(p)) || 0))
        : undefined;
      return construirLineaConteo(
        p,
        nextConteos[p.id] ?? '',
        teoricoFn ? '' : sucursal,
        existencia != null ? { existencia } : {},
      );
    });
    const nextIdx = lineasNext.findIndex((l, i) => i > indiceActual && l.contadaNum == null);
    if (nextIdx >= 0) {
      setIndiceActual(nextIdx);
      return;
    }
    const firstPending = lineasNext.findIndex((l) => l.contadaNum == null && String(l.productoId) !== String(pid));
    if (firstPending >= 0) {
      setIndiceActual(firstPending);
      return;
    }
    setMostrarResumen(true);
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

  const lineasParaTicket = () => lineas.map((l) => ({
    id: l.productoId,
    codigo: l.codigo,
    nombre: l.nombre,
    teorico: l.existencia,
    existencia: l.existencia,
    contado: l.contadaNum,
    contadaNum: l.contadaNum,
    diferencia: l.diferencia,
    valorDiferencia: l.valorDiferencia,
    precioVenta: l.precioVenta,
  }));

  const imprimir = (opts = {}) => {
    imprimirPreinventario({
      sucursal,
      usuario: user?.nombre,
      nombre: plantillaActiva?.nombre || etiquetaConteoDirecto,
      departamento: etiquetaDepartamento(departamento),
      folio: opts.folio || folioCerrado || undefined,
      lineas: lineasParaTicket(),
      resumen: {
        ...resumen,
        contados: resumen.totalSkus - resumen.skusPendientes,
        productos: resumen.totalSkus,
        faltante: resumen.piezasFaltantes,
        sobrante: resumen.piezasSobrantes,
      },
    });
  };

  const cerrarYGuardar = async () => {
    if (!resumen.listoParaAplicar) {
      setMsg(`Aún faltan ${resumen.skusPendientes} producto(s) por contar. Usa «Siguiente artículo» en cada uno.`);
      setMostrarResumen(true);
      return;
    }
    setCerrando(true);
    setMsg('');
    const res = await guardarSesionPreinventario(supabase, {
      sucursal_id: sucursal,
      plantilla_id: plantillaActiva?.virtual ? null : plantillaActiva?.id,
      nombre: `${plantillaActiva?.nombre || 'Preinventario'} · ${etiquetaDepartamento(departamento)}`,
      creado_por: user?.nombre,
      creado_por_id: user?.id,
      lineas: lineasParaTicket(),
      estado: 'cerrada',
    });
    setCerrando(false);
    if (!res.ok) {
      setMsg(res.error || 'No se pudo guardar el conteo.');
      return;
    }
    if (res.aviso) setAviso(res.aviso);
    const folio = res.sesion?.id || `PI-${Date.now().toString(36).toUpperCase()}`;
    setFolioCerrado(folio);
    setMsg('Preinventario cerrado. El inventario teórico no cambió. Se imprime el ticket.');
    imprimir({ folio });
  };

  const borrarPlantilla = async (p) => {
    if (!confirm(`¿Borrar plantilla «${p.nombre}»?`)) return;
    const res = await eliminarPlantillaPreinventario(supabase, p.id, sucursal);
    if (!res.ok) setMsg(res.error || 'No se pudo borrar.');
    else {
      setMsg('Plantilla borrada.');
      await recargar();
    }
  };

  const etiquetaDiferencia = (l) => {
    if (l.contadaNum == null) return '—';
    if (l.diferencia === 0) return '0';
    if (l.diferencia > 0) return `+${l.diferencia} sobrante`;
    return `${l.diferencia} faltante`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--brand-blue-dark)' }}>{titulo || 'Preinventario'}</h3>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {ayudaExtra
              || `${etiquetaTienda(sucursal)} · mismo formato que inv-op (por departamento) · no modifica el inventario teórico`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {modo !== 'lista' && !autoContarInventario && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setModo('lista');
                setPlantillaActiva(null);
                setConteoActivo(false);
                setFolioCerrado(null);
              }}
            >
              Volver a plantillas
            </button>
          )}
          {onVolver && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onVolver}>
              Cerrar
            </button>
          )}
        </div>
      </div>

      {aviso && <p className="muted" style={{ margin: 0 }}>{aviso}</p>}
      {msg && <p style={{ margin: 0, color: 'var(--brand-blue)' }}>{msg}</p>}

      {modo === 'lista' && (
        <>
          {(inventario || []).length > 0 && (
            <button type="button" className="btn btn-primary" style={{ alignSelf: 'start' }} onClick={abrirConteoCamion}>
              <BtnLabel icon="package">Contar mercancía del camión ({inventario.length})</BtnLabel>
            </button>
          )}
          <button type="button" className="btn btn-ghost" style={{ alignSelf: 'start' }} onClick={() => setModo('nueva')}>
            <BtnLabel icon="plus">Nueva plantilla</BtnLabel>
          </button>
          {plantillas.length === 0 ? (
            <p className="muted">
              {(inventario || []).length
                ? 'Puedes contar por departamento la mercancía del camión o crear una plantilla.'
                : 'Aún no hay plantillas. Crea una personal o por departamento.'}
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Productos</th>
                    <th>Creó</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {plantillas.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.nombre}</strong></td>
                      <td>
                        {p.tipo === 'departamento'
                          ? `Depto · ${etiquetaDepartamento(p.departamento || 'GENERAL')}`
                          : 'Personal'}
                      </td>
                      <td>{(p.productos || []).length}</td>
                      <td className="muted">{p.creado_por || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => abrirConteo(p)}>
                            Contar
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => borrarPlantilla(p)}>
                            Borrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modo === 'nueva' && (
        <div className="card" style={{ display: 'grid', gap: '0.75rem', maxWidth: 640 }}>
          <label>
            <span className="muted" style={{ fontSize: '0.82rem' }}>Nombre</span>
            <input className="input" value={nombrePlantilla} onChange={(e) => setNombrePlantilla(e.target.value)} placeholder="Ej. Mi anaquel frío" />
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" checked={tipoPlantilla === 'personal'} onChange={() => setTipoPlantilla('personal')} />
              Personal (elijo productos)
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" checked={tipoPlantilla === 'departamento'} onChange={() => setTipoPlantilla('departamento')} />
              Por departamento
            </label>
          </div>
          {tipoPlantilla === 'departamento' ? (
            <label>
              <span className="muted" style={{ fontSize: '0.82rem' }}>Departamento</span>
              <select className="select" value={departamentoPlantilla} onChange={(e) => setDepartamentoPlantilla(e.target.value)}>
                {departamentos.map((d) => (
                  <option key={d} value={d}>{etiquetaDepartamento(d)}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <input className="input" value={qProd} onChange={(e) => setQProd(e.target.value)} placeholder="Buscar producto…" />
              <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {productosFiltro.map((p) => {
                  const on = selIds.has(String(p.id));
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: 'flex',
                        gap: 8,
                        padding: '0.45rem 0.6rem',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: on ? 'rgba(59,105,181,0.08)' : undefined,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          setSelIds((prev) => {
                            const n = new Set(prev);
                            if (n.has(String(p.id))) n.delete(String(p.id));
                            else n.add(String(p.id));
                            return n;
                          });
                        }}
                      />
                      <span style={{ flex: 1 }}>{p.nombre}</span>
                      <span className="muted" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.id}</span>
                    </label>
                  );
                })}
              </div>
              <p className="muted" style={{ margin: 0 }}>{selIds.size} seleccionado(s)</p>
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={crearPlantilla}>
            Guardar plantilla
          </button>
        </div>
      )}

      {modo === 'conteo' && plantillaActiva && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
            <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>
              Conteo físico por departamento
            </h4>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Igual que inv-op: elige departamento, cuenta pieza por pieza y al terminar imprime el reporte/ticket.
              Este preinventario <strong>no modifica</strong> el inventario teórico.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="muted" style={{ flex: '1 1 200px' }}>
                Departamento
                <select
                  className="select"
                  style={{ marginTop: '0.35rem' }}
                  value={departamento}
                  onChange={(e) => cambiarDepartamento(e.target.value)}
                  disabled={conteoActivo && !folioCerrado}
                >
                  {(departamentosConteo.length ? departamentosConteo : departamentos).map((d) => (
                    <option key={d} value={d}>
                      {etiquetaDepartamento(d)}
                    </option>
                  ))}
                </select>
              </label>
              {!conteoActivo && !folioCerrado && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={iniciarConteo}
                  disabled={!productosDept.length}
                >
                  Iniciar conteo ({productosDept.length} artículos)
                </button>
              )}
              {conteoActivo && !folioCerrado && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (confirm('¿Cancelar el conteo en curso?')) {
                      setConteoActivo(false);
                      setConteos({});
                      setMostrarResumen(false);
                    }
                  }}
                >
                  Cancelar conteo
                </button>
              )}
            </div>
          </div>

          {folioCerrado && (
            <div className="card" style={{ borderTop: '4px solid var(--brand-green)', background: 'rgba(34,139,34,0.06)' }}>
              <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-green)' }}>Preinventario cerrado</h4>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-blue)', fontFamily: 'ui-monospace, monospace' }}>
                {folioCerrado}
              </div>
              <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
                Ticket/reporte listo. El teórico del sistema no cambió.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={() => imprimir()}>
                  Reimprimir ticket
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setConteoActivo(false);
                    setConteos({});
                    setMostrarResumen(false);
                    setFolioCerrado(null);
                  }}
                >
                  Nuevo conteo
                </button>
              </div>
            </div>
          )}

          {conteoActivo && !folioCerrado && (
            <>
              <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>
                    Artículo {indiceActual + 1} de {lineas.length}
                  </h4>
                  <span className="badge">{etiquetaDepartamento(departamento)}</span>
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
                      tituloCamara="Escanear preinventario"
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
                          value={conteos[articuloActual.productoId] ?? ''}
                          onChange={(e) => setContada(articuloActual.productoId, e.target.value)}
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
                          {articuloActual.contadaNum == null
                            ? '—'
                            : articuloActual.diferencia === 0
                              ? 'Cuadra'
                              : articuloActual.diferencia > 0
                                ? `+${articuloActual.diferencia} sobrante`
                                : `${articuloActual.diferencia} faltante`}
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
                  <button type="button" className="btn btn-gold" onClick={() => setMostrarResumen(true)}>
                    Ver resumen
                  </button>
                </div>
              </div>

              <div className="card">
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
                      {lineas.map((l, idx) => (
                        <tr
                          key={l.productoId}
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
                              value={conteos[l.productoId] ?? ''}
                              onChange={(e) => setContada(l.productoId, e.target.value)}
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

          {conteoActivo && (mostrarResumen || resumen.skusPendientes === 0) && !folioCerrado && (
            <div className="card" style={{ borderTop: '4px solid var(--brand-green)' }}>
              <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Resumen del conteo · reporte</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.65rem' }}>
                <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Artículos</div>
                  <div style={{ fontWeight: 700 }}>{resumen.totalSkus}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>{resumen.skusPendientes} pendientes</div>
                </div>
                <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Piezas contadas</div>
                  <div style={{ fontWeight: 700 }}>{resumen.piezasContadas}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>Existencia: {resumen.piezasExistencia}</div>
                </div>
                <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'rgba(220,53,69,0.06)', border: '1px solid rgba(220,53,69,0.2)' }}>
                  <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Faltante</div>
                  <div style={{ fontWeight: 700, color: 'var(--brand-red)' }}>{resumen.piezasFaltantes} pzs</div>
                  <div style={{ fontWeight: 600, color: 'var(--brand-red)' }}>{fmtMxn(resumen.valorFaltante)}</div>
                </div>
                <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'rgba(225,153,41,0.08)', border: '1px solid rgba(225,153,41,0.25)' }}>
                  <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Sobrante</div>
                  <div style={{ fontWeight: 700, color: 'var(--brand-gold-dark)' }}>{resumen.piezasSobrantes} pzs</div>
                  <div style={{ fontWeight: 600, color: 'var(--brand-gold-dark)' }}>{fmtMxn(resumen.valorSobrante)}</div>
                </div>
                <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Cuadran</div>
                  <div style={{ fontWeight: 700, color: 'var(--brand-green)' }}>{resumen.skusOk} SKU</div>
                </div>
              </div>

              {resumen.skusPendientes > 0 && (
                <p className="muted" style={{ margin: '0.75rem 0 0', color: 'var(--brand-gold-dark)' }}>
                  Faltan {resumen.skusPendientes} producto(s) por contar antes de cerrar el reporte.
                </p>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={cerrarYGuardar}
                  disabled={cerrando || !resumen.listoParaAplicar}
                >
                  {cerrando ? 'Guardando…' : 'Cerrar e imprimir ticket'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => imprimir()}>
                  Imprimir borrador
                </button>
                {mostrarResumen && resumen.skusPendientes > 0 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setMostrarResumen(false)}>
                    Seguir contando
                  </button>
                )}
              </div>
              <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.78rem' }}>
                *Existencia = disponible en camión (cargada − vendida − devuelta). No corrige el inventario teórico.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
