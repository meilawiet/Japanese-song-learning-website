// 兼容补丁先于 App 及所有业务模块执行，避免启动时调用缺失方法直接白屏。
import './lib/webviewCompatibility.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {StartupBoundary,StartupReady} from './components/StartupBoundary'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* 原根节点：<App />；错误边界展示静态重试页，不重置用户资料。 */}
    <StartupBoundary><App /><StartupReady /></StartupBoundary>
  </StrictMode>,
)
