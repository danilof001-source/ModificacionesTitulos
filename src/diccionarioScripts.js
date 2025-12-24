// Este archivo contiene las plantillas SQL fijas del sistema
const scripts = {
    consultaPreModificacion: `
--INICIO SCRIPT consultaPreModificacion--
SELECT 
    ROW_NUMBER() OVER (ORDER BY orden.posicion) AS item, 
    i.numeroidentificacion, 
    rdd.codigo, 
    pt.nombrescompletos, 
    pt.genero, 
    pt.idpaisnacionalidad, 
    rr.id AS id_notas_portal, 
    rr.notas_portal, 
    ia.id AS id_informaciones_academicas, 
    ta.id AS id_titulos_academicos, 
    ta.nombretitulo, 
    ta.niveldeformacion, 
    fecha_ingreso_estado,
    e.informacionacademicaid,
    -- Nuevos campos agregados
    iar.institucionextranjeraid,
    ie.nombre AS institucionextranjeranombre
FROM 
    servicio_titulos_consulta.identificaciones i 
    INNER JOIN servicio_titulos_consulta.portadores_titulo pt ON i.id = pt.id_identificacion 
    INNER JOIN servicio_titulos_consulta.expedientes e ON pt.id = e.portadortituloid 
    INNER JOIN servicio_titulos_consulta.informaciones_academicas ia ON e.informacionacademicaid = ia.id 
    INNER JOIN servicio_titulos_consulta.titulos_academicos ta ON ia.tituloacademicoid = ta.id 
    INNER JOIN servicio_titulos_consulta.asignaciones_expedientes ae ON e.id = ae.expediente_id 
    INNER JOIN servicio_titulos_consulta.resultados_revision rr ON ae.id = rr.siguiente_asignacion_expediente_id 
    INNER JOIN servicio_titulos_consulta.resultados_revision_delegado rrd ON rr.id = rrd.id 
    INNER JOIN servicio_titulos_consulta.resultados_revision_delegado_aprobado rdd ON rrd.id = rdd.id
    
    -- Relación 1: Obtener el ID de la institución extranjera usando informacionacademicaid
    LEFT JOIN servicio_titulos_consulta.informaciones_academicas_regulares iar 
        ON e.informacionacademicaid = iar.informacionacademicaid
        
    -- Relación 2: Obtener el Nombre de la institución usando institucionextranjeraid
    LEFT JOIN servicio_titulos_consulta.instituciones_extranjeras ie 
        ON iar.institucionextranjeraid = ie.id

    JOIN (
        VALUES 
        <<REEMPLAZAR_VALORES>>
    ) AS orden(id, posicion)
      ON trim(trim(i.numeroidentificacion)||trim(rdd.codigo)) = orden.id

ORDER BY orden.posicion;
--FIN SCRIPT consultaPreModificacion--
`
};

module.exports = scripts;