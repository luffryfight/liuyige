const test=require('node:test');
const assert=require('node:assert/strict');
const K=require('../core.js');
// 关卡顺序会随章节编排变动，测试一律按 id 取关卡，不要写死下标。
const L=id=>{const l=K.byId(id);assert.ok(l,`关卡 ${id} 应该存在`);return l;};
test('every authored level has a legal complete solution, including irregular footprints',()=>{
  for(const level of K.levels){const r=K.solve(level);assert.equal(r.status,'solved',level.id);assert.equal(Object.keys(r.solution).length,K.goalCount(level));assert.ok(K.isComplete(level,r.solution));assert.ok(K.validState(level,r.solution));}
});
test('rotation preserves cell count, uniqueness, normalization and four-turn identity',()=>{
  for(const id of Object.keys(K.items))for(let rot=0;rot<4;rot++){const c=K.shape(id,rot);assert.equal(c.length,K.items[id].cells.length);assert.equal(new Set(c.map(p=>p.join(','))).size,c.length);assert.equal(Math.min(...c.map(p=>p[0])),0);assert.equal(Math.min(...c.map(p=>p[1])),0);assert.deepEqual(K.shape(id,rot+4),c);}
});
test('overlap, bounds, unknown items and corrupt saves are rejected',()=>{
  const l=L('drawer-1');assert.ok(K.canPlace(l,{},'tin',0,0,0));assert.equal(K.canPlace(l,{tin:{x:0,y:0,rot:0}},'photo',0,0,0),false);assert.equal(K.canPlace(l,{},'tin',-1,0,0),false);assert.equal(K.canPlace(l,{},'tin',3,3,0),false);assert.equal(K.canPlace(l,{},'unknown',0,0,0),false);assert.equal(K.validState(l,{tin:{x:0.2,y:0,rot:0}}),false);assert.equal(K.validState(l,{tin:{x:0,y:0,rot:'x'}}),false);assert.equal(K.validState(l,null),false);
});
test('a placed object can be moved without colliding with its own old footprint',()=>{
  const l=L('drawer-1');assert.ok(K.canPlace(l,{tin:{x:0,y:0,rot:0}},'tin',1,0,0));
});
test('headphone hole is usable space, not a rectangular collision box',()=>{
  const l=L('drawer-4'),p={headphones:{x:0,y:0,rot:0}};assert.ok(K.canPlace(l,p,'pencil',1,1,0));assert.equal(K.canPlace(l,p,'pencil',0,1,0),false);
});
test('hint solver keeps existing placements fixed and solves legal prefixes',()=>{
  for(const l of K.levels){const solution=K.solve(l).solution,partial={};for(const[id,p]of Object.entries(solution)){partial[id]=p;const r=K.solve(l,partial);assert.equal(r.status,'solved');for(const[k,v]of Object.entries(partial))assert.deepEqual(r.solution[k],v);}}
});
test('tutorial allows a second arrangement instead of enforcing one target answer',()=>{
  const l=L('drawer-1'),first=K.solve(l).solution;let found=false;for(let y=0;y<3&&!found;y++)for(let x=0;x<3&&!found;x++){if(x===first.tin.x&&y===first.tin.y)continue;const r=K.solve(l,{tin:{x,y,rot:0}});if(r.solution)found=true;}assert.ok(found);
});
test('solver distinguishes a resource limit from proof of no solution',()=>{
  assert.equal(K.solve(L('drawer-6'),{},0).status,'limit');assert.equal(K.solve(L('drawer-1'),{tin:{x:99,y:0,rot:0}}).status,'invalid');
});

test('fixed dividers block occupied cells, including after rotation',()=>{
  const l=L('drawer-7');
  assert.equal(K.placementError(l,{},'book',1,0,0),'blocked');
  assert.equal(K.placementError(l,{},'tape',2,1,1),'blocked');
  assert.ok(K.canPlace(l,{},'book',3,0,0));
  assert.equal(K.validState(l,{book:{x:1,y:0,rot:0}}),false);
});

test('zone restrictions apply to every occupied cell and survive rotations',()=>{
  const l=L('drawer-11');
  assert.equal(K.placementError(l,{},'letter',0,0,0),'zone');
  assert.equal(K.placementError(l,{},'letter',0,2,1),'zone');
  assert.ok(K.canPlace(l,{},'letter',0,3,0));
  assert.ok(K.canPlace(l,{},'pencil',0,0,0),'unassigned items can use any legal space');
});

test('choice completion requires the exact quota and all mandatory keepsakes',()=>{
  const l=L('drawer-15'),placed={book:{x:0,y:0,rot:0},pencil:{x:0,y:3,rot:1},letter:{x:0,y:2,rot:0},keys:{x:2,y:1,rot:0}};
  assert.equal(K.isComplete(l,placed),false,'count alone cannot complete without photo');
  assert.equal(K.solve(l,placed).status,'unsolvable');
  const solution=K.solve(l).solution;
  assert.equal(K.isComplete(l,solution),true);
  const extra=l.items.find(id=>!solution[id]);
  assert.equal(K.placementError(l,solution,extra,0,0,0),'quota');
  delete solution.photo;assert.equal(K.isComplete(l,solution),false);
});

test('each choice commission supports at least two distinct sets of keepsakes',()=>{
  // 数到 2 就停：断言本来就是「不止一种挑法」，没必要把全部挑法枚举完。
  // 近满盘之后物品栏能到 17 件，一种挑法就是一次完整求解，全量枚举 C(16,7)=11440 次要跑几十秒。
  for(const l of K.levels.filter(l=>l.keepCount)){
    let count=0;
    for(let mask=0;mask<1<<l.items.length&&count<2;mask++){
      const ids=l.items.filter((_,i)=>mask>>i&1);
      if(ids.length!==l.keepCount||!l.required.every(id=>ids.includes(id)))continue;
      if(K.solve({...l,items:ids}).solution)count++;
    }
    assert.ok(count>=2,`${l.id}: only ${count} legal item selections`);
  }
});
