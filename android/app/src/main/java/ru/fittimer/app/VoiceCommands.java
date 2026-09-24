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

    private static boolean in(String t, String[] list) {
        for (String s : list) if (s.equals(t)) return true;
        return false;
    }

    private static void addAll(List<String> out, String[] list) {
        for (String s : list) out.add(s);
    }
}
