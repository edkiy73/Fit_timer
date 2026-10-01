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
        // Draw edge-to-edge under transparent system bars. The web layer keeps safe-area spacing
        // but does not paint a separate status-bar strip.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }
}
