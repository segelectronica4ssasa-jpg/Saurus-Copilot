/**
 * Saurus CoPilot Telemetry - Multi-Camera Engine (4 Driving Cameras + 1 Driver Monitoring System)
 * High-performance 60 FPS procedural rendering and telematics overlay for 5 camera channels:
 * - CH1: Frontal (Road ADAS)
 * - CH2: Trasera (Rear / Cargo / RCW)
 * - CH3: Lateral Izquierda (BSD-L Blind Spot)
 * - CH4: Lateral Derecha (BSD-R Blind Spot)
 * - CH5: DMS Cabina (Driver Monitoring System / Biometrics / Fatigue / Distraction)
 */

class MultiCameraEngine {
    constructor(canvases, frontHud, engine) {
        this.canvases = canvases; // { front, rear, left, right, dms }
        this.frontHud = frontHud;
        this.engine = engine;

        // Active layout view mode: 'grid' | 'front' | 'dms' | 'rear' | 'side'
        this.activeView = 'grid';
        this.focusedCamera = 'front';

        // Audio alert synth
        this.audioEnabled = true;
        this.audioCtx = null;
        this.lastAlertSoundTime = 0;

        // Visual toggle states
        this.showBiometrics = true;
        this.showBsdRadars = true;
        this.showRearGuides = true;

        // Dynamic animation states for simulation
        this.animOffsets = {
            rearRoad: 0,
            leftRoad: 0,
            rightRoad: 0,
            blinkTimer: 0,
            blinkState: false,
            lastBlinkTime: 0
        };

        // Context caches
        this.ctxs = {};
        for (let key in this.canvases) {
            if (this.canvases[key]) {
                this.ctxs[key] = this.canvases[key].getContext('2d');
            }
        }

        this._setupResize();
        this._setupEngineListeners();
    }

    _setupResize() {
        const resizeAll = () => {
            for (let key in this.canvases) {
                const canvas = this.canvases[key];
                if (!canvas) continue;
                const rect = canvas.getBoundingClientRect();
                if (rect.width && rect.height) {
                    canvas.width = Math.round(rect.width * (window.devicePixelRatio || 1));
                    canvas.height = Math.round(rect.height * (window.devicePixelRatio || 1));
                }
            }
        };
        window.addEventListener('resize', resizeAll);
        setTimeout(resizeAll, 120);
    }

    _setupEngineListeners() {
        this.engine.on('frame', (frame) => {
            this.renderAll(frame);
            this._checkAudioAlarms(frame);
        });
    }

    setViewMode(mode) {
        this.activeView = mode;
        const container = document.getElementById('multicam-container');
        if (container) {
            container.className = `multicam-viewport-container view-${mode}`;
        }
        // Force resize update
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
    }

    focusCamera(camKey) {
        this.focusedCamera = camKey;
        if (this.activeView !== 'grid') {
            this.setViewMode(camKey);
        }
    }

    toggleAudio(enable) {
        this.audioEnabled = enable !== undefined ? enable : !this.audioEnabled;
        return this.audioEnabled;
    }

    _playBeep(freq = 880, duration = 0.12, count = 1) {
        if (!this.audioEnabled) return;
        try {
            if (!this.audioCtx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.audioCtx = new AudioCtx();
            }
            if (!this.audioCtx) return;
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            for (let i = 0; i < count; i++) {
                const startTime = this.audioCtx.currentTime + (i * 0.16);
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);
                osc.frequency.exponentialRampToValueAtTime(freq * 1.3, startTime + duration);

                gain.gain.setValueAtTime(0.08, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

                osc.connect(gain);
                gain.connect(this.audioCtx.destination);

                osc.start(startTime);
                osc.stop(startTime + duration);
            }
        } catch (e) {
            console.warn('Audio alert error:', e);
        }
    }

    _checkAudioAlarms(frame) {
        if (!this.engine.isPlaying) return;
        const now = performance.now();
        if (now - this.lastAlertSoundTime < 3000) return; // Debounce 3s

        if (frame.dms) {
            if (frame.dms.driverStatus === 'DROWSY' && frame.dms.eyesClosed) {
                this._playBeep(980, 0.18, 3); // 3 urgent beeps for microsleep
                this.lastAlertSoundTime = now;
            } else if (frame.dms.driverStatus === 'DISTRACTED_PHONE') {
                this._playBeep(750, 0.14, 2); // 2 beeps for phone
                this.lastAlertSoundTime = now;
            }
        }
    }

    /**
     * Master render loop for all cameras
     */
    renderAll(frame) {
        if (!frame) return;

        // 1. Front Camera is handled by DashcamHudOverlay if active, or synced
        if (this.frontHud) {
            this.frontHud.render(frame);
        }

        // 2. Rear Camera (CH2)
        if (this.ctxs.rear) {
            this.renderRearCamera(this.ctxs.rear, this.canvases.rear.width, this.canvases.rear.height, frame);
        }

        // 3. Left Side BSD Camera (CH3)
        if (this.ctxs.left) {
            this.renderLeftCamera(this.ctxs.left, this.canvases.left.width, this.canvases.left.height, frame);
        }

        // 4. Right Side BSD Camera (CH4)
        if (this.ctxs.right) {
            this.renderRightCamera(this.ctxs.right, this.canvases.right.width, this.canvases.right.height, frame);
        }

        // 5. Driver Monitoring System (DMS CH5)
        if (this.ctxs.dms) {
            this.renderDmsCamera(this.ctxs.dms, this.canvases.dms.width, this.canvases.dms.height, frame);
        }

        // Update external DOM badges if available
        this.updateDmsDomTelemetry(frame);
    }

    // =========================================================================
    // 2. REAR CAMERA RENDERER (CH2)
    // =========================================================================
    renderRearCamera(ctx, w, h, frame) {
        ctx.save();
        ctx.clearRect(0, 0, w, h);

        const horizonY = h * 0.42;
        const speed = frame.speed || 0;

        // Sky / Horizon gradient (Night / Twilight rear perspective)
        const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        skyGrad.addColorStop(0, '#04070d');
        skyGrad.addColorStop(1, '#0e1624');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, horizonY);

        // Ground / Asphalt road receding backwards
        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, h);
        roadGrad.addColorStop(0, '#151b22');
        roadGrad.addColorStop(0.5, '#1b232c');
        roadGrad.addColorStop(1, '#11161d');
        ctx.fillStyle = roadGrad;
        ctx.fillRect(0, horizonY, w, h - horizonY);

        // Road perspective trapezoid (narrow at horizon, wide at bottom)
        const topW = w * 0.14;
        const botW = w * 0.92;
        const topX = w * 0.5;
        const botX = w * 0.5;

        // Moving road dashes receding
        if (this.engine.isPlaying) {
            const delta = (speed / 3.6) * 0.08;
            this.animOffsets.rearRoad = (this.animOffsets.rearRoad + delta) % 1.0;
        }

        // Road curbs
        ctx.strokeStyle = 'rgba(255, 183, 3, 0.6)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(topX - topW * 0.5, horizonY);
        ctx.lineTo(botX - botW * 0.5, h);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(topX + topW * 0.5, horizonY);
        ctx.lineTo(botX + botW * 0.5, h);
        ctx.stroke();

        // Center dashed lines
        const numDashes = 10;
        for (let i = 0; i < numDashes; i++) {
            const z = ((i / numDashes) + this.animOffsets.rearRoad / numDashes) % 1.0;
            const t1 = Math.pow(z, 2.0);
            const t2 = Math.pow(Math.min(1.0, z + 0.05), 2.0);

            const y1 = horizonY + (h - horizonY) * t1;
            const y2 = horizonY + (h - horizonY) * t2;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = Math.max(1.5, t1 * 4.5);
            ctx.beginPath();
            ctx.moveTo(topX, y1);
            ctx.lineTo(topX, y2);
            ctx.stroke();
        }

        // Vehicle trailing behind (if present in frame.rear)
        const rearData = frame.rear || { vehicleDist: 22, alert: false };
        const dist = Math.max(4, Math.min(60, rearData.vehicleDist || 20));
        const normDist = 1 - ((dist - 4) / 56); // 1 = right on bumper, 0 = far
        const carT = Math.pow(Math.max(0.12, normDist), 1.8);

        const carY = horizonY + (h - horizonY) * carT * 0.72;
        const carW = Math.max(30, w * 0.35 * carT);
        const carH = carW * 0.58;
        const carX = w * 0.5 - carW * 0.5;

        // Render rear car body & headlights
        ctx.fillStyle = rearData.alert ? '#3b0d14' : '#1c2533';
        ctx.beginPath();
        ctx.roundRect(carX, carY, carW, carH, 4);
        ctx.fill();
        ctx.strokeStyle = rearData.alert ? '#ff3366' : 'rgba(96, 165, 250, 0.6)';
        ctx.lineWidth = rearData.alert ? 2.5 : 1.5;
        ctx.stroke();

        // Headlights of trailing car
        const lightR = Math.max(3, carW * 0.08);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = rearData.alert ? '#ff3366' : '#93c5fd';
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.arc(carX + carW * 0.2, carY + carH * 0.45, lightR, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(carX + carW * 0.8, carY + carH * 0.45, lightR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Reversing / Parking Trajectory Guide Lines
        if (this.showRearGuides) {
            this._renderRearGuideLines(ctx, w, h, horizonY, rearData.alert);
        }

        // OSD Banner
        this._renderOsdOverlay(ctx, w, h, {
            channel: 'CH2 • TRASERA // RCW',
            res: '1080P 30FPS',
            status: rearData.alert ? '⚠️ ALERTA: PROXIMIDAD CRÍTICA' : `DISTANCIA: ${dist.toFixed(1)}m`,
            isAlert: rearData.alert,
            alertColor: '#ff3366'
        });

        ctx.restore();
    }

    _renderRearGuideLines(ctx, w, h, horizonY, isAlert) {
        const botY = h * 0.94;
        const midY = h * 0.78;
        const topY = h * 0.62;

        const wBot = w * 0.72;
        const wMid = w * 0.54;
        const wTop = w * 0.38;

        const cx = w * 0.5;

        // Red zone (close: 1m)
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx - wBot * 0.5, botY);
        ctx.lineTo(cx - wMid * 0.5, midY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + wBot * 0.5, botY);
        ctx.lineTo(cx + wMid * 0.5, midY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - wBot * 0.5, botY);
        ctx.lineTo(cx + wBot * 0.5, botY);
        ctx.stroke();

        // Yellow zone (mid: 2m)
        ctx.strokeStyle = '#ffb703';
        ctx.beginPath();
        ctx.moveTo(cx - wMid * 0.5, midY);
        ctx.lineTo(cx - wTop * 0.5, topY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + wMid * 0.5, midY);
        ctx.lineTo(cx + wTop * 0.5, topY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - wMid * 0.5, midY);
        ctx.lineTo(cx + wMid * 0.5, midY);
        ctx.stroke();

        // Green zone (safe: 3m)
        ctx.strokeStyle = '#10b981';
        ctx.beginPath();
        ctx.moveTo(cx - wTop * 0.5, topY);
        ctx.lineTo(cx + wTop * 0.5, topY);
        ctx.stroke();
    }

    // =========================================================================
    // 3. LEFT SIDE BSD CAMERA (CH3)
    // =========================================================================
    renderLeftCamera(ctx, w, h, frame) {
        ctx.save();
        ctx.clearRect(0, 0, w, h);

        const bsd = (frame.bsd && frame.bsd.left) ? frame.bsd.left : { active: false, alert: false, vehicleDist: 0 };
        const speed = frame.speed || 0;

        // Background: Asphalt streaming vertically
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, '#10161f');
        bgGrad.addColorStop(1, '#18212a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Asphalt texture streaks
        if (this.engine.isPlaying) {
            this.animOffsets.leftRoad = (this.animOffsets.leftRoad + (speed / 3.6) * 0.12) % 1.0;
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 7; i++) {
            const y = ((i / 7) + this.animOffsets.leftRoad) % 1.0 * h;
            ctx.beginPath();
            ctx.moveTo(w * 0.15, y);
            ctx.lineTo(w * 0.65, y + 25);
            ctx.stroke();
        }

        // Left white lane marking
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(w * 0.35, 0);
        ctx.lineTo(w * 0.22, h);
        ctx.stroke();

        // Right side of frame is vehicle's dark blue body panel & side mirror contour
        ctx.fillStyle = '#0a101d';
        ctx.beginPath();
        ctx.moveTo(w * 0.76, 0);
        ctx.bezierCurveTo(w * 0.72, h * 0.3, w * 0.74, h * 0.7, w * 0.8, h);
        ctx.lineTo(w, h);
        ctx.lineTo(w, 0);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.76, 0);
        ctx.bezierCurveTo(w * 0.72, h * 0.3, w * 0.74, h * 0.7, w * 0.8, h);
        ctx.stroke();

        // Vehicle in blind spot if active
        if (bsd.active || bsd.alert) {
            const carX = w * 0.08;
            const carY = h * 0.35;
            const carW = w * 0.42;
            const carH = h * 0.32;

            ctx.fillStyle = bsd.alert ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.25)';
            ctx.strokeStyle = bsd.alert ? '#ef4444' : '#3b82f6';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(carX, carY, carW, carH, 6);
            ctx.fill();
            ctx.stroke();

            // Headlight glow
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = bsd.alert ? '#ef4444' : '#60a5fa';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(carX + carW * 0.75, carY + carH * 0.3, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // BSD Radar Sensor Arc (Upper Left)
        if (this.showBsdRadars) {
            this._renderBsdRadarOverlay(ctx, w * 0.2, h * 0.25, bsd.alert);
        }

        // OSD Banner
        this._renderOsdOverlay(ctx, w, h, {
            channel: 'CH3 • LATERAL IZQ // BSD-L',
            res: '720P 30FPS',
            status: bsd.alert ? '⚠️ OBJETO EN PUNTO CIEGO' : 'RADAR BSD ACTIVO',
            isAlert: bsd.alert,
            alertColor: '#ffb703'
        });

        ctx.restore();
    }

    // =========================================================================
    // 4. RIGHT SIDE BSD CAMERA (CH4)
    // =========================================================================
    renderRightCamera(ctx, w, h, frame) {
        ctx.save();
        ctx.clearRect(0, 0, w, h);

        const bsd = (frame.bsd && frame.bsd.right) ? frame.bsd.right : { active: false, alert: false, vehicleDist: 0 };
        const speed = frame.speed || 0;

        // Background: Asphalt
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, '#10161f');
        bgGrad.addColorStop(1, '#18212a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Asphalt texture streaks
        if (this.engine.isPlaying) {
            this.animOffsets.rightRoad = (this.animOffsets.rightRoad + (speed / 3.6) * 0.12) % 1.0;
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 7; i++) {
            const y = ((i / 7) + this.animOffsets.rightRoad) % 1.0 * h;
            ctx.beginPath();
            ctx.moveTo(w * 0.35, y);
            ctx.lineTo(w * 0.85, y + 25);
            ctx.stroke();
        }

        // Right road curb / guardrail
        ctx.strokeStyle = '#ffb703';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(w * 0.72, 0);
        ctx.lineTo(w * 0.85, h);
        ctx.stroke();

        // Left side of frame is vehicle's right body panel & mirror
        ctx.fillStyle = '#0a101d';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w * 0.24, 0);
        ctx.bezierCurveTo(w * 0.28, h * 0.3, w * 0.26, h * 0.7, w * 0.2, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.24, 0);
        ctx.bezierCurveTo(w * 0.28, h * 0.3, w * 0.26, h * 0.7, w * 0.2, h);
        ctx.stroke();

        // Vehicle / cyclist in blind spot if active
        if (bsd.active || bsd.alert) {
            const carX = w * 0.45;
            const carY = h * 0.38;
            const carW = w * 0.38;
            const carH = h * 0.30;

            ctx.fillStyle = bsd.alert ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.25)';
            ctx.strokeStyle = bsd.alert ? '#ef4444' : '#3b82f6';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(carX, carY, carW, carH, 6);
            ctx.fill();
            ctx.stroke();

            // Headlight
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = bsd.alert ? '#ef4444' : '#60a5fa';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(carX + carW * 0.25, carY + carH * 0.3, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // BSD Radar Sensor Arc (Upper Right)
        if (this.showBsdRadars) {
            this._renderBsdRadarOverlay(ctx, w * 0.8, h * 0.25, bsd.alert);
        }

        // OSD Banner
        this._renderOsdOverlay(ctx, w, h, {
            channel: 'CH4 • LATERAL DER // BSD-R',
            res: '720P 30FPS',
            status: bsd.alert ? '⚠️ OBJETO EN PUNTO CIEGO' : 'RADAR BSD ACTIVO',
            isAlert: bsd.alert,
            alertColor: '#ffb703'
        });

        ctx.restore();
    }

    _renderBsdRadarOverlay(ctx, cx, cy, isAlert) {
        const radius = 22;
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isAlert ? '#ef4444' : '#00f2fe';
        ctx.fillStyle = isAlert ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0, 242, 254, 0.1)';

        // Concentric radar waves
        for (let r = 8; r <= radius; r += 7) {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isAlert ? '#ef4444' : '#00f2fe';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isAlert ? 'BSD ALERT' : 'BSD SCAN', cx, cy + radius + 13);

        ctx.restore();
    }

    // =========================================================================
    // 5. DRIVER MONITORING SYSTEM (DMS CH5)
    // =========================================================================
    renderDmsCamera(ctx, w, h, frame) {
        ctx.save();
        ctx.clearRect(0, 0, w, h);

        const dms = frame.dms || {
            driverStatus: 'NORMAL',
            statusLabel: 'NORMAL',
            perclos: 6,
            blinkRate: 15,
            eyesClosed: false,
            phoneDetected: false,
            yawnDetected: false,
            seatbeltBuckled: true,
            score: 96,
            gazeX: 0,
            gazeY: -0.1
        };

        // 1. Infrared Night Vision Background Palette (Stylized IR green/cyan/dark gray)
        const irGrad = ctx.createLinearGradient(0, 0, 0, h);
        irGrad.addColorStop(0, '#060c12');
        irGrad.addColorStop(0.5, '#0a141e');
        irGrad.addColorStop(1, '#0e1c28');
        ctx.fillStyle = irGrad;
        ctx.fillRect(0, 0, w, h);

        // Faint scanlines for authentic telematics IR camera feel
        ctx.fillStyle = 'rgba(0, 255, 180, 0.015)';
        for (let y = 0; y < h; y += 4) {
            ctx.fillRect(0, y, w, 1.5);
        }

        // Cabin cockpit geometry:
        // Driver headrest behind
        ctx.fillStyle = '#081018';
        ctx.beginPath();
        ctx.roundRect(w * 0.32, h * 0.16, w * 0.36, h * 0.38, 16);
        ctx.fill();

        // Steering wheel rim at bottom
        ctx.strokeStyle = '#122030';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 1.15, w * 0.44, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();

        // Driver silhouette / shoulders
        ctx.fillStyle = '#0d1822';
        ctx.beginPath();
        ctx.moveTo(w * 0.12, h);
        ctx.bezierCurveTo(w * 0.22, h * 0.65, w * 0.35, h * 0.58, w * 0.42, h * 0.54);
        ctx.lineTo(w * 0.58, h * 0.54);
        ctx.bezierCurveTo(w * 0.65, h * 0.58, w * 0.78, h * 0.65, w * 0.88, h);
        ctx.closePath();
        ctx.fill();

        // Driver Head & Face
        const headCenterX = w * 0.5 + (dms.gazeX || 0) * 16;
        const headCenterY = h * 0.42 + (dms.gazeY || 0) * 10;
        const headRadiusX = w * 0.14;
        const headRadiusY = h * 0.19;

        // Head ellipse (skin tone in IR lighting)
        const faceGrad = ctx.createRadialGradient(headCenterX, headCenterY - 10, 5, headCenterX, headCenterY, headRadiusY);
        faceGrad.addColorStop(0, '#2b445a');
        faceGrad.addColorStop(0.7, '#1b2f42');
        faceGrad.addColorStop(1, '#112030');
        ctx.fillStyle = faceGrad;

        ctx.beginPath();
        ctx.ellipse(headCenterX, headCenterY, headRadiusX, headRadiusY, (dms.gazeX || 0) * 0.1, 0, Math.PI * 2);
        ctx.fill();

        // Eyes & Gaze Tracking
        const eyeOffsetX = headRadiusX * 0.38;
        const eyeOffsetY = -headRadiusY * 0.12;
        const leftEyeX = headCenterX - eyeOffsetX;
        const rightEyeX = headCenterX + eyeOffsetX;
        const eyeY = headCenterY + eyeOffsetY;

        // Blink animation logic (blink every 3-4s for 150ms)
        const isBlinking = dms.eyesClosed || (performance.now() % 3500 < 160);

        this._renderDmsEye(ctx, leftEyeX, eyeY, isBlinking, dms);
        this._renderDmsEye(ctx, rightEyeX, eyeY, isBlinking, dms);

        // Nose bridge
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(headCenterX, eyeY + 4);
        ctx.lineTo(headCenterX - 2, eyeY + 18);
        ctx.lineTo(headCenterX + 3, eyeY + 22);
        ctx.stroke();

        // Mouth (Normal, Yawn, or Alert)
        const mouthY = eyeY + 36;
        if (dms.yawnDetected) {
            // Yawn: open wide oval
            ctx.fillStyle = '#060a10';
            ctx.strokeStyle = '#ffb703';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(headCenterX, mouthY, 10, 16, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else {
            // Normal / smiling / neutral
            ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(headCenterX - 10, mouthY);
            ctx.quadraticCurveTo(headCenterX, mouthY + 3, headCenterX + 10, mouthY);
            ctx.stroke();
        }

        // Phone Distraction Graphic (if active)
        if (dms.phoneDetected) {
            const phoneX = w * 0.62;
            const phoneY = h * 0.62;
            const phoneW = w * 0.22;
            const phoneH = h * 0.32;

            ctx.fillStyle = 'rgba(249, 63, 4, 0.2)';
            ctx.strokeStyle = '#f93f04';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(phoneX, phoneY, phoneW, phoneH, 6);
            ctx.fill();
            ctx.stroke();

            // Screen glow
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#f93f04';
            ctx.shadowBlur = 10;
            ctx.fillRect(phoneX + 5, phoneY + 6, phoneW - 10, phoneH - 12);
            ctx.shadowBlur = 0;

            // AI phone detection tag
            ctx.fillStyle = '#f93f04';
            ctx.font = 'bold 9px "JetBrains Mono", monospace';
            ctx.fillText('📱 TELÉFONO 98%', phoneX, phoneY - 6);
        }

        // Seatbelt diagonal strap across chest
        ctx.strokeStyle = dms.seatbeltBuckled ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.9)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(w * 0.28, h * 0.58);
        ctx.lineTo(w * 0.78, h);
        ctx.stroke();

        // Biometric Face Tracking Bounding Box & Landmarks
        if (this.showBiometrics) {
            this._renderBiometricOverlay(ctx, headCenterX, headCenterY, headRadiusX, headRadiusY, dms);
        }

        // OSD Banner
        const isCritical = dms.driverStatus === 'DROWSY' || dms.driverStatus === 'DISTRACTED_PHONE';
        this._renderOsdOverlay(ctx, w, h, {
            channel: 'CH5 • DMS CABINA // BIOMETRICS',
            res: '720P IR 30FPS',
            status: dms.statusLabel || 'CONDUCTOR ATENTO',
            isAlert: isCritical,
            alertColor: dms.driverStatus === 'DROWSY' ? '#ff3366' : '#f93f04'
        });

        ctx.restore();
    }

    _renderDmsEye(ctx, x, y, isClosed, dms) {
        ctx.save();
        const eyeW = 10;
        const eyeH = isClosed ? 1 : 6;

        if (isClosed) {
            ctx.strokeStyle = (dms.driverStatus === 'DROWSY') ? '#ff3366' : '#00f2fe';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(x - eyeW, y);
            ctx.lineTo(x + eyeW, y);
            ctx.stroke();
        } else {
            // Sclera
            ctx.fillStyle = '#d0e3f0';
            ctx.beginPath();
            ctx.ellipse(x, y, eyeW, eyeH, 0, 0, Math.PI * 2);
            ctx.fill();

            // Pupil & Iris responding to gaze
            const gazeXOffset = (dms.gazeX || 0) * 3.5;
            const gazeYOffset = (dms.gazeY || 0) * 2.0;
            const pupilX = x + gazeXOffset;
            const pupilY = y + gazeYOffset;

            ctx.fillStyle = '#08121a';
            ctx.beginPath();
            ctx.arc(pupilX, pupilY, 3.2, 0, Math.PI * 2);
            ctx.fill();

            // Iris highlight
            ctx.fillStyle = '#00f2fe';
            ctx.beginPath();
            ctx.arc(pupilX - 1, pupilY - 1, 1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _renderBiometricOverlay(ctx, cx, cy, rx, ry, dms) {
        ctx.save();
        const isAlert = dms.driverStatus === 'DROWSY' || dms.driverStatus === 'DISTRACTED_PHONE';
        const strokeCol = isAlert ? (dms.driverStatus === 'DROWSY' ? '#ff3366' : '#f93f04') : '#00f2fe';

        // Bounding box corners
        const boxW = rx * 2.3;
        const boxH = ry * 2.4;
        const x1 = cx - boxW * 0.5;
        const y1 = cy - boxH * 0.5;
        const x2 = x1 + boxW;
        const y2 = y1 + boxH;
        const cornerLen = 12;

        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 2;

        // 4 corner brackets
        ctx.beginPath();
        // Top-left
        ctx.moveTo(x1, y1 + cornerLen); ctx.lineTo(x1, y1); ctx.lineTo(x1 + cornerLen, y1);
        // Top-right
        ctx.moveTo(x2 - cornerLen, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + cornerLen);
        // Bottom-left
        ctx.moveTo(x1, y2 - cornerLen); ctx.lineTo(x1, y2); ctx.lineTo(x1 + cornerLen, y2);
        // Bottom-right
        ctx.moveTo(x2 - cornerLen, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - cornerLen);
        ctx.stroke();

        // Biometric landmark dots
        ctx.fillStyle = strokeCol;
        const dots = [
            { x: cx, y: cy - ry * 0.65 }, // Forehead
            { x: cx - rx * 0.5, y: cy - ry * 0.2 }, // Left brow
            { x: cx + rx * 0.5, y: cy - ry * 0.2 }, // Right brow
            { x: cx, y: cy + ry * 0.1 }, // Nose tip
            { x: cx - rx * 0.4, y: cy + ry * 0.45 }, // Left mouth corner
            { x: cx + rx * 0.4, y: cy + ry * 0.45 }, // Right mouth corner
            { x: cx, y: cy + ry * 0.85 } // Chin
        ];

        dots.forEach(d => {
            ctx.beginPath();
            ctx.arc(d.x, d.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });

        // Face tag
        ctx.fillStyle = strokeCol;
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText(`DRIVER_01 // PERCLOS: ${dms.perclos}%`, x1, y1 - 6);

        ctx.restore();
    }

    // =========================================================================
    // Generic OSD Bar for all cameras
    // =========================================================================
    _renderOsdOverlay(ctx, w, h, info) {
        ctx.save();
        const pad = 8;

        // Top Header Strip
        ctx.fillStyle = 'rgba(7, 10, 16, 0.72)';
        ctx.fillRect(0, 0, w, 24);

        // REC Red dot & time
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(pad + 4, 12, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const seconds = (this.engine.currentTime || 0).toFixed(1);
        ctx.fillText(`REC ${seconds}s`, pad + 12, 12);

        // Channel name & resolution
        ctx.fillStyle = info.isAlert ? info.alertColor : '#00f2fe';
        ctx.textAlign = 'right';
        ctx.fillText(`${info.channel} [${info.res}]`, w - pad, 12);

        // Bottom Status Ribbon
        ctx.fillStyle = info.isAlert ? 'rgba(239, 68, 68, 0.82)' : 'rgba(14, 20, 32, 0.75)';
        ctx.fillRect(0, h - 22, w, 22);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(info.status, pad, h - 11);

        ctx.restore();
    }

    /**
     * Update external telemetry UI widgets
     */
    updateDmsDomTelemetry(frame) {
        if (!frame || !frame.dms) return;
        const dms = frame.dms;

        const elStatus = document.getElementById('dms-status-pill');
        const elPerclos = document.getElementById('dms-perclos-val');
        const elBlink = document.getElementById('dms-blink-val');
        const elScore = document.getElementById('dms-score-val');
        const elPhone = document.getElementById('dms-phone-val');
        const elBelt = document.getElementById('dms-belt-val');

        if (elStatus) {
            elStatus.textContent = dms.statusLabel || 'NORMAL';
            elStatus.className = `dms-badge status-${(dms.driverStatus || 'normal').toLowerCase()}`;
        }
        if (elPerclos) elPerclos.textContent = `${dms.perclos}%`;
        if (elBlink) elBlink.textContent = `${dms.blinkRate} bpm`;
        if (elScore) elScore.textContent = `${dms.score}%`;
        if (elPhone) {
            elPhone.textContent = dms.phoneDetected ? '¡DETECTADO!' : 'NO';
            elPhone.style.color = dms.phoneDetected ? 'var(--red-alert)' : '#10b981';
        }
        if (elBelt) {
            elBelt.textContent = dms.seatbeltBuckled ? 'ABROCHADO' : 'DESABROCHADO';
            elBelt.style.color = dms.seatbeltBuckled ? '#10b981' : 'var(--red-alert)';
        }
    }
}

// Global browser export
window.MultiCameraEngine = MultiCameraEngine;
