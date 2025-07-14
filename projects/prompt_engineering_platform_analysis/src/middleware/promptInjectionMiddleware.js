const { body } = require('express-validator');

// Common prompt injection patterns
const INJECTION_PATTERNS = [
  // System prompt manipulation - simplified patterns
  { pattern: /system\s*:/i, type: 'system_manipulation' },
  { pattern: /ignore\s+previous/i, type: 'instruction_override' },
  { pattern: /disregard\s+all/i, type: 'instruction_override' },
  { pattern: /forget\s+all/i, type: 'instruction_override' },
  { pattern: /you\s+are\s+now/i, type: 'role_manipulation' },
  { pattern: /pretend\s+to\s+be/i, type: 'role_manipulation' },
  
  // Code injection attempts - safer patterns
  { pattern: /javascript:/i, type: 'code_injection' },
  { pattern: /eval\s*\(/i, type: 'code_execution' },
  { pattern: /exec\s*\(/i, type: 'code_execution' },
  
  // Data exfiltration attempts
  { pattern: /send\s+to\s+external/i, type: 'data_exfiltration' },
  { pattern: /upload\s+to/i, type: 'data_exfiltration' },
  { pattern: /share\s+with/i, type: 'data_sharing' },
  
  // Malicious instructions - simplified
  { pattern: /delete\s+all/i, type: 'destructive_command' },
  { pattern: /wipe\s+data/i, type: 'destructive_command' },
  { pattern: /drop\s+table/i, type: 'sql_injection' },
  
  // Social engineering
  { pattern: /admin\s+password/i, type: 'credential_harvesting' },
  { pattern: /bypass\s+security/i, type: 'security_bypass' },
  { pattern: /override\s+restrictions/i, type: 'security_bypass' }
];

// Prompt injection detection function
const detectPromptInjection = (prompt) => {
  if (!prompt || typeof prompt !== 'string') {
    return { isSafe: false, reason: 'Invalid prompt format' };
  }

  const violations = [];
  const startTime = Date.now();
  const MAX_PROCESSING_TIME = 100; // 100ms timeout
  
  // Check for injection patterns with timeout protection
  for (const { pattern, type } of INJECTION_PATTERNS) {
    if (Date.now() - startTime > MAX_PROCESSING_TIME) {
      console.warn('Prompt detection timeout - prompt may be too complex');
      break;
    }
    
    try {
      if (pattern.test(prompt)) {
        violations.push({
          type,
          pattern: pattern.source,
          message: `Potential ${type} detected`
        });
      }
    } catch (error) {
      console.error('Regex test error:', error);
    }
  }

  // Check for excessive special characters (simplified)
  const specialChars = prompt.replace(/[a-zA-Z0-9\s]/g, '').length;
  const specialCharRatio = specialChars / prompt.length;
  if (specialCharRatio > 0.3) {
    violations.push({
      type: 'excessive_special_chars',
      message: 'Excessive special characters detected',
      ratio: specialCharRatio
    });
  }

  // Check for excessive length
  if (prompt.length > 8000) {
    violations.push({
      type: 'excessive_length',
      message: 'Prompt exceeds maximum length',
      length: prompt.length
    });
  }

  // Check for code block patterns (safer alternative to complex regex)
  const codeBlockCount = (prompt.match(/```/g) || []).length;
  if (codeBlockCount > 2) {
    violations.push({
      type: 'code_blocks',
      message: 'Excessive code block usage detected',
      count: codeBlockCount
    });
  }

  return {
    isSafe: violations.length === 0,
    violations,
    promptLength: prompt.length,
    specialCharRatio,
    processingTime: Date.now() - startTime
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