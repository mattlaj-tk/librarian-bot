const { WebClient } = require('@slack/web-api');
const config = require('../config/config');

class SlackApiClient {
  constructor(token) {
    this.client = new WebClient(token);
    this.rateLimitDelay = 1000; // 1 second delay between requests
    this.channelCache = new Map(); // Cache for channel name to ID mapping
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async resolveChannelId(channelName) {
    try {
      // Remove # if present
      const cleanName = channelName.replace(/^#/, '');
      
      // Check cache first
      if (this.channelCache.has(cleanName)) {
        return this.channelCache.get(cleanName);
      }

      // Search for the channel
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel'
      });

      const channel = result.channels.find(c => 
        c.name.toLowerCase() === cleanName.toLowerCase()
      );

      if (!channel) {
        throw new Error(`Channel "${channelName}" not found`);
      }

      // Cache the result
      this.channelCache.set(cleanName, channel.id);
      return channel.id;
    } catch (error) {
      console.error('Error resolving channel:', error);
      throw error;
    }
  }

  async isMember(userId, channelId) {
    try {
      const result = await this.client.conversations.members({ 
        channel: channelId 
      });
      return result.members.includes(userId);
    } catch (error) {
      if (error.data?.error === 'channel_not_found') {
        throw new Error('Channel not found or bot does not have access');
      }
      if (error.data?.error === 'not_in_channel') {
        throw new Error('Bot is not a member of this channel');
      }
      console.error('Error checking membership:', error);
      throw error;
    }
  }

  async searchMessages(channelId, topic, options = {}) {
    // Return test messages in debug mode
    if (config.debugMode) {
      console.log('Debug mode: Returning test messages');
      return [
        {
          ts: Math.floor(Date.now() / 1000),
          text: `Test message about ${topic} from the past hour`,
          username: 'test_user1'
        },
        {
          ts: Math.floor(Date.now() / 1000) - 3600,
          text: `Another test message discussing ${topic}`,
          username: 'test_user2'
        },
        {
          ts: Math.floor(Date.now() / 1000) - 7200,
          text: `Here's a third test message about ${topic}`,
          username: 'test_user3'
        }
      ];
    }

    const {
      timeRange = '24h',
      includeThreads = true
    } = options;

    try {
      // Calculate timestamp for time range
      const now = Math.floor(Date.now() / 1000);
      const timeRanges = {
        '24h': 24 * 60 * 60,
        '7d': 7 * 24 * 60 * 60,
        '30d': 30 * 24 * 60 * 60
      };
      const oldest = now - (timeRanges[timeRange] || timeRanges['24h']);

      // Get channel history
      const result = await this.client.conversations.history({
        channel: channelId,
        oldest: oldest.toString(),
        limit: 100
      });

      // Filter messages by topic
      const messages = result.messages.filter(msg => {
        const text = msg.text.toLowerCase();
        const searchTerms = topic.toLowerCase().split(' ');
        return searchTerms.every(term => text.includes(term));
      });

      // Get thread messages if needed
      if (includeThreads) {
        const threadPromises = messages
          .filter(msg => msg.thread_ts)
          .map(msg => this.getThreadMessages(channelId, msg.thread_ts));
        
        const threadResults = await Promise.all(threadPromises);
        const threadMessages = threadResults.flat();

        // Filter thread messages by topic
        const filteredThreadMessages = threadMessages.filter(msg => {
          const text = msg.text.toLowerCase();
          const searchTerms = topic.toLowerCase().split(' ');
          return searchTerms.every(term => text.includes(term));
        });

        messages.push(...filteredThreadMessages);
      }

      // Format messages with permalinks
      const formattedMessages = await Promise.all(messages.map(async msg => {
        const permalink = await this.getPermalink(channelId, msg.ts);
        return {
          text: msg.text,
          username: msg.user,
          ts: msg.ts,
          permalink,
          thread_ts: msg.thread_ts
        };
      }));

      return formattedMessages;

    } catch (error) {
      console.error('Error searching messages:', error);
      throw error;
    }
  }

  async getThreadMessages(channelId, threadTs) {
    try {
      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs
      });

      return result.messages;
    } catch (error) {
      console.error('Error getting thread messages:', error);
      throw error;
    }
  }

  async getPermalink(channelId, messageTs) {
    try {
      const result = await this.client.chat.getPermalink({
        channel: channelId,
        message_ts: messageTs
      });
      return result.permalink;
    } catch (error) {
      console.error('Error getting permalink:', error);
      return null;
    }
  }

  async validateChannelAccess(channelId) {
    try {
      await this.client.conversations.info({
        channel: channelId
      });
      return true;
    } catch (error) {
      if (error.message.includes('not_allowed')) {
        throw new Error('Channel access not allowed');
      }
      throw error;
    }
  }
}

// Create and export an instance
const slackClient = new SlackApiClient(process.env.SLACK_BOT_TOKEN);

module.exports = {
  searchMessages: (channelId, topic, options) => slackClient.searchMessages(channelId, topic, options),
  isMember: (userId, channelId) => slackClient.isMember(userId, channelId),
  getThreadMessages: (channelId, threadTs) => slackClient.getThreadMessages(channelId, threadTs),
  getPermalink: (channelId, messageTs) => slackClient.getPermalink(channelId, messageTs),
  validateChannelAccess: (channelId) => slackClient.validateChannelAccess(channelId)
}; 