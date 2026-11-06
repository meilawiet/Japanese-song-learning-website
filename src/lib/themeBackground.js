// 安卓2.0界面整合，旧实现注释对照见android-ui/legacy。
// 图片单独保存在本机IndexedDB，不写localStorage、不进入歌曲备份或网络请求。
import {backgroundSeed} from './backgroundColors.js'
const DB='uta-theme-background-v1',STORE='images';let cached=null,pending=null
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function transact(write,action){const db=await database();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,write?'readwrite':'readonly'),request=action(t.objectStore(STORE));let value;request.onsuccess=()=>{value=request.result};t.oncomplete=()=>{db.close();resolve(value)};t.onerror=()=>{db.close();reject(t.error)}})}
function invalidate(){if(cached?.url)URL.revokeObjectURL(cached.url);cached=null;pending=null}
// 原读取仅恢复Blob；旧背景在本机补算种子一次，升级后无需重新选择原图。
// export function loadThemeBackground(){if(cached)return Promise.resolve(cached);if(!pending)pending=transact(false,store=>store.get('current')).then(value=>{cached=value?{...value,url:URL.createObjectURL(value.blob)}:{url:'',name:''};return cached}).catch(error=>{pending=null;throw error});return pending}
export function loadThemeBackground(){if(cached)return Promise.resolve(cached);if(!pending)pending=transact(false,store=>store.get('current')).then(async value=>{if(value&&!value.seed){value={...value,seed:await seedFromBlob(value.blob)};await transact(true,store=>store.put(value,'current'))}cached=value?{...value,url:URL.createObjectURL(value.blob)}:{url:'',name:''};return cached}).catch(error=>{pending=null;throw error});return pending}
async function seedFromBlob(blob){const url=URL.createObjectURL(blob),image=new Image();try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url});return seedFromImage(image)}finally{URL.revokeObjectURL(url)}}
function seedFromImage(image){const sample=document.createElement('canvas');sample.width=sample.height=48;const context=sample.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,48,48);return backgroundSeed(context.getImageData(0,0,48,48).data)}
export async function importThemeBackground(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 图片。')
  // 用户取消文件体积上限；保留旧规则供对照：
  // if(file.size>15*1024*1024)throw new Error('图片请控制在15 MB以内。')
  const url=URL.createObjectURL(file),image=new Image()
  // 旧像素上限：if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>50000000)throw new Error('图片尺寸过大，请先缩小后导入。');
  // 不限制原图体积/像素数；仍按最长边1920生成显示副本，不改原图，正常解码失败会明确提示。
  // 原记录没有seed；现在随显示副本保存取色结果，重启无需再次解码大图。
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('图片无法读取，请换一张图片。'));image.src=url});if(!image.naturalWidth||!image.naturalHeight)throw new Error('图片无法读取，请换一张图片。');const scale=Math.min(1,1920/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));if(!blob)throw new Error('图片处理失败，请重试。');await transact(true,store=>store.put({blob,name:file.name,width:canvas.width,height:canvas.height,seed:seedFromImage(canvas)},'current'));invalidate();return loadThemeBackground()}finally{URL.revokeObjectURL(url)}
}
export async function removeThemeBackground(){await transact(true,store=>store.delete('current'));invalidate()}
let revision=0
export async function applyThemeBackground(options,palette){
  const stamp=++revision,root=document.documentElement
  if(!root.classList?.contains('uta-android-font'))return
  root.dataset.utaBackground='off';let layer=document.getElementById('uta-theme-wallpaper')
  if(!options?.enabled){layer?.remove();return}
  try{const image=await loadThemeBackground();if(stamp!==revision||!image.url)return;if(!layer){layer=document.createElement('div');layer.id='uta-theme-wallpaper';layer.setAttribute('aria-hidden','true');document.body.prepend(layer)}
    Object.assign(layer.style,{backgroundImage:`linear-gradient(${palette.page}${Math.round(options.veil/100*255).toString(16).padStart(2,'0')},${palette.page}${Math.round(options.veil/100*255).toString(16).padStart(2,'0')}),url("${image.url}")`,backgroundPosition:`${options.x}% ${options.y}%`,transform:`scale(${options.zoom||1})`,transformOrigin:`${options.x}% ${options.y}%`,filter:`blur(${options.blur/(options.zoom||1)}px)`});root.dataset.utaBackground='on';root.style.setProperty('--uta-card-opacity',String(options.cardOpacity/100))
  }catch{root.dataset.utaBackground='off'}
}
