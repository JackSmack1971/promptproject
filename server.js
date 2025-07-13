const express = require('express');
const bodyParser = require('body-parser');
const authRoutes = require('./projects/prompt_engineering_platform_analysis/src/auth/auth');
const authenticateToken = require('./projects/prompt_engineering_platform_analysis/src/middleware/authMiddleware');
const redisClient = require('./projects/prompt_engineering_platform_analysis/config/redis');
const { Sentry, logger } = require('./projects/prompt_engineering_platform_analysis/config/logging');

const app = express();
const PORT = process.env.PORT || 3000;

// Sentry request handler must be the first middleware
app.use(Sentry.Handlers.requestHandler());
app.use(bodyParser.json());

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
  logger.error('Unhandled error occurred', err, { path: req.path, method: req.method });
  res.statusCode = 500;
  res.end(res.sentry + '\n');
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});