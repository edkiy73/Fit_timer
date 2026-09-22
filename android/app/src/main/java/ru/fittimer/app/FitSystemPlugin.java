package ru.fittimer.app;

import android.graphics.Color;
import android.content.Intent;
import android.net.Uri;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

@CapacitorPlugin(name = "FitSystem")
public class FitSystemPlugin extends Plugin {
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equals("https") || scheme.equals("http") || scheme.equals("market"))) {
                call.reject("unsupported_url");
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("open_failed", e);
        }
    }

    @PluginMethod
    public void requestReview(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                ReviewManager manager = ReviewManagerFactory.create(getContext());
                manager.requestReviewFlow().addOnCompleteListener(requestTask -> {
                    if (!requestTask.isSuccessful()) {
                        call.reject("review_unavailable", requestTask.getException());
                        return;
                    }
                    ReviewInfo reviewInfo = requestTask.getResult();
                    manager.launchReviewFlow(getActivity(), reviewInfo).addOnCompleteListener(flowTask -> {
                        call.resolve();
                    });
                });
            } catch (Exception e) {
                call.reject("review_failed", e);
            }
        });
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        final boolean light = call.getBoolean("light", true);
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(light);
            controller.setAppearanceLightNavigationBars(light);
            JSObject result = new JSObject();
            result.put("light", light);
            call.resolve(result);
        });
    }
}
