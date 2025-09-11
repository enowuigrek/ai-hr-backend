const OpenAI = require('openai');
const dbService = require('./dbService');
const hrService = require('./hrService');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function getAIResponse(message, sessionId) {
  const startTime = Date.now();
  
  try {
    // KROK 1: Sprawdź czy pytanie jest związane z HR
    if (!hrService.isHRRelated(message)) {
      console.log(`🚫 Non-HR question blocked: "${message.substring(0, 50)}..."`);
      const responseTime = Date.now() - startTime;
      return { 
        response: hrService.getFallbackResponse(message), 
        responseTime 
      };
    }

    console.log(`✅ HR-related question accepted: "${message.substring(0, 50)}..."`);

    // KROK 2: Pobierz historię konwersacji
    const history = await dbService.getConversationHistory(sessionId, 5);
    
    // KROK 3: Przygotuj messages dla OpenAI z pełną bazą wiedzy
    const messages = [
      {
        role: "system",
        content: hrService.getSystemPrompt()  // Teraz zawiera pełną bazę wiedzy!
      }
    ];

    // Dodaj historię konwersacji
    history.messages.forEach(msg => {
      messages.push({
        role: "user",
        content: msg.user_message
      });
      messages.push({
        role: "assistant", 
        content: msg.ai_response
      });
    });

    // Dodaj aktualne pytanie
    messages.push({
      role: "user",
      content: message
    });

    console.log(`🤖 Sending to OpenAI with full HR knowledge base`);

    // KROK 4: Wywołaj OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 600,  // Zwiększone dla bardziej szczegółowych odpowiedzi
      temperature: 0.3,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const response = completion.choices[0]?.message?.content;
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ OpenAI response received in ${responseTime}ms`);
    
    return { response: response.trim(), responseTime };

  } catch (error) {
    console.error('❌ OpenAI Error:', error.message);
    const responseTime = Date.now() - startTime;
    
    // Fallback z pełną bazą wiedzy
    return { 
      response: hrService.getFallbackResponse(message), 
      responseTime 
    };
  }
}

module.exports = { getAIResponse };