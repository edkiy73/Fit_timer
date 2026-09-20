package ru.fittimer.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FitAudioPlugin.class);
        registerPlugin(FitSystemPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
