package ru.fittimer.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

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
}
