package ru.fittimer.app;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;

/**
 * Замена org.vosk.android.SpeechService с автоусилением (VoiceAutoGain).
 *
 * Библиотечный SpeechService читает микрофон источником VOICE_RECOGNITION
 * (Android выключает в нём AGC) и отдаёт сигнал в Vosk как есть — речь с
 * пары метров доходит до модели слишком тихой. Здесь тот же источник, та же
 * частота и тот же размер буфера (0,2 с), тот же порядок колбэков
 * RecognitionListener на главном потоке — отличается только уровень сигнала.
 *
 * В отличие от SpeechService, Recognizer закрывается вместе с захватом: раньше
 * каждый перезапуск распознавания оставлял нативный Recognizer висеть в памяти.
 */
final class FitSpeechCapture {
    private final Recognizer recognizer;
    private final AudioRecord recorder;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Thread thread;
    private volatile boolean running = false;
    private volatile boolean shutdownRequested = false;
    private final AtomicBoolean released = new AtomicBoolean(false);
    // До этого момента (System.currentTimeMillis) микрофон слушает, но звук в
    // распознаватель не идёт: приложение само говорит (см. holdFor).
    private volatile long holdUntilMs = 0L;

    FitSpeechCapture(Recognizer recognizer) throws IOException {
        this.recognizer = recognizer;
        int minBytes = AudioRecord.getMinBufferSize(VoiceAutoGain.SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        // запас в два кадра: чтение не должно терять звук, пока Vosk декодирует
        int bytes = Math.max(minBytes, VoiceAutoGain.FRAME_SAMPLES * 2 * 2);
        AudioRecord rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,
            VoiceAutoGain.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bytes);
        if (rec.getState() != AudioRecord.STATE_INITIALIZED) {
            rec.release();
            throw new IOException("Failed to initialize recorder. Microphone might be already in use.");
        }
        this.recorder = rec;
    }

    /**
     * Не слушать ms миллисекунд. Озвучка приложения («Пауза», «Осталось 15
     * секунд») иначе попадает в микрофон и через ~0,5 с возвращается итоговым
     * результатом — уже после того, как JS перестал считать её своим звуком:
     * нажатая «продолжить» снова ставилась на паузу, «осталось…» листало шаг.
     */
    void holdFor(long ms) {
        holdUntilMs = System.currentTimeMillis() + Math.max(0L, ms);
    }

    void startListening(final RecognitionListener listener) {
        if (thread != null) return;
        running = true;
        thread = new Thread(() -> loop(listener), "FitSpeechCapture");
        thread.start();
    }

    private void loop(final RecognitionListener listener) {
        try {
            capture(listener);
        } finally {
            // Поток мог не успеть выйти за время ожидания в shutdown(): тогда
            // микрофон и нативный Recognizer освобождает он сам, а не главный
            // поток — иначе закрытие распознавателя посреди acceptWaveForm роняет
            // приложение.
            if (shutdownRequested) releaseResources();
        }
    }

    private void capture(final RecognitionListener listener) {
        try {
            recorder.startRecording();
        } catch (IllegalStateException e) {
            post(() -> listener.onError(new IOException("Failed to start recording", e)));
            return;
        }
        if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
            try { recorder.stop(); } catch (IllegalStateException ignored) {}
            post(() -> listener.onError(new IOException("Failed to start recording. Microphone might be already in use.")));
            return;
        }
        VoiceAutoGain agc = new VoiceAutoGain(VoiceAutoGain.SAMPLE_RATE, VoiceAutoGain.FRAME_SAMPLES);
        short[] buf = new short[VoiceAutoGain.FRAME_SAMPLES];
        boolean held = false;
        while (running && !Thread.currentThread().isInterrupted()) {
            int n = recorder.read(buf, 0, buf.length);
            if (!running) break;
            if (n < 0) {
                final int code = n;
                post(() -> listener.onError(new IOException("error reading audio buffer: " + code)));
                break;
            }
            if (n == 0) continue;
            if (System.currentTimeMillis() < holdUntilMs) {
                // микрофон всё равно читаем — иначе буфер записи копит звук
                // приложения и отдаст его сразу после паузы
                held = true;
                continue;
            }
            if (held) {
                // начало фразы приложения могло попасть в декодер до паузы — забываем его
                held = false;
                recognizer.reset();
            }
            agc.process(buf, n);
            if (recognizer.acceptWaveForm(buf, n)) {
                final String result = recognizer.getResult();
                post(() -> listener.onResult(result));
            } else {
                final String partial = recognizer.getPartialResult();
                post(() -> listener.onPartialResult(partial));
            }
        }
        try { recorder.stop(); } catch (IllegalStateException ignored) {}
    }

    // Колбэк, дошедший до главного потока уже после остановки, выбрасываем:
    // иначе «хвост» старой сессии мог сработать командой в только что
    // запущенной новой.
    private void post(Runnable r) {
        main.post(() -> { if (running) r.run(); });
    }

    /** Остановить без финального результата — как SpeechService.cancel().
     *  Возвращает true, если поток захвата уже завершился. */
    boolean cancel() {
        running = false;
        Thread t = thread;
        if (t == null) return true;
        t.interrupt();
        // read() отдаёт буфер не позже чем через 0,2 с — секунды хватает с запасом
        try { t.join(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        return !t.isAlive();
    }

    /** Освободить микрофон и нативный Recognizer. */
    void shutdown() {
        shutdownRequested = true;
        // если поток ещё жив, он освободит ресурсы сам на выходе (см. loop)
        if (cancel()) releaseResources();
    }

    private void releaseResources() {
        if (!released.compareAndSet(false, true)) return;
        try { recorder.release(); } catch (Exception ignored) {}
        try { recognizer.close(); } catch (Exception ignored) {}
    }
}
