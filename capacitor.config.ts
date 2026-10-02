import type { CapacitorConfig } from "@capacitor/cli";

// Lumina Android wrapper. The native app loads the published web app,
// so publish the project first, then set the published URL below.
const config: CapacitorConfig = {
  appId: "app.lovable.lumina",
  appName: "Lumina",
  webDir: "dist/client",
  server: {
    // TODO: replace with your published URL after publishing, e.g.
    // url: "https://project--05a501c2-7733-4b82-a5d5-c3d63e59f427.lovable.app",
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
