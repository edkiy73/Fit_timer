package ru.fittimer.app;

import android.Manifest;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(
    name = "FitAudio",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class FitAudioPlugin extends Plugin implements RecognitionListener {
    private static final String MODEL_NAME = "vosk-model-small-ru-0.22";
    private static final String MODEL_URL = "https://alphacephei.com/vosk/models/" + MODEL_NAME + ".zip";
    private static final String COMMAND_GRAMMAR =
        "[\"дальше\",\"готово\",\"пропустить\",\"пауза\",\"продолжить\"," +
        "\"стоп\",\"подожди\",\"поехали\",\"завершить\",\"сделал\",\"[unk]\"]";

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private TextToSpeech tts;
    private boolean ttsReady = false;

    private Model voskModel;
    private SpeechService speechService;
    private volatile boolean recognitionWanted = false;
    private volatile boolean modelPreparing = false;
    private PluginCall pendingRecognitionCall;
    private boolean commandFiredForUtterance = false;

    @Override
    public void load() {
        main.post(() -> tts = new TextToSpeech(getContext(), status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) tts.setLanguage(Locale.forLanguageTag("ru-RU"));
        }));
    }

    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            resolveMicrophone(call, true);
        } else {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
        }
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        resolveMicrophone(call, getPermissionState("microphone") == PermissionState.GRANTED);
    }

    private void resolveMicrophone(PluginCall call, boolean granted) {
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text.isEmpty() || !ttsReady || tts == null) {
            JSObject result = new JSObject();
            result.put("spoken", false);
            call.resolve(result);
            return;
        }
        String utteranceId = UUID.randomUUID().toString();
        AtomicBoolean finished = new AtomicBoolean(false);
        tts.stop();
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            private void finish(boolean spoken) {
                if (!finished.compareAndSet(false, true)) return;
                JSObject result = new JSObject();
                result.put("spoken", spoken);
                call.resolve(result);
            }
            @Override public void onStart(String id) {}
            @Override public void onDone(String id) { if (utteranceId.equals(id)) finish(true); }
            @Override public void onError(String id) { if (utteranceId.equals(id)) finish(false); }
            @Override public void onStop(String id, boolean interrupted) { if (utteranceId.equals(id)) finish(false); }
        });
        tts.setLanguage(Locale.forLanguageTag(call.getString("locale", "ru-RU")));
        int status = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
        if (status == TextToSpeech.ERROR && finished.compareAndSet(false, true)) {
            JSObject result = new JSObject();
            result.put("spoken", false);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @PluginMethod
    public void startRecognition(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission is required");
            return;
        }
        recognitionWanted = true;
        pendingRecognitionCall = call;

        if (voskModel != null) {
            startVoskRecognition();
            return;
        }
        prepareModel();
    }

    @PluginMethod
    public void stopRecognition(PluginCall call) {
        recognitionWanted = false;
        pendingRecognitionCall = null;
        main.post(this::stopSpeechService);
        call.resolve();
    }

    private void prepareModel() {
        synchronized (this) {
            if (modelPreparing) return;
            modelPreparing = true;
        }

        io.execute(() -> {
            try {
                File modelDir = new File(new File(getContext().getFilesDir(), "voice"), MODEL_NAME);
                if (!isModelReady(modelDir)) {
                    emitStatus("downloading", 0);
                    downloadAndExtractModel(modelDir);
                }
                emitStatus("loading", 100);
                Model loaded = new Model(modelDir.getAbsolutePath());
                main.post(() -> {
                    voskModel = loaded;
                    modelPreparing = false;
                    emitStatus("ready", 100);
                    if (recognitionWanted) startVoskRecognition();
                    else resolvePending(false);
                });
            } catch (Exception e) {
                main.post(() -> {
                    modelPreparing = false;
                    recognitionWanted = false;
                    emitSpeechError("model");
                    PluginCall call = pendingRecognitionCall;
                    pendingRecognitionCall = null;
                    if (call != null) call.reject("Could not prepare offline voice model", e);
                });
            }
        });
    }

    private boolean isModelReady(File dir) {
        return new File(dir, "am/final.mdl").isFile() && new File(dir, "conf/model.conf").isFile();
    }

    private void downloadAndExtractModel(File modelDir) throws Exception {
        File parent = modelDir.getParentFile();
        if (parent == null) throw new IllegalStateException("Voice model path is unavailable");
        if (!parent.exists() && !parent.mkdirs()) throw new IllegalStateException("Could not create voice model folder");

        File zipFile = new File(getContext().getCacheDir(), MODEL_NAME + ".zip");
        HttpURLConnection connection = (HttpURLConnection) new URL(MODEL_URL).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setInstanceFollowRedirects(true);
        connection.connect();

        int total = connection.getContentLength();
        if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
            throw new IllegalStateException("Voice model download failed: HTTP " + connection.getResponseCode());
        }

        long copied = 0;
        int lastProgress = 0;
        try (InputStream in = new BufferedInputStream(connection.getInputStream());
             FileOutputStream out = new FileOutputStream(zipFile)) {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) >= 0) {
                if (n == 0) continue;
                out.write(buffer, 0, n);
                copied += n;
                if (total > 0) {
                    int progress = Math.min(99, (int) ((copied * 100L) / total));
                    if (progress >= lastProgress + 10) {
                        lastProgress = progress;
                        emitStatus("downloading", progress);
                    }
                }
            }
        } finally {
            connection.disconnect();
        }

        File canonicalParent = parent.getCanonicalFile();
        try (ZipInputStream zin = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)))) {
            ZipEntry entry;
            byte[] buffer = new byte[64 * 1024];
            while ((entry = zin.getNextEntry()) != null) {
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
                        while ((n = zin.read(buffer)) >= 0) {
                            if (n > 0) fout.write(buffer, 0, n);
                        }
                    }
                }
                zin.closeEntry();
            }
        } finally {
            //noinspection ResultOfMethodCallIgnored
            zipFile.delete();
        }

        if (!isModelReady(modelDir)) throw new IllegalStateException("Downloaded voice model is incomplete");
    }

    private void startVoskRecognition() {
        main.post(() -> {
            if (!recognitionWanted || voskModel == null) {
                resolvePending(false);
                return;
            }
            stopSpeechService();
            try {
                Recognizer recognizer = new Recognizer(voskModel, 16000.0f, COMMAND_GRAMMAR);
                speechService = new SpeechService(recognizer, 16000.0f);
                commandFiredForUtterance = false;
                speechService.startListening(this);
                resolvePending(true);
                emitStatus("listening", 100);
            } catch (Exception e) {
                recognitionWanted = false;
                emitSpeechError("recognition");
                PluginCall call = pendingRecognitionCall;
                pendingRecognitionCall = null;
                if (call != null) call.reject("Could not start offline recognition", e);
            }
        });
    }

    private void resolvePending(boolean started) {
        PluginCall call = pendingRecognitionCall;
        pendingRecognitionCall = null;
        if (call == null) return;
        JSObject result = new JSObject();
        result.put("started", started);
        result.put("offline", true);
        call.resolve(result);
    }

    private void stopSpeechService() {
        if (speechService != null) {
            try { speechService.cancel(); } catch (Exception ignored) {}
            try { speechService.shutdown(); } catch (Exception ignored) {}
            speechService = null;
        }
        commandFiredForUtterance = false;
    }

    private String hypothesisText(String json, String key) {
        if (json == null || json.isEmpty()) return "";
        try { return new JSONObject(json).optString(key, "").trim(); }
        catch (Exception ignored) { return ""; }
    }

    private void emitCommand(String text) {
        if (text == null || text.isEmpty() || commandFiredForUtterance) return;
        String normalized = text.toLowerCase(Locale.ROOT).trim();
        if ("[unk]".equals(normalized)) return;
        commandFiredForUtterance = true;
        JSObject event = new JSObject();
        event.put("text", normalized);
        notifyListeners("speechResult", event);
    }

    private void emitStatus(String status, int progress) {
        JSObject event = new JSObject();
        event.put("status", status);
        event.put("progress", progress);
        event.put("offline", true);
        notifyListeners("speechStatus", event);
    }

    private void emitSpeechError(String error) {
        JSObject event = new JSObject();
        event.put("error", error);
        notifyListeners("speechError", event);
    }

    @Override public void onPartialResult(String hypothesis) {
        emitCommand(hypothesisText(hypothesis, "partial"));
    }

    @Override public void onResult(String hypothesis) {
        emitCommand(hypothesisText(hypothesis, "text"));
        commandFiredForUtterance = false;
    }

    @Override public void onFinalResult(String hypothesis) {
        emitCommand(hypothesisText(hypothesis, "text"));
        commandFiredForUtterance = false;
    }

    @Override public void onError(Exception exception) {
        if (!recognitionWanted) return;
        emitSpeechError("recognition");
    }

    @Override public void onTimeout() {}

    @Override
    protected void handleOnDestroy() {
        recognitionWanted = false;
        main.post(this::stopSpeechService);
        if (voskModel != null) {
            try { voskModel.close(); } catch (Exception ignored) {}
            voskModel = null;
        }
        io.shutdownNow();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
    }
}
