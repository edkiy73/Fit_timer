import WidgetKit
import SwiftUI
import ActivityKit

@main
struct FitTimerWorkoutLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        WorkoutLiveActivity()
    }
}

struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            WorkoutLockScreenView(context: context)
                .activityBackgroundTint(Color(.systemBackground))
                .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.phaseLabel)
                        .font(.caption)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    timer(context.state)
                        .font(.headline.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.current)
                        .font(.headline)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if !context.state.next.isEmpty {
                        Text(context.state.next)
                            .font(.caption)
                            .lineLimit(1)
                    } else if !context.state.meta.isEmpty {
                        Text(context.state.meta)
                            .font(.caption)
                            .lineLimit(1)
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
            } compactTrailing: {
                timer(context.state)
                    .font(.caption2.monospacedDigit())
                    .frame(minWidth: 34)
            } minimal: {
                Image(systemName: "timer")
            }
        }
    }

    @ViewBuilder
    private func timer(_ state: WorkoutActivityAttributes.ContentState) -> some View {
        if state.paused {
            Image(systemName: "pause.fill")
        } else if state.timed && state.endsAt > state.startedAt {
            Text(timerInterval: state.startedAt...state.endsAt, countsDown: true, showsHours: false)
        } else {
            Text("•")
        }
    }
}

private struct WorkoutLockScreenView: View {
    let context: ActivityViewContext<WorkoutActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(context.attributes.workoutTitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(context.state.phaseLabel)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
            }

            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(context.state.current)
                    .font(.headline)
                    .lineLimit(2)
                Spacer(minLength: 8)
                if context.state.paused {
                    Image(systemName: "pause.fill")
                        .font(.title3)
                } else if context.state.timed && context.state.endsAt > context.state.startedAt {
                    Text(timerInterval: context.state.startedAt...context.state.endsAt, countsDown: true, showsHours: false)
                        .font(.title2.monospacedDigit().weight(.semibold))
                        .multilineTextAlignment(.trailing)
                        .frame(minWidth: 72, alignment: .trailing)
                }
            }

            if !context.state.next.isEmpty {
                Text(context.state.next)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else if !context.state.meta.isEmpty {
                Text(context.state.meta)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}
