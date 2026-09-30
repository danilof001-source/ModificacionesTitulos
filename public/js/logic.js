document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const mainPanel = document.getElementById('main-panel');
    const loginCard = document.getElementById('login-card');
    
    const btnMatriz = document.getElementById('btnMatriz');
    const fileInput = document.getElementById('fileInput');
    const statusArea = document.getElementById('statusArea');
    const logArea = document.getElementById('logArea');
    const actionButtons = document.getElementById('actionButtons');
    const btnCommit = document.getElementById('btnCommit');
    const btnRollback = document.getElementById('btnRollback');
    const btnDescargarReporte = document.getElementById('btnDescargarReporte');

    let currentTransactionId = null; 

    // LOGIN
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('username').value;
        const p = document.getElementById('password').value;
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ usuario: u, password: p })
            });
            const data = await res.json();
            if (data.success) {
                loginCard.classList.add('d-none');
                mainPanel.classList.remove('d-none');
            } else { alert("Error credenciales"); }
        } catch (e) {}
    });

    // CARGA DE ARCHIVO
    btnMatriz.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        if (!e.target.files.length) return;
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('archivo', file);

        statusArea.innerHTML = '<div class="alert alert-info">Procesando...</div>';
        actionButtons.classList.add('d-none');
        btnDescargarReporte.classList.add('d-none'); 
        logArea.value = "Cargando...";
        limpiarTablas();

        try {
            const res = await fetch('/api/upload-matriz', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                currentTransactionId = data.transactionId;
                renderTable('Pre', data.datosPre);
                renderTable('Post', data.datosPost);

                logArea.value = 
                    "--- SCRIPT SQL ---\n" + data.scriptCompleto + 
                    "\n\n--- LOGS ---\n" + data.logs;

                // ACTIVAR BOTÓN EN MODO TEMPORAL
                if (data.downloadUrl) {
                    btnDescargarReporte.href = data.downloadUrl;
                    btnDescargarReporte.classList.remove('d-none');
                    btnDescargarReporte.classList.add('btn-outline-warning'); // Color amarillo para advertir que es temporal
                    btnDescargarReporte.classList.remove('btn-outline-success');
                    btnDescargarReporte.innerHTML = "⬇ Descargar Resultados <b>(BORRADOR / TMP)</b>";
                }

                statusArea.innerHTML = `<div class="alert alert-warning">Revise tablas y logs.</div>`;
                actionButtons.classList.remove('d-none');
                btnCommit.disabled = false;
                btnRollback.disabled = false;

            } else {
                statusArea.innerHTML = `<div class="alert alert-danger">${data.message}</div>`;
                logArea.value = "Error: " + data.message;
            }
        } catch (err) {
            statusArea.innerHTML = `<div class="alert alert-danger">Error red.</div>`;
        }
        fileInput.value = '';
    });

    // COMMIT
    btnCommit.addEventListener('click', async () => {
        if (!currentTransactionId) return;
        btnCommit.disabled = true; btnRollback.disabled = true;
        try {
            const res = await fetch('/api/commit', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ transactionId: currentTransactionId })
            });
            const data = await res.json();
            
            if (data.success) {
                statusArea.innerHTML = `<div class="alert alert-success">${data.message}</div>`;
                actionButtons.classList.add('d-none');
                
                // ACTUALIZAR BOTÓN A MODO FINAL
                if (data.finalUrl) {
                    btnDescargarReporte.href = data.finalUrl;
                    btnDescargarReporte.classList.remove('btn-outline-warning');
                    btnDescargarReporte.classList.add('btn-outline-success'); // Verde para confirmado
                    btnDescargarReporte.innerHTML = "⬇ Descargar Resultados <b>(FINAL)</b>";
                }
            } else {
                statusArea.innerHTML = `<div class="alert alert-danger">${data.message}</div>`;
            }
        } catch (e) { statusArea.innerHTML = "Error red"; }
    });

    // ROLLBACK
    btnRollback.addEventListener('click', async () => {
        if (!currentTransactionId) return;
        btnCommit.disabled = true; btnRollback.disabled = true;
        try {
            const res = await fetch('/api/rollback', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ transactionId: currentTransactionId })
            });
            const data = await res.json();
            statusArea.innerHTML = `<div class="alert alert-danger">${data.message}</div>`; // Rojo indicando cancelación
            actionButtons.classList.add('d-none');
            // El botón de descarga se mantiene en modo TMP (amarillo) porque no se confirmó
        } catch (e) { statusArea.innerHTML = "Error red"; }
    });

    function renderTable(sufijo, datos) {
        const thead = document.getElementById(`head${sufijo}`);
        const tbody = document.getElementById(`body${sufijo}`);
        thead.innerHTML = ''; tbody.innerHTML = '';
        if (!datos || !datos.length) return;
        const cols = Object.keys(datos[0]);
        let tr = document.createElement('tr');
        cols.forEach(c => { let th = document.createElement('th'); th.innerText = c; tr.appendChild(th); });
        thead.appendChild(tr);
        datos.forEach(row => {
            let tr = document.createElement('tr');
            cols.forEach(c => { let td = document.createElement('td'); td.innerText = row[c]||''; tr.appendChild(td); });
            tbody.appendChild(tr);
        });
    }

    function limpiarTablas() {
        document.getElementById('headPre').innerHTML = ''; document.getElementById('bodyPre').innerHTML = '';
        document.getElementById('headPost').innerHTML = ''; document.getElementById('bodyPost').innerHTML = '';
    }
});