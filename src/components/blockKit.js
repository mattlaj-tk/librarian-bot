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
      block_id: "time_range",
      element: {
        type: "radio_buttons",
        initial_option: { text: "Last 24 hours", value: "24h" },
        options: [
          { text: "Last 24 hours", value: "24h" },
          { text: "Last 7 days", value: "7d" },
          { text: "Last 30 days", value: "30d" }
        ]
      },
      label: { type: "plain_text", text: "Time Range" }
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

const createResultsView = (summary, messageCount, messages) => ({
  type: "blocks",
  blocks: [
    {
      type: "section",
      text: { type: "mrkdwn", text: "Here's what I found:" }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Summary*\n${summary}` },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Show Details" },
        action_id: "show_details"
      }
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `Found in ${messageCount} messages` }
      ]
    },
    ...messages.map(msg => ({
      type: "section",
      text: { type: "mrkdwn", text: msg.text },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "View" },
        url: msg.permalink,
        action_id: "view_message"
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