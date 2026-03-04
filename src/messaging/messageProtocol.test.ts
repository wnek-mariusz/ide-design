import {
  createElementSelectedMessage,
  createToggleInspectionMessage,
  isInspectorMessage,
  isElementSelectedMessage,
  MESSAGE_SOURCE,
} from './messageProtocol';

describe('messageProtocol', () => {
  describe('createElementSelectedMessage', () => {
    it('creates a properly structured message', () => {
      const msg = createElementSelectedMessage(
        'div.card > h2.title',
        'src/app/header.component.html:15',
        '<h2 class="title">Hello</h2>'
      );
      expect(msg.type).toBe('element-selected');
      expect(msg.source).toBe(MESSAGE_SOURCE);
      expect(msg.payload.selector).toBe('div.card > h2.title');
      expect(msg.payload.filePath).toBe('src/app/header.component.html:15');
      expect(msg.payload.htmlSnippet).toBe('<h2 class="title">Hello</h2>');
    });

    it('accepts null filePath', () => {
      const msg = createElementSelectedMessage('div', null, '<div></div>');
      expect(msg.payload.filePath).toBeNull();
    });
  });

  describe('createToggleInspectionMessage', () => {
    it('creates toggle message with enabled=true', () => {
      const msg = createToggleInspectionMessage(true);
      expect(msg.type).toBe('toggle-inspection');
      expect(msg.payload.enabled).toBe(true);
    });

    it('creates toggle message with enabled=false', () => {
      const msg = createToggleInspectionMessage(false);
      expect(msg.payload.enabled).toBe(false);
    });
  });

  describe('isInspectorMessage', () => {
    it('returns true for valid inspector messages', () => {
      const msg = createElementSelectedMessage('div', null, '<div></div>');
      expect(isInspectorMessage(msg)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isInspectorMessage(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isInspectorMessage('string')).toBe(false);
    });

    it('returns false for wrong source', () => {
      expect(isInspectorMessage({ type: 'test', source: 'other', payload: {} })).toBe(false);
    });

    it('returns false for missing payload', () => {
      expect(isInspectorMessage({ type: 'test', source: MESSAGE_SOURCE })).toBe(false);
    });
  });

  describe('isElementSelectedMessage', () => {
    it('returns true for element-selected messages', () => {
      const msg = createElementSelectedMessage('div', null, '<div></div>');
      expect(isElementSelectedMessage(msg)).toBe(true);
    });

    it('returns false for toggle messages', () => {
      const msg = createToggleInspectionMessage(true);
      expect(isElementSelectedMessage(msg)).toBe(false);
    });
  });
});
