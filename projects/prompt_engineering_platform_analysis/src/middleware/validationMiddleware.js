const { body, param, validationResult } = require('express-validator');
const xss = require('xss');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  const extractedErrors = [];
  errors.array().map(err => extractedErrors.push({ [err.param]: err.msg }));

  return res.status(422).json({
    errors: extractedErrors,
  });
};

const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return xss(input);
  }
  return input;
};

const promptTemplateValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 3, max: 255 }).withMessage('Name must be between 3 and 255 characters')
    .customSanitizer(sanitizeInput),
  body('template_string')
    .trim()
    .notEmpty().withMessage('Template string is required')
    .isLength({ min: 10 }).withMessage('Template string must be at least 10 characters long')
    .customSanitizer(sanitizeInput),
  validate,
];

const userPromptValidation = [
  body('template_id')
    .optional()
    .isInt({ min: 1 }).withMessage('Template ID must be a positive integer'),
  body('prompt_string')
    .trim()
    .notEmpty().withMessage('Prompt string is required')
    .isLength({ min: 10 }).withMessage('Prompt string must be at least 10 characters long')
    .customSanitizer(sanitizeInput),
  body('generated_output')
    .optional()
    .trim()
    .customSanitizer(sanitizeInput),
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array')
    .customSanitizer(tags => tags.map(tag => sanitizeInput(tag.toString()))),
  body('metadata')
    .optional()
    .isObject().withMessage('Metadata must be an object')
    .customSanitizer(metadata => JSON.parse(xss(JSON.stringify(metadata)))), // Sanitize JSON string then parse
  validate,
];

const idValidation = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID must be a positive integer'),
  validate,
];

module.exports = {
  promptTemplateValidation,
  userPromptValidation,
  idValidation,
};