/**
 * ApexDash Telemetry - Dashcam Video Player & AR / ADAS HUD Overlay
 * Features:
 * - Real HTML5 video playback synchronized to telemetry timestamp.
 * - High-definition procedural 3D road/dashcam perspective simulator when no local video file is loaded.
 * - Dynamic AR ADAS overlay: projected lane guides, bounding boxes with distance/TTC, artificial horizon, and collision warning banners.
 */

class DashcamHudOverlay {
    constructor(canvasElement, videoElement, engine) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.video = videoElement;
        this.engine = engine;

        this.hasCustomVideo = false;
        this.roadZOffset = 0;
        this.camShakeX = 0;
        this.camShakeY = 0;

        // Visual HUD toggle states
        this.showAdasBoxes = true;
        this.showLaneTracking = true;
        this.showArtificialHorizon = true;
        this.showTelemetryOverlay = true;

        this._setupVideoSync();
        this._setupResize();
    }

    _setupResize() {
        const resize = () => {
            const rect = this.canvas.getBoundingClientRect();
            if (rect.width && rect.height) {
                this.canvas.width = Math.round(rect.width * window.devicePixelRatio || 1);
                this.canvas.height = Math.round(rect.height * window.devicePixelRatio || 1);
            }
        };
        window.addEventListener('resize', resize);
        setTimeout(resize, 100);
    }

    _setupVideoSync() {
        // Sync custom video with engine
        this.engine.on('play', () => {
            if (this.hasCustomVideo && this.video.paused) {
                this.video.playbackRate = this.engine.playbackRate;
                this.video.play().catch(e => console.warn('Video play error:', e));
            }
        });

        this.engine.on('pause', () => {
            if (this.hasCustomVideo && !this.video.paused) {
                this.video.pause();
            }
        });

        this.engine.on('seek', (data) => {
            if (this.hasCustomVideo) {
                this.video.currentTime = data.time;
            }
        });

        this.engine.on('frame', (frame) => {
            this.render(frame);
        });
    }

    loadCustomVideoFile(file) {
        const url = URL.createObjectURL(file);
        this.video.src = url;
        this.video.style.display = 'block';
        this.hasCustomVideo = true;
        this.video.currentTime = this.engine.currentTime;
        if (this.engine.isPlaying) {
            this.video.play().catch(e => console.warn(e));
        }
    }

    unloadCustomVideo() {
        if (this.hasCustomVideo) {
            this.video.pause();
            this.video.src = '';
            this.video.style.display = 'none';
            this.hasCustomVideo = false;
        }
    }

    render(frame) {
        if (!frame) return;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const ctx = this.ctx;

        ctx.save();
        ctx.clearRect(0, 0, w, h);

        // Subtle camera vibration based on speed & vertical Gs
        if (this.engine.isPlaying && frame.speed > 5) {
            const shakeAmp = (frame.speed / 100) * (frame.gVert > 1.05 ? 3.5 : 1.2);
            this.camShakeX = (Math.random() - 0.5) * shakeAmp;
            this.camShakeY = (Math.random() - 0.5) * shakeAmp;
            ctx.translate(this.camShakeX, this.camShakeY);
        }

        // If no user video file is loaded, render the realistic procedural 3D road dashcam simulation
        if (!this.hasCustomVideo) {
            this._renderProceduralDashcamView(ctx, w, h, frame);
        }

        // Render AR ADAS & Telemetry HUD on top
        this._renderAdasHUD(ctx, w, h, frame);

        ctx.restore();
    }

    /**
     * Procedural Dashcam Perspective World
     */
    _renderProceduralDashcamView(ctx, w, h, frame) {
        const horizonY = h * 0.44;
        const speedKmh = frame.speed || 0;
        const curveHeading = (frame.gLat || 0) * 120; // curve perspective displacement
        const vanishingX = (w * 0.5) - curveHeading;

        // 1. Sky & Atmosphere gradient
        const isNight = frame.time > 0 && Math.floor(frame.lat) % 2 === 1; // style variation
        const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        skyGrad.addColorStop(0, '#060a12');
        skyGrad.addColorStop(0.7, '#131e33');
        skyGrad.addColorStop(1.0, '#1f2e47');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, horizonY);

        // Distant mountain silhouette / city skyline
        ctx.fillStyle = '#0b1320';
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        const segments = 16;
        for (let i = 0; i <= segments; i++) {
            const sx = (w / segments) * i;
            const hillHeight = Math.sin(i * 0.8 + frame.heading * 0.05) * (h * 0.06) + (h * 0.05);
            ctx.lineTo(sx, horizonY - hillHeight);
        }
        ctx.lineTo(w, horizonY);
        ctx.closePath();
        ctx.fill();

        // 2. Ground / Terrain
        const groundGrad = ctx.createLinearGradient(0, horizonY, 0, h);
        groundGrad.addColorStop(0, '#11171d');
        groundGrad.addColorStop(0.3, '#161c22');
        groundGrad.addColorStop(1.0, '#1c242c');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, horizonY, w, h - horizonY);

        // 3. Asphalt Road (Perspective Trapezoid)
        const roadTopWidth = w * 0.08;
        const roadBottomWidth = w * 0.88;
        const roadTopLeft = vanishingX - roadTopWidth * 0.5;
        const roadTopRight = vanishingX + roadTopWidth * 0.5;
        const roadBottomLeft = (w * 0.5) - roadBottomWidth * 0.5;
        const roadBottomRight = (w * 0.5) + roadBottomWidth * 0.5;

        // Asphalt surface
        const roadGrad = ctx.createLinearGradient(0, horizonY, 0, h);
        roadGrad.addColorStop(0, '#222831');
        roadGrad.addColorStop(0.4, '#1f242b');
        roadGrad.addColorStop(1.0, '#181c20');
        ctx.fillStyle = roadGrad;

        ctx.beginPath();
        ctx.moveTo(roadTopLeft, horizonY);
        ctx.lineTo(roadTopRight, horizonY);
        ctx.lineTo(roadBottomRight, h);
        ctx.lineTo(roadBottomLeft, h);
        ctx.closePath();
        ctx.fill();

        // Road Curbs / Guardrails
        ctx.strokeStyle = '#ffb703';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(roadTopLeft, horizonY);
        ctx.lineTo(roadBottomLeft, h);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(roadTopRight, horizonY);
        ctx.lineTo(roadBottomRight, h);
        ctx.stroke();

        // 4. Moving Lane Markings
        // Advance road offset proportionally to speed
        if (this.engine.isPlaying) {
            const deltaSpeed = (speedKmh / 3.6) * 0.08;
            this.roadZOffset = (this.roadZOffset + deltaSpeed) % 1.0;
        }

        // Draw 3 lanes (2 lane dividers)
        const lanes = [-0.33, 0.33];
        lanes.forEach(offset => {
            const topX = vanishingX + (roadTopWidth * 0.5 * offset);
            const botX = (w * 0.5) + (roadBottomWidth * 0.5 * offset);

            const numDashes = 14;
            for (let d = 0; d < numDashes; d++) {
                const zNorm = ((d / numDashes) + this.roadZOffset / numDashes) % 1.0;
                // Non-linear projection for perspective depth (z^2)
                const perspT = Math.pow(zNorm, 2.2);

                const dashY = horizonY + (h - horizonY) * perspT;
                const nextT = Math.pow(Math.min(1.0, zNorm + 0.04), 2.2);
                const nextDashY = horizonY + (h - horizonY) * nextT;

                const curX = topX + (botX - topX) * perspT;
                const nextX = topX + (botX - topX) * nextT;

                const dashThickness = Math.max(1.5, perspT * 6.5);

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = dashThickness;
                ctx.beginPath();
                ctx.moveTo(curX, dashY);
                ctx.lineTo(nextX, nextDashY);
                ctx.stroke();
            }
        });

        // 5. Procedural Vehicles Ahead based on ADAS Telemetry objects
        if (frame.adas && frame.adas.objects && frame.adas.objects.length > 0) {
            frame.adas.objects.forEach(obj => {
                this._render3DCarAhead(ctx, w, h, horizonY, vanishingX, roadTopWidth, roadBottomWidth, obj);
            });
        }

        // 6. Dashcam Hood / Dashboard silhouette at bottom
        this._renderCarHood(ctx, w, h);
    }

    /**
     * Renders a 3D perspective vehicle ahead
     */
    _render3DCarAhead(ctx, w, h, horizonY, vanishingX, roadTopWidth, roadBottomWidth, obj) {
        // Distance in meters (e.g. 6m to 60m)
        const dist = Math.max(5, Math.min(70, obj.distanceMeters));
        const normDist = 1 - ((dist - 5) / 65); // 1 = right in front, 0 = at horizon
        const perspT = Math.pow(Math.max(0.08, normDist), 2.0);

        const carY = horizonY + (h - horizonY) * perspT;
        const roadWAtY = roadTopWidth + (roadBottomWidth - roadTopWidth) * perspT;
        const carCenterX = vanishingX + (obj.xOffset || 0) * (roadWAtY * 0.45);

        const carWidth = Math.max(14, roadWAtY * 0.22);
        const carHeight = carWidth * 0.75;

        // Vehicle body (rear view)
        const carLeft = carCenterX - carWidth * 0.5;
        const carTop = carY - carHeight;

        // Shadow under car
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.ellipse(carCenterX, carY, carWidth * 0.6, carHeight * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();

        // Car chassis
        ctx.fillStyle = obj.type === 'truck' ? '#374151' : (obj.warningLevel === 'danger' ? '#b91c1c' : '#1e293b');
        ctx.beginPath();
        ctx.roundRect(carLeft, carTop + carHeight * 0.25, carWidth, carHeight * 0.75, [4, 4, 2, 2]);
        ctx.fill();

        // Car cabin / glass
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(carLeft + carWidth * 0.12, carTop, carWidth * 0.76, carHeight * 0.45, [6, 6, 0, 0]);
        ctx.fill();

        // Taillights
        const isBraking = obj.warningLevel === 'danger';
        ctx.fillStyle = isBraking ? '#ff0033' : '#cc0022';
        ctx.shadowColor = '#ff0033';
        ctx.shadowBlur = isBraking ? 15 : 6;

        // Left taillight
        ctx.fillRect(carLeft + carWidth * 0.05, carTop + carHeight * 0.42, carWidth * 0.2, carHeight * 0.16);
        // Right taillight
        ctx.fillRect(carLeft + carWidth * 0.75, carTop + carHeight * 0.42, carWidth * 0.2, carHeight * 0.16);
        ctx.shadowBlur = 0; // reset
    }

    _renderCarHood(ctx, w, h) {
        ctx.save();
        ctx.fillStyle = '#0d1117';
        ctx.beginPath();
        ctx.moveTo(w * 0.15, h);
        ctx.quadraticCurveTo(w * 0.5, h - (h * 0.065), w * 0.85, h);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();

        // Glossy reflection line on hood
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.2, h);
        ctx.quadraticCurveTo(w * 0.5, h - (h * 0.06), w * 0.8, h);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * ADAS HUD Layer: Real-time dynamic bounding boxes, lane tracking lines, FCW alerts
     */
    _renderAdasHUD(ctx, w, h, frame) {
        const horizonY = h * 0.44;
        const curveHeading = (frame.gLat || 0) * 120;
        const vanishingX = (w * 0.5) - curveHeading;

        // 1. Projected AR Lane Guiding Lines
        if (this.showLaneTracking && frame.adas) {
            const isLeftDeparture = frame.adas.laneLeft?.departure;
            const isRightDeparture = frame.adas.laneRight?.departure;

            const laneColor = (isLeftDeparture || isRightDeparture)
                ? 'rgba(255, 51, 102, 0.85)' // Red alert!
                : 'rgba(0, 242, 254, 0.5)'; // Sleek cyan guide

            ctx.strokeStyle = laneColor;
            ctx.lineWidth = (isLeftDeparture || isRightDeparture) ? 4 : 2.5;
            ctx.setLineDash([12, 8]);

            // Left track projected
            ctx.beginPath();
            ctx.moveTo(vanishingX - w * 0.04, horizonY + 10);
            ctx.lineTo(w * 0.18, h - 20);
            ctx.stroke();

            // Right track projected
            ctx.beginPath();
            ctx.moveTo(vanishingX + w * 0.04, horizonY + 10);
            ctx.lineTo(w * 0.82, h - 20);
            ctx.stroke();
            ctx.setLineDash([]); // reset

            // If departure, flash warning graphic
            if (isLeftDeparture || isRightDeparture) {
                this._renderLaneDepartureAlert(ctx, w, h, isLeftDeparture ? 'LEFT' : 'RIGHT');
            }
        }

        // 2. ADAS Vehicle Bounding Boxes & Distance Labels
        if (this.showAdasBoxes && frame.adas && frame.adas.objects) {
            frame.adas.objects.forEach(obj => {
                const dist = Math.max(5, Math.min(70, obj.distanceMeters));
                const normDist = 1 - ((dist - 5) / 65);
                const perspT = Math.pow(Math.max(0.08, normDist), 2.0);

                const roadWAtY = (w * 0.08) + ((w * 0.88) - (w * 0.08)) * perspT;
                const carY = horizonY + (h - horizonY) * perspT;
                const carCenterX = vanishingX + (obj.xOffset || 0) * (roadWAtY * 0.45);

                const boxW = Math.max(28, roadWAtY * 0.28);
                const boxH = boxW * 0.85;
                const boxLeft = carCenterX - boxW * 0.5;
                const boxTop = carY - boxH;

                let alertColor = '#00f2fe';
                let alertBadgeBg = 'rgba(0, 242, 254, 0.2)';
                if (obj.warningLevel === 'caution') {
                    alertColor = '#ffb703';
                    alertBadgeBg = 'rgba(255, 183, 3, 0.25)';
                } else if (obj.warningLevel === 'danger') {
                    alertColor = '#ff3366';
                    alertBadgeBg = 'rgba(255, 51, 102, 0.35)';
                }

                // Cyberpunk bracket style bounding box
                ctx.strokeStyle = alertColor;
                ctx.lineWidth = 2;
                const cornerSize = Math.min(12, boxW * 0.25);

                // Top-left corner
                ctx.beginPath();
                ctx.moveTo(boxLeft, boxTop + cornerSize);
                ctx.lineTo(boxLeft, boxTop);
                ctx.lineTo(boxLeft + cornerSize, boxTop);
                ctx.stroke();

                // Top-right corner
                ctx.beginPath();
                ctx.moveTo(boxLeft + boxW - cornerSize, boxTop);
                ctx.lineTo(boxLeft + boxW, boxTop);
                ctx.lineTo(boxLeft + boxW, boxTop + cornerSize);
                ctx.stroke();

                // Bottom-left corner
                ctx.beginPath();
                ctx.moveTo(boxLeft, boxTop + boxH - cornerSize);
                ctx.lineTo(boxLeft, boxTop + boxH);
                ctx.lineTo(boxLeft + cornerSize, boxTop + boxH);
                ctx.stroke();

                // Bottom-right corner
                ctx.beginPath();
                ctx.moveTo(boxLeft + boxW - cornerSize, boxTop + boxH);
                ctx.lineTo(boxLeft + boxW, boxTop + boxH);
                ctx.lineTo(boxLeft + boxW, boxTop + boxH - cornerSize);
                ctx.stroke();

                // Distance & Type label badge above bounding box
                const tagText = `${obj.type.toUpperCase()} • ${obj.distanceMeters.toFixed(1)}m`;
                ctx.font = 'bold 11px "JetBrains Mono", monospace';
                const tagMetrics = ctx.measureText(tagText);
                const tagW = tagMetrics.width + 12;
                const tagH = 18;

                ctx.fillStyle = alertBadgeBg;
                ctx.fillRect(boxLeft, boxTop - tagH - 3, tagW, tagH);
                ctx.strokeRect(boxLeft, boxTop - tagH - 3, tagW, tagH);

                ctx.fillStyle = '#ffffff';
                ctx.fillText(tagText, boxLeft + 6, boxTop - 8);

                // Distance headway time (TTC: Time To Collision)
                if (frame.speed > 5) {
                    const ttcSec = (obj.distanceMeters / (frame.speed / 3.6)).toFixed(1);
                    ctx.font = '10px "JetBrains Mono", monospace';
                    ctx.fillStyle = alertColor;
                    ctx.fillText(`TTC: ${ttcSec}s`, boxLeft, boxTop + boxH + 14);
                }
            });
        }

        // 3. Forward Collision Warning (FCW) Banner
        if (frame.adas && frame.adas.fcw) {
            this._renderFCWBanner(ctx, w, h);
        }

        // 4. Artificial Horizon (Pitch & Roll ladder)
        if (this.showArtificialHorizon) {
            this._renderArtificialHorizon(ctx, w, h, frame);
        }

        // 5. Dashcam Top HUD: REC indicator, timestamp, GPS and Compass ticker
        this._renderTopDashcamHeader(ctx, w, h, frame);
    }

    _renderFCWBanner(ctx, w, h) {
        ctx.save();
        const bannerW = Math.min(380, w * 0.7);
        const bannerH = 65;
        const bannerX = (w - bannerW) * 0.5;
        const bannerY = h * 0.22;

        ctx.fillStyle = 'rgba(255, 20, 60, 0.88)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = '900 20px "Orbitron", sans-serif';
        ctx.fillText('⚠️ FRENAR - ALERTA COLISIÓN ⚠️', w * 0.5, bannerY + 28);

        ctx.font = '600 12px "Outfit", sans-serif';
        ctx.fillText('DISTANCIA CRÍTICA CON OBJETO EN TRAYECTORIA', w * 0.5, bannerY + 48);
        ctx.restore();
    }

    _renderLaneDepartureAlert(ctx, w, h, direction) {
        ctx.save();
        const alertW = 260;
        const alertH = 34;
        const alertX = (w - alertW) * 0.5;
        const alertY = h * 0.82;

        ctx.fillStyle = 'rgba(255, 51, 102, 0.9)';
        ctx.beginPath();
        ctx.roundRect(alertX, alertY, alertW, alertH, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px "Orbitron", sans-serif';
        ctx.fillText(`🚨 SALIDA DE CARRIL: ${direction}`, w * 0.5, alertY + 21);
        ctx.restore();
    }

    _renderArtificialHorizon(ctx, w, h, frame) {
        ctx.save();
        const centerX = w * 0.12;
        const centerY = h * 0.38;
        const rollAngle = (frame.gLat || 0) * -0.22; // roll rad
        const pitchY = (frame.gLong || 0) * 25; // pitch offset

        ctx.translate(centerX, centerY);
        ctx.rotate(rollAngle);

        // Center reticle
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.8)';
        ctx.lineWidth = 2;

        // Ladder bars
        ctx.beginPath();
        // Zero horizon bar
        ctx.moveTo(-35, pitchY);
        ctx.lineTo(-12, pitchY);
        ctx.moveTo(12, pitchY);
        ctx.lineTo(35, pitchY);

        // +5 deg bar
        ctx.moveTo(-20, pitchY - 18);
        ctx.lineTo(-8, pitchY - 18);
        ctx.moveTo(8, pitchY - 18);
        ctx.lineTo(20, pitchY - 18);

        // -5 deg bar
        ctx.moveTo(-20, pitchY + 18);
        ctx.lineTo(-8, pitchY + 18);
        ctx.moveTo(8, pitchY + 18);
        ctx.lineTo(20, pitchY + 18);
        ctx.stroke();

        // Fixed aircraft symbol
        ctx.restore();
        ctx.strokeStyle = '#ffb703';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.moveTo(centerX - 15, centerY);
        ctx.lineTo(centerX - 5, centerY);
        ctx.moveTo(centerX + 5, centerY);
        ctx.lineTo(centerX + 15, centerY);
        ctx.stroke();

        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(0, 242, 254, 0.8)';
        ctx.fillText('PITCH/ROLL', centerX - 25, centerY + 42);
    }

    _renderTopDashcamHeader(ctx, w, h, frame) {
        // Top dark translucent bar
        ctx.fillStyle = 'rgba(11, 15, 23, 0.75)';
        ctx.fillRect(0, 0, w, 36);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 36);
        ctx.lineTo(w, 36);
        ctx.stroke();

        // 1. REC indicator (pulsing red dot)
        const isBlink = Math.floor(performance.now() / 600) % 2 === 0;
        ctx.fillStyle = isBlink ? '#ff3366' : '#770022';
        ctx.beginPath();
        ctx.arc(20, 18, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px "Orbitron", sans-serif';
        ctx.fillText('REC', 32, 22);

        // 2. High-precision Timecode: 00:MM:SS.mmm
        const totalSec = frame.time || 0;
        const mins = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const secs = Math.floor(totalSec % 60).toString().padStart(2, '0');
        const millis = Math.floor((totalSec % 1) * 1000).toString().padStart(3, '0');
        const timeStr = `00:${mins}:${secs}.${millis}`;

        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.fillStyle = '#00f2fe';
        ctx.fillText(timeStr, 80, 22);

        // 3. GPS Coordinates & Altitude
        const latStr = frame.lat ? frame.lat.toFixed(5) : '0.00000';
        const lngStr = frame.lng ? frame.lng.toFixed(5) : '0.00000';
        const gpsStr = `GPS: ${latStr}°N, ${lngStr}°W | ALT: ${frame.displayAltitude} ${frame.displayAltitudeUnit}`;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillText(gpsStr, 220, 22);

        // 4. Heading / Compass Ticker
        const heading = Math.round(frame.heading || 0);
        let cardinal = 'N';
        if (heading >= 337.5 || heading < 22.5) cardinal = 'N';
        else if (heading >= 22.5 && heading < 67.5) cardinal = 'NE';
        else if (heading >= 67.5 && heading < 112.5) cardinal = 'E';
        else if (heading >= 112.5 && heading < 157.5) cardinal = 'SE';
        else if (heading >= 157.5 && heading < 202.5) cardinal = 'S';
        else if (heading >= 202.5 && heading < 247.5) cardinal = 'SW';
        else if (heading >= 247.5 && heading < 292.5) cardinal = 'W';
        else cardinal = 'NW';

        const compStr = `BRG: ${heading.toString().padStart(3, '0')}° [${cardinal}]`;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffb703';
        ctx.fillText(compStr, w - 16, 22);
        ctx.textAlign = 'left'; // reset
    }
}

// Global exposure
window.DashcamHudOverlay = DashcamHudOverlay;
