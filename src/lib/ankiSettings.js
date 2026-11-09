import {registerPlugin} from '@capacitor/core'

export const anki=registerPlugin('UtaAnki')
const DECK_KEY='uta-anki-deck-v1'

// 只重试原生明确标记的读取失败。该错误发生在写入卡片或创建牌组之前。
export async function retryAnkiDeckRead(operation, wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
  for(const delay of [300,700]){
    try{return await operation()}
    catch(error){if(error?.code!=='ANKI_DECKS_UNAVAILABLE')throw error}
    await wait(delay)
  }
  return operation()
}

// 兼容初版只存 ID 的牌组偏好，名称仅用于设置页显示。
export function readAnkiDeck(storage=localStorage){
  const saved=storage.getItem(DECK_KEY)
  if(!saved)return null
  if(/^\d+$/.test(saved))return {id:saved,name:''}
  try{
    const deck=JSON.parse(saved)
    return typeof deck?.id==='string'&&/^\d+$/.test(deck.id)&&typeof deck.name==='string'?deck:null
  }catch{return null}
}

export function saveAnkiDeck(deck,storage=localStorage){
  if(!deck){storage.removeItem(DECK_KEY);return}
  storage.setItem(DECK_KEY,JSON.stringify({id:deck.id,name:deck.name}))
}
