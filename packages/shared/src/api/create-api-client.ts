import { AchievementsApi } from './achievements-api';
import { AgeVerificationApi } from './age-verification-api';
import { SponsorshipApi } from './sponsorship-api';
import { SubscriptionApi } from './subscription-api';
import { AdminApi } from './admin-api';
import { ApiClient, type ApiClientConfig } from './http-client';
import { AuthApi } from './auth-api';
import { BlocksApi } from './blocks-api';
import { ConversationsApi } from './conversations-api';
import { CustomEmojiApi } from './custom-emoji-api';
import { E2EUploadApi } from './e2e-upload-api';
import { FriendsApi } from './friends-api';
import { IdentityApi } from './identity-api';
import { KlipyApi } from './klipy-api';
import { MfaApi } from './mfa-api';
import { ModerationApi } from './moderation-api';
import { NotificationsApi } from './notifications-api';
import { ReactionsApi } from './reactions-api';
import { ReportsApi } from './reports-api';
import { SupportTicketApi } from './support-ticket-api';
import { ThemesApi } from './themes-api';
import { UploadApi } from './upload-api';
import { UsersApi } from './users-api';
import { GeoApi } from './geo-api';
import { ComplianceApi } from './compliance-api';
import { PromoCodeApi } from './promo-code-api';
import { ReferralApi } from './referral-api';
import { AccountEventsApi } from './account-events-api';
import { FeedbackApi } from './feedback-api';

/**
 * Creates an API client instance with all API modules.
 */
export function createApiClient(config: ApiClientConfig) {
  const client = new ApiClient(config);

  return {
    client,
    ageVerification: new AgeVerificationApi(client),
    auth: new AuthApi(client),
    users: new UsersApi(client),
    mfa: new MfaApi(client),
    identity: new IdentityApi(client),
    blocks: new BlocksApi(client),
    friends: new FriendsApi(client),
    notifications: new NotificationsApi(client),
    admin: new AdminApi(client),
    moderation: new ModerationApi(client),
    reports: new ReportsApi(client),
    supportTickets: new SupportTicketApi(client),
    themes: new ThemesApi(client),
    uploads: new UploadApi(client),
    e2eUploads: new E2EUploadApi(client),
    conversations: new ConversationsApi(client),
    customEmojis: new CustomEmojiApi(client),
    reactions: new ReactionsApi(client),
    klipy: new KlipyApi(client),
    achievements: new AchievementsApi(client),
    subscription: new SubscriptionApi(client),
    sponsorship: new SponsorshipApi(client),
    promoCode: new PromoCodeApi(client),
    referral: new ReferralApi(client),
    accountEvents: new AccountEventsApi(client),
    geo: new GeoApi(client),
    compliance: new ComplianceApi(client),
    feedback: new FeedbackApi(client),
  };
}

/**
 * Default API client configuration for development.
 */
export const defaultConfig: ApiClientConfig = {
  baseUrl: typeof window !== 'undefined' ? '' : 'http://localhost:4000',
};
