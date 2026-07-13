import type { Preview } from '@storybook/react-vite';
import { UiWebProvider } from '../src';
import './preview.css';

const preview: Preview = {
  decorators: [
    (Story) => (
      <UiWebProvider>
        <Story />
      </UiWebProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    controls: {
      expanded: true,
    },
    a11y: {
      test: 'todo',
    },
  },
};

export default preview;
