'use strict';
(()=>{
const $=id=>document.getElementById(id),socket=io();
let roster=[],chosen='piro',stage='north-block',slot=0,room='',mode='online',phase='waiting',players=[],latest=[],shown=[],timeLeft=99,renderer,previewRenderer,raf=0,frame=0,lastSent=0;
let keyboard={},touch={},effects=[],rematchRequested=false,connectedOnce=false,scores=[0,0],roundNumber=1,impactTime=0;
// The authoritative server stays at 30Hz. These clocks interpolate only the
// presentation of each strike at display refresh rate (typically 60-144Hz).
const attackLengths={jab:.37,cross:.44,hook:.48,uppercut:.54,'front-kick':.60,roundhouse:.67,'spin-kick':.73,sweep:.62,
 special:.72,ability:.85,ultra:1.3,'air-jab':.29,'air-kick':.43};
let animationClocks=[null,null];

const label=(id,v)=>{$(id).textContent=v;};
function notice(msg,bad=false){label('status',msg);$('status').className='status '+(bad?'bad':'good');}
function isTyping(){return ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;}
function sendInput(){if(!room||phase!=='active')return;socket.emit('input',{
 left:!!(keyboard.a||keyboard.arrowleft||touch.a),right:!!(keyboard.d||keyboard.arrowright||touch.d),
 jump:!!(keyboard.w||keyboard.arrowup||touch.w),block:!!(keyboard.l||touch.l),crouch:!!(keyboard.c||touch.c)
});}
const sound=(name)=>window.BadlandzSound?.play(name);
function attack(type){if(room&&phase==='active'){window.BadlandzSound?.unlock();socket.emit('attack',{type});}}
function evade(){if(room&&phase==='active'){window.BadlandzSound?.unlock();socket.emit('evade');}}
function requestFull(){if(!document.fullscreenElement){const request=document.documentElement.requestFullscreen?.({navigationUI:'hide'});request?.catch?.(()=>{});}}
function toggleFull(){if(document.fullscreenElement){const exit=document.exitFullscreen?.();exit?.catch?.(()=>{});}else requestFull();}
function joinFullscreen(){requestFull();window.BadlandzSound?.unlock();}
$('fullscreenToggle').onclick=toggleFull;$('arenaFullscreen').onclick=toggleFull;
function toggleSound(){const now=!window.BadlandzSound?.isEnabled();window.BadlandzSound?.setEnabled(now);$('soundToggle').textContent=now?'🔊 SOUND ON':'🔇 MUTED';$('arenaSound').textContent=now?'🔊':'🔇';if(now)sound('round');}
$('soundToggle').onclick=toggleSound;$('arenaSound').onclick=toggleSound;
window.addEventListener('keydown',e=>{
 if(isTyping())return;
 const k=e.key.toLowerCase();if(['arrowleft','arrowright','arrowup',' '].includes(k))e.preventDefault();
 if(!e.repeat){if(k==='j')attack('punch');if(k==='k')attack('kick');if(k==='h')attack('heavy');if(k==='o')attack('uppercut');if(k==='u')attack('special');if(k==='i')attack('ability');if(k==='t')attack('ultra');if(k==='n')attack('sweep');if(k==='e')evade();if(k==='f')toggleFull();}
 if(['a','d','w','l','c','arrowleft','arrowright','arrowup'].includes(k)){keyboard[k]=true;sendInput();}
});
window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();keyboard[k]=false;sendInput();});
window.addEventListener('blur',()=>{keyboard={};touch={};sendInput();});
document.querySelectorAll('[data-key]').forEach(button=>{
 const k=button.dataset.key;
 button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(k==='e')evade();else if(['j','k','h','o','u','i','t','n'].includes(k))attack(({j:'punch',k:'kick',h:'heavy',o:'uppercut',u:'special',i:'ability',t:'ultra',n:'sweep'})[k]);else{touch[k]=true;sendInput();}});
 const release=()=>{if(touch[k]){touch[k]=false;sendInput();}};
 button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);
});
function makeRoster(){const holder=$('rosterGrid');holder.replaceChildren();for(const char of roster){
 const b=document.createElement('button');b.type='button';b.className='fighter-choice';b.dataset.id=char.id;
 const badge=document.createElement('img');badge.src='/sprites/'+char.id+'.webp';badge.alt=char.name+' fighter portrait';badge.loading='lazy';
 const content=document.createElement('span');content.className='choice-content';const name=document.createElement('b');name.textContent=char.name;const desc=document.createElement('small');desc.textContent=char.style;
 content.append(name,desc);b.append(badge,content);b.onclick=()=>{chosen=char.id;updateSelection();previewRenderer?.preload(chosen);};holder.append(b);
 }updateSelection();window.BadlandzCategory?.filter();}
function updateSelection(){for(const item of document.querySelectorAll('.fighter-choice'))item.classList.toggle('selected',item.dataset.id===chosen);
 const c=roster.find(v=>v.id===chosen)||roster[0];if(!c)return;
 label('chosenName',c.name);label('chosenFightStyle',(c.fightingStyle||'STREET FIGHTER')+' • '+(c.stanceName||'CUSTOM STANCE'));label('chosenUltra','ULTRA FINISHER • '+(c.ultraName||'STREET FINALE')+' • T');label('chosenTitle',c.style);label('chosenBio',c.bio);label('chosenAbility','⚡ '+(c.abilityName||'UNIQUE POWER')+' • I');const splash=$('portraitSplash');if(splash)splash.style.backgroundImage=`linear-gradient(0deg,#070609 8%,transparent 74%),url('/sprites/${c.id}.webp')`;}
function form(){return {name:$('playerName').value.trim()||'Fighter',characterId:chosen,stage};}
const stageTitles={'north-block':'NORTH PHILLY BLOCK',rooftop:'BADLANDZ ROOFTOP','basketball-court':'THE BLACKTOP',subway:'SUBWAY PLATFORM',garage:'THE GARAGE',underpass:'UNDER THE BRIDGE','corner-store':'CORNER STORE',warehouse:'BADLANDZ WAREHOUSE'};
function setStage(value){if(!stageTitles[value])return;stage=value;for(const button of document.querySelectorAll('[data-stage]'))button.classList.toggle('selected',button.dataset.stage===stage);label('stageLabel',stageTitles[stage]);}
document.querySelectorAll('[data-stage]').forEach(button=>button.addEventListener('click',()=>setStage(button.dataset.stage)));
function setupRoom(response){if(!response?.ok)return notice(response?.error||'Could not join room',true);
 room=response.code;slot=response.slot;mode=response.mode;phase='waiting';players=response.players||[];setStage(response.stage||stage);rematchRequested=false;scores=[0,0];roundNumber=1;animationClocks=[null,null];document.body.classList.add('playing');
 $('lobby').style.display='none';$('game').style.display='block';label('roomLabel',mode==='cpu'?'PRACTICE ARENA':'ROOM '+room);label('roomCodeText',mode==='cpu'?'CPU TRAINING':'SHARE CODE: '+room);
 $('overlay').style.display='flex';$('overlayBtn').style.display='none';$('overlayTitle').innerHTML='WAITING ON<br>YOUR OPP';label('overlayText','Share your room code '+room+' to invite a friend.');
 label('fightStatus','Getting ready to fight…');latest=[];shown=[];timeLeft=99;effects=[];syncHud();}
$('create').onclick=()=>{joinFullscreen();socket.emit('create-room',form(),setupRoom);};
$('quickMatch').onclick=()=>{joinFullscreen();socket.emit('quick-match',form(),setupRoom);};
$('join').onclick=()=>{const code=$('roomCode').value.trim().toUpperCase();if(code.length!==4)return notice('Enter the 4-character room code.',true);joinFullscreen();socket.emit('join-room',{...form(),code},setupRoom);};
$('practice').onclick=()=>{joinFullscreen();const cpu=chosen==='piro'?'speedy':'piro';socket.emit('practice',{...form(),cpuCharacter:cpu},setupRoom);};
$('leave').onclick=()=>{socket.emit('leave-room');leaveLocal('You left the room.');};
function leaveLocal(message){document.body.classList.remove('playing');if(document.fullscreenElement){const exit=document.exitFullscreen?.();exit?.catch?.(()=>{});}room='';phase='waiting';latest=[];shown=[];keyboard={};touch={};effects=[];animationClocks=[null,null];$('game').style.display='none';$('lobby').style.display='block';window.BadlandzMenu?.show('home');notice(message);}
$('overlayBtn').onclick=()=>{if(!room||phase!=='finished'||rematchRequested)return;rematchRequested=true;$('overlayBtn').disabled=true;socket.emit('rematch');if(mode==='online')label('overlayText','Waiting for your opponent to request a rematch…');};
socket.on('connect',()=>{label('connection','● NETWORK ONLINE');if(!connectedOnce)notice('Connected. Pick a fighter and enter the block.');connectedOnce=true;});
socket.on('disconnect',()=>{label('connection','● RECONNECTING');if(room)leaveLocal('Connection lost. Rejoin the fight with a new room code.');});
socket.on('connect_error',()=>notice('Cannot reach the game server. Run START_PHILLY_BADLANDZ.bat and refresh.',true));
socket.on('room-update',data=>{
 if(data.code!==room)return;
 slot=data.slot;players=data.players||players;scores=data.scores||scores;roundNumber=data.round||roundNumber;setStage(data.stage||stage);
 if(data.phase==='waiting'){phase='waiting';label('fightStatus',players.length+'/2 fighters in the room');$('overlay').style.display='flex';$('overlayBtn').style.display='none';$('overlayTitle').innerHTML='WAITING ON<br>YOUR OPP';label('overlayText','Share room code '+room+' with your friend to start the fight.');}
 if(data.phase==='finished'&&mode==='online'&&rematchRequested){label('fightStatus','Rematch requests: '+data.ready+'/2');}
});
socket.on('match-start',data=>{
 if(!room)return;players=data.players||players;phase='active';rematchRequested=false;setStage(data.stage||stage);
 scores=data.scores||scores;roundNumber=data.round;syncRounds();
 $('overlay').style.display='none';$('overlayBtn').style.display='none';$('overlayBtn').disabled=false;
 label('p1name',roster.find(c=>c.id===players[slot]?.characterId)?.name||players[slot]?.name||'YOU');label('p2name',roster.find(c=>c.id===players[1-slot]?.characterId)?.name||players[1-slot]?.name||'RIVAL');
 label('fightStatus','ROUND '+data.round+' • FIGHT!');label('roundBadge','ROUND '+data.round+' • FIRST TO 2');
 keyboard={};touch={};effects=[];animationClocks=[null,null];label('comboToast','FIGHT!');sound('round');sendInput();
});
socket.on('fight-state',data=>{
 if(!room||!Array.isArray(data?.fighters))return;
 phase=data.phase;latest=data.fighters;timeLeft=data.timeLeft;scores=data.scores||scores;roundNumber=data.round||roundNumber;syncRounds();
 if(shown.length!==latest.length){shown=latest.map(f=>({...f}));for(const ff of latest)renderer?.preload(ff.characterId);}
 syncHud();
});
socket.on('attack-start',data=>{
 if(!room)return;
 if(data.slot===0||data.slot===1)animationClocks[data.slot]={move:data.move,at:performance.now()};
 if(data.move==='ultra'){sound('ultra');label('comboToast',data.ultraName||'ULTRA FINISH!');effects.push({kind:'ultra-cinematic',ttl:1.3,total:1.3,slot:data.slot,x:data.x,ultraName:data.ultraName});}
 if(data.ability){sound(data.ability==='lightning'?'lightning':'ability');
  effects.push({kind:'ability',effect:data.ability,ttl:1.15,total:1.15,x:data.x,targetX:data.targetX,slot:data.slot,dir:data.facing});
  label('comboToast',data.abilityName||'UNIQUE ABILITY');
 }else if(data.move==='special')sound('ability');
 else if(['front-kick','roundhouse','spin-kick','sweep','air-kick'].includes(data.move))sound('kick');
 else sound(data.move==='uppercut'?'hook':data.move);
 if(data.finisher){label('comboToast',data.finisher+'!');sound('combo');}
});
socket.on('evade-start',data=>{if(!room)return;effects.push({kind:'evade',x:data.x,ttl:.32,total:.32,slot:data.slot});sound('evade');});
socket.on('attack-miss',data=>{if(!room)return;if(data.evaded||data.ducked){label('comboToast',data.evaded?'PERFECT EVADE!':'DUCKED!');sound('evade');}});
socket.on('hit',data=>{
 if(!room)return;
 const strong=['uppercut','roundhouse','spin-kick','special','ultra','ability','air-kick'].includes(data.type);
 effects.push({x:data.x,damage:data.damage,blocked:data.blocked,ttl:1.0,total:1.0,kind:data.type,ability:data.ability,combo:data.combo||0,finisher:data.finisher,
  sparks:Array.from({length:strong?33:19},(_,i)=>({a:i*2.399+Math.random()*.45,s:45+Math.random()*(strong?250:165),r:2+Math.random()*5}))});
 if(data.type==='ultra'&&!data.blocked){label('comboToast','ULTRA FINISH!');sound('ultra-hit');}
 else if(data.combo>=2&&!data.blocked){label('comboToast',data.combo+' HIT COMBO'+(data.finisher?' • '+data.finisher:''));sound('combo');}
 else if(!data.blocked&&data.type==='special')label('comboToast','SUPER IMPACT!');
 else if(data.blocked)label('comboToast','GUARD!');
 else label('comboToast',data.type==='ability'?'ABILITY IMPACT!':'');
 impactTime=strong?.3:.15;
 sound(data.blocked?'block':strong?'heavy':'hit');
 const stageEl=$('arenaFrame');stageEl.classList.remove('impact');void stageEl.offsetWidth;stageEl.classList.add('impact');
 setTimeout(()=>stageEl.classList.remove('impact'),strong?280:150);
 if(effects.length>55)effects.splice(0,effects.length-55);
});
function syncRounds(){
 label('p1rounds',Array.from({length:2},(_,i)=>i<(scores[slot]||0)?'●':'○').join(' '));
 label('p2rounds',Array.from({length:2},(_,i)=>i<(scores[1-slot]||0)?'●':'○').join(' '));
}
socket.on('round-end',data=>{
 if(!room)return;phase=data.matchOver?'finished':'intermission';rematchRequested=false;
 scores=data.scores||scores;syncRounds();
 const win=data.winnerSlot===slot,tie=data.winnerSlot===null;
 $('overlay').style.display='flex';$('overlayBtn').style.display=data.matchOver?'inline-block':'none';
 $('overlayBtn').disabled=false;
 $('overlayTitle').innerHTML=data.matchOver?(tie?'MATCH<br>DRAW':win?'K.O.<br>YOU WIN!':'K.O.<br>YOU LOSE'):(tie?'ROUND<br>DRAW':win?'ROUND<br>WON':'ROUND<br>LOST');
 label('overlayText',data.matchOver?'FINAL SCORE '+scores[slot]+' - '+scores[1-slot]+'. First to two wins the match.':
  'ROUND SCORE '+scores[slot]+' - '+scores[1-slot]+' • NEXT ROUND STARTS AUTOMATICALLY');
 $('overlayBtn').textContent=mode==='cpu'?'PLAY NEW MATCH':'REQUEST REMATCH';
 label('fightStatus',data.matchOver?'MATCH FINISHED • '+scores[slot]+' - '+scores[1-slot]:'ROUND '+data.round+' FINISHED • '+scores[slot]+' - '+scores[1-slot]);
 sound(data.matchOver?(win?'win':'ko'):'round');
});
socket.on('match-end',()=>{ /* round-end controls the results overlay */ });
socket.on('opponent-left',()=>{if(!room)return;phase='waiting';latest=[];shown=[];$('overlay').style.display='flex';$('overlayBtn').style.display='none';$('overlayTitle').innerHTML='OPPONENT<br>LEFT';label('overlayText','Your opponent disconnected. The room is still open. Share code '+room+' to invite a new challenger.');label('fightStatus','Opponent disconnected.');});
socket.on('chat',data=>{
 if(!room)return;
 const box=$('chatMessages'),row=document.createElement('div');row.className='chat-line';
 const who=document.createElement('strong');who.textContent=data.name+': ';
 const msg=document.createElement('span');msg.textContent=data.message;
 row.append(who,msg);box.append(row);while(box.childElementCount>35)box.firstChild.remove();box.scrollTop=box.scrollHeight;
});
$('chatForm').onsubmit=e=>{e.preventDefault();if(!room)return;const msg=$('chatInput').value.trim();if(msg){socket.emit('chat',msg);$('chatInput').value='';}};
function syncHud(){
 const mine=latest[slot],enemy=latest[1-slot];
 if(mine){$('p1bar').style.width=mine.hp+'%';label('p1health',mine.hp+' HP');}
 if(enemy){$('p2bar').style.width=enemy.hp+'%';label('p2health',enemy.hp+' HP');}
 for(const [fighter,which] of [[mine,'p1'],[enemy,'p2']]){
  if(!fighter)continue;
  const meter=fighter.meter||0;
  $(which+'meter').style.width=meter+'%';
  $(which+'meterText').textContent=meter>=100?'ULTRA READY (T)':meter>=50?'SUPER READY (U)':'SPECIAL '+meter+'%';
  $(which+'meter').parentElement.classList.toggle('meter-ready',meter>=50);
  const abilityName=roster.find(c=>c.id===fighter.characterId)?.abilityName||'POWER';
  $(which+'ability').textContent='⚡ '+abilityName+' • '+((fighter.abilityCooldown||0)>0?Math.ceil(fighter.abilityCooldown)+'s':'READY'+(which==='p1'?' (I)':''));
 }
 label('timer',String(timeLeft).padStart(2,'0'));
}
function showError(err){console.error('2D setup error',err);notice(err.message||'2D graphics initialization failed.',true);$('renderError').textContent=err.message||'2D graphics could not start.';}
try{renderer=new PhillyArcade2D($('stage'));previewRenderer=new PhillyArcade2D($('preview'));}catch(err){showError(err);}
const fx=$('fxStage'),pen=fx.getContext('2d');let lastFrame=0;
function drawEffects(dt){
 const W=fx.width,H=fx.height;
 pen.clearRect(0,0,W,H);pen.textAlign='center';pen.textBaseline='middle';
 const px=x=>renderer?.projectX?renderer.projectX(x)*W/(renderer.canvas.width||W):x;
 for(const e of effects){
  e.ttl-=dt;const p=Math.max(0,1-e.ttl/(e.total||1)),alpha=Math.min(1,e.ttl/.26);
  pen.save();pen.globalAlpha=alpha;
  if(e.kind==='ultra-cinematic'){
   const a=Math.max(0,1-e.ttl/e.total);pen.fillStyle=`rgba(5,0,8,${Math.sin(Math.PI*a)*.46})`;pen.fillRect(0,0,W,H);
   pen.fillStyle=e.slot===0?'#ff3c55':'#62c8ff';pen.fillRect(0,H*.28,Math.min(W,W*1.4*a),H*.15);
   pen.textAlign='center';pen.font='italic 900 54px Impact,Arial';pen.lineWidth=9;pen.strokeStyle='#05020b';pen.strokeText(e.ultraName||'ULTRA FINISH!',W/2,H*.35);pen.fillStyle='#fff1dd';pen.fillText(e.ultraName||'ULTRA FINISH!',W/2,H*.35);pen.restore();continue;
  }
  if(e.kind==='evade'){const x=px(e.x),y=H*.72;pen.strokeStyle='#b2edff';pen.lineWidth=5;for(let j=0;j<5;j++){pen.beginPath();pen.moveTo(x-60-p*140+j*13,y-18+j*14);pen.lineTo(x-150-p*180+j*13,y-18+j*14);pen.stroke();}pen.restore();continue;}
  if(e.kind==='ability'){
   const start=px(e.x),end=px(e.targetX),y=H*.67,elapsed=p;
   const type=e.effect;
   if(type==='lightning'){
    pen.strokeStyle='#86e4ff';pen.shadowBlur=25;pen.shadowColor='#54c5ff';pen.lineWidth=8+Math.random()*5;
    pen.beginPath();pen.moveTo(end,-50);
    for(let j=1;j<9;j++)pen.lineTo(end+(Math.random()-.5)*75,H*.76*j/9);
    pen.stroke();pen.shadowBlur=0;
    pen.fillStyle='#d3faff';pen.beginPath();pen.arc(end,H*.76,24+Math.random()*23,0,Math.PI*2);pen.fill();
   } else if(type==='quake'){
    pen.strokeStyle='#ffc47e';pen.lineWidth=5;for(let k=0;k<3;k++){pen.beginPath();pen.ellipse(start,H*.79,p*360+k*19,20+p*90,0,0,Math.PI*2);pen.stroke();}
   }else if(type==='dash'||type==='cyclone'){
    pen.strokeStyle=type==='dash'?'#70e4ff':'#ff6fa5';pen.lineWidth=6;
    for(let i=0;i<7;i++){pen.beginPath();pen.moveTo(start+(end-start)*p-i*19,H*.63+i*7);pen.lineTo(start+(end-start)*p-i*49,H*.63+i*7-24);pen.stroke();}
   }else{
    const x=start+(end-start)*Math.min(1,p*1.45);
    const colors={fireball:'#ff773d',trashcan:'#b7d9d6',brick:'#ce8b65',bottles:'#64e6b9',birdstorm:'#e4c9ff'};
    pen.shadowBlur=26;pen.shadowColor=colors[type]||'#ffce5c';pen.fillStyle=colors[type]||'#ffce5c';
    pen.beginPath();pen.arc(x,H*.62+Math.sin(p*12)*17,type==='trashcan'?25:14+Math.sin(p*22)*5,0,Math.PI*2);pen.fill();pen.shadowBlur=0;
    for(let j=0;j<8;j++){pen.fillRect(x-j*14,H*.63+Math.sin(j+p*11)*18,9,4);}
   }
   pen.restore();continue;
  }
  const x=px(e.x),y=H*.52-p*H*.13,power=e.kind==='special'||e.kind==='ability'||e.kind==='ultra'?2.5:e.kind==='spin-kick'||e.kind==='uppercut'?1.65:e.kind==='roundhouse'?1.4:1;
  pen.translate(x,y+H*.09);
  const sparkle=e.blocked?'#9bdfff':e.kind==='ability'?'#91efff':'#ffc46d';
  if(p<.73){
   const rays=e.blocked?9:21;pen.globalCompositeOperation='lighter';
   for(let i=0;i<rays;i++){
    const a=i*Math.PI*2/rays+(e.blocked?0:p*.2),r1=14+p*50,r2=(66+power*65)*Math.sqrt(p+.035);
    pen.beginPath();pen.moveTo(Math.cos(a)*r1,Math.sin(a)*r1);
    pen.lineTo(Math.cos(a+.09)*r2,Math.sin(a+.09)*r2);
    pen.lineTo(Math.cos(a+.12)*r1,Math.sin(a+.12)*r1);
    pen.closePath();pen.fillStyle=i%3===0?'#fff7d8':sparkle;pen.fill();
   }
   for(const spark of e.sparks||[]){const distance=spark.s*p,ang=spark.a;
    pen.fillStyle=e.blocked?'#8df1fa':(spark.r>4?'#ffe7a6':'#fb5062');
    pen.beginPath();pen.arc(Math.cos(ang)*distance,Math.sin(ang)*distance,spark.r*(1-p),0,Math.PI*2);pen.fill();
   }
   pen.strokeStyle=sparkle;pen.lineWidth=Math.max(1,8*(1-p));pen.beginPath();pen.arc(0,0,24+p*power*113,0,Math.PI*2);pen.stroke();
  }
  pen.setTransform(1,0,0,1,0,0);pen.globalCompositeOperation='source-over';
  const text=e.blocked?'GUARD -'+e.damage:e.kind==='ability'?'POWER -'+e.damage:e.kind==='ultra'?'ULTRA -'+e.damage:e.kind==='special'?'SUPER -'+e.damage:'-'+e.damage;
  pen.font=e.kind==='ability'||e.kind==='special'||e.kind==='ultra'?'900 40px Impact,Arial':'900 32px Impact,Arial';
  pen.lineWidth=8;pen.strokeStyle='#110d19';pen.strokeText(text,x,y);pen.fillStyle=e.blocked?'#9adfff':'#fff1ba';pen.fillText(text,x,y);
  if(e.combo>=2&&!e.blocked){pen.font='900 22px Impact,Arial';pen.strokeText(e.combo+' HIT COMBO',x,y-44);pen.fillStyle='#ff687d';pen.fillText(e.combo+' HIT COMBO',x,y-44);}
  pen.restore();
 }
 effects=effects.filter(e=>e.ttl>0);
}
function frameLoop(ms){const dt=Math.min(.06,(ms-lastFrame)/1000||.016);lastFrame=ms;
 if(renderer&&room&&latest.length===2){
 for(let i=0;i<latest.length;i++){
  const previous=shown[i]||latest[i],incoming=latest[i];
  const next={...incoming,x:previous.x+(incoming.x-previous.x)*(1-Math.exp(-dt*18)),
   height:previous.height+(incoming.height-previous.height)*(1-Math.exp(-dt*19))};
  const clock=animationClocks[i];
  if(clock&&attackLengths[clock.move]){
   // V15: Preserve the complete visual swing even when authoritative server
   // has already returned to idle. Physics and damage remain server owned.
   const elapsed=Math.max(0,(ms-clock.at)/1000);
   const duration=Math.max(.42,attackLengths[clock.move]);
   if(elapsed<duration&&incoming.action!=='hurt'&&incoming.action!=='ko'){
    next.action=clock.move;
    next.attackProgress=Math.min(.999,elapsed/duration);
   }else if(elapsed>=duration)animationClocks[i]=null;
  }
  shown[i]=next;
 }
 renderer.render(shown,roster,ms/1000,{stage});
 }else if(renderer&&room)renderer.render([],roster,ms/1000,{stage});
 if(room)drawEffects(dt);
 if(previewRenderer&&!room && frame++%3===0){const showMoves=['idle','jab','cross','hook','uppercut','front-kick','roundhouse','dodge','block','ultra'];const p=(ms/1250)%showMoves.length;const action=showMoves[Math.floor(p)];const fighter={slot:0,characterId:chosen,x:480,height:0,facing:1,previewRotation:Math.sin(ms/1450)*.34,action,attackProgress:action==='idle'?0:Math.max(0,Math.min(1,(p%1)*1.4)),flash:false};previewRenderer.render([fighter],roster,ms/1000,{stage});}
 requestAnimationFrame(frameLoop);
}
async function boot(){try{const response=await fetch('/roster.json');if(!response.ok)throw Error('Failed to load the fighter roster');roster=await response.json();makeRoster();renderer?.preload(chosen);previewRenderer?.preload(chosen);requestAnimationFrame(frameLoop);}catch(err){showError(err);}}
boot();
})();
