const state = {
    editOriginalOrder: "",
    accessDocument: "",
    resetDocument: "",
};

const toastEl = document.getElementById("toast");

function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    window.clearTimeout(showToast._timeoutId);
    showToast._timeoutId = window.setTimeout(() => {
        toastEl.classList.add("hidden");
    }, 2600);
}

function setFeedback(elementId, message, isError = true) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.classList.toggle("success", !isError);
}

function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
    document.getElementById(id).classList.add("hidden");
}

function closeAllModals() {
    document.querySelectorAll(".modal").forEach((modal) => modal.classList.add("hidden"));
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
    const requestOptions = {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    };

    const response = await fetch(path, requestOptions);
    if (response.status === 401) {
        window.location.href = "/login";
        throw new Error("Tu sesion expiro. Inicia sesion nuevamente.");
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : {};

    if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || `Error ${response.status}`);
    }

    return payload;
}

function bindModalBehavior() {
    document.querySelectorAll("[data-close]").forEach((button) => {
        button.addEventListener("click", () => closeModal(button.dataset.close));
    });

    document.querySelectorAll(".modal").forEach((modal) => {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                modal.classList.add("hidden");
            }
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeAllModals();
        }
    });
}

function renderRecordCards(records) {
    const container = document.getElementById("edit-records");
    container.innerHTML = "";

    records.forEach((record) => {
        const article = document.createElement("article");
        article.className = "record-card";
        article.dataset.key = String(record.key || "");

        article.innerHTML = `
            <h4>Registro ${escapeHtml(record.key)}</h4>
            <div class="record-grid">
                <div>
                    <label>Fecha</label>
                    <input data-field="fecha" value="${escapeHtml(record.fecha || "")}" />
                </div>
                <div>
                    <label>Hora</label>
                    <input data-field="hora" value="${escapeHtml(record.hora || "")}" />
                </div>
                <div>
                    <label>Proceso</label>
                    <input data-field="proceso" value="${escapeHtml(record.proceso || "")}" />
                </div>
                <div>
                    <label>Punto</label>
                    <input data-field="punto" value="${escapeHtml(record.punto || "")}" />
                </div>
                <div>
                    <label>Usuario</label>
                    <input data-field="usuario" value="${escapeHtml(record.usuario || "")}" />
                </div>
            </div>
        `;

        container.appendChild(article);
    });
}

function collectEditRecords() {
    const cards = document.querySelectorAll("#edit-records .record-card");
    const records = [];

    cards.forEach((card) => {
        const getValue = (field) => card.querySelector(`[data-field="${field}"]`).value.trim();
        records.push({
            key: card.dataset.key,
            fecha: getValue("fecha"),
            hora: getValue("hora"),
            proceso: getValue("proceso"),
            punto: getValue("punto"),
            usuario: getValue("usuario"),
        });
    });

    return records;
}

function bindEditFlow() {
    document.getElementById("btn-edit").addEventListener("click", () => {
        openModal("modal-edit");
        setFeedback("edit-message", "", true);
    });

    document.getElementById("edit-search-btn").addEventListener("click", async () => {
        const order = document.getElementById("edit-search-order").value.trim();
        if (!order) {
            setFeedback("edit-message", "Ingresa una orden de produccion.", true);
            return;
        }

        try {
            const result = await api(`/api/orders/${encodeURIComponent(order)}`);
            state.editOriginalOrder = order;
            document.getElementById("edit-document").value = result.data.documento;
            renderRecordCards(result.data.records);
            setFeedback("edit-message", `Se cargaron ${result.data.records.length} registros.`, false);
        } catch (error) {
            document.getElementById("edit-document").value = "";
            document.getElementById("edit-records").innerHTML = "";
            setFeedback("edit-message", error.message, true);
        }
    });

    document.getElementById("edit-save-btn").addEventListener("click", async () => {
        if (!state.editOriginalOrder) {
            setFeedback("edit-message", "Primero busca una orden para editar.", true);
            return;
        }

        const newDocument = document.getElementById("edit-document").value.trim();
        const records = collectEditRecords();

        try {
            const result = await api(`/api/orders/${encodeURIComponent(state.editOriginalOrder)}`, {
                method: "PUT",
                body: JSON.stringify({ newDocument, records }),
            });

            state.editOriginalOrder = result.newDocument;
            document.getElementById("edit-search-order").value = result.newDocument;
            setFeedback("edit-message", result.message, false);
            showToast("Edicion guardada");
        } catch (error) {
            setFeedback("edit-message", error.message, true);
        }
    });

    document.getElementById("edit-search-order").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            document.getElementById("edit-search-btn").click();
        }
    });
}

async function loadMonths() {
    const list = document.getElementById("months-list");
    list.innerHTML = "";

    try {
        const result = await api("/api/months");
        if (!result.data.length) {
            list.innerHTML = "<p>No se encontraron meses en los documentos.</p>";
            return;
        }

        result.data.forEach((item) => {
            const row = document.createElement("label");
            row.className = "check-item";
            row.innerHTML = `
                <input type="checkbox" value="${escapeHtml(item.month)}" />
                <span>${escapeHtml(item.month)} (${item.documents} documentos)</span>
            `;
            list.appendChild(row);
        });
    } catch (error) {
        setFeedback("restart-message", error.message, true);
    }
}

function bindRestartFlow() {
    document.getElementById("btn-restart").addEventListener("click", async () => {
        openModal("modal-restart");
        setFeedback("restart-message", "", true);
        await loadMonths();
    });

    document.getElementById("restart-delete-btn").addEventListener("click", async () => {
        const selected = Array.from(document.querySelectorAll("#months-list input:checked")).map((input) => input.value);
        if (!selected.length) {
            setFeedback("restart-message", "Selecciona al menos un mes.", true);
            return;
        }

        const confirmDelete = window.confirm(
            `Se borraran documentos de ${selected.length} mes(es). Esta accion no se puede deshacer.`,
        );
        if (!confirmDelete) {
            return;
        }

        try {
            const result = await api("/api/delete-months", {
                method: "POST",
                body: JSON.stringify({ months: selected }),
            });

            setFeedback("restart-message", result.message, false);
            await loadMonths();
            showToast("Limpieza de meses completada");
        } catch (error) {
            setFeedback("restart-message", error.message, true);
        }
    });
}

async function downloadBackup() {
    const response = await fetch("/api/backup");
    if (response.status === 401) {
        window.location.href = "/login";
        throw new Error("Tu sesion expiro. Inicia sesion nuevamente.");
    }

    if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            const payload = await response.json();
            throw new Error(payload.message || "No se pudo generar el backup.");
        }
        throw new Error("No se pudo generar el backup.");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const contentDisposition = response.headers.get("content-disposition") || "";
    const fileNameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
    const fileName = fileNameMatch ? fileNameMatch[1] : "Historial_novedades.xlsx";

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
}

function bindSessionActions() {
    const logoutButton = document.getElementById("btn-logout");
    if (!logoutButton) {
        return;
    }

    logoutButton.addEventListener("click", async () => {
        try {
            await fetch("/logout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
        } finally {
            window.location.href = "/login";
        }
    });
}

function bindTopActions() {
    document.getElementById("btn-backup").addEventListener("click", async () => {
        try {
            await downloadBackup();
            showToast("Backup descargado");
        } catch (error) {
            showToast(error.message);
        }
    });

    document.getElementById("btn-delete-news").addEventListener("click", async () => {
        const confirmDelete = window.confirm("Deseas borrar todas las solucionadas? Esta accion no se puede deshacer.");
        if (!confirmDelete) {
            return;
        }

        try {
            const result = await api("/api/solucionadas", { method: "DELETE" });
            showToast(result.message);
        } catch (error) {
            showToast(error.message);
        }
    });
}

function bindKeysFlow() {
    document.getElementById("btn-keys").addEventListener("click", () => openModal("modal-keys"));

    document.getElementById("btn-open-access").addEventListener("click", () => {
        closeModal("modal-keys");
        openModal("modal-access");
        setFeedback("access-message", "", true);
    });

    document.getElementById("btn-open-signature").addEventListener("click", () => {
        closeModal("modal-keys");
        openModal("modal-signature");
        setFeedback("signature-message", "", true);
    });

    document.getElementById("btn-open-reset").addEventListener("click", () => {
        closeModal("modal-keys");
        openModal("modal-reset");
        setFeedback("reset-message", "", true);
    });
}

function bindAccessFlow() {
    const userCard = document.getElementById("access-user-card");

    document.getElementById("access-search-btn").addEventListener("click", async () => {
        const documentValue = document.getElementById("access-doc").value.trim();
        if (!documentValue) {
            setFeedback("access-message", "Ingresa una cedula valida.", true);
            return;
        }

        try {
            const result = await api(`/api/users/by-document/${encodeURIComponent(documentValue)}`);
            const user = result.data;

            state.accessDocument = user.documento || documentValue;
            document.getElementById("access-name").textContent = user.nombre || "";
            document.getElementById("access-document").textContent = user.documento || documentValue;
            document.getElementById("access-signature").textContent = user.firma || "";
            document.getElementById("access-password").value = "";
            userCard.classList.remove("hidden");
            setFeedback("access-message", "Usuario encontrado. Puedes actualizar la clave.", false);
        } catch (error) {
            userCard.classList.add("hidden");
            setFeedback("access-message", error.message, true);
        }
    });

    document.getElementById("access-update-btn").addEventListener("click", async () => {
        const password = document.getElementById("access-password").value.trim();
        if (!state.accessDocument) {
            setFeedback("access-message", "Primero busca un usuario.", true);
            return;
        }

        if (!/^\d{4}$/.test(password)) {
            setFeedback("access-message", "La nueva clave debe tener 4 digitos.", true);
            return;
        }

        try {
            const result = await api("/api/users/update-password", {
                method: "POST",
                body: JSON.stringify({ document: state.accessDocument, password }),
            });
            setFeedback("access-message", result.message, false);
            showToast("Clave de usuario actualizada");
        } catch (error) {
            setFeedback("access-message", error.message, true);
        }
    });
}

function bindSignatureFlow() {
    document.getElementById("signature-update-btn").addEventListener("click", async () => {
        const value = document.getElementById("signature-key").value.trim();
        try {
            const result = await api("/api/clave", {
                method: "POST",
                body: JSON.stringify({ value }),
            });
            setFeedback("signature-message", result.message, false);
            showToast("Clave general actualizada");
        } catch (error) {
            setFeedback("signature-message", error.message, true);
        }
    });
}

function bindResetFlow() {
    const confirmButton = document.getElementById("reset-confirm-btn");

    document.getElementById("reset-search-btn").addEventListener("click", async () => {
        const documentValue = document.getElementById("reset-doc").value.trim();
        if (!documentValue) {
            setFeedback("reset-message", "Ingresa el numero de documento.", true);
            confirmButton.classList.add("hidden");
            return;
        }

        try {
            const result = await api(`/api/users/by-document/${encodeURIComponent(documentValue)}`);
            const user = result.data;
            state.resetDocument = user.documento || documentValue;
            setFeedback("reset-message", `Usuario encontrado: ${user.nombre || "Sin nombre"}.`, false);
            confirmButton.classList.remove("hidden");
        } catch (error) {
            state.resetDocument = "";
            confirmButton.classList.add("hidden");
            setFeedback("reset-message", error.message, true);
        }
    });

    confirmButton.addEventListener("click", async () => {
        if (!state.resetDocument) {
            setFeedback("reset-message", "Primero busca un usuario.", true);
            return;
        }

        try {
            const result = await api("/api/users/reset", {
                method: "POST",
                body: JSON.stringify({ document: state.resetDocument }),
            });
            setFeedback("reset-message", result.message, false);
            confirmButton.classList.add("hidden");
            showToast("Usuario reiniciado");
        } catch (error) {
            setFeedback("reset-message", error.message, true);
        }
    });
}

function bindCreateUserFlow() {
    document.getElementById("btn-new-user").addEventListener("click", () => {
        openModal("modal-new-user");
        setFeedback("new-user-message", "", true);
    });

    document.getElementById("new-user-create-btn").addEventListener("click", async () => {
        const nombre = document.getElementById("new-name").value.trim().toUpperCase();
        const documento = document.getElementById("new-document").value.trim();
        const firma = document.getElementById("new-signature").value.trim().toUpperCase();

        try {
            const result = await api("/api/users", {
                method: "POST",
                body: JSON.stringify({ nombre, documento, firma }),
            });

            setFeedback("new-user-message", result.message, false);
            document.getElementById("new-name").value = "";
            document.getElementById("new-document").value = "";
            document.getElementById("new-signature").value = "";
            showToast("Usuario creado");
        } catch (error) {
            setFeedback("new-user-message", error.message, true);
        }
    });
}

function bindLogoFallback() {
    const logo = document.getElementById("logo");
    logo.addEventListener("error", () => {
        logo.style.display = "none";
    });
}

function init() {
    bindSessionActions();
    bindModalBehavior();
    bindEditFlow();
    bindRestartFlow();
    bindTopActions();
    bindKeysFlow();
    bindAccessFlow();
    bindSignatureFlow();
    bindResetFlow();
    bindCreateUserFlow();
    bindLogoFallback();
}

init();