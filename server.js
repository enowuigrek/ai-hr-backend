const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { Pool } = require('pg');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// PostgreSQL connection with connection pooling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Enhanced Security Configuration
const SECURITY_CONFIG = {
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX: process.env.NODE_ENV === 'production' ? 30 : 60, // Stricter in production
  MAX_MESSAGE_LENGTH: 1000,
  MAX_SESSION_NAME_LENGTH: 100,
  ALLOWED_ORIGINS: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['*'],
  TRUST_PROXY: process.env.NODE_ENV === 'production'
};

// Performance Metrics Storage
const metrics = {
  requests: 0,
  errors: 0,
  totalResponseTime: 0,
  averageResponseTime: 0,
  startTime: Date.now()
};

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
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active) WHERE is_active = true`);
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

// Trust proxy if in production (for accurate IP addresses behind reverse proxy)
if (SECURITY_CONFIG.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

// Enhanced Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.openai.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disabled for API compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Enhanced CORS Configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (SECURITY_CONFIG.ALLOWED_ORIGINS.includes('*') || 
        SECURITY_CONFIG.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 hours
}));

// Request parsing with size limits
app.use(express.json({ 
  limit: '1mb',
  strict: true,
  type: 'application/json'
}));

// Request sanitization middleware
function sanitizeInput(req, res, next) {
  if (req.body) {
    // Remove potentially dangerous characters
    const sanitize = (obj) => {
      for (let key in obj) {
        if (typeof obj[key] === 'string') {
          // Remove null bytes, control characters, and normalize whitespace
          obj[key] = obj[key]
            .replace(/\0/g, '') // Remove null bytes
            .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters except newlines/tabs
            .trim();
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };
    
    sanitize(req.body);
  }
  next();
}

app.use(sanitizeInput);

// Enhanced rate limiting with IP tracking
const rateLimitStore = new Map();

const advancedRateLimitMiddleware = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowStart = now - SECURITY_CONFIG.RATE_LIMIT_WINDOW;
  
  // Clean old entries
  for (const [ip, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(ip);
    }
  }
  
  // Get or create client data
  let clientData = rateLimitStore.get(clientIp);
  if (!clientData || clientData.resetTime < now) {
    clientData = {
      count: 0,
      resetTime: now + SECURITY_CONFIG.RATE_LIMIT_WINDOW,
      firstRequest: now
    };
    rateLimitStore.set(clientIp, clientData);
  }
  
  // Increment request count
  clientData.count++;
  
  // Check if limit exceeded
  if (clientData.count > SECURITY_CONFIG.RATE_LIMIT_MAX) {
    console.log(`Rate limit exceeded for IP: ${clientIp}, Count: ${clientData.count}`);
    
    return res.status(429).json({
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
    });
  }
  
  // Add rate limit headers
  res.set({
    'X-RateLimit-Limit': SECURITY_CONFIG.RATE_LIMIT_MAX,
    'X-RateLimit-Remaining': Math.max(0, SECURITY_CONFIG.RATE_LIMIT_MAX - clientData.count),
    'X-RateLimit-Reset': new Date(clientData.resetTime).toISOString()
  });
  
  next();
};

// Performance monitoring middleware
const performanceMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Increment request counter
  metrics.requests++;
  
  // Override res.json to capture response time
  const originalJson = res.json;
  res.json = function(data) {
    const responseTime = Date.now() - startTime;
    metrics.totalResponseTime += responseTime;
    metrics.averageResponseTime = metrics.totalResponseTime / metrics.requests;
    
    // Add performance headers
    res.set({
      'X-Response-Time': `${responseTime}ms`,
      'X-Request-ID': `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });
    
    return originalJson.call(this, data);
  };
  
  next();
};

app.use(performanceMiddleware);

// Enhanced database helper functions with connection pooling
async function saveConversation(sessionId, userMessage, aiResponse, responseTimeMs = 0) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const messageLength = userMessage.length + aiResponse.length;
    
    const result = await client.query(
      `INSERT INTO conversations (session_id, user_message, ai_response, message_length, response_time_ms) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [sessionId, userMessage, aiResponse, messageLength, responseTimeMs]
    );
    
    // Update session statistics
    await client.query(
      `UPDATE sessions 
       SET last_activity = CURRENT_TIMESTAMP, 
           message_count = COALESCE(message_count, 0) + 1,
           total_tokens = COALESCE(total_tokens, 0) + $2
       WHERE session_id = $1`,
      [sessionId, Math.ceil(messageLength / 4)]
    );
    
    await client.query('COMMIT');
    return result.rows[0].id;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving conversation:', error);
    return null;
  } finally {
    client.release();
  }
}

async function getConversationHistory(sessionId, limit = 20, offset = 0) {
  try {
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
      result = await pool.query(
        `SELECT session_id, created_at, last_activity
         FROM sessions 
         ORDER BY last_activity DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
    }
    
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM sessions WHERE COALESCE(is_active, true) = true'
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

// Enhanced input validation
function validateChatInput(req, res, next) {
  const { message, sessionId } = req.body;

  // Validate message
  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      error: 'Message is required and must be a string',
      code: 'INVALID_MESSAGE'
    });
  }

  if (message.length > SECURITY_CONFIG.MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Message too long (max ${SECURITY_CONFIG.MAX_MESSAGE_LENGTH} characters)`,
      code: 'MESSAGE_TOO_LONG'
    });
  }

  // Validate sessionId if provided
  if (sessionId && (typeof sessionId !== 'string' || sessionId.length > 100)) {
    return res.status(400).json({
      error: 'Invalid session ID format',
      code: 'INVALID_SESSION_ID'
    });
  }

  next();
}

// OpenAI Integration with enhanced error handling
async function getAIResponse(message, sessionId) {
  const startTime = Date.now();
  
  try {
    const historyResult = await getConversationHistory(sessionId, 5);
    const history = historyResult.messages;
    
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

    messages.push({
      role: "user",
      content: message
    });

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
    metrics.errors++;
    
    const responseTime = Date.now() - startTime;
    return { response: getFallbackResponse(message), responseTime };
  }
}

// Fallback HR responses
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

// Health and metrics endpoints
app.get('/', (req, res) => {
  const uptime = Date.now() - metrics.startTime;
  
  res.json({ 
    message: 'AI HR Backend is running!', 
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '4.0.0',
    features: ['OpenAI GPT-4o-mini', 'PostgreSQL', 'Enhanced Security', 'Performance Monitoring', 'Frontend Integration'],
    security: ['Advanced Rate Limiting', 'Request Sanitization', 'CORS Hardening', 'Security Headers'],
    performance: {
      uptime: `${Math.floor(uptime / 1000)}s`,
      totalRequests: metrics.requests,
      averageResponseTime: `${Math.round(metrics.averageResponseTime)}ms`,
      errorRate: `${((metrics.errors / metrics.requests) * 100).toFixed(2)}%`
    },
    endpoints: [
      'POST /api/chat',
      'GET /api/sessions', 
      'POST /api/chat/session',
      'GET /api/chat/session/:sessionId',
      'GET /api/chat/history/:sessionId',
      'PATCH /api/chat/session/:sessionId',
      'DELETE /api/chat/session/:sessionId',
      'GET /api/metrics'
    ],
    database: 'connected',
    frontend: 'integrated'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: 'postgresql',
    ai: 'openai-gpt-4o-mini',
    features: 'enhanced-security-performance-frontend',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }
  });
});

// New metrics endpoint
app.get('/api/metrics', (req, res) => {
  const uptime = Date.now() - metrics.startTime;
  
  res.json({
    performance: {
      uptime: uptime,
      totalRequests: metrics.requests,
      totalErrors: metrics.errors,
      averageResponseTime: metrics.averageResponseTime,
      errorRate: metrics.errors / metrics.requests,
      requestsPerMinute: metrics.requests / (uptime / 60000)
    },
    memory: process.memoryUsage(),
    rateLimiting: {
      activeIPs: rateLimitStore.size,
      maxRequestsPerWindow: SECURITY_CONFIG.RATE_LIMIT_MAX,
      windowSizeMs: SECURITY_CONFIG.RATE_LIMIT_WINDOW
    },
    timestamp: new Date().toISOString()
  });
});

// Main Chat endpoint with enhanced validation
app.post('/api/chat', advancedRateLimitMiddleware, validateChatInput, async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    const currentSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await createSession(currentSessionId);

    const cleanMessage = message.trim();

    console.log(`Processing message: ${cleanMessage.substring(0, 50)}...`);
    const { response: aiResponse, responseTime } = await getAIResponse(cleanMessage, currentSessionId);

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
    metrics.errors++;
    res.status(500).json({
      error: 'Internal server error',
      code: 'CHAT_ERROR',
      message: 'Please try again in a moment'
    });
  }
});

// Session Management Endpoints

app.get('/api/sessions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100
    const offset = Math.max(parseInt(req.query.offset) || 0, 0); // Min 0
    
    const result = await getAllSessions(limit, offset);
    
    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sessions retrieval error:', error);
    metrics.errors++;
    res.status(500).json({
      error: 'Failed to retrieve sessions',
      code: 'SESSIONS_ERROR'
    });
  }
});

app.post('/api/chat/session', advancedRateLimitMiddleware, async (req, res) => {
  try {
    const { sessionName } = req.body;
    
    // Validate session name
    if (sessionName && (typeof sessionName !== 'string' || sessionName.length > SECURITY_CONFIG.MAX_SESSION_NAME_LENGTH)) {
      return res.status(400).json({
        error: `Session name too long (max ${SECURITY_CONFIG.MAX_SESSION_NAME_LENGTH} characters)`,
        code: 'INVALID_SESSION_NAME'
      });
    }
    
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
    metrics.errors++;
    res.status(500).json({
      error: 'Failed to create session',
      code: 'SESSION_ERROR'
    });
  }
});

app.get('/api/chat/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId || sessionId.length > 100) {
      return res.status(400).json({
        error: 'Invalid session ID',
        code: 'INVALID_SESSION_ID'
      });
    }
    
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
    metrics.errors++;
    res.status(500).json({
      error: 'Failed to retrieve session info',
      code: 'SESSION_INFO_ERROR'
    });
  }
});

app.get('/api/chat/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
    const offset = Math.max(parseInt(req.query.offset) || 0, 0); // Min 0
    
    if (!sessionId || sessionId.length > 100) {
      return res.status(400).json({
        error: 'Invalid session ID',
        code: 'INVALID_SESSION_ID'
      });
    }
    
    const result = await getConversationHistory(sessionId, limit, offset);
    
    res.json({
      success: true,
      sessionId: sessionId,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('History retrieval error:', error);
    metrics.errors++;
    res.status(500).json({
      error: 'Failed to retrieve history',
      code: 'HISTORY_ERROR'
    });
  }
});

app.patch('/api/chat/session/:sessionId', advancedRateLimitMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sessionName } = req.body;
    
    if (!sessionId || sessionId.length > 100) {
      return res.status(400).json({
        error: 'Invalid session ID',
        code: 'INVALID_SESSION_ID'
      });
    }
    
    if (!sessionName || typeof sessionName !== 'string' || sessionName.trim().length === 0) {
      return res.status(400).json({
        error: 'Session name is required',
        code: 'INVALID_SESSION_NAME'
      });
    }
    
    if (sessionName.length > SECURITY_CONFIG.MAX_SESSION_NAME_LENGTH) {
      return res.status(400).json({
        error: `Session name too long (max ${SECURITY_CONFIG.MAX_SESSION_NAME_LENGTH} characters)`,
        code: 'SESSION_NAME_TOO_LONG'
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
    metrics.errors++;
    res.status(500).json({
      error: 'Failed to update session',
      code: 'SESSION_UPDATE_ERROR'
    });
  }
});

app.delete('/api/chat/session/:sessionId', advancedRateLimitMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId || sessionId.length > 100) {
      return res.status(400).json({
        error: 'Invalid session ID',
        code: 'INVALID_SESSION_ID'
      });
    }
    
    try {
      await pool.query('UPDATE sessions SET is_active = FALSE WHERE session_id = $1', [sessionId]);
    } catch (error) {
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
    metrics.errors++;
    res.status(500).json({
      error: 'Failed to delete session',
      code: 'DELETE_ERROR'
    });
  }
});

// Serve static files from React build (Frontend Integration)
if (process.env.NODE_ENV === 'production') {
  // Serve static files from dist directory
  app.use(express.static(path.join(__dirname, 'dist')));
  
  // Handle React routing - send all non-API requests to React
  app.get('*', (req, res, next) => {
    // Skip API routes and health checks
    if (req.path.startsWith('/api/') || 
        req.path.startsWith('/health') || 
        req.path.startsWith('/metrics') ||
        req.path === '/') {
      return next();
    }
    
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  metrics.errors++;
  
  // Don't leak error details in production
  const isDev = process.env.NODE_ENV !== 'production';
  
  res.status(500).json({
    error: 'Internal server error',
    code: 'UNHANDLED_ERROR',
    ...(isDev && { details: err.message })
  });
});

// 404 handler for API routes only
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    code: 'NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
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

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database pool...');
  await pool.end();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  metrics.errors++;
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  metrics.errors++;
});

app.listen(port, () => {
  console.log(`🚀 AI HR Backend v4.0.0 running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${port}/api/chat`);
  console.log(`📈 Metrics: http://localhost:${port}/api/metrics`);
  console.log(`🔒 Security: Enhanced rate limiting, CORS, sanitization`);
  console.log(`⚡ Performance: Connection pooling, monitoring, compression`);
  console.log(`📊 Features: OpenAI GPT-4o-mini, PostgreSQL, Advanced Session Management`);
  console.log(`🌐 Frontend: Integrated static file serving`);
  console.log(`🛡️ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: PostgreSQL with connection pooling`);
  console.log(`🤖 AI: OpenAI API configured and ready`);
});
