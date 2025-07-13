const { generatePromptOpenAI } = require('../services/openaiService');
const { generatePromptHuggingFace } = require('../services/huggingfaceService');
const { logger } = require('../../config/logging');

async function generatePrompt(req, res) {
    const { provider, prompt, model } = req.body;

    // Example logging
    logger.info('Received request to generate prompt', { provider, prompt, model });
    logger.warn('This is a warning message');
    logger.debug('Debugging information', { req: req.body });

    if (!provider || !prompt) {
        logger.warn('Missing required parameters: provider or prompt', { provider, prompt });
        return res.status(400).json({ message: 'Provider and prompt are required.' });
    }

    try {
        let generatedContent;
        switch (provider) {
            case 'openai':
                generatedContent = await generatePromptOpenAI(prompt, model);
                break;
            case 'huggingface':
                generatedContent = await generatePromptHuggingFace(prompt, model);
                break;
            default:
                logger.warn('Invalid AI provider specified', { provider });
                return res.status(400).json({ message: 'Invalid AI provider specified.' });
        }
        logger.info('Prompt generated successfully', { generatedContent });
        res.status(200).json({ generatedContent });
    } catch (error) {
        logger.error('Error generating prompt', error, { provider, prompt, model });
        res.status(500).json({ message: 'Failed to generate prompt.', error: error.message });
    }
}

module.exports = {
    generatePrompt,
};