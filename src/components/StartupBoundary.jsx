import {Component,useEffect} from 'react'

// 初始化/渲染出错时交给独立的静态提示页；不清理歌曲、配置或学习记录。
export class StartupBoundary extends Component{
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(){window.utaStartup?.fail('interface-error')}
  render(){return this.state.failed?null:this.props.children}
}
export function StartupReady(){
  // App 的同步初始化完成后才关闭启动监测，异步联网功能不阻塞首页显示。
  useEffect(()=>{window.utaStartup?.ready()},[])
  return null
}
