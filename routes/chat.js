const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

// Rate limiting middleware
let rateLimitMiddleware;
try { 
  ({ rateLimitMiddleware } = require('../middleware/rateLimit')); 
} catch { 
  rateLimitMiddleware = (req,res,next)=>next(); 
}

// HR service for knowledge base and filtering
const { getSystemPrompt, isHRRelated, getFallbackResponse } = require('../services/hrService');

// Database service for saving conversations
const dbService = require('../services/dbService');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// POST /api/chat - główny endpoint
router.post('/', rateLimitMiddleware, async (req, res) => {
  const started = Date.now();

  try {
    const { message, sessionId } = req.body || {};
    
    // Walidacja message
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
    }

    // Walidacja sessionId
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
      return res.status(400).json({ error: 'Invalid sessionId', code: 'INVALID_SESSION_ID' });
    }

    // 1) Sprawdź czy pytanie jest związane z HR (opcjonalne - można wyłączyć)
    // if (!isHRRelated(message)) {
    //   const responseTime = Date.now() - started;
    //   return res.json({
    //     success: true,
    //     response: getFallbackResponse(message),
    //     sessionId,
    //     timestamp: new Date().toISOString(),
    //     responseTime,
    //     source: 'hr-filter'
    //   });
    // }

    // 2) Zbuduj system prompt z bazy wiedzy (TEST/PROD)
    const systemPrompt = getSystemPrompt();

    // 3) Przygotuj user message (obcięcie do 5000 znaków)
    const userMessage = String(message).slice(0, 5000);

    // 4) Złóż wiadomości dla OpenAI
    const messages = [
      {
        role: 'system',
        content: systemPrompt + 
          '\n\nZASADA TWARDA: Odpowiadaj TYLKO na podstawie powyższego tekstu. ' +
          'Jeśli w bazie nie ma informacji – odpowiedz dokładnie: "Brak danych w bazie".'
      },
      { 
        role: 'user', 
        content: userMessage 
      }
    ];

    // 5) Wywołanie OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.2,
      max_tokens: 600
    });

    const aiText = completion?.choices?.[0]?.message?.content?.trim() || 'Brak danych w bazie';
    
    // 6) Oblicz czas odpowiedzi
    const responseTime = Date.now() - started;

    // 7) Zapisz rozmowę w bazie danych
    try {
      console.log('🔄 Attempting to save to DB:', sessionId, userMessage.length, aiText.length);
      await dbService.saveConversation(sessionId, userMessage, aiText, responseTime);
      console.log('✅ DB save successful');
    } catch (e) {
      console.error('❌ DB save failed:', e?.message || e);
      // Nie blokuj odpowiedzi jeśli zapis się nie uda
    }

    // 8) Zwróć odpowiedź
    return res.json({
      success: true,
      response: aiText,
      sessionId,
      timestamp: new Date().toISOString(),
      responseTime,
      source: 'openai-gpt-4o-mini'
    });

  } catch (error) {
    console.error('Chat error:', error);
    const responseTime = Date.now() - started;
    return res.status(500).json({
      error: 'Chat processing failed',
      code: 'CHAT_ERROR',
      responseTime
    });
  }
});

module.exports = router;
