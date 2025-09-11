// Performance metrics storage
const metrics = {
  requests: 0,
  errors: 0,
  totalResponseTime: 0,
  averageResponseTime: 0,
  startTime: Date.now()
};

// Performance monitoring middleware
const performanceMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Increment request counter
  metrics.requests++;
  
  // Override res.json to capture response time
  const originalJson = res.json;
  res.json = function(data) {
    const responseTime = Date.now() - startTime;
    metrics.totalResponseTime += responseTime;
    metrics.averageResponseTime = metrics.totalResponseTime / metrics.requests;
    
    // Add performance headers
    res.set({
      'X-Response-Time': `${responseTime}ms`,
      'X-Request-ID': `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });
    
    return originalJson.call(this, data);
  };
  
  next();
};

// Request sanitization middleware
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    // Remove potentially dangerous characters
    const sanitize = (obj) => {
      for (let key in obj) {
        if (typeof obj[key] === 'string') {
          // Remove null bytes, control characters, and normalize whitespace
          obj[key] = obj[key]
            .replace(/\0/g, '') // Remove null bytes
            .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters except newlines/tabs
            .trim();
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };
    
    sanitize(req.body);
  }
  next();
};

// Increment error counter
const incrementErrorCount = () => {
  metrics.errors++;
};

// Get current metrics
const getMetrics = () => {
  const uptime = Date.now() - metrics.startTime;
  
  return {
    performance: {
      uptime: uptime,
      totalRequests: metrics.requests,
      totalErrors: metrics.errors,
      averageResponseTime: metrics.averageResponseTime,
      errorRate: metrics.errors / metrics.requests || 0,
      requestsPerMinute: metrics.requests / (uptime / 60000) || 0
    },
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  performanceMiddleware,
  sanitizeInput,
  incrementErrorCount,
  getMetrics,
  metrics
};