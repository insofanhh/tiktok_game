import type { PixiReactElementProps } from '@pixi/react';
import type { Container, Graphics } from 'pixi.js';

type PixiContainerProps = PixiReactElementProps<typeof Container>;
type PixiGraphicsProps = PixiReactElementProps<typeof Graphics>;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      pixiContainer: PixiContainerProps;
      pixiGraphics: PixiGraphicsProps;
    }
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      pixiContainer: PixiContainerProps;
      pixiGraphics: PixiGraphicsProps;
    }
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      pixiContainer: PixiContainerProps;
      pixiGraphics: PixiGraphicsProps;
    }
  }
}
