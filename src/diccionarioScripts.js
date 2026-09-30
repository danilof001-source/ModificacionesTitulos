// =============================================================================
// MÓDULO: DICCIONARIO DE SCRIPTS Y ACCIONES
// UBICACIÓN: src/diccionarioScripts.js
// =============================================================================

const MAPA_PAISES = require('../public/paises.js'); // Se importa el mapa de paises.js

// Construimos el bloque CASE WHEN iterando sobre el diccionario
const sqlCasePaises = `CASE pt.idpaisnacionalidad 
    ${Object.entries(MAPA_PAISES).map(([codigo, nombre]) => `WHEN '${codigo}' THEN '${nombre}'`).join('\n    ')}
    ELSE 'Desconocido' 
END`;

// --- DETERMINACIÓN DINÁMICA DEL ESQUEMA ---
const dbHost = process.env.DB_HOST;
let ESQUEMA = 'servicio_titulos'; // Valor por defecto seguro

if (dbHost === '10.180.2.3' || dbHost === '127.0.0.1') {
    ESQUEMA = 'servicio_titulos_consulta';
} else if (dbHost === '10.181.1.125') {
    //ESQUEMA = 'servicio_titulos';
}

// Función auxiliar para limpiar espacios y mayúsculas
// MEJORA: Manejo más estricto de nulos/undefined vs '0'
const normalizar = (texto) => {
    if (texto === null || texto === undefined) return '';
    return String(texto).toUpperCase().replace(/\s+/g, ' ').trim();
};

// Función auxiliar para validar existencia del registro destino
const validarIdNotas = (datosBD) => {
    if (!datosBD.id_notas_portal || datosBD.id_notas_portal === '0' || datosBD.id_notas_portal === 0) {
        throw new Error("El registro en BD no tiene un ID de notas_portal válido para modificar.");
    }
};

// --- PARTE 1: SCRIPTS FIJOS (CONSULTAS INICIALES) ---
const scripts = {

    // -------------------------------------------------------------
    // SCRIPT 1: ESTÁNDAR (OPTIMIZADO CON TÉCNICA LATERAL/STRICT)
    // -------------------------------------------------------------
    consultaPrePostModificacion: `
        WITH datos_excel(cedula_excel, codigo_excel, posicion) AS (
            VALUES 
            <<REEMPLAZAR_VALORES>>
        )
        SELECT 
            dx.posicion AS item, i.numeroidentificacion, rdd.codigo, pt.nombrescompletos, pt.genero, pt.idpaisnacionalidad, 
            rr.id AS id_notas_portal, COALESCE(rr.notas_portal, '') AS notas_portal, ia.id AS id_informaciones_academicas, 
            ta.id AS id_titulos_academicos, ta.nombretitulo, ta.niveldeformacion, ae.fecha_ingreso_estado, e.informacionacademicaid,
            iar.institucionextranjeraid, ie.nombre AS institucionextranjeranombre       
        FROM datos_excel dx
        INNER JOIN ${ESQUEMA}.identificaciones i ON replace(i.numeroidentificacion, ' ', '') = replace(dx.cedula_excel, ' ', '')
        INNER JOIN ${ESQUEMA}.portadores_titulo pt ON i.id = pt.id_identificacion 
        INNER JOIN ${ESQUEMA}.expedientes e ON pt.id = e.portadortituloid 
        INNER JOIN ${ESQUEMA}.asignaciones_expedientes ae ON e.id = ae.expediente_id 
        INNER JOIN ${ESQUEMA}.resultados_revision rr ON ae.id = rr.siguiente_asignacion_expediente_id 
        INNER JOIN ${ESQUEMA}.resultados_revision_delegado rrd ON rr.id = rrd.id 
        INNER JOIN ${ESQUEMA}.resultados_revision_delegado_aprobado rdd ON rrd.id = rdd.id 
            AND replace(rdd.codigo, ' ', '') = replace(dx.codigo_excel, ' ', '')
        INNER JOIN ${ESQUEMA}.informaciones_academicas ia ON e.informacionacademicaid = ia.id 
        INNER JOIN ${ESQUEMA}.titulos_academicos ta ON ia.tituloacademicoid = ta.id 
        LEFT JOIN ${ESQUEMA}.informaciones_academicas_regulares iar ON e.informacionacademicaid = iar.informacionacademicaid  
        LEFT JOIN ${ESQUEMA}.instituciones_extranjeras ie ON iar.institucionextranjeraid = ie.id
        ORDER BY dx.posicion;
    `,


    // -------------------------------------------------------------
    // SCRIPT 2: TIPO 9 (Pre-Modificación - Busca por VALOR2/Cédula)
    // -------------------------------------------------------------
    consultaPreModificacionIdentificacion: `
        WITH datos_excel(doc_identidad, posicion_excel) AS (
            VALUES 
            <valores>
        )
        select 
            de.posicion_excel as item, pt.id as id_portador, pt.idpaisnacionalidad, i.id as id_numero_identificacion,
            i.numeroidentificacion, '' as nuevo_numeroidentificacion, i.tipodocumento, pt.nombrescompletos, rdd.codigo as codigo_registro_titulo, 
            ta.id as titulo_id, ta.nombretitulo, ae.fecha_ingreso_estado, rr.id as id_notas_portal, COALESCE(rr.notas_portal, '') AS notas_portal, 
            pt.genero
        FROM datos_excel de
        INNER JOIN ${ESQUEMA}.identificaciones i ON TRIM(i.numeroidentificacion) = de.doc_identidad
        inner join ${ESQUEMA}.portadores_titulo pt on i.id=pt.id_identificacion
        inner join ${ESQUEMA}.expedientes e on pt.id=e.portadortituloid
        inner join ${ESQUEMA}.informaciones_academicas ia on e.informacionacademicaid=ia.id
        inner join ${ESQUEMA}.titulos_academicos ta on ia.tituloacademicoid=ta.id
        inner join ${ESQUEMA}.asignaciones_expedientes ae on e.id = ae.expediente_id
        inner join ${ESQUEMA}.resultados_revision rr on ae.id=rr.siguiente_asignacion_expediente_id
        inner join ${ESQUEMA}.resultados_revision_delegado rrd on rr.id=rrd.id
        inner join ${ESQUEMA}.resultados_revision_delegado_aprobado rdd on rrd.id=rdd.id
        order by de.posicion_excel;
    `,

    // -------------------------------------------------------------
    // SCRIPT 3: TIPO 9 (Post-Modificación - Busca por ID Interno)
    // -------------------------------------------------------------
    consultaPostModificacionIdentificacionPorId: `
        WITH datos_excel(id_bd, posicion_excel) AS (
             VALUES 
             <valores>
        )
        select 
            de.posicion_excel as item, pt.id as id_portador, pt.idpaisnacionalidad, i.id as id_numero_identificacion, i.numeroidentificacion, 
            '' as nuevo_numeroidentificacion, i.tipodocumento, pt.nombrescompletos, rdd.codigo as codigo_registro_titulo, ta.id as titulo_id, 
            ta.nombretitulo, ae.fecha_ingreso_estado, rr.id as id_notas_portal, COALESCE(rr.notas_portal, '') AS notas_portal, pt.genero
        FROM datos_excel de
        INNER JOIN ${ESQUEMA}.identificaciones i ON i.id = CAST(de.id_bd AS INTEGER)
        INNER JOIN ${ESQUEMA}.portadores_titulo pt on i.id=pt.id_identificacion
        INNER JOIN ${ESQUEMA}.expedientes e on pt.id=e.portadortituloid
        INNER JOIN ${ESQUEMA}.informaciones_academicas ia on e.informacionacademicaid=ia.id
        INNER JOIN ${ESQUEMA}.titulos_academicos ta on ia.tituloacademicoid=ta.id
        INNER JOIN ${ESQUEMA}.asignaciones_expedientes ae on e.id = ae.expediente_id
        INNER JOIN ${ESQUEMA}.resultados_revision rr on ae.id=rr.siguiente_asignacion_expediente_id
        INNER JOIN ${ESQUEMA}.resultados_revision_delegado rrd on rr.id=rrd.id
        INNER JOIN ${ESQUEMA}.resultados_revision_delegado_aprobado rdd on rrd.id=rdd.id
        order by de.posicion_excel;
    `,


// -------------------------------------------------------------
// SCRIPT 4: TIPO CCON (Consulta CINE) - VERSION POSTGRES 9.3
// -------------------------------------------------------------
consultaPrePostModificacionCCON: `
    WITH datos_excel(cedula_excel, codigo_excel, posicion) AS (
        VALUES 
        <<REEMPLAZAR_VALORES>>
    )
    SELECT DISTINCT ON (de.posicion)
        de.posicion as item, e.id AS expediente_id, cine_final.id AS rracine_id, rdd.codigo, i.numeroidentificacion, 
        pt.nombrescompletos, pt.genero, pt.idpaisnacionalidad, rr.id as id_notas_portal, rr.notas_portal, 
        ia.id as id_informaciones_academicas, ta.id as id_titulos_academicos, ta.nombretitulo, ta.niveldeformacion, 
        ae.fecha_ingreso_estado, cine_final.*
    FROM datos_excel de
    INNER JOIN ${ESQUEMA}.identificaciones i ON i.numeroidentificacion = de.cedula_excel
    INNER JOIN ${ESQUEMA}.portadores_titulo pt ON i.id = pt.id_identificacion 
    INNER JOIN ${ESQUEMA}.expedientes e ON pt.id = e.portadortituloid 
    INNER JOIN ${ESQUEMA}.informaciones_academicas ia ON e.informacionacademicaid = ia.id 
    INNER JOIN ${ESQUEMA}.titulos_academicos ta ON ia.tituloacademicoid = ta.id 
    INNER JOIN ${ESQUEMA}.asignaciones_expedientes ae ON e.id = ae.expediente_id
    INNER JOIN ${ESQUEMA}.resultados_revision rr ON ae.id = rr.siguiente_asignacion_expediente_id 
    INNER JOIN ${ESQUEMA}.resultados_revision_delegado rrd ON rr.id = rrd.id 
    INNER JOIN ${ESQUEMA}.resultados_revision_delegado_aprobado rdd ON rrd.id = rdd.id
    LEFT JOIN LATERAL (
        SELECT rracine.id
        FROM ${ESQUEMA}.asignaciones_expedientes ae2
        JOIN ${ESQUEMA}.resultados_revision rr2 ON rr2.asignacion_expediente_id = ae2.id
        JOIN ${ESQUEMA}.resultados_revision_analista rra2 ON rra2.id = rr2.id
        JOIN ${ESQUEMA}.resultados_revision_analista_clasificaciones_cine rracine ON rracine.id = rra2.clasificacion_cine_id
        WHERE ae2.expediente_id = e.id
        AND rracine.id IS NOT null
        ORDER BY ae2.id DESC 
        LIMIT 1
    ) AS busqueda_cine ON true
    LEFT JOIN ${ESQUEMA}.resultados_revision_analista_clasificaciones_cine cine_final ON cine_final.id = busqueda_cine.id
    WHERE replace(rdd.codigo, ' ', '') = de.codigo_excel
    ORDER BY de.posicion;
`,

// -------------------------------------------------------------
// SCRIPT 5: TIPO CNOM (Cambio de Nombres - REPARADO)
// -------------------------------------------------------------
    consultaPrePostModificacionCNOM: `
        -- VOLVEMOS A LOS 2 PARÁMETROS QUE TU SERVIDOR SÍ ENVÍA
        WITH datos_excel(cedula_excel, nombre_nuevo, posicion) AS (
            VALUES 
            <<REEMPLAZAR_VALORES>>
        )
        SELECT 
            dx.posicion as item, dx.nombre_nuevo, pt.id as id_portador, i.id as id_numero_identificacion,
            i.numeroidentificacion, i.tipodocumento, pt.nombrescompletos, pt.idpaisnacionalidad, rdd.codigo as codigo_registro_titulo, 
            ta.id as titulo_id, ta.nombretitulo, ae.fecha_ingreso_estado, rr.id as id_notas_portal,
            COALESCE(rr.notas_portal, '') as notas_portal, pt.genero
        FROM datos_excel dx
        INNER JOIN ${ESQUEMA}.identificaciones i ON i.numeroidentificacion = dx.cedula_excel
        INNER JOIN ${ESQUEMA}.portadores_titulo pt ON i.id=pt.id_identificacion
        INNER JOIN ${ESQUEMA}.expedientes e ON pt.id=e.portadortituloid
        INNER JOIN ${ESQUEMA}.informaciones_academicas ia ON e.informacionacademicaid=ia.id
        INNER JOIN ${ESQUEMA}.titulos_academicos ta ON ia.tituloacademicoid=ta.id
        INNER JOIN ${ESQUEMA}.asignaciones_expedientes ae ON e.id = ae.expediente_id
        INNER JOIN ${ESQUEMA}.resultados_revision rr ON ae.id=rr.siguiente_asignacion_expediente_id
        INNER JOIN ${ESQUEMA}.resultados_revision_delegado rrd ON rr.id=rrd.id
        INNER JOIN ${ESQUEMA}.resultados_revision_delegado_aprobado rdd ON rrd.id=rdd.id
        ORDER BY dx.posicion;
    `,


    // ---------------------------------------------------------------
    // SCRIPT 6: TIPO CNAC (Cambio de Nacionalidad)
    // ---------------------------------------------------------------
    consultaPrePostModificacionCNAC: `
        WITH datos_excel(cedula_excel, id_nacionalidad_excel, posicion) AS (
            VALUES 
            <<REEMPLAZAR_VALORES>>
        )
        SELECT 
            dx.posicion as item, pt.id as id_portador, i.id as id_numero_identificacion, i.numeroidentificacion, 
            i.tipodocumento, pt.nombrescompletos, pt.idpaisnacionalidad, dx.id_nacionalidad_excel, rdd.codigo as codigo_registro_titulo, 
            ta.id as titulo_id, ta.nombretitulo, ae.fecha_ingreso_estado, rr.id as id_notas_portal, rr.notas_portal, pt.genero   
        FROM datos_excel dx
        INNER JOIN ${ESQUEMA}.identificaciones i ON i.numeroidentificacion = dx.cedula_excel
        INNER JOIN ${ESQUEMA}.portadores_titulo pt on i.id=pt.id_identificacion
        INNER JOIN ${ESQUEMA}.expedientes e on pt.id=e.portadortituloid
        INNER JOIN ${ESQUEMA}.informaciones_academicas ia on e.informacionacademicaid=ia.id
        INNER JOIN ${ESQUEMA}.titulos_academicos ta on ia.tituloacademicoid=ta.id
        INNER JOIN ${ESQUEMA}.asignaciones_expedientes ae on e.id = ae.expediente_id
        INNER JOIN ${ESQUEMA}.resultados_revision rr on ae.id=rr.siguiente_asignacion_expediente_id
        INNER JOIN ${ESQUEMA}.resultados_revision_delegado rrd on rr.id=rrd.id
        INNER JOIN ${ESQUEMA}.resultados_revision_delegado_aprobado rdd on rrd.id=rdd.id 
        ORDER BY dx.posicion;
    `,


    // ---------------------------------------------------------------
    // SCRIPT 7: TIPO CGEN (Cambio de Género)
    // ---------------------------------------------------------------
    consultaPrePostModificacionCGEN: `
        WITH datos_excel(cedula_excel, nuevo_genero, posicion) AS (
            VALUES 
            <<REEMPLAZAR_VALORES>>
        )
        SELECT 
            dx.posicion as item, dx.nuevo_genero, pt.id as id_portador, i.id as id_numero_identificacion, i.numeroidentificacion, 
            i.tipodocumento, pt.nombrescompletos, pt.idpaisnacionalidad, rdd.codigo as codigo_registro_titulo, ta.id as titulo_id,
            ta.nombretitulo, ae.fecha_ingreso_estado, rr.id as id_notas_portal, COALESCE(rr.notas_portal, '') as notas_portal, 
            pt.genero
        FROM datos_excel dx
        INNER JOIN ${ESQUEMA}.identificaciones i ON i.numeroidentificacion = dx.cedula_excel
        INNER JOIN ${ESQUEMA}.portadores_titulo pt on i.id=pt.id_identificacion
        INNER JOIN ${ESQUEMA}.expedientes e on pt.id=e.portadortituloid
        INNER JOIN ${ESQUEMA}.informaciones_academicas ia on e.informacionacademicaid=ia.id
        INNER JOIN ${ESQUEMA}.titulos_academicos ta on ia.tituloacademicoid=ta.id
        INNER JOIN ${ESQUEMA}.asignaciones_expedientes ae on e.id = ae.expediente_id
        INNER JOIN ${ESQUEMA}.resultados_revision rr on ae.id=rr.siguiente_asignacion_expediente_id
        INNER JOIN ${ESQUEMA}.resultados_revision_delegado rrd on rr.id=rrd.id
        INNER JOIN ${ESQUEMA}.resultados_revision_delegado_aprobado rdd on rrd.id=rdd.id 
        ORDER BY dx.posicion;
    `,

};



// --------------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// --- PARTE 2: FUNCIONES GENERADORAS ---
// ---------------------------------------------------------------------------

//--------------------------------------------------------
// TIPO 1: ingresoObservacion
const ingresoObservacion = (datosExcel, datosBD) => {
    validarIdNotas(datosBD); // BLINDAJE
    // --- 1. Script de AVANCE (Forward) ---
    // REEMPLAZO: valor1 -> m_observacion
    const valor1 = datosExcel.m_observacion || ''; 
    const valor1Safe = valor1.replace(/'/g, "''");
    const scriptForward =`UPDATE ${ESQUEMA}.resultados_revision SET notas_portal = '${valor1}' WHERE id = ${datosBD.id_notas_portal};`;

    // --- 2. Script de REVERSO (Reverse) ---
    // Usamos el dato original que viene de la BD (datosBD.notas_portal)
    const valorOriginal = datosBD.notas_portal || '';
    const valorOriginalSafe = valorOriginal.replace(/'/g, "''");

    const scriptReverse = `UPDATE ${ESQUEMA}.resultados_revision SET notas_portal = '${valorOriginalSafe}' WHERE id = ${datosBD.id_notas_portal};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };
};


//---------------------------------------------------------
// TIPO 2: modificacionObservacion
const modificacionObservacion = (datosExcel, datosBD) => {
    validarIdNotas(datosBD); // BLINDAJE

    // --- 1. Script de AVANCE (Forward) ---
    // Simplemente tomamos el nuevo valor (m_observacion) y reemplazamos
    const valorNuevo = datosExcel.m_observacion || ''; 
    const valorSafe = valorNuevo.replace(/'/g, "''"); 
    
    const scriptForward = `UPDATE ${ESQUEMA}.resultados_revision SET notas_portal = '${valorSafe}' WHERE id = ${datosBD.id_notas_portal};`;

    // --- 2. Script de REVERSO (Reverse) ---
    // Guardamos el valor que tenía antes (datosBD.notas_portal) para poder restaurarlo
    const valorOriginal = datosBD.notas_portal || '';
    const valorOriginalSafe = valorOriginal.replace(/'/g, "''");

    const scriptReverse = `UPDATE ${ESQUEMA}.resultados_revision SET notas_portal = '${valorOriginalSafe}' WHERE id = ${datosBD.id_notas_portal};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse
    };

};


//-----------------------------------------------------------
// TIPO 3: agregacionObservacion
const agregacionObservacion = (datosExcel, datosBD) => {
    validarIdNotas(datosBD); // BLINDAJE

    // --- 1. Script de AVANCE (Forward) ---
    const textoActual = String(datosBD.notas_portal || '').replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').trim();
    // REEMPLAZO: valor2 -> m_observacion (dato a agregar a continuación)
    const textoAgregado = String(datosExcel.m_observacion || '').replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').trim();
    
    // Concatenamos: Actual + Espacio + Nuevo
    const nuevoContenido = (textoActual + ' ' + textoAgregado).trim();
    const valorSafe = nuevoContenido.replace(/'/g, "''");

    const scriptForward =  `UPDATE ${ESQUEMA}.resultados_revision SET notas_portal = '${valorSafe}' WHERE id = ${datosBD.id_notas_portal};`;

    // --- 2. Script de REVERSO (Reverse) ---
    // Restauramos exactamente lo que había antes de concatenar (textoActual)
    const valorOriginalSafe = textoActual.replace(/'/g, "''");

    const scriptReverse = `UPDATE ${ESQUEMA}.resultados_revision SET notas_portal = '${valorOriginalSafe}' WHERE id = ${datosBD.id_notas_portal};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };
};



//-------------------------------------------------------------
// TIPO 4: eliminacionObservacion
const eliminacionObservacion = (datosExcel, datosBD) => {
    validarIdNotas(datosBD); // BLINDAJE (Reactivado: Necesitamos el ID para borrar)

    // --- 1. Script de AVANCE (Forward) ---
    // Eliminación: Establecer a cadena vacía
    const scriptForward = `UPDATE ${ESQUEMA}.resultados_revision SET notas_portal = '' WHERE id = ${datosBD.id_notas_portal};`;

    // --- 2. Script de REVERSO (Reverse) ---
    // Restauramos el valor que acabamos de borrar
    const valorOriginal = datosBD.notas_portal || '';
    const valorOriginalSafe = valorOriginal.replace(/'/g, "''");

    const scriptReverse = `UPDATE ${ESQUEMA}.resultados_revision SET notas_portal = '${valorOriginalSafe}' WHERE id = ${datosBD.id_notas_portal};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };

};



//--------------------------------------------------------------------------------------------
// TIPO CTIT: cambioTitulacion 
const cambioTitulacion = (datosExcel, datosBD) => {
    // Validamos que exista el ID del título en la consulta previa
    if (!datosBD.id_titulos_academicos || datosBD.id_titulos_academicos === '0') {
        throw new Error("El registro en BD no tiene un ID de título válido para modificar.");
    }

    // --- 1. Script de AVANCE (Forward) ---
    // Obtenemos el nuevo título del Excel (m_titulo) y reemplazamos
    const valorNuevo = datosExcel.m_titulo || '';
    const valorSafe = valorNuevo.replace(/'/g, "''"); // Sanitización

    const scriptForward = `UPDATE ${ESQUEMA}.titulos_academicos ta SET nombretitulo = '${valorSafe}' WHERE ta.id = ${datosBD.id_titulos_academicos};`;

    // --- 2. Script de REVERSO (Reverse) ---
    // Restauramos el nombre original que leímos de la BD
    const valorOriginal = datosBD.nombretitulo || '';
    const valorOriginalSafe = valorOriginal.replace(/'/g, "''");

    const scriptReverse = `UPDATE ${ESQUEMA}.titulos_academicos ta SET nombretitulo = '${valorOriginalSafe}' WHERE ta.id = ${datosBD.id_titulos_academicos};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };
};


//---------------------------------------------------------------------------------------
// TIPO CNIV: cambioNivelFormacion 
const cambioNivelFormacion = (datosExcel, datosBD) => {
    // Validamos que exista el ID del título en la consulta previa
    if (!datosBD.id_titulos_academicos || datosBD.id_titulos_academicos === '0') {
        throw new Error("El registro en BD no tiene un ID de título válido para modificar.");
    }

    // --- 1. Script de AVANCE (Forward) ---
    // Obtenemos el nuevo nivel del Excel (estrictamente m_nivel)
    const valorExcel = String(datosExcel.m_nivel || '').trim();
    
    // Lógica de transformación
    let valorNuevo = '';
    if (valorExcel === '3') {
        valorNuevo = 'TERCER_NIVEL';
    } else if (valorExcel === '4') {
        valorNuevo = 'CUARTO_NIVEL';
    } else {
        valorNuevo = valorExcel; // Si es cualquier otro texto, se guarda tal cual
    }

    const valorSafe = valorNuevo.replace(/'/g, "''"); // Sanitización

    const scriptForward = `UPDATE ${ESQUEMA}.titulos_academicos ta SET niveldeformacion = '${valorSafe}' WHERE ta.id = ${datosBD.id_titulos_academicos};`;

    // --- 2. Script de REVERSO (Reverse) ---
    // Restauramos el nivel original que viene de la BD
    const valorOriginal = datosBD.niveldeformacion || '';
    const valorOriginalSafe = valorOriginal.replace(/'/g, "''");

    const scriptReverse = `UPDATE ${ESQUEMA}.titulos_academicos ta SET niveldeformacion = '${valorOriginalSafe}' WHERE ta.id = ${datosBD.id_titulos_academicos};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };
};
/*
//---------------------------------------------------------------------------------------
// TIPO CNIV: cambioNivelFormacion 
const cambioNivelFormacion = (datosExcel, datosBD) => {
    // Validamos que exista el ID del título en la consulta previa
    if (!datosBD.id_titulos_academicos || datosBD.id_titulos_academicos === '0') {
        throw new Error("El registro en BD no tiene un ID de título válido para modificar.");
    }

    // --- 1. Script de AVANCE (Forward) ---
    // Obtenemos el nuevo nivel del Excel (m_nivel)
    const valorNuevo = datosExcel.m_nivel || '';
    const valorSafe = valorNuevo.replace(/'/g, "''"); // Sanitización

    const scriptForward = `UPDATE ${ESQUEMA}.titulos_academicos ta SET niveldeformacion = '${valorSafe}' WHERE ta.id = ${datosBD.id_titulos_academicos};`;

    // --- 2. Script de REVERSO (Reverse) ---
    // Restauramos el nivel original que viene de la BD
    const valorOriginal = datosBD.niveldeformacion || '';
    const valorOriginalSafe = valorOriginal.replace(/'/g, "''");

    const scriptReverse = `UPDATE ${ESQUEMA}.titulos_academicos ta SET niveldeformacion = '${valorOriginalSafe}' WHERE ta.id = ${datosBD.id_titulos_academicos};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };
};
*/


//----------------------------------------------------------------------------------------
// TIPO 9: cambioIdentificacion
const cambioIdentificacion = (filaExcel, filaBD) => {
    // REEMPLAZO: 
    // valor4 -> m_cedula (nuevo número)
    // valor3 -> m_tipo_identificacion (nuevo tipo)
    // valor2 -> cedula (número anterior/actual para el WHERE)
    
    const scriptForward =`UPDATE ${ESQUEMA}.identificaciones SET numeroidentificacion = '${filaExcel.m_cedula}', tipodocumento = '${filaExcel.m_tipo_identificacion}' WHERE numeroidentificacion = '${filaExcel.cedula}' AND id = '${filaBD.id_numero_identificacion}';`;

    // 2. Script de REVERSO (Reverse)
    // Restauramos los valores originales de la BD
    // Nota: En el WHERE del reverso usamos el ID para asegurar la restauración
    const cedulaOriginal = filaBD.numeroidentificacion;
    const tipoOriginal = filaBD.tipodocumento;

    const scriptReverse = `UPDATE ${ESQUEMA}.identificaciones SET numeroidentificacion = '${cedulaOriginal}', tipodocumento = '${tipoOriginal}' WHERE id = '${filaBD.id_numero_identificacion}';`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };
};
    


// TIPO CCON: cambioConocimiento 
const cambioConocimiento = (datosExcel, datosBD) => {
    // 1. Validamos que tengamos el ID específico que viene de tu consulta SQL (rracine_id)
    if (!datosBD.rracine_id) {
        return "-- No se encontró registro CINE (rracine_id) para actualizar en esta fila.";
    }

    // 2. Obtenemos el valor nuevo (m_conocimiento)
    const nuevoTexto = datosExcel.m_conocimiento || '';

    // 3. Sanitización básica
    const textoSeguro = nuevoTexto ? nuevoTexto.replace(/'/g, "''") : '';

    // 4. Retornamos la sentencia SQL simple para esta fila única
    const scriptForward = `UPDATE ${ESQUEMA}.resultados_revision_analista_clasificaciones_cine SET otro = '${textoSeguro}' WHERE id = ${datosBD.rracine_id};`;

    // --- 5. Script de REVERSO (Reverse) ---
    // Recuperamos el valor original de la BD.
    // Asumimos que el campo en BD se llama 'otro' (ajusta si se llama diferente en tu consulta SQL)
    const originalTexto = datosBD.otro;
    const originalSafe = originalTexto ? originalTexto.replace(/'/g, "''") : '';

    const scriptReverse = `UPDATE ${ESQUEMA}.resultados_revision_analista_clasificaciones_cine SET otro = '${originalSafe}' WHERE id = ${datosBD.rracine_id};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };   
};


//--------------------------------------------------------------------------------------------
// TIPO CIES: cambioInstitucion (Cambio de IES Extranjera)
const cambioInstitucion = (datosExcel, datosBD) => {
    // 1. Validamos que el registro en BD tenga el ID de enlace con la tabla de regulares
    if (!datosBD.informacionacademicaid || datosBD.informacionacademicaid === '0') {
        throw new Error("Error Crítico: El registro en BD no tiene 'informacionacademicaid' válido. No es posible actualizar la tabla de regulares.");
    }

    // 2. Obtenemos el nuevo ID de la IES desde el Excel
    // NOTA: 'm_ies' es el nombre de la variable interna que debe coincidir con tu procesador.js
    const nuevoIdIes = datosExcel.m_codigo_ies; 

    if (!nuevoIdIes) {
         throw new Error("El Excel no contiene el ID de la nueva Institución (campo vacío).");
    }

    // 3. Validación de seguridad (asegurar que sea numérico para evitar inyección directa)
    if (isNaN(nuevoIdIes)) {
        throw new Error(`El ID de la nueva institución debe ser numérico. Valor recibido: ${nuevoIdIes}`);
    }

    // 4. Generación del Script SQL
    const scriptForward = `UPDATE ${ESQUEMA}.informaciones_academicas_regulares i SET institucionextranjeraid = ${nuevoIdIes} WHERE i.informacionacademicaid = ${datosBD.informacionacademicaid};`;

    // --- 5. Generación del Script SQL (REVERSE) ---
    // Restauramos el ID de la institución extranjera original
    const idOriginal = datosBD.institucionextranjeraid; 

    const scriptReverse = `UPDATE ${ESQUEMA}.informaciones_academicas_regulares i SET institucionextranjeraid = ${idOriginal} WHERE i.informacionacademicaid = ${datosBD.informacionacademicaid};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };
};


//--------------------------------------------------------------------------------------------
// TIPO CNOM: cambioNombres 
const cambioNombres = (datosExcel, datosBD) => {
    // 1. Validamos que el registro encontrado tenga un ID de portador válido
    if (!datosBD.id_portador) {
        throw new Error("El registro en BD no tiene un ID de portador válido para modificar.");
    }

    // 2. Obtenemos el nuevo nombre del Excel
    const nuevoNombre = datosExcel.m_nombres || '';

    // 3. Sanitización (escapar comillas simples)
    const nombreSafe = nuevoNombre.replace(/'/g, "''");

    // 4. Generación del Script SQL
    const scriptForward = `UPDATE ${ESQUEMA}.portadores_titulo SET nombrescompletos = '${nombreSafe}' WHERE id = ${datosBD.id_portador};`;

    // 5. Script REVERSO (Reverse) 
    // Restauramos el nombre original que viene de la BD
    const nombreOriginal = datosBD.nombrescompletos || ''; 
    const nombreOriginalSafe = nombreOriginal.replace(/'/g, "''");

    const scriptReverse = `UPDATE ${ESQUEMA}.portadores_titulo SET nombrescompletos = '${nombreOriginalSafe}' WHERE id = ${datosBD.id_portador};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };
};



//--------------------------------------------------------------------------------------------
// TIPO CNAC: cambioNacionalidad (Cambio de País Nacionalidad)
const cambioNacionalidad = (datosExcel, datosBD) => {
    // 1. Validamos que el registro encontrado tenga un ID de portador válido
    if (!datosBD.id_portador) {
        throw new Error("El registro en BD no tiene un ID de portador válido para modificar.");
    }

    // 2. Obtenemos el nuevo ID del país del Excel (Atención: Debe ser el ID numérico, no el nombre)
    const nuevoIdPais = datosExcel.m_nacionalidad; 

    if (!nuevoIdPais) {
          throw new Error("El Excel no contiene el ID del nuevo País (campo vacío).");
    }

    // 3. Validación de seguridad (asegurar que sea numérico para evitar errores SQL)
    if (isNaN(nuevoIdPais)) {
        throw new Error(`El ID del nuevo país debe ser numérico. Valor recibido: ${nuevoIdPais}`);
    }

    // 4. Generación del Script SQL
    const scriptForward = `UPDATE ${ESQUEMA}.portadores_titulo SET idpaisnacionalidad = ${nuevoIdPais} WHERE id = ${datosBD.id_portador};`;

    // --- 5. Generación del Script SQL (REVERSE) ---
    // Restauramos el ID del país original que viene de la BD
    const idPaisOriginal = datosBD.idpaisnacionalidad;

    const scriptReverse = `UPDATE ${ESQUEMA}.portadores_titulo SET idpaisnacionalidad = ${idPaisOriginal} WHERE id = ${datosBD.id_portador};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };
};



//--------------------------------------------------------------------------------------------
// TIPO CGEN: cambioGenero
const cambioGenero = (datosExcel, datosBD) => {
    // 1. Validamos que el registro encontrado tenga un ID de portador válido
    if (!datosBD.id_portador) {
        throw new Error("El registro en BD no tiene un ID de portador válido para modificar.");
    }

    // 2. Obtenemos el nuevo género del Excel
    // NOTA: Asumimos que la variable en el procesador se llamará 'm_genero'
    const nuevoGenero = datosExcel.m_genero || '';

    // 3. Sanitización (escapar comillas simples por seguridad)
    const generoSafe = nuevoGenero.replace(/'/g, "''");

    // 4. Generación del Script SQL (FORWARD)
    // Se usa el ID del portador para asegurar que solo modificamos al registro correcto
    const scriptForward = `UPDATE ${ESQUEMA}.portadores_titulo SET genero = '${generoSafe}' WHERE id = ${datosBD.id_portador};`;

    // 5. Script REVERSO (Reverse) 
    // Restauramos el género original que viene de la BD (datosBD.genero)
    const generoOriginal = datosBD.genero || ''; 
    const generoOriginalSafe = generoOriginal.replace(/'/g, "''");

    const scriptReverse = `UPDATE ${ESQUEMA}.portadores_titulo SET genero = '${generoOriginalSafe}' WHERE id = ${datosBD.id_portador};`;

    return { 
        forward: scriptForward, 
        reverse: scriptReverse 
    };
};


//-----------------------------------------------------------------------------------------------
const noImplementado = (tipo, item) => `-- ALERTA: Script Tipo ${tipo} no implementado (Item ${item})`;



// ---------------------------------------------------------------------------
// --- PARTE 3: MAPA DE ACCIONES ---
// ---------------------------------------------------------------------------
const MAPA_ACCIONES = {
    'IOBS': ingresoObservacion,
    'MOBS': modificacionObservacion,
    'AOBS': agregacionObservacion,
    'EOBS': eliminacionObservacion,
    'CNOM': cambioNombres,
    'CTIT': cambioTitulacion,
    'CIES': cambioInstitucion,
    'CNIV': cambioNivelFormacion,
    'CIDE': cambioIdentificacion,
    'CGEN': cambioGenero,
    'CNAC': cambioNacionalidad,
    'CCON': cambioConocimiento
};

module.exports = {
    scripts,
    MAPA_ACCIONES,
    normalizar,
    validarIdNotas,
    ingresoObservacion,
    modificacionObservacion,
    agregacionObservacion,
    eliminacionObservacion,
    cambioNombres,
    cambioTitulacion,
    cambioInstitucion,
    cambioNivelFormacion,
    cambioIdentificacion,
    cambioGenero,
    cambioNacionalidad,
    cambioConocimiento
};