package com.uta.songlearning;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Android 入口：由 Capacitor 在应用内显示 UTA 网页界面。
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 把 Android 的局域网服务发现能力交给手机页面使用。
        registerPlugin(TransferDiscoveryPlugin.class);
        // 将 AI Key 交给 Android Keystore 加密保存，不写入网页本地存储。
        registerPlugin(AiCredentialPlugin.class);
        // 云备份使用原生 WebDAV，绕过网页跨域限制并分块传输音频。
        registerPlugin(WebDavPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
