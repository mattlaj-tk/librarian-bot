// Configuration for the Slack Channel Bot
const config = {
  // List of channel IDs that the bot is allowed to access
  allowedChannels: [
    // Add your channel IDs here
    // Example: 'C0123456789'
    'C08KR31BWDR'
  ],
  
  // Whether to allow access to all public channels (false = only whitelisted channels)
  allowAllPublicChannels: false,
  
  // Whether to allow access to private channels (false = only public channels)
  allowPrivateChannels: true,

  // LLM Configuration
  llm: {
    maxTokens: 4000,          // GPT-3.5-turbo's context window
    maxResponseTokens: 500,   // Maximum tokens in response
    maxRetries: 3,           // Maximum number of retry attempts
    retryDelay: 1000,        // Base delay between retries (ms)
    maxChunkLength: 3000,    // Maximum characters per response chunk
    temperature: 0.7,        // LLM temperature for summaries
    topicTemperature: 0.3    // LLM temperature for topic extraction
  },

  // Prompt Templates
  prompts: {
    // System prompts
    summarizer: {
      role: "system",
      content: "You are a helpful assistant that summarizes Slack channel messages. You analyze the most recent messages from the channel that match the user's query. Focus on providing concise, relevant information that directly addresses the user's query. Note that you can only see the most recent messages (up to 100) that contain the search terms."
    },
    topicExtractor: {
      role: "system",
      content: "You are a helpful assistant that extracts key topics from text. Focus on specific, actionable topics that can be used for search queries."
    },

    // User prompt templates
    messageContext: `Here are the relevant messages from the Slack channel:

{messages}

User Query: "{query}"

Please provide a concise summary of the key points that address the user's query.`,

    topicExtraction: `Analyze the following text and extract 2-3 main topics or themes being discussed. Return them as a comma-separated list of short phrases (2-4 words each). Focus on specific, searchable terms that are likely to appear in messages, as the search uses exact text matching.

Text:
{text}

Topics:`,
  },

  // Debug mode - when true, bypasses LLM and returns debug responses
  debugMode: true,

  // Rate limiting
  rateLimits: {
    messageDelay: 1000,      // Delay between messages (ms)
    maxRequestsPerMinute: 50 // Maximum API requests per minute
  }
};

module.exports = config; 