#!/usr/bin/env bash
set -euo pipefail

APP="${1:-build/ios-derived/Build/Products/Debug-iphonesimulator/App.app}"
BUNDLE_ID="app.unmute.english"

if [[ ! -d "$APP" ]]; then
  echo "iOS smoke: simulator app not found: $APP" >&2
  exit 1
fi

DEVICE="${UNMUTE_IOS_DEVICE:-}"
if [[ -z "$DEVICE" ]]; then
  DEVICE="$(xcrun simctl list devices available -j | node -e '
    let input="";
    process.stdin.on("data",chunk=>input+=chunk);
    process.stdin.on("end",()=>{
      const data=JSON.parse(input);
      for(const runtime of Object.keys(data.devices).sort().reverse()){
        const device=(data.devices[runtime]||[]).find(item=>item.isAvailable&&/^iPhone/.test(item.name));
        if(device){ process.stdout.write(device.udid); return; }
      }
      process.exit(2);
    });
  ')"
fi

if [[ -z "$DEVICE" ]]; then
  echo "iOS smoke: no available iPhone simulator" >&2
  exit 1
fi

xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE" -b
xcrun simctl uninstall "$DEVICE" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl install "$DEVICE" "$APP"

launch="$(xcrun simctl launch --terminate-running-process "$DEVICE" "$BUNDLE_ID")"
printf '%s\n' "$launch"

pid="$(printf '%s\n' "$launch" | awk -F': ' 'NF>1{print $NF}' | tail -n1 | tr -d '[:space:]')"
if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
  echo "iOS smoke: simctl did not return an app pid" >&2
  exit 1
fi

sleep 2
if ! kill -0 "$pid" 2>/dev/null; then
  echo "iOS smoke: app process exited after launch" >&2
  xcrun simctl spawn "$DEVICE" log show --last 1m --style compact --predicate 'process == "App"' || true
  exit 1
fi

echo "UnMute iOS simulator launch OK (pid $pid)"
xcrun simctl terminate "$DEVICE" "$BUNDLE_ID"
