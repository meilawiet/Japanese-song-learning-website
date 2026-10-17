// 上半部分注释保留旧 QQ WebView 方案；下半部分为当前随机访客身份和系统相册接入。
// package com.uta.songlearning;
//
// import android.content.Intent;
// import android.graphics.Color;
// import android.net.Uri;
// import android.os.Bundle;
// import android.view.View;
// import android.webkit.ValueCallback;
// import android.webkit.WebChromeClient;
// import android.webkit.WebResourceError;
// import android.webkit.WebResourceRequest;
// import android.webkit.WebResourceResponse;
// import android.webkit.WebSettings;
// import android.webkit.WebView;
// import android.webkit.WebViewClient;
// import android.widget.ProgressBar;
// import android.widget.Toast;
// import androidx.activity.OnBackPressedCallback;
// import androidx.activity.result.ActivityResultLauncher;
// import androidx.activity.result.contract.ActivityResultContracts;
// import androidx.appcompat.app.AppCompatActivity;
// import androidx.core.graphics.Insets;
// import androidx.core.view.ViewCompat;
// import androidx.core.view.WindowCompat;
// import androidx.core.view.WindowInsetsCompat;
// import java.util.ArrayList;
//
// // 第三方反馈页使用独立 WebView，不继承 Capacitor 的本机插件桥；文件只由用户经系统选择器提供。
// public final class FeedbackActivity extends AppCompatActivity {
//     public static final String START_URL = "https://support.qq.com/product/802246";
//     private static final String QQ_PACKAGE = "com.tencent.mobileqq";
//     private static final String QQ_RETURN_URL = "utafeedback://return";
//     private WebView webView;
//     private View errorView;
//     private ProgressBar progress;
//     private ValueCallback<Uri[]> pendingFiles;
//     private boolean mainFrameFailed;
//     private final ActivityResultLauncher<Intent> picker = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
//         ValueCallback<Uri[]> callback = pendingFiles;
//         pendingFiles = null;
//         if (callback == null) return;
//         Uri[] selected = WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData());
//         ArrayList<Uri> readable = new ArrayList<>();
//         if (selected != null) for (Uri uri : selected) {
//             // 不接受文件路径或回指本应用缓存的 URI，避免第三方文件提供者冒充用户所选文件。
//             if ("content".equals(uri.getScheme()) && !(getPackageName() + ".fileprovider").equals(uri.getAuthority())) readable.add(uri);
//         }
//         callback.onReceiveValue(readable.isEmpty() ? null : readable.toArray(new Uri[0]));
//     });
//
//     @Override public void onCreate(Bundle savedInstanceState) {
//         super.onCreate(savedInstanceState);
//         WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
//         // 与反馈工具栏保持同一底色，状态栏文字由下方 insets 控制器设为深色。
//         getWindow().setStatusBarColor(Color.WHITE);
//         getWindow().setNavigationBarColor(Color.WHITE);
//         setContentView(R.layout.activity_feedback);
//         View root = findViewById(R.id.feedback_root);
//         // 页面避开状态栏、导航手势与软键盘，输入反馈时保留完整可用高度。
//         ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
//             Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
//             int bottom = Math.max(bars.bottom, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom);
//             view.setPadding(bars.left, bars.top, bars.right, bottom);
//             return insets;
//         });
//         WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightStatusBars(true);
//         WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightNavigationBars(true);
//         ViewCompat.requestApplyInsets(root);
//         webView = findViewById(R.id.feedback_webview);
//         errorView = findViewById(R.id.feedback_error);
//         progress = findViewById(R.id.feedback_progress);
//         WebSettings settings = webView.getSettings();
//         settings.setJavaScriptEnabled(true);
//         settings.setDomStorageEnabled(true);
//         settings.setAllowFileAccess(false);
//         settings.setAllowContentAccess(true);
//         settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
//         webView.setBackgroundColor(Color.WHITE);
//         webView.setWebViewClient(new WebViewClient() {
//             @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
//                 Uri uri = request.getUrl();
//                 // 原来全部拦截非 HTTPS，QQ 一键登录因未能唤起客户端而误报“请安装最新版本”。
//                 // 仅接收 QQ 官方登录页发起的固定登录协议，显式交给 QQ，不解析任意 intent://。
//                 if (openQqLogin(view, uri)) return true;
//                 // 兔小巢登录与页面跳转继续在应用内处理，其他 file/content/intent 等协议仍禁止导航。
//                 if ("https".equals(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null) return false;
//                 if (request.isForMainFrame()) Toast.makeText(FeedbackActivity.this, "请使用页面内的网页入口继续。", Toast.LENGTH_SHORT).show();
//                 return true;
//             }
//             @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
//                 mainFrameFailed = false; progress.setVisibility(View.VISIBLE);
//             }
//             @Override public void onPageFinished(WebView view, String url) { progress.setVisibility(View.GONE); }
//             @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
//                 if (request.isForMainFrame()) showError();
//             }
//             @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
//                 if (request.isForMainFrame() && response.getStatusCode() >= 400) showError();
//             }
//         });
//         webView.setWebChromeClient(new WebChromeClient() {
//             @Override public void onProgressChanged(WebView view, int value) {
//                 progress.setProgress(value);
//                 if (value == 100 || mainFrameFailed) progress.setVisibility(View.GONE);
//             }
//             @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
//                 if (pendingFiles != null) pendingFiles.onReceiveValue(null);
//                 pendingFiles = callback;
//                 // 同时支持网页声明的图片/视频 MIME 及多选，不申请相册全量或相机权限。
//                 ArrayList<String> types = new ArrayList<>();
//                 for (String group : params.getAcceptTypes()) for (String raw : group.split(",")) {
//                     String type = raw.trim();
//                     if (type.matches("[a-zA-Z0-9.+-]+/([a-zA-Z0-9.+-]+|\\*)") && !types.contains(type)) types.add(type);
//                 }
//                 Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
//                     .setType(types.size() == 1 ? types.get(0) : "*/*")
//                     .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE)
//                     .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
//                 if (types.size() > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
//                 try { picker.launch(intent); }
//                 catch (Exception failure) {
//                     pendingFiles = null; callback.onReceiveValue(null);
//                     Toast.makeText(FeedbackActivity.this, "无法打开文件选择器，请重试。", Toast.LENGTH_SHORT).show();
//                 }
//                 return true;
//             }
//         });
//         findViewById(R.id.feedback_back).setOnClickListener(view -> goBack());
//         findViewById(R.id.feedback_close).setOnClickListener(view -> finish());
//         findViewById(R.id.feedback_retry).setOnClickListener(view -> {
//             errorView.setVisibility(View.GONE); webView.setVisibility(View.VISIBLE); webView.loadUrl(START_URL);
//         });
//         getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
//             @Override public void handleOnBackPressed() { goBack(); }
//         });
//         if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) webView.loadUrl(START_URL);
//     }
//     private void showError() {
//         mainFrameFailed = true; progress.setVisibility(View.GONE); webView.setVisibility(View.GONE); errorView.setVisibility(View.VISIBLE);
//     }
//     // QQ 默认把 Chrome 设为授权返回目标；改成只负责唤回本页的固定地址，由原网页继续轮询授权结果。
//     private boolean openQqLogin(WebView view, Uri uri) {
//         if (!"wtloginmqq".equals(uri.getScheme())) return false;
//         Uri source = Uri.parse(view.getUrl() == null ? "" : view.getUrl());
//         String host = source.getHost();
//         boolean official = "https".equals(source.getScheme()) &&
//             ("xui.ptlogin2.qq.com".equals(host) || "ui.ptlogin2.qq.com".equals(host) || "ssl.ptlogin2.qq.com".equals(host));
//         if (!official || !"ptlogin".equals(uri.getHost()) || !"/qlogin".equals(uri.getPath())) return true;
//         Uri.Builder target = uri.buildUpon().clearQuery();
//         for (String name : uri.getQueryParameterNames()) {
//             if (!"schemacallback".equals(name)) for (String value : uri.getQueryParameters(name)) target.appendQueryParameter(name, value);
//         }
//         target.appendQueryParameter("schemacallback", QQ_RETURN_URL);
//         try {
//             startActivity(new Intent(Intent.ACTION_VIEW, target.build()).setPackage(QQ_PACKAGE).addCategory(Intent.CATEGORY_BROWSABLE));
//         } catch (Exception failure) {
//             Toast.makeText(this, "无法唤起 QQ，请确认已安装 QQ，或返回选择其他登录方式。", Toast.LENGTH_LONG).show();
//         }
//         return true;
//     }
//     private void goBack() {
//         if (mainFrameFailed) finish();
//         else if (webView.canGoBack()) webView.goBack();
//         else finish();
//     }
//     @Override protected void onSaveInstanceState(Bundle state) { webView.saveState(state); super.onSaveInstanceState(state); }
//     @Override protected void onPause() { if (webView != null) webView.onPause(); super.onPause(); }
//     @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
//     @Override protected void onDestroy() {
//         if (pendingFiles != null) { pendingFiles.onReceiveValue(null); pendingFiles = null; }
//         // 原销毁：if (webView != null) { webView.stopLoading(); ((android.view.ViewGroup) webView.getParent()).removeView(webView); webView.destroy(); }
//         // 系统重建 Activity 时容许视图已经脱离父容器，仍确保及时释放网页与选择回调。
//         if (webView != null) {
//             webView.stopLoading();
//             if (webView.getParent() instanceof android.view.ViewGroup parent) parent.removeView(webView);
//             webView.destroy();
//         }
//         super.onDestroy();
//     }
// }

package com.uta.songlearning;

import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.UUID;

// 新接入使用官方第三方登录态，避开 QQ 授权跳回浏览器的问题；独立网页没有本机插件桥。
public final class FeedbackActivity extends AppCompatActivity {
    private static final String START_URL = "https://support.qq.com/product/802246";
    private static final String DEFAULT_AVATAR = "https://txc.qq.com/static/desktop/img/products/def-product-logo.png";
    private WebView webView;
    private View errorView;
    private TextView errorText;
    private ProgressBar progress;
    private ValueCallback<Uri[]> pendingFiles;
    private boolean mainFrameFailed;

    // Android 13+ 和具备回移模块的系统直接打开“照片 / 相册”，不进入文件夹列表。
    private final ActivityResultLauncher<PickVisualMediaRequest> singlePhoto = registerForActivityResult(
        new ActivityResultContracts.PickVisualMedia(), uri -> deliverImages(uri == null ? null : new Uri[]{uri}));
    private final ActivityResultLauncher<PickVisualMediaRequest> multiplePhotos = registerForActivityResult(
        new ActivityResultContracts.PickMultipleVisualMedia(9), uris -> deliverImages(uris.toArray(new Uri[0])));

    // 文件只由用户通过系统选择器授予访问；不要求相册全量权限，也不接收本应用的私有文件 URI。
    private final ActivityResultLauncher<Intent> picker = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
        // 旧系统相册兼容入口的结果仍由同一个安全检查和取消回调处理。
        deliverImages(WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData()));
    });

    // 原文件选择器结果处理保留于此方法；照片选择器和旧版相册复用，不读取未选择的照片。
    private void deliverImages(Uri[] selected) {
        ValueCallback<Uri[]> callback = pendingFiles;
        pendingFiles = null;
        if (callback == null) return;
        // 原来源：Uri[] selected = WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData());
        ArrayList<Uri> accepted = new ArrayList<>();
        if (selected != null) for (Uri uri : selected) {
            if ("content".equals(uri.getScheme()) && !(getPackageName() + ".fileprovider").equals(uri.getAuthority())) accepted.add(uri);
        }
        callback.onReceiveValue(accepted.isEmpty() ? null : accepted.toArray(new Uri[0]));
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        setContentView(R.layout.activity_feedback);
        View root = findViewById(R.id.feedback_root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int bottom = Math.max(bars.bottom, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom);
            view.setPadding(bars.left, bars.top, bars.right, bottom);
            return insets;
        });
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightNavigationBars(true);
        ViewCompat.requestApplyInsets(root);
        webView = findViewById(R.id.feedback_webview);
        errorView = findViewById(R.id.feedback_error);
        errorText = findViewById(R.id.feedback_error_text);
        progress = findViewById(R.id.feedback_progress);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setBackgroundColor(Color.WHITE);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                // 平台配置或会话失效时提供重新登录入口，不把用户带到 QQ 或外部浏览器。
                if (request.isForMainFrame() && "support.qq.com".equals(host) && uri.getPath() != null && uri.getPath().endsWith("/login")) {
                    showError("反馈登录暂时失效，请重新加载后再试。"); return true;
                }
                if ("https".equals(uri.getScheme()) && uri.getUserInfo() == null &&
                    ("support.qq.com".equals(host) || "txc.qq.com".equals(host))) return false;
                if (request.isForMainFrame()) Toast.makeText(FeedbackActivity.this, "此链接暂不支持在反馈页打开。", Toast.LENGTH_SHORT).show();
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                mainFrameFailed = false; progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) { progress.setVisibility(View.GONE); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("反馈页面暂时无法加载，请检查网络后重试。");
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showError("反馈页面暂时无法加载，请检查网络后重试。");
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
                if (value == 100 || mainFrameFailed) progress.setVisibility(View.GONE);
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                // 原文件夹入口：Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                //     .setType("image/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE)
                //     .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                // try { picker.launch(intent); }
                // 优先系统照片选择器；不支持该组件的旧系统使用相册 ACTION_PICK，仍不要求全量相册权限。
                boolean multiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                try {
                    if (ActivityResultContracts.PickVisualMedia.isPhotoPickerAvailable(FeedbackActivity.this)) {
                        PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
                            .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE).build();
                        if (multiple) multiplePhotos.launch(request); else singlePhoto.launch(request);
                    } else {
                        // 原 setType 会清除构造器的 data；改用 setDataAndType 保留相册图片集合 URI。
                        // Intent intent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI).setType("image/*")
                        Intent intent = new Intent(Intent.ACTION_PICK)
                            .setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        picker.launch(intent);
                    }
                }
                catch (Exception failure) {
                    pendingFiles = null; callback.onReceiveValue(null);
                    Toast.makeText(FeedbackActivity.this, "无法打开图片选择器，请重试。", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });
        findViewById(R.id.feedback_back).setOnClickListener(view -> goBack());
        findViewById(R.id.feedback_close).setOnClickListener(view -> finish());
        findViewById(R.id.feedback_retry).setOnClickListener(view -> loadFeedback());
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { goBack(); }
        });
        // 旋转屏幕由 Manifest 保留 Activity；进程重建时恢复网页历史，不重复生成访客身份。
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) loadFeedback();
    }

    private void loadFeedback() {
        mainFrameFailed = false;
        errorView.setVisibility(View.GONE); webView.setVisibility(View.VISIBLE);
        // 随机标识仅关联此安装的反馈记录，不是 UTA 账号或管理员凭证；不使用设备号、QQ、昵称和本机头像。
        SharedPreferences preferences = getSharedPreferences("uta_feedback", MODE_PRIVATE);
        String id = preferences.getString("visitor_id", null);
        if (id == null || !id.matches("uta_[a-f0-9]{32}")) {
            id = "uta_" + UUID.randomUUID().toString().replace("-", "");
            preferences.edit().putString("visitor_id", id).apply();
        }
        String nickname = "访客" + id.substring(id.length() - 4);
        String body = "openid=" + Uri.encode(id) + "&nickname=" + Uri.encode(nickname) + "&avatar=" + Uri.encode(DEFAULT_AVATAR);
        // 官方要求以 HTTPS 表单 POST 传递；不把身份放进 URL、日志或网页插件参数。
        webView.postUrl(START_URL, body.getBytes(StandardCharsets.UTF_8));
    }
    private void showError(String message) {
        mainFrameFailed = true; errorText.setText(message); progress.setVisibility(View.GONE);
        webView.setVisibility(View.GONE); errorView.setVisibility(View.VISIBLE);
    }
    private void goBack() {
        if (mainFrameFailed || !webView.canGoBack()) finish();
        else webView.goBack();
    }
    @Override protected void onSaveInstanceState(Bundle state) { webView.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onPause() { if (webView != null) webView.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
    @Override protected void onDestroy() {
        if (pendingFiles != null) { pendingFiles.onReceiveValue(null); pendingFiles = null; }
        if (webView != null) {
            webView.stopLoading();
            if (webView.getParent() instanceof android.view.ViewGroup parent) parent.removeView(webView);
            webView.destroy();
        }
        super.onDestroy();
    }
}
