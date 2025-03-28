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
      await handleContextCommand(args.slice(1), channel_id, user_id, client);
      break;
    case 'report':
      await handleReportCommand(args.slice(1), channel_id, user_id, client);
      break;
    case 'help':
    case '?':
    case 'usage':
    case 'commands':
      await handleHelpCommand(channel_id, user_id, client);
      break;
    default:
      // Check if the text looks like a help request
      if (text.match(/help|how|guide|instructions|commands|\?/i)) {
        await handleHelpCommand(channel_id, user_id, client);
      } else {
        await client.chat.postEphemeral({
          channel: channel_id,
          user: user_id,
          ...createErrorView('Invalid command. Use `/librarian help` for usage information.')
        });
      }
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

const handleContextCommand = async (args, channel_id, user_id, client) => {
  try {
    // Parse arguments
    const options = {
      includeThreads: true,
      includeFullThreads: true, // Include entire threads for better context
      timeRange: '30d', // Wider time range for context
      maxMessages: config.search.maxMessages * 2 // Double the messages to search through
    };

    // Join all args to form the topic
    let topic = args.join(' ');

    if (!topic) {
      // Topic is required
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        text: 'Please specify a topic for context search',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Please specify a topic for context search. Example: `/librarian context project deadlines`"
            }
          }
        ]
      });
      return;
    }

    console.log(`Searching for context on topic: "${topic}" with full thread inclusion`);

    // Search messages with broader criteria
    const messages = await searchMessages(channel_id, topic, options);
    
    if (!messages.length) {
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        text: 'No messages found matching your context search',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "No messages found matching your context search"
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

    console.log(`Found ${threadArray.length} threads for context search`);

    // Generate thread summaries with more comprehensive context
    let threadSummaries = [];
    try {
      // Use the context searcher prompt from config
      const contextSystemPrompt = config.prompts.contextSearcher;
      
      threadSummaries = await llmClient.generateThreadSummaries(
        threadArray, 
        topic, 
        contextSystemPrompt
      );
      
      console.log(`Generated ${threadSummaries.length} thread summaries for context`);
    } catch (error) {
      console.error('Error generating context thread summaries:', error);
      // Fallback to basic summaries
      threadSummaries = threadArray.slice(0, 3).map((thread, index) => ({
        summary: `Thread with ${thread.messages.length} messages about "${topic}"`,
        permalink: thread.permalink || "https://slack.com"
      }));
    }

    // Create a comprehensive context message
    const validThreadSummaries = threadSummaries
      .filter(thread => thread && typeof thread.summary === 'string')
      .slice(0, 5);
    
    // Create blocks for the public response
    const blocks = [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*Context for "${topic}"*\nFound ${messages.length} messages across ${threadSummaries.length} discussions`
        }
      },
      {
        "type": "divider"
      }
    ];
    
    // Add a summary section
    blocks.push({
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Key Information:*"
      }
    });
    
    // Generate overall summary of the topic
    let overallSummary;
    try {
      // Extract the most important 10 messages for a summary
      const keyMessages = messages
        .sort((a, b) => b.ts - a.ts) // Sort by timestamp (newest first)
        .slice(0, 10);
        
      overallSummary = await llmClient.summarizeContext(keyMessages, topic);
    } catch (error) {
      console.error('Error generating overall context summary:', error);
      overallSummary = `Found ${messages.length} messages about "${topic}" across ${threadSummaries.length} discussions.`;
    }
    
    blocks.push({
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": overallSummary
      }
    });
    
    // Add each thread summary as a separate block
    if (validThreadSummaries.length > 0) {
      blocks.push({
        "type": "divider"
      });
      
      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*Related Discussions:*"
        }
      });
      
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
                  "text": "View Discussion"
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
    }
    
    // Send public message to the channel
    await client.chat.postMessage({
      channel: channel_id,
      text: `Context for "${topic}"`,
      blocks: blocks
    });

  } catch (error) {
    console.error('Context command error:', error);
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      text: 'Error searching for context',
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Error searching for context: ${error.message}`
          }
        }
      ]
    });
  }
};

/**
 * Handle the help command
 * @param {string} channel_id - Channel ID
 * @param {string} user_id - User ID
 * @param {Object} client - Slack client
 */
const handleHelpCommand = async (channel_id, user_id, client) => {
  try {
    console.log(`Sending help information to user ${user_id} in channel ${channel_id}`);
    
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      text: "Slack Channel Bot - Help Guide",
      ...createHelpView()
    });
  } catch (error) {
    console.error('Error sending help information:', error);
    
    // Simple fallback in case of error
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      text: "Error displaying help. Try these commands: `/librarian search <topic>` or `/librarian context <topic>`"
    });
  }
};

/**
 * Handle the report command - creates a detailed private report about a topic
 * @param {Array} args - Command arguments
 * @param {string} channel_id - Channel ID
 * @param {string} user_id - User ID
 * @param {Object} client - Slack client
 */
const handleReportCommand = async (args, channel_id, user_id, client) => {
  try {
    // Parse arguments
    const options = {
      includeThreads: true,
      includeFullThreads: true, // Include entire threads for better analysis
      timeRange: '30d', // Wider time range for comprehensive report
      maxMessages: config.search.maxMessages * 3 // Triple the messages to search through for depth
    };

    // Join all args to form the topic
    let topic = args.join(' ');

    if (!topic) {
      // Topic is required
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        text: 'Please specify a topic for the report',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Please specify a topic for the report. Example: `/librarian report project deadlines`"
            }
          }
        ]
      });
      return;
    }

    console.log(`Generating report on topic: "${topic}" with full thread inclusion`);

    // Search messages with broader criteria
    const messages = await searchMessages(channel_id, topic, options);
    
    if (!messages.length) {
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        text: 'No messages found matching your report topic',
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "No messages found matching your report topic"
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
      .slice(0, config.search.maxThreads * 2); // Include more threads for a detailed report

    console.log(`Found ${threadArray.length} threads for report generation`);

    // Generate comprehensive thread summaries
    let threadSummaries = [];
    try {
      // Use the report generator prompt from config
      const reportSystemPrompt = config.prompts.reportGenerator;
      
      threadSummaries = await llmClient.generateThreadSummaries(
        threadArray, 
        topic, 
        reportSystemPrompt
      );
      
      console.log(`Generated ${threadSummaries.length} thread summaries for report`);
    } catch (error) {
      console.error('Error generating report thread summaries:', error);
      // Fallback to basic summaries
      threadSummaries = threadArray.slice(0, 5).map((thread, index) => ({
        summary: `Thread with ${thread.messages.length} messages about "${topic}"`,
        permalink: thread.permalink || "https://slack.com"
      }));
    }

    // Create blocks for the ephemeral (private) response
    const blocks = [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*Detailed Report on "${topic}"*\nBased on ${messages.length} messages across ${threadSummaries.length} discussions`
        }
      },
      {
        "type": "divider"
      }
    ];
    
    // Generate comprehensive report
    let reportContent;
    try {
      // Extract a larger set of messages for a detailed report
      const keyMessages = messages
        .sort((a, b) => b.ts - a.ts) // Sort by timestamp (newest first)
        .slice(0, 20);  // Include more messages for depth
        
      // Use the report generator prompt
      reportContent = await llmClient.summarizeContext(
        keyMessages, 
        topic, 
        config.prompts.reportGenerator
      );
    } catch (error) {
      console.error('Error generating detailed report:', error);
      reportContent = `Found ${messages.length} messages about "${topic}" across ${threadSummaries.length} discussions.`;
    }
    
    // Split the report content into sections if it's long
    const reportChunks = llmClient.chunkResponse(reportContent);
    
    // Add each chunk of the report as a separate block
    reportChunks.forEach(chunk => {
      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": chunk
        }
      });
    });
    
    // Add thread summaries section if we have valid summaries
    const validThreadSummaries = threadSummaries
      .filter(thread => thread && typeof thread.summary === 'string')
      .slice(0, 8);  // Include more summaries than in context or search
      
    if (validThreadSummaries.length > 0) {
      blocks.push({
        "type": "divider"
      });
      
      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*Key Discussions:*"
        }
      });
      
      validThreadSummaries.forEach(thread => {
        blocks.push({
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": thread.summary
          }
        });
        
        // Add permalink button if valid
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
                  "text": "View Discussion"
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
    }
    
    // Send ephemeral (private) message to the user
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      text: `Detailed Report on "${topic}"`,
      blocks: blocks
    });

  } catch (error) {
    console.error('Report command error:', error);
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      text: 'Error generating report',
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Error generating report: ${error.message}`
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