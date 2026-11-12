window.StickySites = window.StickySites || {};
window.StickySites.Storage = {
  async request(command) {
    var reply = await chrome.runtime.sendMessage({ type: 'STICKYSITES_WRITE', command: command });
    if (!reply || !reply.ok) throw new Error(reply?.error || 'STORAGE_WRITE_FAILED');
    return reply.result;
  },
  commit: function (expected, updates) { return this.request({ op: 'commit', expected: expected, updates: updates }); }
};
