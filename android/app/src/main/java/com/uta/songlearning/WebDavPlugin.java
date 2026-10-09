package com.uta.songlearning;

import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import okhttp3.*;

// 仅访问用户配置目录，凭据通过 HTTPS 发送；下载和上传都以文件流处理。
@CapacitorPlugin(name="UtaWebDav")
public class WebDavPlugin extends Plugin {
    private final OkHttpClient client = new OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .connectTimeout(15,TimeUnit.SECONDS).readTimeout(120,TimeUnit.SECONDS).writeTimeout(120,TimeUnit.SECONDS).build();
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Map<String,File> files=new ConcurrentHashMap<>();
    private static final long LIMIT=500L*1024*1024;
    private interface Work { JSObject run() throws Exception; }
    private void run(PluginCall call,Work task) { worker.execute(()->{try {call.resolve(task.run());}catch(Exception error){call.reject(error instanceof IOException?error.getMessage():"WebDAV 操作失败，请检查地址与文件。");}}); }
    private Request.Builder request(PluginCall call,String method,RequestBody body,boolean directory) throws Exception {
        JSObject config=call.getObject("config",new JSObject());
        HttpUrl base=HttpUrl.parse(config.getString("url",""));
        if(base==null||!base.isHttps()||!base.username().isEmpty()||!base.password().isEmpty()||base.query()!=null||base.fragment()!=null) throw new IOException("WebDAV 地址必须是 HTTPS 目录地址。");
        String name=call.getString("name","");
        if(!name.isEmpty()&&!name.matches("[A-Za-z0-9_.-]+\\.uta-backup")) throw new IOException("云备份文件名无效。");
        if(!directory&&name.isEmpty()) throw new IOException("请选择云备份文件。");
        HttpUrl root=base.newBuilder().encodedPath(base.encodedPath().replaceAll("/+$","")+"/").build();
        HttpUrl url=directory?root:root.newBuilder().addPathSegment(name).build();
        return new Request.Builder().url(url).header("Authorization",Credentials.basic(config.getString("username",""),config.getString("password",""))).method(method,body);
    }
    private void check(Response response) throws IOException {
        if(response.isSuccessful()) return;
        int code=response.code();
        throw new IOException(code==401||code==403?"WebDAV 账号或应用密码无效，或没有访问权限。":code==404?"云端目录或备份不存在。":code==409?"云目录的上级目录不存在，请先创建目录。":code==413?"云端限制文件大小，无法上传此备份。":code==429?"WebDAV 请求过于频繁，请稍后重试。":"WebDAV 请求失败（HTTP "+code+"）。");
    }
    private File file(PluginCall call) throws IOException {File value=files.get(call.getString("id",""));if(value==null)throw new IOException("临时传输已失效，请重试。");return value;}
    @PluginMethod public void directory(PluginCall call) {run(call,()->{
        RequestBody body=RequestBody.create("<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:displayname/><d:getcontentlength/><d:getlastmodified/><d:getetag/><d:resourcetype/></d:prop></d:propfind>",MediaType.parse("application/xml"));
        Request req=request(call,"PROPFIND",body,true).header("Depth",call.getBoolean("list",false)?"1":"0").build();
        try(Response initial=client.newCall(req).execute()) {
            if(initial.code()==404&&call.getBoolean("create",false)) {
                try(Response created=client.newCall(request(call,"MKCOL",null,true).build()).execute()) {check(created);}
            } else {check(initial);String xml=initial.body().string();if(xml.length()>2*1024*1024)throw new IOException("目录内容过多，请使用 UTA 专用目录。");JSObject result=new JSObject();result.put("xml",xml);return result;}
        }
        try(Response response=client.newCall(req).execute()){check(response);JSObject result=new JSObject();result.put("xml",response.body().string());return result;}
    });}
    @PluginMethod public void begin(PluginCall call) {run(call,()->{String id=UUID.randomUUID().toString();File file=File.createTempFile("uta-webdav-",".part",getContext().getCacheDir());files.put(id,file);JSObject result=new JSObject();result.put("id",id);return result;});}
    @PluginMethod public void append(PluginCall call) {run(call,()->{File target=file(call);byte[] bytes=Base64.decode(call.getString("data",""),Base64.DEFAULT);if(bytes.length>512*1024||target.length()+bytes.length>LIMIT)throw new IOException("备份超过支持的大小（500 MB）。");try(FileOutputStream out=new FileOutputStream(target,true)){out.write(bytes);}return new JSObject();});}
    @PluginMethod public void upload(PluginCall call) {run(call,()->{File target=file(call);RequestBody body=RequestBody.create(target,MediaType.parse("application/octet-stream"));try(Response response=client.newCall(request(call,"PUT",body,false).header("If-None-Match","*").build()).execute()){check(response);}JSObject result=new JSObject();result.put("size",target.length());return result;});}
    @PluginMethod public void download(PluginCall call) {run(call,()->{
        String id=UUID.randomUUID().toString();File target=File.createTempFile("uta-webdav-",".part",getContext().getCacheDir());
        try(Response response=client.newCall(request(call,"GET",null,false).build()).execute()) {
            check(response);if(response.body().contentLength()>LIMIT)throw new IOException("备份超过支持的大小（500 MB）。");
            try(InputStream input=response.body().byteStream();FileOutputStream output=new FileOutputStream(target)) {byte[] bytes=new byte[65536];int count;long size=0;while((count=input.read(bytes))!=-1){size+=count;if(size>LIMIT)throw new IOException("备份超过支持的大小（500 MB）。");output.write(bytes,0,count);}}
        } catch(Exception failure){target.delete();throw failure;}
        files.put(id,target);JSObject result=new JSObject();result.put("id",id);result.put("size",target.length());return result;
    });}
    // 旧实现保留供对照：getLong 只接受 Long，小于 2 GB 的 JSON 整数实际是 Integer，导致每块都从 0 读取。
    // @PluginMethod public void read(PluginCall call) {run(call,()->{File target=file(call);long offset=call.getLong("offset",0L);if(offset<0||offset>target.length())throw new IOException("读取位置无效。");byte[] bytes=new byte[(int)Math.min(256*1024,target.length()-offset)];try(RandomAccessFile input=new RandomAccessFile(target,"r")){input.seek(offset);input.readFully(bytes);}JSObject result=new JSObject();result.put("data",Base64.encodeToString(bytes,Base64.NO_WRAP));return result;});}
    // 兼容桥接传入的 Integer 与 Long，并拒绝缺失、字符串、小数或越界位置。
    @PluginMethod public void read(PluginCall call) {run(call,()->{byte[] bytes=WebDavFileChunks.read(file(call),call.getData().opt("offset"));JSObject result=new JSObject();result.put("data",Base64.encodeToString(bytes,Base64.NO_WRAP));return result;});}
    @PluginMethod public void release(PluginCall call) {run(call,()->{File target=files.remove(call.getString("id",""));if(target!=null)target.delete();return new JSObject();});}
    // 只用于清理本轮自动创建的测试备份，产品界面不提供删除用户云文件操作。
    @PluginMethod public void deleteTest(PluginCall call) {run(call,()->{if(!call.getString("name","").startsWith("_uta-test-"))throw new IOException("仅可清理 UTA 临时测试文件。");try(Response response=client.newCall(request(call,"DELETE",null,false).build()).execute()){check(response);}return new JSObject();});}
    @Override protected void handleOnDestroy(){worker.shutdownNow();for(File file:files.values())file.delete();files.clear();super.handleOnDestroy();}
}
