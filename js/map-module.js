/**
 * ApexDash Telemetry - Interactive GPS Cartography & Route Heatmap
 * Powered by Leaflet.js with Dark Matter styling, dynamic heading vehicle marker,
 * speed-colored path segments, and clickable incident pins.
 */

class TelemetryMapModule {
    constructor(mapContainerId, engine) {
        this.containerId = mapContainerId;
        this.engine = engine;
        this.map = null;
        this.carMarker = null;
        this.routePolyline = null;
        this.heatmapSegments = [];
        this.incidentMarkers = [];
        this.autoPan = true;
        this.isInitialized = false;

        this._initMap();
        this._setupEngineSync();
    }

    _initMap() {
        if (typeof L === 'undefined') {
            console.error('Leaflet.js is not loaded');
            return;
        }

        // Default start center (Madrid, Spain or generic)
        this.map = L.map(this.containerId, {
            center: [40.4168, -3.7038],
            zoom: 15,
            zoomControl: false,
            attributionControl: false
        });

        // Dark Matter tiles for sleek cyber/cockpit aesthetic
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(this.map);

        // Zoom control in top right
        L.control.zoom({ position: 'topright' }).addTo(this.map);

        // Custom Vehicle Marker Icon with Directional Arrow & Glow
        const carIcon = L.divIcon({
            className: 'custom-car-marker-container',
            html: `
                <div class="car-marker-pulse"></div>
                <div class="car-marker-heading" id="car-marker-arrow">
                    <svg viewBox="0 0 24 24" width="28" height="28">
                        <polygon points="12,2 22,21 12,17 2,21" fill="#00f2fe" stroke="#ffffff" stroke-width="2"/>
                    </svg>
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        this.carMarker = L.marker([40.4168, -3.7038], { icon: carIcon }).addTo(this.map);

        // Allow user dragging map to temporarily disable autoPan
        this.map.on('dragstart', () => {
            this.autoPan = false;
            const btn = document.getElementById('btn-map-recenter');
            if (btn) btn.classList.add('visible');
        });

        this.isInitialized = true;
    }

    _setupEngineSync() {
        this.engine.on('datasetChange', () => {
            this.plotDatasetRoute();
        });

        this.engine.on('frame', (frame) => {
            this.updateVehiclePosition(frame);
        });
    }

    plotDatasetRoute() {
        if (!this.isInitialized || !this.engine.data || !this.engine.data.points) return;

        const points = this.engine.data.points;
        const incidents = this.engine.data.incidents || [];

        // Clear existing route and markers
        if (this.routePolyline) {
            this.map.removeLayer(this.routePolyline);
        }
        this.heatmapSegments.forEach(seg => this.map.removeLayer(seg));
        this.heatmapSegments = [];
        this.incidentMarkers.forEach(m => this.map.removeLayer(m));
        this.incidentMarkers = [];

        const latLngs = points.map(p => [p.lat, p.lng]);

        // 1. Base Subtle Glow Route
        this.routePolyline = L.polyline(latLngs, {
            color: 'rgba(0, 242, 254, 0.25)',
            weight: 8,
            smoothFactor: 1
        }).addTo(this.map);

        // 2. Multi-color Heatmap Segments based on speed
        // Group into segments of 4 points to keep DOM light and smooth
        const step = 2;
        for (let i = 0; i < points.length - step; i += step) {
            const p1 = points[i];
            const p2 = points[Math.min(points.length - 1, i + step)];
            const avgSpeed = (p1.speed + p2.speed) * 0.5;

            // Speed color gradient (Cyan -> Lime -> Yellow -> Crimson)
            let segColor = '#00f2fe';
            if (avgSpeed > 110) segColor = '#ff3366';
            else if (avgSpeed > 80) segColor = '#ffb703';
            else if (avgSpeed > 45) segColor = '#00ff88';

            const seg = L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
                color: segColor,
                weight: 4,
                opacity: 0.85
            }).addTo(this.map);

            // Clicking any segment seeks to that time
            seg.on('click', () => {
                this.engine.seek(p1.time);
            });

            this.heatmapSegments.push(seg);
        }

        // 3. Incident Pins
        incidents.forEach((inc, index) => {
            const isCritical = inc.severity === 'CRITICAL';
            const pinColor = isCritical ? '#ff3366' : '#ffb703';
            const pinIcon = L.divIcon({
                className: 'incident-pin-container',
                html: `
                    <div class="incident-pin-badge ${isCritical ? 'critical' : 'warning'}" title="${inc.message}">
                        <span>${isCritical ? '⚠️' : '⚡'}</span>
                    </div>
                `,
                iconSize: [26, 26],
                iconAnchor: [13, 13]
            });

            const marker = L.marker([inc.lat, inc.lng], { icon: pinIcon }).addTo(this.map);
            marker.bindPopup(`
                <div class="incident-popup">
                    <strong style="color: ${pinColor}">${inc.type.replace(/_/g, ' ')}</strong>
                    <p style="margin: 4px 0 6px 0; font-size: 12px;">${inc.message}</p>
                    <div style="font-size: 11px; opacity: 0.7;">Tiempo: ${inc.time}s | Vel: ${inc.speed} km/h</div>
                    <button class="btn-popup-seek" onclick="window.apexApp.engine.jumpToIncident(${index})">Replay Incidente</button>
                </div>
            `);

            marker.on('click', () => {
                this.engine.jumpToIncident(index);
            });

            this.incidentMarkers.push(marker);
        });

        // Fit bounds to entire route
        if (latLngs.length > 0) {
            this.map.fitBounds(this.routePolyline.getBounds(), { padding: [40, 40] });
        }
    }

    updateVehiclePosition(frame) {
        if (!this.isInitialized || !this.carMarker || !frame.lat || !frame.lng) return;

        const newLatLng = [frame.lat, frame.lng];
        this.carMarker.setLatLng(newLatLng);

        // Rotate arrow icon with heading
        const arrowEl = document.getElementById('car-marker-arrow');
        if (arrowEl) {
            arrowEl.style.transform = `rotate(${frame.heading}deg)`;
        }

        // Auto-center camera if enabled
        if (this.autoPan) {
            this.map.panTo(newLatLng, { animate: true, duration: 0.1 });
        }
    }

    recenter() {
        this.autoPan = true;
        const btn = document.getElementById('btn-map-recenter');
        if (btn) btn.classList.remove('visible');

        if (this.carMarker) {
            this.map.setView(this.carMarker.getLatLng(), 16);
        }
    }
}

// Global exposure
window.TelemetryMapModule = TelemetryMapModule;
