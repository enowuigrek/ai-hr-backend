const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

// Import configurations
const { HELMET_CONFIG, CORS_CONFIG, SECURITY_CONFIG } = require('./config/security');
const { initializeDatabase } = require('./config/database');

// Import middleware
const { performanceMiddleware, sanitizeInput, incrementErrorCount } = require('./middleware/performance');

// Import routes
const chatRoutes = require('./routes/chat');
const sessionsRoutes = require('./routes/sessions');
const healthRoutes = require('./routes/health');

const app = express();
const port = process.env.PORT || 3000;

// Initialize database on startup
initializeDatabase();

// Trust proxy if in production (for accurate IP addresses behind reverse proxy)
if (SECURITY_CONFIG.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet(HELMET_CONFIG));
app.use(cors(CORS_CONFIG));

// Request parsing with size limits
app.use(express.json({ 
  limit: '1mb',
  strict: true,
  type: 'application/json'
}));

// Custom middleware
app.use(sanitizeInput);
app.use(performanceMiddleware);

// Routes
app.use('/', healthRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sessions', sessionsRoutes);

// Backwards compatibility routes (old API structure)
app.use('/api/chat/session', sessionsRoutes);
app.use('/api/chat/history/:sessionId', (req, res, next) => {
  // Redirect to new structure
  req.url = `/${req.params.sessionId}/history`;
  sessionsRoutes(req, res, next);
});

// Serve static files from React build (Frontend Integration)
if (process.env.NODE_ENV === 'production') {
  // Serve static files from dist directory
  app.use(express.static(path.join(__dirname, 'dist')));
  
  // Handle React routing - send all non-API requests to React
  app.get('*', (req, res, next) => {
    // Skip API routes and health checks
    if (req.path.startsWith('/api/') || 
        req.path.startsWith('/health') || 
        req.path.startsWith('/metrics') ||
        req.path === '/') {
      return next();
    }
    
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  incrementErrorCount();
  
  // Don't leak error details in production
  const isDev = process.env.NODE_ENV !== 'production';
  
  res.status(500).json({
    error: 'Internal server error',
    code: 'UNHANDLED_ERROR',
    ...(isDev && { details: err.message })
  });
});

// 404 handler for API routes only
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    code: 'NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'POST /api/chat',
      'GET /api/sessions',
      'POST /api/sessions',
      'GET /api/sessions/:sessionId',
      'GET /api/sessions/:sessionId/history',
      'PATCH /api/sessions/:sessionId',
      'DELETE /api/sessions/:sessionId',
      'GET /',
      'GET /health',
      'GET /metrics'
    ]
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  const { pool } = require('./config/database');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database pool...');
  const { pool } = require('./config/database');
  await pool.end();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  incrementErrorCount();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  incrementErrorCount();
});

app.listen(port, () => {
  console.log(`🚀 AI HR Backend v4.0.0 running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${port}/api/chat`);
  console.log(`📈 Metrics: http://localhost:${port}/metrics`);
  console.log(`🔒 Security: Enhanced rate limiting, CORS, sanitization`);
  console.log(`⚡ Performance: Connection pooling, monitoring, compression`);
  console.log(`📊 Features: OpenAI GPT-4o-mini, PostgreSQL, Advanced Session Management`);
  console.log(`🌐 Frontend: Integrated static file serving`);
  console.log(`🛡️ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: PostgreSQL with connection pooling`);
  console.log(`🤖 AI: OpenAI API configured and ready`);
  console.log(`📁 Project structure: Modularized and organized`);
});