import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.beyealioune.promptcam',
  appName: 'PromptCam',
  webDir: 'dist/promptcam/browser',
  backgroundColor: '#020617',
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#7c3aed',
      overlaysWebView: false,
    },
  },
};

export default config;
