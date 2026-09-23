package ru.fittimer.app;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

@CapacitorPlugin(name = "FitBiometric")
public class FitBiometricPlugin extends Plugin {
    private static String reasonForStatus(int status) {
        if (status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) return "not_enrolled";
        if (status == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE) return "temporarily_unavailable";
        if (status == BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED) return "temporarily_unavailable";
        return "unsupported";
    }

    @PluginMethod
    public void status(PluginCall call) {
        int status = BiometricManager.from(getContext())
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
        JSObject result = new JSObject();
        result.put("available", status == BiometricManager.BIOMETRIC_SUCCESS);
        result.put("reason", status == BiometricManager.BIOMETRIC_SUCCESS ? "" : reasonForStatus(status));
        call.resolve(result);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        if (!(getActivity() instanceof FragmentActivity)) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("error", "unsupported");
            call.resolve(result);
            return;
        }

        int status = BiometricManager.from(getContext())
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
        if (status != BiometricManager.BIOMETRIC_SUCCESS) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("error", reasonForStatus(status));
            call.resolve(result);
            return;
        }

        FragmentActivity activity = (FragmentActivity) getActivity();
        Executor executor = ContextCompat.getMainExecutor(getContext());
        activity.runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(activity, executor,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult authResult) {
                        JSObject result = new JSObject();
                        result.put("ok", true);
                        call.resolve(result);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errString) {
                        JSObject result = new JSObject();
                        result.put("ok", false);
                        boolean cancelled = errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                            || errorCode == BiometricPrompt.ERROR_USER_CANCELED
                            || errorCode == BiometricPrompt.ERROR_CANCELED;
                        if (cancelled) {
                            result.put("error", "cancelled");
                        } else if (errorCode == BiometricPrompt.ERROR_LOCKOUT
                            || errorCode == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) {
                            result.put("error", "lockout");
                        } else {
                            result.put("error", "temporarily_unavailable");
                        }
                        call.resolve(result);
                    }
                });

            String title = call.getString("title", "Fit Timer");
            String reason = call.getString("reason", "");
            String cancelText = call.getString("cancelText", "Cancel");
            BiometricPrompt.PromptInfo.Builder builder = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                .setNegativeButtonText(cancelText);
            if (reason != null && !reason.isEmpty()) builder.setSubtitle(reason);
            prompt.authenticate(builder.build());
        });
    }
}
