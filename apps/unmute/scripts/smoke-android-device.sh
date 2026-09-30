#!/usr/bin/env bash
set -euo pipefail

APK="${1:-android/app/build/outputs/apk/direct/debug/app-direct-debug.apk}"
PACKAGE="app.unmute.english"
ACTIVITY="$PACKAGE/.MainActivity"
ADB="${ADB:-${ANDROID_HOME:-}/platform-tools/adb}"

if [[ ! -f "$APK" ]]; then
  echo "Android smoke: APK not found: $APK" >&2
  exit 1
fi

if [[ ! -x "$ADB" ]]; then
  echo "Android smoke: adb not found: $ADB" >&2
  exit 1
fi

if ! timeout 120 "$ADB" wait-for-device; then
  echo "Android smoke: adb did not see an emulator within 120s" >&2
  cat /tmp/unmute-emulator.log 2>/dev/null || true
  exit 1
fi

booted=""
for _ in $(seq 1 90); do
  booted="$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  [[ "$booted" == "1" ]] && break
  sleep 2
done

if [[ "$booted" != "1" ]]; then
  echo "Android smoke: emulator did not finish booting within 180s" >&2
  "$ADB" devices -l || true
  cat /tmp/unmute-emulator.log 2>/dev/null || true
  exit 1
fi

"$ADB" install -r "$APK"
"$ADB" shell am force-stop "$PACKAGE"

launch="$("$ADB" shell am start -W -n "$ACTIVITY" | tr -d '\r')"
printf '%s\n' "$launch"

grep -q "Status: ok" <<<"$launch"
grep -q "Activity: $ACTIVITY" <<<"$launch"

sleep 2
pid="$("$ADB" shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
if [[ -z "$pid" ]]; then
  echo "Android smoke: app process exited after launch" >&2
  "$ADB" logcat -d -t 300 || true
  exit 1
fi

activities="$("$ADB" shell dumpsys activity activities 2>/dev/null | tr -d '\r' || true)"
windows="$("$ADB" shell dumpsys window windows 2>/dev/null | tr -d '\r' || true)"
if ! grep -q "$PACKAGE/.MainActivity" <<<"$activities" && ! grep -q "$PACKAGE/.MainActivity" <<<"$windows"; then
  echo "Android smoke: MainActivity is not visible after launch" >&2
  "$ADB" logcat -d -t 300 || true
  exit 1
fi

echo "UnMute Android device launch OK (pid $pid)"
