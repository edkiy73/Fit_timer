import type {StorybookConfig} from '@storybook/react-vite';

// FetUre design system: every kit component has a story (src/fe/kit/**/*.stories.tsx) with its controls and states.
// The project's vite.config (aliases, React plugin) is picked up automatically.
const config:StorybookConfig={
  framework:{name:'@storybook/react-vite',options:{}},
  stories:['../src/fe/kit/**/*.mdx','../src/fe/kit/**/*.stories.tsx'],
  addons:['@storybook/addon-docs','@storybook/addon-a11y'],
  core:{disableTelemetry:true},
  typescript:{reactDocgen:'react-docgen-typescript'},
};
export default config;
