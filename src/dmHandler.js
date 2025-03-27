const { slackApiClient } = require('./slackApiClient');
const { llmClient } = require('./llmClient');

/**
 * Parses the DM text to extract action, topic, and timeframe
 * Example: "summarize 'release dates' from last 2 days"
 */
function parseDMText(text) {
  const parts = text.split(' ');
  const action = parts[0]?.toLowerCase();
  const topic = parts[1]?.replace(/['"]/g, '');
  const timeframe = parts.slice(2).join(' ');

  return { action, topic, timeframe };
}

/**
 * Formats search results for LLM context
 */
function formatSearchResultsForLLM(messages, topic) {
  const header = `Here are the recent messages about '${topic}':\n\n`;
  const formattedMessages = messages.map(msg => 
    `${msg.username} (${new Date(msg.ts * 1000).toLocaleString()}): ${msg.text}`
  ).join('\n\n');
  
  return header + formattedMessages;
}

/**
 * Formats LLM response for Slack DM
 */
function formatLLMResponseForDM(summary, topic, messageCount) {
  return {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Summary of messages about "${topic}"*\nFound ${messageCount} relevant messages.`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: summary
        }
      }
    ]
  };
}

/**
 * Handles direct messages to the bot
 */
async function handleDirectMessage({ event, client }) {
  try {
    // Parse the message text
    const { action, topic, timeframe } = parseDMText(event.text);

    // Validate message format
    if (!action || !topic) {
      await client.chat.postMessage({
        channel: event.user,
        text: "Please provide a valid query. Example: `summarize 'release dates' from last 2 days`"
      });
      return;
    }

    // Build search query
    const searchQuery = `"${topic}" ${timeframe}`;

    // Search for messages
    const messages = await slackApiClient.searchMessages(searchQuery);
    
    if (!messages || messages.length === 0) {
      await client.chat.postMessage({
        channel: event.user,
        text: `No messages found matching your query for "${topic}"`
      });
      return;
    }

    // Format messages for LLM context
    const context = formatSearchResultsForLLM(messages, topic);

    // Get LLM summary
    const summary = await llmClient.summarizeContext(context);

    // Format and send response
    const response = formatLLMResponseForDM(summary, topic, messages.length);
    await client.chat.postMessage({
      channel: event.user,
      ...response
    });

  } catch (error) {
    console.error('Error handling direct message:', error);
    await client.chat.postMessage({
      channel: event.user,
      text: `Error processing your request: ${error.message}`
    });
  }
}

module.exports = {
  handleDirectMessage
}; 