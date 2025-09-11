const express = require('express');
const router = express.Router();
const { getMetrics, metrics } = require('../middleware/performance');
const { getRateLimitStats } = require('../middleware/rateLimit');

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
      'GET /api/metrics'
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

module.exports = router;