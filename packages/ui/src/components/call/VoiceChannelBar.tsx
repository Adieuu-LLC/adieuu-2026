/**
 * Discord-style bottom bar while present in a Space voice channel.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpaces } from '../../hooks/useSpaces';
import { useVoiceChannelSession } from '../../hooks/useVoiceChannelSession';
import { useSpaceCipher } from '../../pages/spaces/useSpaceCipher';
import { resolveChannelDisplayName } from '../../pages/spaces/spaceMetadataCipher';
import { Button } from '../Button';

export function VoiceChannelBar() {
  const { t } = useTranslation();
  const { channels, activeSpace } = useSpaces();
  const { spaceCipher } = useSpaceCipher(activeSpace?.id);
  const { joined, phase, mediaState, setMediaState, leaveVoiceChannel } =
    useVoiceChannelSession();

  const channel = useMemo(
    () => (joined ? channels.find((c) => c.id === joined.channelId) : null),
    [channels, joined],
  );

  if (!joined || !channel) return null;

  const name = resolveChannelDisplayName(channel, spaceCipher, {
    encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
  });

  const statusLabel =
    phase === 'live'
      ? t('spaces.voice.statusLive')
      : phase === 'connecting'
        ? t('spaces.voice.statusConnecting')
        : t('spaces.voice.statusWaiting');

  return (
    <section className="voice-channel-bar" aria-label={t('spaces.voice.barLabel')}>
      <div className="voice-channel-bar__info">
        <span className="voice-channel-bar__icon" aria-hidden>
          ♪
        </span>
        <div className="voice-channel-bar__text">
          <span className="voice-channel-bar__name">{name}</span>
          <span className="voice-channel-bar__status">{statusLabel}</span>
        </div>
      </div>
      <div className="voice-channel-bar__controls">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void setMediaState({ audio: !mediaState.audio })}
          aria-pressed={!mediaState.audio}
        >
          {mediaState.audio ? t('spaces.voice.mute') : t('spaces.voice.unmute')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void setMediaState({ video: !mediaState.video })}
          aria-pressed={mediaState.video}
        >
          {mediaState.video ? t('spaces.voice.cameraOff') : t('spaces.voice.cameraOn')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => void leaveVoiceChannel()}>
          {t('spaces.voice.disconnect')}
        </Button>
      </div>
    </section>
  );
}
