import * as React from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      // Reown AppKit web component used in the navbar.
      'appkit-button': any;
    }
  }
}
