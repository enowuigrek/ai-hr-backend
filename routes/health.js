const express = require('express');
const router = express.Router();
const { getMetrics, metrics } = require('../middleware/performance');
const { getRateLimitStats } = require('../middleware/rateLimit');

// NOWE: Import hrService do zarządzania trybem
const { getCurrentMode, setTestMode } = require('../services/hrService');

// Main status endpoint
router.get('/', (req, res) => {
  const uptime = Date.now() - metrics.startTime;
  
  res.json({ 
    message: 'AI HR Backend is running!', 
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '4.0.0',
    features: ['OpenAI GPT-4o-mini', 'PostgreSQL', 'Enhanced Security', 'Performance Monitoring', 'Frontend Integration'],
    security: ['Advanced Rate Limiting', 'Request Sanitization', 'CORS Hardening', 'Security Headers'],
    performance: {
      uptime: `${Math.floor(uptime / 1000)}s`,
      totalRequests: metrics.requests,
      averageResponseTime: `${Math.round(metrics.averageResponseTime)}ms`,
      errorRate: `${((metrics.errors / metrics.requests) * 100).toFixed(2)}%`
    },
    endpoints: [
      'POST /api/chat',
      'GET /api/sessions', 
      'POST /api/chat/session',
      'GET /api/chat/session/:sessionId',
      'GET /api/chat/history/:sessionId',
      'PATCH /api/chat/session/:sessionId',
      'DELETE /api/chat/session/:sessionId',
      'GET /api/metrics',
      'GET /api/admin/mode',
      'POST /api/admin/mode'
    ],
    database: 'connected',
    frontend: 'integrated'
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: 'postgresql',
    ai: 'openai-gpt-4o-mini',
    features: 'enhanced-security-performance-frontend',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }
  });
});

// Metrics endpoint
router.get('/metrics', (req, res) => {
  const performanceMetrics = getMetrics();
  const rateLimitStats = getRateLimitStats();
  
  res.json({
    ...performanceMetrics,
    rateLimiting: rateLimitStats
  });
});

// NOWE: Admin endpoint - sprawdź aktualny tryb
router.get('/api/admin/mode', (req, res) => {
  try {
    const currentMode = getCurrentMode();
    
    res.json({
      success: true,
      mode: {
        testMode: currentMode.testMode,
        description: currentMode.testMode ? 'TESTOWY (99 dni urlopu, czekoladowe monety)' : 'PRODUKCYJNY (prawdziwe dane HR)',
        knowledgeFile: currentMode.knowledgeFile,
        knowledgeSize: `${Math.round(currentMode.knowledgeSize / 1000)}k znaków`,
        loaded: currentMode.loaded
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin mode check error:', error);
    res.status(500).json({
      error: 'Nie można sprawdzić trybu',
      code: 'MODE_CHECK_ERROR'
    });
  }
});

// NOWE: Admin endpoint - przełącz tryb
router.post('/api/admin/mode', (req, res) => {
  try {
    const { testMode } = req.body;
    
    // Walidacja
    if (typeof testMode !== 'boolean') {
      return res.status(400).json({
        error: 'Parametr testMode musi być boolean (true/false)',
        code: 'INVALID_TEST_MODE',
        example: { testMode: true }
      });
    }
    
    // Przełącz tryb
    const success = setTestMode(testMode);
    
    if (!success) {
      return res.status(500).json({
        error: 'Nie można przełączyć trybu',
        code: 'MODE_SWITCH_ERROR'
      });
    }
    
    // Sprawdź nowy stan
    const newMode = getCurrentMode();
    
    res.json({
      success: true,
      message: `Tryb przełączony na: ${testMode ? 'TESTOWY' : 'PRODUKCYJNY'}`,
      mode: {
        testMode: newMode.testMode,
        description: newMode.testMode ? 'TESTOWY (99 dni urlopu, czekoladowe monety)' : 'PRODUKCYJNY (prawdziwe dane HR)',
        knowledgeFile: newMode.knowledgeFile,
        knowledgeSize: `${Math.round(newMode.knowledgeSize / 1000)}k znaków`
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Admin mode switch error:', error);
    res.status(500).json({
      error: 'Nie można przełączyć trybu',
      code: 'MODE_SWITCH_ERROR'
    });
  }
});

module.exports = router;