import { useState } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

type TransferStrategy = 'manual' | 'oldest' | 'most_active';

interface MemberOption {
  id: string;
  displayName?: string;
  username?: string;
}

export interface AdminTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: MemberOption[];
  loading?: boolean;
  onConfirm: (options: {
    transferAdminTo?: string;
    transferStrategy?: 'oldest' | 'most_active';
  }) => void;
  onSkip: () => void;
}

export function AdminTransferDialog({
  open,
  onOpenChange,
  members,
  loading = false,
  onConfirm,
  onSkip,
}: AdminTransferDialogProps) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<TransferStrategy>('oldest');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const handleConfirm = () => {
    if (strategy === 'manual' && selectedMemberId) {
      onConfirm({ transferAdminTo: selectedMemberId });
    } else if (strategy === 'oldest' || strategy === 'most_active') {
      onConfirm({ transferStrategy: strategy });
    }
  };

  const canConfirm = strategy === 'manual' ? !!selectedMemberId : true;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      closeOnInteractOutside={!loading}
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content confirm-dialog-warning admin-transfer-dialog">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('conversations.adminTransfer.title', 'Choose a new admin')}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              <Dialog.Description className="confirm-dialog-description">
                {t(
                  'conversations.adminTransfer.description',
                  'You are the last admin. Choose who should take over before you leave.'
                )}
              </Dialog.Description>

              <div className="admin-transfer-options">
                <label className="admin-transfer-option">
                  <input
                    type="radio"
                    name="transfer-strategy"
                    value="oldest"
                    checked={strategy === 'oldest'}
                    onChange={() => setStrategy('oldest')}
                    disabled={loading}
                  />
                  <div className="admin-transfer-option-content">
                    <span className="admin-transfer-option-label">
                      {t('conversations.adminTransfer.oldest', 'Oldest member')}
                    </span>
                    <span className="admin-transfer-option-hint">
                      {t('conversations.adminTransfer.oldestHint', 'The member who joined earliest')}
                    </span>
                  </div>
                </label>

                <label className="admin-transfer-option">
                  <input
                    type="radio"
                    name="transfer-strategy"
                    value="most_active"
                    checked={strategy === 'most_active'}
                    onChange={() => setStrategy('most_active')}
                    disabled={loading}
                  />
                  <div className="admin-transfer-option-content">
                    <span className="admin-transfer-option-label">
                      {t('conversations.adminTransfer.mostActive', 'Most active member')}
                    </span>
                    <span className="admin-transfer-option-hint">
                      {t('conversations.adminTransfer.mostActiveHint', 'The member who sent the most messages')}
                    </span>
                  </div>
                </label>

                <label className="admin-transfer-option">
                  <input
                    type="radio"
                    name="transfer-strategy"
                    value="manual"
                    checked={strategy === 'manual'}
                    onChange={() => setStrategy('manual')}
                    disabled={loading}
                  />
                  <div className="admin-transfer-option-content">
                    <span className="admin-transfer-option-label">
                      {t('conversations.adminTransfer.manual', 'Choose a member')}
                    </span>
                    <span className="admin-transfer-option-hint">
                      {t('conversations.adminTransfer.manualHint', 'Select a specific member to promote')}
                    </span>
                  </div>
                </label>

                {strategy === 'manual' && (
                  <div className="admin-transfer-member-list">
                    {members.map((member) => {
                      const name = member.displayName ?? member.username ?? member.id.slice(0, 8);
                      return (
                        <label key={member.id} className="admin-transfer-member-item">
                          <input
                            type="radio"
                            name="transfer-member"
                            value={member.id}
                            checked={selectedMemberId === member.id}
                            onChange={() => setSelectedMemberId(member.id)}
                            disabled={loading}
                          />
                          <span className="admin-transfer-member-name">{name}</span>
                          {member.username && (
                            <span className="admin-transfer-member-username">@{member.username}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="confirm-dialog-footer">
              <Button variant="secondary" onClick={onSkip} disabled={loading}>
                {t('conversations.adminTransfer.skip', 'Skip')}
              </Button>
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="primary"
                className="btn-warning"
                onClick={handleConfirm}
                disabled={loading || !canConfirm}
              >
                {loading ? (
                  <span className="confirm-dialog-loading">
                    <LoadingSpinner />
                    {t('conversations.adminTransfer.leave', 'Leave')}
                  </span>
                ) : (
                  t('conversations.adminTransfer.leave', 'Leave')
                )}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="confirm-dialog-spinner"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}
