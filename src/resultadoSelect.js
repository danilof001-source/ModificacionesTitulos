const fs = require('fs');
const path = require('path');

/**
 * Ejecuta el script SQL y guarda el resultado en resultados.txt
 * @param {string} fase - 'PRE' o 'POST'
 * @param {string} scriptSql - El script SQL generado por procesador.js
 * @param {object} pool - La conexión a tu base de datos
 * @param {string} directorioDestino - Carpeta donde se guardará el txt
 */
async function ejecutarYGuardarSelect(fase, scriptSql, pool, directorioDestino) {
    // Si no hay script (ej. no hubo registros válidos), salimos
    if (!scriptSql || scriptSql.trim() === '') return;

    const rutaArchivo = path.join(directorioDestino, 'resultados.txt');
    const cabecera = fase === 'PRE' 
        ? 'RESULTADOS PRE-MODIFICACION\n===========================\n' 
        : '\nRESULTADOS POST-MODIFICACION\n============================\n';

    try {
        // Ejecutamos el select en la base de datos
        const resultado = await pool.query(scriptSql);
        
        // Dependiendo de la librería (pg, mysql2), los datos suelen estar en .rows
        const datos = resultado.rows ? resultado.rows : resultado;

        // Formateamos la salida
        const contenido = cabecera + JSON.stringify(datos, null, 2) + '\n';

        // 'w' sobrescribe el archivo (para PRE), 'a' añade al final (para POST)
        const flag = fase === 'PRE' ? 'w' : 'a';
        fs.writeFileSync(rutaArchivo, contenido, { flag });

    } catch (error) {
        console.error(`Error ejecutando SELECT ${fase}:`, error);
        const errorMsg = `${cabecera}ERROR AL EJECUTAR SCRIPT:\n${error.message}\n`;
        fs.writeFileSync(rutaArchivo, errorMsg, { flag: fase === 'PRE' ? 'w' : 'a' });
    }
}

module.exports = { ejecutarYGuardarSelect };