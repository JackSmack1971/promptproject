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
  connectTimeout: 5000, // Reduced from 10000ms for faster failure detection
  lazyConnect: true,
  maxRetriesPerRequest: 1, // Reduced from 3 to prevent resource exhaustion
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxLoadingTimeout: 3000,
  maxmemoryPolicy: 'allkeys-lru', // Memory management for high-load scenarios
  // Connection pooling optimization
  family: 4,
  keepAlive: true,
  // Enhanced connection pool settings
  retryDelayOnClusterDown: 300,
  enableOfflineQueue: false, // Prevent queue buildup during connection issues
  readOnly: false,
  stringNumbers: false,
  // Security - connection health monitoring
  maxRetriesPerRequest: 1,
  // Performance tuning
  commandTimeout: 5000,
  reconnectOnError: (error) => {
    const targetMsg = 'READONLY';
    if (error.message.includes(targetMsg)) {
      return true;
    }
    return false;
  },
  // Security - disable potentially dangerous commands
  disableResubscribing: false,
  // Enable TLS hostname verification
  checkServerIdentity: (servername, cert) => {
    if (process.env.NODE_ENV === 'production') {
      // Strict hostname verification in production
      // Check both Common Name (CN) and Subject Alternative Names (SAN)
      const cn = cert.subject.CN;
      const san = cert.subjectaltname;
      
      // Check if hostname matches CN
      const cnMatches = cn === servername;
      
      // Check if hostname matches any SAN entries
      let sanMatches = false;
      if (san) {
        // Parse SAN entries (format: "DNS:hostname, DNS:hostname2, IP:1.2.3.4")
        const sanEntries = san.split(',').map(entry => entry.trim());
        sanMatches = sanEntries.some(entry => {
          if (entry.startsWith('DNS:')) {
            const dnsName = entry.substring(4);
            // Support wildcard certificates
            if (dnsName.startsWith('*.')) {
              const domain = dnsName.substring(2);
              return servername.endsWith(domain);
            }
            return dnsName === servername;
          }
          return false;
        });
      }
      
      // If neither CN nor SAN matches, reject the certificate
      if (!cnMatches && !sanMatches) {
        throw new Error(`Certificate does not match expected hostname (${servername}). CN: ${cn}, SAN: ${san}`);
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
      // More secure fallback: fail closed or use in-memory progressive tracking
      if (process.env.NODE_ENV === 'production') {
        // In production, fail closed during Redis outages to prevent abuse
        return res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'Rate limiting service is currently unavailable. Please try again later.',
          retryAfter: 300 // 5 minutes
        });
      } else {
        // In development, use basic rate limiting as fallback
        const fallbackLimiter = createRateLimit(baseWindowMs, Math.max(1, Math.floor(baseMax / 2)), 'Rate limiting temporarily unavailable');
        return fallbackLimiter(req, res, next);
      }
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