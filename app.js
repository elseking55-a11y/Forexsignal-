const WS_URL="wss://ws.binaryws.com/websockets/v3";
const TF={60:"M1",120:"M2",180:"M3",300:"M5",600:"M10",900:"M15",1800:"M30",3600:"H1",7200:"H2",14400:"H4",28800:"H8",43200:"H12",86400:"D1"};
const MTF=[300,900,3600,14400];
const state={ws:null,symbol:null,tf:300,candles:[],tick:null,req:0,symbols:[],mtf:{},reqTf:{},subTf:{}};
const $=id=>document.getElementById(id);
const els={symbol:$("symbol"),price:$("price"),updated:$("updated"),signal:$("signal"),confidence:$("confidence"),trend:$("trend"),momentum:$("momentum"),rsi:$("rsi"),atr:$("atr"),resistance:$("resistance"),support:$("support"),entry:$("entry"),reason:$("reason"),invalidation:$("invalidation"),tp1:$("tp1"),tp2:$("tp2"),tp3:$("tp3"),risk:$("risk"),chart:$("chart"),marketTitle:$("marketTitle"),tfTitle:$("tfTitle"),signalCard:$("signalCard"),connection:$("connection"),mtfBody:$("mtfBody"),mtfSummary:$("mtfSummary")};
function send(p){if(state.ws?.readyState===1){const req_id=++state.req;state.ws.send(JSON.stringify({...p,req_id}));return req_id}}
function connect(){if(state.ws)try{state.ws.close()}catch{}state.ws=new WebSocket(WS_URL);state.ws.onopen=()=>{els.connection.className="status live";els.connection.innerHTML="<span></span> DERIV LIVE";send({active_symbols:"brief",product_type:"basic"})};state.ws.onclose=()=>{els.connection.className="status";els.connection.innerHTML="<span></span> DISCONNECTED";setTimeout(connect,2500)};state.ws.onerror=()=>{els.connection.className="status error";els.connection.innerHTML="<span></span> CONNECTION ERROR"};state.ws.onmessage=e=>handle(JSON.parse(e.data))}
function handle(d){
 if(d.msg_type==="active_symbols"){state.symbols=d.active_symbols||[];const preferred=state.symbols.find(s=>/gold|xau/i.test((s.display_name||"")+" "+(s.symbol||"")))||state.symbols.find(s=>/usd/i.test(s.symbol||""));els.symbol.innerHTML=state.symbols.filter(s=>s.symbol).map(s=>'<option value="'+esc(s.symbol)+'">'+esc(s.display_name||s.symbol)+'</option>').join("");if(preferred)els.symbol.value=preferred.symbol;load()}
 if(d.msg_type==="candles"){const tf=state.reqTf[d.req_id]||state.subTf[d.subscription?.id];if(tf){const candles=(d.candles||[]).map(c=>({t:+c.epoch,o:+c.open,h:+c.high,l:+c.low,c:+c.close}));if(candles.length){state.mtf[tf]=candles;if(tf===state.tf){state.candles=candles;draw()}renderMTF();analyzeMTF()}}if(d.subscription?.id&&tf)state.subTf[d.subscription.id]=tf}
 if(d.msg_type==="ohlc"){const tf=state.reqTf[d.req_id]||state.subTf[d.ohlc?.subscription?.id];if(tf&&d.ohlc){const q=d.ohlc,c=state.mtf[tf]||[];const item={t:+q.epoch,o:+q.open,h:+q.high,l:+q.low,c:+q.close};if(c.length&&c.at(-1).t===item.t)c[c.length-1]=item;else c.push(item);state.mtf[tf]=c.slice(-180);if(tf===state.tf){state.candles=state.mtf[tf];draw()}renderMTF();analyzeMTF()}}
 if(d.msg_type==="tick"&&d.tick){state.tick=+d.tick.quote;els.price.textContent=fmt(state.tick);els.updated.textContent=new Date(d.tick.epoch*1000).toLocaleTimeString();if(state.candles.length)draw();analyzeMTF()}
}
function load(){
 state.symbol=els.symbol.value;if(!state.symbol)return;
 state.candles=[];state.mtf={};state.reqTf={};state.subTf={};
 MTF.forEach(tf=>{const id=send({ticks_history:state.symbol,end:"latest",count:180,style:"candles",granularity:tf,subscribe:1});if(id)state.reqTf[id]=tf});
 const id=send({ticks:state.symbol,subscribe:1});state.marketReq=id;
 const s=state.symbols.find(x=>x.symbol===state.symbol);els.marketTitle.textContent=s?.display_name||state.symbol;els.tfTitle.textContent=tfName(state.tf);
}
function tfName(v){return TF[v]||String(v)+"s"}
function fmt(v){return Number(v).toLocaleString(undefined,{maximumFractionDigits:5})}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function ema(a,n){if(!a.length)return 0;const k=2/(n+1);let e=a[0];for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return e}
function rsi(a,n=14){if(a.length<n+1)return 50;let g=0,l=0;for(let i=a.length-n;i<a.length;i++){const x=a[i]-a[i-1];if(x>=0)g+=x;else l-=x}if(l===0)return 100;return 100-(100/(1+(g/n)/(l/n)))}
function atr(cs,n=14){if(cs.length<n+1)return 0;const tr=[];for(let i=1;i<cs.length;i++)tr.push(Math.max(cs[i].h-cs[i].l,Math.abs(cs[i].h-cs[i-1].c),Math.abs(cs[i].l-cs[i-1].c)));return tr.slice(-n).reduce((a,b)=>a+b,0)/Math.min(n,tr.length)}
function levels(cs){const recent=cs.slice(-40);return{res:Math.max(...recent.map(x=>x.h)),sup:Math.min(...recent.map(x=>x.l))}}
function structure(cs){
 if(!cs||cs.length<30)return{state:"WAIT",score:0,rsi:50,atr:0,res:0,sup:0,momentum:0,reason:"Waiting for enough candles."};
 const closes=cs.map(x=>x.c),price=closes.at(-1),e9=ema(closes.slice(-80),9),e21=ema(closes.slice(-80),21),e50=ema(closes.slice(-100),50),R=rsi(closes),A=atr(cs),lv=levels(cs),slope=closes.at(-1)-closes[Math.max(0,closes.length-8)];
 const bullish=e9>e21&&e21>e50&&slope>0,bearish=e9<e21&&e21<e50&&slope<0;
 const recent=cs.slice(-12),prev=cs.slice(-24,-12);const recentHigh=Math.max(...recent.map(x=>x.h)),prevHigh=Math.max(...prev.map(x=>x.h));const recentLow=Math.min(...recent.map(x=>x.l)),prevLow=Math.min(...prev.map(x=>x.l));
 const bosBull=recentHigh>prevHigh,bosBear=recentLow<prevLow;
 let st=bullish?"BULLISH":bearish?"BEARISH":"MIXED";let score=bullish?2:bearish?-2:0;if(bosBull)score+=.75;if(bosBear)score-=.75;if(R>70)score-=.25;if(R<30)score+=.25;
 let reason=st==="BULLISH"?"EMA alignment and positive price structure.":st==="BEARISH"?"EMA alignment and negative price structure.":"EMA alignment is mixed.";
 if(bosBull&&bosBear)reason+=" Recent swings are conflicting.";else if(bosBull)reason+=" Recent swing high shows bullish structure expansion.";else if(bosBear)reason+=" Recent swing low shows bearish structure expansion.";
 return{state:st,score,rsi:R,atr:A,res:lv.res,sup:lv.sup,momentum:slope,reason,bosBull,bosBear,price}
}
function renderMTF(){
 const rows=MTF.map(tf=>{const s=structure(state.mtf[tf]);return '<tr><td><b>'+tfName(tf)+'</b></td><td><span class="badge '+s.state.toLowerCase()+'">'+s.state+'</span></td><td>'+ (s.bosBull&&!s.bosBear?"BOS ↑":s.bosBear&&!s.bosBull?"BOS ↓":"—") +'</td><td>'+ (s.rsi===50?"—":s.rsi.toFixed(1)) +'</td><td>'+ (s.atr?fmt(s.atr):"—") +'</td></tr>'}).join("");
 els.mtfBody.innerHTML=rows;
}
function analyzeMTF(){
 const data=MTF.map(tf=>structure(state.mtf[tf])).filter(x=>x.state!=="WAIT");if(data.length<2)return;
 const score=data.reduce((a,x)=>a+x.score,0),bull=data.filter(x=>x.state==="BULLISH").length,bear=data.filter(x=>x.state==="BEARISH").length;
 const overall=score>=2?"BULLISH":score<=-2?"BEARISH":"MIXED";els.mtfSummary.textContent=overall+" · "+bull+" bullish / "+bear+" bearish · M5 + M15 + H1 + H4";
 const base=structure(state.mtf[state.tf]);if(base.state==="WAIT")return;
 const price=state.tick||base.price,A=base.atr||Math.max(price*.001,1),sig=overall==="BULLISH"&&base.state!=="BEARISH"?"BUY":overall==="BEARISH"&&base.state!=="BULLISH"?"SELL":"WAIT";
 const dir=sig==="SELL"?-1:1,buffer=A*.65,entry=sig==="BUY"?[price-buffer*.5,price+buffer*.15]:sig==="SELL"?[price-buffer*.15,price+buffer*.5]:[Math.min(base.sup+buffer,price),Math.max(base.res-buffer,price)];
 let why="Multi-timeframe structure is mixed; wait for alignment.";if(sig==="BUY")why="M5, M15, H1 and H4 structure currently lean bullish. Use lower-timeframe confirmation near the entry zone and respect H4 resistance.";if(sig==="SELL")why="M5, M15, H1 and H4 structure currently lean bearish. Use lower-timeframe confirmation near the entry zone and respect H4 support.";
 els.signal.textContent=sig;els.signalCard.className="signal-card panel "+sig.toLowerCase();els.confidence.textContent="MTF: "+overall+" · "+Math.round(Math.min(99,Math.max(1,50+score*8)))+" structure alignment";
 els.trend.textContent=overall;els.momentum.textContent=base.momentum>0?"POSITIVE":base.momentum<0?"NEGATIVE":"FLAT";els.rsi.textContent=base.rsi.toFixed(1);els.atr.textContent=fmt(A);els.resistance.textContent=fmt(base.res);els.support.textContent=fmt(base.sup);els.entry.textContent=fmt(entry[0])+" – "+fmt(entry[1]);els.invalidation.textContent=sig==="WAIT"?"—":fmt(price-(sig==="BUY"?buffer:-buffer));els.tp1.textContent=sig==="WAIT"?"—":fmt(price+dir*A);els.tp2.textContent=sig==="WAIT"?"—":fmt(price+dir*A*1.8);els.tp3.textContent=sig==="WAIT"?"—":fmt(price+dir*A*2.6);els.reason.textContent=why+" "+base.reason;els.risk.textContent="RISK: "+(Math.abs(price-(sig==="BUY"?base.res:base.sup))/Math.max(A,1e-9)<1?"ELEVATED — near level":"NORMAL");
}
function draw(){const c=els.chart,ctx=c.getContext("2d"),d=devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;c.width=w*d;c.height=h*d;ctx.scale(d,d);ctx.clearRect(0,0,w,h);const cs=state.candles.slice(-70);if(!cs.length)return;const min=Math.min(...cs.map(x=>x.l)),max=Math.max(...cs.map(x=>x.h)),pad=(max-min)*.08||1,lo=min-pad,hi=max+pad,x=i=>18+i*(w-36)/Math.max(cs.length-1,1),y=p=>h-20-(p-lo)/(hi-lo)*(h-35);ctx.strokeStyle="#172630";ctx.lineWidth=1;for(let i=0;i<6;i++){const yy=18+i*(h-38)/5;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke()}cs.forEach((q,i)=>{const xx=x(i),cw=Math.max(3,(w-45)/cs.length*.62);ctx.strokeStyle=q.c>=q.o?"#3eb6a4":"#df6969";ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(xx,y(q.h));ctx.lineTo(xx,y(q.l));ctx.stroke();const top=y(Math.max(q.o,q.c)),bot=y(Math.min(q.o,q.c));ctx.fillRect(xx-cw/2,top,cw,Math.max(1,bot-top))});if(state.tick){ctx.strokeStyle="#6f8290";ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(0,y(state.tick));ctx.lineTo(w,y(state.tick));ctx.stroke();ctx.setLineDash([])}}
document.querySelectorAll("#timeframes button").forEach(b=>b.onclick=()=>{document.querySelectorAll("#timeframes button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.tf=+b.dataset.tf;load()});
els.symbol.onchange=load;$("refresh").onclick=load;window.addEventListener("resize",draw);connect();
