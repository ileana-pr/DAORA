import axios from 'axios';
import * as cheerio from 'cheerio';
import { ForumPost } from '../types';

interface DiscourseConfig {
  usePublicDiscourse?: boolean;
  apiKey?: string;
  baseUrl?: string;
}

export class DiscourseClient {
  private config: DiscourseConfig;
  private axiosInstance;

  constructor(config: DiscourseConfig) {
    this.config = config;
    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      headers: {
        ...(config.apiKey ? {
          'Api-Key': config.apiKey,
          'Api-Username': 'system'
        } : {}),
        'User-Agent': 'DAOra Forum Analyzer/1.0'
      }
    });
  }

  async getPosts(options: { timeframe?: string; category?: string; limit?: number } = {}): Promise<ForumPost[]> {
    if (this.config.usePublicDiscourse) {
      return this.scrapePublicPosts(options);
    }
    return this.fetchPostsViaApi(options);
  }

  private async scrapePublicPosts(options: { timeframe?: string; category?: string; limit?: number }): Promise<ForumPost[]> {
    const posts: ForumPost[] = [];
    const baseUrl = this.config.baseUrl;
    
    try {
      // First fetch the topics list
      const topicsUrl = options.category ? 
        `/c/${options.category}.json` : 
        '/latest.json';
      
      const topicsResponse = await this.axiosInstance.get(topicsUrl);
      const topics = topicsResponse.data.topic_list.topics.slice(0, options.limit || 20);
      
      // Fetch each topic's details
      for (const topic of topics) {
        try {
          const topicResponse = await this.axiosInstance.get(`/t/${topic.id}.json`);
          const topicData = topicResponse.data;
          
          if (topicData.posts && topicData.posts.length > 0) {
            const firstPost = topicData.posts[0];
            
            posts.push({
              id: firstPost.id.toString(),
              title: topic.title,
              content: firstPost.cooked || firstPost.raw,
              author: firstPost.username,
              timestamp: new Date(firstPost.created_at),
              url: `${baseUrl}/t/${topic.slug}/${topic.id}`,
              platform: 'discourse',
              replies: topic.reply_count,
              views: topic.views,
              reactions: this.extractReactions(firstPost)
            });
          }
        } catch (error) {
          console.error(`Error fetching topic ${topic.id}:`, error);
          continue;
        }
      }
    } catch (error) {
      console.error('Error scraping Discourse forum:', error);
    }
    
    return posts;
  }

  private async fetchPostsViaApi(options: { timeframe?: string; category?: string; limit?: number }): Promise<ForumPost[]> {
    try {
      const response = await this.axiosInstance.get('/posts.json', {
        params: {
          limit: options.limit || 20,
          category: options.category
        }
      });

      return response.data.latest_posts.map((post: any) => ({
        id: post.id.toString(),
        title: post.topic_title,
        content: post.raw,
        author: post.username,
        timestamp: new Date(post.created_at),
        url: `${this.config.baseUrl}/t/${post.topic_slug}/${post.topic_id}/${post.post_number}`,
        platform: 'discourse',
        replies: post.reply_count,
        views: post.reads,
        reactions: this.extractReactions(post)
      }));
    } catch (error) {
      console.error('Error fetching posts via Discourse API:', error);
      return [];
    }
  }

  private extractReactions(post: any): { type: string; count: number }[] {
    const reactions: { type: string; count: number }[] = [];
    
    if (post.reaction_users_count) {
      Object.entries(post.reaction_users_count).forEach(([reaction, count]) => {
        reactions.push({
          type: reaction,
          count: count as number
        });
      });
    }
    
    return reactions;
  }
} 