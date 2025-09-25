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

    // 3) 🚀 NOWE: Pobierz ostatnie 4 pary konwersacji dla kontekstu
    console.log('📚 Loading recent conversation context for session:', sessionId);
    const recentContext = await dbService.getRecentConversationContext(sessionId, 4); // 4 ostatnie pary pytanie-odpowiedź
    console.log('📚 Recent context loaded:', {
      sessionId,
      contextPairs: recentContext.messages.length,
      total: recentContext.total
    });

    // 4) Przygotuj user message (obcięcie do 5000 znaków)
    const userMessage = String(message).slice(0, 5000);

    // 5) Złóż wiadomości dla OpenAI z KONTEKSTEM 🎯
    const messages = [
      {
        role: 'system',
        content: systemPrompt + 
          '\n\nZASADA TWARDA: Odpowiadaj TYLKO na podstawie powyższego tekstu. ' +
          'Jeśli w bazie nie ma informacji – odpowiedz dokładnie: "Brak danych w bazie".' +
          '\n\n🔥 OBSŁUGA KONTEKSTU - BARDZO WAŻNE:' +
          '\n1. ZAWSZE sprawdzaj poprzednie wiadomości w rozmowie' +
          '\n2. Jeśli wcześniej pytałeś o staż pracy/wykształcenie/szczegóły, a użytkownik odpowiada pojedynczymi słowami lub liczbami - TO SĄ ODPOWIEDZI NA TWOJE PYTANIA!' +
          '\n3. Przykład: Ty: "Ile lat pracujesz?" → Użytkownik: "3 lata" lub "3" = odpowiedź na Twoje pytanie' +
          '\n4. Przykład: Ty: "26 dni urlopu?" → Użytkownik: "26" = potwierdza 26 dni urlopu' +
          '\n5. Nie pytaj ponownie o to samo - wykorzystaj podane dane do obliczeń!' +
          '\n6. Jeśli dane są dziwne (np. 100 lat pracy), grzecznie zapytaj czy na pewno, ale nie ignoruj kontekstu'
      }
    ];

    // DODAJ KONTEKST OSTATNICH KONWERSACJI
    if (recentContext.messages && recentContext.messages.length > 0) {
      console.log('🔗 Adding recent conversation context to OpenAI messages');
      recentContext.messages.forEach(msg => {
        messages.push(
          { role: 'user', content: msg.user_message },
          { role: 'assistant', content: msg.ai_response }
        );
      });
    }

    // DODAJ AKTUALNE PYTANIE na końcu
    messages.push({ 
      role: 'user', 
      content: userMessage 
    });

    // Debug: sprawdź strukturę wiadomości
    console.log('🤖 Sending to OpenAI with context:', {
      sessionId,
      totalMessages: messages.length,
      systemPrompt: 1,
      contextPairs: recentContext.messages.length,
      currentMessage: 1,
      currentMessagePreview: userMessage.substring(0, 50) + '...',
      messagesStructure: messages.map((msg, i) => ({
        index: i,
        role: msg.role,
        contentLength: msg.content.length,
        preview: msg.content.substring(0, 30) + '...'
      }))
    });

    // 6) Wywołanie OpenAI z lepszymi parametrami dla kontekstu
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.2, // Niska temperatura dla konsystentnych odpowiedzi
      max_tokens: 600,
      presence_penalty: 0.1, // Lekko karze powtarzanie
      frequency_penalty: 0.1 // Lekko zachęca do różnorodności
    });

    const aiText = completion?.choices?.[0]?.message?.content?.trim() || 'Brak danych w bazie';
    
    // 7) Oblicz czas odpowiedzi
    const responseTime = Date.now() - started;

    // 8) Zapisz rozmowę w bazie danych
    try {
      console.log('🔄 Attempting to save to DB:', {
        sessionId,
        userMessageLength: userMessage.length,
        aiResponseLength: aiText.length,
        responseTime
      });
      await dbService.saveConversation(sessionId, userMessage, aiText, responseTime);
      console.log('✅ DB save successful');
    } catch (e) {
      console.error('❌ DB save failed:', e?.message || e);
      // Nie blokuj odpowiedzi jeśli zapis się nie uda
    }

    // 9) Zwróć odpowiedź z dodatkowymi info
    return res.json({
      success: true,
      response: aiText,
      sessionId,
      timestamp: new Date().toISOString(),
      responseTime,
      source: 'openai-gpt-4o-mini',
      // Debug info (możesz usunąć w produkcji)
      context: {
        contextPairsUsed: recentContext.messages.length,
        totalMessagesInPrompt: messages.length - 1, // -1 bo system prompt
        hasHistory: recentContext.messages.length > 0
      }
    });

  } catch (error) {
    console.error('❌ Chat error:', error);
    const responseTime = Date.now() - started;
    
    // Jeśli błąd OpenAI - spróbuj fallback
    if (error.code === 'insufficient_quota' || error.code === 'invalid_api_key') {
      console.log('🔄 OpenAI error - using fallback response');
      try {
        const fallbackResponse = getFallbackResponse(req.body.message || 'Pytanie o HR');
        return res.json({
          success: true,
          response: fallbackResponse,
          sessionId: req.body.sessionId,
          timestamp: new Date().toISOString(),
          responseTime,
          source: 'fallback-due-to-openai-error'
        });
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
      }
    }
    
    return res.status(500).json({
      error: 'Chat processing failed',
      code: 'CHAT_ERROR',
      responseTime,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;