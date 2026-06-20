import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  emitAchievementUnlocked,
  onAchievementUnlocked,
  resetAchievementEmitHistory,
  type AchievementUnlockEvent,
} from './achievementEvents';

const sampleDefinition = {
  id: 'first-message',
  name: 'achievements.firstMessage.name',
  description: 'achievements.firstMessage.description',
  icon: 'trophy',
  category: 'social',
};

beforeEach(() => {
  resetAchievementEmitHistory();
});

afterEach(() => {
  resetAchievementEmitHistory();
});

describe('achievementEvents', () => {
  test('forwards notificationId to listeners', () => {
    const received: AchievementUnlockEvent[] = [];
    const unsubscribe = onAchievementUnlocked((event) => {
      received.push(event);
    });

    emitAchievementUnlocked({
      achievementId: 'first-message',
      definition: sampleDefinition,
      notificationId: 'notif-abc',
    });

    unsubscribe();
    expect(received).toHaveLength(1);
    expect(received[0]?.notificationId).toBe('notif-abc');
  });

  test('deduplicates by achievementId within a session', () => {
    let count = 0;
    const unsubscribe = onAchievementUnlocked(() => {
      count += 1;
    });

    emitAchievementUnlocked({
      achievementId: 'first-message',
      definition: sampleDefinition,
      notificationId: 'notif-1',
    });
    emitAchievementUnlocked({
      achievementId: 'first-message',
      definition: sampleDefinition,
      notificationId: 'notif-2',
    });

    unsubscribe();
    expect(count).toBe(1);
  });
});
