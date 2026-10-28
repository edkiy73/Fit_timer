package ru.feture.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // In-app updates of the direct APK (src/fe/app-update.tsx). App Links arrive through @capacitor/app.
        registerPlugin(FetUreUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
