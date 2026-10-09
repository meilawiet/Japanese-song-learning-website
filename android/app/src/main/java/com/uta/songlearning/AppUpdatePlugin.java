package com.uta.songlearning;

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.*;
import java.security.MessageDigest;
import java.util.concurrent.*;
import okhttp3.*;

// 更新包在原生端流式下载，不经过浏览器下载列表；安装始终由用户确认。
@CapacitorPlugin(name="UtaAppUpdate")
public final class AppUpdatePlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean downloading;
    private volatile int progress;
    private volatile Call transfer;
    private volatile boolean cancelled;
    private static final long LIMIT = 128L * 1024 * 1024;
    private static final String MIME = "application/vnd.android.package-archive";
    // 这是公开的发行证书指纹，不是私钥；拒绝被替换成其他签名的 APK。
    private static final String CERT = "0d623f7b1c340d1a21e7a9075e7287a8b7ed4c7c75c2cc967a910002bd4b7c1c";
    private File apk() { return new File(getContext().getCacheDir(), "uta-update.apk"); }
    private String digest(byte[] data) throws Exception {
        StringBuilder out = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(data)) out.append(String.format("%02x", b & 255));
        return out.toString();
    }
    private PackageInfo verify(File file) throws Exception {
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo info = getContext().getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), flags);
        if (info == null || !"com.uta.songlearning".equals(info.packageName)) throw new IOException("安装包不是有效的 UTA 正式版。");
        android.content.pm.Signature[] signatures = Build.VERSION.SDK_INT >= 28 ? info.signingInfo.getApkContentsSigners() : info.signatures;
        if (signatures == null || signatures.length != 1 || !CERT.equals(digest(signatures[0].toByteArray()))) throw new IOException("安装包签名不正确，请重新下载。");
        // 不提供降级安装：旧缓存或手动选择的旧 APK 不能覆盖较新的正式版。
        try {
            PackageInfo installed = getContext().getPackageManager().getPackageInfo(info.packageName, 0);
            if(info.versionCode < installed.versionCode)throw new IOException("安装包版本低于当前已安装版本，请选择新版 APK。");
        } catch(PackageManager.NameNotFoundException absent) { /* 首次安装没有旧版本可比较。 */ }
        return info;
    }
    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject(); result.put("busy", downloading); result.put("progress", progress);
        try { PackageInfo info = verify(apk()); result.put("ready", true); result.put("version", info.versionName); }
        catch (Exception error) { result.put("ready", false); }
        call.resolve(result);
    }
    @PluginMethod public synchronized void download(PluginCall call) {
        if (downloading) { call.reject("正在下载，请稍候。"); return; }
        String address = call.getString("url", ""), expected = call.getString("sha256", "");
        HttpUrl url = HttpUrl.parse(address);
        if (url == null || !url.isHttps() || !"github.com".equals(url.host()) || !url.username().isEmpty() || !url.password().isEmpty() || url.query() != null || url.fragment() != null || !url.encodedPath().startsWith("/meilawiet/Japanese-song-learning-website/releases/download/") || !url.encodedPath().endsWith(".apk") || !expected.matches("[0-9a-f]{64}")) {
            call.reject("更新下载地址或校验信息无效，请重新检测更新。"); return;
        }
        downloading = true; progress = 0; cancelled = false;
        worker.execute(() -> {
            File temporary = new File(getContext().getCacheDir(), "uta-update.part");
            try {
                OkHttpClient client = new OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS).callTimeout(10, TimeUnit.MINUTES).build();
                MessageDigest hash = MessageDigest.getInstance("SHA-256");
                transfer = client.newCall(new Request.Builder().url(url).build());
                // 兼容点击取消恰好发生在后台线程创建网络请求之前的情况。
                if(cancelled)transfer.cancel();
                try (Response response = transfer.execute()) {
                    if (!response.isSuccessful() || response.body() == null) throw new IOException("下载失败，请检查网络后重试。");
                    long length = response.body().contentLength();
                    if (length > LIMIT) throw new IOException("安装包过大，请从发布页面下载。");
                    try (InputStream input = response.body().byteStream(); FileOutputStream output = new FileOutputStream(temporary)) {
                        byte[] buffer = new byte[64 * 1024]; long total = 0; int count, last = -1;
                        while ((count = input.read(buffer)) != -1) {
                            total += count; if (total > LIMIT) throw new IOException("安装包过大，请从发布页面下载。");
                            hash.update(buffer, 0, count); output.write(buffer, 0, count);
                            progress = length > 0 ? (int)Math.min(99, total * 100 / length) : 0;
                            if (progress >= last + 2) { last = progress; JSObject event = new JSObject(); event.put("progress", progress); notifyListeners("progress", event); }
                        }
                        if (total == 0 || (length >= 0 && total != length)) throw new IOException("安装包下载不完整，请重新下载。");
                    }
                }
                StringBuilder actual = new StringBuilder(); for (byte b : hash.digest()) actual.append(String.format("%02x", b & 255));
                if (!expected.equals(actual.toString())) throw new IOException("安装包校验失败，请重新下载。");
                PackageInfo info = verify(temporary);
                // 只在完整性与签名验证都通过后替换旧缓存，下载失败仍可安装上次完整文件。
                if (!temporary.renameTo(apk())) throw new IOException("无法保存安装包，请清理空间后重试。");
                progress = 100; JSObject result = new JSObject(); result.put("ready", true); result.put("version", info.versionName); call.resolve(result);
            } catch (Exception error) {
                if(cancelled){ JSObject result = new JSObject(); result.put("cancelled", true); call.resolve(result); }
                else call.reject(error instanceof IOException ? error.getMessage() : "下载或校验失败，请重试。");
            }
            finally { temporary.delete(); transfer = null; downloading = false; }
        });
    }
    @PluginMethod public void cancel(PluginCall call) {
        // 用户取消只中止临时下载，不删除此前已校验的完整安装包。
        cancelled = true; Call active = transfer; if(active != null) active.cancel(); call.resolve(new JSObject());
    }
    @PluginMethod public void chooseFile(PluginCall call) {
        if(downloading){call.reject("请先取消或完成当前下载。");return;}
        // 已由 Edge 等浏览器下载的文件也可以通过 UTA 交给安装器处理。
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(MIME);
        startActivityForResult(call, intent, "selectedFile");
    }
    @ActivityCallback private void selectedFile(PluginCall call, ActivityResult result) {
        if(call == null)return;
        if(result.getResultCode()!=android.app.Activity.RESULT_OK || result.getData()==null || result.getData().getData()==null){JSObject value=new JSObject();value.put("cancelled",true);call.resolve(value);return;}
        Uri uri=result.getData().getData();
        worker.execute(()->{
            File temporary = new File(getContext().getCacheDir(), "uta-update-import.part");
            try {
                MessageDigest hash=MessageDigest.getInstance("SHA-256");
                try(InputStream input=getContext().getContentResolver().openInputStream(uri);FileOutputStream output=new FileOutputStream(temporary)){
                    if(input==null)throw new IOException("无法读取安装包，请选择本机已下载的 APK。");
                    byte[] bytes=new byte[64*1024];long total=0;int count;
                    while((count=input.read(bytes))!=-1){total+=count;if(total>LIMIT)throw new IOException("安装包过大。");hash.update(bytes,0,count);output.write(bytes,0,count);}
                }
                // 有发布摘要时同时校验，离线选包仍必须通过 UTA 包名与发行签名校验。
                String expected=call.getString("sha256","");
                StringBuilder actual=new StringBuilder();for(byte b:hash.digest())actual.append(String.format("%02x",b&255));
                if(!expected.isEmpty()&&!expected.equals(actual.toString()))throw new IOException("所选安装包与当前发布版本不符，请选择对应的 APK。");
                PackageInfo info=verify(temporary);
                if(!temporary.renameTo(apk()))throw new IOException("无法保存安装包，请清理空间后重试。");
                JSObject value=new JSObject();value.put("ready",true);value.put("version",info.versionName);call.resolve(value);
            }catch(Exception error){call.reject(error instanceof IOException?error.getMessage():"安装包读取或校验失败，请重新选择。");}
            finally{temporary.delete();}
        });
    }
    @PluginMethod public void saveFile(PluginCall call) {
        try {
            if (downloading) throw new IOException("正在下载，请稍候。");
            PackageInfo info = verify(apk());
            // 用户选定保存位置，便于 MT 等未注册 APK 打开协议的管理器手动安装。
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(MIME);
            intent.putExtra(Intent.EXTRA_TITLE, "UTA-Android-" + info.versionName + ".apk");
            startActivityForResult(call, intent, "savedFile");
        } catch (Exception error) { call.reject("请先下载完整安装包，或使用发布页面下载。"); }
    }
    @ActivityCallback private void savedFile(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject value = new JSObject(); value.put("cancelled", true); call.resolve(value); return;
        }
        Uri uri = result.getData().getData();
        worker.execute(() -> {
            try (InputStream input = new FileInputStream(apk()); OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new IOException("保存位置不可用。");
                byte[] bytes = new byte[64 * 1024]; int count; while ((count = input.read(bytes)) != -1) output.write(bytes, 0, count);
                call.resolve(new JSObject());
            } catch (Exception error) { call.reject("安装包保存失败，请检查空间后重试。"); }
        });
    }
    @PluginMethod public void install(PluginCall call) {
        try {
            if (downloading) throw new IOException("正在下载，请稍候。");
            verify(apk());
            getActivity().runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                        getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName())));
                        JSObject result = new JSObject(); result.put("permissionRequired", true); call.resolve(result); return;
                    }
                    Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk());
                    Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, MIME).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    view.setClipData(ClipData.newRawUri("UTA 安装包", uri));
                    if ("system".equals(call.getString("mode", "chooser"))) {
                        // 从支持 APK 的系统应用中选安装器，避免默认文件关联指向浏览器。
                        for (ResolveInfo candidate : getContext().getPackageManager().queryIntentActivities(view, PackageManager.MATCH_DEFAULT_ONLY)) {
                            if ((candidate.activityInfo.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0) { view.setClassName(candidate.activityInfo.packageName, candidate.activityInfo.name); break; }
                        }
                        if (view.getComponent() == null) throw new IOException("未找到系统安装器，请选择其他安装方式。");
                        getActivity().startActivity(view);
                    } else getActivity().startActivity(Intent.createChooser(view, "选择安装方式"));
                    call.resolve(new JSObject());
                } catch (Exception error) { call.reject(error instanceof IOException ? error.getMessage() : "无法启动安装器，请选择其他安装方式。"); }
            });
        } catch (Exception error) { call.reject(error instanceof IOException ? error.getMessage() : "请先完整下载更新包。"); }
    }
}
