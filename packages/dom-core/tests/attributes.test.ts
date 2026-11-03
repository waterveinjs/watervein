// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createState, write, UISystem } from '@watervein/core';
import { element } from '../src/index.js';

describe('DOM attributes', () => {
  it('sets static aria-* attributes on the element', () => {
    const el = element('span', { 'aria-hidden': 'true' });

    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.hasAttribute('aria-hidden')).toBe(true);
  });

  it('sets static data-* attributes on the element', () => {
    const el = element('div', { 'data-testid': 'watervein' });

    expect(el.getAttribute('data-testid')).toBe('watervein');
  });

  it('updates and removes reactive aria-* attributes', () => {
    const ariaHidden = createState<string | null>('true');
    const el = element('span', { 'aria-hidden': ariaHidden });

    expect(el.getAttribute('aria-hidden')).toBe('true');

    write(ariaHidden, 'false');
    UISystem.flush();
    expect(el.getAttribute('aria-hidden')).toBe('false');

    write(ariaHidden, null);
    UISystem.flush();
    expect(el.hasAttribute('aria-hidden')).toBe(false);
  });

  it('updates reactive data-* attributes', () => {
    const testId = createState('first');
    const el = element('div', { 'data-testid': testId });

    expect(el.getAttribute('data-testid')).toBe('first');

    write(testId, 'second');
    UISystem.flush();
    expect(el.getAttribute('data-testid')).toBe('second');
  });
});
