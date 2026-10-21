# Preinventario de ruta = formato inv-op

**Repo canónico:** https://github.com/aba3bs-arch/pos3b  
**Archivos a sustituir en el POS real:**

- `src/modules/Preinventario.jsx`
- `src/modules/PreinventarioRuta.jsx`
- `src/lib/conteoDepartamento.js` (opción `existencia` override)
- `src/lib/impresion.js` (`htmlPreinventario` enriquecido)

## Qué cambia

El preinventario de **Venta en Ruta** usa el mismo flujo que **inv-op / Conteo por departamento**:

1. Elegir **departamento**
2. Contar **artículo a artículo** (existencia, contada, diferencia, valor dif.)
3. Botones **Siguiente / Anterior / Ver resumen**
4. **Listado del departamento**
5. **Resumen** con faltante/sobrante en piezas y $ + **imprimir ticket**

No aplica ni corrige el inventario teórico (solo control del camión).

## Cómo aterrizar

Relanza el Cloud Agent apuntando a `aba3bs-arch/pos3b`, o copia los 4 archivos de `src/` / `patches/preinventario-ruta-inv-op/` al repo canónico.
