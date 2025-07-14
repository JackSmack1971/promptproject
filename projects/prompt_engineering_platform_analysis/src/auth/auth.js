const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../../database/db'); // Assuming db.js exists for database connection

// Registration endpoint
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10); // 10 salt rounds

    // Store user in database
    await db.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hashedPassword]);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const JWT_SECRET = process.env.JWT_SECRET;

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

  try {
    // Check if user exists
    const user = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (user.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const hashedPassword = user.rows[0].password_hash;

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, hashedPassword);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT and refresh token
    const token = jwt.sign({ userId: user.rows[0].id, username: user.rows[0].username }, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = uuidv4();

    // Store refresh token in database
    await db.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.rows[0].id]);

    res.status(200).json({ message: 'User logged in successfully', token, refreshToken });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  const { userId } = req.body; // Assuming userId is sent for logout

  try {
    // Clear refresh token from database
    await db.query('UPDATE users SET refresh_token = NULL WHERE id = $1', [userId]);
    res.status(200).json({ message: 'User logged out successfully. Token and refresh token cleared.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

// Token refresh endpoint
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token is required' });
  }

  try {
    // Find user by refresh token
    const user = await db.query('SELECT * FROM users WHERE refresh_token = $1', [refreshToken]);

    if (user.rows.length === 0) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // Generate new access token
    const newAccessToken = jwt.sign({ userId: user.rows[0].id, username: user.rows[0].username }, JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ message: 'Server error during token refresh' });
  }
});

module.exports = router;