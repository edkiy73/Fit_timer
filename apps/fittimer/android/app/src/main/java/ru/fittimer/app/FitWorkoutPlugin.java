package ru.fittimer.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FitWorkout")
public class FitWorkoutPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        JSObject data = call.getData();
        if (!data.optBoolean("active", true)) {
            WorkoutNotifications.clear(getContext());
            call.resolve();
            return;
        }
        WorkoutNotifications.update(getContext(), data);
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("exact", WorkoutNotifications.canScheduleExact(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        WorkoutNotifications.clear(getContext());
        call.resolve();
    }
}
