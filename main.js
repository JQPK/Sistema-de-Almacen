const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Database = require('./src/database/db');
const { checkLicense, validateLicenseCode, saveLicense, getMachineId } = require('./src/license/license');

let mainWindow;
let db;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Joyería Mariné - Sistema POS',
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    backgroundColor: '#FAF6F0',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  db = new Database();
  await db.initialize();
  createWindow();

  // ── Window Controls ──
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window:close', () => mainWindow?.close());

  // ── Productos ──
  ipcMain.handle('productos:getAll', (_, filters) => db.getProducts(filters));
  ipcMain.handle('productos:getById', (_, id) => db.getProductById(id));
  ipcMain.handle('productos:create', (_, data) => db.createProduct(data));
  ipcMain.handle('productos:update', (_, id, data) => db.updateProduct(id, data));
  ipcMain.handle('productos:delete', (_, id) => db.deleteProduct(id));
  ipcMain.handle('productos:search', (_, query) => db.searchProducts(query));
  ipcMain.handle('productos:importCSV', async () => {
    const fs = require('fs');
    const { parse } = require('csv-parse/sync');

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importar Productos CSV',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) return { success: false, message: 'Cancelado' };

    try {
      const fileContent = fs.readFileSync(result.filePaths[0], 'utf-8');
      const records = parse(fileContent, { columns: true, skip_empty_lines: true });
      let imported = 0;
      let errors = 0;

      for (const record of records) {
        if (!record.nombre || !record.precio_venta) {
          errors++;
          continue;
        }
        try {
          db.createProduct({
            codigo: record.codigo || null,
            nombre: record.nombre,
            descripcion: record.descripcion || '',
            precio_compra: parseFloat(record.precio_compra) || 0,
            precio_venta: parseFloat(record.precio_venta) || 0,
            stock_actual: parseInt(record.stock_actual) || 0,
            stock_minimo: parseInt(record.stock_minimo) || 1
          });
          imported++;
        } catch(e) {
          errors++;
        }
      }
      return { success: true, imported, errors };
    } catch (e) {
      return { success: false, message: 'Error al procesar el archivo: ' + e.message };
    }
  });

  // ── Categorías ──
  ipcMain.handle('categorias:getAll', () => db.getCategories());
  ipcMain.handle('categorias:create', (_, nombre) => db.createCategory(nombre));
  ipcMain.handle('categorias:update', (_, id, nombre) => db.updateCategory(id, nombre));
  ipcMain.handle('categorias:delete', (_, id) => db.deleteCategory(id));

  // ── Materiales ──
  ipcMain.handle('materiales:getAll', () => db.getMaterials());
  ipcMain.handle('materiales:create', (_, nombre) => db.createMaterial(nombre));
  ipcMain.handle('materiales:update', (_, id, nombre) => db.updateMaterial(id, nombre));
  ipcMain.handle('materiales:delete', (_, id) => db.deleteMaterial(id));

  // ── Ventas ──
  ipcMain.handle('ventas:create', (_, data) => db.createSale(data));
  ipcMain.handle('ventas:getAll', (_, filters) => db.getSales(filters));
  ipcMain.handle('ventas:getById', (_, id) => db.getSaleById(id));
  ipcMain.handle('ventas:void', (_, id, motivo) => db.voidSale(id, motivo));
  ipcMain.handle('ventas:getStats', (_, period) => db.getSalesStats(period));
  ipcMain.handle('ventas:getDailyStats', () => db.getDailyStats());

  // ── Clientes ──
  ipcMain.handle('clientes:getAll', () => db.getClients());
  ipcMain.handle('clientes:create', (_, data) => db.createClient(data));
  ipcMain.handle('clientes:search', (_, query) => db.searchClients(query));
  ipcMain.handle('clientes:update', (_, id, data) => db.updateClient(id, data));
  ipcMain.handle('clientes:delete', (_, id) => db.deleteClient(id));
  ipcMain.handle('clientes:getHistory', (_, id) => db.getClientHistory(id));

  // ── Configuración ──
  ipcMain.handle('config:get', () => db.getConfig());
  ipcMain.handle('config:update', (_, data) => db.updateConfig(data));

  // ── Usuarios ──
  ipcMain.handle('usuarios:hasUsers', () => db.hasUsers());
  ipcMain.handle('usuarios:create', (_, data) => db.createUser(data));
  ipcMain.handle('usuarios:authenticate', (_, username, password) => db.authenticateUser(username, password));
  ipcMain.handle('usuarios:getAll', () => db.getUsers());
  ipcMain.handle('usuarios:update', (_, id, data) => db.updateUser(id, data));
  ipcMain.handle('usuarios:toggle', (_, id) => db.toggleUserActive(id));

  // ── Actividad ──
  ipcMain.handle('actividad:log', (_, userId, accion, detalles) => db.logActivity(userId, accion, detalles));
  ipcMain.handle('actividad:getAll', (_, filters) => db.getActivityLog(filters));

  // ── Comprobantes ──
  ipcMain.handle('comprobantes:getNextNumber', (_, tipo) => db.getNextReceiptNumber(tipo));

  // ── Backup ──
  ipcMain.handle('backup:create', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar respaldo de base de datos',
      defaultPath: `marine_backup_${new Date().toISOString().slice(0,10)}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (!result.canceled) {
      return db.createBackup(result.filePath);
    }
    return { success: false, message: 'Cancelado' };
  });

  // ── Licencia ──
  ipcMain.handle('license:check', () => checkLicense());
  ipcMain.handle('license:getMachineId', () => getMachineId());
  ipcMain.handle('license:activate', (_, code, clientName) => {
    if (!validateLicenseCode(code)) {
      return { success: false, message: 'Código de licencia inválido para este dispositivo' };
    }
    saveLicense(code, clientName);
    return { success: true };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) {
    db.createAutoBackup();
    db.close();
  }
  if (process.platform !== 'darwin') app.quit();
});
