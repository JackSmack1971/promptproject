const OpenAI = require('openai');
const aiConfig = require('../../config/aiConfig');
const { detectPromptInjection } = require('../middleware/promptInjectionMiddleware');

const openai = new OpenAI({
    apiKey: aiConfig.openai.apiKey,
});

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const MAX_PROMPT_LENGTH = 4000;
const MAX_RESPONSE_LENGTH = 4000;

// Rate limiting per user/IP
const userRateLimits = new Map();

async function generatePromptOpenAI(prompt, model = 'gpt-3.5-turbo', userId = 'anonymous') {
    // Validate prompt for injection attempts
    const validation = detectPromptInjection(prompt);
    if (!validation.isSafe) {
        throw new Error(`Prompt injection detected: ${validation.violations.join(', ')}`);
    }

    // Enforce prompt length limits
    if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new Error(`Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`);
    }

    // Rate limiting
    const now = Date.now();
    const userLimit = userRateLimits.get(userId);
    if (userLimit && (now - userLimit.lastRequest) < 1000) {
        throw new Error('Rate limit exceeded. Please wait before making another request.');
    }
    userRateLimits.set(userId, { lastRequest: now });

    // Clean up old rate limit entries
    if (userRateLimits.size > 1000) {
        const cutoff = now - 60000; // 1 minute
        for (const [key, value] of userRateLimits.entries()) {
            if (value.lastRequest < cutoff) {
                userRateLimits.delete(key);
            }
        }
    }

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const completion = await openai.chat.completions.create({
                messages: [{
                    role: 'user',
                    content: prompt.substring(0, MAX_PROMPT_LENGTH)
                }],
                model: model,
                max_tokens: Math.min(MAX_RESPONSE_LENGTH, 1000), // Limit response tokens
                temperature: 0.7,
                top_p: 1.0,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
            });

            const response = completion.choices[0]?.message?.content || '';
            
            // Validate response length
            if (response.length > MAX_RESPONSE_LENGTH) {
                console.warn(`Response truncated from ${response.length} to ${MAX_RESPONSE_LENGTH} characters`);
                return response.substring(0, MAX_RESPONSE_LENGTH);
            }

            return response;
        } catch (error) {
            console.error(`OpenAI API attempt ${i + 1} failed for user ${userId}:`, error.message);
            
            // Handle specific OpenAI errors
            if (error.code === 'rate_limit_exceeded') {
                throw new Error('OpenAI rate limit exceeded. Please try again later.');
            }
            if (error.code === 'invalid_api_key') {
                throw new Error('Invalid OpenAI API key configuration.');
            }
            if (error.code === 'context_length_exceeded') {
                throw new Error('Prompt too long for selected model.');
            }
            
            if (i < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (i + 1)));
            } else {
                throw new Error(`OpenAI API call failed after ${MAX_RETRIES} retries: ${error.message}`);
            }
        }
    }
}

// Enhanced function with additional security parameters
async function generateSecurePromptOpenAI(prompt, model = 'gpt-3.5-turbo', userId = 'anonymous', options = {}) {
    const {
        maxTokens = 1000,
        temperature = 0.7,
        systemPrompt = null,
        safeMode = true
    } = options;

    // Enhanced validation
    if (safeMode) {
        const validation = detectPromptInjection(prompt);
        if (!validation.isSafe) {
            throw new Error(`Security validation failed: ${validation.violations.join(', ')}`);
        }
    }

    // Build messages with system prompt if provided
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt.substring(0, MAX_PROMPT_LENGTH) });

    const completion = await openai.chat.completions.create({
        messages,
        model: model,
        max_tokens: Math.min(maxTokens, MAX_RESPONSE_LENGTH),
        temperature: Math.max(0, Math.min(1, temperature)),
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
    });

    return completion.choices[0]?.message?.content || '';
}

module.exports = {
    generatePromptOpenAI,
    generateSecurePromptOpenAI,
    MAX_PROMPT_LENGTH,
    MAX_RESPONSE_LENGTH
};