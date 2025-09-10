const OpenAI = require('openai');
const dbService = require('./dbService');
const hrService = require('./hrService');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function getAIResponse(message, sessionId) {
  const startTime = Date.now();
  
  try {
    const history = await dbService.getConversationHistory(sessionId, 5);
    
    const messages = [
      {
        role: "system",
        content: hrService.getSystemPrompt()
      }
    ];

    // Dodaj historię
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

    messages.push({
      role: "user",
      content: message
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 500,
      temperature: 0.3
    });

    const response = completion.choices[0]?.message?.content;
    const responseTime = Date.now() - startTime;
    
    return { response: response.trim(), responseTime };

  } catch (error) {
    console.error('OpenAI Error:', error);
    const responseTime = Date.now() - startTime;
    return { response: hrService.getFallbackResponse(message), responseTime };
  }
}

module.exports = { getAIResponse };
