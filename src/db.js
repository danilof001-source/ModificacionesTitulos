const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

/**
 * GESTIÓN DE LOGS LOCALES
 * Como no tienes sudo para journalctl, creamos un flujo de escritura
 * que guardará los logs en un archivo llamado 'debug.log' en la raíz.
 */
const logStream = fs.createWriteStream(path.join(__dirname, 'debug.log'), { flags: 'a' });

const logger = (msg, isError = false) => {
  const time = new Date().toLocaleString();
  const fullMsg = `[${time}] ${msg}\n`;
  
  // Imprime en la terminal (Systemd)
  isError ? console.error(fullMsg) : console.log(fullMsg);
  
  // Escribe en el archivo físico (Para ti sin sudo)
  logStream.write(fullMsg);
};

/**
 * CONFIGURACIÓN DE ENTORNO
 * Solo carga dotenv si existe un archivo .env (útil para tu PC local).
 * En el servidor, usará las variables inyectadas por Systemd.
 */
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432, // Respaldo al puerto estándar
});

// Eventos de conexión
pool.on('connect', () => {
  logger(`-> Conectado exitosamente a la Base de Datos: ${process.env.DB_NAME}`);
});

pool.on('error', (err) => {
  logger(`-> Error inesperado en el cliente de BD: ${err.message}`, true);
});

// Exportación modular
module.exports = {
  // Para consultas directas (ej: login)
  query: (text, params) => pool.query(text, params),
  
  // Para transacciones manuales
  pool: pool 
};