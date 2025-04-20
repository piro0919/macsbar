import AppKit
import ApplicationServices

struct WindowBounds: Codable {
  let x: Int
  let y: Int
  let width: Int
  let height: Int
}

struct AppInfo: Codable {
  let name: String
  let iconPath: String?
  let bounds: [WindowBounds]
  let isActive: Bool
  let isMinimized: Bool
  let bundleIdentifier: String?
}

let fileManager = FileManager.default
let cacheDir = fileManager.homeDirectoryForCurrentUser
  .appendingPathComponent("Library/Caches/macsbar", isDirectory: true)
try? fileManager.createDirectory(at: cacheDir, withIntermediateDirectories: true)
var lastAppListJson: String?
var lastKnownActiveAppBundleId: String?

func saveIcon(_ image: NSImage?, name: String) -> String? {
  guard let image = image else { return nil }
  guard let tiffData = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiffData),
    let pngData = bitmap.representation(using: .png, properties: [:])
  else {
    return nil
  }

  let safeName = name.replacingOccurrences(of: "/", with: "_")
  let fileURL = cacheDir.appendingPathComponent("\(safeName).png")

  do {
    try pngData.write(to: fileURL)
    return "file://\(fileURL.path)"
  } catch {
    return nil
  }
}

func getAppWindows(for app: NSRunningApplication) -> [WindowBounds] {
  let axApp = AXUIElementCreateApplication(app.processIdentifier)

  var value: AnyObject?
  let result = AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &value)
  guard result == .success, let windows = value as? [AXUIElement] else {
    return []
  }

  var boundsList: [WindowBounds] = []

  for window in windows {
    var posValue: AnyObject?
    var sizeValue: AnyObject?

    let hasPosition =
      AXUIElementCopyAttributeValue(window, kAXPositionAttribute as CFString, &posValue) == .success
    let hasSize =
      AXUIElementCopyAttributeValue(window, kAXSizeAttribute as CFString, &sizeValue) == .success

    if hasPosition, hasSize,
      let position = posValue,
      let size = sizeValue,
      CFGetTypeID(position) == AXValueGetTypeID(),
      CFGetTypeID(size) == AXValueGetTypeID()
    {

      var point = CGPoint.zero
      var sizeStruct = CGSize.zero

      if AXValueGetValue(position as! AXValue, .cgPoint, &point),
        AXValueGetValue(size as! AXValue, .cgSize, &sizeStruct)
      {
        boundsList.append(
          WindowBounds(
            x: Int(point.x),
            y: Int(point.y),
            width: Int(sizeStruct.width),
            height: Int(sizeStruct.height)
          ))
      }
    }
  }

  return boundsList
}

func emitAppList() {
  let apps = NSWorkspace.shared.runningApplications
    .filter { $0.activationPolicy == .regular }

  let appInfos: [AppInfo] = apps.compactMap {
    guard let name = $0.localizedName else { return nil }
    let iconPath = saveIcon($0.icon, name: name)
    let bounds = getAppWindows(for: $0)
    let axApp = AXUIElementCreateApplication($0.processIdentifier)
    var windowValue: AnyObject?
    let result = AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &windowValue)
    var isMinimized = false
    if result == .success, let windows = windowValue as? [AXUIElement] {
      isMinimized = windows.allSatisfy {
        var minimizedValue: AnyObject?
        let result = AXUIElementCopyAttributeValue(
          $0, kAXMinimizedAttribute as CFString, &minimizedValue)
        return result == .success && (minimizedValue as? Bool == true)
      }
    }
    guard !bounds.isEmpty else { return nil }
    let isActive = $0.isActive
    return AppInfo(
      name: name,
      iconPath: iconPath,
      bounds: bounds,
      isActive: isActive,
      isMinimized: isMinimized,
      bundleIdentifier: $0.bundleIdentifier
    )
  }

  guard !appInfos.isEmpty else { return }

  guard let jsonData = try? JSONEncoder().encode(appInfos),
    let jsonString = String(data: jsonData, encoding: .utf8)
  else { return }

  // Compare with last output to avoid redundant prints
  if jsonString != lastAppListJson {
    lastAppListJson = jsonString
    print("\(jsonString)\n")
    fflush(stdout)
  }
}

let args = CommandLine.arguments
if let index = args.firstIndex(of: "--execute"), index + 1 < args.count {
  let bundleId = args[index + 1]

  // 操作の意図を取得
  var intention = "activate"  // デフォルト
  if let intentionIndex = args.firstIndex(of: "--intention"), intentionIndex + 1 < args.count {
    intention = args[intentionIndex + 1]
  }

  print("Executing intention: \(intention) for app: \(bundleId)")

  if let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).first {
    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    var value: AnyObject?
    let result = AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &value)

    if result == .success, let windows = value as? [AXUIElement] {
      // ウィンドウの最小化状態を確認
      var allMinimized = true
      for window in windows {
        var minimizedValue: AnyObject?
        let result = AXUIElementCopyAttributeValue(
          window, kAXMinimizedAttribute as CFString, &minimizedValue)
        if result != .success || minimizedValue as? Bool != true {
          allMinimized = false
          break
        }
      }

      // 意図に基づいて操作を実行
      if intention == "minimize" {
        // 最小化操作のみ実行
        for window in windows {
          let minimizeResult = AXUIElementSetAttributeValue(
            window, kAXMinimizedAttribute as CFString, kCFBooleanTrue)
          print("Minimize result: \(minimizeResult)")
        }
      } else if intention == "activate" {
        // アクティブ化操作
        if allMinimized {
          // 最小化されていれば復元してアクティブ化
          for window in windows {
            let restoreResult = AXUIElementSetAttributeValue(
              window, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
            print("Restore result before activation: \(restoreResult)")
          }
        }
        // Activate Finder specially
        if bundleId == "com.apple.finder" {
          print("Starting Finder activation attempt...")

          // 試行1: 直接アクティベーション
          print("Attempt 1: Direct activation")
          let activateResult = app.activate(options: [
            .activateAllWindows
          ])
          print("Direct activation result: \(activateResult)")

          // 試行2: URLスキームでFinderを開く
          print("Attempt 2: URL scheme")
          if let url = URL(string: "file:///") {
            let openResult = NSWorkspace.shared.open(url)
            print("URL scheme open result: \(openResult)")
          }

          // 試行3: AppleScriptの呼び出し
          print("Attempt 3: Internal AppleScript")
          let script = NSAppleScript(source: "tell application \"Finder\" to activate")
          var error: NSDictionary?
          let scriptResult = script?.executeAndReturnError(&error)
          if let error = error {
            print("AppleScript error: \(error)")
          } else {
            print("AppleScript succeeded: \(String(describing: scriptResult))")
          }

          print("Finder activation attempts completed")
        } else {
          app.activate(options: [.activateAllWindows])
          print("Activated app: \(app.localizedName ?? "unknown")")
        }
      }
    }
  }
  exit(0)
}

if args.contains("--watch") {
  let center = NSWorkspace.shared.notificationCenter
  let frontmostCachePath = cacheDir.appendingPathComponent("last-active.txt")

  center.addObserver(
    forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main
  ) { _ in emitAppList() }
  center.addObserver(
    forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main
  ) { _ in emitAppList() }
  center.addObserver(
    forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
  ) { _ in emitAppList() }

  emitAppList()
  Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
    emitAppList()
  }
  Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
    if let frontmost = NSWorkspace.shared.frontmostApplication,
      let bundleId = frontmost.bundleIdentifier,
      bundleId != Bundle.main.bundleIdentifier
    {
      try? bundleId.write(to: frontmostCachePath, atomically: true, encoding: .utf8)
    }
  }
  RunLoop.main.run()
} else {
  emitAppList()
}
