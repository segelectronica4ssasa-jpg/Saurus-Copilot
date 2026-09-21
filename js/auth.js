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
        user: ['view_telemetry', 'view_map', 'view_incidents', 'view_gauges', 'change_scenario', 'switch_units']
    };

    // ─── Inicialización ────────────────────────────────────────────────────────

    /**
     * Codifica una contraseña a base64 de forma segura (soporta UTF-8 y caracteres especiales).
     */
    function encodePassword(raw) {
        if (!raw) return '';
        try {
            return btoa(unescape(encodeURIComponent(raw)));
        } catch (e) {
            return btoa(raw); // fallback
        }
    }

    function initDefaultData() {
        // Inicializar usuarios si no existen
        if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
            var defaultUsers = [
                {
                    id: 'superadmin-001',
                    username: 'superadmin',
                    password: encodePassword('Saurus2026!'),
                    displayName: 'Super Administrador',
                    role: ROLES.SUPERADMIN,
                    permissions: DEFAULT_PERMISSIONS.superadmin,
                    assignedVehicles: ['veh-001', 'veh-002', 'veh-003'],
                    createdAt: new Date().toISOString(),
                    active: true
                }
            ];
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(defaultUsers));
        } else {
            // Migrar superadmin ya existente
            var users = getUsers();
            var sa = users.find(function(u) { return u.id === 'superadmin-001'; });
            if (sa) {
                var newHash = encodePassword('Saurus2026!');
                if (sa.password !== newHash) {
                    sa.password = newHash;
                    saveUsers(users);
                }
            }
        }

        // Inicializar flota de vehículos de demostración si está vacío
        var existingVehicles = getVehicles();
        if (!existingVehicles || existingVehicles.length === 0) {
            var defaultVehicles = [
                {
                    id: 'veh-001',
                    plate: 'AF-742-AA',
                    alias: 'Camión Scania R450',
                    type: 'truck',
                    description: 'Unidad de transporte de carga pesada - Ruta Nacional',
                    createdAt: new Date().toISOString()
                },
                {
                    id: 'veh-002',
                    plate: 'AG-120-BC',
                    alias: 'Toyota Hilux 4x4',
                    type: 'car',
                    description: 'Móvil de supervisión técnica y patrullaje',
                    createdAt: new Date().toISOString()
                },
                {
                    id: 'veh-003',
                    plate: 'AE-983-CD',
                    alias: 'Mercedes Sprinter Van',
                    type: 'van',
                    description: 'Logística de distribución urbana y paquetería',
                    createdAt: new Date().toISOString()
                }
            ];
            saveVehicles(defaultVehicles);
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
            permissions: user.permissions || DEFAULT_PERMISSIONS[user.role] || DEFAULT_PERMISSIONS.user,
            assignedVehicles: user.assignedVehicles || [],
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
        try {
            if (!username || !password) {
                return { success: false, error: 'Por favor ingresa usuario y contraseña.' };
            }

            var trimUser = username.trim().toLowerCase();
            var trimPass = password.trim();
            var enc1 = encodePassword(password);
            var encTrim = encodePassword(trimPass);
            var encBtoa = '';
            var encBtoaTrim = '';
            try { encBtoa = btoa(password); } catch(e) {}
            try { encBtoaTrim = btoa(trimPass); } catch(e) {}

            var users = getUsers();
            var user = users.find(function(u) {
                return (u.username || '').toLowerCase().trim() === trimUser;
            });

            if (!user) {
                return { success: false, error: 'El usuario "' + username.trim() + '" no existe en el sistema.' };
            }

            if (user.active === false) {
                return { success: false, error: 'La cuenta del usuario "' + user.username + '" está desactivada.' };
            }

            // Comparación de contraseña con soporte de formatos previos y sin espacios
            var matchesPassword = (
                user.password === enc1 ||
                user.password === encTrim ||
                (encBtoa && user.password === encBtoa) ||
                (encBtoaTrim && user.password === encBtoaTrim) ||
                user.password === password ||
                user.password === trimPass
            );

            if (!matchesPassword) {
                return { success: false, error: 'Contraseña incorrecta para el usuario "' + user.username + '".' };
            }

            // Normalizar el hash guardado si venía de un formato viejo
            if (user.password !== enc1) {
                user.password = enc1;
                saveUsers(users);
            }

            var session = setSession(user);
            return { success: true, session: session };
        } catch(e) {
            return { success: false, error: 'Error de autenticación: ' + (e.message || e) };
        }
    }

    function logout() {
        clearSession();
    }

    /**
     * Inicia sesión directamente como un usuario por su ID (para pruebas y cambio rápido de sesión).
     */
    function switchSession(userId) {
        var users = getUsers();
        var user = users.find(function(u) { return u.id === userId; });
        if (!user) return { success: false, error: 'Usuario no encontrado.' };
        if (user.active === false) return { success: false, error: 'La cuenta está desactivada.' };
        var session = setSession(user);
        return { success: true, session: session };
    }

    /**
     * Vuelve rápidamente a la sesión de SuperAdministrador.
     */
    function switchToSuperAdmin() {
        var users = getUsers();
        var sa = users.find(function(u) { return u.role === ROLES.SUPERADMIN; });
        if (!sa) return { success: false, error: 'SuperAdmin no configurado.' };
        var session = setSession(sa);
        return { success: true, session: session };
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

    function canManageUsers() {
        return isAdmin();
    }

    // ─── Gestión de Usuarios (CRUD) ────────────────────────────────────────────

    function createUser(opts) {
        if (!canManageUsers()) return { success: false, error: 'Sin permisos para crear usuarios.' };

        var currentSession = getSession();
        var username = (opts.username || '').trim();
        var password = opts.password || '';
        var displayName = (opts.displayName || '').trim();
        var role = opts.role || ROLES.USER;
        var permissions = opts.permissions;
        var assignedVehicles = opts.assignedVehicles;

        if (!username) return { success: false, error: 'El nombre de usuario es obligatorio.' };
        if (!password) return { success: false, error: 'La contraseña es obligatoria.' };

        // Un admin secundario solo puede crear usuarios con rol 'user'
        if (currentSession.role === ROLES.ADMIN && role !== ROLES.USER) {
            return { success: false, error: 'Los administradores solo pueden crear usuarios estándar.' };
        }

        if (role === ROLES.SUPERADMIN) {
            return { success: false, error: 'No se puede crear otro SuperAdmin.' };
        }

        const users = getUsers();
        if (users.find(function(u) { return (u.username || '').toLowerCase().trim() === username.toLowerCase(); })) {
            return { success: false, error: 'El usuario "' + username + '" ya existe en el sistema.' };
        }

        var defaultPerms = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.user;
        var finalPerms = (permissions && permissions.length > 0) ? permissions : defaultPerms;

        // Solo superadmin puede asignar vehículos al crear
        var finalVehicles = (currentSession.role === ROLES.SUPERADMIN) ? (assignedVehicles || []) : [];

        var newUser = {
            id: 'user-' + Date.now(),
            username: username,
            password: encodePassword(password),
            displayName: displayName || username,
            role: role,
            permissions: finalPerms,
            assignedVehicles: finalVehicles,
            createdAt: new Date().toISOString(),
            active: true
        };

        users.push(newUser);
        saveUsers(users);
        return { success: true, user: sanitizeUser(newUser) };
    }

    function updateUser(userId, updates) {
        if (!canManageUsers()) return { success: false, error: 'Sin permisos para modificar usuarios.' };

        var currentSession = getSession();
        const users = getUsers();
        const idx = users.findIndex(function(u) { return u.id === userId; });
        if (idx === -1) return { success: false, error: 'Usuario no encontrado.' };

        if (users[idx].role === ROLES.SUPERADMIN) {
            return { success: false, error: 'No se puede modificar al SuperAdmin.' };
        }

        // Un admin secundario no puede modificar a otro administrador
        if (currentSession.role === ROLES.ADMIN && users[idx].role === ROLES.ADMIN && users[idx].id !== currentSession.userId) {
            return { success: false, error: 'No tienes permisos para modificar a otro administrador.' };
        }

        if (updates.displayName !== undefined) users[idx].displayName = updates.displayName.trim();
        if (updates.password !== undefined && updates.password !== '') {
            users[idx].password = encodePassword(updates.password);
        }
        if (updates.role !== undefined && updates.role !== ROLES.SUPERADMIN) {
            if (currentSession.role === ROLES.SUPERADMIN) {
                users[idx].role = updates.role;
            }
        }
        if (updates.permissions !== undefined) {
            users[idx].permissions = updates.permissions;
        }
        // Solo superadmin puede asignar o cambiar vehículos
        if (updates.assignedVehicles !== undefined && currentSession.role === ROLES.SUPERADMIN) {
            users[idx].assignedVehicles = updates.assignedVehicles;
        }
        if (updates.active !== undefined) {
            users[idx].active = updates.active;
        }

        saveUsers(users);
        return { success: true, user: sanitizeUser(users[idx]) };
    }

    function deleteUser(userId) {
        if (!canManageUsers()) return { success: false, error: 'Sin permisos para eliminar usuarios.' };

        var currentSession = getSession();
        const users = getUsers();
        const user = users.find(function(u) { return u.id === userId; });
        if (!user) return { success: false, error: 'Usuario no encontrado.' };
        if (user.role === ROLES.SUPERADMIN) return { success: false, error: 'No se puede eliminar el SuperAdmin.' };
        if (currentSession.role === ROLES.ADMIN && user.role === ROLES.ADMIN) {
            return { success: false, error: 'Los administradores no pueden eliminar a otros administradores.' };
        }

        saveUsers(users.filter(function(u) { return u.id !== userId; }));
        return { success: true };
    }

    function listUsers() {
        if (!canManageUsers()) return [];
        return getUsers().map(sanitizeUser);
    }

    function sanitizeUser(user) {
        var safe = Object.assign({}, user);
        delete safe.password;
        return safe;
    }

    function getPublicUserSummary() {
        return getUsers().map(function(u) {
            return {
                username: u.username,
                displayName: u.displayName || u.username,
                role: u.role,
                active: u.active !== false
            };
        });
    }

    // ─── Gestión de Vehículos ──────────────────────────────────────────────────

    function createVehicle(opts) {
        var plate = opts.plate, alias = opts.alias, type = opts.type, description = opts.description;
        if (!isSuperAdmin()) return { success: false, error: 'Solo el SuperAdministrador puede registrar vehículos.' };

        const vehicles = getVehicles();
        if (vehicles.find(function(v) { return (v.plate || '').toLowerCase() === plate.toLowerCase(); })) {
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
        return { success: true, vehicle: vehicle };
    }

    function updateVehicle(vehicleId, updates) {
        if (!isSuperAdmin()) return { success: false, error: 'Solo el SuperAdministrador puede modificar vehículos.' };

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
        if (!isSuperAdmin()) return { success: false, error: 'Solo el SuperAdministrador puede eliminar vehículos.' };

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
        // Superadmin y admin pueden ver la lista completa
        if (session.role === ROLES.SUPERADMIN || session.role === ROLES.ADMIN) return all;
        // Usuario común solo ve sus vehículos asignados
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
        switchSession: switchSession,
        switchToSuperAdmin: switchToSuperAdmin,
        isLoggedIn: isLoggedIn,
        getSession: getSession,
        hasPermission: hasPermission,
        isSuperAdmin: isSuperAdmin,
        isAdmin: isAdmin,
        canManageUsers: canManageUsers,

        createUser: createUser,
        updateUser: updateUser,
        deleteUser: deleteUser,
        listUsers: listUsers,
        getPublicUserSummary: getPublicUserSummary,

        createVehicle: createVehicle,
        updateVehicle: updateVehicle,
        deleteVehicle: deleteVehicle,
        listVehicles: listVehicles,
        getActiveVehicle: getActiveVehicle,
        setActiveVehicle: setActiveVehicle
    };

})(window);
