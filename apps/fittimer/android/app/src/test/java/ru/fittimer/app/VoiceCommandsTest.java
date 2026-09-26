package ru.fittimer.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;

import org.junit.Test;

public class VoiceCommandsTest {

    @Test
    public void grammarListsCommandsAndUnknown() {
        String ru = VoiceCommands.grammarJson("ru");
        assertTrue(ru.startsWith("[") && ru.endsWith("]"));
        assertTrue(ru.contains("\"готово\""));
        assertTrue(ru.contains("\"на паузу\""));
        assertTrue(ru.contains("\"продолжить\""));
        assertTrue("[unk] keeps random speech from being forced into a command", ru.contains("\"[unk]\""));
        String en = VoiceCommands.grammarJson("en");
        assertTrue(en.contains("\"done\"") && en.contains("\"[unk]\"") && !en.contains("готово"));
    }

    @Test
    public void allFormsOfReadyMeanNext() {
        for (String w : new String[]{"готово", "готов", "готова", "готовы", "Готово "}) {
            assertEquals(w, VoiceCommands.NEXT, VoiceCommands.kindFlexible(w));
        }
    }

    @Test
    public void unknownTokensAroundCommandAreIgnored() {
        assertEquals(VoiceCommands.NEXT, VoiceCommands.kindFlexible("[unk] готово"));
        assertEquals(VoiceCommands.PAUSE, VoiceCommands.kindFlexible("пауза [unk]"));
        assertEquals("", VoiceCommands.kindFlexible("[unk]"));
        assertEquals("", VoiceCommands.kindFlexible("[unk] [unk]"));
    }

    @Test
    public void repeatedCommandCountsOnce() {
        assertEquals(VoiceCommands.NEXT, VoiceCommands.kindFlexible("готово готово"));
        assertEquals(VoiceCommands.PAUSE, VoiceCommands.kindFlexible("стоп стоп"));
        assertEquals("trailing filler after a command still works", VoiceCommands.NEXT, VoiceCommands.kindFlexible("готово да"));
    }

    @Test
    public void conflictingOrPartialWordsAreNotCommands() {
        assertEquals("mixed commands are ambiguous", "", VoiceCommands.kindFlexible("готово стоп"));
        assertEquals("", VoiceCommands.kindFlexible("го"));
        assertEquals("", VoiceCommands.kindFlexible("про"));
        assertEquals("", VoiceCommands.kindFlexible("ну как дела"));
    }

    @Test
    public void multiWordPhrasesKeepTheirMeaning() {
        assertEquals(VoiceCommands.RESUME, VoiceCommands.kindFlexible("дальше пошли"));
        assertEquals(VoiceCommands.PAUSE, VoiceCommands.kindFlexible("поставь на паузу"));
        assertEquals(VoiceCommands.RESUME, VoiceCommands.kindFlexible("keep going"));
    }

    private static List<VoiceCommands.Word> words(Object... triples) {
        VoiceCommands.Word[] out = new VoiceCommands.Word[triples.length / 3];
        for (int i = 0; i < out.length; i++) {
            out[i] = new VoiceCommands.Word((String) triples[i * 3],
                ((Number) triples[i * 3 + 1]).doubleValue(), ((Number) triples[i * 3 + 2]).doubleValue());
        }
        return Arrays.asList(out);
    }

    @Test
    public void commandInsideRunningSpeechIsForeign() {
        // «мы пошли дальше» из телевизора приходит со словарём как «[unk] [unk] дальше»
        assertTrue(VoiceCommands.hasForeignSpeech("[unk] [unk] дальше",
            words("[unk]", 0.0, 0.2, "[unk]", 0.25, 0.5, "дальше", 0.55, 0.9)));
        assertTrue("one long foreign word is speech too", VoiceCommands.hasForeignSpeech("[unk] готово",
            words("[unk]", 0.0, 0.8, "готово", 0.85, 1.2)));
        assertTrue("without timings the text still counts", VoiceCommands.hasForeignSpeech("[unk] дальше [unk]", null));
        assertTrue("free-speech mode", VoiceCommands.hasForeignSpeech("ну давай дальше", null));
    }

    @Test
    public void breathOrKnockBeforeCommandIsNotSpeech() {
        assertFalse(VoiceCommands.hasForeignSpeech("[unk] готово",
            words("[unk]", 0.0, 0.25, "готово", 0.3, 0.7)));
        assertFalse(VoiceCommands.hasForeignSpeech("готово", words("готово", 0.0, 0.4)));
        assertFalse("multi-word commands are not foreign", VoiceCommands.hasForeignSpeech("поставь на паузу",
            words("поставь", 0.0, 0.3, "на", 0.3, 0.4, "паузу", 0.4, 0.8)));
        assertFalse(VoiceCommands.hasForeignSpeech("готово да", words("готово", 0.0, 0.4, "да", 0.45, 0.6)));
        assertFalse(VoiceCommands.hasForeignSpeech("[unk]", words("[unk]", 0.0, 0.3)));
    }

    @Test
    public void commandRightAfterSpeechIsTooSoon() {
        long foreign = 10_000L;
        assertFalse("nothing heard before", VoiceCommands.tooSoonAfterSpeech(foreign, 0.4, 0L));
        // 0.4 с команды, итог пришёл через 0.7 с после итога чужой речи → пауза 0.3 с
        assertTrue(VoiceCommands.tooSoonAfterSpeech(foreign + 700, 0.4, foreign));
        // пауза больше секунды — это отдельная команда
        assertFalse(VoiceCommands.tooSoonAfterSpeech(foreign + 1500, 0.4, foreign));
    }
}
