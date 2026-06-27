import { describe, expect, test } from 'bun:test';
import {
  getTvReferenceBioAchievementActions,
  getTvReferenceBioOrMessageAchievementActions,
  getTvReferenceDisplayNameAchievementActions,
  getTvReferenceProfileAchievementActions,
  TV_REFERENCE_BIO_ACTIONS,
  TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS,
  TV_REFERENCE_DISPLAY_NAME_ACTIONS,
  TV_REFERENCE_PROFILE_ACTIONS,
} from './tv-reference-text-patterns';

describe('tv reference display name achievements', () => {
  test('requires exact display names', () => {
    expect(getTvReferenceDisplayNameAchievementActions('Jack Bauer')).toContain(
      TV_REFERENCE_DISPLAY_NAME_ACTIONS.jackBauer,
    );
    expect(getTvReferenceDisplayNameAchievementActions('jack bauer')).toContain(
      TV_REFERENCE_DISPLAY_NAME_ACTIONS.jackBauer,
    );
    expect(getTvReferenceDisplayNameAchievementActions('Jack Bauer Jr.')).not.toContain(
      TV_REFERENCE_DISPLAY_NAME_ACTIONS.jackBauer,
    );
    expect(getTvReferenceDisplayNameAchievementActions('Prison Mike')).toContain(
      TV_REFERENCE_DISPLAY_NAME_ACTIONS.prisonMike,
    );
    expect(getTvReferenceDisplayNameAchievementActions('Daenerys Targaryen')).toContain(
      TV_REFERENCE_DISPLAY_NAME_ACTIONS.khaleesiDaenerys,
    );
    expect(getTvReferenceDisplayNameAchievementActions('Krusty Krab')).toContain(
      TV_REFERENCE_DISPLAY_NAME_ACTIONS.krustyKrab,
    );
    expect(getTvReferenceDisplayNameAchievementActions('Not Sure')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.notSureIf,
    );
    expect(getTvReferenceDisplayNameAchievementActions('President Camacho')).toContain(
      TV_REFERENCE_DISPLAY_NAME_ACTIONS.camacho,
    );
  });
});

describe('tv reference bio achievements', () => {
  test('detects 24, lost numbers, and homeland corkboard cues', () => {
    expect(getTvReferenceBioAchievementActions('events occur in real time')).toContain(
      TV_REFERENCE_BIO_ACTIONS.eventsRealTime,
    );
    expect(getTvReferenceBioAchievementActions('4 8 15 16 23 42')).toContain(
      TV_REFERENCE_BIO_ACTIONS.lostNumbers,
    );
    expect(getTvReferenceBioAchievementActions('4, 8, 15, 16, 23, 42')).toContain(
      TV_REFERENCE_BIO_ACTIONS.lostNumbers,
    );
    expect(getTvReferenceBioAchievementActions('red string theory')).toContain(
      TV_REFERENCE_BIO_ACTIONS.redStringCorkboard,
    );
    expect(getTvReferenceBioAchievementActions('my corkboard')).toContain(
      TV_REFERENCE_BIO_ACTIONS.redStringCorkboard,
    );
  });

  test('detects meme bio phrases', () => {
    expect(getTvReferenceBioAchievementActions('welcome to flavortown')).toContain(
      TV_REFERENCE_BIO_ACTIONS.flavortown,
    );
    expect(getTvReferenceBioAchievementActions('not today')).toContain(
      TV_REFERENCE_BIO_ACTIONS.notToday,
    );
    expect(getTvReferenceBioAchievementActions('I drink and I know things')).toContain(
      TV_REFERENCE_BIO_ACTIONS.drinkAndKnowThings,
    );
    expect(getTvReferenceBioAchievementActions('vote for Pedro')).toContain(
      TV_REFERENCE_BIO_ACTIONS.voteForPedro,
    );
    expect(getTvReferenceBioAchievementActions('charlie bit me')).toContain(
      TV_REFERENCE_BIO_ACTIONS.charlieBitMe,
    );
    expect(getTvReferenceBioAchievementActions("ain't nobody got time for that")).toContain(
      TV_REFERENCE_BIO_ACTIONS.aintNobodyGotTime,
    );
    expect(getTvReferenceBioAchievementActions('my cabbages!')).toContain(
      TV_REFERENCE_BIO_ACTIONS.myCabbages,
    );
    expect(getTvReferenceBioAchievementActions('powered by brawndo')).toContain(
      TV_REFERENCE_BIO_ACTIONS.brawndo,
    );
    expect(getTvReferenceBioAchievementActions('enrolled in rehabilitation')).toContain(
      TV_REFERENCE_BIO_ACTIONS.rehabilitation,
    );
  });
});

describe('tv reference profile achievements', () => {
  test('detects captain oats or princess sparkle in bio or display name text', () => {
    expect(getTvReferenceProfileAchievementActions('Captain Oats fan')).toContain(
      TV_REFERENCE_PROFILE_ACTIONS.sethCohenSpecial,
    );
    expect(getTvReferenceProfileAchievementActions('Princess Sparkle')).toContain(
      TV_REFERENCE_PROFILE_ACTIONS.sethCohenSpecial,
    );
  });
});

describe('tv reference bio or message achievements', () => {
  test('detects cross-surface pop-culture phrases', () => {
    expect(getTvReferenceBioOrMessageAchievementActions('the tribe has spoken')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.tribeSpoken,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('outwit outplay outlast')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.soleSurvivor,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('I remember everything')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.jasonBourne,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('Treadstone activated')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.assetActivated,
    );
    expect(getTvReferenceBioOrMessageAchievementActions("I've made a huge mistake")).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.hugeMistake,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('wait for it...')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.waitForIt,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('suit up!')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.suitUp,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('Stars Hollow resident')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.starsHollow,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('with the poodles again')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.lukesDiner,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('in omnia paratus')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.inOmniaParatus,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('gabagool over here')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.gabagool,
    );
    expect(getTvReferenceBioOrMessageAchievementActions("that's what she said")).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.thatsWhatSheSaid,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('idiot sandwich')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.idiotSandwich,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('where is the lamb sauce')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.lambSauce,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('winter is coming')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.winterIsComing,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('you fat lard')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.youFatLard,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('glass case of emotion')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.glassCaseOfEmotion,
    );
    expect(getTvReferenceBioOrMessageAchievementActions("I'm not sure if that's legal")).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.notSureIf,
    );
    expect(getTvReferenceBioOrMessageAchievementActions("it's got what plants crave")).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.whatPlantsCrave,
    );
    expect(getTvReferenceBioOrMessageAchievementActions('ow, my balls')).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.owMyBalls,
    );
    expect(getTvReferenceBioOrMessageAchievementActions("welcome to carl's jr")).toContain(
      TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.carlsJr,
    );
  });
});
