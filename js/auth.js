/**
 * SAURUS CoPilot — Auth Module
 * Gestión de usuarios, roles, sesiones y permisos.
 *
 * Roles:
 *   superadmin  — Acceso total, único, no eliminable
 *   admin       — Acceso configurado por superadmin
 *   user        — Acceso básico, configurado por superadmin/admin
 *
 * Persistencia: localStorage (usuarios/vehículos), sessionStorage (sesión activa)
 */

(function (global) {
    'use strict';

    // ─── Constantes ───────────────────────────────────────────────────────────

    const STORAGE_KEYS = {
        USERS: 'saurus_users',
        VEHICLES: 'saurus_vehicles',
        SESSION: 'saurus_session'
    };

    const ROLES = {
        SUPERADMIN: 'superadmin',
        ADMIN: 'admin',
        USER: 'user'
    };

    // Permisos disponibles en el sistema
    const ALL_PERMISSIONS = [
        { key: 'view_telemetry',    label: 'Ver Telemetría' },
        { key: 'upload_telemetry',  label: 'Subir Telemetría' },
        { key: 'upload_video',      label: 'Subir Video' },
        { key: 'export_report',     label: 'Exportar Reporte' },
        { key: 'view_map',          label: 'Ver Mapa' },
        { key: 'view_incidents',    label: 'Ver Incidentes' },
        { key: 'view_gauges',       label: 'Ver Instrumentos' },
        { key: 'change_scenario',   label: 'Cambiar Escenario' },
        { key: 'switch_units',      label: 'Cambiar Unidades' }
    ];

    // Permisos por defecto para cada rol
    const DEFAULT_PERMISSIONS = {
        superadmin: ALL_PERMISSIONS.map(p => p.key),
        admin: ['view_telemetry', 'upload_telemetry', 'upload_video', 'export_report', 'view_map', 'view_incidents', 'view_gauges', 'change_scenario', 'switch_units'],
        user: ['view_telemetry', 'view_map', 'view_incidents', 'view_gauges']
    };

    // ─── Inicialización ────────────────────────────────────────────────────────

    function initDefaultData() {
        if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
            const defaultUsers = [
                {
                    id: 'superadmin-001',
                    username: 'superadmin',
                    password: btoa('Saurus2026!'),
                    displayName: 'Super Administrador',
                    role: ROLES.SUPERADMIN,
                    permissions: DEFAULT_PERMISSIONS.superadmin,
                    assignedVehicles: [],
                    createdAt: new Date().toISOString(),
                    active: true
                }
            ];
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(defaultUsers));
        }

        if (!localStorage.getItem(STORAGE_KEYS.VEHICLES)) {
            localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify([]));
        }
    }

    // ─── Helpers de persistencia ───────────────────────────────────────────────

    function getUsers() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS)) || []; }
        catch(e) { return []; }
    }

    function saveUsers(users) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }

    function getVehicles() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.VEHICLES)) || []; }
        catch(e) { return []; }
    }

    function saveVehicles(vehicles) {
        localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
    }

    // ─── Gestión de sesión ─────────────────────────────────────────────────────

    function getSession() {
        try { return JSON.parse(sessionStorage.getItem(STORAGE_KEYS.SESSION)); }
        catch(e) { return null; }
    }

    function setSession(user) {
        const session = {
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            permissions: user.permissions,
            assignedVehicles: user.assignedVehicles,
            loginAt: new Date().toISOString()
        };
        sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
        return session;
    }

    function clearSession() {
        sessionStorage.removeItem(STORAGE_KEYS.SESSION);
    }

    function isLoggedIn() {
        return getSession() !== null;
    }

    // ─── Autenticación ─────────────────────────────────────────────────────────

    function login(username, password) {
        const users = getUsers();
        const user = users.find(function(u) {
            return u.username.toLowerCase() === username.toLowerCase().trim() &&
                   u.password === btoa(password) &&
                   u.active;
        });

        if (!user) {
            return { success: false, error: 'Usuario o contraseña incorrectos.' };
        }

        const session = setSession(user);
        return { success: true, session };
    }

    function logout() {
        clearSession();
    }

    // ─── Permisos ──────────────────────────────────────────────────────────────

    function hasPermission(permKey) {
        const session = getSession();
        if (!session) return false;
        if (session.role === ROLES.SUPERADMIN) return true;
        return (session.permissions || []).includes(permKey);
    }

    function isSuperAdmin() {
        const session = getSession();
        return !!(session && session.role === ROLES.SUPERADMIN);
    }

    function isAdmin() {
        const session = getSession();
        return !!(session && (session.role === ROLES.SUPERADMIN || session.role === ROLES.ADMIN));
    }

    // ─── Gestión de Usuarios (CRUD) ────────────────────────────────────────────

    function createUser(opts) {
        var username = opts.username, password = opts.password, displayName = opts.displayName,
            role = opts.role, permissions = opts.permissions, assignedVehicles = opts.assignedVehicles;

        if (!isSuperAdmin()) return { success: false, error: 'Sin permisos.' };

        const users = getUsers();
        if (users.find(function(u) { return u.username.toLowerCase() === username.toLowerCase(); })) {
            return { success: false, error: 'El nombre de usuario ya existe.' };
        }
        if (role === ROLES.SUPERADMIN) {
            return { success: false, error: 'No se puede crear otro SuperAdmin.' };
        }

        const newUser = {
            id: 'user-' + Date.now(),
            username: username.trim(),
            password: btoa(password),
            displayName: (displayName || '').trim() || username.trim(),
            role: role || ROLES.USER,
            permissions: permissions || DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.user,
            assignedVehicles: assignedVehicles || [],
            createdAt: new Date().toISOString(),
            active: true
        };

        users.push(newUser);
        saveUsers(users);
        return { success: true, user: sanitizeUser(newUser) };
    }

    function updateUser(userId, updates) {
        if (!isSuperAdmin()) return { success: false, error: 'Sin permisos.' };

        const users = getUsers();
        const idx = users.findIndex(function(u) { return u.id === userId; });
        if (idx === -1) return { success: false, error: 'Usuario no encontrado.' };

        if (users[idx].role === ROLES.SUPERADMIN) {
            return { success: false, error: 'No se puede modificar el SuperAdmin.' };
        }

        if (updates.displayName !== undefined) users[idx].displayName = updates.displayName.trim();
        if (updates.password !== undefined && updates.password !== '') users[idx].password = btoa(updates.password);
        if (updates.role !== undefined && updates.role !== ROLES.SUPERADMIN) users[idx].role = updates.role;
        if (updates.permissions !== undefined) users[idx].permissions = updates.permissions;
        if (updates.assignedVehicles !== undefined) users[idx].assignedVehicles = updates.assignedVehicles;
        if (updates.active !== undefined) users[idx].active = updates.active;

        saveUsers(users);
        return { success: true, user: sanitizeUser(users[idx]) };
    }

    function deleteUser(userId) {
        if (!isSuperAdmin()) return { success: false, error: 'Sin permisos.' };

        const users = getUsers();
        const user = users.find(function(u) { return u.id === userId; });
        if (!user) return { success: false, error: 'Usuario no encontrado.' };
        if (user.role === ROLES.SUPERADMIN) return { success: false, error: 'No se puede eliminar el SuperAdmin.' };

        saveUsers(users.filter(function(u) { return u.id !== userId; }));
        return { success: true };
    }

    function listUsers() {
        if (!isSuperAdmin()) return [];
        return getUsers().map(sanitizeUser);
    }

    function sanitizeUser(user) {
        var safe = Object.assign({}, user);
        delete safe.password;
        return safe;
    }

    // ─── Gestión de Vehículos ──────────────────────────────────────────────────

    function createVehicle(opts) {
        var plate = opts.plate, alias = opts.alias, type = opts.type, description = opts.description;
        if (!isSuperAdmin()) return { success: false, error: 'Sin permisos.' };

        const vehicles = getVehicles();
        if (vehicles.find(function(v) { return v.plate.toLowerCase() === plate.toLowerCase(); })) {
            return { success: false, error: 'Ya existe un vehículo con esa patente.' };
        }

        const vehicle = {
            id: 'veh-' + Date.now(),
            plate: plate.trim().toUpperCase(),
            alias: alias ? alias.trim() : plate.trim().toUpperCase(),
            type: type || 'car',
            description: description || '',
            createdAt: new Date().toISOString()
        };

        vehicles.push(vehicle);
        saveVehicles(vehicles);
        return { success: true, vehicle };
    }

    function updateVehicle(vehicleId, updates) {
        if (!isSuperAdmin()) return { success: false, error: 'Sin permisos.' };

        const vehicles = getVehicles();
        const idx = vehicles.findIndex(function(v) { return v.id === vehicleId; });
        if (idx === -1) return { success: false, error: 'Vehículo no encontrado.' };

        if (updates.plate !== undefined) vehicles[idx].plate = updates.plate.trim().toUpperCase();
        if (updates.alias !== undefined) vehicles[idx].alias = updates.alias.trim();
        if (updates.type !== undefined) vehicles[idx].type = updates.type;
        if (updates.description !== undefined) vehicles[idx].description = updates.description;

        saveVehicles(vehicles);
        return { success: true, vehicle: vehicles[idx] };
    }

    function deleteVehicle(vehicleId) {
        if (!isSuperAdmin()) return { success: false, error: 'Sin permisos.' };

        const users = getUsers();
        users.forEach(function(u) {
            u.assignedVehicles = (u.assignedVehicles || []).filter(function(id) { return id !== vehicleId; });
        });
        saveUsers(users);

        saveVehicles(getVehicles().filter(function(v) { return v.id !== vehicleId; }));
        return { success: true };
    }

    function listVehicles() {
        const session = getSession();
        if (!session) return [];
        const all = getVehicles();
        if (session.role === ROLES.SUPERADMIN) return all;
        return all.filter(function(v) { return (session.assignedVehicles || []).includes(v.id); });
    }

    // ─── Vehículo activo en sesión ─────────────────────────────────────────────

    function getActiveVehicle() {
        const session = getSession();
        if (!session) return null;
        return session.activeVehicle || null;
    }

    function setActiveVehicle(vehicleId) {
        const session = getSession();
        if (!session) return;
        const vehicle = listVehicles().find(function(v) { return v.id === vehicleId; });
        if (!vehicle) return;
        session.activeVehicle = vehicle;
        sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
    }

    // ─── API Pública ───────────────────────────────────────────────────────────

    global.SaurusAuth = {
        ROLES: ROLES,
        ALL_PERMISSIONS: ALL_PERMISSIONS,
        DEFAULT_PERMISSIONS: DEFAULT_PERMISSIONS,

        init: initDefaultData,
        login: login,
        logout: logout,
        isLoggedIn: isLoggedIn,
        getSession: getSession,
        hasPermission: hasPermission,
        isSuperAdmin: isSuperAdmin,
        isAdmin: isAdmin,

        createUser: createUser,
        updateUser: updateUser,
        deleteUser: deleteUser,
        listUsers: listUsers,

        createVehicle: createVehicle,
        updateVehicle: updateVehicle,
        deleteVehicle: deleteVehicle,
        listVehicles: listVehicles,
        getActiveVehicle: getActiveVehicle,
        setActiveVehicle: setActiveVehicle
    };

})(window);
