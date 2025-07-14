const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./projects/prompt_engineering_platform_analysis/src/auth/auth');
const { authenticateToken } = require('./projects/prompt_engineering_platform_analysis/src/middleware/authMiddleware');
const { apiLimiter, abuseDetector } = require('./projects/prompt_engineering_platform_analysis/src/middleware/rateLimitMiddleware');
const promptInjectionMiddleware = require('./projects/prompt_engineering_platform_analysis/src/middleware/promptInjectionMiddleware');
const GDPRMiddleware = require('./projects/prompt_engineering_platform_analysis/src/middleware/gdprMiddleware');
const auditLogger = require('./projects/prompt_engineering_platform_analysis/src/middleware/auditLogger');
const redisClient = require('./projects/prompt_engineering_platform_analysis/config/redis');
const { Sentry, logger } = require('./projects/prompt_engineering_platform_analysis/config/logging');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy configuration for correct IP detection
app.set('trust proxy', 1); // Trust first proxy

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Sentry request handler must be the first middleware
app.use(Sentry.Handlers.requestHandler());

// GDPR headers and tracking
app.use(GDPRMiddleware.addGDPRHeaders);
app.use(GDPRMiddleware.trackDataProcessing);

// Audit logging for all requests
app.use(auditLogger.requestLogger);
app.use(auditLogger.securityLogger);

// Body parser with security limits
app.use(bodyParser.json({
  limit: '10mb',
  strict: true,
  type: ['application/json']
}));

// Prompt injection detection
app.use(promptInjectionMiddleware);

// Global rate limiting
app.use('/api', apiLimiter);

// Abuse detection middleware
app.use(abuseDetector);

// Middleware to attach Redis client to request
app.use((req, res, next) => {
  req.redisClient = redisClient;
  next();
});

// Authentication routes
app.use('/api/auth', authRoutes);

// Prompt Management API routes
const promptRoutes = require('./projects/prompt_engineering_platform_analysis/src/routes/promptRoutes');
app.use('/api/prompts', promptRoutes);

// AI Model Integration routes
const aiRoutes = require('./projects/prompt_engineering_platform_analysis/src/routes/aiRoutes');
app.use('/api/ai', aiRoutes);

// GDPR compliance routes
app.post('/api/gdpr/data-export', authenticateToken, GDPRMiddleware.handleDataExport);
app.post('/api/gdpr/data-deletion', authenticateToken, GDPRMiddleware.handleDataDeletion);
app.post('/api/gdpr/consent-update', authenticateToken, GDPRMiddleware.handleConsentUpdate);

// Protected route example
app.get('/api/protected', authenticateToken, (req, res) => {
  res.status(200).json({ message: 'This is a protected route', user: req.user });
});

// Test logging route
app.get('/api/test-logging', (req, res) => {
  logger.info('This is an INFO level log message');
  logger.warn('This is a WARN level log message');
  logger.debug('This is a DEBUG level log message');
  logger.error('This is an ERROR level log message', new Error('Test error'));

  res.status(200).json({ message: 'Check logs for test messages' });
});

// Sentry error handler must be before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// Generic error handler
app.use((err, req, res, next) => {
  // Log detailed error internally
  logger.error('Unhandled error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Send generic error response to client
  const errorResponse = {
    error: 'Internal Server Error',
    message: 'Something went wrong. Please try again later.',
    timestamp: new Date().toISOString(),
    requestId: req.id || 'unknown'
  };

  // Only include Sentry ID in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.sentry = res.sentry;
  }

  res.status(500).json(errorResponse);
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});