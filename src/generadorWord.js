// =============================================================================
// ARCHIVO: src/generadorWord.js
// DESCRIPCIÓN: Genera el archivo .docx con la tabla de "Detalle de Atención"
// =============================================================================

const { 
    Document, Packer, Paragraph, Table, TableCell, TableRow, 
    TextRun, AlignmentType, WidthType, 
    Header, Footer, ImageRun, 
    HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, 
    PageOrientation 
} = require('docx');
const fs = require('fs');
const path = require('path');


// 1. DICCIONARIO DE FRASES PARA EL REPORTE
// Traduce los códigos técnicos (CCON, CNOM...) a las frases formales del documento.
const DESCRIPCIONES_TIPO = {
    'CCON': 'Actualizaciones efectuadas al campo "Área o Campo de Conocimiento"',
    'CNOM': 'Actualización de la nomenclatura de título',
    'CNIV': 'Actualización del nivel de formación',
    'CIES': 'Actualización de Institución de Educación Superior (IES)',
    'CIDE': 'Corrección de número de identificación',
    'DEFAULT': 'Actualizaciones de datos académicos varios'
};


/**
 * Genera un buffer con el archivo Word.
 * @param {string} nombreMemo - El nombre del memorando (ej: MINEDEC-...)
 * @param {Array} reporteDetallado - El array de objetos con el resultado del proceso
 * @param {string} nombreArchivoExcel - Nombre del archivo original subido
 */
async function generarReporteDocx(nombreMemo, reporteDetallado, nombreArchivoExcel, asuntoMemo) {

    const rutaCarpeta = path.dirname(nombreArchivoExcel) || '.';
    let nombreMatrizFinal = path.basename(nombreArchivoExcel); 

    try {
        if (fs.existsSync(rutaCarpeta)) {
            const archivos = fs.readdirSync(rutaCarpeta);
            const archivoMatriz = archivos.find(file => 
                file.toLowerCase().startsWith('matriz') && 
                (file.toLowerCase().endsWith('.xlsx') || file.toLowerCase().endsWith('.xls'))
            );
            if (archivoMatriz) nombreMatrizFinal = archivoMatriz;
        }
    } catch (error) {
        console.error("Error al buscar matriz:", error);
    }
    
    // --- A. LÓGICA DE ESTADÍSTICAS (Agrupar y contar) ---
    const stats = {};
    let totalProcesados = 0;

    reporteDetallado.forEach(r => {
        // Solo contamos los que tuvieron éxito (OK)
        if (r.estado === 'OK') {
            totalProcesados++;
            const tipo = r.tipo || 'DEFAULT';
            if (!stats[tipo]) stats[tipo] = 0;
            stats[tipo]++;
        }
    });

    // --- B. CONSTRUCCIÓN DE LAS VIÑETAS (Bullets) ---
    const parrafosDetalle = [];

    // Párrafo A: Confirmación
    parrafosDetalle.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [
            new TextRun({ 
                text: `Se informa que, conforme a lo solicitado, se han realizado las modificaciones indicadas en la matriz "${nombreMatrizFinal}".`,
                font: "Calibri",
                size: 22 // 11 pt
            })
        ]
    }));

    // Párrafo B: Transición (Con separación superior)
    parrafosDetalle.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 200 }, // <--- ESTO CREA EL ESPACIO (aprox 2 líneas vacías)
        children: [
            new TextRun({ 
                text: `A continuación, se detallan las actividades realizadas, correspondiente a ${totalProcesados} registros solicitados en la matriz anexa al memorando.:`,
                font: "Calibri",
                size: 22 // 11 pt
            })
        ]
    }));

    
    // 2. Viñetas dinámicas con FUENTE CORREGIDA
    Object.keys(stats).forEach(tipo => {
        const cantidad = stats[tipo];
        const descripcion = DESCRIPCIONES_TIPO[tipo] || DESCRIPCIONES_TIPO['DEFAULT'];
        const textoLinea = `${cantidad} ${descripcion}`; // Ej: "17 Actualizaciones..."

        parrafosDetalle.push(new Paragraph({
            bullet: { level: 0 },       // Mantiene el punto de la lista
            style: "ListParagraph",     // Mantiene la indentación correcta
            children: [
                new TextRun({
                    text: textoLinea,
                    font: "Calibri",    // <--- FUENTE FORZADA
                    size: 22            // <--- 11 PTS (22 mitades)
                })
            ]
        }));
    });


    // 3. Total y Cierre
    parrafosDetalle.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 200 }, // <--- ESTO CREA EL ESPACIO (aprox 2 líneas vacías)
        children: [
            new TextRun({ 
                text: `Total: ${totalProcesados} registros procesados.`,
                bold: true,
                font: "Calibri",
                size: 22 // 11 pt
            }),
        ]
    }));


    parrafosDetalle.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 200 }, // <--- ESTO CREA EL ESPACIO (aprox 2 líneas vacías)
        children: [
            new TextRun({ 
                text: "Es importante aclarar que esta coordinación no es la responsable de la información, por lo que no corresponde realizar la revisión del contenido de la matriz proporcionada.",
                font: "Calibri",
                size: 22 // 11 pt
                
            }),
            new TextRun({ text: "\n" }),
            new TextRun({ 
                text: "Particular que pongo en conocimiento para la validación correspondiente y fines pertinentes.",
                font: "Calibri",
                size: 22 // 11 pt
                
            })
        ]
    }));


    // --- C. DEFINICIÓN DE LA TABLA ---
    // -------------------------------------------------------------------------
    // FUNCIONES AUXILIARES (Con márgenes de 200 arriba y abajo)
    // -------------------------------------------------------------------------

    // 1. Célula de Etiqueta (Izquierda)
    const createLabelCell = (text) => new TableCell({
        width: { size: 20, type: WidthType.PERCENTAGE },
        margins: { top: 200, bottom: 200 }, // <--- ESPACIO SUPERIOR E INFERIOR
        children: [new Paragraph({
            children: [new TextRun({ 
                text: text, 
                bold: true,
                font: "Calibri",
                size: 22 
            })]
        })]
    });

    // 2. Célula de Valor (Derecha)
    const createValueCell = (content) => {
        // Definimos las opciones base con los márgenes
        const cellOptions = {
            width: { size: 80, type: WidthType.PERCENTAGE },
            margins: { top: 200, bottom: 200 } // <--- ESPACIO SUPERIOR E INFERIOR
        };

        // CASO A: Contenido complejo (Lista de párrafos, como en 'Detalle')
        if (Array.isArray(content)) {
            return new TableCell({
                ...cellOptions,
                children: content
            });
        }

        // CASO B: Contenido simple (Texto directo)
        return new TableCell({
            ...cellOptions,
            children: [new Paragraph({
                children: [new TextRun({ 
                    text: String(content), 
                    font: "Calibri",
                    size: 22
                })]
            })]
        });
    };


    const fechaActual = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            // FILA 1: Requerimiento
            new TableRow({
                children: [
                    createLabelCell("Requerimiento:"),
                    createValueCell(nombreMemo)
                ]
            }),
            // FILA 2: Fecha
            new TableRow({
                children: [
                    createLabelCell("Fecha de atención:"),
                    createValueCell(fechaActual)
                ]
            }),
            // FILA 3: Asunto
            new TableRow({
                children: [
                    createLabelCell("Asunto:"),
                    createValueCell(asuntoMemo || "Asunto no especificado") // <--- Aquí inyectamos el asunto del pdf
                ]
            }),
            // FILA 4: Detalle (La más compleja)
            new TableRow({
                children: [
                    createLabelCell("Detalle:"),
                    createValueCell(parrafosDetalle) // Pasamos el array de párrafos construido arriba
                ]
            }),
            // FILA 5: Anexos
            new TableRow({
                children: [
                    createLabelCell("Anexos:"),
                    createValueCell("n/a")
                ]
            })
        ]
    });

    // --- D. CREACIÓN DEL DOCUMENTO CON FONDO (Membrete) ---

    // 1. Preparar la imagen de fondo
    // Asegúrate de que existe la carpeta 'assets' y el archivo 'fondo.png'
    const fondoPath = path.join(__dirname, '../assets/fondo.png');
    let headerChildren = [];

    if (fs.existsSync(fondoPath)) {
        const imagenFondo = fs.readFileSync(fondoPath);
        
        // Creamos la imagen flotante que ocupará toda la hoja
        headerChildren.push(new Paragraph({
            children: [
                new ImageRun({
                    data: imagenFondo,
                    transformation: {
                        width: 1123,  // Ancho A4 en pixeles (aprox)
                        height: 794 // Alto A4 en pixeles (aprox)
                    },
                    floating: {
                        zIndex: 0, // Nivel de profundidad (al fondo)
                        horizontalPosition: {
                            relative: HorizontalPositionRelativeFrom.PAGE, // Pegado al borde de la hoja
                            offset: 0,
                        },
                        verticalPosition: {
                            relative: VerticalPositionRelativeFrom.PAGE, // Pegado al borde superior
                            offset: 0,
                        },
                        behindDocument: true // CLAVE: Esto hace que el texto vaya encima
                    }
                })
            ]
        }));
    }

    // 2. Generar el documento final
    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    size: {
                        orientation: PageOrientation.LANDSCAPE
                    },
                    margin: {
                        // Márgenes ajustados para respetar el membrete visual
                        top: 2000,    // Mantiene 3.5 cm arriba (aprox)
                        bottom: 2000, // Mantiene 3.5 cm abajo (aprox)
                        left: 900,    // 1.5 cm izquierda
                        right: 900    // 1.5 cm derecha
                    }
                }
            },
            // Insertamos la imagen en el header (se repite en todas las páginas)
            headers: {
                default: new Header({
                    children: headerChildren
                })
            },
            children: [
                // Título centrado y personalizado
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 },
                    children: [
                        new TextRun({
                            text: "Detalle de Atención",
                            font: "Calibri",
                            size: 30, 
                            bold: true,
                            color: "000000"
                        })
                    ]
                }),
                table // La tabla que construimos antes
            ]
        }]
    });

    // Generar Buffer
    return await Packer.toBuffer(doc);
}

module.exports = { generarReporteDocx };