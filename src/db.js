const { Pool } = require('pg');

// Toute la configuration vient des variables d'environnement, rien en dur.
// Une variable obligatoire manquante fait planter le démarrage avec un
// message clair, jamais un undefined silencieux qui casse plus loin.
const REQUIRED = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const name of REQUIRED) {
  if (!process.env[name]) {
    throw new Error(`La variable d'environnement ${name} doit être définie`);
  }
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionTimeoutMillis: 3000,
});

// Une connexion idle qui meurt (base redémarrée) ne doit pas
// faire tomber le process : on logue, les requêtes suivantes retenteront.
pool.on('error', (err) => {
  console.error(`Erreur pool Postgres : ${err.message}`);
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

module.exports = { pool, init };
