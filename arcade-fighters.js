/* Philly Badlandz V15 — PHOTO-MATCHED ARTICULATED SPRITE FIGHTERS.
 * Nine transparent characters extracted from the user's approved full-body artwork.
 * Time-based pose frames are continuous image warps of the SAME fighter artwork.
 * The pose interpolation provides stylized arcade movement: these are NOT
 * individually drawn, motion-captured, or AI-video-produced animation frames.
 * SERVER remains authoritative for inputs, hitboxes, health, rounds and power.
 */
(function(global){'use strict';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const peak=(t,a=.04,b=.29,c=.63,d=.97)=>smooth((t-a)/(b-a))*(1-smooth((t-c)/(d-c)));
const FIGHTERS=['piro','speedy','htb-druski','bfa-strange','gcg-doughboy','verge','the-crackhead','lucy-chucky','lexa-birdface'];
const POSES=['jab','cross','hook','uppercut','front-kick','roundhouse','sweep','block','special','ultra'];
const STANCE={
 piro:{bob:1.2,rate:2.0,lean:-.012,height:373},
 speedy:{bob:5,rate:5.3,lean:.01,height:379},
 'htb-druski':{bob:.9,rate:1.7,lean:-.016,height:391},
 'bfa-strange':{bob:3.5,rate:3.9,lean:.045,height:381},
 'gcg-doughboy':{bob:.7,rate:1.6,lean:-.025,height:396},
 verge:{bob:1.6,rate:2.3,lean:.018,height:390},
 'the-crackhead':{bob:4,rate:5.1,lean:.055,height:378},
 'lucy-chucky':{bob:2.7,rate:3.1,lean:-.016,height:376},
 'lexa-birdface':{bob:4.3,rate:4.5,lean:.037,height:384}
};
// Shared across menu preview and live match to avoid decoding every sheet twice.
const SHARED_MOTION_CACHE=new Map();
const FRAME_COUNTS={idle:12,walk:16,jab:16,cross:16,hook:16,uppercut:16,'front-kick':16,roundhouse:16,'spin-kick':16,sweep:16,special:16,ultra:16,block:10,crouch:10,jump:12,hurt:10,dodge:10,ko:10};
const EFFECT={jab:'#ffda77',cross:'#ffc17f',hook:'#ff7b6c',uppercut:'#ffde81','front-kick':'#85dbff',roundhouse:'#ff698d',sweep:'#fdb375',special:'#ff485d',ultra:'#efddff'};
function poseKey(action){if(action==='air-jab')return'jab';if(action==='air-kick'||action==='spin-kick')return'roundhouse';if(action==='ability')return'special';return POSES.includes(action)?action:null;}
function drawStage(c,stage,t,img){const W=960,H=540;
 c.clearRect(0,0,W,H);const sky=c.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#11121f');sky.addColorStop(.55,'#34333e');sky.addColorStop(1,'#18111a');c.fillStyle=sky;c.fillRect(0,0,W,H);
 if(img&&img.complete&&img.naturalWidth){
  c.save();c.globalAlpha=.72;
  const sw=img.naturalWidth,sh=img.naturalHeight,ratio=Math.max(W/sw,H*.88/sh),iw=sw*ratio,ih=sh*ratio;
  c.drawImage(img,(W-iw)*.5,-18,iw,ih);c.restore();
 }
 // Native street-scene layers add grounded perspective and stage depth.
 c.fillStyle='#27232888';c.beginPath();c.moveTo(0,390);c.lineTo(960,390);c.lineTo(960,540);c.lineTo(0,540);c.fill();
 const ground=c.createLinearGradient(0,394,0,540);ground.addColorStop(0,'#54444899');ground.addColorStop(.38,'#28282dbb');ground.addColorStop(1,'#161722d9');c.fillStyle=ground;c.fillRect(0,394,960,146);
 c.fillStyle='#847775';c.fillRect(0,406,960,9);c.fillStyle='#1a1e23';c.fillRect(0,419,960,10);
 // Road stripes, cracks and reflective pools.
 for(let i=0;i<10;i++){const px=i*111-18;c.fillStyle='#988b7f60';c.fillRect(px,519,54,3);
  c.strokeStyle='#11141ac0';c.lineWidth=1;c.beginPath();c.moveTo(px,440);c.lineTo(px+12,458);c.lineTo(px+3,475);c.lineTo(px+25,495);c.stroke();}
 c.fillStyle='#ec4a4f16';for(let i=0;i<6;i++){c.beginPath();c.ellipse((i*189+t*.6)%960,478+i%3*12,50,3,.12,0,Math.PI*2);c.fill();}
 c.fillStyle='#13151b';c.fillRect(0,525,960,15);
 const vign=c.createRadialGradient(480,285,190,480,270,690);vign.addColorStop(0,'#0000');vign.addColorStop(1,'#050508e0');c.fillStyle=vign;c.fillRect(0,0,W,H);
 c.fillStyle='#fff3';c.fillRect(0,419,960,1);
}

class PhillyArcade2D{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});if(!this.ctx)throw Error('2D Canvas initialization failed');
 this.isPreview=canvas.id==='preview';this.imageCache=new Map();this.stage='north-block';this._spriteCache=new Map();this._motionCache=SHARED_MOTION_CACHE;this._frame=0;this.build='V15-SMOOTH-ARCADE';
 }
 getStageImage(stage){const id=stage||'north-block';if(!this.imageCache.has(id)){const image=new Image();image.src='/assets/'+id+'.webp';this.imageCache.set(id,image);}return this.imageCache.get(id);}
 sprite(id,key){const source='/sprites/'+id+'.webp';if(!this._spriteCache.has(source)){const im=new Image();im.src=source;this._spriteCache.set(source,im);}return this._spriteCache.get(source);}
 motion(id,action){const source='/motion/'+id+'__'+action+'.webp';
  if(this._motionCache.has(source)){
   const im=this._motionCache.get(source);
   this._motionCache.delete(source);this._motionCache.set(source,im);return im;
  }
  const im=new Image();im.decoding='async';im.src=source;this._motionCache.set(source,im);
  // Bound decoded sprite-sheet memory without evicting the common preloaded moves.
  while(this._motionCache.size>30){const oldest=this._motionCache.keys().next().value;this._motionCache.delete(oldest);}
  return im;
 }
 preload(id){if(!FIGHTERS.includes(id))return;
  // Prioritize the movements that appear in almost every round; other attacks load on demand.
  for(const a of ['idle','walk','jab','cross','hook','uppercut','front-kick','roundhouse','block','special'])this.motion(id,a);
 }
 ready(im){return !!(im&&im.complete&&im.naturalWidth>0&&im.naturalHeight>0);}
 projectX(x){return clamp(x,0,960);}
 drawFighter(c,f,roster,t){const id=FIGHTERS.includes(f.characterId)?f.characterId:'piro';
 const prof=STANCE[id],action=f.action||'idle',p=clamp(f.attackProgress||0);
 const moving=action==='walk';const height=prof.height,base=this.sprite(id,null);if(!this.ready(base))return;
 const x=clamp(f.x??480,-100,1060),floor=480-(f.height||0)*.7;
 const combatMove=['jab','cross','hook','uppercut','front-kick','roundhouse','spin-kick','sweep','special','ultra','ability','air-jab','air-kick'].includes(action);
 const animation=combatMove?(action==='ability'?'special':action==='air-jab'?'jab':action==='air-kick'?'roundhouse':action):action;
 let sheet=this.motion(id,animation);let effective=animation;
 if(!this.ready(sheet)){
  const backup=animation==='spin-kick'||animation==='sweep'?'roundhouse':animation==='ultra'?'special':animation==='air-kick'?'front-kick':animation==='hurt'?'block':'idle';
  const substitute=this.motion(id,backup);
  if(this.ready(substitute)){sheet=substitute;effective=backup;}
 }
 const count=FRAME_COUNTS[effective]||16;
 let idx=0;
 if(animation==='walk')idx=Math.floor(t*(id==='speedy'?19:16)+(f.slot||0)*1.7)%count;
 else if(animation==='idle')idx=Math.floor(t*prof.rate*1.8+(f.slot||0)*2)%count;
 else if(combatMove)idx=clamp(Math.floor(p*(count-1)+.00001),0,count-1);
 else if(animation==='block'||animation==='crouch')idx=Math.floor(t*5)%count;
 else if(animation==='ko')idx=count-1;
 else idx=Math.floor(t*10)%count;
 // Foot contact stays planted; no constant vertical bouncing through kicks.
 const pulse=moving?1.2*Math.abs(Math.sin(t*(id==='speedy'?19:16))):(animation==='idle'?Math.sin(t*prof.rate)*Math.min(1.6,prof.bob):0);
 c.save();c.translate(x,floor-pulse+(animation==='ko'?height*.28:0));c.scale((f.facing||1)>=0?1:-1,1);
 const physicalWidth=height*base.naturalWidth/base.naturalHeight;
 c.fillStyle='#03030780';c.beginPath();c.ellipse(0,7,physicalWidth*.45,7,0,0,Math.PI*2);c.fill();
 if(this.ready(sheet)&&sheet.naturalHeight>=500){const sw=sheet.naturalWidth/count,sh=sheet.naturalHeight;const dw=height*sw/sh;
  // Animate *entire character frames* containing independently rotated photographed limbs.
  c.drawImage(sheet,Math.min(count-1,idx)*sw,0,sw,sh,-dw/2,-height,dw,height);
 }else c.drawImage(base,-physicalWidth/2,-height,physicalWidth,height);
 if(f.flash){c.globalCompositeOperation='screen';c.fillStyle='#ff6a5c28';c.fillRect(-physicalWidth/2,-height,physicalWidth,height);c.globalCompositeOperation='source-over';}
 if(combatMove){const intensity=peak(p);
  if(intensity>.15){const kick=animation.includes('kick')||animation==='sweep',upper=animation==='uppercut';const yy=kick?-height*.49:upper?-height*.83:-height*.74,xx=physicalWidth*(kick?.63:.5)+intensity*36;
   c.save();c.globalCompositeOperation='lighter';c.strokeStyle=EFFECT[animation]||'#ffe5bb';c.lineWidth=4+intensity*6;c.shadowColor=EFFECT[animation]||'#ffce78';c.shadowBlur=10+intensity*18;
   c.beginPath();c.arc(xx,yy,kick?45:30,upper?1:-1.7,upper?4.7:.9);c.stroke();c.restore();}
 }
 c.restore();
 }
 render(fighters,roster,t,options={}){const c=this.ctx,cv=this.canvas;c.save();c.setTransform(cv.width/960,0,0,cv.height/540,0,0);
 const stage=options.stage||this.stage;drawStage(c,stage,t,this.getStageImage(stage));
 const valid=(fighters||[]).filter(f=>f&&FIGHTERS.includes(f.characterId));
 for(const f of [...valid].sort((a,b)=>(a.x||0)-(b.x||0)))this.drawFighter(c,f,roster,t);
 if(this.isPreview&&valid.length===0)this.drawFighter(c,{characterId:'piro',x:480,facing:1,slot:0,action:'idle'},roster,t);
 c.restore();this._frame++;}
}
global.PhiroArcadeTest={FIGHTERS,POSES,STANCE,poseKey,PhillyArcade2D,FRAME_COUNTS};
global.PhillyArcade2D=PhillyArcade2D;
})(window);
