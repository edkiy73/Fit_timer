package ru.fittimer.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Data;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class VoiceModelWorker extends Worker {
    public static final String KEY_LANGUAGE = "language";
    public static final String KEY_PROGRESS = "progress";
    public static final String KEY_STATUS = "status";
    private static final String CHANNEL_ID = "voice_models";

    public VoiceModelWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    public static String cleanLanguage(String language) {
        String l = language == null ? "ru" : language.toLowerCase(Locale.ROOT);
        return l.startsWith("en") ? "en" : "ru";
    }

    public static String modelName(String language) {
        return "en".equals(cleanLanguage(language))
            ? "vosk-model-small-en-us-0.15"
            : "vosk-model-small-ru-0.22";
    }

    public static int modelSizeMb(String language) {
        return "en".equals(cleanLanguage(language)) ? 40 : 45;
    }

    public static String workName(String language) {
        return "fittimer-voice-model-" + cleanLanguage(language);
    }

    public static File modelDir(Context context, String language) {
        return new File(new File(context.getFilesDir(), "voice"), modelName(language));
    }

    public static boolean isModelReady(Context context, String language) {
        File dir = modelDir(context, language);
        return new File(dir, "am/final.mdl").isFile() && new File(dir, "conf/model.conf").isFile();
    }

    private String modelUrl(String language) {
        return "https://alphacephei.com/vosk/models/" + modelName(language) + ".zip";
    }

    private int notificationId(String language) {
        return "en".equals(cleanLanguage(language)) ? 904102 : 904101;
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getApplicationContext()
            .getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Голосовые команды",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Загрузка офлайн-пакетов голосового управления Fit Timer");
        nm.createNotificationChannel(channel);
    }

    private ForegroundInfo foregroundInfo(String language, String status, int percent) {
        ensureChannel();
        boolean english = "en".equals(cleanLanguage(language));
        Intent open = new Intent(getApplicationContext(), MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            getApplicationContext(),
            notificationId(language),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String text;
        if ("extracting".equals(status)) text = english ? "Preparing voice pack…" : "Готовим голосовой пакет…";
        else text = english ? "Downloading voice pack…" : "Скачиваем голосовой пакет…";
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getApplicationContext(), CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(english ? "Fit Timer voice commands" : "Голосовые команды Fit Timer")
            .setContentText(text)
            .setContentIntent(pending)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        if (percent > 0) builder.setProgress(100, Math.min(100, percent), false);
        else builder.setProgress(0, 0, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return new ForegroundInfo(
                notificationId(language),
                builder.build(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            );
        }
        return new ForegroundInfo(notificationId(language), builder.build());
    }

    private void progress(String language, String status, int percent) {
        setProgressAsync(new Data.Builder()
            .putString(KEY_LANGUAGE, cleanLanguage(language))
            .putString(KEY_STATUS, status)
            .putInt(KEY_PROGRESS, percent)
            .build());
        if ("downloading".equals(status) || "extracting".equals(status)) {
            setForegroundAsync(foregroundInfo(language, status, percent));
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        String language = cleanLanguage(getInputData().getString(KEY_LANGUAGE));
        if (isModelReady(getApplicationContext(), language)) {
            progress(language, "ready", 100);
            notifyReady(language);
            return Result.success();
        }

        try {
            setForegroundAsync(foregroundInfo(language, "downloading", 0));
            progress(language, "downloading", 0);
            downloadAndExtract(language);
            progress(language, "ready", 100);
            notifyReady(language);
            return Result.success();
        } catch (Exception e) {
            progress(language, "error", 0);
            return Result.failure(new Data.Builder()
                .putString(KEY_LANGUAGE, language)
                .putString("error", e.getClass().getSimpleName())
                .build());
        }
    }

    private void downloadAndExtract(String language) throws Exception {
        File targetDir = modelDir(getApplicationContext(), language);
        File parent = targetDir.getParentFile();
        if (parent == null) throw new IllegalStateException("Voice model path is unavailable");
        if (!parent.exists() && !parent.mkdirs()) throw new IllegalStateException("Could not create voice model folder");

        File zipFile = new File(getApplicationContext().getCacheDir(), modelName(language) + ".zip");
        HttpURLConnection connection = (HttpURLConnection) new URL(modelUrl(language)).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        connection.setInstanceFollowRedirects(true);
        connection.connect();

        int code = connection.getResponseCode();
        int total = connection.getContentLength();
        if (code < 200 || code >= 300) {
            connection.disconnect();
            throw new IllegalStateException("Voice model download failed: HTTP " + code);
        }

        long copied = 0;
        int lastProgress = -5;
        try (InputStream in = new BufferedInputStream(connection.getInputStream());
             FileOutputStream out = new FileOutputStream(zipFile)) {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) >= 0) {
                if (isStopped()) throw new InterruptedException("Voice model download cancelled");
                if (n == 0) continue;
                out.write(buffer, 0, n);
                copied += n;
                if (total > 0) {
                    int p = Math.min(90, (int) ((copied * 90L) / total));
                    if (p >= lastProgress + 3) {
                        lastProgress = p;
                        progress(language, "downloading", p);
                    }
                }
            }
        } finally {
            connection.disconnect();
        }

        progress(language, "extracting", 92);
        File canonicalParent = parent.getCanonicalFile();
        try (ZipInputStream zin = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)))) {
            ZipEntry entry;
            byte[] buffer = new byte[64 * 1024];
            while ((entry = zin.getNextEntry()) != null) {
                if (isStopped()) throw new InterruptedException("Voice model extraction cancelled");
                File outFile = new File(parent, entry.getName()).getCanonicalFile();
                if (!outFile.getPath().startsWith(canonicalParent.getPath() + File.separator)) {
                    throw new IllegalStateException("Unsafe voice model archive");
                }
                if (entry.isDirectory()) {
                    if (!outFile.exists() && !outFile.mkdirs()) throw new IllegalStateException("Could not create model directory");
                } else {
                    File dir = outFile.getParentFile();
                    if (dir != null && !dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Could not create model directory");
                    try (FileOutputStream fout = new FileOutputStream(outFile)) {
                        int n;
                        while ((n = zin.read(buffer)) >= 0) if (n > 0) fout.write(buffer, 0, n);
                    }
                }
                zin.closeEntry();
            }
        } finally {
            //noinspection ResultOfMethodCallIgnored
            zipFile.delete();
        }

        if (!isModelReady(getApplicationContext(), language)) {
            throw new IllegalStateException("Downloaded voice model is incomplete");
        }
    }

    private void notifyReady(String language) {
        Context context = getApplicationContext();
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        ensureChannel();

        boolean english = "en".equals(cleanLanguage(language));
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(english ? "Voice commands are ready" : "Голосовые команды готовы")
            .setContentText(english
                ? "The English pack is downloaded. You can use hands-free mode offline."
                : "Пакет скачан. Можно включать управление голосом без интернета.")
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        nm.notify(notificationId(language), builder.build());
    }
}
