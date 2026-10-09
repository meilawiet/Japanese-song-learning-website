package com.uta.songlearning;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.util.ArrayDeque;
import java.util.Set;
import java.util.TreeSet;

// 用 Android 系统的局域网发现功能，查找电脑正在运行的 UTA 传歌服务。
@CapacitorPlugin(name = "UtaTransferDiscovery")
public class TransferDiscoveryPlugin extends Plugin {
    private static final String SERVICE_TYPE = "_utatransfer._tcp.";
    private static final int TRANSFER_PORT = 8765;

    @PluginMethod
    public void discover(PluginCall call) {
        NsdManager manager = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
        if (manager == null) {
            call.reject("这台手机无法自动查找电脑，请手动填写地址。");
            return;
        }
        new DiscoveryRun(manager, call).start();
    }

    private final class DiscoveryRun implements NsdManager.DiscoveryListener {
        private final NsdManager manager;
        private final PluginCall call;
        private final Handler handler = new Handler(Looper.getMainLooper());
        private final Set<String> addresses = new TreeSet<>();
        private final ArrayDeque<NsdServiceInfo> pending = new ArrayDeque<>();
        private WifiManager.MulticastLock multicastLock;
        // 系统回调可能来自不同线程，结束标记需要立即对各回调可见。
        private volatile boolean active = true;
        private boolean resolving = false;

        DiscoveryRun(NsdManager manager, PluginCall call) {
            this.manager = manager;
            this.call = call;
        }

        void start() {
            try {
                // 较早版本的 Android 需要临时打开组播接收；搜索结束立即释放。
                WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wifi != null) {
                    multicastLock = wifi.createMulticastLock("uta-transfer-discovery");
                    multicastLock.setReferenceCounted(false);
                    multicastLock.acquire();
                }
                manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, this);
                handler.postDelayed(this::finish, 6000);
            } catch (RuntimeException error) {
                finish();
            }
        }

        @Override
        public void onDiscoveryStarted(String serviceType) { }

        @Override
        public synchronized void onServiceFound(NsdServiceInfo service) {
            // 刚发现时端口可能尚未解析；解析完成后再核对传歌端口。
            if (!active) return;
            pending.add(service);
            resolveNext();
        }

        @Override
        public void onServiceLost(NsdServiceInfo service) { }

        @Override
        public void onDiscoveryStopped(String serviceType) { }

        @Override
        public void onStartDiscoveryFailed(String serviceType, int errorCode) {
            finish();
        }

        @Override
        public void onStopDiscoveryFailed(String serviceType, int errorCode) { }

        private synchronized void resolveNext() {
            if (!active || resolving || pending.isEmpty()) return;
            resolving = true;
            NsdServiceInfo service = pending.remove();
            try {
                manager.resolveService(service, new NsdManager.ResolveListener() {
                    @Override
                    public void onResolveFailed(NsdServiceInfo info, int errorCode) {
                        next();
                    }

                    @Override
                    public void onServiceResolved(NsdServiceInfo info) {
                        InetAddress host = info.getHost();
                        if (active && info.getPort() == TRANSFER_PORT && host instanceof Inet4Address) {
                            synchronized (DiscoveryRun.this) {
                                addresses.add(host.getHostAddress());
                            }
                        }
                        next();
                    }

                    private void next() {
                        synchronized (DiscoveryRun.this) {
                            resolving = false;
                            resolveNext();
                        }
                    }
                });
            } catch (RuntimeException error) {
                resolving = false;
                resolveNext();
            }
        }

        private synchronized void finish() {
            if (!active) return;
            active = false;
            try {
                manager.stopServiceDiscovery(this);
            } catch (RuntimeException ignored) {
                // 发现服务尚未开始或已停止时，也要把结果交还给页面。
            }
            if (multicastLock != null && multicastLock.isHeld()) multicastLock.release();
            JSArray found = new JSArray();
            for (String address : addresses) found.put(address);
            JSObject result = new JSObject();
            result.put("addresses", found);
            call.resolve(result);
        }
    }
}
