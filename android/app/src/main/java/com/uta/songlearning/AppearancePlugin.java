package com.uta.songlearning;

import android.content.res.Configuration;
import android.graphics.Color;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// 跟随系统读取真实Android uiMode，同时使系统栏明暗与应用所选模式一致。
@CapacitorPlugin(name="UtaAppearance")
public class AppearancePlugin extends Plugin {
    private JSObject state(Configuration config) {
        JSObject value=new JSObject();value.put("dark",(config.uiMode & Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES);return value;
    }
    @PluginMethod
    public void getSystemTheme(PluginCall call) { call.resolve(state(getContext().getResources().getConfiguration())); }
    @Override
    protected void handleOnConfigurationChanged(Configuration config) { notifyListeners("systemThemeChange",state(config)); }
    @PluginMethod
    public void setChrome(PluginCall call) {
        String value=call.getString("color", "#f8f9fc");if(!value.matches("#[0-9a-fA-F]{6}")){call.reject("Invalid color");return;}
        int color=Color.parseColor(value);boolean dark=call.getBoolean("dark",false);
        getActivity().runOnUiThread(()->{
            Window window=getActivity().getWindow();window.setStatusBarColor(color);window.setNavigationBarColor(color);window.getDecorView().setBackgroundColor(color);
            int mask=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            View decor=window.getDecorView();decor.setSystemUiVisibility(dark?decor.getSystemUiVisibility() & ~mask:decor.getSystemUiVisibility() | mask);
            if(Build.VERSION.SDK_INT>=30){WindowInsetsController controller=window.getInsetsController();if(controller!=null)controller.setSystemBarsAppearance(dark?0:WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);}
            call.resolve();
        });
    }
}
