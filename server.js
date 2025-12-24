const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer'); // Importamos multer para subida de archivos
const fs = require('fs');
const db = require('./src/db');
const procesador = require('./src/procesador'); // Importamos nuestra lógica nueva

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Multer (Almacenamiento temporal)
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- RUTA 1: LOGIN ---
app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const queryUsuario = `
            SELECT id, nombreusuario, nombre1, apellido1
            FROM modificacion_titulos_app.usuarios_app 
            WHERE nombreusuario = $1 AND contraseña = $2
        `;
        const result = await db.query(queryUsuario, [usuario, password]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            const queryLog = `
                INSERT INTO modificacion_titulos_app.logs_app (usuarios_app_id, fechaingreso)
                VALUES ($1, NOW())
            `;
            await db.query(queryLog, [user.id]);
            res.json({ success: true, userId: user.id });
        } else {
            res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }
    } catch (err) {
        console.error("Error en Login:", err);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// --- RUTA 2: PROCESAR EXCEL (Puntos 11, 12, 13) ---
// 'archivo' es el nombre del campo que enviaremos desde el frontend
app.post('/api/upload-matriz', upload.single('archivo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No se envió ningún archivo." });
        }

        // Llamamos a nuestra lógica en src/procesador.js
        const resultado = await procesador.procesarArchivoExcel(req.file.path);

        // Si todo sale bien, borramos el archivo temporal
        fs.unlinkSync(req.file.path);

        // Devolvemos el resultado al frontend
        res.json(resultado);

    } catch (error) {
        // Si hubo error (validación columnas, espacios, etc.)
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); // Limpiar
        console.error("Error procesando Excel:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en: http://localhost:${PORT}`);
});