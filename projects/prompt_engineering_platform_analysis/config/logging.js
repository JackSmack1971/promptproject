const Sentry = require('@sentry/node');
const { Integrations } = require('@sentry/tracing');

// Configure Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN || 'YOUR_SENTRY_DSN_HERE', // Replace with your actual DSN
  integrations: [
    new Integrations.Http({ tracing: true }),
    // Add other integrations as needed, e.g., for Express, MongoDB etc.
  ],
  tracesSampleRate: 1.0, // Adjust this value in production
  environment: process.env.NODE_ENV || 'development',
});

// Simple logger utility that also sends events to Sentry for ERROR and higher
const logger = {
  info: (message, context) => {
    console.log(`INFO: ${message}`, context || '');
    // Sentry.captureMessage(`INFO: ${message}`, 'info'); // Uncomment if you want to send INFO logs to Sentry
  },
  warn: (message, context) => {
    console.warn(`WARN: ${message}`, context || '');
    Sentry.captureMessage(`WARN: ${message}`, 'warning');
  },
  error: (message, error, context) => {
    console.error(`ERROR: ${message}`, error, context || '');
    Sentry.captureException(error, {
      level: 'error',
      extra: { message, context },
    });
  },
  debug: (message, context) => {
    console.debug(`DEBUG: ${message}`, context || '');
    // Sentry.captureMessage(`DEBUG: ${message}`, 'debug'); // Uncomment if you want to send DEBUG logs to Sentry
  },
};

module.exports = { Sentry, logger };