package ru.fittimer.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
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

import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(
    name = "FitAudio",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class FitAudioPlugin extends Plugin implements RecognitionListener {
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private SpeechRecognizer recognizer;
    private Intent recognizerIntent;
    private boolean recognitionWanted = false;

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
        if (status == TextToSpeech.ERROR) {
            if (finished.compareAndSet(false, true)) {
                JSObject result = new JSObject();
                result.put("spoken", false);
                call.resolve(result);
            }
        }
    }

    @PluginMethod
    public void startRecognition(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission is required");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Speech recognition is unavailable");
            return;
        }
        recognitionWanted = true;
        main.post(() -> {
            destroyRecognizer();
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(this);
            recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("locale", "ru-RU"));
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            recognizer.startListening(recognizerIntent);
            call.resolve();
        });
    }

    @PluginMethod
    public void stopRecognition(PluginCall call) {
        recognitionWanted = false;
        main.post(this::destroyRecognizer);
        call.resolve();
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) {}
            recognizer.destroy();
            recognizer = null;
        }
    }

    private void restartRecognition() {
        if (!recognitionWanted || recognizer == null || recognizerIntent == null) return;
        main.postDelayed(() -> {
            if (!recognitionWanted || recognizer == null) return;
            try { recognizer.startListening(recognizerIntent); }
            catch (Exception ignored) { main.postDelayed(this::restartRecognition, 400); }
        }, 180);
    }

    private void emitResults(Bundle results) {
        if (results == null) return;
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null) return;
        for (String text : matches) {
            if (text == null || text.trim().isEmpty()) continue;
            JSObject event = new JSObject();
            event.put("text", text);
            notifyListeners("speechResult", event);
        }
    }

    @Override public void onResults(Bundle results) { emitResults(results); restartRecognition(); }
    @Override public void onPartialResults(Bundle partialResults) { emitResults(partialResults); }
    @Override public void onError(int error) {
        if (!recognitionWanted) return;
        if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
            JSObject event = new JSObject();
            event.put("error", "permission");
            notifyListeners("speechError", event);
            recognitionWanted = false;
            return;
        }
        restartRecognition();
    }
    @Override public void onReadyForSpeech(Bundle params) {}
    @Override public void onBeginningOfSpeech() {}
    @Override public void onRmsChanged(float rmsdB) {}
    @Override public void onBufferReceived(byte[] buffer) {}
    @Override public void onEndOfSpeech() {}
    @Override public void onEvent(int eventType, Bundle params) {}

    @Override
    protected void handleOnDestroy() {
        recognitionWanted = false;
        main.post(this::destroyRecognizer);
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
    }
}
