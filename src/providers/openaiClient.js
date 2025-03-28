const { OpenAI } = require('openai');
const LLMClient = require('../llmClient');
const config = require('../../config/config');

class OpenAIClient extends LLMClient {
  constructor() {
    super();
    const baseURL = process.env.LLM_API_URL.replace('/v1/chat/completions', '/v1');
    this.client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
      baseURL: baseURL
    });
  }

  /**
   * Call the OpenAI API with the given prompt
   * @param {string} prompt - The prompt to send to the API
   * @param {Object} systemPrompt - Optional custom system prompt
   * @returns {Promise<string>} The API response
   */
  async callLLM(prompt, systemPrompt = null) {
    await this.enforceRateLimit();
    
    // Use the provided system prompt or default to the summarizer
    const sysPrompt = systemPrompt || config.prompts.summarizer;
    
    let retryCount = 0;
    while (retryCount < this.maxRetries) {
      try {
        const response = await this.client.chat.completions.create({
          model: config.llm.model,
          messages: [
            { role: sysPrompt.role, content: sysPrompt.content },
            { role: "user", content: prompt }
          ],
          max_tokens: this.maxResponseTokens,
          temperature: config.llm.temperature
        });

        return response.choices[0].message.content;
      } catch (error) {
        const shouldRetry = await this.handleError(error, retryCount);
        if (!shouldRetry) {
          throw error;
        }
        retryCount++;
      }
    }
  }

  /**
   * Summarize channel messages
   * @param {Array} messages - Array of Slack messages
   * @param {string} topic - User's query
   * @param {Object} systemPrompt - Optional custom system prompt
   * @returns {Promise<string>} Summary text
   */
  async summarizeContext(messages, topic, systemPrompt = null) {
    if (config.debugMode) {
      return super.summarizeContext(messages, topic);
    }

    const prompt = this.formatPrompt(messages, topic);
    
    // Use the provided system prompt or default to the summarizer
    const sysPrompt = systemPrompt || config.prompts.summarizer;
    
    await this.enforceRateLimit();
    
    let retryCount = 0;
    while (retryCount < this.maxRetries) {
      try {
        const response = await this.client.chat.completions.create({
          model: config.llm.model,
          messages: [
            { role: sysPrompt.role, content: sysPrompt.content },
            { role: "user", content: prompt }
          ],
          max_tokens: this.maxResponseTokens * 2, // Double token limit for reports
          temperature: config.llm.temperature
        });

        return response.choices[0].message.content;
      } catch (error) {
        const shouldRetry = await this.handleError(error, retryCount);
        if (!shouldRetry) {
          throw error;
        }
        retryCount++;
      }
    }
  }

  /**
   * Extract topics from text
   * @param {string} text - Text to analyze
   * @returns {Promise<string[]>} Array of topics
   */
  async extractTopics(text) {
    if (config.debugMode) {
      return super.extractTopics(text);
    }

    const prompt = config.prompts.topicExtraction.replace('{text}', text);
    const response = await this.callLLM(prompt);
    return response.split(',').map(t => t.trim()).slice(0, 3);
  }
}

module.exports = OpenAIClient; 