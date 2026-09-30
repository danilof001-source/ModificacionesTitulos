// =============================================================================
// ARCHIVO: server.js
// UBICACIÓN: Raíz del proyecto
// DESCRIPCIÓN: Servidor principal (API).
// VERSIÓN: INTEGRAL CORREGIDA (Generación de TXT en Servidor activada)
// =============================================================================

const express = require('express');
const { types } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const archiver = require('archiver');
const { generarReporteDocx } = require('./src/generadorWord');
const bcrypt = require('bcrypt');

// Configuración de Tipos de PG (BIGINT a String)
types.setTypeParser(20, val => val.toString());

// Importaciones Locales
const db = require('./src/db'); 
const procesador = require('./src/procesador'); 
const diccionario = require('./src/diccionarioScripts');
const { generarExcelResultados } = require('./src/generadorExcel');
require('dotenv').config();

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });

// Middlewares
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// CARPETA DE RESULTADOS (CRÍTICO: Aquí se guardará el TXT final)
const RESULTADOS_DIR = path.join(__dirname, 'ResultadosModificaciones');
if (!fs.existsSync(RESULTADOS_DIR)) {
    fs.mkdirSync(RESULTADOS_DIR, { recursive: true });
}
// Exponemos esta carpeta públicamente para permitir la descarga
app.use('/descargas', express.static(RESULTADOS_DIR));

// LISTA DE TABLAS CRÍTICAS
const TABLAS_CRITICAS = [
    'servicio_titulos.identificaciones',
    'servicio_titulos.informaciones_academicas',
    'servicio_titulos.expedientes',
    'servicio_titulos.informaciones_academicas_regulares',
    'servicio_titulos.portadores_titulo',
    'servicio_titulos.resultados_revision',
    'servicio_titulos.titulos_academicos',
    'servicio_titulos.resultados_revision_analista_clasificaciones_cine'
];

// GESTIÓN DE TRANSACCIONES Y MEMORIA
const activeTransactions = new Map();

const cleanupTransaction = (txId) => {
    if (activeTransactions.has(txId)) {
        const { client, timeout, logId } = activeTransactions.get(txId);
        clearTimeout(timeout);
        try {
            client.query('ROLLBACK');
            client.release();
            if (logId) {
                db.query(`UPDATE modificacion_titulos_app.logs_app SET estado = 'ROLLED BACK (TIMEOUT)' WHERE id = $1`, [logId]).catch(e=>{});
            }
        } catch (e) { console.error("Error limpiando tx", e); }
        activeTransactions.delete(txId);
    }
};

/*async function gestionarTriggers(client, accion) {
    const estado = accion === 'DISABLE' ? 'DISABLE' : 'ENABLE';
    for (const t of TABLAS_CRITICAS) {
        try { 
            await client.query(`ALTER TABLE ${t} ${estado} TRIGGER ALL`); 
        } catch(e) { console.error(`Error triggers ${t}:`, e.message); }
    }
}*/

// -----------------------------------------------------------------------------
// ENDPOINTS DE VALIDACIÓN
// -----------------------------------------------------------------------------

app.post('/api/check-memo', async (req, res) => {
    const { nombreMemo } = req.body;
    try {
        const regexMemo = /^MINEDEC[-_][^\s-_]+[-_]\d{4}[-_]\d{4}[-_]M$/i;
        if (!regexMemo.test(nombreMemo)) {
            return res.json({ valid: false, canProceed: false, message: "Formato incorrecto (Ej: MINEDEC_DRT_2024_0001_M.pdf)" });
        }
        const result = await db.query(`SELECT estado FROM modificacion_titulos_app.logs_app WHERE nombre_memo = $1 ORDER BY id DESC LIMIT 1`, [nombreMemo]);

        if (result.rows.length > 0) {
            const estado = result.rows[0].estado;
            if (estado === 'COMMITTED') {
                return res.json({ valid: true, exists: true, canProceed: false, message: `El memo ${nombreMemo} ya fue procesado (COMMITTED).` });
            } else {
                const estadoVisual = (estado === 'ROLLED BACK') ? 'CANCELADO' : estado; 
                return res.json({ valid: true, exists: true, canProceed: true, message: `Advertencia: El memo ${nombreMemo} existe con estado '${estadoVisual}'.` });
            }
        }
        res.json({ valid: true, exists: false, canProceed: true, message: "Memorando válido." });
    } catch (error) { res.status(500).json({ valid: false, message: "Error verificando memo." }); }
});

app.post('/api/check-excel', upload.single('archivoExcel'), async (req, res) => {
    const filePath = req.file ? req.file.path : null;
    try {
        if (!filePath) throw new Error("No se recibió archivo.");
        await procesador.procesarArchivoExcel(filePath);
        res.json({ valid: true, message: "Estructura válida." });
    } catch (error) {
        if (error.validationErrors) return res.json({ valid: false, message: "Errores en matriz", details: error.validationErrors });
        res.json({ valid: false, message: error.message });
    } finally {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
});

// -----------------------------------------------------------------------------
// LOGIN
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// LOGIN
// -----------------------------------------------------------------------------
app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    try {
        // 1. Buscamos al usuario por su nombre y traemos su id y el hash guardado
        const r = await db.query(
            `SELECT id, contraseña FROM modificacion_titulos_app.usuarios_app WHERE nombreusuario = $1`, 
            [usuario]
        );

        // 2. Verificamos si el usuario existe en la base de datos
        if (r.rows.length > 0) {
            const usuarioDB = r.rows[0];
            
            // 3. Comparamos la clave que digitó el usuario con el hash de la BD
            const claveCorrecta = await bcrypt.compare(password, usuarioDB.contraseña);

            if (claveCorrecta) {
                // ¡Éxito! La contraseña es válida, ejecutamos tu lógica de conexión
                let ipRaw = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
                let ipLimpia = String(ipRaw).split(',')[0].trim().replace('::ffff:', '');
                if (!ipLimpia) ipLimpia = '0.0.0.0';
                
                res.json({ success: true, userId: usuarioDB.id, ip: ipLimpia, fechaIngreso: new Date() });
            } else {
                // La contraseña no coincide
                res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
            }
        } else {
            // El usuario no existe
            res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
        }
    } catch (err) { 
        console.error('Error en el login:', err); // Te agregué esto para que sea más fácil depurar si falla
        res.json({ success: false, message: 'Error BD' }); 
    }
});
/*app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const r = await db.query(`SELECT id FROM modificacion_titulos_app.usuarios_app WHERE nombreusuario = $1 AND contraseña = crypt($2, contraseña)`, [usuario, password]);
        if (r.rows.length > 0) {
            let ipRaw = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
            let ipLimpia = String(ipRaw).split(',')[0].trim().replace('::ffff:', '');
            if (!ipLimpia) ipLimpia = '0.0.0.0';
            res.json({ success: true, userId: r.rows[0].id, ip: ipLimpia, fechaIngreso: new Date() });
        } else {
            res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
        }
    } catch (err) { res.json({ success: false, message: 'Error BD' }); }
});*/

// -----------------------------------------------------------------------------
// PROCESAMIENTO CORE (/api/upload-matriz)
// -----------------------------------------------------------------------------
app.post('/api/upload-matriz', upload.single('archivoExcel'), async (req, res) => {
    let client = null;
    let filePath = req.file ? req.file.path : null;
    
    // Recibimos los nombres corregidos desde el Frontend
    const { userId, ipOrigen, fechaIngresoSession, nombreMemo } = req.body;
    const inicioProceso = new Date(); 

    // =========================================================================
    // LIMPIEZA AUTOMÁTICA DE SESIONES ANTERIORES
    // Si el usuario sube un archivo nuevo, matamos su transacción anterior
    // para evitar bloqueos (Deadlocks) en la Base de Datos.
    // =========================================================================
    if (userId) {
        for (const [key, tx] of activeTransactions.entries()) {
            // Nota: Debemos asegurarnos de guardar el userId en la transacción más abajo
            if (tx.userId === userId) {
                console.log(`>>> Limpiando sesión huérfana anterior: ${key}`);
                cleanupTransaction(key); 
            }
        }
    }
    // =========================================================================


    try {
        if (!userId || !filePath) throw new Error("Datos incompletos.");
        
        // Check duplicidad
        const checkExistencia = await db.query(`SELECT id FROM modificacion_titulos_app.logs_app WHERE nombre_memo = $1 AND estado = 'COMMITTED'`, [nombreMemo]);
        if (checkExistencia.rows.length > 0) throw new Error(`El memorando '${nombreMemo}' ya fue procesado exitosamente.`);

        // 1. Log Inicial
        const logRes = await db.query(`
            INSERT INTO modificacion_titulos_app.logs_app (usuarios_app_id, fecha_ingreso, ip_origen, nombre_memo, estado)
            VALUES ($1, $2, $3, $4, 'PROCESANDO') RETURNING id
        `, [userId, fechaIngresoSession, ipOrigen, nombreMemo]);
        const logId = logRes.rows[0].id;

        // 2. Procesar Excel
        const fase1 = await procesador.procesarArchivoExcel(filePath);
        const fileBuffer = fs.readFileSync(filePath);
        const originalName = req.file.originalname;
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath); 

        // 3. Transaccion DB
        client = await db.pool.connect(); 
        await client.query('BEGIN'); 

        const resultados = [];
        let logSqlUpdates = "";     // Acumulador Scripts
        let logSqlReverse = "";
        let logSqlSelects = "";     // Acumulador Verificaciones
        let logSqlAgrupado = "";

        const reporteDetallado = []; 
        const accumulatedPreData = [];  
        const accumulatedPostData = []; 
        const resultadosRaw = []; // <--- NUEVO: Para recolectar datos brutos
        const resultadosFinales = [];

        try {
            //await gestionarTriggers(client, 'DISABLE');
            
            // =================================================================
            // BLOQUE FOR CORREGIDO - LÓGICA BLINDADA Y SEPARADA
            // =================================================================
            for (const itemXls of fase1.datosExcel) {
                console.log(`>>> Procesando Item ${itemXls.no} - ${itemXls.cedula}`);
                const savepoint = `sp_${itemXls.no}`;
                let registroProcesado = false; // Bandera de seguridad
                
                // Respaldo inmediato para errores catastróficos
                let preRowFallback = { ...itemXls };
                
                try {
                    await client.query(`SAVEPOINT ${savepoint}`);

                    // 1. Preparación de Variables y Limpieza
                    // Sanitizamos comillas simples para evitar errores de sintaxis SQL
                    const rawRegistro = itemXls.registro ? String(itemXls.registro).replace(/'/g, "''") : '';
                    const codigoLimpio = rawRegistro.replace(/\s/g, ''); // Solo para códigos (CINE, etc)
                    
                    let scriptTemplate = "";
                    let paramsValues = "";

                    // 2. Selección de Estrategia según Tipo (SEPARADO PARA EVITAR ERRORES)
                    if (['CIDE', 'CNOM'].includes(itemXls.tipoModificacion)) {
                        // Identificación: Solo necesita cédula
                        scriptTemplate = diccionario.scripts.consultaPreModificacionIdentificacion;
                        paramsValues = `('${itemXls.cedula}', ${itemXls.no})`;

                    } else if (itemXls.tipoModificacion === 'CCON') {
                        // Conocimiento: Usa código limpio
                        scriptTemplate = diccionario.scripts.consultaPrePostModificacionCCON;
                        paramsValues = `('${itemXls.cedula}', '${codigoLimpio}', ${itemXls.no})`;

                    } else if (itemXls.tipoModificacion === 'CNAC') {
                        // Nacionalidad
                        scriptTemplate = diccionario.scripts.consultaPrePostModificacionCNAC;
                        paramsValues = `('${itemXls.cedula}', '${itemXls.m_nacionalidad}', ${itemXls.no})`;

                    } else if (itemXls.tipoModificacion === 'CGEN') {
                        // 1. OBTENER EL VALOR ORIGINAL
                        const raw = (itemXls.m_genero || '').toString().trim().toUpperCase();

                        // 2. TRANSFORMAR A PALABRA COMPLETA
                        const valorFinal = (raw === 'M') ? 'MASCULINO' : 
                                           (raw === 'F') ? 'FEMENINO' : raw;

                        // 3. ¡IMPORTANTE! SOBRESCRIBIR EL OBJETO PARA QUE SE VEA EN LA TABLA
                        // Esto hace que en la ventana POST aparezca "MASCULINO" y no "m"
                        itemXls.m_genero = valorFinal;

                        // 4. USAR EL VALOR TRANSFORMADO EN LA QUERY
                        scriptTemplate = diccionario.scripts.consultaPrePostModificacionCGEN;
                        paramsValues = `('${itemXls.cedula}', '${valorFinal}', ${itemXls.no})`;                    
                                            
                    } else if (['EOBS', 'MOBS', 'AOBS'].includes(itemXls.tipoModificacion)) {
                        // === CORRECCIÓN EOBS/MOBS ===
                        // Usamos rawRegistro (con espacios) o codigoLimpio según convenga, 
                        // pero aseguramos que la consulta reciba el parámetro esperado.
                        scriptTemplate = diccionario.scripts.consultaPrePostModificacion;
                        // Nota: Para EOBS/MOBS a veces se busca por texto exacto. Pasamos rawRegistro si codigoLimpio falla.
                        // Si rawRegistro está vacío (ej. EOBS sin texto), pasamos un comodín o manejamos en lógica
                        paramsValues = `('${itemXls.cedula}', '${rawRegistro || codigoLimpio}', ${itemXls.no})`;
                        
                    } else {
                        // Default
                        scriptTemplate = diccionario.scripts.consultaPrePostModificacion;
                        paramsValues = `('${itemXls.cedula}', '${codigoLimpio}', ${itemXls.no})`;
                    }

                    // 3. Ejecución Consulta PRE
                    const sqlPre = scriptTemplate.replace(/<<REEMPLAZAR_VALORES>>|<valores>/g, paramsValues);
                    const resPre = await client.query(sqlPre);

                    // Si no hay filas, forzamos un array con un null para reportar el "No Encontrado"
                    const filasEncontradas = resPre.rows.length > 0 ? resPre.rows : [null];

                    // 4. Iteración (Manejo de resultados)
                    for (const bdRowItem of filasEncontradas) {
                        
                        let itemPre = { no: itemXls.no, item: itemXls.no }; 
                        let itemPost = { no: itemXls.no, item: itemXls.no };
                        let errorSubItem = null;
                        let scriptGenerado = "";
                        let bdRow = bdRowItem || {}; 
                        const idFilaActual = bdRow.titulo_id || bdRow.id_titulos_academicos || bdRow.id_notas_portal;

                        // Validación: ¿Encontró algo en BD?
                        if (!bdRowItem) {
                             errorSubItem = `Registro no encontrado en BD (Cédula: ${itemXls.cedula}).`;
                             itemPre.ERROR = errorSubItem;;
                             
                        } else {
                            // Validaciones específicas de negocio
                            if (itemXls.tipoModificacion === 'CCON' && (!bdRow.rracine_id || bdRow.rracine_id == 0)) 
                                errorSubItem = "ALERTA: Registro CINE vacío en BD.";
                            
                            if (['MOBS', 'EOBS', 'AOBS'].includes(itemXls.tipoModificacion) && !bdRow.id_notas_portal) 
                                errorSubItem = "ALERTA: ID nota no encontrado (verifique texto exacto).";
                        }

                        // Mapeo de datos para visualización
                        for (let k in bdRow) { if (bdRow[k] !== null) itemPre[k] = String(bdRow[k]); }
                        
                        // Asegurar IDs para Excel
                        itemPre.no = itemXls.no ? String(itemXls.no) : "0"; 
                        itemPre.item = itemPre.no;
                        itemPost.no = itemPre.no;
                        itemPost.item = itemPre.no;

                        // Generar SQL UPDATE/DELETE
                        if (errorSubItem) {
                            scriptGenerado = `-- NO APLICA: ${errorSubItem}`;
                        } else {
                            const funcionGeneradora = diccionario.MAPA_ACCIONES[itemXls.tipoModificacion];
                            if (funcionGeneradora) {
                                try {
                                    // Recibimos el objeto { forward, reverse }
                                    const resultadoObj = funcionGeneradora(itemXls, bdRow);
                                    scriptGenerado = resultadoObj.forward;

                                    // Acumulamos el reverso en la variable global que creamos arriba
                                    logSqlReverse += `-- REVERSO Item ${itemXls.no}:\n${resultadoObj.reverse}\n`;

                                } catch (genErr) {
                                    console.error("Error detallado:", genErr.message); 
                                    scriptGenerado = `-- Error generando script: ${genErr.message}`;
                                    errorSubItem = genErr.message; // <--- AQUÍ SE MUESTRA EL MENSAJE REAL ("NO COINCIDE...", ETC.)
                                }
                            } else { 
                                scriptGenerado = "-- Tipo no soportado"; 
                                errorSubItem = "Tipo de modificación no configurado"; 
                            }
                        }

                        // Ejecutar Acción
                        if (!errorSubItem) {
                            await client.query(scriptGenerado);
                        }

                        // Verificación POST
                        if (errorSubItem) {
                            // CASO ERROR: Preparamos el objeto visual con el mensaje de error
                            itemPost = { ...itemPre, ...itemXls };
                            
                            Object.keys(itemXls).forEach(key => {
                                if (key.startsWith('m_')) itemPost[key] = errorSubItem;
                            });

                            itemPost.RESULTADO = "SIN CAMBIOS: " + errorSubItem;
                            itemPost.ERROR = errorSubItem;
                            itemPost.observacion = errorSubItem;
                            itemPost.mensaje = errorSubItem;

                        } else {
                            // 1. Preparar y Ejecutar la consulta POST
                            let paramsPost = paramsValues;
                            if (itemXls.tipoModificacion === 'CIDE') {
                                paramsPost = `('${itemXls.m_cedula || itemXls.cedula}', ${itemXls.no})`;
                            }
                            const sqlPost = scriptTemplate.replace(/<<REEMPLAZAR_VALORES>>|<valores>/g, paramsPost);
                            const resPost = await client.query(sqlPost); // <--- ESTO ARREGLA EL ERROR DE "INITIALIZATION"

                            // ============================================================
                            // INICIO BLOQUE LOGS DEPURACIÓN (SUPER DETALLADO)
                            // ============================================================
                            const idOriginal = bdRow.titulo_id || bdRow.id_titulos_academicos || bdRow.id_notas_portal;
                            console.log(`\n=== DEBUG ITEM ${itemXls.no} ===`);
                            console.log(`1. ID ORIGINAL (PRE) a buscar: [ ${idOriginal} ]`);
                            console.log(`   Título Original: ${bdRow.nombretitulo}`);
                            
                            console.log(`2. RESULTADOS TRAIDOS DE BD (POST): ${resPost.rows.length} filas.`);
                            resPost.rows.forEach((r, idx) => {
                                const idPost = r.titulo_id || r.id_titulos_academicos || r.id_notas_portal;
                                console.log(`   -> Fila [${idx}]: ID=${idPost} | Título=${r.nombretitulo}`);
                            });
                            // ============================================================

                            // 2. Lógica de Match (Buscamos el ID exacto)
                            let rowMatch = resPost.rows.find(r => {
                                const idPost = r.titulo_id || r.id_titulos_academicos || r.id_notas_portal;
                                return String(idPost) === String(idOriginal);
                            });

                            if (rowMatch) {
                                console.log(`3. MATCH: EXITOSO. Se usará la fila con ID ${idOriginal}`);
                                // Mapeamos datos encontrados
                                for (const key in rowMatch) {
                                    if (rowMatch[key] !== null) itemPost[key] = String(rowMatch[key]);
                                }
                                itemPost.ESTADO_FINAL = "VERIFICADO";
                            } else {
                                console.log(`3. MATCH: FALLIDO. No se encontró el ID ${idOriginal} en el array POST.`);
                                console.log(`   ACCION: Se usará la fila [0] como fallback (causa de duplicados).`);
                                
                                // FALLBACK: Si no hay match, toma el primero (AQUÍ ES DONDE SE DUPLICAN LOS DATOS SI FALLA EL ID)
                                if (resPost.rows.length > 0) {
                                    rowMatch = resPost.rows[0]; 
                                    for (const key in rowMatch) {
                                        if (rowMatch[key] !== null) itemPost[key] = String(rowMatch[key]);
                                    }
                                }
                                itemPost.ESTADO_FINAL = "POSIBLE DUPLICADO (ID NO COINCIDE)";
                            }
                        }

                        // Metadata Final
                        itemPost.tipo_modificacion = itemXls.tipoModificacion;
                        if (itemXls.tipoModificacion === 'CCON' && !errorSubItem) {
                            itemPost.cine_campo_conocimiento = itemXls.m_conocimiento;
                        }

                        logSqlUpdates += `-- Item ${itemXls.no} (${itemXls.tipoModificacion}):\n${scriptGenerado}\n`;

                        // PUSH A RESULTADOS
                        accumulatedPreData.push(itemPre);
                        accumulatedPostData.push(itemPost);

                        reporteDetallado.push({
                            item: itemXls.no,
                            tipo: itemXls.tipoModificacion,
                            estado: errorSubItem ? 'ERROR' : 'OK',
                            mensaje: errorSubItem || 'Correcto'
                        });

                        resultadosRaw.push({
                            tipo: itemXls.tipoModificacion,
                            exito: !errorSubItem,
                            datosBD: bdRow,
                            datosPre: bdRow,
                            datosExcel: itemXls
                        });
                        
                        registroProcesado = true; // Confirmamos que se generó salida

                    } // Fin loop interno

                    await client.query(`RELEASE SAVEPOINT ${savepoint}`);

                } catch (err) {
                    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
                    console.error("ERROR CRITICO ITEM:", itemXls.no, err);
                    
                    preRowFallback.ERROR = "Fallo Crítico";
                    preRowFallback.DETALLE = err.message;
                    preRowFallback.no = itemXls.no ? String(itemXls.no) : "0";
                    preRowFallback.item = preRowFallback.no; // Clave para el frontend
                    
                    let postRowFallback = { ...preRowFallback };
                    
                    accumulatedPreData.push(preRowFallback);
                    accumulatedPostData.push(postRowFallback);
                    
                    reporteDetallado.push({
                        item: itemXls.no,
                        tipo: itemXls.tipoModificacion || 'DESC',
                        estado: 'ERROR',
                        mensaje: `Excepción: ${err.message}`
                    });
                    
                    registroProcesado = true;
                }

                // RED DE SEGURIDAD: Si por alguna razón extraña no se procesó, forzar entrada
                if (!registroProcesado) {
                    preRowFallback.ERROR = "Error desconocido (Fila perdida)";
                    preRowFallback.no = itemXls.no ? String(itemXls.no) : "0";
                    preRowFallback.item = preRowFallback.no;
                    accumulatedPreData.push(preRowFallback);
                    accumulatedPostData.push(preRowFallback);
                    reporteDetallado.push({
                        item: itemXls.no,
                        tipo: itemXls.tipoModificacion,
                        estado: 'ERROR',
                        mensaje: "Error de flujo lógico (Item perdido)"
                    });
                }
            }
            // =================================================================


        } finally {
            //await gestionarTriggers(client, 'ENABLE');
        }

        // Actualizar Log BD (Pendiente)
        await db.query(`UPDATE modificacion_titulos_app.logs_app SET nombre_matriz_excel=$1, binario_excel=$2, inicio_proceso=$3, fin_proceso=NOW(), estado='PENDIENTE' WHERE id=$4`, 
            [originalName, fileBuffer, inicioProceso, logId]);

        // =====================================================================
        // Generar Lógica Agrupada (Sección B)
        // =====================================================================
        let logSqlAgrupadoPre = ""; // Variable nueva para el script PRE
        
        try {
            // Obtenemos el OBJETO con los dos scripts
            const scriptsGen = procesador.generarSQLAgrupado(resultadosRaw);
            
            // Asignamos a las variables
            logSqlAgrupado = scriptsGen.sqlAgrupadoPost;    // Script POST (Columna B)
            logSqlAgrupadoPre = scriptsGen.sqlAgrupadoPre;  // Script PRE (Columna A)
            
        } catch (e) {
            console.error("Error generando agrupados:", e);
            logSqlAgrupado = "-- Error generando consultas masivas --";
            logSqlAgrupadoPre = "-- Error --";
        }
        // =====================================================================


        // Calculamos las estadísticas afuera para asegurar que la variable siempre exista
        const statsJson = {
            total: resultados.length,
            correctos: resultados.filter(r => r.estado === 'OK').length,
            errores: resultados.filter(r => r.estado === 'ERROR').length
        };


        // Guardar Sesión en Memoria (Incluyendo SQL para el archivo final)
        const txId = 'tx_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        activeTransactions.set(txId, { 
            client, 
            userId: userId, // <--- Importante para la limpieza
            timeout: setTimeout(() => cleanupTransaction(txId), 300000), // 5 min timeout
            logId,
            sqlUpdates: logSqlUpdates,   // Guardamos Updates
            sqlReverse: logSqlReverse,
            sqlSelects: logSqlSelects,   // Guardamos Selects

            sqlAgrupado: logSqlAgrupado, //  Guardamos la Sección B
            sqlAgrupadoPre: logSqlAgrupadoPre,
            sqlAgrupadoPost: logSqlAgrupado,

            estadisticas: statsJson, // guardamos registro JSON de totales por tipo de modificacion
            nombreMemo: nombreMemo,
            reporte: reporteDetallado,
            nombreArchivoExcel: originalName,

            // === ESTO ES LO QUE FALTA PARA QUE EL EXCEL NO SALGA VACÍO ===
            datosPre: accumulatedPreData,   
            datosPost: accumulatedPostData
        });

        // Respuesta al Cliente
        const totalOk = reporteDetallado.filter(r => r.estado === 'OK').length;
        const totalErr = reporteDetallado.filter(r => r.estado === 'ERROR').length;
        
        res.json({ 
            success: true, 
            transactionId: txId, 
            datosPre: accumulatedPreData, 
            datosPost: accumulatedPostData, 
            reporte: reporteDetallado,
            sqlDebug: logSqlUpdates, // Para vista previa
            // Enviamos esto también por si el cliente quiere descargar un preview local
            seccionUpdates: logSqlUpdates,
            seccionSelects: logSqlSelects,
			totalMatrizOriginal: fase1.datosExcel.length
        });

    } catch (error) {
        console.error("ERROR UPLOAD:", error);
        if (client) { try{ await client.query('ROLLBACK'); client.release(); } catch(e){} }
        if (typeof logId !== 'undefined' && logId) await db.query(`UPDATE modificacion_titulos_app.logs_app SET estado = 'ERROR PROCESO' WHERE id = $1`, [logId]).catch(e=>{});
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({ success: false, message: error.message });
    }
});


// -----------------------------------------------------------------------------
// COMMIT (CRÍTICO: GENERACIÓN DE ARCHIVO)
// -----------------------------------------------------------------------------

app.post('/api/commit', async (req, res) => {
    const { transactionId } = req.body;
    const tx = activeTransactions.get(transactionId);
    
    if (!tx) return res.status(404).json({ success: false, message: "Sesión expirada o inválida." });
    
    try {
        // 1. COMMIT a Base de Datos
        await tx.client.query('COMMIT'); 
        
        // 2. GENERACIÓN DE ARCHIVOS (Server Side)
        const fechaStr = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Definimos el nombre del ZIP
        const zipFileName = `REPORTE_${tx.nombreMemo}_${fechaStr}.zip`;
        const zipPath = path.join(RESULTADOS_DIR, zipFileName);

        // A) Generamos el Excel en memoria (Buffer)
        const bufferExcel = await generarExcelResultados(tx);


        
        // --- INICIO BLOQUE ZIP (Word + TXT) ---
        
        // 1. Generar el Word (usando el nombre del Excel que guardamos en el paso anterior)
        // Si por alguna razón no hay nombre, usa uno por defecto
        const nombreExcel = tx.nombreArchivoExcel || "Matriz_Datos.xlsx";
        const docxBuffer = await generarReporteDocx(tx.nombreMemo, tx.reporte, nombreExcel);

        // 2. Crear el flujo del ZIP
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } }); // Compresión máxima

        // Promesa para asegurar que el archivo se termine de escribir antes de responder
        const zipPromise = new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
        });

        archive.pipe(output);

        // 4. Agregar los archivos al paquete
        // A) El TXT (usamos la variable 'contenidoArchivo' que ya creaste arriba)
        archive.append(bufferExcel, { name: `REPORTE_TECNICO_${tx.nombreMemo}.xlsx` });
        
        // B) El Word (usamos el buffer generado)
        archive.append(docxBuffer, { name: `Detalle_Atencion_${tx.nombreMemo}.docx` });

        // Finalizar y esperar
        await archive.finalize();
        await zipPromise; 

        // 5. Actualizar Log BD y Responder
        await db.query(
        `UPDATE modificacion_titulos_app.logs_app 
        SET estado = 'COMMITTED', sentencia_sql = $1, suma_tipo_proceso = $2 
        WHERE id = $3`, 
        [tx.sqlUpdates, tx.estadisticas, tx.logId]);
            
        res.json({ 
            success: true, 
            message: "Cambios guardados. Descarga el paquete ZIP.", 
            finalUrl: `/descargas/${zipFileName}` 
        });
        
        // --- FIN BLOQUE ZIP ---

    }  catch (e) {
        if(tx.client) await tx.client.query('ROLLBACK'); 
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if(tx.client) tx.client.release();
        clearTimeout(tx.timeout);
        activeTransactions.delete(transactionId);
    }
});

app.post('/api/rollback', async (req, res) => {
    const { transactionId } = req.body;
    const tx = activeTransactions.get(transactionId);
    if (!tx) return res.json({ success: true, message: "Sesión cerrada o expirada." });
    
    try {
        await tx.client.query('ROLLBACK');
        await db.query(`UPDATE modificacion_titulos_app.logs_app SET estado = 'ROLLED BACK' WHERE id = $1`, [tx.logId]);
        res.json({ success: true, message: "Operación cancelada correctamente." });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if(tx.client) tx.client.release();
        clearTimeout(tx.timeout);
        activeTransactions.delete(transactionId); 
    }
});

app.listen(PORT, () => console.log(`>>> Servidor iniciado en puerto ${PORT}`));