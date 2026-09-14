(()=>{
  'use strict';
  const K=Keepsake,A=KeepsakeArt,$=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
  const KEY='liuyige-mvp-v1',CONSENT_KEY='liuyige-privacy-v1';let levelIndex=0,placed={},rotations={},history=[],selected=null,ghost=null,drag=null,hint=null,moves=0,hints=0,started=Date.now(),finished=false,scheduled=false,audio=null,muted=false,flashUntil=0,locked=new Set();
  // VW/VH 是当前这张逻辑画布的逻辑宽高，LAY 是当前版式（见 computeLayout）。
  // 画布在屏幕上按 CSS 宽度等比缩放，所以逻辑尺寸越小，屏幕上的东西越大；
  // 版式要跟着屏幕宽度换，不能再写死一套 640×640。
  let VW=640,VH=640,LAY=null;
  // 看广告换来的两种帮忙，都按本关记账：
  //   freeHints —— 每关自带一次免费提示，用完之后再点就要看广告；
  //   removed   —— 「消除」掉的旧物。消掉一件，这一关就不再需要安顿它。
  //                空格上限要跟着放宽同样的格数，否则剩下的物品再也填不满，关卡会变成死局。
  const FREE_HINTS=1,MAX_CLEARS=2,AUTO_LIMIT=1;
  let removed=new Set(),freeHints=0,clears=0,autoPlaced=0;
  // hmove：提示明确点名「这一件放错了」时记下它。玩家把这件挪走/收回后自动清空，
  // 免得那条红灯一样的警示框一直挂着，变成过期的误导。
  let hmove=null;
  let saved={version:1,completed:{},sessions:{},events:[],codex:{},sound:true},storageOK=true;
  // 隐私同意状态：'yes' = 已同意（存进度）／'no' = 已拒绝（不存进度，其余照旧）／null = 还没问过。
  // 这一条读在存档之前，因为「拒绝」本身也要记住，否则每次开都弹。
  let consent=null;
  try{const c=localStorage.getItem(CONSENT_KEY);if(c==='yes'||c==='no')consent=c;}catch{storageOK=false;}
  // 用户拒绝隐私政策后，一切写入都停掉——不只不弹窗，是真的不落盘。
  // 但游戏必须照常能玩：TapTap 审核明确要求「无论用户拒绝任何权限，都需提供基础功能」。
  const canPersist=()=>consent==='yes';
  try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');if(raw&&raw.version===1&&raw.completed&&raw.sessions&&typeof raw.completed==='object'&&typeof raw.sessions==='object')saved={version:1,current:raw.current,completed:raw.completed,sessions:raw.sessions,events:Array.isArray(raw.events)?raw.events.slice(-200):[],codex:raw.codex&&typeof raw.codex==='object'?raw.codex:{},sound:raw.sound!==false};}catch{storageOK=false;}
  // BGM 默认开。存档里明确关过就尊重存档；读不出存档（或存档坏了）按「没关过」处理。
  muted=saved.sound===false;
  let toastUntil=0,toastTimer=null;
  // 消除过的旧物不在这份委托里了：物品清单、必留清单、以及「要填多满」都要跟着改。
  // drop 是「试算要额外抹掉的那一件」——消除前要拿它去问求解器，所以不能写进 removed。
  const level=(drop)=>{const base=K.levels[levelIndex];
    const gone=drop?new Set([...removed,drop]):removed;
    if(!gone.size)return base;
    const keep=id=>!gone.has(id);
    const out={...base,items:base.items.filter(keep)};
    if(base.required)out.required=base.required.filter(keep);
    // 上限按真正消失的格数放宽，不读 removedCells——那个变量只在落地时才更新，试算会算错。
    if(!base.keepCount)out.maxEmpty=K.maxEmptyOf(base)+[...gone].reduce((n,id)=>n+K.items[id].cells.length,0);
    return out;};
  // ── 画布版式 ────────────────────────────────────────────────────────────
  // 画布是一张按 CSS 宽度等比缩放的「逻辑画布」：屏幕上的尺寸 = 逻辑尺寸 ×（CSS宽 ÷ 逻辑宽）。
  // 原来只有一套 640×640 的稿子，棋盘居中只占 270 左右，两侧各空掉近 185 逻辑 px；
  // 放到手机上（画布约 366 CSS px）缩放比只剩 0.57，棋盘和箱子里的物品都被压得很小。
  // 所以按屏幕宽度分两套：
  //   宽屏（桌面/平板）—— 沿用 640×640 原稿，桌面观感与改版前逐项一致；
  //   窄屏（手机）—— 逻辑宽收到 400，缩放比接近 1:1（1 逻辑 px ≈ 1 CSS px），
  //                  棋盘顶满宽度、物品栏每排少放一件、多排一行，格子和图标都跟着变大。
  //
  // 判断「是不是手机」只看视口宽度，而且和 style.css 里 650 那条媒体查询共用同一个断点，
  // 否则会出现「页面按手机排、画布按桌面画」的错配。
  //
  // 这里曾经还留过一条「画布窄于 480 也算手机」的兜底，反而把桌面坑了：桌面窗口矮一点
  // （1280×800 的窗口，画布被 max-width 压到 450）就被判成手机，换成一张比窗口还高的
  // 长画布——棋盘是大了，物品栏却掉到屏幕外，得滚动才够得着，拖一件东西要来回滚。
  // 对拖拉类玩法来说「一屏看全」比「格子大」重要，所以矮窗口只当是「小一号的桌面」。
  const PHONE_VIEWPORT=650;
  const isPhone=()=>{
    const vw=Number.isFinite(window.innerWidth)?window.innerWidth:0;
    return vw>0&&vw<=PHONE_VIEWPORT;
  };
  function computeLayout(cssW,l){
    const count=(l.items||[]).length;
    if(!isPhone()){
      // ── 宽屏：原设计稿 ──
      const W=640,H=640,gap=10,trayW=590;
      const cell=Math.max(28,Math.min(52,Math.floor(275/l.rows),Math.floor(530/l.cols)));
      const cols=count<=6?3:count<=8?4:count<=10?5:6;
      const rows=Math.max(1,Math.ceil(count/cols)),tall=rows<=2;
      const tileH=tall?104:68,pitch=tall?112:76;
      return{phone:false,W,H,padBottom:12,uMax:30,lastX:615,
        head:{x:30,y:32,right:29},
        board:{top:64,cell,availW:530},
        frame:{out:23,out2:18,out3:5,ring:11,bottom:55,bottom2:44,handleGap:16,handleW:64,handleH:8},
        hintY:367,sep:{y:380,x1:25},label:{y:397,x:28,right:611},
        tray:{x:25,y:400,w:trayW,gap,cols,rows,tileH,pitch,tw:(trayW-(cols-1)*gap)/cols,
          tagY:tall?18:13,artTop:tall?6:4,artH:tall?67:38,markY:tall?42:30,
          nameY:tall?92:tileH-8,nameSize:tall?(cols>=5?13:15):11}};
    }
    // ── 窄屏（手机）：先把箱子排好，棋盘再顶满剩下的宽度，总高由内容决定 ──
    // 逻辑宽默认 400（≈1:1）。但 650 视口这一档（大屏手机、竖着拿的平板）画布能到 620 上下，
    // 再按 1:1 铺开就放大到 1.5 倍以上，格子没见大多少、画布却高得离谱；
    // 所以让逻辑宽跟着画布长一点，把缩放封在 1.35 倍以内。
    const W=Math.max(400,Math.min(560,Math.round(cssW/1.35)));
    const pad=14,gap=9,minTile=74,frameOut=13;
    const contentW=W-pad*2;
    // 每排最多排到「一件仍有 minTile 宽」为止；再按件数把行数压到 3 行上下，
    // 结果就是每排比原稿少放一件、多出一行，格子宽了、图标也就大了。
    const maxCols=Math.max(2,Math.floor((contentW+gap)/(minTile+gap)));
    const cols=Math.max(2,Math.min(maxCols,Math.ceil(count/3)));
    const rows=Math.max(1,Math.ceil(count/cols));
    const tw=(contentW-(cols-1)*gap)/cols;
    const tileH=Math.round(Math.min(92,Math.max(50,tw*.7))),pitch=tileH+8;
    // 棋盘要顶满可用宽度，格子只受列数限制（高盘面的格数由行数自己决定）。
    const cell=Math.max(24,Math.min(58,Math.floor((W-pad*2-frameOut*2)/l.cols)));
    const boardTop=44,boardBottom=boardTop+l.rows*cell;
    const trayY=boardBottom+73;
    const H=Math.round(trayY+((rows-1)*pitch+tileH)+14);
    return{phone:true,W,H,padBottom:14,uMax:34,lastX:W-pad,
      head:{x:16,y:22,right:16},
      board:{top:boardTop,cell,availW:W-pad*2-frameOut*2},
      frame:{out:frameOut,out2:10,out3:4,ring:7,bottom:22,bottom2:18,handleGap:11,handleW:52,handleH:7},
      hintY:boardBottom+40,sep:{y:boardBottom+54,x1:pad},label:{y:boardBottom+70,x:pad+2,right:W-pad-2},
      tray:{x:pad,y:trayY,w:contentW,gap,cols,rows,tileH,pitch,tw,
        tagY:10,artTop:8,artH:tileH-24,markY:Math.round(tileH*.56),nameY:tileH-7,
        nameSize:tileH>=76?14:12}};
  }
  // 兜底初值：还没量过画布之前先排一版（这时视口已经读得出来，所以基本就是对的），
  // load() 会按真实画布宽度再校一次。
  LAY=computeLayout(640,K.levels[0]);
  const board=()=>{const l=level(),cell=LAY.board.cell;return{x:(LAY.W-l.cols*cell)/2,y:LAY.board.top,cell,w:l.cols*cell,h:l.rows*cell};};
  const clone=x=>JSON.parse(JSON.stringify(x));
  function event(name,data={}){saved.events.push({name,level:level().id,at:Date.now(),...data});saved.events=saved.events.slice(-200);}
  // 同意之前、以及用户拒绝之后，都不写盘。内存里的进度照常走，玩法一点不受影响，
  // 只是关掉页面就没了——这一点在弹窗里跟玩家说清楚了。
  function persist(){if(!canPersist())return;saved.current=levelIndex;saved.sessions[level().id]={placed:clone(placed),rotations:{...rotations},moves,hints,removed:[...removed],freeHints,clears,autoPlaced};try{localStorage.setItem(KEY,JSON.stringify(saved));storageOK=true;}catch{storageOK=false;}}
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
  // ── 关卡解锁：一次开一关，从第一关依次开到最后一关 ────────────────────────
  // 判据是「前面的都整理完了没有」——第一个没完成的关卡就是能走到的边界。
  // 通关记录本来就在存档里（saved.completed），所以老存档不收新字段也自动对上。
  // 分享/验收用的直达入口（?level=7、?test=1）不受这条限制，见文件末尾。
  let unlockAll=false;
  function unlockedLimit(){const i=K.levels.findIndex(l=>!saved.completed[l.id]);return i<0?K.levels.length-1:i;}
  const isUnlocked=i=>unlockAll||i<=unlockedLimit()||!!saved.completed[K.levels[i].id];
  const firstLocked=()=>{const i=unlockedLimit();return `第 ${String(i+1).padStart(2,'0')} 关「${K.levels[i].title}」`;};
  function paintLock(b,i){
    const shut=!isUnlocked(i),tick=b.querySelector&&b.querySelector('.tick');
    if(tick)tick.textContent=shut?'锁':(saved.completed[K.levels[i].id]?'✓':'');
    if(b.classList)b.classList.toggle('locked',shut);
    b.setAttribute('aria-disabled',String(shut));
  }
  // 「能消掉的候选」只按规则筛一遍（不必须、也没被固定），**不判可解性**。
  // updateUI 每次放置、选中都要用这个集合，那里绝不能跑求解器：
  // 候选逐个试可解性在大师关一盘死局上要烧十几秒（搪瓷杯放到死路那件事）。
  function clearPool(){const l=level();return l.items.filter(id=>!(l.required||[]).includes(id)&&!locked.has(id));}
  function updateUI(){const l=level(),n=Object.keys(placed).length;$('progress').textContent=`${n} / ${K.goalCount(l)} 件`;$('move-count').textContent=`已整理 ${moves} 次`;const frozen=!!selected&&!canTurn(selected);$('rotate').disabled=!selected||frozen;
    // 手机上再给一个拇指区的翻转键：工具栏在画布下方、一屏之外，转个方向要来回滚一趟。
    // 它做的和「旋转」按钮是同一件事（都走 rotate()），只是「够得着」。宽屏由 CSS 藏掉。
    const fab=$('rotate-fab');if(fab)fab.hidden=!selected||frozen;$('return').disabled=!selected||!placed[selected]||locked.has(selected);$('undo').disabled=!history.length;$('hint').disabled=finished;
    // 三个「救援」按钮的文案随剩余额度变，免得玩家点了才发现额度用完了。
    // 另外还会看「这次到底要不要看广告」：ads.js 的 AD_UNIT_ID 没配好、或不在 TapTap
    // 客户端里时，这几下帮忙是**直接免费给**的（见 ads.js 的 STRICT）。那就别写「看广告」——
    // 游戏内的隐私政策写着「没有接入任何广告 SDK」，按钮却喊看广告，两处对不上。
    const needsAd=!!(window.KeepsakeAds&&window.KeepsakeAds.supported());
    const withAd=t=>needsAd?'看广告 · '+t:t;
    const hintSpan=$('hint').querySelector&&$('hint').querySelector('span');if(hintSpan)hintSpan.textContent=freeHints<FREE_HINTS?'一点提示':withAd('提示');
    const autoBtn=$('auto');const autoSpan=autoBtn.querySelector&&autoBtn.querySelector('span');if(autoSpan)autoSpan.textContent=autoPlaced>=AUTO_LIMIT?'已代放':withAd('帮我放一件');autoBtn.disabled=finished||autoPlaced>=AUTO_LIMIT;
    const clearBtn=$('clear');const clearSpan=clearBtn.querySelector&&clearBtn.querySelector('span');if(clearSpan)clearSpan.textContent=clears>=MAX_CLEARS?'已用完':withAd('消除一件');
    clearBtn.disabled=finished||clears>=MAX_CLEARS||!clearPool().length;$('completed-count').textContent=`${K.levels.filter(l=>saved.completed[l.id]).length} / ${K.levels.length} 已整理`;document.querySelectorAll('.level-button').forEach((b,i)=>{b.hidden=K.levels[i].group!==l.group;b.setAttribute('aria-current',String(i===levelIndex));paintLock(b,i);});document.querySelectorAll('.mode-button').forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute('data-group')===l.group)));$('codex-count').textContent=`${Object.keys(saved.codex).length}/${K.relations.length}`;paintScore();}
  function load(i){cancelDrag();levelIndex=i;
    // 先读存档里的「消除」记录，再算这一关长什么样——顺序反了会把上一关的消除带过来。
    const s=saved.sessions[K.levels[i].id];
    removed=new Set(Array.isArray(s?.removed)?s.removed.filter(id=>K.items[id]):[]);
    freeHints=Number.isFinite(s?.freeHints)?Math.max(0,s.freeHints):0;
    clears=Number.isFinite(s?.clears)?Math.max(0,s.clears):0;
    autoPlaced=Number.isFinite(s?.autoPlaced)?Math.max(0,s.autoPlaced):0;
    const l=level();// 委托人预置的固定件先落位，存档里的同类位置一律以固定件为准。
    locked=new Set((l.anchors||[]).map(a=>a.id));
    const base={};for(const a of l.anchors||[])base[a.id]={x:a.x,y:a.y,rot:((a.rot||0)%4+4)%4};
    placed=K.validState(l,base)?base:{};
    if(s&&s.placed)for(const[id,p]of Object.entries(s.placed)){if(locked.has(id)||!p||!K.canPlace(l,placed,id,p.x,p.y,p.rot))continue;placed[id]={x:p.x,y:p.y,rot:p.rot};}
    rotations={};for(const id of l.items)rotations[id]=(l.fixedRot||[]).includes(id)?0:(placed[id]?.rot||((Number.isInteger(s?.rotations?.[id])?s.rotations[id]:0)%4+4)%4);history=[];selected=null;ghost=null;drag=null;hint=null;moves=Number.isFinite(s?.moves)?Math.max(0,s.moves):0;hints=Number.isFinite(s?.hints)?Math.max(0,s.hints):0;finished=K.isComplete(l,placed);started=Date.now();$('letter-title').textContent=l.title;$('letter-body').textContent=l.letter;$('letter-from').textContent='—— '+l.from;$('letter-no').textContent=`${String(i+1).padStart(2,'0')} / ${K.levels.length}`;$('chapter-name').textContent=l.chapter;$('game-title').textContent=l.title;$('rule-title').textContent=K.modeNames[l.mode];$('rule-copy').textContent=l.rule;$('zone-key').textContent=[(l.zones||[]).map((z,i)=>`${i===0?'①':'②'} ${z.label}：${z.items.map(id=>K.items[id].name).join('、')}`).join(' ｜ '),l.blocked?.length?'木色斜纹格不可占用':'',l.dense?(K.maxEmptyOf(l)===0?'这一层要刚好放满':'这一层最多空一格'):'',l.anchors?.length?`已固定 ${l.anchors.length} 件`:'',(l.fixedRot||[]).length?`${l.fixedRot.map(id=>K.items[id].name).join('、')} 不能转着放`:''].filter(Boolean).join(' ｜ ');status(finished?'这份委托已经整理好了。也可以移动物品，试试另一种摆法。':l.anchors?.length?'委托人已经放好的几件不能移动，剩下的交给你。':l.keepCount?'先放入必留物，再挑选其他旧物；未选的物品留在桌面。':'拖动物品到抽屉，或先点物品，再点目标格。');checkRelations(false);event('level_start');persist();updateUI();resize();}
  function requestDraw(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;render();});}}
  // 重新量画布的 CSS 宽度 → 挑版式 → 定画布位图尺寸。切关（棋盘行列变了）、转屏、
  // 拉窗口都要重算。位图尺寸只在真的变了才写：写 canvas.width/height 会让元素盒子跟着变
  // （height:auto），而元素是被 ResizeObserver 盯着的，多余的一次写会触发告警。
  let laidOutW=0,laidOutLevel=null,laidOutDpr=0,laidOutVw=0;
  function resize(){
    const width=canvas.getBoundingClientRect().width||VW,l=level();
    const dpr=Math.min(window.devicePixelRatio||1,2);
    // 版式是按视口宽挑的，所以要把视口也纳入比较：只把窗口拉窄（高度没变、画布宽度
    // 其实没动）时也得重挑一次，否则会出现「页面已经按手机排、画布还是桌面稿」的错配。
    const vw=Number.isFinite(window.innerWidth)?window.innerWidth:0;
    if(width!==laidOutW||l.id!==laidOutLevel||dpr!==laidOutDpr||vw!==laidOutVw){
      laidOutW=width;laidOutLevel=l.id;laidOutDpr=dpr;laidOutVw=vw;
      LAY=computeLayout(width,l);VW=LAY.W;VH=LAY.H;
      const w=Math.round(width*dpr),h=Math.round(width*VH/VW*dpr);
      if(canvas.width!==w)canvas.width=w;
      if(canvas.height!==h)canvas.height=h;
    }
    requestDraw();
  }
  function text(t,x,y,size=14,color='#5c6958',align='left'){ctx.font=`${size}px "Microsoft YaHei",sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(t,x,y);}
  // 物品栏的排布全部来自 LAY.tray：宽屏是原稿的「≤6 件三列……11 件以上六列」，
  // 窄屏改成每排少放一件、多排一行（见 computeLayout）。这里只负责取用。
  const traySpec=()=>LAY.tray;
  function tileRect(i){const s=LAY.tray;return{x:s.x+(i%s.cols)*(s.tw+s.gap),y:s.y+Math.floor(i/s.cols)*s.pitch,w:s.tw,h:s.tileH};}
  function itemRect(id){const i=level().items.indexOf(id),r=tileRect(i),s=LAY.tray,b=K.bounds(K.shape(id,rotations[id]||0)),u=Math.min(LAY.uMax,s.artH/b.h,(r.w-(LAY.phone?14:26))/b.w);return{x:r.x+(r.w-b.w*u)/2,y:r.y+s.artTop+(s.artH-b.h*u)/2,w:b.w*u,h:b.h*u,u};}
  // 棋盘下方那句提示，按玩法逐层收敛，避免和规则卡片重复。
  function boardHint(){
    const l=level(),remaining=K.goalCount(l)-Object.keys(placed).length,missing=(l.required||[]).filter(id=>!placed[id]);
    const cap=K.maxEmptyOf(l),room=K.freeCells(l)-K.cellCount(l,placed);
    if(finished)return l.dense?(cap===0?'一格不多，一格不少。':'最后一格也留得刚刚好。'):'每一件，都有自己的位置。';
    // 取舍 + 要填满：两件事都得说清楚——先够了件数，才轮得到空格。
    if(l.keepCount&&l.dense){
      const tail=missing.length?' · 必留物尚未放齐':'';
      if(remaining>0)return `再选留 ${remaining} 件，而且最多只能空 ${cap} 格${tail}`;
      return room>cap?`件数够了，但还空着 ${room} 格（最多只能空 ${cap} 格）${tail}`:(room===0?'正好填满了。':'正好只剩一格。');
    }
    if(l.dense)return cap===0?(room>0?`这一层要刚好放满，还差 ${room} 格。`:'刚好填满了。'):(room>cap?`这一层最多只空一格，还差 ${room-cap} 格。`:(room===0?'一格不多，一格不少。':'刚好剩下一格。'));
    if(l.keepCount)return remaining===0&&missing.length?'还缺必留物，请先取回一件再换入。':`再选留 ${remaining} 件${missing.length?' · 必留物尚未放齐':' · 必留物已放好'}`;
    if(l.anchors?.length)return remaining===0?'固定件已经就位。':'委托人放好的几件不能动，其余照常。';
    if(l.mode==='classic')return '可以留空，不必填满。';
    if(l.mode==='blocked')return '绕开隔板，也可以试试旋转。';
    return '指定物品完整放入同名标记区。';
  }
  function render(){
    const scale=canvas.width/VW;ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,VW,VH);const l=level(),b=board(),F=LAY.frame;ctx.fillStyle='#eee7d7';ctx.fillRect(0,0,VW,VH);
    // Quiet paper texture; deterministic so redraws do not shimmer.
    ctx.fillStyle='#8e7d5420';for(let i=0;i<650;i++){const x=(i*173+31)%VW,y=(i*277+19)%VH;ctx.fillRect(x,y,.7,.7);}
    text('留 一 格   /   收 纳 工 作 台',LAY.head.x,LAY.head.y,11,'#93917c');text(l.keepCount?`本单选留 ${K.goalCount(l)} 件`:l.dense?(K.maxEmptyOf(l)===0?'本单要恰好放满':'本单最多空一格'):'把全部物品安顿好',VW-LAY.head.right,LAY.head.y,11,'#93917c','right');
    ctx.save();ctx.shadowColor='#6d4f3020';ctx.shadowBlur=17;ctx.shadowOffsetY=8;A.rr(ctx,b.x-F.out,b.y-F.out,b.w+F.out*2,b.h+F.bottom,12,'#c7a982');ctx.restore();A.rr(ctx,b.x-F.out2,b.y-F.out2,b.w+F.out2*2,b.h+F.bottom2,9,'#d5bb96','#b39875');
    // Wood rings stay outside the puzzle cells.
    for(let i=0;i<4;i++)A.line(ctx,b.x-F.ring,b.y-F.ring+i*3,b.x+b.w+F.ring,b.y-F.ring+i*3,'#bea17b66');
    A.rr(ctx,b.x-F.out3,b.y-F.out3,b.w+F.out3*2,b.h+F.out3*2,4,l.surface==='green'?'#b8c4ad':'#e7d8b9','#a9916e');ctx.fillStyle=l.surface==='green'?'#d2dcc5':'#f0e5c8';ctx.fillRect(b.x,b.y,b.w,b.h);
    for(const[zindex,zone]of(l.zones||[]).entries()){
      const members=new Set(zone.cells.map(p=>p.join(','))),color=zindex===0?'#74998d':'#b78d71';ctx.fillStyle=zindex===0?'#b6d1c3':'#e7c5aa';
      for(const[x,y]of zone.cells)ctx.fillRect(b.x+x*b.cell,b.y+y*b.cell,b.cell,b.cell);
      for(const[x,y]of zone.cells){const px=b.x+x*b.cell,py=b.y+y*b.cell;for(const[dx,dy]of[[0,-1],[0,1],[-1,0],[1,0]])if(!members.has(`${x+dx},${y+dy}`)){if(dx===0)A.line(ctx,px,py+(dy>0?b.cell:0),px+b.cell,py+(dy>0?b.cell:0),color,3);else A.line(ctx,px+(dx>0?b.cell:0),py,px+(dx>0?b.cell:0),py+b.cell,color,3);}}
      const [zx,zy]=zone.cells[0];text(zindex===0?'①':'②',b.x+zx*b.cell+8,b.y+zy*b.cell+18,14,color);
    }
    ctx.strokeStyle=l.surface==='green'?'#b8c6ab':'#d9caab';ctx.lineWidth=1;ctx.setLineDash([2,5]);for(let x=1;x<l.cols;x++)A.line(ctx,b.x+x*b.cell,b.y,b.x+x*b.cell,b.y+b.h,ctx.strokeStyle);for(let y=1;y<l.rows;y++)A.line(ctx,b.x,b.y+y*b.cell,b.x+b.w,b.y+y*b.cell,ctx.strokeStyle);ctx.setLineDash([]);
    for(const[x,y]of l.blocked||[]){const px=b.x+x*b.cell,py=b.y+y*b.cell;A.rr(ctx,px+2,py+2,b.cell-4,b.cell-4,4,'#b89a75','#937852');ctx.save();ctx.beginPath();ctx.rect(px+4,py+4,b.cell-8,b.cell-8);ctx.clip();for(let offset=-52;offset<104;offset+=12)A.line(ctx,px+offset,py,px+offset+52,py+52,'#d4b58d',2);ctx.restore();}
    A.rr(ctx,b.x+b.w/2-F.handleW/2,b.y+b.h+F.handleGap,F.handleW,F.handleH,4,'#9b825f');A.line(ctx,b.x+b.w/2-F.handleW/2+5,b.y+b.h+F.handleGap+2,b.x+b.w/2+F.handleW/2-5,b.y+b.h+F.handleGap+2,'#d2b990',2);
    const active=selected&&(drag?.moving||ghost);for(const[id,p]of Object.entries(placed)){if(active&&id===selected)continue;A.draw(ctx,id,b.x+p.x*b.cell,b.y+p.y*b.cell,b.cell,p.rot);if(id===selected)outline(id,p,'#536f5a',.3);}
    // 固定件加一圈虚线 + 一枚小图钉，和玩家自己摆的区分开。
    for(const id of locked){const p=placed[id];if(!p)continue;outline(id,p,'#9a8358',.18,true);const c=K.shape(id,p.rot)[0];A.circle(ctx,b.x+(p.x+c[0]+1)*b.cell-7,b.y+(p.y+c[1])*b.cell+7,3.4,'#c19a68','#8a6f42');}
    if(hint&&Date.now()<hint.until){outline(hint.id,hint.p,hint.warn?'#b9745b':'#457b64',.3,true);text(hint.warn?'这件放错了 · '+K.items[hint.id].name:'提示位置 · '+K.items[hint.id].name,VW/2,LAY.hintY,14,hint.warn?'#a9613f':'#52745b','center');}
    else text(boardHint(),VW/2,LAY.hintY,14,'#75846d','center');
    A.line(ctx,LAY.sep.x1,LAY.sep.y,LAY.lastX,LAY.sep.y,'#d1c8b6',1);text('从旧箱子里拿出来的物品',LAY.label.x,LAY.label.y,13,'#868570');text(selected?K.items[selected].name+' · 可旋转':'挑一件，开始整理',LAY.label.right,LAY.label.y,13,'#68785f','right');
    const spec=traySpec(l.items.length);
    l.items.forEach((id,i)=>{const r=tileRect(i),isPlaced=!!placed[id],isFixed=locked.has(id);A.rr(ctx,r.x,r.y,r.w,r.h,8,selected===id?'#e0e6d1':isFixed?'#e6dcc6':isPlaced?'#e7e1d2':'#f4eedf',selected===id?'#9aab8b':'#e0d7c4');const q=itemRect(id);A.draw(ctx,id,q.x,q.y,q.u,rotations[id]||0,isPlaced?.18:1);if(isPlaced)text(isFixed?'已固定':'已放好',r.x+r.w/2,r.y+spec.markY,spec.nameSize===11?12:14,isFixed?'#a08a5f':'#8a957c','center');text(K.items[id].name,r.x+r.w/2,r.y+spec.nameY,spec.nameSize,isPlaced?'#a09f8a':'#6b7160','center');if(l.required?.includes(id))text('必留',r.x+8,r.y+spec.tagY,11,'#ad684f');const zi=(l.zones||[]).findIndex(z=>z.items.includes(id));if(zi>=0)text(zi===0?'①区':'②区',r.x+r.w-8,r.y+spec.tagY,11,zi===0?'#54786c':'#946c50','right');});
    if(selected&&ghost){const p={...ghost,rot:rotations[selected]||0},valid=K.canPlace(l,placed,selected,p.x,p.y,p.rot);outline(selected,p,valid?'#4d8361':'#b9745b',.23);A.draw(ctx,selected,b.x+p.x*b.cell,b.y+p.y*b.cell,b.cell,p.rot,.85);}
    if(flashUntil>Date.now()){ctx.strokeStyle='#92a77d';ctx.lineWidth=3;ctx.strokeRect(b.x-3,b.y-3,b.w+6,b.h+6);requestDraw();}
  }
  function outline(id,p,color,alpha,dashed=false){const b=board();ctx.save();ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2;if(dashed)ctx.setLineDash([5,4]);for(const[dx,dy]of K.shape(id,p.rot)){ctx.globalAlpha=alpha;ctx.fillRect(b.x+(p.x+dx)*b.cell+1,b.y+(p.y+dy)*b.cell+1,b.cell-2,b.cell-2);ctx.globalAlpha=.8;ctx.strokeRect(b.x+(p.x+dx)*b.cell+2,b.y+(p.y+dy)*b.cell+2,b.cell-4,b.cell-4);}ctx.restore();}
  function position(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*VW/r.width,y:(e.clientY-r.top)*VH/r.height};}
  function hitItem(p){const b=board();for(const[id,v]of Object.entries(placed).reverse()){if(K.shape(id,v.rot).some(([dx,dy])=>p.x>=b.x+(v.x+dx)*b.cell&&p.x<b.x+(v.x+dx+1)*b.cell&&p.y>=b.y+(v.y+dy)*b.cell&&p.y<b.y+(v.y+dy+1)*b.cell))return id;}for(let i=0;i<level().items.length;i++){const id=level().items[i],r=tileRect(i);if(!placed[id]&&p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h)return id;}return null;}
  function select(id){selected=id;ghost=null;if(placed[id])rotations[id]=placed[id].rot;const l=level(),zone=(l.zones||[]).find(z=>z.items.includes(id)),tail=locked.has(id)?'  这一件委托人已经放好了，位置不能改。':(l.fixedRot||[]).includes(id)?'  这件只能按原方向摆放，不能旋转。':zone?`  请完整放进「${zone.label}」。`:'  选好位置后放下；R键旋转。';status(K.items[id].memory+tail);updateUI();requestDraw();}
  function setGhost(p,grab){if(!selected)return;const b=board();ghost={x:Math.floor((p.x-b.x)/b.cell)-(grab?.x||0),y:Math.floor((p.y-b.y)/b.cell)-(grab?.y||0)};requestDraw();}
  function place(id,x,y,rot){
    if(locked.has(id)){const a=placed[id];if(a&&a.x===x&&a.y===y&&((a.rot%4)+4)%4===((rot%4)+4)%4)return true;status('这一件委托人已经放好了，位置不能改。');event('invalid_placement',{reason:'locked'});requestDraw();return false;}
    const error=K.placementError(level(),placed,id,x,y,rot);if(error){ghost=null;drag=null;status({blocked:'这里是固定隔板，不能放物品。试试旁边的空位。',zone:'这件物品需要完整放进同名标记区，旋转后也要全部在区内。',quota:'本单件数已满。请右键取回一件，或用“放回桌面”，再换入想留的物品。',norot:'这件只能按原来的方向摆放，转过来就放不下了。'}[error]||'这里有些挤。换个位置，或者旋转一下试试。');event('invalid_placement',{reason:error});requestDraw();return false;}snapshot();placed[id]={x,y,rot};rotations[id]=rot;moves++;selected=null;ghost=null;hint=null;if(hmove&&hmove.id===id)hmove=null;drag=null;event('item_placed',{item:id});beep();const fresh=checkRelations();if(!fresh.length)status('放好了。还可以继续调整，不用急。');checkComplete(fresh);persist();updateUI();requestDraw();return true;}
  function checkComplete(fresh=[]){finished=K.isComplete(level(),placed);if(!finished){if(level().keepCount&&Object.keys(placed).length===K.goalCount(level()))status('件数够了，但必留物还没放齐。先取回一件，再把必留物换进来。');return;}const l=level();saved.completed[l.id]=true;flashUntil=Date.now()+450;event('level_complete',{moves,hints,kept:Object.keys(placed),elapsedSeconds:Math.round((Date.now()-started)/1000)});const sc=K.scoreLayout(l,placed);$('reply').textContent=l.reply;$('reward').textContent=l.reward;$('result-score').textContent=`整齐度 ${sc.total} · ${K.verdict(sc.total)}`+(fresh.length?`　新解锁 ${fresh.length} 段回忆`:'');$('score-line').textContent=`对齐 ${sc.align} · 留白 ${sc.gap} · 居中 ${sc.center}　${K.advice(sc)}`;$('result-stats').textContent=`${Object.keys(placed).length} 件旧物已安顿 · 整理 ${moves} 次 · 提示 ${hints} 次`+(l.keepCount?` · ${l.items.length-Object.keys(placed).length} 件留在桌面`:'');$('next').textContent=levelIndex===K.levels.length-1?'回到第一份委托':'下一份委托 →';$('artwork-preview').hidden=true;$('complete-dialog').showModal();beep(true);}
  // 转一下。**原地能转就原地转**（与改版前逐字一致）；原地转不开，就顺着
  // 「转完之后和原来的格子重叠最多、挪得最近」的位置落下去，而不是直接拒绝。
  //
  // 为什么要这一层：盘面挤到后面，一件长条原地旋转十有八九会压到旁边那件，
  // 老版本只能回一句「原地转不开」。玩家点了一下、画面没变，看起来就是「按了没反应」——
  // 手机上尤其难受：格子小、手指挡着视线，让玩家自己去找那个能转的位置既慢又容易连错几步。
  // 现在变成「物品就地转了个方向、顺带挪了半格」，实在无处可去才照实说。
  function rotateSpots(id,rot){
    const l=level(),cur=placed[id];if(!cur)return[];
    const cells=K.shape(id,rot),box=K.bounds(cells);
    const was=new Set(K.shape(id,cur.rot).map(([dx,dy])=>`${cur.x+dx},${cur.y+dy}`));
    const out=[];
    for(let y=0;y+box.h<=l.rows;y++)for(let x=0;x+box.w<=l.cols;x++){
      if(!K.canPlace(l,placed,id,x,y,rot))continue;
      let keep=0;for(const[dx,dy]of cells)if(was.has(`${x+dx},${y+dy}`))keep++;
      out.push({x,y,keep,away:Math.abs(x-cur.x)+Math.abs(y-cur.y)});
    }
    // 重叠多的优先；一样就挪得少的优先；再一样靠上、靠左，保证结果稳定可复现（测试也才写得住）。
    out.sort((a,b)=>b.keep-a.keep||a.away-b.away||a.y-b.y||a.x-b.x);
    return out;
  }
  function rotate(){
    if(!selected)return;const id=selected;
    if(locked.has(id)){status('这件是委托人放好的，已经固定住了。');return;}
    if((level().fixedRot||[]).includes(id)){status('这件只能按原来的方向摆放，转过来就放不下了。');return;}
    const next=((rotations[id]||0)+1)%4;
    if(placed[id]&&!ghost&&!drag?.moving){
      const from=placed[id];
      // 原地优先。原来那句「原地转不开」的提示，只有真的无处可去时才会出现。
      const spots=K.canPlace(level(),placed,id,from.x,from.y,next)?[{x:from.x,y:from.y,away:0}]:rotateSpots(id,next);
      if(!spots.length){status('这件转过来哪一格都放不下。先把旁边的挪开，或者把它放回桌面再转。');event('rotate',{item:id,blocked:true});updateUI();requestDraw();return;}
      const at=spots[0];
      snapshot();placed[id]={x:at.x,y:at.y,rot:next};moves++;rotations[id]=next;hint=null;persist();
      // 原地转成功时不动状态栏——那里正写着这件旧物的回忆，别把它盖掉。挪过位才解释一句。
      if(at.away)status(`「${K.items[id].name}」原地转不开，就近挪了 ${at.away} 格。`);
      checkRelations();
    }else{
      rotations[id]=next;
      if(drag){const b=K.bounds(K.shape(id,next));drag.grab={x:Math.floor(b.w/2),y:Math.floor(b.h/2)};}
    }
    event('rotate',{item:id});updateUI();requestDraw();
  }
  function returnItem(id=selected){if(!id||!placed[id])return;if(locked.has(id)){status('这件是委托人放好的，收不回去，也动不了。');return;}snapshot();delete placed[id];finished=false;moves++;hint=null;ghost=null;selected=null;const wasBlamed=!!(hmove&&hmove.id===id);hmove=null;event('item_returned',{item:id});persist();status(wasBlamed?`「${K.items[id].name}」已经收起来了。再点一次提示，看下一步该放哪件。`:'已放回桌面，可以重新摆放；撤销可恢复原位。');updateUI();requestDraw();}
  // ── 手势：同一块画布上既要能搬东西，也要能滚页面 ─────────────────────────
  // 拖拽玩法和页面滚动天生抢手势：画布挂 touch-action:none 才保证拖东西不被浏览器截走，
  // 代价是手指按在画布上怎么划，页面都纹丝不动。手机版式一张画布就比一屏还高，
  // 玩家在旧物箱上往上滑想翻到下面的按钮，结果就是「滑不动」。
  //
  // 判定规则（只在触摸/触控笔下走，鼠标完全走老路，桌面行为一个字不改）：
  //   · 按住 ≥130ms 再移动  → 搬东西（这就是说明里写的「按住拖动」）
  //   · 不停顿直接划过去    → 滚动页面，一比一跟手，松手带一点惯性
  //   · 按下就抬起          → 轻点：选中物品／把已选物品放进这一格
  //                          （同一个物品连着点两下＝就地翻转，见 pointerup）
  // 空白处（没压到任何旧物）怎么划都是滚动——那里本来就没东西可搬。
  const HOLD_MS=130,SLOP=8,FLING_DECAY=.94,FLING_MIN=.35,DOUBLE_MS=320;
  let gesture=null,fling=null,lastTap=null;
  // 能转的：不是委托人固定的，也不是本关规定「只能按原方向放」的。托盘里还没放下的那件也算
  // （它的方向会跟着带下去），所以这里不要求 placed。
  const canTurn=id=>!!id&&!locked.has(id)&&!(level().fixedRot||[]).includes(id);
  function stopFling(){
    if(!fling)return;
    if(typeof cancelAnimationFrame==='function'&&fling.raf!==undefined)cancelAnimationFrame(fling.raf);
    fling=null;
  }
  function startFling(vy){
    if(typeof window.scrollBy!=='function'||Math.abs(vy)<FLING_MIN)return;
    stopFling();
    let v=vy;
    const step=()=>{
      v*=FLING_DECAY;
      if(Math.abs(v)<FLING_MIN){stopFling();return;}
      window.scrollBy(0,-v*16);
      fling.raf=typeof requestAnimationFrame==='function'?requestAnimationFrame(step):undefined;
    };
    fling={raf:typeof requestAnimationFrame==='function'?requestAnimationFrame(step):undefined};
  }
  function clearHold(g){if(g&&g.hold){clearTimeout(g.hold);g.hold=null;}}
  function releasePointer(pointer){if(typeof canvas.hasPointerCapture==='function'&&canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);}
  function startDragAt(id,p,pointer){const b=board(),size=K.bounds(K.shape(id,rotations[id]||0));drag={id,pointer,start:p,moving:false,grab:placed[id]?{x:Math.floor((p.x-b.x)/b.cell)-placed[id].x,y:Math.floor((p.y-b.y)/b.cell)-placed[id].y}:{x:Math.floor(size.w/2),y:Math.floor(size.h/2)}};canvas.setPointerCapture(pointer);}
  // 松手／抬起时收尾拖拽。返回是否真的收了一件。
  function endDrag(p){const d=drag;if(!d)return false;const target=ghost;drag=null;ghost=null;if(d.moving){if(p.y>=LAY.sep.y&&placed[d.id])returnItem(d.id);else if(target)place(d.id,target.x,target.y,rotations[d.id]||0);}return true;}
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.pointerType==='mouse')return;
    if(drag||gesture)return;
    e.preventDefault();stopFling();canvas.focus({preventScroll:true});
    const p=position(e),b=board(),onBoard=p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h,id=hitItem(p);
    if(e.pointerType==='mouse'){
      // 鼠标：滚轮负责滚动，拖拽就是拖拽，判定不需要推迟——与改版前逐字一致。
      if(selected&&onBoard&&!id){setGhost(p);place(selected,ghost.x,ghost.y,rotations[selected]||0);return;}
      if(!id){selected=null;ghost=null;updateUI();requestDraw();return;}
      select(id);
      if(locked.has(id)){status('这一件委托人已经放好了，位置不能改。点别的地方继续整理。');updateUI();requestDraw();return;}
      startDragAt(id,p,e.pointerId);
      return;
    }
    // 触摸：先只记意图，等第一次移动（或抬手）再定性。
    gesture={pointer:e.pointerId,start:p,lastClientY:e.clientY,id,placeHere:!!(selected&&onBoard&&!id),mode:null,armed:false,vY:0,vT:0,hold:null};
    if(id)gesture.hold=setTimeout(()=>{if(gesture)gesture.armed=true;},HOLD_MS);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(gesture&&e.pointerId===gesture.pointer){
      const p=position(e);
      if(gesture.mode===null){
        if(Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)<SLOP)return;
        clearHold(gesture);
        if(gesture.id&&gesture.armed){
          gesture.mode='drag';select(gesture.id);
          if(!locked.has(gesture.id))startDragAt(gesture.id,p,e.pointerId);
        }else gesture.mode='scroll';
      }
      if(gesture.mode==='scroll'){
        const now=Date.now(),dy=e.clientY-gesture.lastClientY,dt=now-(gesture.vT||now);
        if(dt>0){gesture.vY=gesture.vY*.6+(dy/dt)*.4;gesture.vT=now;}
        gesture.lastClientY=e.clientY;
        if(dy&&typeof window.scrollBy==='function')window.scrollBy(0,-dy);
        return;
      }
      if(!drag)return;
      if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>7)drag.moving=true;
      if(drag.moving)setGhost(p,drag.grab);
      return;
    }
    if(!drag||e.pointerId!==drag.pointer)return;
    if(e.pointerType==='mouse'&&(e.buttons&1)===0){cancelDrag();return;}
    const p=position(e);if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>7)drag.moving=true;
    if(drag.moving)setGhost(p,drag.grab);
  });
  function cancelDrag(){const pointer=drag?.pointer;drag=null;ghost=null;clearHold(gesture);gesture=null;stopFling();if(pointer!==undefined)releasePointer(pointer);requestDraw();}
  canvas.addEventListener('pointerup',e=>{
    const g=gesture&&e.pointerId===gesture.pointer?gesture:null;
    if(g){
      gesture=null;clearHold(g);
      if(g.mode==='scroll'){releasePointer(e.pointerId);startFling(g.vY);return;}
      if(g.mode===null){
        // 一次完整的「点一下」＝按下 + 抬起，放在这里做，滚动手势就不会被误当成点击。
        if(g.id){
          // 手机端补的快捷方式：**同一个旧物连着点两下 = 就地翻转**。
          // 单点仍然是选中，只有三条同时成立才算双击——同一件、间隔够短、而且它此刻就是选中的那件。
          // 最后那条是安全绳：中间只要点过别处（放下、取消、选了另一件），选中就会变，绝不会误判。
          const now=Date.now(),again=!!lastTap&&lastTap.id===g.id&&now-lastTap.at<=DOUBLE_MS&&selected===g.id;
          lastTap={id:g.id,at:now};
          if(again&&placed[g.id]&&canTurn(g.id)){lastTap=null;rotate();}
          else select(g.id);
        }
        else if(g.placeHere){const p=position(e);setGhost(p);place(selected,ghost.x,ghost.y,rotations[selected]||0);}
        else{selected=null;ghost=null;lastTap=null;}
        releasePointer(e.pointerId);updateUI();requestDraw();
        return;
      }
      endDrag(position(e));releasePointer(e.pointerId);requestDraw();
      return;
    }
    if(!drag||drag.pointer!==e.pointerId)return;
    endDrag(position(e));releasePointer(e.pointerId);requestDraw();
  });
  canvas.addEventListener('pointercancel',e=>{if(gesture?.pointer===e.pointerId||drag?.pointer===e.pointerId)cancelDrag();});
  canvas.addEventListener('lostpointercapture',e=>{if(gesture?.pointer===e.pointerId||drag?.pointer===e.pointerId)cancelDrag();});
  canvas.addEventListener('contextmenu',e=>{
    e.preventDefault();if(e.pointerType==='touch')return;
    const id=hitItem(position(e));cancelDrag();
    if(id&&placed[id])returnItem(id);else{selected=null;updateUI();requestDraw();}
  });
  window.addEventListener('blur',cancelDrag);document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDrag();persist();}});
  canvas.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r'){e.preventDefault();rotate();}else if(e.key==='Escape'){cancelDrag();selected=null;updateUI();requestDraw();}else if(selected&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' '].includes(e.key)){e.preventDefault();if(!ghost)ghost=placed[selected]?{x:placed[selected].x,y:placed[selected].y}:{x:0,y:0};if(e.key==='ArrowUp')ghost.y--;if(e.key==='ArrowDown')ghost.y++;if(e.key==='ArrowLeft')ghost.x--;if(e.key==='ArrowRight')ghost.x++;if(e.key==='Enter'||e.key===' ')place(selected,ghost.x,ghost.y,rotations[selected]||0);requestDraw();}});
  $('rotate').onclick=rotate;$('rotate-fab').onclick=rotate;$('return').onclick=()=>returnItem();
  $('undo').onclick=()=>{if(!history.length)return;cancelDrag();const s=history.pop();placed=s.placed;rotations=s.rotations;moves=s.moves;hints=s.hints;finished=K.isComplete(level(),placed);selected=null;ghost=null;hint=null;hmove=null;event('undo');persist();status('退回上一步了。慢慢试，总能找到位置。');updateUI();requestDraw();};
  // ---- 提示 ----
  // 老版本只有一个分支：解得出就标一件，解不出就说「有些复杂」——玩家点了提示等于没点。
  // 真正的毛病在于：玩家一旦摆错，K.solve 会直接返回 invalid（nodes=0，连搜都不搜），
  // 提示就永远只会说「复杂」。所以这里先诊断，再给位置。
  //
  //   ① solved     —— 当前摆法能走通：直接指出下一件该放哪、什么方向。
  //   ② 找出罪魁  —— 挨个把玩家放下的每一件「单独挪开」再求解，
  //                  哪一件挪开后可解，哪一件就是卡住整局的元凶。明确点名它。
  //   ③ unsolvable —— 全挪开还是无解，说明问题在「选了哪些件」而不是「怎么摆」，
  //                  提示玩家换件，而不是让他继续瞎摆。
  const HINT_MS=12000;
  // 一次点击允许求解器占用多久。以前不限时：「消除」的候选搜索在大师关一盘死局上
  // 要连做 32 次满额求解，主线程僵 15 秒以上，连 BGM 都断掉（搪瓷杯那件事）。
  // 现在统一给按钮一个总预算，超了就照实说没算出来——宁可少一次帮忙，不能让界面僵住。
  const SOLVE_MS=1200;
  const budget=()=>Date.now()+SOLVE_MS;
  // 逐件回退找元凶：最多 O(已放件数) 次求解。先试「件数多、占格大」的，它们最可能是堵住路的那件。
  // blameExpired 记的是「没算完」——这个要跟「真的没有元凶」分开说，不能拿后者当结论。
  let blameExpired=false;
  function blameOne(deadline=0){
    const l=level(),ids=Object.keys(placed).filter(id=>!locked.has(id));
    if(!ids.length)return null;
    const ordered=ids.slice().sort((a,b)=>K.items[b].cells.length-K.items[a].cells.length);
    for(const id of ordered){
      const rest={...placed};delete rest[id];
      // 直接交给 solve：它自己会先校验状态合法性（重叠/压隔板都算 invalid），
      // 我们只关心「拿掉这一件之后，能不能走通」。
      const r=K.solve(l,rest,90000,deadline);
      if(r.status==='solved')return id;
      if(r.status==='timeout'){blameExpired=true;return null;}
    }
    return null;
  }
  // 提示拆两步：先算出「该告诉玩家什么」，再把它说出来。
  // 拆开是为了配合广告——**先算方案、再播广告**，算不出来就别浪费玩家一次广告。
  function planHint(){
    const l=level(),r=K.solve(l,placed,90000,budget());
    if(r.status==='timeout')return {kind:'timeout',reason:'timeout'};
    if(r.status==='solved'&&r.solution){
      const id=Object.keys(r.solution).find(id=>!placed[id]);
      if(id)return {kind:'place',id,p:r.solution[id],reason:r.status};
    }
    blameExpired=false;
    const blame=blameOne(budget());
    if(blame){const p=placed[blame];return {kind:'blame',id:blame,p:{x:p.x,y:p.y,rot:p.rot},reason:r.status};}
    return {kind:'none',reason:blameExpired?'timeout':r.status};
  }
  function applyHint(plan){
    cancelDrag();selected=null;ghost=null;
    hints++;event('hint',{result:plan.reason||plan.kind});
    // ① 走得通：标出一件还没放下的，并说清方向。
    if(plan.kind==='place'){
      const rot=((plan.p.rot%4)+4)%4;
      hint={id:plan.id,p:plan.p,until:Date.now()+HINT_MS};
      const dir=rot?(rot===1?'转成横放':rot===2?'转成倒放':'转成竖放'):'保持原方向';
      status(`把「${K.items[plan.id].name}」放到绿色虚线的位置，${dir}。这是可行的摆法之一。`);
      setTimeout(()=>requestDraw(),HINT_MS+100);persist();updateUI();requestDraw();return;
    }
    // ② 当前摆法走不通：揪出是哪一件放错了，并指它原来的位置。
    if(plan.kind==='blame'){
      hint={id:plan.id,p:plan.p,until:Date.now()+HINT_MS,warn:true};
      hmove={id:plan.id};   // 记下「提示让动这一件」，玩家真动了就清掉
      status(`卡住的是「${K.items[plan.id].name}」——把它挪开，这份委托就能继续了。先把它放回桌面，再点一次提示。`);
      setTimeout(()=>requestDraw(),HINT_MS+100);persist();updateUI();requestDraw();return;
    }
    // ③ 全挪开也无解（或这次没算完）：不是摆法问题，是件数/选件问题。
    hint=null;
    const l=level(),goal=K.goalCount(l),n=Object.keys(placed).length;
    if(plan.reason==='timeout')status('这一局绕得有点久，这次没算出结论。先试试「消除一件」，或者把一件放回桌面再点提示。');
    else if(plan.reason==='unsolvable'||n>=goal)status(l.keepCount?`这份委托要留 ${goal} 件，但现在这几件凑不满。取回一件，换一件更大或更小形状的旧物进来。`:`这几件旧物摆不下，换一件别的形状试试。`);
    else status('这一步不好走。先「放回桌面」一件，再点提示——我会告诉你换哪一件。');
    persist();updateUI();requestDraw();
  }
  function giveHint(){applyHint(planHint());}
  // 广告只回答「这一次机会给不给」；真正判定看没看完，在 ads.js 的 onClose(isEnded) 里。
  // 拿不到广告位（网页版／未配置广告位）时直接放行，绝不让玩家卡在「点了没反应」上。
  //
  // 这里**刻意不往状态栏写原因**：按钮本来就按同一个条件显示成「一点提示」还是
  // 「看广告 · 提示」，玩家按下去直接拿到东西就好；而且状态栏紧接着就会被动作自己的话
  // （「把「XX」放到绿色虚线…」）盖掉，写了也是白写。这段说明归玩法说明和隐私政策，
  // 文案在 ads.js 的 KeepsakeAds.status() 里，只有一份。
  //
  // STRICT=true（真开始变现）时反过来：拿不到广告就不给，否则这个开关等于一纸空文。
  function withAd(what,run){
    const Ads=window.KeepsakeAds;
    if(!Ads||!Ads.supported()){
      if(Ads&&Ads.STRICT){status(`广告没准备好，这次${what}先不算，稍后再试。`);updateUI();return;}
      run();return;
    }
    status(`正在加载广告，看完就能拿到这次${what}。`);
    Ads.show().then(res=>{
      if(res.ok){run();return;}
      status(Ads.explain?Ads.explain(res.reason):'广告没播完，这次先不算。');
      updateUI();
    });
  }
  // 消除：把一件「不必须、也没被固定」的旧物从这份委托里拿掉。挑最占地方的那件——
  // 玩家真正卡住的时候，卡的通常就是它。
  // 但取舍关有个坑：玩家只放 keepCount 件，「能凑满格数」的挑法本来就少，
  // 抹掉一件有可能把仅有的几种一起抹掉。所以出手前先让求解器验一遍：抹掉之后仍可解，才让它走。
  // 这一步必须在播广告之前做完，不能让玩家看完广告才被告知「这件消不得」。
  let clearExpired=false;
  function clearCandidate(){
    const l=level(),pool=clearPool();
    clearExpired=false;
    if(!pool.length)return null;
    const ordered=pool.slice().sort((a,b)=>K.items[b].cells.length-K.items[a].cells.length);
    const deadline=budget();
    // 两个关键点：
    // 1. 要用「玩家现在这一盘」去验，不能用空盘面。用 {} 验的话，算出来的是「理论上消掉它就能解」，
    //    可玩家当前摆法可能是错的，消完之后照样解不开——那样玩家看完广告才发现没救，是最糟的体验。
    // 2. **按局面去重**。还没放下的候选，删掉它之后盘面一模一样，同一道题会被解十几遍：
    //    大师关那 16 秒里，有 15 秒是这么白烧的。
    const seen=new Set();
    for(const id of ordered){
      const kept={...placed};delete kept[id];
      const key=Object.keys(kept).sort().map(k=>`${k}@${kept[k].x},${kept[k].y},${kept[k].rot}`).join('|');
      if(seen.has(key))continue;
      seen.add(key);
      const r=K.solve(l,kept,120000,deadline);
      if(r.status==='solved')return id;
      if(r.status==='timeout'){clearExpired=true;return null;}
    }
    for(const id of ordered){
      const r=K.solve(level(id),{},120000,deadline);
      if(r.status==='solved')return id;
      if(r.status==='timeout'){clearExpired=true;return null;}
    }
    return null;
  }
  function doClear(id=clearCandidate()){
    if(!id)return;
    if(placed[id])delete placed[id];
    removed.add(id);
    clears++;hint=null;ghost=null;selected=null;finished=K.isComplete(level(),placed);
    event('item_cleared',{item:id});persist();
    status(`已经消掉「${K.items[id].name}」，这份委托不用再安顿它了。`);
    updateUI();requestDraw();
  }
  // ---- 代放：看一次广告，直接替玩家摆好一件 ----
  // 「一点提示」只说位置，玩家可能还是摆不上去（形状对不上、转不开）。
  // 卡到最后的人需要的不是「你该放这里」，而是「帮我放上去」。
  // 规则上这是白送一件的有序摆放，所以：
  //   · 每关只给一次，且必须先把放错的清干净——否则会替玩家在错误的基础上越描越黑；
  //   · 放之前先 snapshot()，玩家照样能撤销，不剥夺他的控制权。
  // 同样拆成「算方案 / 落方案」：先算出要放哪一件，再播广告。
  // 算不出来就别播——不能让玩家看完广告才被告知「这一步没法替你放」。
  function planAuto(){
    const l=level();
    if(autoPlaced>=AUTO_LIMIT)return {kind:'quota'};
    if(finished)return {kind:'done'};
    const deadline=budget();
    let r=K.solve(l,placed,120000,deadline),blamed=null;
    if(r.status==='timeout')return {kind:'timeout'};
    // 玩家当前摆法无解时，先把「卡住的那一件」收回来再算，这样代放才不会建立在错误的局面上。
    if(r.status!=='solved'){
      blameExpired=false;
      const blame=blameOne(deadline);
      if(blame){
        const rest={...placed};delete rest[blame];
        const r2=K.solve(l,rest,120000,deadline);
        if(r2.status==='timeout')return {kind:'timeout'};
        if(r2.status==='solved'){blamed=blame;r=r2;}
      }else if(blameExpired)return {kind:'timeout'};
    }
    if(r.status!=='solved'||!r.solution)return {kind:'none'};
    // 优先替玩家放「还没放下、且位于分区内」的那件——那是关卡真正的难点所在。
    const pending=Object.keys(r.solution).filter(id=>id!==blamed&&!placed[id]);
    if(!pending.length)return {kind:'done'};
    const zone=(l.zones||[])[0];
    const inZone=zone?pending.filter(id=>zone.items.includes(id)):[];
    const pick=(inZone.length?inZone:pending).sort((a,b)=>K.items[b].cells.length-K.items[a].cells.length)[0];
    return {kind:'place',pick,at:{...r.solution[pick]},blamed};
  }
  function applyAuto(plan){
    if(plan.kind==='quota'){status('这份委托已经帮你放过一次了，剩下的自己来吧。');updateUI();return false;}
    if(plan.kind==='done'){status('委托已经摆好了，不用再帮你放。');updateUI();return false;}
    if(plan.kind==='none'){status('这一步没法直接替你放，先「消除一件」或换一件旧物试试。');updateUI();return false;}
    if(plan.kind==='timeout'){status('这一局绕得有点久，没算出能替你放的那一件。先试试「消除一件」或「提示」。');updateUI();return false;}
    const pick=plan.pick,blamed=plan.blamed;
    // 整件事只留一个撤销点：收走放错的 + 放好这一件，一次撤销一起退回。
    // （之前在两处各 snapshot() 一次，撤销只能退回一半，玩家会以为撤销坏了。）
    snapshot();
    if(blamed&&placed[blamed])delete placed[blamed];
    placed[pick]={...plan.at};
    rotations[pick]=plan.at.rot;
    moves++;autoPlaced++;selected=null;ghost=null;hint=null;hmove=null;
    event('item_auto_placed',{item:pick,replaced:blamed||null});beep();
    status(blamed?`先把放错位置的「${K.items[blamed].name}」收了回来，再帮你把「${K.items[pick].name}」放好了。按「撤销」可以一起退回。`:`帮你把「${K.items[pick].name}」放好了。想自己调整，按「撤销」就能拿回来。`);
    checkRelations();
    checkComplete();
    persist();updateUI();requestDraw();
    return true;
  }
  function doAutoPlace(){return applyAuto(planAuto());}
  $('hint').onclick=()=>{
    if(freeHints<FREE_HINTS){freeHints++;giveHint();return;}
    // 先算方案：算不出来（一次都没算出结论）就别播广告，直接照实说明。
    const plan=planHint();
    if(plan.kind!=='place'&&plan.kind!=='blame'){applyHint(plan);return;}
    withAd('提示',()=>applyHint(plan));
  };
  $('clear').onclick=()=>{
    if(clears>=MAX_CLEARS){status(`这份委托最多消掉 ${MAX_CLEARS} 件旧物。`);return;}
    const id=clearCandidate();
    if(!id){status(clearExpired?'这一局绕得有点久，没算完。先试试「提示」，或者把一件放回桌面再消。':'这一关能消的都已经消过了：再拿掉一件，就凑不出能填满的答案了。');return;}
    withAd('消除',()=>doClear(id));
  };
  $('auto').onclick=()=>{
    if(finished){status('委托已经摆好了，不用再帮你放。');return;}
    // 额度在 applyAuto 里扣——真放好了才记账，不能让人看完广告发现没放上还被记一笔。
    const plan=planAuto();
    if(plan.kind!=='place'){applyAuto(plan);return;}
    withAd('代放',()=>applyAuto(plan));
  };
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
  function gotoChapter(key){
    const first=K.levels.findIndex(l=>l.group===key);
    if(first<0)return;
    // 章节里前面几关还没解锁的话，就跳到本章第一个能进的关卡；整章都锁着就直说。
    const open=K.levels.findIndex((l,i)=>l.group===key&&isUnlocked(i));
    if(open<0){status(`「${chapterName[key]}」还在后面：先完成${firstLocked()}，这一章才会依次打开。`);return;}
    load(open);
  }
  for(const c of K.chapters){const b=document.createElement('button');b.className='mode-button';b.setAttribute('data-group',c.key);b.textContent=c.name;b.setAttribute('aria-label',`${c.name}，${K.levels.filter(l=>l.group===c.key).length}关`);b.setAttribute('aria-pressed','false');b.onclick=()=>gotoChapter(c.key);$('mode-tabs').appendChild(b);}
  // 委托簿按章节分组显示，序号也跟着按「章内顺序」排：本章有 13 关就编 01–13。
  // 之前用的是全局序号，切到「隔板抽屉」会看到 13,14,15,22,23,24,52,59,66… —— 中间全是被别的章节占掉的号，
  // 看着像漏了关卡。全局进度由顶栏「X / 100 已整理」和信头的「87 / 100」负责，列表只管本章内部。
  const chapterName={},chapterNo={};
  for(const c of K.chapters)chapterName[c.key]=c.name;
  K.levels.forEach((l,i)=>{const n=chapterNo[l.group]=(chapterNo[l.group]||0)+1,b=document.createElement('button');b.className='level-button';b.innerHTML=`<span class="number">${String(n).padStart(2,'0')}</span><span class="level-name"></span><span class="tick"></span>`;b.querySelector('.level-name').textContent=l.title;b.setAttribute('data-no',String(n));b.setAttribute('data-group',l.group);b.setAttribute('aria-label',`${chapterName[l.group]} 第 ${n} 关：${l.title}`);b.onclick=()=>{
    // 没解锁的关卡用 aria-disabled + 一句原因，而不是 disabled：
    // 真正 disabled 的按钮连点击都收不到，玩家点了只会觉得「按了没反应」。
    if(!isUnlocked(i)){status(firstLocked()+' 整理完，这一份委托才会打开。');return;}
    load(i);
  };$('levels').appendChild(b);});
  // Debug access is opt-in and never changes the normal player flow.
  if(new URLSearchParams(location.search).has('test'))window.GameDebug={getState:()=>({levelIndex,placed:clone(placed),rotations:{...rotations},locked:[...locked],selected,ghost:ghost?{...ghost}:null,drag:drag?clone(drag):null,finished,moves,history:history.length,storageOK,board:board(),hint:hint?{...hint,p:{...hint.p}}:null,hmove:hmove?{...hmove}:null,hints,freeHints,clears,autoPlaced,blameExpired,clearExpired}),giveHint,planHint,applyHint,blameOne,doAutoPlace,planAuto,applyAuto,clearCandidate,clearPool,rotate,rotateSpots,canTurn,load,resize,unlock:{limit:()=>unlockedLimit(),at:i=>isUnlocked(i),all:on=>{unlockAll=!!on;updateUI();return unlockAll;}},unlockedLimit,isUnlocked,gotoChapter,layout:()=>({VW,VH,phone:LAY.phone,rect:board(),cols:level().cols,rows:level().rows,head:LAY.head,frame:LAY.frame,hintY:LAY.hintY,sep:LAY.sep,label:LAY.label,tray:LAY.tray,uMax:LAY.uMax,padBottom:LAY.padBottom,lastX:LAY.lastX}),loadId:id=>{const i=K.levels.findIndex(l=>l.id===id);load(i);return i;},place,select,itemRect,tileRect,solve:()=>K.solve(level(),placed),events:()=>saved.events,score:()=>K.scoreLayout(level(),placed),codex:()=>({...saved.codex}),met:()=>K.metRelations(level(),placed),levelId:()=>level().id};
  // ---- 首次启动的隐私政策弹窗 ----
  // TapTap 审核口径里有三条是硬要求，这里逐条对上：
  //   1. 首次启动必须先弹窗、后服务：所以弹窗是 showModal()，同意之前玩家点不到棋盘。
  //   2. 必须有明确的「同意」和「拒绝」两个按钮，不能用「好的，我知道了」这种含糊文案。
  //   3. 拒绝之后基础功能照常可用——这里拒绝只等于「不保存进度」，游戏本体一点不减。
  // 另外：弹窗只在没有记录时出现，玩家点过同意或拒绝都记住了，不会反复打扰。
  const PRIVACY_DIALOG=$('privacy-dialog');
  // showModal() 默认把焦点交给弹窗里第一个可聚焦元素——也就是那行政策链接。
  // 结果每次打开弹窗，链接上都挂着一圈焦点环，看着像「链接被选中了」。
  // 但焦点环本身是键盘用户唯一的定位依据，不能简单去掉；正确做法是把初始焦点
  // 移到「同意并开始」上（阅读顺序里本来就是下一步），链接的焦点环留给 Tab。
  function openPrivacy(){
    try{PRIVACY_DIALOG.showModal();}catch{return;}
    const accept=$('privacy-accept');
    if(accept&&typeof accept.focus==='function')accept.focus();
  }
  function rememberConsent(value){
    consent=value;
    try{localStorage.setItem(CONSENT_KEY,value);}catch{storageOK=false;}
    if(value==='no'){status('好的，这次不保存进度。整理照样可以进行，随时可以在「玩法说明」里改主意。');return;}
    persist();
  }
  function askPrivacy(){if(consent!==null)return;openPrivacy();}
  $('privacy-accept').onclick=()=>{rememberConsent('yes');PRIVACY_DIALOG.close();status('谢谢。你的整理进度会保存在这台设备上，不会上传。');};
  $('privacy-decline').onclick=()=>{rememberConsent('no');PRIVACY_DIALOG.close();};
  // 从「玩法说明」里随时能再看一遍，也允许在那里改主意。
  $('privacy-open').onclick=e=>{e.preventDefault();if($('help-dialog').open)$('help-dialog').close();openPrivacy();};
  if(window.GameDebug)window.GameDebug.consent=()=>consent;
  // 允许用 ?level=7 直接打开某一份委托，方便分享和验收；?unlock=all 一次性打开全部关卡
  // （自测每一关要用，普通玩家走正常解锁顺序）。两个都只在 URL 里显式写才生效。
  const query=new URLSearchParams(location.search);
  const wanted=Number(query.get('level'));
  const deepLink=Number.isInteger(wanted)&&wanted>=1&&wanted<=K.levels.length;
  unlockAll=query.get('unlock')==='all';
  // 存档里停在的那一关如果还没解锁（比如换了存档、或之前跳到过后面），就退回到当前能走到的那一关。
  const savedIndex=Number.isInteger(saved.current)&&saved.current>=0&&saved.current<K.levels.length?saved.current:0;
  let initial=deepLink?wanted-1:savedIndex;
  let clamped=false;
  if(!deepLink&&!unlockAll&&!isUnlocked(initial)){initial=unlockedLimit();clamped=true;}
  load(initial);new ResizeObserver(resize).observe(canvas);
  if(clamped)status(`${firstLocked()}还没整理完，先带你回到这一关；整理完它，下一份委托就会打开。`);
  // 版式按视口宽挑，而宽视口下画布宽度取的是 100dvh-350（只看窗口高度），所以「只把窗口
  // 拉窄」时 ResizeObserver 可能一次都不响——自己再听一次窗口尺寸变化，转屏也归它管。
  window.addEventListener('resize',resize);
  resize();if(!storageOK)status('浏览器暂不允许本机存档；本次仍可正常游玩。');
  // 验收用的两个入口：?test=1&solve=1 直接摆上参考解（截图用），?codex=1 直接打开图鉴。
  const params=new URLSearchParams(location.search);
  if(params.has('test')&&params.has('solve')){
    const s=K.solve(level()).solution;
    for(const[id,p]of Object.entries(s))place(id,p.x,p.y,p.rot);
    if($('complete-dialog').open)$('complete-dialog').close();
  }
  if(params.has('codex'))$('codex').onclick();
  // 截图／自动化要能跳过弹窗，否则每张图都会盖一层遮罩。
  // 同意状态本来就是玩家的选择，这里只提供「本来就已经同意过」的效果，不放行任何默认同意。
  if(params.has('consent'))rememberConsent(params.get('consent')==='no'?'no':'yes');
  else askPrivacy();
})();
