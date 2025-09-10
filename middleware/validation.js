const SECURITY_CONFIG = require('../config/security');

function validateChatInput(req, res, next) {
  const { message, sessionId } = req.body;

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

  if (sessionId && sessionId.length > 100) {
    return res.status(400).json({
      error: 'Invalid session ID format',
      code: 'INVALID_SESSION_ID'
    });
  }

  next();
}

module.exports = { validateChatInput };