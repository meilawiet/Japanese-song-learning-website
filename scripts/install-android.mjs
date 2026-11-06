// 只为机主用户覆盖安装，避免三星DUAL_APP空间自动出现额外UTA图标。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function installAndroidForOwner({serial,apk,packageName,adb,aapt}) {
  if(!serial||!/^[-\w.:]+$/.test(serial))throw Error('请指定要安装的设备serial。');
  if(!['com.uta.songlearning','com.uta.songlearning.dev','com.uta.songlearning.uidemo'].includes(packageName))throw Error('请明确指定正式UTA、调试版或界面Demo包名。');
  const resolved=path.resolve(apk||'');if(!fs.statSync(resolved).isFile())throw Error('找不到APK文件。');
  const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',maxBuffer:16*1024*1024});
  const badging=execFileSync(aapt,['dump','badging',resolved],{encoding:'utf8',maxBuffer:4*1024*1024});
  if(!badging.includes(`package: name='${packageName}'`))throw Error('APK包名与指定目标不一致，未安装。');
  const userText=run(['shell','pm','list','users']);
  const users=[...userText.matchAll(/UserInfo\{(\d+):([^:}]+):/g)].map(m=>({id:Number(m[1]),name:m[2]}));
  if(!users.some(user=>user.id===0))throw Error('未找到机主用户0，未安装。');
  // 仅检查该包在其他用户中的状态，不读取账号或学习资料，更不删除整个用户空间。
  const installed=user=>run(['shell','pm','list','packages','--user',String(user),packageName]).split(/\r?\n/).includes('package:'+packageName);
  const before=users.filter(user=>user.id!==0&&installed(user.id));
  const output=run(['install','--user','0','--no-incremental','-r',resolved]);
  if(!/\bSuccess\b/.test(output)||!installed(0))throw Error('机主用户安装未成功。');
  const after=users.filter(user=>user.id!==0&&installed(user.id));
  const added=after.filter(user=>!before.some(old=>old.id===user.id));
  if(added.length)throw Error('安装完成，但系统新增了其他用户副本，需要核对：'+added.map(user=>user.id).join(','));
  return {package:packageName,user:0,output:output.trim(),otherUsersBefore:before,otherUsersAfter:after,newOtherUserInstalls:added};
}

// CLI从本机SDK读取工具位置；不把个人SDK路径或设备信息写入项目配置。
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined};
  const local=fs.existsSync('android/local.properties')?fs.readFileSync('android/local.properties','utf8'):'';
  // 没有全局环境变量的本机也可显式传--sdk，避免依赖其他构建进程的临时环境。
  // 原SDK来源：process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||local.match(...)。
  const sdk=option('--sdk')||process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||local.match(/^sdk\.dir=(.+)$/m)?.[1].trim().replace(/\\:/g,':').replace(/\\\\/g,'\\');
  if(!sdk)throw Error('请通过--sdk、ANDROID_HOME或android/local.properties配置Android SDK。');
  const versions=fs.readdirSync(path.join(sdk,'build-tools')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
  console.log(JSON.stringify(installAndroidForOwner({serial:option('--serial'),apk:option('--apk'),packageName:option('--package'),adb:option('--adb')||path.join(sdk,'platform-tools','adb.exe'),aapt:option('--aapt')||path.join(sdk,'build-tools',versions[0],'aapt.exe')}),null,2));
}
