window.StickySites = window.StickySites || {};
(function () {
  var allowed = new Set(['P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'H1', 'H2', 'H3', 'H4', 'A', 'HR', 'INPUT', 'FONT', 'SUB', 'SUP']);
  var drop = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'LINK', 'META']);
  var styles = new Set(['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-align', 'text-decoration', 'margin-left']);
  function sanitize(html) {
    // Template parsing is inert. Only the filtered tree ever reaches the live DOM.
    var template = document.createElement('template');
    template.innerHTML = String(html || '');
    function clean(parent) {
      Array.from(parent.childNodes).forEach(function (node) {
        if (node.nodeType === Node.COMMENT_NODE) { node.remove(); return; }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (drop.has(node.tagName)) { node.remove(); return; }
        clean(node);
        if (!allowed.has(node.tagName)) {
          while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
          node.remove(); return;
        }
        var style = node.getAttribute('style') || '', href = node.getAttribute('href') || '';
        var cls = node.classList.contains('stickysites-mention-chip');
        var mention = node.getAttribute('data-mention-type');
        var checkbox = node.tagName === 'INPUT' && node.getAttribute('type') === 'checkbox';
        var checked = node.hasAttribute('checked');
        var face = node.getAttribute('face'), size = node.getAttribute('size'), color = node.getAttribute('color');
        Array.from(node.attributes).forEach(function (a) { node.removeAttribute(a.name); });
        if (node.tagName === 'INPUT') {
          if (!checkbox) { node.remove(); return; }
          node.setAttribute('type', 'checkbox'); if (checked) node.setAttribute('checked', '');
        }
        if (node.tagName === 'FONT') {
          if (face && /^[a-z0-9 ,'-]{1,100}$/i.test(face)) node.setAttribute('face', face);
          if (size && /^[1-7]$/.test(size)) node.setAttribute('size', size);
          if (color && /^(#[0-9a-f]{3,8}|[a-z]{1,24})$/i.test(color)) node.setAttribute('color', color);
        }
        if (cls) { node.className = 'stickysites-mention-chip'; node.contentEditable = 'false'; if (mention) node.setAttribute('data-mention-type', mention); }
        if (node.tagName === 'A' && href) {
          try { var url = new URL(href, location.href); if (['http:', 'https:', 'mailto:'].includes(url.protocol)) { node.href = url.href; node.target = '_blank'; node.rel = 'noopener noreferrer'; } } catch { /* omit invalid destination */ }
        }
        var scratch = document.createElement('span'); scratch.setAttribute('style', style);
        Array.from(scratch.style).forEach(function (property) { var value = scratch.style.getPropertyValue(property); if (styles.has(property) && !/url\s*\(|expression\s*\(|@import/i.test(value)) node.style.setProperty(property, value); });
      });
    }
    clean(template.content);
    return template.innerHTML;
  }
  function text(html) {
    var template = document.createElement('template'); template.innerHTML = sanitize(html);
    template.content.querySelectorAll('br').forEach(function (n) { n.replaceWith('\n'); });
    template.content.querySelectorAll('p,div,li,blockquote,pre,h1,h2,h3,h4').forEach(function (n) { n.append('\n'); });
    return (template.content.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  window.StickySites.Html = { sanitize: sanitize, text: text };
})();
