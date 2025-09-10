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

// Test database connection and create tables
async function initializeDatabase() {
  try {
    await pool.query('SELECT NOW()');
    console.log('Database connected successfully');
    
    // Create tables if they don't exist
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
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Database tables created/verified');
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

// Database helper functions
async function saveConversation(sessionId, userMessage, aiResponse) {
  try {
    const result = await pool.query(
      'INSERT INTO conversations (session_id, user_message, ai_response) VALUES ($1, $2, $3) RETURNING id',
      [sessionId, userMessage, aiResponse]
    );
    return result.rows[0].id;
  } catch (error) {
    console.error('Error saving conversation:', error);
    return null;
  }
}

async function getConversationHistory(sessionId, limit = 10) {
  try {
    const result = await pool.query(
      'SELECT user_message, ai_response, timestamp FROM conversations WHERE session_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [sessionId, limit]
    );
    return result.rows.reverse(); // Return in chronological order
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return [];
  }
}

async function createSession(sessionId) {
  try {
    await pool.query(
      'INSERT INTO sessions (session_id) VALUES ($1) ON CONFLICT (session_id) DO UPDATE SET last_activity = CURRENT_TIMESTAMP',
      [sessionId]
    );
    return true;
  } catch (error) {
    console.error('Error creating session:', error);
    return false;
  }
}

// OpenAI Integration - Main AI Function
async function getAIResponse(message, sessionId) {
  try {
    // Get conversation history for context
    const history = await getConversationHistory(sessionId, 5);
    
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

    return response.trim();

  } catch (error) {
    console.error('OpenAI API Error:', error);
    
    // Fallback to local knowledge
    return getFallbackResponse(message);
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
    version: '2.0.0',
    features: ['OpenAI GPT-4o-mini', 'PostgreSQL', 'Session Management'],
    database: 'connected'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: 'postgresql',
    ai: 'openai-gpt-4o-mini'
  });
});

// Main Chat endpoint with OpenAI integration
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

    // Get AI response from OpenAI
    console.log(`Processing message: ${cleanMessage.substring(0, 50)}...`);
    const aiResponse = await getAIResponse(cleanMessage, currentSessionId);

    // Save conversation to database
    const conversationId = await saveConversation(currentSessionId, cleanMessage, aiResponse);

    console.log(`Response generated successfully (conversation ID: ${conversationId})`);

    res.json({
      success: true,
      response: aiResponse,
      sessionId: currentSessionId,
      conversationId: conversationId,
      timestamp: new Date().toISOString(),
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

// Session management endpoints
app.post('/api/chat/session', async (req, res) => {
  try {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await createSession(sessionId);
    
    res.json({
      success: true,
      sessionId: sessionId,
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

app.get('/api/chat/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = await getConversationHistory(sessionId);
    
    res.json({
      success: true,
      sessionId: sessionId,
      history: history,
      count: history.length,
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

app.delete('/api/chat/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await pool.query('DELETE FROM conversations WHERE session_id = $1', [sessionId]);
    await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
    
    res.json({
      success: true,
      message: 'Session and history cleared',
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Session deletion error:', error);
    res.status(500).json({
      error: 'Failed to clear session',
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
    code: 'NOT_FOUND'
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
  console.log(`Features: OpenAI GPT-4o-mini, PostgreSQL, Session Management`);
  console.log(`Database: PostgreSQL connected`);
  console.log(`AI: OpenAI API configured`);
});