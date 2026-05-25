chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'STICKYSITES_TOGGLE' });
  } catch {
    // Content script not injected on this page (chrome://, etc.)
  }
});
