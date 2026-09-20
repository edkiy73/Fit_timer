package ru.fittimer.app;

import android.Manifest;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.JSArray;
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
import java.util.Set;
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
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private TextToSpeech tts;
    private boolean ttsReady = false;

    private Model voskModel;
    private String loadedModelLanguage = "";
    private SpeechService speechService;
    private volatile boolean recognitionWanted = false;
    private boolean commandFiredForUtterance = false;

    @Override
    public void load() {
        main.post(() -> tts = new TextToSpeech(getContext(), status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) tts.setLanguage(Locale.forLanguageTag("ru-RU"));
        }));
    }

    private String cleanLanguage(String language) {
        String l = language == null ? "ru" : language.toLowerCase(Locale.ROOT);
        return l.startsWith("en") ? "en" : "ru";
    }

    private String modelName(String language) {
        return "en".equals(cleanLanguage(language))
            ? "vosk-model-small-en-us-0.15"
            : "vosk-model-small-ru-0.22";
    }

    private String modelUrl(String language) {
        return "https://alphacephei.com/vosk/models/" + modelName(language) + ".zip";
    }

    private int modelSizeMb(String language) {
        return "en".equals(cleanLanguage(language)) ? 40 : 45;
    }

    private String commandGrammar(String language) {
        if ("en".equals(cleanLanguage(language))) {
            return "[\"next\",\"done\",\"skip\",\"pause\",\"continue\",\"resume\",\"stop\",\"wait\",\"go on\",\"finished\",\"[unk]\"]";
        }
        return "[\"дальше\",\"готово\",\"пропустить\",\"пауза\",\"продолжить\",\"стоп\",\"подожди\",\"поехали\",\"завершить\",\"сделал\",\"[unk]\"]";
    }

    private File modelDir(String language) {
        return new File(new File(getContext().getFilesDir(), "voice"), modelName(language));
    }

    private boolean isModelReady(String language) {
        File dir = modelDir(language);
        return new File(dir, "am/final.mdl").isFile() && new File(dir, "conf/model.conf").isFile();
    }

    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) resolveMicrophone(call, true);
        else requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
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
    public void getRecognitionModelStatus(PluginCall call) {
        String language = cleanLanguage(call.getString("language", "ru"));
        JSObject result = new JSObject();
        result.put("language", language);
        result.put("installed", isModelReady(language));
        result.put("sizeMb", modelSizeMb(language));
        result.put("active", language.equals(loadedModelLanguage) && voskModel != null);
        call.resolve(result);
    }

    @PluginMethod
    public void prepareRecognitionModel(PluginCall call) {
        final String language = cleanLanguage(call.getString("language", "ru"));
        if (isModelReady(language)) {
            JSObject result = new JSObject();
            result.put("installed", true);
            result.put("language", language);
            result.put("sizeMb", modelSizeMb(language));
            call.resolve(result);
            return;
        }

        io.execute(() -> {
            try {
                emitStatus("downloading", language, 0);
                downloadAndExtractModel(language);
                emitStatus("ready", language, 100);
                JSObject result = new JSObject();
                result.put("installed", true);
                result.put("language", language);
                result.put("sizeMb", modelSizeMb(language));
                call.resolve(result);
            } catch (Exception e) {
                emitStatus("error", language, 0);
                call.reject("Could not download voice model", e);
            }
        });
    }

    @PluginMethod
    public void deleteRecognitionModel(PluginCall call) {
        final String language = cleanLanguage(call.getString("language", "ru"));
        recognitionWanted = false;
        main.post(this::stopSpeechService);
        io.execute(() -> {
            try {
                if (language.equals(loadedModelLanguage) && voskModel != null) {
                    voskModel.close();
                    voskModel = null;
                    loadedModelLanguage = "";
                }
                deleteRecursively(modelDir(language));
                JSObject result = new JSObject();
                result.put("deleted", true);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Could not delete voice model", e);
            }
        });
    }

    @PluginMethod
    public void listVoices(PluginCall call) {
        JSArray voices = new JSArray();
        if (ttsReady && tts != null) {
            try {
                Set<Voice> available = tts.getVoices();
                if (available != null) {
                    for (Voice voice : available) {
                        JSObject item = new JSObject();
                        item.put("name", voice.getName());
                        item.put("language", voice.getLocale() == null ? "" : voice.getLocale().toLanguageTag());
                        item.put("network", voice.isNetworkConnectionRequired());
                        voices.put(item);
                    }
                }
            } catch (Exception ignored) {}
        }
        JSObject result = new JSObject();
        result.put("voices", voices);
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

        String localeTag = call.getString("locale", "ru-RU");
        String voiceName = call.getString("voice", "");
        Locale locale = Locale.forLanguageTag(localeTag);
        tts.setLanguage(locale);

        if (!voiceName.isEmpty()) {
            try {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) {
                    for (Voice voice : voices) {
                        if (voiceName.equals(voice.getName())) {
                            tts.setVoice(voice);
                            break;
                        }
                    }
                }
            } catch (Exception ignored) {}
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

        final String language = cleanLanguage(call.getString("language", "ru"));
        if (!isModelReady(language)) {
            JSObject result = new JSObject();
            result.put("started", false);
            result.put("missingModel", true);
            result.put("language", language);
            result.put("sizeMb", modelSizeMb(language));
            call.resolve(result);
            return;
        }

        recognitionWanted = true;
        io.execute(() -> {
            try {
                ensureLoadedModel(language);
                main.post(() -> {
                    if (!recognitionWanted) {
                        JSObject result = new JSObject();
                        result.put("started", false);
                        call.resolve(result);
                        return;
                    }
                    stopSpeechService();
                    try {
                        Recognizer recognizer = new Recognizer(voskModel, 16000.0f, commandGrammar(language));
                        speechService = new SpeechService(recognizer, 16000.0f);
                        commandFiredForUtterance = false;
                        speechService.startListening(this);
                        emitStatus("listening", language, 100);
                        JSObject result = new JSObject();
                        result.put("started", true);
                        result.put("offline", true);
                        result.put("language", language);
                        call.resolve(result);
                    } catch (Exception e) {
                        recognitionWanted = false;
                        emitSpeechError("recognition");
                        call.reject("Could not start offline recognition", e);
                    }
                });
            } catch (Exception e) {
                recognitionWanted = false;
                emitSpeechError("model");
                call.reject("Could not load voice model", e);
            }
        });
    }

    @PluginMethod
    public void stopRecognition(PluginCall call) {
        recognitionWanted = false;
        main.post(this::stopSpeechService);
        call.resolve();
    }

    private void ensureLoadedModel(String language) throws Exception {
        if (voskModel != null && language.equals(loadedModelLanguage)) return;
        if (voskModel != null) {
            voskModel.close();
            voskModel = null;
        }
        voskModel = new Model(modelDir(language).getAbsolutePath());
        loadedModelLanguage = language;
    }

    private void downloadAndExtractModel(String language) throws Exception {
        File targetDir = modelDir(language);
        File parent = targetDir.getParentFile();
        if (parent == null) throw new IllegalStateException("Voice model path is unavailable");
        if (!parent.exists() && !parent.mkdirs()) throw new IllegalStateException("Could not create voice model folder");

        File zipFile = new File(getContext().getCacheDir(), modelName(language) + ".zip");
        HttpURLConnection connection = (HttpURLConnection) new URL(modelUrl(language)).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(45000);
        connection.setInstanceFollowRedirects(true);
        connection.connect();

        int total = connection.getContentLength();
        if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
            throw new IllegalStateException("Voice model download failed: HTTP " + connection.getResponseCode());
        }

        long copied = 0;
        int lastProgress = -10;
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
                    if (progress >= lastProgress + 5) {
                        lastProgress = progress;
                        emitStatus("downloading", language, progress);
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
                        while ((n = zin.read(buffer)) >= 0) if (n > 0) fout.write(buffer, 0, n);
                    }
                }
                zin.closeEntry();
            }
        } finally {
            //noinspection ResultOfMethodCallIgnored
            zipFile.delete();
        }

        if (!isModelReady(language)) throw new IllegalStateException("Downloaded voice model is incomplete");
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
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

    private void emitStatus(String status, String language, int progress) {
        JSObject event = new JSObject();
        event.put("status", status);
        event.put("language", cleanLanguage(language));
        event.put("progress", progress);
        event.put("offline", true);
        notifyListeners("speechStatus", event);
    }

    private void emitSpeechError(String error) {
        JSObject event = new JSObject();
        event.put("error", error);
        notifyListeners("speechError", event);
    }

    private void stopSpeechService() {
        if (speechService != null) {
            try { speechService.cancel(); } catch (Exception ignored) {}
            try { speechService.shutdown(); } catch (Exception ignored) {}
            speechService = null;
        }
        commandFiredForUtterance = false;
    }

    @Override public void onPartialResult(String hypothesis) { emitCommand(hypothesisText(hypothesis, "partial")); }
    @Override public void onResult(String hypothesis) {
        emitCommand(hypothesisText(hypothesis, "text"));
        commandFiredForUtterance = false;
    }
    @Override public void onFinalResult(String hypothesis) {
        emitCommand(hypothesisText(hypothesis, "text"));
        commandFiredForUtterance = false;
    }
    @Override public void onError(Exception exception) {
        if (recognitionWanted) emitSpeechError("recognition");
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
