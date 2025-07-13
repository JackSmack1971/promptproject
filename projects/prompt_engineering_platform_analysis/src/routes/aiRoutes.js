const express = require('express');
const { generatePrompt } = require('../controllers/aiController');
const router = express.Router();

router.post('/generate-prompt', generatePrompt);

module.exports = router;