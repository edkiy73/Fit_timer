package ru.fittimer.app;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Словарь голосовых команд тренировки и их разбор — без зависимостей от Android,
 * чтобы проверяться обычными JUnit-тестами (см. VoiceCommandsTest).
 *
 * Раньше Vosk распознавал СВОБОДНУЮ речь, а команда срабатывала, только если
 * вся фраза совпала с командой. Звук мог быть услышан нормально, но модель
 * записывала «готово» другим похожим словом — и человек повторял 3–5 раз.
 * Теперь распознаватель получает грамматику: только эти фразы плюс [unk]
 * («речь, но не команда»). Вопрос к модели меняется с «что сказано по-русски?»
 * на «какая из десятка команд — или ни одна?», а кашель и разговор уходят в
 * [unk], а не натягиваются на ближайшую команду.
 *
 * Списки фраз обязаны совпадать с наборами в applyVoiceCommand (80-platform.js):
 * там же они принимаются от Web Speech и от ручного ввода.
 */
final class VoiceCommands {
    static final String PAUSE = "pause";
    static final String RESUME = "resume";
    static final String NEXT = "next";
    static final String UNKNOWN = "[unk]";

    private static final String[] RU_PAUSE = {
        "пауза", "на паузу", "поставь на паузу", "стоп", "подожди", "остановись"
    };
    private static final String[] RU_RESUME = {
        "продолжить", "продолжай", "продолжаем", "продолжи", "можно продолжать", "поехали", "дальше пошли"
    };
    private static final String[] RU_NEXT = {
        "дальше", "готово", "готов", "готова", "готовы", "пропустить", "пропусти",
        "следующее", "следующий", "сделал", "закончил", "завершить"
    };
    private static final String[] EN_PAUSE = {"pause", "stop", "wait"};
    private static final String[] EN_RESUME = {"continue", "resume", "go on", "keep going"};
    private static final String[] EN_NEXT = {"next", "done", "skip", "finished"};

    private VoiceCommands() {}

    /** Грамматика Vosk для языка: JSON-массив фраз команд и [unk]. */
    static String grammarJson(String language) {
        List<String> phrases = new ArrayList<>();
        boolean en = "en".equals(language);
        addAll(phrases, en ? EN_PAUSE : RU_PAUSE);
        addAll(phrases, en ? EN_RESUME : RU_RESUME);
        addAll(phrases, en ? EN_NEXT : RU_NEXT);
        phrases.add(UNKNOWN);
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < phrases.size(); i++) {
            if (i > 0) out.append(',');
            out.append('"').append(phrases.get(i).replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        return out.append(']').toString();
    }

    /**
     * Текст гипотезы без служебных [unk] и лишних пробелов. «[unk] готово» —
     * это «готово», сказанное после постороннего звука, а не «не команда».
     */
    static String clean(String text) {
        if (text == null) return "";
        return text.toLowerCase(Locale.ROOT)
            .replace(UNKNOWN, " ")
            .trim()
            .replaceAll("\\s+", " ");
    }

    /** Точное совпадение фразы с командой. */
    static String kind(String text) {
        String t = clean(text);
        if (t.isEmpty()) return "";
        if (in(t, RU_PAUSE) || in(t, EN_PAUSE)) return PAUSE;
        if (in(t, RU_RESUME) || in(t, EN_RESUME)) return RESUME;
        if (in(t, RU_NEXT) || in(t, EN_NEXT)) return NEXT;
        return "";
    }

    /**
     * Команда с допуском: грамматические варианты («готова», «пропустим») и одна
     * и та же команда, сказанная дважды подряд («готово готово»). Основы длинные,
     * чтобы обрывки вроде «го» / «про» не проходили.
     */
    static String kindFlexible(String text) {
        String t = clean(text);
        String exact = kind(t);
        if (!exact.isEmpty()) return exact;
        String[] words = t.split(" ");
        if (words.length == 1) return stemKind(t);
        // Несколько слов: фраза начинается с команды («готово готово», «готово да»),
        // и ни одно другое слово не означает другую команду («готово стоп» —
        // непонятно, чего хотят, поэтому ничего не делаем).
        String first = stemKind(words[0]);
        if (first.isEmpty()) return "";
        for (int i = 1; i < words.length; i++) {
            String k = stemKind(words[i]);
            if (!k.isEmpty() && !k.equals(first)) return "";
        }
        return first;
    }

    private static String stemKind(String t) {
        String exact = kind(t);
        if (!exact.isEmpty()) return exact;
        if (t.length() >= 4 && (t.startsWith("пауз") || t.startsWith("останов"))) return PAUSE;
        if (t.length() >= 7 && t.startsWith("продолж")) return RESUME;
        if (t.length() >= 5 && t.startsWith("готов")) return NEXT;
        if (t.length() >= 6 && (t.startsWith("пропуст") || t.startsWith("следующ") || t.startsWith("закончил"))) return NEXT;
        if (t.length() >= 7 && t.startsWith("заверш")) return NEXT;

        if (t.length() >= 4 && ("pause".startsWith(t) || "stop".equals(t))) return PAUSE;
        if (t.length() >= 5 && ("continue".startsWith(t) || "resume".startsWith(t))) return RESUME;
        if (t.length() >= 4 && ("next".equals(t) || "done".equals(t) || "skip".equals(t))) return NEXT;
        return "";
    }

    /** Слово итоговой гипотезы Vosk со временем в секундах. */
    static final class Word {
        final String text;
        final double start;
        final double end;
        Word(String text, double start, double end) {
            this.text = text == null ? "" : text.toLowerCase(Locale.ROOT).trim();
            this.start = start;
            this.end = end;
        }
    }

    /**
     * Одиночный посторонний звук короче этого — вдох, выдох, кашель, стук
     * гантели. Он не делает фразу «разговором»: после подхода человек дышит
     * тяжело, и «[unk] готово» должно работать.
     */
    static final double NOISE_MAX_SEC = 0.4;
    /**
     * Сколько тишины нужно между посторонней речью и командой. Телевизор и
     * живой разговор идут сплошным потоком с паузами в доли секунды, а команду
     * человек говорит отдельно.
     */
    static final double QUIET_BEFORE_SEC = 0.6;

    /**
     * Во фразе есть посторонняя речь, а не просто звук: два и больше чужих
     * слова или одно, но длинное. Так выглядит «мы пошли дальше» из телевизора:
     * со словарём оно приходит как «[unk] [unk] дальше», и раньше [unk]
     * отбрасывались, а «дальше» срабатывало.
     */
    static boolean hasForeignSpeech(String text, List<Word> words) {
        int foreign = 0;
        double foreignSec = 0.0;
        if (words != null) {
            for (Word w : words) {
                if (w.text.isEmpty() || isCommandWord(w.text)) continue;
                foreign++;
                foreignSec += Math.max(0.0, w.end - w.start);
            }
        }
        // Слова со временем есть не всегда (и [unk] туда может не попасть) —
        // считаем чужие слова и по самому тексту.
        int foreignInText = 0;
        String t = text == null ? "" : text.toLowerCase(Locale.ROOT).trim();
        for (String part : t.split("\\s+")) {
            if (!part.isEmpty() && !isCommandWord(part)) foreignInText++;
        }
        return Math.max(foreign, foreignInText) >= 2 || foreignSec > NOISE_MAX_SEC;
    }

    /** Длительность фразы от начала первого слова до конца последнего. */
    static double spanSec(List<Word> words) {
        if (words == null || words.isEmpty()) return 0.0;
        return Math.max(0.0, words.get(words.size() - 1).end - words.get(0).start);
    }

    /**
     * Команда началась слишком скоро после посторонней речи — это продолжение
     * чужого разговора, а не обращение к приложению. Время считается по часам
     * итоговых результатов: у обеих фраз одинаковая задержка конца фразы, поэтому
     * начало текущей ≈ nowMs − её длительность.
     */
    static boolean tooSoonAfterSpeech(long nowMs, double commandSpanSec, long lastForeignSpeechMs) {
        if (lastForeignSpeechMs <= 0) return false;
        double gapSec = (nowMs - lastForeignSpeechMs) / 1000.0 - commandSpanSec;
        return gapSec < QUIET_BEFORE_SEC;
    }

    /** Слово входит в какую-нибудь команду (с теми же допусками, что kindFlexible). */
    private static boolean isCommandWord(String w) {
        if (!stemKind(w).isEmpty()) return true;
        for (String[] list : ALL) {
            for (String phrase : list) {
                for (String part : phrase.split(" ")) if (part.equals(w)) return true;
            }
        }
        return false;
    }

    private static final String[][] ALL = {RU_PAUSE, RU_RESUME, RU_NEXT, EN_PAUSE, EN_RESUME, EN_NEXT};

    private static boolean in(String t, String[] list) {
        for (String s : list) if (s.equals(t)) return true;
        return false;
    }

    private static void addAll(List<String> out, String[] list) {
        for (String s : list) out.add(s);
    }
}
