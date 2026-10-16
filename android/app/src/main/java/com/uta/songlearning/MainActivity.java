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
        // 原生下载并校验更新包，提供系统安装器和其他安装方式选择。
        registerPlugin(AppUpdatePlugin.class);
        // 将耳机断开后即将外放的系统事件转给学习播放器。
        registerPlugin(AudioRoutePlugin.class);
        super.onCreate(savedInstanceState);
        // 头像选图先复制到应用缓存，避免三星相册重复选图时 WebView 读不到临时文件。
        bridge.getWebView().setWebChromeClient(new AvatarWebChromeClient(bridge));
    }
}
