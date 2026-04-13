/**
 * GIF and sticker picker and settings.
 */
export const gif = {
    pickerTitle: 'GIFs & Stickers',
    searchPlaceholder: 'Search KLIPY',
    tabGifs: 'GIFs',
    tabStickers: 'Stickers',
    noResults: 'No results for "{{query}}"',
    stickersSearchPrompt:
      'Type at least two characters in the search box to find stickers.',
    trendingGifsEmpty: 'No trending GIFs right now. Try searching above.',
    loading: 'Loading…',
    error: 'Failed to load results. Please try again.',
    retryButton: 'Retry',
    rateLimited: "You're searching a bit too fast. Try again in {{seconds}}s.",
    poweredBy: 'Powered by KLIPY',
    fallbackLabel: 'GIF: {{term}}',
    showThisGif: 'Show this GIF',
    removePreview: 'Remove GIF',
    settingsTitle: 'GIFs & Stickers',
    settingsDescription: "Controls whether GIF and sticker content from external providers loads in your browser. When disabled, you'll see a placeholder with the search term instead.",
    privacyAll: 'Show all GIFs and stickers',
    privacyPrivateOnly: 'Only in private conversations',
    privacyFriendsOnly: 'Only from friends',
    privacyDisabled: 'Disable GIFs and stickers entirely',
    conversationDisabledByAdmin: 'Disable GIFs for this conversation',
    conversationDisabledByAdminHint: 'This disables GIF and sticker content for all members',
    conversationHideForMe: 'Hide GIFs for me in this conversation',
    conversationHideForMeHint: 'Only affects your view',
    animateOnHoverOnly: 'Animate GIFs and Stickers only on hover',
    animateOnHoverOnlyHint:
      'Shows a still image until you hover or focus. If no still image is available for a message, the animation plays as usual.',
    animateOnHoverAria: 'GIF or sticker',
    composerButton: 'GIF',
    stickerButton: 'Stickers',
} as const;
