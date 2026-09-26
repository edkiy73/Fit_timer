package ru.fittimer.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;

final class WorkoutNotifications {
    private static final String LIVE_CHANNEL = "workout_live";
    // v2 intentionally uses normal notification audio semantics. The previous
    // workout_alert channel was created as USAGE_ALARM, and Android keeps a
    // channel's audio attributes across app updates.
    private static final String ALERT_CHANNEL = "workout_timer_v2";
    private static final String LEGACY_ALERT_CHANNEL = "workout_alert";
    private static final String ACTION_TIMER = "ru.fittimer.app.WORKOUT_TIMER";
    private static final String ACTION_INACTIVITY = "ru.fittimer.app.WORKOUT_INACTIVITY";
    private static final String PREFS = "fit_workout_notifications";
    private static final String PREF_SESSION = "inactivity_session";
    private static final String PREF_FIRED = "inactivity_fired";
    private static final int LIVE_ID = 903001;
    private static final int LEGACY_ALERT_ID = 903002;
    private static final int ALARM_REQUEST = 903003;
    private static final int INACTIVITY_ID = 903004;
    private static final int INACTIVITY_REQUEST = 903005;

    private WorkoutNotifications() {}

    static void update(Context context, JSObject data) {
        ensureChannels(context);
        cancelAlarm(context);
        // Upgrade cleanup: older builds posted a second notification with this id.
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        manager.cancel(LEGACY_ALERT_ID);
        // Returning to / interacting with the workout clears the delivered reminder.
        manager.cancel(INACTIVITY_ID);

        boolean paused = data.optBoolean("paused", false);
        boolean timed = data.optBoolean("timed", false);
        long endsAt = data.optLong("endsAt", 0L);
        String workoutTitle = clean(data.optString("workoutTitle", "Fit Timer"), "Fit Timer");
        String phaseLabel = clean(data.optString("phaseLabel", "Fit Timer"), "Fit Timer");
        String current = clean(data.optString("current", workoutTitle), workoutTitle);
        String meta = clean(data.optString("meta", ""), "");
        String next = clean(data.optString("next", ""), "");
        String alertTitle = clean(data.optString("alertTitle", "Fit Timer"), "Fit Timer");
        String alertBody = clean(data.optString("alertBody", current), current);
        String sessionId = clean(data.optString("sessionId", ""), "");
        long inactivityAt = data.optLong("inactivityAt", 0L);
        String inactivityTitle = clean(data.optString("inactivityTitle", "Fit Timer"), "Fit Timer");
        String inactivityBody = clean(data.optString("inactivityBody", ""), "");

        NotificationCompat.Builder live = new NotificationCompat.Builder(context, LIVE_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_fittimer)
            .setContentTitle(phaseLabel)
            .setContentText(current)
            .setSubText(meta.isEmpty() ? workoutTitle : meta)
            .setContentIntent(openAppIntent(context))
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        if (!next.isEmpty()) {
            live.setStyle(new NotificationCompat.BigTextStyle()
                .bigText(current + "\n" + next));
        }

        if (timed && !paused && endsAt > System.currentTimeMillis()) {
            live.setWhen(endsAt).setShowWhen(true).setUsesChronometer(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) live.setChronometerCountDown(true);
            scheduleAlarm(context, endsAt, alertTitle, alertBody, workoutTitle);
        } else {
            live.setShowWhen(false);
        }
        notifySafe(context, LIVE_ID, live.build());
        scheduleInactivity(context, sessionId, inactivityAt, inactivityTitle, inactivityBody, workoutTitle);
    }

    static void clear(Context context) {
        cancelAlarm(context);
        cancelInactivity(context);
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        manager.cancel(LIVE_ID);
        manager.cancel(LEGACY_ALERT_ID);
        manager.cancel(INACTIVITY_ID);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    static boolean canScheduleExact(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return alarm != null && alarm.canScheduleExactAlarms();
    }

    static void handleAlarm(Context context, Intent intent) {
        if (intent != null && ACTION_INACTIVITY.equals(intent.getAction())) {
            handleInactivity(context, intent);
            return;
        }
        ensureChannels(context);
        String title = clean(intent == null ? null : intent.getStringExtra("title"), "Fit Timer");
        String body = clean(intent == null ? null : intent.getStringExtra("body"), "");
        String workoutTitle = clean(intent == null ? null : intent.getStringExtra("workoutTitle"), "Fit Timer");

        // Replace the existing ongoing card instead of posting a second one.
        // This update uses the user-configurable alert channel, so Android itself
        // decides whether to play sound/vibrate according to system channel settings.
        NotificationCompat.Builder alert = new NotificationCompat.Builder(context, ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_fittimer)
            .setContentTitle(title)
            .setContentText(body)
            .setSubText(workoutTitle)
            .setContentIntent(openAppIntent(context))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setOnlyAlertOnce(false)
            .setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setShowWhen(false);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            alert.setDefaults(NotificationCompat.DEFAULT_ALL);
        }
        notifySafe(context, LIVE_ID, alert.build());
    }

    private static void handleInactivity(Context context, Intent intent) {
        ensureChannels(context);
        String sessionId = clean(intent.getStringExtra("sessionId"), "");
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String currentSession = prefs.getString(PREF_SESSION, "");
        if (sessionId.isEmpty() || !sessionId.equals(currentSession) || prefs.getBoolean(PREF_FIRED, false)) return;
        prefs.edit().putBoolean(PREF_FIRED, true).apply();

        String title = clean(intent.getStringExtra("title"), "Fit Timer");
        String body = clean(intent.getStringExtra("body"), "");
        String workoutTitle = clean(intent.getStringExtra("workoutTitle"), "Fit Timer");
        NotificationCompat.Builder reminder = new NotificationCompat.Builder(context, ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_fittimer)
            .setContentTitle(title)
            .setContentText(body)
            .setSubText(workoutTitle)
            .setContentIntent(openAppIntent(context))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            reminder.setDefaults(NotificationCompat.DEFAULT_ALL);
        }
        notifySafe(context, INACTIVITY_ID, reminder.build());
    }

    private static void scheduleInactivity(
        Context context,
        String sessionId,
        long at,
        String title,
        String body,
        String workoutTitle
    ) {
        cancelInactivity(context);
        if (sessionId.isEmpty() || at <= System.currentTimeMillis()) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String currentSession = prefs.getString(PREF_SESSION, "");
        boolean fired = prefs.getBoolean(PREF_FIRED, false);
        if (!sessionId.equals(currentSession)) {
            prefs.edit().putString(PREF_SESSION, sessionId).putBoolean(PREF_FIRED, false).apply();
            fired = false;
        }
        if (fired) return;

        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;
        Intent intent = new Intent(context, WorkoutAlarmReceiver.class)
            .setAction(ACTION_INACTIVITY)
            .putExtra("sessionId", sessionId)
            .putExtra("title", title)
            .putExtra("body", body)
            .putExtra("workoutTitle", workoutTitle);
        PendingIntent pi = PendingIntent.getBroadcast(context, INACTIVITY_REQUEST, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } else {
            alarm.set(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static void cancelInactivity(Context context) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;
        Intent intent = new Intent(context, WorkoutAlarmReceiver.class).setAction(ACTION_INACTIVITY);
        PendingIntent pi = PendingIntent.getBroadcast(context, INACTIVITY_REQUEST, intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pi != null) {
            alarm.cancel(pi);
            pi.cancel();
        }
    }

    private static void scheduleAlarm(Context context, long at, String title, String body, String workoutTitle) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null || at <= System.currentTimeMillis()) return;
        PendingIntent pi = alarmIntent(context, title, body, workoutTitle);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarm.canScheduleExactAlarms()) {
                    alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                } else {
                    alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                }
            } else {
                alarm.setExact(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (SecurityException ignored) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                alarm.set(AlarmManager.RTC_WAKEUP, at, pi);
            }
        }
    }

    private static void cancelAlarm(Context context) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;
        Intent intent = new Intent(context, WorkoutAlarmReceiver.class).setAction(ACTION_TIMER);
        PendingIntent pi = PendingIntent.getBroadcast(context, ALARM_REQUEST, intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pi != null) {
            alarm.cancel(pi);
            pi.cancel();
        }
    }

    private static PendingIntent alarmIntent(Context context, String title, String body, String workoutTitle) {
        Intent intent = new Intent(context, WorkoutAlarmReceiver.class)
            .setAction(ACTION_TIMER)
            .putExtra("title", title)
            .putExtra("body", body)
            .putExtra("workoutTitle", workoutTitle);
        return PendingIntent.getBroadcast(context, ALARM_REQUEST, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openAppIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setData(Uri.parse("fittimer://workout/resume"))
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel live = new NotificationChannel(
            LIVE_CHANNEL, "Активная тренировка", NotificationManager.IMPORTANCE_LOW);
        live.setDescription("Текущий этап и таймер активной тренировки");
        live.setSound(null, null);
        live.enableVibration(false);
        manager.createNotificationChannel(live);

        // Remove the old alarm-style channel so it does not remain as a confusing
        // extra category in Android settings after upgrading.
        manager.deleteNotificationChannel(LEGACY_ALERT_CHANNEL);

        NotificationChannel alert = new NotificationChannel(
            ALERT_CHANNEL, "Уведомления тренировки", NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription("Окончание таймера и напоминания об активной тренировке");
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        alert.setSound(sound, attrs);
        // This is only the initial channel default. Android's notification settings
        // remain authoritative: the user can disable vibration/sound or choose another sound.
        alert.enableVibration(true);
        manager.createNotificationChannel(alert);
    }

    private static void notifySafe(Context context, int id, android.app.Notification notification) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            NotificationManagerCompat.from(context).notify(id, notification);
        } catch (SecurityException ignored) {}
    }

    private static String clean(String value, String fallback) {
        String text = value == null ? "" : value.trim();
        if (text.isEmpty()) text = fallback == null ? "" : fallback;
        return text.length() > 180 ? text.substring(0, 180) : text;
    }
}
