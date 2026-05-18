export { API_ERROR_SESSION_EXPIRED } from '../constants/api-errors';

export {
  ApiClient,
  type ApiClientConfig,
  type HttpClient,
  type RequestOptions,
} from './http-client';

export {
  createApiClient,
  defaultConfig,
} from './create-api-client';

export { AuthApi } from './auth-api';
export {
  type RequestOtpParams,
  type VerifyOtpParams,
  type VerifyOtpResponse,
  type PublicKeyCredentialRequestOptionsJSON,
  type SessionInfo,
  type SessionDetails,
  type RevokeSessionsResponse,
  type AvatarInfo,
  type UserProfile,
  type AuthSession,
  type SessionAgeVerification,
  type SessionAliasGate,
  type AliasGateCode,
  type SessionGeoInfo,
  type AgeVerificationDetails,
} from './auth-types';

export {
  MfaApi,
  type MfaStatus,
  type TotpCredential,
  type WebAuthnCredential,
  type MfaCredentials,
  type TotpSetupResponse,
  type TotpVerifyResponse,
  type WebAuthnRegisterStartResponse,
  type WebAuthnRegisterFinishResponse,
  type PublicKeyCredentialCreationOptionsJSON,
} from './mfa-api';

export {
  UsersApi,
  type RequestEmailVerificationParams,
  type VerifyEmailParams,
  type RequestPhoneVerificationParams,
  type VerifyPhoneParams,
} from './users-api';

export { IdentityApi } from './identity-api';
export {
  type CryptoProfile,
  type ProfileVisibility,
  type ProfilePrivacySettings,
  type ProfileColors,
  type PublicIdentity,
  type PublicDevice,
  type PublicIdentitySession,
  type IdentityPublicKeys,
  type EncryptedKeyBundle,
  type InitializeE2EParams,
  type RegisterDeviceParams,
  type PutDeviceStaticKeyAttestationParams,
  type UpdateKeyBundleParams,
  type CreateIdentityParams,
  type LoginIdentityParams,
  type IdentityLoginResponse,
  type IdentityLoginErrorResponse,
  type ChangePassphraseParams,
} from './identity-types';

export { type UpdateProfileParams } from './profile-update-types';

export {
  type PublicSignedPreKey,
  type PublicOneTimePreKey,
  type ClaimedDevicePreKeys,
  type UploadPreKeysParams,
  type ClaimPreKeysParams,
  type PreKeyCountResponse,
} from './pre-keys-types';

export {
  BlocksApi,
  type BlockedIdentity,
  type BlockCheckResult,
  type BlockCheckEitherResult,
} from './blocks-api';

export {
  NotificationsApi,
  type NotificationType,
  type NotificationData,
  type Notification,
  type NotificationCounts,
} from './notifications-api';

export {
  FriendsApi,
  type FriendshipStatus,
  type FriendshipStatusResult,
  type PublicFriendRequest,
  type FriendInfo,
  type IncomingFriendRequestInfo,
} from './friends-api';

export {
  AdminApi,
  PLATFORM_SETTING_KEYS,
  type PlatformSettingKey,
  type AdminMetrics,
  type PublicPlatformSetting,
  type PutPlatformSettingBody,
  type PlatformSettingValueType,
  type PlatformAdminRow,
} from './admin-api';

export {
  type ReportType,
  type ReportSource,
  type ModerationReportStatus,
  type ReportCategory,
  type ReportTargetRef,
  type ReportResolution,
  type PublicEvidenceAttachment,
  type PublicEvidenceGifAttachment,
  type PublicMessageEvidence,
  type PublicProfileEvidence,
  type PublicReportEvidence,
  type PublicReport,
  type PublicReportEvent,
  type ReportListParams,
  type ReportListResponse,
  type ModerationIdentityProfile,
  type ReportDetailResponse,
  type ResolveReportParams,
  type ModerationModerator,
  type ModeratorsListResponse,
  type ModerationScanEvidenceItem,
  type ModerationScanEvidenceResponse,
} from './moderation-types';

export { ModerationApi } from './moderation-api';

export {
  ReportsApi,
  type SubmitMessageReportParams,
  type SubmitProfileReportParams,
  type SubmitReportResponse,
} from './reports-api';

export {
  ThemesApi,
  type ThemeListParams,
  type ThemeListResponse,
  type MySharedThemeChecksumsResponse,
} from './themes-api';

export {
  UploadApi,
  type UploadPurpose,
  type UploadStatus,
  type E2EMediaStatus,
  type RequestUploadParams,
  type RequestUploadResponse,
  type UploadStatusResponse,
} from './upload-api';

export {
  E2EUploadApi,
  type RequestE2EUploadParams,
  type RequestE2EUploadResponse,
  type RequestScanUploadParams,
  type RequestScanUploadResponse,
  type SealConvScanSessionParams,
  type E2EMediaStatusResponse,
  type E2EMediaDownloadResponse,
} from './e2e-upload-api';

export {
  type ConversationType,
  type GifContentFilter,
  type PreKeyType,
  type MessageCryptoProfile,
  type MessageType,
  type SystemEvent,
  type PublicConversation,
  type SerializedWrappedKey,
  type PublicMessage,
  type PublicMessageRevision,
  type PublicGroupInvite,
  type GroupInvitePreview,
  type GroupInvitePreviewMember,
  type SendMessageParams,
  type EditMessageParams,
  type PinnedMessagesPageResponse,
  type FormerMember,
  type ConversationPreferences,
  type ConversationPreferencesPatch,
  type ConversationStats,
  type PublicReaction,
  type SendReactionParams,
} from './conversations-types';

export { ConversationsApi } from './conversations-api';

export { CustomEmojiApi } from './custom-emoji-api';
export {
  type PublicCustomEmoji,
  type CustomEmojiListResponse,
  type CreateCustomEmojiParams,
  type UpdateCustomEmojiParams,
  type CustomEmojiPayloadEntry,
} from './custom-emoji-types';

export { ReactionsApi } from './reactions-api';

export {
  KlipyApi,
  type KlipyItem,
  type KlipySearchResponse,
  type KlipySearchParams,
  type KlipyShareParams,
} from './klipy-api';

export {
  SubscriptionApi,
  type SubscriptionStatus,
  type SubscriptionCatalogPriceEntry,
  type SubscriptionCatalogPricesMap,
  type SubscriptionCatalogPricesResponse,
} from './subscription-api';

export {
  AchievementsApi,
  type AchievementCategory,
  type PublicAchievementDefinition,
  type PublicAchievement,
  type AchievementStats,
} from './achievements-api';

export { AgeVerificationApi } from './age-verification-api';

export { GeoApi } from './geo-api';
export {
  type PublicJurisdictionRequirement,
  type JurisdictionLegislationRef,
  type JurisdictionRequirementStatus,
} from '../geo/jurisdiction-types';
export { expandedJurisdictionCodesForRequirements, type GeoSessionSlice } from '../geo/jurisdiction-lookup';

export {
  ChatClient,
  createChatClient,
  type ChatClientConfig,
  type ChatClientEvents,
  type ChatConnectionState,
  type ChatMessageType,
  type ChatIncomingMessage,
  type ChatOutgoingMessage,
  type ChatPingMessage,
  type ChatPongMessage,
  type ChatErrorMessage,
  type ChatAckMessage,
  type ChatFriendRequestReceivedMessage,
  type ChatFriendRequestAcceptedMessage,
  type ChatFriendRemovedMessage,
  type ChatConversationCreatedMessage,
  type ChatConversationUpdatedMessage,
  type ChatConversationMessageMessage,
  type ChatConversationMessageEditedMessage,
  type ChatGroupInviteReceivedMessage,
  type ChatGroupInviteAcceptedMessage,
  type ChatGroupInviteRevokedMessage,
  type ChatConversationMessageDeletedMessage,
  type ChatReactionAddedMessage,
  type ChatReactionRemovedMessage,
  type ChatNotificationCreatedMessage,
} from './chat-client';
