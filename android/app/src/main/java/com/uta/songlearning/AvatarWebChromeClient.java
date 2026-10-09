package com.uta.songlearning;

import android.content.Intent;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Arrays;
import java.util.HashSet;

// 保留 Capacitor 的其他 WebView 行为，仅处理头像控件的单张图片选择。
public final class AvatarWebChromeClient extends BridgeWebChromeClient {
    private final Bridge bridge;
    private final ActivityResultLauncher<Intent> picker;
    private ValueCallback<Uri[]> pending;
    private static final long MAX_BYTES = 10L * 1024 * 1024;

    public AvatarWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        picker = bridge.registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            final ValueCallback<Uri[]> callback = pending;
            pending = null;
            if (callback == null) return;
            Uri[] selected = FileChooserParams.parseResult(result.getResultCode(), result.getData());
            if (selected == null || selected.length == 0) {
                callback.onReceiveValue(null);
                return;
            }
            // 在后台流式复制原始字节，保留 GIF 动画；不阻塞页面，也不申请相册全量访问权限。
            new Thread(() -> {
                File copy = null;
                try {
                    File directory = new File(bridge.getActivity().getCacheDir(), "uta-avatar-picker");
                    if (!directory.isDirectory() && !directory.mkdirs()) throw new java.io.IOException("缓存不可用");
                    // 清理本控件上次留下的缓存；上一张头像已由页面复制到内存或保存到 IndexedDB。
                    File[] previous = directory.listFiles();
                    if (previous != null) for (File file : previous) if (file.isFile()) file.delete();
                    String type = bridge.getActivity().getContentResolver().getType(selected[0]);
                    String extension = "image/gif".equals(type) ? ".gif" : "image/png".equals(type) ? ".png" : "image/webp".equals(type) ? ".webp" : ".jpg";
                    // 每次返回独立文件路径，避免 WebView 复用相册 URI 的旧文件元数据。
                    copy = File.createTempFile("avatar-", extension, directory);
                    try (InputStream input = bridge.getActivity().getContentResolver().openInputStream(selected[0]);
                         FileOutputStream output = new FileOutputStream(copy)) {
                        if (input == null) throw new java.io.IOException("图片无法读取");
                        byte[] buffer = new byte[64 * 1024];
                        long total = 0;
                        int count;
                        while ((count = input.read(buffer)) != -1) {
                            total += count;
                            if (total > MAX_BYTES) throw new java.io.IOException("头像文件不能超过 10 MB。");
                            output.write(buffer, 0, count);
                        }
                        if (total == 0) throw new java.io.IOException("图片文件为空，请重新选择原始图片。");
                    }
                    Uri cached = FileProvider.getUriForFile(bridge.getActivity(), bridge.getActivity().getPackageName() + ".fileprovider", copy);
                    bridge.getActivity().runOnUiThread(() -> callback.onReceiveValue(new Uri[]{cached}));
                } catch (Exception failure) {
                    if (copy != null) copy.delete();
                    String message = failure.getMessage();
                    String error = message != null && (message.contains("10 MB") || message.contains("图片文件为空"))
                        ? message : "无法读取相册图片，请重新选择本机的原始图片文件。";
                    bridge.getActivity().runOnUiThread(() -> {
                        callback.onReceiveValue(null);
                        // 原生复制失败也显示页面红色错误提示，避免选图后没有反馈。
                        bridge.getWebView().evaluateJavascript("window.dispatchEvent(new CustomEvent('uta:avatar-picker-error',{detail:" + org.json.JSONObject.quote(error) + "}))", null);
                    });
                }
            }, "uta-avatar-copy").start();
        });
    }

    @Override
    public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        // GIF 与另外三种格式同时允许，是头像输入框；歌曲、封面、备份仍交由原来的选择器处理。
        HashSet<String> types = new HashSet<>();
        for (String group : params.getAcceptTypes()) types.addAll(Arrays.asList(group.split(",")));
        HashSet<String> avatarTypes = new HashSet<>(Arrays.asList("image/jpeg", "image/png", "image/webp", "image/gif"));
        if (params.getMode() != FileChooserParams.MODE_OPEN || params.isCaptureEnabled() || !types.equals(avatarTypes)) {
            return super.onShowFileChooser(view, callback, params);
        }
        if (pending != null) pending.onReceiveValue(null);
        pending = callback;
        try {
            Intent intent = params.createIntent();
            intent.setType("image/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, avatarTypes.toArray(new String[0]));
            picker.launch(intent);
        } catch (Exception failure) {
            pending = null;
            callback.onReceiveValue(null);
            bridge.getWebView().evaluateJavascript("window.dispatchEvent(new CustomEvent('uta:avatar-picker-error',{detail:'无法打开图片选择器，请重试。'}))", null);
        }
        return true;
    }
}
