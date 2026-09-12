(()=>{
  'use strict';
  const K=Keepsake,A=KeepsakeArt,$=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
  const W=640,H=640,KEY='liuyige-mvp-v1';let levelIndex=0,placed={},rotations={},history=[],selected=null,ghost=null,drag=null,hint=null,moves=0,hints=0,started=Date.now(),finished=false,scheduled=false,audio=null,muted=false,flashUntil=0,locked=new Set();
  let saved={version:1,completed:{},sessions:{},events:[],codex:{},sound:true},storageOK=true;
  try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');if(raw&&raw.version===1&&raw.completed&&raw.sessions&&typeof raw.completed==='object'&&typeof raw.sessions==='object')saved={version:1,current:raw.current,completed:raw.completed,sessions:raw.sessions,events:Array.isArray(raw.events)?raw.events.slice(-200):[],codex:raw.codex&&typeof raw.codex==='object'?raw.codex:{},sound:raw.sound!==false};}catch{storageOK=false;}
  // BGM 默认开。存档里明确关过就尊重存档；读不出存档（或存档坏了）按「没关过」处理。
  muted=saved.sound===false;
  let toastUntil=0,toastTimer=null;
  const level=()=>K.levels[levelIndex];
  const board=()=>{const l=level(),cell=Math.max(28,Math.min(52,Math.floor(275/l.rows),Math.floor(530/l.cols))),w=l.cols*cell,h=l.rows*cell;return{x:(W-w)/2,y:64,cell,w,h};};
  const clone=x=>JSON.parse(JSON.stringify(x));
  function event(name,data={}){saved.events.push({name,level:level().id,at:Date.now(),...data});saved.events=saved.events.slice(-200);}
  function persist(){saved.current=levelIndex;saved.sessions[level().id]={placed:clone(placed),rotations:{...rotations},moves,hints};try{localStorage.setItem(KEY,JSON.stringify(saved));storageOK=true;}catch{storageOK=false;}}
  function status(text){$('status').textContent=text;}
  // ---- 整齐度评分：随摆随算。不做星级门槛（各关可达上限不同，星级会给出够不到的目标），
  //      只给一个分数 + 一条「下一步动什么」的建议。 ----
  const currentScore=()=>K.scoreLayout(level(),placed);
  function paintScore(){
    const n=Object.keys(placed).length,sc=currentScore(),pill=$('score');
    pill.textContent=n?`整齐度 ${sc.total}`:'整齐度 —';
    if(pill.classList)pill.classList.toggle('warm',n>0&&sc.total>=K.GRADE_LINES[0]);
    $('score-line').textContent=n
      ?`对齐 ${sc.align} · 留白 ${sc.gap} · 居中 ${sc.center}　${K.advice(sc)}`
      :'放上第一件旧物就会开始计分：对齐、留白、居中各占一部分。';
  }
  // ---- 物品关系：放进/转动时判定，凑齐就永久记进图鉴 ----
  function toast(text,ms=5200){
    const el=$('toast');if(!el)return;
    el.textContent=text;el.hidden=false;toastUntil=Date.now()+ms;
    if(toastTimer&&typeof clearTimeout==='function')clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{el.hidden=true;},ms);
  }
  function checkRelations(announce=true){
    const l=level(),fresh=[];
    for(const id of K.metRelations(l,placed)){
      if(saved.codex[id])continue;
      saved.codex[id]={level:l.id,at:Date.now()};
      fresh.push(id);
    }
    if(fresh.length){
      renderCodex();
      if(announce){
        const first=K.relationById(fresh[0]);
        toast(`旧物说话了 · ${fresh.map(id=>K.relationById(id).text).join('')}`);
        event('relation_unlocked',{ids:fresh});
        status(`解锁一段回忆（${Object.keys(saved.codex).length} / ${K.relations.length}）：${first.text}　右上角「图鉴」可以看全部。`);
      }
    }
    return fresh;
  }
  let codexBuilt=-1;
  function renderCodex(){
    const grid=$('codex-grid');if(!grid)return;
    const total=K.relations.length,got=Object.keys(saved.codex).length;
    // 只在解锁数量变化时重建，避免每次打开图鉴都重排 24 张卡片。
    if(codexBuilt===got&&grid.children&&grid.children.length)return;
    codexBuilt=got;
    grid.innerHTML='';
    for(const r of K.relations){
      const unlocked=!!saved.codex[r.id];
      const card=document.createElement('div');
      card.className='codex-card'+(unlocked?' got':'');
      card.innerHTML='<p class="codex-kind"></p><p class="codex-names"></p><p class="codex-text"></p>';
      card.querySelector('.codex-kind').textContent=unlocked?K.kindNames[r.kind]:'未解锁';
      card.querySelector('.codex-names').textContent=`${K.items[r.a].name} + ${K.items[r.b].name}`;
      card.querySelector('.codex-text').textContent=unlocked?r.text:'把这两件放在一起，看看会发生什么。';
      grid.appendChild(card);
    }
    const sum=$('codex-summary');
    if(sum)sum.textContent=`已解锁 ${got} / ${total} 段。把两件相关的旧物挨在一起，它们会说话。`;
    const badge=$('codex-count');
    if(badge)badge.textContent=`${got}/${total}`;
  }
  // 提示音和 BGM 共用同一个 AudioContext：移动端开两个 context 容易互相打断，也没必要。
  function audioCtx(){const M=window.KeepsakeMusic;if(M&&M.ctx){const shared=M.ctx();if(shared)return shared;}return audio||(audio=new(window.AudioContext||window.webkitAudioContext)());}
  function beep(success=false){if(muted)return;try{const ac=audioCtx();if(!ac)return;if(ac.state==='suspended')ac.resume().catch(()=>{});const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.setValueAtTime(success?659:440,ac.currentTime);o.frequency.exponentialRampToValueAtTime(success?880:523,ac.currentTime+.12);g.gain.setValueAtTime(.035,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.2);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+.22);}catch{}}
  function snapshot(){history.push({placed:clone(placed),rotations:{...rotations},moves,hints});if(history.length>100)history.shift();}
  function updateUI(){const l=level(),n=Object.keys(placed).length;$('progress').textContent=`${n} / ${K.goalCount(l)} 件`;$('move-count').textContent=`已整理 ${moves} 次`;const frozen=!!selected&&(locked.has(selected)||(l.fixedRot||[]).includes(selected));$('rotate').disabled=!selected||frozen;$('return').disabled=!selected||!placed[selected]||locked.has(selected);$('undo').disabled=!history.length;$('hint').disabled=finished;$('completed-count').textContent=`${K.levels.filter(l=>saved.completed[l.id]).length} / ${K.levels.length} 已整理`;document.querySelectorAll('.level-button').forEach((b,i)=>{b.hidden=K.levels[i].group!==l.group;b.setAttribute('aria-current',String(i===levelIndex));b.querySelector('.tick').textContent=saved.completed[K.levels[i].id]?'✓':'';});document.querySelectorAll('.mode-button').forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute('data-group')===l.group)));$('codex-count').textContent=`${Object.keys(saved.codex).length}/${K.relations.length}`;paintScore();}
  function load(i){cancelDrag();levelIndex=i;const l=level(),s=saved.sessions[l.id];// 委托人预置的固定件先落位，存档里的同类位置一律以固定件为准。
    locked=new Set((l.anchors||[]).map(a=>a.id));
    const base={};for(const a of l.anchors||[])base[a.id]={x:a.x,y:a.y,rot:((a.rot||0)%4+4)%4};
    placed=K.validState(l,base)?base:{};
    if(s&&s.placed)for(const[id,p]of Object.entries(s.placed)){if(locked.has(id)||!p||!K.canPlace(l,placed,id,p.x,p.y,p.rot))continue;placed[id]={x:p.x,y:p.y,rot:p.rot};}
    rotations={};for(const id of l.items)rotations[id]=(l.fixedRot||[]).includes(id)?0:(placed[id]?.rot||((Number.isInteger(s?.rotations?.[id])?s.rotations[id]:0)%4+4)%4);history=[];selected=null;ghost=null;drag=null;hint=null;moves=Number.isFinite(s?.moves)?Math.max(0,s.moves):0;hints=Number.isFinite(s?.hints)?Math.max(0,s.hints):0;finished=K.isComplete(l,placed);started=Date.now();$('letter-title').textContent=l.title;$('letter-body').textContent=l.letter;$('letter-from').textContent='—— '+l.from;$('letter-no').textContent=`${String(i+1).padStart(2,'0')} / ${K.levels.length}`;$('chapter-name').textContent=l.chapter;$('game-title').textContent=l.title;$('rule-title').textContent=K.modeNames[l.mode];$('rule-copy').textContent=l.rule;$('zone-key').textContent=[(l.zones||[]).map((z,i)=>`${i===0?'①':'②'} ${z.label}：${z.items.map(id=>K.items[id].name).join('、')}`).join(' ｜ '),l.blocked?.length?'木色斜纹格不可占用':'',l.dense?'这一层要刚好放满':'',l.anchors?.length?`已固定 ${l.anchors.length} 件`:'',(l.fixedRot||[]).length?`${l.fixedRot.map(id=>K.items[id].name).join('、')} 不能转着放`:''].filter(Boolean).join(' ｜ ');status(finished?'这份委托已经整理好了。也可以移动物品，试试另一种摆法。':l.anchors?.length?'委托人已经放好的几件不能移动，剩下的交给你。':l.keepCount?'先放入必留物，再挑选其他旧物；未选的物品留在桌面。':'拖动物品到抽屉，或先点物品，再点目标格。');checkRelations(false);event('level_start');persist();updateUI();requestDraw();}
  function requestDraw(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;render();});}}
  function resize(){const width=canvas.getBoundingClientRect().width,dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(width*H/W*dpr);requestDraw();}
  function text(t,x,y,size=14,color='#5c6958',align='left'){ctx.font=`${size}px "Microsoft YaHei",sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(t,x,y);}
  // 物品栏随件数自适应：6 件以内沿用原来的三列大格，7-8 件四列，9 件以上五列。
  const TRAY={x:25,y:405,w:590,h:104,pitch:112,gap:10};
  const trayCols=n=>n<=6?3:n<=8?4:5;
  function tileRect(i){const n=level().items.length,c=trayCols(n),tw=(TRAY.w-(c-1)*TRAY.gap)/c;return{x:TRAY.x+(i%c)*(tw+TRAY.gap),y:TRAY.y+Math.floor(i/c)*TRAY.pitch,w:tw,h:TRAY.h};}
  function itemRect(id){const i=level().items.indexOf(id),r=tileRect(i),b=K.bounds(K.shape(id,rotations[id]||0)),u=Math.min(30,67/b.h,(r.w-26)/b.w);return{x:r.x+(r.w-b.w*u)/2,y:r.y+6+(67-b.h*u)/2,w:b.w*u,h:b.h*u,u};}
  // 棋盘下方那句提示，按玩法逐层收敛，避免和规则卡片重复。
  function boardHint(){
    const l=level(),remaining=K.goalCount(l)-Object.keys(placed).length,missing=(l.required||[]).filter(id=>!placed[id]);
    if(finished)return l.dense?'一格不多，一格不少。':'每一件，都有自己的位置。';
    if(l.dense){const free=K.freeCells(l)-K.cellCount(l,placed);return free>0?`这一层要刚好放满，还差 ${free} 格。`:'刚好填满了。';}
    if(l.keepCount)return remaining===0&&missing.length?'还缺必留物，请先取回一件再换入。':`再选留 ${remaining} 件${missing.length?' · 必留物尚未放齐':' · 必留物已放好'}`;
    if(l.anchors?.length)return remaining===0?'固定件已经就位。':'委托人放好的几件不能动，其余照常。';
    if(l.mode==='classic')return '可以留空，不必填满。';
    if(l.mode==='blocked')return '绕开隔板，也可以试试旋转。';
    return '指定物品完整放入同名标记区。';
  }
  function render(){
    const scale=canvas.width/W;ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,W,H);const l=level(),b=board();ctx.fillStyle='#eee7d7';ctx.fillRect(0,0,W,H);
    // Quiet paper texture; deterministic so redraws do not shimmer.
    ctx.fillStyle='#8e7d5420';for(let i=0;i<650;i++){const x=(i*173+31)%W,y=(i*277+19)%H;ctx.fillRect(x,y,.7,.7);}
    text('留 一 格   /   收 纳 工 作 台',30,32,11,'#93917c');text(l.keepCount?`本单选留 ${K.goalCount(l)} 件`:l.dense?'本单要恰好放满':'把全部物品安顿好',W-29,32,11,'#93917c','right');
    ctx.save();ctx.shadowColor='#6d4f3020';ctx.shadowBlur=17;ctx.shadowOffsetY=8;A.rr(ctx,b.x-23,b.y-23,b.w+46,b.h+55,12,'#c7a982');ctx.restore();A.rr(ctx,b.x-18,b.y-18,b.w+36,b.h+44,9,'#d5bb96','#b39875');
    // Wood rings stay outside the puzzle cells.
    for(let i=0;i<4;i++)A.line(ctx,b.x-11,b.y-11+i*3,b.x+b.w+11,b.y-11+i*3,'#bea17b66');
    A.rr(ctx,b.x-5,b.y-5,b.w+10,b.h+10,4,l.surface==='green'?'#b8c4ad':'#e7d8b9','#a9916e');ctx.fillStyle=l.surface==='green'?'#d2dcc5':'#f0e5c8';ctx.fillRect(b.x,b.y,b.w,b.h);
    for(const[zindex,zone]of(l.zones||[]).entries()){
      const members=new Set(zone.cells.map(p=>p.join(','))),color=zindex===0?'#74998d':'#b78d71';ctx.fillStyle=zindex===0?'#b6d1c3':'#e7c5aa';
      for(const[x,y]of zone.cells)ctx.fillRect(b.x+x*b.cell,b.y+y*b.cell,b.cell,b.cell);
      for(const[x,y]of zone.cells){const px=b.x+x*b.cell,py=b.y+y*b.cell;for(const[dx,dy]of[[0,-1],[0,1],[-1,0],[1,0]])if(!members.has(`${x+dx},${y+dy}`)){if(dx===0)A.line(ctx,px,py+(dy>0?b.cell:0),px+b.cell,py+(dy>0?b.cell:0),color,3);else A.line(ctx,px+(dx>0?b.cell:0),py,px+(dx>0?b.cell:0),py+b.cell,color,3);}}
      const [zx,zy]=zone.cells[0];text(zindex===0?'①':'②',b.x+zx*b.cell+8,b.y+zy*b.cell+18,14,color);
    }
    ctx.strokeStyle=l.surface==='green'?'#b8c6ab':'#d9caab';ctx.lineWidth=1;ctx.setLineDash([2,5]);for(let x=1;x<l.cols;x++)A.line(ctx,b.x+x*b.cell,b.y,b.x+x*b.cell,b.y+b.h,ctx.strokeStyle);for(let y=1;y<l.rows;y++)A.line(ctx,b.x,b.y+y*b.cell,b.x+b.w,b.y+y*b.cell,ctx.strokeStyle);ctx.setLineDash([]);
    for(const[x,y]of l.blocked||[]){const px=b.x+x*b.cell,py=b.y+y*b.cell;A.rr(ctx,px+2,py+2,b.cell-4,b.cell-4,4,'#b89a75','#937852');ctx.save();ctx.beginPath();ctx.rect(px+4,py+4,b.cell-8,b.cell-8);ctx.clip();for(let offset=-52;offset<104;offset+=12)A.line(ctx,px+offset,py,px+offset+52,py+52,'#d4b58d',2);ctx.restore();}
    A.rr(ctx,b.x+b.w/2-32,b.y+b.h+16,64,8,4,'#9b825f');A.line(ctx,b.x+b.w/2-27,b.y+b.h+18,b.x+b.w/2+27,b.y+b.h+18,'#d2b990',2);
    const active=selected&&(drag?.moving||ghost);for(const[id,p]of Object.entries(placed)){if(active&&id===selected)continue;A.draw(ctx,id,b.x+p.x*b.cell,b.y+p.y*b.cell,b.cell,p.rot);if(id===selected)outline(id,p,'#536f5a',.3);}
    // 固定件加一圈虚线 + 一枚小图钉，和玩家自己摆的区分开。
    for(const id of locked){const p=placed[id];if(!p)continue;outline(id,p,'#9a8358',.18,true);const c=K.shape(id,p.rot)[0];A.circle(ctx,b.x+(p.x+c[0]+1)*b.cell-7,b.y+(p.y+c[1])*b.cell+7,3.4,'#c19a68','#8a6f42');}
    if(hint&&Date.now()<hint.until){outline(hint.id,hint.p,'#457b64',.3,true);text('提示位置 · '+K.items[hint.id].name,W/2,367,14,'#52745b','center');}
    else text(boardHint(),W/2,367,14,'#75846d','center');
    A.line(ctx,25,380,615,380,'#d1c8b6',1);text('从旧箱子里拿出来的物品',28,397,13,'#868570');text(selected?K.items[selected].name+' · 可旋转':'挑一件，开始整理',611,397,13,'#68785f','right');
    const tagSize=trayCols(l.items.length)>=5?13:15;
    l.items.forEach((id,i)=>{const r=tileRect(i),isPlaced=!!placed[id],isFixed=locked.has(id);A.rr(ctx,r.x,r.y,r.w,r.h,8,selected===id?'#e0e6d1':isFixed?'#e6dcc6':isPlaced?'#e7e1d2':'#f4eedf',selected===id?'#9aab8b':'#e0d7c4');const q=itemRect(id);A.draw(ctx,id,q.x,q.y,q.u,rotations[id]||0,isPlaced?.18:1);if(isPlaced)text(isFixed?'已固定':'已放好',r.x+r.w/2,r.y+42,14,isFixed?'#a08a5f':'#8a957c','center');text(K.items[id].name,r.x+r.w/2,r.y+92,tagSize,isPlaced?'#a09f8a':'#6b7160','center');if(l.required?.includes(id))text('必留',r.x+8,r.y+18,11,'#ad684f');const zi=(l.zones||[]).findIndex(z=>z.items.includes(id));if(zi>=0)text(zi===0?'①区':'②区',r.x+r.w-8,r.y+18,11,zi===0?'#54786c':'#946c50','right');});
    if(selected&&ghost){const p={...ghost,rot:rotations[selected]||0},valid=K.canPlace(l,placed,selected,p.x,p.y,p.rot);outline(selected,p,valid?'#4d8361':'#b9745b',.23);A.draw(ctx,selected,b.x+p.x*b.cell,b.y+p.y*b.cell,b.cell,p.rot,.85);}
    if(flashUntil>Date.now()){ctx.strokeStyle='#92a77d';ctx.lineWidth=3;ctx.strokeRect(b.x-3,b.y-3,b.w+6,b.h+6);requestDraw();}
  }
  function outline(id,p,color,alpha,dashed=false){const b=board();ctx.save();ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2;if(dashed)ctx.setLineDash([5,4]);for(const[dx,dy]of K.shape(id,p.rot)){ctx.globalAlpha=alpha;ctx.fillRect(b.x+(p.x+dx)*b.cell+1,b.y+(p.y+dy)*b.cell+1,b.cell-2,b.cell-2);ctx.globalAlpha=.8;ctx.strokeRect(b.x+(p.x+dx)*b.cell+2,b.y+(p.y+dy)*b.cell+2,b.cell-4,b.cell-4);}ctx.restore();}
  function position(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
  function hitItem(p){const b=board();for(const[id,v]of Object.entries(placed).reverse()){if(K.shape(id,v.rot).some(([dx,dy])=>p.x>=b.x+(v.x+dx)*b.cell&&p.x<b.x+(v.x+dx+1)*b.cell&&p.y>=b.y+(v.y+dy)*b.cell&&p.y<b.y+(v.y+dy+1)*b.cell))return id;}for(let i=0;i<level().items.length;i++){const id=level().items[i],r=tileRect(i);if(!placed[id]&&p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h)return id;}return null;}
  function select(id){selected=id;ghost=null;if(placed[id])rotations[id]=placed[id].rot;const l=level(),zone=(l.zones||[]).find(z=>z.items.includes(id)),tail=locked.has(id)?'  这一件委托人已经放好了，位置不能改。':(l.fixedRot||[]).includes(id)?'  这件只能按原方向摆放，不能旋转。':zone?`  请完整放进「${zone.label}」。`:'  选好位置后放下；R键旋转。';status(K.items[id].memory+tail);updateUI();requestDraw();}
  function setGhost(p,grab){if(!selected)return;const b=board();ghost={x:Math.floor((p.x-b.x)/b.cell)-(grab?.x||0),y:Math.floor((p.y-b.y)/b.cell)-(grab?.y||0)};requestDraw();}
  function place(id,x,y,rot){
    if(locked.has(id)){const a=placed[id];if(a&&a.x===x&&a.y===y&&((a.rot%4)+4)%4===((rot%4)+4)%4)return true;status('这一件委托人已经放好了，位置不能改。');event('invalid_placement',{reason:'locked'});requestDraw();return false;}
    const error=K.placementError(level(),placed,id,x,y,rot);if(error){ghost=null;drag=null;status({blocked:'这里是固定隔板，不能放物品。试试旁边的空位。',zone:'这件物品需要完整放进同名标记区，旋转后也要全部在区内。',quota:'本单件数已满。请右键取回一件，或用“放回桌面”，再换入想留的物品。',norot:'这件只能按原来的方向摆放，转过来就放不下了。'}[error]||'这里有些挤。换个位置，或者旋转一下试试。');event('invalid_placement',{reason:error});requestDraw();return false;}snapshot();placed[id]={x,y,rot};rotations[id]=rot;moves++;selected=null;ghost=null;hint=null;drag=null;event('item_placed',{item:id});beep();const fresh=checkRelations();if(!fresh.length)status('放好了。还可以继续调整，不用急。');checkComplete(fresh);persist();updateUI();requestDraw();return true;}
  function checkComplete(fresh=[]){finished=K.isComplete(level(),placed);if(!finished){if(level().keepCount&&Object.keys(placed).length===K.goalCount(level()))status('件数够了，但必留物还没放齐。先取回一件，再把必留物换进来。');return;}const l=level();saved.completed[l.id]=true;flashUntil=Date.now()+450;event('level_complete',{moves,hints,kept:Object.keys(placed),elapsedSeconds:Math.round((Date.now()-started)/1000)});const sc=K.scoreLayout(l,placed);$('reply').textContent=l.reply;$('reward').textContent=l.reward;$('result-score').textContent=`整齐度 ${sc.total} · ${K.verdict(sc.total)}`+(fresh.length?`　新解锁 ${fresh.length} 段回忆`:'');$('score-line').textContent=`对齐 ${sc.align} · 留白 ${sc.gap} · 居中 ${sc.center}　${K.advice(sc)}`;$('result-stats').textContent=`${Object.keys(placed).length} 件旧物已安顿 · 整理 ${moves} 次 · 提示 ${hints} 次`+(l.keepCount?` · ${l.items.length-Object.keys(placed).length} 件留在桌面`:'');$('next').textContent=levelIndex===K.levels.length-1?'回到第一份委托':'下一份委托 →';$('artwork-preview').hidden=true;$('complete-dialog').showModal();beep(true);}
  function rotate(){if(!selected)return;const id=selected;if(locked.has(id)){status('这件是委托人放好的，已经固定住了。');return;}if((level().fixedRot||[]).includes(id)){status('这件只能按原来的方向摆放，转过来就放不下了。');return;}const next=((rotations[id]||0)+1)%4;if(placed[id]&&!ghost&&!drag?.moving){const p=placed[id];if(!K.canPlace(level(),placed,id,p.x,p.y,next)){status('原地转不开。先拖到空位，或放回桌面再旋转。');return;}snapshot();placed[id]={...p,rot:next};moves++;rotations[id]=next;hint=null;persist();}else{rotations[id]=next;if(drag){const b=K.bounds(K.shape(id,next));drag.grab={x:Math.floor(b.w/2),y:Math.floor(b.h/2)};}}checkRelations();event('rotate',{item:id});updateUI();requestDraw();}
  function returnItem(id=selected){if(!id||!placed[id])return;if(locked.has(id)){status('这件是委托人放好的，收不回去，也动不了。');return;}snapshot();delete placed[id];finished=false;moves++;hint=null;ghost=null;selected=null;event('item_returned',{item:id});persist();status('已放回桌面，可以重新摆放；撤销可恢复原位。');updateUI();requestDraw();}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;if(drag)return;e.preventDefault();canvas.focus({preventScroll:true});const p=position(e),b=board();if(selected&&p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h&&!hitItem(p)){setGhost(p);place(selected,ghost.x,ghost.y,rotations[selected]||0);return;}const id=hitItem(p);if(!id){selected=null;ghost=null;updateUI();requestDraw();return;}select(id);if(locked.has(id)){drag=null;status('这一件委托人已经放好了，位置不能改。点别的地方继续整理。');updateUI();requestDraw();return;}const size=K.bounds(K.shape(id,rotations[id]||0));drag={id,pointer:e.pointerId,start:p,moving:false,grab:placed[id]?{x:Math.floor((p.x-b.x)/b.cell)-placed[id].x,y:Math.floor((p.y-b.y)/b.cell)-placed[id].y}:{x:Math.floor(size.w/2),y:Math.floor(size.h/2)}};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.pointer)return;
    if(e.pointerType==='mouse'&&(e.buttons&1)===0){cancelDrag();return;}
    const p=position(e);if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>7)drag.moving=true;
    if(drag.moving)setGhost(p,drag.grab);
  });
  function cancelDrag(){const pointer=drag?.pointer;drag=null;ghost=null;if(pointer!==undefined&&canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);requestDraw();}
  canvas.addEventListener('pointerup',e=>{
    if(!drag||drag.pointer!==e.pointerId)return;
    const d=drag,p=position(e),target=ghost;drag=null;ghost=null;
    if(d.moving){if(p.y>=380&&placed[d.id])returnItem(d.id);else if(target)place(d.id,target.x,target.y,rotations[d.id]||0);}
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);requestDraw();
  });
  canvas.addEventListener('pointercancel',e=>{if(drag?.pointer===e.pointerId)cancelDrag();});
  canvas.addEventListener('lostpointercapture',e=>{if(drag?.pointer===e.pointerId)cancelDrag();});
  canvas.addEventListener('contextmenu',e=>{
    e.preventDefault();if(e.pointerType==='touch')return;
    const id=hitItem(position(e));cancelDrag();
    if(id&&placed[id])returnItem(id);else{selected=null;updateUI();requestDraw();}
  });
  window.addEventListener('blur',cancelDrag);document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDrag();persist();}});
  canvas.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r'){e.preventDefault();rotate();}else if(e.key==='Escape'){cancelDrag();selected=null;updateUI();requestDraw();}else if(selected&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' '].includes(e.key)){e.preventDefault();if(!ghost)ghost=placed[selected]?{x:placed[selected].x,y:placed[selected].y}:{x:0,y:0};if(e.key==='ArrowUp')ghost.y--;if(e.key==='ArrowDown')ghost.y++;if(e.key==='ArrowLeft')ghost.x--;if(e.key==='ArrowRight')ghost.x++;if(e.key==='Enter'||e.key===' ')place(selected,ghost.x,ghost.y,rotations[selected]||0);requestDraw();}});
  $('rotate').onclick=rotate;$('return').onclick=()=>returnItem();
  $('undo').onclick=()=>{if(!history.length)return;cancelDrag();const s=history.pop();placed=s.placed;rotations=s.rotations;moves=s.moves;hints=s.hints;finished=K.isComplete(level(),placed);selected=null;ghost=null;hint=null;event('undo');persist();status('退回上一步了。慢慢试，总能找到位置。');updateUI();requestDraw();};
  $('hint').onclick=()=>{cancelDrag();selected=null;ghost=null;const r=K.solve(level(),placed,70000);hints++;event('hint',{result:r.status});if(r.solution){const id=Object.keys(r.solution).find(id=>!placed[id]);if(id){hint={id,p:r.solution[id],until:Date.now()+12000};status(`试试把「${K.items[id].name}」放在绿色虚线位置，方向也要一致。这只是其中一种${level().keepCount?'选择与':''}摆法。`);setTimeout(()=>requestDraw(),12100);}}else{hint=null;status(r.status==='unsolvable'?'目前的选择或摆法无法完成委托。撤销一步，或把一件旧物放回桌面，再试提示。':'这次布局有些复杂。先把一件大物品放回桌面，再试提示。');}persist();updateUI();requestDraw();};
  $('reset').onclick=()=>$('reset-dialog').showModal();$('confirm-reset').onclick=()=>{$('reset-dialog').close();delete saved.sessions[level().id];load(levelIndex);event('restart');persist();};
  $('help').onclick=()=>$('help-dialog').showModal();$('codex').onclick=()=>{renderCodex();$('codex-dialog').showModal();};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  // ---- 声音：一个开关同时管 BGM 和提示音，选择记进存档 ----
  const Music=window.KeepsakeMusic;
  function paintSound(){const b=$('sound');b.textContent=muted?'声音：关':'声音：开';b.setAttribute('aria-pressed',String(!muted));}
  $('sound').onclick=()=>{muted=!muted;saved.sound=!muted;if(Music)Music.set(!muted);paintSound();beep();persist();};
  // 浏览器要求音频必须由用户手势启动，所以 BGM 挂在「第一次点到画面／按下按键」上，不在加载时就响。
  if(!muted&&Music){let woken=false;const wake=()=>{if(woken)return;woken=true;Music.set(true);};document.addEventListener('pointerdown',wake,{once:true});document.addEventListener('keydown',wake,{once:true});}
  paintSound();
  $('next').onclick=()=>{$('complete-dialog').close();load((levelIndex+1)%K.levels.length);};
  function savePicture(){
    const out=document.createElement('canvas');out.width=900;out.height=800;const c=out.getContext('2d');
    c.fillStyle='#f4efe3';c.fillRect(0,0,900,800);c.fillStyle='#425a49';c.textAlign='center';c.font='30px "Microsoft YaHei",sans-serif';c.fillText('留一格 · '+level().title,450,68);
    c.font='16px "Microsoft YaHei",sans-serif';c.fillStyle='#8a8c76';c.fillText('把旧物安顿好，给生活留一格。',450,106);
    const u=70,l=level(),x=(900-l.cols*u)/2,y=170;A.rr(c,x-24,y-24,l.cols*u+48,l.rows*u+60,12,'#cbb08b');c.fillStyle=l.surface==='green'?'#d2dcc5':'#f0e5c8';c.fillRect(x,y,l.cols*u,l.rows*u);
    for(const[i,z]of(l.zones||[]).entries()){c.fillStyle=i===0?'#b6d1c3':'#e7c5aa';for(const[zx,zy]of z.cells)c.fillRect(x+zx*u,y+zy*u,u,u);}
    for(const[bx,by]of l.blocked||[])A.rr(c,x+bx*u+2,y+by*u+2,u-4,u-4,4,'#b89a75','#937852');
    for(const[id,p]of Object.entries(placed))A.draw(c,id,x+p.x*u,y+p.y*u,u,p.rot);
    if(l.keepCount){c.fillStyle='#677d69';c.font='15px "Microsoft YaHei",sans-serif';c.fillText('这次留下：'+Object.keys(placed).map(id=>K.items[id].name).join('、'),450,622);}
    const sc=K.scoreLayout(l,placed);
    c.fillStyle='#4f6350';c.font='26px "Microsoft YaHei",sans-serif';c.fillText(`整齐度 ${sc.total}`,450,668);
    c.fillStyle='#7f8a72';c.font='14px "Microsoft YaHei",sans-serif';c.fillText(`对齐 ${sc.align} · 留白 ${sc.gap} · 居中 ${sc.center}　${K.verdict(sc.total)}`,450,696);
    c.fillStyle='#7a826b';c.font='18px "Microsoft YaHei",sans-serif';c.fillText(l.reward,450,730);
    c.fillStyle='#8b937c';c.font='14px "Microsoft YaHei",sans-serif';c.fillText(`栖湾 · 留一格旧物整理所　回忆图鉴 ${Object.keys(saved.codex).length} / ${K.relations.length}`,450,764);
    const src=out.toDataURL('image/png');$('artwork-img').src=src;$('artwork-download').href=src;$('artwork-download').download=`留一格-${l.title}.png`;$('artwork-preview').hidden=false;
    event('artwork_generated');persist();status('作品图已生成，可以长按保存或点击下载。');
  }
  $('save-picture').onclick=savePicture;
  for(const c of K.chapters){const b=document.createElement('button');b.className='mode-button';b.setAttribute('data-group',c.key);b.textContent=c.name;b.setAttribute('aria-label',`${c.name}，${K.levels.filter(l=>l.group===c.key).length}关`);b.setAttribute('aria-pressed','false');b.onclick=()=>load(K.levels.findIndex(l=>l.group===c.key));$('mode-tabs').appendChild(b);}
  // 委托簿按章节分组显示，序号也跟着按「章内顺序」排：本章有 13 关就编 01–13。
  // 之前用的是全局序号，切到「隔板抽屉」会看到 13,14,15,22,23,24,52,59,66… —— 中间全是被别的章节占掉的号，
  // 看着像漏了关卡。全局进度由顶栏「X / 100 已整理」和信头的「87 / 100」负责，列表只管本章内部。
  const chapterName={},chapterNo={};
  for(const c of K.chapters)chapterName[c.key]=c.name;
  K.levels.forEach((l,i)=>{const n=chapterNo[l.group]=(chapterNo[l.group]||0)+1,b=document.createElement('button');b.className='level-button';b.innerHTML=`<span class="number">${String(n).padStart(2,'0')}</span><span class="level-name"></span><span class="tick"></span>`;b.querySelector('.level-name').textContent=l.title;b.setAttribute('data-no',String(n));b.setAttribute('data-group',l.group);b.setAttribute('aria-label',`${chapterName[l.group]} 第 ${n} 关：${l.title}`);b.onclick=()=>load(i);$('levels').appendChild(b);});
  // Debug access is opt-in and never changes the normal player flow.
  if(new URLSearchParams(location.search).has('test'))window.GameDebug={getState:()=>({levelIndex,placed:clone(placed),rotations:{...rotations},locked:[...locked],selected,ghost:ghost?{...ghost}:null,drag:drag?clone(drag):null,finished,moves,history:history.length,storageOK,board:board()}),load,loadId:id=>{const i=K.levels.findIndex(l=>l.id===id);load(i);return i;},place,select,itemRect,tileRect,solve:()=>K.solve(level(),placed),events:()=>saved.events,score:()=>K.scoreLayout(level(),placed),codex:()=>({...saved.codex}),met:()=>K.metRelations(level(),placed),levelId:()=>level().id};
  // 允许用 ?level=7 直接打开某一份委托，方便分享和验收。
  const wanted=Number(new URLSearchParams(location.search).get('level'));
  const initial=Number.isInteger(wanted)&&wanted>=1&&wanted<=K.levels.length?wanted-1:Number.isInteger(saved.current)&&saved.current>=0&&saved.current<K.levels.length?saved.current:0;load(initial);new ResizeObserver(resize).observe(canvas);resize();if(!storageOK)status('浏览器暂不允许本机存档；本次仍可正常游玩。');
  // 验收用的两个入口：?test=1&solve=1 直接摆上参考解（截图用），?codex=1 直接打开图鉴。
  if(new URLSearchParams(location.search).has('test')&&new URLSearchParams(location.search).has('solve')){
    const s=K.solve(level()).solution;
    for(const[id,p]of Object.entries(s))place(id,p.x,p.y,p.rot);
    if($('complete-dialog').open)$('complete-dialog').close();
  }
  if(new URLSearchParams(location.search).has('codex'))$('codex').onclick();
})();
