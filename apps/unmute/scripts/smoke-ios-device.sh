#!/usr/bin/env bash
set -euo pipefail

APP="${1:-build/ios-derived/Build/Products/Debug-iphonesimulator/App.app}"
BUNDLE_ID="app.unmute.english"

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

# --boot: start a cold boot early (CI does it before the ~1.5 min build, a cold boot takes
# minutes) and remember the device; the later smoke run then only waits for it.
if [[ "$APP" == "--boot" ]]; then
  [[ -n "${GITHUB_ENV:-}" ]] && echo "UNMUTE_IOS_DEVICE=$DEVICE" >> "$GITHUB_ENV"
  nohup xcrun simctl boot "$DEVICE" >/dev/null 2>&1 &
  echo "iOS smoke: booting $DEVICE in the background"
  exit 0
fi

if [[ ! -d "$APP" ]]; then
  echo "iOS smoke: simulator app not found: $APP" >&2
  exit 1
fi

xcrun simctl boot "$DEVICE" 2>/dev/null || true

state=""
for _ in $(seq 1 90); do
  state="$(xcrun simctl list devices -j | node -e '
    const target=process.argv[1];
    let input="";
    process.stdin.on("data",chunk=>input+=chunk);
    process.stdin.on("end",()=>{
      const data=JSON.parse(input);
      for(const list of Object.values(data.devices)){
        const device=(list||[]).find(item=>item.udid===target);
        if(device){ process.stdout.write(device.state||""); return; }
      }
    });
  ' "$DEVICE")"
  [[ "$state" == "Booted" ]] && break
  sleep 2
done

if [[ "$state" != "Booted" ]]; then
  echo "iOS smoke: simulator did not boot within 180s" >&2
  xcrun simctl list devices available
  exit 1
fi

xcrun simctl uninstall "$DEVICE" "$BUNDLE_ID" >/dev/null 2>&1 || true

installed=false
for _ in $(seq 1 20); do
  if xcrun simctl install "$DEVICE" "$APP"; then
    installed=true
    break
  fi
  sleep 2
done
if [[ "$installed" != "true" ]]; then
  echo "iOS smoke: app could not be installed after simulator boot" >&2
  exit 1
fi

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
