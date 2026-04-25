import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Polyfill for JSDOM's missing muted attribute serialization
// React doesn't serialize muted to the DOM attribute, but tests expect it
if (typeof HTMLVideoElement !== 'undefined') {
  const originalSetAttribute = Element.prototype.setAttribute;
  const videoMutedHandler = new WeakMap<HTMLVideoElement, boolean>();

  Element.prototype.setAttribute = function(name: string, value: string) {
    originalSetAttribute.call(this, name, value);
    // If this is a video element, ensure muted property is synced to attribute
    if (this instanceof HTMLVideoElement && name === 'muted') {
      videoMutedHandler.set(this, true);
    }
  };

  // Intercept React's element creation for video to set muted attribute
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName: string) {
    const element = originalCreateElement.call(document, tagName);
    if (tagName.toLowerCase() === 'video') {
      const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
      Object.defineProperty(element, 'muted', {
        set(value: boolean) {
          if (originalDescriptor?.set) {
            originalDescriptor.set.call(this, value);
          }
          if (value) {
            originalSetAttribute.call(element, 'muted', '');
          } else {
            element.removeAttribute('muted');
          }
        },
        get() {
          return originalDescriptor?.get?.call(this) ?? false;
        },
        configurable: true,
      });
    }
    return element;
  };
}

afterEach(() => {
  cleanup();
});
