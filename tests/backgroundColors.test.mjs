import test from 'node:test'
import assert from 'node:assert/strict'
import {backgroundSeed,backgroundThemeColors,withBackgroundColors} from '../src/lib/backgroundColors.js'
import {normalizeAppearance,THEMES} from '../src/lib/appearance.js'
import {resolvePalette,contrast,advancedThemeColor} from '../src/lib/themePalette.js'
test('忽略透明和白色留白，保留背景主体的蓝色/红色差异',()=>{
  for(const color of [[50,90,180],[185,60,60]]){const pixels=[...Array(20).fill([255,255,255,255]).flat(),...Array(10).fill([...color,255]).flat(),...Array(30).fill([0,240,0,0]).flat()];assert.equal(backgroundSeed(pixels),'#'+color.map(c=>c.toString(16).padStart(2,'0')).join(''))}
  assert.match(backgroundSeed([]),/^#[0-9a-f]{6}$/)
})
test('图片配色同时生成浅深模式，正文/按钮保持可读并保留字体与背景位置',()=>{
  for(const seed of ['#325ab4','#b93c3c','#ffffff','#000000','#fdf000']){
    const value=normalizeAppearance(withBackgroundColors({font:'maoken',theme:'sea',background:{x:80}},seed));assert.equal(value.font,'maoken');assert.equal(value.background.x,80);assert.equal(value.background.seed,seed);assert.equal(value.customEnabled,true)
    for(const mode of ['light','dark']){const p=resolvePalette({...value,mode},THEMES[1]);assert.ok(contrast(p.text,p.surface)>=4.5);assert.ok(contrast(p.text,p.page)>=4.5);assert.ok(contrast(p.onAccent,p.accent)>=4.5)}
  }
  assert.notDeepEqual(backgroundThemeColors('#325ab4'),backgroundThemeColors('#b93c3c'))
})
test('当前句微透明高亮不能当作黑色模态遮罩，真正遮罩继续保持遮挡',()=>{
  const p=resolvePalette(normalizeAppearance(withBackgroundColors({},'#325ab4')),THEMES[0]);const active=advancedThemeColor(59,95,69,8/255,'background',p,'.unified-study-page .lyric-row.active');assert.ok(!active.includes('0,0,0'));assert.ok(active.endsWith(',1)'));assert.equal(advancedThemeColor(0,0,0,.45,'background',p,'.settings-backdrop'),'rgba(0,0,0,0.45)')
})
