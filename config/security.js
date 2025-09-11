const SECURITY_CONFIG = {
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX: process.env.NODE_ENV === 'production' ? 30 : 60, // Stricter in production
  MAX_MESSAGE_LENGTH: 1000,
  MAX_SESSION_NAME_LENGTH: 100,
  ALLOWED_ORIGINS: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['*'],
  TRUST_PROXY: process.env.NODE_ENV === 'production'
};

const HELMET_CONFIG = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.openai.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disabled for API compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
};

const CORS_CONFIG = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (SECURITY_CONFIG.ALLOWED_ORIGINS.includes('*') || 
        SECURITY_CONFIG.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 hours
};

module.exports = {
  SECURITY_CONFIG,
  HELMET_CONFIG,
  CORS_CONFIG
};