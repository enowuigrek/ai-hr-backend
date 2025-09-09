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

// Basic chat endpoint (without OpenAI for now)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    // Basic validation
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Message is required and must be a string',
        code: 'INVALID_MESSAGE'
      });
    }

    // Simulate AI response for now
    const aiResponse = getHRResponse(message);

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

// HR Knowledge base (fallback)
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

app.listen(port, () => {
  console.log(`🚀 AI HR Backend running on port ${port}`);
  console.log(`🔗 Health check: http://localhost:${port}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${port}/api/chat`);
});
