/**
 * SAURUS CoPilot — Admin Panel Module
 * Renderiza y gestiona el modal de administración (usuarios + vehículos).
 * Requiere SaurusAuth (auth.js) cargado previamente.
 */

(function (global) {
    'use strict';

    // ─── Estructura HTML del modal ─────────────────────────────────────────────

    function buildModalHTML() {
        return `
<div id="auth-admin-overlay" class="auth-modal-overlay" role="dialog" aria-modal="true" aria-label="Panel de Administración">
  <div class="auth-modal">

    <!-- Header -->
    <div class="auth-modal-header">
      <div class="auth-modal-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Panel de Administración
      </div>
      <button class="auth-modal-close" id="admin-modal-close" title="Cerrar">✕</button>
    </div>

    <!-- Tabs -->
    <div class="auth-panel-tabs">
      <button class="auth-tab-btn active" data-tab="tab-users" id="tab-btn-users">
        👥 Usuarios
      </button>
      <button class="auth-tab-btn" data-tab="tab-vehicles" id="tab-btn-vehicles">
        🚗 Vehículos
      </button>
    </div>

    <!-- Body -->
    <div class="auth-modal-body">

      <!-- ──────── TAB: Usuarios ──────── -->
      <div class="auth-tab-panel active" id="tab-users">
        <div id="users-feedback" class="auth-feedback"></div>

        <!-- Toolbar -->
        <div class="auth-section-toolbar">
          <span class="auth-section-title">Gestión de Usuarios</span>
          <button class="auth-btn auth-btn-primary" id="btn-show-user-form">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo Usuario
          </button>
        </div>

        <!-- Formulario de usuario (oculto por defecto) -->
        <div class="auth-form-panel hidden" id="user-form-panel">
          <div class="auth-form-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            <span id="user-form-title-text">Crear Usuario</span>
          </div>
          <input type="hidden" id="edit-user-id" value="">
          <div class="auth-form-grid">
            <div class="auth-form-group">
              <label for="form-username">Usuario</label>
              <input type="text" id="form-username" placeholder="nombre_usuario" autocomplete="off">
            </div>
            <div class="auth-form-group">
              <label for="form-displayname">Nombre Mostrado</label>
              <input type="text" id="form-displayname" placeholder="Juan Pérez" autocomplete="off">
            </div>
            <div class="auth-form-group">
              <label for="form-password">Contraseña</label>
              <input type="password" id="form-password" placeholder="••••••••" autocomplete="new-password">
            </div>
            <div class="auth-form-group">
              <label for="form-role">Rol</label>
              <select id="form-role">
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>

          <!-- Permisos -->
          <div class="auth-form-group" style="margin-bottom:16px">
            <label>Permisos</label>
            <div class="auth-perms-grid" id="form-perms-grid"></div>
          </div>

          <!-- Vehículos asignados -->
          <div class="auth-form-group" style="margin-bottom:20px">
            <label>Vehículos Asignados</label>
            <div class="auth-vehicles-assign" id="form-vehicles-assign"></div>
            <p id="form-vehicles-empty" class="auth-form-group" style="font-size:0.78rem;color:var(--auth-muted);margin-top:6px;display:none">
              No hay vehículos registrados aún.
            </p>
          </div>

          <div class="auth-form-footer">
            <button class="auth-btn auth-btn-ghost" id="btn-cancel-user-form">Cancelar</button>
            <button class="auth-btn auth-btn-primary" id="btn-save-user-form">Guardar</button>
          </div>
        </div>

        <!-- Tabla de usuarios -->
        <div class="auth-table-wrap">
          <table class="auth-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Vehículos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="users-table-body"></tbody>
          </table>
        </div>
      </div>

      <!-- ──────── TAB: Vehículos ──────── -->
      <div class="auth-tab-panel" id="tab-vehicles">
        <div id="vehicles-feedback" class="auth-feedback"></div>

        <!-- Toolbar -->
        <div class="auth-section-toolbar">
          <span class="auth-section-title">Gestión de Vehículos</span>
          <button class="auth-btn auth-btn-primary" id="btn-show-vehicle-form">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo Vehículo
          </button>
        </div>

        <!-- Formulario de vehículo -->
        <div class="auth-form-panel hidden" id="vehicle-form-panel">
          <div class="auth-form-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            <span id="vehicle-form-title-text">Registrar Vehículo</span>
          </div>
          <input type="hidden" id="edit-vehicle-id" value="">
          <div class="auth-form-grid">
            <div class="auth-form-group">
              <label for="form-plate">Patente / Placa</label>
              <input type="text" id="form-plate" placeholder="ABC123" autocomplete="off" style="text-transform:uppercase">
            </div>
            <div class="auth-form-group">
              <label for="form-alias">Alias / Nombre</label>
              <input type="text" id="form-alias" placeholder="Camión Ruta 1" autocomplete="off">
            </div>
            <div class="auth-form-group">
              <label for="form-veh-type">Tipo</label>
              <select id="form-veh-type">
                <option value="car">🚗 Auto</option>
                <option value="truck">🚛 Camión</option>
                <option value="van">🚐 Van / Minibus</option>
                <option value="motorcycle">🏍 Motocicleta</option>
                <option value="bus">🚌 Bus</option>
              </select>
            </div>
          </div>
          <div class="auth-form-group" style="margin-bottom:20px">
            <label for="form-veh-desc">Descripción (opcional)</label>
            <textarea id="form-veh-desc" placeholder="Notas adicionales..."></textarea>
          </div>
          <div class="auth-form-footer">
            <button class="auth-btn auth-btn-ghost" id="btn-cancel-vehicle-form">Cancelar</button>
            <button class="auth-btn auth-btn-primary" id="btn-save-vehicle-form">Guardar</button>
          </div>
        </div>

        <!-- Tabla de vehículos -->
        <div class="auth-table-wrap">
          <table class="auth-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Patente</th>
                <th>Alias</th>
                <th>Descripción</th>
                <th>Asignado a</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="vehicles-table-body"></tbody>
          </table>
        </div>
      </div>

    </div><!-- /modal-body -->
  </div><!-- /modal -->
</div><!-- /overlay -->`;
    }

    // ─── Helpers UI ───────────────────────────────────────────────────────────

    const VEH_ICONS = { car: '🚗', truck: '🚛', van: '🚐', motorcycle: '🏍', bus: '🚌' };

    function showFeedback(elementId, msg, type) {
        var el = document.getElementById(elementId);
        if (!el) return;
        el.textContent = msg;
        el.className = 'auth-feedback ' + type;
        setTimeout(function () {
            el.className = 'auth-feedback';
        }, 4000);
    }

    // ─── Renderizado de tablas ─────────────────────────────────────────────────

    function renderUsersTable() {
        var tbody = document.getElementById('users-table-body');
        if (!tbody) return;
        var users = SaurusAuth.listUsers();
        var vehicles = SaurusAuth.listVehicles();

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6"><div class="auth-empty-state"><p>No hay usuarios registrados.</p></div></td></tr>';
            return;
        }

        tbody.innerHTML = users.map(function (u) {
            var assignedLabels = (u.assignedVehicles || []).map(function (vid) {
                var v = vehicles.find(function (x) { return x.id === vid; });
                return v ? (VEH_ICONS[v.type] || '🚗') + ' ' + v.plate : '?';
            }).join(', ') || '—';

            var isSA = u.role === 'superadmin';
            var editBtn = isSA ? '' :
                '<button class="auth-btn auth-btn-ghost auth-btn-sm" onclick="SaurusAdminPanel.editUser(\'' + u.id + '\')" title="Editar">✏️</button>';
            var toggleBtn = isSA ? '' :
                '<button class="auth-btn auth-btn-ghost auth-btn-sm" onclick="SaurusAdminPanel.toggleUser(\'' + u.id + '\')" title="' + (u.active ? 'Desactivar' : 'Activar') + '">' + (u.active ? '🔒' : '🔓') + '</button>';
            var deleteBtn = isSA ? '' :
                '<button class="auth-btn auth-btn-danger auth-btn-sm" onclick="SaurusAdminPanel.confirmDeleteUser(\'' + u.id + '\',\'' + u.username + '\')" title="Eliminar">🗑️</button>';

            return '<tr>' +
                '<td><strong>' + u.username + '</strong></td>' +
                '<td>' + u.displayName + '</td>' +
                '<td><span class="auth-role-badge ' + u.role + '">' + roleName(u.role) + '</span></td>' +
                '<td style="font-size:0.78rem;color:var(--auth-muted)">' + assignedLabels + '</td>' +
                '<td><span class="auth-status-badge ' + (u.active ? 'active' : 'inactive') + '">' + (u.active ? 'Activo' : 'Inactivo') + '</span></td>' +
                '<td><div class="auth-row-actions">' + editBtn + toggleBtn + deleteBtn + '</div></td>' +
                '</tr>';
        }).join('');
    }

    function roleName(r) {
        return { superadmin: 'SuperAdmin', admin: 'Admin', user: 'Usuario' }[r] || r;
    }

    function renderVehiclesTable() {
        var tbody = document.getElementById('vehicles-table-body');
        if (!tbody) return;
        var vehicles = SaurusAuth.listVehicles();
        var users = SaurusAuth.listUsers().filter(function (u) { return u.role !== 'superadmin'; });

        if (vehicles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6"><div class="auth-empty-state"><p>No hay vehículos registrados.</p></div></td></tr>';
            return;
        }

        tbody.innerHTML = vehicles.map(function (v) {
            var assignedTo = users.filter(function (u) {
                return (u.assignedVehicles || []).includes(v.id);
            }).map(function (u) { return u.username; }).join(', ') || '—';

            return '<tr>' +
                '<td class="veh-type-icon">' + (VEH_ICONS[v.type] || '🚗') + '</td>' +
                '<td><strong>' + v.plate + '</strong></td>' +
                '<td>' + v.alias + '</td>' +
                '<td style="font-size:0.78rem;color:var(--auth-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (v.description || '—') + '</td>' +
                '<td style="font-size:0.78rem;color:var(--auth-muted)">' + assignedTo + '</td>' +
                '<td><div class="auth-row-actions">' +
                  '<button class="auth-btn auth-btn-ghost auth-btn-sm" onclick="SaurusAdminPanel.editVehicle(\'' + v.id + '\')" title="Editar">✏️</button>' +
                  '<button class="auth-btn auth-btn-danger auth-btn-sm" onclick="SaurusAdminPanel.confirmDeleteVehicle(\'' + v.id + '\',\'' + v.plate + '\')" title="Eliminar">🗑️</button>' +
                '</div></td>' +
                '</tr>';
        }).join('');
    }

    // ─── Formulario de Usuarios ────────────────────────────────────────────────

    function renderPermsGrid(selectedPerms) {
        var grid = document.getElementById('form-perms-grid');
        if (!grid) return;
        grid.innerHTML = SaurusAuth.ALL_PERMISSIONS.map(function (p) {
            var checked = selectedPerms && selectedPerms.includes(p.key) ? 'checked' : '';
            return '<label class="auth-perm-check">' +
                '<input type="checkbox" name="perm" value="' + p.key + '" ' + checked + '>' +
                '<span>' + p.label + '</span>' +
                '</label>';
        }).join('');
    }

    function renderVehiclesAssign(selectedIds) {
        var container = document.getElementById('form-vehicles-assign');
        var empty = document.getElementById('form-vehicles-empty');
        if (!container) return;
        var vehicles = SaurusAuth.listVehicles();
        if (vehicles.length === 0) {
            container.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';
        container.innerHTML = vehicles.map(function (v) {
            var checked = selectedIds && selectedIds.includes(v.id) ? 'checked' : '';
            return '<label class="auth-veh-check">' +
                '<input type="checkbox" name="veh" value="' + v.id + '" ' + checked + '>' +
                '<div class="auth-veh-check-info">' +
                  '<span class="auth-veh-check-plate">' + (VEH_ICONS[v.type] || '🚗') + ' ' + v.plate + '</span>' +
                  '<span class="auth-veh-check-alias">' + v.alias + '</span>' +
                '</div>' +
                '</label>';
        }).join('');
    }

    function openUserForm(userData) {
        var panel = document.getElementById('user-form-panel');
        var titleEl = document.getElementById('user-form-title-text');
        if (!panel) return;

        document.getElementById('edit-user-id').value = userData ? userData.id : '';
        document.getElementById('form-username').value = userData ? userData.username : '';
        document.getElementById('form-username').disabled = !!userData; // no editar username
        document.getElementById('form-displayname').value = userData ? userData.displayName : '';
        document.getElementById('form-password').value = '';
        document.getElementById('form-password').placeholder = userData ? 'Dejar vacío para no cambiar' : '••••••••';
        document.getElementById('form-role').value = userData ? userData.role : 'user';

        titleEl.textContent = userData ? 'Editar Usuario' : 'Crear Usuario';

        var defaultPerms = SaurusAuth.DEFAULT_PERMISSIONS[document.getElementById('form-role').value];
        renderPermsGrid(userData ? userData.permissions : defaultPerms);
        renderVehiclesAssign(userData ? userData.assignedVehicles : []);

        panel.classList.remove('hidden');
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function closeUserForm() {
        var panel = document.getElementById('user-form-panel');
        if (panel) panel.classList.add('hidden');
        document.getElementById('edit-user-id').value = '';
        document.getElementById('form-username').disabled = false;
    }

    function getFormPermissions() {
        return Array.from(document.querySelectorAll('#form-perms-grid input[name="perm"]:checked'))
            .map(function (cb) { return cb.value; });
    }

    function getFormVehicles() {
        return Array.from(document.querySelectorAll('#form-vehicles-assign input[name="veh"]:checked'))
            .map(function (cb) { return cb.value; });
    }

    function saveUserForm() {
        var editId = document.getElementById('edit-user-id').value;
        var username = document.getElementById('form-username').value.trim();
        var displayName = document.getElementById('form-displayname').value.trim();
        var password = document.getElementById('form-password').value;
        var role = document.getElementById('form-role').value;
        var permissions = getFormPermissions();
        var assignedVehicles = getFormVehicles();

        var result;
        if (editId) {
            // Actualizar
            var updates = { displayName: displayName, role: role, permissions: permissions, assignedVehicles: assignedVehicles };
            if (password) updates.password = password;
            result = SaurusAuth.updateUser(editId, updates);
        } else {
            // Crear
            if (!username) { showFeedback('users-feedback', 'El nombre de usuario es obligatorio.', 'error'); return; }
            if (!password) { showFeedback('users-feedback', 'La contraseña es obligatoria.', 'error'); return; }
            result = SaurusAuth.createUser({ username: username, password: password, displayName: displayName, role: role, permissions: permissions, assignedVehicles: assignedVehicles });
        }

        if (result.success) {
            showFeedback('users-feedback', editId ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.', 'success');
            closeUserForm();
            renderUsersTable();
            updateVehicleSelector(); // refrescar selector de vehículo en header
        } else {
            showFeedback('users-feedback', result.error || 'Error al guardar.', 'error');
        }
    }

    // ─── Formulario de Vehículos ───────────────────────────────────────────────

    function openVehicleForm(vehicleData) {
        var panel = document.getElementById('vehicle-form-panel');
        var titleEl = document.getElementById('vehicle-form-title-text');
        if (!panel) return;

        document.getElementById('edit-vehicle-id').value = vehicleData ? vehicleData.id : '';
        document.getElementById('form-plate').value = vehicleData ? vehicleData.plate : '';
        document.getElementById('form-plate').disabled = !!vehicleData;
        document.getElementById('form-alias').value = vehicleData ? vehicleData.alias : '';
        document.getElementById('form-veh-type').value = vehicleData ? vehicleData.type : 'car';
        document.getElementById('form-veh-desc').value = vehicleData ? vehicleData.description : '';

        titleEl.textContent = vehicleData ? 'Editar Vehículo' : 'Registrar Vehículo';

        panel.classList.remove('hidden');
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function closeVehicleForm() {
        var panel = document.getElementById('vehicle-form-panel');
        if (panel) panel.classList.add('hidden');
        document.getElementById('edit-vehicle-id').value = '';
        document.getElementById('form-plate').disabled = false;
    }

    function saveVehicleForm() {
        var editId = document.getElementById('edit-vehicle-id').value;
        var plate = document.getElementById('form-plate').value.trim().toUpperCase();
        var alias = document.getElementById('form-alias').value.trim();
        var type = document.getElementById('form-veh-type').value;
        var description = document.getElementById('form-veh-desc').value.trim();

        var result;
        if (editId) {
            result = SaurusAuth.updateVehicle(editId, { alias: alias, type: type, description: description });
        } else {
            if (!plate) { showFeedback('vehicles-feedback', 'La patente es obligatoria.', 'error'); return; }
            result = SaurusAuth.createVehicle({ plate: plate, alias: alias || plate, type: type, description: description });
        }

        if (result.success) {
            showFeedback('vehicles-feedback', editId ? 'Vehículo actualizado.' : 'Vehículo registrado.', 'success');
            closeVehicleForm();
            renderVehiclesTable();
            updateVehicleSelector();
        } else {
            showFeedback('vehicles-feedback', result.error || 'Error al guardar.', 'error');
        }
    }

    // ─── Actualizar selector de vehículo en header ─────────────────────────────

    function updateVehicleSelector() {
        var select = document.getElementById('auth-vehicle-select');
        if (!select) return;

        var vehicles = SaurusAuth.listVehicles();
        var activeVeh = SaurusAuth.getActiveVehicle();

        select.innerHTML = vehicles.map(function (v) {
            var sel = activeVeh && activeVeh.id === v.id ? 'selected' : '';
            return '<option value="' + v.id + '" ' + sel + '>' + (VEH_ICONS[v.type] || '🚗') + ' ' + v.plate + ' — ' + v.alias + '</option>';
        }).join('');

        if (vehicles.length === 0) {
            select.innerHTML = '<option value="">Sin vehículos</option>';
        }

        // Auto-seleccionar primero si no hay activo
        if (vehicles.length > 0 && !activeVeh) {
            SaurusAuth.setActiveVehicle(vehicles[0].id);
            select.value = vehicles[0].id;
        }
    }

    // ─── Acciones globales (llamadas desde onclick en tabla) ───────────────────

    function editUser(userId) {
        var users = SaurusAuth.listUsers();
        var user = users.find(function (u) { return u.id === userId; });
        if (!user) return;

        // Asegurar que estamos en la tab de usuarios
        switchTab('tab-users');
        openUserForm(user);
    }

    function toggleUser(userId) {
        var users = SaurusAuth.listUsers();
        var user = users.find(function (u) { return u.id === userId; });
        if (!user) return;
        var result = SaurusAuth.updateUser(userId, { active: !user.active });
        if (result.success) renderUsersTable();
    }

    function confirmDeleteUser(userId, username) {
        if (!confirm('¿Eliminar al usuario "' + username + '"? Esta acción no se puede deshacer.')) return;
        var result = SaurusAuth.deleteUser(userId);
        if (result.success) {
            showFeedback('users-feedback', 'Usuario eliminado.', 'success');
            renderUsersTable();
        } else {
            showFeedback('users-feedback', result.error || 'Error.', 'error');
        }
    }

    function editVehicle(vehicleId) {
        var vehicles = SaurusAuth.listVehicles();
        var vehicle = vehicles.find(function (v) { return v.id === vehicleId; });
        if (!vehicle) return;
        switchTab('tab-vehicles');
        openVehicleForm(vehicle);
    }

    function confirmDeleteVehicle(vehicleId, plate) {
        if (!confirm('¿Eliminar el vehículo "' + plate + '"? Se desasignará de todos los usuarios.')) return;
        var result = SaurusAuth.deleteVehicle(vehicleId);
        if (result.success) {
            showFeedback('vehicles-feedback', 'Vehículo eliminado.', 'success');
            renderVehiclesTable();
            updateVehicleSelector();
        } else {
            showFeedback('vehicles-feedback', result.error || 'Error.', 'error');
        }
    }

    // ─── Gestión de tabs ───────────────────────────────────────────────────────

    function switchTab(tabId) {
        document.querySelectorAll('.auth-tab-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        document.querySelectorAll('.auth-tab-panel').forEach(function (panel) {
            panel.classList.toggle('active', panel.id === tabId);
        });
    }

    // ─── Abrir / Cerrar modal ──────────────────────────────────────────────────

    function open() {
        if (!SaurusAuth.isSuperAdmin()) return;
        var overlay = document.getElementById('auth-admin-overlay');
        if (!overlay) return;
        renderUsersTable();
        renderVehiclesTable();
        overlay.classList.add('open');
    }

    function close() {
        var overlay = document.getElementById('auth-admin-overlay');
        if (overlay) overlay.classList.remove('open');
        closeUserForm();
        closeVehicleForm();
    }

    // ─── Inicialización ────────────────────────────────────────────────────────

    function init() {
        // Insertar HTML del modal en el body
        var div = document.createElement('div');
        div.innerHTML = buildModalHTML();
        document.body.appendChild(div.firstElementChild);

        // Tabs
        document.querySelectorAll('.auth-tab-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                switchTab(btn.dataset.tab);
            });
        });

        // Cerrar modal
        var closeBtn = document.getElementById('admin-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', close);

        // Cerrar al hacer clic en el overlay
        var overlay = document.getElementById('auth-admin-overlay');
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) close();
            });
        }

        // Formulario de usuarios
        var btnShowUser = document.getElementById('btn-show-user-form');
        if (btnShowUser) btnShowUser.addEventListener('click', function () { openUserForm(null); });

        var btnCancelUser = document.getElementById('btn-cancel-user-form');
        if (btnCancelUser) btnCancelUser.addEventListener('click', closeUserForm);

        var btnSaveUser = document.getElementById('btn-save-user-form');
        if (btnSaveUser) btnSaveUser.addEventListener('click', saveUserForm);

        // Auto-actualizar permisos al cambiar rol
        var roleSelect = document.getElementById('form-role');
        if (roleSelect) {
            roleSelect.addEventListener('change', function () {
                var defaultPerms = SaurusAuth.DEFAULT_PERMISSIONS[roleSelect.value];
                renderPermsGrid(defaultPerms);
            });
        }

        // Formulario de vehículos
        var btnShowVeh = document.getElementById('btn-show-vehicle-form');
        if (btnShowVeh) btnShowVeh.addEventListener('click', function () { openVehicleForm(null); });

        var btnCancelVeh = document.getElementById('btn-cancel-vehicle-form');
        if (btnCancelVeh) btnCancelVeh.addEventListener('click', closeVehicleForm);

        var btnSaveVeh = document.getElementById('btn-save-vehicle-form');
        if (btnSaveVeh) btnSaveVeh.addEventListener('click', saveVehicleForm);

        // Patente en mayúsculas automática
        var plateInput = document.getElementById('form-plate');
        if (plateInput) {
            plateInput.addEventListener('input', function () {
                plateInput.value = plateInput.value.toUpperCase();
            });
        }

        // Tecla Escape cierra
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') close();
        });
    }

    // ─── API Pública ───────────────────────────────────────────────────────────

    global.SaurusAdminPanel = {
        init: init,
        open: open,
        close: close,
        updateVehicleSelector: updateVehicleSelector,
        // Expuestas para onclick en tabla:
        editUser: editUser,
        toggleUser: toggleUser,
        confirmDeleteUser: confirmDeleteUser,
        editVehicle: editVehicle,
        confirmDeleteVehicle: confirmDeleteVehicle
    };

})(window);
