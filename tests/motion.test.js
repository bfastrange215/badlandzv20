'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const publicDir=path.join(__dirname,'..','public');
const motionDir=path.join(publicDir,'motion');
const manifest=JSON.parse(fs.readFileSync(path.join(motionDir,'manifest.json'),'utf8'));
test('V15: all nine fighters have 18 complete, different limb animation sheets',()=>{
 assert.equal(manifest.fighters.length,9);assert.equal(manifest.actions.length,18);assert.equal(manifest.frames.walk,16);assert.equal(manifest.frames['front-kick'],16);assert.equal(manifest.frames.hook,16);
 for(const id of manifest.fighters){
  for(const action of manifest.actions){
   const f=path.join(motionDir,`${id}__${action}.webp`);
   assert.ok(fs.existsSync(f),`Missing ${f}`);
   const file=fs.readFileSync(f);assert.ok(file.length>30000,`${id} ${action}: unexpectedly small animation`);
   assert.equal(file.subarray(0,4).toString(),'RIFF');assert.equal(file.subarray(8,12).toString(),'WEBP');
  }
 }
});
test('V15: client uses whole-body motion sheets and timed display after the server hit',()=>{
 const js=fs.readFileSync(path.join(publicDir,'arcade-fighters.js'),'utf8');
 assert.match(js,/\/motion\/.*__.*\.webp/);
 assert.match(js,/c\.drawImage\(sheet,Math\.min\(count-1,idx\)\*sw,0,sw,sh/);
 const main=fs.readFileSync(path.join(publicDir,'main.js'),'utf8');
 assert.match(main,/Math\.max\(\.42,attackLengths\[clock\.move\]\)/);
 assert.match(main,/renderer\?\.preload\(ff\.characterId\)/);
});
test('V15: unique launcher port prevents accidental V12/V13 game launch',()=>{
 const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
 const launcher=fs.readFileSync(path.join(__dirname,'..','START_PHILLY_BADLANDZ.bat'),'utf8');
 assert.match(server,/3124/);assert.match(server,/V15-SMOOTH-ARCADE/);
 assert.match(launcher,/3124/);assert.match(launcher,/V15-SMOOTH-ARCADE/);
 assert.ok(fs.existsSync(path.join(publicDir,'motion-check.html')));
});
