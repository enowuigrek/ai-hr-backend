const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Database migration and initialization
async function initializeDatabase() {
  try {
    await pool.query('SELECT NOW()');
    console.log('Database connected successfully');
    
    // Create conversations table with all columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255),
        user_message TEXT NOT NULL,
        ai_response TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add missing columns if they don't exist
    try {
      await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS message_length INTEGER DEFAULT 0`);
      await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS response_time_ms INTEGER DEFAULT 0`);
      console.log('Added missing columns to conversations table');
    } catch (error) {
      console.log('Columns already exist or error adding them:', error.message);
    }
    
    // Create sessions table with all columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add missing columns to sessions if they don't exist
    try {
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0`);
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0`);
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_name VARCHAR(255) DEFAULT 'Nowa konwersacja'`);
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
      console.log('Added missing columns to sessions table');
    } catch (error) {
      console.log('Session columns already exist or error adding them:', error.message);
    }
    
    // Add indexes for better performance
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity DESC)`);
      console.log('Database indexes created/verified');
    } catch (error) {
      console.log('Indexes already exist:', error.message);
    }
    
    console.log('Database migration completed successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Initialize database on startup
initializeDatabase();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting middleware
const rateLimit = {};
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 60;

const rateLimitMiddleware = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimit[clientIp]) {
    rateLimit[clientIp] = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
    return next();
  }
  
  if (now > rateLimit[clientIp].resetTime) {
    rateLimit[clientIp] = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
    return next();
  }
  
  if (rateLimit[clientIp].count >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
  
  rateLimit[clientIp].count++;
  next();
};

// Enhanced database helper functions
async function saveConversation(sessionId, userMessage, aiResponse, responseTimeMs = 0) {
  try {
    const messageLength = userMessage.length + aiResponse.length;
    
    // Use safe column insertion - check if columns exist
    const result = await pool.query(
      `INSERT INTO conversations (session_id, user_message, ai_response, message_length, response_time_ms) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [sessionId, userMessage, aiResponse, messageLength, responseTimeMs]
    );
    
    // Update session statistics safely
    try {
      await pool.query(
        `UPDATE sessions 
         SET last_activity = CURRENT_TIMESTAMP, 
             message_count = COALESCE(message_count, 0) + 1,
             total_tokens = COALESCE(total_tokens, 0) + $2
         WHERE session_id = $1`,
        [sessionId, Math.ceil(messageLength / 4)]
      );
    } catch (updateError) {
      console.log('Session update error (continuing):', updateError.message);
    }
    
    return result.rows[0].id;
  } catch (error) {
    console.error('Error saving conversation:', error);
    return null;
  }
}

async function getConversationHistory(sessionId, limit = 20, offset = 0) {
  try {
    // Use basic query that works with existing schema
    const result = await pool.query(
      `SELECT user_message, ai_response, timestamp 
       FROM conversations 
       WHERE session_id = $1 
       ORDER BY timestamp ASC 
       LIMIT $2 OFFSET $3`,
      [sessionId, limit, offset]
    );
    
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM conversations WHERE session_id = $1',
      [sessionId]
    );
    
    return {
      messages: result.rows,
      total: parseInt(countResult.rows[0].total),
      hasMore: offset + result.rows.length < parseInt(countResult.rows[0].total)
    };
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return { messages: [], total: 0, hasMore: false };
  }
}

async function createSession(sessionId, sessionName = null) {
  try {
    const name = sessionName || `Sesja ${new Date().toLocaleDateString('pl-PL')}`;
    
    await pool.query(
      `INSERT INTO sessions (session_id, session_name) 
       VALUES ($1, $2) 
       ON CONFLICT (session_id) DO UPDATE SET 
       last_activity = CURRENT_TIMESTAMP`,
      [sessionId, name]
    );
    
    return true;
  } catch (error) {
    // Fallback to basic insertion if session_name column doesn't exist
    try {
      await pool.query(
        `INSERT INTO sessions (session_id) 
         VALUES ($1) 
         ON CONFLICT (session_id) DO UPDATE SET 
         last_activity = CURRENT_TIMESTAMP`,
        [sessionId]
      );
      return true;
    } catch (fallbackError) {
      console.error('Error creating session:', fallbackError);
      return false;
    }
  }
}

async function getAllSessions(limit = 50, offset = 0) {
  try {
    // Try full query first, fallback to basic if needed
    let result;
    try {
      result = await pool.query(
        `SELECT session_id, 
                COALESCE(session_name, 'Nowa konwersacja') as session_name,
                created_at, last_activity, 
                COALESCE(message_count, 0) as message_count,
                COALESCE(total_tokens, 0) as total_tokens,
                COALESCE(is_active, true) as is_active
         FROM sessions 
         WHERE COALESCE(is_active, true) = true
         ORDER BY last_activity DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
    } catch (error) {
      // Fallback to basic query
      result = await pool.query(
        `SELECT session_id, created_at, last_activity
         FROM sessions 
         ORDER BY last_activity DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
    }
    
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM sessions'
    );
    
    return {
      sessions: result.rows,
      total: parseInt(countResult.rows[0].total),
      hasMore: offset + result.rows.length < parseInt(countResult.rows[0].total)
    };
  } catch (error) {
    console.error('Error getting sessions:', error);
    return { sessions: [], total: 0, hasMore: false };
  }
}

async function getSessionInfo(sessionId) {
  try {
    const result = await pool.query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM conversations WHERE session_id = s.session_id) as actual_message_count,
              (SELECT MAX(timestamp) FROM conversations WHERE session_id = s.session_id) as last_message_time
       FROM sessions s 
       WHERE s.session_id = $1`,
      [sessionId]
    );
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting session info:', error);
    return null;
  }
}

// OpenAI Integration - Main AI Function
async function getAIResponse(message, sessionId) {
  const startTime = Date.now();
  
  try {
    // Get conversation history for context
    const historyResult = await getConversationHistory(sessionId, 5);
    const history = historyResult.messages;
    
    // Build messages array for OpenAI
    const messages = [
      {
        role: "system",
        content: `Jesteś ekspertem HR w Polsce. Odpowiadasz na pytania o prawo pracy, rekrutację i zarządzanie zespołem.

ZASADY:
- Używaj polskich przepisów (Kodeks Pracy, RODO)
- Odpowiadaj konkretnie i zwięźle (max 300 słów)
- Używaj prostego, zrozumiałego języka
- Jeśli nie wiesz, powiedz to wprost
- Zawsze wspominaj o konsultacji z prawnikiem w skomplikowanych sprawach

ZAKRES: urlopy, umowy o pracę, rekrutacja, wynagrodzenia, RODO, zarządzanie zespołem, mobbing, BHP.

STYL: przyjazny ekspert, konkretne odpowiedzi, polskie przykłady.`
      }
    ];

    // Add conversation history
    history.forEach(msg => {
      messages.push({
        role: "user",
        content: msg.user_message
      });
      messages.push({
        role: "assistant", 
        content: msg.ai_response
      });
    });

    // Add current message
    messages.push({
      role: "user",
      content: message
    });

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 500,
      temperature: 0.3,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const response = completion.choices[0]?.message?.content;
    
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const responseTime = Date.now() - startTime;
    return { response: response.trim(), responseTime };

  } catch (error) {
    console.error('OpenAI API Error:', error);
    
    // Fallback to local knowledge
    const responseTime = Date.now() - startTime;
    return { response: getFallbackResponse(message), responseTime };
  }
}

// Fallback HR responses (backup when OpenAI fails)
function getFallbackResponse(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('urlop')) {
    return 'W Polsce przysługuje ci urlop wypoczynkowy: 20 dni (do 10 lat pracy) lub 26 dni (powyżej 10 lat). Urlop macierzyński wynosi 20 tygodni. W razie problemów skonsultuj się z działem HR lub prawnikiem.';
  }

  if (lowerMessage.includes('wypowiedzenie')) {
    return 'Okresy wypowiedzenia zależą od stażu: do 6 miesięcy - 2 tygodnie, od 6 miesięcy do 3 lat - 1 miesiąc, powyżej 3 lat - 3 miesiące. W skomplikowanych sprawach skonsultuj się z prawnikiem.';
  }

  if (lowerMessage.includes('nadgodzin')) {
    return 'Limit nadgodzin to 150h rocznie i max 4h dziennie. Dodatek: 50% za pierwsze 2h, 100% za kolejne. Za pracę w niedzielę i święta - 100% dodatku.';
  }

  if (lowerMessage.includes('minimalne wynagrodzenie')) {
    return 'Minimalne wynagrodzenie w 2024 roku wynosi 3 490 zł brutto miesięcznie. Kwota jest waloryzowana corocznie.';
  }

  return 'Jestem ekspertem HR w Polsce. Mogę pomóc z pytaniami o urlopy, umowy o pracę, wynagrodzenia, rekrutację, RODO i zarządzanie zespołem. O co konkretnie chciałbyś zapytać?';
}

// Health endpoints
app.get('/', (req, res) => {
  res.json({ 
    message: 'AI HR Backend is running!', 
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '2.1.1',
    features: ['OpenAI GPT-4o-mini', 'PostgreSQL', 'Session Management (Fixed)'],
    endpoints: [
      'POST /api/chat',
      'GET /api/sessions',
      'POST /api/chat/session',
      'GET /api/chat/session/:sessionId',
      'GET /api/chat/history/:sessionId',
      'PATCH /api/chat/session/:sessionId',
      'DELETE /api/chat/session/:sessionId'
    ],
    database: 'connected'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: 'postgresql',
    ai: 'openai-gpt-4o-mini',
    features: 'session-management-fixed'
  });
});

// Main Chat endpoint with enhanced tracking
app.post('/api/chat', rateLimitMiddleware, async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    // Input validation
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Message is required and must be a string',
        code: 'INVALID_MESSAGE'
      });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        error: 'Message too long (max 1000 characters)',
        code: 'MESSAGE_TOO_LONG'
      });
    }

    // Generate session ID if not provided
    const currentSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create/update session
    await createSession(currentSessionId);

    // Sanitize input
    const cleanMessage = message.trim();

    // Get AI response from OpenAI with timing
    console.log(`Processing message: ${cleanMessage.substring(0, 50)}...`);
    const { response: aiResponse, responseTime } = await getAIResponse(cleanMessage, currentSessionId);

    // Save conversation to database with metrics
    const conversationId = await saveConversation(currentSessionId, cleanMessage, aiResponse, responseTime);

    console.log(`Response generated successfully (conversation ID: ${conversationId}, time: ${responseTime}ms)`);

    res.json({
      success: true,
      response: aiResponse,
      sessionId: currentSessionId,
      conversationId: conversationId,
      timestamp: new Date().toISOString(),
      responseTime: responseTime,
      source: 'openai-gpt-4o-mini'
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'CHAT_ERROR',
      message: 'Please try again in a moment'
    });
  }
});

// Session Management Endpoints

// Get all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await getAllSessions(limit, offset);
    
    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sessions retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve sessions',
      code: 'SESSIONS_ERROR'
    });
  }
});

// Create new session
app.post('/api/chat/session', async (req, res) => {
  try {
    const { sessionName } = req.body;
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await createSession(sessionId, sessionName);
    
    res.json({
      success: true,
      sessionId: sessionId,
      sessionName: sessionName || `Sesja ${new Date().toLocaleDateString('pl-PL')}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({
      error: 'Failed to create session',
      code: 'SESSION_ERROR'
    });
  }
});

// Get session info
app.get('/api/chat/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionInfo = await getSessionInfo(sessionId);
    
    if (!sessionInfo) {
      return res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      session: sessionInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Session info error:', error);
    res.status(500).json({
      error: 'Failed to retrieve session info',
      code: 'SESSION_INFO_ERROR'
    });
  }
});

// Get conversation history with pagination
app.get('/api/chat/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await getConversationHistory(sessionId, limit, offset);
    
    res.json({
      success: true,
      sessionId: sessionId,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('History retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve history',
      code: 'HISTORY_ERROR'
    });
  }
});

// Update session name
app.patch('/api/chat/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sessionName } = req.body;
    
    if (!sessionName || sessionName.trim().length === 0) {
      return res.status(400).json({
        error: 'Session name is required',
        code: 'INVALID_SESSION_NAME'
      });
    }
    
    await pool.query(
      'UPDATE sessions SET session_name = $1 WHERE session_id = $2',
      [sessionName.trim(), sessionId]
    );
    
    res.json({
      success: true,
      message: 'Session name updated',
      sessionId: sessionId,
      sessionName: sessionName.trim(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Session update error:', error);
    res.status(500).json({
      error: 'Failed to update session',
      code: 'SESSION_UPDATE_ERROR'
    });
  }
});

// Delete session (soft delete)
app.delete('/api/chat/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Try soft delete first, fallback to hard delete
    try {
      await pool.query('UPDATE sessions SET is_active = FALSE WHERE session_id = $1', [sessionId]);
    } catch (error) {
      // Fallback: actually delete conversations and session
      await pool.query('DELETE FROM conversations WHERE session_id = $1', [sessionId]);
      await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
    }
    
    res.json({
      success: true,
      message: 'Session deleted successfully',
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Session deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete session',
      code: 'DELETE_ERROR'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'UNHANDLED_ERROR'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    availableEndpoints: [
      'GET /',
      'GET /health',
      'POST /api/chat',
      'GET /api/sessions',
      'POST /api/chat/session',
      'GET /api/chat/session/:sessionId',
      'GET /api/chat/history/:sessionId',
      'PATCH /api/chat/session/:sessionId',
      'DELETE /api/chat/session/:sessionId'
    ]
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  await pool.end();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`AI HR Backend running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Chat endpoint: http://localhost:${port}/api/chat`);
  console.log(`Sessions endpoint: http://localhost:${port}/api/sessions`);
  console.log(`Features: OpenAI GPT-4o-mini, PostgreSQL, Session Management (Fixed)`);
  console.log(`Database: PostgreSQL with safe migrations`);
  console.log(`AI: OpenAI API configured`);
  console.log(`Version: 2.1.1 - Database Migration Fixed`);
});
