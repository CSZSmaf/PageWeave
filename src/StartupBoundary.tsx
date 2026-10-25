import {Component,type ReactNode} from 'react';

/** Keep a rendering failure recoverable without replacing the document on disk. */
export default class StartupBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidMount(){document.getElementById('root')!.dataset.ready='true';}
  render(){return this.state.failed?<main className="startup-state" role="alert"><h1>界面暂时无法显示</h1><p>重新加载后继续打开当前文稿。</p><button onClick={()=>location.reload()}>重新加载</button></main>:this.props.children;}
}
