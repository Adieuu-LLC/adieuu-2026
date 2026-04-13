import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';

export type AchievementCategory = 'social' | 'messaging' | 'security' | 'profile' | 'misc';

export interface PublicAchievementDefinition {
  id: string;
  /** i18n key */
  name: string;
  /** i18n key */
  description: string;
  /** Optional i18n key for detailed "how to achieve" instructions */
  how?: string;
  icon: string;
  category: AchievementCategory;
}

export interface PublicAchievement {
  id: string;
  achievementId: string;
  /** Present only when viewing your own achievements */
  awardedAt?: string;
  metadata?: Record<string, unknown>;
  definition: PublicAchievementDefinition;
}

export interface AchievementStats {
  achievementId: string;
  holderCount: number;
}

export class AchievementsApi {
  constructor(private client: HttpClient) {}

  /**
   * Get all achievement definitions (public).
   */
  async getDefinitions(): Promise<ApiResponse<{ definitions: PublicAchievementDefinition[] }>> {
    return this.client.get('/api/achievements/definitions');
  }

  /**
   * Get own achievements (identity session required).
   */
  async getMine(): Promise<ApiResponse<{ achievements: PublicAchievement[] }>> {
    return this.client.get('/api/achievements/me');
  }

  /**
   * Get another identity's achievements (privacy-gated).
   */
  async getForIdentity(identityId: string): Promise<ApiResponse<{ achievements: PublicAchievement[] }>> {
    return this.client.get(`/api/identity/${encodeURIComponent(identityId)}/achievements`);
  }

  /**
   * Get holder count for a specific achievement.
   */
  async getStats(achievementId: string): Promise<ApiResponse<AchievementStats>> {
    return this.client.get(`/api/achievements/${encodeURIComponent(achievementId)}/stats`);
  }

  /**
   * Get global holder counts for all achievements.
   */
  async getGlobalStats(): Promise<ApiResponse<{ stats: Record<string, number> }>> {
    return this.client.get('/api/achievements/stats');
  }

  /**
   * Claim a client-triggered achievement action.
   */
  async claim(action: string): Promise<ApiResponse<{ claimed: boolean }>> {
    return this.client.post('/api/achievements/claim', { action });
  }
}
