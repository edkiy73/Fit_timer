package ru.feture.app;

import android.content.res.Configuration;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // In-app updates of the direct APK (src/fe/app-update.tsx). App Links arrive through @capacitor/app.
        registerPlugin(FetUreUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        barIcons();
    }

    @Override
    public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        barIcons();
    }

    /** The page follows the system theme, so the clock and icons of the status and navigation bars must too:
     * dark icons on the light page, light icons on the dark one. */
    private void barIcons() {
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        androidx.core.view.WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setAppearanceLightStatusBars(!night);
        c.setAppearanceLightNavigationBars(!night);
    }
}
