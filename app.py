from __future__ import annotations

import io
import os
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, send_file, session, url_for

from services.firebase_service import FirebaseService


BASE_DIR = Path(__file__).resolve().parent
service = FirebaseService(BASE_DIR)

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY") or os.getenv("ADMIN_SECRET_KEY") or "heart-admin-secret-key"

FALLBACK_ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin").strip()
FALLBACK_ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "1234").strip()

DEFAULT_FIREBASE_ADMIN_USERNAME = os.getenv("ADMIN_FIREBASE_USERNAME", "admin@HEART.com").strip()
DEFAULT_FIREBASE_ADMIN_PASSWORD = os.getenv("ADMIN_FIREBASE_PASSWORD", "HEART*123456").strip()


def request_wants_json() -> bool:
    accept_header = request.headers.get("Accept", "")
    return request.is_json or "application/json" in accept_header


def is_authenticated() -> bool:
    return bool(session.get("is_authenticated"))


def normalize_next_url(next_url: str) -> str:
    cleaned = str(next_url or "").strip()
    if cleaned.startswith("/") and not cleaned.startswith("//"):
        return cleaned
    return url_for("index")


def seed_admin_node() -> None:
    try:
        service.ensure_admin_credentials(
            DEFAULT_FIREBASE_ADMIN_USERNAME,
            DEFAULT_FIREBASE_ADMIN_PASSWORD,
            overwrite=False,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"No se pudo validar/crear el nodo Admin en Firebase: {exc}")


def get_login_credentials() -> tuple[str, str]:
    try:
        firebase_credentials = service.get_admin_credentials()
        if firebase_credentials:
            return firebase_credentials["username"], firebase_credentials["password"]
    except Exception:
        pass

    return FALLBACK_ADMIN_USERNAME, FALLBACK_ADMIN_PASSWORD


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if is_authenticated():
            return view(*args, **kwargs)

        if request.path.startswith("/api/"):
            return error_response("No autorizado. Inicia sesion.", 401)

        return redirect(url_for("login", next=request.path))

    return wrapped_view


def error_response(message: str, status: int = 400):
    return jsonify({"ok": False, "message": message}), status


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        if is_authenticated():
            return redirect(url_for("index"))
        return render_template(
            "login.html",
            error_message="",
            next_url=normalize_next_url(request.args.get("next", "")),
        )

    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", request.form.get("username", ""))).strip()
    password = str(payload.get("password", request.form.get("password", ""))).strip()
    next_url = normalize_next_url(payload.get("next", request.form.get("next", "")))

    expected_username, expected_password = get_login_credentials()

    if username == expected_username and password == expected_password:
        session.clear()
        session["is_authenticated"] = True
        session["username"] = username

        if request_wants_json():
            return jsonify({"ok": True, "redirect": next_url})
        return redirect(next_url)

    if request_wants_json():
        return error_response("Usuario o contrasena incorrectos.", 401)

    return render_template("login.html", error_message="Usuario o contrasena incorrectos.", next_url=next_url), 401


@app.post("/logout")
def logout():
    session.clear()
    if request_wants_json():
        return jsonify({"ok": True, "message": "Sesion cerrada."})
    return redirect(url_for("login"))


@app.get("/")
@login_required
def index():
    return render_template("index.html", current_user=session.get("username", ""))


@app.get("/api/logo")
def logo():
    logo_path = service.get_logo_path()
    if not logo_path.exists():
        return error_response("No se encontro logo.png en la carpeta raiz.", 404)
    return send_file(logo_path)


seed_admin_node()


@app.get("/api/orders/<order_id>")
@login_required
def get_order(order_id: str):
    records = service.get_order_records(order_id)
    if not records:
        return error_response(f"No se encontro la orden: {order_id}", 404)

    return jsonify(
        {
            "ok": True,
            "data": {
                "documento": order_id,
                "records": records,
            },
        }
    )


@app.put("/api/orders/<order_id>")
@login_required
def update_order(order_id: str):
    payload = request.get_json(silent=True) or {}
    new_document = str(payload.get("newDocument", order_id)).strip()
    records = payload.get("records", [])

    if not isinstance(records, list):
        return error_response("records debe ser una lista.", 400)

    try:
        saved = service.save_order_records(order_id, new_document, records)
        return jsonify(
            {
                "ok": True,
                "message": f"Se sobrescribieron {saved} registros correctamente.",
                "newDocument": new_document,
                "saved": saved,
            }
        )
    except ValueError as exc:
        return error_response(str(exc), 400)
    except Exception as exc:  # noqa: BLE001
        return error_response(f"No se pudo guardar la orden: {exc}", 500)


@app.get("/api/months")
@login_required
def get_months():
    try:
        month_index = service.get_month_index()
        data = [{"month": month, "documents": len(doc_ids)} for month, doc_ids in sorted(month_index.items())]
        return jsonify({"ok": True, "data": data})
    except Exception as exc:  # noqa: BLE001
        return error_response(f"No se pudo obtener la lista de meses: {exc}", 500)


@app.post("/api/delete-months")
@login_required
def delete_months():
    payload = request.get_json(silent=True) or {}
    months = payload.get("months", [])

    if not isinstance(months, list) or not months:
        return error_response("Selecciona al menos un mes.", 400)

    try:
        result = service.delete_months([str(month).strip() for month in months if str(month).strip()])
        return jsonify(
            {
                "ok": True,
                "message": f"Proceso completado. Eliminados: {result['deleted']} | Errores: {result['errors']}",
                "data": result,
            }
        )
    except Exception as exc:  # noqa: BLE001
        return error_response(f"No se pudieron borrar los meses seleccionados: {exc}", 500)


@app.delete("/api/solucionadas")
@login_required
def delete_solucionadas():
    try:
        service.delete_solucionadas()
        return jsonify({"ok": True, "message": "Las solucionadas fueron borradas correctamente."})
    except Exception as exc:  # noqa: BLE001
        return error_response(f"No se pudo borrar solucionadas: {exc}", 500)


@app.get("/api/users/by-document/<document>")
@login_required
def get_user_by_document(document: str):
    try:
        user = service.get_user_by_document(document)
        if user is None:
            return error_response("No se encontro usuario.", 404)
        return jsonify({"ok": True, "data": user})
    except Exception as exc:  # noqa: BLE001
        return error_response(f"No se pudo consultar el usuario: {exc}", 500)


@app.post("/api/users/update-password")
@login_required
def update_password():
    payload = request.get_json(silent=True) or {}
    document = str(payload.get("document", "")).strip()
    password = str(payload.get("password", "")).strip()

    if not document:
        return error_response("Documento requerido.", 400)

    try:
        service.update_user_password(document, password)
        return jsonify({"ok": True, "message": "Contrasena actualizada correctamente."})
    except ValueError as exc:
        return error_response(str(exc), 400)
    except Exception as exc:  # noqa: BLE001
        return error_response(f"No se pudo actualizar la contrasena: {exc}", 500)


@app.post("/api/clave")
@login_required
def update_clave():
    payload = request.get_json(silent=True) or {}
    new_value = str(payload.get("value", "")).strip()

    try:
        service.update_clave_general(new_value)
        return jsonify({"ok": True, "message": "Clave actualizada correctamente."})
    except ValueError as exc:
        return error_response(str(exc), 400)
    except Exception as exc:  # noqa: BLE001
        return error_response(f"No se pudo actualizar la clave: {exc}", 500)


@app.post("/api/users/reset")
@login_required
def reset_user():
    payload = request.get_json(silent=True) or {}
    document = str(payload.get("document", "")).strip()

    if not document:
        return error_response("Documento requerido.", 400)

    try:
        user = service.reset_user_password(document)
        return jsonify(
            {
                "ok": True,
                "message": "Usuario reiniciado. Ahora debe asignar una nueva contrasena.",
                "data": user,
            }
        )
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:  # noqa: BLE001
        return error_response(f"No se pudo reiniciar el usuario: {exc}", 500)


@app.post("/api/users")
@login_required
def create_user():
    payload = request.get_json(silent=True) or {}

    try:
        user = service.create_user(
            nombre=str(payload.get("nombre", "")),
            documento=str(payload.get("documento", "")),
            firma=str(payload.get("firma", "")),
        )
        return jsonify({"ok": True, "message": "Usuario creado correctamente.", "data": user})
    except ValueError as exc:
        return error_response(str(exc), 400)
    except Exception as exc:  # noqa: BLE001
        return error_response(f"No se pudo crear el usuario: {exc}", 500)


@app.get("/api/backup")
@login_required
def download_backup():
    try:
        content, filename = service.build_backup_excel()
        return send_file(
            io.BytesIO(content),
            as_attachment=True,
            download_name=filename,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except ValueError as exc:
        return error_response(str(exc), 404)
    except Exception as exc:  # noqa: BLE001
        return error_response(f"No se pudo generar el backup: {exc}", 500)


if __name__ == "__main__":
    app.run(
        debug=True,
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5000")),
    )
