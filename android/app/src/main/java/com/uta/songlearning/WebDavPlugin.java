package com.uta.songlearning;

import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import okhttp3.*;
import java.security.MessageDigest;
import android.os.SystemClock;
import okio.BufferedSink;
import android.util.Xml;
import org.xmlpull.v1.XmlPullParser;

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
    // 原 PUT 不报告网络进度，前端在准备临时文件后一直停在90%。保留旧实现供对照：
    // @PluginMethod public void upload(PluginCall call) {run(call,()->{File target=file(call);RequestBody body=RequestBody.create(target,MediaType.parse("application/octet-stream"));try(Response response=client.newCall(request(call,"PUT",body,false).header("If-None-Match","*").build()).execute()){check(response);}JSObject result=new JSObject();result.put("size",target.length());return result;});}
    @PluginMethod public void upload(PluginCall call) {run(call,()->{
        File target=file(call);String id=call.getString("id","");long started=SystemClock.elapsedRealtime();
        // 分开记录发送和服务器确认；捕获底层重发次数，不把长等待一律归为网络限速。
        long[] firstWrite={0},sentAt={0};int[] attempts={0};
        RequestBody body=new RequestBody(){
            public MediaType contentType(){return MediaType.parse("application/octet-stream");}
            public long contentLength(){return target.length();}
            public void writeTo(BufferedSink sink) throws IOException {
                attempts[0]++;firstWrite[0]=SystemClock.elapsedRealtime();
                try(InputStream input=new FileInputStream(target)){
                    byte[] bytes=new byte[65536];int count;long sent=0,last=0;
                    while((count=input.read(bytes))!=-1){sink.write(bytes,0,count);sent+=count;long now=SystemClock.elapsedRealtime();
                        if(now-last>=250||sent==target.length()){last=now;JSObject event=new JSObject();event.put("id",id);event.put("sent",sent);event.put("total",target.length());event.put("elapsedMs",now-firstWrite[0]);event.put("attempt",attempts[0]);event.put("phase","upload");notifyListeners("transferProgress",event);}
                    }
                    sink.flush();
                    sentAt[0]=SystemClock.elapsedRealtime();
                    JSObject event=new JSObject();event.put("id",id);event.put("sent",sent);event.put("total",target.length());event.put("elapsedMs",SystemClock.elapsedRealtime()-started);event.put("phase","server");notifyListeners("transferProgress",event);
                }
            }
        };
        long written;
        try(Response response=client.newCall(request(call,"PUT",body,false).header("If-None-Match","*").build()).execute()){check(response);written=SystemClock.elapsedRealtime()-started;}
        JSObject result=new JSObject();result.put("size",target.length());result.put("elapsedMs",written);result.put("sendMs",sentAt[0]-firstWrite[0]);result.put("confirmMs",SystemClock.elapsedRealtime()-sentAt[0]);result.put("attempts",attempts[0]);return result;
    });}
    // 原生流式哈希避免整首音频复制到 JS 内存；远端 HEAD 用于复用相同内容的歌曲文件。
    @PluginMethod public void digest(PluginCall call){run(call,()->{
        MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream input=new FileInputStream(file(call))){byte[] bytes=new byte[65536];int count;while((count=input.read(bytes))!=-1)digest.update(bytes,0,count);}
        StringBuilder hex=new StringBuilder();for(byte value:digest.digest())hex.append(String.format(Locale.ROOT,"%02x",value&255));JSObject result=new JSObject();result.put("sha256",hex.toString());return result;
    });}
    // 原 HEAD 读取 Content-Length：坚果云实测文件为1024字节，却返回0，不能据此判断文件损坏。
    // @PluginMethod public void stat(PluginCall call){run(call,()->{try(Response response=client.newCall(request(call,"HEAD",null,false).build()).execute()){JSObject result=new JSObject();if(response.code()==404){result.put("exists",false);return result;}check(response);result.put("exists",true);String length=response.header("Content-Length");result.put("size",length==null?-1:Long.parseLong(length));return result;}});}
    // 使用 WebDAV 文件属性 getcontentlength，不把 HEAD响应正文长度当成真实文件长度。
    @PluginMethod public void stat(PluginCall call){run(call,()->{
        RequestBody body=RequestBody.create("<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:getcontentlength/></d:prop></d:propfind>",MediaType.parse("application/xml"));
        try(Response response=client.newCall(request(call,"PROPFIND",body,false).header("Depth","0").build()).execute()){
            JSObject result=new JSObject();if(response.code()==404){result.put("exists",false);return result;}check(response);
            String xml=response.body().string();if(xml.length()>65536)throw new IOException("文件属性返回内容过大。");
            XmlPullParser parser=Xml.newPullParser();parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES,true);parser.setInput(new StringReader(xml));long size=-1;
            while(parser.next()!=XmlPullParser.END_DOCUMENT){if(parser.getEventType()==XmlPullParser.START_TAG&&"getcontentlength".equals(parser.getName())){String length=parser.nextText().trim();if(!length.isEmpty())size=Long.parseLong(length);}}
            result.put("exists",true);result.put("size",size);return result;
        }
    });}
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
