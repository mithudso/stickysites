(function (root) {
  root.StickySites = root.StickySites || {};
  root.StickySites.request = async function (fetcher, url, options, json) {
    var controller = new AbortController(), timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () { controller.abort(); reject(new Error('NETWORK_TIMEOUT')); }, root.StickySites.Settings.networkTimeoutMs);
    });
    try {
      return await Promise.race([timeout, (async function () {
        var response = await fetcher(url, Object.assign({}, options, { signal: controller.signal }));
        if (json) { if (!response.ok) throw new Error('HTTP_' + response.status); return await response.json(); }
        return response;
      })()]);
    } finally { clearTimeout(timer); }
  };
})(globalThis);
