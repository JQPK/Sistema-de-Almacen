const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

class SqlJsWrapper {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.inTransaction = false;
  }
  
  async init() {
    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
      this.save();
    }
  }

  save() {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  exec(sql) {
    this.db.run(sql);
    this.save();
  }

  pragma(sql) {
    try { this.db.run(`PRAGMA ${sql}`); } catch(e){}
  }

  prepare(sql) {
    return {
      run: (...params) => {
        if (params.length === 1 && Array.isArray(params[0])) params = params[0];
        try {
          this.db.run(sql, params);
          if (!this.inTransaction) this.save();
          const res = this.db.exec("SELECT last_insert_rowid()");
          const lastInsertRowid = (res[0] && res[0].values && res[0].values[0]) ? res[0].values[0][0] : 0;
          return { lastInsertRowid };
        } catch (e) {
          throw e;
        }
      },
      get: (...params) => {
        if (params.length === 1 && Array.isArray(params[0])) params = params[0];
        const stmt = this.db.prepare(sql);
        try {
          const hasData = stmt.bind(params) && stmt.step();
          return hasData ? stmt.getAsObject() : null;
        } finally {
          stmt.free();
        }
      },
      all: (...params) => {
        if (params.length === 1 && Array.isArray(params[0])) params = params[0];
        const stmt = this.db.prepare(sql);
        try {
          stmt.bind(params);
          const results = [];
          while(stmt.step()) {
            results.push(stmt.getAsObject());
          }
          return results;
        } finally {
          stmt.free();
        }
      }
    };
  }

  transaction(fn) {
    return (...args) => {
      this.db.run("BEGIN TRANSACTION");
      this.inTransaction = true;
      try {
        const result = fn(...args);
        this.db.run("COMMIT");
        this.inTransaction = false;
        this.save();
        return result;
      } catch (err) {
        try { this.db.run("ROLLBACK"); } catch(e) {}
        this.inTransaction = false;
        this.save(); // Save the cleaned state to disk
        throw err;
      }
    };
  }
    
  close() {
    this.save();
    if (this.db) this.db.close();
  }
}

class Database {
  constructor() {
    const dbDir = path.join(__dirname, '..', '..', 'database');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    this.dbPath = path.join(dbDir, 'marine.db');
    this.db = null;
  }

  async initialize() {
    this.db = new SqlJsWrapper(this.dbPath);
    await this.db.init();
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._createTables();
    this._seedDefaults();
    this._healCorrelatives();
  }

  _healCorrelatives() {
    try {
      // Fix Boleta
      const resB = this.db.prepare("SELECT numero_comprobante FROM ventas WHERE tipo_comprobante='boleta' ORDER BY id DESC LIMIT 1").get();
      if (resB && resB.numero_comprobante) {
        const corr = parseInt(resB.numero_comprobante.split('-')[1], 10);
        this.db.prepare("UPDATE config_empresa SET correlativo_boleta = ? WHERE id = 1").run(corr);
      }
      // Fix Factura
      const resF = this.db.prepare("SELECT numero_comprobante FROM ventas WHERE tipo_comprobante='factura' ORDER BY id DESC LIMIT 1").get();
      if (resF && resF.numero_comprobante) {
        const corr = parseInt(resF.numero_comprobante.split('-')[1], 10);
        this.db.prepare("UPDATE config_empresa SET correlativo_factura = ? WHERE id = 1").run(corr);
      }
    } catch(e) {
      console.error("Error healing DB correlatives:", e);
    }
  }

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        activo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS materiales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        activo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        categoria_id INTEGER,
        material_id INTEGER,
        peso_gramos REAL DEFAULT 0,
        precio_compra REAL DEFAULT 0,
        precio_venta REAL NOT NULL,
        stock_actual INTEGER DEFAULT 0,
        stock_minimo INTEGER DEFAULT 1,
        descuento_porcentaje REAL DEFAULT 0,
        imagen_path TEXT,
        activo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (categoria_id) REFERENCES categorias(id),
        FOREIGN KEY (material_id) REFERENCES materiales(id)
      );

      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        dni_ruc TEXT,
        telefono TEXT,
        email TEXT,
        direccion TEXT,
        notas TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_comprobante TEXT UNIQUE,
        tipo_comprobante TEXT DEFAULT 'boleta',
        cliente_id INTEGER,
        subtotal REAL NOT NULL,
        descuento REAL DEFAULT 0,
        total REAL NOT NULL,
        metodo_pago TEXT DEFAULT 'efectivo',
        monto_pagado REAL DEFAULT 0,
        cambio REAL DEFAULT 0,
        notas TEXT,
        estado TEXT DEFAULT 'completada',
        motivo_anulacion TEXT,
        fecha TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
      );

      CREATE TABLE IF NOT EXISTS detalle_ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venta_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        cantidad INTEGER NOT NULL,
        precio_unitario REAL NOT NULL,
        descuento_item REAL DEFAULT 0,
        subtotal_item REAL NOT NULL,
        FOREIGN KEY (venta_id) REFERENCES ventas(id),
        FOREIGN KEY (producto_id) REFERENCES productos(id)
      );

      CREATE TABLE IF NOT EXISTS historial_precios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER NOT NULL,
        precio_anterior REAL,
        precio_nuevo REAL NOT NULL,
        fecha_cambio TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (producto_id) REFERENCES productos(id)
      );

      CREATE TABLE IF NOT EXISTS config_empresa (
        id INTEGER PRIMARY KEY,
        nombre_empresa TEXT DEFAULT 'Joyería Mariné',
        ruc TEXT DEFAULT '',
        direccion TEXT DEFAULT '',
        telefono TEXT DEFAULT '',
        logo_path TEXT DEFAULT '',
        moneda_simbolo TEXT DEFAULT 'S/',
        serie_boleta TEXT DEFAULT 'B001',
        serie_factura TEXT DEFAULT 'F001',
        correlativo_boleta INTEGER DEFAULT 0,
        correlativo_factura INTEGER DEFAULT 0,
        mensaje_ticket TEXT DEFAULT '¡Gracias por su compra!'
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        rol TEXT DEFAULT 'cajero',
        activo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS actividad_usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        accion TEXT NOT NULL,
        detalles TEXT,
        fecha TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );
    `);

    // Migración segura: agregar usuario_id a ventas si no existe
    try {
      this.db.exec('ALTER TABLE ventas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)');
    } catch (e) {
      if (!e.message || !e.message.includes('duplicate column name')) {
        throw e;
      }
    }

    // Tabla de movimientos de caja
    this.db.exec(`
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
    `);
  }

  _seedDefaults() {
    // Seed categories
    const catCount = this.db.prepare('SELECT COUNT(*) as c FROM categorias').get().c;
    if (catCount === 0) {
      const cats = ['Anillos', 'Collares', 'Aretes', 'Pulseras', 'Relojes', 'Billeteras'];
      const insert = this.db.prepare('INSERT OR IGNORE INTO categorias (nombre) VALUES (?)');
      cats.forEach(c => insert.run(c));
    }

    // Seed materials
    const matCount = this.db.prepare('SELECT COUNT(*) as c FROM materiales').get().c;
    if (matCount === 0) {
      const mats = ['Oro 18k', 'Plata 925', 'Oro Rosado', 'Platino', 'Acero Inoxidable'];
      const insert = this.db.prepare('INSERT OR IGNORE INTO materiales (nombre) VALUES (?)');
      mats.forEach(m => insert.run(m));
    }

    // Seed config
    const configCount = this.db.prepare('SELECT COUNT(*) as c FROM config_empresa').get().c;
    if (configCount === 0) {
      this.db.prepare('INSERT INTO config_empresa (id) VALUES (1)').run();
    }
  }

  // ═══════════════════════════════════════
  //  PRODUCTOS
  // ═══════════════════════════════════════

  getProducts(filters = {}) {
    let query = `
      SELECT p.*, c.nombre as categoria_nombre, m.nombre as material_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN materiales m ON p.material_id = m.id
      WHERE p.activo = 1
    `;
    const params = [];

    if (filters.categoria_id) {
      query += ' AND p.categoria_id = ?';
      params.push(filters.categoria_id);
    }
    if (filters.material_id) {
      query += ' AND p.material_id = ?';
      params.push(filters.material_id);
    }
    if (filters.stock_bajo) {
      query += ' AND p.stock_actual <= p.stock_minimo';
    }
    if (filters.precio_min !== undefined && filters.precio_min !== '') {
      query += ' AND p.precio_venta >= ?';
      params.push(filters.precio_min);
    }
    if (filters.precio_max !== undefined && filters.precio_max !== '') {
      query += ' AND p.precio_venta <= ?';
      params.push(filters.precio_max);
    }
    if (filters.estado !== undefined && filters.estado !== '') {
      query = query.replace('WHERE p.activo = 1', 'WHERE p.activo = ?');
      params.push(filters.estado === 'activo' ? 1 : 0);
    }

    query += ' ORDER BY p.nombre ASC';
    return this.db.prepare(query).all(...params);
  }

  getProductById(id) {
    return this.db.prepare(`
      SELECT p.*, c.nombre as categoria_nombre, m.nombre as material_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN materiales m ON p.material_id = m.id
      WHERE p.id = ?
    `).get(id);
  }

  searchProducts(query) {
    const searchTerm = `%${query}%`;
    return this.db.prepare(`
      SELECT p.*, c.nombre as categoria_nombre, m.nombre as material_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN materiales m ON p.material_id = m.id
      WHERE p.activo = 1
        AND (p.nombre LIKE ? OR p.codigo LIKE ? OR c.nombre LIKE ?)
      ORDER BY p.nombre ASC
      LIMIT 50
    `).all(searchTerm, searchTerm, searchTerm);
  }

  createProduct(data) {
    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO productos (codigo, nombre, descripcion, categoria_id, material_id,
          peso_gramos, precio_compra, precio_venta, stock_actual, stock_minimo,
          descuento_porcentaje, imagen_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        data.codigo || null, data.nombre, data.descripcion || '',
        data.categoria_id || null, data.material_id || null,
        data.peso_gramos || 0, data.precio_compra || 0, data.precio_venta,
        data.stock_actual || 0, data.stock_minimo || 1,
        data.descuento_porcentaje || 0, data.imagen_path || null
      );
      
      const newId = result.lastInsertRowid;
      
      // Auto-generate codigo if not provided
      if (!data.codigo) {
         let prefix = 'PROD';
         if (data.categoria_id) {
           const cat = this.db.prepare('SELECT nombre FROM categorias WHERE id = ?').get(data.categoria_id);
           if (cat) prefix = cat.nombre.substring(0, 3).toUpperCase();
         }
         const newCodigo = `${prefix}-${String(newId).padStart(4, '0')}`;
         this.db.prepare('UPDATE productos SET codigo = ? WHERE id = ?').run(newCodigo, newId);
      }
      
      return { success: true, id: newId };
    });
    return transaction();
  }

  updateProduct(id, data) {
    // Track price change
    if (data.precio_venta !== undefined) {
      const current = this.db.prepare('SELECT precio_venta FROM productos WHERE id = ?').get(id);
      if (current && current.precio_venta !== data.precio_venta) {
        this.db.prepare('INSERT INTO historial_precios (producto_id, precio_anterior, precio_nuevo) VALUES (?, ?, ?)')
          .run(id, current.precio_venta, data.precio_venta);
      }
    }

    const fields = [];
    const values = [];
    const allowed = ['codigo', 'nombre', 'descripcion', 'categoria_id', 'material_id',
      'peso_gramos', 'precio_compra', 'precio_venta', 'stock_actual', 'stock_minimo',
      'descuento_porcentaje', 'imagen_path'];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    fields.push("updated_at = datetime('now','localtime')");
    values.push(id);

    this.db.prepare(`UPDATE productos SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  }

  deleteProduct(id) {
    this.db.prepare("UPDATE productos SET activo = 0, updated_at = datetime('now','localtime') WHERE id = ?").run(id);
    return { success: true };
  }

  // ═══════════════════════════════════════
  //  CATEGORÍAS
  // ═══════════════════════════════════════

  getCategories() {
    return this.db.prepare('SELECT * FROM categorias WHERE activo = 1 ORDER BY nombre ASC').all();
  }

  createCategory(nombre) {
    try {
      const result = this.db.prepare('INSERT INTO categorias (nombre) VALUES (?)').run(nombre);
      return { success: true, id: result.lastInsertRowid };
    } catch (e) {
      return { success: false, message: 'La categoría ya existe' };
    }
  }

  updateCategory(id, nombre) {
    try {
      this.db.prepare('UPDATE categorias SET nombre = ? WHERE id = ?').run(nombre, id);
      return { success: true };
    } catch (e) {
      return { success: false, message: 'Error al actualizar categoría' };
    }
  }

  deleteCategory(id) {
    // Check if products use this category
    const count = this.db.prepare('SELECT COUNT(*) as c FROM productos WHERE categoria_id = ? AND activo = 1').get(id).c;
    if (count > 0) {
      return { success: false, message: `No se puede eliminar: ${count} producto(s) usan esta categoría` };
    }
    this.db.prepare('UPDATE categorias SET activo = 0 WHERE id = ?').run(id);
    return { success: true };
  }

  getCategoryByName(nombre) {
    return this.db.prepare('SELECT * FROM categorias WHERE LOWER(nombre) = LOWER(?) AND activo = 1').get(nombre);
  }

  // ═══════════════════════════════════════
  //  MATERIALES
  // ═══════════════════════════════════════

  getMaterials() {
    return this.db.prepare('SELECT * FROM materiales WHERE activo = 1 ORDER BY nombre ASC').all();
  }

  createMaterial(nombre) {
    try {
      const result = this.db.prepare('INSERT INTO materiales (nombre) VALUES (?)').run(nombre);
      return { success: true, id: result.lastInsertRowid };
    } catch (e) {
      return { success: false, message: 'El material ya existe' };
    }
  }

  updateMaterial(id, nombre) {
    try {
      this.db.prepare('UPDATE materiales SET nombre = ? WHERE id = ?').run(nombre, id);
      return { success: true };
    } catch (e) {
      return { success: false, message: 'Error al actualizar material' };
    }
  }

  deleteMaterial(id) {
    const count = this.db.prepare('SELECT COUNT(*) as c FROM productos WHERE material_id = ? AND activo = 1').get(id).c;
    if (count > 0) {
      return { success: false, message: `No se puede eliminar: ${count} producto(s) usan este material` };
    }
    this.db.prepare('UPDATE materiales SET activo = 0 WHERE id = ?').run(id);
    return { success: true };
  }

  getMaterialByName(nombre) {
    return this.db.prepare('SELECT * FROM materiales WHERE LOWER(nombre) = LOWER(?) AND activo = 1').get(nombre);
  }

  // ═══════════════════════════════════════
  //  VENTAS
  // ═══════════════════════════════════════

  createSale(data) {
    const transaction = this.db.transaction(() => {
      // Get next receipt number
      const config = this.db.prepare('SELECT * FROM config_empresa WHERE id = 1').get();
      let serie, correlativo, campo;
      if (data.tipo_comprobante === 'factura') {
        serie = config.serie_factura;
        correlativo = config.correlativo_factura + 1;
        campo = 'correlativo_factura';
      } else {
        serie = config.serie_boleta;
        correlativo = config.correlativo_boleta + 1;
        campo = 'correlativo_boleta';
      }
      const numero = `${serie}-${String(correlativo).padStart(8, '0')}`;

      // Update correlative
      this.db.prepare(`UPDATE config_empresa SET ${campo} = ? WHERE id = 1`).run(correlativo);

      // Insert sale
      const saleResult = this.db.prepare(`
        INSERT INTO ventas (numero_comprobante, tipo_comprobante, cliente_id, subtotal, descuento, total,
          metodo_pago, monto_pagado, cambio, notas, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        numero, data.tipo_comprobante || 'boleta',
        data.cliente_id || null, data.subtotal, data.descuento || 0,
        data.total, data.metodo_pago || 'efectivo',
        data.monto_pagado || data.total, data.cambio || 0, data.notas || '',
        data.usuario_id || null
      );

      const ventaId = saleResult.lastInsertRowid;

      // Insert details and update stock
      const insertDetail = this.db.prepare(`
        INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, descuento_item, subtotal_item)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const updateStock = this.db.prepare('UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?');

      for (const item of data.items) {
        insertDetail.run(ventaId, item.producto_id, item.cantidad,
          item.precio_unitario, item.descuento_item || 0, item.subtotal_item);
        updateStock.run(item.cantidad, item.producto_id);
      }

      // Registrar ingreso en caja si hay usuario_id
      if (data.usuario_id) {
        this.db.prepare(`
          INSERT INTO movimientos_caja (tipo, concepto, monto, usuario_id)
          VALUES ('ingreso', ?, ?, ?)
        `).run(`Venta ${numero}`, data.total, data.usuario_id);
      }

      return {
        success: true,
        venta_id: ventaId,
        numero_comprobante: numero,
      };
    });

    return transaction();
  }

  getSales(filters = {}) {
    let query = `
      SELECT v.*, c.nombre as cliente_nombre, c.dni_ruc as cliente_dni_ruc,
             u.nombre as vendedor_nombre
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.fecha_inicio) {
      query += ' AND v.fecha >= ?';
      params.push(filters.fecha_inicio);
    }
    if (filters.fecha_fin) {
      query += ' AND v.fecha <= ?';
      params.push(filters.fecha_fin + ' 23:59:59');
    }
    if (filters.estado) {
      query += ' AND v.estado = ?';
      params.push(filters.estado);
    }
    if (filters.tipo_comprobante) {
      query += ' AND v.tipo_comprobante = ?';
      params.push(filters.tipo_comprobante);
    }

    if (filters.limit === false) {
      query += ' ORDER BY v.fecha DESC';
    } else {
      query += ' ORDER BY v.fecha DESC LIMIT 100';
    }
    return this.db.prepare(query).all(...params);
  }

  getSaleById(id) {
    const venta = this.db.prepare(`
      SELECT v.*, c.nombre as cliente_nombre, c.dni_ruc as cliente_dni_ruc,
             c.telefono as cliente_telefono, c.direccion as cliente_direccion,
             u.nombre as vendedor_nombre
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE v.id = ?
    `).get(id);

    if (!venta) return null;

    venta.items = this.db.prepare(`
      SELECT dv.*, p.nombre as producto_nombre, p.codigo as producto_codigo
      FROM detalle_ventas dv
      JOIN productos p ON dv.producto_id = p.id
      WHERE dv.venta_id = ?
    `).all(id);

    return venta;
  }

  voidSale(id, motivo) {
    const transaction = this.db.transaction(() => {
      const sale = this.getSaleById(id);
      if (!sale) return { success: false, message: 'Venta no encontrada' };
      if (sale.estado === 'anulada') return { success: false, message: 'La venta ya fue anulada' };

      // Restore stock
      const restoreStock = this.db.prepare('UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?');
      for (const item of sale.items) {
        restoreStock.run(item.cantidad, item.producto_id);
      }

      // Mark as voided
      this.db.prepare("UPDATE ventas SET estado = 'anulada', motivo_anulacion = ? WHERE id = ?")
        .run(motivo, id);

      return { success: true };
    });
    return transaction();
  }

  getSalesStats(period = 'today') {
    let dateFilter = '';
    if (period === 'today') {
      dateFilter = "AND date(v.fecha) = date('now','localtime')";
    } else if (period === 'week') {
      dateFilter = "AND v.fecha >= datetime('now','localtime','-7 days')";
    } else if (period === 'month') {
      dateFilter = "AND v.fecha >= datetime('now','localtime','-30 days')";
    }

    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_ventas,
        COALESCE(SUM(CASE WHEN estado = 'completada' THEN total ELSE 0 END), 0) as total_monto,
        COALESCE(AVG(CASE WHEN estado = 'completada' THEN total ELSE NULL END), 0) as ticket_promedio
      FROM ventas v
      WHERE estado = 'completada' ${dateFilter}
    `).get();

    return stats;
  }

  getDailyStats(fechaInicio = null, fechaFin = null) {
    if (fechaInicio && fechaFin) {
      return this.db.prepare(`
        SELECT
          date(fecha) as dia,
          SUM(CASE WHEN estado = 'completada' THEN total ELSE 0 END) as total,
          COUNT(CASE WHEN estado = 'completada' THEN 1 END) as num_ventas
        FROM ventas
        WHERE fecha >= ? AND fecha <= ?
        GROUP BY date(fecha)
        ORDER BY dia ASC
      `).all(fechaInicio, fechaFin + ' 23:59:59');
    }
    return this.db.prepare(`
      SELECT
        date(fecha) as dia,
        SUM(CASE WHEN estado = 'completada' THEN total ELSE 0 END) as total,
        COUNT(CASE WHEN estado = 'completada' THEN 1 END) as num_ventas
      FROM ventas
      WHERE fecha >= datetime('now','localtime','-7 days')
      GROUP BY date(fecha)
      ORDER BY dia ASC
    `).all();
  }

  // ═══════════════════════════════════════
  //  CLIENTES
  // ═══════════════════════════════════════

  getClients() {
    return this.db.prepare('SELECT * FROM clientes ORDER BY nombre ASC').all();
  }

  createClient(data) {
    const result = this.db.prepare(`
      INSERT INTO clientes (nombre, dni_ruc, telefono, email, direccion, notas)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.nombre, data.dni_ruc || '', data.telefono || '',
           data.email || '', data.direccion || '', data.notas || '');
    return { success: true, id: result.lastInsertRowid };
  }

  searchClients(query) {
    const term = `%${query}%`;
    return this.db.prepare(`
      SELECT * FROM clientes
      WHERE nombre LIKE ? OR dni_ruc LIKE ? OR telefono LIKE ?
      ORDER BY nombre ASC LIMIT 20
    `).all(term, term, term);
  }

  updateClient(id, data) {
    const fields = [];
    const values = [];
    const allowed = ['nombre', 'dni_ruc', 'telefono', 'email', 'direccion', 'notas'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    values.push(id);
    const stmt = this.db.prepare(`UPDATE clientes SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return { success: true };
  }

  deleteClient(id) {
    const count = this.db.prepare('SELECT COUNT(*) as c FROM ventas WHERE cliente_id = ?').get(id).c;
    if (count > 0) return { success: false, message: 'El cliente tiene ventas registradas, no puede eliminarse.' };
    
    this.db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
    return { success: true };
  }

  getClientHistory(id) {
    return this.db.prepare('SELECT * FROM ventas WHERE cliente_id = ? ORDER BY fecha DESC').all(id);
  }

  // ═══════════════════════════════════════
  //  CONFIGURACIÓN
  // ═══════════════════════════════════════

  getConfig() {
    return this.db.prepare('SELECT * FROM config_empresa WHERE id = 1').get();
  }

  updateConfig(data) {
    const fields = [];
    const values = [];
    const allowed = ['nombre_empresa', 'ruc', 'direccion', 'telefono',
      'logo_path', 'moneda_simbolo', 'serie_boleta', 'serie_factura', 'mensaje_ticket'];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    values.push(1);

    this.db.prepare(`UPDATE config_empresa SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  }

  getNextReceiptNumber(tipo = 'boleta') {
    const config = this.getConfig();
    if (tipo === 'factura') {
      const next = config.correlativo_factura + 1;
      return `${config.serie_factura}-${String(next).padStart(8, '0')}`;
    }
    const next = config.correlativo_boleta + 1;
    return `${config.serie_boleta}-${String(next).padStart(8, '0')}`;
  }

  // ═══════════════════════════════════════
  //  USUARIOS Y AUTENTICACIÓN
  // ═══════════════════════════════════════

  _hashPassword(password, salt) {
    const crypto = require('crypto');
    if (!salt) salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
    return { hash: `${salt}:${hash}`, salt };
  }

  _verifyPassword(password, storedHash) {
    const [salt, hash] = storedHash.split(':');
    const crypto = require('crypto');
    const testHash = crypto.createHash('sha256').update(salt + password).digest('hex');
    return testHash === hash;
  }

  hasUsers() {
    const count = this.db.prepare('SELECT COUNT(*) as c FROM usuarios').get().c;
    return count > 0;
  }

  createUser(data) {
    try {
      const { hash } = this._hashPassword(data.password);
      const result = this.db.prepare(
        'INSERT INTO usuarios (nombre, username, password_hash, rol) VALUES (?, ?, ?, ?)'
      ).run(data.nombre, data.username.toLowerCase().trim(), hash, data.rol || 'cajero');
      this.db.save();
      return { success: true, id: result.lastInsertRowid };
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        return { success: false, message: 'El nombre de usuario ya existe' };
      }
      return { success: false, message: e.message };
    }
  }

  authenticateUser(username, password) {
    const user = this.db.prepare(
      'SELECT * FROM usuarios WHERE username = ? AND activo = 1'
    ).get(username.toLowerCase().trim());

    if (!user) return { success: false, message: 'Usuario no encontrado' };
    if (!this._verifyPassword(password, user.password_hash)) {
      return { success: false, message: 'Contraseña incorrecta' };
    }

    // Return user without password hash
    const { password_hash, ...safeUser } = user;
    return { success: true, user: safeUser };
  }

  getUsers() {
    return this.db.prepare(
      'SELECT id, nombre, username, rol, activo, created_at FROM usuarios ORDER BY created_at DESC'
    ).all();
  }

  updateUser(id, data) {
    try {
      if (data.password) {
        const { hash } = this._hashPassword(data.password);
        this.db.prepare(
          'UPDATE usuarios SET nombre = ?, username = ?, password_hash = ?, rol = ? WHERE id = ?'
        ).run(data.nombre, data.username.toLowerCase().trim(), hash, data.rol, id);
      } else {
        this.db.prepare(
          'UPDATE usuarios SET nombre = ?, username = ?, rol = ? WHERE id = ?'
        ).run(data.nombre, data.username.toLowerCase().trim(), data.rol, id);
      }
      this.db.save();
      return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  toggleUserActive(id) {
    const user = this.db.prepare('SELECT activo FROM usuarios WHERE id = ?').get(id);
    if (!user) return { success: false, message: 'Usuario no encontrado' };
    const newState = user.activo ? 0 : 1;
    this.db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(newState, id);
    this.db.save();
    return { success: true, activo: newState };
  }

  // ═══════════════════════════════════════
  //  BITÁCORA DE ACTIVIDAD
  // ═══════════════════════════════════════

  logActivity(userId, accion, detalles = '') {
    this.db.prepare(
      'INSERT INTO actividad_usuarios (usuario_id, accion, detalles) VALUES (?, ?, ?)'
    ).run(userId, accion, detalles);
    this.db.save();
  }

  getActivityLog(filters = {}) {
    let query = `
      SELECT a.*, u.nombre as usuario_nombre, u.username, u.rol as usuario_rol
      FROM actividad_usuarios a
      JOIN usuarios u ON a.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.usuario_id) {
      query += ' AND a.usuario_id = ?';
      params.push(filters.usuario_id);
    }
    if (filters.fecha_inicio) {
      query += ' AND a.fecha >= ?';
      params.push(filters.fecha_inicio);
    }
    if (filters.fecha_fin) {
      query += ' AND a.fecha <= ?';
      params.push(filters.fecha_fin + ' 23:59:59');
    }

    query += ' ORDER BY a.fecha DESC LIMIT 200';
    return this.db.prepare(query).all(...params);
  }

  // ═══════════════════════════════════════
  //  BACKUP
  // ═══════════════════════════════════════

  createBackup(destPath) {
    try {
      const fs = require('fs');
      fs.copyFileSync(this.dbPath, destPath);
      return { success: true, path: destPath };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  createAutoBackup() {
    try {
      const fs = require('fs');
      const os = require('os');
      const backupDir = path.join(os.homedir(), 'Documents', 'MarineBackups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const filename = `marine_autobackup_${new Date().toISOString().slice(0,10)}.db`;
      const destPath = path.join(backupDir, filename);
      fs.copyFileSync(this.dbPath, destPath);
      return { success: true };
    } catch (e) {
      console.error('Error in auto backup', e);
      return { success: false };
    }
  }

  // INVENTARIO

  getInventoryProducts() {
    return this.db.prepare(`
      SELECT p.*, c.nombre as categoria_nombre, m.nombre as material_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN materiales m ON p.material_id = m.id
      WHERE p.activo = 1
      ORDER BY p.nombre ASC
    `).all();
  }

  getTopSellingProducts(limit = 10, fechaInicio = null, fechaFin = null) {
    if (fechaInicio && fechaFin) {
      return this.db.prepare(`
        SELECT p.id, p.nombre, p.codigo, p.stock_actual, SUM(dv.cantidad) as total_vendido
        FROM productos p
        JOIN detalle_ventas dv ON p.id = dv.producto_id
        JOIN ventas v ON dv.venta_id = v.id
        WHERE v.estado = 'completada' AND v.fecha >= ? AND v.fecha <= ?
        GROUP BY p.id ORDER BY total_vendido DESC LIMIT ?
      `).all(fechaInicio, fechaFin + ' 23:59:59', limit);
    }
    return this.db.prepare(`
      SELECT p.id, p.nombre, p.codigo, p.stock_actual, SUM(dv.cantidad) as total_vendido
      FROM productos p
      JOIN detalle_ventas dv ON p.id = dv.producto_id
      JOIN ventas v ON dv.venta_id = v.id
      WHERE v.estado = 'completada'
      GROUP BY p.id ORDER BY total_vendido DESC LIMIT ?
    `).all(limit);
  }

  getLowRotationProducts(limit = 10, days = 90) {
    return this.db.prepare(`
      SELECT p.id, p.nombre, p.codigo, p.stock_actual, COALESCE(SUM(dv.cantidad), 0) as total_vendido
      FROM productos p
      LEFT JOIN detalle_ventas dv ON p.id = dv.producto_id
      LEFT JOIN ventas v ON dv.venta_id = v.id AND v.estado = 'completada'
        AND v.fecha >= datetime('now','localtime','-' || ? || ' days')
      WHERE p.activo = 1
      GROUP BY p.id ORDER BY total_vendido ASC LIMIT ?
    `).all(days, limit);
  }

  getInventoryStats() {
    return this.db.prepare(`
      SELECT 
        COUNT(*) as total_productos,
        COALESCE(SUM(stock_actual), 0) as total_unidades,
        COALESCE(SUM(stock_actual * precio_compra), 0) as valor_compra,
        COALESCE(SUM(stock_actual * precio_venta), 0) as valor_venta
      FROM productos WHERE activo = 1
    `).get();
  }

  // ═══════════════════════════════════════
  //  CAJA
  // ═══════════════════════════════════════

  createMovimientoCaja(data) {
    if (!data.monto || data.monto <= 0) throw new Error('El monto debe ser mayor a 0');
    const result = this.db.prepare(`
      INSERT INTO movimientos_caja (tipo, concepto, monto, notas, usuario_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.tipo, data.concepto, data.monto, data.notas || '', data.usuario_id);
    return { success: true, id: result.lastInsertRowid };
  }

  getMovimientosCaja(filters = {}) {
    let query = `
      SELECT m.*, u.nombre as usuario_nombre
      FROM movimientos_caja m
      LEFT JOIN usuarios u ON m.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (filters.fecha_inicio) { query += ' AND m.fecha >= ?'; params.push(filters.fecha_inicio); }
    if (filters.fecha_fin) { query += ' AND m.fecha <= ?'; params.push(filters.fecha_fin + ' 23:59:59'); }
    if (filters.tipo) { query += ' AND m.tipo = ?'; params.push(filters.tipo); }
    query += ' ORDER BY m.fecha DESC LIMIT 200';
    return this.db.prepare(query).all(...params);
  }

  getCajaResumen(fechaInicio = null, fechaFin = null) {
    let whereClause = '1=1';
    const params = [];
    if (fechaInicio) { whereClause += ' AND fecha >= ?'; params.push(fechaInicio); }
    if (fechaFin) { whereClause += ' AND fecha <= ?'; params.push(fechaFin + ' 23:59:59'); }

    const result = this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) as total_egresos
      FROM movimientos_caja WHERE ${whereClause}
    `).get(...params);

    result.saldo_neto = result.total_ingresos - result.total_egresos;
    return result;
  }

  close() {
    if (this.db) this.db.close();
  }
}

module.exports = Database;

