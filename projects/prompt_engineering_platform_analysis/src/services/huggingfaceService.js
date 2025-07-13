const { HfInference } = require('@huggingface/inference');
const aiConfig = require('../../config/aiConfig');

const hf = new HfInference(aiConfig.huggingface.apiKey);

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function generatePromptHuggingFace(prompt, model = 'gpt2') {
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const result = await hf.textGeneration({
                model: model,
                inputs: prompt,
            });
            return result.generated_text;
        } catch (error) {
            console.error(`Attempt ${i + 1} failed: ${error.message}`);
            if (i < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (i + 1)));
            } else {
                throw new Error(`Hugging Face API call failed after ${MAX_RETRIES} retries: ${error.message}`);
            }
        }
    }
}

module.exports = {
    generatePromptHuggingFace,
};