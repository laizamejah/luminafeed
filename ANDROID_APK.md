# Building the Lumina Android APK

This project includes a Capacitor config (`capacitor.config.ts`) so the
published web app can be wrapped as a native Android app. The APK itself
must be built on a computer with Android Studio — it cannot be built
inside the Lovable editor.

## One-time setup

1. Publish the app in Lovable (Publish button, top right).
2. Copy the published URL into `capacitor.config.ts` as `server.url`.
3. On your computer, install [Android Studio](https://developer.android.com/studio)
   (includes the Android SDK and Gradle).
4. Clone or download this project, then run:

   ```bash
   npm install
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap add android
   npx cap sync android
   ```

## Build the APK

```bash
npx cap open android
```

In Android Studio:

- **Debug APK (for testing on your own phone):**
  Build → Build App Bundle(s) / APK(s) → Build APK(s).
  The file lands in `android/app/build/outputs/apk/debug/app-debug.apk`.
  Copy it to your phone and tap to install (allow "install unknown apps").
- **Release APK / Play Store bundle:**
  Build → Generate Signed App Bundle / APK, create a keystore, and follow
  the prompts.

## Notes

- The app loads the published site, so updates you publish in Lovable
  appear in the installed app automatically — no need to rebuild the APK
  for content or UI changes.
- The app icon is `public/icons/icon-512.png`; Android Studio's Image
  Asset tool can regenerate the native launcher icons from it.
