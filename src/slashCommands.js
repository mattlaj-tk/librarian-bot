const { createSearchModal, createResultsView, createErrorView, createHelpView } = require('./components/blockKit');
const { searchMessages, getThreadMessages } = require('./slackApiClient');
const { summarizeContext } = require('./llmClient');
const config = require('./config');

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
      includeThreads: config.search.includeThreads
    };

    let topic = '';
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--no-threads') {
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

    // Group messages by thread
    const threads = {};
    messages.forEach(msg => {
      const threadTs = msg.thread_ts || msg.ts;
      if (!threads[threadTs]) {
        threads[threadTs] = {
          messages: [],
          permalink: msg.permalink
        };
      }
      threads[threadTs].messages.push(msg);
    });

    // Convert to array and sort by message count
    const threadArray = Object.values(threads)
      .sort((a, b) => b.messages.length - a.messages.length)
      .slice(0, config.search.maxThreads); // Get top threads for summarization

    // Generate thread summaries
    const threadSummaries = await llmClient.generateThreadSummaries(threadArray, topic);

    // Send results
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      ...createResultsView(threadSummaries, messages.length)
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

    // Extract search topics from thread
    const searchTopics = await llmClient.extractSearchTopics(threadMessages);

    // Search for related discussions
    const relatedThreads = await Promise.all(
      searchTopics.map(async topic => {
        const messages = await searchMessages(channel_id, topic, {
          timeRange: '30d',
          includeThreads: true
        });
        
        // Group messages by thread
        const threads = {};
        messages.forEach(msg => {
          const threadTs = msg.thread_ts || msg.ts;
          if (!threads[threadTs]) {
            threads[threadTs] = {
              messages: [],
              permalink: msg.permalink
            };
          }
          threads[threadTs].messages.push(msg);
        });

        // Convert to array and sort by message count
        return Object.values(threads)
          .sort((a, b) => b.messages.length - a.messages.length)
          .slice(0, 3); // Get top 3 threads per topic
      })
    );

    // Flatten and deduplicate threads
    const uniqueThreads = Array.from(
      new Map(
        relatedThreads.flat().map(thread => [thread.permalink, thread])
      ).values()
    ).slice(0, 3); // Get top 3 overall threads

    // Generate context summary
    const context = await llmClient.synthesizeContext(threadMessages, uniqueThreads);

    // Send results
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      ...createResultsView(context, threadMessages.length, threadMessages, uniqueThreads)
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