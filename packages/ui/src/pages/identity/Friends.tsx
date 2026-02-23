/**
 * Friends page for managing friends and friend requests.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tabs, TabList, TabTrigger, TabContent } from '../../components/Tabs';
import { Avatar } from '../../components/Avatar';
import { CheckIcon, XIcon, ClockIcon, UsersIcon } from '../../components/Icons';
import { useFriendsList, useFriendRequests } from '../../hooks/useFriends';
import { useIdentity } from '../../hooks/useIdentity';

function FriendsList() {
  const { t } = useTranslation();
  const { friends, total, isLoading, hasMore, loadMore, refresh } = useFriendsList();

  if (isLoading && friends.length === 0) {
    return (
      <div className="friends-loading">
        <span className="spinner spinner-md" />
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="friends-empty">
        <UsersIcon className="friends-empty-icon" />
        <p>{t('friends.noFriends')}</p>
        <p className="friends-empty-hint">{t('friends.noFriendsHint')}</p>
      </div>
    );
  }

  return (
    <div className="friends-list">
      <div className="friends-count">
        {t('friends.title')} ({total})
      </div>
      {friends.map((friend) => (
        <div key={friend.identity.id} className="friend-item">
          <Avatar
            name={friend.identity.displayName}
            src={friend.identity.avatarUrl}
            size="md"
          />
          <div className="friend-info">
            <span className="friend-name">{friend.identity.displayName}</span>
            <span className="friend-username">@{friend.identity.username}</span>
          </div>
          <span className="friend-since">
            {new Date(friend.friendsSince).toLocaleDateString()}
          </span>
        </div>
      ))}
      {hasMore && (
        <Button
          variant="secondary"
          size="sm"
          onClick={loadMore}
          disabled={isLoading}
          className="friends-load-more"
        >
          {isLoading ? <span className="spinner spinner-sm" /> : 'Load more'}
        </Button>
      )}
    </div>
  );
}

function IncomingRequests() {
  const { t } = useTranslation();
  const { incoming, isLoading, accept, ignore } = useFriendRequests();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleAccept = async (requestId: string) => {
    setActionLoading(requestId);
    await accept(requestId);
    setActionLoading(null);
  };

  const handleIgnore = async (requestId: string) => {
    setActionLoading(requestId);
    await ignore(requestId);
    setActionLoading(null);
  };

  if (isLoading && incoming.length === 0) {
    return (
      <div className="friends-loading">
        <span className="spinner spinner-md" />
      </div>
    );
  }

  if (incoming.length === 0) {
    return (
      <div className="friends-empty">
        <p>{t('friends.requests.noIncoming')}</p>
      </div>
    );
  }

  return (
    <div className="friends-requests-list">
      {incoming.map((request) => (
        <div key={request.id} className="friend-request-item">
          <Avatar
            name={request.fromIdentity.displayName}
            src={request.fromIdentity.avatarUrl}
            size="md"
          />
          <div className="friend-info">
            <span className="friend-name">{request.fromIdentity.displayName}</span>
            <span className="friend-username">@{request.fromIdentity.username}</span>
          </div>
          <div className="friend-request-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleAccept(request.id)}
              disabled={actionLoading === request.id}
            >
              {actionLoading === request.id ? (
                <span className="spinner spinner-sm" />
              ) : (
                <>
                  <CheckIcon />
                  {t('friends.requests.accept')}
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleIgnore(request.id)}
              disabled={actionLoading === request.id}
            >
              <XIcon />
              {t('friends.requests.ignore')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SentRequests() {
  const { t } = useTranslation();
  const { sent, isLoading, cancel } = useFriendRequests();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleCancel = async (requestId: string) => {
    setActionLoading(requestId);
    await cancel(requestId);
    setActionLoading(null);
  };

  if (isLoading && sent.length === 0) {
    return (
      <div className="friends-loading">
        <span className="spinner spinner-md" />
      </div>
    );
  }

  if (sent.length === 0) {
    return (
      <div className="friends-empty">
        <p>{t('friends.requests.noSent')}</p>
      </div>
    );
  }

  return (
    <div className="friends-requests-list">
      {sent.map((request) => (
        <div key={request.id} className="friend-request-item">
          <Avatar
            name={request.toIdentity.displayName}
            src={request.toIdentity.avatarUrl}
            size="md"
          />
          <div className="friend-info">
            <span className="friend-name">{request.toIdentity.displayName}</span>
            <span className="friend-username">@{request.toIdentity.username}</span>
          </div>
          <div className="friend-request-actions">
            <span className="friend-request-status">
              <ClockIcon />
              {t('friends.actions.requestSent')}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleCancel(request.id)}
              disabled={actionLoading === request.id}
            >
              {actionLoading === request.id ? (
                <span className="spinner spinner-sm" />
              ) : (
                <>
                  <XIcon />
                  {t('friends.requests.cancel')}
                </>
              )}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function IdentityFriends() {
  const { t } = useTranslation();
  const { status: identityStatus } = useIdentity();
  const { incoming } = useFriendRequests();

  const isLoggedIn = identityStatus === 'logged_in';

  if (!isLoggedIn) {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('friends.title')}</h1>
            <p className="page-subtitle">{t('friends.subtitle')}</p>
          </div>
          <Card variant="elevated" className="slide-up">
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              {t('ciphers.notLoggedIn')}
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('friends.title')}</h1>
          <p className="page-subtitle">{t('friends.subtitle')}</p>
        </div>

        <Card variant="elevated" className="slide-up friends-card">
          <Tabs defaultTab="friends">
            <TabList>
              <TabTrigger value="friends">{t('friends.title')}</TabTrigger>
              <TabTrigger value="incoming">
                {t('friends.requests.incoming')}
                {incoming.length > 0 && (
                  <span className="tab-badge">{incoming.length}</span>
                )}
              </TabTrigger>
              <TabTrigger value="sent">{t('friends.requests.sent')}</TabTrigger>
            </TabList>
            <TabContent value="friends">
              <FriendsList />
            </TabContent>
            <TabContent value="incoming">
              <IncomingRequests />
            </TabContent>
            <TabContent value="sent">
              <SentRequests />
            </TabContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
