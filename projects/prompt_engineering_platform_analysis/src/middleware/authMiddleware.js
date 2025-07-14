const jwt = require('jsonwebtoken');
const db = require('../../database/db');
const auditLogger = require('./auditLogger');
const securityConfig = require('../../config/security');

const JWT_SECRET = process.env.JWT_SECRET;

// Validate JWT secret on startup
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be set and at least 32 characters long');
  process.exit(1);
}

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    auditLogger.logAuthentication('anonymous', 'token_missing', false, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    return res.status(401).json({ message: 'Access token required' });
  }

  // Validate token format
  if (!/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token)) {
    auditLogger.logAuthentication('anonymous', 'token_format_invalid', false, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    return res.status(401).json({ message: 'Invalid token format' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      maxAge: securityConfig.auth.jwt.expiresIn
    });

    // Validate token structure
    if (!decoded || !decoded.userId || !decoded.username) {
      auditLogger.logAuthentication(decoded?.userId || 'anonymous', 'token_structure_invalid', false, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path
      });
      return res.status(401).json({ message: 'Invalid token structure' });
    }

    // Check if user exists and is not locked
    const userResult = await db.query(
      'SELECT id, username, locked_until FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      auditLogger.logAuthentication(decoded.userId, 'user_not_found', false, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path
      });
      return res.status(401).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check if account is locked
    if (user.locked_until && user.locked_until > new Date()) {
      auditLogger.logAuthentication(user.id, 'account_locked', false, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        lockedUntil: user.locked_until
      });
      return res.status(423).json({
        message: 'Account locked due to security reasons',
        lockedUntil: user.locked_until
      });
    }

    // Update last activity
    await db.query(
      'UPDATE user_sessions SET last_activity = NOW() WHERE refresh_token = $1',
      [decoded.refreshTokenId]
    );

    req.user = {
      id: user.id,
      username: user.username
    };

    auditLogger.logAuthentication(user.id, 'token_validation', true, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });

    next();
  } catch (error) {
    let message = 'Invalid token';
    let logLevel = 'warn';

    if (error.name === 'TokenExpiredError') {
      message = 'Token expired';
      logLevel = 'info';
    } else if (error.name === 'JsonWebTokenError') {
      message = 'Invalid token';
      logLevel = 'warn';
    } else if (error.name === 'NotBeforeError') {
      message = 'Token not active';
      logLevel = 'warn';
    }

    auditLogger.logAuthentication('anonymous', 'token_validation_failed', false, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      error: error.message
    });

    return res.status(401).json({ message });
  }
};

const authorizeRoles = (roles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const userRolesResult = await db.query(
        `SELECT r.name
         FROM roles r
         JOIN user_roles ur ON r.id = ur.role_id
         WHERE ur.user_id = $1`,
        [req.user.id]
      );

      const userRoles = userRolesResult.rows.map(row => row.name);

      if (!userRoles || !userRoles.some(role => roles.includes(role))) {
        auditLogger.logAuthorization(
          req.user.id,
          req.path,
          req.method,
          false,
          {
            required: roles,
            userRoles,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          }
        );

        return res.status(403).json({
          message: 'Insufficient permissions',
          required: roles,
          userRoles
        });
      }

      req.user.roles = userRoles;

      auditLogger.logAuthorization(
        req.user.id,
        req.path,
        req.method,
        true,
        {
          required: roles,
          userRoles,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      next();
    } catch (error) {
      console.error('Authorization check error:', error);
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
};

// Middleware to check if user can access specific resource
const authorizeResourceAccess = (resourceType, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const resourceId = req.params[resourceIdParam];

    try {
      let query;
      let params;

      switch (resourceType) {
        case 'prompt':
          query = 'SELECT user_id FROM user_prompts WHERE id = $1';
          params = [resourceId];
          break;
        case 'template':
          query = 'SELECT user_id FROM prompt_templates WHERE id = $1';
          params = [resourceId];
          break;
        default:
          return res.status(400).json({ message: 'Invalid resource type' });
      }

      const result = await db.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: `${resourceType} not found` });
      }

      const resourceUserId = result.rows[0].user_id;

      if (resourceUserId !== req.user.id) {
        auditLogger.logAuthorization(
          req.user.id,
          `${resourceType}:${resourceId}`,
          'access',
          false,
          {
            resourceOwner: resourceUserId,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          }
        );

        return res.status(403).json({
          message: `Access denied to ${resourceType}`
        });
      }

      auditLogger.logAuthorization(
        req.user.id,
        `${resourceType}:${resourceId}`,
        'access',
        true,
        {
          resourceOwner: resourceUserId,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      next();
    } catch (error) {
      console.error('Resource authorization error:', error);
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
};

// Middleware to validate session
const validateSession = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const sessionResult = await db.query(
      'SELECT expires_at FROM user_sessions WHERE user_id = $1 AND expires_at > NOW()',
      [req.user.id]
    );

    if (sessionResult.rows.length === 0) {
      auditLogger.logAuthentication(req.user.id, 'session_expired', false, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return res.status(401).json({ message: 'Session expired' });
    }

    next();
  } catch (error) {
    console.error('Session validation error:', error);
    return res.status(500).json({ message: 'Session validation failed' });
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizeResourceAccess,
  validateSession
};