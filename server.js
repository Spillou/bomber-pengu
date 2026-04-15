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

const IW=13,IH=11,GW=IW+2,GH=IH+2,CELL=52;
const FUSE=3400,EXDUR=500,RTIME=120,SDI=400;
const PUC=0.4,SR=2,SPD=2.2,CC=11,TICK=1000/60,KICK_SPD=2.5;
const T={E:0,W:1,B:2},DR=[[0,-1],[0,1],[-1,0],[1,0]],PTS=["range","bombs","speed","kick"];
const TN=["Bronze","Argent","Or","Platine","Diamant","Maître"];
const TC=["#CD7F32","#C0C0C0","#FFD700","#00CED1","#B9F2FF","#FF6B6B"];
function rN(lp){if(lp>=2000)return"Maître";const t=Math.min(4,Math.floor(lp/400));return`${TN[t]} ${4-Math.floor((lp-t*400)/100)}`}
function rC(lp){if(lp>=2000)return TC[5];return TC[Math.min(4,Math.floor(lp/400))]}
function cLP(m,o,w){const b=w?28:-18,s=w?Math.max(.6,1.3-m/3e3):Math.min(1.4,.8+m/3e3),d=o-m,x=w?Math.max(0,d/200)*5:Math.min(0,d/200)*3;return Math.round(b*s+x)}

function mkG(){const g=Array.from({length:GH},()=>Array(GW).fill(T.E));for(let y=0;y<GH;y++)for(let x=0;x<GW;x++)if(x===0||x===GW-1||y===0||y===GH-1)g[y][x]=T.W;for(let iy=0;iy<IH;iy++)for(let ix=0;ix<IW;ix++)if(ix%2===1&&iy%2===1)g[iy+1][ix+1]=T.W;const sf=new Set();[[1,1],[2,1],[1,2],[3,1],[1,3]].forEach(([x,y])=>sf.add(`${x},${y}`));const ax=GW-2,ay=GH-2;[[ax,ay],[ax-1,ay],[ax,ay-1],[ax-2,ay],[ax,ay-2]].forEach(([x,y])=>sf.add(`${x},${y}`));for(let y=1;y<GH-1;y++)for(let x=1;x<GW-1;x++)if(g[y][x]===T.E&&!sf.has(`${x},${y}`)&&Math.random()<.6)g[y][x]=T.B;return g}
function genSp(){const o=[],v=new Set();let t=1,b=GH-2,l=1,r=GW-2;while(t<=b&&l<=r){for(let x=l;x<=r;x++){const k=`${x},${t}`;if(!v.has(k)){v.add(k);o.push({x,y:t})}}t++;for(let y=t;y<=b;y++){const k=`${r},${y}`;if(!v.has(k)){v.add(k);o.push({x:r,y})}}r--;for(let x=r;x>=l;x--){const k=`${x},${b}`;if(!v.has(k)){v.add(k);o.push({x,y:b})}}b--;for(let y=b;y>=t;y--){const k=`${l},${y}`;if(!v.has(k)){v.add(k);o.push({x:l,y})}}l++}return o}

function isBlk(grid,px,py,hs){const bl=v=>v===T.W||v===T.B;const x0=Math.floor((px-hs)/CELL),x1=Math.floor((px+hs)/CELL),y0=Math.floor((py-hs)/CELL),y1=Math.floor((py+hs)/CELL);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(bl(grid[y]?.[x]))return true;return false}
function tryMv(e,dx,dy,spd,grid,bombs,g){const hs=CELL/2-6;let nx=e.px+dx*spd,ny=e.py+dy*spd;if(dx){const c=e.gy*CELL+CELL/2,d=c-e.py;if(Math.abs(d)>.5)ny=e.py+Math.sign(d)*Math.min(spd,Math.abs(d));else ny=c}if(dy){const c=e.gx*CELL+CELL/2,d=c-e.px;if(Math.abs(d)>.5)nx=e.px+Math.sign(d)*Math.min(spd,Math.abs(d));else nx=c}if(!isBlk(grid,nx,ny,hs)){const ngx=Math.floor(nx/CELL),ngy=Math.floor(ny/CELL);const onB=bombs.some(b=>b.gx===ngx&&b.gy===ngy),wasOn=bombs.some(b=>b.gx===e.gx&&b.gy===e.gy);if(onB&&!(ngx===e.gx&&ngy===e.gy)&&!wasOn){if(e.kick){const bomb=bombs.find(b=>b.gx===ngx&&b.gy===ngy);if(bomb&&!g.kicked.some(k=>k.id===bomb.id)){let fx=ngx,fy=ngy;while(true){const nnx=fx+dx,nny=fy+dy;if(nnx<0||nnx>=GW||nny<0||nny>=GH||grid[nny][nnx]!==T.E||bombs.some(b=>b.id!==bomb.id&&b.gx===nnx&&b.gy===nny))break;fx=nnx;fy=nny}if(fx!==ngx||fy!==ngy)g.kicked.push({id:bomb.id,tx:fx,ty:fy,dx,dy})}}return false}e.px=nx;e.py=ny;e.gx=Math.floor(nx/CELL);e.gy=Math.floor(ny/CELL);return true}if(dx&&!dy){for(const n of[-1,1]){const tc=Math.round((e.py+n)/CELL)*CELL+CELL/2;if(Math.abs(e.py-tc)<CC&&!isBlk(grid,nx,tc,hs)){const ng=Math.floor(nx/CELL),ng2=Math.floor(tc/CELL);if(!bombs.some(b=>b.gx===ng&&b.gy===ng2)){e.px=nx;e.py=tc;e.gx=ng;e.gy=ng2;return true}}}}if(dy&&!dx){for(const n of[-1,1]){const tc=Math.round((e.px+n)/CELL)*CELL+CELL/2;if(Math.abs(e.px-tc)<CC&&!isBlk(grid,tc,ny,hs)){const ng=Math.floor(tc/CELL),ng2=Math.floor(ny/CELL);if(!bombs.some(b=>b.gx===ng&&b.gy===ng2)){e.px=tc;e.py=ny;e.gx=ng;e.gy=ng2;return true}}}}return false}

const queue=[],games=new Map(),pGame=new Map(),pInput=new Map();
let onlineCount=0;

function findMatch(){if(queue.length<2)return;queue.sort((a,b)=>a.lp-b.lp);let bi=0,bd=Infinity;for(let i=0;i<queue.length-1;i++){const d=Math.abs(queue[i].lp-queue[i+1].lp);if(d<bd){bd=d;bi=i}}const p1=queue.splice(bi+1,1)[0],p2=queue.splice(bi,1)[0];createGame(p1,p2)}

function createGame(p1,p2){const gid=`g_${Date.now()}_${Math.random().toString(36).substr(2,4)}`;const u1=gU(p1.username),u2=gU(p2.username);
  const g={id:gid,pl:{p1:{sock:p1.socket,name:p1.username,lp:p1.lp,skin:u1?.skin||"classic",arena:u1?.arena||"glacier",avatar:u1?.avatar||"🐧"},p2:{sock:p2.socket,name:p2.username,lp:p2.lp,skin:u2?.skin||"classic",arena:u2?.arena||"glacier",avatar:u2?.avatar||"🐧"}},sc:{p1:0,p2:0},rn:0,phase:"cd",cd:3,grid:null,ent:null,bombs:[],expl:[],pups:[],kicked:[],emotes:[],sd:false,sdO:[],sdI:0,sdL:0,rStart:0,tick:null,cdInt:null,curArena:"glacier",drawProposed:null,drawUsed:{p1:false,p2:false}};
  games.set(gid,g);pGame.set(p1.socket.id,gid);pGame.set(p2.socket.id,gid);pInput.set(p1.socket.id,{dx:0,dy:0});pInput.set(p2.socket.id,{dx:0,dy:0});
  const mkI=u=>({username:u?.username,lp:u?.lp,skin:u?.skin,arena:u?.arena,avatar:u?.avatar||"🐧"});
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
  for(const pid of["p1","p2"]){const e=g.ent[pid];if(!e.alive)continue;const inp=pInput.get(g.pl[pid].sock.id)||{dx:0,dy:0};if(inp.dx||inp.dy){e.dir={dx:inp.dx,dy:inp.dy};const spd=SPD*(1+(e.spd-1)*.3);if(tryMv(e,inp.dx,inp.dy,spd,g.grid,g.bombs,g)){const pi=g.pups.findIndex(p=>p.x===e.gx&&p.y===e.gy);if(pi>=0){const pu=g.pups[pi];if(pu.type==="range")e.range=Math.min(e.range+1,8);if(pu.type==="bombs"){e.mB++;e.bL++}if(pu.type==="speed")e.spd=Math.min(e.spd+1,3);if(pu.type==="kick")e.kick=true;g.pups.splice(pi,1);bc(g,"pickup",{pid,type:pu.type,x:e.gx,y:e.gy})}}}}
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

function endRound(gid,winner){const g=games.get(gid);if(!g||g.phase!=="play")return;clearInterval(g.tick);g.phase="rEnd";if(winner==="p1")g.sc.p1++;else if(winner==="p2")g.sc.p2++;bc(g,"roundEnd",{winner,sc:g.sc});if(g.sc.p1>=3||g.sc.p2>=3)setTimeout(()=>endMatch(gid),2000);else setTimeout(()=>startCD(gid),2500)}

function endMatch(gid){const g=games.get(gid);if(!g)return;g.phase="mEnd";clearInterval(g.tick);const mw=g.sc.p1>=3?"p1":"p2",ml=mw==="p1"?"p2":"p1";const wu=gU(g.pl[mw].name),lu=gU(g.pl[ml].name);
  if(wu&&lu){const wd=cLP(wu.lp,lu.lp,true),ld2=cLP(lu.lp,wu.lp,false);wu.lp=Math.max(0,wu.lp+wd);wu.wins=(wu.wins||0)+1;wu.games=(wu.games||0)+1;wu.currentStreak=(wu.currentStreak||0)+1;wu.bestStreak=Math.max(wu.bestStreak||0,wu.currentStreak);wu.history=[{t:Date.now(),vs:lu.username,r:"W",s:`${g.sc.p1}-${g.sc.p2}`,lp:wd},...(wu.history||[]).slice(0,19)];pU(wu);uLB(wu);
    lu.lp=Math.max(0,lu.lp+ld2);lu.losses=(lu.losses||0)+1;lu.games=(lu.games||0)+1;lu.currentStreak=0;lu.history=[{t:Date.now(),vs:wu.username,r:"L",s:`${g.sc.p1}-${g.sc.p2}`,lp:ld2},...(lu.history||[]).slice(0,19)];pU(lu);uLB(lu);
    g.pl[mw].sock.emit("matchEnd",{result:"win",lpD:wd,sc:g.sc,opp:lu.username});g.pl[ml].sock.emit("matchEnd",{result:"lose",lpD:ld2,sc:g.sc,opp:wu.username})}
  setTimeout(()=>{pGame.delete(g.pl.p1.sock.id);pGame.delete(g.pl.p2.sock.id);pInput.delete(g.pl.p1.sock.id);pInput.delete(g.pl.p2.sock.id);games.delete(gid)},5000)}

function endMatchDraw(gid){const g=games.get(gid);if(!g)return;g.phase="mEnd";clearInterval(g.tick);
  const u1=gU(g.pl.p1.name),u2=gU(g.pl.p2.name);
  if(u1){u1.games=(u1.games||0)+1;u1.history=[{t:Date.now(),vs:u2?.username||"?",r:"D",s:`${g.sc.p1}-${g.sc.p2}`,lp:0},...(u1.history||[]).slice(0,19)];pU(u1)}
  if(u2){u2.games=(u2.games||0)+1;u2.history=[{t:Date.now(),vs:u1?.username||"?",r:"D",s:`${g.sc.p1}-${g.sc.p2}`,lp:0},...(u2.history||[]).slice(0,19)];pU(u2)}
  bc(g,"matchEnd",{result:"draw",lpD:0,sc:g.sc,opp:""});
  setTimeout(()=>{pGame.delete(g.pl.p1.sock.id);pGame.delete(g.pl.p2.sock.id);pInput.delete(g.pl.p1.sock.id);pInput.delete(g.pl.p2.sock.id);games.delete(gid)},5000)}

io.on("connection",sock=>{
  onlineCount++;io.emit("onlineCount",onlineCount);console.log("+",sock.id,onlineCount);
  sock.on("register",({username,password},cb)=>{if(!username||!password||username.length<3)return cb({error:"Pseudo trop court"});if(gU(username))return cb({error:"Pseudo déjà pris"});const u={username,password,lp:0,wins:0,losses:0,games:0,avatar:"🐧",skin:"classic",arena:"glacier",flocons:500,ownedSkins:["classic"],ownedArenas:["glacier"],featuredBadges:[null,null,null],kills:0,bombsPlaced:0,pupsCollected:0,bestStreak:0,currentStreak:0,history:[]};pU(u);uLB(u);cb({user:u})});
  sock.on("login",({username,password},cb)=>{const u=gU(username);if(!u)return cb({error:"Compte introuvable"});if(u.password!==password)return cb({error:"Mot de passe incorrect"});cb({user:u})});
  sock.on("getUser",({username},cb)=>{const u=gU(username);if(u){const{password,...safe}=u;cb({user:safe})}else cb({user:null})});
  sock.on("updateUser",({user},cb)=>{const ex=gU(user.username);if(ex){const upd={...ex,...user,password:ex.password};pU(upd);uLB(upd);cb({user:upd})}else cb({error:"Not found"})});
  sock.on("getLB",(_,cb)=>cb({lb:gLB()}));
  sock.on("getChat",(_,cb)=>cb({chat:gCh()}));
  sock.on("sendChat",({username,message})=>{const u=gU(username);if(!u||!message?.trim())return;const c=gCh();c.push({u:username,m:message.trim(),t:Date.now(),r:rN(u.lp),rc:rC(u.lp),a:u.avatar||"🐧"});if(c.length>50)c.splice(0,c.length-50);sCh(c);io.emit("chatUpdate",{chat:c})});
  sock.on("gameChat",({message})=>{const gid=pGame.get(sock.id);if(!gid)return;const g=games.get(gid);if(!g)return;const pid=g.pl.p1.sock.id===sock.id?"p1":"p2";bc(g,"gameChatMsg",{username:g.pl[pid].name,message:message?.trim(),pid})});
  sock.on("findMatch",({username,lp})=>{const i=queue.findIndex(q=>q.socket.id===sock.id);if(i>=0)queue.splice(i,1);queue.push({socket:sock,username,lp});sock.emit("queueUpdate",{pos:queue.length});findMatch()});
  sock.on("cancelQueue",()=>{const i=queue.findIndex(q=>q.socket.id===sock.id);if(i>=0)queue.splice(i,1)});
  sock.on("move",dir=>{if(dir&&dir.dx!==undefined)pInput.set(sock.id,dir)});
  sock.on("bomb",()=>{const gid=pGame.get(sock.id);if(!gid)return;const g=games.get(gid);if(!g||g.phase!=="play")return;const pid=g.pl.p1.sock.id===sock.id?"p1":"p2";const e=g.ent[pid];if(!e.alive||e.bL<=0||g.bombs.some(b=>b.gx===e.gx&&b.gy===e.gy))return;e.bL--;g.bombs.push({gx:e.gx,gy:e.gy,px:e.gx*CELL+CELL/2,py:e.gy*CELL+CELL/2,range:e.range,owner:pid,timer:Date.now()+FUSE,id:Math.random().toString(36)})});
  sock.on("emote",({key})=>{const gid=pGame.get(sock.id);if(!gid)return;const g=games.get(gid);if(!g)return;const pid=g.pl.p1.sock.id===sock.id?"p1":"p2";g.emotes.push({pid,key,time:Date.now()})});
  // Draw proposal
  sock.on("proposeDraw",()=>{const gid=pGame.get(sock.id);if(!gid)return;const g=games.get(gid);if(!g||g.phase==="mEnd")return;const pid=g.pl.p1.sock.id===sock.id?"p1":"p2";if(g.drawUsed[pid])return;g.drawUsed[pid]=true;g.drawProposed=pid;const other=pid==="p1"?"p2":"p1";g.pl[other].sock.emit("drawProposal",{from:g.pl[pid].name})});
  sock.on("respondDraw",({accept})=>{const gid=pGame.get(sock.id);if(!gid)return;const g=games.get(gid);if(!g||!g.drawProposed)return;if(accept){endMatchDraw(gid)}else{const proposer=g.drawProposed;g.drawProposed=null;g.pl[proposer].sock.emit("drawRejected",{})}});
  // Ping
  sock.on("ping_req",(_,cb)=>{if(cb)cb({t:Date.now()})});
  sock.on("disconnect",()=>{onlineCount--;io.emit("onlineCount",onlineCount);console.log("-",sock.id,onlineCount);pInput.delete(sock.id);const i=queue.findIndex(q=>q.socket.id===sock.id);if(i>=0)queue.splice(i,1);const gid=pGame.get(sock.id);if(gid){const g=games.get(gid);if(g&&g.phase!=="mEnd"){const w=g.pl.p1.sock.id===sock.id?"p2":"p1";g.sc[w]=3;endMatch(gid)}}});
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`🐧 Bomber Pengu on port ${PORT}`));
