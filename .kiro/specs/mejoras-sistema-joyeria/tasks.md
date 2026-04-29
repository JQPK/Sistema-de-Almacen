# Plan de Implementación: Mejoras Sistema Joyería Mariné

## Visión General

Implementación incremental de ocho mejoras sobre el sistema POS existente (Electron + SQLite). Cada tarea sigue el patrón establecido: método en `db.js` → handler IPC en `main.js` → lógica en `app.js` → HTML en `index.html`. Las funciones puras se extraen a `src/js/utils.js` para facilitar el testing con fast-check.

## Tareas

- [x] 1. Configurar entorno de testing y extraer funciones puras
  - Instalar `jest` y `fast-check` como dependencias de desarrollo
  - Crear `src/js/utils.js` con las funciones puras extraíbles del diseño: `calcTotalWithDiscount`, `validateDateRange`, `filterSalesByDateRange`, `validateDiscount`, `generateProductCode`, `calcInventoryStats`, `calcCajaResumen`, `validateEgreso`
  - Configurar `jest` en `package.json` con script `"test": "jest --testPathPattern=tests/"` y crear carpeta `tests/`
  - Cada función debe exportarse con `module.exports` para ser importable en los tests
  - _Requisitos: 5.3, 5.4, 3.3, 6.1, 7.7, 8.5, 8.4_

- [x] 2. Req. 1 — Control de acceso por perfil cajero
  - [x] 2.1 Implementar guardia de navegación y ocultamiento de nav items en `app.js`
    - Definir constante `RESTRICTED_PAGES_CAJERO = ['productos', 'configuracion', 'inventario', 'caja']` en `app.js`
    - En `startApp()`: agregar lógica para ocultar botones de navegación con `data-page` en `RESTRICTED_PAGES_CAJERO` cuando `currentUser.rol !== 'admin'` (usando clase `admin-only` o `style.display = 'none'`)
    - En `navigateTo(page)`: agregar guardia al inicio que redirija a `dashboard` si el usuario es cajero e intenta acceder a una página restringida
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 2.2 Escribir test de propiedad para la guardia de navegación
    - **Propiedad 1: Guardia de navegación para cajeros**
    - Para cualquier página en `RESTRICTED_PAGES_CAJERO` y usuario con rol `cajero`, `navigateTo()` debe resultar en página activa `dashboard`
    - Usar `fc.constantFrom(...RESTRICTED_PAGES_CAJERO)` como generador de páginas
    - **Valida: Requisitos 1.3, 1.4**

  - [ ]* 2.3 Escribir test de ejemplo para ocultamiento de nav items
    - Verificar que usuarios cajero no ven botones de navegación para páginas restringidas en el DOM (simulando el DOM con jsdom)
    - Verificar que usuarios admin sí ven todos los botones
    - _Requisitos: 1.1, 1.2, 1.5_

- [x] 3. Req. 2 y 3 — Actualización y filtro de fechas en reportes
  - [x] 3.1 Agregar campos de filtro de fechas al HTML de `page-reportes`
    - Agregar en `src/index.html` dentro de `page-reportes`: inputs `#report-fecha-inicio` y `#report-fecha-fin` (type="date"), botón `#btn-filter-reports` y span `#report-date-range-label`
    - _Requisitos: 3.1, 3.6_

  - [x] 3.2 Implementar gestión de instancias Chart.js y recarga en `app.js`
    - Agregar propiedad `chartInstances: {}` al objeto `app`
    - Implementar método `_renderChart(key, canvasId, config)` que destruye la instancia previa si existe y crea una nueva
    - Modificar `loadReportes()` para usar `_renderChart()` en todos los canvas de reportes
    - Asegurar que `navigateTo('reportes')` llame a `loadReportes()` (ya existe, verificar)
    - _Requisitos: 2.1, 2.2, 2.4, 2.5_

  - [x] 3.3 Implementar lógica de filtrado por fechas en `app.js` y `db.js`
    - Modificar `loadReportes(filters = null)` para aceptar parámetros de fecha; usar últimos 7 días por defecto
    - Usar `validateDateRange(fechaInicio, fechaFin)` de `utils.js` antes de consultar
    - Actualizar `#report-date-range-label` con el rango activo
    - Modificar `getDailyStats(fechaInicio, fechaFin)` en `db.js` para aceptar parámetros opcionales de rango
    - Conectar botón `#btn-filter-reports` al método de filtrado
    - _Requisitos: 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 3.4 Escribir test de propiedad para validación de rango de fechas
    - **Propiedad 4: Rechazo de rangos de fechas inválidos**
    - Para cualquier par donde `fechaInicio > fechaFin`, `validateDateRange()` debe retornar error
    - Usar `fc.date()` generando pares donde inicio > fin
    - **Valida: Requisito 3.3**

  - [ ]* 3.5 Escribir test de propiedad para consistencia de datos con período
    - **Propiedad 3: Consistencia de datos de gráficos con el período seleccionado**
    - Para cualquier rango válido (inicio ≤ fin) y array de ventas generado, `filterSalesByDateRange()` debe retornar exactamente las ventas dentro del rango
    - Usar `fc.date()` y arrays de ventas con fechas aleatorias
    - **Valida: Requisitos 2.3, 3.2, 3.5**

  - [ ]* 3.6 Escribir test de ejemplo para no duplicación de instancias Chart.js
    - **Propiedad 2: No duplicación de instancias de gráficos**
    - Verificar que llamadas consecutivas a `_renderChart()` destruyen la instancia previa (mock de Chart.js)
    - **Valida: Requisitos 2.2, 2.4**

- [x] 4. Checkpoint — Verificar mejoras de reportes
  - Asegurar que todos los tests pasen, verificar que la navegación a reportes recarga datos y que el filtro de fechas funciona correctamente. Consultar al usuario si hay dudas.

- [x] 5. Req. 4 — Mostrar vendedor en reportes de ventas
  - [x] 5.1 Migrar base de datos: agregar `usuario_id` a tabla `ventas`
    - En `_createTables()` de `db.js`, agregar migración segura con try/catch para `ALTER TABLE ventas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)`
    - _Requisitos: 4.4_

  - [x] 5.2 Modificar `createSale()` y `getSales()` en `db.js` para incluir vendedor
    - Actualizar `INSERT INTO ventas` en `createSale()` para incluir `usuario_id`
    - Actualizar `getSales()` con JOIN a `usuarios` para obtener `vendedor_nombre`
    - Actualizar `getSaleById()` con JOIN a `usuarios`
    - _Requisitos: 4.1, 4.2, 4.3_

  - [x] 5.3 Pasar `usuario_id` desde el renderer al crear ventas
    - En `confirmSale()` de `app.js`, agregar `saleData.usuario_id = this.currentUser.id` antes de llamar a `window.api.ventas.create()`
    - _Requisitos: 4.1_

  - [x] 5.4 Mostrar columna "Vendedor" en tablas de comprobantes y reportes
    - Agregar columna "Vendedor" al `<thead>` de la tabla de comprobantes en `index.html`
    - Actualizar `loadComprobantes()` en `app.js` para renderizar `vendedor_nombre || 'Sin registro'`
    - Agregar columna "Vendedor" en la tabla de ventas del módulo de reportes
    - _Requisitos: 4.2, 4.3, 4.6_

  - [x] 5.5 Incluir columna "Vendedor" en exportación CSV de reportes
    - Modificar la función de exportación CSV en `app.js` para incluir el campo `vendedor_nombre`
    - _Requisitos: 4.5, 4.6_

  - [ ]* 5.6 Escribir test de propiedad para trazabilidad del vendedor
    - **Propiedad 5: Trazabilidad del vendedor en ventas**
    - Para cualquier venta creada con `usuario_id`, verificar que el campo se persiste correctamente en el objeto retornado
    - **Valida: Requisitos 4.1, 4.2, 4.3**

  - [ ]* 5.7 Escribir test de propiedad para exportación CSV con vendedor
    - **Propiedad 6: Exportación CSV incluye columna Vendedor**
    - Para cualquier conjunto de ventas (con y sin `usuario_id`), el CSV generado debe contener la columna "Vendedor" con el nombre o "Sin registro"
    - **Valida: Requisitos 4.5, 4.6**

- [x] 6. Req. 5 — Descuento monetario en el proceso de venta
  - [x] 6.1 Agregar campo de descuento monetario al modal de checkout en HTML
    - En `src/index.html`, agregar input `#checkout-descuento` (type="number", min="0", step="0.01", value="0") con etiqueta "Descuento (S/)" en el modal de confirmación de venta
    - Eliminar la columna de descuento por porcentaje del renderizado de items del carrito en el POS
    - _Requisitos: 5.1, 5.2_

  - [x] 6.2 Implementar cálculo y validación del descuento en `app.js`
    - Implementar `getCartTotalWithDiscount()` usando `calcTotalWithDiscount()` de `utils.js`
    - Usar `validateDiscount(descuento, subtotal)` de `utils.js` en `confirmSale()`
    - Modificar `updateChange()` para recalcular usando el descuento monetario
    - Agregar listener `input` en `#checkout-descuento` para actualizar el total en tiempo real
    - En `confirmSale()`: leer el descuento, validar, y pasar `descuento` en `saleData`
    - _Requisitos: 5.3, 5.4, 5.5, 5.7, 5.8, 5.9_

  - [x] 6.3 Mostrar descuento en el comprobante impreso
    - Actualizar `viewReceipt()` en `app.js` para mostrar el campo `descuento` si es mayor a 0
    - _Requisitos: 5.6_

  - [ ]* 6.4 Escribir test de propiedad para cálculo de total con descuento
    - **Propiedad 7: Cálculo correcto del total con descuento monetario**
    - Para cualquier subtotal ≥ 0 y descuento válido (0 ≤ descuento ≤ subtotal), `calcTotalWithDiscount(subtotal, descuento)` debe retornar exactamente `subtotal - descuento`
    - Usar `fc.float({min: 0, max: 10000})` para subtotal y descuento
    - **Valida: Requisitos 5.3, 5.7**

  - [ ]* 6.5 Escribir test de propiedad para rechazo de descuentos inválidos
    - **Propiedad 8: Rechazo de descuentos inválidos**
    - Para cualquier descuento > subtotal o descuento < 0, `validateDiscount()` debe retornar error
    - Usar `fc.float({max: -0.01})` para negativos y generar desc > subtotal
    - **Valida: Requisitos 5.4, 5.9**

- [x] 7. Checkpoint — Verificar ventas con descuento y vendedor
  - Asegurar que todos los tests pasen, verificar que el flujo completo de venta con descuento funciona y que el vendedor se registra correctamente. Consultar al usuario si hay dudas.

- [x] 8. Req. 6 — Importación CSV mejorada
  - [x] 8.1 Agregar métodos `getCategoryByName` y `getMaterialByName` en `db.js`
    - Implementar `getCategoryByName(nombre)`: busca categoría activa por nombre exacto (case-insensitive)
    - Implementar `getMaterialByName(nombre)`: busca material activo por nombre exacto (case-insensitive)
    - _Requisitos: 6.4, 6.5_

  - [x] 8.2 Actualizar handler `productos:importCSV` en `main.js`
    - Reemplazar la lógica actual del importador para:
      1. Resolver `categoria_id` usando `getCategoryByName()`, crear si no existe con `createCategory()`
      2. Resolver `material_id` usando `getMaterialByName()`, crear si no existe con `createMaterial()`
      3. Llamar a `db.createProduct()` sin `codigo` (se auto-genera)
      4. Validar `nombre` y `precio_venta` como campos obligatorios; omitir fila e incrementar errores si faltan
    - _Requisitos: 6.1, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 8.3 Actualizar plantilla CSV descargable en `app.js`
    - Modificar el handler de `#btn-template-csv` para generar la plantilla sin columna `codigo` y con columnas: `nombre,descripcion,categoria,material,peso_gramos,precio_compra,precio_venta,stock_actual,stock_minimo`
    - Actualizar la fila de ejemplo en la plantilla
    - _Requisitos: 6.2, 6.3_

  - [ ]* 8.4 Escribir test de propiedad para generación automática de código en CSV
    - **Propiedad 9: Generación automática de código en importación CSV**
    - Para cualquier prefijo de categoría y cualquier ID entero positivo, `generateProductCode(prefix, id)` debe retornar `PREFIX-NNNN` con padding de 4 dígitos
    - Usar `fc.string({minLength: 1, maxLength: 5})` y `fc.integer({min: 1})`
    - **Valida: Requisito 6.1**

  - [ ]* 8.5 Escribir test de propiedad para resolución de categorías y materiales
    - **Propiedad 10: Resolución de categorías y materiales en importación CSV**
    - Para cualquier nombre de categoría/material, si existe en BD se asigna el ID existente; si no existe se crea y se asigna el nuevo ID
    - Testear con mock de `db` que simula existencia/no existencia
    - **Valida: Requisitos 6.4, 6.5, 6.6**

  - [ ]* 8.6 Escribir test de propiedad para conteo de errores en importación CSV
    - **Propiedad 11: Conteo correcto de errores en importación CSV**
    - Para cualquier array de N filas donde K tienen `nombre` o `precio_venta` faltantes, `parseCSVRows(rows)` debe reportar exactamente K errores y N-K importaciones exitosas
    - Usar `fc.array(fc.record({...}))` con campos opcionales aleatorios
    - **Valida: Requisito 6.7**

- [x] 9. Req. 7 — Sistema de inventario
  - [x] 9.1 Agregar métodos de inventario en `db.js`
    - Implementar `getInventoryProducts()`: todos los productos activos con info de stock y categoría/material
    - Implementar `getTopSellingProducts(limit, fechaInicio, fechaFin)`: top N por cantidad vendida en período
    - Implementar `getLowRotationProducts(limit, days)`: N productos activos con menor rotación en X días
    - Implementar `getInventoryStats()`: totales de productos, unidades, valor compra y valor venta
    - Usar las consultas SQL definidas en el diseño técnico
    - _Requisitos: 7.2, 7.4, 7.5, 7.7_

  - [x] 9.2 Agregar handlers IPC de inventario en `main.js`
    - Registrar: `inventario:getProducts`, `inventario:getTopSelling`, `inventario:getLowRotation`, `inventario:getStats`
    - _Requisitos: 7.2, 7.4, 7.5, 7.7_

  - [x] 9.3 Crear página `page-inventario` en `src/index.html`
    - Agregar botón de navegación "Inventario" en el sidebar con clase `admin-only` y `data-page="inventario"`
    - Crear `<div id="page-inventario" class="page">` con:
      - Encabezado con botón "Imprimir Inventario"
      - Cards de estadísticas de resumen (total productos, unidades, valor compra, valor venta)
      - Tabla principal de inventario con columnas: código, nombre, categoría, material, stock actual, stock mínimo, estado
      - Sección "Productos Más Vendidos" con tabla top 10
      - Sección "Productos con Menor Rotación" con tabla top 10
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 9.4 Implementar `setupInventario()` y `loadInventario()` en `app.js`
    - Implementar `setupInventario()`: conectar botón de impresión, registrar en `startApp()`
    - Implementar `loadInventario()`: cargar stats, tabla principal con indicador visual de stock bajo (clase CSS para `stock_actual <= stock_minimo`), top vendidos y menor rotación
    - Conectar `navigateTo('inventario')` para llamar a `loadInventario()`
    - Implementar función de impresión del inventario completo
    - _Requisitos: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [ ]* 9.5 Escribir test de propiedad para indicador visual de stock bajo
    - **Propiedad 12: Indicador visual de stock bajo en inventario**
    - Para cualquier producto donde `stock_actual <= stock_minimo`, la fila renderizada debe contener la clase CSS de alerta
    - Testear la función de renderizado con productos generados aleatoriamente
    - **Valida: Requisito 7.3**

  - [ ]* 9.6 Escribir test de propiedad para estadísticas de inventario
    - **Propiedad 13: Corrección de estadísticas de inventario**
    - Para cualquier array de productos activos con stock y precios aleatorios, `calcInventoryStats(products)` debe retornar la suma exacta de unidades, valor compra y valor venta
    - Usar `fc.array(fc.record({stock_actual: fc.integer({min:0}), precio_compra: fc.float({min:0}), precio_venta: fc.float({min:0})}))` 
    - **Valida: Requisito 7.7**

- [x] 10. Checkpoint — Verificar módulo de inventario
  - Asegurar que todos los tests pasen y que el módulo de inventario carga correctamente con datos reales. Consultar al usuario si hay dudas.

- [x] 11. Req. 8 — Cuadre de caja
  - [x] 11.1 Crear tabla `movimientos_caja` y métodos en `db.js`
    - En `_createTables()`, agregar `CREATE TABLE IF NOT EXISTS movimientos_caja` con los campos del diseño
    - Implementar `createMovimientoCaja(data)`: inserta ingreso o egreso con validación de monto > 0
    - Implementar `getMovimientosCaja(filters)`: filtra por fecha y tipo, incluye JOIN a usuarios para nombre
    - Implementar `getCajaResumen(fechaInicio, fechaFin)`: calcula `total_ingresos`, `total_egresos` y `saldo_neto`
    - _Requisitos: 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 11.2 Integrar registro automático de ingreso en `createSale()` de `db.js`
    - Dentro de la transacción de `createSale()`, agregar INSERT en `movimientos_caja` con tipo `'ingreso'`, concepto del número de comprobante, monto total y `usuario_id`
    - Si `data.usuario_id` es null (ventas históricas), omitir el INSERT en `movimientos_caja` o usar un usuario por defecto
    - _Requisitos: 8.7_

  - [x] 11.3 Agregar handlers IPC de caja en `main.js`
    - Registrar: `caja:create`, `caja:getAll`, `caja:getResumen`
    - _Requisitos: 8.3, 8.5, 8.6_

  - [x] 11.4 Crear página `page-caja` en `src/index.html`
    - Agregar botón de navegación "Caja" en el sidebar con clase `admin-only` y `data-page="caja"`
    - Crear `<div id="page-caja" class="page">` con:
      - Filtros de rango de fechas y botón "Filtrar"
      - Cards de resumen: total ingresos, total egresos, saldo neto
      - Botón "Registrar Egreso" que abre modal
      - Botón "Imprimir Cuadre"
      - Tabla de movimientos con columnas: tipo, concepto, monto, usuario, fecha
    - Crear modal `modal-egreso` con campos: concepto (texto), monto (número), notas (texto opcional)
    - _Requisitos: 8.1, 8.3, 8.5, 8.6, 8.8, 8.9_

  - [x] 11.5 Implementar `setupCaja()` y `loadCaja()` en `app.js`
    - Implementar `setupCaja()`: conectar botón de egreso, filtros de fecha, impresión; registrar en `startApp()`
    - Implementar `loadCaja(filters = null)`: cargar resumen del día por defecto, tabla de movimientos
    - Usar `validateEgreso(monto)` de `utils.js` antes de guardar un egreso
    - Pasar `usuario_id: this.currentUser.id` al registrar egresos
    - Conectar `navigateTo('caja')` para llamar a `loadCaja()`
    - Implementar función de impresión del cuadre
    - _Requisitos: 8.1, 8.3, 8.4, 8.5, 8.6, 8.8, 8.9, 8.10_

  - [ ]* 11.6 Escribir test de propiedad para saldo neto de caja
    - **Propiedad 14: Saldo neto de caja es ingresos menos egresos**
    - Para cualquier array de movimientos con tipo y monto aleatorios, `calcCajaResumen(movimientos)` debe retornar `saldo_neto = total_ingresos - total_egresos`
    - Usar `fc.array(fc.record({tipo: fc.constantFrom('ingreso','egreso'), monto: fc.float({min:0.01, max:10000})}))`
    - **Valida: Requisito 8.5**

  - [ ]* 11.7 Escribir test de propiedad para registro automático de ingreso al completar venta
    - **Propiedad 15: Registro automático de ingreso al completar venta**
    - Para cualquier venta completada con `usuario_id`, debe existir exactamente un movimiento `ingreso` en `movimientos_caja` con el monto total
    - Testear con mock de `db` que verifica la transacción
    - **Valida: Requisito 8.7**

  - [ ]* 11.8 Escribir test de propiedad para filtrado de movimientos por fecha
    - **Propiedad 16: Filtrado correcto de movimientos de caja por fecha**
    - Para cualquier rango de fechas, los movimientos retornados deben ser exactamente los que caen dentro del rango (inclusive)
    - Usar `fc.date()` y arrays de movimientos con fechas aleatorias
    - **Valida: Requisito 8.8**

  - [ ]* 11.9 Escribir test de propiedad para trazabilidad del usuario en egresos
    - **Propiedad 17: Trazabilidad del usuario en egresos de caja**
    - Para cualquier egreso registrado, el `usuario_id` del usuario autenticado debe persistirse en el movimiento
    - **Valida: Requisito 8.10**

  - [ ]* 11.10 Escribir test de propiedad para rechazo de egresos con monto inválido
    - **Propiedad 18: Rechazo de egresos con monto inválido**
    - Para cualquier monto ≤ 0, `validateEgreso(monto)` debe retornar error y no crear movimiento
    - Usar `fc.float({max: 0})` como generador
    - **Valida: Requisito 8.4**

- [x] 12. Checkpoint final — Integración y verificación completa
  - Asegurar que todos los tests pasen
  - Verificar que las restricciones de acceso para cajero incluyen las nuevas páginas `inventario` y `caja`
  - Verificar que `preload.js` expone los nuevos canales IPC (`inventario:*`, `caja:*`) a través de `contextBridge`
  - Verificar que `startApp()` llama a `setupInventario()` y `setupCaja()`
  - Consultar al usuario si hay dudas antes de cerrar.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los tests de propiedades usan **fast-check** con mínimo 100 iteraciones por defecto
- Las funciones puras en `src/js/utils.js` son el núcleo testeable; el resto es integración con DOM/IPC
- Los checkpoints garantizan validación incremental antes de continuar con el siguiente módulo
- La migración de `usuario_id` en `ventas` es segura: registros existentes quedan con `NULL` y se muestran como "Sin registro"
