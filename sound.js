/* Fully original WebAudio arcade effects. No external audio files or downloads. */
(function(){'use strict';
 let ctx=null,enabled=true;
 const ensure=()=>{if(!enabled)return null;try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx;}catch{return null;}};
 function tone(freq,secs=.1,shape='triangle',gain=.12,fall=0){const a=ensure();if(!a)return;
  const osc=a.createOscillator(),vol=a.createGain(),now=a.currentTime;osc.type=shape;
  osc.frequency.setValueAtTime(Math.max(40,freq),now);
  if(fall)osc.frequency.exponentialRampToValueAtTime(Math.max(45,freq*fall),now+secs);
  vol.gain.setValueAtTime(gain,now);vol.gain.exponentialRampToValueAtTime(.001,now+secs);
  osc.connect(vol).connect(a.destination);osc.start(now);osc.stop(now+secs+.01);
 }
 function noise(secs=.10,gain=.08){const a=ensure();if(!a)return;
  const frames=Math.ceil(a.sampleRate*secs),buf=a.createBuffer(1,frames,a.sampleRate),data=buf.getChannelData(0);
  for(let i=0;i<frames;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/frames*4);
  const src=a.createBufferSource(),g=a.createGain(),filter=a.createBiquadFilter();src.buffer=buf;filter.type='highpass';filter.frequency.value=400;
  g.gain.setValueAtTime(gain,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+secs);
  src.connect(filter).connect(g).connect(a.destination);src.start();src.stop(a.currentTime+secs);
 }
 function play(name){if(!enabled)return;
  switch(name){
   case 'jab':case 'cross':tone(175,.10,'sawtooth',.06,.38);noise(.07,.036);break;
   case 'hook':case 'uppercut':tone(140,.19,'sawtooth',.11,.24);noise(.12,.065);break;
   case 'kick':tone(108,.23,'sawtooth',.12,.20);noise(.15,.08);break;
   case 'hit':tone(100,.13,'triangle',.13,.32);noise(.11,.15);break;
   case 'heavy':tone(72,.25,'sawtooth',.17,.19);noise(.17,.16);break;
   case 'block':tone(480,.09,'square',.055,.62);tone(910,.08,'triangle',.04,.41);break;
   case 'combo':tone(510,.11,'square',.06,1.30);setTimeout(()=>tone(760,.11,'triangle',.075,1.26),65);break;
   case 'ability':tone(185,.54,'sawtooth',.115,2.9);noise(.3,.09);break;
   case 'lightning':tone(130,.54,'sawtooth',.15,.27);noise(.38,.13);break;
   case 'round':tone(450,.15,'square',.07,.8);setTimeout(()=>tone(670,.20,'square',.08,.75),150);break;
   case 'ko':tone(230,.45,'sawtooth',.13,.22);setTimeout(()=>tone(120,.6,'triangle',.15,.3),110);break;
   case 'evade':tone(380,.11,'triangle',.035,1.8);noise(.06,.03);break;
   case 'ultra':tone(78,.90,'sawtooth',.18,3.7);tone(142,.74,'triangle',.11,2.9);noise(.42,.13);break;
   case 'ultra-hit':tone(57,.65,'sawtooth',.20,.12);noise(.43,.21);break;
   case 'win':for(let i=0;i<4;i++)setTimeout(()=>tone([262,330,392,523][i],.27,'triangle',.10,.85),i*135);break;
  }
 }
 window.BadlandzSound={play,unlock:ensure,setEnabled:v=>{enabled=!!v;if(enabled)ensure();},isEnabled:()=>enabled};
})();
