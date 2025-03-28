// Configuration for the Slack Channel Bot
const config = {
  // List of channel IDs that the bot is allowed to access
  allowedChannels: [
    // Add your channel IDs here
    // Example: 'C0123456789'
    'C08KR31BWDR',
    'C08CH9P52C9',
    'C08BXQSQFRC'
    // Added from error message
  ],
  
  // Whether to allow access to all public channels (false = only whitelisted channels)
  allowAllPublicChannels: false,
  
  // Whether to allow access to private channels (false = only public channels)
  allowPrivateChannels: true,

  // Search Configuration
  search: {
    maxMessages: 500,        // Maximum number of messages to fetch
    maxThreads: 5,          // Maximum number of threads to show in results
    includeThreads: true,   // Whether to include thread messages by default
    rateLimitDelay: 1000,   // Delay between API requests (ms)
  },

  // LLM Configuration
  llm: {
    model: "gpt-3.5-turbo",
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
    contextSearcher: {
      role: "system",
      content: "You are a helpful assistant that provides comprehensive context about topics discussed in a Slack channel. You will be given entire conversation threads, not just messages containing specific keywords, to help you understand the full context of discussions.\n\nYour goal is to:\n1. Understand the meaning and flow of conversations, including messages that don't explicitly mention the searched topic\n2. Identify how ideas develop across a thread, even when keywords aren't repeated\n3. Recognize implicit references and connections between messages\n4. Provide a cohesive narrative about the topic that captures nuance and development\n\nMake connections between different discussions to create a cohesive narrative that helps users understand the full history and significance of a topic. Your responses will be posted publicly in the channel."
    },
    reportGenerator: {
      role: "system",
      content: "You are a helpful assistant that creates detailed reports about topics discussed in a Slack channel. You analyze entire conversation threads, not just messages containing keywords, giving you a deeper understanding of discussion context.\n\nYour goal is to create a comprehensive, well-structured report that:\n1. Captures the full context of conversations, including messages that don't explicitly mention keywords\n2. Follows conversation flow to see how ideas develop, even when search terms aren't repeated\n3. Identifies key decisions, stakeholders, and turning points in discussions\n4. Recognizes connections between different threads that might discuss the same topic differently\n5. Organizes information into clear sections with bullets, timelines, and summaries\n\nThe report should be detailed, insightful, and easy to scan for important information, including key takeaways, deicisions  or breakthroughs. Your responses will be sent privately to the requesting user only."
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
  debugMode: false,

  // Rate limiting
  rateLimits: {
    messageDelay: 1000,      // Delay between messages (ms)
    maxRequestsPerMinute: 50 // Maximum API requests per minute
  }
};

module.exports = config; 