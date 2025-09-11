const express = require('express');
const router = express.Router();
const { rateLimitMiddleware } = require('../middleware/rateLimit');
const { SECURITY_CONFIG } = require('../config/security');
const dbService = require('../services/dbService');
const { incrementErrorCount } = require('../middleware/performance');

// GET /api/sessions - Get all sessions
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100
    const offset = Math.max(parseInt(req.query.offset) || 0, 0); // Min 0
    
    const result = await dbService.getAllSessions(limit, offset);
    
    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sessions retrieval error:', error);
    incrementErrorCount();
    res.status(500).json({
      error: 'Failed to retrieve sessions',
      code: 'SESSIONS_ERROR'
    });
  }
});

// POST /api/sessions - Create new session
router.post('/', rateLimitMiddleware, async (req, res) => {
  try {
    const { sessionName } = req.body;
    
    // Validate session name
    if (sessionName && (typeof sessionName !== 'string' || sessionName.length > SECURITY_CONFIG.MAX_SESSION_NAME_LENGTH)) {
      return res.status(400).json({
        error: `Session name too long (max ${SECURITY_CONFIG.MAX_SESSION_NAME_LENGTH} characters)`,
        code: 'INVALID_SESSION_NAME'
      });
    }
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await dbService.createSession(sessionId, sessionName);
    
    res.json({
      success: true,
      sessionId: sessionId,
      sessionName: sessionName || `Sesja ${new Date().toLocaleDateString('pl-PL')}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Session creation error:', error);
    incrementErrorCount();
    res.status(500).json({
      error: 'Failed to create session',
      code: 'SESSION_ERROR'
    });
  }
});

// GET /api/sessions/:sessionId - Get session info
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId || sessionId.length > 100) {
      return res.status(400).json({
        error: 'Invalid session ID',
        code: 'INVALID_SESSION_ID'
      });
    }
    
    const sessionInfo = await dbService.getSessionInfo(sessionId);
    
    if (!sessionInfo) {
      return res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      session: sessionInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Session info error:', error);
    incrementErrorCount();
    res.status(500).json({
      error: 'Failed to retrieve session info',
      code: 'SESSION_INFO_ERROR'
    });
  }
});

// GET /api/sessions/:sessionId/history - Get conversation history
router.get('/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
    const offset = Math.max(parseInt(req.query.offset) || 0, 0); // Min 0
    
    if (!sessionId || sessionId.length > 100) {
      return res.status(400).json({
        error: 'Invalid session ID',
        code: 'INVALID_SESSION_ID'
      });
    }
    
    const result = await dbService.getConversationHistory(sessionId, limit, offset);
    
    res.json({
      success: true,
      sessionId: sessionId,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('History retrieval error:', error);
    incrementErrorCount();
    res.status(500).json({
      error: 'Failed to retrieve history',
      code: 'HISTORY_ERROR'
    });
  }
});

// PATCH /api/sessions/:sessionId - Update session name
router.patch('/:sessionId', rateLimitMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sessionName } = req.body;
    
    if (!sessionId || sessionId.length > 100) {
      return res.status(400).json({
        error: 'Invalid session ID',
        code: 'INVALID_SESSION_ID'
      });
    }
    
    if (!sessionName || typeof sessionName !== 'string' || sessionName.trim().length === 0) {
      return res.status(400).json({
        error: 'Session name is required',
        code: 'INVALID_SESSION_NAME'
      });
    }
    
    if (sessionName.length > SECURITY_CONFIG.MAX_SESSION_NAME_LENGTH) {
      return res.status(400).json({
        error: `Session name too long (max ${SECURITY_CONFIG.MAX_SESSION_NAME_LENGTH} characters)`,
        code: 'SESSION_NAME_TOO_LONG'
      });
    }
    
    const success = await dbService.updateSessionName(sessionId, sessionName);
    
    if (!success) {
      return res.status(500).json({
        error: 'Failed to update session',
        code: 'SESSION_UPDATE_ERROR'
      });
    }
    
    res.json({
      success: true,
      message: 'Session name updated',
      sessionId: sessionId,
      sessionName: sessionName.trim(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Session update error:', error);
    incrementErrorCount();
    res.status(500).json({
      error: 'Failed to update session',
      code: 'SESSION_UPDATE_ERROR'
    });
  }
});

// DELETE /api/sessions/:sessionId - Delete session
router.delete('/:sessionId', rateLimitMiddleware, validateSessionId, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const success = await dbService.deactivateSession(sessionId);
    
    if (!success) {
      return res.status(500).json({
        error: 'Failed to delete session',
        code: 'DELETE_ERROR'
      });
    }
    
    res.json({
      success: true,
      message: 'Session deleted successfully',
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Session deletion error:', error);
    incrementErrorCount();
    res.status(500).json({
      error: 'Failed to delete session',
      code: 'DELETE_ERROR'
    });
  }
});

module.exports = router;