package app.unmute.english;

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

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class UpdateDownloadWorker extends Worker {
    public static final String KEY_URL = "url";
    public static final String KEY_STATUS = "status";
    public static final String KEY_PROGRESS = "progress";
    public static final String KEY_RECEIVED = "received";
    public static final String KEY_TOTAL = "total";
    public static final String KEY_ERROR = "error";
    public static final String WORK_NAME = "unmute-direct-update";
    private static final String CHANNEL_ID = "app_updates";
    private static final int NOTIFICATION_ID = 904201;
    private static final long MAX_UPDATE_BYTES = 250L * 1024L * 1024L;
    private static final String APK_MIME = "application/vnd.android.package-archive";

    public UpdateDownloadWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    public static File updateFile(Context context) throws Exception {
        File dir = new File(context.getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("update_cache_failed");
        return new File(dir, "UnMute-update.apk");
    }

    public static void deletePartial(Context context, boolean deleteReady) {
        try {
            File apk = updateFile(context);
            new File(apk.getParentFile(), apk.getName() + ".part").delete();
            new File(apk.getParentFile(), apk.getName() + ".src").delete();
            if (deleteReady) apk.delete();
        } catch (Exception ignored) {}
    }

    @NonNull
    @Override
    public Result doWork() {
        String url = String.valueOf(getInputData().getString(KEY_URL) == null ? "" : getInputData().getString(KEY_URL)).trim();
        if (!url.startsWith("https://")) return failure("update_url_must_be_https");
        try {
            updateProgress("downloading", -1, 0, -1);
            File apk = updateFile(getApplicationContext());
            downloadApk(url, apk);
            updateProgress("ready", 100, apk.length(), apk.length());
            return Result.success(new Data.Builder()
                .putString(KEY_STATUS, "ready")
                .putInt(KEY_PROGRESS, 100)
                .putLong(KEY_RECEIVED, apk.length())
                .putLong(KEY_TOTAL, apk.length())
                .build());
        } catch (Exception e) {
            if (isStopped()) return Result.failure();
            return failure(safeError(e));
        }
    }

    private Result failure(String error) {
        updateProgress("error", -1, 0, -1);
        return Result.failure(new Data.Builder()
            .putString(KEY_STATUS, "error")
            .putString(KEY_ERROR, error)
            .build());
    }

    private void updateProgress(String status, int progress, long received, long total) {
        Data data = new Data.Builder()
            .putString(KEY_STATUS, status)
            .putInt(KEY_PROGRESS, progress)
            .putLong(KEY_RECEIVED, received)
            .putLong(KEY_TOTAL, total)
            .build();
        setProgressAsync(data);
        if ("downloading".equals(status)) setForegroundAsync(foregroundInfo(progress));
    }

    private ForegroundInfo foregroundInfo(int progress) {
        Context context = getApplicationContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Обновления UnMute",
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Загрузка обновлений приложения");
                nm.createNotificationChannel(channel);
            }
        }
        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_unmute)
            .setContentTitle("Обновление UnMute")
            .setContentText(progress >= 0 ? "Скачиваем обновление · " + progress + "%" : "Скачиваем обновление…")
            .setContentIntent(pending)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        if (progress >= 0) builder.setProgress(100, Math.min(100, progress), false);
        else builder.setProgress(0, 0, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return new ForegroundInfo(
                NOTIFICATION_ID,
                builder.build(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            );
        }
        return new ForegroundInfo(NOTIFICATION_ID, builder.build());
    }

    private void downloadApk(String initialUrl, File target) throws Exception {
        File temp = new File(target.getParentFile(), target.getName() + ".part");
        File source = new File(target.getParentFile(), target.getName() + ".src");
        long offset = 0;
        if (temp.isFile() && temp.length() > 0 && initialUrl.equals(readText(source))) offset = temp.length();
        else {
            temp.delete();
            writeText(source, initialUrl);
        }

        HttpURLConnection connection = openDownload(initialUrl, offset);
        boolean resumed = offset > 0 && connection.getResponseCode() == HttpURLConnection.HTTP_PARTIAL;
        if (!resumed) offset = 0;
        long length = connection.getContentLengthLong();
        long total = length > 0 ? offset + length : -1;
        if (total > MAX_UPDATE_BYTES) {
            connection.disconnect();
            throw new Exception("update_too_large");
        }

        long received = offset;
        int lastProgress = -2;
        long lastEmit = 0;
        try (InputStream in = connection.getInputStream();
             FileOutputStream out = new FileOutputStream(temp, resumed)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = in.read(buffer)) != -1) {
                if (isStopped()) throw new InterruptedException("cancelled");
                if (count == 0) continue;
                received += count;
                if (received > MAX_UPDATE_BYTES) throw new Exception("update_too_large");
                out.write(buffer, 0, count);
                int progress = total > 0 ? (int)Math.min(99, (received * 100L) / total) : -1;
                long now = System.currentTimeMillis();
                if (progress != lastProgress && (now - lastEmit > 250 || progress < 0)) {
                    updateProgress("downloading", progress, received, total);
                    lastProgress = progress;
                    lastEmit = now;
                }
            }
            out.flush();
        } finally {
            connection.disconnect();
        }

        if (received <= 0) throw new Exception("empty_update");
        if (total > 0 && received != total) throw new Exception("update_incomplete");
        target.delete();
        if (!temp.renameTo(target)) throw new Exception("update_cache_commit_failed");
        source.delete();
    }

    private HttpURLConnection openDownload(String initialUrl, long offset) throws Exception {
        URL current = new URL(initialUrl);
        for (int redirects = 0; redirects < 6; redirects++) {
            if (!"https".equalsIgnoreCase(current.getProtocol())) throw new Exception("unsafe_update_redirect");
            HttpURLConnection connection = (HttpURLConnection) current.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("User-Agent", "UnMute-Android-Updater");
            connection.setRequestProperty("Accept", APK_MIME + ",application/octet-stream;q=0.9,*/*;q=0.1");
            if (offset > 0) connection.setRequestProperty("Range", "bytes=" + offset + "-");
            int code = connection.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.isEmpty()) throw new Exception("bad_update_redirect");
                current = new URL(current, location);
                continue;
            }
            if (code == 416 && offset > 0) {
                connection.disconnect();
                return openDownload(initialUrl, 0);
            }
            if (code != HttpURLConnection.HTTP_OK && code != HttpURLConnection.HTTP_PARTIAL) {
                connection.disconnect();
                throw new Exception("update_http_" + code);
            }
            return connection;
        }
        throw new Exception("too_many_update_redirects");
    }

    private static String readText(File file) {
        try (InputStream in = new java.io.FileInputStream(file)) {
            byte[] data = new byte[(int)Math.min(4096, file.length())];
            int n = in.read(data);
            return n > 0 ? new String(data, 0, n, java.nio.charset.StandardCharsets.UTF_8) : "";
        } catch (Exception e) {
            return "";
        }
    }

    private static void writeText(File file, String value) {
        try (FileOutputStream out = new FileOutputStream(file, false)) {
            out.write(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception ignored) {}
    }

    private static String safeError(Exception e) {
        String value = e == null ? "" : e.getMessage();
        if (value == null || value.isEmpty()) return "update_failed";
        String safe = value.replaceAll("[^a-zA-Z0-9_.-]", "_");
        return safe.substring(0, Math.min(80, safe.length()));
    }
}
