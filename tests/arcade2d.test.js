
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/arcade-fighters.js'),'utf8');
class FakeImage {constructor(){this.complete=true;this.naturalWidth=580;this.naturalHeight=1000;this.src='';}}
const noop=()=>{};const grad=()=>({addColorStop:noop});let draws=0;
const graphics=new Proxy({}, {get(_,key){if(key==='createLinearGradient'||key==='createRadialGradient')return grad;if(key==='drawImage')return ()=>{draws++};if(key==='canvas')return {width:960,height:540};return noop;},set(){return true;}});
const win={};vm.runInNewContext(source,{window:win,Image:FakeImage,Math});
const {FIGHTERS,POSES,STANCE,poseKey,PhillyArcade2D}=win.PhiroArcadeTest;
test('all nine approved full-body character sprites exist and load by unique ID',()=>{assert.equal(FIGHTERS.length,9);for(const id of FIGHTERS){const img=path.join(__dirname,'../public/sprites/'+id+'.webp');assert.ok(fs.existsSync(img),id);assert.ok(fs.statSync(img).size>20000,id);assert.ok(STANCE[id].height>=370);}});
test('every fighter has loaded full-body joint pose sheets, not pasted portraits',()=>{
 for(const id of FIGHTERS)for(const move of POSES){const name=id+'__'+move+'.webp';
  assert.ok(fs.existsSync(path.join(__dirname,'../public/motion',name)),name);
 }
 assert.equal(poseKey('air-kick'),'roundhouse');assert.equal(poseKey('air-jab'),'jab');
});
test('all nine fighter sprites draw in all eight levels without 3D or portrait head composition',()=>{const game=new PhillyArcade2D({width:960,height:540,id:'stage',getContext(type){assert.equal(type,'2d');return graphics;}});for(const stage of ['north-block','rooftop','basketball-court','subway','garage','underpass','corner-store','warehouse'])for(const id of FIGHTERS)for(const action of ['idle','jab','cross','uppercut','front-kick','roundhouse','special','block','ko']){game.render([{x:300,characterId:id,facing:1,slot:0,action,attackProgress:.52}],[],2.2,{stage});}assert.ok(draws>200);});

test('client roster boot loads all nine fighters without prototype-only filtering',()=>{const main=fs.readFileSync(path.join(__dirname,'../public/main.js'),'utf8');assert.match(main,/roster=await response\.json\(\)/);assert.ok(!main.includes(".filter(c=>c.id==='piro'||c.id==='speedy')"));});
