/**
 * Security Configuration
 * Centralizes all security-related settings and constants
 */

const securityConfig = {
  // Authentication settings
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: '1h',
      refreshTokenExpiry: 30 * 24 * 60 * 60 * 1000, // 30 days
      algorithm: 'HS256'
    },
    bcrypt: {
      saltRounds: 12
    },
    session: {
      maxConcurrent: 5,
      timeout: 30 * 60 * 1000, // 30 minutes
      absoluteTimeout: 24 * 60 * 60 * 1000 // 24 hours
    },
    password: {
      minLength: 8,
      minScore: 3, // zxcvbn score 0-4
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: true,
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
      historyCount: 5 // Prevent reuse of last 5 passwords
    }
  },

  // Rate limiting settings
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: {
      default: 100,
      auth: 5, // 5 attempts per window for auth endpoints
      api: 100,
      fileUpload: 10
    },
    skipSuccessfulRequests: false
  },

  // Input validation limits
  validation: {
    maxUsernameLength: 50,
    maxPasswordLength: 128,
    maxPromptLength: 8000,
    maxDescriptionLength: 1000,
    maxTags: 10,
    maxTagLength: 50,
    allowedFileTypes: ['txt', 'json', 'md', 'py', 'js', 'ts'],
    maxFileSize: 5 * 1024 * 1024 // 5MB
  },

  // Security headers
  headers: {
    csp: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }
  },

  // Database security
  database: {
    maxConnections: 20,
    connectionTimeout: 30000,
    idleTimeout: 30000,
    statementTimeout: 30000,
    queryTimeout: 30000
  },

  // Logging levels
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    audit: {
      enabled: true,
      events: ['auth', 'authorization', 'data_access', 'data_modification', 'security', 'api']
    }
  },

  // Security monitoring
  monitoring: {
    alertThresholds: {
      failedLogins: 5,
      suspiciousActivity: 10,
      rateLimitExceeded: 50,
      largePayloads: 5
    },
    cleanup: {
      auditLogRetention: 90, // days
      sessionRetention: 30, // days
      loginAttemptRetention: 30 // days
    }
  },

  // Environment checks
  environment: {
    requiredEnvVars: [
      'JWT_SECRET',
      'DATABASE_URL',
      'REDIS_URL',
      'NODE_ENV'
    ],
    securityEnvVars: [
      'SENTRY_DSN',
      'ENCRYPTION_KEY',
      'API_KEY_SECRET'
    ]
  }
};

// Validation functions
securityConfig.validate = {
  isValidPassword: (password) => {
    if (!password || typeof password !== 'string') return false;
    if (password.length < securityConfig.auth.password.minLength) return false;
    
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    return (!securityConfig.auth.password.requireUppercase || hasUppercase) &&
           (!securityConfig.auth.password.requireLowercase || hasLowercase) &&
           (!securityConfig.auth.password.requireNumbers || hasNumbers) &&
           (!securityConfig.auth.password.requireSymbols || hasSymbols);
  },

  isValidUsername: (username) => {
    if (!username || typeof username !== 'string') return false;
    if (username.length > securityConfig.validation.maxUsernameLength) return false;
    return /^[a-zA-Z0-9_]+$/.test(username);
  },

  isValidEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
};

module.exports = securityConfig;