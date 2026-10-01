const WS_URLS=["wss://ws.binaryws.com/websockets/v3"];
const TF={60:"M1",120:"M2",180:"M3",300:"M5",600:"M10",900:"M15",1800:"M30",3600:"H1",7200:"H2",14400:"H4",28800:"H8",43200:"H12",86400:"D1"};
const MTF=[300,900,3600,14400];
const state={ws:null,symbol:null,tf:300,candles:[],tick:null,req:0,symbols:[],mtf:{},reqTf:{},subTf:{},running:false,connected:false,connecting:false,reconnectTimer:null,dataTimer:null,reconnectAttempt:0,endpoint:0,manualClose:false};
const $=id=>document.getElementById(id);
const els={symbol:$("symbol"),start:$("start"),stop:$("stop"),dataStatus:$("dataStatus"),price:$("price"),updated:$("updated"),signal:$("signal"),confidence:$("confidence"),trend:$("trend"),momentum:$("momentum"),rsi:$("rsi"),atr:$("atr"),resistance:$("resistance"),support:$("support"),entry:$("entry"),reason:$("reason"),invalidation:$("invalidation"),tp1:$("tp1"),tp2:$("tp2"),tp3:$("tp3"),risk:$("risk"),chart:$("chart"),marketTitle:$("marketTitle"),tfTitle:$("tfTitle"),signalCard:$("signalCard"),connection:$("connection"),mtfBody:$("mtfBody"),mtfSummary:$("mtfSummary"),checklist:$("checklist")};
function send(p){if(state.ws?.readyState===1){const req_id=++state.req;state.ws.send(JSON.stringify({...p,req_id}));return req_id}return null}
function setStatus(msg){els.dataStatus.textContent=msg}
function markLive(msg){state.connected=true;els.connection.className="status live";els.connection.innerHTML="<span></span> CONNECTED TO DERIV";setStatus(msg)}
function showError(msg){els.dataStatus.textContent="DERIV ERROR · "+msg;els.connection.className="status error";els.connection.innerHTML="<span></span> DERIV ERROR"}
function connect(){
 if(!state.running)return;
 if(state.connecting)return;
 if(state.reconnectTimer){clearTimeout(state.reconnectTimer);state.reconnectTimer=null}
 if(state.ws)try{state.ws.onclose=null;state.ws.close()}catch{}
 state.connected=false;state.connecting=true;
 state.manualClose=false;
 els.connection.className="status";els.connection.innerHTML="<span></span> CONNECTING TO DERIV";
 setStatus("CONNECTING TO DERIV MARKET DATA…");
 try{state.ws=new WebSocket(WS_URLS[state.endpoint%WS_URLS.length])}catch(e){
  state.connecting=false;state.endpoint=(state.endpoint+1)%WS_URLS.length;setStatus("DERIV CONNECTION RETRY…");state.reconnectTimer=setTimeout(connect,1000);return
}
 state.ws.onopen=()=>{
  state.connected=true;state.connecting=false;state.reconnectAttempt=0;
  els.connection.className="status live";els.connection.innerHTML="<span></span> CONNECTED TO DERIV";
  setStatus("DERIV CONNECTED · LOADING MARKET DATA…");
  send({active_symbols:"brief"});
  send({ping:1});
  if(state.dataTimer)clearTimeout(state.dataTimer);
  state.dataTimer=setTimeout(()=>{
   if(state.running&&(!state.symbols.length||!Object.keys(state.mtf).length)){
    setStatus("DERIV CONNECTED · RETRYING MARKET DATA…");
    send({active_symbols:"brief"});
    if(state.symbol)load();
   }
  },5000);
 };
 state.ws.onclose=()=>{
  state.connected=false;state.connecting=false;
  state.endpoint=(state.endpoint+1)%WS_URLS.length;
  els.connection.className="status";els.connection.innerHTML="<span></span> DISCONNECTED";
  if(state.running){
   setStatus("DERIV DISCONNECTED · RECONNECTING…");
   state.reconnectAttempt=Math.min(state.reconnectAttempt+1,6);const delay=Math.min(1000*Math.pow(2,state.reconnectAttempt-1),10000);state.reconnectTimer=setTimeout(connect,delay);
  }else setStatus("ANALYSIS STOPPED");
 };
 state.ws.onerror=()=>{state.endpoint=(state.endpoint+1)%WS_URLS.length;setStatus("DERIV CONNECTION FAILED · SWITCHING CONNECTION…");try{state.ws.close()}catch{}};
 state.ws.onmessage=e=>{try{handle(JSON.parse(e.data))}catch(err){showError("INVALID DERIV RESPONSE")}};
}
function handle(d){
 if(d.error){showError(d.error.message||d.error.code||"REQUEST REJECTED");return}
 if(d.msg_type==="active_symbols"){state.symbols=(d.active_symbols||[]).map(s=>({...s,symbol:s.symbol||s.underlying_symbol,name:s.display_name||s.underlying_symbol_name||s.symbol||s.underlying_symbol})).filter(s=>s.symbol);const preferred=state.symbols.find(s=>/gold|xau/i.test(s.name+" "+s.symbol))||state.symbols.find(s=>/eur\/?usd|frxEURUSD/i.test(s.name+" "+s.symbol))||state.symbols.find(s=>/usd/i.test(s.symbol));const wanted=state.symbols.filter(s=>/gold|xau|eur\/?usd|frxEURUSD/i.test(s.name+" "+s.symbol));const list=wanted.length?wanted:state.symbols;els.symbol.innerHTML=list.map(s=>'<option value="'+esc(s.symbol)+'">'+esc(s.name)+'</option>').join("");if(preferred&&list.some(x=>x.symbol===preferred.symbol))els.symbol.value=preferred.symbol;else if(list[0])els.symbol.value=list[0].symbol;els.dataStatus.textContent="MARKETS LOADED · "+list.length+" AVAILABLE";if(state.running)load()}
 if(d.msg_type==="candles"){const tf=state.reqTf[d.req_id]||state.subTf[d.subscription?.id];if(tf){const candles=(d.candles||[]).map(c=>({t:+c.epoch,o:+c.open,h:+c.high,l:+c.low,c:+c.close}));if(candles.length){state.mtf[tf]=candles;if(tf===state.tf){state.candles=candles;draw()}els.dataStatus.textContent="LIVE DATA · "+tfName(tf)+" UPDATED";renderMTF();analyzeMTF()}}if(d.subscription?.id&&tf)state.subTf[d.subscription.id]=tf}
 if(d.msg_type==="ohlc"){const tf=state.reqTf[d.req_id]||state.subTf[d.ohlc?.subscription?.id];if(tf&&d.ohlc){const q=d.ohlc,c=state.mtf[tf]||[];const item={t:+q.epoch,o:+q.open,h:+q.high,l:+q.low,c:+q.close};if(c.length&&c.at(-1).t===item.t)c[c.length-1]=item;else c.push(item);state.mtf[tf]=c.slice(-180);if(tf===state.tf){state.candles=state.mtf[tf];draw()}renderMTF();analyzeMTF()}}
 if(d.msg_type==="tick"&&d.tick){state.tick=+d.tick.quote;els.dataStatus.textContent="LIVE · "+(state.symbols.find(x=>x.symbol===state.symbol)?.name||state.symbol||"MARKET")+" · TICK RECEIVED";els.price.textContent=fmt(state.tick);els.updated.textContent=new Date(d.tick.epoch*1000).toLocaleTimeString();if(state.candles.length)draw();analyzeMTF()}
}
function load(){
 if(!state.running||!state.connected)return;
 state.symbol=els.symbol.value;if(!state.symbol){setStatus("CONNECTED · SELECTING MARKET…");return}
 const marketName=state.symbols.find(x=>x.symbol===state.symbol)?.name||state.symbol;
 setStatus("CONNECTED · REQUESTING "+marketName+" M1–H4 DATA…");
 state.candles=[];state.mtf={};state.reqTf={};state.subTf={};
 MTF.forEach(tf=>{
  const id=send({ticks_history:state.symbol,end:"latest",count:180,style:"candles",granularity:tf,subscribe:1});
  if(id)state.reqTf[id]=tf;
 });
 state.marketReq=send({ticks:state.symbol,subscribe:1});
 send({ping:1});
 const ss=state.symbols.find(x=>x.symbol===state.symbol);
 els.marketTitle.textContent=ss?.display_name||state.symbol;
 els.tfTitle.textContent=tfName(state.tf);
 if(state.dataTimer)clearTimeout(state.dataTimer);
 state.dataTimer=setTimeout(()=>{
  if(state.running){
   const got=MTF.filter(tf=>state.mtf[tf]?.length).map(tf=>tfName(tf)).join(" · ");
   setStatus(got?"LIVE DATA · RECEIVED "+got:"CONNECTED · MARKET DATA DELAYED · RETRYING…");
   if(!got&&state.ws?.readyState===1){send({active_symbols:"brief"});load()}else if(!got&&state.running){connect();}
  }
 },7000);
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
function renderChecklist(data,overall,base,sig){
 const macro=data.find(x=>x.tf===14400)?.s||structure(state.mtf[14400]);
 const h1=data.find(x=>x.tf===3600)?.s||structure(state.mtf[3600]);
 const m15=data.find(x=>x.tf===900)?.s||structure(state.mtf[900]);
 const m5=data.find(x=>x.tf===300)?.s||structure(state.mtf[300]);
 const items=[
  ["H4 macro bias",macro.state,overall!=="MIXED"&&macro.state===overall],
  ["H1 structure",h1.state,h1.state===overall],
  ["M15 setup",m15.state,m15.state===overall],
  ["M5 entry timing",m5.state,m5.state===overall],
  ["Swing break",base.bosBull?"BOS ↑":base.bosBear?"BOS ↓":"NO BREAK",sig==="BUY"?base.bosBull:sig==="SELL"?base.bosBear:false],
  ["RSI",base.rsi.toFixed(1),sig!=="WAIT"&&(sig==="BUY"?base.rsi<70:base.rsi>30)]
 ];
 els.checklist.innerHTML=items.map(([name,value,ok])=>'<div class="check-item"><span>'+esc(name)+'</span><b class="check '+(ok?"pass":"hold")+'">'+(ok?"✓":"•")+' '+esc(value)+'</b></div>').join("");
}
function analyzeMTF(){
 const data=MTF.map(tf=>({tf,s:structure(state.mtf[tf])})).filter(x=>x.s.state!=="WAIT");
 if(data.length<4){
  const got=data.map(x=>tfName(x.tf)).join(" · ");
  setStatus(got?"LIVE DATA · "+got+" · WAITING FOR OTHER TIMEFRAMES…":"CONNECTED · WAITING FOR CANDLES…");
  return;
}
 const h4=data.find(x=>x.tf===14400)?.s;
 const h1=data.find(x=>x.tf===3600)?.s;
 const m15=data.find(x=>x.tf===900)?.s;
 const m5=data.find(x=>x.tf===300)?.s;
 if(!h4||!h1||!m15||!m5)return;
 const aligned=(a,b)=>a.state===b.state&&a.state!=="MIXED";
 const macro=h4.state;
 const h1Aligned=aligned(h1,h4);
 const setupAligned=aligned(m15,h1);
 const entryAligned=aligned(m5,m15);
 const direction=macro==="BULLISH"?"BUY":macro==="BEARISH"?"SELL":"WAIT";
 const hierarchyScore=(macro==="BULLISH"||macro==="BEARISH"?4:0)
   +(h1Aligned?3:0)+(setupAligned?2:0)+(entryAligned?1:0);
 const opposite=(direction==="BUY"?[h1,m15,m5].filter(s=>s.state==="BEARISH").length:[h1,m15,m5].filter(s=>s.state==="BULLISH").length);
 const confirmed=direction!=="WAIT"&&h1Aligned&&setupAligned&&entryAligned&&opposite===0;
 const overall=direction==="BUY"?"BULLISH":direction==="SELL"?"BEARISH":"MIXED";
 const bull=data.filter(x=>x.s.state==="BULLISH").length,bear=data.filter(x=>x.s.state==="BEARISH").length;
 els.mtfSummary.textContent=overall+" · H4 macro 4x · H1 3x · M15 2x · M5 1x · "+bull+" bullish / "+bear+" bearish";
 const base=m5;
 const price=state.tick||base.price,A=base.atr||Math.max(price*.001,1);
 const sig=confirmed?direction:"WAIT";
 renderChecklist(data,overall,base,sig);
 const dir=sig==="SELL"?-1:1,buffer=A*.65;
 const entry=sig==="BUY"?[price-buffer*.5,price+buffer*.15]:sig==="SELL"?[price-buffer*.15,price+buffer*.5]:[Math.min(base.sup+buffer,price),Math.max(base.res-buffer,price)];
 let why="H4 is the macro filter. H1 must confirm the macro direction, M15 must form the setup, and M5 must confirm entry.";
 if(sig==="BUY")why="H4 bullish macro → H1 bullish structure → M15 bullish setup → M5 bullish entry confirmation.";
 if(sig==="SELL")why="H4 bearish macro → H1 bearish structure → M15 bearish setup → M5 bearish entry confirmation.";
 els.signal.textContent=sig;els.signalCard.className="signal-card panel "+sig.toLowerCase();
 els.confidence.textContent="H4/H1/M15/M5 hierarchy · "+hierarchyScore+"/10 confirmed"+(confirmed?"":" · WAIT for full alignment");
 els.trend.textContent=overall;els.momentum.textContent=base.momentum>0?"POSITIVE":base.momentum<0?"NEGATIVE":"FLAT";els.rsi.textContent=base.rsi.toFixed(1);els.atr.textContent=fmt(A);els.resistance.textContent=fmt(base.res);els.support.textContent=fmt(base.sup);els.entry.textContent=fmt(entry[0])+" – "+fmt(entry[1]);els.invalidation.textContent=sig==="WAIT"?"—":fmt(price-(sig==="BUY"?buffer:-buffer));els.tp1.textContent=sig==="WAIT"?"—":fmt(price+dir*A);els.tp2.textContent=sig==="WAIT"?"—":fmt(price+dir*A*1.8);els.tp3.textContent=sig==="WAIT"?"—":fmt(price+dir*A*2.6);els.reason.textContent=why+" "+base.reason;els.risk.textContent="RISK: "+(Math.abs(price-(sig==="BUY"?base.res:base.sup))/Math.max(A,1e-9)<1?"ELEVATED — near level":"NORMAL");
}
function draw(){const c=els.chart,ctx=c.getContext("2d"),d=devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;c.width=w*d;c.height=h*d;ctx.scale(d,d);ctx.clearRect(0,0,w,h);const cs=state.candles.slice(-70);if(!cs.length)return;const min=Math.min(...cs.map(x=>x.l)),max=Math.max(...cs.map(x=>x.h)),pad=(max-min)*.08||1,lo=min-pad,hi=max+pad,x=i=>18+i*(w-36)/Math.max(cs.length-1,1),y=p=>h-20-(p-lo)/(hi-lo)*(h-35);ctx.strokeStyle="#172630";ctx.lineWidth=1;for(let i=0;i<6;i++){const yy=18+i*(h-38)/5;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke()}cs.forEach((q,i)=>{const xx=x(i),cw=Math.max(3,(w-45)/cs.length*.62);ctx.strokeStyle=q.c>=q.o?"#3eb6a4":"#df6969";ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(xx,y(q.h));ctx.lineTo(xx,y(q.l));ctx.stroke();const top=y(Math.max(q.o,q.c)),bot=y(Math.min(q.o,q.c));ctx.fillRect(xx-cw/2,top,cw,Math.max(1,bot-top))});if(state.tick){ctx.strokeStyle="#6f8290";ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(0,y(state.tick));ctx.lineTo(w,y(state.tick));ctx.stroke();ctx.setLineDash([])}}
document.querySelectorAll("#timeframes button").forEach(b=>b.onclick=()=>{document.querySelectorAll("#timeframes button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.tf=+b.dataset.tf;els.tfTitle.textContent=tfName(state.tf);if(state.running)load()});
els.symbol.onchange=()=>{if(state.running)load()};
els.start.onclick=()=>{state.running=true;els.start.disabled=true;els.stop.disabled=false;setStatus("CONNECTING TO DERIV…");connect()};
els.stop.onclick=()=>{state.running=false;state.connecting=false;state.reconnectAttempt=0;state.manualClose=true;if(state.reconnectTimer){clearTimeout(state.reconnectTimer);state.reconnectTimer=null}if(state.dataTimer)clearTimeout(state.dataTimer);els.start.disabled=false;els.stop.disabled=true;setStatus("ANALYSIS STOPPED");if(state.ws)try{state.ws.close()}catch{}state.ws=null};
$("refresh").onclick=()=>{if(state.running)load()};window.addEventListener("resize",draw);setInterval(()=>{if(state.running&&state.ws?.readyState===1)send({ping:1})},30000);