/**
 * ApexDash Telemetry - Main Application Orchestrator
 * Connects HUD, Map, Gauges, Timeline Scrubber, Incident Management and File Importers.
 * Auth integration: SaurusAuth + SaurusAdminPanel
 */

document.addEventListener('DOMContentLoaded', function () {

    // ─── 0. Inicializar sistema de Auth ───────────────────────────────────────
    SaurusAuth.init();

    // Inicializar panel admin (inserta el modal en el DOM)
    SaurusAdminPanel.init();

    // ─── 0a. Auth Guard — verificar sesión ────────────────────────────────────
    var overlay = document.getElementById('auth-login-overlay');
    var loginBtn = document.getElementById('btn-do-login');
    var loginUsername = document.getElementById('login-username');
    var loginPassword = document.getElementById('login-password');
    var loginError = document.getElementById('login-error-msg');

    async function renderLoginAccounts() {
        var container = document.getElementById('auth-quick-accounts');
        if (!container) return;

        var list = [];
        if (SaurusAuth.fetchPublicUsers) {
            list = await SaurusAuth.fetchPublicUsers();
        } else if (SaurusAuth.getPublicUserSummary) {
            list = SaurusAuth.getPublicUserSummary();
        }

        if (!list || list.length === 0) {
            container.innerHTML = '';
            return;
        }

        var chipsHtml = list.map(function (u) {
            var roleMap = { superadmin: 'SuperAdmin', admin: 'Admin', user: 'Usuario' };
            var roleLabel = roleMap[u.role] || u.role;
            return '<div class="auth-user-chip-wrap">' +
                '<button type="button" class="auth-user-chip ' + (u.active ? '' : 'inactive') + '" data-user="' + u.username + '" title="Rellenar usuario">' +
                '<span>👤 ' + u.username + '</span>' +
                '<small>(' + roleLabel + ')</small>' +
                '</button>' +
                '<button type="button" class="auth-chip-quick-btn" data-direct="' + u.username + '" title="Entrar directamente con esta cuenta">⚡ Entrar</button>' +
                '</div>';
        }).join('');

        container.innerHTML = '<div class="auth-quick-title">Cuentas registradas (clic para rellenar o botón para entrar):</div>' +
            '<div class="auth-quick-chips">' + chipsHtml + '</div>';

        container.querySelectorAll('.auth-user-chip').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var uname = btn.dataset.user;
                if (loginUsername) {
                    loginUsername.value = uname;
                    if (loginPassword) {
                        loginPassword.value = '';
                        loginPassword.focus();
                    }
                }
            });
        });

        container.querySelectorAll('.auth-chip-quick-btn').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                var uname = btn.dataset.direct;
                if (SaurusAuth.syncWithServer) await SaurusAuth.syncWithServer();
                var allUsers = JSON.parse(localStorage.getItem('saurus_users') || '[]');
                var uObj = allUsers.find(function (x) { return (x.username || '').toLowerCase() === uname.toLowerCase(); });
                if (uObj) {
                    var res = SaurusAuth.switchSession(uObj.id);
                    if (res.success) {
                        if (overlay) {
                            overlay.classList.add('auth-fade-out');
                            setTimeout(function () { overlay.style.display = 'none'; }, 420);
                        }
                        updateAuthUI();
                        updateVehicleDashboardHeader();
                        if (window.showNotification) {
                            window.showNotification('Acceso exitoso: ' + res.session.displayName + ' (' + res.session.role + ')', 'success');
                        }
                    }
                }
            });
        });
    }

    window.renderLoginAccounts = renderLoginAccounts;
    renderLoginAccounts();

    async function attemptLogin() {
        var u = loginUsername ? loginUsername.value : '';
        var p = loginPassword ? loginPassword.value : '';
        if (loginBtn) loginBtn.disabled = true;
        if (loginError) loginError.classList.remove('visible');

        var result = await SaurusAuth.login(u, p);
        if (result.success) {
            if (loginBtn) loginBtn.disabled = false;
            if (overlay) {
                overlay.classList.add('auth-fade-out');
                setTimeout(function () {
                    overlay.style.display = 'none';
                }, 420);
            }
            updateAuthUI();
            updateVehicleDashboardHeader();
        } else {
            if (loginError) {
                loginError.textContent = result.error || 'Credenciales incorrectas.';
                loginError.classList.add('visible');
            }
            if (loginPassword) {
                loginPassword.value = '';
                loginPassword.focus();
            }
            renderLoginAccounts();
            setTimeout(function () { if (loginBtn) loginBtn.disabled = false; }, 400);
        }
    }

    if (loginBtn) loginBtn.addEventListener('click', attemptLogin);

    // Login con Enter
    [loginUsername, loginPassword].forEach(function (el) {
        if (el) el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') attemptLogin();
        });
    });

    // Si ya hay sesión activa, ocultar overlay directamente
    if (SaurusAuth.isLoggedIn()) {
        if (overlay) overlay.style.display = 'none';
        updateAuthUI();
        updateVehicleDashboardHeader();
    }

    // ─── 0b. UI de Auth: Badge de usuario y controles ────────────────────────
    function updateAuthUI() {
        var session = SaurusAuth.getSession();
        if (!session) return;

        // Actualizar badge
        var badgeName = document.getElementById('auth-badge-name');
        var badgeRole = document.getElementById('auth-badge-role');
        var badgeInitials = document.getElementById('auth-badge-initials');

        if (badgeName) badgeName.textContent = session.displayName || session.username;
        if (badgeRole) {
            var roleMap = { superadmin: 'SuperAdmin', admin: 'Admin', user: 'Usuario' };
            badgeRole.textContent = roleMap[session.role] || session.role;
            badgeRole.className = 'auth-badge-role role-' + session.role;
        }
        if (badgeInitials) {
            var name = session.displayName || session.username;
            var parts = name.split(' ');
            var initials = parts.length >= 2
                ? parts[0][0] + parts[1][0]
                : name.substring(0, 2);
            badgeInitials.textContent = initials.toUpperCase();
        }

        // Mostrar panel admin si es SuperAdmin o Admin
        var adminBtn = document.getElementById('btn-open-admin-panel');
        if (adminBtn) adminBtn.style.display = SaurusAuth.canManageUsers() ? 'flex' : 'none';

        // Mostrar botón para regresar a SuperAdmin si estamos en otro usuario
        var switchBackBtn = document.getElementById('btn-switch-superadmin');
        if (switchBackBtn) switchBackBtn.style.display = (session.role !== 'superadmin') ? 'flex' : 'none';

        // Actualizar selector de vehículo
        SaurusAdminPanel.updateVehicleSelector();

        // Aplicar permisos a controles del dashboard
        applyPermissions(session);
    }

    function updateVehicleDashboardHeader() {
        var v = SaurusAuth.getActiveVehicle();
        var iconEl = document.getElementById('trip-icon-badge');
        var titleEl = document.getElementById('route-title');
        if (!v) {
            var vehicles = SaurusAuth.listVehicles();
            if (vehicles.length > 0) {
                v = vehicles[0];
                SaurusAuth.setActiveVehicle(v.id);
            }
        }
        if (v) {
            var iconMap = { car: '🚗', truck: '🚛', van: '🚐', motorcycle: '🏍', bus: '🚌' };
            if (iconEl) iconEl.textContent = iconMap[v.type] || '🚗';
            if (titleEl) titleEl.textContent = v.plate + ' (' + v.alias + ') — Monitoreo Activo';
        } else {
            if (titleEl) titleEl.textContent = 'Sin Vehículo Asignado';
        }
    }

    function applyPermissions(session) {
        // Cargar telemetría
        var fileInput = document.getElementById('file-input');
        var fileLabel = fileInput ? fileInput.previousElementSibling : null;
        var canUploadTelemetry = SaurusAuth.hasPermission('upload_telemetry');
        if (fileInput) fileInput.disabled = !canUploadTelemetry;
        if (fileLabel) {
            fileLabel.style.opacity = canUploadTelemetry ? '1' : '0.35';
            fileLabel.style.pointerEvents = canUploadTelemetry ? '' : 'none';
        }

        // Cargar video
        var videoInput = document.getElementById('video-input');
        var videoLabel = videoInput ? videoInput.previousElementSibling : null;
        var canUploadVideo = SaurusAuth.hasPermission('upload_video');
        if (videoInput) videoInput.disabled = !canUploadVideo;
        if (videoLabel) {
            videoLabel.style.opacity = canUploadVideo ? '1' : '0.35';
            videoLabel.style.pointerEvents = canUploadVideo ? '' : 'none';
        }

        // Exportar reporte
        var reportBtn = document.getElementById('btn-export-report');
        var canExport = SaurusAuth.hasPermission('export_report');
        if (reportBtn) {
            reportBtn.disabled = !canExport;
            reportBtn.style.opacity = canExport ? '1' : '0.35';
        }

        // Cambiar escenario
        var scenarioSel = document.getElementById('scenario-select');
        var canScenario = SaurusAuth.hasPermission('change_scenario');
        if (scenarioSel) {
            scenarioSel.disabled = !canScenario;
            scenarioSel.style.opacity = canScenario ? '1' : '0.35';
        }

        // Cambiar unidades
        var unitSwitcher = document.getElementById('unit-switcher');
        var canUnits = SaurusAuth.hasPermission('switch_units');
        if (unitSwitcher) {
            unitSwitcher.querySelectorAll('button').forEach(function (btn) {
                btn.disabled = !canUnits;
            });
            unitSwitcher.style.opacity = canUnits ? '1' : '0.35';
        }
    }

    // ─── 0c. Dropdown del badge ────────────────────────────────────────────────
    var badgeEl = document.getElementById('auth-user-badge');
    var dropdown = document.getElementById('auth-badge-dropdown');

    if (badgeEl && dropdown) {
        badgeEl.addEventListener('click', function (e) {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });
        document.addEventListener('click', function () {
            dropdown.classList.remove('open');
        });
    }

    // Abrir panel admin
    var adminPanelBtn = document.getElementById('btn-open-admin-panel');
    if (adminPanelBtn) {
        adminPanelBtn.addEventListener('click', function () {
            dropdown.classList.remove('open');
            SaurusAdminPanel.open();
        });
    }

    // Logout
    var logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
            SaurusAuth.logout();
            location.reload();
        });
    }

    // Volver a SuperAdmin rápidamente
    var switchBackBtn = document.getElementById('btn-switch-superadmin');
    if (switchBackBtn) {
        switchBackBtn.addEventListener('click', function () {
            dropdown.classList.remove('open');
            var res = SaurusAuth.switchToSuperAdmin();
            if (res.success) {
                updateAuthUI();
                updateVehicleDashboardHeader();
                if (window.showNotification) {
                    window.showNotification('Has vuelto a SuperAdministrador', 'info');
                }
            } else {
                alert(res.error || 'No se pudo cambiar a SuperAdmin.');
            }
        });
    }

    // Selector de vehículo activo
    var vehicleSelect = document.getElementById('auth-vehicle-select');
    if (vehicleSelect) {
        vehicleSelect.addEventListener('change', function () {
            SaurusAuth.setActiveVehicle(vehicleSelect.value);
            updateVehicleDashboardHeader();
            var v = SaurusAuth.getActiveVehicle();
            if (v && window.showNotification) {
                window.showNotification('Vehículo activo: ' + v.plate + ' (' + v.alias + ')', 'info');
            }
        });
    }


    // 1. Instantiate Core Engine
    const engine = new TelemetryEngine();

    // 2. Instantiate Dashcam HUD Overlay & Multi-Camera Engine
    const dashcamCanvas = document.getElementById('dashcam-canvas');
    const dashcamVideo = document.getElementById('dashcam-video');
    const hud = new DashcamHudOverlay(dashcamCanvas, dashcamVideo, engine);

    const multiCamCanvases = {
        front: dashcamCanvas,
        rear: document.getElementById('rear-canvas'),
        left: document.getElementById('left-canvas'),
        right: document.getElementById('right-canvas'),
        dms: document.getElementById('dms-canvas')
    };

    let multiCam = null;
    if (window.MultiCameraEngine) {
        multiCam = new MultiCameraEngine(multiCamCanvases, hud, engine);
    }

    // 3. Instantiate Cockpit Gauges & G-Force
    const speedCanvas = document.getElementById('speed-gauge-canvas');
    const gForceCanvas = document.getElementById('g-force-canvas');
    const gauges = new CockpitGauges(speedCanvas, gForceCanvas, engine);

    // 4. Instantiate Map
    const mapModule = new TelemetryMapModule('gps-map-container', engine);

    // 5. Multi-Camera Viewport Controller & Window Selection
    const multicamContainer = document.getElementById('multicam-container');
    const camViewBtns = document.querySelectorAll('.cam-view-btn');
    const camWindows = document.querySelectorAll('.cam-window');
    const btnAudioToggle = document.getElementById('btn-cam-audio-toggle');
    const audioLabel = document.getElementById('cam-audio-label');
    const btnFullscreen = document.getElementById('btn-cam-fullscreen');

    function selectCameraView(mode) {
        if (!multiCam) return;
        multiCam.setViewMode(mode);

        // Update toolbar active state
        camViewBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === mode);
        });

        // Update window active highlighting
        camWindows.forEach(win => {
            if (mode === 'grid') {
                win.classList.toggle('is-primary', win.dataset.cam === 'front');
                win.classList.remove('is-focused');
            } else {
                const isMatch = win.dataset.cam === mode;
                win.classList.toggle('is-primary', isMatch);
                win.classList.toggle('is-focused', isMatch);
            }
        });

        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 60);
    }

    // Connect View Mode Buttons
    camViewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectCameraView(btn.dataset.view);
        });
    });

    // Connect Click on Each Camera Window to Focus/Maximize it
    camWindows.forEach(win => {
        win.addEventListener('click', (e) => {
            // Prevent duplicate clicks from buttons inside
            const camKey = win.dataset.cam;
            if (camKey) {
                selectCameraView(camKey);
            }
        });

        win.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectCameraView(win.dataset.cam);
            }
        });
    });

    // Audio Alarm Toggle
    if (btnAudioToggle && multiCam) {
        btnAudioToggle.addEventListener('click', () => {
            const enabled = multiCam.toggleAudio();
            btnAudioToggle.classList.toggle('active', enabled);
            if (audioLabel) {
                audioLabel.textContent = enabled ? 'Alarma ON' : 'Alarma OFF';
            }
            showNotification(enabled ? 'Alarmas acústicas DMS/ADAS activadas' : 'Alarmas acústicas silenciadas', 'info');
        });
    }

    // Fullscreen Toggle
    if (btnFullscreen && multicamContainer) {
        btnFullscreen.addEventListener('click', () => {
            multicamContainer.classList.toggle('is-fullscreen');
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 80);
        });
    }

    // 6. Timeline Scrubber Elements
    const timelineCanvas = document.getElementById('timeline-chart-canvas');
    const timelineProgress = document.getElementById('timeline-progress');
    const timelinePlayhead = document.getElementById('timeline-playhead');
    const timelineContainer = document.getElementById('timeline-container');
    const timeDisplay = document.getElementById('time-display-val');
    const timeDurationDisplay = document.getElementById('time-duration-val');

    // Controls
    const btnPlay = document.getElementById('btn-play');
    const btnPlayIcon = document.getElementById('btn-play-icon');
    const btnPrevIncident = document.getElementById('btn-prev-incident');
    const btnNextIncident = document.getElementById('btn-next-incident');
    const btnRecenterMap = document.getElementById('btn-map-recenter');
    const rateBtns = document.querySelectorAll('.rate-btn');
    const unitBtns = document.querySelectorAll('.unit-btn');
    const scenarioSelect = document.getElementById('scenario-select');
    const fileInput = document.getElementById('file-input');
    const videoInput = document.getElementById('video-input');

    // Expose globally for inline callbacks & debugging
    window.apexApp = {
        engine,
        hud,
        multiCam,
        gauges,
        mapModule,
        selectCameraView,
        openClipViewer,
        copyClipLink,
        exportReportToCsv
    };

    // -------------------------------------------------------------
    // Scenario Loading & Selector
    // -------------------------------------------------------------
    const scenarios = TelemetryDatasetProvider.getScenarios();
    if (scenarioSelect) {
        scenarioSelect.innerHTML = scenarios.map(sc => `
            <option value="${sc.id}">${sc.icon} ${sc.name} (${sc.duration}s)</option>
        `).join('');

        scenarioSelect.addEventListener('change', (e) => {
            loadScenario(e.target.value);
        });
    }

    function loadScenario(scenarioId) {
        const sc = scenarios.find(s => s.id === scenarioId) || scenarios[0];
        const data = sc.generate();
        engine.loadDataset(data, sc.name);

        // Update trip meta UI
        const routeTitle = document.getElementById('route-title');
        const routeLocation = document.getElementById('route-location');
        const scoreBadge = document.getElementById('safety-score-val');
        const scoreGrade = document.getElementById('safety-score-grade');

        if (routeTitle) routeTitle.textContent = sc.name;
        if (routeLocation) routeLocation.textContent = sc.locationName;
        if (scoreBadge) scoreBadge.textContent = sc.score;
        if (scoreGrade) scoreGrade.textContent = sc.safetyGrade;

        renderIncidentTable(data.incidents || []);
        renderTimelineChart(data);
    }

    // -------------------------------------------------------------
    // Playback Controls
    // -------------------------------------------------------------
    btnPlay.addEventListener('click', () => engine.togglePlay());

    engine.on('play', () => {
        btnPlayIcon.innerHTML = `
            <rect x="6" y="4" width="4" height="16" fill="currentColor"></rect>
            <rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>
        `;
        btnPlay.classList.add('playing');
    });

    engine.on('pause', () => {
        btnPlayIcon.innerHTML = `
            <polygon points="5,3 19,12 5,21" fill="currentColor"></polygon>
        `;
        btnPlay.classList.remove('playing');
    });

    btnPrevIncident.addEventListener('click', () => engine.jumpPrevIncident());
    btnNextIncident.addEventListener('click', () => engine.jumpNextIncident());

    if (btnRecenterMap) {
        btnRecenterMap.addEventListener('click', () => mapModule.recenter());
    }

    rateBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            rateBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            engine.setPlaybackRate(parseFloat(btn.dataset.rate));
        });
    });

    unitBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            unitBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            engine.setUnitSystem(btn.dataset.unit);
        });
    });

    // Keyboard Shortcuts (Space = Play/Pause, Arrows = Seek, I = Next Incident)
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        if (e.code === 'Space') {
            e.preventDefault();
            engine.togglePlay();
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            engine.seekRelative(-5);
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            engine.seekRelative(5);
        } else if (e.code === 'KeyN') {
            engine.jumpNextIncident();
        } else if (e.code === 'KeyP') {
            engine.jumpPrevIncident();
        } else if (e.code === 'Digit1') {
            selectCameraView('front');
        } else if (e.code === 'Digit2') {
            selectCameraView('rear');
        } else if (e.code === 'Digit3') {
            selectCameraView('left');
        } else if (e.code === 'Digit4') {
            selectCameraView('right');
        } else if (e.code === 'Digit5') {
            selectCameraView('dms');
        } else if (e.code === 'Digit0' || e.code === 'KeyG') {
            selectCameraView('grid');
        }
    });

    // -------------------------------------------------------------
    // Timeline Scrubber & Canvas Curves
    // -------------------------------------------------------------
    let isDraggingTimeline = false;

    function handleTimelineSeek(e) {
        const rect = timelineContainer.getBoundingClientRect();
        const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const percent = clickX / rect.width;
        engine.seek(percent * engine.duration);
    }

    timelineContainer.addEventListener('mousedown', (e) => {
        isDraggingTimeline = true;
        handleTimelineSeek(e);
    });

    window.addEventListener('mousemove', (e) => {
        if (isDraggingTimeline) {
            handleTimelineSeek(e);
        }
    });

    window.addEventListener('mouseup', () => {
        isDraggingTimeline = false;
    });

    // Engine Frame updates timeline UI
    engine.on('frame', (frame) => {
        // Scrubber progress
        const pct = frame.progressPercent;
        timelineProgress.style.width = `${pct}%`;
        timelinePlayhead.style.left = `${pct}%`;

        // Time strings
        const curM = Math.floor(frame.time / 60).toString().padStart(2, '0');
        const curS = Math.floor(frame.time % 60).toString().padStart(2, '0');
        const curMs = Math.floor((frame.time % 1) * 10).toString();
        timeDisplay.textContent = `${curM}:${curS}.${curMs}`;

        const durM = Math.floor(engine.duration / 60).toString().padStart(2, '0');
        const durS = Math.floor(engine.duration % 60).toString().padStart(2, '0');
        timeDurationDisplay.textContent = `${durM}:${durS}`;
    });

    function renderTimelineChart(dataset) {
        if (!timelineCanvas || !dataset.points) return;
        const ctx = timelineCanvas.getContext('2d');
        const rect = timelineCanvas.getBoundingClientRect();

        timelineCanvas.width = Math.round(rect.width * window.devicePixelRatio || 1);
        timelineCanvas.height = Math.round(rect.height * window.devicePixelRatio || 1);

        const w = timelineCanvas.width;
        const h = timelineCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const points = dataset.points;
        const maxSpeed = 160;

        // 1. Draw Speed Area Curve (Cyan)
        ctx.fillStyle = 'rgba(0, 242, 254, 0.15)';
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 1.8;

        ctx.beginPath();
        ctx.moveTo(0, h);
        points.forEach(pt => {
            const x = (pt.time / dataset.totalDuration) * w;
            const y = h - (Math.min(1.0, pt.speed / maxSpeed) * (h * 0.85));
            ctx.lineTo(x, y);
        });
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        points.forEach((pt, i) => {
            const x = (pt.time / dataset.totalDuration) * w;
            const y = h - (Math.min(1.0, pt.speed / maxSpeed) * (h * 0.85));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 2. Draw Harsh Braking / G-force Spikes (Red Zones)
        dataset.incidents.forEach(inc => {
            const incX = (inc.time / dataset.totalDuration) * w;
            const isCrit = inc.severity === 'CRITICAL';

            ctx.fillStyle = isCrit ? 'rgba(255, 51, 102, 0.4)' : 'rgba(255, 183, 3, 0.35)';
            ctx.fillRect(incX - 3, 0, 6, h);

            ctx.fillStyle = isCrit ? '#ff3366' : '#ffb703';
            ctx.beginPath();
            ctx.arc(incX, 10, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // -------------------------------------------------------------
    // Incident Table & Driving Events Log
    // -------------------------------------------------------------
    function renderIncidentTable(incidents) {
        const tableBody = document.getElementById('incident-table-body');
        const countBadge = document.getElementById('incident-count-badge');
        if (!tableBody) return;

        if (countBadge) countBadge.textContent = `${incidents.length} Eventos`;

        if (incidents.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="table-empty">No se detectaron infracciones ni eventos de riesgo en este tramo.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = incidents.map((inc, idx) => {
            const isCritical = inc.severity === 'CRITICAL';
            const badgeClass = isCritical ? 'badge-critical' : 'badge-warning';
            const icon = isCritical ? '🚨' : '⚠️';

            return `
                <tr class="incident-row" onclick="window.apexApp.engine.jumpToIncident(${idx})">
                    <td class="col-time">
                        <span class="incident-timestamp">${inc.time.toFixed(1)}s</span>
                    </td>
                    <td>
                        <span class="incident-badge ${badgeClass}">${icon} ${inc.type.replace(/_/g, ' ')}</span>
                    </td>
                    <td class="col-desc">${inc.message}</td>
                    <td class="col-val font-mono">${inc.value}</td>
                    <td class="col-action" style="display: flex; gap: 6px; align-items: center;">
                        <button class="btn-table-replay" title="Reproducir este incidente">
                            <svg viewBox="0 0 24 24" width="14" height="14"><polygon points="5,3 19,12 5,21" fill="currentColor"></polygon></svg>
                            Replay
                        </button>
                        <button class="btn-clip-icon" onclick="event.stopPropagation(); window.apexApp.openClipViewer(${idx});" title="Ver clip de video y gestionar enlace de la alerta">
                            🎬
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // -------------------------------------------------------------
    // File Importers (Telemetry JSON/GPX/CSV and Custom MP4 Video)
    // -------------------------------------------------------------
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const loaded = await engine.importFromFile(file);
                if (loaded) {
                    showNotification(`Archivo de telemetría "${file.name}" cargado con éxito.`, 'success');
                    renderIncidentTable(engine.data.incidents || []);
                    renderTimelineChart(engine.data);
                    const routeTitle = document.getElementById('route-title');
                    if (routeTitle) routeTitle.textContent = `Archivo: ${file.name}`;
                }
            } catch (err) {
                alert(`Error al importar: ${err.message}`);
            }
        });
    }

    if (videoInput) {
        videoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            hud.loadCustomVideoFile(file);
            showNotification(`Video MP4 "${file.name}" vinculado a la telemetría.`, 'success');
            const videoStatusBadge = document.getElementById('video-source-badge');
            if (videoStatusBadge) videoStatusBadge.textContent = 'VIDEO LOCAL SINCRONIZADO';
        });
    }

    // Drag and drop onto dashcam viewport
    const viewport = document.getElementById('dashcam-viewport');
    if (viewport) {
        viewport.addEventListener('dragover', (e) => {
            e.preventDefault();
            viewport.classList.add('drag-over');
        });
        viewport.addEventListener('dragleave', () => {
            viewport.classList.remove('drag-over');
        });
        viewport.addEventListener('drop', async (e) => {
            e.preventDefault();
            viewport.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (!files || files.length === 0) return;

            for (let f of files) {
                const ext = f.name.split('.').pop().toLowerCase();
                if (['mp4', 'webm', 'mov'].includes(ext)) {
                    hud.loadCustomVideoFile(f);
                    showNotification(`Video cargado: ${f.name}`, 'success');
                } else if (['json', 'gpx', 'csv'].includes(ext)) {
                    await engine.importFromFile(f);
                    renderIncidentTable(engine.data.incidents || []);
                    renderTimelineChart(engine.data);
                    showNotification(`Telemetría cargada: ${f.name}`, 'success');
                }
            }
        });
    }

    // -------------------------------------------------------------
    // ADAS HUD Toggles (HUD Settings)
    // -------------------------------------------------------------
    const toggleBoxes = document.getElementById('toggle-adas-boxes');
    const toggleLanes = document.getElementById('toggle-adas-lanes');
    const toggleHorizon = document.getElementById('toggle-adas-horizon');
    const toggleBio = document.getElementById('toggle-dms-bio');
    const toggleBsd = document.getElementById('toggle-bsd-radars');
    const toggleRearGuides = document.getElementById('toggle-rear-guides');

    if (toggleBoxes) toggleBoxes.addEventListener('change', (e) => hud.showAdasBoxes = e.target.checked);
    if (toggleLanes) toggleLanes.addEventListener('change', (e) => hud.showLaneTracking = e.target.checked);
    if (toggleHorizon) toggleHorizon.addEventListener('change', (e) => hud.showArtificialHorizon = e.target.checked);
    if (toggleBio) toggleBio.addEventListener('change', (e) => { if (multiCam) multiCam.showBiometrics = e.target.checked; });
    if (toggleBsd) toggleBsd.addEventListener('change', (e) => { if (multiCam) multiCam.showBsdRadars = e.target.checked; });
    if (toggleRearGuides) toggleRearGuides.addEventListener('change', (e) => { if (multiCam) multiCam.showRearGuides = e.target.checked; });

    // -------------------------------------------------------------
    // Incident Report Modal & Video Clip Evidence System
    // -------------------------------------------------------------
    const btnExportReport = document.getElementById('btn-export-report');
    const modalReport = document.getElementById('report-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnPrintReport = document.getElementById('btn-print-report');
    const btnExportCsv = document.getElementById('btn-export-csv');

    // Clip Viewer Modal Elements
    const modalClip = document.getElementById('clip-viewer-modal');
    const btnCloseClipModal = document.getElementById('btn-close-clip-modal');
    const btnClipPlayPause = document.getElementById('btn-clip-play-pause');
    const btnClipLoop = document.getElementById('btn-clip-loop');
    const btnClipSeekMain = document.getElementById('btn-clip-seek-main');
    const clipTimeWindowBadge = document.getElementById('clip-time-window-badge');
    const clipWatermarkTime = document.getElementById('clip-watermark-time');
    const clipWatermarkTag = document.getElementById('clip-watermark-tag');
    const clipSourceBadge = document.getElementById('clip-source-badge');
    const clipUrlInput = document.getElementById('clip-url-input');
    const btnSaveClipUrl = document.getElementById('btn-save-clip-url');
    const btnCopyClipUrl = document.getElementById('btn-copy-clip-url');
    const clipLocalFileInput = document.getElementById('clip-local-file-input');
    const btnResetClipUrl = document.getElementById('btn-reset-clip-url');
    const clipVideoEl = document.getElementById('clip-video-element');
    const clipCanvasPreview = document.getElementById('clip-canvas-preview');
    const clipPlayIcon = document.getElementById('clip-play-icon');
    const clipPlayLabel = document.getElementById('clip-play-label');
    const clipLoopLabel = document.getElementById('clip-loop-label');

    let activeClipIncidentIndex = -1;
    let clipAnimationId = null;
    let isClipPlaying = false;
    let isClipLoop = true;
    let clipSimTime = 0;

    if (btnExportReport && modalReport) {
        btnExportReport.addEventListener('click', () => {
            populateReportModal();
            modalReport.classList.add('active');
        });
    }

    if (btnCloseModal && modalReport) {
        btnCloseModal.addEventListener('click', () => {
            modalReport.classList.remove('active');
        });
    }

    if (btnPrintReport) {
        btnPrintReport.addEventListener('click', () => {
            window.print();
        });
    }

    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            exportReportToCsv();
        });
    }

    function populateReportModal() {
        const curData = engine.data;
        if (!curData) return;

        const maxSpeed = curData.points && curData.points.length > 0 ? Math.max(...curData.points.map(p => p.speed)) : 0;
        const avgSpeed = curData.points && curData.points.length > 0 ? curData.points.reduce((acc, p) => acc + p.speed, 0) / curData.points.length : 0;
        const harshBrakes = (curData.incidents || []).filter(i => (i.type || '').includes('BRAK')).length;
        const ldwAlerts = (curData.incidents || []).filter(i => (i.type || '').includes('LANE')).length;

        document.getElementById('rep-total-time').textContent = `${curData.totalDuration || 0} seg`;
        document.getElementById('rep-max-speed').textContent = `${Math.round(maxSpeed)} km/h`;
        document.getElementById('rep-avg-speed').textContent = `${Math.round(avgSpeed)} km/h`;
        document.getElementById('rep-harsh-brakes').textContent = harshBrakes;
        document.getElementById('rep-lane-departures').textContent = ldwAlerts;

        const repTable = document.getElementById('rep-incidents-table');
        if (repTable) {
            if (!curData.incidents || curData.incidents.length === 0) {
                repTable.innerHTML = `<tr><td colspan="6" class="table-empty">No se registraron incidentes en este recorrido.</td></tr>`;
                return;
            }

            repTable.innerHTML = curData.incidents.map((inc, idx) => {
                const isCritical = inc.severity === 'CRITICAL';
                const badgeClass = isCritical ? 'badge-critical' : 'badge-warning';
                const clipStart = inc.clipStart !== undefined ? inc.clipStart : Math.max(0, +(inc.time - 3.0).toFixed(1));
                const clipEnd = inc.clipEnd !== undefined ? inc.clipEnd : +(inc.time + 3.0).toFixed(1);
                const clipDur = (clipEnd - clipStart).toFixed(0);
                const clipUrl = inc.clipFile ? inc.clipFile.name : (inc.customClipUrl || inc.clipUrl || `https://telematics.copilot.net/evidence/clip_${inc.time.toFixed(1)}s.mp4`);
                const isCustom = Boolean(inc.customClipUrl || inc.clipFile);
                const displayName = inc.clipFile ? `📁 ${inc.clipFile.name}` : (inc.customClipUrl ? `🌐 ${inc.customClipUrl}` : (inc.clipTitle || `clip_${inc.time.toFixed(1)}s.mp4`));

                return `
                    <tr>
                        <td><strong style="color: var(--cyan-neon); font-family: var(--font-mono);">${inc.time.toFixed(1)}s</strong></td>
                        <td><span class="incident-badge ${badgeClass}">${(inc.type || '').replace(/_/g, ' ')}</span></td>
                        <td>${inc.severity || 'INFO'}</td>
                        <td>${inc.message || ''}</td>
                        <td class="font-mono">${inc.value || '--'}</td>
                        <td class="col-clip">
                            <div class="clip-action-group">
                                <button class="btn-clip-preview" onclick="window.apexApp.openClipViewer(${idx})" title="Reproducir e inspeccionar evidencia de video del incidente">
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5,3 19,12 5,21"></polygon></svg>
                                    <span>▶ Clip (${clipDur}s)</span>
                                </button>
                                <button class="btn-clip-icon btn-clip-link" onclick="window.apexApp.openClipViewer(${idx})" title="Enlazar URL o cargar video local para esta alerta">
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                                </button>
                                <button class="btn-clip-icon btn-clip-copy" onclick="window.apexApp.copyClipLink('${clipUrl}')" title="Copiar enlace del clip al portapapeles">
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </button>
                                <span class="clip-url-pill ${isCustom ? 'custom' : ''}" title="${clipUrl}">${displayName}</span>
                                <span class="print-clip-url">${clipUrl}</span>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Clip Viewer Modal Logic
    function openClipViewer(idx) {
        if (!engine.data || !engine.data.incidents || !engine.data.incidents[idx]) return;

        activeClipIncidentIndex = idx;
        const inc = engine.data.incidents[idx];
        const isCritical = inc.severity === 'CRITICAL';
        const badgeClass = isCritical ? 'badge-critical' : 'badge-warning';
        const icon = isCritical ? '🚨' : '⚠️';

        // Summary details
        const summaryEl = document.getElementById('clip-incident-summary');
        if (summaryEl) {
            summaryEl.innerHTML = `
                <div class="clip-summary-item">
                    <span class="clip-summary-label">Evento:</span>
                    <span class="incident-badge ${badgeClass}">${icon} ${(inc.type || '').replace(/_/g, ' ')}</span>
                </div>
                <div class="clip-summary-item">
                    <span class="clip-summary-label">Tiempo:</span>
                    <span style="font-family: var(--font-mono); font-weight: bold; color: var(--cyan-neon);">${inc.time.toFixed(1)}s</span>
                </div>
                <div class="clip-summary-item">
                    <span class="clip-summary-label">Gravedad:</span>
                    <span style="font-weight: bold; color: ${isCritical ? 'var(--red-alert)' : 'var(--amber-warning)'};">${inc.severity}</span>
                </div>
                <div class="clip-summary-item">
                    <span class="clip-summary-label">Magnitud:</span>
                    <span class="font-mono">${inc.value || '--'}</span>
                </div>
                <div class="clip-summary-item">
                    <span class="clip-summary-label">Velocidad:</span>
                    <span class="font-mono">${inc.speed || 0} km/h</span>
                </div>
            `;
        }

        // Time window calculation
        const clipStart = inc.clipStart !== undefined ? inc.clipStart : Math.max(0, +(inc.time - 3.0).toFixed(1));
        const clipEnd = inc.clipEnd !== undefined ? inc.clipEnd : +(inc.time + 3.0).toFixed(1);
        if (clipTimeWindowBadge) {
            clipTimeWindowBadge.textContent = `Ventana: ${clipStart.toFixed(1)}s - ${clipEnd.toFixed(1)}s (${(clipEnd - clipStart).toFixed(1)}s)`;
        }

        // URL input and badges
        const currentUrl = inc.clipFile ? inc.clipFile.name : (inc.customClipUrl || inc.clipUrl || '');
        if (clipUrlInput) clipUrlInput.value = currentUrl;
        updateClipSourceBadge(inc);

        // Open modal
        if (modalClip) modalClip.classList.add('active');

        // Prepare video playback
        setupClipVideoPlayer(inc, clipStart, clipEnd);
    }

    function updateClipSourceBadge(inc) {
        if (!clipSourceBadge) return;
        clipSourceBadge.className = 'clip-badge-source';
        if (inc.clipFile) {
            clipSourceBadge.textContent = 'Archivo Local';
            clipSourceBadge.classList.add('local');
        } else if (inc.customClipUrl) {
            clipSourceBadge.textContent = 'URL Personalizada';
            clipSourceBadge.classList.add('custom');
        } else {
            clipSourceBadge.textContent = 'Predeterminado';
        }
    }

    function setupClipVideoPlayer(inc, clipStart, clipEnd) {
        stopClipPlayback();

        let hasCustomVideo = false;
        if (inc.clipFile) {
            hasCustomVideo = true;
            clipVideoEl.src = URL.createObjectURL(inc.clipFile);
        } else if (hud && hud.customVideoFile) {
            hasCustomVideo = true;
            clipVideoEl.src = URL.createObjectURL(hud.customVideoFile);
        } else if (hud && hud.videoElement && hud.videoElement.src && !hud.isUsingProcedural) {
            hasCustomVideo = true;
            clipVideoEl.src = hud.videoElement.src;
        }

        if (hasCustomVideo && clipVideoEl) {
            clipCanvasPreview.style.display = 'none';
            clipVideoEl.style.display = 'block';
            clipVideoEl.currentTime = clipStart;
            clipVideoEl.play().catch(() => {});
            isClipPlaying = true;
            updateClipPlayPauseUI();

            clipVideoEl.ontimeupdate = () => {
                if (clipWatermarkTime) clipWatermarkTime.textContent = `${clipVideoEl.currentTime.toFixed(1)}s`;
                if (clipVideoEl.currentTime >= clipEnd) {
                    if (isClipLoop) {
                        clipVideoEl.currentTime = clipStart;
                    } else {
                        clipVideoEl.pause();
                        isClipPlaying = false;
                        updateClipPlayPauseUI();
                    }
                }
            };
        } else {
            clipVideoEl.style.display = 'none';
            clipCanvasPreview.style.display = 'block';
            clipSimTime = clipStart;
            isClipPlaying = true;
            updateClipPlayPauseUI();
            startClipCanvasAnimation(inc, clipStart, clipEnd);
        }
    }

    function startClipCanvasAnimation(inc, clipStart, clipEnd) {
        if (!clipCanvasPreview) return;
        const ctx = clipCanvasPreview.getContext('2d');
        const w = clipCanvasPreview.width;
        const h = clipCanvasPreview.height;

        let roadOffset = 0;

        function animate() {
            if (!isClipPlaying) return;

            clipSimTime += 0.033;
            if (clipSimTime > clipEnd) {
                if (isClipLoop) {
                    clipSimTime = clipStart;
                } else {
                    clipSimTime = clipEnd;
                    isClipPlaying = false;
                    updateClipPlayPauseUI();
                    return;
                }
            }

            if (clipWatermarkTime) {
                clipWatermarkTime.textContent = `${clipSimTime.toFixed(1)}s`;
            }

            // Draw road scene
            ctx.fillStyle = '#0b0f17';
            ctx.fillRect(0, 0, w, h);

            // Sky gradient
            const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.45);
            skyGrad.addColorStop(0, '#030712');
            skyGrad.addColorStop(1, '#111827');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, w, h * 0.45);

            // Ground & Asphalt
            const roadGrad = ctx.createLinearGradient(0, h * 0.45, 0, h);
            roadGrad.addColorStop(0, '#1a2234');
            roadGrad.addColorStop(1, '#0f172a');
            ctx.fillStyle = roadGrad;
            ctx.fillRect(0, h * 0.45, w, h * 0.55);

            // Road perspective lanes
            const horizonY = h * 0.45;
            const roadTopW = w * 0.25;
            const roadBotW = w * 0.88;

            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.moveTo((w - roadTopW) / 2, horizonY);
            ctx.lineTo((w + roadTopW) / 2, horizonY);
            ctx.lineTo((w + roadBotW) / 2, h);
            ctx.lineTo((w - roadBotW) / 2, h);
            ctx.closePath();
            ctx.fill();

            // Moving dashed center line
            roadOffset = (roadOffset + 4) % 40;
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 3;
            ctx.setLineDash([16, 16]);
            ctx.lineDashOffset = -roadOffset;
            ctx.beginPath();
            ctx.moveTo(w / 2, horizonY);
            ctx.lineTo(w / 2, h);
            ctx.stroke();
            ctx.setLineDash([]);

            // ADAS / Incident Target Box
            const isNearIncident = Math.abs(clipSimTime - inc.time) < 1.2;
            const boxColor = isNearIncident ? '#ef4444' : '#00f2fe';
            const boxDist = Math.max(8, 25 - (clipSimTime - clipStart) * 3);
            const boxW = 85;
            const boxH = 55;
            const boxX = (w / 2) - (boxW / 2);
            const boxY = horizonY + 35;

            ctx.strokeStyle = boxColor;
            ctx.lineWidth = isNearIncident ? 3 : 2;
            ctx.strokeRect(boxX, boxY, boxW, boxH);

            // Target vehicle silhouette inside box
            ctx.fillStyle = '#334155';
            ctx.fillRect(boxX + 10, boxY + 15, boxW - 20, boxH - 20);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(boxX + 12, boxY + 32, 10, 5);
            ctx.fillRect(boxX + boxW - 22, boxY + 32, 10, 5);

            // ADAS Label Tag
            ctx.fillStyle = isNearIncident ? 'rgba(239, 68, 68, 0.9)' : 'rgba(0, 242, 254, 0.85)';
            ctx.fillRect(boxX, boxY - 18, boxW, 16);
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${boxDist.toFixed(1)}m | TTC 1.4s`, boxX + (boxW / 2), boxY - 6);

            // Incident Warning Flash Banner if close to event time
            if (isNearIncident) {
                ctx.fillStyle = 'rgba(239, 68, 68, 0.88)';
                ctx.fillRect(w * 0.15, 20, w * 0.7, 34);
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 12px sans-serif';
                ctx.fillText(`⚠️ ALERTA: ${inc.message} (${inc.value})`, w / 2, 42);
            }

            // Bottom Hood contour
            ctx.fillStyle = '#090e18';
            ctx.beginPath();
            ctx.moveTo(w * 0.1, h);
            ctx.quadraticCurveTo(w * 0.5, h - 35, w * 0.9, h);
            ctx.fill();

            clipAnimationId = requestAnimationFrame(animate);
        }

        clipAnimationId = requestAnimationFrame(animate);
    }

    function stopClipPlayback() {
        if (clipAnimationId) {
            cancelAnimationFrame(clipAnimationId);
            clipAnimationId = null;
        }
        if (clipVideoEl) {
            clipVideoEl.pause();
            clipVideoEl.ontimeupdate = null;
        }
        isClipPlaying = false;
        updateClipPlayPauseUI();
    }

    function updateClipPlayPauseUI() {
        if (!clipPlayLabel || !clipPlayIcon) return;
        if (isClipPlaying) {
            clipPlayLabel.textContent = 'Pausar';
            clipPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
        } else {
            clipPlayLabel.textContent = 'Reproducir';
            clipPlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21"></polygon>';
        }
    }

    // Modal Control Listeners
    if (btnCloseClipModal && modalClip) {
        btnCloseClipModal.addEventListener('click', () => {
            stopClipPlayback();
            modalClip.classList.remove('active');
        });
    }

    if (btnClipPlayPause) {
        btnClipPlayPause.addEventListener('click', () => {
            if (activeClipIncidentIndex < 0 || !engine.data || !engine.data.incidents) return;
            const inc = engine.data.incidents[activeClipIncidentIndex];
            const clipStart = inc.clipStart !== undefined ? inc.clipStart : Math.max(0, +(inc.time - 3.0).toFixed(1));
            const clipEnd = inc.clipEnd !== undefined ? inc.clipEnd : +(inc.time + 3.0).toFixed(1);

            if (isClipPlaying) {
                stopClipPlayback();
            } else {
                isClipPlaying = true;
                updateClipPlayPauseUI();
                if (clipVideoEl.style.display === 'block') {
                    clipVideoEl.play().catch(() => {});
                } else {
                    if (clipSimTime >= clipEnd) clipSimTime = clipStart;
                    startClipCanvasAnimation(inc, clipStart, clipEnd);
                }
            }
        });
    }

    if (btnClipLoop) {
        btnClipLoop.addEventListener('click', () => {
            isClipLoop = !isClipLoop;
            btnClipLoop.classList.toggle('active', isClipLoop);
            if (clipLoopLabel) clipLoopLabel.textContent = `Bucle: ${isClipLoop ? 'ON' : 'OFF'}`;
        });
    }

    if (btnClipSeekMain) {
        btnClipSeekMain.addEventListener('click', () => {
            if (activeClipIncidentIndex < 0 || !engine.data || !engine.data.incidents) return;
            const inc = engine.data.incidents[activeClipIncidentIndex];
            stopClipPlayback();
            if (modalClip) modalClip.classList.remove('active');
            if (modalReport) modalReport.classList.remove('active');
            engine.jumpToIncident(activeClipIncidentIndex);
            engine.play();
            showNotification(`Reproduciendo alerta en dashboard telemático (${inc.time.toFixed(1)}s)`, 'info');
        });
    }

    if (btnSaveClipUrl) {
        btnSaveClipUrl.addEventListener('click', () => {
            if (activeClipIncidentIndex < 0 || !engine.data || !engine.data.incidents) return;
            const inc = engine.data.incidents[activeClipIncidentIndex];
            const urlVal = clipUrlInput ? clipUrlInput.value.trim() : '';
            if (urlVal) {
                inc.customClipUrl = urlVal;
                inc.clipFile = null;
            } else {
                inc.customClipUrl = null;
            }
            updateClipSourceBadge(inc);
            populateReportModal();
            renderIncidentTable(engine.data.incidents || []);
            showNotification('Enlace del clip de video actualizado correctamente.', 'success');
        });
    }

    if (btnCopyClipUrl) {
        btnCopyClipUrl.addEventListener('click', () => {
            const urlVal = clipUrlInput ? clipUrlInput.value.trim() : '';
            if (urlVal) {
                copyClipLink(urlVal);
            }
        });
    }

    if (clipLocalFileInput) {
        clipLocalFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file || activeClipIncidentIndex < 0 || !engine.data || !engine.data.incidents) return;
            const inc = engine.data.incidents[activeClipIncidentIndex];
            inc.clipFile = file;
            inc.customClipUrl = file.name;
            if (clipUrlInput) clipUrlInput.value = file.name;
            updateClipSourceBadge(inc);

            const clipStart = inc.clipStart !== undefined ? inc.clipStart : Math.max(0, +(inc.time - 3.0).toFixed(1));
            const clipEnd = inc.clipEnd !== undefined ? inc.clipEnd : +(inc.time + 3.0).toFixed(1);
            setupClipVideoPlayer(inc, clipStart, clipEnd);

            populateReportModal();
            renderIncidentTable(engine.data.incidents || []);
            showNotification(`Video local "${file.name}" vinculado a la alerta.`, 'success');
        });
    }

    if (btnResetClipUrl) {
        btnResetClipUrl.addEventListener('click', () => {
            if (activeClipIncidentIndex < 0 || !engine.data || !engine.data.incidents) return;
            const inc = engine.data.incidents[activeClipIncidentIndex];
            inc.customClipUrl = null;
            inc.clipFile = null;
            const defUrl = inc.clipUrl || `https://telematics.copilot.net/evidence/clip_${inc.time.toFixed(1)}s.mp4`;
            if (clipUrlInput) clipUrlInput.value = defUrl;
            updateClipSourceBadge(inc);

            const clipStart = inc.clipStart !== undefined ? inc.clipStart : Math.max(0, +(inc.time - 3.0).toFixed(1));
            const clipEnd = inc.clipEnd !== undefined ? inc.clipEnd : +(inc.time + 3.0).toFixed(1);
            setupClipVideoPlayer(inc, clipStart, clipEnd);

            populateReportModal();
            renderIncidentTable(engine.data.incidents || []);
            showNotification('Se restauró el enlace predeterminado de telemetría.', 'info');
        });
    }

    function copyClipLink(url) {
        if (!url) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                const preview = url.length > 40 ? url.substring(0, 40) + '...' : url;
                showNotification(`Enlace copiado: ${preview}`, 'success');
            }).catch(() => {
                fallbackCopy(url);
            });
        } else {
            fallbackCopy(url);
        }
    }

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showNotification('Enlace copiado al portapapeles.', 'success');
    }

    function exportReportToCsv() {
        const curData = engine.data;
        if (!curData || !curData.incidents || curData.incidents.length === 0) {
            showNotification('No hay incidentes para exportar en la planilla.', 'warning');
            return;
        }

        const headers = [
            'Tiempo (s)',
            'Tipo de Alerta',
            'Gravedad',
            'Descripción',
            'Magnitud',
            'Velocidad (km/h)',
            'Latitud GPS',
            'Longitud GPS',
            'Ventana Clip Inicio (s)',
            'Ventana Clip Fin (s)',
            'Clip de Video (URL / Enlace)'
        ];

        const rows = curData.incidents.map(inc => {
            const clipStart = inc.clipStart !== undefined ? inc.clipStart : Math.max(0, +(inc.time - 3.0).toFixed(1));
            const clipEnd = inc.clipEnd !== undefined ? inc.clipEnd : +(inc.time + 3.0).toFixed(1);
            const clipUrl = inc.clipFile ? inc.clipFile.name : (inc.customClipUrl || inc.clipUrl || `https://telematics.copilot.net/evidence/clip_${inc.time.toFixed(1)}s.mp4`);

            return [
                inc.time.toFixed(1),
                `"${(inc.type || '').replace(/"/g, '""')}"`,
                `"${(inc.severity || '').replace(/"/g, '""')}"`,
                `"${(inc.message || '').replace(/"/g, '""')}"`,
                `"${(inc.value || '').replace(/"/g, '""')}"`,
                inc.speed || 0,
                (inc.lat || 0).toFixed(6),
                (inc.lng || 0).toFixed(6),
                clipStart.toFixed(1),
                clipEnd.toFixed(1),
                `"${clipUrl.replace(/"/g, '""')}"`
            ].join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const scName = (scenarioSelect ? scenarioSelect.value : 'reporte').replace(/[^a-zA-Z0-9_-]/g, '_');
        a.href = url;
        a.download = `planilla_auditoria_incidentes_${scName}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('Planilla CSV descargada exitosamente para Excel / Sheets.', 'success');
    }

    function showNotification(text, type = 'info') {
        const notif = document.createElement('div');
        notif.className = `apex-notification ${type}`;
        notif.innerHTML = `<span>${text}</span>`;
        document.body.appendChild(notif);
        setTimeout(() => notif.classList.add('show'), 50);
        setTimeout(() => {
            notif.classList.remove('show');
            setTimeout(() => notif.remove(), 400);
        }, 3500);
    }

    // -------------------------------------------------------------
    // Global App Reference (required for inline onclick handlers in
    // dynamically generated HTML such as incident table rows and
    // the report modal clip buttons)
    // -------------------------------------------------------------
    window.apexApp = {
        engine,
        openClipViewer,
        copyClipLink
    };

    // ─── Auth: cargar UI si sesión activa ───────────────────────────────────
    if (SaurusAuth.isLoggedIn()) {
        updateAuthUI();
    }

    // -------------------------------------------------------------
    // Initial Boot: Load first scenario
    // -------------------------------------------------------------
    loadScenario('urban_adas');
});
