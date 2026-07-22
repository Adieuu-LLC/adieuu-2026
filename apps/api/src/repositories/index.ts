/**
 * Repository exports
 */

export { BaseRepository, type IRepository } from './base.repository';
export { UserRepository, getUserRepository, type IUserRepository } from './user.repository';
export { AuditLogRepository, getAuditLogRepository, type IAuditLogRepository } from './audit.repository';
export { SessionRepository, getSessionRepository, type ISessionRepository } from './session.repository';
export {
  TotpRepository,
  getTotpRepository,
  type ITotpRepository,
  WebAuthnRepository,
  getWebAuthnRepository,
  type IWebAuthnRepository,
} from './mfa.repository';
export { IdentityRepository, getIdentityRepository, type IIdentityRepository } from './identity.repository';
export { BlockRepository, getBlockRepository, type IBlockRepository } from './block.repository';
export { NotificationRepository, getNotificationRepository, type INotificationRepository } from './notification.repository';
export { SpaceRepository, getSpaceRepository, type DiscoverSpacesOptions } from './space.repository';
export { SpaceChannelRepository, getSpaceChannelRepository } from './space-channel.repository';
export { SpaceMemberRepository, getSpaceMemberRepository } from './space-member.repository';
export { SpaceRoleRepository, getSpaceRoleRepository } from './space-role.repository';
export { SpaceInviteRepository, getSpaceInviteRepository } from './space-invite.repository';
export { SpaceMessageRepository, getSpaceMessageRepository } from './space-message.repository';
export {
  SpaceVoiceSessionRepository,
  getSpaceVoiceSessionRepository,
} from './space-voice-session.repository';
export {
  SpacePreferencesRepository,
  getSpacePreferencesRepository,
  type SpacePreferencesPatch,
} from './space-preferences.repository';
