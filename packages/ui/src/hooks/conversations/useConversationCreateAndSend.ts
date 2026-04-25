import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  createApiClient,
  type PublicConversation,
  type PublicMessage,
  type PublicIdentity,
  type SendMessageParams,
  type EditMessageParams,
} from '@adieuu/shared';
import {
  encryptMessage,
  encryptGroupName,
  type RecipientKeys,
} from '../../services/conversationCryptoService';
import type {
  ConversationMessagesState,
  DecryptedConversation,
  DisplayMessage,
  SendMessageErrorResult,
} from './types';

type ApiClient = ReturnType<typeof createApiClient>;

export interface ConversationCreateAndSendParams {
  isLoggedIn: boolean;
  identity: PublicIdentity | null;
  api: ApiClient;
  conversations: DecryptedConversation[];
  getSigningKey: () => Uint8Array | null | undefined;
  fetchRecipientKeys: (
    participantIds: string[],
    useForwardSecrecy?: boolean,
    signal?: AbortSignal
  ) => Promise<RecipientKeys[]>;
  toDecrypted: (conv: PublicConversation) => DecryptedConversation;
  resolveParticipants: (ids: string[]) => Promise<Record<string, PublicIdentity>>;
  setConversations: Dispatch<SetStateAction<DecryptedConversation[]>>;
  setMessagesState: Dispatch<SetStateAction<Record<string, ConversationMessagesState>>>;
  setSending: Dispatch<SetStateAction<boolean>>;
}

/**
 * Create DM/group conversations and send encrypted text messages.
 */
export function useConversationCreateAndSend(params: ConversationCreateAndSendParams) {
  const {
    isLoggedIn,
    identity,
    api,
    conversations,
    getSigningKey,
    fetchRecipientKeys,
    toDecrypted,
    resolveParticipants,
    setConversations,
    setMessagesState,
    setSending,
  } = params;

  const createDM = useCallback(
    async (
      participantId: string,
      options?: { forceNew?: boolean; topic?: string }
    ): Promise<PublicConversation | null> => {
      try {
        const { forceNew, topic } = options ?? {};
        const resp = await api.conversations.create({
          type: 'dm',
          participants: [participantId],
          forceNew: forceNew === true ? true : undefined,
        });
        if (!resp.data) return null;

        let conv: PublicConversation = resp.data;
        const trimmedTopic = topic?.trim();
        if (trimmedTopic) {
          const encrypted = encryptGroupName(trimmedTopic, conv.id);
          const nameResp = await api.conversations.updateName(
            conv.id,
            encrypted.encryptedName,
            encrypted.nameNonce
          );
          if (nameResp.data) {
            conv = {
              ...nameResp.data,
              encryptedName: nameResp.data.encryptedName ?? encrypted.encryptedName,
              nameNonce: nameResp.data.nameNonce ?? encrypted.nameNonce,
            };
          }
        }

        const decrypted = toDecrypted(conv);
        setConversations((prev) => {
          if (prev.some((c) => c.id === decrypted.id)) return prev;
          return [decrypted, ...prev];
        });
        void resolveParticipants(decrypted.participants);
        return conv;
      } catch {
        // Error
      }
      return null;
    },
    [api, toDecrypted, resolveParticipants, encryptGroupName]
  );

  const createGroup = useCallback(
    async (
      participantIds: string[],
      conversationTopicOrName?: string
    ): Promise<PublicConversation | null> => {
      try {
        let encryptedName: string | undefined;
        let nameNonce: string | undefined;

        const resp = await api.conversations.create({
          type: 'group',
          participants: participantIds,
        });

        if (resp.data && conversationTopicOrName) {
          const encrypted = encryptGroupName(conversationTopicOrName, resp.data.id);
          await api.conversations.updateName(resp.data.id, encrypted.encryptedName, encrypted.nameNonce);
          encryptedName = encrypted.encryptedName;
          nameNonce = encrypted.nameNonce;
        }

        if (resp.data) {
          const conv = {
            ...resp.data,
            encryptedName,
            nameNonce,
          };
          const decrypted = toDecrypted(conv);
          setConversations((prev) => [decrypted, ...prev]);
          void resolveParticipants(decrypted.participants);
          return conv;
        }
      } catch {
        // Error
      }
      return null;
    },
    [api, toDecrypted, resolveParticipants]
  );

  const sendTextMessage = useCallback(
    async (
      conversationId: string,
      plaintext: string,
      options?: {
        expiresInSeconds?: number;
        useForwardSecrecy?: boolean;
        replyToMessageId?: string;
        e2eMediaIds?: string[];
        mentionedIdentityIds?: string[];
        skipMessageStateUpdate?: boolean;
        /** When true, do not toggle global `sending` (e.g. background media outbox). */
        suppressGlobalSending?: boolean;
        signal?: AbortSignal;
      }
    ): Promise<PublicMessage | SendMessageErrorResult | null> => {
      if (!isLoggedIn || !identity) return null;

      const conversation = conversations.find((c) => c.id === conversationId);
      if (!conversation) return null;

      const useFs = options?.useForwardSecrecy ?? false;
      const expiresInSeconds = options?.expiresInSeconds;
      const signal = options?.signal;

      const throwIfAborted = () => {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      };

      const manageSending = options?.suppressGlobalSending !== true;
      if (manageSending) setSending(true);
      try {
        throwIfAborted();
        const signingKey = getSigningKey();
        if (!signingKey) throw new Error('No signing key available');

        const recipients = await fetchRecipientKeys(
          conversation.participants,
          useFs,
          signal
        );
        throwIfAborted();
        if (recipients.length === 0) throw new Error('No recipient keys available');

        const cryptoProfile = identity.preferredCryptoProfile ?? 'default';
        const encrypted = encryptMessage(
          plaintext,
          recipients,
          signingKey,
          cryptoProfile as 'default' | 'cnsa2'
        );
        throwIfAborted();

        const clientMessageId = crypto.randomUUID();

        const sendParams: SendMessageParams = {
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          wrappedKeys: encrypted.wrappedKeys,
          signature: encrypted.signature,
          cryptoProfile: encrypted.cryptoProfile,
          clientMessageId,
          expiresInSeconds,
          ...(options?.replyToMessageId ? { replyToMessageId: options.replyToMessageId } : {}),
          ...(options?.e2eMediaIds?.length ? { e2eMediaIds: options.e2eMediaIds } : {}),
          ...(options?.mentionedIdentityIds?.length ? { mentionedIdentityIds: options.mentionedIdentityIds } : {}),
        };

        const resp = await api.conversations.sendMessage(
          conversationId,
          sendParams,
          signal ? { signal } : undefined
        );
        throwIfAborted();

        if (!resp.success && signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        if (resp.data) {
          const displayMsg: DisplayMessage = {
            ...resp.data,
            decryptedContent: plaintext,
            signatureVerified: true,
            forwardSecrecy: useFs,
          };

          if (!options?.skipMessageStateUpdate) {
            setMessagesState((prev) => ({
              ...prev,
              [conversationId]: {
                ...(prev[conversationId] ?? {
                  messages: [],
                  olderCursor: null,
                  newerPaginationAfterId: null,
                  hasNewerPages: false,
                  loading: false,
                  showManualLoadOlder: false,
                  showManualLoadNewer: false,
                }),
                messages: [displayMsg, ...(prev[conversationId]?.messages ?? [])],
                newerPaginationAfterId: displayMsg.id,
                hasNewerPages: false,
              },
            }));
          }

          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId
                ? { ...c, lastMessageAt: resp.data!.createdAt, lastMessageId: resp.data!.id }
                : c
            ).sort((a, b) => {
              const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
              const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
              return bTime - aTime;
            })
          );

          return resp.data;
        }

        if (resp.error?.code === 'FORBIDDEN') {
          return { errorCode: 'BLOCKED' };
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        console.error('[Conversations] Failed to send message:', err);
      } finally {
        if (manageSending) setSending(false);
      }
      return null;
    },
    [isLoggedIn, identity, conversations, getSigningKey, fetchRecipientKeys, api]
  );

  const editTextMessage = useCallback(
    async (
      conversationId: string,
      messageId: string,
      plaintext: string,
      options?: {
        useForwardSecrecy?: boolean;
        signal?: AbortSignal;
      }
    ): Promise<PublicMessage | SendMessageErrorResult | null> => {
      if (!isLoggedIn || !identity) return null;

      const conversation = conversations.find((c) => c.id === conversationId);
      if (!conversation) return null;

      const useFs = options?.useForwardSecrecy ?? false;
      const signal = options?.signal;

      const throwIfAborted = () => {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      };

      setSending(true);
      try {
        throwIfAborted();
        const signingKey = getSigningKey();
        if (!signingKey) throw new Error('No signing key available');

        const recipients = await fetchRecipientKeys(
          conversation.participants,
          useFs,
          signal
        );
        throwIfAborted();
        if (recipients.length === 0) throw new Error('No recipient keys available');

        const cryptoProfile = identity.preferredCryptoProfile ?? 'default';
        const encrypted = encryptMessage(
          plaintext,
          recipients,
          signingKey,
          cryptoProfile as 'default' | 'cnsa2'
        );
        throwIfAborted();

        const clientEditId = crypto.randomUUID();
        const editParams: EditMessageParams = {
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          wrappedKeys: encrypted.wrappedKeys,
          signature: encrypted.signature,
          cryptoProfile: encrypted.cryptoProfile,
          clientEditId,
        };

        const resp = await api.conversations.editMessage(
          conversationId,
          messageId,
          editParams,
          signal ? { signal } : undefined
        );
        throwIfAborted();

        if (!resp.success && signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        if (resp.data) {
          const displayMsg: DisplayMessage = {
            ...resp.data,
            decryptedContent: plaintext,
            signatureVerified: true,
            forwardSecrecy: useFs,
          };

          setMessagesState((prev) => {
            const cur = prev[conversationId];
            if (!cur) return prev;
            return {
              ...prev,
              [conversationId]: {
                ...cur,
                messages: cur.messages.map((m) => (m.id === messageId ? displayMsg : m)),
              },
            };
          });

          return resp.data;
        }

        if (resp.error?.code === 'MAX_EDITS_REACHED') {
          return { errorCode: 'MAX_EDITS_REACHED' };
        }
        if (resp.error?.code === 'FORBIDDEN') {
          return { errorCode: 'BLOCKED' };
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        console.error('[Conversations] Failed to edit message:', err);
      } finally {
        setSending(false);
      }
      return null;
    },
    [isLoggedIn, identity, conversations, getSigningKey, fetchRecipientKeys, api, setMessagesState]
  );

  return { createDM, createGroup, sendTextMessage, editTextMessage };
}
