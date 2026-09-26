import Foundation
import ActivityKit

@available(iOS 16.1, *)
public struct WorkoutActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var phaseLabel: String
        public var current: String
        public var next: String
        public var meta: String
        public var startedAt: Date
        public var endsAt: Date
        public var timed: Bool
        public var paused: Bool

        public init(
            phaseLabel: String,
            current: String,
            next: String,
            meta: String,
            startedAt: Date,
            endsAt: Date,
            timed: Bool,
            paused: Bool
        ) {
            self.phaseLabel = phaseLabel
            self.current = current
            self.next = next
            self.meta = meta
            self.startedAt = startedAt
            self.endsAt = endsAt
            self.timed = timed
            self.paused = paused
        }
    }

    public var workoutTitle: String

    public init(workoutTitle: String) {
        self.workoutTitle = workoutTitle
    }
}
