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
          '\n\n🔥🔥🔥 KRYTYCZNE: OBSŁUGA KONTEKSTU ROZMOWY 🔥🔥🔥' +
          '\nCZYTAJ UWAŻNIE POPRZEDNIE WIADOMOŚCI W TEJ ROZMOWIE!' +
          '\n\n📋 ZASADY:' +
          '\n1. Jeśli wcześniej pytałeś "Ile lat pracujesz?" a użytkownik teraz pisze "10 lat" - TO JEST ODPOWIEDŹ!' +
          '\n2. Jeśli pytałeś "26 dni urlopu?" a użytkownik pisze "26" - POTWIERDZA 26 dni!' +
          '\n3. Jeśli pytałeś o staż i użytkownik odpowiedział "10 lat", NIE PYTAJ PONOWNIE o staż!' +
          '\n4. WYKORZYSTAJ dane z poprzednich odpowiedzi do obliczeń!' +
          '\n\n💡 PRZYKŁAD DOBREJ ROZMOWY:' +
          '\nTy: "Ile lat pracujesz?"' +
          '\nUser: "10 lat"' +
          '\nTy: "Skoro pracujesz 10 lat, przysługuje Ci 3 miesiące wypowiedzenia"' +
          '\n\n❌ NIE RÓB TAK:' +
          '\nTy: "Ile lat pracujesz?"' +
          '\nUser: "10 lat"' +
          '\nTy: "Ile lat pracujesz?" ← BŁĄD!' +
          '\n\n🧠 PAMIĘTAJ: Jeśli widzisz wcześniejsze pytania i odpowiedzi, UŻYJ ICH!'
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
        preview: msg.role === 'system' ? '[SYSTEM PROMPT]' : msg.content.substring(0, 100) + '...'
      }))
    });

    // 🚨 FORCE DEBUG - pokaż DOKŁADNIE co wysyłamy do OpenAI
    console.log('🚨 FULL MESSAGES ARRAY BEING SENT TO OPENAI:');
    messages.forEach((msg, index) => {
      console.log(`Message ${index} (${msg.role}):`, 
        msg.role === 'system' ? '[SYSTEM PROMPT - HIDDEN]' : `"${msg.content}"`
      );
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