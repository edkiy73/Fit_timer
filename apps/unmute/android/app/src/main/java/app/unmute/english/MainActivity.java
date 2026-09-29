package app.unmute.english;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UnMuteAudioPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
