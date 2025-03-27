const { WebClient } = require('@slack/web-api');
const config = require('./config');

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

  async searchMessages(query, page = 1, maxPages = 3) {
    try {
      // Extract search terms from query (remove channel specifier and quotes)
      const searchTerms = query.replace(/in:\S+\s*/, '').replace(/['"]/g, '').trim().toLowerCase();

      // Get channel history
      const result = await this.client.conversations.history({
        channel: query.match(/in:(\S+)/)?.[1] || '',
        limit: 100 // Maximum allowed by Slack API
      });

      if (!result.messages) {
        throw new Error('Invalid response format from Slack API');
      }

      // Filter messages client-side based on search terms
      const matches = result.messages.filter(msg => {
        const messageText = msg.text.toLowerCase();
        return searchTerms.split(' ').every(term => messageText.includes(term));
      });

      // Add permalink to each message
      const messagesWithPermalinks = await Promise.all(matches.map(async msg => {
        try {
          const permalink = await this.client.chat.getPermalink({
            channel: query.match(/in:(\S+)/)?.[1] || '',
            message_ts: msg.ts
          });
          return { ...msg, permalink: permalink.permalink };
        } catch (error) {
          console.error('Error getting permalink:', error);
          return { ...msg, permalink: '' };
        }
      }));

      return messagesWithPermalinks;
    } catch (error) {
      if (error.data?.error === 'rate_limited') {
        const retryAfter = error.data.retry_after || 1;
        await this.sleep(retryAfter * 1000);
        return this.searchMessages(query, page, maxPages);
      }
      console.error('Error searching messages:', error);
      throw error;
    }
  }

  async getThreadMessages(channelId, threadTs) {
    try {
      // If threadTs is not provided, return empty array
      if (!threadTs) {
        return [];
      }

      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs
      });

      if (!result.messages) {
        throw new Error('Invalid response format from Slack API');
      }

      // The first message is the parent message, which we don't need
      return result.messages.slice(1);
    } catch (error) {
      if (error.data?.error === 'rate_limited') {
        const retryAfter = error.data.retry_after || 1;
        await this.sleep(retryAfter * 1000);
        return this.getThreadMessages(channelId, threadTs);
      }
      if (error.data?.error === 'thread_not_found') {
        return [];
      }
      console.error('Error getting thread messages:', error);
      throw error;
    }
  }

  async validateChannelAccess(channelId) {
    try {
      // Get channel info to check if it's private
      const channelInfo = await this.client.conversations.info({
        channel: channelId
      });

      const isPrivate = channelInfo.channel.is_private;
      
      // Check if private channels are allowed
      if (isPrivate && !config.allowPrivateChannels) {
        throw new Error('Access to private channels is not allowed');
      }

      // If channel is whitelisted, allow access
      if (config.allowedChannels.includes(channelId)) {
        return true;
      }

      // If all public channels are allowed and this is a public channel
      if (config.allowAllPublicChannels && !isPrivate) {
        return true;
      }

      throw new Error('Access to this channel is not allowed');
    } catch (error) {
      console.error('Error validating channel access:', error);
      throw error;
    }
  }
}

module.exports = SlackApiClient; 