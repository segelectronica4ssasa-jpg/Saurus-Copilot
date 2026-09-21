/**
 * ApexDash Telemetry - Core Telemetry Engine
 * Master timekeeper, high-precision interpolator, incident tracker, and file importer.
 */

class TelemetryEngine {
    constructor() {
        this.data = null;
        this.currentTime = 0;
        this.duration = 0;
        this.isPlaying = false;
        this.playbackRate = 1.0;
        this.unitSystem = 'metric'; // 'metric' (km/h) or 'imperial' (mph)
        this.listeners = {
            frame: [],
            play: [],
            pause: [],
            seek: [],
            datasetChange: [],
            incident: []
        };
        this.lastRafTimestamp = null;
        this.activeIncidentIndex = -1;
        this.loop = true;

        this._tick = this._tick.bind(this);
    }

    /**
     * Load a dataset object: { points: [...], incidents: [...], totalDuration: N }
     */
    loadDataset(dataset, name = 'Demostración') {
        if (!dataset || !dataset.points || dataset.points.length === 0) {
            console.error('Invalid telemetry dataset');
            return false;
        }

        this.pause();
        this.data = dataset;
        this.duration = dataset.totalDuration || dataset.points[dataset.points.length - 1].time;
        this.currentTime = 0;
        this.activeIncidentIndex = -1;

        // Ensure every incident has complete clip metadata
        if (dataset.incidents && Array.isArray(dataset.incidents)) {
            dataset.incidents = dataset.incidents.map((inc, idx) => {
                const t = inc.time || 0;
                const clipStart = inc.clipStart !== undefined ? inc.clipStart : Math.max(0, +(t - 3.0).toFixed(1));
                const clipEnd = inc.clipEnd !== undefined ? inc.clipEnd : +(t + 3.0).toFixed(1);
                const clipTitle = inc.clipTitle || `clip_${(inc.type || 'alert').toLowerCase()}_${t.toFixed(1)}s.mp4`;
                const clipUrl = inc.clipUrl || `https://telematics.copilot.net/evidence/${clipTitle}`;
                return {
                    id: inc.id || `inc-${idx + 1}`,
                    clipStart,
                    clipEnd,
                    clipTitle,
                    clipUrl,
                    ...inc
                };
            });
            this.data.incidents = dataset.incidents;
        }

        this.emit('datasetChange', {
            name,
            duration: this.duration,
            pointCount: dataset.points.length,
            incidents: dataset.incidents || []
        });

        // Trigger initial frame
        this.emitFrame();
        return true;
    }

    /**
     * Subscribe to engine events
     */
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    emit(event, payload) {
        if (this.listeners[event]) {
            for (let cb of this.listeners[event]) {
                try {
                    cb(payload);
                } catch (e) {
                    console.error(`Error in listener for ${event}:`, e);
                }
            }
        }
    }

    play() {
        if (this.isPlaying || !this.data) return;
        this.isPlaying = true;
        this.lastRafTimestamp = performance.now();
        requestAnimationFrame(this._tick);
        this.emit('play', { time: this.currentTime });
    }

    pause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.emit('pause', { time: this.currentTime });
    }

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    setPlaybackRate(rate) {
        this.playbackRate = Math.max(0.25, Math.min(8.0, rate));
    }

    setUnitSystem(unit) {
        this.unitSystem = unit === 'imperial' ? 'imperial' : 'metric';
        this.emitFrame();
    }

    seek(time) {
        if (!this.data) return;
        this.currentTime = Math.max(0, Math.min(this.duration, time));
        this.emit('seek', { time: this.currentTime });
        this.emitFrame();
    }

    seekRelative(seconds) {
        this.seek(this.currentTime + seconds);
    }

    /**
     * Jump directly to an incident by index
     */
    jumpToIncident(index) {
        if (!this.data || !this.data.incidents || !this.data.incidents[index]) return;
        this.activeIncidentIndex = index;
        const inc = this.data.incidents[index];
        // Rewind 2 seconds before incident for context
        this.seek(Math.max(0, inc.time - 2.0));
        this.emit('incident', { incident: inc, index });
    }

    jumpNextIncident() {
        if (!this.data || !this.data.incidents || this.data.incidents.length === 0) return;
        const nextIdx = this.data.incidents.findIndex(inc => inc.time > this.currentTime + 0.5);
        if (nextIdx !== -1) {
            this.jumpToIncident(nextIdx);
        } else {
            this.jumpToIncident(0);
        }
    }

    jumpPrevIncident() {
        if (!this.data || !this.data.incidents || this.data.incidents.length === 0) return;
        for (let i = this.data.incidents.length - 1; i >= 0; i--) {
            if (this.data.incidents[i].time < this.currentTime - 1.0) {
                this.jumpToIncident(i);
                return;
            }
        }
        this.jumpToIncident(this.data.incidents.length - 1);
    }

    /**
     * Internal animation loop tick
     */
    _tick(now) {
        if (!this.isPlaying) return;

        const deltaSeconds = (now - this.lastRafTimestamp) / 1000;
        this.lastRafTimestamp = now;

        this.currentTime += deltaSeconds * this.playbackRate;

        if (this.currentTime >= this.duration) {
            if (this.loop) {
                this.currentTime = 0;
            } else {
                this.currentTime = this.duration;
                this.pause();
                this.emitFrame();
                return;
            }
        }

        this.emitFrame();
        requestAnimationFrame(this._tick);
    }

    /**
     * Interpolates telemetry at currentTime and notifies listeners
     */
    emitFrame() {
        const frame = this.getInterpolatedFrame(this.currentTime);
        if (!frame) return;
        this.emit('frame', frame);
    }

    /**
     * High precision frame interpolation
     */
    getInterpolatedFrame(time) {
        if (!this.data || !this.data.points || this.data.points.length === 0) return null;

        const points = this.data.points;

        // Boundary cases
        if (time <= points[0].time) return this._formatPoint(points[0]);
        if (time >= points[points.length - 1].time) return this._formatPoint(points[points.length - 1]);

        // Binary search for surrounding points
        let low = 0;
        let high = points.length - 1;

        while (low <= high) {
            const mid = (low + high) >> 1;
            if (points[mid].time < time) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        const p0 = points[Math.max(0, low - 1)];
        const p1 = points[Math.min(points.length - 1, low)];

        if (p0 === p1 || p1.time === p0.time) return this._formatPoint(p0);

        const alpha = (time - p0.time) / (p1.time - p0.time);

        // Linear interpolations
        const lerp = (a, b, t) => a + (b - a) * t;

        // Angle interpolation (shortest path around 360)
        const lerpHeading = (a, b, t) => {
            let diff = (b - a) % 360;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            let result = (a + diff * t) % 360;
            return result < 0 ? result + 360 : result;
        };

        const interpolated = {
            time,
            lat: lerp(p0.lat, p1.lat, alpha),
            lng: lerp(p0.lng, p1.lng, alpha),
            altitude: lerp(p0.altitude, p1.altitude, alpha),
            speed: lerp(p0.speed, p1.speed, alpha),
            rpm: Math.round(lerp(p0.rpm, p1.rpm, alpha)),
            gear: alpha < 0.5 ? p0.gear : p1.gear,
            throttle: Math.round(lerp(p0.throttle, p1.throttle, alpha)),
            brake: Math.round(lerp(p0.brake, p1.brake, alpha)),
            gLat: lerp(p0.gLat, p1.gLat, alpha),
            gLong: lerp(p0.gLong, p1.gLong, alpha),
            gVert: lerp(p0.gVert, p1.gVert, alpha),
            heading: lerpHeading(p0.heading, p1.heading, alpha),
            adas: p1.adas || p0.adas || {},
            dms: p1.dms || p0.dms || null,
            bsd: p1.bsd || p0.bsd || null,
            rear: p1.rear || p0.rear || null,
            events: p1.events && p1.events.length ? p1.events : (p0.events || [])
        };

        return this._formatPoint(interpolated);
    }

    _formatPoint(pt) {
        const isImperial = this.unitSystem === 'imperial';
        const displaySpeed = isImperial ? pt.speed * 0.621371 : pt.speed;
        const displaySpeedUnit = isImperial ? 'MPH' : 'KM/H';
        const displayAltitude = isImperial ? pt.altitude * 3.28084 : pt.altitude;
        const displayAltitudeUnit = isImperial ? 'FT' : 'M';

        // Calculate resultant G
        const totalG = Math.sqrt(pt.gLat * pt.gLat + pt.gLong * pt.gLong);

        return {
            ...pt,
            displaySpeed: Math.round(displaySpeed),
            displaySpeedExact: displaySpeed,
            displaySpeedUnit,
            displayAltitude: Math.round(displayAltitude),
            displayAltitudeUnit,
            totalG: +totalG.toFixed(2),
            progressPercent: this.duration > 0 ? (pt.time / this.duration) * 100 : 0
        };
    }

    /**
     * Import custom telemetry data (JSON, GPX, or CSV)
     */
    async importFromFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        const content = await file.text();

        if (extension === 'json') {
            return this._parseJSON(content, file.name);
        } else if (extension === 'gpx') {
            return this._parseGPX(content, file.name);
        } else if (extension === 'csv') {
            return this._parseCSV(content, file.name);
        } else {
            throw new Error(`Formato no soportado (.${extension}). Utilice JSON, GPX o CSV.`);
        }
    }

    _parseJSON(text, fileName) {
        const parsed = JSON.parse(text);
        let points = [];
        let incidents = [];

        if (Array.isArray(parsed)) {
            points = parsed;
        } else if (parsed.points) {
            points = parsed.points;
            incidents = parsed.incidents || [];
        } else {
            throw new Error('Estructura JSON inválida. Debe contener un array de puntos de telemetría.');
        }

        // Normalize points
        const normalized = points.map((p, idx) => ({
            time: p.time !== undefined ? +p.time : idx * 0.1,
            lat: +p.lat || 0,
            lng: +p.lng || 0,
            altitude: +(p.altitude || p.alt || 0),
            speed: +(p.speed || 0),
            rpm: +(p.rpm || 1500),
            gear: p.gear ? String(p.gear) : 'D',
            throttle: +(p.throttle || 20),
            brake: +(p.brake || 0),
            gLat: +(p.gLat || 0),
            gLong: +(p.gLong || 0),
            gVert: +(p.gVert || 1.0),
            heading: +(p.heading || 0),
            adas: p.adas || { objects: [], laneLeft: { detected: true }, laneRight: { detected: true }, fcw: false },
            events: p.events || []
        })).sort((a, b) => a.time - b.time);

        const duration = normalized[normalized.length - 1].time;
        return this.loadDataset({ points: normalized, incidents, totalDuration: duration }, fileName);
    }

    _parseGPX(gpxText, fileName) {
        const parser = new DOMParser();
        const xml = parser.parseFromString(gpxText, 'text/xml');
        const trkpts = xml.querySelectorAll('trkpt');

        if (!trkpts || trkpts.length === 0) {
            throw new Error('El archivo GPX no contiene puntos de track (<trkpt>).');
        }

        const points = [];
        let startTime = null;
        let lastLat = null;
        let lastLng = null;
        let lastTimeSec = 0;

        trkpts.forEach((pt, index) => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lng = parseFloat(pt.getAttribute('lon'));
            const eleNode = pt.querySelector('ele');
            const timeNode = pt.querySelector('time');
            const speedNode = pt.querySelector('speed');

            const altitude = eleNode ? parseFloat(eleNode.textContent) : 0;
            let timeSec = index * 1.0;

            if (timeNode) {
                const date = new Date(timeNode.textContent).getTime();
                if (!startTime) startTime = date;
                timeSec = (date - startTime) / 1000;
            }

            let speed = speedNode ? parseFloat(speedNode.textContent) * 3.6 : 0; // m/s to km/h
            let heading = 0;

            if (lastLat !== null && lastLng !== null) {
                const dt = Math.max(0.1, timeSec - lastTimeSec);
                const dLat = (lat - lastLat) * 111111;
                const dLng = (lng - lastLng) * (111111 * Math.cos((lat * Math.PI) / 180));
                const distM = Math.sqrt(dLat * dLat + dLng * dLng);

                if (!speedNode) {
                    speed = (distM / dt) * 3.6;
                }

                heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
            }

            lastLat = lat;
            lastLng = lng;
            lastTimeSec = timeSec;

            // Approximate G-forces based on speed delta
            const gLong = index > 0 ? ((speed - (points[index - 1]?.speed || speed)) / 3.6) / 9.81 : 0;

            points.push({
                time: +timeSec.toFixed(2),
                lat,
                lng,
                altitude: +altitude.toFixed(1),
                speed: +Math.min(250, Math.max(0, speed)).toFixed(1),
                rpm: Math.min(6500, Math.max(800, Math.round(speed * 35))),
                gear: speed > 80 ? '5' : (speed > 50 ? '4' : (speed > 20 ? '2' : '1')),
                throttle: speed > 10 ? 40 : 10,
                brake: gLong < -0.1 ? Math.min(100, Math.abs(gLong) * 120) : 0,
                gLat: 0,
                gLong: +gLong.toFixed(3),
                gVert: 1.0,
                heading: +heading.toFixed(1),
                adas: { objects: [], laneLeft: { detected: true }, laneRight: { detected: true } },
                events: []
            });
        });

        const duration = points[points.length - 1].time;
        return this.loadDataset({ points, incidents: [], totalDuration: duration }, fileName);
    }

    _parseCSV(csvText, fileName) {
        const lines = csvText.trim().split(/\r?\n/);
        if (lines.length < 2) throw new Error('Archivo CSV vacío o sin cabeceras.');

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const timeCol = headers.findIndex(h => h.includes('time') || h.includes('timestamp') || h.includes('sec'));
        const speedCol = headers.findIndex(h => h.includes('speed') || h.includes('spd') || h.includes('velocidad'));
        const rpmCol = headers.findIndex(h => h.includes('rpm'));
        const latCol = headers.findIndex(h => h.includes('lat'));
        const lngCol = headers.findIndex(h => h.includes('lon') || h.includes('lng'));

        const points = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim());
            if (cols.length < 2) continue;

            const time = timeCol !== -1 ? parseFloat(cols[timeCol]) : (i - 1) * 0.5;
            const speed = speedCol !== -1 ? parseFloat(cols[speedCol]) : 0;
            const rpm = rpmCol !== -1 ? parseFloat(cols[rpmCol]) : 1500;
            const lat = latCol !== -1 ? parseFloat(cols[latCol]) : 40.4168;
            const lng = lngCol !== -1 ? parseFloat(cols[lngCol]) : -3.7038;

            points.push({
                time: isNaN(time) ? (i - 1) * 0.5 : time,
                lat: isNaN(lat) ? 40.4168 : lat,
                lng: isNaN(lng) ? -3.7038 : lng,
                altitude: 600,
                speed: isNaN(speed) ? 0 : speed,
                rpm: isNaN(rpm) ? 1500 : rpm,
                gear: speed > 60 ? '4' : '2',
                throttle: speed > 0 ? 35 : 0,
                brake: 0,
                gLat: 0,
                gLong: 0,
                gVert: 1.0,
                heading: 0,
                adas: { objects: [], laneLeft: { detected: true }, laneRight: { detected: true } },
                events: []
            });
        }

        const duration = points[points.length - 1].time;
        return this.loadDataset({ points, incidents: [], totalDuration: duration }, fileName);
    }
}

// Global exposure
window.TelemetryEngine = TelemetryEngine;
