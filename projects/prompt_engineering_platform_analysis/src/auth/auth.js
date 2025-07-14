const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const zxcvbn = require('zxcvbn');
const db = require('../../database/db'); // Assuming db.js exists for database connection

// Password complexity requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MIN_SCORE = 3; // zxcvbn score 0-4, 3 is "good"
const USERNAME_MAX_LENGTH = 50;
const INPUT_MAX_LENGTHS = {
  username: 50,
  password: 128, // Reasonable upper limit for passwords
  prompt: 8000,
  description: 1000
};

// Validation helper functions
function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` };
  }

  if (password.length > INPUT_MAX_LENGTHS.password) {
    return { valid: false, message: `Password must not exceed ${INPUT_MAX_LENGTHS.password} characters` };
  }

  const passwordCheck = zxcvbn(password);
  if (passwordCheck.score < PASSWORD_MIN_SCORE) {
    const suggestions = passwordCheck.feedback.suggestions.join(' ');
    return {
      valid: false,
      message: `Password is too weak. ${suggestions || 'Please use a stronger password with mixed case, numbers, and symbols.'}`
    };
  }

  return { valid: true };
}

function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, message: 'Username is required' };
  }

  if (username.length > INPUT_MAX_LENGTHS.username) {
    return { valid: false, message: `Username must not exceed ${INPUT_MAX_LENGTHS.username} characters` };
  }

  // Basic username validation - alphanumeric and underscore only
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, message: 'Username can only contain letters, numbers, and underscores' };
  }

  return { valid: true };
}

// Registration endpoint
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  // Validate username
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    return res.status(400).json({ message: usernameValidation.message });
  }

  // Validate password complexity
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ message: passwordValidation.message });
  }

  try {
    // Check if user already exists
    const existingUser = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12); // Increased to 12 salt rounds for better security

    // Store user in database with additional security fields
    await db.query(
      'INSERT INTO users (username, password_hash, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
      [username, hashedPassword]
    );

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const JWT_SECRET = process.env.JWT_SECRET;

// Security configuration
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const MAX_CONCURRENT_SESSIONS = 5;
const TOKEN_EXPIRY = '1h';

// Validate JWT secret on startup
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be set and at least 32 characters long');
  process.exit(1);
}

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  // Validate username length
  if (username.length > INPUT_MAX_LENGTHS.username) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  try {
    // Check if user exists
    const user = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (user.rows.length === 0) {
      // Add artificial delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const userData = user.rows[0];
    
    // Check if account is locked
    if (userData.locked_until && userData.locked_until > new Date()) {
      return res.status(423).json({ message: 'Account locked due to multiple failed login attempts' });
    }

    const hashedPassword = userData.password_hash;

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, hashedPassword);
    if (!passwordMatch) {
      // Add artificial delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Log failed login attempt
      await db.query(
        'INSERT INTO login_attempts (user_id, ip_address, success, attempted_at) VALUES ($1, $2, false, NOW())',
        [userData.id, req.ip]
      );
      
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Check concurrent session limit
    const activeSessions = await db.query(
      'SELECT COUNT(*) FROM user_sessions WHERE user_id = $1 AND expires_at > NOW()',
      [userData.id]
    );
    
    if (parseInt(activeSessions.rows[0].count) >= MAX_CONCURRENT_SESSIONS) {
      // Remove oldest sessions to make room
      await db.query(
        'DELETE FROM user_sessions WHERE user_id = $1 AND id IN (SELECT id FROM user_sessions WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1)',
        [userData.id]
      );
    }

    // Generate JWT and refresh token
    const token = jwt.sign({ userId: userData.id, username: userData.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    const refreshToken = uuidv4();
    const refreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Store refresh token and session in database
    await db.query(
      'UPDATE users SET refresh_token = $1, refresh_token_expires_at = $2, updated_at = NOW() WHERE id = $3',
      [refreshToken, refreshTokenExpiry, userData.id]
    );

    // Create session record
    await db.query(
      'INSERT INTO user_sessions (user_id, refresh_token, ip_address, user_agent, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [userData.id, refreshToken, req.ip, req.get('User-Agent'), refreshTokenExpiry]
    );

    // Log successful login
    await db.query(
      'INSERT INTO login_attempts (user_id, ip_address, success, attempted_at) VALUES ($1, $2, true, NOW())',
      [userData.id, req.ip]
    );

    res.status(200).json({ message: 'User logged in successfully', token, refreshToken });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    // Clear all sessions for the user
    await db.query('UPDATE users SET refresh_token = NULL, refresh_token_expires_at = NULL WHERE id = $1', [userId]);
    
    // Clear session records
    await db.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    
    res.status(200).json({ message: 'User logged out successfully. All sessions terminated.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

// Single session logout endpoint
router.post('/logout-session', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token is required' });
  }

  try {
    // Remove specific session
    await db.query('DELETE FROM user_sessions WHERE refresh_token = $1', [refreshToken]);
    
    // Check if this was the user's last session
    const userResult = await db.query('SELECT user_id FROM user_sessions WHERE refresh_token = $1', [refreshToken]);
    if (userResult.rows.length > 0) {
      // Update user's refresh token if this was the active one
      await db.query(
        'UPDATE users SET refresh_token = NULL WHERE id = $1 AND refresh_token = $2',
        [userResult.rows[0].user_id, refreshToken]
      );
    }
    
    res.status(200).json({ message: 'Session logged out successfully' });
  } catch (error) {
    console.error('Session logout error:', error);
    res.status(500).json({ message: 'Server error during session logout' });
  }
});

// Token refresh endpoint
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token is required' });
  }

  try {
    // Find user by refresh token with expiration check
    const user = await db.query(
      'SELECT u.* FROM users u WHERE u.refresh_token = $1 AND u.refresh_token_expires_at > NOW()',
      [refreshToken]
    );

    if (user.rows.length === 0) {
      // Also check session table for more detailed error
      const sessionCheck = await db.query(
        'SELECT * FROM user_sessions WHERE refresh_token = $1 AND expires_at > NOW()',
        [refreshToken]
      );
      
      if (sessionCheck.rows.length === 0) {
        return res.status(403).json({ message: 'Invalid or expired refresh token' });
      }
      
      // Session exists but user refresh token is different - possible token reuse attack
      await db.query('DELETE FROM user_sessions WHERE refresh_token = $1', [refreshToken]);
      return res.status(403).json({ message: 'Invalid or expired refresh token' });
    }

    const userData = user.rows[0];

    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: userData.id, username: userData.username },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ message: 'Server error during token refresh' });
  }
});

// Password change endpoint with session invalidation
router.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword, userId } = req.body;

  if (!currentPassword || !newPassword || !userId) {
    return res.status(400).json({ message: 'Current password, new password, and user ID are required' });
  }

  // Validate new password
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({ message: passwordValidation.message });
  }

  try {
    // Get current user
    const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userData = user.rows[0];

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, userData.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const newHashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and invalidate all sessions
    await db.query(
      'UPDATE users SET password_hash = $1, refresh_token = NULL, refresh_token_expires_at = NULL, updated_at = NOW() WHERE id = $2',
      [newHashedPassword, userId]
    );

    // Clear all sessions for this user
    await db.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);

    res.status(200).json({ message: 'Password changed successfully. All sessions have been terminated for security.' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Server error during password change' });
  }
});

// Get user sessions endpoint
router.get('/sessions/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const sessions = await db.query(
      'SELECT id, ip_address, user_agent, created_at, expires_at FROM user_sessions WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC',
      [userId]
    );

    res.status(200).json({ sessions: sessions.rows });
  } catch (error) {
    console.error('Sessions fetch error:', error);
    res.status(500).json({ message: 'Server error fetching sessions' });
  }
});

module.exports = router;