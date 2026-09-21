/**
 * ApexDash Telemetry - Datasets & Route Generators
 * Generates realistic high-frequency (10Hz) telemetry data with GPS, OBD-II, IMU, and ADAS events.
 */

class TelemetryDatasetProvider {
    static getScenarios() {
        return [
            {
                id: 'urban_adas',
                name: 'Trayecto Urbano - Alertas ADAS',
                icon: '🏙️',
                description: 'Tráfico denso en ciudad con peatones, frenada de emergencia brusca (-0.78G) e invasión de carril.',
                duration: 65, // seconds
                difficulty: 'Alta densidad',
                score: 82,
                safetyGrade: 'B+',
                locationName: 'Avenida Central - Gran Vía',
                generate: () => this.generateUrbanRoute()
            },
            {
                id: 'canyon_spirited',
                name: 'Ruta de Montaña - Conducción Deportiva',
                icon: '⛰️',
                description: 'Trazado sinuoso con aceleraciones intensas, altas fuerzas G laterales y desniveles.',
                duration: 75, // seconds
                difficulty: 'Track / Sport',
                score: 94,
                safetyGrade: 'A',
                locationName: 'Paso del Cóndor - Puerto de Montaña',
                generate: () => this.generateCanyonRoute()
            },
            {
                id: 'highway_night',
                name: 'Autopista Nocturna - Crucero y Adelantamientos',
                icon: '🛣️',
                description: 'Velocidad de crucero elevada, maniobras de adelantamiento y control de distancia de seguridad.',
                duration: 60, // seconds
                difficulty: 'Crucero Rápido',
                score: 89,
                safetyGrade: 'A-',
                locationName: 'Autovía del Sol - Tramo Norte',
                generate: () => this.generateHighwayRoute()
            }
        ];
    }

    /**
     * Urban Route Generator with realistic incidents
     */
    static generateUrbanRoute() {
        const points = [];
        const startLat = 40.416775;
        const startLng = -3.703790;
        const totalDuration = 65; // seconds
        const hz = 10; // 10 updates per second
        const totalSteps = totalDuration * hz;

        let lat = startLat;
        let lng = startLng;
        let heading = 45; // NE
        let speed = 0; // km/h
        let rpm = 800;
        let gear = '1';
        let throttle = 0;
        let brake = 0;
        let altitude = 650;

        const incidents = [];

        for (let i = 0; i <= totalSteps; i++) {
            const time = +(i / hz).toFixed(1);
            let gLat = (Math.sin(time * 0.4) * 0.08) + (Math.random() * 0.03 - 0.015);
            let gLong = 0;
            let gVert = 1.0 + (Math.random() * 0.06 - 0.03);
            let adasObjects = [];
            let laneLeft = { detected: true, departure: false };
            let laneRight = { detected: true, departure: false };
            let fcw = false;
            let events = [];

            // Phase 1: 0s to 12s - Starting & gentle urban acceleration up to 48 km/h
            if (time < 12) {
                if (time < 2) {
                    speed = 0;
                    throttle = 0;
                    brake = 15;
                    gear = '1';
                    rpm = 850;
                } else {
                    gear = time < 5 ? '1' : (time < 9 ? '2' : '3');
                    throttle = Math.min(45, 10 + (time - 2) * 5);
                    brake = 0;
                    speed = Math.min(48, (time - 2) * 4.8);
                    rpm = 1200 + (speed % 18) * 120;
                    gLong = 0.22 + Math.random() * 0.05;
                }
                adasObjects.push({
                    id: 'car_1',
                    type: 'car',
                    distanceMeters: Math.max(14, 35 - speed * 0.3),
                    xOffset: 0.1,
                    relSpeed: -2,
                    warningLevel: 'safe'
                });
            }
            // Phase 2: 12s to 24s - Cruising at 48-52 km/h, pedestrian waiting at crosswalk
            else if (time < 24) {
                speed = 48 + Math.sin(time * 0.8) * 3;
                gear = '3';
                throttle = 25 + Math.sin(time) * 5;
                brake = 0;
                rpm = 2100 + Math.sin(time * 0.8) * 150;
                gLong = (Math.random() * 0.06 - 0.03);

                if (time > 18 && time < 22) {
                    adasObjects.push({
                        id: 'ped_1',
                        type: 'pedestrian',
                        distanceMeters: Math.max(8, 28 - (time - 18) * 6),
                        xOffset: 0.75 - (time - 18) * 0.1,
                        relSpeed: 0,
                        warningLevel: 'caution'
                    });
                }
            }
            // Phase 3: 24s to 32s - CRITICAL INCIDENT: Cyclist cuts in! Hard emergency braking!
            else if (time < 32) {
                if (time < 27) {
                    adasObjects.push({
                        id: 'cyclist_1',
                        type: 'cyclist',
                        distanceMeters: Math.max(6, 20 - (time - 24) * 4.5),
                        xOffset: 0.2,
                        relSpeed: -15,
                        warningLevel: 'danger'
                    });
                    fcw = true;
                    throttle = 0;
                    brake = Math.min(100, 30 + (time - 24) * 25);
                    speed = Math.max(5, 50 - (time - 24) * 16);
                    gear = speed < 15 ? '1' : '2';
                    rpm = Math.max(900, speed * 60);
                    gLong = -0.74 - (Math.random() * 0.08); // HARSH BRAKE > 0.7G!
                    gVert += 0.18; // nose dive

                    if (Math.abs(time - 25.5) < 0.05) {
                        events.push({
                            type: 'HARSH_BRAKING',
                            severity: 'CRITICAL',
                            message: 'Frenada de Emergencia detectada (-0.78G)',
                            value: '-0.78 G'
                        });
                        events.push({
                            type: 'FORWARD_COLLISION_ALERT',
                            severity: 'CRITICAL',
                            message: 'Alerta FCW: Objeto en trayectoria a 7.5m',
                            value: 'Distancia crítica'
                        });
                    }
                } else {
                    speed = Math.max(0, 8 - (time - 27) * 3);
                    throttle = 0;
                    brake = 60;
                    gear = '1';
                    rpm = 880;
                    gLong = -0.05;
                }
            }
            // Phase 4: 32s to 45s - Restarting, right turn into boulevard (High lateral G turn)
            else if (time < 45) {
                if (time < 36) {
                    heading += 1.8;
                    gLat = 0.48 + Math.random() * 0.05; // sharp right turn
                    speed = Math.min(30, 5 + (time - 32) * 6);
                    throttle = 35;
                    brake = 0;
                    gear = '2';
                    rpm = 1800;
                    if (Math.abs(time - 34.2) < 0.05) {
                        events.push({
                            type: 'SHARP_CORNERING',
                            severity: 'WARNING',
                            message: 'Giro con fuerza lateral elevada (+0.49G)',
                            value: '+0.49 G'
                        });
                    }
                } else {
                    heading = 90; // Straight East
                    speed = Math.min(55, 30 + (time - 36) * 3.5);
                    gear = speed > 45 ? '3' : '2';
                    throttle = 40;
                    rpm = 2300;
                    gLat = 0.02;
                    gLong = 0.18;
                }
            }
            // Phase 5: 45s to 55s - Lane drift / Distraction incident
            else if (time < 55) {
                speed = 52 + Math.sin(time) * 2;
                gear = '3';
                throttle = 30;
                rpm = 2400;
                gLong = 0;

                if (time > 48 && time < 53) {
                    laneLeft.departure = true; // drifting left across line!
                    gLat = -0.18;
                    if (Math.abs(time - 49.8) < 0.05) {
                        events.push({
                            type: 'LANE_DEPARTURE',
                            severity: 'WARNING',
                            message: 'Aviso LDW: Invasión involuntaria de carril izquierdo',
                            value: 'Sin intermitente'
                        });
                    }
                }
            }
            // Phase 6: 55s to 65s - Smooth deceleration to destination stop
            else {
                throttle = 0;
                brake = Math.min(50, (time - 55) * 5);
                speed = Math.max(0, 52 - (time - 55) * 5.5);
                gear = speed < 12 ? '1' : '2';
                rpm = Math.max(800, speed * 50);
                gLong = -0.28;
                if (speed === 0) {
                    gear = 'P';
                    brake = 75;
                }
            }

            // Update GPS based on speed and heading
            const speedMps = (speed * 1000) / 3600;
            const distanceStep = speedMps * (1 / hz);
            const headingRad = (heading * Math.PI) / 180;
            const latDelta = (distanceStep * Math.cos(headingRad)) / 111111;
            const lngDelta = (distanceStep * Math.sin(headingRad)) / (111111 * Math.cos((lat * Math.PI) / 180));

            lat += latDelta;
            lng += lngDelta;
            altitude += Math.sin(time * 0.1) * 0.05;

            const multiCam = TelemetryDatasetProvider.computeMultiCamData('urban_adas', time, speed, gLat, gLong, events);

            events.forEach(ev => {
                const clipStart = Math.max(0, +(time - 3.0).toFixed(1));
                const clipEnd = +(time + 3.0).toFixed(1);
                const clipTitle = `clip_urban_${ev.type.toLowerCase()}_${time.toFixed(1)}s.mp4`;
                incidents.push({
                    id: `inc_urban_${incidents.length + 1}`,
                    time,
                    ...ev,
                    speed: Math.round(speed),
                    lat,
                    lng,
                    clipStart,
                    clipEnd,
                    clipTitle,
                    clipUrl: `https://telematics.copilot.net/evidence/${clipTitle}`
                });
            });

            points.push({
                index: i,
                time,
                lat,
                lng,
                altitude: +altitude.toFixed(1),
                speed: +speed.toFixed(1),
                rpm: Math.round(rpm),
                gear,
                throttle: Math.round(throttle),
                brake: Math.round(brake),
                gLat: +gLat.toFixed(3),
                gLong: +gLong.toFixed(3),
                gVert: +gVert.toFixed(3),
                heading: +(heading % 360).toFixed(1),
                adas: {
                    objects: adasObjects,
                    laneLeft,
                    laneRight,
                    fcw
                },
                dms: multiCam.dms,
                bsd: multiCam.bsd,
                rear: multiCam.rear,
                events
            });
        }

        return { points, incidents, totalDuration };
    }

    /**
     * Compute multi-camera and DMS simulation data for any scenario frame
     */
    static computeMultiCamData(scenarioId, time, speed, gLat, gLong, events) {
        let dms = {
            driverStatus: 'NORMAL',
            statusLabel: 'NORMAL',
            perclos: 6 + Math.round(Math.sin(time * 0.2) * 2),
            blinkRate: 15 + Math.round(Math.sin(time * 0.3) * 2),
            eyesClosed: false,
            phoneDetected: false,
            yawnDetected: false,
            seatbeltBuckled: true,
            score: 96,
            gazeX: (gLat || 0) * 0.4,
            gazeY: -0.1
        };

        let bsd = {
            left: { active: false, alert: false, vehicleDist: 0, relSpeed: 0 },
            right: { active: false, alert: false, vehicleDist: 0, relSpeed: 0 }
        };

        let rear = {
            vehicleDist: 18 + Math.sin(time * 0.2) * 4,
            closingSpeed: 0,
            alert: false,
            vehicleType: 'car'
        };

        if (scenarioId === 'urban_adas') {
            // Distraction with phone at 15.0s to 20.5s
            if (time >= 15.0 && time <= 20.5) {
                dms.driverStatus = 'DISTRACTED_PHONE';
                dms.statusLabel = 'DISTRACCIÓN: CELULAR';
                dms.phoneDetected = true;
                dms.gazeX = 0.42;
                dms.gazeY = 0.62;
                dms.score = 48;
                dms.perclos = 14;
                if (Math.abs(time - 16.5) < 0.05) {
                    events.push({
                        type: 'DMS_PHONE_DISTRACTION',
                        severity: 'WARNING',
                        message: 'DMS: Conductor usando teléfono móvil',
                        value: 'Celular activo'
                    });
                }
            }
            // Emergency braking at 24s-27.5s: rear vehicle approaches fast
            else if (time >= 24.0 && time <= 27.5) {
                dms.driverStatus = 'ALERT_EMERGENCY';
                dms.statusLabel = 'ALERTA MÁXIMA';
                dms.gazeX = 0;
                dms.gazeY = -0.2;
                rear.vehicleDist = Math.max(5.8, 14 - (time - 24) * 2.8);
                rear.closingSpeed = 24;
                rear.alert = true;
                if (Math.abs(time - 25.8) < 0.05) {
                    events.push({
                        type: 'RCW_PROXIMITY',
                        severity: 'CRITICAL',
                        message: 'RCW: Vehículo trasero en proximidad crítica (6.2m)',
                        value: '6.2 m'
                    });
                }
            }
            // BSD Left blind spot at 34s-38s
            if (time >= 34.0 && time <= 38.0) {
                bsd.left = { active: true, alert: true, vehicleDist: 3.2, relSpeed: 8 };
                if (Math.abs(time - 35.0) < 0.05) {
                    events.push({
                        type: 'BSD_ALERT',
                        severity: 'WARNING',
                        message: 'BSD: Vehículo en ángulo muerto izquierdo',
                        value: '3.2 m'
                    });
                }
            }
            // DMS Yawning at 41s-45s
            if (time >= 41.0 && time <= 45.0) {
                dms.driverStatus = 'YAWN';
                dms.statusLabel = 'BOSTEZO / FATIGA';
                dms.yawnDetected = true;
                dms.perclos = 22;
                dms.score = 72;
                if (Math.abs(time - 42.5) < 0.05) {
                    events.push({
                        type: 'DMS_YAWN',
                        severity: 'INFO',
                        message: 'DMS: Fatiga detectada (Bostezo de 3.2s)',
                        value: 'Bostezo'
                    });
                }
            }
            // BSD Right cyclist at 48s-53s
            if (time >= 48.0 && time <= 53.0) {
                bsd.right = { active: true, alert: true, vehicleDist: 2.1, relSpeed: -15 };
            }
        } else if (scenarioId === 'highway_night') {
            // Progressive drowsiness at 25s-33s
            if (time >= 25.0 && time <= 33.0) {
                dms.driverStatus = 'DROWSY';
                dms.statusLabel = 'SOMNOLENCIA';
                dms.eyesClosed = (time >= 26.5 && time <= 29.5);
                dms.perclos = 38 + Math.round((time - 25) * 2);
                dms.blinkRate = 8;
                dms.gazeY = 0.3;
                dms.score = 35;
                if (Math.abs(time - 28.0) < 0.05) {
                    events.push({
                        type: 'DMS_DROWSINESS',
                        severity: 'CRITICAL',
                        message: 'DMS: ¡Alerta Crítica! Somnolencia del conductor (PERCLOS >35%)',
                        value: 'Ojos cerrados >1.5s'
                    });
                }
            }
            // BSD Right overtaking at 35s-40s
            if (time >= 35.0 && time <= 40.0) {
                bsd.right = { active: true, alert: true, vehicleDist: 4.2, relSpeed: -20 };
            }
        } else if (scenarioId === 'canyon_spirited') {
            dms.driverStatus = 'SPORT_FOCUS';
            dms.statusLabel = 'ENFOQUE DEPORTIVO';
            dms.score = 99;
            dms.blinkRate = 18;
            dms.gazeX = (gLat || 0) * 0.7;
            if (Math.abs(gLat) > 0.8) {
                bsd.left.active = gLat < 0;
                bsd.right.active = gLat > 0;
            }
        }

        return { dms, bsd, rear };
    }

    /**
     * Canyon Route Generator - High G-Forces and winding roads
     */
    static generateCanyonRoute() {
        const points = [];
        const startLat = 36.7584;
        const startLng = -3.8821;
        const totalDuration = 75;
        const hz = 10;
        const totalSteps = totalDuration * hz;

        let lat = startLat;
        let lng = startLng;
        let heading = 120;
        let speed = 40;
        let rpm = 2500;
        let gear = '2';
        let throttle = 20;
        let brake = 0;
        let altitude = 1120;

        const incidents = [];

        for (let i = 0; i <= totalSteps; i++) {
            const time = +(i / hz).toFixed(1);
            let gLat = 0;
            let gLong = 0;
            let gVert = 1.0 + (Math.sin(time * 2.5) * 0.08);
            let events = [];

            const curveFactor = Math.sin(time * 0.35) + Math.sin(time * 0.8) * 0.6;
            heading += curveFactor * 1.6;
            gLat = curveFactor * 0.65 + (Math.random() * 0.05 - 0.025);

            if (Math.abs(curveFactor) > 0.9) {
                brake = 45;
                throttle = 0;
                speed = Math.max(38, speed - 1.2);
                gLong = -0.42;
                gear = '2';
                rpm = 3400;

                if (Math.abs(gLat) > 0.78 && Math.abs((time % 8) - 4) < 0.1) {
                    events.push({
                        type: 'HIGH_LATERAL_G',
                        severity: 'WARNING',
                        message: `Alta aceleración centrífuga en curva (${gLat > 0 ? '+' : ''}${gLat.toFixed(2)}G)`,
                        value: `${gLat.toFixed(2)} G`
                    });
                }
            } else {
                brake = 0;
                throttle = Math.min(95, throttle + 4);
                speed = Math.min(88, speed + 1.1);
                gear = speed > 68 ? '4' : (speed > 50 ? '3' : '2');
                rpm = 2800 + (speed % 25) * 110;
                gLong = 0.45;
            }

            altitude += 0.28;

            const speedMps = (speed * 1000) / 3600;
            const distanceStep = speedMps * (1 / hz);
            const headingRad = (heading * Math.PI) / 180;
            const latDelta = (distanceStep * Math.cos(headingRad)) / 111111;
            const lngDelta = (distanceStep * Math.sin(headingRad)) / (111111 * Math.cos((lat * Math.PI) / 180));

            lat += latDelta;
            lng += lngDelta;

            const multiCam = TelemetryDatasetProvider.computeMultiCamData('canyon_spirited', time, speed, gLat, gLong, events);

            events.forEach(ev => {
                const clipStart = Math.max(0, +(time - 3.0).toFixed(1));
                const clipEnd = +(time + 3.0).toFixed(1);
                const clipTitle = `clip_canyon_${ev.type.toLowerCase()}_${time.toFixed(1)}s.mp4`;
                incidents.push({
                    id: `inc_canyon_${incidents.length + 1}`,
                    time,
                    ...ev,
                    speed: Math.round(speed),
                    lat,
                    lng,
                    clipStart,
                    clipEnd,
                    clipTitle,
                    clipUrl: `https://telematics.copilot.net/evidence/${clipTitle}`
                });
            });

            points.push({
                index: i,
                time,
                lat,
                lng,
                altitude: +altitude.toFixed(1),
                speed: +speed.toFixed(1),
                rpm: Math.round(rpm),
                gear,
                throttle: Math.round(throttle),
                brake: Math.round(brake),
                gLat: +gLat.toFixed(3),
                gLong: +gLong.toFixed(3),
                gVert: +gVert.toFixed(3),
                heading: +(heading % 360).toFixed(1),
                adas: {
                    objects: [
                        { id: 'guardrail', type: 'barrier', distanceMeters: 4, xOffset: -0.9, relSpeed: 0, warningLevel: 'safe' }
                    ],
                    laneLeft: { detected: true, departure: false },
                    laneRight: { detected: true, departure: false },
                    fcw: false
                },
                dms: multiCam.dms,
                bsd: multiCam.bsd,
                rear: multiCam.rear,
                events
            });
        }

        return { points, incidents, totalDuration };
    }

    /**
     * Highway Night Route Generator
     */
    static generateHighwayRoute() {
        const points = [];
        const startLat = 41.385064;
        const startLng = 2.173404;
        const totalDuration = 60;
        const hz = 10;
        const totalSteps = totalDuration * hz;

        let lat = startLat;
        let lng = startLng;
        let heading = 220;
        let speed = 95;
        let rpm = 2200;
        let gear = '5';
        let throttle = 45;
        let brake = 0;
        let altitude = 45;

        const incidents = [];

        for (let i = 0; i <= totalSteps; i++) {
            const time = +(i / hz).toFixed(1);
            let gLat = Math.sin(time * 0.15) * 0.08;
            let gLong = 0.02;
            let gVert = 1.0 + (Math.random() * 0.04 - 0.02);
            let events = [];
            let adasObjects = [];

            if (time > 20 && time < 42) {
                throttle = 78;
                speed = Math.min(138, speed + 0.5);
                gear = '6';
                rpm = 2800 + (speed - 100) * 22;
                gLong = 0.18;

                adasObjects.push({
                    id: 'truck_1',
                    type: 'truck',
                    distanceMeters: Math.max(12, 65 - (time - 20) * 3),
                    xOffset: -0.85,
                    relSpeed: -35,
                    warningLevel: 'caution'
                });

                if (speed > 125 && Math.abs(time - 28.5) < 0.05) {
                    events.push({
                        type: 'SPEED_LIMIT_EXCEEDED',
                        severity: 'WARNING',
                        message: 'Exceso de velocidad detectado (+120 km/h límite vía)',
                        value: `${Math.round(speed)} km/h`
                    });
                }
            } else if (time >= 42) {
                throttle = 35;
                speed = Math.max(118, speed - 0.6);
                rpm = 2400;
                gLong = -0.05;
            }

            const speedMps = (speed * 1000) / 3600;
            const distanceStep = speedMps * (1 / hz);
            const headingRad = (heading * Math.PI) / 180;
            const latDelta = (distanceStep * Math.cos(headingRad)) / 111111;
            const lngDelta = (distanceStep * Math.sin(headingRad)) / (111111 * Math.cos((lat * Math.PI) / 180));

            lat += latDelta;
            lng += lngDelta;

            const multiCam = TelemetryDatasetProvider.computeMultiCamData('highway_night', time, speed, gLat, gLong, events);

            events.forEach(ev => {
                const clipStart = Math.max(0, +(time - 3.0).toFixed(1));
                const clipEnd = +(time + 3.0).toFixed(1);
                const clipTitle = `clip_highway_${ev.type.toLowerCase()}_${time.toFixed(1)}s.mp4`;
                incidents.push({
                    id: `inc_highway_${incidents.length + 1}`,
                    time,
                    ...ev,
                    speed: Math.round(speed),
                    lat,
                    lng,
                    clipStart,
                    clipEnd,
                    clipTitle,
                    clipUrl: `https://telematics.copilot.net/evidence/${clipTitle}`
                });
            });

            points.push({
                index: i,
                time,
                lat,
                lng,
                altitude: +altitude.toFixed(1),
                speed: +speed.toFixed(1),
                rpm: Math.round(rpm),
                gear,
                throttle: Math.round(throttle),
                brake: Math.round(brake),
                gLat: +gLat.toFixed(3),
                gLong: +gLong.toFixed(3),
                gVert: +gVert.toFixed(3),
                heading: +(heading % 360).toFixed(1),
                adas: {
                    objects: adasObjects,
                    laneLeft: { detected: true, departure: false },
                    laneRight: { detected: true, departure: false },
                    fcw: false
                },
                dms: multiCam.dms,
                bsd: multiCam.bsd,
                rear: multiCam.rear,
                events
            });
        }

        return { points, incidents, totalDuration };
    }
}

// Export for global browser use
window.TelemetryDatasetProvider = TelemetryDatasetProvider;
