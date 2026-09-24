import Capacitor
import Foundation
import UserNotifications
import ActivityKit

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
        let active = call.getBool("active") ?? true
        guard active else {
            clearNativeState()
            call.resolve()
            return
        }

        let workoutTitle = clean(call.getString("workoutTitle"), fallback: "Fit Timer")
        let phaseLabel = clean(call.getString("phaseLabel"), fallback: "Fit Timer")
        let current = clean(call.getString("current"), fallback: workoutTitle)
        let next = clean(call.getString("next"), fallback: "")
        let meta = clean(call.getString("meta"), fallback: "")
        let paused = call.getBool("paused") ?? false
        let timed = call.getBool("timed") ?? false
        let startedMs = call.getDouble("startedAt") ?? 0
        let endsMs = call.getDouble("endsAt") ?? 0
        let alertTitle = clean(call.getString("alertTitle"), fallback: "Fit Timer")
        let alertBody = clean(call.getString("alertBody"), fallback: current)

        scheduleTimerAlert(timed: timed && !paused, endsMs: endsMs, title: alertTitle, body: alertBody)

        if #available(iOS 16.1, *) {
            let now = Date()
            let start = startedMs > 0 ? Date(timeIntervalSince1970: startedMs / 1000) : now
            let rawEnd = endsMs > 0 ? Date(timeIntervalSince1970: endsMs / 1000) : now
            let end = rawEnd >= start ? rawEnd : start
            let state = WorkoutActivityAttributes.ContentState(
                phaseLabel: phaseLabel,
                current: current,
                next: next,
                meta: meta,
                startedAt: start,
                endsAt: end,
                timed: timed && !paused && rawEnd > now,
                paused: paused
            )
            Task {
                await self.updateLiveActivity(workoutTitle: workoutTitle, state: state)
            }
        }

        call.resolve(["ok": true])
    }

    @objc public func clear(_ call: CAPPluginCall) {
        clearNativeState()
        call.resolve()
    }

    private func clearNativeState() {
        clearTimerAlert()
        if #available(iOS 16.1, *) {
            Task {
                for activity in Activity<WorkoutActivityAttributes>.activities {
                    await activity.end(using: nil, dismissalPolicy: .immediate)
                }
            }
        }
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

    @available(iOS 16.1, *)
    private func updateLiveActivity(
        workoutTitle: String,
        state: WorkoutActivityAttributes.ContentState
    ) async {
        if let activity = Activity<WorkoutActivityAttributes>.activities.first {
            if activity.attributes.workoutTitle == workoutTitle {
                await activity.update(using: state)
                return
            }
            await activity.end(using: nil, dismissalPolicy: .immediate)
        }

        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        do {
            _ = try Activity<WorkoutActivityAttributes>.request(
                attributes: WorkoutActivityAttributes(workoutTitle: workoutTitle),
                contentState: state,
                pushType: nil
            )
        } catch {
            // The time-sensitive local notification remains the fallback when
            // Live Activities are disabled or unavailable on this device.
        }
    }

    private func clean(_ value: String?, fallback: String) -> String {
        let text = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return String((text.isEmpty ? fallback : text).prefix(180))
    }
}
