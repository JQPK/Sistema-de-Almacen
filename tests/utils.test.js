/**
 * Tests básicos para las funciones puras de src/js/utils.js
 * Feature: mejoras-sistema-joyeria
 *
 * Cubre ejemplos representativos y casos borde para cada función.
 */

const {
  calcTotalWithDiscount,
  validateDateRange,
  filterSalesByDateRange,
  validateDiscount,
  generateProductCode,
  calcInventoryStats,
  calcCajaResumen,
  validateEgreso,
} = require('../src/js/utils');

// ─────────────────────────────────────────────────────────────
//  calcTotalWithDiscount
// ─────────────────────────────────────────────────────────────
describe('calcTotalWithDiscount', () => {
  test('resta el descuento del subtotal', () => {
    expect(calcTotalWithDiscount(100, 20)).toBe(80);
  });

  test('retorna 0 cuando el descuento iguala al subtotal', () => {
    expect(calcTotalWithDiscount(50, 50)).toBe(0);
  });

  test('retorna 0 cuando el descuento supera al subtotal (no negativo)', () => {
    expect(calcTotalWithDiscount(30, 50)).toBe(0);
  });

  test('retorna el subtotal intacto cuando el descuento es 0', () => {
    expect(calcTotalWithDiscount(200, 0)).toBe(200);
  });

  test('maneja valores decimales correctamente', () => {
    expect(calcTotalWithDiscount(99.99, 9.99)).toBeCloseTo(90);
  });
});

// ─────────────────────────────────────────────────────────────
//  validateDateRange
// ─────────────────────────────────────────────────────────────
describe('validateDateRange', () => {
  test('retorna valid:true cuando inicio <= fin', () => {
    expect(validateDateRange('2024-01-01', '2024-01-31')).toEqual({ valid: true });
  });

  test('retorna valid:true cuando inicio === fin (mismo día)', () => {
    expect(validateDateRange('2024-06-15', '2024-06-15')).toEqual({ valid: true });
  });

  test('retorna valid:false cuando inicio > fin', () => {
    const result = validateDateRange('2024-12-31', '2024-01-01');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('retorna valid:false cuando falta la fecha de inicio', () => {
    const result = validateDateRange(null, '2024-01-31');
    expect(result.valid).toBe(false);
  });

  test('retorna valid:false cuando falta la fecha de fin', () => {
    const result = validateDateRange('2024-01-01', null);
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
//  filterSalesByDateRange
// ─────────────────────────────────────────────────────────────
describe('filterSalesByDateRange', () => {
  const ventas = [
    { id: 1, fecha: '2024-03-01T10:00:00' },
    { id: 2, fecha: '2024-03-15T12:00:00' },
    { id: 3, fecha: '2024-03-31T23:00:00' },
    { id: 4, fecha: '2024-04-01T08:00:00' },
  ];

  test('filtra ventas dentro del rango', () => {
    const result = filterSalesByDateRange(ventas, '2024-03-01', '2024-03-31');
    expect(result).toHaveLength(3);
    expect(result.map(v => v.id)).toEqual([1, 2, 3]);
  });

  test('incluye ventas en los extremos del rango (inclusive)', () => {
    const result = filterSalesByDateRange(ventas, '2024-03-15', '2024-03-15');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('retorna array vacío si no hay ventas en el rango', () => {
    const result = filterSalesByDateRange(ventas, '2024-01-01', '2024-02-28');
    expect(result).toHaveLength(0);
  });

  test('retorna array vacío si el input no es un array', () => {
    expect(filterSalesByDateRange(null, '2024-01-01', '2024-12-31')).toEqual([]);
    expect(filterSalesByDateRange(undefined, '2024-01-01', '2024-12-31')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
//  validateDiscount
// ─────────────────────────────────────────────────────────────
describe('validateDiscount', () => {
  test('retorna valid:true para descuento válido (0 <= desc <= subtotal)', () => {
    expect(validateDiscount(10, 100)).toEqual({ valid: true });
  });

  test('retorna valid:true para descuento 0', () => {
    expect(validateDiscount(0, 50)).toEqual({ valid: true });
  });

  test('retorna valid:true cuando descuento iguala al subtotal', () => {
    expect(validateDiscount(100, 100)).toEqual({ valid: true });
  });

  test('retorna valid:false para descuento negativo', () => {
    const result = validateDiscount(-5, 100);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('retorna valid:false cuando descuento supera al subtotal', () => {
    const result = validateDiscount(150, 100);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
//  generateProductCode
// ─────────────────────────────────────────────────────────────
describe('generateProductCode', () => {
  test('genera código con prefijo en mayúsculas y padding de 4 dígitos', () => {
    expect(generateProductCode('oro', 1)).toBe('ORO-0001');
  });

  test('no agrega padding cuando el ID ya tiene 4 dígitos', () => {
    expect(generateProductCode('plata', 1234)).toBe('PLATA-1234');
  });

  test('maneja IDs grandes (más de 4 dígitos)', () => {
    expect(generateProductCode('dia', 12345)).toBe('DIA-12345');
  });

  test('convierte el prefijo a mayúsculas', () => {
    expect(generateProductCode('Plata', 7)).toBe('PLATA-0007');
  });

  test('genera código con ID 0 (padding completo)', () => {
    expect(generateProductCode('ORO', 0)).toBe('ORO-0000');
  });
});

// ─────────────────────────────────────────────────────────────
//  calcInventoryStats
// ─────────────────────────────────────────────────────────────
describe('calcInventoryStats', () => {
  test('calcula totales correctamente para un array de productos', () => {
    const products = [
      { stock_actual: 10, precio_compra: 100, precio_venta: 200 },
      { stock_actual: 5,  precio_compra: 50,  precio_venta: 80  },
    ];
    const stats = calcInventoryStats(products);
    expect(stats.total_productos).toBe(2);
    expect(stats.total_unidades).toBe(15);
    expect(stats.valor_compra).toBe(1250);  // 10*100 + 5*50
    expect(stats.valor_venta).toBe(2400);   // 10*200 + 5*80
  });

  test('retorna ceros para array vacío', () => {
    const stats = calcInventoryStats([]);
    expect(stats).toEqual({ total_productos: 0, total_unidades: 0, valor_compra: 0, valor_venta: 0 });
  });

  test('retorna ceros si el input no es un array', () => {
    const stats = calcInventoryStats(null);
    expect(stats).toEqual({ total_productos: 0, total_unidades: 0, valor_compra: 0, valor_venta: 0 });
  });

  test('maneja productos con stock 0', () => {
    const products = [{ stock_actual: 0, precio_compra: 100, precio_venta: 200 }];
    const stats = calcInventoryStats(products);
    expect(stats.total_productos).toBe(1);
    expect(stats.total_unidades).toBe(0);
    expect(stats.valor_compra).toBe(0);
    expect(stats.valor_venta).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
//  calcCajaResumen
// ─────────────────────────────────────────────────────────────
describe('calcCajaResumen', () => {
  test('calcula ingresos, egresos y saldo neto correctamente', () => {
    const movimientos = [
      { tipo: 'ingreso', monto: 500 },
      { tipo: 'ingreso', monto: 300 },
      { tipo: 'egreso',  monto: 100 },
    ];
    const resumen = calcCajaResumen(movimientos);
    expect(resumen.total_ingresos).toBe(800);
    expect(resumen.total_egresos).toBe(100);
    expect(resumen.saldo_neto).toBe(700);
  });

  test('saldo neto es ingresos menos egresos', () => {
    const movimientos = [
      { tipo: 'ingreso', monto: 200 },
      { tipo: 'egreso',  monto: 350 },
    ];
    const resumen = calcCajaResumen(movimientos);
    expect(resumen.saldo_neto).toBe(resumen.total_ingresos - resumen.total_egresos);
  });

  test('retorna ceros para array vacío', () => {
    const resumen = calcCajaResumen([]);
    expect(resumen).toEqual({ total_ingresos: 0, total_egresos: 0, saldo_neto: 0 });
  });

  test('retorna ceros si el input no es un array', () => {
    const resumen = calcCajaResumen(null);
    expect(resumen).toEqual({ total_ingresos: 0, total_egresos: 0, saldo_neto: 0 });
  });

  test('ignora movimientos con tipo desconocido', () => {
    const movimientos = [
      { tipo: 'ingreso', monto: 100 },
      { tipo: 'otro',    monto: 999 },
    ];
    const resumen = calcCajaResumen(movimientos);
    expect(resumen.total_ingresos).toBe(100);
    expect(resumen.total_egresos).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
//  validateEgreso
// ─────────────────────────────────────────────────────────────
describe('validateEgreso', () => {
  test('retorna valid:true para monto positivo', () => {
    expect(validateEgreso(50)).toEqual({ valid: true });
  });

  test('retorna valid:true para monto decimal positivo', () => {
    expect(validateEgreso(0.01)).toEqual({ valid: true });
  });

  test('retorna valid:false para monto 0', () => {
    const result = validateEgreso(0);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('retorna valid:false para monto negativo', () => {
    const result = validateEgreso(-10);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('retorna valid:false para valor no numérico', () => {
    const result = validateEgreso('abc');
    expect(result.valid).toBe(false);
  });
});
