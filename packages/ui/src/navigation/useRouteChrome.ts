import { useContext, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AppIconName } from '../icons/appIcons';
import { ConversationsContext } from '../hooks/conversations/context';
import { useIdentity } from '../hooks/useIdentity';
import { getConversationHeaderCopy } from '../pages/conversations/conversationViewModel';
import { resolveRouteChrome } from './resolveRouteChrome';

export type RouteChrome = {
  icon?: AppIconName;
  title: string;
};

export function useRouteChrome(): RouteChrome {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { id: routeId } = useParams<{ id: string }>();
  const conversationsContext = useContext(ConversationsContext);
  const { identity } = useIdentity();

  return useMemo(() => {
    const descriptor = resolveRouteChrome(pathname);

    if (descriptor.dynamic === 'conversation' && routeId && conversationsContext) {
      const conversation = conversationsContext.conversations.find((c) => c.id === routeId);
      if (conversation) {
        const { displayName } = getConversationHeaderCopy(
          conversation,
          identity?.id,
          conversationsContext.participantProfiles,
          conversation.decryptedMemberSettings ?? {},
          t,
        );
        return { icon: descriptor.icon, title: displayName };
      }
    }

    if (descriptor.dynamic === 'identity-profile') {
      const profileId = pathname.match(/^\/identity\/([^/]+)$/)?.[1];
      if (profileId && conversationsContext) {
        const profile = conversationsContext.participantProfiles[profileId];
        if (profile?.displayName) {
          return { icon: descriptor.icon, title: profile.displayName };
        }
        if (profile?.username) {
          return { icon: descriptor.icon, title: profile.username };
        }
      }
    }

    return {
      icon: descriptor.icon,
      title: t(descriptor.titleKey, descriptor.titleDefault),
    };
  }, [
    pathname,
    routeId,
    conversationsContext,
    identity?.id,
    t,
  ]);
}
