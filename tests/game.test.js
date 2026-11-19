'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createGameServer,ABILITIES,ARENA}=require('../server');
const roster=require('../public/roster.json');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Client extends EventEmitter {
 constructor(port){super();this.nextId=0;this.callbacks=new Map();this.ws=new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
 this.ws.onmessage=e=>{const msg=String(e.data);
  if(msg[0]==='0'){this.ws.send('40');return;}if(msg==='2'){this.ws.send('3');return;}
  if(msg.startsWith('40')){super.emit('connect');return;}
  if(msg.startsWith('42')){const ix=msg.indexOf('[');if(ix<0)return;const [name,payload]=JSON.parse(msg.slice(ix));super.emit(name,payload);return;}
  if(msg.startsWith('43')){const ix=msg.indexOf('[');if(ix<0)return;const id=Number(msg.slice(2,ix));const cb=this.callbacks.get(id);this.callbacks.delete(id);cb?.(JSON.parse(msg.slice(ix))[0]);}
 };}
 send(name,payload,cb){let prefix='42';if(cb){const id=this.nextId++;this.callbacks.set(id,cb);prefix+=String(id);}this.ws.send(prefix+JSON.stringify([name,payload]));}
 disconnect(){this.ws.close();}
}
function ack(c,name,value){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Timeout '+name)),3000);c.send(name,value,v=>{clearTimeout(timer);resolve(v);});});}
function on(c,name){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{c.off(name,handler);reject(Error('Timeout '+name));},3000);function handler(v){clearTimeout(timer);resolve(v);}c.once(name,handler);});}
async function setup(stage='north-block',p1='piro',p2='lexa-birdface'){
 const game=createGameServer(0),port=await game.listen(),a=new Client(port),b=new Client(port);
 await Promise.all([on(a,'connect'),on(b,'connect')]);
 const r=await ack(a,'create-room',{name:'Fighter A',characterId:p1,stage});const started=on(a,'match-start');
 const j=await ack(b,'join-room',{code:r.code,name:'Fighter B',characterId:p2,stage:'north-block'});await started;
 return {game,a,b,room:game.rooms.get(r.code),joined:j,code:r.code,async close(){a.disconnect();b.disconnect();await game.close();}};
}
function setNear(room){const [f,b]=room.fighters;f.x=420;f.facing=1;b.x=535;b.facing=-1;b.input.block=false;b.hurt=0;}
async function hit(attacker,move){const impact=on(attacker,'hit');attacker.send('attack',{type:move});return impact;}
test('Online sync: jab connects, block reduces damage, input cannot forge HP',async()=>{
 const t=await setup();try{
 setNear(t.room);t.a.send('input',{hp:0,position:8999});const h=await hit(t.a,'punch');
 assert.equal(h.type,'jab');assert.equal(h.damage,5);assert.equal(t.room.fighters[1].hp,95);assert.equal(t.room.fighters[0].hp,100);
 await wait(300);setNear(t.room);t.b.send('input',{block:true});await wait(80);
 const guard=await hit(t.a,'kick');assert.equal(guard.blocked,true);assert.equal(guard.damage,2);assert.equal(t.room.fighters[1].hp,93);
 }finally{await t.close();}
});
test('True input-buffered J-J-K combo: separate punches and kick finisher',async()=>{
 const t=await setup();try{
 setNear(t.room);const impacts=[];const started=[];
 t.a.on('hit',e=>impacts.push(e));t.a.on('attack-start',e=>started.push(e));
 t.a.send('attack',{type:'punch'});await wait(90);t.a.send('attack',{type:'punch'});await wait(190);
 t.a.send('attack',{type:'kick'});await wait(890);
 assert(impacts.length>=3,'Three separate registered hits');
 assert.deepEqual(impacts.slice(0,3).map(e=>e.type),['jab','cross','roundhouse']);
 assert.equal(impacts[2].finisher,'BADLANDZ RUSH');assert.equal(impacts[2].combo,3);
 assert(impacts[2].damage>impacts[1].damage,'Finisher deals bonus damage');
 assert(started.some(e=>e.finisher==='BADLANDZ RUSH'));
 }finally{await t.close();}
});
test('Best of three automatically advances after round 1 and ends match only at two wins',async()=>{
 const t=await setup();try{
 setNear(t.room);t.room.fighters[1].hp=4;
 const first=on(t.a,'round-end');t.a.send('attack',{type:'punch'});const result=await first;
 assert.equal(result.matchOver,false);assert.deepEqual(result.scores,[1,0]);assert.equal(t.room.phase,'intermission');
 t.room.intermission=.001;const next=on(t.a,'match-start');t.game.tick();const round2=await next;
 assert.equal(round2.round,2);assert.deepEqual(round2.scores,[1,0]);assert.equal(t.room.fighters[1].hp,100);
 setNear(t.room);t.room.fighters[1].hp=4;const ended=on(t.a,'round-end');const matchEnd=on(t.a,'match-end');
 t.a.send('attack',{type:'punch'});const r2=await ended;const final=await matchEnd;
 assert.equal(r2.matchOver,true);assert.deepEqual(final.scores,[2,0]);assert.equal(t.room.phase,'finished');
 const nextMatch=on(t.a,'match-start');t.a.send('rematch');await wait(60);assert.equal(t.room.phase,'finished');t.b.send('rematch');
 const fresh=await nextMatch;assert.equal(fresh.round,1);assert.deepEqual(fresh.scores,[0,0]);
 }finally{await t.close();}
});
test('Nine character-specific abilities: server validates cooldown and lightning can be dodged',async()=>{
 assert.equal(roster.length,9);assert.equal(Object.keys(ABILITIES).length,9);
 assert.equal(new Set(Object.values(ABILITIES).map(a=>a.effect)).size,9);
 for(const c of roster){assert(ABILITIES[c.id]);assert.equal(c.abilityName,ABILITIES[c.id].name);}
 const t=await setup('subway','bfa-strange','speedy');try{
 assert.equal(t.joined.stage,'subway');setNear(t.room);
 const cast=on(t.a,'attack-start'),land=on(t.a,'hit');t.a.send('attack',{type:'ability'});
 const a=await cast;assert.equal(a.ability,'lightning');const strike=await land;
 assert.equal(strike.type,'ability');assert.equal(strike.damage,23);
 assert(t.room.fighters[0].abilityCooldown>10);
 await wait(870);setNear(t.room);t.a.send('attack',{type:'ability'});await wait(80);
 assert.equal(t.room.fighters[0].attack,null,'Ability cannot be spammed during cooldown');
 t.room.fighters[0].abilityCooldown=0;
 const cast2=on(t.a,'attack-start');t.a.send('attack',{type:'ability'});await cast2;
 // Opponent escapes the marked strike tile while lightning charges.
 t.room.fighters[1].x=840;await wait(550);
 assert.equal(t.room.fighters[1].hp,77,'Moving out of the lightning target avoids the second strike');
 }finally{await t.close();}
});
test('All eight stages, invalid stage fallback, special meter consumption',async()=>{
 for(const stage of ['north-block','rooftop','basketball-court','subway','garage','underpass','corner-store','warehouse']){
  const t=await setup(stage);try{assert.equal(t.room.stage,stage);}finally{await t.close();}
 }
 const t=await setup('invalid','piro','verge');try{
 assert.equal(t.room.stage,'north-block');setNear(t.room);
 t.a.send('attack',{type:'special'});await wait(55);assert.equal(t.room.fighters[0].attack,null);
 t.room.fighters[0].meter=66;const result=await hit(t.a,'special');
 assert.equal(result.damage,24);assert.equal(t.room.fighters[0].meter,16);
 }finally{await t.close();}
});
test('CPU training launches as a normal three-round match',async()=>{
 const game=createGameServer(0),port=await game.listen(),c=new Client(port);
 try{await on(c,'connect');const started=on(c,'match-start');const r=await ack(c,'practice',{name:'Practice',characterId:'speedy',cpuCharacter:'verge',stage:'warehouse'});
 const start=await started;assert.equal(r.mode,'cpu');assert.equal(start.stage,'warehouse');assert.equal(start.round,1);
 const room=game.rooms.get(r.code);await wait(100);assert(room.fighters[1].x<640);
 }finally{c.disconnect();await game.close();}
});
test('Best of three contested match reaches round 3 at 1-1 before 2-1 final',async()=>{
 const t=await setup();try{
 const next=()=>{t.room.intermission=.001;t.game.tick();};
 t.room.fighters[1].hp=6;t.room.timeLeft=.001;t.game.tick();
 assert.deepEqual(t.room.scores,[1,0]);assert.equal(t.room.phase,'intermission');
 next();assert.equal(t.room.round,2);
 t.room.fighters[0].hp=8;t.room.timeLeft=.001;t.game.tick();
 assert.deepEqual(t.room.scores,[1,1]);assert.equal(t.room.phase,'intermission');
 next();assert.equal(t.room.round,3);
 t.room.fighters[1].hp=4;t.room.timeLeft=.001;t.game.tick();
 assert.deepEqual(t.room.scores,[2,1]);assert.equal(t.room.phase,'finished');
 }finally{await t.close();}
});
test('V5 real multiplayer room browser, quick match joining, and roster synchronization',async()=>{
 const game=createGameServer(0),port=await game.listen(),a=new Client(port),b=new Client(port);
 try{
  await Promise.all([on(a,'connect'),on(b,'connect')]);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/api/rooms`)).json(),[]);
  const room=await ack(a,'quick-match',{name:'Piro One',characterId:'piro',stage:'garage'});
  assert(room.ok);assert.equal(room.mode,'online');
  const listed=await (await fetch(`http://127.0.0.1:${port}/api/rooms`)).json();
  assert.equal(listed.length,1);assert.equal(listed[0].code,room.code);assert.equal(listed[0].host,'Piro One');assert.equal(listed[0].stage,'garage');
  const started=on(a,'match-start');
  const challenger=await ack(b,'quick-match',{name:'Lexa Two',characterId:'lexa-birdface',stage:'rooftop'});
  const match=await started;
  assert.equal(challenger.ok,true);assert.equal(challenger.code,room.code);assert.equal(challenger.slot,1);
  assert.equal(match.stage,'garage','room stage remains host-authoritative');
  assert.equal(match.players[0].characterId,'piro');assert.equal(match.players[1].characterId,'lexa-birdface');
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/rooms`)).json()).length,0,'full rooms are not shown as joinable');
 }finally{a.disconnect();b.disconnect();await game.close();}
});
test('V6: nine unique styles and Ultra names, 100-meter Ultra server validation',async()=>{
 const {ULTRAS}=require('../server');
 assert.equal(new Set(roster.map(f=>f.fightingStyle)).size,9);
 assert.equal(new Set(roster.map(f=>f.ultraName)).size,9);
 assert.equal(Object.keys(ULTRAS).length,9);
 const t=await setup('north-block','piro','speedy');
 try{
  setNear(t.room);
  t.a.send('attack',{type:'ultra'});await wait(50);
  assert.equal(t.room.fighters[0].attack,null,'ultra must not fire without meter');
  t.room.fighters[0].meter=100;
  const start=on(t.a,'attack-start'),h=on(t.a,'hit');
  t.a.send('attack',{type:'ultra'});
  const signal=await start,impact=await h;
  assert.equal(signal.ultraName,'REDLINE INFERNO');
  assert.equal(signal.move,'ultra');
  assert.equal(impact.type,'ultra');assert.equal(impact.damage,38);
  assert.equal(t.room.fighters[0].meter,0,'100 meter consumed');
  assert.equal(t.room.fighters[1].hp,62);
 }finally{await t.close();}
});
test('V6: crouching ducks high jabs but cannot duck a low sweep',async()=>{
 const t=await setup();try{
  setNear(t.room);t.b.send('input',{crouch:true});await wait(95);
  assert.equal(t.room.fighters[1].crouching,true);
  const miss=on(t.a,'attack-miss');t.a.send('attack',{type:'punch'});
  const evasion=await miss;assert.equal(evasion.ducked,true);
  assert.equal(t.room.fighters[1].hp,100);
  await wait(320);setNear(t.room);
  const landed=await hit(t.a,'sweep');
  assert.equal(landed.type,'sweep');assert.equal(landed.damage,12);
  assert.equal(t.room.fighters[1].hp,88);
 }finally{await t.close();}
});
test('V6: server-approved evade grants short invulnerability and a cooldown',async()=>{
 const t=await setup();try{
  setNear(t.room);const evaded=on(t.a,'attack-miss'),dash=on(t.a,'evade-start');
  t.b.send('evade');await dash;
  assert(t.room.fighters[1].dodge>0);
  t.a.send('attack',{type:'punch'});
  const result=await evaded;assert.equal(result.evaded,true);
  assert.equal(t.room.fighters[1].hp,100);
  const cool=t.room.fighters[1].dodgeCooldown;
  t.b.send('evade');await wait(50);
  assert(t.room.fighters[1].dodgeCooldown<cool,'second evade blocked during cooldown');
 }finally{await t.close();}
});
test('V6: jumping fighters can use airborne punches',async()=>{
 const t=await setup();try{
  setNear(t.room);t.room.fighters[0].height=.65;t.room.fighters[0].vy=.01;
  t.room.fighters[1].height=.65;t.room.fighters[1].vy=.01;
  const landed=await hit(t.a,'punch');assert.equal(landed.type,'air-jab');
 }finally{await t.close();}
});
