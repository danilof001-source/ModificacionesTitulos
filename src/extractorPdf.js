// =============================================================================
// ARCHIVO: src/extractorPdf.js
// DESCRIPCIÓN: Módulo aislado para extraer texto específico de archivos PDF.
// =============================================================================

const fs = require('fs');
//const pdf = require('pdf-parse');
const pdf = require('pdf-parse/lib/pdf-parse.js');

/**
 * Lee la primera página de un PDF y extrae el texto a la derecha de "Asunto:"
 * @param {string} pdfPath - Ruta temporal donde se guardó el PDF subido.
 * @returns {Promise<string>} - El texto del asunto limpio.
 */
async function extraerAsunto(pdfPath) {
    try {
        // Leemos el archivo físico
        const dataBuffer = fs.readFileSync(pdfPath);
        
        // Configuramos para leer solo la página 1 (optimización de memoria y velocidad)
        const options = {
            max: 1 
        };
        
        // Parseamos el PDF a texto plano
        const data = await pdf(dataBuffer, options);
        const textoCompleto = data.text;

        // Expresión Regular Multilínea: 
        // Busca "Asunto:", luego captura absolutamente todo ([\s\S]*?)
        // de forma perezosa hasta que vea un doble salto de línea (?=\n\s*\n) o el fin del texto.
        const regex = /Asunto:\s*([\s\S]*?)(?=\n\s*\n|$)/i;
        const match = textoCompleto.match(regex);

        if (match && match[1]) {
            // Reemplazamos todos los saltos de línea y espacios múltiples internos por un solo espacio
            let asuntoLimpio = match[1].replace(/\s+/g, ' ').trim();
            return asuntoLimpio;
        }
        // Si el formato del memo es distinto y no encuentra la palabra
        return "Asunto no especificado en el documento";

    } catch (error) {
        console.error(">>> Error leyendo el PDF en extractorPdf.js:", error.message);
        return "Error al extraer el asunto";
    }
}

module.exports = {
    extraerAsunto
};