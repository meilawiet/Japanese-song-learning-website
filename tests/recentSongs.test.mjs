import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readRecentSongIds,recentLibrarySongs,rememberRecentSong,saveRecentSongIds} from '../src/lib/recentSongs.js'

test('最近打开的歌曲按使用顺序展示前三首，重复打开时移到首位',()=>{
  const songs=['a','b','c','d','e'].map(id=>({id}))
  const opened=['b','d','a','e','d'].reduce(rememberRecentSong,[])
  assert.deepEqual(recentLibrarySongs(songs,opened).map(song=>song.id),['d','e','a'])
  assert.deepEqual(recentLibrarySongs(songs.filter(song=>song.id!=='d'),opened).map(song=>song.id),['e','a','b'])
  assert.deepEqual(recentLibrarySongs(songs,['c']),[songs[2]])
  assert.deepEqual(recentLibrarySongs(songs,[]),[])
})

test('升级沿用上一首记录，之后可从本机存储恢复完整顺序',()=>{
  const data=new Map()
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}
  assert.deepEqual(readRecentSongIds(storage,'old'),['old'])
  saveRecentSongIds(storage,['new','old','new',null])
  assert.deepEqual(readRecentSongIds(storage,'other'),['new','old'])
  saveRecentSongIds(storage,[])
  assert.deepEqual(readRecentSongIds(storage,'other'),[])
})
