package app.unmute.english;

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

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(
    name = "UnMuteAudio",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class UnMuteAudioPlugin extends Plugin implements RecognitionListener {
    private final Handler main = new Handler(Looper.getMainLooper());

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private SpeechRecognizer recognizer;
    private boolean recognitionLive = false;

    @Override
    public void load() {
        main.post(() -> tts = new TextToSpeech(getContext(), status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) tts.setLanguage(Locale.forLanguageTag("en-GB"));
        }));
    }

    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            resolveMicrophone(call, true);
            return;
        }
        requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
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
        final String text = call.getString("text", "").trim();
        if (text.isEmpty() || !ttsReady || tts == null) {
            resolveSpoken(call, false);
            return;
        }

        final String localeTag = call.getString("locale", "en-GB");
        final String voiceName = call.getString("voice", "");
        final String utteranceId = UUID.randomUUID().toString();
        final AtomicBoolean finished = new AtomicBoolean(false);

        main.post(() -> {
            if (!ttsReady || tts == null) {
                resolveSpoken(call, false);
                return;
            }

            Locale locale = Locale.forLanguageTag(localeTag);
            int languageStatus = tts.setLanguage(locale);
            // A phone without the British voice still speaks English rather than staying silent.
            if (languageStatus == TextToSpeech.LANG_MISSING_DATA ||
                languageStatus == TextToSpeech.LANG_NOT_SUPPORTED) {
                languageStatus = tts.setLanguage(Locale.ENGLISH);
            }
            if (languageStatus == TextToSpeech.LANG_MISSING_DATA ||
                languageStatus == TextToSpeech.LANG_NOT_SUPPORTED) {
                resolveSpoken(call, false);
                return;
            }

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

            tts.stop();
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                private void finish(boolean spoken) {
                    if (!finished.compareAndSet(false, true)) return;
                    resolveSpoken(call, spoken);
                }

                @Override public void onStart(String id) {}

                @Override
                public void onDone(String id) {
                    if (utteranceId.equals(id)) finish(true);
                }

                @Override
                public void onError(String id) {
                    if (utteranceId.equals(id)) finish(false);
                }

                @Override
                public void onStop(String id, boolean interrupted) {
                    if (utteranceId.equals(id)) finish(false);
                }
            });

            int status = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
            if (status == TextToSpeech.ERROR && finished.compareAndSet(false, true)) {
                resolveSpoken(call, false);
            }
        });
    }

    private void resolveSpoken(PluginCall call, boolean spoken) {
        JSObject result = new JSObject();
        result.put("spoken", spoken);
        main.post(() -> call.resolve(result));
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        main.post(() -> {
            if (tts != null) tts.stop();
            call.resolve();
        });
    }

    @PluginMethod
    public void startRecognition(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("started", false);
            call.resolve(result);
            emitError("permission");
            return;
        }

        final String language = call.getString("language", "en-GB");
        main.post(() -> {
            if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                JSObject result = new JSObject();
                result.put("started", false);
                call.resolve(result);
                emitError("recognition");
                return;
            }

            destroyRecognizer();
            try {
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(this);

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false);

                recognitionLive = true;
                recognizer.startListening(intent);
                emitStatus("listening");

                JSObject result = new JSObject();
                result.put("started", true);
                result.put("language", language);
                call.resolve(result);
            } catch (Exception error) {
                recognitionLive = false;
                destroyRecognizer();
                JSObject result = new JSObject();
                result.put("started", false);
                call.resolve(result);
                emitError("recognition");
            }
        });
    }

    @PluginMethod
    public void stopRecognition(PluginCall call) {
        main.post(() -> {
            recognitionLive = false;
            if (recognizer != null) {
                try { recognizer.cancel(); } catch (Exception ignored) {}
            }
            destroyRecognizer();
            emitStatus("stopped");
            call.resolve();
        });
    }

    @Override
    public void onReadyForSpeech(Bundle params) {
        emitStatus("ready");
    }

    @Override
    public void onBeginningOfSpeech() {
        emitStatus("speech");
    }

    @Override
    public void onRmsChanged(float rmsdB) {}

    @Override
    public void onBufferReceived(byte[] buffer) {}

    @Override
    public void onEndOfSpeech() {
        emitStatus("processing");
    }

    @Override
    public void onError(int error) {
        if (!recognitionLive && error == SpeechRecognizer.ERROR_CLIENT) return;
        recognitionLive = false;
        emitError(mapError(error));
        emitStatus("end");
        main.post(this::destroyRecognizer);
    }

    @Override
    public void onResults(Bundle results) {
        recognitionLive = false;
        ArrayList<String> matches = results == null
            ? null
            : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);

        if (matches == null || matches.isEmpty()) {
            emitError("no-speech");
            emitStatus("end");
            main.post(this::destroyRecognizer);
            return;
        }

        JSArray alternatives = new JSArray();
        List<String> clean = new ArrayList<>();
        for (String value : matches) {
            String text = value == null ? "" : value.trim();
            if (text.isEmpty() || clean.contains(text)) continue;
            clean.add(text);
            alternatives.put(text);
            if (clean.size() >= 3) break;
        }

        if (clean.isEmpty()) {
            emitError("no-speech");
        } else {
            JSObject event = new JSObject();
            event.put("text", clean.get(0));
            event.put("alternatives", alternatives);
            notifyListeners("speechResult", event);
        }

        emitStatus("end");
        main.post(this::destroyRecognizer);
    }

    @Override
    public void onPartialResults(Bundle partialResults) {}

    @Override
    public void onEvent(int eventType, Bundle params) {}

    private String mapError(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "permission";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "no-speech";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "network";
            case SpeechRecognizer.ERROR_CLIENT:
                return "aborted";
            default:
                return "recognition";
        }
    }

    private void emitError(String error) {
        JSObject event = new JSObject();
        event.put("error", error);
        notifyListeners("speechError", event);
    }

    private void emitStatus(String status) {
        JSObject event = new JSObject();
        event.put("status", status);
        notifyListeners("speechStatus", event);
    }

    private void destroyRecognizer() {
        if (recognizer == null) return;
        try { recognizer.destroy(); } catch (Exception ignored) {}
        recognizer = null;
    }

    @Override
    protected void handleOnDestroy() {
        recognitionLive = false;
        main.post(this::destroyRecognizer);
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception ignored) {}
            tts = null;
        }
    }
}
