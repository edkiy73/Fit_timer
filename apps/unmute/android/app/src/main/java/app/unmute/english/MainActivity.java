package app.unmute.english;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UnMuteAudioPlugin.class);
        registerPlugin(UnMuteUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        // Draw the app under the status and navigation bars on every Android version (15+ does it
        // anyway): the page paints that strip in the theme's colour and keeps the clock readable.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }
}
