# Documento de Diseño Técnico — Mejoras Sistema Joyería Mariné

## Visión General

Este documento describe el diseño técnico para las ocho mejoras del sistema POS de Joyería Mariné. La aplicación es una app de escritorio construida con **Electron + SQLite (sql.js)**, con un único archivo de lógica de renderer (`src/js/app.js`), un archivo HTML principal (`src/index.html`), una capa de base de datos (`src/database/db.js`) y un proceso principal de Electron (`main.js`) que expone APIs mediante IPC.

Las mejoras se implementan de forma incremental sobre la arquitectura existente, sin cambiar el stack tecnológico ni la estructura de archivos principal.

---

## Arquitectura

La aplicación sigue el patrón Electron estándar de dos procesos:

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer Process (Chromium)                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  src/index.html  ←→  src/js/app.js (objeto `app`)  │   │
│  │  src/css/styles.css                                 │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │ window.api (contextBridge)        │
└─────────────────────────┼───────────────────────────────────┘
                          │ IPC (ipcRenderer / ipcMain)
┌─────────────────────────┼───────────────────────────────────┐
│  Main Process (Node.js) │                                   │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │  main.js  →  ipcMain.handle(...)                    │   │
│  │  src/database/db.js  (clase Database + SqlJsWrapper)│   │
│  │  database/marine.db  (SQLite via sql.js)            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Principios de diseño para las mejoras:**
- Cada nueva funcionalidad sigue el patrón existente: método en `db.js` → handler IPC en `main.js` → método en `app.js` → HTML en `index.html`.
- Las migraciones de base de datos se realizan en `_createTables()` usando `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para no afectar datos existentes.
- El control de acceso por rol se centraliza en `startApp()` y `navigateTo()`.

---

## Componentes e Interfaces

### Req. 1 — Control de Acceso por Perfil Cajero

**Componente afectado:** `app.startApp()`, `app.navigateTo()`, `src/index.html` (sidebar nav)

**Páginas restringidas para cajero:** `productos`, `configuracion`, `inventario` (nueva), `caja` (nueva)

**Interfaz de control de acceso:**
```javascript
// En startApp() — ocultar nav items restringidos
const RESTRICTED_PAGES_CAJERO = ['productos', 'configuracion', 'inventario', 'caja'];

// En navigateTo() — guardia de navegación
navigateTo(page) {
  if (this.currentUser.rol !== 'admin' && RESTRICTED_PAGES_CAJERO.includes(page)) {
    page = 'dashboard'; // redirigir
  }
  // ... resto de la lógica
}
```

Los botones de navegación para páginas restringidas tendrán la clase `admin-only` (patrón ya existente en el código para `usuarios` y `bitacora`).

---

### Req. 2 — Actualización de Gráficos en Reportes

**Componente afectado:** `app.loadReportes()`, `app.setupReportes()`

**Gestión de instancias Chart.js:**
```javascript
// Objeto de referencias de gráficos en app
chartInstances: {
  reportVentas: null,
  reportTransacciones: null,
  reportCategorias: null,
  // ... etc.
},

// Función helper para destruir y recrear
_renderChart(key, canvasId, config) {
  if (this.chartInstances[key]) {
    this.chartInstances[key].destroy();
  }
  this.chartInstances[key] = new Chart(document.getElementById(canvasId), config);
}
```

El método `loadReportes()` se invoca desde `navigateTo()` cuando `page === 'reportes'`, garantizando recarga en cada visita.

---

### Req. 3 — Filtro de Rango de Fechas en Reportes

**Componente afectado:** `app.loadReportes()`, `app.setupReportes()`, `src/index.html` (page-reportes), `db.js` (getSales, getDailyStats)

**Nuevos elementos HTML en `page-reportes`:**
- `#report-fecha-inicio` — input type="date"
- `#report-fecha-fin` — input type="date"
- `#btn-filter-reports` — botón Filtrar
- `#report-date-range-label` — span informativo del rango activo

**Interfaz de filtrado:**
```javascript
async loadReportes(filters = null) {
  // Si no hay filtros, usar últimos 7 días por defecto
  const fechaFin = filters?.fechaFin || today;
  const fechaInicio = filters?.fechaInicio || sevenDaysAgo;
  // Validar rango antes de consultar
  // Actualizar label informativo
  // Destruir y recrear gráficos con datos filtrados
}
```

**Modificación en `db.js`:** `getDailyStats(fechaInicio, fechaFin)` acepta parámetros opcionales de rango.

---

### Req. 4 — Mostrar Vendedor en Reportes

**Componente afectado:** `db.js` (createSale, getSales, getSaleById), `main.js` (ventas:create), `app.js` (confirmSale, loadComprobantes, loadReportes, setupReportes exportCSV)

**Migración de base de datos:**
```sql
-- En _createTables(), se agrega con ALTER TABLE seguro
ALTER TABLE ventas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id);
```

**Modificación en `createSale(data)`:**
```javascript
// data.usuario_id se pasa desde el renderer
INSERT INTO ventas (..., usuario_id) VALUES (..., ?)
```

**Modificación en `getSales()`:**
```sql
SELECT v.*, c.nombre as cliente_nombre, u.nombre as vendedor_nombre
FROM ventas v
LEFT JOIN clientes c ON v.cliente_id = c.id
LEFT JOIN usuarios u ON v.usuario_id = u.id
```

**En `confirmSale()` del renderer:**
```javascript
saleData.usuario_id = this.currentUser.id;
```

---

### Req. 5 — Descuento Monetario en el Proceso de Venta

**Componente afectado:** `app.openCheckoutModal()`, `app.confirmSale()`, `app.updateChange()`, `src/index.html` (modal-checkout), `app.viewReceipt()`

**Nuevo campo en modal-checkout:**
- `#checkout-descuento` — input numérico "Descuento (S/)", valor por defecto 0

**Lógica de cálculo:**
```javascript
getCartTotalWithDiscount() {
  const subtotal = this.getCartSubtotal(); // suma de precios originales * cantidades
  const descuento = parseFloat(document.getElementById('checkout-descuento').value) || 0;
  return Math.max(subtotal - descuento, 0);
}
```

**Validación:**
```javascript
// En confirmSale()
const descuento = parseFloat(document.getElementById('checkout-descuento').value) || 0;
if (descuento < 0) return this.toast('El descuento no puede ser negativo', 'error');
if (descuento > subtotal) return this.toast('El descuento no puede superar el subtotal', 'error');
```

**Nota:** El campo `descuento_porcentaje` en el carrito del POS se elimina del renderizado de items. El campo `descuento` en la tabla `ventas` ya existe en el esquema actual.

---

### Req. 6 — Importación CSV Mejorada

**Componente afectado:** `main.js` (handler `productos:importCSV`), `app.js` (btn-template-csv)

**Nueva lógica del importador en `main.js`:**
```javascript
// Para cada fila del CSV:
// 1. Validar campos obligatorios (nombre, precio_venta)
// 2. Resolver categoria: buscar por nombre, crear si no existe
// 3. Resolver material: buscar por nombre, crear si no existe
// 4. Llamar a db.createProduct() sin código (se auto-genera)
```

**Nuevos métodos en `db.js`:**
```javascript
getCategoryByName(nombre)   // busca categoría por nombre exacto
getMaterialByName(nombre)   // busca material por nombre exacto
// createCategory y createMaterial ya existen
```

**Plantilla CSV actualizada** (sin columna `codigo`):
```
nombre,descripcion,categoria,material,peso_gramos,precio_compra,precio_venta,stock_actual,stock_minimo
```

---

### Req. 7 — Sistema de Inventario

**Componente nuevo:** `app.setupInventario()`, `app.loadInventario()`, página `page-inventario` en HTML

**Nuevos métodos en `db.js`:**
```javascript
getInventoryProducts()      // todos los productos activos con stock info
getTopSellingProducts(limit, fechaInicio, fechaFin)  // top N por cantidad vendida
getLowRotationProducts(limit, days)  // N productos con menor rotación en X días
getInventoryStats()         // totales: productos, unidades, valor compra, valor venta
```

**Consultas SQL clave:**
```sql
-- Top vendidos
SELECT p.id, p.nombre, p.codigo, SUM(dv.cantidad) as total_vendido
FROM productos p
JOIN detalle_ventas dv ON p.id = dv.producto_id
JOIN ventas v ON dv.venta_id = v.id
WHERE v.estado = 'completada' AND v.fecha >= ?
GROUP BY p.id ORDER BY total_vendido DESC LIMIT 10;

-- Menor rotación (productos activos con menos ventas en 90 días)
SELECT p.id, p.nombre, COALESCE(SUM(dv.cantidad), 0) as total_vendido
FROM productos p
LEFT JOIN detalle_ventas dv ON p.id = dv.producto_id
LEFT JOIN ventas v ON dv.venta_id = v.id AND v.estado = 'completada'
  AND v.fecha >= datetime('now','localtime','-90 days')
WHERE p.activo = 1
GROUP BY p.id ORDER BY total_vendido ASC LIMIT 10;

-- Estadísticas de inventario
SELECT COUNT(*) as total_productos,
       SUM(stock_actual) as total_unidades,
       SUM(stock_actual * precio_compra) as valor_compra,
       SUM(stock_actual * precio_venta) as valor_venta
FROM productos WHERE activo = 1;
```

**Nuevo IPC handler en `main.js`:**
```javascript
ipcMain.handle('inventario:getProducts', () => db.getInventoryProducts());
ipcMain.handle('inventario:getTopSelling', (_, limit, fi, ff) => db.getTopSellingProducts(limit, fi, ff));
ipcMain.handle('inventario:getLowRotation', (_, limit, days) => db.getLowRotationProducts(limit, days));
ipcMain.handle('inventario:getStats', () => db.getInventoryStats());
```

---

### Req. 8 — Cuadre de Caja

**Componente nuevo:** `app.setupCaja()`, `app.loadCaja()`, página `page-caja` en HTML

**Nueva tabla en `db.js`:**
```sql
CREATE TABLE IF NOT EXISTS movimientos_caja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK(tipo IN ('ingreso', 'egreso')),
  concepto TEXT NOT NULL,
  monto REAL NOT NULL,
  notas TEXT,
  usuario_id INTEGER NOT NULL,
  fecha TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
```

**Nuevos métodos en `db.js`:**
```javascript
createMovimientoCaja(data)           // registra ingreso o egreso
getMovimientosCaja(filters)          // filtra por fecha, tipo
getCajaResumen(fechaInicio, fechaFin) // calcula totales y saldo neto
```

**Integración con ventas:** En `createSale()`, dentro de la transacción, se inserta automáticamente un movimiento de ingreso:
```javascript
this.db.prepare(`
  INSERT INTO movimientos_caja (tipo, concepto, monto, usuario_id)
  VALUES ('ingreso', ?, ?, ?)
`).run(`Venta ${numero}`, data.total, data.usuario_id);
```

**Nuevos IPC handlers en `main.js`:**
```javascript
ipcMain.handle('caja:create', (_, data) => db.createMovimientoCaja(data));
ipcMain.handle('caja:getAll', (_, filters) => db.getMovimientosCaja(filters));
ipcMain.handle('caja:getResumen', (_, fi, ff) => db.getCajaResumen(fi, ff));
```

---

## Modelos de Datos

### Modificaciones a tablas existentes

**Tabla `ventas` — agregar columna `usuario_id`:**
```sql
ALTER TABLE ventas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id);
-- Migración segura: registros existentes quedan con NULL
```

### Nueva tabla `movimientos_caja`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER PK | Autoincremental |
| `tipo` | TEXT | `'ingreso'` o `'egreso'` |
| `concepto` | TEXT NOT NULL | Descripción del movimiento |
| `monto` | REAL NOT NULL | Monto positivo |
| `notas` | TEXT | Nota adicional opcional |
| `usuario_id` | INTEGER FK | Usuario que registró el movimiento |
| `fecha` | TEXT | Timestamp local (datetime) |

### Diagrama de relaciones actualizado

```
usuarios (id, nombre, username, rol, ...)
    │
    ├──< ventas (id, ..., usuario_id FK, descuento, ...)
    │       │
    │       └──< detalle_ventas (id, venta_id FK, producto_id FK, ...)
    │
    └──< movimientos_caja (id, tipo, concepto, monto, usuario_id FK, fecha)

productos (id, codigo, nombre, categoria_id FK, material_id FK, ...)
    ├── categorias (id, nombre)
    └── materiales (id, nombre)
```

### Páginas de navegación nuevas

| ID de página | Ruta nav | Rol requerido | Descripción |
|---|---|---|---|
| `page-inventario` | `inventario` | `admin` | Sistema de inventario |
| `page-caja` | `caja` | `admin` | Cuadre de caja |

---

## Propiedades de Corrección

*Una propiedad es una característica o comportamiento que debe ser verdadero en todas las ejecuciones válidas del sistema — esencialmente, una declaración formal sobre lo que el sistema debe hacer. Las propiedades sirven como puente entre las especificaciones legibles por humanos y las garantías de corrección verificables por máquina.*

### Propiedad 1: Guardia de navegación para cajeros

*Para cualquier* usuario con rol `cajero` y cualquier página restringida (`productos`, `configuracion`, `inventario`, `caja`), intentar navegar a esa página debe resultar en que la página activa sea `dashboard`.

**Valida: Requisitos 1.3, 1.4**

---

### Propiedad 2: No duplicación de instancias de gráficos

*Para cualquier* número de llamadas consecutivas a `loadReportes()`, cada canvas de gráfico debe tener exactamente una instancia activa de Chart.js (la más reciente), y las instancias previas deben haber sido destruidas.

**Valida: Requisitos 2.2, 2.4**

---

### Propiedad 3: Consistencia de datos de gráficos con el período seleccionado

*Para cualquier* rango de fechas válido (inicio ≤ fin), los datos renderizados en los gráficos de reportes deben corresponder exactamente al conjunto de ventas completadas cuya fecha cae dentro de ese rango (inclusive en ambos extremos).

**Valida: Requisitos 2.3, 3.2, 3.5**

---

### Propiedad 4: Rechazo de rangos de fechas inválidos

*Para cualquier* par de fechas donde la fecha de inicio es posterior a la fecha de fin, la función de validación de filtro debe retornar un error y no actualizar los gráficos ni las estadísticas.

**Valida: Requisito 3.3**

---

### Propiedad 5: Trazabilidad del vendedor en ventas

*Para cualquier* venta creada por cualquier usuario autenticado, la venta almacenada en la base de datos debe tener el `usuario_id` del usuario que la procesó, y ese nombre debe aparecer en la columna "Vendedor" al renderizar la tabla de ventas.

**Valida: Requisitos 4.1, 4.2, 4.3**

---

### Propiedad 6: Exportación CSV incluye columna Vendedor

*Para cualquier* conjunto de ventas exportadas a CSV, el archivo generado debe contener la columna "Vendedor" con el nombre del usuario correspondiente, o "Sin registro" para ventas históricas sin `usuario_id`.

**Valida: Requisitos 4.5, 4.6**

---

### Propiedad 7: Cálculo correcto del total con descuento monetario

*Para cualquier* subtotal de carrito y cualquier descuento monetario válido (0 ≤ descuento ≤ subtotal), el total calculado debe ser exactamente `subtotal - descuento`.

**Valida: Requisitos 5.3, 5.7**

---

### Propiedad 8: Rechazo de descuentos inválidos

*Para cualquier* descuento monetario mayor al subtotal de la venta, o cualquier valor negativo, la validación debe rechazar el procesamiento de la venta y mostrar un mensaje de error.

**Valida: Requisitos 5.4, 5.9**

---

### Propiedad 9: Generación automática de código en importación CSV

*Para cualquier* producto importado desde CSV sin código explícito, el código generado debe seguir el patrón `PREFIX-NNNN` (donde PREFIX es el prefijo de la categoría y NNNN es el ID con padding), usando la misma lógica que el registro manual.

**Valida: Requisito 6.1**

---

### Propiedad 10: Resolución de categorías y materiales en importación CSV

*Para cualquier* fila CSV con nombre de categoría o material, si el nombre existe en la base de datos el producto debe recibir el ID correspondiente; si no existe, debe crearse automáticamente y el producto debe recibir el nuevo ID.

**Valida: Requisitos 6.4, 6.5, 6.6**

---

### Propiedad 11: Conteo correcto de errores en importación CSV

*Para cualquier* archivo CSV con N filas donde K filas tienen campos obligatorios faltantes (`nombre` o `precio_venta`), el resultado de la importación debe reportar exactamente K errores y N-K importaciones exitosas.

**Valida: Requisito 6.7**

---

### Propiedad 12: Indicador visual de stock bajo en inventario

*Para cualquier* producto activo donde `stock_actual <= stock_minimo`, la fila renderizada en la tabla de inventario debe contener el indicador visual de alerta (clase CSS de stock bajo).

**Valida: Requisito 7.3**

---

### Propiedad 13: Corrección de estadísticas de inventario

*Para cualquier* conjunto de productos activos, las estadísticas calculadas (total unidades, valor a precio de compra, valor a precio de venta) deben ser la suma exacta de los valores individuales de cada producto.

**Valida: Requisito 7.7**

---

### Propiedad 14: Saldo neto de caja es ingresos menos egresos

*Para cualquier* conjunto de movimientos de caja en un período, el saldo neto calculado debe ser exactamente `total_ingresos - total_egresos`.

**Valida: Requisito 8.5**

---

### Propiedad 15: Registro automático de ingreso al completar venta

*Para cualquier* venta completada exitosamente en el POS, debe existir exactamente un movimiento de tipo `ingreso` en `movimientos_caja` con el monto total de la venta y el concepto del número de comprobante.

**Valida: Requisito 8.7**

---

### Propiedad 16: Filtrado correcto de movimientos de caja por fecha

*Para cualquier* rango de fechas seleccionado en el módulo de caja, los movimientos mostrados deben ser exactamente los que tienen fecha dentro del rango (inclusive en ambos extremos), sin incluir movimientos fuera del rango.

**Valida: Requisito 8.8**

---

### Propiedad 17: Trazabilidad del usuario en egresos de caja

*Para cualquier* egreso registrado manualmente por cualquier usuario autenticado, el movimiento almacenado debe tener el `usuario_id` del usuario que lo registró.

**Valida: Requisito 8.10**

---

### Propiedad 18: Rechazo de egresos con monto inválido

*Para cualquier* intento de registrar un egreso con monto <= 0, la validación debe rechazar el registro y no crear ningún movimiento en la base de datos.

**Valida: Requisito 8.4**

---

## Manejo de Errores

### Migraciones de base de datos

Las migraciones se ejecutan en `_createTables()` al inicializar la aplicación. Para agregar `usuario_id` a `ventas`:

```javascript
// Patrón seguro para ALTER TABLE en SQLite
try {
  this.db.exec(`ALTER TABLE ventas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)`);
} catch(e) {
  // La columna ya existe — ignorar error SQLITE_ERROR "duplicate column name"
  if (!e.message.includes('duplicate column name')) throw e;
}
```

### Validaciones de entrada

| Contexto | Condición de error | Respuesta |
|---|---|---|
| Filtro de reportes | fecha_inicio > fecha_fin | Toast de error, no actualizar gráficos |
| Descuento en checkout | descuento > subtotal | Toast de error, bloquear confirmación |
| Descuento en checkout | descuento < 0 | Toast de error, bloquear confirmación |
| Egreso de caja | monto <= 0 | Toast de error, no guardar |
| Importación CSV | fila sin nombre o precio_venta | Omitir fila, incrementar contador de errores |
| Importación CSV | precio_venta no numérico | Omitir fila, incrementar contador de errores |
| Navegación restringida (cajero) | página en lista restringida | Redirigir silenciosamente a dashboard |

### Consistencia transaccional

La creación de ventas ya usa transacciones en `db.js`. Se extiende para incluir el registro en `movimientos_caja` dentro de la misma transacción, garantizando que si falla el registro de caja, la venta completa se revierte.

---

## Estrategia de Testing

### Enfoque dual

Las mejoras combinan lógica de negocio pura (cálculos, validaciones, filtros) con comportamiento de UI (DOM, Chart.js). Se usa un enfoque de dos capas:

1. **Tests de propiedades (property-based):** Para lógica pura — cálculos de totales, validaciones de entrada, filtros de fecha, generación de códigos, conteo de errores CSV.
2. **Tests de ejemplo (example-based):** Para comportamiento de UI — existencia de elementos DOM, renderizado de tablas, integración de módulos.

### Librería de property-based testing

Se usará **[fast-check](https://github.com/dubzzz/fast-check)** (JavaScript), compatible con el entorno Node.js del proyecto. No requiere framework de test adicional; se puede usar con Jest.

```bash
npm install --save-dev fast-check jest
```

### Configuración de tests de propiedades

Cada test de propiedad debe ejecutarse con mínimo **100 iteraciones** (configuración por defecto de fast-check). Cada test debe incluir un comentario de referencia:

```javascript
// Feature: mejoras-sistema-joyeria, Property N: <texto de la propiedad>
```

### Tests de propiedades a implementar

| Propiedad | Función a testear | Generadores fast-check |
|---|---|---|
| P1: Guardia de navegación | `navigateTo()` con mock de currentUser | `fc.constantFrom('cajero')`, `fc.constantFrom(...RESTRICTED_PAGES)` |
| P3: Consistencia datos-período | `filterSalesByDateRange()` (función pura) | `fc.date()`, arrays de ventas generados |
| P4: Rechazo rangos inválidos | `validateDateRange(inicio, fin)` | `fc.date()` donde inicio > fin |
| P7: Cálculo total con descuento | `calcTotalWithDiscount(subtotal, descuento)` | `fc.float({min:0})`, `fc.float({min:0})` |
| P8: Rechazo descuentos inválidos | `validateDiscount(descuento, subtotal)` | `fc.float({max:-0.01})`, desc > subtotal |
| P9: Generación de código CSV | `generateProductCode(prefix, id)` | `fc.string()`, `fc.integer({min:1})` |
| P11: Conteo errores CSV | `parseCSVRows(rows)` | Arrays de filas con campos faltantes aleatorios |
| P13: Estadísticas de inventario | `calcInventoryStats(products)` | Arrays de productos con stock y precios aleatorios |
| P14: Saldo neto de caja | `calcCajaResumen(movimientos)` | Arrays de movimientos con tipo y monto aleatorios |
| P18: Rechazo egresos inválidos | `validateEgreso(monto)` | `fc.float({max:0})` |

### Tests de ejemplo a implementar

- Verificar que usuarios cajero no ven botones de navegación restringidos en el DOM
- Verificar que el modal de checkout contiene el campo `#checkout-descuento`
- Verificar que la plantilla CSV no contiene la columna `codigo`
- Verificar que la tabla `movimientos_caja` existe con los campos correctos (smoke test de migración)
- Verificar que ventas históricas sin `usuario_id` muestran "Sin registro"

### Extracción de funciones puras para testabilidad

Para facilitar el testing de propiedades sin depender del DOM, se extraen las siguientes funciones puras del objeto `app`:

```javascript
// Funciones puras extraíbles (pueden vivir fuera del objeto app o como métodos estáticos)
function calcTotalWithDiscount(subtotal, descuento) { ... }
function validateDateRange(fechaInicio, fechaFin) { ... }
function filterSalesByDateRange(sales, fechaInicio, fechaFin) { ... }
function validateDiscount(descuento, subtotal) { ... }
function generateProductCode(prefix, id) { ... }
function calcInventoryStats(products) { ... }
function calcCajaResumen(movimientos) { ... }
function validateEgreso(monto) { ... }
```
