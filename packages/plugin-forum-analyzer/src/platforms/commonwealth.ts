import axios from 'axios';
import { ForumPost } from '../types';

interface CommonwealthConfig {
  apiKey?: string;
  space?: string;
}

export class CommonwealthClient {
  private config: CommonwealthConfig;
  private axiosInstance;
  private readonly API_BASE = 'https://commonwealth.im/api/v1';

  constructor(config: CommonwealthConfig) {
    this.config = config;
    this.axiosInstance = axios.create({
      baseURL: this.API_BASE,
      headers: config.apiKey ? {
        'Authorization': `Bearer ${config.apiKey}`
      } : {}
    });
  }

  async getPosts(options: { timeframe?: string; limit?: number } = {}): Promise<ForumPost[]> {
    if (!this.config.space) {
      throw new Error('Commonwealth space is not configured');
    }

    try {
      const response = await this.axiosInstance.get(`/threads`, {
        params: {
          community: this.config.space,
          limit: options.limit || 20,
          ...(options.timeframe && { 
            created_at: this.getTimeframeQuery(options.timeframe) 
          })
        }
      });

      return this.convertThreadsToPosts(response.data.threads);
    } catch (error) {
      console.error('Error fetching Commonwealth posts:', error);
      return [];
    }
  }

  private convertThreadsToPosts(threads: any[]): ForumPost[] {
    return threads.map(thread => ({
      id: thread.id.toString(),
      title: thread.title,
      content: thread.body,
      author: thread.author,
      timestamp: new Date(thread.created_at),
      url: `https://commonwealth.im/${this.config.space}/discussion/${thread.id}`,
      platform: 'commonwealth',
      reactions: thread.reactions?.map((reaction: any) => ({
        type: reaction.reaction,
        count: reaction.count
      })) || [],
      replies: thread.comment_count,
      views: thread.view_count
    }));
  }

  private getTimeframeQuery(timeframe: string): string {
    const now = new Date();
    let date: Date;

    switch (timeframe.toLowerCase()) {
      case 'day':
        date = new Date(now.setDate(now.getDate() - 1));
        break;
      case 'week':
        date = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        date = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        date = new Date(0);
    }

    return date.toISOString();
  }
} 