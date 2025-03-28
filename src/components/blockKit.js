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

const createResultsView = (threadSummaries, messageCount) => ({
  type: "blocks",
  blocks: [
    {
      type: "section",
      text: { type: "mrkdwn", text: "Here are the most relevant discussions I found:" }
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `Found in ${messageCount} messages across ${threadSummaries.length} threads` }
      ]
    },
    {
      type: "divider"
    },
    ...threadSummaries.map(thread => ({
      type: "section",
      text: { type: "mrkdwn", text: thread.summary },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "View Thread" },
        url: thread.permalink,
        action_id: "view_thread"
      }
    }))
  ]
});

const createErrorView = (error) => ({
  type: "blocks",
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
  type: "blocks",
  blocks: [
    {
      type: "section",
      text: { type: "mrkdwn", text: "*How to use the Channel Bot*" }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "1. *Quick Search*\nJust type `/librarian` to open the search interface" }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "2. *Direct Search*\nUse `/librarian search <topic>` for quick searches" }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "3. *Thread Context*\nUse `/librarian context` in a thread to get related discussions" }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "4. *DM Queries*\nDM the bot directly for private searches" }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Tips*" },
      fields: [
        { type: "mrkdwn", text: "• Use quotes for exact phrases" },
        { type: "mrkdwn", text: "• Include `--time 7d` for specific time ranges" },
        { type: "mrkdwn", text: "• Add `--threads` to include thread messages" }
      ]
    }
  ]
});

module.exports = {
  createSearchModal,
  createResultsView,
  createErrorView,
  createHelpView
}; 