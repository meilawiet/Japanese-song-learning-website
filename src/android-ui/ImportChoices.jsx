import React from 'react'
import {Download,Monitor,ChevronRight} from 'lucide-react'

// 导入来源保持原流程，卡片只显示选择所需的信息。
export function DemoImportChoices({onPhone,onComputer}){return <div className="refined-import-choices">{[[Download,'从手机文件导入','音频、歌词文件、粘贴或在线查找',onPhone],[Monitor,'从电脑网页导入','通过 USB 或 Wi-Fi 连接电脑',onComputer]].map(([Icon,title,description,action])=><button type="button" key={title} aria-label={title} onClick={action}><Icon size={24}/><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={18}/></button>)}</div>}
export function DemoDialogHeading({title,onClose}){return <header className="refined-dialog-heading"><h2>{title}</h2><button className="refined-icon" type="button" aria-label="关闭导入窗口" onClick={onClose}>×</button></header>}
