#!/usr/bin/env python3
"""
SAURUS CoPilot - Telemetry & Fleet Management Server
Servidor HTTP con API REST para sincronización centralizada de usuarios y vehículos en red.
"""

import os
import json
import mimetypes
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.parse

PORT = 5500
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
VEHICLES_FILE = os.path.join(DATA_DIR, "vehicles.json")

# Permisos por defecto
DEFAULT_PERMS_SUPERADMIN = [
    "view_telemetry", "upload_telemetry", "upload_video", "export_report",
    "view_map", "view_incidents", "view_gauges", "change_scenario", "switch_units"
]
DEFAULT_PERMS_ADMIN = [
    "view_telemetry", "upload_telemetry", "upload_video", "export_report",
    "view_map", "view_incidents", "view_gauges", "change_scenario", "switch_units"
]
DEFAULT_PERMS_USER = [
    "view_telemetry", "view_map", "view_incidents", "view_gauges", "change_scenario", "switch_units"
]

def ensure_data_files():
    """Inicializa la carpeta data y los archivos JSON con datos predeterminados si no existen."""
    os.makedirs(DATA_DIR, exist_ok=True)

    if not os.path.exists(USERS_FILE):
        default_users = [
            {
                "id": "superadmin-001",
                "username": "superadmin",
                # Saurus2026! codificado en base64
                "password": "U2F1cnVzMjAyNiE=",
                "displayName": "Super Administrador",
                "role": "superadmin",
                "permissions": DEFAULT_PERMS_SUPERADMIN,
                "assignedVehicles": ["veh-001", "veh-002", "veh-003"],
                "createdAt": "2026-09-21T12:00:00.000Z",
                "active": True
            }
        ]
        save_json(USERS_FILE, default_users)

    if not os.path.exists(VEHICLES_FILE):
        default_vehicles = [
            {
                "id": "veh-001",
                "plate": "AF-742-AA",
                "alias": "Camión Scania R450",
                "type": "truck",
                "description": "Unidad de transporte de carga pesada - Ruta Nacional",
                "createdAt": "2026-09-21T12:00:00.000Z"
            },
            {
                "id": "veh-002",
                "plate": "AG-120-BC",
                "alias": "Toyota Hilux 4x4",
                "type": "car",
                "description": "Móvil de supervisión técnica y patrullaje",
                "createdAt": "2026-09-21T12:00:00.000Z"
            },
            {
                "id": "veh-003",
                "plate": "AE-983-CD",
                "alias": "Mercedes Sprinter Van",
                "type": "van",
                "description": "Logística de distribución urbana y paquetería",
                "createdAt": "2026-09-21T12:00:00.000Z"
            }
        ]
        save_json(VEHICLES_FILE, default_vehicles)

def load_json(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_json(filepath, data):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def sanitize_user(user, include_hash=False):
    safe = dict(user)
    safe.pop("password", None)
    if not include_hash:
        safe.pop("passwordHash", None)
    return safe

class SaurusFleetHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Evitar caché en navegadores de la red y permitir CORS
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        content_len = int(self.headers.get("Content-Length", 0))
        if content_len == 0:
            return {}
        post_data = self.rfile.read(content_len)
        try:
            return json.loads(post_data.decode("utf-8"))
        except Exception:
            return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/sync":
            # Devuelve usuarios con passwordHash (necesario para login local) y vehículos
            users = load_json(USERS_FILE)
            vehicles = load_json(VEHICLES_FILE)
            self.send_json_response({
                "users": [sanitize_user(u, include_hash=True) for u in users],
                "vehicles": vehicles
            })
            return

        if path == "/api/public-users":
            users = load_json(USERS_FILE)
            summary = [{
                "username": u.get("username"),
                "displayName": u.get("displayName") or u.get("username"),
                "role": u.get("role", "user"),
                "active": u.get("active", True)
            } for u in users]
            self.send_json_response(summary)
            return

        if path == "/api/users":
            users = load_json(USERS_FILE)
            self.send_json_response([sanitize_user(u) for u in users])
            return

        if path == "/api/vehicles":
            vehicles = load_json(VEHICLES_FILE)
            self.send_json_response(vehicles)
            return

        # Archivos estáticos
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()

        # ─── Login Centralizado ──────────────────────────────
        if path == "/api/login":
            username = str(body.get("username", "")).strip().lower()
            password = str(body.get("password", "")).strip()

            if not username or not password:
                self.send_json_response({"success": False, "error": "Por favor completa usuario y contraseña."}, 400)
                return

            users = load_json(USERS_FILE)
            matched_user = None
            for u in users:
                if str(u.get("username", "")).strip().lower() == username:
                    matched_user = u
                    break

            if not matched_user:
                self.send_json_response({"success": False, "error": f"El usuario '{username}' no existe en el sistema central."}, 404)
                return

            if not matched_user.get("active", True):
                self.send_json_response({"success": False, "error": f"La cuenta de '{username}' está desactivada."}, 403)
                return

            # Validar contraseña con tolerancia a múltiples formas de almacenamiento
            import base64
            saved_pass = matched_user.get("password", "")     # puede ser hash b64 o plana
            saved_hash = matched_user.get("passwordHash", "") # hash b64 explícito
            raw_b64    = base64.b64encode(password.encode("utf-8")).decode("utf-8")
            client_hash = str(body.get("passwordHash", "")).strip()

            is_valid = any([
                saved_pass == password,           # contraseña plana guardada
                saved_pass == raw_b64,            # contraseña guardada como b64
                saved_hash == raw_b64,            # passwordHash coincide con b64 del input
                saved_hash == client_hash and client_hash != "",  # hash enviado por cliente
                saved_pass == client_hash and client_hash != "",  # password field == hash cliente
                saved_pass.replace("=", "") == raw_b64.replace("=", ""),  # sin padding
                saved_hash.replace("=", "") == raw_b64.replace("=", ""),  # hash sin padding
            ])

            if not is_valid:
                self.send_json_response({"success": False, "error": f"Contraseña incorrecta para el usuario '{username}'."}, 401)
                return

            # Login exitoso
            session = {
                "userId": matched_user.get("id"),
                "username": matched_user.get("username"),
                "displayName": matched_user.get("displayName") or matched_user.get("username"),
                "role": matched_user.get("role", "user"),
                "permissions": matched_user.get("permissions", []),
                "assignedVehicles": matched_user.get("assignedVehicles", [])
            }
            self.send_json_response({"success": True, "session": session, "user": sanitize_user(matched_user)})
            return

        # ─── Crear Usuario Centralizado ──────────────────────
        if path == "/api/users":
            username = str(body.get("username", "")).strip()
            password = str(body.get("password", "")).strip()
            display_name = str(body.get("displayName", "")).strip() or username
            role = str(body.get("role", "user")).strip()
            permissions = body.get("permissions") or DEFAULT_PERMS_USER
            assigned_vehicles = body.get("assignedVehicles") or []

            if not username:
                self.send_json_response({"success": False, "error": "El nombre de usuario es obligatorio."}, 400)
                return
            if not password:
                self.send_json_response({"success": False, "error": "La contraseña es obligatoria."}, 400)
                return

            users = load_json(USERS_FILE)
            for u in users:
                if str(u.get("username", "")).strip().lower() == username.lower():
                    self.send_json_response({"success": False, "error": f"El usuario '{username}' ya existe en el servidor."}, 409)
                    return

            import time, base64
            # Guardar tanto la contraseña plana (para fallback) como el hash b64
            pass_hash = body.get("passwordHash") or base64.b64encode(password.encode("utf-8")).decode("utf-8")

            new_user = {
                "id": f"user-{int(time.time() * 1000)}",
                "username": username,
                "password": password,          # contraseña plana (para comparación directa)
                "passwordHash": pass_hash,     # hash b64 (para comparación con cliente)
                "displayName": display_name,
                "role": role,
                "permissions": permissions,
                "assignedVehicles": assigned_vehicles,
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "active": True
            }
            users.append(new_user)
            save_json(USERS_FILE, users)
            self.send_json_response({"success": True, "user": sanitize_user(new_user)}, 201)
            return

        # ─── Crear Vehículo Centralizado ─────────────────────
        if path == "/api/vehicles":
            plate = str(body.get("plate", "")).strip().upper()
            alias = str(body.get("alias", "")).strip() or plate
            vtype = str(body.get("type", "car")).strip()
            desc = str(body.get("description", "")).strip()

            if not plate:
                self.send_json_response({"success": False, "error": "La patente es obligatoria."}, 400)
                return

            vehicles = load_json(VEHICLES_FILE)
            for v in vehicles:
                if str(v.get("plate", "")).strip().upper() == plate:
                    self.send_json_response({"success": False, "error": f"Ya existe un vehículo con patente '{plate}'."}, 409)
                    return

            import time
            new_veh = {
                "id": f"veh-{int(time.time() * 1000)}",
                "plate": plate,
                "alias": alias,
                "type": vtype,
                "description": desc,
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            vehicles.append(new_veh)
            save_json(VEHICLES_FILE, vehicles)
            self.send_json_response({"success": True, "vehicle": new_veh}, 201)
            return

        self.send_json_response({"error": "Ruta no encontrada"}, 404)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()

        # Actualizar Usuario: /api/users/<id>
        if path.startswith("/api/users/"):
            user_id = path.replace("/api/users/", "").strip()
            users = load_json(USERS_FILE)
            found = False
            for u in users:
                if u.get("id") == user_id:
                    found = True
                    if "displayName" in body: u["displayName"] = str(body["displayName"]).strip()
                    if "password" in body and body["password"]:
                        import base64
                        raw_pw = str(body["password"]).strip()
                        new_hash = body.get("passwordHash") or base64.b64encode(raw_pw.encode("utf-8")).decode("utf-8")
                        u["password"] = raw_pw       # contraseña plana para fallback directo
                        u["passwordHash"] = new_hash  # hash b64 para validación con cliente
                    if "role" in body and u.get("role") != "superadmin": u["role"] = body["role"]
                    if "permissions" in body: u["permissions"] = body["permissions"]
                    if "assignedVehicles" in body: u["assignedVehicles"] = body["assignedVehicles"]
                    if "active" in body: u["active"] = bool(body["active"])
                    save_json(USERS_FILE, users)
                    self.send_json_response({"success": True, "user": sanitize_user(u)})
                    return
            if not found:
                self.send_json_response({"success": False, "error": "Usuario no encontrado"}, 404)
                return

        # Actualizar Vehículo: /api/vehicles/<id>
        if path.startswith("/api/vehicles/"):
            veh_id = path.replace("/api/vehicles/", "").strip()
            vehicles = load_json(VEHICLES_FILE)
            for v in vehicles:
                if v.get("id") == veh_id:
                    if "plate" in body: v["plate"] = str(body["plate"]).strip().upper()
                    if "alias" in body: v["alias"] = str(body["alias"]).strip()
                    if "type" in body: v["type"] = body["type"]
                    if "description" in body: v["description"] = str(body["description"]).strip()
                    save_json(VEHICLES_FILE, vehicles)
                    self.send_json_response({"success": True, "vehicle": v})
                    return
            self.send_json_response({"success": False, "error": "Vehículo no encontrado"}, 404)
            return

        self.send_json_response({"error": "Ruta no encontrada"}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Eliminar Usuario: /api/users/<id>
        if path.startswith("/api/users/"):
            user_id = path.replace("/api/users/", "").strip()
            users = load_json(USERS_FILE)
            user_to_del = next((u for u in users if u.get("id") == user_id), None)
            if not user_to_del:
                self.send_json_response({"success": False, "error": "Usuario no encontrado"}, 404)
                return
            if user_to_del.get("role") == "superadmin":
                self.send_json_response({"success": False, "error": "No se puede eliminar el SuperAdmin."}, 400)
                return
            users = [u for u in users if u.get("id") != user_id]
            save_json(USERS_FILE, users)
            self.send_json_response({"success": True})
            return

        # Eliminar Vehículo: /api/vehicles/<id>
        if path.startswith("/api/vehicles/"):
            veh_id = path.replace("/api/vehicles/", "").strip()
            vehicles = load_json(VEHICLES_FILE)
            vehicles = [v for v in vehicles if v.get("id") != veh_id]
            save_json(VEHICLES_FILE, vehicles)

            # Desasignar de usuarios
            users = load_json(USERS_FILE)
            for u in users:
                u["assignedVehicles"] = [vid for vid in u.get("assignedVehicles", []) if vid != veh_id]
            save_json(USERS_FILE, users)

            self.send_json_response({"success": True})
            return

        self.send_json_response({"error": "Ruta no encontrada"}, 404)

def run():
    ensure_data_files()
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, SaurusFleetHandler)
    print(f"==================================================")
    print(f" SAURUS CoPilot Central Server activo en puerto {PORT}")
    print(f" Local:   http://localhost:{PORT}")
    print(f" Red LAN: http://0.0.0.0:{PORT} (o la IP de esta PC)")
    print(f" Base de datos: {DATA_DIR}")
    print(f"==================================================")
    httpd.serve_forever()

if __name__ == "__main__":
    run()
