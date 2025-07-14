const { body } = require('express-validator');

// Common prompt injection patterns - enhanced security
const INJECTION_PATTERNS = [
  // System prompt manipulation - simplified patterns
  { pattern: /system\s*:/i, type: 'system_manipulation' },
  { pattern: /ignore\s+previous/i, type: 'instruction_override' },
  { pattern: /disregard\s+all/i, type: 'instruction_override' },
  { pattern: /forget\s+all/i, type: 'instruction_override' },
  { pattern: /you\s+are\s+now/i, type: 'role_manipulation' },
  { pattern: /pretend\s+to\s+be/i, type: 'role_manipulation' },
  { pattern: /act\s+as\s+if/i, type: 'role_manipulation' },
  
  // Code injection attempts - enhanced patterns
  { pattern: /javascript:/i, type: 'code_injection' },
  { pattern: /eval\s*\(/i, type: 'code_execution' },
  { pattern: /exec\s*\(/i, type: 'code_execution' },
  { pattern: /function\s*\(/i, type: 'code_execution' },
  { pattern: /require\s*\(/i, type: 'code_execution' },
  { pattern: /import\s*\(/i, type: 'code_execution' },
  { pattern: /process\./i, type: 'system_access' },
  { pattern: /global\./i, type: 'system_access' },
  
  // SQL injection patterns
  { pattern: /union\s+select/i, type: 'sql_injection' },
  { pattern: /insert\s+into/i, type: 'sql_injection' },
  { pattern: /update\s+.*\s+set/i, type: 'sql_injection' },
  { pattern: /delete\s+from/i, type: 'sql_injection' },
  { pattern: /drop\s+table/i, type: 'sql_injection' },
  { pattern: /alter\s+table/i, type: 'sql_injection' },
  { pattern: /exec\s+\(/i, type: 'sql_injection' },
  
  // Data exfiltration attempts
  { pattern: /send\s+to\s+external/i, type: 'data_exfiltration' },
  { pattern: /upload\s+to/i, type: 'data_exfiltration' },
  { pattern: /share\s+with/i, type: 'data_sharing' },
  { pattern: /post\s+to\s+url/i, type: 'data_exfiltration' },
  { pattern: /http:\/\/|https:\/\//i, type: 'external_request' },
  
  // Malicious instructions - enhanced
  { pattern: /delete\s+all/i, type: 'destructive_command' },
  { pattern: /wipe\s+data/i, type: 'destructive_command' },
  { pattern: /rm\s+-rf/i, type: 'destructive_command' },
  { pattern: /format\s+/i, type: 'destructive_command' },
  { pattern: /shutdown\s+/i, type: 'destructive_command' },
  
  // Social engineering - enhanced
  { pattern: /admin\s+password/i, type: 'credential_harvesting' },
  { pattern: /root\s+password/i, type: 'credential_harvesting' },
  { pattern: /api\s+key/i, type: 'credential_harvesting' },
  { pattern: /secret\s+key/i, type: 'credential_harvesting' },
  { pattern: /bypass\s+security/i, type: 'security_bypass' },
  { pattern: /override\s+restrictions/i, type: 'security_bypass' },
  { pattern: /disable\s+security/i, type: 'security_bypass' },
  
  // Encoding bypass attempts
  { pattern: /&#\d+;/i, type: 'encoding_bypass' },
  { pattern: /&#x[\da-f]+;/i, type: 'encoding_bypass' },
  { pattern: /%[0-9a-f]{2}/i, type: 'encoding_bypass' },
  
  // Advanced injection techniques
  { pattern: /prompt\s+injection/i, type: 'meta_injection' },
  { pattern: /jailbreak/i, type: 'security_bypass' },
  { pattern: /dan\s+mode/i, type: 'security_bypass' } // "Do Anything Now" mode
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

  // Enhanced sanitization for dangerous characters
  const sanitizedPrompt = prompt
    // Remove or escape dangerous HTML/XML characters
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/&/g, '&') // Escape ampersands
    .replace(/"/g, '"') // Escape double quotes
    .replace(/'/g, '&#x27;') // Escape single quotes
    .replace(/`/g, '') // Remove backticks (template literals)
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/script/gi, '') // Remove script tags
    .replace(/eval\s*\(/gi, '') // Remove eval statements
    .replace(/expression\s*\(/gi, '') // Remove expression statements
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