# Inv-op Venta en Ruta = inventario de sucursales

**Repo canónico:** https://github.com/aba3bs-arch/pos3b  
**Espejo (este repo):** https://github.com/amarrero1504-max/pos3b  

## Qué pediste

Que el **inventario operativo** de Venta en Ruta sea **igual** al de sucursales (Inv-op / conteo por departamento):

1. Por **departamento**
2. **Artículo a artículo** (En existencia · Cantidad contada · Diferencia · Valor dif.)
3. Botones **Siguiente artículo / Anterior / Ver resumen**
4. **Listado del departamento**
5. **Resumen** + **ticket / reporte**

La captura de referencia es la pantalla de sucursales (`ConteoPorDepartamento`).

## Qué cambia (archivos a copiar al POS real)

| Archivo | Cambio |
|---------|--------|
| `src/modules/AuditoriaCamionRuta.jsx` | Inv-op ruta: mismo flujo visual que sucursales + ticket |
| `src/modules/Preinventario.jsx` | Preinventario camión con el mismo formato |
| `src/modules/PreinventarioRuta.jsx` | Texto de ayuda alineado |
| `src/lib/conteoDepartamento.js` | Opción `existencia` override (disponible camión) |
| `src/lib/impresion.js` | Ticket `imprimirAuditoriaCamion` + reporte preinventario enriquecido |

Copia también desde `patches/inv-op-ruta-igual-sucursales/`.

## Comportamiento

- **Inv-op / Auditorías** (Venta en Ruta): recolector → departamentos → conteo artículo a artículo → resumen e impresión. **No modifica** stock del camión.
- **Preinventario** del camión: mismo formato de conteo y ticket. **No modifica** el teórico.
- En sucursales, Inv-op sigue aplicando ajuste de inventario (sin cambios).

## Cómo aterrizar en producción

1. Relanza el Cloud Agent apuntando a `aba3bs-arch/pos3b`, **o**
2. Copia los archivos de `src/` / `patches/inv-op-ruta-igual-sucursales/` al repo canónico y despliega.

Este espejo (`amarrero1504-max/pos3b`) no tiene permiso de push al repo canónico.
