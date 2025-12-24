const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const diccionario = require('./diccionarioScripts');

// Función principal para procesar el archivo subido
async function procesarArchivoExcel(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    // Asumimos que los datos están en la primera hoja
    const worksheet = workbook.getWorksheet(1);
    
    // --- 1. VALIDACIÓN DE ESTRUCTURA (Punto 12) ---
    // Leemos el archivo JSON de estructura esperada
    const rutaJson = path.join(__dirname, '..', 'estructura_matriz.json');
    if (!fs.existsSync(rutaJson)) {
        throw new Error("No se encuentra el archivo de configuración 'estructura_matriz.json'");
    }
    
    const estructuraEsperada = JSON.parse(fs.readFileSync(rutaJson, 'utf-8'));
    
    // Obtener cabeceras del Excel (Fila 1)
    const filaCabecera = worksheet.getRow(1);
    // ExcelJS empieza en índice 1. values[1] es la columna A.
    // Filtramos nulos por si exceljs lee celdas vacías extra
    const cabecerasExcel = filaCabecera.values.slice(1).filter(v => v != null).map(v => v.toString().trim());

    // Validar Cantidad
    if (cabecerasExcel.length !== estructuraEsperada.length) {
        throw new Error(`Discrepancia en cantidad de columnas. Esperadas: ${estructuraEsperada.length}, Encontradas: ${cabecerasExcel.length}`);
    }

    // Validar Nombres Exactos (sin importar orden)
    const faltantes = estructuraEsperada.filter(col => !cabecerasExcel.includes(col));
    if (faltantes.length > 0) {
        throw new Error(`No se puede continuar. Faltan las columnas obligatorias: ${faltantes.join(', ')}`);
    }

    // --- 2. MAPEO DE COLUMNAS ---
    // Necesitamos saber en qué índice (1, 2, 3...) está cada columna clave para el Punto 13.1
    const colCedula = cabecerasExcel.indexOf("CEDULA_O_PASAPORTE_SEGUN_REGISTRO") + 1; // +1 porque ExcelJS usa base 1
    const colRegistro = cabecerasExcel.indexOf("NUMERO_DE_REGISTRO") + 1;
    const colNo = cabecerasExcel.indexOf("No") + 1; // Necesitamos el número de fila del excel

    if (colCedula === 0 || colRegistro === 0 || colNo === 0) {
        // Esto no debería pasar si pasó la validación anterior, pero por seguridad:
        throw new Error("Error interno: No se encuentran las columnas 'CEDULA...', 'NUMERO...' o 'No' para procesar.");
    }

    // --- 3. PROCESO DE VALIDACIÓN DE DATOS Y CONCATENACIÓN (Punto 13.1) ---
    const idsConcatenadosTitulados = []; // Matriz de memoria
    
    // Iteramos desde la fila 2 (datos)
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Saltar cabecera

        // Obtener valores crudos
        let valCedula = row.getCell(colCedula).value ? row.getCell(colCedula).value.toString() : "";
        let valRegistro = row.getCell(colRegistro).value ? row.getCell(colRegistro).value.toString() : "";
        let valNo = row.getCell(colNo).value; // Puede ser número

        // Validar espacios intermedios
        if (valCedula.includes(" ") || valRegistro.includes(" ")) {
            throw new Error(`El proceso se detiene. Error en fila ${rowNumber}: Los campos 'CEDULA...' o 'NUMERO...' contienen espacios intermedios prohibidos.`);
        }

        // Concatenar (eliminando espacios iniciales/finales por si acaso, aunque el punto 13.1 dice espacios intermedios prohibidos, iniciales se concatenan)
        const concatenado = (valCedula.trim() + valRegistro.trim());
        
        // Guardar en matriz: (valorids, no)
        idsConcatenadosTitulados.push({
            valorids: concatenado,
            no: valNo
        });
    });

    // --- 4. GENERAR SQL (Punto 13.2) ---
    // Construimos la cadena VALUES format: ('valor',1), ('valor',2) sin coma final
    const valuesString = idsConcatenadosTitulados
        .map(item => `('${item.valorids}',${item.no})`)
        .join(',\n        '); // Join pone la coma automáticamente entre elementos, pero no al final

    // Inyectamos en el script
    let scriptFinal = diccionario.consultaPreModificacion.replace('<<REEMPLAZAR_VALORES>>', valuesString);

    return {
        success: true,
        mensaje: "Archivo validado y procesado correctamente.",
        totalRegistros: idsConcatenadosTitulados.length,
        scriptGenerado: scriptFinal // Retornamos el script para usarlo luego o mostrarlo
    };
}

module.exports = { procesarArchivoExcel };