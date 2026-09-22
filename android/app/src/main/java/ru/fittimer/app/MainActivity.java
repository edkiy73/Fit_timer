package ru.fittimer.app;

import android.os.Bundle;
import android.content.res.Configuration;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FitAudioPlugin.class);
        registerPlugin(FitSystemPlugin.class);
        super.onCreate(savedInstanceState);
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
