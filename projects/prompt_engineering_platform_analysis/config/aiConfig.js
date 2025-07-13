require('dotenv').config();

const aiConfig = {
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
    },
    huggingface: {
        apiKey: process.env.HF_API_KEY,
    },
};

module.exports = aiConfig;