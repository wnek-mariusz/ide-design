(function () {
  'use strict';

  const MESSAGE_SOURCE = 'element-inspector';
  const HIGHLIGHT_COLOR = '#4A90D9';
  var initialState = (typeof window.__INSPECTOR_INITIAL_STATE__ !== 'undefined') ? window.__INSPECTOR_INITIAL_STATE__ : {};
  let inspectionEnabled = !!initialState.enabled;
  var proxyOrigin = initialState.proxyOrigin || '';
  let currentElement = null;
  let currentIframeContext = null;

  // --- Selector Generator ---

  function cssEscape(str) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(str);
    return str.replace(/([^\w-])/g, '\\$1');
  }

  function generateSelector(element) {
    if (element.id) return '#' + cssEscape(element.id);

    var parts = [];
    var current = element;

    var doc = element.ownerDocument || document;
    while (current && current !== doc.documentElement && current !== doc.body) {
      var part = current.tagName.toLowerCase();

      if (current.id) {
        return '#' + cssEscape(current.id) + (parts.length > 0 ? ' > ' + parts.join(' > ') : '');
      }

      var classes = Array.from(current.classList)
        .filter(function (c) { return !c.startsWith('ng-') && !c.startsWith('_ng') && !c.startsWith('cdk-'); })
        .slice(0, 2);

      if (classes.length > 0) {
        part += '.' + classes.map(function (c) { return cssEscape(c); }).join('.');
      }

      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function (s) {
          return s.tagName === current.tagName;
        });
        if (siblings.length > 1 && classes.length === 0) {
          part += ':nth-child(' + (Array.from(parent.children).indexOf(current) + 1) + ')';
        }
      }

      parts.unshift(part);
      current = current.parentElement;
      if (parts.length >= 4) break;
    }

    return parts.join(' > ');
  }

  function getElementLabel(element) {
    var tag = element.tagName.toLowerCase();
    var id = element.id ? '#' + element.id : '';
    var classes = Array.from(element.classList)
      .filter(function (c) { return !c.startsWith('ng-') && !c.startsWith('_ng'); })
      .slice(0, 3)
      .map(function (c) { return '.' + c; })
      .join('');
    return tag + id + classes;
  }

  function getHtmlSnippet(element, maxLen) {
    maxLen = maxLen || 200;
    var html = element.outerHTML;
    return html.length <= maxLen ? html : html.slice(0, maxLen) + '...';
  }

  // --- Source File Resolution (best-effort) ---

  function resolveSourceFile(element) {
    // Angular: try ng.getComponent debug API
    try {
      if (typeof ng !== 'undefined' && ng.getComponent) {
        var component = ng.getComponent(element);
        if (!component && element.parentElement) {
          component = ng.getComponent(element.parentElement);
        }
        if (component) {
          var constructor = component.constructor;
          if (constructor && constructor.name) {
            return 'Component: ' + constructor.name;
          }
        }
      }
    } catch (e) { /* ignore */ }

    // Plain HTML: infer from URL
    try {
      var pathname = window.location.pathname;
      if (pathname && pathname !== '/') {
        return pathname.replace(/^\//, '');
      }
    } catch (e) { /* ignore */ }

    return null;
  }

  // --- UI Elements ---

  var overlay = document.createElement('div');
  overlay.id = '__ei_overlay__';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;';

  var highlight = document.createElement('div');
  highlight.id = '__ei_highlight__';
  highlight.style.cssText = 'position:fixed;border:2px solid ' + HIGHLIGHT_COLOR + ';pointer-events:none;z-index:2147483647;display:none;border-radius:2px;transition:all 0.05s ease;';

  var tooltip = document.createElement('div');
  tooltip.id = '__ei_tooltip__';
  tooltip.style.cssText = 'position:fixed;background:#1e1e1e;color:#fff;font-family:monospace;font-size:12px;padding:4px 8px;border-radius:4px;z-index:2147483647;pointer-events:none;display:none;white-space:nowrap;max-width:400px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,0.3);';

  document.documentElement.appendChild(overlay);
  document.documentElement.appendChild(highlight);
  document.documentElement.appendChild(tooltip);

  // --- Iframe Helpers ---

  function findIframeAtPoint(x, y) {
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      var iframe = iframes[i];
      var wrapper = iframe.parentElement;
      if (!wrapper) continue;
      var wrapperRect = wrapper.getBoundingClientRect();
      if (x >= wrapperRect.left && x <= wrapperRect.right &&
          y >= wrapperRect.top && y <= wrapperRect.bottom) {
        return { iframe: iframe, wrapperRect: wrapperRect };
      }
    }
    return null;
  }

  function probeIframe(iframe, clientX, clientY) {
    var iframeDoc;
    try {
      iframeDoc = iframe.contentDocument;
    } catch (e) {
      return null;
    }
    if (!iframeDoc) return null;

    // Extract scale from CSS transform matrix
    var scale = 1;
    var computedStyle = window.getComputedStyle(iframe);
    var transform = computedStyle.transform;
    if (transform && transform !== 'none') {
      var match = transform.match(/^matrix\(([^,]+)/);
      if (match) {
        scale = parseFloat(match[1]);
      }
    }

    var iframeRect = iframe.getBoundingClientRect();

    // Convert parent viewport coords to iframe content coords
    var contentX = (clientX - iframeRect.left) / scale;
    var contentY = (clientY - iframeRect.top) / scale;

    var element = iframeDoc.elementFromPoint(contentX, contentY);
    if (!element) return null;

    // Filter out inspector overlay elements
    if (element.id && element.id.startsWith('__ei_')) return null;

    return {
      element: element,
      scale: scale,
      iframeRect: iframeRect
    };
  }

  function iframeRectToParent(elemRect, iframeRect, scale) {
    return {
      left: elemRect.left * scale + iframeRect.left,
      top: elemRect.top * scale + iframeRect.top,
      width: elemRect.width * scale,
      height: elemRect.height * scale,
      right: (elemRect.left + elemRect.width) * scale + iframeRect.left,
      bottom: (elemRect.top + elemRect.height) * scale + iframeRect.top
    };
  }

  // --- Event Handlers ---

  function onMouseMove(e) {
    if (!inspectionEnabled) return;

    // Temporarily hide overlay elements to get the actual element under cursor
    highlight.style.display = 'none';
    tooltip.style.display = 'none';

    // Try to probe into iframes first
    var iframeMatch = findIframeAtPoint(e.clientX, e.clientY);
    if (iframeMatch) {
      var probeResult = probeIframe(iframeMatch.iframe, e.clientX, e.clientY);
      if (probeResult) {
        var elemRect = probeResult.element.getBoundingClientRect();
        var parentRect = iframeRectToParent(elemRect, probeResult.iframeRect, probeResult.scale);

        // Clip to wrapper bounds (wrapper has overflow: hidden)
        var wr = iframeMatch.wrapperRect;
        var clipped = {
          left: Math.max(parentRect.left, wr.left),
          top: Math.max(parentRect.top, wr.top),
          right: Math.min(parentRect.right, wr.right),
          bottom: Math.min(parentRect.bottom, wr.bottom)
        };
        clipped.width = Math.max(0, clipped.right - clipped.left);
        clipped.height = Math.max(0, clipped.bottom - clipped.top);

        currentElement = probeResult.element;
        currentIframeContext = {
          iframe: iframeMatch.iframe,
          scale: probeResult.scale,
          iframeRect: probeResult.iframeRect
        };

        // Position highlight (with pointer-events to intercept clicks over iframes)
        highlight.style.pointerEvents = 'auto';
        highlight.style.cursor = 'default';
        highlight.style.top = clipped.top + 'px';
        highlight.style.left = clipped.left + 'px';
        highlight.style.width = clipped.width + 'px';
        highlight.style.height = clipped.height + 'px';
        highlight.style.display = 'block';

        // Position tooltip
        var label = getElementLabel(probeResult.element);
        tooltip.textContent = label;
        tooltip.style.display = 'block';

        var tooltipTop = clipped.top - 28;
        if (tooltipTop < 4) tooltipTop = clipped.bottom + 4;
        tooltip.style.top = tooltipTop + 'px';
        tooltip.style.left = Math.max(4, clipped.left) + 'px';
        return;
      }
    }

    currentIframeContext = null;

    var target = document.elementFromPoint(e.clientX, e.clientY);

    if (!target || target === overlay || target === highlight || target === tooltip ||
        target.id === '__ei_overlay__' || target.id === '__ei_highlight__' || target.id === '__ei_tooltip__') {
      return;
    }

    currentElement = target;
    var rect = target.getBoundingClientRect();

    // Position highlight (no pointer-events needed for non-iframe elements)
    highlight.style.pointerEvents = 'none';
    highlight.style.cursor = '';
    highlight.style.top = rect.top + 'px';
    highlight.style.left = rect.left + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
    highlight.style.display = 'block';

    // Position tooltip
    var label = getElementLabel(target);
    tooltip.textContent = label;
    tooltip.style.display = 'block';

    var tooltipTop = rect.top - 28;
    if (tooltipTop < 4) tooltipTop = rect.bottom + 4;
    tooltip.style.top = tooltipTop + 'px';
    tooltip.style.left = Math.max(4, rect.left) + 'px';
  }

  function onClick(e) {
    console.log('[Element Inspector] Click fired. inspectionEnabled:', inspectionEnabled, 'currentElement:', currentElement);
    if (!inspectionEnabled || !currentElement) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    var selector = generateSelector(currentElement);
    var filePath;
    if (currentIframeContext) {
      filePath = currentIframeContext.iframe.getAttribute('src');
      currentIframeContext = null;
    } else {
      filePath = resolveSourceFile(currentElement);
    }
    var htmlSnippet = getHtmlSnippet(currentElement);

    var message = {
      type: 'element-selected',
      source: MESSAGE_SOURCE,
      payload: {
        selector: selector,
        filePath: filePath,
        htmlSnippet: htmlSnippet
      }
    };

    var body = JSON.stringify(message);
    console.log('[Element Inspector] Sending selection:', body);

    // Use EventSource (SSE) to send data — it works in Cursor Simple Browser
    // where XHR/fetch/sendBeacon/Image are all blocked
    try {
      var es = new EventSource('/__inspector__/select-sse?d=' + encodeURIComponent(body));
      es.onopen = function() {
        console.log('[Element Inspector] SSE select: connected');
        es.close();
      };
      es.onerror = function() {
        console.log('[Element Inspector] SSE select: error');
        es.close();
      };
    } catch (err) {
      console.log('[Element Inspector] SSE select exception:', err);
    }

    // Also try postMessage for future webview integration
    try {
      window.parent.postMessage(message, '*');
    } catch (e) { /* ignore */ }
  }

  // Use capture phase to intercept clicks before the page handles them
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);

  // --- Toggle via postMessage ---

  window.addEventListener('message', function (e) {
    if (e.data && e.data.source === MESSAGE_SOURCE && e.data.type === 'toggle-inspection') {
      setInspectionEnabled(e.data.payload.enabled);
    }
  });

  // --- Toggle via keyboard shortcut (works when Simple Browser has focus) ---

  document.addEventListener('keydown', function (e) {
    var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    var modMatch = isMac
      ? (e.metaKey && e.shiftKey && e.altKey && !e.ctrlKey)
      : (e.ctrlKey && e.shiftKey && e.altKey && !e.metaKey);

    if (modMatch && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      e.stopPropagation();
      var newState = !inspectionEnabled;
      setInspectionEnabled(newState);

      // Notify the proxy so the extension stays in sync
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', proxyOrigin + '/__inspector__/toggle', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({ enabled: newState }));
      } catch (err) { /* ignore */ }
    }
  }, true);

  // --- Toggle via SSE from extension ---

  (function connectInspectorEvents() {
    try {
      var es = new EventSource('/__inspector__/events');
      es.addEventListener('toggle', function (e) {
        try {
          var data = JSON.parse(e.data);
          setInspectionEnabled(data.enabled);
        } catch (err) { /* ignore */ }
      });
      es.onerror = function () {
        // Reconnect after a delay if the connection drops
        es.close();
        setTimeout(connectInspectorEvents, 2000);
      };
    } catch (err) { /* ignore */ }
  })();

  // --- Shared toggle helper ---

  function setInspectionEnabled(enabled) {
    inspectionEnabled = enabled;
    if (!inspectionEnabled) {
      highlight.style.display = 'none';
      tooltip.style.display = 'none';
      currentElement = null;
    }
  }

  console.log('[Element Inspector] Overlay loaded. Inspection mode: ' + (inspectionEnabled ? 'ON' : 'OFF'));
})();
