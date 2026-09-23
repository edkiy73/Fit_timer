package ru.fittimer.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.Window;

import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "FitSystem")
public class FitSystemPlugin extends Plugin {
    private static final long MAX_UPDATE_BYTES = 250L * 1024L * 1024L;
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private volatile boolean updateRunning = false;

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equals("https") || scheme.equals("http") || scheme.equals("market"))) {
                call.reject("unsupported_url");
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("open_failed", e);
        }
    }

    @PluginMethod
    public void getDistribution(PluginCall call) {
        JSObject result = new JSObject();
        result.put("channel", BuildConfig.DIRECT_UPDATES ? "direct" : "store");
        result.put("directUpdate", BuildConfig.DIRECT_UPDATES);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        if (!BuildConfig.DIRECT_UPDATES) {
            call.reject("direct_update_disabled");
            return;
        }
        final String url = call.getString("url", "").trim();
        final int expectedVersionCode = Math.max(0, call.getInt("expectedVersionCode", 0));
        if (!url.startsWith("https://")) {
            call.reject("update_url_must_be_https");
            return;
        }
        synchronized (this) {
            if (updateRunning) {
                call.reject("update_in_progress");
                return;
            }
            updateRunning = true;
        }
        updateExecutor.execute(() -> {
            try {
                File apk = updateFile();
                if (apk.isFile()) {
                    try {
                        verifyUpdateApk(apk, expectedVersionCode);
                        emitUpdate("ready", 100, apk.length(), apk.length(), "");
                        finishInstallRequest(call, apk, true);
                        return;
                    } catch (Exception stale) {
                        //noinspection ResultOfMethodCallIgnored
                        apk.delete();
                    }
                }
                downloadApk(url, apk);
                emitUpdate("verifying", 100, apk.length(), apk.length(), "");
                verifyUpdateApk(apk, expectedVersionCode);
                emitUpdate("ready", 100, apk.length(), apk.length(), "");
                finishInstallRequest(call, apk, true);
            } catch (Exception e) {
                emitUpdate("error", -1, 0, 0, safeError(e));
                resolveOnUi(call, "error", safeError(e));
                synchronized (this) { updateRunning = false; }
            }
        });
    }

    @PluginMethod
    public void resumeUpdateInstall(PluginCall call) {
        if (!BuildConfig.DIRECT_UPDATES) {
            call.reject("direct_update_disabled");
            return;
        }
        final int expectedVersionCode = Math.max(0, call.getInt("expectedVersionCode", 0));
        updateExecutor.execute(() -> {
            try {
                File apk = updateFile();
                if (!apk.isFile()) {
                    resolveOnUi(call, "missing", "");
                    return;
                }
                verifyUpdateApk(apk, expectedVersionCode);
                finishInstallRequest(call, apk, false);
            } catch (Exception e) {
                emitUpdate("error", -1, 0, 0, safeError(e));
                resolveOnUi(call, "error", safeError(e));
            }
        });
    }

    private File updateFile() throws Exception {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("update_cache_failed");
        return new File(dir, "FitTimer-update.apk");
    }

    private void downloadApk(String initialUrl, File target) throws Exception {
        HttpURLConnection connection = openDownload(initialUrl);
        long total = connection.getContentLengthLong();
        if (total > MAX_UPDATE_BYTES) {
            connection.disconnect();
            throw new Exception("update_too_large");
        }
        File temp = new File(target.getParentFile(), target.getName() + ".part");
        //noinspection ResultOfMethodCallIgnored
        temp.delete();
        long received = 0;
        int lastProgress = -2;
        long lastEmit = 0;
        try (InputStream in = connection.getInputStream();
             FileOutputStream out = new FileOutputStream(temp)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = in.read(buffer)) != -1) {
                received += count;
                if (received > MAX_UPDATE_BYTES) throw new Exception("update_too_large");
                out.write(buffer, 0, count);
                int progress = total > 0 ? (int)Math.min(99, (received * 100L) / total) : -1;
                long now = System.currentTimeMillis();
                if (progress != lastProgress && (now - lastEmit > 180 || progress < 0)) {
                    emitUpdate("downloading", progress, received, total, "");
                    lastProgress = progress;
                    lastEmit = now;
                }
            }
            out.flush();
        } finally {
            connection.disconnect();
        }
        if (received <= 0) throw new Exception("empty_update");
        //noinspection ResultOfMethodCallIgnored
        target.delete();
        if (!temp.renameTo(target)) throw new Exception("update_cache_commit_failed");
    }

    private HttpURLConnection openDownload(String initialUrl) throws Exception {
        URL current = new URL(initialUrl);
        for (int redirects = 0; redirects < 6; redirects++) {
            if (!"https".equalsIgnoreCase(current.getProtocol())) throw new Exception("unsafe_update_redirect");
            HttpURLConnection connection = (HttpURLConnection) current.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("User-Agent", "FitTimer-Android-Updater");
            connection.setRequestProperty("Accept", APK_MIME + ",application/octet-stream;q=0.9,*/*;q=0.1");
            int code = connection.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.isEmpty()) throw new Exception("bad_update_redirect");
                current = new URL(current, location);
                continue;
            }
            if (code != HttpURLConnection.HTTP_OK) {
                connection.disconnect();
                throw new Exception("update_http_" + code);
            }
            return connection;
        }
        throw new Exception("too_many_update_redirects");
    }

    private void verifyUpdateApk(File apk, int expectedVersionCode) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        PackageInfo current = pm.getPackageInfo(getContext().getPackageName(), flags);
        if (archive == null || archive.packageName == null) throw new Exception("invalid_update_apk");
        if (!getContext().getPackageName().equals(archive.packageName)) throw new Exception("package_mismatch");

        long archiveVersion = versionCode(archive);
        long currentVersion = versionCode(current);
        if (archiveVersion <= currentVersion) throw new Exception("update_not_newer");
        if (expectedVersionCode > 0 && archiveVersion != expectedVersionCode) throw new Exception("version_mismatch");

        Set<String> archiveSigners = signerDigests(archive);
        Set<String> currentSigners = signerDigests(current);
        if (archiveSigners.isEmpty() || !archiveSigners.equals(currentSigners)) throw new Exception("signature_mismatch");
    }

    @SuppressWarnings("deprecation")
    private long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private Set<String> signerDigests(PackageInfo info) throws Exception {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) return new HashSet<>();
            signatures = info.signingInfo.getApkContentsSigners();
        } else {
            signatures = info.signatures;
        }
        Set<String> out = new HashSet<>();
        if (signatures == null) return out;
        for (Signature signature : signatures) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(signature.toByteArray());
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) hex.append(String.format("%02X", b));
            out.add(hex.toString());
        }
        return out;
    }

    private void finishInstallRequest(PluginCall call, File apk, boolean promptPermission) {
        getActivity().runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !getContext().getPackageManager().canRequestPackageInstalls()) {
                    emitUpdate("permission", 100, apk.length(), apk.length(), "");
                    if (promptPermission) {
                        Intent settings = new Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getContext().getPackageName())
                        );
                        getActivity().startActivity(settings);
                    }
                    JSObject result = new JSObject();
                    result.put("status", "permission_required");
                    call.resolve(result);
                    synchronized (this) { updateRunning = false; }
                    return;
                }

                Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apk
                );
                Intent installer = new Intent(Intent.ACTION_VIEW);
                installer.setDataAndType(uri, APK_MIME);
                installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                emitUpdate("installer", 100, apk.length(), apk.length(), "");
                getActivity().startActivity(installer);

                JSObject result = new JSObject();
                result.put("status", "installer_opened");
                call.resolve(result);
            } catch (Exception e) {
                emitUpdate("error", -1, 0, 0, safeError(e));
                JSObject result = new JSObject();
                result.put("status", "error");
                result.put("error", safeError(e));
                call.resolve(result);
            } finally {
                synchronized (this) { updateRunning = false; }
            }
        });
    }

    private void resolveOnUi(PluginCall call, String status, String error) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("status", status);
            if (error != null && !error.isEmpty()) result.put("error", error);
            call.resolve(result);
        });
    }

    private void emitUpdate(String status, int progress, long received, long total, String error) {
        JSObject data = new JSObject();
        data.put("status", status);
        data.put("progress", progress);
        data.put("received", received);
        data.put("total", total);
        if (error != null && !error.isEmpty()) data.put("error", error);
        getActivity().runOnUiThread(() -> notifyListeners("updateProgress", data));
    }

    private String safeError(Exception e) {
        String value = e == null ? "" : e.getMessage();
        if (value == null || value.isEmpty()) return "update_failed";
        String safe = value.replaceAll("[^a-zA-Z0-9_.-]", "_");
        return safe.substring(0, Math.min(80, safe.length()));
    }

    @PluginMethod
    public void requestReview(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                ReviewManager manager = ReviewManagerFactory.create(getContext());
                manager.requestReviewFlow().addOnCompleteListener(requestTask -> {
                    if (!requestTask.isSuccessful()) {
                        call.reject("review_unavailable", requestTask.getException());
                        return;
                    }
                    ReviewInfo reviewInfo = requestTask.getResult();
                    manager.launchReviewFlow(getActivity(), reviewInfo).addOnCompleteListener(flowTask -> call.resolve());
                });
            } catch (Exception e) {
                call.reject("review_failed", e);
            }
        });
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        final boolean light = call.getBoolean("light", true);
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(light);
            controller.setAppearanceLightNavigationBars(light);
            JSObject result = new JSObject();
            result.put("light", light);
            call.resolve(result);
        });
    }
}
