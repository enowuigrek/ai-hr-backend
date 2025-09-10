const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function initializeDatabase() {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected');
    
    // Tabele
    await createTables();
    await createIndexes();
    
    console.log('✅ Database migration completed');
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(255),
      user_message TEXT NOT NULL,
      ai_response TEXT NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      message_length INTEGER DEFAULT 0,
      response_time_ms INTEGER DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(255) UNIQUE NOT NULL,
      session_name VARCHAR(255) DEFAULT 'Nowa konwersacja',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      message_count INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE
    )
  `);
}

async function createIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active) WHERE is_active = true'
  ];
  
  for (const index of indexes) {
    await pool.query(index);
  }
}

module.exports = { pool, initializeDatabase };