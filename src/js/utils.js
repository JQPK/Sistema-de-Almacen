/* ═══════════════════════════════════════════════════════════════
   Joyería Mariné — Funciones Puras (utils.js)
   Lógica de negocio pura, independiente del DOM y del IPC de Electron.
   Exportadas con module.exports para ser importables en tests con Jest.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Calcula el total de una venta aplicando un descuento monetario.
 * El resultado nunca es negativo.
 *
 * @param {number} subtotal  - Monto base de la venta (>= 0)
 * @param {number} descuento - Descuento monetario a restar (>= 0)
 * @returns {number} Total resultante, mínimo 0
 *
 * Valida: Requisitos 5.3, 5.7
 */
function calcTotalWithDiscount(subtotal, descuento) {
  const sub = Number(subtotal) || 0;
  const desc = Number(descuento) || 0;
  return Math.max(sub - desc, 0);
}

/**
 * Valida que un rango de fechas sea coherente (inicio <= fin).
 *
 * @param {string|Date} fechaInicio - Fecha de inicio del rango
 * @param {string|Date} fechaFin    - Fecha de fin del rango
 * @returns {{ valid: true } | { valid: false, error: string }}
 *
 * Valida: Requisito 3.3
 */
function validateDateRange(fechaInicio, fechaFin) {
  if (!fechaInicio || !fechaFin) {
    return { valid: false, error: 'Las fechas de inicio y fin son obligatorias' };
  }

  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);

  if (isNaN(inicio.getTime())) {
    return { valid: false, error: 'La fecha de inicio no es válida' };
  }
  if (isNaN(fin.getTime())) {
    return { valid: false, error: 'La fecha de fin no es válida' };
  }
  if (inicio > fin) {
    return { valid: false, error: 'La fecha de inicio no puede ser posterior a la fecha de fin' };
  }

  return { valid: true };
}

/**
 * Filtra un array de ventas por rango de fechas (inclusive en ambos extremos).
 * Cada venta debe tener un campo `fecha` (string ISO o Date).
 *
 * @param {Array<{fecha: string|Date}>} sales - Array de ventas
 * @param {string|Date} fechaInicio           - Inicio del rango (inclusive)
 * @param {string|Date} fechaFin              - Fin del rango (inclusive, hasta 23:59:59)
 * @returns {Array} Ventas dentro del rango
 *
 * Valida: Requisitos 2.3, 3.2, 3.5
 */
function filterSalesByDateRange(sales, fechaInicio, fechaFin) {
  if (!Array.isArray(sales)) return [];

  // Normalizar fechas a cadenas YYYY-MM-DD para comparación por fecha local
  // Esto evita problemas de zona horaria al comparar fechas sin hora vs con hora
  const toDateStr = (d) => {
    const date = new Date(d);
    if (isNaN(date.getTime())) return null;
    // Si la cadena ya tiene componente de hora, usar la fecha local
    const str = String(d);
    if (str.includes('T') || str.includes(' ')) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    // Si es solo fecha (YYYY-MM-DD), usar directamente
    return str.slice(0, 10);
  };

  const inicioStr = toDateStr(fechaInicio);
  const finStr = toDateStr(fechaFin);

  return sales.filter(sale => {
    const ventaStr = toDateStr(sale.fecha);
    if (!ventaStr) return false;
    return ventaStr >= inicioStr && ventaStr <= finStr;
  });
}

/**
 * Valida que un descuento monetario sea aplicable al subtotal dado.
 * El descuento debe ser >= 0 y no puede superar el subtotal.
 *
 * @param {number} descuento - Monto del descuento
 * @param {number} subtotal  - Subtotal de la venta
 * @returns {{ valid: true } | { valid: false, error: string }}
 *
 * Valida: Requisitos 5.4, 5.9
 */
function validateDiscount(descuento, subtotal) {
  const desc = Number(descuento);
  const sub = Number(subtotal);

  if (isNaN(desc)) {
    return { valid: false, error: 'El descuento debe ser un valor numérico' };
  }
  if (desc < 0) {
    return { valid: false, error: 'El descuento no puede ser negativo' };
  }
  if (desc > sub) {
    return { valid: false, error: 'El descuento no puede superar el subtotal de la venta' };
  }

  return { valid: true };
}

/**
 * Genera un código de producto con el formato PREFIX-NNNN.
 * El prefijo se convierte a mayúsculas y el ID se rellena con ceros hasta 4 dígitos.
 *
 * @param {string} prefix - Prefijo de la categoría (ej: 'oro', 'plata')
 * @param {number} id     - ID numérico del producto (entero positivo)
 * @returns {string} Código en formato PREFIX-NNNN (ej: 'ORO-0001')
 *
 * Valida: Requisito 6.1
 */
function generateProductCode(prefix, id) {
  const pre = String(prefix).toUpperCase();
  const num = String(Math.abs(Math.floor(Number(id)))).padStart(4, '0');
  return `${pre}-${num}`;
}

/**
 * Calcula estadísticas de inventario a partir de un array de productos activos.
 *
 * @param {Array<{stock_actual: number, precio_compra: number, precio_venta: number}>} products
 * @returns {{
 *   total_productos: number,
 *   total_unidades: number,
 *   valor_compra: number,
 *   valor_venta: number
 * }}
 *
 * Valida: Requisito 7.7
 */
function calcInventoryStats(products) {
  if (!Array.isArray(products)) {
    return { total_productos: 0, total_unidades: 0, valor_compra: 0, valor_venta: 0 };
  }

  return products.reduce(
    (acc, p) => {
      const stock = Number(p.stock_actual) || 0;
      const compra = Number(p.precio_compra) || 0;
      const venta = Number(p.precio_venta) || 0;

      acc.total_productos += 1;
      acc.total_unidades += stock;
      acc.valor_compra += stock * compra;
      acc.valor_venta += stock * venta;
      return acc;
    },
    { total_productos: 0, total_unidades: 0, valor_compra: 0, valor_venta: 0 }
  );
}

/**
 * Calcula el resumen de caja a partir de un array de movimientos.
 * Cada movimiento debe tener `tipo` ('ingreso' | 'egreso') y `monto` (número positivo).
 *
 * @param {Array<{tipo: 'ingreso'|'egreso', monto: number}>} movimientos
 * @returns {{
 *   total_ingresos: number,
 *   total_egresos: number,
 *   saldo_neto: number
 * }}
 *
 * Valida: Requisito 8.5
 */
function calcCajaResumen(movimientos) {
  if (!Array.isArray(movimientos)) {
    return { total_ingresos: 0, total_egresos: 0, saldo_neto: 0 };
  }

  const result = movimientos.reduce(
    (acc, m) => {
      const monto = Number(m.monto) || 0;
      if (m.tipo === 'ingreso') {
        acc.total_ingresos += monto;
      } else if (m.tipo === 'egreso') {
        acc.total_egresos += monto;
      }
      return acc;
    },
    { total_ingresos: 0, total_egresos: 0 }
  );

  result.saldo_neto = result.total_ingresos - result.total_egresos;
  return result;
}

/**
 * Valida que un monto de egreso sea válido (debe ser estrictamente mayor a 0).
 *
 * @param {number} monto - Monto del egreso
 * @returns {{ valid: true } | { valid: false, error: string }}
 *
 * Valida: Requisito 8.4
 */
function validateEgreso(monto) {
  const m = Number(monto);

  if (isNaN(m)) {
    return { valid: false, error: 'El monto debe ser un valor numérico' };
  }
  if (m <= 0) {
    return { valid: false, error: 'El monto del egreso debe ser mayor a 0' };
  }

  return { valid: true };
}

module.exports = {
  calcTotalWithDiscount,
  validateDateRange,
  filterSalesByDateRange,
  validateDiscount,
  generateProductCode,
  calcInventoryStats,
  calcCajaResumen,
  validateEgreso,
};

// Expose globally when loaded as a browser script (Electron renderer)
if (typeof window !== 'undefined') {
  window.calcTotalWithDiscount = calcTotalWithDiscount;
  window.validateDateRange = validateDateRange;
  window.filterSalesByDateRange = filterSalesByDateRange;
  window.validateDiscount = validateDiscount;
  window.generateProductCode = generateProductCode;
  window.calcInventoryStats = calcInventoryStats;
  window.calcCajaResumen = calcCajaResumen;
  window.validateEgreso = validateEgreso;
}
