const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

// Jeśli masz własny rate limit – zostaw; jeśli nie, usuń ten import:
let rateLimitMiddleware;
try { ({ rateLimitMiddleware } = require('../middleware/rateLimit')); } catch { rateLimitMiddleware = (req,res,next)=>next(); }

// Twój moduł z wiedzą (to, co właśnie edytowałeś)
const { getSystemPrompt, isHRRelated, getFallbackResponse } = require('../services/hrService');

// (Opcjonalnie) zapis do DB, jeśli masz takie funkcje – jeśli nie, usuń te linie użycia niżej
let dbService = {};
try { dbService = require('../services/dbService'); } catch {}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// POST /api/chat  — główny endpoint
router.post('/', rateLimitMiddleware, async (req, res) => {
  const started = Date.now();

  try {
    const { message, sessionId } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
    }

    // Minimalna walidacja sessionId (opcjonalnie masz dokładniejszą w sessions routerze)
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
      return res.status(400).json({ error: 'Invalid sessionId', code: 'INVALID_SESSION_ID' });
    }

    // 1) Zbuduj system prompt z Twojej bazy (TEST / PROD)
    const systemPrompt = getSystemPrompt();

    // 2) Utnij user message, żeby nie wysyłać śmieci (opcjonalnie)
    const userMessage = String(message).slice(0, 5000);

    // 3) Złóż wiadomości dla OpenAI: system + user
    const messages = [
      {
        role: 'system',
        content:
          systemPrompt +
          '\n\nZASADA TWARDa: Odpowiadaj TYLKO na podstawie powyższego tekstu. ' +
          'Jeśli w bazie nie ma informacji – odpowiedz dokładnie: "Brak danych w bazie".'
      },
      { role: 'user', content: userMessage }
    ];

    // 4) Wywołanie OpenAI (model z Twojego stacku)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.2,        // niska, żeby trzymało się bazy
      max_tokens: 600
    });

    const aiText =
      completion?.choices?.[0]?.message?.content?.trim() ||
      'Brak danych w bazie';

    // 5) (Opcjonalnie) zapisz rozmowę w DB, jeśli masz taką funkcję
    try {
      if (dbService.saveMessage) {
        await dbService.saveConversation(sessionId, userMessage, aiText, responseTime);
      }
    } catch (e) {
      // nie blokuj odpowiedzi jeśli zapis się nie uda
      console.warn('DB saveMessage warn:', e?.message || e);
    }

    const responseTime = Date.now() - started;

    return res.json({
      success: true,
      response: aiText,
      sessionId,
      // jeśli Twój DB zwraca conversationId, dołóż go po zapisie
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
