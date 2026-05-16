package xyz.scooom.pkr;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this); // declare edge-to-edge before Capacitor initializes the WebView
        super.onCreate(savedInstanceState);
    }
}
