package com.silvershadow.pkr;

import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebView;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Returns the WebView managed by Capacitor.
     *
     * The bridge can briefly be null during startup or shutdown,
     * so all lifecycle calls must be guarded.
     */
    private WebView getCapacitorWebView() {
        if (getBridge() == null) {
            return null;
        }

        return getBridge().getWebView();
    }

    /**
     * Called when the application loses foreground control,
     * including app switching and locking the phone.
     */
    @Override
    public void onPause() {
        super.onPause();

        WebView webView = getCapacitorWebView();

        if (webView == null) {
            return;
        }

        /*
         * Mute the WebView at the native Chromium level.
         * This is stronger than relying on JavaScript visibility events.
         */
        if (
            WebViewFeature.isFeatureSupported(
                WebViewFeature.MUTE_AUDIO
            )
        ) {
            WebViewCompat.setAudioMuted(webView, true);
        }

        /*
         * Suspend WebView processing and JavaScript timers while
         * the application is in the background.
         */
        webView.onPause();
        webView.pauseTimers();
    }

    /**
     * Called when the application returns to the foreground.
     */
    @Override
    public void onResume() {
        super.onResume();

        WebView webView = getCapacitorWebView();

        if (webView == null) {
            return;
        }

        /*
         * Restore WebView processing before unmuting it.
         */
        webView.resumeTimers();
        webView.onResume();

        if (
            WebViewFeature.isFeatureSupported(
                WebViewFeature.MUTE_AUDIO
            )
        ) {
            WebViewCompat.setAudioMuted(webView, false);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);

        if (hasFocus) {
            hideSystemUI();
        }
    }

    private void hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller =
                getWindow().getInsetsController();

            if (controller != null) {
                controller.hide(
                    WindowInsets.Type.statusBars()
                        | WindowInsets.Type.navigationBars()
                );

                controller.setSystemBarsBehavior(
                    WindowInsetsController
                        .BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            //noinspection deprecation
            getWindow()
                .getDecorView()
                .setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                );
        }
    }
}
