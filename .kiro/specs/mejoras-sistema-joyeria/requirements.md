# Documento de Requisitos

## Introducción

Este documento describe los requisitos para las mejoras del sistema POS de Joyería Mariné, una aplicación de escritorio construida con Electron y SQLite. Las mejoras abarcan ocho áreas: control de acceso por perfil, actualización de gráficos en reportes, filtro de fechas en reportes, visualización del vendedor en reportes, descuento monetario en el proceso de venta, importación CSV mejorada, sistema de inventario y cuadre de caja.

## Glosario

- **Sistema**: La aplicación POS de Joyería Mariné (Electron + SQLite).
- **Administrador**: Usuario con rol `admin` que tiene acceso completo al sistema.
- **Cajero**: Usuario con rol `cajero` que tiene acceso restringido al sistema.
- **POS**: Módulo de Punto de Venta donde se procesan las ventas.
- **Carrito**: Colección temporal de productos seleccionados para una venta en curso.
- **Comprobante**: Documento de venta (boleta o factura) generado al completar una venta.
- **Descuento_Monetario**: Monto fijo en la moneda configurada (ej. S/ 5.00) que se resta del total de la venta.
- **Descuento_Porcentaje**: Porcentaje de descuento aplicado a un producto individual en el catálogo.
- **CSV_Importador**: Componente que procesa archivos CSV para crear productos en lote.
- **Inventario**: Módulo de control de existencias y estadísticas de productos.
- **Cuadre_de_Caja**: Módulo de control de entradas y salidas de dinero en caja.
- **Egreso**: Registro de salida de dinero de la caja (gasto operativo).
- **Ingreso**: Registro de entrada de dinero a la caja (venta u otro concepto).
- **Reporte**: Módulo de visualización de gráficos y estadísticas de ventas.
- **Vendedor**: Usuario (cajero o administrador) que procesó una venta específica.

---

## Requisitos

### Requisito 1: Control de Acceso por Perfil — Cajero

**User Story:** Como administrador, quiero que el perfil de cajero no pueda ver ni acceder a las pestañas de "Productos" e "Inventario" y "Configuración", para que los cajeros solo operen en las áreas que les corresponden.

#### Criterios de Aceptación

1. WHEN un usuario con rol `cajero` inicia sesión, THE Sistema SHALL ocultar el botón de navegación "Productos" en la barra lateral.
2. WHEN un usuario con rol `cajero` inicia sesión, THE Sistema SHALL ocultar el botón de navegación "Configuración" en la barra lateral.
3. WHEN un usuario con rol `cajero` intenta navegar directamente a la página `productos` mediante código, THE Sistema SHALL redirigir al usuario a la página `dashboard`.
4. WHEN un usuario con rol `cajero` intenta navegar directamente a la página `configuracion` mediante código, THE Sistema SHALL redirigir al usuario a la página `dashboard`.
5. WHEN un usuario con rol `admin` inicia sesión, THE Sistema SHALL mostrar todos los botones de navegación incluyendo "Productos" y "Configuración".
6. THE Sistema SHALL aplicar las restricciones de acceso en el momento del inicio de sesión sin requerir reinicio de la aplicación.

---

### Requisito 2: Actualización de Gráficos en Reportes

**User Story:** Como administrador, quiero que los gráficos del módulo de reportes reflejen los datos más recientes cada vez que accedo a esa sección, para tomar decisiones basadas en información actualizada.

#### Criterios de Aceptación

1. WHEN el usuario navega a la página `reportes`, THE Reporte SHALL recargar todos los datos de ventas desde la base de datos.
2. WHEN el usuario navega a la página `reportes`, THE Reporte SHALL destruir las instancias previas de los gráficos Chart.js antes de renderizar nuevas instancias.
3. WHEN se renderizan los gráficos, THE Reporte SHALL mostrar los datos correspondientes al período seleccionado actualmente.
4. IF una instancia de gráfico previa existe en memoria, THEN THE Reporte SHALL llamar al método `destroy()` de Chart.js antes de crear una nueva instancia en el mismo canvas.
5. THE Reporte SHALL mantener referencias a todas las instancias de gráficos activos para permitir su destrucción controlada.

---

### Requisito 3: Filtro de Rango de Fechas en Reportes

**User Story:** Como administrador, quiero filtrar los reportes por un rango de fechas personalizado (fecha inicio y fecha fin), para analizar el rendimiento del negocio en períodos específicos como un mes completo.

#### Criterios de Aceptación

1. THE Reporte SHALL mostrar dos campos de entrada de tipo fecha: "Fecha Inicio" y "Fecha Fin".
2. WHEN el usuario selecciona una fecha de inicio y una fecha de fin y presiona el botón "Filtrar", THE Reporte SHALL actualizar todos los gráficos y estadísticas con los datos del rango seleccionado.
3. WHEN la fecha de inicio es posterior a la fecha de fin, THE Reporte SHALL mostrar un mensaje de error indicando que el rango de fechas no es válido y no actualizará los gráficos.
4. WHEN el usuario navega a la página `reportes` sin haber seleccionado un rango, THE Reporte SHALL mostrar por defecto los datos de los últimos 7 días.
5. THE Reporte SHALL incluir en el filtro todas las ventas cuya fecha sea mayor o igual a la fecha de inicio y menor o igual a la fecha de fin a las 23:59:59.
6. WHEN se aplica un filtro de fechas, THE Reporte SHALL mostrar el rango seleccionado como texto informativo junto a los gráficos.

---

### Requisito 4: Mostrar Vendedor en Reportes de Ventas

**User Story:** Como administrador, quiero ver qué usuario procesó cada venta en el reporte de ventas, para tener trazabilidad y evaluar el desempeño de cada cajero.

#### Criterios de Aceptación

1. THE Sistema SHALL registrar el `usuario_id` del usuario autenticado en cada nueva venta creada.
2. WHEN se muestra la tabla de ventas en el módulo de reportes, THE Reporte SHALL incluir una columna "Vendedor" con el nombre del usuario que procesó la venta.
3. WHEN se muestra la tabla de ventas en el módulo de comprobantes, THE Reporte SHALL incluir el nombre del vendedor en cada fila.
4. THE Sistema SHALL agregar la columna `usuario_id` a la tabla `ventas` de la base de datos mediante una migración segura que no afecte registros existentes.
5. WHEN se exporta el reporte a CSV, THE Reporte SHALL incluir la columna "Vendedor" en el archivo exportado.
6. IF una venta no tiene `usuario_id` registrado (registros históricos), THEN THE Reporte SHALL mostrar "Sin registro" en la columna Vendedor.

---

### Requisito 5: Descuento Monetario en el Proceso de Venta

**User Story:** Como cajero, quiero aplicar un descuento en monto fijo de dinero (no en porcentaje) durante la confirmación de la venta, para ofrecer descuentos exactos a los clientes sin cálculos adicionales.

#### Criterios de Aceptación

1. THE Sistema SHALL eliminar el campo de descuento por porcentaje del formulario de edición de productos en el módulo POS (carrito).
2. THE Sistema SHALL mostrar un campo de entrada numérico etiquetado "Descuento (S/)" en el modal de confirmación de venta (checkout).
3. WHEN el usuario ingresa un valor en el campo "Descuento (S/)", THE Sistema SHALL recalcular el total de la venta restando el monto ingresado del subtotal.
4. WHEN el descuento ingresado es mayor al subtotal de la venta, THE Sistema SHALL mostrar un mensaje de error y no permitir procesar la venta.
5. WHEN el campo "Descuento (S/)" está vacío o contiene el valor 0, THE Sistema SHALL procesar la venta sin descuento.
6. THE Sistema SHALL mostrar el descuento aplicado en el comprobante impreso de la venta.
7. THE Sistema SHALL almacenar el monto de descuento en el campo `descuento` de la tabla `ventas` en la base de datos.
8. WHILE el usuario edita el campo "Descuento (S/)", THE Sistema SHALL actualizar en tiempo real el total mostrado en el modal de confirmación.
9. THE Sistema SHALL aceptar únicamente valores numéricos mayores o iguales a 0 en el campo de descuento.

---

### Requisito 6: Importación CSV Mejorada

**User Story:** Como administrador, quiero que la importación de productos por CSV funcione igual que el registro manual, con todos los campos disponibles y generación automática del código de producto, para cargar el catálogo de forma eficiente y consistente.

#### Criterios de Aceptación

1. THE CSV_Importador SHALL generar automáticamente el código de producto para cada producto importado, usando la misma lógica que el registro manual (prefijo de categoría + ID autoincremental).
2. THE Sistema SHALL proveer una plantilla CSV descargable que incluya las columnas: `nombre`, `descripcion`, `categoria`, `material`, `peso_gramos`, `precio_compra`, `precio_venta`, `stock_actual`, `stock_minimo`.
3. THE Sistema SHALL excluir la columna `codigo` de la plantilla CSV descargable, ya que el código se genera automáticamente.
4. WHEN el CSV_Importador procesa una fila con `categoria` como texto, THE CSV_Importador SHALL buscar la categoría por nombre en la base de datos y asignar el `categoria_id` correspondiente.
5. WHEN el CSV_Importador procesa una fila con `material` como texto, THE CSV_Importador SHALL buscar el material por nombre en la base de datos y asignar el `material_id` correspondiente.
6. WHEN el CSV_Importador encuentra una categoría o material que no existe en la base de datos, THE CSV_Importador SHALL crear el registro nuevo automáticamente antes de importar el producto.
7. WHEN el CSV_Importador procesa una fila con campos obligatorios faltantes (`nombre` o `precio_venta`), THE CSV_Importador SHALL omitir esa fila e incrementar el contador de errores.
8. WHEN la importación finaliza, THE Sistema SHALL mostrar un resumen con el número de productos importados exitosamente y el número de filas con error.
9. THE CSV_Importador SHALL aplicar las mismas validaciones de datos que el formulario de registro manual de productos.

---

### Requisito 7: Sistema de Inventario

**User Story:** Como administrador, quiero una sección dedicada de inventario con control de existencias, impresión del inventario completo y estadísticas de productos más vendidos y más tardados en vender, para gestionar eficientemente el stock de la joyería.

#### Criterios de Aceptación

1. THE Sistema SHALL agregar una nueva página de navegación "Inventario" visible únicamente para usuarios con rol `admin`.
2. WHEN el usuario navega a la página `inventario`, THE Inventario SHALL mostrar una tabla con todos los productos activos incluyendo: código, nombre, categoría, material, stock actual, stock mínimo y estado de stock.
3. WHEN el stock actual de un producto es menor o igual al stock mínimo, THE Inventario SHALL resaltar visualmente esa fila con un indicador de alerta.
4. THE Inventario SHALL mostrar una sección de "Productos Más Vendidos" con los 10 productos con mayor cantidad total vendida en el período seleccionado.
5. THE Inventario SHALL mostrar una sección de "Productos con Menor Rotación" con los 10 productos activos con menor cantidad vendida en los últimos 90 días.
6. WHEN el usuario presiona el botón "Imprimir Inventario", THE Inventario SHALL abrir una ventana de impresión con la tabla completa de productos formateada para impresión.
7. THE Inventario SHALL mostrar estadísticas de resumen: total de productos activos, total de unidades en stock, valor total del inventario a precio de compra y valor total a precio de venta.
8. WHEN el usuario navega a la página `inventario`, THE Inventario SHALL cargar los datos actualizados desde la base de datos.

---

### Requisito 8: Cuadre de Caja

**User Story:** Como administrador, quiero una sección de cuadre de caja con registro de egresos, control de entradas y salidas, y resumen de cuentas, para tener un control financiero completo de la operación diaria de la joyería.

#### Criterios de Aceptación

1. THE Sistema SHALL agregar una nueva página de navegación "Caja" visible únicamente para usuarios con rol `admin`.
2. THE Sistema SHALL crear una tabla `movimientos_caja` en la base de datos con los campos: `id`, `tipo` (ingreso/egreso), `concepto`, `monto`, `usuario_id`, `fecha`.
3. WHEN el usuario registra un egreso, THE Cuadre_de_Caja SHALL solicitar: concepto (descripción del gasto), monto y opcionalmente una nota adicional.
4. WHEN el usuario registra un egreso con monto menor o igual a 0, THE Cuadre_de_Caja SHALL mostrar un mensaje de error y no guardar el registro.
5. THE Cuadre_de_Caja SHALL mostrar un resumen del día actual con: total de ingresos por ventas, total de egresos registrados y saldo neto (ingresos - egresos).
6. THE Cuadre_de_Caja SHALL mostrar una tabla con todos los movimientos del día ordenados cronológicamente, incluyendo tipo, concepto, monto y usuario que lo registró.
7. WHEN se completa una venta en el módulo POS, THE Sistema SHALL registrar automáticamente un movimiento de tipo `ingreso` en la tabla `movimientos_caja` con el monto total de la venta y el concepto del número de comprobante.
8. WHEN el usuario selecciona un rango de fechas en el módulo de caja, THE Cuadre_de_Caja SHALL filtrar y mostrar los movimientos del período seleccionado con el resumen correspondiente.
9. WHEN el usuario presiona el botón "Imprimir Cuadre", THE Cuadre_de_Caja SHALL abrir una ventana de impresión con el resumen y detalle de movimientos del período seleccionado.
10. THE Cuadre_de_Caja SHALL registrar el `usuario_id` del usuario autenticado en cada movimiento de egreso creado manualmente.
