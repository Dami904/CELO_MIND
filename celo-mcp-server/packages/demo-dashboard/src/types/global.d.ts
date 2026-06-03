import * as React from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'w3m-button': any;
    }
  }
}

declare module 'viem/chains' {
  export const celo: any;
  export const celoAlfajores: any;
}
