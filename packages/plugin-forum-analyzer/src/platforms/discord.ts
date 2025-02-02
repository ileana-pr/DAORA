import { Client, GatewayIntentBits, TextChannel, Message, Collection } from 'discord.js';
import { ForumPost } from '../types';

interface DiscordConfig {
  token?: string;
  channels?: string[];
}

export class DiscordClient {
  private config: DiscordConfig;
  private client: Client;

  constructor(config: DiscordConfig) {
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });
  }

  async getPosts(options: { timeframe?: string; limit?: number } = {}): Promise<ForumPost[]> {
    if (!this.config.token || !this.config.channels?.length) {
      throw new Error('Discord configuration is incomplete');
    }

    try {
      await this.client.login(this.config.token);
      const posts: ForumPost[] = [];

      for (const channelId of this.config.channels) {
        const channel = await this.client.channels.fetch(channelId);
        if (!(channel instanceof TextChannel)) continue;

        const messages = await this.fetchMessages(channel, options);
        const channelPosts = this.convertMessagesToPosts(messages);
        posts.push(...channelPosts);
      }

      await this.destroy();
      return posts;
    } catch (error) {
      console.error('Error fetching Discord posts:', error);
      return [];
    }
  }

  private async fetchMessages(channel: TextChannel, options: { timeframe?: string; limit?: number }): Promise<Message[]> {
    const limit = options.limit || 100;
    const messages: Message[] = [];
    
    try {
      let lastId: string | undefined;
      
      while (messages.length < limit) {
        const fetchOptions: { limit: number; before?: string } = { 
          limit: Math.min(100, limit - messages.length)
        };
        if (lastId) fetchOptions.before = lastId;
        
        const batch = await channel.messages.fetch(fetchOptions);
        if (!batch || batch.size === 0) break;
        
        const batchMessages = Array.from(batch.values());
        messages.push(...batchMessages);
        
        const lastMessage = batch.last();
        if (!lastMessage) break;
        
        lastId = lastMessage.id;
        
        if (options.timeframe) {
          const cutoffDate = this.getTimeframeCutoff(options.timeframe);
          if (lastMessage.createdAt.getTime() < cutoffDate.getTime()) break;
        }
      }
    } catch (error) {
      console.error(`Error fetching messages from channel ${channel.id}:`, error);
    }
    
    return messages;
  }

  private convertMessagesToPosts(messages: Message[]): ForumPost[] {
    return messages.map(message => ({
      id: message.id,
      content: message.content,
      author: message.author.username,
      timestamp: message.createdAt,
      url: message.url,
      platform: 'discord',
      reactions: Array.from(message.reactions.cache.values()).map(reaction => ({
        type: reaction.emoji.name || 'unknown',
        count: reaction.count || 0
      }))
    }));
  }

  private getTimeframeCutoff(timeframe: string): Date {
    const now = new Date();
    switch (timeframe.toLowerCase()) {
      case 'day':
        return new Date(now.setDate(now.getDate() - 1));
      case 'week':
        return new Date(now.setDate(now.getDate() - 7));
      case 'month':
        return new Date(now.setMonth(now.getMonth() - 1));
      default:
        return new Date(0);
    }
  }

  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
    }
  }
} 