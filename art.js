(function(){
  'use strict';
  function rr(c,x,y,w,h,r,fill,stroke){r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
  function line(c,x1,y1,x2,y2,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
  function circle(c,x,y,r,fill,stroke){c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
  function label(c,text,x,y,size,color='#5a6252'){c.fillStyle=color;c.font=`${size}px "Microsoft YaHei",sans-serif`;c.textAlign='center';c.fillText(text,x,y);}
  function draw(c,id,x,y,unit,rot=0,alpha=1){
    const item=Keepsake.items[id],b=Keepsake.bounds(item.cells),w=b.w*unit,h=b.h*unit;
    c.save();c.globalAlpha*=alpha;c.translate(x,y);const r=((rot%4)+4)%4;if(r===1){c.translate(h,0);c.rotate(Math.PI/2);}else if(r===2){c.translate(w,h);c.rotate(Math.PI);}else if(r===3){c.translate(0,w);c.rotate(-Math.PI/2);}c.lineCap='round';c.lineJoin='round';
    // The faint paper backing communicates the actual occupied cells, including holes.
    c.fillStyle='#c9b99630';for(const[dx,dy]of item.cells)c.fillRect(dx*unit+1,dy*unit+1,unit-2,unit-2);
    const pad=unit*.09;const ink='#536058';c.lineWidth=Math.max(1,unit*.023);
    switch(item.kind){
      case 'notebook':
        rr(c,pad+2,pad+4,w-pad*2,h-pad*2,unit*.08,'#496d5e');rr(c,pad,pad,w-pad*2,h-pad*2,unit*.07,'#829b85','#586f5b');
        line(c,unit*.3,pad+2,unit*.3,h-pad-2,'#aeb9a0',2);rr(c,unit*.48,unit*.42,unit*1.14,unit*.8,2,'#eee5c9');label(c,'NOTE',w*.54,unit*.77,unit*.18);label(c,'日常',w*.54,unit*1.03,unit*.15);line(c,w*.68,unit*.1,w*.68,h*.96,'#c3ab70',unit*.045);break;
      case 'tin':
        rr(c,pad,pad+4,w-2*pad,h-2*pad,unit*.22,'#9f735c');rr(c,pad,pad,w-2*pad,h-2*pad,unit*.22,'#c38f76','#95705d');rr(c,pad+5,pad+5,w-2*pad-10,h-2*pad-10,unit*.16,null,'#e3b79a');circle(c,w/2,h*.45,unit*.39,'#f0dfb7');for(let i=0;i<7;i++){let a=i*Math.PI*2/7;circle(c,w/2+Math.cos(a)*unit*.2,h*.45+Math.sin(a)*unit*.2,unit*.09,'#cca16a');}circle(c,w/2,h*.45,unit*.1,'#b17a50');label(c,'BISCUITS',w/2,h*.78,unit*.17,'#f6e2bd');break;
      case 'tape':
        rr(c,pad,pad,w-2*pad,h-2*pad,unit*.11,'#789087','#536c60');rr(c,unit*.22,unit*.19,w-unit*.44,unit*.48,unit*.07,'#e9dec0');circle(c,unit*.62,unit*.43,unit*.15,'#777b65');circle(c,unit*1.38,unit*.43,unit*.15,'#777b65');circle(c,unit*.62,unit*.43,unit*.065,'#dedbc0');circle(c,unit*1.38,unit*.43,unit*.065,'#dedbc0');line(c,.8*unit,.43*unit,1.2*unit,.43*unit,'#778673',2);label(c,'SIDE A',w/2,unit*.83,unit*.11,'#eae7cc');break;
      case 'pencil':
        rr(c,unit*.29,unit*.13,unit*.42,unit*2.31,unit*.04,'#d7b575','#a68e58');c.fillStyle='#ebd4aa';c.beginPath();c.moveTo(unit*.29,unit*2.42);c.lineTo(unit*.71,unit*2.42);c.lineTo(unit*.5,unit*2.92);c.closePath();c.fill();c.fillStyle='#4c5b4f';c.beginPath();c.moveTo(unit*.43,unit*2.75);c.lineTo(unit*.57,unit*2.75);c.lineTo(unit*.5,unit*2.92);c.fill();line(c,unit*.49,unit*.45,unit*.49,unit*2.37,'#edcd91',unit*.06);rr(c,unit*.29,unit*.11,unit*.42,unit*.33,2,'#b58175');line(c,unit*.3,unit*.43,unit*.7,unit*.43,'#ded8bb',unit*.08);break;
      case 'photo':
        rr(c,pad,pad+3,w-pad*2,h-pad*2,2,'#d3c6ad');rr(c,pad,pad,w-pad*2,h-pad*2,2,'#f8f1d9','#d4c7ab');rr(c,unit*.25,unit*.24,unit*1.5,unit*1.13,1,'#9ab3aa');c.fillStyle='#789082';c.beginPath();c.moveTo(unit*.25,unit*1.37);c.lineTo(unit*.86,unit*.65);c.lineTo(unit*1.3,unit*1.37);c.fill();c.fillStyle='#567363';c.beginPath();c.moveTo(unit*.8,unit*1.37);c.lineTo(unit*1.35,unit*.78);c.lineTo(unit*1.75,unit*1.37);c.fill();circle(c,unit*1.38,unit*.5,unit*.13,'#eee1ad');label(c,'栖湾 · 晴',w/2,unit*1.73,unit*.18,'#9c967d');break;
      case 'keys':
        circle(c,unit*.5,unit*.5,unit*.29,null,'#9f8f61');circle(c,unit*.5,unit*.5,unit*.23,null,'#dbc895');line(c,unit*.52,unit*.79,unit*.52,unit*1.6,'#b7a16d',unit*.16);line(c,unit*.5,unit*1.61,unit*1.68,unit*1.61,'#b7a16d',unit*.17);line(c,unit*1.24,unit*1.6,unit*1.24,unit*1.31,'#b7a16d',unit*.16);line(c,unit*1.63,unit*1.6,unit*1.63,unit*1.27,'#b7a16d',unit*.16);break;
      case 'letter':
        rr(c,pad,pad,w-pad*2,h-pad*2,unit*.045,'#e9dcb8','#b7a784');line(c,pad,pad,w/2,h*.65,'#c9b78e');line(c,w-pad,pad,w/2,h*.65,'#c9b78e');line(c,pad,h-pad,w*.7,h*.37,'#d0c19c');line(c,w-pad,h-pad,w*.3,h*.37,'#d0c19c');circle(c,w*.5,h*.57,unit*.15,'#b67b63');break;
      case 'camera':
        rr(c,unit*.15,unit*.43,unit*2.7,unit*1.4,unit*.15,'#626c62','#475749');rr(c,unit*.15,unit*.43,unit*2.7,unit*.43,unit*.1,'#a7b0a0');rr(c,unit*1.08,unit*.2,unit*.87,unit*.35,unit*.07,'#939d8c');rr(c,unit*.35,unit*.29,unit*.45,unit*.18,2,'#6b7767');circle(c,unit*1.5,unit*1.13,unit*.62,'#bfbea5','#48574b');circle(c,unit*1.5,unit*1.13,unit*.46,'#3e5650','#8c9d8c');circle(c,unit*1.5,unit*1.13,unit*.3,'#557c75');circle(c,unit*1.37,unit*.99,unit*.11,'#adc1af');rr(c,unit*2.32,unit*.58,unit*.3,unit*.18,1,'#d4d6bc');break;
      case 'glasses':
        circle(c,unit*.75,unit*.52,unit*.37,'#d0c9ad44','#826f57');circle(c,unit*2.25,unit*.52,unit*.37,'#d0c9ad44','#826f57');c.lineWidth=unit*.045;c.beginPath();c.moveTo(unit*1.12,unit*.48);c.quadraticCurveTo(unit*1.5,unit*.2,unit*1.88,unit*.48);c.strokeStyle='#826f57';c.stroke();line(c,unit*.35,unit*.38,unit*.14,unit*.17,'#826f57',unit*.05);line(c,unit*2.64,unit*.38,unit*2.86,unit*.17,'#826f57',unit*.05);break;
      case 'mug':
        rr(c,unit*1.65,unit*1.1,unit*1.1,unit*.69,unit*.2,null,'#789489');c.lineWidth=unit*.1;rr(c,unit*1.62,unit*1.1,unit*1.1,unit*.69,unit*.2,null,'#789489');c.lineWidth=1;rr(c,unit*.15,unit*.2,unit*1.65,unit*1.62,unit*.28,'#d6e0cc','#6f8a7f');rr(c,unit*.16,unit*.17,unit*1.62,unit*.38,unit*.15,'#8ba597');rr(c,unit*.23,unit*.23,unit*1.48,unit*.2,unit*.1,'#c7d4bd');label(c,'好好生活',unit*.97,unit*1.24,unit*.2,'#718a78');break;
      case 'player':
        rr(c,pad,pad,w-pad*2,h-pad*2,unit*.14,'#ca9974','#a67856');rr(c,unit*.3,unit*.32,unit*1.4,unit*.86,unit*.05,'#737d69');rr(c,unit*.45,unit*.47,unit*1.1,unit*.48,unit*.03,'#a8b394');circle(c,unit*.7,unit*.71,unit*.12,'#647764');circle(c,unit*1.3,unit*.71,unit*.12,'#647764');label(c,'PLAY  ▷',unit,unit*1.54,unit*.19,'#675d46');break;
      case 'headphones':
        c.strokeStyle='#9d8975';c.lineWidth=unit*.21;c.beginPath();c.moveTo(unit*.39,unit*2.22);c.lineTo(unit*.39,unit*.87);c.bezierCurveTo(unit*.39,unit*.15,unit*2.61,unit*.15,unit*2.61,unit*.87);c.lineTo(unit*2.61,unit*2.22);c.stroke();rr(c,unit*.17,unit*1.68,unit*.65,unit*1.13,unit*.18,'#687769','#4f6354');rr(c,unit*2.18,unit*1.68,unit*.65,unit*1.13,unit*.18,'#687769','#4f6354');line(c,unit*.49,unit*1.89,unit*.49,unit*2.55,'#91a28c',unit*.05);line(c,unit*2.5,unit*1.89,unit*2.5,unit*2.55,'#91a28c',unit*.05);break;
      case 'book':
        rr(c,pad,pad+3,w-pad*2,h-pad*2,unit*.06,'#e5d9b6','#9f8370');rr(c,pad,pad,w-pad*2,h-pad*2-unit*.11,unit*.05,'#b58d7d','#98715f');line(c,unit*.35,pad,unit*.35,h-pad*1.9,'#d2ae98',2);label(c,'慢慢生活',unit*1.1,unit*.82,unit*.24,'#f2e3c9');line(c,unit*.62,unit*1.15,unit*1.57,unit*1.15,'#d7bba1',1);c.fillStyle='#6b8370';c.fillRect(unit*1.4,unit*1.65,unit*.2,unit*.32);break;
      case 'postcard':
        rr(c,pad,pad,w-pad*2,h-pad*2,unit*.03,'#e9e0c5','#b7b39a');line(c,unit*1.13,unit*.18,unit*1.13,unit*.82,'#bbb49b');rr(c,unit*1.53,unit*.18,unit*.27,unit*.29,1,'#9eafa1');c.fillStyle='#839e91';c.beginPath();c.moveTo(unit*.2,unit*.75);c.lineTo(unit*.6,unit*.31);c.lineTo(unit*1.01,unit*.75);c.fill();break;
      case 'ruler':
        rr(c,unit*.06,unit*.26,unit*3.88,unit*.5,unit*.07,'#d9bc86','#a98d5c');
        c.fillStyle='#f2e4bd';c.fillRect(unit*.12,unit*.3,unit*3.76,unit*.15);
        for(let i=0;i<9;i++){const x=unit*(.28+i*.43),long=i%2===0;line(c,x,unit*.3,x,unit*.3+unit*(long?.21:.12),'#8d7448',Math.max(1,unit*.022));}
        label(c,'栖湾',unit*3.34,unit*.7,unit*.19,'#8b7449');break;
      case 'lamp':
        rr(c,unit*.22,unit*1.44,unit*2.56,unit*.4,unit*.14,'#c19a68','#997a54');
        line(c,unit*1.5,unit*1.42,unit*1.5,unit*.9,'#a8845a',Math.max(2,unit*.075));
        c.fillStyle='#e6d6b1';c.beginPath();c.moveTo(unit*1.02,unit*.86);c.lineTo(unit*1.98,unit*.86);c.lineTo(unit*1.8,unit*.16);c.lineTo(unit*1.2,unit*.16);c.closePath();c.fill();c.strokeStyle='#997a54';c.lineWidth=Math.max(1,unit*.03);c.stroke();
        circle(c,unit*1.5,unit*1.02,unit*.07,'#8d7448');label(c,'光',unit*1.5,unit*1.74,unit*.2,'#8b7449');break;
      case 'shoes':{
        const shoe=(x,y,sw,sh)=>{rr(c,x+sw*.06,y+sh*.44,sw*.94,sh*.54,sh*.24,'#8c8272','#6d6558');rr(c,x,y+sh*.16,sw*.66,sh*.82,sh*.26,'#a79c8a','#6d6558');line(c,x+sw*.12,y+sh*.5,x+sw*.88,y+sh*.5,'#d3c8b2',Math.max(1,unit*.035));line(c,x+sw*.18,y+sh*.22,x+sw*.4,y+sh*.4,'#c6bba6',Math.max(1,unit*.03));};
        shoe(unit*1.06,unit*.12,unit*1.88,unit*.74);shoe(unit*.14,unit*1.1,unit*1.88,unit*.74);break;}
      case 'cane':
        c.strokeStyle='#96734a';c.lineWidth=unit*.12;c.beginPath();c.moveTo(unit*.54,unit*.62);c.bezierCurveTo(unit*.54,unit*.12,unit*.96,unit*.14,unit*.92,unit*.62);c.stroke();
        rr(c,unit*.36,unit*.52,unit*.32,unit*1.96,unit*.1,'#c09a6c','#96734a');
        rr(c,unit*.32,unit*2.42,unit*1.48,unit*.28,unit*.12,'#8f7248','#6f5734');break;
    }
    c.restore();
  }
  // ══ 工作台皮肤 ══════════════════════════════════════════════════════════
  // 皮肤改的是「工作台」本身——画布底、木框、台面、格线、隔板、图钉、提示色——
  // **一个字都不动旧物的画法**。原因很实际：下面 draw() 那套配色是按浅色台面
  // 调的（浅底 + 墨绿描边 + 半透明的纸背），台面一压暗，旧物就糊成一团。
  // 所以每款皮肤的台面都留在「浅到中」这一段，戏做在背景、框和强调色上。
  //
  // 调色板不是手写 40 个色值，而是「10 个种子色 + 派生」：
  // 换一款皮肤只要改一组种子色，整张台子的层次关系自己跟着走，
  // 也不会出现「改了台面忘了改隔板」这种半拉子皮肤。
  const h2=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
  const toRgb=a=>'#'+a.map(h2).join('');
  const hex=c=>{const v=c.replace('#','');return[parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16)];};
  const mix=(a,b,t)=>{const A=hex(a),B=hex(b);return toRgb([0,1,2].map(i=>A[i]+(B[i]-A[i])*t));};
  // 往黑（t<0）或白（t>0）推。alpha 后缀直接拼在六位色值后面。
  const key=(c,t)=>mix(c,t<0?'#000000':'#ffffff',Math.abs(t));
  const lum=c=>{const[r,g,b]=hex(c);return(0.2126*r+0.7152*g+0.0722*b)/255;};

  // 一款皮肤的完整调色板 = derive(seed) → 再被 fix 覆盖。
  // 默认那款（oak）把每一个色值都在 fix 里写死成原稿的值，所以「默认皮肤 =
  // 改版前的观感」是**结构上**保证的，不是靠派生函数碰巧算对。
  function derive(s){
    const onBg=lum(s.bg)<.5, dkSurf=lum(s.surface)<.5;
    const surf=t=>key(s.surface,dkSurf?t:-t);
    return {
      bg:s.bg,
      speckle:mix(s.wood,s.bg,.5)+(onBg?'22':'20'),
      ink:s.ink,
      shadow:mix(s.wood,onBg?'#000000':'#6d4f30',.5)+'30',
      frameOut:s.wood, frameIn:s.wood2,
      frameEdge:key(s.wood,-.18),
      rings:mix(s.wood2,onBg?'#ffffff':'#000000',onBg?.32:.1)+(onBg?'55':'66'),
      boardEdge:key(s.wood,-.3),
      surface:s.surface,
      surfaceGreen:mix(s.accent,'#ffffff',.76),
      surfaceEdge:surf(.08),
      surfaceGreenEdge:mix(s.accent,'#ffffff',.58),
      zone1Fill:mix(s.accent,'#ffffff',.68), zone1Line:mix(s.accent,'#000000',.02),
      zone2Fill:mix(s.warm,'#ffffff',.64), zone2Line:mix(s.warm,'#000000',.05),
      grid:surf(.09), gridGreen:mix(s.accent,'#ffffff',.76),
      blockFill:mix(s.wood,'#ffffff',.44),
      blockEdge:key(mix(s.wood,'#ffffff',.44),-.2),
      blockStripe:mix(s.wood,'#ffffff',.68),
      handle:key(s.wood,lum(s.wood)<.45?.32:-.14),
      handleLine:key(key(s.wood,lum(s.wood)<.45?.32:-.14),lum(s.wood)<.45?.34:-.24),
      sel:key(s.accent,lum(s.accent)<.32?.12:0),
      lockLine:mix(s.warm,'#ffffff',.18),
      pin:mix(s.warm,'#ffffff',.46), pinEdge:mix(s.warm,'#000000',.28),
      hintOk:key(s.accent,-.14), hintWarn:mix(s.warm,'#a0432a',.5),
      hintOkText:key(s.accent,.1), hintWarnText:mix(s.warm,'#7a3a22',.45),
      hintBar:mix(s.ink,s.accent,.35),
      sep:surf(.11), labL:s.ink, labR:mix(s.ink,s.accent,.45),
      tile:key(s.surface,.3), tileSel:mix(s.accent,'#ffffff',.87),
      tileFixed:mix(s.warm,'#ffffff',.87), tilePlaced:surf(.22),
      tileSelEdge:mix(s.accent,'#ffffff',.56), tileEdge:surf(.15),
      markFixed:mix(s.warm,'#000000',.06), markPlaced:mix(s.accent,'#ffffff',.34),
      nameInk:mix(s.ink,'#3a4038',.45), nameDoneInk:mix(s.ink,'#ffffff',.22),
      mustInk:mix(s.warm,'#a0331a',.55),
      zoneTag1:mix(s.accent,'#000000',.06), zoneTag2:mix(s.warm,'#000000',.12),
      flash:mix(s.accent,'#ffffff',.5),
      // 导出作品图（savePicture）用的那几档。单独一组是因为它画在 900×800 的白纸上，
      // 不是画在台面上，明度关系跟画布不一样。
      picBg:key(s.surface,.5), picTitle:key(s.accent,-.3), picSub:s.ink, picFrame:s.wood,
      picKeep:mix(s.accent,'#ffffff',.34), picScore:key(s.accent,-.25),
      picMeta:mix(s.ink,s.accent,.35), picReward:mix(s.ink,s.accent,.35), picFoot:s.ink,
    };
  }

  const OAK={ // 原稿（2026-09 之前的唯一一套配色），一个值都不许漂
    speckle:'#8e7d5420', shadow:'#6d4f3020',
    frameOut:'#c7a982', frameIn:'#d5bb96', frameEdge:'#b39875', rings:'#bea17b66', boardEdge:'#a9916e',
    surface:'#f0e5c8', surfaceGreen:'#d2dcc5', surfaceEdge:'#e7d8b9', surfaceGreenEdge:'#b8c4ad',
    zone1Fill:'#b6d1c3', zone1Line:'#74998d', zone2Fill:'#e7c5aa', zone2Line:'#b78d71',
    grid:'#d9caab', gridGreen:'#b8c6ab',
    blockFill:'#b89a75', blockEdge:'#937852', blockStripe:'#d4b58d',
    handle:'#9b825f', handleLine:'#d2b990',
    sel:'#536f5a', lockLine:'#9a8358', pin:'#c19a68', pinEdge:'#8a6f42',
    hintOk:'#457b64', hintWarn:'#b9745b', hintOkText:'#52745b', hintWarnText:'#a9613f', hintBar:'#75846d',
    sep:'#d1c8b6', labL:'#868570', labR:'#68785f',
    tile:'#f4eedf', tileSel:'#e0e6d1', tileFixed:'#e6dcc6', tilePlaced:'#e7e1d2',
    tileSelEdge:'#9aab8b', tileEdge:'#e0d7c4',
    markFixed:'#a08a5f', markPlaced:'#8a957c', nameInk:'#6b7160', nameDoneInk:'#a09f8a',
    mustInk:'#ad684f', zoneTag1:'#54786c', zoneTag2:'#946c50', flash:'#92a77d',
    picBg:'#f4efe3', picTitle:'#425a49', picSub:'#8a8c76', picFrame:'#cbb08b', picKeep:'#677d69',
    picScore:'#4f6350', picMeta:'#7f8a72', picReward:'#7a826b', picFoot:'#8b937c',
  };

  // 皮肤清单。名字按用户要求取「响亮」的那一路——店是安静的，台子可以不安静。
  //   unlock.kind:'free'   默认就有
  //   unlock.kind:'levels' 通关 n 份委托（saved.completed 的数量）
  //   unlock.kind:'codex'  解锁 n 段回忆（saved.codex 的数量）
  //   adUnlock:false       这一款**不接广告解锁**，只能靠自己拿到，免得「什么都能看广告买」
  const SKINS=[
    {id:'oak',name:'栖湾原木台',tagline:'试营业的第一张台子',unlock:{kind:'free'},
      adUnlock:false,seed:{bg:'#eee7d7',wood:'#c7a982',wood2:'#d5bb96',surface:'#f0e5c8',ink:'#93917c',accent:'#536f5a',warm:'#b78d71'},fix:OAK},
    {id:'iron',name:'玄铁九鼎案',tagline:'寒铁冷银，落子生风',unlock:{kind:'levels',n:10},adUnlock:true,
      seed:{bg:'#cfd7d7',wood:'#3f474d',wood2:'#828e95',surface:'#e0e6e3',ink:'#6f7a79',accent:'#2f5c5a',warm:'#8a7a63'}},
    {id:'lacquer',name:'赤霄朱漆台',tagline:'朱漆描金，一寸不让',unlock:{kind:'levels',n:25},adUnlock:true,
      seed:{bg:'#f2e0d2',wood:'#9c3225',wood2:'#c95a41',surface:'#f5e7d2',ink:'#9c7050',accent:'#7c2c21',warm:'#c08a3e'}},
    {id:'jade',name:'青玉藏龙案',tagline:'青玉为面，龙纹在底',unlock:{kind:'levels',n:45},adUnlock:true,
      seed:{bg:'#dfeae3',wood:'#2f5f52',wood2:'#5f9082',surface:'#e4eee7',ink:'#67857a',accent:'#27564a',warm:'#a3763c'}},
    {id:'gold',name:'鎏金万象案',tagline:'墨底鎏金，万物归位',unlock:{kind:'levels',n:70},adUnlock:true,
      seed:{bg:'#2c2823',wood:'#bd9440',wood2:'#d9b567',surface:'#efe5cd',ink:'#c0ad7c',accent:'#7d5d1f',warm:'#9b5a2b'}},
    {id:'star',name:'长夜星砂台',tagline:'攒满十八段回忆才亮得起来',unlock:{kind:'codex',n:18},
      adUnlock:false,adLockNote:'这一款不接广告，只能把回忆图鉴攒到 18 段',seed:{bg:'#111524',wood:'#6a7488',wood2:'#9aa5b8',
      surface:'#c8cfe2',ink:'#8f98b0',accent:'#4a5a94',warm:'#8f6f92'}},
  ];
  const PALETTES={};
  for(const s of SKINS)PALETTES[s.id]=Object.assign(derive(s.seed),s.fix||{});
  const byId=id=>SKINS.find(s=>s.id===id)||null;
  const DEFAULT=SKINS[0].id;
  // 认不出来的 id（存档被改过、版本回退、拼错）一律退回默认款，绝不抛。
  const skin=id=>PALETTES[byId(id)?id:DEFAULT];

  window.KeepsakeArt={rr,line,circle,label,draw,SKINS,PALETTES,skin,skinById:byId,DEFAULT_SKIN:DEFAULT};
})();
