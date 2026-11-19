'use strict';
// Philly Badlandz Arcade Edition • all hits, rounds, abilities and health are server-authoritative.
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ROSTER = require('./public/roster.json');
const CHARACTERS = new Map(ROSTER.map(c => [c.id, c]));
const STAGES = new Set(['north-block', 'rooftop', 'basketball-court', 'subway', 'garage', 'underpass', 'corner-store', 'warehouse']);
const ARENA = { minX:65, maxX:895, speed:265, gravity:22, jump:7.1, roundSeconds:90, betweenSeconds:3.0, winsNeeded:2 };
const ATTACKS = Object.freeze({
  jab:        {damage:5,  blocked:1, range:126, windup:.09, duration:.23, knockback:12, stun:.11, meter:8},
  cross:      {damage:8,  blocked:2, range:136, windup:.13, duration:.30, knockback:18, stun:.14, meter:9},
  hook:       {damage:10, blocked:2, range:126, windup:.15, duration:.34, knockback:28, stun:.16, meter:10},
  uppercut:   {damage:14, blocked:3, range:125, windup:.21, duration:.47, knockback:49, stun:.24, meter:14},
  'front-kick': {damage:10, blocked:2, range:158, windup:.16, duration:.38, knockback:30, stun:.15, meter:11},
  roundhouse: {damage:14, blocked:3, range:169, windup:.22, duration:.48, knockback:45, stun:.19, meter:14},
  'spin-kick':{damage:17, blocked:4, range:179, windup:.23, duration:.55, knockback:58, stun:.22, meter:16},
  sweep:      {damage:12, blocked:3, range:153, windup:.23, duration:.51, knockback:31, stun:.20, meter:12},
  special:    {damage:24, blocked:5, range:185, windup:.26, duration:.72, knockback:77, stun:.34, meter:0, meterCost:50},
  ability:    {damage:20, blocked:4, range:999, windup:.43, duration:.85, knockback:52, stun:.28, meter:0},
  'air-jab':  {damage:7, blocked:2, range:138, windup:.11, duration:.29, knockback:18, stun:.14, meter:8},
  'air-kick': {damage:13, blocked:3, range:168, windup:.17, duration:.43, knockback:38, stun:.19, meter:12},
  ultra:      {damage:38, blocked:9, range:245, windup:.49, duration:1.3, knockback:94, stun:.42, meter:0, meterCost:100}
});
const ABILITIES = Object.freeze({
  piro:           {name:'HELLFIRE SHOT', effect:'fireball', damage:21, range:425, cooldown:13},
  speedy:         {name:'FLASH STEP', effect:'dash', damage:19, range:360, cooldown:12},
  'htb-druski':   {name:'GROUND BREAKER', effect:'quake', damage:24, range:235, cooldown:15},
  'bfa-strange':  {name:'SKY THUNDER', effect:'lightning', damage:23, range:505, cooldown:15},
  'gcg-doughboy': {name:'TRASH CAN TOSS', effect:'trashcan', damage:22, range:405, cooldown:14},
  verge:          {name:'BRICK LAUNCH', effect:'brick', damage:20, range:430, cooldown:12},
  'the-crackhead':{name:'BOTTLE BARRAGE', effect:'bottles', damage:18, range:425, cooldown:11},
  'lucy-chucky':  {name:'SCARLET CYCLONE', effect:'cyclone', damage:23, range:290, cooldown:14},
  'lexa-birdface':{name:'BIRD STORM', effect:'birdstorm', damage:20, range:390, cooldown:12}
});
const ULTRAS = Object.freeze({
 piro:'REDLINE INFERNO', speedy:'BLUR CITY BLITZ', 'htb-druski':'BLOCK SHAKER',
 'bfa-strange':'STORM WARNING', 'gcg-doughboy':'HEAVY BAG SPECIAL',
 verge:'BRICK CITY BREAKER', 'the-crackhead':'WILD NIGHT',
 'lucy-chucky':'SCARLET RAMPAGE', 'lexa-birdface':'WINGS OF FURY'
});
const cleanName = value => String(value ?? 'Fighter').replace(/[\u0000-\u001F\u007F<>]/g,'').trim().slice(0,20)||'Fighter';
const chooseCharacter = value => CHARACTERS.has(value)?value:'piro';
const chooseStage = value => STAGES.has(value)?value:'north-block';
const clamp = (n,lo,hi)=>Math.max(lo,Math.min(hi,n));
function makeFighter(slot,characterId) {
 return {slot,characterId,x:slot===0?320:640,height:0,vy:0,facing:slot===0?1:-1,hp:100,
  blocking:false,input:{left:false,right:false,jump:false,block:false,crouch:false},jumpHeld:false,
  crouching:false,dodge:0,dodgeCooldown:0,dodgeDir:0,
  attack:null,queued:null,cooldown:0,hurt:0,flash:0,vx:0,meter:0,combo:0,comboWindow:0,
  chain:[],chainWindow:0,abilityCooldown:0, lastAttackAt:-100};
}
function newRoom(code,mode,stage='north-block') {
 return {code,mode,stage,players:[],phase:'waiting',fighters:[],timeLeft:ARENA.roundSeconds,
  winnerSlot:null,round:0,scores:[0,0],intermission:0,ready:new Set()};
}
function createGameServer(port=Number(process.env.PORT)||3124) {
 const app=express(),server=http.createServer(app),io=new Server(server,{maxHttpBufferSize:15000}),rooms=new Map();
 app.use(express.static(path.join(__dirname,'public'),{setHeaders(res){res.setHeader('Cache-Control','no-store, max-age=0');}}));
 app.get('/health',(_req,res)=>res.json({ok:true,roomCount:rooms.size,version:"V15-SMOOTH-ARCADE"}));
 app.get('/api/rooms',(_req,res)=>res.set('Cache-Control','no-store').json([...rooms.values()].filter(r=>r.mode==='online'&&r.phase==='waiting'&&r.players.length===1).slice(0,60).map(r=>({code:r.code,host:r.players[0].name,players:r.players.length,stage:r.stage}))));
 let timer=null;
 function code(){let c;const s='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';do{c=Array.from({length:4},()=>s[Math.floor(Math.random()*s.length)]).join('')}while(rooms.has(c));return c;}
 const getRoom=socket=>rooms.get(socket.data.roomCode);
 function notifyRoom(room){room.players.forEach((p,slot)=>io.to(p.id).emit('room-update',{
  code:room.code,slot,mode:room.mode,stage:room.stage,phase:room.phase,round:room.round,scores:room.scores,
  players:room.players.map(({name,characterId})=>({name,characterId})),ready:room.ready.size}));}
 function publicFighter(f){return {slot:f.slot,characterId:f.characterId,x:Math.round(f.x*10)/10,
  height:Math.round(f.height*100)/100,vx:f.vx,facing:f.facing,hp:f.hp,meter:f.meter,combo:f.combo,
  blocking:f.blocking,crouching:f.crouching,dodgeProgress:f.dodge>0?clamp(1-f.dodge/.24,0,1):0,dodgeCooldown:Math.ceil(f.dodgeCooldown*10)/10,abilityCooldown:Math.ceil(f.abilityCooldown*10)/10,
  action:f.hp<=0?'ko':f.hurt>.01?'hurt':f.dodge>0?'dodge':f.attack?f.attack.move:f.blocking?'block':f.crouching?'crouch':f.height>.06?'jump':Math.abs(f.vx)>10?'walk':'idle',
  attackProgress:f.attack?clamp(f.attack.elapsed/ATTACKS[f.attack.move].duration,0,1):0,flash:f.flash>0};}
 const snapshot=room=>({phase:room.phase,timeLeft:Math.max(0,Math.ceil(room.timeLeft)),fighters:room.fighters.map(publicFighter),round:room.round,scores:[...room.scores],intermission:room.intermission});
 const broadcast=room=>io.to(room.code).emit('fight-state',snapshot(room));
 function startRound(room){
  if(room.mode==='online'&&room.players.length!==2)return;
  room.phase='active';room.timeLeft=ARENA.roundSeconds;room.winnerSlot=null;room.round++;room.ready.clear();room.intermission=0;
  room.fighters=[makeFighter(0,room.players[0].characterId),makeFighter(1,room.mode==='cpu'?room.cpuCharacter:room.players[1].characterId)];
  const players=room.mode==='cpu'?[{name:room.players[0].name,characterId:room.players[0].characterId},{name:'BADLANDZ CPU',characterId:room.cpuCharacter}]:room.players.map(({name,characterId})=>({name,characterId}));
  io.to(room.code).emit('match-start',{players,mode:room.mode,round:room.round,stage:room.stage,scores:[...room.scores]});
  broadcast(room);notifyRoom(room);
 }
 function startMatch(room){room.scores=[0,0];room.round=0;startRound(room);}
 function endRound(room,reason){
  if(room.phase!=='active')return;
  const [a,b]=room.fighters;room.winnerSlot=a.hp===b.hp?null:a.hp>b.hp?0:1;
  if(room.winnerSlot!==null)room.scores[room.winnerSlot]++;
  const matchOver=room.scores.some(v=>v>=ARENA.winsNeeded);
  room.phase=matchOver?'finished':'intermission';room.intermission=matchOver?0:ARENA.betweenSeconds;
  broadcast(room);
  const detail={winnerSlot:room.winnerSlot,reason,hp:[a.hp,b.hp],round:room.round,scores:[...room.scores],matchOver,nextRound:room.round+1,seconds:room.intermission};
  io.to(room.code).emit('round-end',detail);
  if(matchOver)io.to(room.code).emit('match-end',{winnerSlot:room.winnerSlot,scores:[...room.scores],rounds:room.round});
  notifyRoom(room);
 }
 function attack(room,slot,kind){
  if(room.phase!=='active'||!['punch','kick','heavy','uppercut','sweep','special','ultra','ability'].includes(kind))return false;
  const f=room.fighters[slot];if(!f||f.hp<=0||f.blocking||f.hurt>0||f.dodge>0)return false;
  // One buffered normal move makes J-J-K and similar real consecutive strings, not just a label.
  if(f.attack){if(!f.queued && ['punch','kick','heavy','uppercut','sweep'].includes(kind) && f.attack.move!=='ability'){
   f.queued=kind;return true;
  }return false;}
  if(f.cooldown>0)return false;
  return beginAttack(room,f,kind);
 }
 function beginAttack(room,f,kind,fromQueue=false){
  const now=ARENA.roundSeconds-room.timeLeft;
  if(kind==='special' && f.meter<50)return false;
  if(kind==='ultra' && f.meter<100)return false;
  if(kind==='ability' && f.abilityCooldown>0)return false;
  let move=kind;
  if(kind==='punch'&&f.height>.15)move='air-jab';
  if(kind==='kick'&&f.height>.15)move='air-kick';
  if(kind==='punch'&&f.height<=.15)move=(f.chainWindow>0&&f.chain.at(-1)==='punch')?(f.chain.filter(a=>a==='punch').length%2?'cross':'hook'):'jab';
  if(kind==='kick'&&f.height<=.15)move=(f.chainWindow>0&&f.chain.at(-1)==='kick')?'spin-kick':'front-kick';
  if(kind==='heavy')move='roundhouse';
  const cfg=ATTACKS[move];if(!cfg)return false;
  if(kind==='special')f.meter-=50;
  if(kind==='ultra')f.meter-=100;
  if(kind==='ability')f.abilityCooldown=ABILITIES[f.characterId].cooldown;
  const isNormal=!['special','ultra','ability'].includes(kind);
  if(isNormal){
   if(f.chainWindow<=0)f.chain=[];
   f.chain.push(kind==='heavy'?'kick':kind==='uppercut'?'punch':kind);f.chain=f.chain.slice(-4);f.chainWindow=1.6;
  }else{f.chain=[];f.chainWindow=0;}
  // Recognized three-input routes have stronger finishers and a distinctive callout.
  const last=f.chain.slice(-3).join('-');
  const comboNames={'punch-punch-kick':'BADLANDZ RUSH','punch-kick-punch':'STREET MIXUP','kick-kick-punch':'SPIN CYCLE','punch-punch-punch':'THREE PIECE','kick-kick-kick':'KICKSTORM'};
  const finisher=comboNames[last]||null;
  if(finisher&&!['uppercut','ability','air-jab','air-kick'].includes(move)){
   if(last==='punch-punch-kick')move='roundhouse';
   else if(last==='punch-kick-punch')move='hook';
   else if(last==='kick-kick-punch')move='uppercut';
   else if(last==='punch-punch-punch')move='hook';
   else if(last==='kick-kick-kick')move='spin-kick';
  }
  const other=room.fighters[1-f.slot];
  f.attack={move,kind,elapsed:0,landed:false,finisher,targetX:other?.x};f.queued=null;f.cooldown=ATTACKS[move].duration+(fromQueue?0:.025);
  f.lastAttackAt=now;
  const ability=kind==='ability'?ABILITIES[f.characterId]:null;
  io.to(room.code).emit('attack-start',{slot:f.slot,move,ability:ability?.effect||null,abilityName:ability?.name||null,ultraName:kind==='ultra'?ULTRAS[f.characterId]:null,x:f.x,targetX:other?.x, facing:f.facing,finisher});
  return true;
 }
 function resolveHit(room,f){
  const atk=f.attack,cfg=ATTACKS[atk.move],other=room.fighters[1-f.slot];
  if(!other||other.hp<=0||f.hp<=0)return;
  let range=cfg.range,locationX=other.x,dodgeWindow=Infinity;
  let ability=null;
  if(atk.move==='ability'){
   ability=ABILITIES[f.characterId];range=ability.range;
   // Sky lightning strikes the marked landing point, rather than magically following a dodging opponent.
   if(ability.effect==='lightning'){locationX=atk.targetX;dodgeWindow=78;}
   if(ability.effect==='dash'){f.x=clamp(f.x+f.facing*Math.min(225,Math.abs(other.x-f.x)-45),ARENA.minX,ARENA.maxX);range=150;}
  }
  const dx=other.x-f.x;
  if(other.dodge>0){io.to(room.code).emit('attack-miss',{slot:f.slot,move:atk.move,x:other.x,evaded:true});return;}
  if(Math.abs(dx)>range||dx*f.facing<=0||Math.abs(f.height-other.height)>(ability?2.5:1.8)||Math.abs(other.x-locationX)>dodgeWindow) {
   io.to(room.code).emit('attack-miss',{slot:f.slot,move:atk.move,x:other.x});return;
  }
  const guarded=other.blocking&&other.hurt<=0&&other.height<.12&&other.facing===-f.facing;
  // Low crouch reduces standing jabs; sweeps are the counter to crouch.
  const ducksHigh=other.crouching&&!other.blocking&&['jab','cross','hook','air-jab'].includes(atk.move);
  if(ducksHigh){io.to(room.code).emit('attack-miss',{slot:f.slot,move:atk.move,x:other.x,ducked:true});return;}
  let damage=guarded?cfg.blocked:cfg.damage;
  if(ability)damage=guarded?Math.max(3,Math.round(ability.damage*.23)):ability.damage;
  if(atk.finisher&&!guarded)damage+=5;
  if(!guarded){f.combo=f.comboWindow>0?f.combo+1:1;f.comboWindow=2.2;}
  else{f.combo=0;f.comboWindow=0;}
  f.meter=clamp(f.meter+(guarded?4:cfg.meter||0),0,100);
  other.meter=clamp(other.meter+(guarded?8:6),0,100);
  other.hp=Math.max(0,other.hp-damage);other.flash=.21;
  other.x=clamp(other.x+f.facing*(guarded?8:cfg.knockback),ARENA.minX,ARENA.maxX);
  if(!guarded){other.hurt=other.hp===0?0:cfg.stun;other.blocking=false;other.crouching=false;other.queued=null;other.attack=null;}
  io.to(room.code).emit('hit',{attacker:f.slot,target:other.slot,type:atk.move,ability:ability?.effect||null,damage,blocked:guarded,x:other.x,hp:other.hp,combo:f.combo,finisher:atk.finisher,meter:f.meter});
  if(other.hp<=0)endRound(room,'knockout');
 }
 function cpuBrain(room){
  const f=room.fighters[1],op=room.fighters[0];if(!f||!op||f.hp<=0)return;
  const dist=Math.abs(f.x-op.x),dir=Math.sign(op.x-f.x),now=ARENA.roundSeconds-room.timeLeft;
  f.input.left=dist>96&&dir<0;f.input.right=dist>96&&dir>0;
  f.input.block=dist<165&&op.attack&&op.attack.elapsed<.13&&Math.sin(now*3.2)>.43;
  f.input.jump=false;f.input.crouch=dist<175&&op.attack&&Math.sin(now*2.7)>.87;
  if(dist<200&&f.meter>=100&&f.cooldown<=0&&!f.hurt&&!f.attack&&!f.input.block&&Math.sin(now*1.83)>.45){beginAttack(room,f,'ultra');}
  else if(dist<155&&f.cooldown<=0&&!f.hurt&&!f.attack&&!f.input.block){beginAttack(room,f,Math.sin(now*3.5)>0?'punch':Math.sin(now*1.73)>.8?'sweep':'kick');}
  if(dist<375&&f.abilityCooldown<=0&&now>2&&Math.sin(now*1.3)>.985&&!f.attack&&!f.hurt){beginAttack(room,f,'ability');}
 }
 function simulateFighter(room,f,dt){
  if(!f||f.hp<=0)return;
  f.cooldown=Math.max(0,f.cooldown-dt);f.hurt=Math.max(0,f.hurt-dt);
  f.flash=Math.max(0,f.flash-dt);f.abilityCooldown=Math.max(0,f.abilityCooldown-dt);
  f.dodgeCooldown=Math.max(0,f.dodgeCooldown-dt);f.dodge=Math.max(0,f.dodge-dt);
  f.comboWindow=Math.max(0,f.comboWindow-dt);if(!f.comboWindow)f.combo=0;
  f.chainWindow=Math.max(0,f.chainWindow-dt);if(!f.chainWindow)f.chain=[];
  const foe=room.fighters[1-f.slot];if(foe&&Math.abs(foe.x-f.x)>1)f.facing=foe.x>f.x?1:-1;
  f.crouching=!!f.input.crouch&&f.height<.12&&!f.attack&&f.hurt===0&&f.dodge===0;
  f.blocking=!!f.input.block&&!f.attack&&f.hurt===0&&f.height<.12&&f.dodge===0;
  let move=(f.input.right?1:0)-(f.input.left?1:0);if(f.hurt>0)move=0;
  const styleSpeed=CHARACTERS.get(f.characterId)?.speedFactor||1;
  f.vx=move*ARENA.speed*styleSpeed*(f.blocking?.3:f.attack?.41:1);
  if(f.dodge>0)f.vx=f.dodgeDir*850;
  f.x=clamp(f.x+f.vx*dt,ARENA.minX,ARENA.maxX);
  if(f.input.jump&&!f.jumpHeld&&f.height<=0&&f.hurt===0&&!f.attack&&!f.crouching&&f.dodge<=0)f.vy=ARENA.jump;
  f.jumpHeld=f.input.jump;
  if(f.height>0||f.vy>0){f.height=Math.max(0,f.height+f.vy*dt);f.vy-=ARENA.gravity*dt;if(f.height===0)f.vy=0;}
  if(f.attack){
   f.attack.elapsed+=dt;
   const a=f.attack,cfg=ATTACKS[a.move];
   if(a.move==='ability'&&a.targetX===undefined)a.targetX=foe?.x;
   if(!a.landed&&a.elapsed>=cfg.windup){a.landed=true;resolveHit(room,f);}
   if(room.phase==='active'&&f.attack===a&&a.elapsed>=cfg.duration){
    f.attack=null;
    if(f.queued){const next=f.queued;f.queued=null;f.cooldown=0;beginAttack(room,f,next,true);}
   }
  }
 }
 function tick(){
  for(const room of rooms.values()){
   const dt=1/30;
   if(room.phase==='intermission'){
    room.intermission=Math.max(0,room.intermission-dt);
    if(!room.intermission)startRound(room);
    continue;
   }
   if(room.phase!=='active')continue;
   if(room.mode==='cpu')cpuBrain(room);
   simulateFighter(room,room.fighters[0],dt);
   if(room.phase==='active')simulateFighter(room,room.fighters[1],dt);
   if(room.phase!=='active')continue;
   const [a,b]=room.fighters;
   if(Math.abs(a.x-b.x)<54){const mid=(a.x+b.x)/2,sign=a.x<=b.x?1:-1;
    a.x=clamp(mid-27*sign,ARENA.minX,ARENA.maxX);b.x=clamp(mid+27*sign,ARENA.minX,ARENA.maxX);}
   room.timeLeft=Math.max(0,room.timeLeft-dt);
   if(!room.timeLeft)endRound(room,'time');else broadcast(room);
  }
 }
 function joinRoom(socket,room,details,cb){
  if(getRoom(socket))return cb?.({ok:false,error:'Leave your current room first.'});
  const p={id:socket.id,name:cleanName(details?.name),characterId:chooseCharacter(details?.characterId),lastChat:0};
  room.players.push(p);socket.data.roomCode=room.code;socket.join(room.code);
  cb?.({ok:true,code:room.code,slot:room.players.length-1,mode:room.mode,stage:room.stage,
    players:room.players.map(v=>({name:v.name,characterId:v.characterId}))});
  notifyRoom(room);
  if(room.mode==='cpu'||room.players.length===2)startMatch(room);
 }
 function leaveRoom(socket){
  const room=getRoom(socket);if(!room)return;
  room.players=room.players.filter(p=>p.id!==socket.id);room.ready.clear();
  socket.leave(room.code);delete socket.data.roomCode;
  if(!room.players.length){rooms.delete(room.code);return;}
  room.phase='waiting';room.fighters=[];room.winnerSlot=null;room.round=0;room.scores=[0,0];
  io.to(room.code).emit('opponent-left');notifyRoom(room);
 }
 io.on('connection',socket=>{
  socket.on('create-room',(d,cb)=>{if(getRoom(socket))return cb?.({ok:false,error:'Leave your current room first.'});const c=code(),room=newRoom(c,'online',chooseStage(d?.stage));rooms.set(c,room);joinRoom(socket,room,d,cb);});
  socket.on('quick-match',(d,cb)=>{if(getRoom(socket))return cb?.({ok:false,error:'Leave your current room first.'});let room=[...rooms.values()].find(r=>r.mode==='online'&&r.phase==='waiting'&&r.players.length===1);if(!room){const c=code();room=newRoom(c,'online',chooseStage(d?.stage));rooms.set(c,room);}joinRoom(socket,room,d,cb);});
  socket.on('practice',(d,cb)=>{if(getRoom(socket))return cb?.({ok:false,error:'Leave your current room first.'});const c=code(),room=newRoom(c,'cpu',chooseStage(d?.stage));room.cpuCharacter=chooseCharacter(d?.cpuCharacter||'htb-druski');rooms.set(c,room);joinRoom(socket,room,d,cb);});
  socket.on('join-room',(d,cb)=>{const c=String(d?.code||'').trim().toUpperCase(),room=rooms.get(c);
   if(!room||room.mode!=='online')return cb?.({ok:false,error:'Room not found.'});
   if(room.players.length>=2)return cb?.({ok:false,error:'Room is full.'});
   if(room.phase!=='waiting')return cb?.({ok:false,error:'Match already started.'});joinRoom(socket,room,d,cb);
  });
  socket.on('leave-room',()=>leaveRoom(socket));
  socket.on('input',input=>{const room=getRoom(socket);if(!room||room.phase!=='active'||!input||typeof input!=='object')return;
   const slot=room.players.findIndex(p=>p.id===socket.id),f=room.fighters[slot];if(!f)return;
   f.input={left:input.left===true,right:input.right===true,jump:input.jump===true,block:input.block===true,crouch:input.crouch===true};
  });
  socket.on('evade',()=>{const room=getRoom(socket);if(!room||room.phase!=='active')return;
   const slot=room.players.findIndex(p=>p.id===socket.id),f=room.fighters[slot];
   if(!f||f.hp<=0||f.height>.08||f.hurt>0||f.attack||f.dodgeCooldown>0||f.blocking)return;
   const direction=f.input.left&&!f.input.right?-1:f.input.right&&!f.input.left?1:-f.facing;
   f.dodgeDir=direction;f.dodge=.24;f.dodgeCooldown=1.55;f.crouching=false;f.blocking=false;
   io.to(room.code).emit('evade-start',{slot,direction,x:f.x});
  });
  socket.on('attack',value=>{const room=getRoom(socket);if(!room||room.phase!=='active')return;
   const slot=room.players.findIndex(p=>p.id===socket.id);if(slot<0)return;
   attack(room,slot,value?.type);
  });
  socket.on('rematch',()=>{const room=getRoom(socket);if(!room||room.phase!=='finished')return;
   if(room.mode==='cpu'){startMatch(room);return;}
   room.ready.add(socket.id);notifyRoom(room);
   if(room.ready.size===2&&room.players.length===2)startMatch(room);
  });
  socket.on('chat',value=>{const room=getRoom(socket),p=room?.players.find(v=>v.id===socket.id);if(!p||typeof value!=='string')return;
   const now=Date.now();if(now-p.lastChat<850)return;
   p.lastChat=now;const message=value.replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,140);
   if(message)io.to(room.code).emit('chat',{name:p.name,message});
  });
  socket.on('disconnect',()=>leaveRoom(socket));
 });
 function listen(){return new Promise(resolve=>server.listen(port,()=>{timer=setInterval(tick,1000/30);timer.unref?.();resolve(server.address().port);}));}
 function close(){if(timer)clearInterval(timer);return new Promise(resolve=>io.close(()=>server.close(()=>resolve())));}
 return {app,server,io,rooms,listen,close,ATTACKS,ABILITIES,tick};
}
if(require.main===module){const game=createGameServer();game.listen().then(port=>console.log('PHILLY BADLANDZ • FULL BODY ANIMATED V15 • http://localhost:'+port));}
module.exports={createGameServer,ATTACKS,ABILITIES,ULTRAS,ARENA};
