const OpenAI = require('openai');
const aiConfig = require('../../config/aiConfig');

const openai = new OpenAI({
    apiKey: aiConfig.openai.apiKey,
});

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function generatePromptOpenAI(prompt, model = 'gpt-3.5-turbo') {
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const completion = await openai.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: model,
            });
            return completion.choices[0].message.content;
        } catch (error) {
            console.error(`Attempt ${i + 1} failed: ${error.message}`);
            if (i < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (i + 1)));
            } else {
                throw new Error(`OpenAI API call failed after ${MAX_RETRIES} retries: ${error.message}`);
            }
        }
    }
}

module.exports = {
    generatePromptOpenAI,
};