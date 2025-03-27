// Configuration for allowed channels
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

  // Debug mode - when true, bypasses LLM and returns debug responses
  debugMode: true
};

module.exports = config; 