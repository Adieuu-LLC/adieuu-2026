import { useTranslation } from 'react-i18next';
import { InfoTip } from '../InfoTip';
import { Icon } from '../../icons/Icon';
import { useCallConnectionMetrics } from './useCallConnectionMetrics';
import { chatConnectionStateLabelKey } from './callConnectionMetrics';

function formatPingValue(rttMs: number | null, unavailableLabel: string): string {
  if (rttMs === null) {
    return unavailableLabel;
  }
  return `${rttMs} ms`;
}

function formatNetworkValue(
  metrics: ReturnType<typeof useCallConnectionMetrics>,
  unavailableLabel: string,
  browserUnavailableLabel: string,
): string {
  const { networkInfo } = metrics;
  if (!networkInfo) {
    return browserUnavailableLabel;
  }

  const parts: string[] = [];
  if (networkInfo.effectiveType) {
    parts.push(networkInfo.effectiveType.toUpperCase());
  }
  if (networkInfo.downlinkMbps !== undefined) {
    parts.push(`${networkInfo.downlinkMbps} Mbps`);
  }
  if (networkInfo.rttMs !== undefined) {
    parts.push(`${networkInfo.rttMs} ms RTT`);
  }

  return parts.length > 0 ? parts.join(' · ') : unavailableLabel;
}

export function CallConnectionIndicator() {
  const { t } = useTranslation();
  const metrics = useCallConnectionMetrics();
  const unavailableLabel = t('call.connectionDetailUnavailable');

  const popoverContent = (
    <dl className="call-connection-info-list">
      <div className="call-connection-info-list__row">
        <dt>{t('call.connectionDetailMediaQuality')}</dt>
        <dd>{t(metrics.qualityLabelKey)}</dd>
      </div>
      <div className="call-connection-info-list__row">
        <dt>{t('call.connectionDetailMediaState')}</dt>
        <dd>{t(metrics.connectionStateLabelKey)}</dd>
      </div>
      <div className="call-connection-info-list__row">
        <dt>{t('call.connectionDetailSignalingPing')}</dt>
        <dd>{formatPingValue(metrics.lastHeartbeatRttMs, unavailableLabel)}</dd>
      </div>
      <div className="call-connection-info-list__row">
        <dt>{t('call.connectionDetailNetwork')}</dt>
        <dd>{formatNetworkValue(metrics, unavailableLabel, t('call.connectionDetailNetworkUnavailable'))}</dd>
      </div>
      {metrics.showChatConnectionWarning && (
        <div className="call-connection-info-list__row call-connection-info-list__row--warn">
          <dt>{t('call.connectionDetailChatConnection')}</dt>
          <dd>{t(chatConnectionStateLabelKey(metrics.chatConnectionState))}</dd>
        </div>
      )}
    </dl>
  );

  const indicatorClass = [
    'call-connection-indicator',
    metrics.colorClass,
  ].join(' ');

  return (
    <InfoTip
      mode="popover"
      position="bottom"
      className="call-connection-info-tooltip"
      content={popoverContent}
    >
      <button
        type="button"
        className={indicatorClass}
        aria-label={t('call.connectionIndicatorLabel', { quality: t(metrics.qualityLabelKey) })}
      >
        <Icon name={metrics.iconName} size="sm" />
      </button>
    </InfoTip>
  );
}
