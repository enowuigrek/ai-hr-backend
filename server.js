const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// NOWE: Rate limiting middleware
const rateLimit = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuta
const RATE_LIMIT_MAX = 60; // 60 requestów na minutę

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

// HR Knowledge base (fallback)
const HR_KNOWLEDGE = {
  'urlop macierzyński': 'Urlop macierzyński w Polsce wynosi 20 tygodni i przysługuje od 6. tygodnia przed przewidywaną datą porodu.',
  'wypowiedzenie umowy': 'Okres wypowiedzenia zależy od stażu pracy: do 6 miesięcy - 2 tygodnie, od 6 miesięcy do 3 lat - 1 miesiąc, powyżej 3 lat - 3 miesiące.',
  'urlop wypoczynkowy': 'Podstawowy urlop wynosi 20 dni (do 10 lat pracy) lub 26 dni (powyżej 10 lat pracy).',
  'minimalne wynagrodzenie': 'Minimalne wynagrodzenie w 2024 roku wynosi 3 490 zł brutto miesięcznie.',
  'godziny nadliczbowe': 'Limit godzin nadliczbowych to 150 godzin w roku dla jednego pracownika, maksymalnie 4 godziny dziennie.'
};

function getHRResponse(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('urlop')) {
    return 'W Polsce przysługuje ci urlop wypoczynkowy: 20 dni (do 10 lat pracy) lub 26 dni (powyżej 10 lat). Urlop macierzyński wynosi 20 tygodni.';
  }

  if (lowerMessage.includes('wypowiedzenie')) {
    return 'Okresy wypowiedzenia zależą od stażu: do 6 miesięcy - 2 tygodnie, od 6 miesięcy do 3 lat - 1 miesiąc, powyżej 3 lat - 3 miesiące.';
  }

  if (lowerMessage.includes('nadgodzin')) {
    return 'Limit nadgodzin to 150h rocznie i max 4h dziennie. Dodatek: 50% za pierwsze 2h, 100% za kolejne.';
  }

  if (lowerMessage.includes('minimalne wynagrodzenie')) {
    return 'Minimalne wynagrodzenie w 2024 roku wynosi 3 490 zł brutto miesięcznie.';
  }

  return 'Jestem ekspertem HR w Polsce. Mogę pomóc z pytaniami o urlopy, umowy o pracę, wynagrodzenia, rekrutację i zarządzanie zespołem. O co konkretnie chciałbyś zapytać?';
}

// Health endpoints
app.get('/', (req, res) => {
  res.json({ 
    message: 'AI HR Backend is running!', 
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// NOWE: Chat endpoint z bezpieczeństwem
app.post('/api/chat', rateLimitMiddleware, async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    // NOWE: Input validation
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

    // Sanitize input
    const cleanMessage = message.trim();

    // Get AI response
    const aiResponse = getHRResponse(cleanMessage);

    res.json({
      success: true,
      response: aiResponse,
      sessionId: sessionId || 'demo-session',
      timestamp: new Date().toISOString(),
      source: 'hr-knowledge-base'
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'CHAT_ERROR'
    });
  }
});

// NOWE: Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'UNHANDLED_ERROR'
  });
});

// NOWE: 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND'
  });
});

app.listen(port, () => {
  console.log(`🚀 AI HR Backend running on port ${port}`);
  console.log(`🔗 Health check: http://localhost:${port}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${port}/api/chat`);
});
