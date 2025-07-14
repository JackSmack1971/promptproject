const { logger } = require('../../config/logging');
const { v4: uuidv4 } = require('uuid');

/**
 * GDPR Compliance Middleware
 * Handles data privacy, consent, and user rights
 */
class GDPRMiddleware {
  constructor() {
    this.dataRetention = {
      logs: 30 * 24 * 60 * 60 * 1000, // 30 days
      userData: 365 * 24 * 60 * 60 * 1000, // 1 year
      temporaryData: 24 * 60 * 60 * 1000 // 24 hours
    };
  }

  // Generate correlation ID for tracking
  generateCorrelationId() {
    return uuidv4();
  }

  // Log GDPR-relevant events
  logGDPRActivity(req, action, data) {
    const logEntry = {
      type: 'GDPR',
      action,
      correlationId: req.correlationId || this.generateCorrelationId(),
      userId: req.user?.id || 'anonymous',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
      data: this.sanitizeLogData(data)
    };

    logger.info('GDPR Activity', logEntry);
  }

  // Sanitize sensitive data from logs
  sanitizeLogData(data) {
    if (!data) return {};
    
    const sanitized = { ...data };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'creditCard', 'ssn'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  // Handle data deletion requests
  async handleDataDeletion(req, res) {
    const { userId, email } = req.body;
    
    if (!userId && !email) {
      return res.status(400).json({
        error: 'User ID or email required for data deletion'
      });
    }

    this.logGDPRActivity(req, 'DATA_DELETION_REQUEST', { userId, email });

    try {
      // In production, this would:
      // 1. Remove user data from database
      // 2. Clear Redis cache
      // 3. Remove from analytics
      // 4. Send confirmation email
      
      res.json({
        message: 'Data deletion request received',
        requestId: req.correlationId,
        status: 'processing'
      });
    } catch (error) {
      logger.error('GDPR deletion error', error);
      res.status(500).json({
        error: 'Failed to process deletion request'
      });
    }
  }

  // Handle data export requests
  async handleDataExport(req, res) {
    const { userId } = req.user || {};
    
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required for data export'
      });
    }

    this.logGDPRActivity(req, 'DATA_EXPORT_REQUEST', { userId });

    try {
      // In production, this would gather:
      // 1. User profile data
      // 2. Prompt history
      // 3. API usage logs
      // 4. Any stored preferences
      
      const exportData = {
        userId,
        exportDate: new Date().toISOString(),
        data: {
          profile: { /* user profile */ },
          prompts: { /* prompt history */ },
          usage: { /* API usage */ },
          preferences: { /* user preferences */ }
        }
      };

      res.json(exportData);
    } catch (error) {
      logger.error('GDPR export error', error);
      res.status(500).json({
        error: 'Failed to generate data export'
      });
    }
  }

  // Handle consent management
  async handleConsentUpdate(req, res) {
    const { consents } = req.body;
    const { userId } = req.user || {};

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required for consent update'
      });
    }

    if (!consents || typeof consents !== 'object') {
      return res.status(400).json({
        error: 'Valid consent object required'
      });
    }

    this.logGDPRActivity(req, 'CONSENT_UPDATE', { userId, consents });

    try {
      // Update user consent preferences
      // In production, this would update the database
      
      res.json({
        message: 'Consent preferences updated',
        consents,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('GDPR consent error', error);
      res.status(500).json({
        error: 'Failed to update consent preferences'
      });
    }
  }

  // Data retention cleanup
  async cleanupExpiredData() {
    logger.info('Starting GDPR data cleanup');
    
    try {
      // In production, this would:
      // 1. Find expired user data
      // 2. Remove from database
      // 3. Clear caches
      // 4. Log cleanup activities
      
      logger.info('GDPR data cleanup completed');
    } catch (error) {
      logger.error('GDPR cleanup error', error);
    }
  }

  // Middleware to add GDPR headers
  addGDPRHeaders(req, res, next) {
    // Add correlation ID for tracking
    req.correlationId = this.generateCorrelationId();
    
    // Add GDPR-related response headers
    res.set({
      'X-Data-Retention-Policy': '30-days',
      'X-GDPR-Contact': 'privacy@company.com',
      'X-Request-ID': req.correlationId
    });
    
    next();
  }

  // Middleware to track data processing
  trackDataProcessing(req, res, next) {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const processingTime = Date.now() - startTime;
      
      this.logGDPRActivity(req, 'DATA_PROCESSING', {
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        processingTime,
        dataSize: res.get('content-length') || 0
      });
    });
    
    next();
  }
}

module.exports = new GDPRMiddleware();