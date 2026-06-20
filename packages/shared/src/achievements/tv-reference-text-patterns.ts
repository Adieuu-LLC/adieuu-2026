/**
 * TV-reference text patterns for profile fields (server) and encrypted messages (client claim).
 *
 * Security: all patterns are static literals; user text is never interpolated
 * into RegExp. Scanning is bounded per surface (bio, display name, message).
 */

import {
  ACHIEVEMENT_BIO_SCAN_MAX_LENGTH,
  ACHIEVEMENT_DISPLAY_NAME_SCAN_MAX_LENGTH,
  ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH,
  textForAchievementScan,
} from './safe-achievement-text-scan';

export const TV_REFERENCE_DISPLAY_NAME_ACTIONS = {
  jackBauer: 'display_name_jack_bauer',
  johnLocke: 'display_name_john_locke',
  nicholasBrody: 'display_name_nicholas_brody',
  davidWebb: 'display_name_david_webb',
  tonySoprano: 'display_name_tony_soprano',
  michaelScott: 'display_name_michael_scott',
  prisonMike: 'display_name_prison_mike',
  khaleesiDaenerys: 'display_name_khaleesi_daenerys',
  krustyKrab: 'display_name_krusty_krab',
  camacho: 'display_name_camacho',
} as const;

export const TV_REFERENCE_BIO_ACTIONS = {
  eventsRealTime: 'bio_events_real_time',
  lostNumbers: 'bio_lost_numbers',
  redStringCorkboard: 'bio_red_string_corkboard',
  flavortown: 'bio_flavortown',
  notToday: 'bio_not_today',
  drinkAndKnowThings: 'bio_drink_and_know_things',
  voteForPedro: 'bio_vote_for_pedro',
  charlieBitMe: 'bio_charlie_bit_me',
  aintNobodyGotTime: 'bio_aint_nobody_got_time',
  myCabbages: 'bio_my_cabbages',
  brawndo: 'bio_brawndo',
  rehabilitation: 'bio_rehabilitation',
} as const;

export const TV_REFERENCE_PROFILE_ACTIONS = {
  sethCohenSpecial: 'profile_seth_cohen_special',
} as const;

export const TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS = {
  tribeSpoken: 'text_tribe_spoken',
  soleSurvivor: 'text_sole_survivor',
  jasonBourne: 'text_jason_bourne',
  assetActivated: 'text_asset_activated',
  hugeMistake: 'text_huge_mistake',
  waitForIt: 'text_wait_for_it',
  suitUp: 'text_suit_up',
  starsHollow: 'text_stars_hollow',
  lukesDiner: 'text_lukes_diner',
  inOmniaParatus: 'text_in_omnia_paratus',
  gabagool: 'text_gabagool',
  thatsWhatSheSaid: 'text_thats_what_she_said',
  idiotSandwich: 'text_idiot_sandwich',
  lambSauce: 'text_lamb_sauce',
  winterIsComing: 'text_winter_is_coming',
  youFatLard: 'text_you_fat_lard',
  glassCaseOfEmotion: 'text_glass_case_of_emotion',
  notSureIf: 'text_not_sure_if',
  whatPlantsCrave: 'text_what_plants_crave',
  owMyBalls: 'text_ow_my_balls',
  carlsJr: 'text_carls_jr',
} as const;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function isExactDisplayName(displayName: string, expected: string): boolean {
  return normalize(displayName) === expected.toLowerCase();
}

export function isJackBauerDisplayName(displayName: string): boolean {
  return isExactDisplayName(displayName, 'Jack Bauer');
}

export function isJohnLockeDisplayName(displayName: string): boolean {
  return isExactDisplayName(displayName, 'John Locke');
}

export function isNicholasBrodyDisplayName(displayName: string): boolean {
  return isExactDisplayName(displayName, 'Nicholas Brody');
}

export function isDavidWebbDisplayName(displayName: string): boolean {
  return isExactDisplayName(displayName, 'David Webb');
}

export function isTonySopranoDisplayName(displayName: string): boolean {
  return isExactDisplayName(displayName, 'Tony Soprano');
}

export function isMichaelScottDisplayName(displayName: string): boolean {
  return isExactDisplayName(displayName, 'Michael Scott');
}

export function isPrisonMikeDisplayName(displayName: string): boolean {
  return isExactDisplayName(displayName, 'Prison Mike');
}

export function containsKhaleesiOrDaenerysDisplayName(displayName: string): boolean {
  return /\bkhaleesi\b/i.test(displayName) || /\bdaenerys\b/i.test(displayName);
}

export function isKrustyKrabDisplayName(displayName: string): boolean {
  return isExactDisplayName(displayName, 'Krusty Krab');
}

export function isNotSureDisplayName(displayName: string): boolean {
  return isExactDisplayName(displayName, 'Not Sure');
}

export function containsCamachoDisplayName(displayName: string): boolean {
  return /\bcamacho\b/i.test(displayName);
}

export function containsEventsOccurInRealTime(text: string): boolean {
  return /events occur in real time/i.test(text);
}

export function containsLostNumbers(text: string): boolean {
  const normalized = text.replace(/[,.\-]/g, ' ');
  return /(?:^|[^\d])4(?:[^\d]+)8(?:[^\d]+)15(?:[^\d]+)16(?:[^\d]+)23(?:[^\d]+)42(?:[^\d]|$)/.test(
    normalized,
  );
}

export function containsRedStringOrCorkboard(text: string): boolean {
  return /\bred string\b/i.test(text) || /\bcorkboard\b/i.test(text);
}

export function containsCaptainOatsOrPrincessSparkle(text: string): boolean {
  return /\bcaptain oats\b/i.test(text) || /\bprincess sparkle\b/i.test(text);
}

export function containsTribeHasSpoken(text: string): boolean {
  return /the tribe has spoken/i.test(text);
}

export function containsOutwitOutplayOutlast(text: string): boolean {
  return (
    /\boutwit\b/i.test(text) &&
    /\boutplay\b/i.test(text) &&
    /\boutlast\b/i.test(text)
  );
}

export function containsIRememberEverything(text: string): boolean {
  return /i remember everything/i.test(text);
}

export function containsTreadstoneOrBlackbriar(text: string): boolean {
  return /\btreadstone\b/i.test(text) || /\bblackbriar\b/i.test(text);
}

export function containsHugeMistake(text: string): boolean {
  return /i'?ve made a huge mistake/i.test(text);
}

export function containsWaitForIt(text: string): boolean {
  return /wait for it/i.test(text);
}

export function containsSuitUp(text: string): boolean {
  return /suit up/i.test(text);
}

export function containsStarsHollow(text: string): boolean {
  return /stars hollow/i.test(text);
}

export function containsWithThePoodles(text: string): boolean {
  return /with the poodles/i.test(text);
}

export function containsInOmniaParatus(text: string): boolean {
  return /in omnia paratus/i.test(text);
}

export function containsGabagoolOrBadaBing(text: string): boolean {
  return /\bgabagool\b/i.test(text) || /\bbada bing\b/i.test(text);
}

export function containsThatsWhatSheSaid(text: string): boolean {
  return /that'?s what she said/i.test(text);
}

export function containsIdiotSandwich(text: string): boolean {
  return /idiot sandwich/i.test(text);
}

export function containsLambSauce(text: string): boolean {
  return /\blamb sauce\b/i.test(text);
}

export function containsFlavortown(text: string): boolean {
  return /\bflavortown\b/i.test(text);
}

export function containsWinterIsComing(text: string): boolean {
  return /winter is coming/i.test(text);
}

export function containsNotToday(text: string): boolean {
  return /\bnot today\b/i.test(text);
}

export function containsDrinkAndIKnowThings(text: string): boolean {
  return /drink and i know things/i.test(text);
}

export function containsYouFatLard(text: string): boolean {
  return /you fat lard/i.test(text);
}

export function containsGlassCaseOfEmotion(text: string): boolean {
  return /glass case of emotion/i.test(text);
}

export function containsVoteForPedro(text: string): boolean {
  return /vote for pedro/i.test(text);
}

export function containsCharlieBitMe(text: string): boolean {
  return /charlie bit me/i.test(text);
}

export function containsAintNobodyGotTimeForThat(text: string): boolean {
  return /ain'?t nobody got time for that/i.test(text);
}

export function containsMyCabbages(text: string): boolean {
  return /\bmy cabbages\b/i.test(text);
}

export function containsBrawndo(text: string): boolean {
  return /\bbrawndo\b/i.test(text);
}

export function containsRehabilitation(text: string): boolean {
  return /\brehabilitation\b/i.test(text);
}

export function containsNotSureIf(text: string): boolean {
  return /not sure if/i.test(text);
}

export function containsWhatPlantsCrave(text: string): boolean {
  return /what plants crave/i.test(text);
}

export function containsOwMyBalls(text: string): boolean {
  return /ow,? my balls/i.test(text);
}

export function containsCarlsJr(text: string): boolean {
  return /\bcarl'?s jr\b/i.test(text);
}

export function getTvReferenceDisplayNameAchievementActions(displayName: string): string[] {
  const bounded = textForAchievementScan(
    displayName,
    ACHIEVEMENT_DISPLAY_NAME_SCAN_MAX_LENGTH,
    'skip',
  );
  if (bounded === null) return [];

  const actions: string[] = [];

  if (isJackBauerDisplayName(bounded)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.jackBauer);
  }
  if (isJohnLockeDisplayName(bounded)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.johnLocke);
  }
  if (isNicholasBrodyDisplayName(bounded)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.nicholasBrody);
  }
  if (isDavidWebbDisplayName(bounded)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.davidWebb);
  }
  if (isTonySopranoDisplayName(bounded)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.tonySoprano);
  }
  if (isMichaelScottDisplayName(bounded)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.michaelScott);
  }
  if (isPrisonMikeDisplayName(bounded)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.prisonMike);
  }
  if (containsKhaleesiOrDaenerysDisplayName(bounded)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.khaleesiDaenerys);
  }
  if (isKrustyKrabDisplayName(bounded)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.krustyKrab);
  }
  if (isNotSureDisplayName(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.notSureIf);
  }
  if (containsCamachoDisplayName(bounded)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.camacho);
  }

  return actions;
}

export function getTvReferenceBioAchievementActions(bio: string): string[] {
  const bounded = textForAchievementScan(bio, ACHIEVEMENT_BIO_SCAN_MAX_LENGTH, 'skip');
  if (bounded === null) return [];

  const actions: string[] = [];

  if (containsEventsOccurInRealTime(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.eventsRealTime);
  }
  if (containsLostNumbers(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.lostNumbers);
  }
  if (containsRedStringOrCorkboard(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.redStringCorkboard);
  }
  if (containsFlavortown(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.flavortown);
  }
  if (containsNotToday(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.notToday);
  }
  if (containsDrinkAndIKnowThings(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.drinkAndKnowThings);
  }
  if (containsVoteForPedro(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.voteForPedro);
  }
  if (containsCharlieBitMe(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.charlieBitMe);
  }
  if (containsAintNobodyGotTimeForThat(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.aintNobodyGotTime);
  }
  if (containsMyCabbages(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.myCabbages);
  }
  if (containsBrawndo(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.brawndo);
  }
  if (containsRehabilitation(bounded)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.rehabilitation);
  }

  return actions;
}

export function getTvReferenceProfileAchievementActions(text: string): string[] {
  const bounded = textForAchievementScan(text, ACHIEVEMENT_BIO_SCAN_MAX_LENGTH, 'skip');
  if (bounded === null) return [];

  const actions: string[] = [];

  if (containsCaptainOatsOrPrincessSparkle(bounded)) {
    actions.push(TV_REFERENCE_PROFILE_ACTIONS.sethCohenSpecial);
  }

  return actions;
}

export function getTvReferenceBioOrMessageAchievementActions(text: string): string[] {
  const bounded = textForAchievementScan(text, ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH);
  if (bounded === null) return [];

  const actions: string[] = [];

  if (containsTribeHasSpoken(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.tribeSpoken);
  }
  if (containsOutwitOutplayOutlast(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.soleSurvivor);
  }
  if (containsIRememberEverything(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.jasonBourne);
  }
  if (containsTreadstoneOrBlackbriar(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.assetActivated);
  }
  if (containsHugeMistake(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.hugeMistake);
  }
  if (containsWaitForIt(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.waitForIt);
  }
  if (containsSuitUp(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.suitUp);
  }
  if (containsStarsHollow(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.starsHollow);
  }
  if (containsWithThePoodles(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.lukesDiner);
  }
  if (containsInOmniaParatus(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.inOmniaParatus);
  }
  if (containsGabagoolOrBadaBing(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.gabagool);
  }
  if (containsThatsWhatSheSaid(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.thatsWhatSheSaid);
  }
  if (containsIdiotSandwich(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.idiotSandwich);
  }
  if (containsLambSauce(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.lambSauce);
  }
  if (containsWinterIsComing(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.winterIsComing);
  }
  if (containsYouFatLard(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.youFatLard);
  }
  if (containsGlassCaseOfEmotion(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.glassCaseOfEmotion);
  }
  if (containsNotSureIf(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.notSureIf);
  }
  if (containsWhatPlantsCrave(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.whatPlantsCrave);
  }
  if (containsOwMyBalls(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.owMyBalls);
  }
  if (containsCarlsJr(bounded)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.carlsJr);
  }

  return actions;
}
