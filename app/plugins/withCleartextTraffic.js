const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Allow cleartext HTTP to the development server.
 *
 * Android blocks cleartext from API 28, and a release build has no
 * `usesCleartextTraffic` attribute at all — so an installed APK pointed at
 * `http://<lan-ip>:8787` fails every request *silently*, which looks exactly
 * like a broken app rather than a policy block.
 *
 * This is a development affordance. Production should terminate TLS at the
 * server and this plugin should come out of app.json — or be narrowed to a
 * network-security-config that whitelists only the dev host.
 */
module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, cfg => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });
};
