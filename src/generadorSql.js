// =============================================================================
// -- MÓDULO: GENERADOR DE SCRIPT SQL
// -- UBICACIÓN: src/generadorSql.js
// -- DESCRIPCIÓN: Genera el reporte SQL agrupado dinámicamente por tipo de 
// -- modificación (CCON, CIES, CIDE, etc.) para n tipos de modificaciones.
// =============================================================================

// Diccionario predeterminado de etiquetas para los tipos conocidos
const DICCIONARIO_DESCRIPCIONES = {
    'CCON': 'CAMPO DE CONOCIMIENTO',
    'CIES': 'CAMBIO DE IES',
    'CIDE': 'CAMBIO DE IDENTIFICACIÓN',
    'CNOM': 'CAMBIO DE NOMBRES',
    'AOBS': 'AGREGAR OBSERVACIÓN',
    'CTIT': 'CAMBIO DE TÍTULO ACADÉMICO',
    'CNIV': 'CAMBIO DE NIVEL DE FORMACIÓN',
    'IOBS': 'INGRESO DE NOTAS PORTAL',
    'EOBS': 'ELIMINACIÓN DE OBSERVACIÓN',
    'MOBS': 'MODIFICACIÓN DE OBSERVACIÓN',
    'CGEN': 'CAMBIO DE GÉNERO',
    'CNAC': 'CAMBIO DE PAÍS NACIONALIDAD'
};

/**
 * Extrae las claves de un objeto de forma segura evadiendo strings
 */
const obtenerClaves = (obj) => {
    return (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) ? Object.keys(obj) : [];
};

/**
 * Extrae exclusivamente la consulta SQL correspondiente al tipo actual,
 * filtrando cualquier script de otros tipos en caso de recibir texto agrupado.
 */
const extraerConsultaPorTipo = (fuente, tipo, fallback = '') => {
    let candidato = '';

    if (typeof fuente === 'object' && fuente !== null && fuente[tipo]) {
        candidato = fuente[tipo];
    } else if (typeof fuente === 'string' && fuente.trim()) {
        candidato = fuente;
    } else if (typeof fallback === 'string' && fallback.trim()) {
        candidato = fallback;
    }

    if (!candidato || !candidato.trim()) {
        return '';
    }

    // Si el texto contiene encabezados multipropósito "-- TIPO ", aislar únicamente el de este tipo
    if (/--\s*TIPO\s+/i.test(candidato)) {
        const reEscapedTipo = tipo.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(?:^|\\n)\\s*--\\s*TIPO\\s+${reEscapedTipo}\\b[\\s\\S]*?(?=(?:\\n\\s*--\\s*TIPO\\s+[A-Z0-9_]+)|$)`, 'i');
        const match = candidato.match(regex);
        if (match) {
            return match[0].trim();
        } else {
            return '';
        }
    }

    return candidato.trim();
};

/**
 * Calcula la cantidad de registros involucrados por cada tipo
 */
const calcularCantidadRegistros = (tipo, txData, updatesMap, datosPreMap) => {
    if (txData.conteoPorTipo && txData.conteoPorTipo[tipo]) {
        return txData.conteoPorTipo[tipo];
    }
    
    // Contar sentencias UPDATE en el texto
    const updText = typeof updatesMap === 'object' ? (updatesMap[tipo] || '') : (updatesMap || '');
    const coincidenciasUpdate = updText.match(/\bUPDATE\b/gi);
    if (coincidenciasUpdate && coincidenciasUpdate.length > 0) {
        return coincidenciasUpdate.length;
    }

    // Contar filas de la tabla de resultados PRE
    const preText = typeof datosPreMap === 'object' ? (datosPreMap[tipo] || '') : (datosPreMap || '');
    const lineasDatos = preText.trim().split('\n').filter(linea => /^\s*\d+\s*\|/.test(linea));
    if (lineasDatos.length > 0) {
        return lineasDatos.length;
    }

    return 0;
};

const generarSqlResultados = (txData) => {
    const nombreMemo = txData.nombreMemo || 'MEMORANDO_NO_ESPECIFICADO';
    const asuntoMemo = txData.asuntoMemo || 'Asunto no especificado';

    // Mapas de objetos por tipo con fallbacks para compatibilidad
    const sqlPreMap = txData.consultasPrePorTipo || txData.sqlPrePorTipo || txData.sqlPre || {};
    const datosPreMap = txData.preConsultasPorTipo || txData.datosPre || {};
    const updatesMap = txData.updatesPorTipo || txData.updates || {};
    const sqlPostMap = txData.consultasPostPorTipo || txData.sqlPostPorTipo || txData.sqlPost || {};
    const datosPostMap = txData.postConsultasPorTipo || txData.datosPost || {};
    const descripcionesMap = txData.descripcionesPorTipo || txData.titulosPorTipo || {};

    // Obtener los tipos de modificación únicos recibidos evitando claves numéricas de strings
    let tiposUnicos = Array.from(new Set([
        ...(Array.isArray(txData.tipos) ? txData.tipos : []),
        ...obtenerClaves(txData.conteoPorTipo),
        ...obtenerClaves(sqlPreMap),
        ...obtenerClaves(datosPreMap),
        ...obtenerClaves(updatesMap),
        ...obtenerClaves(sqlPostMap),
        ...obtenerClaves(datosPostMap),
        ...obtenerClaves(descripcionesMap)
    ]));

    // Si los mapas venían como strings simples, detectar dinámicamente los tipos por la etiqueta '-- TIPO XXX'
    if (tiposUnicos.length === 0) {
        const textoCompleto = JSON.stringify(txData);
        const matches = textoCompleto.match(/--\s*TIPO\s+([A-Z0-9_]+)/gi);
        if (matches) {
            tiposUnicos = Array.from(new Set(matches.map(m => m.replace(/--\s*TIPO\s+/i, '').trim())));
        }
    }

    // Generar encabezado global del archivo
    let sqlString = `--==================================================================\n`;
    sqlString += `-- REPORTE DE SENTENCIAS SQL - MEMO: ${nombreMemo}\n`;
    sqlString += `-- Asunto: ${asuntoMemo}\n`;
    
    const fecha = new Date();
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const fechaFormateada = `${String(fecha.getDate()).padStart(2, '0')}-${meses[fecha.getMonth()]}-${fecha.getFullYear()}`;
    
    sqlString += `-- Fecha de Generacion: ${fechaFormateada}\n`;
    sqlString += `--==================================================================\n\n\n`;

    if (tiposUnicos.length === 0) {
        sqlString += `-- No se registraron tipos de modificación para procesar.\n`;
        return sqlString;
    }

    // Iterar por cada tipo de modificación
    tiposUnicos.forEach((tipo) => {
        // Obtener descripción
        const descripcion = descripcionesMap[tipo] || DICCIONARIO_DESCRIPCIONES[tipo] || `MODIFICACIÓN ${tipo}`;
        
        // Calcular el número de registros
        //const totalRegs = calcularCantidadRegistros(tipo, txData, updatesMap, datosPreMap);
        //const textoRegs = totalRegs > 0 ? `${totalRegs} ${totalRegs === 1 ? 'reg' : 'regs'}` : '';

        // Construir encabezado del bloque de modificación
        //const tituloBloque = textoRegs ? `${tipo}: ${descripcion}: ${textoRegs}` : `${tipo}: ${descripcion}`;
        const tituloBloque = `${tipo}: ${descripcion}`;

        sqlString += `--***************************************************\n`;
        sqlString += `-- ${tituloBloque}\n`;
        sqlString += `--***************************************************\n`;

        // 1. CONSULTA PRE MODIFICACION
        sqlString += `-- 1. CONSULTA PRE MODIFICACION\n`;
        const queryPre = extraerConsultaPorTipo(sqlPreMap, tipo, txData.sqlAgrupadoPre) || '-- Sin consulta PRE';
        sqlString += `${queryPre.trim()}\n\n`;

        // 1.1 RESULTADO PRE-MODIFICACIÓN
        sqlString += `-- 1.1 RESULTADO PRE-MODIFICACIÓN\n`;
        const tablaPre = typeof datosPreMap === 'object' ? (datosPreMap[tipo] || '') : (datosPreMap || '');
        sqlString += tablaPre.trim() ? `/*--- \n${tablaPre.trim()}\n*/--- \n\n` : `-- Sin datos de resultados PRE.\n\n`;

        // 2. UPDATE
        sqlString += `-- 2. UPDATE\n`;
        sqlString += `BEGIN;\n`;
        const sqlUpdates = typeof updatesMap === 'object' ? (updatesMap[tipo] || '-- Sin sentencias UPDATE') : (updatesMap || '-- Sin sentencias UPDATE');
        sqlString += `${sqlUpdates.trim()}\n\n`;

        // 3. CONSULTA POST MODIFICACION
        sqlString += `-- 3. CONSULTA POST MODIFICACION\n`;
        const queryPost = extraerConsultaPorTipo(sqlPostMap, tipo, txData.sqlAgrupadoPost) || '-- Sin consulta POST';
        sqlString += `${queryPost.trim()}\n\n`;

        // 3.1 RESULTADO POST-MODIFICACIÓN
        sqlString += `-- 3.1 RESULTADO POST-MODIFICACIÓN\n`;
        const tablaPost = typeof datosPostMap === 'object' ? (datosPostMap[tipo] || '') : (datosPostMap || '');
        sqlString += tablaPost.trim() ? `/*--- \n${tablaPost.trim()}\n*/--- \n\n` : `-- Sin datos de resultados POST.\n\n`;

        // Cierre de transacción del bloque
        sqlString += `--COMMIT;\n`;
        sqlString += `--ROLLBACK;\n\n\n\n`;
    });

    return sqlString.trimEnd() + '\n';
};

module.exports = { generarSqlResultados };