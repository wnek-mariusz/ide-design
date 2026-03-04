/**
 * Generates a unique, human-readable CSS selector for a DOM element.
 * Designed to run in the browser context (injected via overlay script).
 */

export function generateSelector(element: Element): string {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement && current !== document.body) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)} > ${parts.length > 0 ? '' : part}`);
      // If we found an ID ancestor, we have a unique anchor — stop
      return `#${CSS.escape(current.id)}` + (parts.length > 1 ? ' > ' + parts.slice(1).join(' > ') : '');
    }

    // Add meaningful classes (skip framework noise like ng-*, _ngcontent-*, etc.)
    const classes = Array.from(current.classList)
      .filter((c) => !c.startsWith('ng-') && !c.startsWith('_ng') && !c.startsWith('cdk-'))
      .slice(0, 2);

    if (classes.length > 0) {
      part += '.' + classes.map((c) => CSS.escape(c)).join('.');
    }

    // Check if this selector is already unique among siblings
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (sibling) => sibling.tagName === current!.tagName
      );
      if (siblings.length > 1 && classes.length === 0) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-child(${Array.from(parent.children).indexOf(current) + 1})`;
      }
    }

    parts.unshift(part);
    current = current.parentElement;

    // Limit depth to keep selectors readable
    if (parts.length >= 4) break;
  }

  return parts.join(' > ');
}

/**
 * Gets a short description of an element for the tooltip.
 */
export function getElementLabel(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = Array.from(element.classList)
    .filter((c) => !c.startsWith('ng-') && !c.startsWith('_ng'))
    .slice(0, 3)
    .map((c) => `.${c}`)
    .join('');
  return `${tag}${id}${classes}`;
}

/**
 * Gets a truncated outer HTML snippet.
 */
export function getHtmlSnippet(element: Element, maxLength: number = 200): string {
  const html = element.outerHTML;
  if (html.length <= maxLength) return html;
  return html.slice(0, maxLength) + '...';
}
