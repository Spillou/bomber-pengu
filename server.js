const express=require("express"),http=require("http"),{Server}=require("socket.io"),path=require("path"),fs=require("fs");
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:"*"}});
app.use(express.static(path.join(__dirname,"public")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
const DATA=path.join(__dirname,"data");if(!fs.existsSync(DATA))fs.mkdirSync(DATA);
const ld=(f,d)=>{try{return JSON.parse(fs.readFileSync(path.join(DATA,f),"utf8"))}catch{return d}};
const sv=(f,d)=>fs.writeFileSync(path.join(DATA,f),JSON.stringify(d));
const gUs=()=>ld("users.json",{}),sUs=u=>sv("users.json",u),gU=n=>gUs()[n.toLowerCase()]||null;
const pU=u=>{const a=gUs();a[u.username.toLowerCase()]=u;sUs(a)};
const gLB=()=>ld("lb.json",[]),sLB=lb=>sv("lb.json",lb);
const uLB=u=>{const lb=gLB();const i=lb.findIndex(e=>e.u===u.username);const e={u:u.username,e:u.lp,w:u.wins,l:u.losses,a:u.avatar||"🐧"};if(i>=0)lb[i]=e;else lb.push(e);lb.sort((a,b)=>b.e-a.e);sLB(lb.slice(0,100))};
const gCh=()=>ld("chat.json",[]),sCh=c=>sv("chat.json",c);
const gNews=()=>ld("news.json",[]),sNews=n=>sv("news.json",n);
const ADMINS=["YMAC","Spillou"]; // admin usernames
const isAdmin=u=>u&&ADMINS.includes(u.username);

const IW=13,IH=11,GW=IW+2,GH=IH+2,CELL=52;
const FUSE=3400,EXDUR=500,RTIME=120,SDI=400;
const PUC=0.4,SR=2,SPD=2.2,CC=11,TICK=1000/60,KICK_SPD=2.5;
const T={E:0,W:1,B:2},DR=[[0,-1],[0,1],[-1,0],[1,0]],PTS=["range","bombs","speed","kick"];
const TN=["Bronze","Argent","Or","Platine","Diamant","Maître"];
const TC=["#CD7F32","#C0C0C0","#FFD700","#00CED1","#B9F2FF","#FF6B6B"];

// SEASON SYSTEM
function getSeasonId(){const d=new Date();return`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`}
function getSeasonEnd(){const d=new Date();const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1));return end.getTime()}
// Tier XP requirement: tier N needs (500 + N*50) XP to complete. Total XP for tier 50 = sum
function tierXP(t){return 500+t*50}
function getTier(seasonXP){let t=0,remaining=seasonXP;while(t<50&&remaining>=tierXP(t)){remaining-=tierXP(t);t++}return{tier:t,progress:remaining,needed:t<50?tierXP(t):0}}
// Rewards per tier: [tier, type, value, price (0=free)]
const SEASON_REWARDS=[
  {tier:1,type:"flocons",value:50,free:true},
  {tier:3,type:"emote",value:"10",free:false}, // 💣 BOOM
  {tier:5,type:"flocons",value:100,free:true},
  {tier:8,type:"skin",value:"captain",free:false},
  {tier:10,type:"flocons",value:150,free:true},
  {tier:12,type:"avatar",value:"penguin_cool",free:false},
  {tier:15,type:"flocons",value:200,free:true},
  {tier:18,type:"arena",value:"underwater",free:false},
  {tier:20,type:"skin",value:"samurai",free:true},
  {tier:23,type:"emote",value:"13",free:false}, // ⚡ ZAP
  {tier:25,type:"flocons",value:300,free:true},
  {tier:28,type:"avatar",value:"dragon_baby",free:false},
  {tier:30,type:"flocons",value:400,free:true},
  {tier:33,type:"arena",value:"cyberpunk",free:false},
  {tier:35,type:"skin",value:"ninja",free:true},
  {tier:38,type:"emote",value:"20",free:false}, // 🐉 DRAGON
  {tier:40,type:"flocons",value:700,free:true},
  {tier:43,type:"avatar",value:"dragon",free:false},
  {tier:45,type:"skin",value:"cyber",free:true},
  {tier:48,type:"arena",value:"neon_city",free:false},
  {tier:50,type:"skin",value:"rainbow",free:true},
];
function rN(lp){if(lp>=2000)return"Maître";const t=Math.min(4,Math.floor(lp/400));return`${TN[t]} ${4-Math.floor((lp-t*400)/100)}`}
function rC(lp){if(lp>=2000)return TC[5];return TC[Math.min(4,Math.floor(lp/400))]}
function cLP(m,o,w){const b=w?28:-18,s=w?Math.max(.6,1.3-m/3e3):Math.min(1.4,.8+m/3e3),d=o-m,x=w?Math.max(0,d/200)*5:Math.min(0,d/200)*3;return Math.round(b*s+x)}

// Daily shop rotation — uses current UTC day as seed
function getDailyShopId(){const d=new Date();return`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`}
function getShopEndMs(){const d=new Date();const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1));return end.getTime()}
// Deterministic rotation: pick N items from pool using day-based seed
function shopRotation(pool,count,seed){const s=seed.split("-").reduce((a,b)=>a+parseInt(b),0);const shuffled=[...pool].map((v,i)=>({v,k:(s+i*997)%pool.length}));shuffled.sort((a,b)=>a.k-b.k);return shuffled.slice(0,count).map(x=>x.v)}

function mkG(){const g=Array.from({length:GH},()=>Array(GW).fill(T.E));for(let y=0;y<GH;y++)for(let x=0;x<GW;x++)if(x===0||x===GW-1||y===0||y===GH-1)g[y][x]=T.W;for(let iy=0;iy<IH;iy++)for(let ix=0;ix<IW;ix++)if(ix%2===1&&iy%2===1)g[iy+1][ix+1]=T.W;const sf=new Set();[[1,1],[2,1],[1,2],[3,1],[1,3]].forEach(([x,y])=>sf.add(`${x},${y}`));const ax=GW-2,ay=GH-2;[[ax,ay],[ax-1,ay],[ax,ay-1],[ax-2,ay],[ax,ay-2]].forEach(([x,y])=>sf.add(`${x},${y}`));for(let y=1;y<GH-1;y++)for(let x=1;x<GW-1;x++)if(g[y][x]===T.E&&!sf.has(`${x},${y}`)&&Math.random()<.6)g[y][x]=T.B;return g}
function genSp(){const o=[],v=new Set();let t=1,b=GH-2,l=1,r=GW-2;while(t<=b&&l<=r){for(let x=l;x<=r;x++){const k=`${x},${t}`;if(!v.has(k)){v.add(k);o.push({x,y:t})}}t++;for(let y=t;y<=b;y++){const k=`${r},${y}`;if(!v.has(k)){v.add(k);o.push({x:r,y})}}r--;for(let x=r;x>=l;x--){const k=`${x},${b}`;if(!v.has(k)){v.add(k);o.push({x,y:b})}}b--;for(let y=b;y>=t;y--){const k=`${l},${y}`;if(!v.has(k)){v.add(k);o.push({x:l,y})}}l++}return o}

function isBlk(grid,px,py,hs){const bl=v=>v===T.W||v===T.B;const x0=Math.floor((px-hs)/CELL),x1=Math.floor((px+hs)/CELL),y0=Math.floor((py-hs)/CELL),y1=Math.floor((py+hs)/CELL);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(bl(grid[y]?.[x]))return true;return false}
function tryMv(e,dx,dy,spd,grid,bombs,g){const hs=CELL/2-6;let nx=e.px+dx*spd,ny=e.py+dy*spd;if(dx){const c=e.gy*CELL+CELL/2,d=c-e.py;if(Math.abs(d)>.5)ny=e.py+Math.sign(d)*Math.min(spd,Math.abs(d));else ny=c}if(dy){const c=e.gx*CELL+CELL/2,d=c-e.px;if(Math.abs(d)>.5)nx=e.px+Math.sign(d)*Math.min(spd,Math.abs(d));else nx=c}if(!isBlk(grid,nx,ny,hs)){const ngx=Math.floor(nx/CELL),ngy=Math.floor(ny/CELL);const onB=bombs.some(b=>b.gx===ngx&&b.gy===ngy),wasOn=bombs.some(b=>b.gx===e.gx&&b.gy===e.gy);if(onB&&!(ngx===e.gx&&ngy===e.gy)&&!wasOn){if(e.kick){const bomb=bombs.find(b=>b.gx===ngx&&b.gy===ngy);if(bomb&&!g.kicked.some(k=>k.id===bomb.id)){let fx=ngx,fy=ngy;while(true){const nnx=fx+dx,nny=fy+dy;if(nnx<0||nnx>=GW||nny<0||nny>=GH||grid[nny][nnx]!==T.E)break;// Check other bombs: use target cell (tx,ty) for in-flight bombs, gx/gy for stopped
const otherBlock=bombs.some(ob=>{if(ob.id===bomb.id)return false;const k=g.kicked.find(x=>x.id===ob.id);const cx=k?k.tx:ob.gx,cy=k?k.ty:ob.gy;return cx===nnx&&cy===nny});if(otherBlock)break;fx=nnx;fy=nny}if(fx!==ngx||fy!==ngy)g.kicked.push({id:bomb.id,tx:fx,ty:fy,dx,dy})}}return false}e.px=nx;e.py=ny;e.gx=Math.floor(nx/CELL);e.gy=Math.floor(ny/CELL);return true}if(dx&&!dy){for(const n of[-1,1]){const tc=Math.round((e.py+n)/CELL)*CELL+CELL/2;if(Math.abs(e.py-tc)<CC&&!isBlk(grid,nx,tc,hs)){const ng=Math.floor(nx/CELL),ng2=Math.floor(tc/CELL);if(!bombs.some(b=>b.gx===ng&&b.gy===ng2)){e.px=nx;e.py=tc;e.gx=ng;e.gy=ng2;return true}}}}if(dy&&!dx){for(const n of[-1,1]){const tc=Math.round((e.px+n)/CELL)*CELL+CELL/2;if(Math.abs(e.px-tc)<CC&&!isBlk(grid,tc,ny,hs)){const ng=Math.floor(tc/CELL),ng2=Math.floor(ny/CELL);if(!bombs.some(b=>b.gx===ng&&b.gy===ng2)){e.px=tc;e.py=ny;e.gx=ng;e.gy=ng2;return true}}}}return false}

const queue=[],games=new Map(),pGame=new Map(),pInput=new Map();
let onlineCount=0;

function findMatch(){if(queue.length<2)return;queue.sort((a,b)=>a.lp-b.lp);let bi=-1,bd=Infinity;for(let i=0;i<queue.length-1;i++){if(queue[i].username===queue[i+1].username)continue;const d=Math.abs(queue[i].lp-queue[i+1].lp);if(d<bd){bd=d;bi=i}}if(bi<0)return;const p1=queue.splice(bi+1,1)[0],p2=queue.splice(bi,1)[0];proposeMatch(p1,p2)}

// MATCH PROPOSAL — 10s to accept
const proposals=new Map(); // proposalId -> {p1,p2,accepted:{p1:bool,p2:bool},timer}
function proposeMatch(p1,p2){
  const pid=`prop_${Date.now()}`;
  const mkI=u=>{const uu=gU(u.username);return{username:u.username,lp:u.lp,skin:uu?.skin,arena:uu?.arena,avatar:uu?.avatar||"penguin"}};
  const prop={id:pid,p1,p2,accepted:{p1:false,p2:false},timer:null};
  proposals.set(pid,prop);
  p1.socket.emit("matchProposal",{proposalId:pid,opp:mkI(p2)});
  p2.socket.emit("matchProposal",{proposalId:pid,opp:mkI(p1)});
  // 10s timeout
  prop.timer=setTimeout(()=>{
    const pr=proposals.get(pid);if(!pr)return;proposals.delete(pid);
    // Put back whoever accepted into queue
    if(pr.accepted.p1&&!pr.accepted.p2){queue.push(pr.p1);pr.p1.socket.emit("matchDeclined",{reason:"Adversaire n'a pas accepté"});pr.p2.socket.emit("matchDeclined",{reason:"Temps écoulé"})}
    else if(pr.accepted.p2&&!pr.accepted.p1){queue.push(pr.p2);pr.p2.socket.emit("matchDeclined",{reason:"Adversaire n'a pas accepté"});pr.p1.socket.emit("matchDeclined",{reason:"Temps écoulé"})}
    else{pr.p1.socket.emit("matchDeclined",{reason:"Temps écoulé"});pr.p2.socket.emit("matchDeclined",{reason:"Temps écoulé"})}
    findMatch();
  },10000)}

function createGame(p1,p2){const gid=`g_${Date.now()}_${Math.random().toString(36).substr(2,4)}`;const u1=gU(p1.username),u2=gU(p2.username);
  const g={id:gid,pl:{p1:{sock:p1.socket,name:p1.username,lp:p1.lp,skin:u1?.skin||"classic",arena:u1?.arena||"glacier",avatar:u1?.avatar||"penguin"},p2:{sock:p2.socket,name:p2.username,lp:p2.lp,skin:u2?.skin||"classic",arena:u2?.arena||"glacier",avatar:u2?.avatar||"penguin"}},sc:{p1:0,p2:0},rn:0,phase:"cd",cd:3,grid:null,ent:null,bombs:[],expl:[],pups:[],kicked:[],emotes:[],emoteCD:{p1:0,p2:0},sd:false,sdO:[],sdI:0,sdL:0,rStart:0,tick:null,cdInt:null,curArena:"glacier",drawProposed:null,drawUsed:{p1:false,p2:false},mStats:{p1:{bombs:0,pups:0,kills:0},p2:{bombs:0,pups:0,kills:0}}};
  games.set(gid,g);pGame.set(p1.socket.id,gid);pGame.set(p2.socket.id,gid);pInput.set(p1.socket.id,{dx:0,dy:0});pInput.set(p2.socket.id,{dx:0,dy:0});
  const mkI=u=>({username:u?.username,lp:u?.lp,skin:u?.skin,arena:u?.arena,avatar:u?.avatar||"penguin"});
  p1.socket.emit("matchFound",{gid,you:"p1",opp:mkI(u2),me:mkI(u1)});
  p2.socket.emit("matchFound",{gid,you:"p2",opp:mkI(u1),me:mkI(u2)});
  startCD(gid)}

function bc(g,ev,d){g.pl.p1.sock.emit(ev,d);g.pl.p2.sock.emit(ev,d)}

function startCD(gid){const g=games.get(gid);if(!g)return;g.rn++;g.phase="cd";g.cd=3;g.curArena=g.rn%2===1?g.pl.p1.arena:g.pl.p2.arena;g.drawProposed=null;
  bc(g,"roundStart",{round:g.rn,cd:3,arena:g.curArena,sc:g.sc});
  g.cdInt=setInterval(()=>{g.cd--;bc(g,"countdown",{v:g.cd});if(g.cd<=0){clearInterval(g.cdInt);setTimeout(()=>startRound(gid),500)}},1000)}

function startRound(gid){const g=games.get(gid);if(!g)return;g.grid=mkG();g.bombs=[];g.expl=[];g.pups=[];g.kicked=[];g.emotes=[];g.sd=false;g.sdO=genSp();g.sdI=0;g.sdL=0;g.rStart=Date.now();g.phase="play";
  g.ent={p1:{px:CELL+CELL/2,py:CELL+CELL/2,gx:1,gy:1,range:SR,mB:1,bL:1,spd:1,kick:false,alive:true,dir:{dx:1,dy:0}},p2:{px:CELL*(GW-2)+CELL/2,py:CELL*(GH-2)+CELL/2,gx:GW-2,gy:GH-2,range:SR,mB:1,bL:1,spd:1,kick:false,alive:true,dir:{dx:-1,dy:0}}};
  pInput.set(g.pl.p1.sock.id,{dx:0,dy:0});pInput.set(g.pl.p2.sock.id,{dx:0,dy:0});
  bc(g,"roundBegin",{grid:g.grid,ent:sE(g.ent),round:g.rn});g.tick=setInterval(()=>gameTick(gid),TICK)}

function sE(ent){const r={};for(const p of["p1","p2"]){const e=ent[p];r[p]={px:e.px,py:e.py,gx:e.gx,gy:e.gy,range:e.range,mB:e.mB,bL:e.bL,spd:e.spd,kick:e.kick,alive:e.alive,dir:e.dir}}return r}

function gameTick(gid){const g=games.get(gid);if(!g||g.phase!=="play")return;const now=Date.now();
  for(const pid of["p1","p2"]){const e=g.ent[pid];if(!e.alive)continue;const inp=pInput.get(g.pl[pid].sock.id)||{dx:0,dy:0};if(inp.dx||inp.dy){e.dir={dx:inp.dx,dy:inp.dy};const spd=SPD*(1+(e.spd-1)*.3);if(tryMv(e,inp.dx,inp.dy,spd,g.grid,g.bombs,g)){const pi=g.pups.findIndex(p=>p.x===e.gx&&p.y===e.gy);if(pi>=0){const pu=g.pups[pi];if(pu.type==="range")e.range=Math.min(e.range+1,8);if(pu.type==="bombs"){e.mB++;e.bL++}if(pu.type==="speed")e.spd=Math.min(e.spd+1,3);if(pu.type==="kick")e.kick=true;g.pups.splice(pi,1);g.mStats[pid].pups++;bc(g,"pickup",{pid,type:pu.type,x:e.gx,y:e.gy})}}}}
  const rem=Math.max(0,RTIME-Math.floor((now-g.rStart)/1000));
  if(rem<=0&&!g.sd){g.sd=true;g.sdL=now;bc(g,"suddenDeath",{})}
  if(g.sd&&g.sdI<g.sdO.length&&now-g.sdL>=SDI){const c=g.sdO[g.sdI];if(g.grid[c.y][c.x]!==T.W){g.grid[c.y][c.x]=T.W;g.pups=g.pups.filter(p=>!(p.x===c.x&&p.y===c.y));for(const pid of["p1","p2"]){const e=g.ent[pid];if(e.alive&&e.gx===c.x&&e.gy===c.y)e.alive=false}bc(g,"wallPlace",{x:c.x,y:c.y})}g.sdI++;g.sdL=now}
  for(const b of[...g.bombs])if(now>=b.timer)explode(g,b);
  for(const kb of[...g.kicked]){const bomb=g.bombs.find(b=>b.id===kb.id);if(!bomb){g.kicked=g.kicked.filter(k=>k.id!==kb.id);continue}const tpx=kb.tx*CELL+CELL/2,tpy=kb.ty*CELL+CELL/2;const ddx=tpx-bomb.px,ddy=tpy-bomb.py;if(Math.abs(ddx)<KICK_SPD&&Math.abs(ddy)<KICK_SPD){bomb.px=tpx;bomb.py=tpy;bomb.gx=kb.tx;bomb.gy=kb.ty;g.kicked=g.kicked.filter(k=>k.id!==kb.id)}else{bomb.px+=Math.sign(ddx)*Math.min(KICK_SPD,Math.abs(ddx));bomb.py+=Math.sign(ddy)*Math.min(KICK_SPD,Math.abs(ddy));bomb.gx=Math.floor(bomb.px/CELL);bomb.gy=Math.floor(bomb.py/CELL);const nx=bomb.gx+kb.dx,ny=bomb.gy+kb.dy;if(nx<0||nx>=GW||ny<0||ny>=GH||g.grid[ny][nx]!==T.E||g.bombs.some(ob=>ob.id!==bomb.id&&ob.gx===nx&&ob.gy===ny)){bomb.px=bomb.gx*CELL+CELL/2;bomb.py=bomb.gy*CELL+CELL/2;g.kicked=g.kicked.filter(k=>k.id!==kb.id)}}}
  g.expl=g.expl.filter(e=>now-e.time<EXDUR);for(const ex of g.expl)for(const c of ex.cells){for(const pid of["p1","p2"]){const e=g.ent[pid];if(e.alive&&e.gx===c.x&&e.gy===c.y)e.alive=false}}
  if(!g.ent.p1.alive||!g.ent.p2.alive){let w="draw";if(!g.ent.p1.alive&&g.ent.p2.alive)w="p2";if(g.ent.p1.alive&&!g.ent.p2.alive)w="p1";endRound(gid,w);return}
  bc(g,"tick",{ent:sE(g.ent),bombs:g.bombs.map(b=>({gx:b.gx,gy:b.gy,px:b.px,py:b.py,timer:b.timer,id:b.id,owner:b.owner,range:b.range})),pups:g.pups,expl:g.expl.map(e=>({cells:e.cells,time:e.time})),grid:g.grid,timer:rem,emotes:g.emotes});
  g.emotes=g.emotes.filter(e=>now-e.time<2500)}

function explode(g,bomb){if(!g.bombs.some(b=>b.id===bomb.id))return;const owner=g.ent[bomb.owner];if(owner)owner.bL=Math.min(owner.bL+1,owner.mB);g.bombs=g.bombs.filter(b=>b.id!==bomb.id);g.kicked=g.kicked.filter(k=>k.id!==bomb.id);const cells=[{x:bomb.gx,y:bomb.gy}];const nP=new Set();
  for(const[dx,dy]of DR){for(let i=1;i<=bomb.range;i++){const nx=bomb.gx+dx*i,ny=bomb.gy+dy*i;if(nx<0||nx>=GW||ny<0||ny>=GH||g.grid[ny][nx]===T.W)break;if(g.grid[ny][nx]===T.B){g.grid[ny][nx]=T.E;cells.push({x:nx,y:ny});if(Math.random()<PUC){const pid=Math.random().toString(36);g.pups.push({x:nx,y:ny,type:PTS[Math.floor(Math.random()*4)],id:pid});nP.add(pid)}break}cells.push({x:nx,y:ny});const ch=g.bombs.find(b=>b.gx===nx&&b.gy===ny);if(ch){setTimeout(()=>explode(g,ch),80);break}}}
  g.pups=g.pups.filter(p=>{if(nP.has(p.id))return true;return!cells.some(c=>c.x===p.x&&c.y===p.y)});g.expl.push({cells,time:Date.now()});
  for(const pid of["p1","p2"]){const e=g.ent[pid];if(e.alive&&cells.some(c=>c.x===e.gx&&c.y===e.gy))e.alive=false}bc(g,"explosion",{cells,bx:bomb.gx,by:bomb.gy})}

function endRound(gid,winner){const g=games.get(gid);if(!g||g.phase!=="play")return;clearInterval(g.tick);g.phase="rEnd";if(winner==="p1"){g.sc.p1++;g.mStats.p1.kills++}else if(winner==="p2"){g.sc.p2++;g.mStats.p2.kills++}bc(g,"roundEnd",{winner,sc:g.sc});if(g.sc.p1>=3||g.sc.p2>=3)setTimeout(()=>endMatch(gid),2000);else setTimeout(()=>startCD(gid),2500)}

function calcXP(won,kills,pups){let xp=won?50:15;xp+=kills*10;xp+=pups*3;xp+=10;return xp} // win=50,loss=15,per kill=10,per pup=3,participation=10
function getLevel(xp){let lvl=1,need=100;while(xp>=need){xp-=need;lvl++;need=Math.floor(100+lvl*20)}return{level:lvl,xp,need}}
function applyXP(u,xpGain){u.xp=(u.xp||0)+xpGain;const lv=getLevel(u.xp);u.level=lv.level;
  // Season XP
  if(!u.seasonData)u.seasonData={};const sid=getSeasonId();if(!u.seasonData[sid])u.seasonData[sid]={xp:0,claimed:[],hasPass:false};
  u.seasonData[sid].xp=(u.seasonData[sid].xp||0)+xpGain}
function checkSeasonReset(u){const sid=getSeasonId();if(u.lastSeason!==sid){
  // Save hidden MMR = current LP, preserve for placement
  u.hiddenMMR=u.lp||0;
  // Reset LP but give soft placement: start at hiddenMMR * 0.3, capped at 400 (below Silver)
  u.lp=Math.min(400,Math.floor((u.hiddenMMR||0)*0.3));
  u.lastSeason=sid;pU(u);uLB(u)}}

function endMatch(gid){const g=games.get(gid);if(!g)return;g.phase="mEnd";clearInterval(g.tick);const mw=g.sc.p1>=3?"p1":"p2",ml=mw==="p1"?"p2":"p1";const wu=gU(g.pl[mw].name),lu=gU(g.pl[ml].name);
  if(wu&&lu){const wd=cLP(wu.lp,lu.lp,true),ld2=cLP(lu.lp,wu.lp,false);const wxp=calcXP(true,g.mStats[mw].kills,g.mStats[mw].pups);const lxp=calcXP(false,g.mStats[ml].kills,g.mStats[ml].pups);
    wu.lp=Math.max(0,wu.lp+wd);wu.wins=(wu.wins||0)+1;wu.games=(wu.games||0)+1;wu.currentStreak=(wu.currentStreak||0)+1;wu.bestStreak=Math.max(wu.bestStreak||0,wu.currentStreak);wu.kills=(wu.kills||0)+g.mStats[mw].kills;wu.bombsPlaced=(wu.bombsPlaced||0)+g.mStats[mw].bombs;wu.pupsCollected=(wu.pupsCollected||0)+g.mStats[mw].pups;applyXP(wu,wxp);wu.history=[{t:Date.now(),vs:lu.username,r:"W",s:`${g.sc.p1}-${g.sc.p2}`,lp:wd},...(wu.history||[]).slice(0,19)];pU(wu);uLB(wu);
    lu.lp=Math.max(0,lu.lp+ld2);lu.losses=(lu.losses||0)+1;lu.games=(lu.games||0)+1;lu.currentStreak=0;lu.kills=(lu.kills||0)+g.mStats[ml].kills;lu.bombsPlaced=(lu.bombsPlaced||0)+g.mStats[ml].bombs;lu.pupsCollected=(lu.pupsCollected||0)+g.mStats[ml].pups;applyXP(lu,lxp);lu.history=[{t:Date.now(),vs:wu.username,r:"L",s:`${g.sc.p1}-${g.sc.p2}`,lp:ld2},...(lu.history||[]).slice(0,19)];pU(lu);uLB(lu);
    g.pl[mw].sock.emit("matchEnd",{result:"win",lpD:wd,sc:g.sc,opp:lu.username,xp:wxp});g.pl[ml].sock.emit("matchEnd",{result:"lose",lpD:ld2,sc:g.sc,opp:wu.username,xp:lxp})}
  setTimeout(()=>{pGame.delete(g.pl.p1.sock.id);pGame.delete(g.pl.p2.sock.id);pInput.delete(g.pl.p1.sock.id);pInput.delete(g.pl.p2.sock.id);games.delete(gid)},5000)}

function endMatchDraw(gid){const g=games.get(gid);if(!g)return;g.phase="mEnd";clearInterval(g.tick);
  const u1=gU(g.pl.p1.name),u2=gU(g.pl.p2.name);
  if(u1){u1.games=(u1.games||0)+1;u1.kills=(u1.kills||0)+g.mStats.p1.kills;u1.bombsPlaced=(u1.bombsPlaced||0)+g.mStats.p1.bombs;u1.pupsCollected=(u1.pupsCollected||0)+g.mStats.p1.pups;u1.history=[{t:Date.now(),vs:u2?.username||"?",r:"D",s:`${g.sc.p1}-${g.sc.p2}`,lp:0},...(u1.history||[]).slice(0,19)];pU(u1)}
  if(u2){u2.games=(u2.games||0)+1;u2.kills=(u2.kills||0)+g.mStats.p2.kills;u2.bombsPlaced=(u2.bombsPlaced||0)+g.mStats.p2.bombs;u2.pupsCollected=(u2.pupsCollected||0)+g.mStats.p2.pups;u2.history=[{t:Date.now(),vs:u1?.username||"?",r:"D",s:`${g.sc.p1}-${g.sc.p2}`,lp:0},...(u2.history||[]).slice(0,19)];pU(u2)}
  bc(g,"matchEnd",{result:"draw",lpD:0,sc:g.sc,opp:""});
  setTimeout(()=>{pGame.delete(g.pl.p1.sock.id);pGame.delete(g.pl.p2.sock.id);pInput.delete(g.pl.p1.sock.id);pInput.delete(g.pl.p2.sock.id);games.delete(gid)},5000)}

io.on("connection",sock=>{
  onlineCount++;io.emit("onlineCount",onlineCount);console.log("+",sock.id,onlineCount);
  sock.on("register",({username,password},cb)=>{if(!username||!password||username.length<3)return cb({error:"Pseudo trop court"});if(gU(username))return cb({error:"Pseudo déjà pris"});const u={username,password,lp:0,wins:0,losses:0,games:0,avatar:"penguin",skin:"classic",arena:"glacier",flocons:500,ownedSkins:["classic"],ownedArenas:["glacier"],ownedAvatars:["penguin","polar","seal"],featuredBadges:[null,null,null],kills:0,bombsPlaced:0,pupsCollected:0,bestStreak:0,currentStreak:0,history:[],xp:0,level:1,ownedEmotes:["1","2","3","4"],selectedEmotes:["1","2","3","4",null],seasonData:{},lastSeason:getSeasonId()};pU(u);uLB(u);sock.data.username=username;cb({user:u})});
  sock.on("login",({username,password},cb)=>{const u=gU(username);if(!u)return cb({error:"Compte introuvable"});if(u.password!==password)return cb({error:"Mot de passe incorrect"});if(u.banned)return cb({error:"Compte banni. Contactez un administrateur."});
    // Migrate old emoji avatars to new ID system
    if(!u.ownedAvatars)u.ownedAvatars=["penguin","polar","seal"];
    if(u.avatar&&u.avatar.length>3){u.avatar="penguin"}// emoji was set, reset to default ID
    if(!u.ownedEmotes)u.ownedEmotes=["1","2","3","4"];
    if(!u.selectedEmotes)u.selectedEmotes=["1","2","3","4",null];
    checkSeasonReset(u);sock.data.username=username;u.lastSeen=Date.now();pU(u);cb({user:u})});
  sock.on("getUser",({username},cb)=>{const u=gU(username);if(u){checkSeasonReset(u);const{password,...safe}=u;cb({user:safe})}else cb({user:null})});
  sock.on("updateUser",({user},cb)=>{const ex=gU(user.username);if(ex){const upd={...ex,...user,password:ex.password};pU(upd);uLB(upd);cb({user:upd})}else cb({error:"Not found"})});
  sock.on("getLB",(_,cb)=>cb({lb:gLB()}));
  sock.on("getChat",(_,cb)=>cb({chat:gCh()}));
  sock.on("sendChat",({username,message})=>{const u=gU(username);if(!u||!message?.trim())return;const c=gCh();c.push({u:username,m:message.trim(),t:Date.now(),r:rN(u.lp),rc:rC(u.lp),a:u.avatar||"🐧"});if(c.length>30)c.splice(0,c.length-30);sCh(c);io.emit("chatUpdate",{chat:c})});
  sock.on("gameChat",({message})=>{const gid=pGame.get(sock.id);if(!gid)return;const g=games.get(gid);if(!g)return;const pid=g.pl.p1.sock.id===sock.id?"p1":"p2";bc(g,"gameChatMsg",{username:g.pl[pid].name,message:message?.trim(),pid})});
  sock.on("findMatch",({username,lp})=>{
    // Remove this socket from queue if already there
    const i=queue.findIndex(q=>q.socket.id===sock.id);if(i>=0)queue.splice(i,1);
    // Prevent same username from being in queue twice (different tab)
    const dup=queue.findIndex(q=>q.username===username);if(dup>=0)queue.splice(dup,1);
    // Prevent queueing if already in a game
    if(pGame.has(sock.id)){sock.emit("queueUpdate",{pos:0});return}
    queue.push({socket:sock,username,lp});sock.emit("queueUpdate",{pos:queue.length});findMatch()});
  sock.on("cancelQueue",()=>{const i=queue.findIndex(q=>q.socket.id===sock.id);if(i>=0)queue.splice(i,1)});
  sock.on("acceptMatch",({proposalId})=>{const pr=proposals.get(proposalId);if(!pr)return;
    const role=pr.p1.socket.id===sock.id?"p1":"p2";pr.accepted[role]=true;
    // Notify other player
    const other=role==="p1"?pr.p2:pr.p1;other.socket.emit("matchAccepted",{who:role});
    if(pr.accepted.p1&&pr.accepted.p2){clearTimeout(pr.timer);proposals.delete(proposalId);createGame(pr.p1,pr.p2)}});
  sock.on("declineMatch",({proposalId})=>{const pr=proposals.get(proposalId);if(!pr)return;clearTimeout(pr.timer);proposals.delete(proposalId);
    const role=pr.p1.socket.id===sock.id?"p1":"p2";const other=role==="p1"?"p2":"p1";
    // Put the OTHER player back in queue
    queue.push(pr[other]);pr[other].socket.emit("matchDeclined",{reason:"Adversaire a refusé"});
    pr[role].socket.emit("matchDeclined",{reason:"Match refusé"});findMatch()});
  sock.on("getSeasonInfo",(_,cb)=>cb({seasonId:getSeasonId(),seasonEnd:getSeasonEnd(),rewards:SEASON_REWARDS}));
  sock.on("getShopRotation",(_,cb)=>{
    const SKIN_POOL=["fire","toxic","royal","golden","shadow","captain","military","samurai","ninja","wizard","chef","astronaut","pirate","cowboy","hockey","disco","ghost","zombie","robot","cyber","neon","rainbow","crystal_skin","frost","inferno_king"];
    const ARENA_POOL=["volcano","forest","crystal","desert","space","underwater","candy","haunted","neon_city","cyberpunk","temple","ruins"];
    const EMOTE_POOL=["6","7","8","9","10","11","12","13","14","15","16","17","18","19","20"];
    const AVATAR_POOL=["whale","dolphin","snowman","snowflake","ice","shark","octopus","squid","fish","otter","crab","penguin_cool","fox","wolf","tiger","dragon_baby","ghost_av","unicorn","alien","robot_av","dragon","fire_av","star_av","diamond","crown_av"];
    const sid=getDailyShopId();
    cb({
      endMs:getShopEndMs(),
      shopId:sid,
      skins:shopRotation(SKIN_POOL,4,sid),
      arenas:shopRotation(ARENA_POOL,3,sid+"a"),
      emotes:shopRotation(EMOTE_POOL,5,sid+"e"),
      avatars:shopRotation(AVATAR_POOL,4,sid+"v")
    });
  });
  sock.on("claimReward",({tier},cb)=>{const u=gU(sock.data?.username);if(!u){cb({error:"Non connecté"});return}const sid=getSeasonId();if(!u.seasonData)u.seasonData={};if(!u.seasonData[sid])u.seasonData[sid]={xp:0,claimed:[],hasPass:false};const info=getTier(u.seasonData[sid].xp);const r=SEASON_REWARDS.find(x=>x.tier===tier);if(!r){cb({error:"Palier introuvable"});return}if(info.tier<tier){cb({error:"Palier pas encore atteint"});return}if(u.seasonData[sid].claimed.includes(tier)){cb({error:"Déjà réclamé"});return}if(!r.free&&!u.seasonData[sid].hasPass){cb({error:"Passe de combat requis"});return}
    // Grant reward
    if(r.type==="flocons")u.flocons=(u.flocons||0)+r.value;
    else if(r.type==="skin"&&!u.ownedSkins.includes(r.value))u.ownedSkins.push(r.value);
    else if(r.type==="arena"&&!u.ownedArenas.includes(r.value))u.ownedArenas.push(r.value);
    else if(r.type==="emote"&&!(u.ownedEmotes||[]).includes(r.value)){if(!u.ownedEmotes)u.ownedEmotes=["1","2","3","4"];u.ownedEmotes.push(r.value)}
    else if(r.type==="avatar"){if(!u.ownedAvatars)u.ownedAvatars=["penguin","polar","seal"];if(!u.ownedAvatars.includes(r.value))u.ownedAvatars.push(r.value)}
    u.seasonData[sid].claimed.push(tier);pU(u);cb({user:u})});
  sock.on("buyBattlePass",(_,cb)=>{const u=gU(sock.data?.username);if(!u){cb({error:"Non connecté"});return}const PASS_PRICE=500;if((u.flocons||0)<PASS_PRICE){cb({error:"Pas assez de Flocons"});return}const sid=getSeasonId();if(!u.seasonData)u.seasonData={};if(!u.seasonData[sid])u.seasonData[sid]={xp:0,claimed:[],hasPass:false};if(u.seasonData[sid].hasPass){cb({error:"Passe déjà acheté"});return}u.flocons-=PASS_PRICE;u.seasonData[sid].hasPass=true;pU(u);cb({user:u})});
  sock.on("move",dir=>{if(dir&&dir.dx!==undefined)pInput.set(sock.id,dir)});
  sock.on("bomb",()=>{const gid=pGame.get(sock.id);if(!gid)return;const g=games.get(gid);if(!g||g.phase!=="play")return;const pid=g.pl.p1.sock.id===sock.id?"p1":"p2";const e=g.ent[pid];if(!e.alive||e.bL<=0||g.bombs.some(b=>b.gx===e.gx&&b.gy===e.gy))return;e.bL--;g.bombs.push({gx:e.gx,gy:e.gy,px:e.gx*CELL+CELL/2,py:e.gy*CELL+CELL/2,range:e.range,owner:pid,timer:Date.now()+FUSE,id:Math.random().toString(36)});g.mStats[pid].bombs++});
  sock.on("emote",({key})=>{const gid=pGame.get(sock.id);if(!gid)return;const g=games.get(gid);if(!g)return;const pid=g.pl.p1.sock.id===sock.id?"p1":"p2";const u=gU(g.pl[pid].name);if(!u||!(u.selectedEmotes||[]).includes(key))return;if(!g.emoteCD)g.emoteCD={p1:0,p2:0};const now=Date.now();if(now-g.emoteCD[pid]<2000)return;g.emoteCD[pid]=now;g.emotes.push({pid,key,time:now})});
  // Draw proposal
  sock.on("proposeDraw",()=>{const gid=pGame.get(sock.id);if(!gid)return;const g=games.get(gid);if(!g||g.phase==="mEnd")return;const pid=g.pl.p1.sock.id===sock.id?"p1":"p2";if(g.drawUsed[pid])return;g.drawUsed[pid]=true;g.drawProposed=pid;const other=pid==="p1"?"p2":"p1";g.pl[other].sock.emit("drawProposal",{from:g.pl[pid].name})});
  sock.on("respondDraw",({accept})=>{const gid=pGame.get(sock.id);if(!gid)return;const g=games.get(gid);if(!g||!g.drawProposed)return;if(accept){endMatchDraw(gid)}else{const proposer=g.drawProposed;g.drawProposed=null;g.pl[proposer].sock.emit("drawRejected",{})}});
  // Ping
  sock.on("ping_req",(_,cb)=>{if(cb)cb({t:Date.now()})});
  // NEWS (public read)
  sock.on("getNews",(_,cb)=>{cb({news:gNews()})});
  // ADMIN — all verified via sock.data.username
  sock.on("admin_check",(_,cb)=>{const u=gU(sock.data?.username);cb({isAdmin:isAdmin(u)})});
  sock.on("admin_listUsers",(_,cb)=>{const u=gU(sock.data?.username);if(!isAdmin(u)){cb({error:"Non autorisé"});return}
    const all=ld("users.json",{});const list=Object.values(all).map(x=>({username:x.username,lp:x.lp||0,games:x.games||0,wins:x.wins||0,flocons:x.flocons||0,banned:!!x.banned,level:x.level||1,lastSeen:x.lastSeen||0}));list.sort((a,b)=>b.lp-a.lp);cb({users:list})});
  sock.on("admin_banUser",({username,banned},cb)=>{const u=gU(sock.data?.username);if(!isAdmin(u)){cb({error:"Non autorisé"});return}const target=gU(username);if(!target){cb({error:"Utilisateur introuvable"});return}if(isAdmin(target)){cb({error:"Impossible de bannir un admin"});return}target.banned=!!banned;pU(target);cb({ok:true})});
  sock.on("admin_renameUser",({oldName,newName},cb)=>{const u=gU(sock.data?.username);if(!isAdmin(u)){cb({error:"Non autorisé"});return}if(!newName||newName.length<3){cb({error:"Pseudo trop court"});return}if(gU(newName)){cb({error:"Pseudo déjà pris"});return}const target=gU(oldName);if(!target){cb({error:"Utilisateur introuvable"});return}
    const all=ld("users.json",{});delete all[oldName.toLowerCase()];target.username=newName;all[newName.toLowerCase()]=target;sv("users.json",all);
    const lb=gLB();const e=lb.find(x=>x.u===oldName);if(e)e.u=newName;sLB(lb);
    cb({ok:true})});
  sock.on("admin_giveFlocons",({username,amount},cb)=>{const u=gU(sock.data?.username);if(!isAdmin(u)){cb({error:"Non autorisé"});return}const target=gU(username);if(!target){cb({error:"Utilisateur introuvable"});return}const amt=parseInt(amount)||0;target.flocons=Math.max(0,(target.flocons||0)+amt);pU(target);cb({ok:true,flocons:target.flocons})});
  sock.on("admin_createNews",({title,html},cb)=>{const u=gU(sock.data?.username);if(!isAdmin(u)){cb({error:"Non autorisé"});return}if(!title||!html){cb({error:"Titre et contenu requis"});return}const news=gNews();const art={id:Date.now(),title:String(title).slice(0,200),html:String(html).slice(0,20000),author:u.username,createdAt:Date.now()};news.unshift(art);if(news.length>50)news.length=50;sNews(news);io.emit("newsPublished",{id:art.id});cb({ok:true,article:art})});
  sock.on("admin_deleteNews",({id},cb)=>{const u=gU(sock.data?.username);if(!isAdmin(u)){cb({error:"Non autorisé"});return}let news=gNews();news=news.filter(n=>n.id!==id);sNews(news);cb({ok:true})});
  sock.on("disconnect",()=>{onlineCount--;io.emit("onlineCount",onlineCount);console.log("-",sock.id,onlineCount);pInput.delete(sock.id);const i=queue.findIndex(q=>q.socket.id===sock.id);if(i>=0)queue.splice(i,1);const gid=pGame.get(sock.id);if(gid){const g=games.get(gid);if(g&&g.phase!=="mEnd"){const w=g.pl.p1.sock.id===sock.id?"p2":"p1";g.sc[w]=3;endMatch(gid)}}});
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`🐧 Bomber Pengu on port ${PORT}`));
