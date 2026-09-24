package ru.fittimer.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WorkoutAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        WorkoutNotifications.handleAlarm(context, intent);
    }
}
