// 安卓2.0界面整合，旧实现注释对照见android-ui/legacy。
import {Capacitor} from '@capacitor/core'
// 正式安卓启用新界面；不执行Demo资料迁移。
if(Capacitor.isNativePlatform())document.documentElement.classList.add('uta-full-demo','uta-refined','uta-image-gestures')
// 兼容补丁先于 App 及所有业务模块执行，避免启动时调用缺失方法直接白屏。
import './lib/webviewCompatibility.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {StartupBoundary,StartupReady} from './components/StartupBoundary'
import App from './App'
import './styles.css'
import './android-ui/full-demo.css'
import './android-ui/refined.css'
import './android-ui/secondary.css'
import './android-ui/gestures.css'
import './android-ui/regressions.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* 原根节点：<App />；错误边界展示静态重试页，不重置用户资料。 */}
    <StartupBoundary><App /><StartupReady /></StartupBoundary>
  </StrictMode>,
)
