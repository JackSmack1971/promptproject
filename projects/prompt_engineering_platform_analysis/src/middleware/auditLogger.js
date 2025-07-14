const { logger } = require('../../config/logging');
const { v4: uuidv4 } = require('uuid');

/**
 * Comprehensive Audit Logging System
 * Tracks all security-relevant events and user activities
 */
class AuditLogger {
  constructor() {
    this.logLevels = {
      INFO: 'info',
      WARN: 'warn',
      ERROR: 'error',
      CRITICAL: 'critical'
    };
    
    this.eventTypes = {
      AUTH: 'authentication',
      AUTHORIZATION: 'authorization',
      DATA_ACCESS: 'data_access',
      DATA_MODIFICATION: 'data_modification',
      SECURITY: 'security_event',
      SYSTEM: 'system_event',
      API: 'api_call',
      PROMPT: 'prompt_processing'
    };
  }

  // Generate unique request ID for correlation
  generateRequestId() {
    return uuidv4();
  }

  // Create structured log entry
  createLogEntry(type, level, message, context = {}) {
    return {
      timestamp: new Date().toISOString(),
      type,
      level,
      message,
      requestId: context.requestId || this.generateRequestId(),
      userId: context.userId || 'anonymous',
      ip: context.ip || 'unknown',
      userAgent: context.userAgent || 'unknown',
      endpoint: context.endpoint || 'unknown',
      method: context.method || 'unknown',
      duration: context.duration || 0,
      statusCode: context.statusCode || 0,
      metadata: this.sanitizeMetadata(context.metadata || {})
    };
  }

  // Sanitize sensitive data from logs
  sanitizeMetadata(metadata) {
    const sensitiveKeys = [
      'password', 'token', 'secret', 'key', 'apikey', 'authorization',
      'creditCard', 'ssn', 'dob', 'phone', 'email', 'address'
    ];
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sensitive => 
        lowerKey.includes(sensitive.toLowerCase())
      );
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  // Authentication events
  logAuthentication(userId, action, success, context = {}) {
    const logEntry = this.createLogEntry(
      this.eventTypes.AUTH,
      success ? this.logLevels.INFO : this.logLevels.WARN,
      `Authentication ${action}: ${success ? 'success' : 'failed'}`,
      { userId, ...context }
    );
    
    logger.info('AUDIT: Authentication', logEntry);
  }

  // Authorization events
  logAuthorization(userId, resource, action, granted, context = {}) {
    const logEntry = this.createLogEntry(
      this.eventTypes.AUTHORIZATION,
      granted ? this.logLevels.INFO : this.logLevels.WARN,
      `Authorization ${granted ? 'granted' : 'denied'} for ${action} on ${resource}`,
      { userId, resource, action, granted, ...context }
    );
    
    logger.info('AUDIT: Authorization', logEntry);
  }

  // Data access events
  logDataAccess(userId, dataType, action, recordCount, context = {}) {
    const logEntry = this.createLogEntry(
      this.eventTypes.DATA_ACCESS,
      this.logLevels.INFO,
      `Data access: ${action} ${recordCount} ${dataType} records`,
      { userId, dataType, action, recordCount, ...context }
    );
    
    logger.info('AUDIT: Data Access', logEntry);
  }

  // Data modification events
  logDataModification(userId, dataType, action, recordId, changes, context = {}) {
    const logEntry = this.createLogEntry(
      this.eventTypes.DATA_MODIFICATION,
      this.logLevels.INFO,
      `Data modification: ${action} on ${dataType} record ${recordId}`,
      { 
        userId, 
        dataType, 
        action, 
        recordId, 
        changes: this.sanitizeMetadata(changes), 
        ...context 
      }
    );
    
    logger.info('AUDIT: Data Modification', logEntry);
  }

  // Security events
  logSecurityEvent(type, severity, message, context = {}) {
    const logEntry = this.createLogEntry(
      this.eventTypes.SECURITY,
      severity,
      `Security event: ${message}`,
      context
    );
    
    if (severity === this.logLevels.CRITICAL || severity === this.logLevels.ERROR) {
      logger.error('AUDIT: Security Alert', logEntry);
    } else {
      logger.warn('AUDIT: Security Event', logEntry);
    }
  }

  // API call events
  logAPICall(userId, endpoint, method, statusCode, duration, context = {}) {
    const logEntry = this.createLogEntry(
      this.eventTypes.API,
      statusCode >= 400 ? this.logLevels.WARN : this.logLevels.INFO,
      `API call: ${method} ${endpoint} ${statusCode}`,
      { userId, endpoint, method, statusCode, duration, ...context }
    );
    
    logger.info('AUDIT: API Call', logEntry);
  }

  // Prompt processing events
  logPromptProcessing(userId, prompt, model, tokens, context = {}) {
    const logEntry = this.createLogEntry(
      this.eventTypes.PROMPT,
      this.logLevels.INFO,
      `Prompt processed: ${model} (${tokens} tokens)`,
      { 
        userId, 
        model, 
        tokens, 
        promptHash: this.hashPrompt(prompt),
        ...context 
      }
    );
    
    logger.info('AUDIT: Prompt Processing', logEntry);
  }

  // System events
  logSystemEvent(component, action, details, context = {}) {
    const logEntry = this.createLogEntry(
      this.eventTypes.SYSTEM,
      this.logLevels.INFO,
      `System event: ${component} ${action}`,
      { component, action, details, ...context }
    );
    
    logger.info('AUDIT: System Event', logEntry);
  }

  // Hash prompt for privacy
  hashPrompt(prompt) {
    if (!prompt) return null;
    
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);
  }

  // Rate limiting events
  logRateLimit(userId, ip, endpoint, limitType, context = {}) {
    this.logSecurityEvent(
      'RATE_LIMIT_EXCEEDED',
      this.logLevels.WARN,
      `Rate limit exceeded for ${limitType} on ${endpoint}`,
      { userId, ip, endpoint, limitType, ...context }
    );
  }

  // Middleware for request logging
  requestLogger(req, res, next) {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    req.requestId = requestId;
    req.startTime = startTime;
    
    // Log request
    this.logAPICall(
      req.user?.id || 'anonymous',
      req.path,
      req.method,
      null, // status code will be set in response
      null, // duration will be calculated
      { requestId }
    );
    
    // Log response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      this.logAPICall(
        req.user?.id || 'anonymous',
        req.path,
        req.method,
        res.statusCode,
        duration,
        { requestId }
      );
    });
    
    next();
  }

  // Middleware for security event logging
  securityLogger(req, res, next) {
    // Log security-relevant events
    if (req.headers.authorization) {
      this.logAuthentication(req.user?.id || 'anonymous', 'token_check', !!req.user, {
        requestId: req.requestId
      });
    }
    
    // Log suspicious patterns
    if (req.body && JSON.stringify(req.body).length > 10000) {
      this.logSecurityEvent(
        'LARGE_PAYLOAD',
        this.logLevels.WARN,
        'Large request payload detected',
        {
          userId: req.user?.id || 'anonymous',
          size: JSON.stringify(req.body).length,
          endpoint: req.path,
          requestId: req.requestId
        }
      );
    }
    
    next();
  }
}

module.exports = new AuditLogger();
     