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
   * Parse a response from the LLM into structured thread summaries
   * @param {string} response - The raw response from the LLM
   * @param {Array} threads - Original threads (for fallback)
   * @returns {Array} Parsed summaries
   */
  parseResponse(response, threads) {
    const summaries = [];
    
    // Log the raw response for debugging
    console.log("Raw LLM response:", response);
    
    try {
      // First try to split by standard separators
      const blockRegex = /Summary:\s*(.*?)\s*(?:Link|URL|Permalink):\s*(.*?)\s*(?:Score|Relevance):\s*([\d.]+)/gs;
      let match;
      
      while ((match = blockRegex.exec(response)) !== null) {
        const summary = match[1]?.trim();
        const permalink = match[2]?.trim();
        const score = parseFloat(match[3] || "0.5");
        
        if (summary) {
          summaries.push({
            summary,
            permalink: permalink || threads[0]?.permalink || "https://slack.com",
            relevanceScore: isNaN(score) ? 0.5 : score
          });
        }
      }
      
      // If we couldn't extract any summaries, try a simpler approach
      if (summaries.length === 0) {
        // Split by double newlines or other common separators
        const blocks = response.split(/\n\n+|\r\n\r\n+|---+/);
        
        blocks.forEach(block => {
          const summaryMatch = block.match(/Summary:\s*(.*?)(?:\n|$)/);
          const linkMatch = block.match(/(?:Link|URL|Permalink):\s*(.*?)(?:\n|$)/);
          const scoreMatch = block.match(/(?:Score|Relevance):\s*([\d.]+)(?:\n|$)/);
          
          if (summaryMatch && summaryMatch[1]) {
            summaries.push({
              summary: summaryMatch[1].trim(),
              permalink: (linkMatch && linkMatch[1]) ? linkMatch[1].trim() : (threads[0]?.permalink || "https://slack.com"),
              relevanceScore: scoreMatch && !isNaN(parseFloat(scoreMatch[1])) ? parseFloat(scoreMatch[1]) : 0.5
            });
          }
        });
      }
    } catch (error) {
      console.error("Error parsing LLM response:", error);
    }
    
    // If we still couldn't parse anything, use fallback summaries
    if (summaries.length === 0) {
      console.log("Using fallback summaries due to parsing failure");
      return threads.slice(0, 3).map((thread, index) => ({
        summary: `Thread with ${thread.messages?.length || 0} messages`,
        permalink: thread.permalink || "https://slack.com",
        relevanceScore: 0.9 - (index * 0.2)
      }));
    }
    
    return summaries;
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
      
      // Create valid debug thread summaries
      return threads.slice(0, 3).map((thread, index) => {
        // Ensure we have valid permalink and summary
        return {
          summary: `[DEBUG] This is a sample thread about "${searchTopic}" with ${thread.messages?.length || 0} messages.`,
          permalink: thread.permalink || "https://slack.com",
          relevanceScore: 0.9 - (index * 0.2)
        };
      });
    }

    try {
      // Before calling LLM, prepare a list of permalinks to match with threads
      const threadPermalinks = threads.map((thread, index) => {
        return {
          index: index,
          permalink: thread.permalink || `https://slack.com/thread-${index}`
        };
      });
      
      const prompt = `Analyze these Slack threads and provide a one-sentence summary for each that captures the key point or decision. Focus on what makes each thread unique and valuable.

Search Topic: "${searchTopic}"

${threads.map((thread, index) => 
  `Thread ${index+1}:
Permalink: ${threadPermalinks[index].permalink}
Messages:
${thread.messages.map(msg => 
    `${msg.username || 'User'}: ${msg.text || 'No text'}`
  ).join('\n\n')}`
).join('\n\n---\n\n')}

For each thread, provide:
1. A one-sentence summary that captures the key point or decision
2. The exact permalink as provided above (do not replace with placeholders)
3. A relevance score (0-1) based on how directly it addresses the search topic

Format each thread as:
Summary: [one sentence]
Link: [exact permalink from above]
Score: [0-1]

Sort threads by relevance score.`;

      console.log('Calling LLM with prompt:', prompt.substring(0, 200) + '...');
      const response = await this.callLLM(prompt);
      
      // Parse the response but also ensure permalinks are valid
      const summaries = this.parseResponse(response, threads);
      
      // Validate permalinks and replace any invalid ones
      return summaries.map((summary, index) => {
        // Check if permalink is valid - must be a real URL, not a placeholder
        const isValidUrl = summary.permalink && 
                          typeof summary.permalink === 'string' && 
                          (summary.permalink.startsWith('http://') || 
                           summary.permalink.startsWith('https://')) &&
                          !summary.permalink.includes('[') &&
                          !summary.permalink.includes(']');
        
        // If invalid, replace with the original thread permalink
        if (!isValidUrl) {
          const threadIndex = Math.min(index, threads.length - 1);
          summary.permalink = threads[threadIndex].permalink || `https://slack.com/thread-${threadIndex}`;
        }
        
        return summary;
      });
    } catch (error) {
      console.error('Error generating thread summaries:', error);
      
      // Return fallback summaries in case of error
      return threads.slice(0, 3).map((thread, index) => ({
        summary: `Thread about "${searchTopic}" with ${thread.messages?.length || 0} messages.`,
        permalink: thread.permalink || "https://slack.com", 
        relevanceScore: 0.9 - (index * 0.2)
      }));
    }
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

// Export the LLMClient class
module.exports = LLMClient; 