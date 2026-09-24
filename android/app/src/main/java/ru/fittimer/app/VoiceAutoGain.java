package ru.fittimer.app;

/**
 * Автоусиление микрофона перед офлайн-распознаванием команд.
 *
 * Vosk из коробки пишет звук источником VOICE_RECOGNITION, а в нём Android
 * по требованию CDD выключает любую обработку, включая AGC: сигнал идёт
 * «как есть». Обычная речь с полутора-двух метров (телефон лежит на полу
 * рядом с ковриком) приходит на уровне примерно −50…−60 dBFS, тогда как
 * маленькая модель Vosk обучена на близкой речи около −20…−25 dBFS. Отсюда
 * «приходится орать или говорить прямо в телефон». Системный распознаватель
 * Google подтягивает уровень сам, поэтому с ним такого не было.
 *
 * Здесь — простой AGC без зависимостей от Android (тестируется на JVM):
 *   • уровень шума отслеживается минимумом: быстро опускается, медленно
 *     поднимается — постоянный гул (вентилятор, музыка фоном) не считается речью;
 *   • громкая речь сбрасывает усиление почти сразу (атака), в паузах и на тихой
 *     речи оно плавно возвращается к максимуму (≈ 10 dB/с, полностью — за 2–3 с) —
 *     лязг гантели не «оглушает» распознавание на следующие команды;
 *   • работа стартует с максимального усиления: первая же тихая команда слышна;
 *   • потолок усиления двойной: не больше +24 dB и не больше, чем нужно, чтобы
 *     фоновый шум остался ниже ≈ −38 dBFS — иначе усиленный гул тихой комнаты
 *     модель начинает «слышать» как слова;
 *   • пиковый ограничитель — крик у самого телефона не превращается в клиппинг.
 */
final class VoiceAutoGain {
    static final int SAMPLE_RATE = 16000;
    /** 0,2 с — тот же размер буфера, что был у vosk SpeechService: меняется только
     *  уровень сигнала, а не ритм частичных результатов, к которому подстроена
     *  логика команд в FitAudioPlugin (considerPartialCommand). */
    static final int FRAME_SAMPLES = 3200;
    /** Уровень речи, на который обучены маленькие модели Vosk (≈ −21 dBFS RMS). */
    static final double TARGET_RMS = 2800.0;
    /** +24 dB: хватает на речь с 2–3 метров, но не превращает шорохи в речь. */
    static final double MAX_GAIN = 16.0;
    static final double MIN_GAIN = 1.0;
    /** Кадр считается речью, если он громче шума на ~8 dB. */
    static final double SPEECH_OVER_NOISE = 2.5;
    /** Ниже этого RMS даже «превышение над шумом» — это не голос, а шорох. */
    static final double MIN_SPEECH_RMS = 25.0;
    /** Пиковый предел после усиления — запас от клиппинга. */
    static final int PEAK_LIMIT = 30000;
    /** Фоновый шум после усиления не выше ≈ −38 dBFS: иначе в тихой комнате
     *  усиленный гул модель начинает «слышать» как слова. */
    static final double NOISE_CEIL_RMS = 400.0;

    private double gain = MAX_GAIN;      // сразу слышно тихую первую команду; шумовой потолок ниже урежет
    private double noiseRms = -1.0;
    private final double frameSec;

    VoiceAutoGain(int sampleRate, int frameSamples) {
        this.frameSec = Math.max(0.005, frameSamples / (double) Math.max(1, sampleRate));
    }

    double gain() { return gain; }
    double noiseRms() { return noiseRms; }

    /** Усиливает кадр на месте и возвращает применённое усиление. */
    double process(short[] buf, int len) {
        if (len <= 0) return gain;
        double sum = 0.0;
        int peak = 0;
        for (int i = 0; i < len; i++) {
            int s = buf[i];
            sum += (double) s * s;
            int a = s < 0 ? -s : s;
            if (a > peak) peak = a;
        }
        double rms = Math.sqrt(sum / len);

        // Шумовой пол: вниз — сразу, вверх — примерно на 3 dB за секунду,
        // так что фраза в пару секунд не успевает стать «шумом».
        if (noiseRms < 0) noiseRms = Math.max(1.0, rms);
        else if (rms < noiseRms) noiseRms = Math.max(1.0, rms);
        else noiseRms *= Math.pow(1.41, frameSec);

        boolean speech = rms > MIN_SPEECH_RMS && rms > noiseRms * SPEECH_OVER_NOISE;
        double wanted = speech ? clamp(TARGET_RMS / rms, MIN_GAIN, MAX_GAIN) : MAX_GAIN;
        if (wanted < gain) {
            // атака: громкая речь — подстраиваемся почти сразу
            gain = gain + (wanted - gain) * Math.min(1.0, frameSec / 0.05);
        } else {
            // отпускание: тихая речь или пауза — растём примерно на 10 dB в секунду
            gain = Math.min(wanted, gain * Math.pow(10.0, 0.5 * frameSec));
        }

        // Шум не поднимаем выше NOISE_CEIL_RMS. Ограничение общее для всех кадров
        // (пол меняется медленно), поэтому уровень не «скачет» между паузой и словом.
        gain = Math.min(gain, Math.max(MIN_GAIN, NOISE_CEIL_RMS / noiseRms));

        // Ограничитель по пику кадра: даже если усиление ещё не успело
        // опуститься, в распознаватель не уходит клиппинг.
        double applied = gain;
        if (peak > 0 && peak * applied > PEAK_LIMIT) applied = PEAK_LIMIT / (double) peak;
        if (applied > 0.999 && applied < 1.001) return applied;
        for (int i = 0; i < len; i++) {
            long v = Math.round(buf[i] * applied);
            if (v > Short.MAX_VALUE) v = Short.MAX_VALUE;
            else if (v < Short.MIN_VALUE) v = Short.MIN_VALUE;
            buf[i] = (short) v;
        }
        return applied;
    }

    private static double clamp(double v, double lo, double hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }
}
