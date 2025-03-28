const createSearchModal = () => ({
  type: "modal",
  title: { type: "plain_text", text: "Channel Search" },
  blocks: [
    {
      type: "input",
      block_id: "topic_input",
      element: { 
        type: "plain_text_input",
        placeholder: { type: "plain_text", text: "Enter your search topic..." }
      },
      label: { type: "plain_text", text: "What would you like to search for?" }
    },
    {
      type: "input",
      block_id: "include_threads",
      element: { 
        type: "checkboxes",
        initial_options: [{ text: "Include thread messages", value: "include_threads" }]
      },
      label: { type: "plain_text", text: "Search Options" }
    }
  ],
  submit: { type: "plain_text", text: "Search" },
  close: { type: "plain_text", text: "Cancel" }
});

const createResultsView = (threadSummaries, messageCount) => {
  // Safety check - ensure we have valid data
  if (!threadSummaries || !Array.isArray(threadSummaries)) {
    console.log("Warning: Invalid threadSummaries, using fallback");
    return {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Search results ready, but couldn't format them properly."
          }
        }
      ]
    };
  }
  
  console.log("Thread summaries received:", JSON.stringify(threadSummaries, null, 2));
  
  // Always start with a header
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: threadSummaries.length > 0 
          ? "Here are the most relevant discussions I found:"
          : "No relevant discussions found."
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Found in ${messageCount || 0} messages${threadSummaries.length > 0 ? ` across ${threadSummaries.length} threads` : ''}`
        }
      ]
    }
  ];
  
  // Only add thread summaries if we have results
  if (threadSummaries.length > 0) {
    // Add a divider
    blocks.push({
      type: "divider"
    });
    
    // Add each thread summary (limited to 10 to avoid exceeding Slack limits)
    threadSummaries.slice(0, 10).forEach(thread => {
      if (thread && thread.summary) {
        // Basic section with just text
        const summaryBlock = {
          type: "section",
          text: {
            type: "mrkdwn",
            text: String(thread.summary).substring(0, 3000) // Truncate to avoid Slack limits
          }
        };
        
        // Add button only if we have a valid permalink
        if (thread.permalink && typeof thread.permalink === 'string') {
          summaryBlock.accessory = {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Thread"
            },
            url: thread.permalink,
            action_id: "view_thread"
          };
        }
        
        blocks.push(summaryBlock);
      }
    });
  }
  
  console.log("Generated blocks:", JSON.stringify(blocks, null, 2));
  
  return { blocks };
};

const createErrorView = (error) => ({
  blocks: [
    {
      type: "section",
      text: { type: "mrkdwn", text: "I couldn't find what you're looking for." }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "Try:" },
      fields: [
        { type: "mrkdwn", text: "• Using different keywords" },
        { type: "mrkdwn", text: "• Expanding the time range" },
        { type: "mrkdwn", text: "• Including thread messages" }
      ]
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Try Again" },
          action_id: "retry_search"
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Help" },
          action_id: "show_help"
        }
      ]
    }
  ]
});

const createHelpView = () => ({
  blocks: [
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Commands:*" }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "1. *Private Search*\n`/librarian search <topic>`\nPerforms a quick search and shows results only to you.\n_Example: `/librarian search meeting notes`_" }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "2. *Public Context*\n`/librarian context <topic>`\nAnalyzes full conversation threads to provide comprehensive context about a topic, visible to everyone in the channel.\n_Example: `/librarian context project timeline`_" }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "3. *Detailed Report*\n`/librarian report <topic>`\nCreates a detailed, well-structured report with full conversation context, visible only to you.\n_Example: `/librarian report quarterly goals`_" }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "4. *Help*\n`/librarian help`\nDisplays this help information." }
    }
  ]
});

module.exports = {
  createSearchModal,
  createResultsView,
  createErrorView,
  createHelpView
}; 