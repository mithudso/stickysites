// Create context menus on install
chrome.runtime.onInstalled.addListener(() => {
  // Allow content scripts to access session storage for encryption key caching
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

  chrome.contextMenus.create({
    id: 'stickysites-parent',
    title: 'StickySites',
    contexts: ['selection']
  });

  const items = [
    { id: 'clip-global', title: 'Add to Global note' },
    { id: 'clip-site', title: 'Add to Site note' },
    { id: 'clip-page', title: 'Add to Page note' },
    { id: 'clip-todo', title: 'Add to To-do list' },
    { id: 'clip-outline', title: 'Add to Outline' }
  ];

  items.forEach(item => {
    chrome.contextMenus.create({
      id: item.id,
      parentId: 'stickysites-parent',
      title: item.title,
      contexts: ['selection']
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !info.selectionText) return;
  const idToType = {
    'clip-global': 'global',
    'clip-site': 'site',
    'clip-page': 'page',
    'clip-todo': 'todo',
    'clip-outline': 'outline'
  };
  const noteTypeId = idToType[info.menuItemId];
  if (!noteTypeId) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'STICKYSITES_CLIP',
      noteTypeId: noteTypeId,
      text: info.selectionText
    });
  } catch {
    // Content script not injected on this page
  }
});

// Handle keyboard shortcut for cluster toggle
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-cluster') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'STICKYSITES_TOGGLE' });
      } catch {
        // Content script not injected on this page
      }
    }
  }
});
