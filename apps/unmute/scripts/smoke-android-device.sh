#!/usr/bin/env bash
set -euo pipefail

APK="${1:-android/app/build/outputs/apk/debug/app-debug.apk}"
PACKAGE="app.unmute.english"
ACTIVITY="$PACKAGE/.MainActivity"

if [[ ! -f "$APK" ]]; then
  echo "Android smoke: APK not found: $APK" >&2
  exit 1
fi

adb wait-for-device

booted=""
for _ in $(seq 1 120); do
  booted="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  [[ "$booted" == "1" ]] && break
  sleep 2
done

if [[ "$booted" != "1" ]]; then
  echo "Android smoke: emulator did not finish booting" >&2
  adb devices -l || true
  exit 1
fi

adb install -r "$APK"
adb shell am force-stop "$PACKAGE"

launch="$(adb shell am start -W -n "$ACTIVITY" | tr -d '\r')"
printf '%s\n' "$launch"

grep -q "Status: ok" <<<"$launch"
grep -q "Activity: $ACTIVITY" <<<"$launch"

sleep 2
pid="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
if [[ -z "$pid" ]]; then
  echo "Android smoke: app process exited after launch" >&2
  adb logcat -d -t 300 || true
  exit 1
fi

activities="$(adb shell dumpsys activity activities 2>/dev/null | tr -d '\r' || true)"
windows="$(adb shell dumpsys window windows 2>/dev/null | tr -d '\r' || true)"
if ! grep -q "$PACKAGE/.MainActivity" <<<"$activities" && ! grep -q "$PACKAGE/.MainActivity" <<<"$windows"; then
  echo "Android smoke: MainActivity is not visible after launch" >&2
  adb logcat -d -t 300 || true
  exit 1
fi

echo "UnMute Android device launch OK (pid $pid)"
