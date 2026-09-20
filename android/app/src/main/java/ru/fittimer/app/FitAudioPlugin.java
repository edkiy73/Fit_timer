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

import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import org.json.JSONArray;
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
import java.util.List;
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
    private String pendingPartialText = "";
    private String pendingPartialKind = "";
    private int pendingPartialHits = 0;
    private Runnable pendingPartialRunnable = null;

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
        final String language = cleanLanguage(call.getString("language", "ru"));
        io.execute(() -> {
            JSObject result = new JSObject();
            result.put("language", language);
            result.put("sizeMb", VoiceModelWorker.modelSizeMb(language));
            result.put("active", language.equals(loadedModelLanguage) && voskModel != null);

            boolean installed = VoiceModelWorker.isModelReady(getContext(), language);
            result.put("installed", installed);
            String status = installed ? "ready" : "idle";
            int progress = installed ? 100 : 0;

            if (!installed) {
                try {
                    List<WorkInfo> infos = WorkManager.getInstance(getContext())
                        .getWorkInfosForUniqueWork(VoiceModelWorker.workName(language)).get();
                    if (!infos.isEmpty()) {
                        WorkInfo info = infos.get(infos.size() - 1);
                        if (info.getState() == WorkInfo.State.RUNNING) {
                            status = info.getProgress().getString(VoiceModelWorker.KEY_STATUS);
                            if (status == null || status.isEmpty()) status = "downloading";
                            progress = info.getProgress().getInt(VoiceModelWorker.KEY_PROGRESS, 0);
                        } else if (info.getState() == WorkInfo.State.ENQUEUED || info.getState() == WorkInfo.State.BLOCKED) {
                            status = "queued";
                        } else if (info.getState() == WorkInfo.State.FAILED || info.getState() == WorkInfo.State.CANCELLED) {
                            status = "error";
                        } else if (info.getState() == WorkInfo.State.SUCCEEDED) {
                            installed = VoiceModelWorker.isModelReady(getContext(), language);
                            result.put("installed", installed);
                            status = installed ? "ready" : "error";
                            progress = installed ? 100 : 0;
                        }
                    }
                } catch (Exception ignored) {}
            }

            result.put("status", status);
            result.put("progress", progress);
            main.post(() -> call.resolve(result));
        });
    }

    @PluginMethod
    public void prepareRecognitionModel(PluginCall call) {
        final String language = cleanLanguage(call.getString("language", "ru"));
        if (VoiceModelWorker.isModelReady(getContext(), language)) {
            JSObject result = new JSObject();
            result.put("installed", true);
            result.put("queued", false);
            result.put("language", language);
            result.put("sizeMb", VoiceModelWorker.modelSizeMb(language));
            call.resolve(result);
            return;
        }

        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(VoiceModelWorker.class)
            .setConstraints(constraints)
            .setInputData(new Data.Builder().putString(VoiceModelWorker.KEY_LANGUAGE, language).build())
            .build();

        WorkManager.getInstance(getContext()).enqueueUniqueWork(
            VoiceModelWorker.workName(language),
            ExistingWorkPolicy.KEEP,
            request
        );

        JSObject result = new JSObject();
        result.put("installed", false);
        result.put("queued", true);
        result.put("language", language);
        result.put("sizeMb", VoiceModelWorker.modelSizeMb(language));
        call.resolve(result);
    }

    @PluginMethod
    public void deleteRecognitionModel(PluginCall call) {
        final String language = cleanLanguage(call.getString("language", "ru"));
        recognitionWanted = false;
        WorkManager.getInstance(getContext()).cancelUniqueWork(VoiceModelWorker.workName(language));
        main.post(this::stopSpeechService);
        io.execute(() -> {
            try {
                if (language.equals(loadedModelLanguage) && voskModel != null) {
                    voskModel.close();
                    voskModel = null;
                    loadedModelLanguage = "";
                }
                deleteRecursively(VoiceModelWorker.modelDir(getContext(), language));
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
        if (!VoiceModelWorker.isModelReady(getContext(), language)) {
            JSObject result = new JSObject();
            result.put("started", false);
            result.put("missingModel", true);
            result.put("language", language);
            result.put("sizeMb", VoiceModelWorker.modelSizeMb(language));
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
                        Recognizer recognizer = new Recognizer(voskModel, 16000.0f);
                        recognizer.setWords(true);
                        speechService = new SpeechService(recognizer, 16000.0f);
                        commandFiredForUtterance = false;
                        speechService.startListening(this);
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
        voskModel = new Model(VoiceModelWorker.modelDir(getContext(), language).getAbsolutePath());
        loadedModelLanguage = language;
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

    private double hypothesisConfidence(String json) {
        if (json == null || json.isEmpty()) return 0.0;
        try {
            JSONArray words = new JSONObject(json).optJSONArray("result");
            if (words == null || words.length() == 0) return 0.0;
            double sum = 0.0;
            for (int i = 0; i < words.length(); i++) sum += words.getJSONObject(i).optDouble("conf", 0.0);
            return sum / words.length();
        } catch (Exception ignored) { return 0.0; }
    }

    private String commandKind(String text) {
        String t = text == null ? "" : text.toLowerCase(Locale.ROOT).trim().replaceAll("\\s+", " ");
        switch (t) {
            case "пауза": case "на паузу": case "поставь на паузу": case "стоп":
            case "подожди": case "остановись":
            case "pause": case "stop": case "wait":
                return "pause";
            case "продолжить": case "продолжай": case "продолжаем": case "продолжи":
            case "можно продолжать": case "поехали": case "дальше пошли":
            case "continue": case "resume": case "go on": case "keep going":
                return "resume";
            case "дальше": case "готово": case "готов": case "готова": case "готовы":
            case "пропустить": case "пропусти":
            case "следующее": case "следующий": case "сделал": case "закончил": case "завершить":
            case "next": case "done": case "skip": case "finished":
                return "next";
            default:
                return "";
        }
    }

    private void cancelPendingPartial() {
        if (pendingPartialRunnable != null) main.removeCallbacks(pendingPartialRunnable);
        pendingPartialRunnable = null;
        pendingPartialText = "";
        pendingPartialKind = "";
        pendingPartialHits = 0;
    }

    private void emitCommand(String text, String kind, double confidence, String source) {
        if (commandFiredForUtterance || kind == null || kind.isEmpty()) return;
        commandFiredForUtterance = true;
        cancelPendingPartial();

        JSObject event = new JSObject();
        event.put("text", text.toLowerCase(Locale.ROOT).trim());
        event.put("confidence", confidence);
        event.put("kind", kind);
        event.put("source", source);
        notifyListeners("speechResult", event);
    }

    private void considerPartialCommand(String hypothesis) {
        if (commandFiredForUtterance || hypothesis == null || hypothesis.isEmpty()) return;
        String text = hypothesisText(hypothesis, "partial");
        String kind = commandKind(text);
        if (kind.isEmpty()) {
            cancelPendingPartial();
            return;
        }

        String normalized = text.toLowerCase(Locale.ROOT).trim().replaceAll("\\s+", " ");
        if (normalized.equals(pendingPartialText) && kind.equals(pendingPartialKind)) {
            pendingPartialHits++;
            // Два одинаковых точных partial подряд — уже достаточно. Это даёт
            // быстрый отклик без ожидания длинной паузы после слова.
            if (pendingPartialHits >= 2) emitCommand(normalized, kind, 0.0, "partial");
            return;
        }

        cancelPendingPartial();
        pendingPartialText = normalized;
        pendingPartialKind = kind;
        pendingPartialHits = 1;

        // Пауза/продолжение должны ощущаться моментально. Переход на следующий этап
        // чуть строже, потому что случайный next наиболее разрушителен.
        long delay = "next".equals(kind) ? 260L : 160L;
        pendingPartialRunnable = () -> {
            if (!commandFiredForUtterance
                && normalized.equals(pendingPartialText)
                && kind.equals(pendingPartialKind)) {
                emitCommand(normalized, kind, 0.0, "partial_stable");
            }
        };
        main.postDelayed(pendingPartialRunnable, delay);
    }

    private void emitFinalCommand(String hypothesis) {
        if (hypothesis == null || hypothesis.isEmpty() || commandFiredForUtterance) return;
        String text = hypothesisText(hypothesis, "text");
        String kind = commandKind(text);
        if (kind.isEmpty()) return;

        double confidence = hypothesisConfidence(hypothesis);
        // Финальный результат уже обязан совпасть с целой командой. Поэтому порог
        // ниже прежнего: высокий 0.74 отбрасывал нормальное "готово" при обычной речи.
        double threshold = "next".equals(kind) ? 0.58 : 0.45;
        if (confidence > 0.0 && confidence < threshold) return;

        emitCommand(text, kind, confidence, "final");
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
        cancelPendingPartial();
    }

    @Override public void onPartialResult(String hypothesis) {
        // Реагируем только если partial целиком совпал с реальной командой и
        // удержался достаточно долго. Фрагменты вроде "про" / "го" не проходят.
        considerPartialCommand(hypothesis);
    }
    @Override public void onResult(String hypothesis) {
        cancelPendingPartial();
        emitFinalCommand(hypothesis);
        commandFiredForUtterance = false;
    }
    @Override public void onFinalResult(String hypothesis) {
        cancelPendingPartial();
        emitFinalCommand(hypothesis);
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
