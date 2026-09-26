package ru.fittimer.app;

import static org.junit.Assert.assertTrue;

import java.util.Random;
import org.junit.Test;

/**
 * Синтетические сценарии для VoiceAutoGain: тихая речь с двух метров, крик у
 * самого телефона, тишина между командами и шумный зал. Речь — тон 300 Гц с
 * гармониками (для AGC важен только уровень), шум — белый.
 */
public class VoiceAutoGainTest {
    private static final int RATE = 16000;
    private static final int FRAME = VoiceAutoGain.FRAME_SAMPLES; // 200 мс — как в захвате звука

    private static short[] frame(Random rnd, double noiseRms, double speechRms, int offset) {
        short[] out = new short[FRAME];
        for (int i = 0; i < FRAME; i++) {
            double t = (offset + i) / (double) RATE;
            // 1.644 = 1 / RMS(0.7·sin + 0.5·sin): уровень речи ровно speechRms
            double speech = speechRms <= 0 ? 0
                : speechRms * 1.644 * (0.7 * Math.sin(2 * Math.PI * 300 * t) + 0.5 * Math.sin(2 * Math.PI * 900 * t));
            double noise = noiseRms * rnd.nextGaussian();
            long v = Math.round(speech + noise);
            out[i] = (short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, v));
        }
        return out;
    }

    private static double rms(short[] b) {
        double s = 0;
        for (short v : b) s += (double) v * v;
        return Math.sqrt(s / b.length);
    }

    private static int peak(short[] b) {
        int p = 0;
        for (short v : b) p = Math.max(p, Math.abs((int) v));
        return p;
    }

    /** Прогон: speechEvery кадров — фраза длиной speechLen кадров, остальное тишина. */
    private static double[] run(VoiceAutoGain agc, double noiseRms, double speechRms,
                                int frames, int speechEvery, int speechLen) {
        Random rnd = new Random(42);
        double lastSpeechOut = 0, lastNoiseOut = 0;
        int maxPeak = 0;
        for (int f = 0; f < frames; f++) {
            boolean speaking = (f % speechEvery) < speechLen;
            short[] b = frame(rnd, noiseRms, speaking ? speechRms : 0, f * FRAME);
            agc.process(b, b.length);
            maxPeak = Math.max(maxPeak, peak(b));
            if (speaking) lastSpeechOut = rms(b); else lastNoiseOut = rms(b);
        }
        return new double[]{lastSpeechOut, lastNoiseOut, maxPeak};
    }

    @Test
    public void quietDistantSpeechIsBroughtUpToRecognizerLevel() {
        // речь ≈ −52 dBFS с шумом комнаты ≈ −67 dBFS: раньше модель получала ровно это
        VoiceAutoGain agc = new VoiceAutoGain(RATE, FRAME);
        double[] r = run(agc, 15, 80, 100, 20, 6);
        assertTrue("speech out " + r[0] + " should be ≥ 1000 (≈ −30 dBFS)", r[0] >= 1000);
        assertTrue("noise out " + r[1] + " should stay ≤ 420", r[1] <= 420);
    }

    @Test
    public void shoutingCloseDoesNotClip() {
        VoiceAutoGain agc = new VoiceAutoGain(RATE, FRAME);
        double[] r = run(agc, 15, 9000, 60, 20, 6);
        assertTrue("peak " + r[2] + " must not clip", r[2] <= VoiceAutoGain.PEAK_LIMIT + 1);
        // громкая речь не усиливается: выход на уровне входа, а не «+24 dB»
        assertTrue("loud speech out " + r[0] + " should stay near input", r[0] <= 9000 * 1.25);
    }

    @Test
    public void silenceIsNotPumpedUpToSpeechLevel() {
        VoiceAutoGain agc = new VoiceAutoGain(RATE, FRAME);
        double[] r = run(agc, 20, 0, 100, 20, 0);
        assertTrue("noise out " + r[1] + " should stay ≤ 420", r[1] <= 420);
    }

    @Test
    public void firstQuietCommandIsAlreadyAudible() {
        // самая первая фраза после старта: подстраиваться ещё не по чему
        VoiceAutoGain agc = new VoiceAutoGain(RATE, FRAME);
        Random rnd = new Random(7);
        for (int f = 0; f < 10; f++) { short[] b = frame(rnd, 15, 0, f * FRAME); agc.process(b, b.length); }
        short[] word = frame(rnd, 15, 80, 10 * FRAME);
        agc.process(word, word.length);
        assertTrue("first quiet word out " + rms(word) + " should be ≥ 800", rms(word) >= 800);
    }

    @Test
    public void loudBangDoesNotDeafenNextCommands() {
        // лязг гантели → усиление падает; через 3 с тишины тихая команда снова слышна
        VoiceAutoGain agc = new VoiceAutoGain(RATE, FRAME);
        Random rnd = new Random(9);
        int f = 0;
        for (; f < 10; f++) { short[] b = frame(rnd, 15, 0, f * FRAME); agc.process(b, b.length); }
        for (int i = 0; i < 3; i++, f++) { short[] b = frame(rnd, 15, 12000, f * FRAME); agc.process(b, b.length); }
        assertTrue("gain after bang " + agc.gain() + " should drop", agc.gain() < 2);
        for (int i = 0; i < 30; i++, f++) { short[] b = frame(rnd, 15, 0, f * FRAME); agc.process(b, b.length); }
        short[] word = frame(rnd, 15, 80, f * FRAME);
        agc.process(word, word.length);
        assertTrue("quiet word after bang " + rms(word) + " should be ≥ 800", rms(word) >= 800);
    }

    @Test
    public void noisyGymKeepsGainLow() {
        // фоновая музыка/зал ≈ −40 dBFS, речь поверх ≈ −27 dBFS: усиливать почти нечего
        VoiceAutoGain agc = new VoiceAutoGain(RATE, FRAME);
        double[] r = run(agc, 300, 1500, 100, 20, 6);
        assertTrue("gain " + agc.gain() + " should stay small in noise", agc.gain() <= 1.6);
        assertTrue("speech out " + r[0] + " should not be reduced below input", r[0] >= 1400);
    }
}
