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

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
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
    private boolean grammarActive = false;
    private String loadedModelLanguage = "";
    // свой захват с автоусилением вместо org.vosk.android.SpeechService — см. FitSpeechCapture
    private FitSpeechCapture speechService;
    private volatile boolean recognitionWanted = false;
    private boolean commandFiredForUtterance = false;
    private String pendingPartialText = "";
    private String pendingPartialKind = "";
    private int pendingPartialHits = 0;
    private Runnable pendingPartialRunnable = null;
    // когда последний раз слышали постороннюю речь (телевизор, разговор) — см. VoiceCommands
    private long lastForeignSpeechMs = 0L;

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
                // хвост: звук ещё выходит из динамика и отражается от стен
                holdRecognition(TTS_TAIL_MS);
                JSObject result = new JSObject();
                result.put("spoken", spoken);
                call.resolve(result);
            }
            @Override public void onStart(String id) {}
            @Override public void onDone(String id) { if (utteranceId.equals(id)) finish(true); }
            @Override public void onError(String id) { if (utteranceId.equals(id)) finish(false); }
            @Override public void onStop(String id, boolean interrupted) { if (utteranceId.equals(id)) finish(false); }
        });

        // Пока приложение говорит, распознаватель не слушает. Потолок — на случай,
        // если TTS не сообщит о конце фразы.
        holdRecognition(TTS_HOLD_MAX_MS);
        int status = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
        if (status == TextToSpeech.ERROR) holdRecognition(0L);
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
                    Recognizer recognizer = null;
                    try {
                        // Словарь команд + [unk] (см. VoiceCommands): модель выбирает
                        // между десятком команд и «не команда», а не угадывает
                        // произвольное русское слово. Маленькие модели Vosk это
                        // поддерживают; если модель грамматику не примет — работаем
                        // по-старому, со свободной речью.
                        grammarActive = true;
                        try {
                            recognizer = new Recognizer(voskModel, (float) VoiceAutoGain.SAMPLE_RATE,
                                VoiceCommands.grammarJson(language));
                        } catch (Exception grammarFailed) {
                            grammarActive = false;
                            recognizer = new Recognizer(voskModel, (float) VoiceAutoGain.SAMPLE_RATE);
                        }
                        recognizer.setWords(true);
                        recognizer.setPartialWords(true);
                        // Workout commands are one or two short words. The default endpoint
                        // waits too long for trailing silence and makes "готово" feel laggy.
                        recognizer.setEndpointerMode(Recognizer.EndpointerMode.SHORT);
                        recognizer.setEndpointerDelays(4.0f, 0.28f, 8.0f);
                        speechService = new FitSpeechCapture(recognizer);
                        commandFiredForUtterance = false;
                        speechService.startListening(this);
                        JSObject result = new JSObject();
                        result.put("started", true);
                        result.put("offline", true);
                        result.put("grammar", grammarActive);
                        result.put("language", language);
                        call.resolve(result);
                    } catch (Exception e) {
                        // захват не поднялся — распознаватель ему так и не передан, закрываем здесь
                        if (speechService == null && recognizer != null) {
                            try { recognizer.close(); } catch (Exception ignored) {}
                        }
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

    private static final long TTS_HOLD_MAX_MS = 10000L;
    private static final long TTS_TAIL_MS = 400L;
    /** Порог конца фразы Vosk (0,28 с) + буфер захвата (0,2 с) + декодирование. */
    private static final long RESULT_LAG_MS = 700L;

    private void holdRecognition(long ms) {
        main.post(() -> { if (speechService != null) speechService.holdFor(ms); });
    }

    private List<VoiceCommands.Word> hypothesisWords(String json) {
        List<VoiceCommands.Word> out = new ArrayList<>();
        if (json == null || json.isEmpty()) return out;
        try {
            JSONArray words = new JSONObject(json).optJSONArray("result");
            if (words == null) return out;
            for (int i = 0; i < words.length(); i++) {
                JSONObject w = words.getJSONObject(i);
                out.add(new VoiceCommands.Word(w.optString("word", ""), w.optDouble("start", 0.0), w.optDouble("end", 0.0)));
            }
        } catch (Exception ignored) {}
        return out;
    }

    private String commandKindFlexible(String text) {
        return VoiceCommands.kindFlexible(text);
    }

    /**
     * Диагностика: что распознаватель услышал и во что это превратилось. Нужна,
     * чтобы понять, где рвётся цепочка — микрофон не слышит, или слышит, но
     * пишет другое слово. Приложение показывает это в проверке распознавания
     * (Настройки → Управление без рук).
     */
    private void emitHeard(String text, String kind, double confidence, String source, boolean accepted) {
        JSObject event = new JSObject();
        event.put("text", text == null ? "" : text.toLowerCase(Locale.ROOT).trim());
        event.put("kind", kind == null ? "" : kind);
        event.put("confidence", confidence);
        event.put("source", source);
        event.put("accepted", accepted);
        event.put("grammar", grammarActive);
        notifyListeners("speechHeard", event);
    }

    private void cancelPendingPartial() {
        if (pendingPartialRunnable != null) main.removeCallbacks(pendingPartialRunnable);
        pendingPartialRunnable = null;
        pendingPartialText = "";
        pendingPartialKind = "";
        pendingPartialHits = 0;
    }

    private void emitCommand(String text, String kind, double confidence, String source) {
        emitCommand(text, kind, confidence, source, 0.0);
    }

    private void emitCommand(String text, String kind, double confidence, String source, double spanSec) {
        if (commandFiredForUtterance || kind == null || kind.isEmpty()) return;
        commandFiredForUtterance = true;
        cancelPendingPartial();

        JSObject event = new JSObject();
        event.put("text", text.toLowerCase(Locale.ROOT).trim());
        event.put("confidence", confidence);
        event.put("kind", kind);
        event.put("source", source);
        // сколько назад началась фраза: JS сверяет это со своими звуками (гонг,
        // бип), а не момент прихода результата — тот запаздывает на ~0,5 с
        event.put("utteranceMs", Math.round(spanSec * 1000.0) + RESULT_LAG_MS);
        notifyListeners("speechResult", event);
        emitHeard(text, kind, confidence, source, true);
    }

    private void considerPartialCommand(String hypothesis) {
        if (commandFiredForUtterance || hypothesis == null || hypothesis.isEmpty()) return;
        // Со словарём команд промежуточные гипотезы ненадёжны: в начале ЛЮБОГО
        // слова декодер сразу прыгает на ближайшую команду («про…» → «продолжить»,
        // «го…» → «готово»), а итог того же слова оказывается [unk]. Именно так
        // первая версия со словарём (58d28f4) ловила ложные команды и была убрана.
        // Поэтому в этом режиме решает только итоговый результат с порогом
        // уверенности — он приходит через ~0.3 с тишины после слова.
        if (grammarActive) return;
        // только что шла посторонняя речь — ждём итог, там решит проверка паузы
        if (VoiceCommands.tooSoonAfterSpeech(System.currentTimeMillis(), 0.0, lastForeignSpeechMs)) return;
        String text = hypothesisText(hypothesis, "partial");
        String kind = commandKindFlexible(text);
        if (kind.isEmpty()) {
            // Do not cancel a valid candidate just because the decoder briefly emits
            // an empty/intermediate partial while the same word is still being spoken.
            return;
        }

        String normalized = text.toLowerCase(Locale.ROOT).trim().replaceAll("\\s+", " ");

        // If the decoder refines "готов" -> "готово", that is still one command.
        // Previously we reset the timer on every refinement, which created the
        // "say it ten times until you hit the right rhythm" behaviour.
        if (kind.equals(pendingPartialKind)) {
            pendingPartialHits++;
            pendingPartialText = normalized;
            if (pendingPartialHits >= 2) {
                emitCommand(normalized, kind, 0.0, "partial_fast");
            }
            return;
        }

        cancelPendingPartial();
        pendingPartialText = normalized;
        pendingPartialKind = kind;
        pendingPartialHits = 1;

        // One short debounce protects against a single unstable hypothesis, but does
        // not require the user to pause or pronounce the command slowly.
        long delay = "next".equals(kind) ? 110L : 70L;
        pendingPartialRunnable = () -> {
            if (!commandFiredForUtterance && kind.equals(pendingPartialKind)) {
                emitCommand(pendingPartialText, kind, 0.0, "partial_debounced");
            }
        };
        main.postDelayed(pendingPartialRunnable, delay);
    }

    private void emitFinalCommand(String hypothesis) {
        if (hypothesis == null || hypothesis.isEmpty()) return;
        String text = hypothesisText(hypothesis, "text");
        if (text.isEmpty()) return;
        if (commandFiredForUtterance) return; // команда уже ушла по partial — это её же конец
        String kind = commandKindFlexible(text);
        double confidence = hypothesisConfidence(hypothesis);
        List<VoiceCommands.Word> words = hypothesisWords(hypothesis);
        long now = System.currentTimeMillis();
        boolean foreign = VoiceCommands.hasForeignSpeech(text, words);
        boolean tooSoon = VoiceCommands.tooSoonAfterSpeech(now, VoiceCommands.spanSec(words), lastForeignSpeechMs);
        if (foreign) lastForeignSpeechMs = now;
        if (kind.isEmpty()) {
            emitHeard(text, "", confidence, "final", false);
            return;
        }
        // Команда внутри сплошной речи или сразу за ней — это телевизор или
        // разговор, где просто прозвучало «дальше» / «готово». Говоря с
        // приложением, команду произносят отдельно.
        if (foreign || tooSoon) {
            emitHeard(text, kind, confidence, "in_speech", false);
            return;
        }
        // Финальный результат уже обязан совпасть с целой командой. Поэтому порог
        // ниже прежнего: высокий 0.74 отбрасывал нормальное "готово" при обычной речи.
        double threshold = "next".equals(kind) ? 0.42 : 0.34;
        if (confidence > 0.0 && confidence < threshold) {
            emitHeard(text, kind, confidence, "final_low_confidence", false);
            return;
        }

        emitCommand(text, kind, confidence, "final", VoiceCommands.spanSec(words));
    }

    private void emitSpeechError(String error) {
        JSObject event = new JSObject();
        event.put("error", error);
        notifyListeners("speechError", event);
    }

    private void stopSpeechService() {
        if (speechService != null) {
            // shutdown() сам останавливает поток и освобождает микрофон и Recognizer
            try { speechService.shutdown(); } catch (Exception ignored) {}
            speechService = null;
        }
        commandFiredForUtterance = false;
        lastForeignSpeechMs = 0L;
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
