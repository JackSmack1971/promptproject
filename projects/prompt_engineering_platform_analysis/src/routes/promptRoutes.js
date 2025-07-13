const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { promptTemplateValidation, userPromptValidation, idValidation } = require('../middleware/validationMiddleware');
const cacheMiddleware = require('../middleware/cacheMiddleware');

// --- Prompt Templates Endpoints ---

// GET all prompt templates
router.get('/templates', authenticateToken, cacheMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM prompt_templates ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching prompt templates:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET a single prompt template by ID
router.get('/templates/:id', authenticateToken, idValidation, cacheMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query('SELECT * FROM prompt_templates WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Prompt template not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching prompt template:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST a new prompt template (Admin only)
router.post('/templates', authenticateToken, authorizeRoles(['admin']), promptTemplateValidation, async (req, res) => {
  try {
    const { name, template_string } = req.body;
    // No need for manual validation here, it's handled by promptTemplateValidation middleware
    const { rows } = await db.query(
      'INSERT INTO prompt_templates (name, template_string) VALUES ($1, $2) RETURNING *',
      [name, template_string]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating prompt template:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT (update) a prompt template by ID (Admin only)
router.put('/templates/:id', authenticateToken, authorizeRoles(['admin']), idValidation, promptTemplateValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, template_string } = req.body;
    // No need for manual validation here, it's handled by validation middleware
    const { rows } = await db.query(
      'UPDATE prompt_templates SET name = $1, template_string = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [name, template_string, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Prompt template not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating prompt template:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE a prompt template by ID (Admin only)
router.delete('/templates/:id', authenticateToken, authorizeRoles(['admin']), idValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await db.query('DELETE FROM prompt_templates WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ message: 'Prompt template not found' });
    }
    res.status(204).send(); // No content
  } catch (err) {
    console.error('Error deleting prompt template:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- User Prompts Endpoints ---

// GET all user prompts (User can only see their own, Admin can see all)
router.get('/user-prompts', authenticateToken, cacheMiddleware, async (req, res) => {
  try {
    let queryText = 'SELECT * FROM user_prompts';
    const queryParams = [];

    // If not admin, filter by user_id
    if (!req.user.roles.includes('admin')) {
      queryText += ' WHERE user_id = $1';
      queryParams.push(req.user.id);
    }
    queryText += ' ORDER BY created_at DESC';

    const { rows } = await db.query(queryText, queryParams);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching user prompts:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET a single user prompt by ID (User can only see their own, Admin can see all)
router.get('/user-prompts/:id', authenticateToken, idValidation, cacheMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    let queryText = 'SELECT * FROM user_prompts WHERE id = $1';
    const queryParams = [id];

    // If not admin, add user_id filter
    if (!req.user.roles.includes('admin')) {
      queryText += ' AND user_id = $2';
      queryParams.push(req.user.id);
    }

    const { rows } = await db.query(queryText, queryParams);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User prompt not found or unauthorized' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching user prompt:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST a new user prompt
router.post('/user-prompts', authenticateToken, userPromptValidation, async (req, res) => {
  try {
    const { template_id, prompt_string, generated_output, tags, metadata } = req.body;
    const user_id = req.user.id;

    // No need for manual validation here, it's handled by userPromptValidation middleware

    const { rows } = await db.query(
      'INSERT INTO user_prompts (user_id, template_id, prompt_string, generated_output, tags, metadata) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [user_id, template_id, prompt_string, generated_output, tags || [], metadata || {}]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating user prompt:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT (update) a user prompt by ID (User can only update their own, Admin can update all)
router.put('/user-prompts/:id', authenticateToken, idValidation, userPromptValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const { template_id, prompt_string, generated_output, tags, metadata } = req.body;
    const user_id = req.user.id;

    // No need for manual validation here, it's handled by validation middleware

    let queryText = 'UPDATE user_prompts SET template_id = $1, prompt_string = $2, generated_output = $3, tags = $4, metadata = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6';
    const queryParams = [template_id, prompt_string, generated_output, tags || [], metadata || {}, id];

    // If not admin, add user_id filter
    if (!req.user.roles.includes('admin')) {
      queryText += ' AND user_id = $7';
      queryParams.push(user_id);
    }
    queryText += ' RETURNING *';

    const { rows } = await db.query(queryText, queryParams);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User prompt not found or unauthorized' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating user prompt:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE a user prompt by ID (User can only delete their own, Admin can delete all)
router.delete('/user-prompts/:id', authenticateToken, idValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    let queryText = 'DELETE FROM user_prompts WHERE id = $1';
    const queryParams = [id];

    // If not admin, add user_id filter
    if (!req.user.roles.includes('admin')) {
      queryText += ' AND user_id = $2';
      queryParams.push(user_id);
    }

    const { rowCount } = await db.query(queryText, queryParams);
    if (rowCount === 0) {
      return res.status(404).json({ message: 'User prompt not found or unauthorized' });
    }
    res.status(204).send(); // No content
  } catch (err) {
    console.error('Error deleting user prompt:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;