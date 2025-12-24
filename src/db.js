const { Pool } = require('pg');
require('dotenv').config();

// Configuración de la conexión usando las variables del .env
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Evento para confirmar conexión exitosa (solo informativo en consola)
pool.on('connect', () => {
  console.log('-> Conectado exitosamente a la Base de Datos: ' + process.env.DB_NAME);
});

pool.on('error', (err) => {
  console.error('-> Error inesperado en el cliente de BD', err);
});

module.exports = pool;