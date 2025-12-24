document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginCard = document.getElementById('login-card');
    const mainPanel = document.getElementById('main-panel');
    const loginError = document.getElementById('loginError');

    // Manejar el envío del Login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const usuario = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario, password })
            });

            const data = await response.json();

            if (data.success) {
                // Login Exitoso: Ocultar login, mostrar panel principal
                loginCard.classList.add('d-none');
                mainPanel.classList.remove('d-none');
                console.log("Login correcto. ID Usuario:", data.userId);
            } else {
                // Error
                loginError.classList.remove('d-none');
                loginError.innerText = data.message || "Error al ingresar";
            }
        } catch (error) {
            console.error("Error de red:", error);
            loginError.classList.remove('d-none');
            loginError.innerText = "Error de conexión con el servidor.";
        }
    });

    // --- PREPARACIÓN PARA EL SIGUIENTE PASO (Punto 11) ---
    const btnMatriz = document.getElementById('btnMatriz');
    const fileInput = document.getElementById('fileInput');

    if (btnMatriz) {
        btnMatriz.addEventListener('click', () => {
            // Al dar clic en el botón, disparamos el clic del input oculto
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                console.log("Archivo seleccionado:", file.name);
                // Aquí llamaremos a la función de validación en el próximo paso
                alert("Archivo seleccionado: " + file.name + ". Listo para validar.");
            }
        });
    }
});

// ... (código del login anterior igual) ...

    // --- LÓGICA DE CARGA DE ARCHIVO (Punto 11, 12, 13) ---
    const btnMatriz = document.getElementById('btnMatriz');
    const fileInput = document.getElementById('fileInput');
    const statusArea = document.getElementById('statusArea'); // Asegúrate de tener este div en el HTML

    if (btnMatriz) {
        btnMatriz.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                
                // Mostrar "Cargando..."
                statusArea.innerHTML = `<div class="alert alert-info">Procesando archivo: ${file.name}...</div>`;

                const formData = new FormData();
                formData.append('archivo', file);

                try {
                    const response = await fetch('/api/upload-matriz', {
                        method: 'POST',
                        body: formData // No poner Content-Type, fetch lo pone automático para multipart
                    });

                    const data = await response.json();

                    if (data.success) {
                        statusArea.innerHTML = `
                            <div class="alert alert-success">
                                <h5>¡Éxito!</h5>
                                <p>${data.mensaje}</p>
                                <p>Registros procesados: <strong>${data.totalRegistros}</strong></p>
                                <hr>
                                <small>El script SQL pre-modificación ha sido generado en memoria.</small>
                            </div>
                        `;
                        // Aquí podríamos mostrar el script en consola para verificar:
                        console.log("SCRIPT GENERADO:\n", data.scriptGenerado);
                    } else {
                        // Error de validación (columnas, espacios, etc.)
                        statusArea.innerHTML = `
                            <div class="alert alert-danger">
                                <h5>Error de Validación</h5>
                                <p>${data.message}</p>
                            </div>
                        `;
                    }
                } catch (error) {
                    console.error("Error al subir:", error);
                    statusArea.innerHTML = `<div class="alert alert-danger">Error de comunicación con el servidor.</div>`;
                }
                
                // Limpiar input para permitir subir el mismo archivo si se corrige
                fileInput.value = '';
            }
        });
    }