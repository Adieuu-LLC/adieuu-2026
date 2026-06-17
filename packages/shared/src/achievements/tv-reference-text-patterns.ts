/**
 * TV-reference text patterns for profile fields (server) and encrypted messages (client claim).
 */

export const TV_REFERENCE_DISPLAY_NAME_ACTIONS = {
  jackBauer: 'display_name_jack_bauer',
  johnLocke: 'display_name_john_locke',
  nicholasBrody: 'display_name_nicholas_brody',
  davidWebb: 'display_name_david_webb',
  tonySoprano: 'display_name_tony_soprano',
  michaelScott: 'display_name_michael_scott',
  prisonMike: 'display_name_prison_mike',
} as const;

export const TV_REFERENCE_BIO_ACTIONS = {
  eventsRealTime: 'bio_events_real_time',
  lostNumbers: 'bio_lost_numbers',
  redStringCorkboard: 'bio_red_string_corkboard',
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

export function getTvReferenceDisplayNameAchievementActions(displayName: string): string[] {
  const actions: string[] = [];

  if (isJackBauerDisplayName(displayName)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.jackBauer);
  }
  if (isJohnLockeDisplayName(displayName)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.johnLocke);
  }
  if (isNicholasBrodyDisplayName(displayName)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.nicholasBrody);
  }
  if (isDavidWebbDisplayName(displayName)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.davidWebb);
  }
  if (isTonySopranoDisplayName(displayName)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.tonySoprano);
  }
  if (isMichaelScottDisplayName(displayName)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.michaelScott);
  }
  if (isPrisonMikeDisplayName(displayName)) {
    actions.push(TV_REFERENCE_DISPLAY_NAME_ACTIONS.prisonMike);
  }

  return actions;
}

export function getTvReferenceBioAchievementActions(bio: string): string[] {
  const actions: string[] = [];

  if (containsEventsOccurInRealTime(bio)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.eventsRealTime);
  }
  if (containsLostNumbers(bio)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.lostNumbers);
  }
  if (containsRedStringOrCorkboard(bio)) {
    actions.push(TV_REFERENCE_BIO_ACTIONS.redStringCorkboard);
  }

  return actions;
}

export function getTvReferenceProfileAchievementActions(text: string): string[] {
  const actions: string[] = [];

  if (containsCaptainOatsOrPrincessSparkle(text)) {
    actions.push(TV_REFERENCE_PROFILE_ACTIONS.sethCohenSpecial);
  }

  return actions;
}

export function getTvReferenceBioOrMessageAchievementActions(text: string): string[] {
  const actions: string[] = [];

  if (containsTribeHasSpoken(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.tribeSpoken);
  }
  if (containsOutwitOutplayOutlast(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.soleSurvivor);
  }
  if (containsIRememberEverything(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.jasonBourne);
  }
  if (containsTreadstoneOrBlackbriar(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.assetActivated);
  }
  if (containsHugeMistake(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.hugeMistake);
  }
  if (containsWaitForIt(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.waitForIt);
  }
  if (containsSuitUp(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.suitUp);
  }
  if (containsStarsHollow(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.starsHollow);
  }
  if (containsWithThePoodles(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.lukesDiner);
  }
  if (containsInOmniaParatus(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.inOmniaParatus);
  }
  if (containsGabagoolOrBadaBing(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.gabagool);
  }
  if (containsThatsWhatSheSaid(text)) {
    actions.push(TV_REFERENCE_BIO_OR_MESSAGE_ACTIONS.thatsWhatSheSaid);
  }

  return actions;
}
