import { Platform, Vibration } from 'react-native';

/**
 * Zero-dependency safe haptic feedback wrapper using React Native's built-in Vibration API.
 * Strictly guarded for web and test environments so it never throws.
 */
function vibrateSafe(pattern: number | number[]): void {
  if (Platform.OS === 'web') return;
  try {
    if (typeof Vibration?.vibrate === 'function') {
      Vibration.vibrate(pattern);
    }
  } catch {
    // Non-critical tactile enhancement — fail silently if device or runtime denies vibration
  }
}

export function triggerLightHaptic(): void {
  vibrateSafe(10);
}

export function triggerSuccessHaptic(): void {
  vibrateSafe(Platform.OS === 'android' ? [0, 14, 40, 18] : 16);
}

export function triggerErrorHaptic(): void {
  vibrateSafe(Platform.OS === 'android' ? [0, 24, 50, 24] : 28);
}
