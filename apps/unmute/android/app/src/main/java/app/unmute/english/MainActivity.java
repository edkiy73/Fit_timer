package app.unmute.english;

import android.graphics.Color;
import android.os.Bundle;
import android.content.res.Configuration;
import androidx.core.view.WindowCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(UnMuteAudioPlugin.class);
        registerPlugin(UnMuteUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        // Draw edge-to-edge under transparent system bars. The web layer keeps safe-area spacing
        // but does not paint a separate status-bar strip.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        applySystemFontScale();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applySystemFontScale();
    }

    private void applySystemFontScale() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        float scale = getResources().getConfiguration().fontScale;
        int zoom = Math.max(85, Math.min(200, Math.round(scale * 100f)));
        getBridge().getWebView().getSettings().setTextZoom(zoom);
    }
}
