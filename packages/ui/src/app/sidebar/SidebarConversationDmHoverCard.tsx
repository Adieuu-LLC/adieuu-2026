import { type ReactElement } from 'react';
import { HoverCard } from '../../components/HoverCard';
import { IdentityHoverCardContent } from '../../components/IdentityHoverCard';
import { useConversations } from '../../hooks/useConversations';

/**
 * Sidebar DM row: resolve the other participant on hover, then show the standard identity hover panel.
 * Pass the context-menu trigger (ContextTrigger asChild around the row button) as `children`.
 */
export function SidebarConversationDmHoverCard({
  otherUserId,
  children,
}: {
  otherUserId: string;
  children: ReactElement;
}) {
  const { participantProfiles, prefetchParticipantProfiles } = useConversations();
  const profile = participantProfiles[otherUserId];

  return (
    <HoverCard
      trigger={children}
      positioning={{ placement: 'right-start', gutter: 12 }}
      className="identity-hover-card"
      openDelay={300}
      closeDelay={200}
      onOpenChange={(details: { open: boolean }) => {
        if (details.open) void prefetchParticipantProfiles([otherUserId]);
      }}
    >
      {profile ? (
        <IdentityHoverCardContent identity={profile} />
      ) : (
        <div className="invite-group-hover-card-loading">
          <span className="spinner spinner-sm" />
        </div>
      )}
    </HoverCard>
  );
}
