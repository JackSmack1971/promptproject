const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

// Security logger for sanitized error messages
const securityLogger = {
  error: (message, error, context = {}) => {
    const sanitizedError = {
      message: error.message || 'Unknown error',
      code: error.code || 'UNKNOWN',
      type: error.constructor.name || 'Error',
      sanitized: true
    };
    
    console.error({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      component: 'rateLimitMiddleware',
      message,
      error: sanitizedError,
      context: {
        ...context,
        ip: context.ip ? '[REDACTED]' : undefined,
        userAgent: context.userAgent ? '[REDACTED]' : undefined
      }
    });
  },
  
  warn: (message, context = {}) => {
    console.warn({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      component: 'rateLimitMiddleware',
      message,
      context: {
        ...context,
        ip: context.ip ? '[REDACTED]' : undefined,
        userAgent: context.userAgent ? '[REDACTED]' : undefined
      }
    });
  }
};

// Redis client for distributed rate limiting with security
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: 1,
  lazyConnect: true,
  tls: process.env.REDIS_TLS === 'true' ? {
    servername: process.env.REDIS_HOST,
    rejectUnauthorized: true,
    ca: process.env.REDIS_CA_CERT ? Buffer.from(process.env.REDIS_CA_CERT, 'base64') : undefined,
    cert: process.env.REDIS_CLIENT_CERT ? Buffer.from(process.env.REDIS_CLIENT_CERT, 'base64') : undefined,
    key: process.env.REDIS_CLIENT_KEY ? Buffer.from(process.env.REDIS_CLIENT_KEY, 'base64') : undefined
  } : undefined,
  connectTimeout: 5000,
  maxRetriesPerRequest: 1,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxLoadingTimeout: 3000,
  maxmemoryPolicy: 'allkeys-lru',
  family: 4,
  keepAlive: true,
  retryDelayOnClusterDown: 300,
  enableOfflineQueue: false,
  readOnly: false,
  stringNumbers: false,
  commandTimeout: 5000,
  reconnectOnError: (error) => {
    const targetMsg = 'READONLY';
    return error.message.includes(targetMsg);
  },
  checkServerIdentity: (servername, cert) => {
    if (process.env.NODE_ENV === 'production') {
      const cn = cert.subject.CN;
      const san = cert.subjectaltname;
      const cnMatches = cn === servername;
      
      let sanMatches = false;
      if (san) {
        const sanEntries = san.split(',').map(entry => entry.trim());
        sanMatches = sanEntries.some(entry => {
          if (entry.startsWith('DNS:')) {
            const dnsName = entry.substring(4);
            if (dnsName.startsWith('*.')) {
              const domain = dnsName.substring(2);
              return servername.endsWith(domain);
            }
            return dnsName === servername;
          }
          return false;
        });
      }
      
      if (!cnMatches && !sanMatches) {
        throw new Error(`Certificate does not match expected hostname (${servername}(`)${servername})`);
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
      return req.path === '/health' || req.path === '/ping';
    }
  });
};

// General API rate limit
const apiLimiter = createRateLimit(
  15 * 60 * 1000,
  100,
  'Too many API requests, please try again later'
);

// Strict rate limiting for authentication endpoints
const authLimiter = createRateLimit(
  15 * 60 * 1000,
  5,
  'Too many authentication attempts, please try again later',
  (req) => {
    return `${req.ip || 'unknown'}-${req.body?.username || 'anonymous'}`;
  }
);

// Rate limiting for AI generation endpoints
const aiLimiter = createRateLimit(
  60 * 60 * 1000,
  50,
  'Too many AI generation requests, please try again later',
  (req) => {
    return req.user?.id || req.ip || 'anonymous';
  }
);

// Rate limiting for prompt template modifications (admin only)
const adminLimiter = createRateLimit(
  60 * 60 * 1000,
  20,
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
      const currentAttempts = parseInt(await redisClient.get(key) || '0');
      const windowMs = baseWindowMs * Math.pow(multiplier, currentAttempts);
      const max = Math.max(1, Math.floor(baseMax / Math.pow(multiplier, currentAttempts)));
      
      const limiter = createRateLimit(windowMs, max, 'Too many failed attempts');
      
      rtReachL)=>AA+1;wdClxkMwM)wA.S