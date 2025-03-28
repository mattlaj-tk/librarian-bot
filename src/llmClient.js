const config = require('../config/config');

/**
 * Base LLM client that can be extended for different providers
 */
class LLMClient {
  constructor() {
    // Load configuration
    this.maxTokens = config.llm.maxTokens;
    this.maxResponseTokens = config.llm.maxResponseTokens;
    this.maxRetries = config.llm.maxRetries;
    this.retryDelay = config.llm.retryDelay;
    this.maxChunkLength = config.llm.maxChunkLength;
    
    // Rate limiting
    this.requestCount = 0;
    this.requestResetTimeout = null;
    this.lastRequestTime = 0;
  }

  /**
   * Sleep for the specified number of milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enforce rate limits based on configuration
   * @returns {Promise<void>}
   */
  async enforceRateLimit() {
    // Reset request count every minute
    if (!this.requestResetTimeout) {
      this.requestResetTimeout = setInterval(() => {
        this.requestCount = 0;
      }, 60000);
    }

    // Check if we've exceeded the rate limit
    if (this.requestCount >= config.rateLimits.maxRequestsPerMinute) {
      throw new Error('Rate limit exceeded. Please try again in a minute.');
    }

    // Enforce delay between messages
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < config.rateLimits.messageDelay) {
      await this.sleep(config.rateLimits.messageDelay - timeSinceLastRequest);
    }

    this.requestCount++;
    this.lastRequestTime = Date.now();
  }

  /**
   * Split response text into chunks
   * @param {string} text - Text to chunk
   * @returns {string[]} Array of text chunks
   */
  chunkResponse(text) {
    if (text.length <= this.maxChunkLength) {
      return [text];
    }

    const chunks = [];
    let currentChunk = '';
    
    // Split by sentences to avoid breaking mid-sentence
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > this.maxChunkLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      } else {
        currentChunk += ' ' + sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  /**
   * Format messages for the LLM prompt
   * @param {Array} messages - Array of Slack messages
   * @param {string} query - User's query
   * @returns {string} Formatted prompt
   */
  formatPrompt(messages, query) {
    // Format messages with metadata
    const formattedMessages = messages.map(msg => {
      const timestamp = new Date(msg.ts * 1000).toLocaleString();
      return `${msg.username} (${timestamp}): ${msg.text}`;
    }).join('\n\n');

    // Use template from config
    return config.prompts.messageContext
      .replace('{messages}', formattedMessages)
      .replace('{query}', query);
  }

  /**
   * Handle LLM API errors
   * @param {Error} error - The caught error
   * @param {number} retryCount - Current retry attempt
   * @returns {Promise<boolean>} Whether to retry the request
   */
  async handleError(error, retryCount) {
    // Check if we should retry
    const shouldRetry = retryCount < this.maxRetries && 
      (error.response?.status === 429 || // Rate limit
       error.response?.status === 500 || // Server error
       error.response?.status === 503 || // Service unavailable
       error.code === 'ECONNABORTED' || // Timeout
       error.code === 'ETIMEDOUT' || // Timeout
       error.code === 'ECONNRESET'); // Connection reset

    if (shouldRetry) {
      const delay = this.retryDelay * Math.pow(2, retryCount); // Exponential backoff
      console.log(`Retrying request after ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`);
      await this.sleep(delay);
      return true;
    }

    // Handle specific error cases
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error?.message || 'Unknown API error';
      
      if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a few moments.');
      } else if (status === 401) {
        throw new Error('Invalid API key. Please check your configuration.');
      } else if (status === 400) {
        throw new Error(`Invalid request: ${message}`);
      } else {
        throw new Error(`API error (${status}): ${message}`);
      }
    } else if (error.request) {
      throw new Error('Network error. Please check your connection and try again.');
    } else {
      throw new Error(`Error: ${error.message}`);
    }
  }

  /**
   * Summarize channel messages
   * @param {Array} messages - Array of Slack messages
   * @param {string} topic - User's query
   * @returns {Promise<string>} Summary text
   */
  async summarizeContext(messages, topic) {
    if (config.debugMode) {
      console.log('Debug mode: Bypassing LLM call');
      return `[DEBUG] Here's a test summary for "${topic}":\n\n` +
        messages.slice(0, 3).map(msg => 
          `- ${msg.username} (${new Date(msg.ts * 1000).toLocaleString()}): ${msg.text}`
        ).join('\n\n') +
        '\n\nThis is a debug response. Enable production mode to get real LLM summaries.';
    }
    throw new Error('summarizeContext must be implemented by the provider');
  }

  /**
   * Extract topics from text
   * @param {string} text - Text to analyze
   * @returns {Promise<string[]>} Array of topics
   */
  async extractTopics(text) {
    if (config.debugMode) {
      console.log('Debug mode: Bypassing LLM call');
      return ['debug-topic-1', 'debug-topic-2', 'debug-topic-3'];
    }
    throw new Error('extractTopics must be implemented by the provider');
  }

  /**
   * Extract topics from thread messages
   * @param {Array} messages - Array of Slack messages
   * @returns {Promise<string[]>} Array of up to 3 search topics
   */
  async extractSearchTopics(messages) {
    if (config.debugMode) {
      console.log('Debug mode: Bypassing LLM call');
      return ['debug-topic-1', 'debug-topic-2', 'debug-topic-3'];
    }

    const formattedMessages = messages.map(msg => 
      `${msg.username}: ${msg.text}`
    ).join('\n\n');

    const prompt = config.prompts.topicExtraction.replace('{text}', formattedMessages);
    
    const response = await this.callLLM(prompt);
    return response.split(',').map(t => t.trim()).slice(0, 3);
  }

  /**
   * Synthesize context from thread and related discussions
   * @param {Array} threadMessages - Current thread messages
   * @param {Array} relatedThreads - Array of related thread objects with messages and permalinks
   * @returns {Promise<string>} Formatted context summary
   */
  async synthesizeContext(threadMessages, relatedThreads) {
    if (config.debugMode) {
      console.log('Debug mode: Bypassing LLM call');
      return `[DEBUG] Here's a test context synthesis:\n\n` +
        `Current Thread Summary:\n` +
        threadMessages.slice(0, 2).map(msg => 
          `- ${msg.username}: ${msg.text}`
        ).join('\n') +
        '\n\nRelated Threads:\n' +
        relatedThreads.slice(0, 3).map(thread => 
          `• ${thread.permalink} - ${thread.messages[0].text.slice(0, 100)}...`
        ).join('\n');
    }

    const prompt = `Analyze the following thread and related discussions to provide context:

Current Thread:
${threadMessages.map(msg => `${msg.username}: ${msg.text}`).join('\n\n')}

Related Discussions:
${relatedThreads.map(thread => 
  `Thread: ${thread.permalink}\n${thread.messages.map(msg => `${msg.username}: ${msg.text}`).join('\n\n')}`
).join('\n\n')}

Please provide:
1. A brief summary of the current thread discussion
2. A list of the most relevant related discussions with brief descriptions
3. How these discussions connect to the current topic

Format the response in a clear, concise way that helps maintain conversation continuity.`;

    return await this.callLLM(prompt);
  }

  /**
   * Generate concise summaries for a list of threads
   * @param {Array} threads - Array of thread objects with messages
   * @param {string} searchTopic - The original search topic
   * @returns {Promise<Array>} Array of thread summaries with permalinks
   */
  async generateThreadSummaries(threads, searchTopic) {
    if (config.debugMode) {
      console.log('Debug mode: Bypassing LLM call');
      return threads.map(thread => ({
        permalink: thread.permalink,
        summary: `[DEBUG] Thread about ${searchTopic} with ${thread.messages.length} messages`
      }));
    }

    const prompt = `Analyze these Slack threads and provide a one-sentence summary for each that captures the key point or decision. Focus on what makes each thread unique and valuable.

Search Topic: "${searchTopic}"

Threads:
${threads.map(thread => 
  `Thread Messages:\n${thread.messages.map(msg => 
    `${msg.username}: ${msg.text}`
  ).join('\n\n')}`
).join('\n\n---\n\n')}

For each thread, provide:
1. A one-sentence summary that captures the key point or decision
2. The thread's permalink
3. A relevance score (0-1) based on how directly it addresses the search topic

Format each thread as:
Summary: [one sentence]
Link: [permalink]
Score: [0-1]

Sort threads by relevance score.`;

    const response = await this.callLLM(prompt);
    
    // Parse the response into structured data
    const summaries = [];
    const threadBlocks = response.split('\n\n---\n\n');
    
    for (const block of threadBlocks) {
      const summary = block.match(/Summary: (.*)/)?.[1];
      const link = block.match(/Link: (.*)/)?.[1];
      const score = parseFloat(block.match(/Score: (.*)/)?.[1] || '0');
      
      if (summary && link) {
        summaries.push({
          summary,
          permalink: link,
          relevanceScore: score
        });
      }
    }
    
    return summaries.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.requestResetTimeout) {
      clearInterval(this.requestResetTimeout);
      this.requestResetTimeout = null;
    }
  }
}

// Export a placeholder client that will be replaced with the actual provider implementation
module.exports = new LLMClient(); 