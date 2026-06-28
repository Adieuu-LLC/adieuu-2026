/**
 * Achievement definitions and UI.
 */
export const achievements = {
    unlocked: 'Achievement Unlocked!',
    dismiss: 'Brilliant!',
    dismiss1: 'Awesome!',
    dismiss2: 'Far Out!',
    dismiss3: 'Cowabunga!',
    dismiss4: 'Radical!',
    dismiss5: 'Splendid!',
    dismiss6: 'Groovy!',
    dismiss7: 'Wicked!',
    dismiss8: 'Bodacious!',
    dismiss9: 'Stellar!',
    noAchievements: 'No achievements earned yet.',
    notYetEarned: 'Not yet earned',
    youDontHaveThis: "You don't have this yet!",
    yourAchievements: 'Achievements',
    progressCountAria: '{{earned}} of {{total}} achievements earned',
    holderCount_one: '{{count}} other person has earned this',
    holderCount_other: '{{count}} other people have earned this',

    // Filters
    filterAll: 'All',
    filterEarned: 'Earned',
    filterUnearned: 'Not Yet Earned',
    noResults: 'No achievements match your filters.',

    // Categories
    category: {
      social: 'Social',
      messaging: 'Messaging',
      security: 'Security',
      profile: 'Profile',
      misc: 'Misc',
    },

    // Definition names & descriptions
    firstFriend: { name: 'You and Me', description: 'Add your first friend.' },
    fiveFriends: { name: 'The Gang is Back', description: 'Add five friends.' },
    tenFriends: { name: 'Social Butterfly', description: 'Add ten friends.' },
    blockSomeone: { name: 'Talk to the Hand', description: 'Block someone.' },
    blockedBySomeone: { name: 'It\'s Me, Not You!', description: 'Be blocked by someone.' },
    mutualBlock: { name: 'The Feeling\'s Mutual!', description: 'Mutually block another user.' },
    mutualReport: { name: "He Said, She Said", description: "Who are we to believe?" },
    blockUnblock: { name: 'On and Off Again', description: 'Maybe they\'re not so bad after all...' },
    firstMessage: { name: 'Hello, World!', description: 'Gotta start somewhere.' },
    hundredMessages: { name: 'Chatterbox', description: 'I like to talk.' },
    firstGroup: { name: 'Man in the Middle', description: 'Create your first group conversation.' },
    deleteForEveryone: { name: 'Take It Back', description: 'Delete a message you sent.' },
    ttlMessageSent: { name: 'Going, Going, Gone!', description: 'Send a disappearing message.' },
    fsMessageSent: { name: 'Burn After Reading', description: 'Send a message with forward secrecy enabled.' },
    fsDefaultEnabled: { name: 'Always Forward!', description: 'Enable forward secrecy as your default.' },
    fsTtlMessage: { name: "Out of Time", description: 'Send a message with both forward secrecy and a TTL.' },
    profileCustomized: { name: 'Express Yourself', description: 'Customise your profile.' },
    bannerSet: { name: 'Banner Bearer', description: 'Set a profile banner.' },
    themeSaved: { name: 'Just How I Like It', description: 'Create or edit and save an appearance theme.' },
    firstReaction: { name: 'Reactor', description: 'React to a message for the first time.' },
    notificationsDisabled: { name: 'I Prefer It Quiet', description: 'Disable all notification sounds.' },
    notificationMaxVolume: { name: "Can You Hear Me Now?", description: 'Your notifications aren\'t loud enough!' },
    showMessageArtifacts: { name: 'Archaeologist', description: 'History is important.' },
    getOffMyLawn: { name: 'Get off my lawn!', description: 'Lock down your profile to outsiders.' },
    iWasNeverHere: { name: 'I was never here', description: 'Hide your presence from prying eyes.' },
    polarizing: { name: 'Aghhh, My Eyes!', description: 'Make a bold statement with your profile colours.' },
    weDontTalkAnymore: { name: "I Don't Recognize You Anymore!", description: 'Part ways with a friend.' },
    answerToUniverse: { name: 'Life, the Universe, and Everything', description: 'How many Pan-Galactic Gargle Blasters have you had?' },
    blazeIt: { name: 'Blaze It', description: 'Medicinal, or recreational?' },
    nsfw: { name: 'Curses!', description: 'I\'ve seen things you people wouldn\'t believe.' },
    sailor: { name: 'Like a Sailor', description: 'Perhaps out of place in polite society?' },
    besties: { name: 'Besties!', description: 'We have a special bond.' },
    stalker: { name: 'Stalker', description: 'Somebody\'s watching you!' },
    firstGif: { name: 'Worth a Thousand Words', description: 'Send your first GIF.' },
    gifEnthusiast: { name: 'GIF-ted', description: "You really like GIFs, don't you?" },
    firstSticker: { name: 'Stick With It', description: 'Send your first sticker.' },
    stickerCollector: { name: 'Sticker Collector', description: "You've amassed quite the collection." },
    rickroll: { name: 'Never Gonna Give You Up', description: 'You know exactly what you did.' },
    pressF: { name: 'Press F to Pay Respects', description: 'A solemn tribute.' },
    overNineThousand: { name: "It's Over 9000!", description: "What?! That can't be right!" },
    uwu: { name: 'UwU', description: '*notices your achievement*' },
    allCaps: { name: 'Indoor Voice, Please', description: 'We can hear you just fine.' },
    laughingOutLoud: { name: 'Laughing Out Loud', description: 'Classic internet laughter.' },
    shrug: { name: 'It Is What It Is', description: "Sometimes words just aren't enough." },
    viennaCalling: { name: 'Vienna Calling', description: 'Start a call for the first time.' },
    kthxbye: { name: 'kthxbye', description: 'Leave a call for the first time.' },
    oneInAMillion: {
      name: 'One in a Million',
      description: 'Man getting bit by an alligator, and he screams.',
    },
    imHelping: { name: "I'm Helping!", description: 'Upvote a feature or feedback report for the first time.' },
    bigBrain: { name: 'Big Brain', description: 'Submit a feature or feedback report that gets at least 10 upvotes.' },
    whyDidntIThink: {
      name: "Why Didn't I Think of That?",
      description: 'Have a suggested feature accepted by Adieuu staff.',
    },
    pushedToProd: {
      name: 'Just Ship It!',
      description: 'Have a suggested feature fully implemented and released by Adieuu.',
    },
    itsAllConnected: {
      name: "It's all connected!",
      description: 'Link a feedback item to another for the first time.',
    },
    howIsPrangentFormed: {
      name: 'how is prangent formed',
      description: 'Comedy gold until May 4, 2021.',
    },
    priceless: {
      name: 'Priceless',
      description: "For everything else, there's a trademark dispute we'd rather avoid.",
    },
    corporateJargonBingo: {
      name: 'Corporate Jargon Bingo',
      description: 'You actually used the word "synergy." We are both impressed and disappointed.',
    },
    doorClosingSound: {
      name: '*Door Closing Sound*',
      description: 'Put up an angsty away message. Mom needs to use the landline.',
    },
    enteringChatRoom: {
      name: 'Entering the Chat Room',
      description: "18/f/cali. Just kidding, I'm a chat app!",
    },
    atLeastIHaveChicken: {
      name: "At least I have Chicken",
      description: "Time's up, let's do this!",
    },
    oneDoesNotSimply: {
      name: 'One Does Not Simply...',
      description: 'Its gates are guarded by more than just orcs!',
    },
    ahAhAh: {
      name: 'Ah Ah Ah!',
      description: "You didn't say the magic word!",
    },
    ughAsIf: {
      name: 'Ugh, As If!',
      description: "You are totally buggin' right now.",
    },
    downTheRabbitHole: {
      name: 'Down the Rabbit Hole',
      description: 'How deep does it go?',
    },
    edgeLord03: {
      name: "Edge Lord '03",
      description: 'We get it, you listened to nu-metal and played Halo.',
    },
    hawaiianOrganDonor: {
      name: '25-Year-Old Hawaiian Organ Donor',
      description: 'It was between that or Mohammed.',
    },
    pleaseStandUp: {
      name: 'Please Stand Up',
      description: "We're gonna have a problem here.",
    },
    witnessProtection: {
      name: 'Witness Protection',
      description: 'Who are you running from? Is it the feds?',
    },
    artistFormerlyKnownAs: {
      name: 'The Artist Formerly Known As',
      description: "We'll make sure to queue up something special for you.",
    },
    theRedPill: {
      name: 'The Red Pill',
      description: 'Wake up. The platform has you.',
    },
    tomsBestFriend: {
      name: "Tom's Best Friend",
      description: "Trying to code a custom glitter background, aren't we?",
    },
    caughtInTheRain: {
      name: 'Caught in the Rain',
      description: 'Do you like piña coladas?',
    },
    blockbusterScriptwriter: {
      name: 'Blockbuster Scriptwriter',
      description: "We asked for a bio, not the entire script of a 90s movie!",
    },
    strongSilentType: {
      name: 'The Strong, Silent Type',
      description: '...',
    },
    dialupSound: {
      name: 'EEEEE-AWWWW-BING-BONG',
      description: 'We can hear this bio, and it takes 5 minutes to load a picture.',
    },
    heWasABoy: {
      name: 'He Was a Boy',
      description: 'She said see ya later boy.',
    },
    cantSitWithUs: {
      name: "You Can't Sit With Us",
      description: 'On Wednesdays we wear pink.',
    },
    zoltan: {
      name: 'Dude, Sweet',
      description: '*Makes Z shape with hands*',
    },
    slappersOnly: {
      name: 'Slappers Only',
      description: 'No cheap picks allowed.',
    },
    yerAWizard: {
      name: "Yer a Wizard",
      description: 'Something magical just happened.',
    },
    townLocal: {
      name: 'Town Local',
      description: 'Like no one ever was.',
    },
    identityTheftJoke: {
      name: 'Identity Theft is Not a Joke',
      description: 'Millions of families suffer every year!',
    },
    saveMe: {
      name: 'Save Me',
      description: 'Call my name and save me from the dark.',
    },
    theBedazzler: {
      name: 'The Bedazzler',
      description: "T9 predictive text couldn't handle this much flair.",
    },
    noThatsImpossible: {
      name: "No, That's Impossible",
      description: 'You know it to be true.',
    },
    theLongestDay: {
      name: 'The Longest Day',
      description: "Dammit, we're running out of time!",
    },
    beepBeepBeep: {
      name: 'Beep... Beep... Beep...',
      description: 'Events occur in real time.',
    },
    systemFailureImminent: {
      name: 'System Failure Imminent',
      description: 'You better push the button.',
    },
    dontTellMeWhatICantDo: {
      name: "Don't Tell Me What I Can't Do",
      description: "You just found something you weren't supposed to.",
    },
    grabYourTorch: {
      name: 'Grab Your Torch',
      description: "It's time for you to go.",
    },
    soleSurvivor: {
      name: 'Sole Survivor',
      description: "You've outlasted everyone else.",
    },
    corkboardMethod: {
      name: 'The Corkboard Method',
      description: 'Turn up the frantic jazz music.',
    },
    turnedAsset: {
      name: 'Turned Asset',
      description: "We're keeping an eye on you.",
    },
    jesusChrist: {
      name: 'Jesus Christ...',
      description: "Listen, people - do you have any idea who you're dealing with?",
    },
    assetActivated: {
      name: 'Asset Activated',
      description: 'Look at us. Look at what they make you give.',
    },
    offTheGrid: {
      name: 'Off the Grid',
      description: 'Get some rest. You look tired.',
    },
    holidayMashup: {
      name: 'The Holiday Mashup',
      description: 'The best of both holidays, all year round.',
    },
    helloDarkness: {
      name: 'Hello Darkness',
      description: 'My old friend.',
    },
    legendary: {
      name: 'Legen...',
      description: '...dary.',
    },
    theBroCode: {
      name: 'The Bro Code',
      description: 'Challenge accepted!',
    },
    townMeeting: {
      name: 'Town Meeting',
      description: 'The selectman requires your attendance.',
    },
    dinerRegular: {
      name: 'Diner Regular',
      description: 'You definitely need more coffee.',
    },
    inOmniaParatus: {
      name: 'In Omnia Paratus',
      description: 'You jump, I jump, Jack.',
    },
    wasteManagementConsultant: {
      name: 'Waste Management Consultant',
      description: 'Woke up this morning...',
    },
    porkStoreVip: {
      name: 'Pork Store VIP',
      description: 'Whatever happened to the strong, silent type?',
    },
    regionalManager: {
      name: 'Regional Manager',
      description: "Or, World's Best Boss.",
    },
    worstThingAboutPrison: {
      name: 'The Worst Thing About Prison',
      description: 'It was the... you know what, never mind.',
    },
    theAnnualAward: {
      name: 'The Annual Award',
      description: 'You really left us no choice but to give you this.',
    },
    whatAreYou: {
      name: 'WHAT ARE YOU?!',
      description: 'An idiot sandwich, Chef.',
    },
    itsRaw: {
      name: "IT'S RAW!",
      description: "Look at it! It's still moving!",
    },
    welcomeMayorsOffice: {
      name: "Welcome to the Mayor's Office",
      description: 'That bio is totally out of bounds.',
    },
    theNorthRemembers: {
      name: 'The North Remembers',
      description: 'Winter came, and you survived.',
    },
    breakerOfChains: {
      name: 'Breaker of Chains',
      description: 'Saver of Profiles, Bender of Rules.',
    },
    notToday: {
      name: 'Not Today',
      description: 'Who are you, again?',
    },
    theRightHand: {
      name: 'The Right Hand',
      description: 'Every ruler needs a trusted advisor.',
    },
    eatTheFood: {
      name: 'Eat the Food!',
      description: 'Make sure to feed your pet llama.',
    },
    stayClassy: {
      name: 'Stay Classy',
      description: 'A touch of class goes a long way.',
    },
    freakinIdiot: {
      name: "Freakin' Idiot!",
      description: 'You can always just make yourself a dang quesadilla.',
    },
    ouchCharlie: {
      name: 'Ouch, Charlie!',
      description: 'And that really hurt, Charlie!',
    },
    coldPop: {
      name: 'Cold Pop',
      description: "I didn't grab no shoes or nothin' Jesus.",
    },
    noThisIsPatrick: {
      name: 'No, This Is Patrick!',
      description: 'I am not a restaurant.',
    },
    earthKingdom: {
      name: 'The Earth Kingdom',
      description: 'This place could use some work.',
    },
    notSureIf: {
      name: "I'm Not Sure If...",
      description: "We've reviewed all the evidence, and...",
    },
    brawndo: {
      name: "It's Got What Plants Crave",
      description: "It's got electrolytes.",
    },
    rehabilitation: {
      name: 'Rehabilitation',
      description: 'An unforgettable assault on your comfort zone.',
    },
    whatPlantsCrave: {
      name: 'Electrolytes',
      description: 'Do you even know what electrolytes are?',
    },
    owMy: {
      name: 'Ow, My...',
      description: "The number-one-rated hit show.",
    },
    welcomeToTheFuture: {
      name: 'Welcome to the Future',
      description: 'Would you like to try our Extra Big Ass Taco?',
    },
    hiBob: { name: 'Hi, Bob!', description: 'Hi, Bob!' },
    theCanOpener: { name: 'The Can Opener', description: 'Some rituals are sacred.' },
    itsNotBragging: { name: "It's Not Bragging", description: '...if it\'s true.' },
    sponsor: { name: 'Patron of the Arts', description: 'Sponsored another user\'s subscription.' },
} as const;
