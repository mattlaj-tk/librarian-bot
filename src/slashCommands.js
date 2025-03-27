const { createSearchModal, createResultsView, createErrorView, createHelpView } = require('./components/blockKit');
const { searchMessages, getThreadMessages } = require('./slackApiClient');
const { summarizeContext } = require('./llmClient');

// Register slash command handlers with the app
const registerSlashCommands = (app) => {
  app.command('/librarian', handleSlashCommand);
};

const handleSlashCommand = async ({ command, ack, client, body }) => {
  await ack();

  const { text, channel_id, user_id } = command;

  // Handle empty command (opens modal)
  if (!text) {
    try {
      await client.views.open({
        trigger_id: body.trigger_id,
        view: createSearchModal()
      });
      return;
    } catch (error) {
      console.error('Error opening modal:', error);
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        ...createErrorView('Failed to open search interface')
      });
      return;
    }
  }

  // Parse command arguments
  const args = text.split(' ');
  const commandType = args[0].toLowerCase();

  switch (commandType) {
    case 'search':
      await handleSearchCommand(args.slice(1), channel_id, user_id, client);
      break;
    case 'context':
      await handleContextCommand(channel_id, user_id, client);
      break;
    case 'help':
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        ...createHelpView()
      });
      break;
    default:
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        ...createErrorView('Invalid command. Use /librarian help for usage information.')
      });
  }
};

const handleSearchCommand = async (args, channel_id, user_id, client) => {
  try {
    // Parse arguments
    const options = {
      timeRange: '24h',
      includeThreads: true
    };

    let topic = '';
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--time' && args[i + 1]) {
        options.timeRange = args[i + 1];
        i++;
      } else if (args[i] === '--no-threads') {
        options.includeThreads = false;
      } else {
        topic += (topic ? ' ' : '') + args[i];
      }
    }

    if (!topic) {
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        ...createErrorView('Please specify a search topic')
      });
      return;
    }

    // Search messages
    const messages = await searchMessages(channel_id, topic, options);
    
    if (!messages.length) {
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        ...createErrorView('No messages found matching your search')
      });
      return;
    }

    // Generate summary
    const summary = await summarizeContext(messages, topic);

    // Send results
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      ...createResultsView(summary, messages.length, messages)
    });

  } catch (error) {
    console.error('Search error:', error);
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      ...createErrorView('Error performing search')
    });
  }
};

const handleContextCommand = async (channel_id, user_id, client) => {
  try {
    // Get thread messages
    const threadMessages = await getThreadMessages(channel_id);
    
    if (!threadMessages.length) {
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        ...createErrorView('This command must be used in a thread')
      });
      return;
    }

    // Generate context
    const context = await summarizeContext(threadMessages, 'thread context');

    // Send results
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      ...createResultsView(context, threadMessages.length, threadMessages)
    });

  } catch (error) {
    console.error('Context error:', error);
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      ...createErrorView('Error analyzing thread context')
    });
  }
};

module.exports = {
  registerSlashCommands,
  handleSlashCommand
}; 