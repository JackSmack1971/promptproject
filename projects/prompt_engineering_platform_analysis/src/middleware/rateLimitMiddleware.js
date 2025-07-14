const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

// Redis client for distributed rate limiting with security
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: 1, // Use separate DB for rate limiting
  lazyConnect: true,
  // Security configurations
  tls: process.env.REDIS_TLS === 'true' ? {
    servername: process.env.REDIS_HOST,
    rejectUnauthorized: true,
    ca: process.env.REDIS_CA_CERT ? Buffer.from(process.env.REDIS_CA_CERT, 'base64') : undefined,
    cert: process.env.REDIS_CLIENT_CERT ? Buffer.from(process.env.REDIS_CLIENT_CERT, 'base64') : undefined,
    key: process.env.REDIS_CLIENT_KEY ? Buffer.from(process.env.REDIS_CLIENT_KEY, 'base64') : undefined
  } : undefined,
  connectTimeout: 10000,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxLoadingTimeout: 3000,
  // Connection pooling
  family: 4,
  keepAlive: true,
  // Security - disable potentially dangerous commands
  disableResubscribing: false,
  // Enable TLS hostname verification
  checkServerIdentity: (servername, cert) => {
    if (process.env.NODE_ENV === 'production') {
      // Strict hostname verification in production
      if (cert.subject.CN !== servername) {
        throw new Error(`Certificate CN (${cert.subject.CN}) does not match expected hostname (${servername})`);
      }
    }
    return undefined;
  }
});

// General API rate limiting
const createRateLimit = (windowMs, max, message, keyGenerator) => {
  return rateLimit({
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:',
    }),
    windowMs,
    max,
    message: {
      error: 'Too many requests',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyGenerator || ((req) => {
      return req.ip || req.connection.remoteAddress || 'unknown';
    }),
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/ping';
    }
  });
};

// General API rate limit
const apiLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many API requests, please try again later'
);

// Strict rate limiting for authentication endpoints
const authLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts per window
  'Too many authentication attempts, please try again later',
  (req) => {
    // Use IP + username combination for more targeted limiting
    return `${req.ip || 'unknown'}-${req.body?.username || 'anonymous'}`;
  }
);

// Rate limiting for AI generation endpoints
const aiLimiter = createRateLimit(
  60 * 60 * 1000, // 1 hour
  50, // 50 requests per hour
  'Too many AI generation requests, please try again later',
  (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.id || req.ip || 'anonymous';
  }
);

// Rate limiting for prompt template modifications (admin only)
const adminLimiter = createRateLimit(
  60 * 60 * 1000, // 1 hour
  20, // 20 modifications per hour
  'Too many admin operations, please try again later',
  (req) => {
    return req.user?.id || req.ip || 'anonymous';
  }
);

// Progressive rate limiting based on failed attempts - Redis-based
const createProgressiveLimiter = (baseWindowMs, baseMax, multiplier) => {
  const PROGRESSIVE_KEY_PREFIX = 'progressive:';
  
  return async (req, res, next) => {
    const key = `${PROGRESSIVE_KEY_PREFIX}${req.ip || req.connection.remoteAddress || 'unknown'}`;
    
    try {
      // Get current attempts from Redis
      const currentAttempts = parseInt(await redisClient.get(key) || '0');
      
      const windowMs = baseWindowMs * Math.pow(multiplier, currentAttempts);
      const max = Math.max(1, Math.floor(baseMax / Math.pow(multiplier, currentAttempts)));
      
      const limiter = createRateLimit(windowMs, max, 'Too many failed attempts');
      
      // Custom onLimitReached to track failed attempts
      limiter.onLimitReached = async (req, res, options) => {
        const newAttempts = currentAttempts + 1;
        await redisClient.setex(key, Math.ceil(windowMs / 1000), newAttempts.toString());
        
        // Log the progressive blocking
        console.warn('Progressive rate limit triggered:', {
          ip: req.ip,
          attempts: newAttempts,
          windowMs,
          max
        });
      };
      
      return limiter(req, res, next);
    } catch (error) {
      console.error('Error in progressive rate limiting:', error);
      // Fallback to basic rate limiting on Redis failure
      const fallbackLimiter = createRateLimit(baseWindowMs, baseMax, 'Rate limiting temporarily unavailable');
      return fallbackLimiter(req, res, next);
    }
  };
};

// IP-based abuse detection
const abuseDetector = async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  try {
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /bot|spider|crawler/i, // Known bot patterns
      /sql|script|javascript/i, // Injection attempts
      /\.\.\//, // Directory traversal
      /union.*select|drop.*table/i, // SQL injection
    ];
    
    const userAgent = req.get('User-Agent') || '';
    const url = req.originalUrl || '';
    
    const isSuspicious = suspiciousPatterns.some(pattern => 
      pattern.test(userAgent) || pattern.test(url) || pattern.test(JSON.stringify(req.body || {}))
    );
    
    if (isSuspicious) {
      console.warn('Suspicious request detected:', {
        ip,
        userAgent,
        url,
        body: req.body,
        timestamp: new Date().toISOString()
      });
      
      // Log to security monitoring
      await redisClient.lpush(
        'security:abuse',
        JSON.stringify({
          ip,
          userAgent,
          url,
          method: req.method,
          timestamp: Date.now()
        })
      );
      
      // Keep only last 1000 entries
      await redisClient.ltrim('security:abuse', 0, 999);
    }
    
    next();
  } catch (error) {
    console.error('Error in abuse detection:', error);
    next(); // Continue even if detection fails
  }
};

// Cleanup function for graceful shutdown
const cleanup = async () => {
  try {
    await redisClient.quit();
  } catch (error) {
    console.error('Error cleaning up rate limiting:', error);
  }
};

module.exports = {
  apiLimiter,
  authLimiter,
  aiLimiter,
  adminLimiter,
  createProgressiveLimiter,
  abuseDetector,
  cleanup,
  redisClient
};