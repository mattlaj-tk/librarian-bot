const { App } = require('@slack/bolt');
// Load environment variables FIRST, before requiring any other modules
require('dotenv').config();
// Now require other modules that might use environment variables
const config = require('../config/config');

// Import command handlers
const { registerSlashCommands } = require('./slashCommands');
const { handleDirectMessage } = require('./dmHandler');

// Log environment variables (without sensitive data)
console.log('Environment check:');
console.log('- SLACK_BOT_TOKEN:', process.env.SLACK_BOT_TOKEN ? 'Present' : 'Missing');
console.log('- SLACK_SIGNING_SECRET:', process.env.SLACK_SIGNING_SECRET ? 'Present' : 'Missing');
console.log('- SLACK_APP_TOKEN:', process.env.SLACK_APP_TOKEN ? 'Present' : 'Missing');
console.log('- LLM_API_KEY:', process.env.LLM_API_KEY ? 'Present' : 'Missing');
console.log('- ALLOWED_CHANNEL_IDS:', process.env.ALLOWED_CHANNEL_IDS ? `Present (${config.allowedChannels.length} channels)` : 'Missing');
console.log('- ALLOW_ALL_PUBLIC_CHANNELS:', process.env.ALLOW_ALL_PUBLIC_CHANNELS);
console.log('- ALLOW_PRIVATE_CHANNELS:', process.env.ALLOW_PRIVATE_CHANNELS);
console.log('- APP_MODE:', process.env.APP_MODE || 'socket');
console.log('- PORT:', process.env.PORT || '3000');
console.log('- Debug Mode:', config.debugMode ? 'Enabled' : 'Disabled');

// Determine if we're running in socket mode or HTTP mode
const isSocketMode = (process.env.APP_MODE || 'socket') === 'socket';
console.log(`Starting in ${isSocketMode ? 'Socket Mode (development)' : 'HTTP Mode (production)'}`);

// Initialize the app with the appropriate configuration
let appConfig = {
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
};

if (isSocketMode) {
  // Socket Mode configuration (for development)
  appConfig.socketMode = true;
  appConfig.appToken = process.env.SLACK_APP_TOKEN;
} else {
  // HTTP Mode configuration (for production)
  appConfig.port = parseInt(process.env.PORT || '3000');
}

const app = new App(appConfig);

// Request logging middleware
app.use(async ({ event, body, next }) => {
  const start = Date.now();
  
  // Log different types of events
  if (event) {
    console.log(`Received event:`, {
      type: event.type,
      command: event.command,
      text: event.text,
      channel: event.channel,
      user: event.user
    });
  } else if (body) {
    console.log(`Received body:`, {
      type: body.type,
      command: body.command,
      text: body.text,
      channel: body.channel_id,
      user: body.user_id
    });
  }
  
  try {
    await next();
    const duration = Date.now() - start;
    console.log(`Processed request in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`Error processing request after ${duration}ms:`, error);
    throw error;
  }
});

// Enhanced error handling
app.error(async (error) => {
  console.error('An error occurred:', error);
  
  // Log additional context if available
  if (error.data) {
    console.error('Error data:', error.data);
  }
  if (error.original) {
    console.error('Original error:', error.original);
  }
  
  // Handle specific error types
  if (error.code === 'slack_webapi_platform_error') {
    console.error('Slack API error:', error.data);
  }
});

// Register command handlers
registerSlashCommands(app);

// Register button click handlers
app.action('view_thread', async ({ body, ack, client }) => {
  // Acknowledge the action request
  await ack();
  
  // Get user and channel info
  const userId = body?.user?.id;
  const channelId = body?.channel?.id;
  const value = body?.actions?.[0]?.value; // Get URL from value
  
  console.log(`Thread button clicked by user ${userId} in channel ${channelId}`);
  
  if (value) {
    console.log(`Button URL value: ${value}`);
    
    // Inform the user their action was received
    try {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "Opening thread in a new tab..."
      });
    } catch (error) {
      console.error('Error sending confirmation:', error);
    }
  } else {
    console.log('No URL value found in button click');
  }
});

app.action('view_related_thread', async ({ body, ack, client }) => {
  // Acknowledge the action request
  await ack();
  
  // Get user and channel info
  const userId = body?.user?.id;
  const channelId = body?.channel?.id;
  const value = body?.actions?.[0]?.value; // Get URL from value
  
  console.log(`Related thread button clicked by user ${userId} in channel ${channelId}`);
  
  if (value) {
    console.log(`Button URL value: ${value}`);
    
    // Inform the user their action was received
    try {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "Opening related thread in a new tab..."
      });
    } catch (error) {
      console.error('Error sending confirmation:', error);
    }
  } else {
    console.log('No URL value found in button click');
  }
});

// Register DM handler
app.message(async ({ event, client }) => {
  // Only handle messages in DM channels
  if (event.channel_type === 'im') {
    await handleDirectMessage({ event, client });
  }
});

// Start the app
(async () => {
  try {
    await app.start();
    if (isSocketMode) {
      console.log('⚡️ Bolt app is running in Socket Mode!');
    } else {
      console.log(`⚡️ Bolt app is running in HTTP Mode on port ${appConfig.port}!`);
    }
  } catch (error) {
    console.error('Unable to start app:', error);
  }
})(); 