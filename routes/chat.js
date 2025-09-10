const express = require('express');
const router = express.Router();
const { validateChatInput } = require('../middleware/validation');
const { rateLimitMiddleware } = require('../middleware/rateLimit');
const aiService = require('../services/aiService');
const dbService = require('../services/dbService');

// POST /api/chat
router.post('/', rateLimitMiddleware, validateChatInput, async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    const currentSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await dbService.createSession(currentSessionId);

    const { response: aiResponse, responseTime } = await aiService.getAIResponse(message.trim(), currentSessionId);

    const conversationId = await dbService.saveConversation(currentSessionId, message.trim(), aiResponse, responseTime);

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
    res.status(500).json({
      error: 'Internal server error',
      code: 'CHAT_ERROR'
    });
  }
});

module.exports = router;
