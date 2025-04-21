#!/bin/bash
PLIST_PATH="dist/mac-arm64/Macsbar.app/Contents/Info.plist"
ENTITLEMENTS_PATH="build/entitlements.mac.plist"

echo "🔧 Patching Info.plist..."

# Info.plist の必要項目だけ追加（既にあるならスキップ）
/usr/libexec/PlistBuddy -c "Print :NSAppleEventsUsageDescription" "$PLIST_PATH" &>/dev/null ||
  /usr/libexec/PlistBuddy -c "Add :NSAppleEventsUsageDescription string '他のアプリを操作するために必要です'" "$PLIST_PATH"

/usr/libexec/PlistBuddy -c "Print :NSAccessibilityUsageDescription" "$PLIST_PATH" &>/dev/null ||
  /usr/libexec/PlistBuddy -c "Add :NSAccessibilityUsageDescription string 'ウィンドウ制御のために必要です'" "$PLIST_PATH"

echo "✅ Info.plist patched."

# entitlements の最小構成
if [ ! -f "$ENTITLEMENTS_PATH" ]; then
  mkdir -p "$(dirname "$ENTITLEMENTS_PATH")"
  echo '<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
"http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict></dict></plist>' > "$ENTITLEMENTS_PATH"
fi

/usr/libexec/PlistBuddy -c "Print :com.apple.security.automation.apple-events" "$ENTITLEMENTS_PATH" &>/dev/null ||
  /usr/libexec/PlistBuddy -c "Add :com.apple.security.automation.apple-events bool true" "$ENTITLEMENTS_PATH"

echo "✅ Entitlements updated."

# CLIに実行権限（必要ならここで他のバイナリも）
chmod +x "dist/mac-arm64/Macsbar.app/Contents/Resources/swift-bin/app_observer" 2>/dev/null && echo "✅ CLI executable permission set."

echo "🎉 Patch complete."
# CLIバイナリごとに entitlements をつけて署名
for cli in app_observer; do
  CLI_PATH="dist/mac-arm64/Macsbar.app/Contents/Resources/swift-bin/$cli"
  if [ -f "$CLI_PATH" ]; then
    echo "🔐 Signing $cli with entitlements..."
    codesign --force --sign - --entitlements "$ENTITLEMENTS_PATH" "$CLI_PATH"
  fi
done