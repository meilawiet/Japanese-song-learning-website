// 上半部分注释保留历史方案；下半部分注册当前应用内随机访客反馈入口。
// package com.uta.songlearning;
//
// import android.content.Intent;
// import com.getcapacitor.Plugin;
// import com.getcapacitor.PluginCall;
// import com.getcapacitor.PluginMethod;
// import com.getcapacitor.annotation.CapacitorPlugin;
//
// // 仅打开已配置的 UTA 兔小巢页面；不向第三方网页注入应用插件或用户学习数据。
// @CapacitorPlugin(name = "UtaFeedback")
// public final class FeedbackPlugin extends Plugin {
//     @PluginMethod public void open(PluginCall call) {
//         getActivity().runOnUiThread(() -> {
//             try {
//                 getActivity().startActivity(new Intent(getActivity(), FeedbackActivity.class));
//                 call.resolve();
//             } catch (Exception failure) { call.reject("无法打开建议与反馈，请稍后重试。"); }
//         });
//     }
// }

package com.uta.songlearning;

import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// 只打开应用自己的反馈 Activity；远端网页无法取得 Capacitor 插件桥或本机学习资料。
@CapacitorPlugin(name = "UtaFeedback")
public final class FeedbackPlugin extends Plugin {
    @PluginMethod public void open(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(getActivity(), FeedbackActivity.class));
                call.resolve();
            } catch (Exception failure) { call.reject("无法打开建议与反馈，请稍后重试。"); }
        });
    }
}
