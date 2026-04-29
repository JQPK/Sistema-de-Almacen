/* ═══════════════════════════════════════════════════════════════
   Joyería Mariné — App Renderer (app.js)
   Main application logic for all modules
   ═══════════════════════════════════════════════════════════════ */

// Páginas restringidas para el rol cajero (solo admin puede acceder)
const RESTRICTED_PAGES_CAJERO = ['productos', 'configuracion', 'inventario', 'caja'];

const app = {
  cart: [],
  currentPaymentMethod: 'efectivo',
  currentDocType: 'boleta',
  config: null,
  selectedProductIds: new Set(),
  currentUser: null,
  chartInstances: {},

  // ── Initialize ─────────────────────────
  async init() {
    this.setupWindowControls();
    await this.checkLicense();
  },

  // ── License Check ───────────────────────
  async checkLicense() {
    const result = await window.api.license.check();
    if (result.valid) {
      await this.setupAuth();
    } else {
      await this.showActivationScreen();
    }
  },

  async showActivationScreen() {
    const machineId = await window.api.license.getMachineId();
    document.getElementById('activation-machine-id').value = machineId;
    document.getElementById('screen-activation').style.display = 'flex';

    // Auto-format code input as XXXX-XXXX-XXXX-XXXX
    const codeInput = document.getElementById('activation-code');
    codeInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (val.length > 4)  val = val.slice(0,4)  + '-' + val.slice(4);
      if (val.length > 9)  val = val.slice(0,9)  + '-' + val.slice(9);
      if (val.length > 14) val = val.slice(0,14) + '-' + val.slice(14);
      e.target.value = val.slice(0, 19);
    });

    document.getElementById('btn-activate').addEventListener('click', async () => {
      const code = document.getElementById('activation-code').value.trim();
      const errorEl = document.getElementById('activation-error');

      if (code.length < 19) {
        errorEl.textContent = 'Ingresa el código completo (XXXX-XXXX-XXXX-XXXX)';
        errorEl.style.display = 'block';
        return;
      }

      const res = await window.api.license.activate(code);
      if (res.success) {
        document.getElementById('screen-activation').style.display = 'none';
        await this.setupAuth();
      } else {
        errorEl.textContent = res.message;
        errorEl.style.display = 'block';
      }
    });
  },

  copyMachineId() {
    const val = document.getElementById('activation-machine-id').value;
    navigator.clipboard.writeText(val).then(() => {
      this.toast('ID copiado al portapapeles', 'success');
    });
  },

  async startApp() {
    this.config = await window.api.config.get();
    
    // Hide login/setup and show main app
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('screen-setup').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    
    // Update Sidebar User Info
    document.getElementById('sidebar-user-avatar').textContent = this.currentUser.nombre.charAt(0).toUpperCase();
    document.getElementById('sidebar-user-name').textContent = this.currentUser.nombre;
    document.getElementById('sidebar-user-role').textContent = this.currentUser.rol === 'admin' ? 'Administrador' : 'Cajero';
    
    // Role-based UI logic
    if (this.currentUser.rol !== 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
      // Ocultar botones de navegación de páginas restringidas para cajero
      RESTRICTED_PAGES_CAJERO.forEach(page => {
        const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (navBtn) navBtn.style.display = 'none';
      });
    } else {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
      // Mostrar todos los botones de navegación para admin
      RESTRICTED_PAGES_CAJERO.forEach(page => {
        const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (navBtn) navBtn.style.display = '';
      });
    }

    // Setup rest of app
    this.setupNavigation();
    await this.loadDashboard();
    this.setupProductsPage();
    this.setupPOS();
    this.setupCheckout();
    this.setupSettings();
    this.setupComprobantes();
    this.setupClientes();
    this.setupReportes();
    this.setupUsuarios();
    this.setupInventario();
    this.setupCaja();
    
    window.api.actividad.log(this.currentUser.id, 'login', 'Inició sesión en el sistema');
  },

  // ═══════════════════════════════════════
  //  AUTHENTICATION
  // ═══════════════════════════════════════
  async setupAuth() {
    const hasUsers = await window.api.usuarios.hasUsers();
    
    if (!hasUsers) {
      document.getElementById('screen-setup').style.display = 'flex';
    } else {
      document.getElementById('screen-login').style.display = 'flex';
    }

    // Setup Admin Creation
    document.getElementById('btn-setup-create').addEventListener('click', async () => {
      const nombre = document.getElementById('setup-nombre').value.trim();
      const username = document.getElementById('setup-username').value.trim();
      const password = document.getElementById('setup-password').value;
      const passwordConfirm = document.getElementById('setup-password2').value;
      const errorEl = document.getElementById('setup-error');

      if (!nombre || !username || !password) {
        errorEl.textContent = 'Todos los campos son obligatorios';
        errorEl.style.display = 'block';
        return;
      }
      if (password.length < 4) {
        errorEl.textContent = 'La contraseña debe tener al menos 4 caracteres';
        errorEl.style.display = 'block';
        return;
      }
      if (password !== passwordConfirm) {
        errorEl.textContent = 'Las contraseñas no coinciden';
        errorEl.style.display = 'block';
        return;
      }

      const res = await window.api.usuarios.create({ nombre, username, password, rol: 'admin' });
      if (res.success) {
        this.currentUser = { id: res.id, nombre, username, rol: 'admin' };
        this.startApp();
      } else {
        errorEl.textContent = res.message;
        errorEl.style.display = 'block';
      }
    });

    // Setup Login
    const doLogin = async () => {
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('login-error');

      if (!username || !password) {
        errorEl.textContent = 'Ingresa usuario y contraseña';
        errorEl.style.display = 'block';
        return;
      }

      const res = await window.api.usuarios.authenticate(username, password);
      if (res.success) {
        this.currentUser = res.user;
        this.startApp();
      } else {
        errorEl.textContent = res.message;
        errorEl.style.display = 'block';
      }
    };

    document.getElementById('btn-login').addEventListener('click', doLogin);
    document.getElementById('login-password').addEventListener('keyup', (e) => {
      if (e.key === 'Enter') doLogin();
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
      if (!confirm('¿Estás seguro de que deseas cerrar sesión?')) return;
      window.api.actividad.log(this.currentUser.id, 'logout', 'Cerró sesión');
      this.currentUser = null;

      // Cerrar todos los modales que puedan estar abiertos
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));

      // Ocultar app y mostrar login
      document.getElementById('app-container').style.display = 'none';

      // Limpiar campos del login
      document.getElementById('login-username').value = '';
      document.getElementById('login-password').value = '';
      document.getElementById('login-error').style.display = 'none';

      // Mostrar pantalla de login
      document.getElementById('screen-login').style.display = 'flex';

      // Forzar foco en el campo usuario
      setTimeout(() => {
        document.getElementById('login-username').focus();
      }, 100);
    });
  },

  // ═══════════════════════════════════════
  //  WINDOW CONTROLS
  // ═══════════════════════════════════════
  setupWindowControls() {
    document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimize());
    document.getElementById('btn-maximize').addEventListener('click', () => window.api.maximize());
    document.getElementById('btn-close').addEventListener('click', () => window.api.close());
  },

  // ═══════════════════════════════════════
  //  NAVIGATION
  // ═══════════════════════════════════════
  setupNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.navigateTo(btn.dataset.page);
      });
    });
  },

  navigateTo(page) {
    // Guardia de acceso: redirigir a dashboard si cajero intenta acceder a página restringida
    if (this.currentUser && this.currentUser.rol !== 'admin' && RESTRICTED_PAGES_CAJERO.includes(page)) {
      page = 'dashboard';
    }

    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Show page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    // Refresh data per page
    if (page === 'dashboard') this.loadDashboard();
    if (page === 'pos') this.loadPOSProducts();
    if (page === 'productos') this.loadProducts();
    if (page === 'comprobantes') this.loadComprobantes();
    if (page === 'configuracion') this.loadSettings();
    if (page === 'clientes') this.loadClientes();
    if (page === 'reportes') this.loadReportes();
    if (page === 'usuarios') this.loadUsuarios();
    if (page === 'bitacora') this.loadBitacora();
    if (page === 'inventario') this.loadInventario();
    if (page === 'caja') this.loadCaja();
  },

  // ═══════════════════════════════════════
  //  TOASTS
  // ═══════════════════════════════════════
  toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastSlideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // ═══════════════════════════════════════
  //  MODALS
  // ═══════════════════════════════════════
  openModal(id) {
    document.getElementById(id).classList.add('active');
  },

  closeModal(id) {
    document.getElementById(id).classList.remove('active');
  },

  // ═══════════════════════════════════════
  //  UTILITY
  // ═══════════════════════════════════════
  formatMoney(amount) {
    const symbol = this.config?.moneda_simbolo || 'S/';
    return `${symbol} ${Number(amount || 0).toFixed(2)}`;
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  },

  // ═══════════════════════════════════════
  //  DASHBOARD
  // ═══════════════════════════════════════
  async loadDashboard() {
    try {
      // Today's stats
      const stats = await window.api.ventas.getStats('today');
      document.getElementById('stat-ventas-total').textContent = this.formatMoney(stats.total_monto);
      document.getElementById('stat-num-ventas').textContent = stats.total_ventas;
      document.getElementById('stat-ticket-promedio').textContent = this.formatMoney(stats.ticket_promedio);

      // Low stock count
      const lowStock = await window.api.productos.getAll({ stock_bajo: true });
      document.getElementById('stat-stock-bajo').textContent = lowStock.length;

      // Update low stock badge in nav
      const navProdBtn = document.querySelector('.nav-item[data-page="productos"]');
      const existingBadge = navProdBtn.querySelector('.badge');
      if (existingBadge) existingBadge.remove();
      if (lowStock.length > 0) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = lowStock.length;
        navProdBtn.appendChild(badge);
      }

      // Weekly chart
      const dailyStats = await window.api.ventas.getDailyStats();
      this.renderWeeklyChart(dailyStats);

      // Recent sales
      const recentSales = await window.api.ventas.getAll({});
      this.renderRecentSales(recentSales.slice(0, 5));

      // Low stock table
      this.renderLowStockTable(lowStock);
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
  },

  renderWeeklyChart(data) {
    const container = document.getElementById('chart-ventas-semana');

    // Fill missing days
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const found = (data || []).find(x => x.dia === key);
      days.push({
        label: d.toLocaleDateString('es-PE', { weekday: 'short' }),
        value: found ? found.total : 0,
      });
    }

    if (window.appChartVentasSemana) window.appChartVentasSemana.destroy();
    
    window.appChartVentasSemana = new Chart(container, {
      type: 'bar',
      data: {
        labels: days.map(d => d.label),
        datasets: [{
          label: 'Ventas (S/)',
          data: days.map(d => d.value),
          backgroundColor: '#C9A96E',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  },

  renderRecentSales(sales) {
    const container = document.getElementById('dashboard-recent-sales');
    if (sales.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:30px;"><p class="text-muted">No hay ventas registradas</p></div>';
      return;
    }

    container.innerHTML = sales.map(s => `
      <div class="cart-item" style="cursor:pointer;" onclick="app.viewReceipt(${s.id})">
        <div class="cart-item-info">
          <div class="cart-item-name">${s.numero_comprobante}</div>
          <div class="cart-item-price">${this.formatDateTime(s.fecha)}</div>
        </div>
        <span class="badge ${s.estado === 'completada' ? 'badge-success' : 'badge-danger'}">
          ${s.estado === 'completada' ? 'Completada' : 'Anulada'}
        </span>
        <div class="cart-item-total">${this.formatMoney(s.total)}</div>
      </div>
    `).join('');
  },

  renderLowStockTable(products) {
    const container = document.getElementById('dashboard-low-stock');
    if (products.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:30px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg><p class="text-muted">Todos los productos tienen stock suficiente</p></div>';
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Producto</th><th>Categoría</th><th>Stock Actual</th><th>Stock Mínimo</th></tr></thead>
        <tbody>
          ${products.slice(0, 8).map(p => `
            <tr>
              <td class="fw-600">${p.nombre}</td>
              <td>${p.categoria_nombre || '-'}</td>
              <td class="stock-low fw-600">${p.stock_actual}</td>
              <td>${p.stock_minimo}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },

  // ═══════════════════════════════════════
  //  PRODUCTS PAGE
  // ═══════════════════════════════════════
  setupProductsPage() {
    document.getElementById('btn-new-product').addEventListener('click', () => this.openProductModal());
    document.getElementById('btn-save-product').addEventListener('click', () => this.saveProduct());
    document.getElementById('btn-import-csv').addEventListener('click', async () => {
      const res = await window.api.productos.importCSV();
      if (res.success) {
        this.toast(`CSV Importado. Exitosos: ${res.imported}, Errores: ${res.errors}`);
        this.loadProducts();
      } else {
        this.toast(res.message, 'error');
      }
    });
    document.getElementById('btn-template-csv').addEventListener('click', () => {
      const csv = 'nombre,descripcion,categoria,material,peso_gramos,precio_compra,precio_venta,stock_actual,stock_minimo\nAnillo Oro 18k,Anillo con diseño elegante,Anillos,Oro 18k,3.5,500.00,800.00,10,2\n';
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Plantilla_Productos.csv';
      a.click();
      URL.revokeObjectURL(url);
    });

    // Search & filters
    let searchTimeout;
    document.getElementById('products-search').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => this.loadProducts(), 300);
    });
    document.getElementById('products-filter-cat').addEventListener('change', () => this.loadProducts());
    document.getElementById('products-filter-mat').addEventListener('change', () => this.loadProducts());
    document.getElementById('products-filter-lowstock').addEventListener('change', () => this.loadProducts());
    document.getElementById('products-filter-min').addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => this.loadProducts(), 500); });
    document.getElementById('products-filter-max').addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => this.loadProducts(), 500); });
    document.getElementById('products-filter-status').addEventListener('change', () => this.loadProducts());

    // Select-all checkbox
    document.getElementById('select-all-products').addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.product-select-cb');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        const id = parseInt(cb.dataset.id);
        if (e.target.checked) this.selectedProductIds.add(id);
        else this.selectedProductIds.delete(id);
      });
      this.updateBarcodeButton();
    });

    // Print barcodes button
    document.getElementById('btn-print-barcodes').addEventListener('click', () => this.openBarcodePreview());
  },

  async loadProducts() {
    const search = document.getElementById('products-search').value.trim();
    const catId = document.getElementById('products-filter-cat').value;
    const matId = document.getElementById('products-filter-mat').value;
    const lowStock = document.getElementById('products-filter-lowstock').checked;

    let products;
    if (search) {
      products = await window.api.productos.search(search);
    } else {
      products = await window.api.productos.getAll({
        categoria_id: catId || undefined,
        material_id: matId || undefined,
        stock_bajo: lowStock || undefined,
        precio_min: document.getElementById('products-filter-min').value,
        precio_max: document.getElementById('products-filter-max').value,
        estado: document.getElementById('products-filter-status').value,
      });
    }

    // Load filter options
    await this.loadFilterOptions();

    const tbody = document.getElementById('products-tbody');
    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><p>No se encontraron productos</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(p => {
      const stockClass = p.stock_actual <= p.stock_minimo ? 'stock-low' : 'stock-ok';
      const isChecked = this.selectedProductIds.has(p.id) ? 'checked' : '';
      return `
        <tr>
          <td><input type="checkbox" class="product-select-cb" data-id="${p.id}" ${isChecked} onchange="app.toggleProductSelection(${p.id}, this.checked)"></td>
          <td><span class="font-mono text-muted">${p.codigo || '-'}</span></td>
          <td class="fw-600">${p.nombre}</td>
          <td><span class="badge badge-gold">${p.categoria_nombre || '-'}</span></td>
          <td>${p.material_nombre || '-'}</td>
          <td class="text-muted">${this.formatMoney(p.precio_compra)}</td>
          <td class="fw-700 text-gold">${this.formatMoney(p.precio_venta)}</td>
          <td>${p.descuento_porcentaje > 0 ? `<span class="badge badge-danger">${p.descuento_porcentaje}%</span>` : '-'}</td>
          <td><span class="${stockClass}">${p.stock_actual}</span></td>
          <td>
            <div class="flex gap-8">
              <button class="btn btn-ghost btn-icon btn-sm" title="Editar" onclick="app.editProduct(${p.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon btn-sm" title="Eliminar" onclick="app.deleteProduct(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    this.updateBarcodeButton();
  },

  toggleProductSelection(id, checked) {
    if (checked) this.selectedProductIds.add(id);
    else this.selectedProductIds.delete(id);
    this.updateBarcodeButton();
  },

  updateBarcodeButton() {
    const btn = document.getElementById('btn-print-barcodes');
    const count = this.selectedProductIds.size;
    document.getElementById('barcode-count').textContent = count;
    btn.style.display = count > 0 ? 'inline-flex' : 'none';
  },

  async openBarcodePreview() {
    if (this.selectedProductIds.size === 0) return this.toast('Selecciona al menos un producto', 'error');

    const container = document.getElementById('barcode-labels-container');
    container.innerHTML = '<p style="text-align:center;grid-column:1/-1;">Generando etiquetas...</p>';
    this.openModal('modal-barcodes');

    // Fetch product details for selected IDs
    const products = [];
    for (const id of this.selectedProductIds) {
      const p = await window.api.productos.getById(id);
      if (p) products.push(p);
    }

    container.innerHTML = '';
    products.forEach(p => {
      const label = document.createElement('div');
      label.style.cssText = 'border:1px dashed #ccc; border-radius:8px; padding:10px; text-align:center; background:#fff;';
      label.innerHTML = `
        <p style="font-size:11px; font-weight:700; margin:0 0 2px; color:#333;">${this.config?.nombre_empresa || 'Joyería Mariné'}</p>
        <p style="font-size:10px; margin:0 0 4px; color:#666;">${p.nombre}</p>
        <svg class="barcode-svg" data-code="${p.codigo}"></svg>
        <p style="font-size:12px; font-weight:700; margin:4px 0 0; color:#8B6F47;">S/ ${parseFloat(p.precio_venta).toFixed(2)}</p>
      `;
      container.appendChild(label);
    });

    // Generate barcodes using JsBarcode
    container.querySelectorAll('.barcode-svg').forEach(svg => {
      const code = svg.dataset.code;
      if (code && typeof JsBarcode !== 'undefined') {
        try {
          JsBarcode(svg, code, {
            format: 'CODE128',
            width: 1.5,
            height: 40,
            fontSize: 11,
            margin: 2,
            displayValue: true,
          });
        } catch(e) {
          svg.outerHTML = `<p style="color:red;font-size:10px;">Error: ${code}</p>`;
        }
      }
    });
  },

  printBarcodeLabels() {
    const container = document.getElementById('barcode-labels-container');
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Etiquetas - Joyería Mariné</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; }
        .labels-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          padding: 10px;
        }
        .label {
          border: 1px dashed #aaa;
          border-radius: 4px;
          padding: 8px;
          text-align: center;
          page-break-inside: avoid;
        }
        .label p { margin: 2px 0; }
        .empresa { font-size: 10px; font-weight: bold; }
        .producto { font-size: 9px; color: #555; }
        .precio { font-size: 11px; font-weight: bold; }
        svg { max-width: 100%; }
        @media print {
          body { margin: 0; }
          .labels-grid { gap: 4px; padding: 5px; }
          .label { border: 1px dashed #999; }
        }
      </style></head><body>
      <div class="labels-grid">${container.innerHTML}</div>
      <script>setTimeout(()=>{window.print();window.close();},500)<\/script>
      </body></html>
    `);
    printWindow.document.close();
  },

  async loadFilterOptions() {
    const categories = await window.api.categorias.getAll();
    const materials = await window.api.materiales.getAll();

    // Products page filters
    const catSelect = document.getElementById('products-filter-cat');
    const matSelect = document.getElementById('products-filter-mat');
    const currentCat = catSelect.value;
    const currentMat = matSelect.value;

    catSelect.innerHTML = '<option value="">Todas las categorías</option>' +
      categories.map(c => `<option value="${c.id}" ${c.id == currentCat ? 'selected' : ''}>${c.nombre}</option>`).join('');
    matSelect.innerHTML = '<option value="">Todos los materiales</option>' +
      materials.map(m => `<option value="${m.id}" ${m.id == currentMat ? 'selected' : ''}>${m.nombre}</option>`).join('');

    // Product modal selects
    const prodCat = document.getElementById('prod-categoria');
    const prodMat = document.getElementById('prod-material');
    const savedCat = prodCat.value;
    const savedMat = prodMat.value;

    prodCat.innerHTML = '<option value="">Sin categoría</option>' +
      categories.map(c => `<option value="${c.id}" ${c.id == savedCat ? 'selected' : ''}>${c.nombre}</option>`).join('');
    prodMat.innerHTML = '<option value="">Sin material</option>' +
      materials.map(m => `<option value="${m.id}" ${m.id == savedMat ? 'selected' : ''}>${m.nombre}</option>`).join('');
  },

  openProductModal(product = null) {
    const isEdit = !!product;
    document.getElementById('modal-product-title').textContent = isEdit ? 'Editar Producto' : 'Nuevo Producto';

    document.getElementById('prod-id').value = isEdit ? product.id : '';
    document.getElementById('prod-codigo').value = isEdit ? (product.codigo || '') : '';
    document.getElementById('prod-nombre').value = isEdit ? product.nombre : '';
    document.getElementById('prod-descripcion').value = isEdit ? (product.descripcion || '') : '';
    document.getElementById('prod-peso').value = isEdit ? (product.peso_gramos || '') : '';
    document.getElementById('prod-precio-compra').value = isEdit ? (product.precio_compra || '') : '';
    document.getElementById('prod-precio-venta').value = isEdit ? product.precio_venta : '';
    document.getElementById('prod-stock').value = isEdit ? product.stock_actual : '';
    document.getElementById('prod-stock-min').value = isEdit ? product.stock_minimo : '1';
    document.getElementById('prod-descuento').value = isEdit ? (product.descuento_porcentaje || 0) : '0';

    this.loadFilterOptions().then(() => {
      if (isEdit) {
        document.getElementById('prod-categoria').value = product.categoria_id || '';
        document.getElementById('prod-material').value = product.material_id || '';
      }
    });

    this.openModal('modal-product');
  },

  async editProduct(id) {
    const product = await window.api.productos.getById(id);
    if (product) this.openProductModal(product);
  },

  async saveProduct() {
    const nombre = document.getElementById('prod-nombre').value.trim();
    const precioVenta = parseFloat(document.getElementById('prod-precio-venta').value);

    if (!nombre) return this.toast('El nombre del producto es obligatorio', 'error');
    if (!precioVenta || precioVenta <= 0) return this.toast('El precio de venta es obligatorio', 'error');

    const data = {
      codigo: document.getElementById('prod-codigo').value.trim() || null,
      nombre,
      descripcion: document.getElementById('prod-descripcion').value.trim(),
      categoria_id: document.getElementById('prod-categoria').value || null,
      material_id: document.getElementById('prod-material').value || null,
      peso_gramos: parseFloat(document.getElementById('prod-peso').value) || 0,
      precio_compra: parseFloat(document.getElementById('prod-precio-compra').value) || 0,
      precio_venta: precioVenta,
      stock_actual: parseInt(document.getElementById('prod-stock').value) || 0,
      stock_minimo: parseInt(document.getElementById('prod-stock-min').value) || 1,
      descuento_porcentaje: parseFloat(document.getElementById('prod-descuento').value) || 0,
    };

    const id = document.getElementById('prod-id').value;

    try {
      if (id) {
        await window.api.productos.update(parseInt(id), data);
        window.api.actividad.log(this.currentUser.id, 'producto_editado', `Editó el producto ${data.nombre}`);
        this.toast('Producto actualizado correctamente');
      } else {
        await window.api.productos.create(data);
        window.api.actividad.log(this.currentUser.id, 'producto_creado', `Creó el producto ${data.nombre}`);
        this.toast('Producto creado correctamente');
      }

      this.closeModal('modal-product');
      this.loadProducts();
    } catch (e) {
      this.toast('Error al guardar el producto: ' + e.message, 'error');
    }
  },

  async deleteProduct(id, nombre) {
    if (!confirm(`¿Estás seguro de eliminar "${nombre}"? El producto será desactivado.`)) return;

    try {
      await window.api.productos.delete(id);
      window.api.actividad.log(this.currentUser.id, 'producto_eliminado', `Eliminó el producto ${nombre}`);
      this.toast('Producto eliminado correctamente');
      this.loadProducts();
    } catch (e) {
      this.toast('Error al eliminar producto', 'error');
    }
  },

  // ═══════════════════════════════════════
  //  POINT OF SALE
  // ═══════════════════════════════════════
  setupPOS() {
    let searchTimeout;
    document.getElementById('pos-search').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => this.loadPOSProducts(), 200);
    });

    document.getElementById('btn-clear-cart').addEventListener('click', () => {
      if (this.cart.length === 0) return;
      if (confirm('¿Limpiar todo el pedido?')) {
        this.cart = [];
        this.renderCart();
      }
    });

    document.getElementById('btn-checkout').addEventListener('click', () => {
      if (this.cart.length === 0) return this.toast('Agrega productos al pedido', 'warning');
      this.openCheckoutModal();
    });
  },

  async loadPOSProducts() {
    const search = document.getElementById('pos-search').value.trim();
    const activeCat = document.querySelector('#pos-category-filters .filter-chip.active');
    const catFilter = activeCat?.dataset.cat;

    // Load categories for filter chips
    const categories = await window.api.categorias.getAll();
    const filtersContainer = document.getElementById('pos-category-filters');
    filtersContainer.innerHTML = `<button class="filter-chip ${!catFilter || catFilter === 'all' ? 'active' : ''}" data-cat="all">Todos</button>` +
      categories.map(c =>
        `<button class="filter-chip ${catFilter == c.id ? 'active' : ''}" data-cat="${c.id}">${c.nombre}</button>`
      ).join('');

    // Rebind filter clicks
    filtersContainer.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        filtersContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.loadPOSProducts();
      });
    });

    // Load products
    let products;
    if (search) {
      products = await window.api.productos.search(search);
    } else {
      const filters = {};
      if (catFilter && catFilter !== 'all') filters.categoria_id = catFilter;
      products = await window.api.productos.getAll(filters);
    }

    const grid = document.getElementById('pos-products-grid');
    if (products.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><p>No se encontraron productos</p></div>';
      return;
    }

    grid.innerHTML = products.map(p => {
      const hasDiscount = p.descuento_porcentaje > 0;
      const finalPrice = hasDiscount ? p.precio_venta * (1 - p.descuento_porcentaje / 100) : p.precio_venta;
      const isOutOfStock = p.stock_actual <= 0;
      const stockClass = p.stock_actual <= p.stock_minimo ? 'stock-low' : 'stock-ok';

      return `
        <div class="pos-product-card ${isOutOfStock ? 'out-of-stock' : ''}"
             onclick="app.addToCart(${p.id})" style="position:relative;">
          ${hasDiscount ? `<span class="product-discount">-${p.descuento_porcentaje}%</span>` : ''}
          <div class="product-name">${p.nombre}</div>
          <div class="product-meta">${p.categoria_nombre || ''} ${p.material_nombre ? '· ' + p.material_nombre : ''}</div>
          <div class="product-price">
            ${hasDiscount ? `<span style="text-decoration:line-through; font-size:12px; color:var(--text-tertiary);">${this.formatMoney(p.precio_venta)}</span> ` : ''}
            ${this.formatMoney(finalPrice)}
          </div>
          <div class="product-stock ${stockClass}">Stock: ${p.stock_actual}</div>
        </div>
      `;
    }).join('');
  },

  async addToCart(productId) {
    const product = await window.api.productos.getById(productId);
    if (!product) return;

    const existing = this.cart.find(item => item.producto_id === productId);
    if (existing) {
      if (existing.cantidad >= product.stock_actual) {
        return this.toast('No hay más stock disponible', 'warning');
      }
      existing.cantidad += 1;
      existing.subtotal_item = this.calcItemSubtotal(existing);
    } else {
      if (product.stock_actual <= 0) {
        return this.toast('Producto sin stock', 'warning');
      }
      const hasDiscount = product.descuento_porcentaje > 0;
      const finalPrice = hasDiscount ? product.precio_venta * (1 - product.descuento_porcentaje / 100) : product.precio_venta;
      this.cart.push({
        producto_id: productId,
        nombre: product.nombre,
        precio_original: product.precio_venta,
        precio_unitario: finalPrice,
        descuento_item: hasDiscount ? product.descuento_porcentaje : 0,
        cantidad: 1,
        subtotal_item: finalPrice,
        max_stock: product.stock_actual,
      });
    }
    this.renderCart();
    this.toast(`${product.nombre} agregado`, 'success');
  },

  calcItemSubtotal(item) {
    return item.precio_unitario * item.cantidad;
  },

  changeQty(index, delta) {
    const item = this.cart[index];
    if (!item) return;

    const newQty = item.cantidad + delta;
    if (newQty <= 0) {
      this.cart.splice(index, 1);
    } else if (newQty > item.max_stock) {
      return this.toast('Stock insuficiente', 'warning');
    } else {
      item.cantidad = newQty;
      item.subtotal_item = this.calcItemSubtotal(item);
    }
    this.renderCart();
  },

  removeFromCart(index) {
    this.cart.splice(index, 1);
    this.renderCart();
  },

  renderCart() {
    const itemsContainer = document.getElementById('cart-items');
    const emptyMsg = document.getElementById('cart-empty');
    const summary = document.getElementById('cart-summary');
    const countBadge = document.getElementById('cart-count');

    const totalItems = this.cart.reduce((sum, item) => sum + item.cantidad, 0);
    countBadge.textContent = totalItems;

    if (this.cart.length === 0) {
      emptyMsg.style.display = 'flex';
      summary.style.display = 'none';
      // Remove cart items but keep empty msg
      itemsContainer.querySelectorAll('.cart-item').forEach(el => el.remove());
      return;
    }

    emptyMsg.style.display = 'none';
    summary.style.display = 'block';

    // Render items
    const existingEmpty = itemsContainer.querySelector('.cart-empty');
    itemsContainer.innerHTML = '';
    if (existingEmpty) itemsContainer.appendChild(existingEmpty);

    this.cart.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'cart-item';
      el.innerHTML = `
        <div class="cart-item-info">
          <div class="cart-item-name">${item.nombre}</div>
          <div class="cart-item-price">${this.formatMoney(item.precio_unitario)} c/u</div>
        </div>
        <div class="cart-item-qty">
          <button onclick="app.changeQty(${idx}, -1)">−</button>
          <span>${item.cantidad}</span>
          <button onclick="app.changeQty(${idx}, 1)">+</button>
        </div>
        <div class="cart-item-total">${this.formatMoney(item.subtotal_item)}</div>
        <button class="cart-item-remove" onclick="app.removeFromCart(${idx})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      `;
      itemsContainer.appendChild(el);
    });

    // Update totals
    const subtotal = this.cart.reduce((sum, item) => sum + (item.precio_original * item.cantidad), 0);
    const total = this.cart.reduce((sum, item) => sum + item.subtotal_item, 0);
    const discount = subtotal - total;

    document.getElementById('cart-subtotal').textContent = this.formatMoney(subtotal);
    document.getElementById('cart-discount').textContent = `- ${this.formatMoney(discount)}`;
    document.getElementById('cart-total').textContent = this.formatMoney(total);
  },

  getCartTotal() {
    return this.cart.reduce((sum, item) => sum + item.subtotal_item, 0);
  },

  getCartSubtotal() {
    return this.cart.reduce((sum, item) => sum + (item.precio_original * item.cantidad), 0);
  },

  // ═══════════════════════════════════════
  //  CHECKOUT
  // ═══════════════════════════════════════
  setupCheckout() {
    document.getElementById('checkout-received').addEventListener('input', () => this.updateChange());
    document.getElementById('checkout-descuento').addEventListener('input', () => this.updateCheckoutTotal());
    document.getElementById('btn-confirm-sale').addEventListener('click', () => this.confirmSale());
  },

  openCheckoutModal() {
    document.getElementById('checkout-descuento').value = '0';
    document.getElementById('checkout-received').value = '';
    document.getElementById('checkout-change').value = this.formatMoney(0);
    document.getElementById('checkout-cliente-select').value = '';
    document.getElementById('checkout-notas').value = '';
    this.currentPaymentMethod = 'efectivo';
    this.currentDocType = 'boleta';

    // Reset payment buttons
    document.querySelectorAll('#modal-checkout .payment-method-btn[data-method]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.method === 'efectivo');
    });
    document.querySelectorAll('#modal-checkout .payment-method-btn[data-doc]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.doc === 'boleta');
    });
    
    // Load clients
    this.loadClientsIntoCheckout();
    
    // Reset inputs view
    document.getElementById('checkout-received').parentElement.style.display = 'block';
    document.getElementById('checkout-change').parentElement.style.display = 'block';

    // Show correct total (with discount reset to 0)
    this.updateCheckoutTotal();

    this.openModal('modal-checkout');
  },

  selectPayment(method) {
    this.currentPaymentMethod = method;
    document.querySelectorAll('#modal-checkout .payment-method-btn[data-method]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.method === method);
    });

    // Show/hide cash inputs
    const receivedContainer = document.getElementById('checkout-received').parentElement;
    const changeContainer = document.getElementById('checkout-change').parentElement;
    
    if (method === 'efectivo') {
      receivedContainer.style.display = 'block';
      changeContainer.style.display = 'block';
      document.getElementById('checkout-received').value = '';
      this.updateChange();
    } else {
      receivedContainer.style.display = 'none';
      changeContainer.style.display = 'none';
      const descuento = parseFloat(document.getElementById('checkout-descuento').value) || 0;
      document.getElementById('checkout-received').value = calcTotalWithDiscount(this.getCartTotal(), descuento);
      this.updateChange();
    }
  },

  selectDocType(type) {
    this.currentDocType = type;
    document.querySelectorAll('#modal-checkout .payment-method-btn[data-doc]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.doc === type);
    });
  },

  async loadClientsIntoCheckout() {
    const clients = await window.api.clientes.getAll();
    const select = document.getElementById('checkout-cliente-select');
    select.innerHTML = '<option value="">Consumidor Final (Sin nombre)</option>';
    clients.forEach(c => {
      select.innerHTML += `<option value="${c.id}">${c.nombre} - ${c.dni_ruc || 'S/N'}</option>`;
    });
  },

  updateCheckoutTotal() {
    const subtotal = this.getCartTotal();
    const descuento = parseFloat(document.getElementById('checkout-descuento').value) || 0;
    const total = calcTotalWithDiscount(subtotal, descuento);
    document.getElementById('checkout-total').value = this.formatMoney(total);
    this.updateChange();
  },

  updateChange() {
    const subtotal = this.getCartTotal();
    const descuento = parseFloat(document.getElementById('checkout-descuento').value) || 0;
    const total = calcTotalWithDiscount(subtotal, descuento);
    const received = parseFloat(document.getElementById('checkout-received').value) || 0;
    const change = Math.max(received - total, 0);
    document.getElementById('checkout-change').value = this.formatMoney(change);
  },

  async confirmSale() {
    const subtotal = this.getCartSubtotal();
    const cartTotal = this.getCartTotal(); // total after item-level discounts
    const descuento = parseFloat(document.getElementById('checkout-descuento').value) || 0;

    // Validate monetary discount
    const discountValidation = validateDiscount(descuento, cartTotal);
    if (!discountValidation.valid) {
      return this.toast(discountValidation.error, 'error');
    }

    const total = calcTotalWithDiscount(cartTotal, descuento);

    const received = parseFloat(document.getElementById('checkout-received').value) || 0;
    if (this.currentPaymentMethod === 'efectivo' && received < total) {
      return this.toast('El monto recibido es menor al total', 'error');
    }

    const clienteIdStr = document.getElementById('checkout-cliente-select').value;
    const clienteId = clienteIdStr ? parseInt(clienteIdStr) : null;

    const saleData = {
      tipo_comprobante: this.currentDocType,
      cliente_id: clienteId,
      subtotal: subtotal,
      descuento: descuento,
      total: total,
      metodo_pago: this.currentPaymentMethod,
      monto_pagado: this.currentPaymentMethod === 'efectivo' ? received : total,
      cambio: this.currentPaymentMethod === 'efectivo' ? Math.max(received - total, 0) : 0,
      notas: document.getElementById('checkout-notas').value.trim(),
      items: this.cart.map(item => ({
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        descuento_item: item.descuento_item,
        subtotal_item: item.subtotal_item,
      })),
    };

    saleData.usuario_id = this.currentUser.id;

    try {
      const result = await window.api.ventas.create(saleData);
      if (result.success) {
        window.api.actividad.log(this.currentUser.id, 'venta_creada', `Venta registrada: ${result.numero_comprobante} por S/ ${total.toFixed(2)}`);
        this.closeModal('modal-checkout');
        this.toast(`Venta ${result.numero_comprobante} registrada exitosamente`, 'success');

        // Show receipt
        await this.viewReceipt(result.venta_id);

        // Clear cart
        this.cart = [];
        this.renderCart();
        this.loadPOSProducts(); // Refresh stock
      }
    } catch (e) {
      this.toast('Error al procesar la venta: ' + e.message, 'error');
    }
  },

  // ═══════════════════════════════════════
  //  RECEIPTS / COMPROBANTES
  // ═══════════════════════════════════════
  setupComprobantes() {
    document.getElementById('btn-filter-comp').addEventListener('click', () => this.loadComprobantes());

    // Void sale
    document.getElementById('btn-confirm-void').addEventListener('click', async () => {
      const id = document.getElementById('void-sale-id').value;
      const motivo = document.getElementById('void-motivo').value.trim();
      if (!motivo) return this.toast('Ingrese el motivo de anulación', 'error');

      const result = await window.api.ventas.void(parseInt(id), motivo);
      if (result.success) {
        window.api.actividad.log(this.currentUser.id, 'venta_anulada', `Venta ID ${id} anulada. Motivo: ${motivo}`);
        this.toast('Comprobante anulado exitosamente');
        this.closeModal('modal-void');
        this.loadComprobantes();
      } else {
        this.toast(result.message || 'Error al anular', 'error');
      }
    });

    // Print
    document.getElementById('btn-print-receipt').addEventListener('click', () => {
      const content = document.getElementById('receipt-content').innerHTML;
      const printWindow = window.open('', '_blank', 'width=350,height=600');
      printWindow.document.write(`
        <html><head><title>Comprobante</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 10px; width: 280px; }
          .receipt-header { text-align: center; border-bottom: 1px dashed #999; padding-bottom: 10px; margin-bottom: 10px; }
          .receipt-header h3 { font-size: 16px; margin: 0 0 4px; }
          .receipt-header p { margin: 2px 0; font-size: 11px; color: #666; }
          .receipt-item-row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 11.5px; }
          .receipt-totals { border-top: 1px dashed #999; padding-top: 10px; margin-top: 10px; }
          .receipt-total-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
          .receipt-total-row.grand-total { font-size: 16px; font-weight: 700; border-top: 2px solid #333; padding-top: 8px; margin-top: 8px; }
          .receipt-footer { text-align: center; margin-top: 12px; border-top: 1px dashed #999; padding-top: 10px; font-size: 11px; color: #666; }
          .badge-void { background: #fdd; padding: 4px 10px; border-radius: 4px; color: #c00; font-weight: 700; text-align: center; margin: 8px 0; }
        </style></head><body>${content}</body></html>
      `);
      printWindow.document.close();
      printWindow.print();
      printWindow.close();
    });
  },

  async loadComprobantes() {
    const filters = {};
    const fechaInicio = document.getElementById('comp-fecha-inicio').value;
    const fechaFin = document.getElementById('comp-fecha-fin').value;
    const tipo = document.getElementById('comp-tipo').value;
    const estado = document.getElementById('comp-estado').value;

    if (fechaInicio) filters.fecha_inicio = fechaInicio;
    if (fechaFin) filters.fecha_fin = fechaFin;
    if (tipo) filters.tipo_comprobante = tipo;
    if (estado) filters.estado = estado;

    const sales = await window.api.ventas.getAll(filters);
    const tbody = document.getElementById('comprobantes-tbody');

    if (sales.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><p>No se encontraron comprobantes</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = sales.map(s => {
      const tipoLabel = s.tipo_comprobante === 'factura' ? 'Factura' : 'Boleta';
      const tipoBadge = s.tipo_comprobante === 'factura' ? 'badge-info' : 'badge-gold';
      const estadoBadge = s.estado === 'completada' ? 'badge-success' : 'badge-danger';
      const metodoPago = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' }[s.metodo_pago] || s.metodo_pago;

      return `
        <tr>
          <td class="fw-600 font-mono">${s.numero_comprobante}</td>
          <td><span class="badge ${tipoBadge}">${tipoLabel}</span></td>
          <td>${this.formatDateTime(s.fecha)}</td>
          <td>${s.cliente_nombre || 'Público general'}</td>
          <td>${s.vendedor_nombre || 'Sin registro'}</td>
          <td class="fw-700 text-gold">${this.formatMoney(s.total)}</td>
          <td>${metodoPago}</td>
          <td><span class="badge ${estadoBadge}">${s.estado === 'completada' ? 'Completada' : 'Anulada'}</span></td>
          <td>
            <div class="flex gap-8">
              <button class="btn btn-ghost btn-icon btn-sm" title="Ver comprobante" onclick="app.viewReceipt(${s.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              ${s.estado === 'completada' ? `
              <button class="btn btn-ghost btn-icon btn-sm" title="Anular" onclick="app.openVoidModal(${s.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async viewReceipt(saleId) {
    const sale = await window.api.ventas.getById(saleId);
    if (!sale) return this.toast('Comprobante no encontrado', 'error');

    const config = await window.api.config.get();
    const tipoLabel = sale.tipo_comprobante === 'factura' ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA';
    const metodoPago = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' }[sale.metodo_pago] || sale.metodo_pago;

    const receiptHtml = `
      <div class="receipt-preview">
        <div class="receipt-header">
          <h3>${config.nombre_empresa || 'Joyería Mariné'}</h3>
          ${config.ruc ? `<p>RUC: ${config.ruc}</p>` : ''}
          ${config.direccion ? `<p>${config.direccion}</p>` : ''}
          ${config.telefono ? `<p>Tel: ${config.telefono}</p>` : ''}
        </div>

        <div style="text-align:center; margin-bottom:12px;">
          <strong>${tipoLabel}</strong><br>
          <span>${sale.numero_comprobante}</span><br>
          <span>Fecha: ${this.formatDateTime(sale.fecha)}</span>
        </div>

        ${sale.cliente_nombre ? `
          <div style="margin-bottom:12px; padding-bottom:8px; border-bottom: 1px dashed #999;">
            <span>Cliente: ${sale.cliente_nombre}</span><br>
            ${sale.cliente_dni_ruc ? `<span>${sale.tipo_comprobante === 'factura' ? 'RUC' : 'DNI'}: ${sale.cliente_dni_ruc}</span>` : ''}
          </div>
        ` : ''}

        ${sale.estado === 'anulada' ? '<div class="badge-void" style="background:#fdd;padding:6px;border-radius:4px;color:#c00;font-weight:700;text-align:center;margin:8px 0;">*** ANULADO ***</div>' : ''}

        <div class="receipt-items">
          <div class="receipt-item-row" style="font-weight:700; border-bottom:1px dashed #999; padding-bottom:4px; margin-bottom:6px;">
            <span>Cant. Descripción</span>
            <span>Importe</span>
          </div>
          ${sale.items.map(item => `
            <div class="receipt-item-row">
              <span>${item.cantidad}x ${item.producto_nombre}</span>
              <span>${this.formatMoney(item.subtotal_item)}</span>
            </div>
            ${item.descuento_item > 0 ? `<div class="receipt-item-row" style="font-size:10px; color:#999;"><span>&nbsp;&nbsp;&nbsp;Desc: -${item.descuento_item}%</span><span></span></div>` : ''}
          `).join('')}
        </div>

        <div class="receipt-totals">
          <div class="receipt-total-row"><span>Subtotal:</span><span>${this.formatMoney(sale.subtotal)}</span></div>
          ${sale.descuento > 0 ? `<div class="receipt-total-row"><span>Descuento:</span><span>-${this.formatMoney(sale.descuento)}</span></div>` : ''}
          <div class="receipt-total-row grand-total"><span>TOTAL:</span><span>${this.formatMoney(sale.total)}</span></div>
          <div class="receipt-total-row"><span>Método:</span><span>${metodoPago}</span></div>
          ${sale.metodo_pago === 'efectivo' ? `
            <div class="receipt-total-row"><span>Pagó con:</span><span>${this.formatMoney(sale.monto_pagado)}</span></div>
            <div class="receipt-total-row"><span>Cambio:</span><span>${this.formatMoney(sale.cambio)}</span></div>
          ` : ''}
        </div>

        <div class="receipt-footer">
          <p>${config.mensaje_ticket || '¡Gracias por su compra!'}</p>
        </div>
      </div>
    `;

    document.getElementById('receipt-content').innerHTML = receiptHtml;
    this.openModal('modal-receipt');
  },

  openVoidModal(saleId) {
    document.getElementById('void-sale-id').value = saleId;
    document.getElementById('void-motivo').value = '';
    this.openModal('modal-void');
  },

  // ═══════════════════════════════════════
  //  SETTINGS
  // ═══════════════════════════════════════
  setupSettings() {
    document.getElementById('btn-save-config').addEventListener('click', () => this.saveConfig());
    document.getElementById('btn-backup').addEventListener('click', () => this.createBackup());

    // Categories
    document.getElementById('btn-add-category').addEventListener('click', () => this.addCategory());
    document.getElementById('new-category-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addCategory();
    });

    // Materials
    document.getElementById('btn-add-material').addEventListener('click', () => this.addMaterial());
    document.getElementById('new-material-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addMaterial();
    });
  },

  async loadSettings() {
    const config = await window.api.config.get();
    this.config = config;

    document.getElementById('config-nombre').value = config.nombre_empresa || '';
    document.getElementById('config-ruc').value = config.ruc || '';
    document.getElementById('config-direccion').value = config.direccion || '';
    document.getElementById('config-telefono').value = config.telefono || '';
    document.getElementById('config-moneda').value = config.moneda_simbolo || 'S/';
    document.getElementById('config-serie-boleta').value = config.serie_boleta || 'B001';
    document.getElementById('config-serie-factura').value = config.serie_factura || 'F001';
    document.getElementById('config-mensaje').value = config.mensaje_ticket || '';

    // Load categories & materials
    await this.loadCategoriesList();
    await this.loadMaterialsList();
  },

  async saveConfig() {
    const data = {
      nombre_empresa: document.getElementById('config-nombre').value.trim(),
      ruc: document.getElementById('config-ruc').value.trim(),
      direccion: document.getElementById('config-direccion').value.trim(),
      telefono: document.getElementById('config-telefono').value.trim(),
      moneda_simbolo: document.getElementById('config-moneda').value.trim() || 'S/',
      serie_boleta: document.getElementById('config-serie-boleta').value.trim(),
      serie_factura: document.getElementById('config-serie-factura').value.trim(),
      mensaje_ticket: document.getElementById('config-mensaje').value.trim(),
    };

    await window.api.config.update(data);
    this.config = await window.api.config.get();
    this.toast('Configuración guardada correctamente');
  },

  async createBackup() {
    const result = await window.api.backup.create();
    if (result.success) {
      this.toast('Respaldo creado exitosamente en: ' + result.path);
    } else {
      this.toast(result.message || 'Error al crear respaldo', 'error');
    }
  },

  // Categories Management
  async loadCategoriesList() {
    const categories = await window.api.categorias.getAll();
    const container = document.getElementById('categories-list');
    container.innerHTML = categories.map(c => `
      <div class="tag-item">
        ${c.nombre}
        <button onclick="app.deleteCategory(${c.id}, '${c.nombre.replace(/'/g, "\\'")}')" title="Eliminar">×</button>
      </div>
    `).join('');
  },

  async addCategory() {
    const input = document.getElementById('new-category-input');
    const nombre = input.value.trim();
    if (!nombre) return;

    const result = await window.api.categorias.create(nombre);
    if (result.success) {
      input.value = '';
      this.toast('Categoría agregada');
      this.loadCategoriesList();
    } else {
      this.toast(result.message || 'Error al crear categoría', 'error');
    }
  },

  async deleteCategory(id, nombre) {
    if (!confirm(`¿Eliminar la categoría "${nombre}"?`)) return;
    const result = await window.api.categorias.delete(id);
    if (result.success) {
      this.toast('Categoría eliminada');
      this.loadCategoriesList();
    } else {
      this.toast(result.message, 'error');
    }
  },

  // Materials Management
  async loadMaterialsList() {
    const materials = await window.api.materiales.getAll();
    const container = document.getElementById('materials-list');
    container.innerHTML = materials.map(m => `
      <div class="tag-item">
        ${m.nombre}
        <button onclick="app.deleteMaterial(${m.id}, '${m.nombre.replace(/'/g, "\\'")}')" title="Eliminar">×</button>
      </div>
    `).join('');
  },

  async addMaterial() {
    const input = document.getElementById('new-material-input');
    const nombre = input.value.trim();
    if (!nombre) return;

    const result = await window.api.materiales.create(nombre);
    if (result.success) {
      input.value = '';
      this.toast('Material agregado');
      this.loadMaterialsList();
    } else {
      this.toast(result.message || 'Error al crear material', 'error');
    }
  },

  async deleteMaterial(id, nombre) {
    if (!confirm(`¿Eliminar el material "${nombre}"?`)) return;
    const result = await window.api.materiales.delete(id);
    if (result.success) {
      this.toast('Material eliminado');
      this.loadMaterialsList();
    } else {
      this.toast(result.message, 'error');
    }
  },

  // ═══════════════════════════════════════
  //  CLIENTES
  // ═══════════════════════════════════════
  setupClientes() {
    document.getElementById('btn-new-client').addEventListener('click', () => this.openClientModal());
    document.getElementById('btn-save-client').addEventListener('click', () => this.saveClient());
    
    let searchTimeout;
    document.getElementById('clients-search').addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => this.loadClientes(), 300);
    });
  },

  async loadClientes() {
    const search = document.getElementById('clients-search')?.value.trim();
    let clients = [];
    if (search) {
      clients = await window.api.clientes.search(search);
    } else {
      clients = await window.api.clientes.getAll();
    }

    const tbody = document.getElementById('clients-tbody');
    if (clients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">No se encontraron clientes</div></td></tr>';
      return;
    }

    tbody.innerHTML = clients.map(c => `
      <tr>
        <td class="fw-600">${c.nombre}</td>
        <td>${c.dni_ruc || '-'}</td>
        <td>${c.telefono || '-'}</td>
        <td>${c.email || '-'}</td>
        <td>${c.direccion || '-'}</td>
        <td>
          <div class="flex gap-8">
            <button class="btn btn-ghost btn-icon btn-sm" onclick="app.editClient(${c.id}, '${c.nombre.replace(/'/g, "\\'")}', '${c.dni_ruc || ''}', '${c.telefono || ''}', '${c.email || ''}', '${c.direccion || ''}', '${c.notas || ''}')">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" onclick="app.deleteClient(${c.id}, '${c.nombre.replace(/'/g, "\\'")}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  openClientModal() {
    document.getElementById('modal-client-title').textContent = 'Nuevo Cliente';
    document.getElementById('client-id').value = '';
    document.getElementById('client-nombre').value = '';
    document.getElementById('client-dni').value = '';
    document.getElementById('client-telefono').value = '';
    document.getElementById('client-email').value = '';
    document.getElementById('client-direccion').value = '';
    document.getElementById('client-notas').value = '';
    this.openModal('modal-client');
  },

  editClient(id, nombre, dni, tel, email, dir, notas) {
    document.getElementById('modal-client-title').textContent = 'Editar Cliente';
    document.getElementById('client-id').value = id;
    document.getElementById('client-nombre').value = nombre;
    document.getElementById('client-dni').value = dni;
    document.getElementById('client-telefono').value = tel;
    document.getElementById('client-email').value = email;
    document.getElementById('client-direccion').value = dir;
    document.getElementById('client-notas').value = notas;
    this.openModal('modal-client');
  },

  async saveClient() {
    const id = document.getElementById('client-id').value;
    const nombre = document.getElementById('client-nombre').value.trim();
    if (!nombre) return this.toast('El nombre es obligatorio', 'error');

    const data = {
      nombre,
      dni_ruc: document.getElementById('client-dni').value.trim(),
      telefono: document.getElementById('client-telefono').value.trim(),
      email: document.getElementById('client-email').value.trim(),
      direccion: document.getElementById('client-direccion').value.trim(),
      notas: document.getElementById('client-notas').value.trim(),
    };

    try {
      if (id) {
        await window.api.clientes.update(id, data);
        window.api.actividad.log(this.currentUser.id, 'cliente_editado', `Editó al cliente ${data.nombre}`);
        this.toast('Cliente actualizado exitosamente');
      } else {
        await window.api.clientes.create(data);
        window.api.actividad.log(this.currentUser.id, 'cliente_creado', `Creó al cliente ${data.nombre}`);
        this.toast('Cliente creado exitosamente');
      }
      this.closeModal('modal-client');
      this.loadClientes();
    } catch(e) {
      this.toast('Error al guardar cliente', 'error');
    }
  },

  async deleteClient(id, nombre) {
    if (!confirm(`¿Eliminar al cliente "${nombre}"?`)) return;
    const result = await window.api.clientes.delete(id);
    if (result.success) {
      this.toast('Cliente eliminado');
      this.loadClientes();
    } else {
      this.toast(result.message, 'error');
    }
  },

  // ═══════════════════════════════════════
  //  CHART MANAGEMENT
  // ═══════════════════════════════════════
  _renderChart(key, canvasId, config) {
    if (this.chartInstances[key]) {
      this.chartInstances[key].destroy();
    }
    const canvas = document.getElementById(canvasId);
    const instance = new Chart(canvas, config);
    this.chartInstances[key] = instance;
    return instance;
  },

  // ═══════════════════════════════════════
  setupReportes() {
    // Conectar botón de filtro de fechas
    document.getElementById('btn-filter-reports').addEventListener('click', () => {
      const fechaInicio = document.getElementById('report-fecha-inicio').value;
      const fechaFin = document.getElementById('report-fecha-fin').value;

      const validation = validateDateRange(fechaInicio, fechaFin);
      if (!validation.valid) {
        this.toast(validation.error, 'error');
        return;
      }

      this.loadReportes({ fechaInicio, fechaFin });
    });

    document.getElementById('btn-export-reports').addEventListener('click', async () => {
      const sales = await window.api.ventas.getAll({ limit: false });
      if (!sales || sales.length === 0) {
        return this.toast('No hay ventas para exportar', 'error');
      }

      const BOM = '\uFEFF';
      const headers = [
        'Nro. Comprobante', 'Tipo', 'Fecha', 'Cliente', 'DNI/RUC',
        'Subtotal', 'Descuento', 'Total', 'Método de Pago',
        'Monto Pagado', 'Cambio', 'Estado', 'Vendedor', 'Notas'
      ];

      const rows = sales.map(s => [
        s.numero_comprobante || '',
        (s.tipo_comprobante || '').toUpperCase(),
        s.fecha || '',
        s.cliente_nombre || 'Consumidor Final',
        s.cliente_dni_ruc || '',
        (s.subtotal || 0).toFixed(2),
        (s.descuento || 0).toFixed(2),
        (s.total || 0).toFixed(2),
        s.metodo_pago || '',
        (s.monto_pagado || 0).toFixed(2),
        (s.cambio || 0).toFixed(2),
        s.estado || '',
        s.vendedor_nombre || 'Sin registro',
        (s.notas || '').replace(/"/g, '""')
      ]);

      const csvContent = BOM
        + headers.join(',') + '\n'
        + rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Ventas_Marine_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast(`${sales.length} ventas exportadas exitosamente`, 'success');
    });
  },

  async loadReportes(filters = null) {
    // Calcular rango de fechas: usar filtros si se pasan, o últimos 7 días por defecto
    let fechaInicio, fechaFin;

    if (filters && filters.fechaInicio && filters.fechaFin) {
      fechaInicio = filters.fechaInicio;
      fechaFin = filters.fechaFin;
    } else {
      const hoy = new Date();
      const hace7 = new Date();
      hace7.setDate(hoy.getDate() - 6);
      fechaInicio = hace7.toISOString().split('T')[0];
      fechaFin = hoy.toISOString().split('T')[0];
    }

    // Validar rango antes de consultar
    const validation = validateDateRange(fechaInicio, fechaFin);
    if (!validation.valid) {
      this.toast(validation.error, 'error');
      return;
    }

    // Actualizar label con el rango activo
    const labelEl = document.getElementById('report-date-range-label');
    if (labelEl) {
      const fmt = (iso) => {
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
      };
      labelEl.textContent = `${fmt(fechaInicio)} — ${fmt(fechaFin)}`;
    }

    const dailyStats = await window.api.ventas.getDailyStats(fechaInicio, fechaFin);
    
    // Construir array de días en el rango seleccionado
    const days = [];
    const startDate = new Date(fechaInicio + 'T00:00:00');
    const endDate = new Date(fechaFin + 'T00:00:00');
    const diffMs = endDate - startDate;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    for (let i = 0; i <= diffDays; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const found = (dailyStats || []).find(x => x.dia === key);
      days.push({
        label: d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }),
        total: found ? found.total : 0,
        count: found ? found.num_ventas : 0
      });
    }

    this._renderChart('reportVentas', 'chart-report-ventas', {
      type: 'line',
      data: {
        labels: days.map(d => d.label),
        datasets: [{
          label: 'Ventas (S/)',
          data: days.map(d => d.total),
          borderColor: '#C9A96E',
          backgroundColor: 'rgba(201, 169, 110, 0.2)',
          fill: true,
          tension: 0.3
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    this._renderChart('reportTransacciones', 'chart-report-transacciones', {
      type: 'bar',
      data: {
        labels: days.map(d => d.label),
        datasets: [{
          label: 'Transacciones',
          data: days.map(d => d.count),
          backgroundColor: '#8B6F47',
          borderRadius: 4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  },

  // ═══════════════════════════════════════
  //  USUARIOS
  // ═══════════════════════════════════════
  setupUsuarios() {
    document.getElementById('btn-save-usuario').addEventListener('click', () => this.saveUsuario());
  },

  async loadUsuarios() {
    const usuarios = await window.api.usuarios.getAll();
    const tbody = document.getElementById('usuarios-tbody');
    
    if (usuarios.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>No hay usuarios registrados</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = usuarios.map(u => `
      <tr>
        <td class="fw-600">${u.nombre}</td>
        <td><span class="font-mono text-muted">${u.username}</span></td>
        <td><span class="badge ${u.rol === 'admin' ? 'badge-gold' : 'badge-danger'}">${u.rol.toUpperCase()}</span></td>
        <td><span class="badge ${u.activo ? 'badge-success' : 'badge-danger'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td class="text-muted" style="font-size:12px;">${this.formatDateTime(u.created_at)}</td>
        <td>
          <div class="flex gap-8">
            <button class="btn btn-ghost btn-icon btn-sm" title="Editar" onclick="app.editUsuario(${u.id}, '${u.nombre.replace(/'/g, "\\'")}', '${u.username}', '${u.rol}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            ${u.id !== this.currentUser.id ? `
            <button class="btn btn-ghost btn-icon btn-sm" title="${u.activo ? 'Desactivar' : 'Activar'}" onclick="app.toggleUsuario(${u.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
            </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  },

  openUserModal() {
    document.getElementById('modal-usuario-title').textContent = 'Nuevo Usuario';
    document.getElementById('usuario-id').value = '';
    document.getElementById('usuario-nombre').value = '';
    document.getElementById('usuario-username').value = '';
    document.getElementById('usuario-rol').value = 'cajero';
    document.getElementById('usuario-password').value = '';
    document.getElementById('usuario-pwd-req').style.display = 'inline';
    document.getElementById('usuario-pwd-hint').style.display = 'none';
    this.openModal('modal-usuario');
  },

  editUsuario(id, nombre, username, rol) {
    document.getElementById('modal-usuario-title').textContent = 'Editar Usuario';
    document.getElementById('usuario-id').value = id;
    document.getElementById('usuario-nombre').value = nombre;
    document.getElementById('usuario-username').value = username;
    document.getElementById('usuario-rol').value = rol;
    document.getElementById('usuario-password').value = '';
    document.getElementById('usuario-pwd-req').style.display = 'none';
    document.getElementById('usuario-pwd-hint').style.display = 'block';
    this.openModal('modal-usuario');
  },

  async saveUsuario() {
    const id = document.getElementById('usuario-id').value;
    const nombre = document.getElementById('usuario-nombre').value.trim();
    const username = document.getElementById('usuario-username').value.trim();
    const rol = document.getElementById('usuario-rol').value;
    const password = document.getElementById('usuario-password').value;

    if (!nombre || !username) return this.toast('Nombre y usuario son obligatorios', 'error');
    if (!id && password.length < 4) return this.toast('La contraseña debe tener al menos 4 caracteres', 'error');

    const data = { nombre, username, rol };
    if (password) data.password = password;

    let res;
    if (id) {
      res = await window.api.usuarios.update(parseInt(id), data);
      if (res.success) window.api.actividad.log(this.currentUser.id, 'usuario_editado', `Editó al usuario ${username}`);
    } else {
      res = await window.api.usuarios.create(data);
      if (res.success) window.api.actividad.log(this.currentUser.id, 'usuario_creado', `Creó al usuario ${username}`);
    }

    if (res.success) {
      this.toast(id ? 'Usuario actualizado' : 'Usuario creado', 'success');
      this.closeModal('modal-usuario');
      this.loadUsuarios();
    } else {
      this.toast(res.message, 'error');
    }
  },

  async toggleUsuario(id) {
    if (!confirm('¿Cambiar estado de este usuario?')) return;
    const res = await window.api.usuarios.toggle(id);
    if (res.success) {
      this.toast(res.activo ? 'Usuario activado' : 'Usuario desactivado');
      window.api.actividad.log(this.currentUser.id, 'usuario_estado', `Cambió estado del usuario ID ${id}`);
      this.loadUsuarios();
    }
  },

  // ═══════════════════════════════════════
  //  BITÁCORA
  // ═══════════════════════════════════════
  async loadBitacora() {
    const bitacora = await window.api.actividad.getAll({});
    const tbody = document.getElementById('bitacora-tbody');
    
    if (bitacora.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>No hay registros de actividad</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = bitacora.map(b => `
      <tr>
        <td class="text-muted" style="font-size:12px;">${this.formatDateTime(b.fecha)}</td>
        <td class="fw-600">${b.usuario_nombre}</td>
        <td><span class="badge ${b.usuario_rol === 'admin' ? 'badge-gold' : 'badge-danger'}">${b.usuario_rol.toUpperCase()}</span></td>
        <td><span class="font-mono" style="background:#e8d5b7;padding:2px 6px;border-radius:4px;font-size:11px;">${b.accion}</span></td>
        <td class="text-muted" style="font-size:13px;">${b.detalles || '-'}</td>
      </tr>
    `).join('');
  },

  // ═══════════════════════════════════════
  //  INVENTARIO
  // ═══════════════════════════════════════
  setupInventario() {
    document.getElementById('btn-print-inventory').addEventListener('click', () => this.printInventory());
  },

  async loadInventario() {
    // Stats
    const stats = await window.api.inventario.getStats();
    document.getElementById('inv-stat-productos').textContent = stats.total_productos || 0;
    document.getElementById('inv-stat-unidades').textContent = stats.total_unidades || 0;
    document.getElementById('inv-stat-valor-compra').textContent = this.formatMoney(stats.valor_compra || 0);
    document.getElementById('inv-stat-valor-venta').textContent = this.formatMoney(stats.valor_venta || 0);

    // Main table
    const products = await window.api.inventario.getProducts();
    const tbody = document.getElementById('inventory-tbody');
    if (products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><p>No hay productos</p></div></td></tr>';
    } else {
      tbody.innerHTML = products.map(p => {
        const isLow = p.stock_actual <= p.stock_minimo;
        const rowClass = isLow ? 'style="background:rgba(239,68,68,0.05);"' : '';
        const estadoBadge = isLow
          ? '<span class="badge badge-danger">⚠ Stock Bajo</span>'
          : '<span class="badge badge-success">OK</span>';
        return `<tr ${rowClass}>
          <td class="font-mono text-muted">${p.codigo || '-'}</td>
          <td class="fw-600">${p.nombre}</td>
          <td>${p.categoria_nombre || '-'}</td>
          <td>${p.material_nombre || '-'}</td>
          <td class="${isLow ? 'stock-low fw-700' : 'stock-ok'}">${p.stock_actual}</td>
          <td>${p.stock_minimo}</td>
          <td>${estadoBadge}</td>
        </tr>`;
      }).join('');
    }

    // Top selling
    const topSelling = await window.api.inventario.getTopSelling(10);
    const topTbody = document.getElementById('inventory-top-selling');
    topTbody.innerHTML = topSelling.length === 0
      ? '<tr><td colspan="3"><div class="empty-state"><p>Sin datos</p></div></td></tr>'
      : topSelling.map((p, i) => `<tr>
          <td>${i + 1}. ${p.nombre}</td>
          <td class="font-mono text-muted">${p.codigo || '-'}</td>
          <td class="fw-700 text-gold">${p.total_vendido}</td>
        </tr>`).join('');

    // Low rotation
    const lowRotation = await window.api.inventario.getLowRotation(10, 90);
    const lowTbody = document.getElementById('inventory-low-rotation');
    lowTbody.innerHTML = lowRotation.length === 0
      ? '<tr><td colspan="3"><div class="empty-state"><p>Sin datos</p></div></td></tr>'
      : lowRotation.map(p => `<tr>
          <td>${p.nombre}</td>
          <td class="font-mono text-muted">${p.codigo || '-'}</td>
          <td class="text-muted">${p.total_vendido}</td>
        </tr>`).join('');
  },

  printInventory() {
    const statsHtml = document.getElementById('inventory-stats').outerHTML;
    const tableHtml = document.querySelector('#page-inventario .table-container').outerHTML;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    const config = this.config || {};
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Inventario — ${config.nombre_empresa || 'Joyería Mariné'}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        p { color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
        th { background: #f5f5f5; font-weight: bold; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
        .stat-card { border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
        .stat-card h3 { font-size: 18px; margin: 0 0 4px; }
        .stat-card p { font-size: 11px; color: #666; margin: 0; }
        @media print { body { margin: 10px; } }
      </style></head><body>
      <h1>Inventario — ${config.nombre_empresa || 'Joyería Mariné'}</h1>
      <p>Generado el ${new Date().toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</p>
      ${statsHtml}
      ${tableHtml}
      <script>setTimeout(()=>{window.print();window.close();},500)<\/script>
      </body></html>
    `);
    printWindow.document.close();
  },

  // ═══════════════════════════════════════
  //  CAJA
  // ═══════════════════════════════════════

  setupCaja() {
    document.getElementById('btn-new-egreso').addEventListener('click', () => {
      document.getElementById('egreso-concepto').value = '';
      document.getElementById('egreso-monto').value = '';
      document.getElementById('egreso-notas').value = '';
      this.openModal('modal-egreso');
    });

    document.getElementById('btn-confirm-egreso').addEventListener('click', () => this.saveEgreso());
    document.getElementById('btn-filter-caja').addEventListener('click', () => this.loadCaja());
    document.getElementById('btn-print-caja').addEventListener('click', () => this.printCuadre());
  },

  async loadCaja(filters = null) {
    // Default: today
    const today = new Date().toISOString().split('T')[0];
    let fechaInicio = document.getElementById('caja-fecha-inicio').value || today;
    let fechaFin = document.getElementById('caja-fecha-fin').value || today;

    if (!document.getElementById('caja-fecha-inicio').value) {
      document.getElementById('caja-fecha-inicio').value = today;
      document.getElementById('caja-fecha-fin').value = today;
    }

    // Resumen
    const resumen = await window.api.caja.getResumen(fechaInicio, fechaFin);
    document.getElementById('caja-stat-ingresos').textContent = this.formatMoney(resumen.total_ingresos || 0);
    document.getElementById('caja-stat-egresos').textContent = this.formatMoney(resumen.total_egresos || 0);
    const saldo = resumen.saldo_neto || 0;
    const saldoEl = document.getElementById('caja-stat-saldo');
    saldoEl.textContent = this.formatMoney(saldo);
    saldoEl.style.color = saldo >= 0 ? 'var(--success)' : 'var(--danger)';

    // Movimientos
    const movimientos = await window.api.caja.getAll({ fecha_inicio: fechaInicio, fecha_fin: fechaFin });
    const tbody = document.getElementById('caja-tbody');
    if (movimientos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>No hay movimientos en este período</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = movimientos.map(m => {
      const isIngreso = m.tipo === 'ingreso';
      const tipoBadge = isIngreso
        ? '<span class="badge badge-success">Ingreso</span>'
        : '<span class="badge badge-danger">Egreso</span>';
      const montoClass = isIngreso ? 'fw-700 text-success' : 'fw-700 text-danger';
      const montoPrefix = isIngreso ? '+' : '-';
      return `<tr>
        <td>${tipoBadge}</td>
        <td>${m.concepto}</td>
        <td class="${montoClass}">${montoPrefix} ${this.formatMoney(m.monto)}</td>
        <td>${m.usuario_nombre || '-'}</td>
        <td class="text-muted" style="font-size:12px;">${this.formatDateTime(m.fecha)}</td>
      </tr>`;
    }).join('');
  },

  async saveEgreso() {
    const concepto = document.getElementById('egreso-concepto').value.trim();
    const monto = parseFloat(document.getElementById('egreso-monto').value);
    const notas = document.getElementById('egreso-notas').value.trim();

    if (!concepto) return this.toast('El concepto es obligatorio', 'error');

    const validation = validateEgreso(monto);
    if (!validation.valid) return this.toast(validation.error, 'error');

    try {
      await window.api.caja.create({
        tipo: 'egreso',
        concepto,
        monto,
        notas,
        usuario_id: this.currentUser.id,
      });
      this.toast('Egreso registrado correctamente', 'success');
      this.closeModal('modal-egreso');
      this.loadCaja();
    } catch (e) {
      this.toast('Error al registrar egreso: ' + e.message, 'error');
    }
  },

  printCuadre() {
    const resumenHtml = document.querySelector('#page-caja .stats-grid').outerHTML;
    const tableHtml = document.querySelector('#page-caja .table-container').outerHTML;
    const fechaInicio = document.getElementById('caja-fecha-inicio').value;
    const fechaFin = document.getElementById('caja-fecha-fin').value;
    const config = this.config || {};
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Cuadre de Caja</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        p { color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
        th { background: #f5f5f5; font-weight: bold; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
        .stat-card { border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
        .stat-card h3 { font-size: 18px; margin: 0 0 4px; }
        .stat-card p { font-size: 11px; color: #666; margin: 0; }
        @media print { body { margin: 10px; } }
      </style></head><body>
      <h1>Cuadre de Caja — ${config.nombre_empresa || 'Joyería Mariné'}</h1>
      <p>Período: ${fechaInicio} al ${fechaFin} — Generado el ${new Date().toLocaleDateString('es-PE')}</p>
      ${resumenHtml}
      ${tableHtml}
      <script>setTimeout(()=>{window.print();window.close();},500)<\/script>
      </body></html>
    `);
    printWindow.document.close();
  }
};

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => app.init());
