import type { Preview } from 'storybook';
import '@repo/ui/styles.css'; // loads Tailwind CSS + Figma design tokens

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    viewport: {
      viewports: {
        figmaSmall: {
          name: 'Figma Plugin Small (300x200)',
          styles: { width: '300px', height: '200px' },
        },
        figmaMedium: {
          name: 'Figma Plugin Medium (320x500)',
          styles: { width: '320px', height: '500px' },
        },
        figmaLarge: {
          name: 'Figma Plugin Large (400x600)',
          styles: { width: '400px', height: '600px' },
        },
      },
    },
  },
};

export default preview;
