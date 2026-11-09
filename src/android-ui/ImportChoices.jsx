import React from 'react'
import {Download,Monitor,ChevronRight} from 'lucide-react'

// 原先同时展示手机和电脑导入。电脑连接维护期间先隐藏卡片，完成后打开开关即可恢复。
const showComputerImport = false

export function DemoImportChoices({ onPhone, onComputer }) {
  const choices = [[Download, '从手机文件导入', '音频、歌词文件、粘贴或在线查找', onPhone]]
  if (showComputerImport) choices.push([Monitor, '从电脑网页导入', '通过 USB 或 Wi-Fi 连接电脑', onComputer])

  return <div className="refined-import-choices">
    {choices.map(([Icon, title, description, action]) => (
      <button type="button" key={title} aria-label={title} onClick={action}>
        <Icon size={24} />
        <span><strong>{title}</strong><small>{description}</small></span>
        <ChevronRight size={18} />
      </button>
    ))}
  </div>
}
export function DemoDialogHeading({title,onClose}){return <header className="refined-dialog-heading"><h2>{title}</h2><button className="refined-icon" type="button" aria-label="关闭导入窗口" onClick={onClose}>×</button></header>}
