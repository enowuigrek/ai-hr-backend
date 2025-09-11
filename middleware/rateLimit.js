const { SECURITY_CONFIG } = require('../config/security');

// In-memory rate limiting store
const rateLimitStore = new Map();

const rateLimitMiddleware = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowStart = now - SECURITY_CONFIG.RATE_LIMIT_WINDOW;
  
  // Clean old entries
  for (const [ip, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(ip);
    }
  }
  
  // Get or create client data
  let clientData = rateLimitStore.get(clientIp);
  if (!clientData || clientData.resetTime < now) {
    clientData = {
      count: 0,
      resetTime: now + SECURITY_CONFIG.RATE_LIMIT_WINDOW,
      firstRequest: now
    };
    rateLimitStore.set(clientIp, clientData);
  }
  
  // Increment request count
  clientData.count++;
  
  // Check if limit exceeded
  if (clientData.count > SECURITY_CONFIG.RATE_LIMIT_MAX) {
    console.log(`Rate limit exceeded for IP: ${clientIp}, Count: ${clientData.count}`);
    
    return res.status(429).json({
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
    });
  }
  
  // Add rate limit headers
  res.set({
    'X-RateLimit-Limit': SECURITY_CONFIG.RATE_LIMIT_MAX,
    'X-RateLimit-Remaining': Math.max(0, SECURITY_CONFIG.RATE_LIMIT_MAX - clientData.count),
    'X-RateLimit-Reset': new Date(clientData.resetTime).toISOString()
  });
  
  next();
};

// Get rate limit stats
const getRateLimitStats = () => {
  return {
    activeIPs: rateLimitStore.size,
    maxRequestsPerWindow: SECURITY_CONFIG.RATE_LIMIT_MAX,
    windowSizeMs: SECURITY_CONFIG.RATE_LIMIT_WINDOW
  };
};

module.exports = { 
  rateLimitMiddleware,
  getRateLimitStats
};