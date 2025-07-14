const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

// Validate JWT secret on startup
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be set and at least 32 characters long');
  process.exit(1);
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.sendStatus(401); // No token provided
  }

  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, (err, user) => {
    if (err) {
      console.error('JWT verification failed:', err.message);
      return res.sendStatus(403); // Invalid token
    }
    
    // Validate token structure
    if (!user || !user.id || !user.username) {
      return res.sendStatus(403);
    }
    
    req.user = user;
    next();
  });
};

const authorizeRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!req.user.roles || !req.user.roles.some(role => roles.includes(role))) {
      return res.status(403).json({ 
        message: 'Insufficient permissions',
        required: roles,
        userRoles: req.user.roles || []
      });
    }

    next();
  };
};

module.exports = { authenticateToken, authorizeRoles };