const { createSearchModal, createResultsView, createErrorView, createHelpView } = require('./components/blockKit');
const { searchMessages, getThreadMessages, validateChannelAccess } = require('./slackApiClient');
const OpenAIClient = require('./providers/openaiClient');
const config = require('../config/config');

// Initialize LLM client
const llmClient = new OpenAIClient();

// Register slash command handlers with the app
const registerSlashCommands = (app) => {
  app.command('/librarian', handleSlashCommand);
};

const handleSlashCommand = async ({ command, ack, client, body }) => {
  await ack();

  const { text, channel_id, user_id } = command;
  
  console.log("Received command from channel:", channel_id);
  
  // Check if the channel is allowed
  const isChannelAllowed = config.allowAllPublicChannels || 
                          config.allowedChannels.includes(channel_id);
  
  if (!isChannelAllowed) {
    console.log(`Channel ${channel_id} is not in the allowed channels list`);
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      text: "This bot is not configured to work in this channel. Please contact your administrator.",
    });
    return;
  }
  
  // Validate channel access
  try {
    await validateChannelAccess(channel_id);
  } catch (error) {
    console.error("Channel access validation failed:", error);
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      text: "I don't have access to this channel. Please add me to the channel and try again."
    });
    return;
  }

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
      // Use a super simple block for error messages
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        text: 'Please specify a search topic',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Please specify a search topic"
            }
          }
        ]
      });
      return;
    }

    // Search messages
    const messages = await searchMessages(channel_id, topic, options);
    
    if (!messages.length) {
      // Use a super simple block for error messages
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        text: 'No messages found matching your search',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "No messages found matching your search"
            }
          }
        ]
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
      .slice(0, config.search.maxThreads);

    console.log(`Found ${threadArray.length} threads to summarize`);

    // Generate thread summaries
    let threadSummaries = [];
    try {
      threadSummaries = await llmClient.generateThreadSummaries(threadArray, topic);
      console.log(`Generated ${threadSummaries.length} thread summaries`);
    } catch (error) {
      console.error('Error generating thread summaries:', error);
      // Fallback to basic summaries
      threadSummaries = threadArray.slice(0, 3).map((thread, index) => ({
        summary: `Thread with ${thread.messages.length} messages about "${topic}"`,
        permalink: thread.permalink || "https://slack.com"
      }));
    }

    // Use a super-minimal approach for safety
    try {
      // Extract valid permalink and summary
      const validThreadSummaries = threadSummaries
        .filter(thread => thread && typeof thread.summary === 'string')
        .slice(0, 5);
      
      console.log("Preparing to send blocks:", JSON.stringify(validThreadSummaries));
      
      // Create a very basic blocks array
      const blocks = [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `*Search Results for "${topic}"*\nFound ${messages.length} messages across ${threadSummaries.length} threads`
          }
        },
        {
          "type": "divider"
        }
      ];
      
      // Add each thread summary as a separate block
      validThreadSummaries.forEach(thread => {
        blocks.push({
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": thread.summary
          }
        });
        
        // Add permalink button only if we have a valid URL
        const isValidUrl = thread.permalink && 
                           typeof thread.permalink === 'string' && 
                           (thread.permalink.startsWith('http://') || 
                            thread.permalink.startsWith('https://')) &&
                           !thread.permalink.includes('[') &&
                           !thread.permalink.includes(']');
                           
        if (isValidUrl) {
          blocks.push({
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "text": {
                  "type": "plain_text",
                  "text": "View Thread"
                },
                "url": thread.permalink,
                "value": thread.permalink,
                "action_id": "view_thread"
              }
            ]
          });
        } else {
          console.log(`Skipping invalid permalink: ${thread.permalink}`);
        }
      });
      
      console.log("Sending blocks:", JSON.stringify(blocks));
      
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        text: `Found ${messages.length} messages matching "${topic}"`,
        blocks: blocks
      });
    } catch (error) {
      console.error('Error sending results to Slack:', error);
      // If all else fails, send a simple text message
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        text: `Found ${messages.length} messages matching "${topic}". Please try again later.`
      });
    }

  } catch (error) {
    console.error('Search error:', error);
    // Use the absolute minimum approach for errors
    try {
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        text: 'Error performing search'
      });
    } catch (finalError) {
      console.error('Fatal error sending message to Slack:', finalError);
    }
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
        text: 'This command must be used in a thread',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "This command must be used in a thread"
            }
          }
        ]
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
    let contextSummary;
    try {
      contextSummary = await llmClient.synthesizeContext(threadMessages, uniqueThreads);
    } catch (error) {
      console.error('Error generating context:', error);
      contextSummary = "I found some related discussions but couldn't generate a detailed summary.";
    }

    // Create safe blocks for the response
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Thread Context Analysis*"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: typeof contextSummary === 'string' ? contextSummary : "Related discussions found"
        }
      }
    ];

    // Add related threads if available
    if (uniqueThreads.length > 0) {
      blocks.push({
        type: "divider"
      });
      
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Related Discussions:*"
        }
      });
      
      // Add each related thread
      uniqueThreads.forEach(thread => {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Thread with ${thread.messages.length} messages`
          }
        });
        
        // Add permalink button only if we have a valid URL
        const isValidUrl = thread.permalink && 
                          typeof thread.permalink === 'string' && 
                          (thread.permalink.startsWith('http://') || 
                           thread.permalink.startsWith('https://'));
                           
        if (isValidUrl) {
          blocks.push({
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "View Related Thread"
                },
                url: thread.permalink,
                value: thread.permalink,
                action_id: "view_related_thread"
              }
            ]
          });
        } else {
          console.log(`Skipping invalid permalink in context: ${thread.permalink}`);
        }
      });
    }

    // Send results
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      text: 'Here are related discussions',
      blocks: blocks
    });

  } catch (error) {
    console.error('Context error:', error);
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      text: 'Error analyzing thread context',
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Error analyzing thread context"
          }
        }
      ]
    });
  }
};

module.exports = {
  registerSlashCommands,
  handleSlashCommand
}; 