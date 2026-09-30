// =============================================================================
// MÓDULO: GENERADOR DE REPORTE EXCEL
// UBICACIÓN: src/generadorExcel.js
// DESCRIPCIÓN: Genera un archivo .xlsx con 5 hojas detallando el proceso.
// =============================================================================

    const ExcelJS = require('exceljs');
    const generarExcelResultados = async (txData) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema Modificación Títulos';
    workbook.created = new Date();

    // -------------------------------------------------------------------------
    // HOJA 1: SCRIPTS DE VERIFICACIÓN
    // -------------------------------------------------------------------------
    const wsScripts = workbook.addWorksheet('1. Scripts Verificación');
    
    // 1. Configuramos las columnas SIN la propiedad 'header' para que no escriba en la fila 1
    wsScripts.columns = [
        { key: 'pre', width: 100 },
        { key: 'post', width: 100 }
    ];

    // 2. --- CABECERA DEL MEMORANDO ---
    const nombreMemo = txData.nombreMemo || 'MEMORANDO_NO_ESPECIFICADO';
    const asuntoMemo = txData.asuntoMemo || 'Asunto no especificado';

    wsScripts.addRow(['--------------------------------------------------------------------------------------------------------']);
    wsScripts.addRow([nombreMemo]);
    wsScripts.addRow([`Asunto: ${asuntoMemo}`]);
    wsScripts.addRow(['--------------------------------------------------------------------------------------------------------']);
    wsScripts.addRow([]); // Fila vacía de separación
    // ---------------------------------

    // 3. Fila de los títulos de las columnas (Fila 6)
    const filaTitulos = wsScripts.addRow({
        pre: 'SCRIPT AGRUPADO PRE-MODIFICACIÓN', 
        post: 'SCRIPT AGRUPADO POST-MODIFICACIÓN'
    });
    filaTitulos.font = { bold: true }; // Aplicamos negrita a estos encabezados
    
    // 4. Inserción de los datos
    const scriptPre = txData.sqlAgrupadoPre || '';
    const scriptPost = txData.sqlAgrupadoPost || '';

    const lineasPre = scriptPre.split('\n');
    const lineasPost = scriptPost.split('\n');
    const maxLineas = Math.max(lineasPre.length, lineasPost.length);

    if (maxLineas === 0) {
        wsScripts.addRow({ pre: '-- Sin datos --', post: '-- Sin datos --' });
    } else {
        for (let i = 0; i < maxLineas; i++) {
            wsScripts.addRow({
                pre: lineasPre[i] || '', 
                post: lineasPost[i] || ''
            });
        }
    }

    // -------------------------------------------------------------------------
    // HOJA 2: DATOS ANTES (Punto 2 - Pre-Updates)
    // -------------------------------------------------------------------------
    const wsPre = workbook.addWorksheet('2. Datos ANTES');
    if (txData.datosPre && txData.datosPre.length > 0) {
        // CORRECCIÓN: Filtramos explícitamente la columna 'item'
        const headers = Object.keys(txData.datosPre[0]).filter(k => k !== 'item');
        
        wsPre.columns = headers.map(h => ({ header: h.toUpperCase(), key: h, width: 20 }));
        wsPre.addRows(txData.datosPre);
    } else {
        wsPre.addRow(['No hay datos previos registrados']);
    }

    // -------------------------------------------------------------------------
    // HOJA 3: DATOS DESPUÉS (Punto 3 - Post-Updates Real)
    // -------------------------------------------------------------------------
    const wsPost = workbook.addWorksheet('3. Datos DESPUÉS (Real)');
    if (txData.datosPost && txData.datosPost.length > 0) {
        // CORRECCIÓN: Filtramos explícitamente la columna 'item'
        const headers = Object.keys(txData.datosPost[0]).filter(k => k !== 'item');

        wsPost.columns = headers.map(h => ({ header: h.toUpperCase(), key: h, width: 20 }));
        wsPost.addRows(txData.datosPost);
    } else {
        wsPost.addRow(['No hay datos posteriores verificados']);
    }

    // -------------------------------------------------------------------------
    // HOJA 4: UPDATES EJECUTADOS (Punto 4)
    // -------------------------------------------------------------------------
    const wsUpdates = workbook.addWorksheet('4. Sentencias SQL');
    wsUpdates.columns = [{ header: 'SENTENCIA UPDATE EJECUTADA', key: 'sql', width: 120 }];
    
    if (txData.sqlUpdates) {
        const sentencias = txData.sqlUpdates.split('\n').filter(s => s.trim() !== '');
        sentencias.forEach(sql => {
            wsUpdates.addRow({ sql: sql });
        });
    } else {
        wsUpdates.addRow({ sql: '-- No se ejecutaron actualizaciones --' });
    }

    // -------------------------------------------------------------------------
    // HOJA 5: RESUMEN (Punto 5)
    // -------------------------------------------------------------------------
    const wsResumen = workbook.addWorksheet('5. Resumen Proceso');
    wsResumen.columns = [
        { header: 'ITEM', key: 'item', width: 10 },
        { header: 'TIPO', key: 'tipo', width: 15 },
        { header: 'ESTADO', key: 'estado', width: 15 },
        { header: 'MENSAJE / ERROR', key: 'mensaje', width: 60 }
    ];

    if (txData.reporte && txData.reporte.length > 0) {
        wsResumen.addRows(txData.reporte);
    }

    // --- Estilo Básico para Cabeceras (Negrita) ---
    // (Quitamos wsScripts de este array porque ya formateamos su cabecera arriba)
    [wsPre, wsPost, wsUpdates, wsResumen].forEach(ws => {
        if(ws.getRow(1)) {
            ws.getRow(1).font = { bold: true };
        }
    });

    return await workbook.xlsx.writeBuffer();
};

module.exports = { generarExcelResultados };