package app.unmute.english;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * App updates. The "direct" APK (from GitHub) downloads the new APK in the background,
 * checks package, exact versionCode and signing certificate, then opens the Android
 * installer for the final confirmation. The store build only opens the store page.
 * Ported from FitTimer (FitSystemPlugin / UpdateDownloadWorker).
 */
@CapacitorPlugin(name = "UnMuteUpdate")
public class UnMuteUpdatePlugin extends Plugin {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getDistribution(PluginCall call) {
        JSObject result = new JSObject();
        result.put("channel", BuildConfig.DIRECT_UPDATES ? "direct" : "store");
        result.put("versionCode", BuildConfig.VERSION_CODE);
        result.put("versionName", BuildConfig.VERSION_NAME);
        call.resolve(result);
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equals("https") || scheme.equals("market"))) {
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

        updateExecutor.execute(() -> {
            try {
                File apk = UpdateDownloadWorker.updateFile(getContext());
                if (apk.isFile()) {
                    try {
                        verifyUpdateApk(apk, expectedVersionCode);
                        finishInstallRequest(call, apk, true);
                        return;
                    } catch (Exception stale) {
                        //noinspection ResultOfMethodCallIgnored
                        apk.delete();
                    }
                }

                WorkInfo current = latestUpdateWork();
                if (current != null && (current.getState() == WorkInfo.State.RUNNING
                    || current.getState() == WorkInfo.State.ENQUEUED
                    || current.getState() == WorkInfo.State.BLOCKED)) {
                    resolveOnUi(call, "in_progress", "");
                    return;
                }

                Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();
                OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(UpdateDownloadWorker.class)
                    .setConstraints(constraints)
                    .setInputData(new Data.Builder().putString(UpdateDownloadWorker.KEY_URL, url).build())
                    .build();
                WorkManager.getInstance(getContext()).enqueueUniqueWork(
                    UpdateDownloadWorker.WORK_NAME,
                    ExistingWorkPolicy.REPLACE,
                    request
                );
                resolveOnUi(call, "in_progress", "");
            } catch (Exception e) {
                resolveOnUi(call, "error", safeError(e));
            }
        });
    }

    @PluginMethod
    public void cancelUpdate(PluginCall call) {
        WorkManager.getInstance(getContext()).cancelUniqueWork(UpdateDownloadWorker.WORK_NAME);
        UpdateDownloadWorker.deletePartial(getContext(), false);
        call.resolve();
    }

    /** Polled by the app: the download lives in WorkManager and survives closing the screen. */
    @PluginMethod
    public void getUpdateState(PluginCall call) {
        updateExecutor.execute(() -> {
            JSObject result = new JSObject();
            try {
                WorkInfo info = latestUpdateWork();
                File apk = UpdateDownloadWorker.updateFile(getContext());
                if (info == null) {
                    boolean ready = apk.isFile();
                    result.put("running", false);
                    result.put("status", ready ? "ready" : "idle");
                    result.put("progress", ready ? 100 : -1);
                } else {
                    WorkInfo.State state = info.getState();
                    boolean running = state == WorkInfo.State.RUNNING
                        || state == WorkInfo.State.ENQUEUED
                        || state == WorkInfo.State.BLOCKED;
                    Data data = state == WorkInfo.State.SUCCEEDED ? info.getOutputData() : info.getProgress();
                    String status = data.getString(UpdateDownloadWorker.KEY_STATUS);
                    int progress = data.getInt(UpdateDownloadWorker.KEY_PROGRESS, -1);
                    String error = info.getOutputData().getString(UpdateDownloadWorker.KEY_ERROR);
                    if (running && (status == null || status.isEmpty())) status = "downloading";
                    if (state == WorkInfo.State.SUCCEEDED) status = apk.isFile() ? "ready" : "idle";
                    else if (state == WorkInfo.State.FAILED) status = "error";
                    else if (state == WorkInfo.State.CANCELLED) status = "cancelled";
                    result.put("running", running);
                    result.put("status", status == null ? "idle" : status);
                    result.put("progress", progress);
                    if (error != null && !error.isEmpty()) result.put("error", error);
                }
            } catch (Exception e) {
                result.put("running", false);
                result.put("status", "error");
                result.put("error", safeError(e));
            }
            getActivity().runOnUiThread(() -> call.resolve(result));
        });
    }

    /** After the download finishes (or after granting "install unknown apps"), opens the installer. */
    @PluginMethod
    public void installUpdate(PluginCall call) {
        if (!BuildConfig.DIRECT_UPDATES) {
            call.reject("direct_update_disabled");
            return;
        }
        final int expectedVersionCode = Math.max(0, call.getInt("expectedVersionCode", 0));
        updateExecutor.execute(() -> {
            try {
                File apk = UpdateDownloadWorker.updateFile(getContext());
                if (!apk.isFile()) {
                    resolveOnUi(call, "missing", "");
                    return;
                }
                verifyUpdateApk(apk, expectedVersionCode);
                finishInstallRequest(call, apk, true);
            } catch (Exception e) {
                resolveOnUi(call, "error", safeError(e));
            }
        });
    }

    /**
     * The unique work keeps finished entries from earlier updates (a SUCCEEDED one whose APK was
     * already installed and deleted). Their order is not guaranteed, so a fresh download must win:
     * prefer the entry that is still running, otherwise the last one.
     */
    private WorkInfo latestUpdateWork() throws Exception {
        List<WorkInfo> infos = WorkManager.getInstance(getContext())
            .getWorkInfosForUniqueWork(UpdateDownloadWorker.WORK_NAME).get();
        if (infos.isEmpty()) return null;
        for (WorkInfo info : infos) {
            WorkInfo.State state = info.getState();
            if (state == WorkInfo.State.RUNNING || state == WorkInfo.State.ENQUEUED || state == WorkInfo.State.BLOCKED) return info;
        }
        return infos.get(infos.size() - 1);
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
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(signature.toByteArray());
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
                    return;
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent installer = new Intent(Intent.ACTION_VIEW);
                installer.setDataAndType(uri, APK_MIME);
                installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().startActivity(installer);
                JSObject result = new JSObject();
                result.put("status", "installer_opened");
                call.resolve(result);
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("status", "error");
                result.put("error", safeError(e));
                call.resolve(result);
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

    private String safeError(Exception e) {
        String value = e == null ? "" : e.getMessage();
        if (value == null || value.isEmpty()) return "update_failed";
        String safe = value.replaceAll("[^a-zA-Z0-9_.-]", "_");
        return safe.substring(0, Math.min(80, safe.length()));
    }
}
