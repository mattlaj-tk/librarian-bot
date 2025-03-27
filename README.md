# Slack Channel Bot

<div align="center" style="margin-bottom: 2rem;">
  <img 
    src="docs/assets/bot-profile.webp" 
    alt="Slack Channel Bot Profile Picture" 
    width="200" 
    height="200" 
    style="
      border-radius: 50%;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      border: 4px solid #ffffff;
      margin-bottom: 1rem;
    "
  />
  <p style="color: #666; font-size: 0.9rem; margin-top: 0.5rem;">
    Your AI-powered Slack channel assistant
  </p>
</div>

A Slack bot that answers questions about channel history using LLM (Large Language Model).

## Features

- Search and summarize channel messages using natural language
- Access control to ensure only channel members can query the channel
- Uses Slack's conversations API for reliable message search
- Powered by LLM for intelligent summarization
- Thread context analysis and related discussion linking
- Private DM support for discreet queries
- Client-side message filtering for precise search results

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_SIGNING_SECRET=your-signing-secret
   SLACK_APP_TOKEN=xapp-your-app-token
   LLM_API_KEY=your-llm-api-key
   LLM_API_URL=https://api.openai.com/v1/chat/completions
   ```
4. Configure your Slack App in the [Slack Developer Portal](https://api.slack.com/apps):
   - Create a new app
   - Add bot user
   - Configure OAuth scopes:
     - `channels:history` (for public channels)
     - `groups:history` (for private channels)
     - `chat:write` (for responses)
     - `commands` (for slash commands)
     - `channels:read` (for channel access validation)
     - `groups:read` (for private channel access validation)
     - `im:read` (for DM support)
   - Enable Socket Mode in app settings
   - Create slash command `/librarian`
   - Install app to workspace
   - Copy Bot User OAuth Token, Signing Secret, and App Token to `.env`

## Usage

The bot provides an intuitive interface through slash commands and interactive components:

### 1. Quick Search
```
/librarian
```
This opens an interactive modal where you can:
- Enter your search topic
- Select the time range (last 24h, 7d, 30d)
- Choose to include thread messages
- Preview results before sending

### 2. Direct Topic Search
```
/librarian search <topic>
```
For quick searches without the modal:
```
/librarian search release dates
/librarian search "bug fix"
```

### 3. Thread Context
```
/librarian context
```
When used in a thread, the bot will:
1. Analyze the current thread discussion
2. Find related discussions in the channel
3. Provide additional context and links to relevant messages
4. Help maintain conversation continuity

### 4. Direct Message Queries
DM the bot directly to ask questions about channels you're a member of:
```
summarize release dates from last 2 days
```
The bot will:
1. Verify your membership in the queried channel
2. Search and summarize relevant messages
3. Respond privately in the DM conversation

### Command Examples

1. **Basic Search**:
   ```
   /librarian search release dates
   ```

2. **Search with Time Range**:
   ```
   /librarian search "bug fix" --time 7d
   ```

3. **Thread Context**:
   ```
   /librarian context
   ```
   (Must be used within a thread)

4. **Interactive Search**:
   ```
   /librarian
   ```
   (Opens interactive modal)

### Interactive Components

The bot uses Slack's Block Kit to provide a rich, interactive experience:

1. **Search Modal**:
   - Topic input field
   - Time range selector
   - Thread inclusion toggle
   - Preview section
   - Search button

2. **Results View**:
   - Collapsible sections
   - Message permalinks
   - Thread expansion
   - Related topics
   - Action buttons for follow-up

3. **Error Handling**:
   - Clear error messages
   - Suggestions for correction
   - Help button for guidance

### Command Best Practices

1. **Shortcuts**:
   - `/librarian` for full interface
   - `/librarian search` for quick search
   - `/librarian context` for thread context

2. **Natural Language**:
   - Support for quoted and unquoted topics
   - Optional time range specification
   - Flexible word order

3. **Feedback**:
   - Immediate acknowledgment
   - Progress indicators
   - Clear error messages
   - Helpful suggestions

4. **Accessibility**:
   - Keyboard navigation
   - Screen reader support
   - High contrast options
   - Clear visual hierarchy

## Search Behavior

The bot uses Slack's `conversations.history` API to fetch messages and performs client-side filtering to find relevant content. This approach:
- Ensures reliable and consistent search results
- Works with the most recent 100 messages in the channel
- Uses exact text matching for precise results
- Maintains message permalinks for easy reference

## Development

### Local Development Setup

The bot uses Slack's Socket Mode for development, which means:
- No need for a public URL or ngrok
- Real-time messaging using WebSockets
- Secure communication with Slack's APIs
- Easier local development and testing

1. **Enable Socket Mode**:
   - Go to your [Slack App settings](https://api.slack.com/apps)
   - Navigate to "Socket Mode"
   - Enable Socket Mode
   - Generate an App-Level Token with `connections:write` scope
   - Add the token to your `.env` file as `SLACK_APP_TOKEN`

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   ```bash
   # Copy example env file
   cp .env.example .env
   
   # Edit .env with your tokens
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_SIGNING_SECRET=your-signing-secret
   SLACK_APP_TOKEN=xapp-your-app-token
   LLM_API_KEY=your-llm-api-key
   LLM_API_URL=https://api.openai.com/v1/chat/completions
   ```

4. **Start Development Server**:
   ```bash
   # Start the bot in development mode
   npm run dev
   
   # Or using node directly
   node src/server.js
   ```

### Debug Mode

The bot includes a debug mode that can be enabled in `config/config.js`:
```javascript
{
  debugMode: true,  // Enable debug responses
  // ... other config options
}
```

When debug mode is enabled:
- LLM calls are bypassed
- Predefined debug responses are returned
- Faster testing of bot functionality
- No API costs during development

### Testing Commands

Once running, you can test the bot with:

1. **Topic Search**:
   ```
   /librarian tell me more about 'your topic'
   ```

2. **Thread Context**:
   ```
   /librarian add context
   ```
   (Must be used within a thread)

3. **Direct Messages**:
   - Open a DM with your bot
   - Type: `summarize 'topic' from last 2 days`

### Monitoring

The bot includes built-in monitoring:
- Request logging for all Slack interactions
- Rate limit tracking for LLM API calls
- Error handling with retries
- Debug logging in development mode

View logs in your terminal:
```bash
# Show only error logs
npm run dev | grep ERROR

# Show all logs
npm run dev
```

### Rate Limiting

The bot implements rate limiting to prevent API abuse:
- Configurable requests per minute
- Delay between messages
- Exponential backoff for retries

Adjust these in `config/config.js`:
```javascript
{
  rateLimits: {
    messageDelay: 1000,      // Delay between messages (ms)
    maxRequestsPerMinute: 50 // Maximum API requests per minute
  }
}
```

### Prompt Development

All LLM prompts are configured in `config/config.js`. To modify bot behavior:
1. Edit the prompts in the config file
2. Restart the bot
3. Test with debug mode enabled
4. Deploy changes when satisfied

No code changes required for prompt adjustments.

## Configuration Management

The bot's behavior is controlled through `config/config.js`. This centralized configuration allows you to modify the bot's behavior without changing code.

### Channel Access Control

Control which channels the bot can access:

```javascript
{
  // List of channel IDs that the bot is allowed to access
  allowedChannels: [
    // Add your channel IDs here
    'C0123456789',  // #general
    'C9876543210'   // #team-updates
  ],
  
  // Whether to allow access to all public channels
  allowAllPublicChannels: false,
  
  // Whether to allow access to private channels
  allowPrivateChannels: true
}
```

#### Channel Whitelisting Options:

1. **Specific Channels Only**:
   ```javascript
   {
     allowedChannels: ['C0123456789'],
     allowAllPublicChannels: false,
     allowPrivateChannels: false
   }
   ```
   - Bot only works in listed channels
   - Most restrictive option
   - Good for testing or limited deployments

2. **All Public Channels**:
   ```javascript
   {
     allowedChannels: [],
     allowAllPublicChannels: true,
     allowPrivateChannels: false
   }
   ```
   - Bot works in all public channels
   - No access to private channels
   - Good for general deployment

3. **Public + Selected Private**:
   ```javascript
   {
     allowedChannels: ['C0123456789'], // private channel
     allowAllPublicChannels: true,
     allowPrivateChannels: true
   }
   ```
   - Bot works in all public channels
   - Only works in whitelisted private channels
   - Good for mixed-use cases

### Finding Channel IDs

To get a channel's ID:
1. Open Slack in a browser
2. Navigate to the channel
3. The channel ID is in the URL: `https://app.slack.com/client/TXXXXXX/C0123456789`
   - The ID starting with 'C' is your channel ID

Or use the bot to find channel IDs:
```bash
# List all accessible channels and their IDs
/librarian list channels

# Get current channel ID
/librarian channel info
```

### Complete Configuration Options

```javascript
const config = {
  // Channel Access
  allowedChannels: ['C0123456789'],
  allowAllPublicChannels: false,
  allowPrivateChannels: true,

  // LLM Settings
  llm: {
    maxTokens: 4000,          // Context window size
    maxResponseTokens: 500,   // Maximum response length
    maxRetries: 3,           // API retry attempts
    retryDelay: 1000,        // Base delay between retries (ms)
    maxChunkLength: 3000,    // Max characters per response
    temperature: 0.7,        // Response creativity (0-1)
    topicTemperature: 0.3    // Topic extraction creativity
  },

  // Rate Limiting
  rateLimits: {
    messageDelay: 1000,      // Delay between messages (ms)
    maxRequestsPerMinute: 50 // Maximum API requests per minute
  },

  // Prompts
  prompts: {
    // System prompts
    summarizer: {
      role: "system",
      content: "You are a helpful assistant..."
    },
    topicExtractor: {
      role: "system",
      content: "You are a helpful assistant..."
    },
    // Message templates
    messageContext: `Here are the relevant messages...`,
    topicExtraction: `Analyze the following text...`
  },

  // Debug Mode
  debugMode: false
};
```

### Applying Configuration Changes

1. Edit `config/config.js`
2. Save the file
3. Restart the bot:
   ```bash
   # Stop the current process
   Ctrl + C

   # Start the bot again
   npm run dev
   ```
4. Test the changes
5. Monitor logs for any issues