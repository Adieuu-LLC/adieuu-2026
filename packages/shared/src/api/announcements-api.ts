import type { ApiResponse } from '../types';
import type { HttpClient } from './http-client';
import type { SiteAnnouncement } from './admin-api';

export class AnnouncementsApi {
  constructor(private client: HttpClient) {}

  async getActive(): Promise<ApiResponse<{ announcements: SiteAnnouncement[] }>> {
    return this.client.get('/api/announcements/active');
  }
}
