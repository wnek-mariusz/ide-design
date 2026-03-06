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

  // --- Inspector Element Check ---

  function isInspectorElement(el) {
    var node = el;
    while (node) {
      if (node.id && node.id.startsWith('__ei_')) return true;
      node = node.parentElement;
    }
    return false;
  }

  // --- Instruction Queue ---

  var instructionQueue = [];
  var instructionMarkers = [];

  // --- Instruction Popup ---

  var popup = document.createElement('div');
  popup.id = '__ei_popup__';
  popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e1e1e;color:#fff;font-family:monospace;font-size:13px;padding:16px;border-radius:8px;z-index:2147483647;display:none;width:400px;max-width:90vw;box-shadow:0 4px 24px rgba(0,0,0,0.5);';

  var popupHeader = document.createElement('div');
  popupHeader.id = '__ei_popup_header__';
  popupHeader.style.cssText = 'margin-bottom:8px;padding:4px 8px;background:#2a2a2a;border-radius:4px;font-size:11px;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

  var popupTextarea = document.createElement('textarea');
  popupTextarea.id = '__ei_popup_textarea__';
  popupTextarea.placeholder = 'Type instruction for this element...';
  popupTextarea.style.cssText = 'width:100%;height:80px;background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:4px;padding:8px;font-family:monospace;font-size:13px;resize:vertical;box-sizing:border-box;';

  var popupButtons = document.createElement('div');
  popupButtons.id = '__ei_popup_buttons__';
  popupButtons.style.cssText = 'margin-top:8px;display:flex;gap:8px;justify-content:flex-end;';

  var popupCancel = document.createElement('button');
  popupCancel.id = '__ei_popup_cancel__';
  popupCancel.textContent = 'Cancel';
  popupCancel.style.cssText = 'padding:6px 16px;background:#333;color:#ccc;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:13px;';

  var popupAdd = document.createElement('button');
  popupAdd.id = '__ei_popup_add__';
  popupAdd.textContent = 'Add';
  popupAdd.style.cssText = 'padding:6px 16px;background:#4A90D9;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;';

  popupButtons.appendChild(popupCancel);
  popupButtons.appendChild(popupAdd);
  popup.appendChild(popupHeader);
  popup.appendChild(popupTextarea);
  popup.appendChild(popupButtons);
  document.documentElement.appendChild(popup);

  var pendingElementData = null;

  function showPopup(selector, filePath, htmlSnippet) {
    pendingElementData = { selector: selector, filePath: filePath, htmlSnippet: htmlSnippet };
    popupHeader.textContent = selector;
    popupTextarea.value = '';
    popup.style.display = 'block';
    inspectionEnabled = false;
    highlight.style.display = 'none';
    tooltip.style.display = 'none';
    setTimeout(function () { popupTextarea.focus(); }, 0);
  }

  function hidePopup() {
    popup.style.display = 'none';
    pendingElementData = null;
    inspectionEnabled = true;
  }

  popupAdd.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!pendingElementData) return;
    var instruction = popupTextarea.value.trim();
    if (!instruction) return;
    instructionQueue.push({
      instruction: instruction,
      selector: pendingElementData.selector,
      filePath: pendingElementData.filePath,
      htmlSnippet: pendingElementData.htmlSnippet
    });
    addInstructionMarker(currentElement, instructionQueue.length);
    hidePopup();
    updateFloatingMenu();
  }, true);

  popupCancel.addEventListener('click', function (e) {
    e.stopPropagation();
    hidePopup();
  }, true);

  // Close popup on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && popup.style.display !== 'none') {
      e.preventDefault();
      e.stopPropagation();
      hidePopup();
    }
  }, true);

  // --- Floating Menu ---

  var floatingMenu = document.createElement('div');
  floatingMenu.id = '__ei_floating_menu__';
  floatingMenu.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1e1e1e;color:#fff;font-family:monospace;font-size:13px;padding:8px 12px;border-radius:8px;z-index:2147483647;display:none;box-shadow:0 4px 16px rgba(0,0,0,0.5);display:none;align-items:center;gap:10px;';

  var floatingBadge = document.createElement('span');
  floatingBadge.id = '__ei_floating_badge__';
  floatingBadge.style.cssText = 'background:#4A90D9;color:#fff;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;';

  var floatingPlay = document.createElement('button');
  floatingPlay.id = '__ei_floating_play__';
  floatingPlay.textContent = '\u25B6';
  floatingPlay.title = 'Send all instructions';
  floatingPlay.style.cssText = 'background:#4A90D9;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:16px;';

  var floatingClear = document.createElement('button');
  floatingClear.id = '__ei_floating_clear__';
  floatingClear.textContent = '\u2715';
  floatingClear.title = 'Clear queue';
  floatingClear.style.cssText = 'background:#333;color:#ccc;border:1px solid #555;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:14px;';

  floatingMenu.appendChild(floatingBadge);
  floatingMenu.appendChild(floatingPlay);
  floatingMenu.appendChild(floatingClear);
  document.documentElement.appendChild(floatingMenu);

  function updateFloatingMenu() {
    if (instructionQueue.length > 0) {
      floatingMenu.style.display = 'flex';
      floatingBadge.textContent = String(instructionQueue.length);
    } else {
      floatingMenu.style.display = 'none';
    }
  }

  function addInstructionMarker(element, number) {
    var marker = document.createElement('div');
    marker.id = '__ei_marker_' + number + '__';
    marker.textContent = String(number);
    marker.style.cssText = 'position:fixed;width:20px;height:20px;background:#4A90D9;color:#fff;border-radius:50%;font-family:monospace;font-size:11px;font-weight:bold;display:flex;align-items:center;justify-content:center;z-index:2147483647;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.4);';
    positionMarker(marker, element);
    document.documentElement.appendChild(marker);
    instructionMarkers.push({ marker: marker, element: element });
  }

  function positionMarker(marker, element) {
    var rect = element.getBoundingClientRect();
    marker.style.top = (rect.top - 10) + 'px';
    marker.style.left = (rect.right - 10) + 'px';
  }

  function updateMarkerPositions() {
    for (var i = 0; i < instructionMarkers.length; i++) {
      positionMarker(instructionMarkers[i].marker, instructionMarkers[i].element);
    }
  }

  function clearInstructionMarkers() {
    for (var i = 0; i < instructionMarkers.length; i++) {
      var m = instructionMarkers[i].marker;
      if (m.parentNode) m.parentNode.removeChild(m);
    }
    instructionMarkers = [];
  }

  window.addEventListener('scroll', updateMarkerPositions, true);
  window.addEventListener('resize', updateMarkerPositions);

  function sendBatchInstructions() {
    if (instructionQueue.length === 0) return;

    var message = {
      type: 'batch-instructions',
      source: MESSAGE_SOURCE,
      payload: {
        instructions: instructionQueue.slice()
      }
    };

    var body = JSON.stringify(message);
    console.log('[Element Inspector] Sending batch instructions:', body);

    // Try fetch POST first, fall back to SSE
    var sent = false;
    try {
      if (typeof fetch === 'function') {
        fetch('/__inspector__/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body
        }).then(function () {
          console.log('[Element Inspector] Batch sent via fetch');
        }).catch(function () {
          sendViaSse(body);
        });
        sent = true;
      }
    } catch (err) { /* ignore */ }

    if (!sent) {
      sendViaSse(body);
    }

    // Also try postMessage for webview integration
    try {
      window.parent.postMessage(message, '*');
    } catch (e) { /* ignore */ }

    instructionQueue = [];
    clearInstructionMarkers();
    updateFloatingMenu();
  }

  function sendViaSse(body) {
    try {
      var es = new EventSource('/__inspector__/select-sse?d=' + encodeURIComponent(body));
      es.onopen = function () {
        console.log('[Element Inspector] Batch sent via SSE');
        es.close();
      };
      es.onerror = function () {
        es.close();
      };
    } catch (err) {
      console.log('[Element Inspector] SSE batch exception:', err);
    }
  }

  floatingPlay.addEventListener('click', function (e) {
    e.stopPropagation();
    sendBatchInstructions();
  }, true);

  floatingClear.addEventListener('click', function (e) {
    e.stopPropagation();
    instructionQueue = [];
    clearInstructionMarkers();
    updateFloatingMenu();
  }, true);

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

    // Skip if hovering over inspector UI (floating menu, popup, etc.)
    var topEl = document.elementFromPoint(e.clientX, e.clientY);
    if (topEl && isInspectorElement(topEl)) {
      highlight.style.display = 'none';
      tooltip.style.display = 'none';
      currentElement = null;
      return;
    }

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

    if (!target || isInspectorElement(target)) return;

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

    // Let clicks on inspector UI (floating menu, popup) pass through
    if (e.target && isInspectorElement(e.target)) return;

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

    showPopup(selector, filePath, htmlSnippet);
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
