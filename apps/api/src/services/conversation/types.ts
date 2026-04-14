/**
 * Shared result and payload types for the conversation service layer.
 *
 * @module services/conversation/types
 */

import type { PublicConversation } from '../../models/conversation';
import type { PublicMessage } from '../../models/message';
import type { PublicGroupInvite, GroupInvitePreview } from '../../models/group-invite';

export interface ConversationResult {
  success: boolean;
  conversation?: PublicConversation;
  error?: string;
  errorCode?:
    | 'NOT_FRIENDS'
    | 'BLOCKED'
    | 'IDENTITY_NOT_FOUND'
    | 'CONVERSATION_EXISTS'
    | 'CONVERSATION_NOT_FOUND'
    | 'NOT_PARTICIPANT'
    | 'NOT_CREATOR'
    | 'NOT_ADMIN'
    | 'ALREADY_ADMIN'
    | 'TARGET_IS_ADMIN'
    | 'TOO_MANY_PARTICIPANTS'
    | 'CANNOT_MESSAGE_SELF'
    | 'INVALID_TYPE'
    | 'MESSAGE_NOT_FOUND';
}

export interface MessageResult {
  success: boolean;
  message?: PublicMessage;
  error?: string;
  errorCode?:
    | 'CONVERSATION_NOT_FOUND'
    | 'NOT_PARTICIPANT'
    | 'BLOCKED'
    | 'DUPLICATE_MESSAGE'
    | 'MESSAGE_NOT_FOUND'
    | 'NOT_SENDER'
    | 'INVALID_REPLY_TARGET'
    | 'INVALID_MEDIA'
    | 'INVALID_MESSAGE_QUERY';
}

export interface GroupInviteResult {
  success: boolean;
  invite?: PublicGroupInvite;
  error?: string;
  errorCode?:
    | 'INVITE_NOT_FOUND'
    | 'NOT_AUTHORIZED'
    | 'ALREADY_MEMBER'
    | 'INVITE_EXISTS'
    | 'NOT_ADMIN'
    | 'INVITE_NOT_PENDING'
    | 'NOT_PARTICIPANT'
    | 'CONVERSATION_NOT_FOUND';
}

export interface GroupInvitePreviewResult {
  success: boolean;
  preview?: GroupInvitePreview;
  error?: string;
  errorCode?:
    | 'INVITE_NOT_FOUND'
    | 'NOT_AUTHORIZED'
    | 'CONVERSATION_NOT_FOUND';
}

export type MessagePagePayload = {
  messages: PublicMessage[];
  /**
   * When non-null, pass as `cursor` with `direction=older` to fetch the next page toward the past.
   */
  cursor: string | null;
  pageOldestId: string | null;
  pageNewestId: string | null;
  hasNewerPages: boolean;
};

export interface FormerMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export interface FormerMembersResult {
  success: boolean;
  formerMembers?: FormerMember[];
  error?: string;
  errorCode?: 'CONVERSATION_NOT_FOUND' | 'NOT_AUTHORIZED' | 'NOT_GROUP';
}
