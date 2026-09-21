/**
 * ApexDash Telemetry - Digital Cockpit Gauges & G-Force Friction Circle
 * High-performance 60FPS Canvas rendering for automotive instruments.
 */

class CockpitGauges {
    constructor(speedCanvas, gForceCanvas, engine) {
        this.speedCanvas = speedCanvas;
        this.speedCtx = speedCanvas.getContext('2d');
        this.gCanvas = gForceCanvas;
        this.gCtx = gForceCanvas.getContext('2d');
        this.engine = engine;

        // G-force trail history
        this.gTrail = [];
        this.maxTrailLength = 24;
        this.peakLatG = 0;
        this.peakLongG = 0;

        this._setupResize();
        this._setupEngine();
    }

    _setupResize() {
        const resize = () => {
            if (this.speedCanvas) {
                const rect = this.speedCanvas.getBoundingClientRect();
                this.speedCanvas.width = Math.round(rect.width * window.devicePixelRatio || 1);
                this.speedCanvas.height = Math.round(rect.height * window.devicePixelRatio || 1);
            }
            if (this.gCanvas) {
                const rect = this.gCanvas.getBoundingClientRect();
                this.gCanvas.width = Math.round(rect.width * window.devicePixelRatio || 1);
                this.gCanvas.height = Math.round(rect.height * window.devicePixelRatio || 1);
            }
        };
        window.addEventListener('resize', resize);
        setTimeout(resize, 100);
    }

    _setupEngine() {
        this.engine.on('frame', (frame) => {
            this.renderSpeedometer(frame);
            this.renderGForce(frame);
            this.updateDomMeters(frame);
        });

        this.engine.on('datasetChange', () => {
            this.gTrail = [];
            this.peakLatG = 0;
            this.peakLongG = 0;
        });
    }

    /**
     * Update DOM-based linear bars (Throttle, Brake, Gear)
     */
    updateDomMeters(frame) {
        // Throttle & Brake bars
        const throttleBar = document.getElementById('meter-throttle-fill');
        const throttleVal = document.getElementById('meter-throttle-val');
        const brakeBar = document.getElementById('meter-brake-fill');
        const brakeVal = document.getElementById('meter-brake-val');
        const gearVal = document.getElementById('meter-gear-val');
        const rpmVal = document.getElementById('meter-rpm-val');

        if (throttleBar) throttleBar.style.height = `${frame.throttle}%`;
        if (throttleVal) throttleVal.textContent = `${frame.throttle}%`;

        if (brakeBar) {
            brakeBar.style.height = `${frame.brake}%`;
            if (frame.brake > 60) {
                brakeBar.classList.add('pulse-critical');
            } else {
                brakeBar.classList.remove('pulse-critical');
            }
        }
        if (brakeVal) brakeVal.textContent = `${frame.brake}%`;

        if (gearVal) gearVal.textContent = frame.gear;
        if (rpmVal) rpmVal.textContent = `${frame.rpm} RPM`;

        // Update shift lights bar (10 segments)
        const shiftSegments = document.querySelectorAll('.shift-light');
        if (shiftSegments.length > 0) {
            const rpmPercent = Math.min(1.0, (frame.rpm - 1000) / 6000);
            const activeCount = Math.round(rpmPercent * shiftSegments.length);
            shiftSegments.forEach((seg, idx) => {
                if (idx < activeCount) {
                    seg.classList.add('active');
                } else {
                    seg.classList.remove('active');
                }
            });
        }
    }

    /**
     * Render Circular Speedometer & Tachometer Combo Dial
     */
    renderSpeedometer(frame) {
        const ctx = this.speedCtx;
        const w = this.speedCanvas.width;
        const h = this.speedCanvas.height;
        if (!w || !h) return;

        ctx.clearRect(0, 0, w, h);

        const cx = w * 0.5;
        const cy = h * 0.52;
        const radius = Math.min(w, h) * 0.42;

        const maxSpeed = this.engine.unitSystem === 'imperial' ? 160 : 240;
        const currentSpeed = frame.displaySpeedExact || 0;
        const speedRatio = Math.min(1.0, currentSpeed / maxSpeed);

        // Arc range: 135 deg to 405 deg (270 degree sweep)
        const startAngle = (135 * Math.PI) / 180;
        const endAngle = (405 * Math.PI) / 180;
        const totalSweep = endAngle - startAngle;

        // 1. Background Track Arc
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.stroke();

        // 2. Active Speed Gradient Arc
        if (speedRatio > 0.005) {
            const currentAngle = startAngle + (totalSweep * speedRatio);
            const speedGrad = ctx.createLinearGradient(0, h, w, 0);
            speedGrad.addColorStop(0, '#00f2fe');
            speedGrad.addColorStop(0.6, '#4facfe');
            speedGrad.addColorStop(1.0, '#ff3366');

            ctx.lineWidth = 14;
            ctx.strokeStyle = speedGrad;
            ctx.shadowColor = speedRatio > 0.7 ? '#ff3366' : '#00f2fe';
            ctx.shadowBlur = 12;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, currentAngle);
            ctx.stroke();
            ctx.shadowBlur = 0; // reset
        }

        // 3. Tick Marks
        const numTicks = 24;
        for (let i = 0; i <= numTicks; i++) {
            const angle = startAngle + (totalSweep * (i / numTicks));
            const isMajor = i % 4 === 0;
            const tickLen = isMajor ? 12 : 6;
            const innerR = radius - 14 - tickLen;
            const outerR = radius - 14;

            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            ctx.lineWidth = isMajor ? 2.5 : 1.2;
            ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.2)';

            ctx.beginPath();
            ctx.moveTo(cx + innerR * cos, cy + innerR * sin);
            ctx.lineTo(cx + outerR * cos, cy + outerR * sin);
            ctx.stroke();

            // Major Tick Numbers
            if (isMajor) {
                const labelSpeed = Math.round((i / numTicks) * maxSpeed);
                const textR = innerR - 14;
                ctx.font = '10px "JetBrains Mono", monospace';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelSpeed, cx + textR * cos, cy + textR * sin);
            }
        }

        // 4. Large Digital Speed Readout in Center
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 48px "Orbitron", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 242, 254, 0.4)';
        ctx.shadowBlur = 10;
        ctx.fillText(frame.displaySpeed, cx, cy - 8);
        ctx.shadowBlur = 0;

        // Speed Unit Badge (KM/H or MPH)
        ctx.font = 'bold 12px "Orbitron", sans-serif';
        ctx.fillStyle = '#00f2fe';
        ctx.fillText(frame.displaySpeedUnit, cx, cy + 24);

        // Subtitle: Gear and RPM
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillText(`ENG: ${frame.rpm} RPM`, cx, cy + 44);
    }

    /**
     * Render G-Force Friction Circle (IMU Accelerometer)
     */
    renderGForce(frame) {
        const ctx = this.gCtx;
        const w = this.gCanvas.width;
        const h = this.gCanvas.height;
        if (!w || !h) return;

        ctx.clearRect(0, 0, w, h);

        const cx = w * 0.5;
        const cy = h * 0.5;
        const maxDisplayG = 1.2; // 1.2G at outer rim
        const radius = Math.min(w, h) * 0.42;

        // Track peaks
        const curLat = Math.abs(frame.gLat || 0);
        const curLong = Math.abs(frame.gLong || 0);
        if (curLat > this.peakLatG) this.peakLatG = curLat;
        if (curLong > this.peakLongG) this.peakLongG = curLong;

        // 1. Concentric G-Force Rings
        const rings = [0.3, 0.6, 0.9, 1.2];
        rings.forEach(gVal => {
            const r = (gVal / maxDisplayG) * radius;
            ctx.lineWidth = 1;
            ctx.strokeStyle = gVal >= 1.0 ? 'rgba(255, 51, 102, 0.35)' : 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();

            // Label
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.textAlign = 'center';
            ctx.fillText(`${gVal}G`, cx, cy - r - 2);
        });

        // 2. Crosshairs
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(cx - radius, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy + radius);
        ctx.stroke();

        // Crosshair labels: ACCEL, BRAKE, L, R
        ctx.font = '9px "Orbitron", sans-serif';
        ctx.fillStyle = 'rgba(0, 242, 254, 0.7)';
        ctx.fillText('ACCEL', cx, cy - radius + 12);
        ctx.fillText('BRAKE', cx, cy + radius - 4);
        ctx.textAlign = 'left';
        ctx.fillText('L', cx - radius + 6, cy - 4);
        ctx.textAlign = 'right';
        ctx.fillText('R', cx + radius - 6, cy - 4);

        // 3. Update Motion Trail
        // X = Lateral (+ right, - left)
        // Y = Longitudinal (+ accel is up, - brake is down)
        const gX = (frame.gLat || 0);
        const gY = -(frame.gLong || 0); // invert so accel goes UP, brake DOWN

        const ptX = cx + (gX / maxDisplayG) * radius;
        const ptY = cy + (gY / maxDisplayG) * radius;

        this.gTrail.push({ x: ptX, y: ptY, totalG: frame.totalG });
        if (this.gTrail.length > this.maxTrailLength) {
            this.gTrail.shift();
        }

        // Draw trail lines
        if (this.gTrail.length > 1) {
            for (let i = 1; i < this.gTrail.length; i++) {
                const alpha = (i / this.gTrail.length) * 0.5;
                ctx.strokeStyle = `rgba(0, 242, 254, ${alpha})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(this.gTrail[i - 1].x, this.gTrail[i - 1].y);
                ctx.lineTo(this.gTrail[i].x, this.gTrail[i].y);
                ctx.stroke();
            }
        }

        // 4. Current G Point (Glowing Beacon)
        const isHarsh = frame.totalG > 0.65;
        const pointColor = isHarsh ? '#ff3366' : '#00f2fe';

        ctx.shadowColor = pointColor;
        ctx.shadowBlur = isHarsh ? 18 : 8;
        ctx.fillStyle = pointColor;
        ctx.beginPath();
        ctx.arc(ptX, ptY, isHarsh ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ptX, ptY, isHarsh ? 11 : 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset

        // 5. Numerical readout at bottom
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillStyle = isHarsh ? '#ff3366' : '#ffffff';
        ctx.fillText(`TOTAL: ${frame.totalG.toFixed(2)} G`, cx, cy + radius + 18);

        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillText(`LAT: ${frame.gLat > 0 ? '+' : ''}${frame.gLat.toFixed(2)}G | LON: ${frame.gLong > 0 ? '+' : ''}${frame.gLong.toFixed(2)}G`, cx, cy + radius + 32);

        // Update DOM peak displays
        const peakLatEl = document.getElementById('g-peak-lat');
        const peakLongEl = document.getElementById('g-peak-long');
        if (peakLatEl) peakLatEl.textContent = `${this.peakLatG.toFixed(2)}G`;
        if (peakLongEl) peakLongEl.textContent = `${this.peakLongG.toFixed(2)}G`;
    }
}

// Global exposure
window.CockpitGauges = CockpitGauges;
