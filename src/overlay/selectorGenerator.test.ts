/**
 * @jest-environment jsdom
 */

import { generateSelector, getElementLabel, getHtmlSnippet } from './selectorGenerator';

// Polyfill CSS.escape for jsdom
if (typeof CSS === 'undefined' || !CSS.escape) {
  (globalThis as any).CSS = {
    escape: (s: string) => s.replace(/([^\w-])/g, '\\$1'),
  };
}

describe('selectorGenerator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('generateSelector', () => {
    it('returns ID selector when element has an ID', () => {
      document.body.innerHTML = '<div id="main"><p>Hello</p></div>';
      const el = document.getElementById('main')!;
      expect(generateSelector(el)).toBe('#main');
    });

    it('generates tag + class selector', () => {
      document.body.innerHTML = '<div><p class="intro">Hello</p></div>';
      const el = document.querySelector('.intro')!;
      const selector = generateSelector(el);
      expect(selector).toContain('p.intro');
    });

    it('generates nested selector for deep elements', () => {
      document.body.innerHTML = '<div class="card"><div class="body"><h2 class="title">Hi</h2></div></div>';
      const el = document.querySelector('.title')!;
      const selector = generateSelector(el);
      expect(selector).toContain('h2.title');
      expect(selector).toContain('>');
    });

    it('uses ID ancestor as anchor', () => {
      document.body.innerHTML = '<div id="app"><div class="wrapper"><span>Text</span></div></div>';
      const el = document.querySelector('span')!;
      const selector = generateSelector(el);
      expect(selector).toContain('#app');
    });

    it('filters out Angular framework classes', () => {
      document.body.innerHTML = '<div class="ng-star-inserted _ngcontent-abc card">Content</div>';
      const el = document.querySelector('div')!;
      const selector = generateSelector(el);
      expect(selector).not.toContain('ng-star');
      expect(selector).not.toContain('_ngcontent');
      expect(selector).toContain('card');
    });

    it('handles elements with no classes or id', () => {
      document.body.innerHTML = '<div><span>A</span><span>B</span></div>';
      const el = document.querySelectorAll('span')[1];
      const selector = generateSelector(el);
      expect(selector).toContain('span');
    });
  });

  describe('getElementLabel', () => {
    it('returns tag name for bare element', () => {
      document.body.innerHTML = '<div>Hello</div>';
      const el = document.querySelector('div')!;
      expect(getElementLabel(el)).toBe('div');
    });

    it('includes id and classes', () => {
      document.body.innerHTML = '<button id="submit" class="btn primary">Go</button>';
      const el = document.querySelector('button')!;
      expect(getElementLabel(el)).toBe('button#submit.btn.primary');
    });

    it('filters Angular classes', () => {
      document.body.innerHTML = '<div class="ng-valid card">Content</div>';
      const el = document.querySelector('div')!;
      expect(getElementLabel(el)).toContain('.card');
      expect(getElementLabel(el)).not.toContain('ng-valid');
    });
  });

  describe('getHtmlSnippet', () => {
    it('returns full HTML if under max length', () => {
      document.body.innerHTML = '<span>Short</span>';
      const el = document.querySelector('span')!;
      expect(getHtmlSnippet(el)).toBe('<span>Short</span>');
    });

    it('truncates long HTML', () => {
      const longContent = 'A'.repeat(300);
      document.body.innerHTML = `<div>${longContent}</div>`;
      const el = document.querySelector('div')!;
      const snippet = getHtmlSnippet(el, 200);
      expect(snippet.length).toBe(203); // 200 + "..."
      expect(snippet.endsWith('...')).toBe(true);
    });
  });
});
