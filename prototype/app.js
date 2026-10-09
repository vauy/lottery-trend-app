'use strict';
/* ============================================================
   臻奇妙趋势分析 · 响应式原型
   数据逻辑移植自仓库 client/lib/lottery/analysis.ts · filters.ts · danTuo.ts
   ============================================================ */

const GAMES = {
  fc3d:{id:'fc3d',name:'福彩3D',count:3,dmin:0,dmax:9,kl8:false},
  pl3 :{id:'pl3', name:'排列3',  count:3,dmin:0,dmax:9,kl8:false},
  pl5 :{id:'pl5', name:'排列5',  count:5,dmin:0,dmax:9,kl8:false},
  kl8 :{id:'kl8', name:'快乐8',  count:20,dmin:1,dmax:80,kl8:true},
};
const POS3 = [{k:'any',n:'不定位'},{k:'bai',n:'百位'},{k:'shi',n:'十位'},{k:'ge',n:'个位'}];
const POS5 = [{k:'any',n:'不定位'},{k:'wan',n:'万位'},{k:'qian',n:'千位'},{k:'bai',n:'百位'},{k:'shi',n:'十位'},{k:'ge',n:'个位'}];
const SUB_3D = [
  ['common','常用'],['dan','毒胆'],['dantuo','胆拖'],['pos','定位'],['multi','复式'],
  ['danHC','胆合积跨'],['amp','振幅'],['rnd1','组内随机'],['rnd2','随机交并'],['groupDan','分组胆'],
];
const SUB_KL8 = [['common','常用'],['combo','组合'],['fushi','复式'],['lian','连号'],['kl8dt','胆拖']];

const S = {
  game:'fc3d', screen:'analyze', sub:'common',
  digit:6, pos:'any', type:'开奖号',
  shapeMain:'zhixuan', shapeFilter:new Set(),
  count:120,
  groupMode:'shrink', shrinkSel:{}, dtDan:new Set(), dtTuo:new Set(),
  charts:[],
};

/* ════════ 移植：数据计算 ════════ */
const isPrime = n => [1,2,3,5,7].includes(n);
const recs = () => (window.SEED[S.game]||[]).slice(-S.count);
// 记录为 {issue,date,nums:[...]}，以下函数统一接收记录对象
function isHit(rec,digit,pos){
  const nums=rec.nums;
  if(pos==='any') return nums.includes(digit);
  const idx={wan:0,qian:1,bai:2,shi:3,ge:4}[pos];
  return nums[idx]===digit;
}
function omissionSeries(numsArr,digit,pos){const res=[];let o=0;for(const r of numsArr){if(isHit(r,digit,pos))o=0;else o++;res.push(o);}return res;}
function hitSeries(numsArr,digit,pos){return numsArr.map(r=>isHit(r,digit,pos)?1:0);}
function movAvg(v,p){return v.map((_,i)=> i+1<p?null:(()=>{let s=0;for(let j=i-p+1;j<=i;j++)s+=v[j];return s/p;})());}
const sumOf = r => r.reduce((a,b)=>a+b,0);
function ampSeries(numsArr){const sums=numsArr.map(r=>sumOf(r.nums));const a=[0];for(let i=1;i<sums.length;i++)a.push(Math.abs(sums[i]-sums[i-1]));return a;}
function freqMap(numsArr,pos){const m={};for(let d=0;d<=9;d++)m[d]=0;for(const r of numsArr)for(let d=0;d<=9;d++)if(isHit(r,d,pos))m[d]++;return m;}

function fullCodes(){const out=[];for(let a=0;a<10;a++)for(let b=0;b<10;b++)for(let c=0;c<10;c++)out.push(''+a+b+c);return out;}
function bmsKeyOf(n){let big=0,mid=0,small=0;for(const x of n){if(x>=7)big++;else if(x>=3)mid++;else small++;}const p=[];if(big)p.push(big+'大');if(mid)p.push(mid+'中');if(small)p.push(small+'小');return p.join('');}
function maxChain(n){const u=[...new Set(n)].sort((a,b)=>a-b);let mc=1,cur=1;for(let i=1;i<u.length;i++){if(u[i]===u[i-1]+1)cur++;else cur=1;if(cur>mc)mc=cur;}return mc>=2?mc:0;}
function applyFilters(codes,f){
  return codes.filter(code=>{
    const nums=code.split('').map(Number),[a,b,c]=nums,s=[...nums].sort((x,y)=>x-y);
    if(f.posBai&&f.posBai.size<10&&!f.posBai.has(a))return false;
    if(f.posShi&&f.posShi.size<10&&!f.posShi.has(b))return false;
    if(f.posGe&&f.posGe.size<10&&!f.posGe.has(c))return false;
    if(f.danCount)for(let d=0;d<=9;d++){const w=f.danCount[d];if(w!=null&&nums.filter(x=>x===d).length!==w)return false;}
    if(f.bigSmall&&f.bigSmall.size&&!f.bigSmall.has(nums.filter(x=>x>=5).length))return false;
    if(f.oddEven&&f.oddEven.size&&!f.oddEven.has(nums.filter(x=>x%2).length))return false;
    if(f.primeCount&&f.primeCount.size&&!f.primeCount.has(nums.filter(isPrime).length))return false;
    if(f.bmsKey&&f.bmsKey.size&&!f.bmsKey.has(bmsKeyOf(nums)))return false;
    if(f.minNum&&f.minNum.size&&!f.minNum.has(s[0]))return false;
    if(f.midNum&&f.midNum.size&&!f.midNum.has(s[1]))return false;
    if(f.maxNum&&f.maxNum.size&&!f.maxNum.has(s[2]))return false;
    const sum=a+b+c;
    if(f.sum&&f.sum.size&&!f.sum.has(sum))return false;
    if(f.sumTail&&f.sumTail.size&&!f.sumTail.has(sum%10))return false;
    if(f.span&&f.span.size&&!f.span.has(s[2]-s[0]))return false;
    if(f.lianhao&&f.lianhao.size&&!f.lianhao.has(maxChain(nums)))return false;
    if(f.pair&&f.pair.size){const u=new Set(nums).size;const t=u===1?9:u===2?3:0;if(!f.pair.has(t))return false;}
    const r0=nums.filter(n=>n%3===0).length,r1=nums.filter(n=>n%3===1).length,r2=nums.filter(n=>n%3===2).length;
    if(f.road0&&f.road0.size&&!f.road0.has(r0))return false;
    if(f.road1&&f.road1.size&&!f.road1.has(r1))return false;
    if(f.road2&&f.road2.size&&!f.road2.has(r2))return false;
    const ts=[(a+b)%10,(a+c)%10,(b+c)%10];
    if(f.twoSumTail&&f.twoSumTail.size&&!ts.some(x=>f.twoSumTail.has(x)))return false;
    const td=[Math.abs(a-b),Math.abs(a-c),Math.abs(b-c)];
    if(f.twoDiff&&f.twoDiff.size&&!td.some(x=>f.twoDiff.has(x)))return false;
    if(f.pair2&&f.pair2.size){const ps=[`${Math.min(a,b)}${Math.max(a,b)}`,`${Math.min(a,c)}${Math.max(a,c)}`,`${Math.min(b,c)}${Math.max(b,c)}`];if(!ps.some(p=>f.pair2.has(p)))return false;}
    return true;
  });
}
function generateDanTuo(dan,tuo){
  const zx=[],zu=new Set();
  if(!dan.length&&!tuo.length)return{zhixuan:[],zuxuan:[]};
  for(let a=0;a<10;a++)for(let b=0;b<10;b++)for(let c=0;c<10;c++){
    const n=[a,b,c];
    if(!dan.every(d=>n.includes(d)))continue;
    if(tuo.length&&!tuo.some(t=>n.includes(t)))continue;
    zx.push(''+a+b+c);zu.add([...n].sort((x,y)=>x-y).join(''));
  }
  return{zhixuan:zx.sort(),zuxuan:[...zu].sort()};
}

/* ════════ Canvas 画图 ════════ */
function setupCanvas(cv){const dpr=Math.min(window.devicePixelRatio||1,2.5);const r=cv.getBoundingClientRect();cv.width=Math.max(1,r.width*dpr);cv.height=Math.max(1,r.height*dpr);const ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w:r.width,h:r.height};}
const C={grid:'rgba(255,255,255,.06)',accent:'#54e3a6',amber:'#e6b455',cyan:'#6fcfe6',fill:'rgba(84,227,166,.12)',ink:'#9aa39a'};
function line(ctx,pts,x0,x1,y0,y1,color,wd){ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=wd||1.6;pts.forEach((p,i)=>{const X=x0+(x1-x0)*(i/(pts.length-1||1));const Y=y0+(y1-y0)*p;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});ctx.stroke();}
function band(ctx,upper,lower,x0,x1,y0,y1,color){ctx.beginPath();ctx.fillStyle=color;upper.forEach((p,i)=>{const X=x0+(x1-x0)*(i/(upper.length-1||1));const Y=y0+(y1-y0)*p;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});for(let i=lower.length-1;i>=0;i--){const X=x0+(x1-x0)*(i/(lower.length-1||1));const Y=y0+(y1-y0)*lower[i];ctx.lineTo(X,Y);}ctx.closePath();ctx.fill();}

function drawFreqK(cv){
  const {ctx,w,h}=setupCanvas(cv);ctx.clearRect(0,0,w,h);const pad=24;
  const rs=recs(),hits=hitSeries(rs,S.digit,S.pos);
  const p=S.pos==='any'?0.271:0.1;const diff=[];let cum=0,cumE=0;
  hits.forEach((hh,i)=>{cum+=hh;cumE+=(i+1)*p;diff.push(cum-cumE);});
  const N=diff.length,x0=pad,x1=w-pad,y0=pad,y1=h-pad;
  const mn=Math.min(0,...diff),mx=Math.max(0,...diff);const Y=v=>y1-((v-mn)/(mx-mn||1))*(y1-y0);
  ctx.strokeStyle=C.grid;ctx.beginPath();ctx.moveTo(x0,Y(0));ctx.lineTo(x1,Y(0));ctx.stroke();
  const m=movAvg(diff,20).map(v=>v==null?0:v),up=[],lo=[];
  for(let i=0;i<N;i++){if(m[i]===0){up.push(diff[i]);lo.push(diff[i]);continue;}let s=0;for(let j=i-19;j<=i;j++){if(j<0)break;s+=(diff[j]-m[i])**2;}const sd=Math.sqrt(s/20);up.push(m[i]+2*sd);lo.push(m[i]-2*sd);}
  band(ctx,up.map(Y),lo.map(Y),x0,x1,y0,y1,'rgba(84,227,166,.10)');
  ctx.beginPath();ctx.fillStyle=C.fill;diff.forEach((v,i)=>{const X=x0+(x1-x0)*(i/(N-1||1));i?ctx.lineTo(X,Y(v)):ctx.moveTo(X,Y(v));});ctx.lineTo(x1,y1);ctx.lineTo(x0,y1);ctx.closePath();ctx.fill();
  line(ctx,diff.map(Y),x0,x1,y0,y1,C.accent,1.8);
  line(ctx,m.map(Y),x0,x1,y0,y1,C.amber,1.2);
}
function drawOmission(cv,stair){
  const {ctx,w,h}=setupCanvas(cv);ctx.clearRect(0,0,w,h);const pad=24;
  const rs=recs(),o=omissionSeries(rs,S.digit,S.pos);const N=o.length,x0=pad,x1=w-pad,y0=pad,y1=h-pad;
  const mx=Math.max(1,...o);const Y=v=>y1-(v/mx)*(y1-y0);
  ctx.beginPath();ctx.fillStyle='rgba(111,207,230,.12)';o.forEach((v,i)=>{const X=x0+(x1-x0)*(i/(N-1||1));i?ctx.lineTo(X,Y(v)):ctx.moveTo(X,Y(v));});ctx.lineTo(x1,y1);ctx.lineTo(x0,y1);ctx.closePath();ctx.fill();
  if(stair){ctx.beginPath();ctx.strokeStyle=C.cyan;ctx.lineWidth=1.6;let py=Y(o[0]);ctx.moveTo(x0,py);for(let i=1;i<N;i++){const X=x0+(x1-x0)*(i/(N-1||1));ctx.lineTo(X,py);py=Y(o[i]);ctx.lineTo(X,py);}ctx.stroke();}
  else line(ctx,o.map(Y),x0,x1,y0,y1,C.cyan,1.6);
}
function drawAmp(cv){
  const {ctx,w,h}=setupCanvas(cv);ctx.clearRect(0,0,w,h);const pad=24;
  const a=ampSeries(recs());const N=a.length,x0=pad,x1=w-pad,y0=pad,y1=h-pad;
  const mx=Math.max(1,...a);const Y=v=>y1-(v/mx)*(y1-y0);
  line(ctx,a.map(Y),x0,x1,y0,y1,C.accent,1.6);
  line(ctx,movAvg(a,5).map(v=>v==null?0:v).map(Y),x0,x1,y0,y1,C.amber,1.2);
  line(ctx,movAvg(a,20).map(v=>v==null?0:v).map(Y),x0,x1,y0,y1,C.cyan,1.2);
  const avg=a.reduce((s,v)=>s+v,0)/N;ctx.strokeStyle=C.ink;ctx.setLineDash([4,4]);line(ctx,a.map(()=>avg).map(Y),x0,x1,y0,y1,C.ink,.8);ctx.setLineDash([]);
}

/* ════════ DOM 辅助 ════════ */
const $=s=>document.querySelector(s);
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
const digitsRange=()=>{const g=GAMES[S.game],out=[];for(let d=g.dmin;d<=g.dmax;d++)out.push(d);return out;};
function digitGrid(sel,onPick,mark){const wrap=el('div','digit-grid');digitsRange().forEach(d=>{const b=el('button','digit'+(sel.has(d)?' on':'')+(mark&&mark[d]?' '+mark[d]:''),String(d));b.onclick=()=>{onPick(d);render();};wrap.appendChild(b);});return wrap;}
function segInline(items,getVal,setVal){const wrap=el('div','seg-inline');items.forEach(([k,n])=>{const b=el('button',getVal()===k?'':'',n);b.setAttribute('aria-pressed',getVal()===k);b.onclick=()=>{setVal(k);render();};wrap.appendChild(b);});return wrap;}
function heatMark(){const fm=freqMap(recs(),S.pos);const total=Object.values(fm).reduce((a,b)=>a+b,0);const exp=total/10;const m={};for(let d=0;d<10;d++)m[d]=fm[d]>exp+0.5?'hot':fm[d]<exp-0.5?'cold':'';return m;}

/* ════════ 渲染：导航 ════════ */
function renderGameList(){const box=$('#gameList');box.innerHTML='';Object.values(GAMES).forEach(g=>{const b=el('button','game',`<span class="dot"></span>${g.name}`);b.setAttribute('aria-current',S.game===g.id);b.onclick=()=>{S.game=g.id;S.count=g.kl8?200:120;S.digit=g.kl8?Math.min(80,S.digit):6;S.pos=g.id==='pl5'?'bai':'any';render();};box.appendChild(b);});}
function renderPrinav(){document.querySelectorAll('#prinav button').forEach(b=>b.setAttribute('aria-current',S.screen===b.dataset.screen));}
function renderSubtabs(){const box=$('#subtabs');box.innerHTML='';const list=GAMES[S.game].kl8?SUB_KL8:SUB_3D;list.forEach(([id,n])=>{const b=el('button','subtab',n);b.setAttribute('aria-current',S.sub===id);b.onclick=()=>{S.sub=id;render();};box.appendChild(b);});}

/* ════════ 渲染：分析页 ════════ */
function ctlPanel(){
  const g=GAMES[S.game];const ctl=el('div','panel');
  ctl.appendChild(el('div','label','<span>选 号</span><span>'+g.name+'</span>'));
  const f1=el('div','field');f1.appendChild(el('span','cap','数字 '+(g.kl8?'1–80':'0–9')));
  f1.appendChild(digitGrid(new Set([S.digit]),d=>{S.digit=d;},g.kl8?null:heatMark()));ctl.appendChild(f1);
  if(!g.kl8){const f2=el('div','field');f2.appendChild(el('span','cap','位置'));const pos=g.id==='pl5'?POS5:POS3;f2.appendChild(segInline(pos.map(p=>[p.k,p.n]),()=>S.pos,k=>{S.pos=k;}));ctl.appendChild(f2);}
  if(S.sub==='dan'){const f=el('div','field');f.appendChild(el('span','cap','类型'));f.appendChild(segInline([['开奖号','开奖号'],['对码','对码'],['两码合','两码合'],['两码差','两码差'],['两码跨','两码跨']],()=>S.type,k=>{S.type=k;}));ctl.appendChild(f);}
  if(g.id==='fc3d'||g.id==='pl3'){const f=el('div','field');f.appendChild(el('span','cap','形态（主模式 / 过滤）'));const row=el('div','seg-inline');
    const m=el('button',S.shapeMain==='zuxuan'?'':'','组选');m.setAttribute('aria-pressed',S.shapeMain==='zuxuan');m.onclick=()=>{S.shapeMain=S.shapeMain==='zuxuan'?'zhixuan':'zuxuan';render();};
    const z3=el('button',S.shapeFilter.has('zusan')?'':'','组三');z3.setAttribute('aria-pressed',S.shapeFilter.has('zusan'));z3.onclick=()=>{S.shapeFilter.has('zusan')?S.shapeFilter.delete('zusan'):S.shapeFilter.add('zusan');render();};
    const z6=el('button',S.shapeFilter.has('zuliu')?'':'','组六');z6.setAttribute('aria-pressed',S.shapeFilter.has('zuliu'));z6.onclick=()=>{S.shapeFilter.has('zuliu')?S.shapeFilter.delete('zuliu'):S.shapeFilter.add('zuliu');render();};
    row.append(m,z3,z6);f.appendChild(row);ctl.appendChild(f);}
  const f3=el('div','field');f3.appendChild(el('span','cap','期数 / 分析窗口'));
  const rb=el('div','row-between');const inp=el('input','num-in');inp.type='number';inp.value=S.count;inp.min=10;inp.max=2000;inp.onchange=()=>{S.count=Math.max(10,Math.min(2000,+inp.value||120));render();};
  rb.appendChild(inp);rb.appendChild(el('span','hint','切 Tab 独立期数'));f3.appendChild(rb);ctl.appendChild(f3);
  return ctl;
}
function tongGrid(){
  const panel=el('div','panel');panel.appendChild(el('div','label','<span>同屏 · 5×2</span><span>'+S.type+'</span>'));
  const grid=el('div','tong-grid');
  for(let d=0;d<10;d++){const cell=el('div','tong-cell');cell.appendChild(el('span','tc',String(d)));const cv=el('canvas');cell.appendChild(cv);grid.appendChild(cell);
    const cur=S.digit;S.charts.push({el:cv,draw:()=>{S.digit=d;drawFreqK(cv);S.digit=cur;}});}
  panel.appendChild(grid);return panel;
}
function analyzeView(){
  const frag=document.createDocumentFragment();
  frag.appendChild(ctlPanel());
  if(S.sub==='dan') frag.appendChild(tongGrid());
  const grid=el('div','charts-grid');
  const mk=(title,meta,fn)=>{const card=el('div','chart-card');card.appendChild(el('div','ctitle',`<b>${title}</b><span class="meta">${meta}</span>`));const cv=el('canvas');card.appendChild(cv);grid.appendChild(card);S.charts.push({el:cv,draw:fn});};
  mk('频率K线','diff 累计实出−理论',()=>drawFreqK(grid.querySelectorAll('canvas')[0]));
  mk('遗漏K线','爬楼梯遗漏',()=>drawOmission(grid.querySelectorAll('canvas')[1],true));
  mk('遗漏图','逐期遗漏值',()=>drawOmission(grid.querySelectorAll('canvas')[2],false));
  mk('振幅图','和值振幅 + MA',()=>drawAmp(grid.querySelectorAll('canvas')[3]));
  frag.appendChild(grid);
  return frag;
}

/* ════════ 渲染：组号页 ════════ */
function listCodes(arr,zu){const box=el('div','code-list');arr.forEach(c=>box.appendChild(el('span','code'+(zu?' zu':''),c)));return box;}
function groupView(){
  const frag=document.createDocumentFragment();
  const ctl=el('div','panel');
  ctl.appendChild(el('div','label','<span>组号 ▲</span><span>'+GAMES[S.game].name+'</span>'));
  const f=el('div','field');f.appendChild(el('span','cap','模式'));
  f.appendChild(segInline([['shrink','缩水'],['dantuo','胆拖']],()=>S.groupMode,k=>{S.groupMode=k;render();}));ctl.appendChild(f);
  if(S.groupMode==='dantuo'){
    const fa=el('div','field');fa.appendChild(el('span','cap','胆码（必含）'));fa.appendChild(digitGrid(S.dtDan,d=>{S.dtDan.has(d)?S.dtDan.delete(d):S.dtDan.add(d);}));ctl.appendChild(fa);
    const ft=el('div','field');ft.appendChild(el('span','cap','拖码（至少含一）'));ft.appendChild(digitGrid(S.dtTuo,d=>{S.dtTuo.has(d)?S.dtTuo.delete(d):S.dtTuo.add(d);}));ctl.appendChild(ft);
  } else { ctl.appendChild(shrinkFilters()); }
  frag.appendChild(ctl);

  const res=el('div','panel');
  if(S.groupMode==='dantuo'){
    const {zhixuan,zuxuan}=generateDanTuo([...S.dtDan],[...S.dtTuo]);
    const ban=el('div','result-banner');ban.innerHTML=`<div><div class="big">${zhixuan.length}</div><div class="lbl">直选注数</div></div><div><div class="big" style="color:var(--cyan)">${zuxuan.length}</div><div class="lbl">组选注数</div></div>`;
    res.appendChild(ban);res.appendChild(listCodes(zhixuan.slice(0,120),false));
    if(zhixuan.length>120)res.appendChild(el('div','hint','仅显示前 120 注，共 '+zhixuan.length+' 注'));
  } else {
    const codes=applyFilters(fullCodes(),readShrink());
    const ban=el('div','result-banner');ban.innerHTML=`<div><div class="big">${codes.length}</div><div class="lbl">缩水注数 / 共 1000</div></div><div><div class="big" style="color:var(--cyan)">${(codes.length/10).toFixed(1)}%</div><div class="lbl">占比</div></div>`;
    res.appendChild(ban);res.appendChild(listCodes(codes.slice(0,200),false));
    if(codes.length>200)res.appendChild(el('div','hint','仅显示前 200 注，共 '+codes.length+' 注'));
  }
  frag.appendChild(res);
  return frag;
}
function shrinkFilters(){
  const wrap=el('div','fold');
  const grp=(title,body)=>{const g=el('details','group');g.open=true;g.appendChild(el('summary',null,title+'<span style="color:var(--ink-faint)">▾</span>'));const b=el('div','body');body(b);g.appendChild(b);wrap.appendChild(g);};
  const pick=(label,key,opts)=>{const f=el('div','field');f.appendChild(el('span','cap',label));const row=el('div','seg-inline');const set=S.shrinkSel[key]||new Set();opts.forEach(([v,n])=>{const b=el('button',set.has(v)?'':'',n);b.setAttribute('aria-pressed',set.has(v));b.onclick=()=>{set.has(v)?set.delete(v):set.add(v);S.shrinkSel[key]=set;render();};row.appendChild(b);});f.appendChild(row);return f;};
  grp('定位（百位 / 十位 / 个位）',b=>{['posBai','posShi','posGe'].forEach((k,i)=>{const f=el('div','field');f.appendChild(el('span','cap',['百位','十位','个位'][i]));const grid=el('div','digit-grid');const set=S.shrinkSel[k]||new Set();for(let d=0;d<10;d++){const btn=el('button',set.has(d)?'on':'',String(d));btn.onclick=()=>{set.has(d)?set.delete(d):set.add(d);S.shrinkSel[k]=set;render();};grid.appendChild(btn);}f.appendChild(grid);b.appendChild(f);});});
  grp('形态 / 数值',b=>{b.appendChild(pick('大小（大号个数）','bigSmall',[[0,'0大'],[1,'1大'],[2,'2大'],[3,'3大']]));b.appendChild(pick('单双','oddEven',[[0,'0单'],[1,'1单'],[2,'2单'],[3,'3单']]));b.appendChild(pick('质合','primeCount',[[0,'0质'],[1,'1质'],[2,'2质'],[3,'3质']]));b.appendChild(pick('大中小','bmsKey',[['1大2中','1大2中'],['1大1中1小','1大1中1小'],['2大1小','2大1小'],['3大','3大']]));b.appendChild(pick('和值','sum',Array.from({length:28},(_,i)=>[i,String(i)])));b.appendChild(pick('和尾','sumTail',Array.from({length:10},(_,i)=>[i,String(i)])));b.appendChild(pick('跨度','span',Array.from({length:10},(_,i)=>[i,String(i)])));});
  grp('特征 / 路数',b=>{b.appendChild(pick('连号','lianhao',[[0,'无'],[2,'二连'],[3,'三连']]));b.appendChild(pick('对子','pair',[[0,'无'],[3,'组三'],[9,'豹子']]));b.appendChild(pick('0路个数','road0',[[0,0],[1,1],[2,2],[3,3]]));b.appendChild(pick('1路个数','road1',[[0,0],[1,1],[2,2],[3,3]]));b.appendChild(pick('2路个数','road2',[[0,0],[1,1],[2,2],[3,3]]));});
  grp('两码',b=>{b.appendChild(pick('两码和尾','twoSumTail',Array.from({length:10},(_,i)=>[i,String(i)])));b.appendChild(pick('两码差','twoDiff',Array.from({length:10},(_,i)=>[i,String(i)])));b.appendChild(pick('不定位两码','pair2',['01','05','06','12','16','29','39','45','68','78'].map(p=>[p,p])));});
  return wrap;
}
function readShrink(){const s=S.shrinkSel;return{posBai:s.posBai,posShi:s.posShi,posGe:s.posGe,bigSmall:s.bigSmall,oddEven:s.oddEven,primeCount:s.primeCount,bmsKey:s.bmsKey,sum:s.sum,sumTail:s.sumTail,span:s.span,lianhao:s.lianhao,pair:s.pair,road0:s.road0,road1:s.road1,road2:s.road2,twoSumTail:s.twoSumTail,twoDiff:s.twoDiff,pair2:s.pair2};}

/* ════════ 渲染：底部 + 主循环 ════════ */
function renderBottom(){
  const bar=$('#bottombar');bar.innerHTML='';
  if(S.screen==='analyze'){
    const reset=el('button','btn-ghost','重置');reset.onclick=()=>{S.pos=GAMES[S.game].id==='pl5'?'bai':'any';S.shapeMain='zhixuan';S.shapeFilter.clear();render();toast('已重置');};
    const go=el('button','btn-main','出 图');go.onclick=()=>{const om=omissionSeries(recs(),S.digit,S.pos);toast('出图：'+GAMES[S.game].name+' · 数字 '+S.digit+(S.pos!=='any'?' · '+S.pos:'')+' · 当前遗漏 '+om[om.length-1]);};
    bar.append(reset,go);
  } else {
    const reset=el('button','btn-ghost','清空');reset.onclick=()=>{S.shrinkSel={};S.dtDan.clear();S.dtTuo.clear();render();toast('已清空');};
    const gen=el('button','btn-main','生 成');gen.onclick=()=>toast('已生成组号方案');bar.append(reset,gen);
  }
}
function render(){
  S.charts=[];
  renderGameList();renderPrinav();renderSubtabs();
  const c=$('#content');c.innerHTML='';
  c.appendChild(S.screen==='analyze'?analyzeView():groupView());
  renderBottom();
  const rs=recs(),om=omissionSeries(rs,S.digit,S.pos);
  $('#statusPill').innerHTML='数据 <b>'+(window.SEED[S.game]?window.SEED[S.game].length:0)+'</b> 期 · 当前遗漏 <b>'+(om[om.length-1]||0)+'</b>';
  requestAnimationFrame(()=>S.charts.forEach(c=>{try{c.draw();}catch(e){console.warn(e&&e.stack||e);}}));
}
let toastT;
function toast(msg){let t=$('#toast');if(!t){t=el('div');t.id='toast';t.style.cssText='position:fixed;left:50%;bottom:90px;transform:translateX(-50%) translateY(8px);opacity:0;background:#2a2f2a;color:#e8eee8;padding:10px 16px;border-radius:999px;font-size:.8rem;z-index:99;transition:.25s;pointer-events:none;white-space:nowrap';document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';clearTimeout(toastT);toastT=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(-50%) translateY(8px)';},1700);}

window.addEventListener('resize',()=>requestAnimationFrame(()=>S.charts.forEach(c=>{try{c.draw();}catch(e){}})));
window.addEventListener('orientationchange',()=>setTimeout(()=>S.charts.forEach(c=>{try{c.draw();}catch(e){}}),250));
document.querySelectorAll('#prinav button').forEach(b=>b.onclick=()=>{S.screen=b.dataset.screen;location.hash=S.screen==='group'?'#group':'#analyze';render();});

// 深链接：#group / #game:kl8
function applyHash(){const h=location.hash.replace(/^#/,'');if(h==='group')S.screen='group';else if(h==='analyze')S.screen='analyze';else if(h.startsWith('game:')){S.game=h.slice(5);S.count=GAMES[S.game].kl8?200:120;S.digit=GAMES[S.game].kl8?Math.min(80,S.digit):6;S.pos=GAMES[S.game].id==='pl5'?'bai':'any';}}
window.addEventListener('hashchange',()=>{applyHash();render();});
applyHash();
render();
