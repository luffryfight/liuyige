(function(root){
  'use strict';
  const rect=(w,h)=>Array.from({length:w*h},(_,i)=>[i%w,Math.floor(i/w)]);
  const items={
    notebook:{name:'旧笔记本',kind:'notebook',color:'#789085',cells:rect(2,3),memory:'扉页写着：新的一天，慢慢来。'},
    tin:{name:'饼干铁盒',kind:'tin',color:'#c58c75',cells:rect(2,2),memory:'饼干吃完很久了，针线还在里面。'},
    tape:{name:'旧磁带',kind:'tape',color:'#7e938c',cells:rect(2,1),memory:'A面是晴天，B面是回家的路。'},
    pencil:{name:'一支铅笔',kind:'pencil',color:'#d4ac66',cells:rect(1,3),memory:'削短了一截，想写的东西还有很多。'},
    photo:{name:'老相片',kind:'photo',color:'#d6c4a0',cells:rect(2,2),memory:'照片里的那扇窗，现在还开着。'},
    keys:{name:'旧店钥匙',kind:'keys',color:'#b8a16e',cells:[[0,0],[0,1],[1,1]],memory:'转两圈，再轻轻往里推。'},
    letter:{name:'一封来信',kind:'letter',color:'#c7b58e',cells:rect(2,1),memory:'地址写得很认真，邮票贴得有点歪。'},
    camera:{name:'胶片相机',kind:'camera',color:'#90978c',cells:rect(3,2),memory:'里面还有一张没拍完的胶卷。'},
    glasses:{name:'圆框眼镜',kind:'glasses',color:'#a18d76',cells:rect(3,1),memory:'戴上它，能看清很小的字。'},
    mug:{name:'搪瓷杯',kind:'mug',color:'#90a5a0',cells:[[0,0],[1,0],[0,1],[1,1],[2,1]],memory:'杯口缺了一点，喝水的位置刚刚好。'},
    player:{name:'随身听',kind:'player',color:'#cd9770',cells:rect(2,2),memory:'按下播放，走路就有了节奏。'},
    headphones:{name:'旧耳机',kind:'headphones',color:'#aa917d',cells:[[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[2,2]],memory:'线缠在一起的样子，也很熟悉。'},
    book:{name:'一本旧书',kind:'book',color:'#b4897a',cells:rect(2,2),memory:'书签还停在上次读到的那一页。'},
    postcard:{name:'栖湾明信片',kind:'postcard',color:'#94a59a',cells:rect(2,1),memory:'海风到过的地方，纸边会微微卷起。'},
    // 后四件形状更别扭：长条、T 形、错位、带脚，专门用来把空位卡住。
    ruler:{name:'旧木尺',kind:'ruler',color:'#d9bc86',cells:rect(4,1),memory:'量过很多次窗台，刻度已经磨得看不清了。'},
    lamp:{name:'小台灯',kind:'lamp',color:'#c9a06a',cells:[[1,0],[0,1],[1,1],[2,1]],memory:'开关有点松，按下去要停一下才亮。'},
    shoes:{name:'旧布鞋',kind:'shoes',color:'#9a8f7e',cells:[[1,0],[2,0],[0,1],[1,1]],memory:'鞋底磨薄了，走起路来反而轻。'},
    cane:{name:'旧拐杖',kind:'cane',color:'#b08a5f',cells:[[0,0],[0,1],[0,2],[1,2]],memory:'扶手握得发亮，比新的顺手。'}
  };
  const levels=[
    {id:'drawer-1',title:'重新开门',chapter:'序章 · 留一格整理所',from:'姨婆留下的便签',letter:'最上面的抽屉，留给每天用得着的小东西。钥匙别放太深，明早开门还要用。',reply:'抽屉合上的时候，门外恰好传来一声车铃。小店重新开门了。',reward:'收藏：留一格的第一把钥匙',cols:4,rows:4,items:['tin','photo','tape','keys'],surface:'wood'},
    {id:'drawer-2',title:'第一张书桌',chapter:'委托一 · 搬来栖湾的小林',from:'小林',letter:'终于有了自己的书桌。能帮我把笔记本和零碎小东西放好吗？不用很满，看着舒服就好。',reply:'“明天终于不用翻箱子找钥匙了。谢谢你，我开始有一点家的感觉了。”',reward:'收藏：小林的第一封回信',cols:5,rows:4,items:['notebook','pencil','tin','tape','letter'],surface:'green'},
    {id:'drawer-3',title:'抽屉里的晴天',chapter:'委托一 · 搬来栖湾的小林',from:'小林',letter:'妈妈寄来了一张老相片和我的旧相机。原来不常用的东西，也想留在伸手够得到的地方。',reply:'相片放在相机旁边。过去的晴天，终于在新的房间里有了位置。',reward:'收藏：窗边的老相片',cols:5,rows:5,items:['camera','photo','notebook','keys','letter','tape'],surface:'wood'},
    {id:'drawer-4',title:'放学路上的歌',chapter:'委托二 · 阿禾的音乐盒',from:'阿禾',letter:'这些歌我都还记得。耳机中间的空位，也许正好能放下一件小东西。请把它们一起留下吧。',reply:'“我又听了一遍那盘磁带。这次没有急着赶路，慢慢走回了家。”',reward:'收藏：一盘回家的歌',cols:5,rows:4,items:['headphones','player','tape','letter','pencil'],surface:'green'},
    {id:'drawer-5',title:'午后的修理铺',chapter:'委托三 · 陈师傅的日常',from:'陈师傅',letter:'修理铺交给徒弟了。这只杯子、眼镜和几样老物件，还是想放在身边。摆得顺手就行。',reply:'师傅端起搪瓷杯笑了笑：“工具留给年轻人。下午这点清闲，留给我。”',reward:'收藏：陈师傅的搪瓷杯',cols:6,rows:4,items:['mug','glasses','book','tin','keys','pencil'],surface:'wood'},
    {id:'drawer-6',title:'给未来留一格',chapter:'终章 · 今天就整理到这里',from:'给明天的自己',letter:'留下来的东西已经够多了。把这些安顿好，再留一点空白。下次开箱，也许会遇见新的故事。',reply:'你在委托簿上写下“明天继续”。这间小小的整理所，也慢慢成为了你的地方。',reward:'收藏：一间重新热闹起来的小店',cols:6,rows:5,items:['headphones','camera','notebook','mug','letter','keys'],surface:'green'}
  ];
  const region=(x,y,w,h)=>rect(w,h).map(([dx,dy])=>[x+dx,y+dy]);
  levels[5].chapter='序章尾声 · 小店的第一天';
  levels.forEach(l=>{l.mode='classic';l.rule='把全部物品放入抽屉即可，允许留白。';});
  const extra=[
    {title:'隔开的两边',mode:'blocked',cols:5,rows:4,blocked:region(2,0,1,4),items:['book','tin','photo','tape','letter'],letter:'这道老隔板拆不下来了。把东西分放两边，小物件也要有位置。'},
    {title:'磨损的四角',mode:'blocked',cols:5,rows:5,blocked:[[0,0],[4,0],[0,4],[4,4]],items:['camera','photo','mug','keys','letter'],letter:'四角还在等木胶干透。先绕开这些位置，试试中间这片空间。'},
    {title:'窄窄的通道',mode:'blocked',cols:6,rows:4,blocked:region(2,0,1,3),items:['headphones','player','pencil','tin','letter'],letter:'隔板只留了一条窄缝。大件各有一边，细长的物品也许能找到特别的位置。'},
    {title:'绕过旧木扣',mode:'blocked',cols:6,rows:5,blocked:region(2,1,2,2),items:['mug','glasses','book','tin','keys','pencil'],letter:'中间的木扣要留下。先看看四周能放什么，再决定大物件的朝向。'},
    {title:'来信放在最前面',mode:'zone',cols:5,rows:4,items:['notebook','pencil','tin','letter','keys'],zones:[{label:'来信区',items:['letter'],cells:region(0,3,5,1)}],letter:'来信我还想常常读。请把它完整放在最下边的标记区，其他东西自由安排。'},
    {title:'相片的软垫',mode:'zone',cols:5,rows:5,items:['photo','camera','book','pencil','keys'],zones:[{label:'相片区',items:['photo'],cells:region(0,0,2,3)}],letter:'左上角垫了软布，给老相片留好了。相机和其他旧物，就请你来安排。'},
    {title:'各自的小抽屉',mode:'zone',cols:6,rows:4,items:['player','tape','photo','book','keys','letter'],zones:[{label:'音乐区',items:['player','tape'],cells:region(0,0,3,4)},{label:'纸品区',items:['photo','book'],cells:region(3,0,3,4)}],letter:'左边放随身听和磁带，右边放相片和旧书。来信与钥匙可以放在任意一边。'},
    {title:'留出顺手的位置',mode:'zone',cols:6,rows:5,blocked:[[2,2],[3,2]],items:['mug','glasses','book','tin','keys','pencil'],zones:[{label:'眼镜区',items:['glasses'],cells:region(0,4,6,1)},{label:'钥匙区',items:['keys'],cells:region(4,0,2,3)}],letter:'眼镜要放最下边，钥匙留在右上。绕开中间的木扣，把每天用的东西放得顺手。'},
    {title:'周末的小行李',mode:'choice',cols:4,rows:4,items:['photo','camera','book','pencil','letter','keys'],required:['photo'],keepCount:4,letter:'行李里只留四件。合照一定要带，另外三件由你挑；没选的旧物留在家里，不会丢掉。'},
    {title:'只带一段歌',mode:'choice',cols:4,rows:4,items:['player','headphones','tape','book','photo','letter'],required:['player','tape'],keepCount:4,letter:'随身听和磁带一定带上，再选两件放进箱子。耳机、旧书、相片与来信，你会带哪两件？'},
    {title:'留在手边的日常',mode:'choice',cols:5,rows:3,blocked:[[2,0]],items:['mug','glasses','notebook','tin','keys','letter'],required:['mug'],keepCount:4,letter:'杯子一定留下，再挑三件常用物。左上和右上被木扣隔开，选什么也会影响能怎么摆。'},
    {title:'给明天留的位置',mode:'choice',cols:5,rows:4,blocked:[[2,0],[2,1]],items:['photo','keys','camera','book','pencil','letter'],required:['photo','keys'],keepCount:5,zones:[{label:'相片区',items:['photo'],cells:region(0,0,2,3)}],letter:'相片与店钥匙必须留下，再选三件。相片放左上的软垫，未选的那件先留在桌面，明天再整理。'}
  ];
  const modeNames={classic:'基础收纳',blocked:'隔板抽屉',zone:'分区委托',choice:'留物取舍',cross:'隔板分区',pick:'取舍分区',master:'大师委托'};
  // 新手章节：每种玩法各留一关做教学，排在最前面，让玩家在七关之内认全所有规矩。
  // 这七关不参与 HARDEN 增强（教学要轻），也各自作为该玩法的样板。
  const TUTORIAL=['drawer-1','drawer-7','drawer-11','drawer-15','drawer-28','drawer-36','drawer-43'];
  const TUTORIAL_SET=new Set(TUTORIAL);
  extra.forEach((l,i)=>levels.push({...l,id:`drawer-${i+7}`,chapter:`${modeNames[l.mode]} · 栖湾的新委托`,from:l.mode==='choice'?'准备出门的小林':l.mode==='blocked'?'陈师傅':'整理所的老朋友',surface:i%2?'green':'wood',reply:l.mode==='choice'?'不是每次都要把所有东西带上。你把这一次最想留下的，安顿好了。':'换了一点条件，也找到了新的摆法。委托人把这份整理认真记在了心里。',reward:`收藏：${l.title}`,rule:l.mode==='choice'?`从 ${l.items.length} 件中选留 ${l.keepCount} 件；必留：${l.required.map(id=>items[id].name).join('、')}。` :l.mode==='blocked'?'把全部物品放入，木色斜纹格不可占用。':'把全部物品放入；指定物品须完整位于同名标记区。'}));
  // 第二轮委托：把已有的四种玩法两两融合，再合成三重委托，共 32 关。
  const moreBlocked=[
    {title:'抽屉的旧痕',mode:'blocked',cols:6,rows:5,blocked:region(0,2,5,1),items:['notebook','tin','photo','tape','letter','keys'],letter:'这道横隔板是旧抽屉留下的痕，拆不掉。上下两格都要用到，先看看哪些大件能横过来。',reply:'隔板还在，东西却都进去了。旧痕也成了抽屉的一部分。'},
    {title:'木扣与角落',mode:'blocked',cols:6,rows:5,blocked:[[0,0],[5,0],[0,4],[5,4],[2,2]],items:['camera','mug','glasses','pencil','postcard','letter'],letter:'四角还在等木胶干透，中间也留了一颗木扣。绕开这五个位置，把相机和杯子放稳。',reply:'避开了五个位置，反而摆出了更松快的布局。'},
    {title:'斜放的隔板',mode:'blocked',cols:7,rows:5,blocked:region(3,0,1,4),items:['headphones','camera','tin','keys','tape','letter'],letter:'隔板竖在偏右的位置，两边宽窄不一样。耳机最占地方，先想好放哪一侧。',reply:'隔板把抽屉分成两半，两边都刚刚好。'}
  ];
  const moreZone=[
    {title:'三格小抽屉',mode:'zone',cols:6,rows:4,zones:[{label:'纸品区',items:['photo','letter'],cells:region(0,0,3,3)},{label:'饮品区',items:['mug'],cells:region(3,0,3,4)}],items:['photo','letter','mug','tape','keys'],letter:'左边三格留给纸品，右边留给每天要用的杯子。剩下的两件，你挑地方。',reply:'纸品和杯子各归各位，抽手一拉就找到了。'},
    {title:'靠窗与靠门',mode:'zone',cols:6,rows:5,zones:[{label:'靠窗区',items:['glasses'],cells:region(0,0,6,1)},{label:'靠门区',items:['keys','tin'],cells:region(0,3,6,2)}],items:['glasses','keys','tin','notebook','tape','letter'],letter:'眼镜放最上面那排，一进门就要拿的钥匙和铁盒放下排。其余的先自己安排。',reply:'进门就能摸到钥匙，坐下就能戴上眼镜。'},
    {title:'两本一起留',mode:'zone',cols:7,rows:5,zones:[{label:'读本区',items:['notebook','book'],cells:region(0,0,4,3)},{label:'音乐区',items:['player','tape'],cells:region(4,2,3,3)}],items:['notebook','book','player','tape','camera','keys'],letter:'笔记本和旧书要放在一起，随身听和磁带也归一处。相机的方向，就看你留了多少空。',reply:'要读的和要听的各占一边，中间刚好留出相机的宽度。'}
  ];
  const moreChoice=[
    {title:'只留一个下午',mode:'choice',cols:5,rows:4,items:['mug','book','photo','pencil','letter','keys'],required:['mug'],keepCount:4,letter:'下午只想安安静静坐一会儿。杯子一定要留，另外三件你来定；没选的先留在桌面，不会丢。',reply:'杯子放在手边，其余三件正好陪着这个下午。'},
    {title:'出门前的一分钟',mode:'choice',cols:5,rows:4,items:['keys','glasses','letter','postcard','tape','pencil'],required:['keys','glasses'],keepCount:4,letter:'车快到了。钥匙和眼镜必须带，剩下两件随手挑；挑剩下的，回家再整理。',reply:'钥匙和眼镜搁在最外层，伸手就够得到。'},
    {title:'搬家留三样',mode:'choice',cols:6,rows:5,items:['headphones','player','camera','tin','letter','photo'],required:['headphones'],keepCount:5,letter:'箱子只剩下这一层。耳机一定要带上，另外四件从剩下的里面挑——这次要带的比往常多。',reply:'耳机垫在最下面，上面的四件都稳稳当当。'}
  ];
  const crossLevels=[
    {title:'隔板那边的一格',mode:'cross',cols:6,rows:4,blocked:region(2,0,1,4),zones:[{label:'纸品区',items:['book','photo'],cells:region(3,0,3,4)}],items:['book','photo','tin','tape','keys'],letter:'中间的老隔板不能拆。纸品要放右侧的标记区，其余小东西你自己安排。',reply:'隔板两边都满了，抽屉却一点也不挤。'},
    {title:'上行与下行',mode:'cross',cols:6,rows:5,blocked:region(0,2,6,1),zones:[{label:'软垫区',items:['photo','camera'],cells:region(0,3,6,2)}],items:['photo','camera','glasses','tin','letter'],letter:'抽屉中间横着一道隔板。相片和相机要放进下面的软垫区，上面留给别的。',reply:'相片躺在软垫上，隔板上方也收拾得干干净净。'},
    {title:'右上与左下',mode:'cross',cols:6,rows:5,blocked:[[2,0],[2,1],[2,2]],zones:[{label:'右上区',items:['keys'],cells:region(4,0,2,2)},{label:'左下区',items:['mug'],cells:region(0,3,4,2)}],items:['keys','mug','notebook','tape','glasses','pencil'],letter:'竖隔板偏左。钥匙要留在右上，杯子放在左下，其余的东西自己在空处找位置。',reply:'要用的东西都留在手边，隔板挡住了里侧的杂乱。'},
    {title:'读本区的宽度',mode:'cross',cols:6,rows:6,blocked:[[0,0],[5,0]],zones:[{label:'读本区',items:['notebook','book'],cells:region(1,4,5,2)}],items:['notebook','book','headphones','tin','letter','tape'],letter:'顶上一角磕坏了。笔记本和旧书必须完整放进下边的读本区，耳机请另外找地方。',reply:'读本区正好装满，耳机在上层舒展开了。'},
    {title:'左区与右区',mode:'cross',cols:7,rows:5,blocked:region(3,0,1,5),zones:[{label:'左区',items:['headphones'],cells:region(0,0,3,3)},{label:'右区',items:['camera'],cells:region(4,2,3,3)}],items:['headphones','camera','tin','keys','tape','letter'],letter:'竖隔板贯穿整层。耳机放左上，相机放右中，小件去填剩下的空。',reply:'左边耳机，右边相机，中间那道隔板像一条分界线。'},
    {title:'中段留白',mode:'cross',cols:6,rows:5,blocked:[[1,2],[2,2],[3,2],[4,2]],zones:[{label:'底边区',items:['glasses'],cells:region(0,4,6,1)}],items:['glasses','mug','tin','photo','pencil','letter'],letter:'中间四个格子被木条封住了。眼镜要贴着最下排，其他物品绕着木条放。',reply:'木条留在了原处，眼镜安静地躺在一整排的最后。'},
    {title:'四个角',mode:'cross',cols:7,rows:5,blocked:[[0,0],[6,0],[0,4],[6,4]],zones:[{label:'中央区',items:['camera'],cells:region(2,1,3,2)}],items:['camera','notebook','mug','keys','tape','letter'],letter:'四个角都留着没修。相机要完整落在中央的标记区，其他东西自己找地方。',reply:'四个角空着，中央稳稳地放着一台相机。'},
    {title:'上行与下行两排',mode:'cross',cols:6,rows:6,blocked:[[2,2],[3,2]],zones:[{label:'上行区',items:['letter'],cells:region(0,0,6,1)},{label:'下行区',items:['tape'],cells:region(0,5,6,1)}],items:['letter','tape','headphones','notebook','tin','keys'],letter:'来信要放最上面一排，磁带放最下面一排。中间的木扣请绕开，耳机还在等你安排。',reply:'一封信在最上面，一盘磁带在最下面，中间放着戴了多年的耳机。'}
  ];
  const pickLevels=[
    {title:'信纸要一起',mode:'pick',cols:5,rows:4,zones:[{label:'信纸区',items:['letter','postcard'],cells:region(0,0,5,1)}],items:['letter','postcard','tape','pencil','keys','photo'],required:['letter'],keepCount:4,letter:'来信一定要留，明信片你决定。留下的都要放进最上排的信纸区，其余三件你自己挑。',reply:'信纸整整齐齐排在最上面一排，看一眼就觉得安心。'},
    {title:'顺手的两件',mode:'pick',cols:6,rows:4,zones:[{label:'手边区',items:['mug','glasses'],cells:region(0,2,6,2)}],items:['mug','glasses','book','tin','pencil','letter'],required:['mug','glasses'],keepCount:5,letter:'杯子和眼镜必须留，也都要放在下两排的手边区。剩下三件，从桌面上挑。',reply:'手边区被杯子占去大半，眼镜搁在上方，都够得到。'},
    {title:'软垫上的相片',mode:'pick',cols:6,rows:5,zones:[{label:'相片区',items:['photo','camera'],cells:region(0,0,4,3)}],items:['photo','camera','book','pencil','keys','tin'],required:['photo'],keepCount:4,letter:'相片必留，相机由你决定。只要是相片区里的东西，都得完整放进去。',reply:'相片落在软布上，位置刚好，光也刚好。'},
    {title:'音乐区的高度',mode:'pick',cols:6,rows:6,zones:[{label:'音乐区',items:['headphones','player','tape'],cells:region(0,0,3,6)}],items:['headphones','player','tape','book','letter','glasses'],required:['headphones'],keepCount:4,letter:'耳机一定要留下，随身听和磁带看你要不要。音乐区在左边一整列，装得下它们。',reply:'左边一整列都是声音的，右边的旧书和来信安静地待着。'},
    {title:'纸品的分量',mode:'pick',cols:7,rows:5,zones:[{label:'纸品区',items:['notebook','book','letter','postcard'],cells:region(0,0,4,4)}],items:['notebook','book','pencil','letter','postcard','tape'],required:['notebook'],keepCount:4,letter:'笔记本一定留。所有纸品都归左上那块区域，剩下三件从桌面里挑。',reply:'纸品区压着一角，其余的东西反倒摆得更开阔。'},
    {title:'日常与影像',mode:'pick',cols:6,rows:6,zones:[{label:'日常区',items:['mug','tin'],cells:region(0,0,3,4)},{label:'影像区',items:['photo','camera'],cells:region(3,2,3,4)}],items:['mug','tin','photo','camera','keys','player'],required:['mug','photo'],keepCount:5,letter:'杯子和相片必须留。杯子归日常区，相片归影像区，再挑三件一起带走。',reply:'左边是日子，右边是照片，中间空出一小块地方。'},
    {title:'桌面上的一排',mode:'pick',cols:6,rows:5,zones:[{label:'桌上区',items:['glasses'],cells:region(0,0,6,1)}],items:['glasses','book','letter','pencil','tape','keys'],required:['glasses'],keepCount:5,letter:'眼镜放最上面一排，随时能拿到。另外四件你挑；留下的越多，越要会挤。',reply:'眼镜在最上面，下面几件的边角都对齐了。'}
  ];
  const masterLevels=[
    {title:'隔板与相片',mode:'master',cols:6,rows:5,blocked:[[2,2]],zones:[{label:'相片区',items:['photo'],cells:region(0,0,2,3)}],items:['photo','camera','book','pencil','letter','tin'],required:['photo'],keepCount:5,letter:'中间的木扣要留下。相片必须完整放进左上的标记区，再选四件一起带走。',reply:'一块木扣，一张相片，其余四件都找到了自己的位置。'},
    {title:'两边都要用',mode:'master',cols:6,rows:6,blocked:region(3,0,1,6),zones:[{label:'左手区',items:['mug','glasses'],cells:region(0,3,3,3)},{label:'右手区',items:['keys'],cells:region(4,0,2,3)}],items:['mug','glasses','book','tin','keys','letter'],required:['mug','glasses'],keepCount:5,letter:'一道竖隔板贯穿整层。杯子眼镜去左手区，钥匙留右手区——它们都必须留，再挑三件。',reply:'隔板两侧都不空，每天都用得上的东西一眼就能看到。'},
    {title:'音乐区只够两件',mode:'master',cols:7,rows:5,blocked:[[1,2],[2,2]],zones:[{label:'音乐区',items:['player','tape'],cells:region(4,3,3,2)}],items:['headphones','player','tape','tin','keys','letter'],required:['headphones'],keepCount:4,letter:'耳机必留。随身听和磁带如果留下，就必须并排放进右下的音乐区——那里只够两件。',reply:'耳机占了最大的位置，音乐区正好收下随身听和磁带。'},
    {title:'磕坏的一角',mode:'master',cols:6,rows:6,blocked:[[5,1],[5,4],[0,4],[1,4]],zones:[{label:'读本区',items:['notebook','book'],cells:region(0,0,4,3)}],items:['notebook','book','photo','camera','tape','letter'],required:['notebook'],keepCount:5,letter:'侧边磕了四处。笔记本一定要留，纸品都归左上的读本区，再挑四件。',reply:'缺口留在了两边，读本区里两本书挨得很紧。'},
    {title:'一整排的隔板',mode:'master',cols:7,rows:6,blocked:region(0,3,7,1),zones:[{label:'听音区',items:['player','tape'],cells:region(4,0,3,3)},{label:'饮用区',items:['mug','glasses'],cells:region(0,4,7,2)}],items:['mug','glasses','player','headphones','tape','letter'],required:['mug'],keepCount:4,letter:'中间整整一排都被封住了。杯子必留，也必须在饮用区；随身听和磁带若留下，就去听音区。',reply:'一排隔板把抽屉分成上下两层，上层放声音，下层放日常。'},
    {title:'底部与影像',mode:'master',cols:6,rows:6,blocked:[[1,1],[4,1]],zones:[{label:'影像区',items:['photo','camera'],cells:region(3,2,3,4)}],items:['photo','keys','camera','book','pencil','letter'],required:['photo','keys'],keepCount:5,letter:'相片和店钥匙都必须留。相片与相机归右侧影像区，再挑三件一起带走。',reply:'影像区装下了两台机器，钥匙在最外侧，出门就能拿。'},
    {title:'大件区只放耳机',mode:'master',cols:7,rows:6,blocked:[[3,0],[3,1],[3,4],[3,5]],zones:[{label:'大件区',items:['headphones'],cells:region(0,0,3,3)}],items:['headphones','tin','mug','glasses','tape','postcard'],required:['headphones'],keepCount:5,letter:'竖隔板上下各断了一截。耳机最占地方，一定要完整放进左上那三格。',reply:'耳机把三格填得满满当当，别的东西从缝隙里绕了过去。'},
    {title:'给书留的九格',mode:'master',cols:6,rows:6,blocked:region(2,2,2,2),zones:[{label:'读本区',items:['notebook'],cells:region(0,3,3,3)}],items:['notebook','camera','mug','tin','keys','letter'],required:['notebook','camera'],keepCount:5,letter:'中间四格封住了。笔记本和相机都必须留，笔记本要完整放进左下的读本区。',reply:'笔记本立在九格里，相机靠着它的边上，中间那块空缺反而让人喘了口气。'}
  ];
  function anchorMap(level){const map={};for(const a of level.anchors||[])map[a.id]={x:a.x,y:a.y,rot:((a.rot||0)%4+4)%4};return map;}
  function anchorNames(l){return (l.anchors||[]).map(a=>items[a.id].name).join('、');}
  function levelRule(l){
    const parts=[];
    if(l.keepCount)parts.push(`从 ${l.items.length} 件中选留 ${l.keepCount} 件；必留：${(l.required||[]).map(id=>items[id].name).join('、')}。`);
    else parts.push('把全部物品放入。');
    if(l.anchors&&l.anchors.length)parts.push(`委托人已经放好了 ${l.anchors.length} 件（不可移动）：${anchorNames(l)}。`);
    if(l.zones&&l.zones.length)parts.push('指定物品须完整位于同名标记区。');
    if(l.fixedRot&&l.fixedRot.length)parts.push(`${l.fixedRot.map(id=>items[id].name).join('、')} 只能按原方向摆放，不能转着放。`);
    if(l.blocked&&l.blocked.length)parts.push('木色斜纹格不可占用。');
    if(l.dense)parts.push('这一层要恰好放满，一格都不能空。');
    else if(!l.keepCount)parts.push('可以留空，不必填满。');
    return parts.join('');
  }
  function freeCells(level){return level.cols*level.rows-(level.blocked||[]).length;}
  function cellCount(level,placed){let n=0;for(const[id]of Object.entries(placed||{}))if(items[id])n+=items[id].cells.length;return n;}
  const fused=[...moreBlocked,...moreZone,...moreChoice,...crossLevels,...pickLevels,...masterLevels];
  fused.forEach((l,i)=>levels.push({...l,id:`drawer-${i+19}`,chapter:`${modeNames[l.mode]} · 栖湾的新委托`,from:l.keepCount?'准备出门的旅人':l.zones?.length?'整理所的老朋友':'陈师傅',surface:i%2?'green':'wood',reward:`收藏：${l.title}`,rule:levelRule(l)}));
  // ---- 第二辑：第 51–100 关 ----
  // 第一辑走到第 50 关时，体量其实已经撞到天花板：物品栏最多 10 件、盘面最多 9×8，
  // 再堆件数只会让「一点提示」的求解退化成超时。所以第二辑不靠加体量，
  // 而是靠「形状别扭度 + 条件叠加（隔板／分区／取舍同时出现）」继续加难度，
  // 并按四季轮转重配叙述：同一章节里的 7 关会依次走过春→冬，翻开委托簿能看出时间在走。
  const batch2=[
    {season:'春 · 回南天',title:'窗台上的那一层灰',mode:'classic',cols:6,rows:5,items:['book','glasses','mug','letter','pencil','tape'],from:'阿禾',letter:'回南天一来，什么都是潮的。书本、眼镜、杯子，还有几支笔——先帮我把窗台这一层收拾出来吧。',reply:'“擦干净了。原来玻璃后面还留着去年的一张便签。”'},
    {season:'春 · 回南天',title:'四角的霉斑',mode:'blocked',cols:6,rows:5,blocked:[[0,0],[5,0],[0,4],[5,4]],items:['notebook','tin','keys','tape','letter','postcard'],from:'老周',letter:'箱底四角都起了霉，得空着晾一晾。剩下的地方，把这几件放进去就好。',reply:'“四角空着通风，东西反倒摆得比上次整齐。”'},
    {season:'春 · 回南天',title:'晾在窗边的相纸',mode:'zone',cols:6,rows:5,zones:[{label:'相纸区',items:['photo','postcard'],cells:region(0,0,3,3)}],items:['photo','postcard','camera','letter','pencil','keys'],from:'小杜',letter:'洗出来的相纸受了潮，得摊在透气的左上方。相机和零碎小件，你自己找地方。',reply:'“相纸摊开了，边角也慢慢平回去。”'},
    {season:'春 · 回南天',title:'只留一箱',mode:'choice',cols:5,rows:4,items:['mug','book','photo','pencil','letter','keys'],required:['mug'],keepCount:4,from:'苏老师',letter:'潮天里箱子只能留一箱。杯子我一定要留着，另外三件你替我挑。',reply:'“杯子放在最外层，剩下三件也都有了去处。”'},
    {season:'春 · 回南天',title:'潮气最重的角落',mode:'cross',cols:6,rows:5,blocked:[[2,2],[3,2]],zones:[{label:'干燥区',items:['photo'],cells:region(0,3,6,2)}],items:['photo','tin','glasses','tape','letter','keys'],from:'陈师傅',letter:'抽屉中间两块木扣是拆不掉的。最下面两排我垫了干燥纸，老相片就放那儿。',reply:'“相片躺在一整排干燥纸上，这回不会再卷边了。”'},
    {season:'春 · 回南天',title:'春天要回的那封信',mode:'pick',cols:6,rows:5,zones:[{label:'信纸区',items:['letter','postcard'],cells:region(0,0,6,1)}],items:['letter','postcard','tape','pencil','keys','photo'],required:['letter'],keepCount:5,from:'小林',letter:'要回的信必须留，明信片你看着办。留下来的纸品都放最上面那一排。',reply:'“信纸一字排开，回信这件事终于有了开头。”'},
    {season:'春 · 回南天',title:'檐下的木箱',mode:'master',cols:6,rows:6,blocked:[[2,2],[3,2]],zones:[{label:'木箱区',items:['tin'],cells:region(0,0,2,3)}],items:['tin','mug','book','letter','keys','tape'],required:['tin'],keepCount:5,from:'阿菊',letter:'屋檐下接雨的那只木箱，就放在左上角这个位置。铁盒必留，再挑四件一起收。',reply:'“木箱归位，另外四件也都找到了边角。”'},
    {season:'春 · 落雨不停',title:'晒不到被子的下午',mode:'classic',cols:6,rows:5,items:['headphones','player','tape','letter','pencil','glasses'],from:'阿柚',letter:'连着下了半个月的雨，被子晒不成，那就听歌吧。这几件帮我放好。',reply:'“歌听完了，雨还没停。但抽屉整整齐齐的。”'},
    {season:'春 · 落雨不停',title:'墙根的三颗钉',mode:'blocked',cols:6,rows:5,blocked:[[1,2],[2,2],[3,2]],items:['camera','photo','book','tin','keys','letter'],from:'郑师傅',letter:'墙面返潮，我打了三颗钉子挂着吹。中间那格没法用，东西绕着放。',reply:'“三颗钉子占着中间，边上反倒腾出了完整的两块。”'},
    {season:'春 · 落雨不停',title:'一抽屉的春天',mode:'zone',cols:6,rows:5,zones:[{label:'饮品区',items:['mug'],cells:region(3,0,3,3)}],items:['mug','glasses','notebook','tin','tape','letter'],from:'阿满',letter:'杯子要放在右上那几格，一伸手就够到。剩下的，随便你先放哪件。',reply:'“杯子立在右上的格子里，旁边空出的地方正好放眼镜。”'},
    {season:'春 · 落雨不停',title:'换季的箱子',mode:'choice',cols:6,rows:5,items:['photo','camera','book','pencil','letter','keys'],required:['photo'],keepCount:5,from:'黎姐',letter:'换季了，这次能带五件。相片一定要带，其余四件你挑。',reply:'“相片压在最下面，上面四件都稳稳的。”'},
    {season:'春 · 落雨不停',title:'南风穿过的那道缝',mode:'cross',cols:6,rows:5,blocked:region(2,0,1,5),zones:[{label:'读本区',items:['notebook','book'],cells:region(3,0,3,5)}],items:['notebook','book','tin','tape','keys','letter'],from:'阿禾',letter:'右边那道竖缝是通风用的，拆不了。纸品要完整放进右边的读本区。',reply:'“风从缝里过，书在右边站得笔直。”'},
    {season:'春 · 落雨不停',title:'春天剩下的三件',mode:'pick',cols:6,rows:5,zones:[{label:'手边区',items:['mug','glasses'],cells:region(0,3,6,2)}],items:['mug','glasses','book','tin','pencil','letter'],required:['mug','glasses'],keepCount:5,from:'陈师傅',letter:'杯子和眼镜都得留，也都要放进下两排。剩下三件从桌面上挑。',reply:'“手边区收下了两件常用的，其余三件在上层排开。”'},
    {season:'春 · 落雨不停',title:'中间那根木条',mode:'master',cols:7,rows:5,blocked:[[2,2],[3,2],[4,2]],zones:[{label:'相片区',items:['photo'],cells:region(0,0,2,3)}],items:['photo','camera','book','pencil','letter','tin'],required:['photo'],keepCount:5,from:'小杜',letter:'中间横着一根木条。相片必留，也必须完整放进左上那两格。',reply:'“木条留在了原处，相片在左上安静地待着。”'},
    {season:'夏 · 蝉声',title:'阁楼里的蝉声',mode:'classic',cols:7,rows:5,items:['headphones','player','tape','book','photo','letter'],from:'阿满',letter:'暑假躲进阁楼，蝉叫得震天响。耳机、随身听、磁带，还有几本闲书，一起收吧。',reply:'“蝉声隔着屋顶，耳机里放着别的夏天。”'},
    {season:'夏 · 蝉声',title:'天窗下的横梁',mode:'blocked',cols:6,rows:5,blocked:region(0,2,5,1),items:['notebook','tin','photo','tape','letter','keys'],from:'老周',letter:'天窗下面横着一道梁，拆不掉。上下两格都得用上，看看大件能不能横过来。',reply:'“一横一竖，全绕开了那道梁。”'},
    {season:'夏 · 蝉声',title:'纳凉的角落',mode:'zone',cols:6,rows:5,zones:[{label:'纳凉区',items:['glasses'],cells:region(0,0,6,1)}],items:['glasses','keys','tin','book','tape','letter'],from:'阿菊',letter:'眼镜放最上面一排，进门摘下来顺手一搁。其余的自己安排。',reply:'“眼镜在最上排，一进门就能摸到。”'},
    {season:'夏 · 蝉声',title:'暑假只带四件',mode:'choice',cols:5,rows:4,items:['keys','glasses','letter','postcard','tape','pencil'],required:['keys','glasses'],keepCount:4,from:'阿满',letter:'出门只背一个小包。钥匙和眼镜必须带，剩下两件随手挑。',reply:'“钥匙和眼镜搁在最外层，伸手就够得到。”'},
    {season:'夏 · 蝉声',title:'斜过来的一道光',mode:'cross',cols:7,rows:5,blocked:region(3,0,1,4),zones:[{label:'影像区',items:['camera'],cells:region(4,1,3,3)}],items:['camera','photo','tin','keys','tape','letter'],from:'小杜',letter:'右边那道竖隔板偏着放，两边宽窄不一样。相机放右中的标记区。',reply:'“光从隔板边漏进来，正好落在相机上。”'},
    {season:'夏 · 蝉声',title:'夏天要读的',mode:'pick',cols:6,rows:6,zones:[{label:'读本区',items:['notebook','book'],cells:region(0,0,4,3)}],items:['notebook','book','pencil','letter','tape','keys'],required:['notebook'],keepCount:4,from:'黎姐',letter:'笔记本一定要留。所有纸品都归左上那块区域，另外三件你挑。',reply:'“读本区装了两个本子，剩下三件在上层等着。”'},
    {season:'夏 · 蝉声',title:'两格的影棚',mode:'master',cols:6,rows:6,blocked:[[2,2],[3,2]],zones:[{label:'影像区',items:['photo','camera'],cells:region(2,2,4,4)}],items:['photo','camera','book','pencil','keys','letter'],required:['photo','camera'],keepCount:5,from:'郑师傅',letter:'中间两块木扣留着。相片和相机都必须留，也都要落进右下那一块。',reply:'“那块地方装下了两台机器，位置刚刚好。”'},
    {season:'夏 · 长昼',title:'午睡的那段时间',mode:'classic',cols:6,rows:5,items:['mug','book','photo','pencil','letter','keys'],from:'苏老师',letter:'下午太长了。杯子、旧书、一张相片，随便放，看着舒服就行。',reply:'“睡醒的时候，东西都还在原来的位置。”'},
    {season:'夏 · 长昼',title:'晾衣绳与木扣',mode:'blocked',cols:6,rows:5,blocked:[[0,0],[5,0],[0,4],[5,4],[2,2]],items:['camera','mug','glasses','pencil','postcard','letter'],from:'阿柚',letter:'四角都挂着晾衣绳的钩子，中间还有一颗木扣。绕开这五处。',reply:'“五个位置都空着，剩下的地方反而更松快。”'},
    {season:'夏 · 长昼',title:'两处都要用',mode:'zone',cols:6,rows:5,zones:[{label:'纸品区',items:['photo','letter'],cells:region(0,0,3,4)},{label:'饮品区',items:['mug'],cells:region(3,0,3,4)}],items:['mug','photo','letter','tape','keys','tin'],from:'陈师傅',letter:'左边放纸品，右边放杯子。两处都不能空着。',reply:'“一左一右，抽屉看上去像被分成两个小间。”'},
    {season:'夏 · 长昼',title:'出门前的两分钟',mode:'choice',cols:5,rows:4,items:['keys','glasses','letter','postcard','tape','pencil'],required:['keys'],keepCount:4,from:'小林',letter:'车快到了。钥匙必须带，另外三件来不及细想，你替我定。',reply:'“钥匙搁在最外层，其余三件也塞得整整齐齐。”'},
    {season:'夏 · 长昼',title:'上下都要留空',mode:'cross',cols:6,rows:6,blocked:[[2,2],[3,2]],zones:[{label:'上行区',items:['letter'],cells:region(0,0,6,1)},{label:'下行区',items:['tape'],cells:region(0,5,6,1)}],items:['letter','tape','headphones','notebook','tin','keys'],from:'阿禾',letter:'来信要放最上面一排，磁带放最下面一排。中间的木扣请绕开。',reply:'“一封信在最上面，一盘磁带在最下面。”'},
    {season:'夏 · 长昼',title:'夏天的三件',mode:'pick',cols:6,rows:6,zones:[{label:'音乐区',items:['headphones','player','tape'],cells:region(0,0,3,6)}],items:['headphones','player','tape','book','letter','glasses'],required:['headphones'],keepCount:4,from:'阿满',letter:'耳机必留，随身听和磁带看你要不要。音乐区在左边一整列。',reply:'“左边一整列都是声音的。”'},
    {season:'夏 · 长昼',title:'一整列的声音',mode:'master',cols:6,rows:6,blocked:[[3,3],[3,4]],zones:[{label:'听音区',items:['player','tape'],cells:region(4,0,2,3)}],items:['headphones','player','tape','tin','keys','letter'],required:['headphones'],keepCount:4,from:'小杜',letter:'耳机必留。随身听和磁带如果留下，就得放进右上的听音区。',reply:'“听音区收下了两件，耳机占了最大的位置。”'},
    {season:'秋 · 搬家季',title:'搬家季的第一箱',mode:'classic',cols:6,rows:5,items:['notebook','book','camera','tin','keys','letter'],from:'黎姐',letter:'巷子里好几户都在搬家。这是第一箱，先放这些，别急着装满。',reply:'“第一箱合上了。外面的纸箱还堆着，慢慢来。”'},
    {season:'秋 · 搬家季',title:'四角还没补',mode:'blocked',cols:7,rows:5,blocked:[[0,0],[6,0],[0,4],[6,4]],items:['camera','notebook','mug','keys','tape','letter'],from:'老周',letter:'箱子四角磕坏了，等木胶干。先把相机和杯子放稳。',reply:'“四角空着，中间的区域反倒更完整。”'},
    {season:'秋 · 搬家季',title:'纸箱里的两摞',mode:'zone',cols:6,rows:5,zones:[{label:'纸品区',items:['book','letter'],cells:region(0,0,3,3)},{label:'饮品区',items:['mug'],cells:region(3,2,3,3)}],items:['notebook','book','mug','tape','keys','letter'],from:'阿菊',letter:'左边三格留给纸品，右下留给每天要用的杯子。',reply:'“两摞纸和一只杯子，各占一处。”'},
    {season:'秋 · 搬家季',title:'秋天带走五件',mode:'choice',cols:6,rows:5,items:['headphones','player','camera','tin','letter','photo'],required:['headphones'],keepCount:5,from:'苏老师',letter:'这次箱子大一点，能带五件。耳机一定要带，其余四件你决定。',reply:'“耳机垫在最下面，上面四件稳稳当当。”'},
    {season:'秋 · 搬家季',title:'落叶堆满的一角',mode:'cross',cols:7,rows:5,blocked:[[1,1],[2,1],[4,1],[5,1]],zones:[{label:'中央区',items:['camera'],cells:region(2,2,3,2)}],items:['camera','notebook','mug','keys','tape','postcard'],from:'郑师傅',letter:'上层四个位置堆着落叶，暂时不能用。相机要完整落在中央标记区。',reply:'“落叶留在原处，相机稳稳落在正中。”'},
    {season:'秋 · 搬家季',title:'秋天要寄的',mode:'pick',cols:6,rows:5,zones:[{label:'信纸区',items:['letter','postcard'],cells:region(0,0,6,1)}],items:['letter','postcard','tape','pencil','keys','photo'],required:['letter','postcard'],keepCount:5,from:'阿柚',letter:'信和明信片都得留，也都要放进最上排的信纸区。',reply:'“信纸整整齐齐排在最上面，看一眼就安心。”'},
    {season:'秋 · 搬家季',title:'两层之间的缝',mode:'master',cols:7,rows:6,blocked:region(0,2,7,1),zones:[{label:'上层区',items:['camera'],cells:region(0,0,3,3)},{label:'下层区',items:['notebook'],cells:region(4,3,3,3)}],items:['camera','notebook','mug','tin','keys','letter'],required:['camera','notebook'],keepCount:5,from:'阿禾',letter:'中间整整一排都封着。相机放上层左边，笔记本放下层右边，两件都必须留。',reply:'“隔板上下各归一处，中间那道缝反倒成了分界。”'},
    {season:'秋 · 起风',title:'翻出来的旧信',mode:'classic',cols:6,rows:5,items:['letter','postcard','notebook','pencil','keys','tape'],from:'阿菊',letter:'风大，窗子关不严，吹出来一叠旧信。先把它们收好。',reply:'“信都压住了，风再大也不怕。”'},
    {season:'秋 · 起风',title:'竖着的一道缝',mode:'blocked',cols:6,rows:6,blocked:region(2,0,1,5),items:['headphones','camera','tin','keys','tape','letter'],from:'郑师傅',letter:'竖隔板从上到下都在，两边都要用。耳机最占地方，先想好放哪侧。',reply:'“隔板把抽屉分成两半，两边都刚刚好。”'},
    {season:'秋 · 起风',title:'桌上的两处',mode:'zone',cols:6,rows:5,zones:[{label:'靠窗区',items:['glasses'],cells:region(0,0,6,1)},{label:'靠门区',items:['keys','tin'],cells:region(0,3,6,2)}],items:['glasses','keys','tin','notebook','tape','letter'],from:'老周',letter:'眼镜放最上面那排，钥匙和铁盒放下排。余下的自己安排。',reply:'“进门就能摸到钥匙，坐下就能戴上眼镜。”'},
    {season:'秋 · 起风',title:'只留一摞纸',mode:'choice',cols:5,rows:4,items:['notebook','book','pencil','letter','postcard','photo'],required:['notebook'],keepCount:4,from:'黎姐',letter:'这次只想留纸品。笔记本一定要留，另外三件你挑。',reply:'“本子压在最下面，上面几件都是薄的。”'},
    {season:'秋 · 起风',title:'中间留一行',mode:'cross',cols:6,rows:6,blocked:[[1,2],[2,2],[3,2],[4,2]],zones:[{label:'底边区',items:['glasses'],cells:region(0,5,6,1)}],items:['glasses','mug','tin','photo','pencil','letter'],from:'苏老师',letter:'中间四个格子封住了。眼镜要贴着最下排，其他东西绕着走。',reply:'“眼镜安静地躺在一整排的最后。”'},
    {season:'秋 · 起风',title:'秋天最后三件',mode:'pick',cols:6,rows:6,zones:[{label:'影像区',items:['photo','camera'],cells:region(2,2,4,4)}],items:['photo','camera','book','pencil','keys','tin'],required:['photo'],keepCount:4,from:'小杜',letter:'相片必留，相机你决定。只要是影像区里的东西，都得完整放进去。',reply:'“影像区收下了要收的，剩下的三件也各就各位。”'},
    {season:'秋 · 起风',title:'顶上一层停用',mode:'master',cols:7,rows:6,blocked:region(0,0,7,1),zones:[{label:'读本区',items:['notebook','book'],cells:region(0,2,4,3)},{label:'听音区',items:['player'],cells:region(4,2,3,3)}],items:['notebook','book','player','tape','tin','letter'],required:['notebook'],keepCount:5,from:'阿满',letter:'最上面一排漏雨，先空着。笔记本必留，纸品归左边的读本区。',reply:'“顶上一层空着，下面两处各自安顿好了。”'},
    {season:'冬 · 收店前',title:'收店前的最后一箱',mode:'classic',cols:7,rows:6,items:['headphones','camera','notebook','mug','letter','keys'],from:'姨婆的老朋友',letter:'整理所也要歇一阵。这是收店前最后一箱，把大件先放进去。',reply:'“箱子合上了。门口那块牌子，明天再摘。”'},
    {season:'冬 · 收店前',title:'拆下来的旧板',mode:'blocked',cols:6,rows:6,blocked:[[0,0],[5,0],[0,5],[5,5]],items:['notebook','tin','photo','tape','letter','postcard'],from:'陈师傅',letter:'旧隔板拆下来了，四角留着榫眼。绕开它们，中间那片够用。',reply:'“榫眼还空着，中间却整整齐齐。”'},
    {season:'冬 · 收店前',title:'炉边的两处',mode:'zone',cols:6,rows:6,zones:[{label:'暖手区',items:['mug','glasses'],cells:region(0,4,6,2)},{label:'读本区',items:['notebook','book'],cells:region(2,0,4,3)}],items:['mug','glasses','notebook','book','tin','keys'],from:'阿菊',letter:'杯子眼镜放下两排，取暖的时候顺手。纸品放在中间偏上的读本区。',reply:'“炉边一伸手就是杯子，另一头是本子。”'},
    {season:'冬 · 收店前',title:'冬天只留五件',mode:'choice',cols:6,rows:5,items:['mug','book','photo','pencil','letter','keys'],required:['mug','keys'],keepCount:5,from:'苏老师',letter:'冬天东西少，只留五件。杯子和钥匙都要，其余三件你定。',reply:'“杯子和钥匙在外侧，三件薄的填在里面。”'},
    {season:'冬 · 收店前',title:'关店前的四角',mode:'cross',cols:7,rows:6,blocked:[[0,0],[6,0],[0,5],[6,5]],zones:[{label:'中央区',items:['camera'],cells:region(2,2,3,2)}],items:['camera','notebook','mug','keys','tape','letter'],from:'郑师傅',letter:'四个角都松了，得空着。相机放中央那块标记区。',reply:'“四个角空着，正中稳稳放着一台相机。”'},
    {season:'冬 · 收店前',title:'冬天要写的',mode:'pick',cols:6,rows:6,zones:[{label:'纸品区',items:['notebook','book','letter','postcard'],cells:region(0,0,4,4)}],items:['notebook','book','pencil','letter','postcard','tape'],required:['notebook'],keepCount:4,from:'黎姐',letter:'笔记本必留。所有纸品都归左上那块，剩下三件从桌面里挑。',reply:'“纸品区压着一角，其余东西反倒摆得更开阔。”'},
    {season:'冬 · 收店前',title:'最后一只抽屉',mode:'master',cols:7,rows:6,blocked:[[3,0],[3,1],[3,4],[3,5]],zones:[{label:'大件区',items:['headphones'],cells:region(0,0,3,3)}],items:['headphones','tin','mug','glasses','tape','postcard'],required:['headphones'],keepCount:5,from:'阿禾',letter:'竖隔板上下各断了一截。耳机最占地方，一定要完整放进左上那三格。',reply:'“耳机把三格填满，别的东西从缝隙里绕过去。”'},
    {season:'冬 · 最后一箱',title:'给下一年留一格',mode:'classic',cols:7,rows:6,items:['headphones','camera','notebook','mug','postcard','ruler'],from:'给明年的自己',letter:'最后一份委托，留给你自己。放什么都可以——记得留一格空的。',reply:'“抽屉合上之前，你留了一格。明年打开时，它还在。”'}
  ];
  batch2.forEach((l,i)=>levels.push({...l,id:`drawer-${i+51}`,chapter:`${modeNames[l.mode]} · 第二辑 · ${l.season}`,surface:i%2?'green':'wood',reward:`收藏：${l.title}`,rule:levelRule(l)}));
  function goalCount(level){return level.keepCount||level.items.length;}
  function isComplete(level,placed){
    if(Object.keys(placed).length!==goalCount(level))return false;
    if(!(level.required||level.items).every(id=>!!placed[id]))return false;
    // 「恰好放满」类委托：件数对了还不算，空格必须为零。
    if(level.dense&&cellCount(level,placed)!==freeCells(level))return false;
    return true;
  }
  function shape(id,rot=0){let c=items[id].cells.map(p=>p.slice());for(let i=0;i<((rot%4)+4)%4;i++){const h=Math.max(...c.map(p=>p[1]))+1;c=c.map(([x,y])=>[h-1-y,x]);}return c;}
  function bounds(cells){return {w:Math.max(...cells.map(p=>p[0]))+1,h:Math.max(...cells.map(p=>p[1]))+1};}
  function placementError(level,placed,id,x,y,rot){
    if(!level.items.includes(id)||!items[id]||!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(rot))return 'invalid';
    if(!placed[id]&&Object.keys(placed).length>=goalCount(level))return 'quota';
    if(level.fixedRot&&level.fixedRot.includes(id)&&((rot%4)+4)%4!==0)return 'norot';
    const cells=shape(id,rot).map(([dx,dy])=>[x+dx,y+dy]);
    if(cells.some(([cx,cy])=>cx<0||cy<0||cx>=level.cols||cy>=level.rows))return 'bounds';
    const blocked=new Set((level.blocked||[]).map(p=>p.join(',')));
    if(cells.some(p=>blocked.has(p.join(','))))return 'blocked';
    for(const zone of level.zones||[]){if(!zone.items.includes(id))continue;const allowed=new Set(zone.cells.map(p=>p.join(',')));if(cells.some(p=>!allowed.has(p.join(','))))return 'zone';}
    const used=new Set();for(const[key,p]of Object.entries(placed)){if(key!==id)for(const[cx,cy]of shape(key,p.rot))used.add(`${p.x+cx},${p.y+cy}`);}
    if(cells.some(p=>used.has(p.join(','))))return 'overlap';
    return null;
  }
  function canPlace(level,placed,id,x,y,rot){return placementError(level,placed,id,x,y,rot)===null;}
  function validState(level,placed){if(!placed||typeof placed!=='object'||Array.isArray(placed))return false;const acc={};for(const[id,p]of Object.entries(placed)){if(!p||!canPlace(level,acc,id,p.x,p.y,p.rot))return false;acc[id]=p;}return true;}
  function solveAll(level,fixed={},limit=100000){
    fixed={...anchorMap(level),...fixed};
    if(!validState(level,fixed))return {status:'invalid',solution:null,nodes:0};
    let nodes=0,cutoff=false;const bit=(x,y)=>1n<<BigInt(y*level.cols+x);let initial=0n;
    for(const[id,p]of Object.entries(fixed))for(const[dx,dy]of shape(id,p.rot))initial|=bit(p.x+dx,p.y+dy);
    const options={};for(const id of level.items.filter(id=>!fixed[id])){const seen=new Set();options[id]=[];for(let rot=0;rot<4;rot++){const cells=shape(id,rot),key=cells.map(p=>p.join(',')).sort().join(';');if(seen.has(key))continue;seen.add(key);const {w,h}=bounds(cells);for(let y=0;y<=level.rows-h;y++)for(let x=0;x<=level.cols-w;x++){if(!canPlace(level,{},id,x,y,rot))continue;let mask=0n;for(const[dx,dy]of cells)mask|=bit(x+dx,y+dy);options[id].push({x,y,rot,mask});}}}
    const memo=new Set();function search(ids,mask,result){if(!ids.length)return result;if(++nodes>limit){cutoff=true;return null;}const key=ids.join(',')+':'+mask;if(memo.has(key))return null;let best=null,candidates=null;for(const id of ids){const legal=options[id].filter(p=>(p.mask&mask)===0n);if(!legal.length){memo.add(key);return null;}if(!candidates||legal.length<candidates.length){best=id;candidates=legal;}}for(const p of candidates){const r=search(ids.filter(id=>id!==best),mask|p.mask,{...result,[best]:{x:p.x,y:p.y,rot:p.rot}});if(r)return r;if(cutoff)return null;}memo.add(key);return null;}
    const solution=search(Object.keys(options),initial,JSON.parse(JSON.stringify(fixed)));return {status:solution?'solved':cutoff?'limit':'unsolvable',solution,nodes};
  }
  function solve(level,fixed={},limit=100000){
    fixed={...anchorMap(level),...fixed};
    if(!validState(level,fixed))return {status:'invalid',solution:null,nodes:0};
    if(!level.keepCount)return solveAll(level,fixed,limit);
    const mandatory=[...new Set([...(level.required||[]),...Object.keys(fixed)])],slots=goalCount(level)-mandatory.length;
    if(slots<0)return {status:'unsolvable',solution:null,nodes:0};
    const optional=level.items.filter(id=>!mandatory.includes(id)),sets=[];
    function choose(start,ids){if(ids.length===slots){sets.push([...mandatory,...ids]);return;}for(let i=start;i<optional.length;i++)choose(i+1,[...ids,optional[i]]);}
    choose(0,[]);let nodes=0;
    for(const ids of sets){const r=solveAll({...level,items:ids},fixed,Math.max(0,limit-nodes));nodes+=r.nodes;if(r.solution)return {...r,nodes};if(r.status==='limit')return {...r,nodes};}
    return {status:'unsolvable',solution:null,nodes};
  }
  // 难度增强表：为后期委托追加旧物、放大抽屉、加固定件与「恰好放满」要求。
  // 由 tools/harden.cjs 生成，每一关都跑过求解器校验（可解 + 节点数余量）。改表后必须重跑校验。
  const HARDEN={
    'drawer-5':{cols:7,rows:4,add:['tape']},
    'drawer-6':{cols:7,rows:5,add:['tape']},
    'drawer-7':{cols:6,rows:5,add:['keys','lamp']},
    'drawer-8':{cols:6,rows:6,add:['lamp','shoes']},
    'drawer-9':{cols:7,rows:4,add:['tape','keys'],dense:true},
    'drawer-10':{cols:7,rows:5,add:['lamp']},
    'drawer-11':{cols:5,rows:5,add:['tape','postcard']},
    'drawer-12':{cols:6,rows:5,add:['tape','lamp']},
    'drawer-13':{add:['mug'],dense:true},
    'drawer-14':{add:['tape']},
    'drawer-15':{add:['headphones','shoes']},
    'drawer-16':{add:['notebook','cane']},
    'drawer-17':{add:['camera','lamp']},
    'drawer-18':{add:['tin','mug']},
    'drawer-19':{cols:7,rows:5,add:['pencil','postcard']},
    'drawer-20':{cols:7,rows:5,add:['tape','keys']},
    'drawer-21':{cols:8,rows:5,add:['pencil','lamp'],fixedRot:['lamp']},
    'drawer-22':{cols:7,rows:4,add:['pencil','glasses','postcard']},
    'drawer-23':{add:['postcard','lamp']},
    'drawer-24':{add:['pencil','letter']},
    'drawer-25':{add:['headphones','shoes']},
    'drawer-26':{add:['mug','cane']},
    'drawer-27':{add:['notebook','lamp']},
    'drawer-28':{cols:7,rows:5,add:['pencil','letter','glasses','postcard']},
    'drawer-29':{cols:7,rows:6,add:['tape','pencil','keys','lamp']},
    'drawer-30':{cols:6,rows:6,add:['letter','postcard','lamp']},
    'drawer-31':{cols:7,rows:6,add:['pencil','keys','lamp']},
    'drawer-32':{cols:7,rows:6,add:['pencil','glasses','postcard']},
    'drawer-33':{cols:7,rows:5,add:['notebook','tape','postcard'],dense:true},
    'drawer-34':{cols:8,rows:5,add:['pencil','glasses','postcard']},
    'drawer-35':{cols:7,rows:6,add:['pencil','lamp','shoes']},
    'drawer-36':{add:['mug','headphones','cane']},
    'drawer-37':{add:['notebook','keys','camera']},
    'drawer-38':{add:['player','lamp','shoes']},
    'drawer-39':{add:['tin','mug','cane']},
    'drawer-40':{add:['keys','camera','headphones']},
    'drawer-41':{add:['notebook','lamp','shoes']},
    'drawer-42':{add:['tin','mug','cane']},
    'drawer-43':{add:['keys','player','headphones'],anchors:[{id:'camera',x:3,y:2,rot:0}]},
    'drawer-44':{add:['notebook','lamp','shoes'],anchors:[{id:'mug',x:0,y:4,rot:0}]},
    'drawer-45':{add:['camera','mug','cane'],anchors:[{id:'headphones',x:3,y:0,rot:0}]},
    'drawer-46':{add:['tin','keys','headphones'],anchors:[{id:'notebook',x:2,y:0,rot:0}]},
    'drawer-47':{add:['notebook','lamp','shoes'],anchors:[{id:'headphones',x:0,y:0,rot:0}]},
    'drawer-48':{add:['mug','player','cane'],anchors:[{id:'camera',x:3,y:4,rot:0}]},
    'drawer-49':{add:['photo','keys','camera'],anchors:[{id:'headphones',x:0,y:0,rot:0}]},
    'drawer-50':{add:['headphones','lamp','shoes'],anchors:[{id:'notebook',x:0,y:3,rot:0}]},
    'drawer-51':{add:['tin','headphones'],dense:true},
    'drawer-52':{cols:7,rows:5,add:['lamp','shoes']},
    'drawer-53':{add:['tape','lamp']},
    'drawer-54':{add:['notebook','cane']},
    'drawer-55':{add:['postcard','lamp'],fixedRot:['lamp']},
    'drawer-56':{add:['mug','headphones']},
    'drawer-57':{add:['camera','shoes'],anchors:[{id:'mug',x:0,y:2,rot:0}]},
    'drawer-58':{add:['keys','postcard']},
    'drawer-59':{add:['tape','postcard'],dense:true},
    'drawer-60':{add:['keys','postcard']},
    'drawer-61':{add:['mug','headphones']},
    'drawer-62':{cols:7,rows:5,add:['pencil','postcard']},
    'drawer-63':{add:['lamp','shoes']},
    'drawer-64':{add:['notebook','cane'],anchors:[{id:'camera',x:2,y:0,rot:0}]},
    'drawer-65':{add:['keys','lamp']},
    'drawer-66':{cols:7,rows:5,add:['pencil','postcard']},
    'drawer-67':{add:['lamp','shoes']},
    'drawer-68':{add:['mug','headphones']},
    'drawer-69':{add:['postcard','lamp']},
    'drawer-70':{add:['camera','cane']},
    'drawer-71':{add:['notebook','shoes'],anchors:[{id:'camera',x:2,y:4,rot:0}]},
    'drawer-72':{add:['tape','glasses']},
    'drawer-73':{cols:7,rows:5,add:['notebook','keys'],dense:true},
    'drawer-74':{add:['postcard','lamp']},
    'drawer-75':{add:['mug','headphones']},
    'drawer-76':{cols:7,rows:6,add:['pencil','lamp','shoes']},
    'drawer-77':{add:['notebook','keys','cane']},
    'drawer-78':{add:['photo','camera','mug'],anchors:[{id:'headphones',x:0,y:2,rot:0}]},
    'drawer-79':{cols:6,rows:6,add:['tape','pencil','postcard']},
    'drawer-80':{cols:8,rows:5,add:['pencil','glasses','postcard']},
    'drawer-81':{cols:7,rows:5,add:['pencil','glasses','postcard']},
    'drawer-82':{add:['mug','lamp','shoes']},
    'drawer-83':{cols:8,rows:5,add:['pencil','letter','glasses']},
    'drawer-84':{add:['notebook','headphones','cane']},
    'drawer-85':{add:['photo','lamp','shoes'],anchors:[{id:'camera',x:0,y:0,rot:0}]},
    'drawer-86':{cols:7,rows:5,add:['lamp','shoes','cane']},
    'drawer-87':{cols:7,rows:6,add:['notebook','pencil','photo'],dense:true},
    'drawer-88':{cols:7,rows:5,add:['postcard','lamp','shoes']},
    'drawer-89':{add:['mug','headphones','cane']},
    'drawer-90':{add:['tape','keys','postcard']},
    'drawer-91':{add:['notebook','lamp','shoes']},
    'drawer-92':{add:['mug','headphones','cane'],anchors:[{id:'notebook',x:2,y:2,rot:0}]},
    'drawer-93':{add:['tape','postcard','lamp']},
    'drawer-94':{add:['pencil','keys','glasses']},
    'drawer-95':{add:['tape','letter','postcard']},
    'drawer-96':{add:['headphones','lamp','shoes']},
    'drawer-97':{add:['pencil','postcard','lamp'],fixedRot:['lamp']},
    'drawer-98':{add:['keys','mug','cane']},
    'drawer-99':{add:['notebook','camera','shoes'],anchors:[{id:'headphones',x:0,y:0,rot:0}]},
    'drawer-100':{add:['tin','photo','player'],dense:true},
  };
  function applyHarden(){
    for(const l of levels){
      // 新手章节的七关保持原始（教学）难度，即使 HARDEN 表里有它们的条目也跳过。
      if(TUTORIAL_SET.has(l.id))continue;
      const h=HARDEN[l.id];if(!h)continue;
      if(h.cols){l.cols=h.cols;}
      if(h.rows){l.rows=h.rows;}
      for(const id of h.add||[])if(!l.items.includes(id))l.items.push(id);
      if(h.anchors)l.anchors=h.anchors.map(a=>({...a}));
      if(h.fixedRot)l.fixedRot=[...h.fixedRot];
      if(h.dense)l.dense=true;
      l.rule=levelRule(l);
    }
  }
  // ---- 原始快照：专供难度增强生成器 ----
  // tools/harden.cjs 靠 tier(seq).count - items.length 算这一关该加几件，
  // 所以它必须跑在「还没增强」的关卡上。如果直接读 K.levels，装载时 applyHarden()
  // 已经把件数加上去了，差值恒为负，生成器会整片跳过 —— 这正是它长期没能重跑的原因。
  const RAW=levels.map((l,i)=>({...l,seq:i,items:[...l.items],
    blocked:(l.blocked||[]).map(p=>[...p]),
    zones:(l.zones||[]).map(z=>({...z,items:[...z.items],cells:z.cells.map(c=>[...c])})),
    required:l.required?[...l.required]:undefined}));
  applyHarden();
  // ---- 关系覆盖补丁 ----
  // 上一轮新增的「旧木尺」只在 items 表里、从没被任何关卡引用过（死内容）；
  // 另外有几对物品从不在同一次委托里同时出现，对应的关系永远解不开。
  // 这里定点补进去：木尺进五关，旧布鞋补进有拐杖的那一类关卡。
  const RELATION_ITEMS={'drawer-21':['ruler'],'drawer-22':['ruler'],'drawer-31':['ruler'],'drawer-40':['ruler'],'drawer-50':['ruler'],'drawer-26':['shoes']};
  for(const l of levels){
    const add=RELATION_ITEMS[l.id];if(!add)continue;
    for(const id of add)if(!l.items.includes(id))l.items.push(id);
  }
  // 规则文案统一重算一遍：教学关跳过了 HARDEN，它的 rule 还是最初硬编码的那份。
  for(const l of levels)l.rule=levelRule(l);
  // ---- 章节重排：新手章节 7 关在前，其余 43 关沿用原顺序（原数组按玩法分组，天然有序）----
  {
    // seq 记录「定义顺序」，与展示顺序解耦：tools/harden.cjs 按它取难度档位。
    // 章节重排会改变 K.levels 的索引，若生成器直接按索引取档，重跑就会悄悄改写已验收的关卡。
    levels.forEach((l,i)=>{l.seq=i;});
    const rest=levels.filter(l=>!TUTORIAL_SET.has(l.id));
    const tut=TUTORIAL.map(id=>levels.find(l=>l.id===id)).filter(Boolean);
    levels.length=0;levels.push(...tut,...rest);
    for(const l of levels){l.tutorial=TUTORIAL_SET.has(l.id);l.group=l.tutorial?'tutorial':l.mode;if(l.tutorial)l.chapter='新手章节 · 先认一认这些规矩';}
  }
  const chapters=[{key:'tutorial',name:'新手章节'},...Object.entries(modeNames).map(([key,name])=>({key,name}))];

  // ---- 整齐度评分：对齐 45% / 留白集中 30% / 边距均匀 25%，随摆随算 ----
  function scoreLayout(level,placed){
    const list=Object.entries(placed||{}).filter(([id])=>items[id]);
    const blocked=new Set((level.blocked||[]).map(p=>p.join(',')));
    const occ=new Set();
    for(const[id,p]of list)for(const[dx,dy]of shape(id,p.rot))occ.add((p.x+dx)+','+(p.y+dy));
    const usable=level.cols*level.rows-blocked.size;
    const empty=usable-occ.size;
    if(!list.length)return {total:0,align:0,gap:100,margin:100,empty,usable};
    // 对齐：每件物品的四条边，能与棋盘边界或另一件物品共线就记一分。
    const vc=new Map(),hc=new Map(),bump=(m,k)=>m.set(k,(m.get(k)||0)+1);
    bump(vc,0);bump(vc,level.cols);bump(hc,0);bump(hc,level.rows);
    for(const[id,p]of list){const b=bounds(shape(id,p.rot));bump(vc,p.x);bump(vc,p.x+b.w);bump(hc,p.y);bump(hc,p.y+b.h);}
    let sides=0,flush=0;
    for(const[id,p]of list){const b=bounds(shape(id,p.rot));for(const x of[p.x,p.x+b.w]){sides++;if(vc.get(x)>1)flush++;}for(const y of[p.y,p.y+b.h]){sides++;if(hc.get(y)>1)flush++;}}
    const align=sides?flush/sides:0;
    // 留白：空位应该「推边」——贴着棋盘边或者靠住隔板，别在中间挖洞。
    // 前两版都用「空位块」的形状打分，都不行：
    //   最大空位块占比 → 隔板把空位天然切成两块，带隔板的抽屉白吃亏；
    //   孤立单格空位占比 → 物品快塞满时剩下的空位必然被打散成单格，实测 7 关
    //   无论怎么摆这项都在 0~50，drawer-4 更是被锁死在总分 64。
    // 换个思路：不看空位有几块，看空位「去哪儿了」。贴边 或 挨着隔板 = 安置好了。
    // 这样每关都拿得到满分，真正在惩罚的只有「在物件中间抠了个洞」。
    let gap=1;
    if(empty>0){
      let sheltered=0;
      for(let y=0;y<level.rows;y++)for(let x=0;x<level.cols;x++){
        const k=x+','+y;
        if(occ.has(k)||blocked.has(k))continue;
        if(x===0||y===0||x===level.cols-1||y===level.rows-1){sheltered++;continue;}
        if(blocked.has((x-1)+','+y)||blocked.has((x+1)+','+y)||blocked.has(x+','+(y-1))||blocked.has(x+','+(y+1)))sheltered++;
      }
      gap=sheltered/empty;
    }
    // 居中：物品整体是否摊在抽屉中间，全挤在一角会扣分。同样对隔板免疫。
    const xs=[...occ].map(k=>+k.split(',')[0]),ys=[...occ].map(k=>+k.split(',')[1]);
    const gx=xs.reduce((a,b)=>a+b,0)/xs.length,gy=ys.reduce((a,b)=>a+b,0)/ys.length;
    const maxD=Math.hypot((level.cols-1)/2,(level.rows-1)/2)||1;
    const center=Math.max(0,1-Math.hypot(gx-(level.cols-1)/2,gy-(level.rows-1)/2)/maxD);
    const raw=align*.45+gap*.30+center*.25;
    return {total:Math.round(raw*100),align:Math.round(align*100),gap:Math.round(gap*100),center:Math.round(center*100),empty,usable};
  }
  // 分数只做参考、不设星级门槛，因为各关的可达上限并不一样。
  // 上限用 tools/ceiling.cjs（多起点爬山）实测过：50 关里最低的一关（drawer-39）
  // 也能爬到 83，所以评语线压到 82 —— 每关都存在一个能听到最好那句评语的摆法，
  // 不会出现「怎么摆都听不到好话」的关卡。这条不变量由 polish.test.cjs 守着。
  const GRADE_LINES=[82,72,60];
  function verdict(total){return total>=GRADE_LINES[0]?'几乎是样板级的整齐':total>=GRADE_LINES[1]?'摆得很舒服':total>=GRADE_LINES[2]?'看得过去，还能再整':'先把它摆开，再谈整齐';}
  function advice(score){
    if(!score||!score.total)return '把旧物放进抽屉，分数会随摆放实时变化。';
    const dims=[['align','对齐还可以再紧一点，别让边斜着凸出去。'],['gap','空位尽量留在边上，别在中间挖洞。'],['center','别都堆在一侧，往中间匀一匀。']];
    dims.sort((a,b)=>score[a[0]]-score[b[0]]);
    return score[dims[0][0]]>=95?'这一层已经挑不出毛病了。':dims[0][1];
  }

  // ---- 物品关系：有些旧物放在一起才会说话，集满进图鉴 ----
  const relations=[
    {id:'letter-postcard',a:'letter',b:'postcard',kind:'near',text:'寄出去的和没寄出去的，都在这里。'},
    {id:'camera-photo',a:'camera',b:'photo',kind:'near',text:'没拍完的那卷胶卷，终于有人陪着它。'},
    {id:'player-headphones',a:'player',b:'headphones',kind:'near',text:'线缠在一起的样子，也很熟悉。'},
    {id:'player-tape',a:'player',b:'tape',kind:'near',text:'按下播放，走路就有了节奏。'},
    {id:'mug-tin',a:'mug',b:'tin',kind:'near',text:'针线还在铁盒里，杯子缺了一点。'},
    {id:'pencil-notebook',a:'pencil',b:'notebook',kind:'near',text:'削短了一截，想写的东西还有很多。'},
    {id:'glasses-book',a:'glasses',b:'book',kind:'near',text:'戴上它，才能看清书里那些小字。'},
    {id:'keys-letter',a:'keys',b:'letter',kind:'near',text:'转两圈再推门，信就搁在玄关。'},
    {id:'ruler-notebook',a:'ruler',b:'notebook',kind:'near',text:'量过很多次窗台，刚好夹进这一页。'},
    {id:'shoes-cane',a:'shoes',b:'cane',kind:'near',text:'鞋底磨薄了，拐杖刚好配这个速度。'},
    {id:'lamp-book',a:'lamp',b:'book',kind:'near',text:'开关有点松，按下去要停一下才亮。'},
    {id:'photo-mug',a:'photo',b:'mug',kind:'near',text:'照片立在杯子后面，谁来了都能看见。'},
    {id:'headphones-book',a:'headphones',b:'book',kind:'near',text:'戴上耳机，翻开旧书，一个下午就过去了。'},
    {id:'photo-letter',a:'photo',b:'letter',kind:'side',text:'照片背面写了两行字，字迹和信里一样。'},
    {id:'mug-glasses',a:'mug',b:'glasses',kind:'side',text:'眼镜搁在杯口边上，一抬手就够到。'},
    {id:'tin-photo',a:'tin',b:'photo',kind:'side',text:'饼干盒底下，压着一张照片。'},
    {id:'lamp-headphones',a:'lamp',b:'headphones',kind:'side',text:'耳机搭在灯罩上，夜里也听得到。'},
    {id:'postcard-ruler',a:'postcard',b:'ruler',kind:'side',text:'明信片的边，被尺子量过好多次。'},
    {id:'tape-pencil',a:'tape',b:'pencil',kind:'stack',text:'A面唱完，笔也削好了。'},
    {id:'player-camera',a:'player',b:'camera',kind:'stack',text:'一个录声音，一个留影像。'},
    {id:'book-tin',a:'book',b:'tin',kind:'stack',text:'铁盒垫在旧书下面，压得很平。'},
    {id:'notebook-glasses',a:'notebook',b:'glasses',kind:'stack',text:'眼镜搁在本子上，省得找不到。'},
    {id:'shoes-letter',a:'shoes',b:'letter',kind:'ends',text:'出门前，把信搁在最顺手的地方。'},
    {id:'cane-keys',a:'cane',b:'keys',kind:'ends',text:'拐杖靠在门边，钥匙挂在杖头。'}
  ];
  const kindNames={near:'挨在一起',side:'并排',stack:'上下摞着',ends:'各靠一边'};
  function itemBox(id,p){const b=bounds(shape(id,p.rot));return{x:p.x,y:p.y,w:b.w,h:b.h};}
  function touchingEdges(b,level){const e=[];if(b.x<=0)e.push('left');if(b.y<=0)e.push('top');if(b.x+b.w>=level.cols)e.push('right');if(b.y+b.h>=level.rows)e.push('bottom');return e;}
  function relationMet(rel,level,placed){
    const pa=placed[rel.a],pb=placed[rel.b];
    if(!pa||!pb||!items[rel.a]||!items[rel.b])return false;
    const A=shape(rel.a,pa.rot).map(([dx,dy])=>[pa.x+dx,pa.y+dy]);
    const seen=new Set(shape(rel.b,pb.rot).map(([dx,dy])=>(pb.x+dx)+','+(pb.y+dy)));
    const near=A.some(([x,y])=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen.has((x+dx)+','+(y+dy))));
    if(rel.kind==='near')return near;
    const ba=itemBox(rel.a,pa),bb=itemBox(rel.b,pb);
    const overlapY=Math.min(ba.y+ba.h,bb.y+bb.h)-Math.max(ba.y,bb.y);
    const overlapX=Math.min(ba.x+ba.w,bb.x+bb.w)-Math.max(ba.x,bb.x);
    if(rel.kind==='side')return overlapY>0&&near;
    if(rel.kind==='stack')return overlapX>0&&near;
    if(rel.kind==='ends'){
      const ea=touchingEdges(ba,level),eb=touchingEdges(bb,level);
      const head=e=>e.includes('left')||e.includes('top'),tail=e=>e.includes('right')||e.includes('bottom');
      return (head(ea)&&tail(eb))||(head(eb)&&tail(ea));
    }
    return false;
  }
  function metRelations(level,placed){
    const out=[];
    for(const r of relations){
      if(!level.items.includes(r.a)||!level.items.includes(r.b))continue;
      if(relationMet(r,level,placed))out.push(r.id);
    }
    return out;
  }
  function relationById(id){return relations.find(r=>r.id===id);}
  const byId=id=>levels.find(l=>l.id===id)||null;
  const api={items,levels,RAW,shape,bounds,canPlace,placementError,validState,solve,goalCount,isComplete,modeNames,levelRule,cellCount,freeCells,anchorMap,HARDEN,
    chapters,TUTORIAL,byId,scoreLayout,verdict,advice,GRADE_LINES,relations,kindNames,relationMet,metRelations,relationById};
  root.Keepsake=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
