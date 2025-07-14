const { body } = require('express-validator');

// Common prompt injection patterns
const INJECTION_PATTERNS = [
  // System prompt manipulation
  /system\s*:/i,
  /ignore\s+previous\s+instructions/i,
  /disregard\s+all\s+previous/i,
  /forget\s+all\s+previous/i,
  /you\s+are\s+now/i,
  /pretend\s+to\s+be/i,
  /act\s+as\s+if/i,
  
  // Code injection attempts
  /```[\s\S]*?```/g,
  /javascript\s*:/i,
  /eval\s*\(/i,
  /exec\s*\(/i,
  
  // Data exfiltration attempts
  /send\s+to\s+external/i,
  /upload\s+to/i,
  /share\s+with/i,
  /leak\s+to/i,
  
  // Malicious instructions
  /delete\s+all/i,
  /wipe\s+data/i,
  /drop\s+table/i,
  /shutdown/i,
  
  // Social engineering
  /admin\s+password/i,
  /root\s+access/i,
  /bypass\s+security/i,
  /override\s+restrictions/i
];

// Prompt injection detection function
const detectPromptInjection = (prompt) => {
  if (!prompt || typeof prompt !== 'string') {
    return { isSafe: false, reason: 'Invalid prompt format' };
  }

  const violations = [];
  
  // Check for injection patterns
  INJECTION_PATTERNS.forEach(pattern => {
    if (pattern.test(prompt)) {
      violations.push(`Detected potential injection: ${pattern.source || pattern}`);
    }
  });

  // Check for excessive special characters
  const specialCharRatio = (prompt.match(/[^a-zA-Z0-9\s]/g) || []).length / prompt.length;
  if (specialCharRatio > 0.3) {
    violations.push('Excessive special characters detected');
  }

  // Check for excessive length (potential DoS)
  if (prompt.length > 10000) {
    violations.push('Prompt exceeds maximum length');
  }

  return {
    isSafe: violations.length === 0,
    violations,
    promptLength: prompt.length,
    specialCharRatio
  };
};

// Middleware for prompt validation
const validatePrompt = (req, res, next) => {
  const { prompt_string, content } = req.body;
  const prompt = prompt_string || content;

  if (!prompt) {
    return res.status(400).json({
      message: 'Prompt content is required',
      code: 'PROMPT_REQUIRED'
    });
  }

  const validation = detectPromptInjection(prompt);

  if (!validation.isSafe) {
    console.warn('Prompt injection attempt detected:', {
      violations: validation.violations,
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(400).json({
      message: 'Suspicious prompt content detected',
      code: 'PROMPT_INJECTION_DETECTED',
      violations: validation.violations
    });
  }

  // Sanitize the prompt
  const sanitizedPrompt = prompt
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .trim()
    .substring(0, 8000); // Enforce maximum length

  // Update the request body with sanitized prompt
  if (prompt_string) {
    req.body.prompt_string = sanitizedPrompt;
  } else if (content) {
    req.body.content = sanitizedPrompt;
  }

  next();
};

// Validation rules for express-validator
const promptValidationRules = [
  body('prompt_string')
    .optional()
    .isString()
    .isLength({ min: 1, max: 8000 })
    .withMessage('Prompt must be between 1 and 8000 characters')
    .custom(value => {
      const validation = detectPromptInjection(value);
      if (!validation.isSafe) {
        throw new Error(`Suspicious content: ${validation.violations.join(', ')}`);
      }
      return true;
    }),
  
  body('content')
    .optional()
    .isString()
    .isLength({ min: 1, max: 8000 })
    .withMessage('Content must be between 1 and 8000 characters')
    .custom(value => {
      const validation = detectPromptInjection(value);
      if (!validation.isSafe) {
        throw new Error(`Suspicious content: ${validation.violations.join(', ')}`);
      }
      return true;
    })
];

module.exports = {
  detectPromptInjection,
  validatePrompt,
  promptValidationRules
};