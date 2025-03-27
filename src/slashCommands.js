const SlackApiClient = require('./slackApiClient');
const LLMClient = require('./llmClient');
require('dotenv').config();

// Initialize clients
const slackApiClient = new SlackApiClient(process.env.SLACK_BOT_TOKEN);
const llmClient = new LLMClient(process.env.LLM_API_KEY);

/**
 * Parses the command text to extract action, topic, and timeframe
 * Examples:
 * - "/librarian tell me more about 'release dates'"
 * - "/librarian add context"
 */
function parseCommand(commandText) {
  // Handle empty command text
  if (!commandText || commandText.trim() === '') {
    return { action: null, topic: null };
  }

  const parts = commandText.trim().split(' ');
  const action = parts[0]?.toLowerCase();
  
  if (action === 'tell') {
    // Handle "tell me more about X" format
    const topicMatch = commandText.match(/about ['"]([^'"]+)['"]/);
    const topic = topicMatch ? topicMatch[1] : null;
    return { action: 'tell', topic };
  } else if (action === 'add') {
    // Handle "add context" format
    return { action: 'add_context' };
  }

  return { action, topic: null };
}

/**
 * Formats search results for LLM context with message links
 */
function formatSearchResultsForLLM(messages, topic) {
  const header = `Here are the recent messages about '${topic}':\n\n`;
  const formattedMessages = messages.map(msg => {
    const timestamp = new Date(msg.ts * 1000).toLocaleString();
    const messageLink = `<${msg.permalink}|View message>`;
    return `${msg.username} (${timestamp}): ${msg.text}\n${messageLink}`;
  }).join('\n\n');
  
  return header + formattedMessages;
}

/**
 * Formats thread context for LLM
 */
function formatThreadContextForLLM(threadMessages, relatedMessages) {
  const header = "Current thread discussion:\n\n";
  const threadContent = threadMessages.map(msg => 
    `${msg.username} (${new Date(msg.ts * 1000).toLocaleString()}): ${msg.text}`
  ).join('\n\n');

  const relatedHeader = "\nRelated discussions from the channel:\n\n";
  const relatedContent = relatedMessages.map(msg => {
    const timestamp = new Date(msg.ts * 1000).toLocaleString();
    const messageLink = `<${msg.permalink}|View message>`;
    return `${msg.username} (${timestamp}): ${msg.text}\n${messageLink}`;
  }).join('\n\n');

  return header + threadContent + relatedHeader + relatedContent;
}

/**
 * Formats LLM response for Slack
 */
function formatLLMResponseForSlack(summary, topic, messageCount, isChunk = false, chunkIndex = 0, totalChunks = 1) {
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: topic 
          ? `*Summary of messages about "${topic}"*\nFound ${messageCount} relevant messages.`
          : "*Additional Context for Thread*"
      }
    }
  ];

  // Add chunk indicator if this is a chunked response
  if (isChunk) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Part ${chunkIndex + 1} of ${totalChunks}*`
      }
    });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: summary
    }
  });

  return { blocks };
}

/**
 * Handles the "tell me more about X" command
 */
async function handleTellMeMoreCommand({ command, ack, respond, topic }) {
  await ack();

  try {
    // First check if user is a member of the channel
    const isMember = await slackApiClient.isMember(command.user_id, command.channel_id);
    if (!isMember) {
      await respond({
        response_type: 'ephemeral',
        text: "You are not authorized to view or search this channel's messages."
      });
      return;
    }

    // Then validate channel access
    try {
      await slackApiClient.validateChannelAccess(command.channel_id);
    } catch (error) {
      if (error.message.includes('not allowed')) {
        await respond({
          response_type: 'ephemeral',
          text: "This channel is not configured for use with the librarian bot."
        });
        return;
      }
      throw error;
    }

    // Build search query
    const searchQuery = `in:${command.channel_id} "${topic}"`;
    const messages = await slackApiClient.searchMessages(searchQuery);
    
    if (!messages || messages.length === 0) {
      await respond({
        response_type: 'ephemeral',
        text: `No messages found matching your query for "${topic}"`
      });
      return;
    }

    // Format messages for LLM context
    const context = formatSearchResultsForLLM(messages, topic);

    // Get LLM summary
    const summaryChunks = await llmClient.summarizeContext(context);

    // Send each chunk as a separate message
    for (let i = 0; i < summaryChunks.length; i++) {
      const response = formatLLMResponseForSlack(
        summaryChunks[i],
        topic,
        messages.length,
        summaryChunks.length > 1,
        i,
        summaryChunks.length
      );

      await respond({
        response_type: 'ephemeral',
        ...response
      });

      if (i < summaryChunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

  } catch (error) {
    console.error('Error handling tell me more command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `Error processing your request: ${error.message}`
    });
  }
}

/**
 * Handles the "add context" command for threads
 */
async function handleAddContextCommand({ command, ack, respond }) {
  await ack();

  try {
    // First validate channel access
    await slackApiClient.validateChannelAccess(command.channel_id);

    // Then check if user is a member of the channel
    const isMember = await slackApiClient.isMember(command.user_id, command.channel_id);
    if (!isMember) {
      await respond({
        response_type: 'ephemeral',
        text: "You are not authorized to view or search this channel's messages."
      });
      return;
    }

    // Get the thread messages
    const threadMessages = await slackApiClient.getThreadMessages(command.channel_id, command.thread_ts || command.ts);
    
    if (!threadMessages || threadMessages.length === 0) {
      await respond({
        response_type: 'ephemeral',
        text: "No thread messages found."
      });
      return;
    }

    // Extract key topics from the thread
    const threadText = threadMessages.map(msg => msg.text).join(' ');
    const topics = await llmClient.extractTopics(threadText);

    // Search for related messages
    const relatedMessages = [];
    for (const topic of topics) {
      const searchQuery = `in:${command.channel_id} "${topic}" -thread_ts:${command.thread_ts || command.ts}`;
      const messages = await slackApiClient.searchMessages(searchQuery);
      if (messages && messages.length > 0) {
        relatedMessages.push(...messages);
      }
    }

    if (relatedMessages.length === 0) {
      await respond({
        response_type: 'ephemeral',
        text: "No related discussions found in the channel."
      });
      return;
    }

    // Format context for LLM
    const context = formatThreadContextForLLM(threadMessages, relatedMessages);

    // Get LLM summary
    const summaryChunks = await llmClient.summarizeContext(context);

    // Send each chunk as a separate message
    for (let i = 0; i < summaryChunks.length; i++) {
      const response = formatLLMResponseForSlack(
        summaryChunks[i],
        null,
        relatedMessages.length,
        summaryChunks.length > 1,
        i,
        summaryChunks.length
      );

      await respond({
        response_type: 'ephemeral',
        ...response
      });

      if (i < summaryChunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

  } catch (error) {
    console.error('Error handling add context command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `Error processing your request: ${error.message}`
    });
  }
}

/**
 * Handles the /librarian slash command
 */
async function handleLibrarianCommand({ command, ack, respond }) {
  try {
    // Always acknowledge the command first
    await ack();

    const { action, topic } = parseCommand(command.text);

    // Validate command format
    if (!action) {
      await respond({
        response_type: 'ephemeral',
        text: "Please provide a valid command. Examples:\n" +
              "• `/librarian tell me more about 'release dates'`\n" +
              "• `/librarian add context` (in a thread)"
      });
      return;
    }

    switch (action) {
      case 'tell':
        if (!topic) {
          await respond({
            response_type: 'ephemeral',
            text: "Please specify a topic. Example: `/librarian tell me more about 'release dates'`"
          });
          return;
        }
        await handleTellMeMoreCommand({ command, ack, respond, topic });
        break;

      case 'add_context':
        // Check if we're in a thread
        const threadTs = command.thread_ts || command.ts;
        if (!threadTs) {
          await respond({
            response_type: 'ephemeral',
            text: "This command must be used in a thread. Reply to a message with `/librarian add context`"
          });
          return;
        }
        await handleAddContextCommand({ command, ack, respond });
        break;

      default:
        await respond({
          response_type: 'ephemeral',
          text: "Unknown command. Available commands:\n" +
                "• `/librarian tell me more about 'topic'`\n" +
                "• `/librarian add context` (in a thread)"
        });
    }
  } catch (error) {
    console.error('Error handling librarian command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `Error processing your request: ${error.message}`
    });
  }
}

/**
 * Registers all slash commands with the Slack app
 */
function registerSlashCommands(app) {
  try {
    console.log('Registering slash commands...');
    app.command('/librarian', async ({ command, ack, respond }) => {
      console.log('Received librarian command:', {
        command: command.command,
        text: command.text,
        channel: command.channel_id,
        user: command.user_id
      });
      
      try {
        await handleLibrarianCommand({ command, ack, respond });
      } catch (error) {
        console.error('Error in librarian command handler:', error);
        await respond({
          response_type: 'ephemeral',
          text: `Error processing your request: ${error.message}`
        });
      }
    });
    console.log('Slash commands registered successfully');
  } catch (error) {
    console.error('Error registering slash commands:', error);
    throw error;
  }
}

module.exports = {
  registerSlashCommands,
  handleLibrarianCommand,
  parseCommand,
  formatSearchResultsForLLM,
  formatThreadContextForLLM,
  formatLLMResponseForSlack
}; 