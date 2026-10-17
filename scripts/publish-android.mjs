import {readFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {prepareAndroidRelease,publishAndroidRelease} from './androidRelease.mjs'

// 默认只生成可审阅的发布计划；--publish 仅在用户已授权当次双平台发布和代码上传时执行。
const values=new Map()
for(let i=2;i<process.argv.length;i++) {
  const key=process.argv[i]
  if(key==='--publish')values.set(key,true)
  else if(['--version','--apk','--notes','--gitee-commit'].includes(key)&&process.argv[i+1])values.set(key,process.argv[++i])
  else throw new Error(`未知或缺少参数：${key}`)
}
if(!['--version','--apk','--notes'].every(key=>values.has(key)))throw new Error('用法：node scripts/publish-android.mjs --version 版本 --apk APK路径 --notes 说明文件 [--gitee-commit SHA] [--publish]')
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim()
if(git('branch','--show-current')!=='android-dev')throw new Error('Android 只能从 android-dev 发布。')
const artifact=prepareAndroidRelease(values.get('--version'),readFileSync(values.get('--apk')),readFileSync(values.get('--notes'),'utf8'))
// 计划模式也核对包名、版本和发行签名，防止把旧包或调试签名传到两个平台。
const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME
if(!sdk)throw new Error('请设置 ANDROID_HOME 或 ANDROID_SDK_ROOT，供发布前校验使用。')
const buildTools=readdirSync(join(sdk,'build-tools')).filter(name=>/^\d+\.\d+\.\d+$/.test(name)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1)
if(!buildTools)throw new Error('未找到 Android build-tools。')
const toolsDir=join(sdk,'build-tools',buildTools)
const badging=execFileSync(join(toolsDir,process.platform==='win32'?'aapt.exe':'aapt'),['dump','badging',values.get('--apk')],{encoding:'utf8'})
if(!badging.includes("package: name='com.uta.songlearning'")||!badging.includes(`versionName='${artifact.version}'`))throw new Error('APK 包名或版本与发布参数不一致。')
const java=process.env.JAVA_HOME?join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java'
const signature=execFileSync(java,['-jar',join(toolsDir,'lib','apksigner.jar'),'verify','--print-certs',values.get('--apk')],{encoding:'utf8'})
if(!signature.includes('certificate SHA-256 digest: 0d623f7b1c340d1a21e7a9075e7287a8b7ed4c7c75c2cc967a910002bd4b7c1c'))throw new Error('APK 不是现有发行证书签名。')
console.log(JSON.stringify({mode:values.has('--publish')?'publish':'plan',version:artifact.version,name:artifact.name,size:artifact.bytes.length,digest:artifact.digest,destinations:['GitHub meilawiet/Japanese-song-learning-website','Gitee git277992790/UTA']}))
if(values.has('--publish')) {
  if(git('status','--porcelain'))throw new Error('请先完成并上传当前 Android 改动，发布要求工作区干净。')
  if(!values.get('--gitee-commit')?.match(/^[0-9a-f]{40}$/))throw new Error('发布前必须指定核对后的 --gitee-commit。')
  // 凭据只来自环境或系统 Git 凭据助手，既不写入仓库也不在命令参数中传递。
  let githubToken=process.env.GITHUB_TOKEN
  if(!githubToken) {
    const credential=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'}})
    githubToken=credential.split(/\r?\n/u).find(line=>line.startsWith('password='))?.slice(9)
  }
  const result=await publishAndroidRelease({artifact,commit:git('rev-parse','HEAD'),giteeCommit:values.get('--gitee-commit'),githubToken,giteeToken:process.env.GITEE_ACCESS_TOKEN,log:console.log})
  console.log(JSON.stringify(result))
}
