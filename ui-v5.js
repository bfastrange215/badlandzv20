// Menu navigation and artwork controls for Philly Badlandz V5.
// Combat, matchmaking, health, effects, chat and rounds remain in main.js/server.js.
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const views={home:'homeView',characters:'charactersView',arenas:'arenasView',online:'onlineView',training:'trainingView',options:'optionsView',leaderboards:'leaderboardsView'};
let selectedCategory='legends';
const groups={legends:['piro','speedy','htb-druski'],crew:['bfa-strange','gcg-doughboy','verge','the-crackhead'],ladies:['lucy-chucky','lexa-birdface']};
const titles={'north-block':'NORTH PHILLY BLOCK',rooftop:'BADLANDZ ROOFTOP','basketball-court':'THE BLACKTOP',subway:'SUBWAY PLATFORM',garage:'THE GARAGE',underpass:'UNDER THE BRIDGE','corner-store':'CORNER STORE',warehouse:'BADLANDZ WAREHOUSE'};
function show(view){
  const id=views[view]||views.home;
  for(const e of document.querySelectorAll('.screen'))e.classList.toggle('active',e.id===id);
  if(view==='online')refreshRooms();
  window.scrollTo?.(0,0);
}
window.BadlandzMenu={show,groups,refreshRooms};
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.view)));
// Character filters are applied to the same roster buttons main.js creates and uses.
function filter(){
 for(const tab of document.querySelectorAll('.category-tab'))tab.classList.toggle('active',tab.dataset.category===selectedCategory);
 for(const button of document.querySelectorAll('.fighter-choice'))button.style.display=groups[selectedCategory]?.includes(button.dataset.id)?'flex':'none';
 const visible=groups[selectedCategory]||[];$('categoryCount').textContent=visible.length+' FIGHTERS';
}
filter();
window.BadlandzCategory={filter,select(id){for(const [k,list] of Object.entries(groups))if(list.includes(id)){selectedCategory=k;filter();break;}}};
document.querySelectorAll('.category-tab').forEach(tab=>tab.addEventListener('click',()=>{selectedCategory=tab.dataset.category;filter();}));
$('randomFighter').addEventListener('click',()=>{
 const visible=groups[selectedCategory]||[];const fighter=visible[Math.floor(Math.random()*visible.length)];
 document.querySelector(`.fighter-choice[data-id="${fighter}"]`)?.click();
});
function updateSummary(){
 const el=document.querySelector('.fighter-choice.selected');if(!el)return;
 const id=el.dataset.id;
 $('onlinePortrait').src='/sprites/'+id+'.webp';
 $('onlineFighter').textContent=$('chosenName').textContent;
 $('onlineAbility').textContent=$('chosenAbility').textContent.replace(/^[^A-Z]+/,'');
 $('trainingFighter').textContent=$('chosenName').textContent;
 const stage=document.querySelector('.stage-card.selected')?.dataset.stage||'north-block';
 $('selectedStageName').textContent=titles[stage];$('onlineStage').textContent=titles[stage];$('trainingStage').textContent=titles[stage];
}
const rosterObserver=new MutationObserver(updateSummary);rosterObserver.observe($('rosterGrid'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
const stageObserver=new MutationObserver(updateSummary);stageObserver.observe($('stageChoices'),{attributes:true,subtree:true,attributeFilter:['class']});
// Live room browser: the API returns only actual waiting online rooms, never fabricated listings.
async function refreshRooms(){
 const list=$('roomsList');if(!list)return;
 try{
  const response=await fetch('/api/rooms',{cache:'no-store'});if(!response.ok)throw Error('Server unavailable');
  const rooms=await response.json();list.replaceChildren();
  if(!rooms.length){const empty=document.createElement('p');empty.className='empty-rooms';empty.textContent='NO OPEN FIGHTS YET. CREATE A ROOM OR USE QUICK MATCH.';list.append(empty);return;}
  for(const room of rooms){
   const item=document.createElement('div');item.className='room-line';
   const host=document.createElement('div');const title=document.createElement('strong');title.textContent=room.code+' • '+room.host;
   const status=document.createElement('small');status.textContent='WAITING FOR CHALLENGER';host.append(title,status);
   const count=document.createElement('div');count.className='room-count';count.textContent=room.players+'/2';
   const stage=document.createElement('div');stage.textContent=titles[room.stage]||room.stage;stage.style.fontSize='11px';
   const action=document.createElement('button');action.className='primary';action.textContent='JOIN';action.onclick=()=>{$('roomCode').value=room.code;$('join').click();};
   item.append(host,count,stage,action);list.append(item);
  }
 }catch{list.replaceChildren();const e=document.createElement('p');e.className='empty-rooms';e.textContent='ROOM LIST UNAVAILABLE. CHECK YOUR SERVER CONNECTION.';list.append(e);}
}
$('refreshRooms').onclick=refreshRooms;
$('settingsSound').onclick=()=>$('soundToggle').click();
$('settingsFullscreen').onclick=()=>$('fullscreenToggle').click();
$('playerName').addEventListener('input',()=>{try{localStorage.setItem('badlandz-display-name',$('playerName').value);}catch{}});
try{const saved=localStorage.getItem('badlandz-display-name');if(saved)$('playerName').value=saved.slice(0,20);}catch{}
setInterval(()=>{if($('onlineView').classList.contains('active')&&!document.body.classList.contains('playing'))refreshRooms();},10000);
})();
