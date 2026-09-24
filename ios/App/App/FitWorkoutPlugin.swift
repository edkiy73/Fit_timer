import Capacitor
import Foundation
import UserNotifications

@objc(FitWorkoutPlugin)
public class FitWorkoutPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FitWorkoutPlugin"
    public let jsName = "FitWorkout"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private let timerRequestId = "fittimer-workout-timer"

    @objc public func update(_ call: CAPPluginCall) {
        let paused = call.getBool("paused") ?? false
        let timed = call.getBool("timed") ?? false
        let endsMs = call.getDouble("endsAt") ?? 0
        let title = clean(call.getString("alertTitle"), fallback: "Fit Timer")
        let body = clean(call.getString("alertBody"), fallback: clean(call.getString("current"), fallback: ""))
        scheduleTimerAlert(timed: timed && !paused, endsMs: endsMs, title: title, body: body)
        call.resolve(["ok": true])
    }

    @objc public func clear(_ call: CAPPluginCall) {
        clearTimerAlert()
        call.resolve()
    }

    private func clearTimerAlert() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [timerRequestId])
        center.removeDeliveredNotifications(withIdentifiers: [timerRequestId])
    }

    private func scheduleTimerAlert(timed: Bool, endsMs: Double, title: String, body: String) {
        clearTimerAlert()
        guard timed, endsMs > 0 else { return }
        let seconds = endsMs / 1000 - Date().timeIntervalSince1970
        guard seconds > 0.15 else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.interruptionLevel = .timeSensitive
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(0.2, seconds), repeats: false)
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: timerRequestId, content: content, trigger: trigger)
        )
    }

    private func clean(_ value: String?, fallback: String) -> String {
        let text = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return String((text.isEmpty ? fallback : text).prefix(180))
    }
}
