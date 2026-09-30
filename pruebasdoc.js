// =============================================================================
// ARCHIVO: pruebasdoc.js
// USO: node pruebasdoc.js
// DESCRIPCIÓN: Script aislado para probar el diseño del Word sin usar el navegador.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { generarReporteDocx } = require('./src/generadorWord');

async function ejecutarPrueba() {
    console.log(">>> Iniciando generación de prueba...");

    // 1. DATOS SIMULADOS (Mocks)
    // Esto imita lo que normalmente vendría de la base de datos
    const nombreMemoMock = "MINEDEC-PRUEBA-DISENO-2025-M";
    const nombreExcelMock = "Matriz_Original_Prueba.xlsx";
    
    // Simulamos un reporte con varios casos para ver si las viñetas se generan bien
    const reporteMock = [
        { item: 1, tipo: 'CCON', estado: 'OK', mensaje: 'Todo bien' },
        { item: 2, tipo: 'CCON', estado: 'OK', mensaje: 'Todo bien' },
        { item: 3, tipo: 'CCON', estado: 'OK', mensaje: 'Todo bien' }, // 3 de Conocimiento
        { item: 4, tipo: 'CNOM', estado: 'OK', mensaje: 'Todo bien' }, // 1 de Nomenclatura
        { item: 5, tipo: 'CIDE', estado: 'OK', mensaje: 'Todo bien' }, // 1 de Identificación
        { item: 6, tipo: 'CNIV', estado: 'ERROR', mensaje: 'Fallo' }    // 1 Error (No debe sumar)
    ];

    try {
        // 2. LLAMADA A TU GENERADOR
        const bufferWord = await generarReporteDocx(nombreMemoMock, reporteMock, nombreExcelMock);

        // 3. GUARDADO EN DISCO
        const carpetaSalida = path.join(__dirname, 'ResultadosModificaciones');
        
        // Aseguramos que la carpeta exista
        if (!fs.existsSync(carpetaSalida)) {
            fs.mkdirSync(carpetaSalida, { recursive: true });
        }

        // Nombre con hora para que no se sobrescriba y veas versiones
        const nombreArchivo = `TEST_DISENO_${Date.now()}.docx`;
        const rutaFinal = path.join(carpetaSalida, nombreArchivo);

        fs.writeFileSync(rutaFinal, bufferWord);

        console.log("✅ ÉXITO: Documento generado.");
        console.log(`📂 Ubicación: ${rutaFinal}`);
        console.log("👉 Abre el archivo para verificar el diseño.");

    } catch (error) {
        console.error("❌ ERROR:", error);
    }
}

ejecutarPrueba();
