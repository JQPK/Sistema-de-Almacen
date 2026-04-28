const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Productos
  productos: {
    getAll: (filters) => ipcRenderer.invoke('productos:getAll', filters),
    getById: (id) => ipcRenderer.invoke('productos:getById', id),
    create: (data) => ipcRenderer.invoke('productos:create', data),
    update: (id, data) => ipcRenderer.invoke('productos:update', id, data),
    delete: (id) => ipcRenderer.invoke('productos:delete', id),
    search: (query) => ipcRenderer.invoke('productos:search', query),
    importCSV: () => ipcRenderer.invoke('productos:importCSV')
  },

  // Categorías
  categorias: {
    getAll: () => ipcRenderer.invoke('categorias:getAll'),
    create: (nombre) => ipcRenderer.invoke('categorias:create', nombre),
    update: (id, nombre) => ipcRenderer.invoke('categorias:update', id, nombre),
    delete: (id) => ipcRenderer.invoke('categorias:delete', id),
  },

  // Materiales
  materiales: {
    getAll: () => ipcRenderer.invoke('materiales:getAll'),
    create: (nombre) => ipcRenderer.invoke('materiales:create', nombre),
    update: (id, nombre) => ipcRenderer.invoke('materiales:update', id, nombre),
    delete: (id) => ipcRenderer.invoke('materiales:delete', id),
  },

  // Ventas
  ventas: {
    create: (data) => ipcRenderer.invoke('ventas:create', data),
    getAll: (filters) => ipcRenderer.invoke('ventas:getAll', filters),
    getById: (id) => ipcRenderer.invoke('ventas:getById', id),
    void: (id, motivo) => ipcRenderer.invoke('ventas:void', id, motivo),
    getStats: (period) => ipcRenderer.invoke('ventas:getStats', period),
    getDailyStats: () => ipcRenderer.invoke('ventas:getDailyStats'),
  },

  // Clientes
  clientes: {
    getAll: () => ipcRenderer.invoke('clientes:getAll'),
    create: (data) => ipcRenderer.invoke('clientes:create', data),
    search: (query) => ipcRenderer.invoke('clientes:search', query),
    update: (id, data) => ipcRenderer.invoke('clientes:update', id, data),
    delete: (id) => ipcRenderer.invoke('clientes:delete', id),
    getHistory: (id) => ipcRenderer.invoke('clientes:getHistory', id),
  },

  // Configuración
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (data) => ipcRenderer.invoke('config:update', data),
  },

  // Comprobantes
  comprobantes: {
    getNextNumber: (tipo) => ipcRenderer.invoke('comprobantes:getNextNumber', tipo),
  },

  // Usuarios
  usuarios: {
    hasUsers: () => ipcRenderer.invoke('usuarios:hasUsers'),
    create: (data) => ipcRenderer.invoke('usuarios:create', data),
    authenticate: (username, password) => ipcRenderer.invoke('usuarios:authenticate', username, password),
    getAll: () => ipcRenderer.invoke('usuarios:getAll'),
    update: (id, data) => ipcRenderer.invoke('usuarios:update', id, data),
    toggle: (id) => ipcRenderer.invoke('usuarios:toggle', id),
  },

  // Actividad
  actividad: {
    log: (userId, accion, detalles) => ipcRenderer.invoke('actividad:log', userId, accion, detalles),
    getAll: (filters) => ipcRenderer.invoke('actividad:getAll', filters),
  },

  // Backup
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
  },
});
