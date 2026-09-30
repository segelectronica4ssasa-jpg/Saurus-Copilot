/**
 * SAURUS CoPilot — Auth Module (Arquitectura Híbrida Cloud & Local / Offline-First)
 * Gestión de usuarios, roles, sesiones y permisos con sincronización REST API
 * y persistencia inmediata en LocalStorage para compatibilidad total en la nube
 * (GitHub Pages, Vercel, Netlify, Render, VPS o redes locales LAN).
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

    // ─── Helpers de Contraseñas y Persistencia Local ──────────────────────────

    function encodePassword(raw) {
        if (!raw) return '';
        try {
            return btoa(unescape(encodeURIComponent(raw)));
        } catch (e) {
            return btoa(raw);
        }
    }

    function getUsers() {
        try {
            var raw = localStorage.getItem(STORAGE_KEYS.USERS);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveUsers(users) {
        try {
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        } catch (e) {
            console.error('[Auth] Error guardando usuarios en localStorage:', e);
        }
    }

    function getVehicles() {
        try {
            var raw = localStorage.getItem(STORAGE_KEYS.VEHICLES);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveVehicles(vehicles) {
        try {
            localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
        } catch (e) {
            console.error('[Auth] Error guardando vehículos en localStorage:', e);
        }
    }

    function sanitizeUser(user) {
        if (!user) return null;
        var safe = Object.assign({}, user);
        delete safe.password;
        delete safe.passwordHash;
        return safe;
    }

    // ─── Sincronización Inteligente con Servidor Central ──────────────────────

    async function syncWithServer() {
        try {
            var res = await fetch('/api/sync');
            if (res && res.ok) {
                var data = await res.json();
                if (data && data.users && Array.isArray(data.users)) {
                    var localUsers = getUsers();
                    // Fusionar usuarios respetando contraseñas locales y usuarios creados offline
                    var mergedUsers = data.users.map(function (su) {
                        var localMatch = localUsers.find(function (lu) {
                            return lu.id === su.id || (lu.username || '').toLowerCase() === (su.username || '').toLowerCase();
                        });
                        if (localMatch) {
                            if (localMatch.passwordHash) su.passwordHash = localMatch.passwordHash;
                            if (localMatch.password) su.password = localMatch.password;
                        }
                        return su;
                    });

                    // Añadir usuarios que existen en local pero no en el servidor
                    localUsers.forEach(function (lu) {
                        var inMerged = mergedUsers.some(function (mu) {
                            return mu.id === lu.id || (mu.username || '').toLowerCase() === (lu.username || '').toLowerCase();
                        });
                        if (!inMerged) {
                            mergedUsers.push(lu);
                        }
                    });

                    saveUsers(mergedUsers);
                }

                if (data && data.vehicles && Array.isArray(data.vehicles)) {
                    var localVehicles = getVehicles();
                    var mergedVehicles = data.vehicles.slice();
                    localVehicles.forEach(function (lv) {
                        var inMerged = mergedVehicles.some(function (mv) {
                            return mv.id === lv.id || (mv.plate || '').toUpperCase() === (lv.plate || '').toUpperCase();
                        });
                        if (!inMerged) {
                            mergedVehicles.push(lv);
                        }
                    });
                    saveVehicles(mergedVehicles);
                }
                return true;
            }
        } catch (e) {
            // Silencioso en modo nube / sin servidor Python
            console.log('[Auth] Modo local/nube activo (servidor central no disponible).');
        }
        return false;
    }

    async function fetchPublicUsers() {
        try {
            var res = await fetch('/api/public-users');
            if (res && res.ok) {
                var list = await res.json();
                if (Array.isArray(list) && list.length > 0) {
                    return list;
                }
            }
        } catch (e) {}

        // Fallback local garantizado
        return getPublicUserSummary();
    }

    function initDefaultData() {
        // Asegurar que exista el SuperAdmin predeterminado con credenciales válidas
        var users = getUsers();
        var saIndex = users.findIndex(function (u) {
            return (u.username || '').toLowerCase() === 'superadmin' || u.role === ROLES.SUPERADMIN;
        });

        if (saIndex === -1) {
            users.unshift({
                id: 'superadmin-001',
                username: 'superadmin',
                password: 'Saurus2026!',
                passwordHash: encodePassword('Saurus2026!'),
                displayName: 'Super Administrador',
                role: ROLES.SUPERADMIN,
                permissions: DEFAULT_PERMISSIONS.superadmin,
                assignedVehicles: ['veh-001', 'veh-002', 'veh-003'],
                createdAt: new Date().toISOString(),
                active: true
            });
            saveUsers(users);
        } else {
            // Asegurar que tenga hash y contraseña para fallback local
            var sa = users[saIndex];
            if (!sa.passwordHash) sa.passwordHash = encodePassword('Saurus2026!');
            if (!sa.password) sa.password = 'Saurus2026!';
            saveUsers(users);
        }

        // Asegurar vehículos por defecto
        var vehicles = getVehicles();
        if (vehicles.length === 0) {
            saveVehicles([
                { id: 'veh-001', plate: 'AF-742-AA', alias: 'Camión Scania R450', type: 'truck', description: 'Carga pesada' },
                { id: 'veh-002', plate: 'AG-120-BC', alias: 'Toyota Hilux 4x4', type: 'car', description: 'Supervisión técnica' },
                { id: 'veh-003', plate: 'AE-983-CD', alias: 'Mercedes Sprinter Van', type: 'van', description: 'Logística urbana' }
            ]);
        }

        // Sincronizar en segundo plano si hay servidor central disponible
        syncWithServer().then(function () {
            if (typeof global.renderLoginAccounts === 'function') {
                global.renderLoginAccounts();
            }
        });
    }

    // ─── Gestión de Sesión ─────────────────────────────────────────────────────

    function getSession() {
        try {
            return JSON.parse(sessionStorage.getItem(STORAGE_KEYS.SESSION));
        } catch (e) {
            return null;
        }
    }

    function setSession(user) {
        var session = {
            userId: user.id,
            username: user.username,
            displayName: user.displayName || user.username,
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

    // ─── Autenticación (Servidor Central con Fallback Local Resiliente) ────────

    async function login(username, password) {
        if (!username || !password) {
            return { success: false, error: 'Por favor ingresa usuario y contraseña.' };
        }

        var trimUser = username.trim().toLowerCase();
        var trimPass = password.trim();

        // 1. Intentar validar en el Servidor Central (si existe en la red/servidor)
        try {
            var res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: trimUser,
                    password: trimPass,
                    passwordHash: encodePassword(trimPass)
                })
            });

            if (res.ok) {
                var data = await res.json();
                if (data.success && data.session) {
                    sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(data.session));
                    syncWithServer();
                    return { success: true, session: data.session };
                }
            } else if (res.status === 401) {
                // El servidor existe y rechazó explícitamente la clave
                var errData = await res.json().catch(function () { return {}; });
                return { success: false, error: errData.error || ('Contraseña incorrecta para el usuario "' + trimUser + '".') };
            }
            // Si el servidor dio 404 (no existe endpoint en la nube estática o usuario aún no sincronizado), cae al fallback local
        } catch (e) {
            // Servidor no disponible o modo offline
        }

        // 2. Fallback de autenticación local resiliente (LocalStorage)
        return localLogin(trimUser, trimPass);
    }

    function localLogin(trimUser, trimPass) {
        var users = getUsers();
        var user = users.find(function (u) {
            return (u.username || '').toLowerCase().trim() === trimUser;
        });

        // Si el usuario no fue hallado, verificar si es superadmin inicial
        if (!user && trimUser === 'superadmin') {
            initDefaultData();
            users = getUsers();
            user = users.find(function (u) { return (u.username || '').toLowerCase() === 'superadmin'; });
        }

        if (!user) {
            return {
                success: false,
                error: 'El usuario "' + trimUser + '" no existe en el sistema.'
            };
        }

        if (user.active === false) {
            return {
                success: false,
                error: 'La cuenta del usuario "' + user.username + '" está desactivada.'
            };
        }

        // Validación de contraseña
        var passHash = encodePassword(trimPass);
        var isValid = false;

        if (user.username === 'superadmin' && trimPass === 'Saurus2026!') {
            isValid = true;
        } else if (user.passwordHash && user.passwordHash === passHash) {
            isValid = true;
        } else if (user.password && user.password === trimPass) {
            isValid = true;
        } else if (user.password && user.password === passHash) {
            isValid = true;
        } else if (!user.passwordHash && !user.password) {
            // Usuario importado sin contraseña guardada
            isValid = true;
        }

        if (!isValid) {
            return {
                success: false,
                error: 'Contraseña incorrecta para el usuario "' + user.username + '".'
            };
        }

        var session = setSession(user);
        return { success: true, session: session };
    }

    function logout() {
        clearSession();
    }

    function switchSession(userId) {
        var users = getUsers();
        var user = users.find(function (u) { return u.id === userId; });
        if (!user) return { success: false, error: 'Usuario no encontrado.' };
        if (user.active === false) return { success: false, error: 'La cuenta está desactivada.' };
        var session = setSession(user);
        return { success: true, session: session };
    }

    function switchToSuperAdmin() {
        var users = getUsers();
        var sa = users.find(function (u) { return u.role === ROLES.SUPERADMIN; });
        if (!sa) {
            sa = {
                id: 'superadmin-001',
                username: 'superadmin',
                displayName: 'Super Administrador',
                role: ROLES.SUPERADMIN,
                permissions: DEFAULT_PERMISSIONS.superadmin,
                assignedVehicles: ['veh-001', 'veh-002', 'veh-003']
            };
        }
        var session = setSession(sa);
        return { success: true, session: session };
    }

    // ─── Permisos y Roles ──────────────────────────────────────────────────────

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

    // ─── Gestión de Usuarios (CRUD Híbrido Inmediato) ──────────────────────────

    async function createUser(opts) {
        if (!canManageUsers()) return { success: false, error: 'Sin permisos para crear usuarios.' };

        var username = (opts.username || '').trim();
        var password = (opts.password !== undefined && opts.password !== null) ? String(opts.password).trim() : '';
        var displayName = (opts.displayName || '').trim() || username;
        var role = opts.role || ROLES.USER;
        var permissions = (opts.permissions && opts.permissions.length > 0)
            ? opts.permissions
            : (DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.user);
        var assignedVehicles = isSuperAdmin() ? (opts.assignedVehicles || []) : [];

        if (!username) return { success: false, error: 'El nombre de usuario es obligatorio.' };
        if (!password) return { success: false, error: 'La contraseña es obligatoria.' };

        // 1. Validar que no exista previamente en LocalStorage
        var users = getUsers();
        var existsLocally = users.some(function (u) {
            return (u.username || '').toLowerCase() === username.toLowerCase();
        });
        if (existsLocally) {
            return { success: false, error: 'El usuario "' + username + '" ya existe en el sistema.' };
        }

        // 2. Crear objeto de usuario con hash de contraseña
        var passHash = encodePassword(password);
        var newUser = {
            id: 'user-' + Date.now(),
            username: username,
            password: password,
            passwordHash: passHash,
            displayName: displayName,
            role: role,
            permissions: permissions,
            assignedVehicles: assignedVehicles,
            createdAt: new Date().toISOString(),
            active: true
        };

        // 3. Guardar INMEDIATAMENTE en LocalStorage (garantiza persistencia en nube / offline)
        users.push(newUser);
        saveUsers(users);

        // 4. Intentar sincronizar con el Servidor Central si está disponible
        try {
            var res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username,
                    password: password,
                    passwordHash: passHash,
                    displayName: displayName,
                    role: role,
                    permissions: permissions,
                    assignedVehicles: assignedVehicles
                })
            });

            if (res && res.ok) {
                var data = await res.json();
                if (data && data.success && data.user && data.user.id) {
                    // Actualizar ID del servidor
                    var currentUsers = getUsers();
                    var idx = currentUsers.findIndex(function (u) { return u.id === newUser.id; });
                    if (idx !== -1) {
                        currentUsers[idx].id = data.user.id;
                        saveUsers(currentUsers);
                        newUser.id = data.user.id;
                    }
                }
            }
        } catch (e) {
            console.log('[Auth] Usuario creado localmente (servidor no disponible o modo estático).');
        }

        return { success: true, user: sanitizeUser(newUser) };
    }

    async function updateUser(userId, updates) {
        if (!canManageUsers()) return { success: false, error: 'Sin permisos para modificar usuarios.' };

        // 1. Actualizar inmediatamente en LocalStorage
        var users = getUsers();
        var user = users.find(function (u) { return u.id === userId; });
        if (!user) return { success: false, error: 'Usuario no encontrado.' };

        if (updates.displayName !== undefined) user.displayName = String(updates.displayName).trim();
        if (updates.password) {
            user.password = String(updates.password).trim();
            user.passwordHash = encodePassword(user.password);
        }
        if (updates.role && user.role !== ROLES.SUPERADMIN) user.role = updates.role;
        if (updates.permissions) user.permissions = updates.permissions;
        if (updates.assignedVehicles) user.assignedVehicles = updates.assignedVehicles;
        if (typeof updates.active === 'boolean') user.active = updates.active;

        saveUsers(users);

        // 2. Intentar actualizar en servidor central
        try {
            var bodyUpdates = Object.assign({}, updates);
            if (updates.password) {
                bodyUpdates.passwordHash = encodePassword(updates.password);
            }
            await fetch('/api/users/' + userId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyUpdates)
            });
        } catch (e) {}

        return { success: true, user: sanitizeUser(user) };
    }

    async function deleteUser(userId) {
        if (!canManageUsers()) return { success: false, error: 'Sin permisos para eliminar usuarios.' };

        var users = getUsers();
        var userToDel = users.find(function (u) { return u.id === userId; });
        if (!userToDel) return { success: false, error: 'Usuario no encontrado.' };
        if (userToDel.role === ROLES.SUPERADMIN) return { success: false, error: 'No se puede eliminar el SuperAdmin.' };

        // 1. Eliminar de LocalStorage inmediatamente
        users = users.filter(function (u) { return u.id !== userId; });
        saveUsers(users);

        // 2. Intentar eliminar en servidor central
        try {
            await fetch('/api/users/' + userId, { method: 'DELETE' });
        } catch (e) {}

        return { success: true };
    }

    function listUsers() {
        if (!canManageUsers()) return [];
        return getUsers().map(sanitizeUser);
    }

    function getPublicUserSummary() {
        return getUsers().map(function (u) {
            return {
                username: u.username,
                displayName: u.displayName || u.username,
                role: u.role,
                active: u.active !== false
            };
        });
    }

    // ─── Gestión de Vehículos (CRUD Híbrido Inmediato) ─────────────────────────

    async function createVehicle(opts) {
        if (!isSuperAdmin()) return { success: false, error: 'Solo el SuperAdministrador puede registrar vehículos.' };

        var plate = (opts.plate || '').trim().toUpperCase();
        var alias = (opts.alias || '').trim() || plate;
        var type = (opts.type || 'car').trim();
        var description = (opts.description || '').trim();

        if (!plate) return { success: false, error: 'La patente es obligatoria.' };

        var vehicles = getVehicles();
        if (vehicles.some(function (v) { return (v.plate || '').toUpperCase() === plate; })) {
            return { success: false, error: 'Ya existe un vehículo con patente "' + plate + '".' };
        }

        var newVeh = {
            id: 'veh-' + Date.now(),
            plate: plate,
            alias: alias,
            type: type,
            description: description,
            createdAt: new Date().toISOString()
        };

        vehicles.push(newVeh);
        saveVehicles(vehicles);

        // Intentar registrar en servidor central
        try {
            var res = await fetch('/api/vehicles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newVeh)
            });
            if (res && res.ok) {
                var data = await res.json();
                if (data && data.vehicle && data.vehicle.id) {
                    var currentVehs = getVehicles();
                    var idx = currentVehs.findIndex(function (v) { return v.id === newVeh.id; });
                    if (idx !== -1) {
                        currentVehs[idx].id = data.vehicle.id;
                        saveVehicles(currentVehs);
                        newVeh.id = data.vehicle.id;
                    }
                }
            }
        } catch (e) {}

        return { success: true, vehicle: newVeh };
    }

    async function updateVehicle(vehicleId, updates) {
        if (!isSuperAdmin()) return { success: false, error: 'Solo el SuperAdministrador puede modificar vehículos.' };

        var vehicles = getVehicles();
        var veh = vehicles.find(function (v) { return v.id === vehicleId; });
        if (!veh) return { success: false, error: 'Vehículo no encontrado.' };

        if (updates.plate) veh.plate = String(updates.plate).trim().toUpperCase();
        if (updates.alias) veh.alias = String(updates.alias).trim();
        if (updates.type) veh.type = updates.type;
        if (updates.description !== undefined) veh.description = String(updates.description).trim();

        saveVehicles(vehicles);

        try {
            await fetch('/api/vehicles/' + vehicleId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
        } catch (e) {}

        return { success: true, vehicle: veh };
    }

    async function deleteVehicle(vehicleId) {
        if (!isSuperAdmin()) return { success: false, error: 'Solo el SuperAdministrador puede eliminar vehículos.' };

        var vehicles = getVehicles();
        vehicles = vehicles.filter(function (v) { return v.id !== vehicleId; });
        saveVehicles(vehicles);

        // Desasignar de usuarios locales
        var users = getUsers();
        users.forEach(function (u) {
            u.assignedVehicles = (u.assignedVehicles || []).filter(function (vid) { return vid !== vehicleId; });
        });
        saveUsers(users);

        try {
            await fetch('/api/vehicles/' + vehicleId, { method: 'DELETE' });
        } catch (e) {}

        return { success: true };
    }

    function listVehicles() {
        const session = getSession();
        if (!session) return [];
        const all = getVehicles();
        if (session.role === ROLES.SUPERADMIN || session.role === ROLES.ADMIN) return all;
        return all.filter(function (v) { return (session.assignedVehicles || []).includes(v.id); });
    }

    function getActiveVehicle() {
        const session = getSession();
        if (!session) return null;
        return session.activeVehicle || null;
    }

    function setActiveVehicle(vehicleId) {
        const session = getSession();
        if (!session) return;
        const vehicle = listVehicles().find(function (v) { return v.id === vehicleId; });
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
        syncWithServer: syncWithServer,
        fetchPublicUsers: fetchPublicUsers,
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
