const { body } = require('express-validator');

// Security configuration for timeout management
const SECURITY_CONFIG = {
  MAX_BASE_PROCESSING_TIME: 50, // 50ms base timeout
  MAX_COMPLEXITY_TIME: 500, // 500ms max for complex inputs
  COMPLEXITY_THRESHOLD: 1000, // Character count threshold for complexity
  CIRCUIT_BREAKER_THRESHOLD: 5, // Max timeouts before circuit breaker
  CIRCUIT_BREAKER_WINDOW: 60000, // 1 minute window for circuit breaker
  INPUT_SANITY_LIMIT: 10000 // Hard limit on input size
};

// IP-based circuit breaker tracking
const circuitBreakerTracker = new Map();

// Enhanced prompt injection patterns - optimized for ReDoS resistance
const INJECTION_PATTERNS = [
  // System prompt manipulation - optimized patterns
  { pattern: /^.*system\s*:/i, type: 'system_manipulation', complexity: 1 },
  { pattern: /^.*ignore\s+previous/i, type: 'instruction_override', complexity: 1 },
  { pattern: /^.*disregard\s+all/i, type: 'instruction_override', complexity: 1 },
  { pattern: /^.*forget\s+all/i, type: 'instruction_override', complexity: 1 },
  { pattern: /^.*you\s+are\s+now/i, type: 'role_manipulation', complexity: 1 },
  { pattern: /^.*pretend\s+to\s+be/i, type: 'role_manipulation', complexity: 1 },
  { pattern: /^.*act\s+as\s+if/i, type: 'role_manipulation', complexity: 1 },
  
  // Code injection attempts - optimized patterns
  { pattern: /^.*javascript:/i, type: 'code_injection', complexity: 1 },
  { pattern: /^.*eval\s*\(/i, type: 'code_execution', complexity: 2 },
  { pattern: /^.*exec\s*\(/i, type: 'code_execution', complexity: 2 },
  { pattern: /^.*function\s*\(/i, type: 'code_execution', complexity: 2 },
  { pattern: /^.*require\s*\(/i, type: 'code_execution', complexity: 2 },
  { pattern: /^.*import\s*\(/i, type: 'code_execution', complexity: 2 },
  { pattern: /^.*process\./i, type: 'system_access', complexity: 2 },
  { pattern: /^.*global\./i, type: 'system_access', complexity: 2 },
  
  // SQL injection patterns - optimized
  { pattern: /^.*union\s+select/i, type: 'sql_injection', complexity: 2 },
  { pattern: /^.*insert\s+into/i, type: 'sql_injection', complexity: 2 },
  { pattern: /^.*update\s+.*\s+set/i, type: 'sql_injection', complexity: 2 },
  { pattern: /^.*delete\s+from/i, type: 'sql_injection', complexity: 2 },
  { pattern: /^.*drop\s+table/i, type: 'sql_injection', complexity: 2 },
  { pattern: /^.*alter\s+table/i, type: 'sql_injection', complexity: 2 },
  { pattern: /^.*exec\s+\(/i, type: 'sql_injection', complexity: 2 },
  
  // Data exfiltration attempts - optimized
  { pattern: /^.*send\s+to\s+external/i, type: 'data_exfiltration', complexity: 1 },
  { pattern: /^.*upload\s+to/i, type: 'data_exfiltration', complexity: 1 },
  { pattern: /^.*share\s+with/i, type: 'data_sharing', complexity: 1 },
  { pattern: /^.*post\s+to\s+url/i, type: 'data_exfiltration', complexity: 1 },
  { pattern: /^.*https?:\/\//i, type: 'external_request', complexity: 1 },
  
  // Malicious instructions - optimized
  { pattern: /^.*delete\s+all/i, type: 'destructive_command', complexity: 1 },
  { pattern: /^.*wipe\s+data/i, type: 'destructive_command', complexity: 1 },
  { pattern: /^.*rm\s+-rf/i, type: 'destructive_command', complexity: 1 },
  { pattern: /^.*format\s+/i, type: 'destructive_command', complexity: 1 },
  { pattern: /^.*shutdown\s+/i, type: 'destructive_command', complexity: 1 },
  
  // Social engineering - optimized
  { pattern: /^.*admin\s+password/i, type: 'credential_harvesting', complexity: 1 },
  { pattern: /^.*root\s+password/i, type: 'credential_harvesting', complexity: 1 },
  { pattern: /^.*api\s+key/i, type: 'credential_harvesting', complexity: 1 },
  { pattern: /^.*secret\s+key/i, type: 'credential_harvesting', complexity: 1 },
  { pattern: /^.*bypass\s+security/i, type: 'security_bypass', complexity: 1 },
  { pattern: /^.*override\s+restrictions/i, type: 'security_bypass', complexity: 1 },
  { pattern: /^.*disable\s+security/i, type: 'security_bypass', complexity: 1 },
  
  // Encoding bypass attempts - optimized
  { pattern: /^.*&#\d+;/i, type: 'encoding_bypass', complexity: 1 },
  { pattern: /^.*&#x[\da-f]+;/i, type: 'encoding_bypass', complexity: 1 },
  { pattern: /^.*%[0-9a-f]{2}/i, type: 'encoding_bypass', complexity: 1 },
  
  // Advanced injection techniques - optimized
  { pattern: /^.*prompt\s+injection/i, type: 'meta_injection', complexity: 1 },
  { pattern: /^.*jailbreak/i, type: 'security_bypass', complexity: 1 },
  { pattern: /^.*dan\s+mode/i, type: 'security_bypass', complexity: 1 } // "Do Anything Now" mode
];

// Calculate input complexity score
const calculateComplexity = (prompt) => {
  let complexity = 0;
  
  // Length-based complexity
  complexity += Math.min(prompt.length / 100, 10);
  
  // Special character density
  const specialChars = prompt.replace(/[a-zA-Z0-9\s]/g, '').length;
  complexity += (specialChars / prompt.length) * 5;
  
  // Nested patterns detection (basic)
  const nestedPatterns = (prompt.match(/\([^()]*\([^()]*\)[^()]*\)/g) || []).length;
  complexity += nestedPatterns * 3;
  
  // Regex-like patterns (potential ReDoS indicators)
  const regexLike = (prompt.match(/[.*+?^${}()|[\]\\]/g) || []).length;
  complexity += regexLike * 2;
  
  return Math.min(complexity, 50); // Cap at 50
};

// Circuit breaker check
const checkCircuitBreaker = (ip) => {
  const now = Date.now();
  const tracker = circuitBreakerTracker.get(ip);
  
  if (!tracker) {
    return false;
  }
  
  // Reset if window has passed
  if (now - tracker.firstTimeout > SECURITY_CONFIG.CIRCUIT_BREAKER_WINDOW) {
    circuitBreakerTracker.delete(ip);
    return false;
  }
  
  return tracker.timeoutCount >= SECURITY_CONFIG.CIRCUIT_BREAKER_THRESHOLD;
};

// Update circuit breaker
const updateCircuitBreaker = (ip, hadTimeout) => {
  const now = Date.now();
  let tracker = circuitBreakerTracker.get(ip);
  
  if (!tracker) {
    tracker = { timeoutCount: 0, firstTimeout: now };
    circuitBreakerTracker.set(ip, tracker);
  }
  
  if (hadTimeout) {
    tracker.timeoutCount++;
  }
  
  // Clean up old entries periodically
  if (Math.random() < 0.01) { // 1% chance per request
    const cutoff = now - SECURITY_CONFIG.CIRCUIT_BREAKER_WINDOW;
    for (const [key, value] of circuitBreakerTracker.entries()) {
      if (value.firstTimeout < cutoff) {
        circuitBreakerTracker.delete(key);
      }
    }
  }
};

// Progressive timeout calculation
const calculateTimeout = (prompt, complexity) => {
  const baseTime = SECURITY_CONFIG.MAX_BASE_PROCESSING_TIME;
  const maxTime = SECURITY_CONFIG.MAX_COMPLEXITY_TIME;
  
  // Linear scaling based on complexity
  const scaledTime = baseTime + (complexity * 10);
  return Math.min(scaledTime, maxTime);
};

// Enhanced prompt injection detection with progressive timeout
const detectPromptInjection = (prompt, ip) => {
  if (!prompt || typeof prompt !== 'string') {
    return { isSafe: false, reason: 'Invalid prompt format' };
  }

  // Check input size limit
  if (prompt.length > SECURITY_CONFIG.INPUT_SANITY_LIMIT) {
    return { 
      isSafe: false, 
      reason: 'Input exceeds maximum length',
      length: prompt.length 
    };
  }

  // Check circuit breaker
  if (checkCircuitBreaker(ip)) {
    return { 
      isSafe: false, 
      reason: 'Rate limit exceeded due to repeated timeouts',
      code: 'CIRCUIT_BREAKER_ACTIVE'
    };
  }

  const violations = [];
  const startTime = Date.now();
  let hadTimeout = false;

  // Calculate complexity and dynamic timeout
  const complexity = calculateComplexity(prompt);
  const maxProcessingTime = calculateTimeout(prompt, complexity);

  // Fast pre-filtering for obvious patterns
  const fastPatterns = INJECTION_PATTERNS.filter(p => p.complexity <= 1);
  const complexPatterns = INJECTION_PATTERNS.filter(p => p.complexity > 1);

  // Check fast patterns first
  for (const { pattern, type } of fastPatterns) {
    if (Date.now() - startTime > maxProcessingTime) {
      hadTimeout = true;
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

  // Only check complex patterns if we have time and no violations yet
  if (violations.length === 0 && !hadTimeout) {
    for (const { pattern, type } of complexPatterns) {
      if (Date.now() - startTime > maxProcessingTime) {
        hadTimeout = true;
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
  }

  // Update circuit breaker
  updateCircuitBreaker(ip, hadTimeout);

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
    processingTime: Date.now() - startTime,
    complexity,
    maxProcessingTime,
    hadTimeout
  };
};

// Middleware for prompt validation
const validatePrompt = (req, res, next) => {
  const { prompt_string, content } = req.body;
  const prompt = prompt_string || content;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  if (!prompt) {
    return res.status(400).json({
      message: 'Prompt content is required',
      code: 'PROMPT_REQUIRED'
    });
  }

  const validation = detectPromptInjection(prompt, ip);

  if (!validation.isSafe) {
    console.warn('Prompt injection attempt detected:', {
      violations: validation.violations,
      userId: req.user?.id,
      ip,
      userAgent: req.get('User-Agent'),
      processingTime: validation.processingTime,
      complexity: validation.complexity,
      hadTimeout: validation.hadTimeout
    });

    // Log circuit breaker activation
    if (validation.reason === 'CIRCUIT_BREAKER_ACTIVE') {
      console.error('Circuit breaker activated for IP:', ip);
    }

    return res.status(400).json({
      message: validation.reason || 'Suspicious prompt content detected',
      code: validation.code || 'PROMPT_INJECTION_DETECTED',
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
    .custom((value, { req }) => {
      const validation = detectPromptInjection(value, req.ip || 'unknown');
      if (!validation.isSafe) {
        throw new Error(`Suspicious content: ${validation.violations.map(v => v.type).join(', ')}`);
      }
      return true;
    }),
  
  body('content')
    .optional()
    .isString()
    .isLength({ min: 1, max: 8000 })
    .withMessage('Content must be between 1 and 8000 characters')
    .custom((value, { req }) => {
      const validation = detectPromptInjection(value, req.ip || 'unknown');
      if (!validation.isSafe) {
        throw new Error(`Suspicious content: ${validation.violations.map(v => v.type).join(', ')}`);
      }
      return true;
    })
];

module.exports = {
  detectPromptInjection,
  validatePrompt,
  promptValidationRules,
  SECURITY_CONFIG
};