/**
 * Rewarded-ad integration — Google AdMob via @capacitor-community/admob.
 *
 * Only runs on a native device; the web/browser build falls back to the
 * simulated ad in GameScene. Uses Google's official TEST ad IDs by default so
 * ads work immediately in development.
 *
 * ── Before release ──────────────────────────────────────────────────────────
 *  1. Set TESTING = false.
 *  2. Replace REWARDED_AD_ID with your real rewarded ad-unit IDs.
 *  3. Put your real AdMob App IDs in the native manifests (see:
 *       android/app/src/main/AndroidManifest.xml  → APPLICATION_ID meta-data
 *       ios/App/App/Info.plist                     → GADApplicationIdentifier)
 *  4. Wire up GDPR/UMP consent (stubbed below).
 * Never test with LIVE ad IDs on an unpublished app — Google can ban the account.
 */
import { Capacitor } from "@capacitor/core";
import {
  AdMob,
  RewardAdPluginEvents,
  type RewardAdOptions,
} from "@capacitor-community/admob";

/** Test mode: uses test ads and Google's test unit IDs. Set false for prod. */
const TESTING = true;

// Google's official TEST rewarded ad-unit IDs (always fill, safe to click).
// TODO: replace with your real rewarded ad-unit IDs from AdMob.
const REWARDED_AD_ID = {
  ios: "ca-app-pub-3940256099942544/1712485313",
  android: "ca-app-pub-3940256099942544/5224354917",
} as const;

function rewardedAdId(): string {
  return Capacitor.getPlatform() === "ios" ? REWARDED_AD_ID.ios : REWARDED_AD_ID.android;
}

/** Ads only exist inside the native app (not the web preview / browser). */
export function adsAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

let initialized = false;

export async function initAds(): Promise<void> {
  if (!adsAvailable() || initialized) return;
  try {
    await AdMob.initialize({ initializeForTesting: TESTING });
    initialized = true;

    // iOS App Tracking Transparency (needs NSUserTrackingUsageDescription in
    // Info.plist). Ads still serve non-personalised if the user declines.
    if (Capacitor.getPlatform() === "ios") {
      try {
        const { status } = await AdMob.trackingAuthorizationStatus();
        if (status === "notDetermined") await AdMob.requestTrackingAuthorization();
      } catch {
        /* ATT not available / already handled */
      }
    }
    // TODO (production): GDPR/UMP consent via AdMob.requestConsentInfo() +
    // AdMob.showConsentForm() before requesting ads in consent regions.
  } catch (e) {
    console.warn("[ads] init failed", e);
  }
}

/** Show a rewarded ad; resolves true only if the reward was actually earned. */
export async function showRewardedAd(): Promise<boolean> {
  if (!adsAvailable()) return false;
  if (!initialized) await initAds();

  let earned = false;
  const sub = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
    earned = true;
  });
  try {
    const options: RewardAdOptions = { adId: rewardedAdId(), isTesting: TESTING };
    await AdMob.prepareRewardVideoAd(options);
    const reward = await AdMob.showRewardVideoAd();
    if (reward) earned = true;
  } catch (e) {
    console.warn("[ads] rewarded ad failed", e);
  } finally {
    await sub.remove();
  }
  return earned;
}
