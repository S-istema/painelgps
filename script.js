/* ============================================
   GPS DASHBOARD - SCRIPT COMPLETO
   ============================================ */
(function(){
'use strict';

/* ─── CONFIG ─────────────────────────────────── */
const CFG={
    BIN_ID:'6a0802b8c0954111d82f1971',
    API_KEY:'$2a$10$zfLo4xQ0.IvfaaQaJbTDle3OU9eW24NU.iN7JbK9Ph9OpF0MiuRRu',
    API:'https://api.jsonbin.io/v3/b/',
    ONLINE_MS:120000,
};

/* ─── STATE ──────────────────────────────────── */
const S={
    devices:[],markers:{},paths:{},circles:{},
    map:null,layers:{},refreshTimer:null,
    autoRefresh:true,showTrails:true,showAcc:true,
    knownIds:new Set(),notifs:[],histEvents:[],
    selId:null,filterSt:'all',histFilt:'all',searchQ:'',
    refreshMs:10000,
};

/* ─── UTILS ──────────────────────────────────── */
const $=id=>document.getElementById(id);
const setT=(id,v)=>{const e=$(id);if(e)e.textContent=v};
const N=()=>Date.now();
function isOn(ls){return ls?N()-new Date(ls).getTime()<CFG.ONLINE_MS:false}
function tDiff(ts){
    if(!ts)return'Nunca';
    const d=N()-new Date(ts).getTime();
    const s=d/1000|0,m=s/60|0,h=m/60|0,dy=h/24|0;
    if(s<60)return s+'s';if(m<60)return m+'min';if(h<24)return h+'h';return dy+'d';
}
function fmtT(ts){return ts?new Date(ts).toLocaleTimeString('pt-BR'):'--'}
function fmtDT(ts){return ts?new Date(ts).toLocaleString('pt-BR'):'--'}
function bI(l){if(l>75)return'fa-battery-full';if(l>50)return'fa-battery-three-quarters';if(l>25)return'fa-battery-half';if(l>10)return'fa-battery-quarter';return'fa-battery-empty'}
function bC(l){if(l>50)return'#48bb78';if(l>20)return'#ed8936';return'#fc5c65'}

/* ─── TOAST ──────────────────────────────────── */
function toast(msg,type='i',ms=3500){
    const cls={s:'toast-s',e:'toast-e',w:'toast-w',i:'toast-i'};
    const ic ={s:'fa-check-circle',e:'fa-exclamation-circle',w:'fa-triangle-exclamation',i:'fa-info-circle'};
    const el=document.createElement('div');
    el.className=`toast ${cls[type]||cls.i}`;
    el.innerHTML=`<i class="fas ${ic[type]||ic.i}"></i><span>${msg}</span><button class="toast-x"><i class="fas fa-times"></i></button>`;
    el.querySelector('.toast-x').onclick=()=>{el.classList.replace('in','out');setTimeout(()=>el.remove(),300)};
    $('twrap')?.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('in'));
    setTimeout(()=>{el.classList.replace('in','out');setTimeout(()=>el.remove(),300)},ms);
}

/* ─── NOTIF ──────────────────────────────────── */
const NT={
    colors:{new_device:'#667eea',warning:'#ed8936',offline:'#fc5c65',info:'#4299e1'},
    icons:{new_device:'fa-mobile-screen-button',warning:'fa-triangle-exclamation',offline:'fa-plug-circle-xmark',info:'fa-info-circle'},
    add(title,msg,type='info'){
        S.notifs.unshift({id:N(),title,msg,type,time:new Date().toISOString(),read:false});
        this.badge();this.render();
    },
    badge(){
        const cnt=S.notifs.filter(n=>!n.read).length;
        const b=$('nbadge');if(!b)return;
        b.textContent=cnt>9?'9+':cnt;b.style.display=cnt>0?'flex':'none';
    },
    markRead(){S.notifs.forEach(n=>n.read=true);this.badge()},
    clear(){S.notifs=[];this.badge();this.render()},
    render(){
        const el=$('nplist');if(!el)return;
        if(!S.notifs.length){el.innerHTML='<div class="empty"><i class="fas fa-bell-slash"></i><p>Sem notificações.</p></div>';return}
        el.innerHTML=S.notifs.map(n=>`
            <div class="np-item ${n.read?'':'unread'}">
                <div class="np-icon" style="background:${this.colors[n.type]||'#4299e1'}"><i class="fas ${this.icons[n.type]||'fa-info-circle'}"></i></div>
                <div class="np-body"><div class="np-title">${n.title}</div><div class="np-msg">${n.msg}</div><div class="np-time">${fmtDT(n.time)}</div></div>
            </div>`).join('');
    }
};

/* ─── HISTORY ────────────────────────────────── */
const HI={
    colors:{new:'#667eea',connect:'#48bb78',disconnect:'#fc5c65',update:'#ed8936'},
    icons:{new:'fa-star',connect:'fa-plug',disconnect:'fa-plug-circle-xmark',update:'fa-location-dot'},
    add(type,dev,msg){
        S.histEvents.unshift({id:N(),type,msg,deviceName:dev?.info?.name||'Dispositivo',time:new Date().toISOString()});
        if(S.histEvents.length>300)S.histEvents.length=300;
        this.render();
    },
    render(){
        const el=$('hlist');if(!el)return;
        const list=S.histFilt==='all'?S.histEvents:S.histEvents.filter(e=>e.type===S.histFilt);
        if(!list.length){el.innerHTML='<div class="empty"><i class="fas fa-clock-rotate-left"></i><p>Sem eventos.</p></div>';return}
        el.innerHTML=list.map(e=>`
            <div class="hitem">
                <div class="hdot" style="background:${this.colors[e.type]||'#718096'}"><i class="fas ${this.icons[e.type]||'fa-dot'}"></i></div>
                <div class="hbody"><div class="hname">${e.deviceName}</div><div class="hmsg">${e.msg}</div><div class="htime">${fmtDT(e.time)}</div></div>
            </div>`).join('');
    }
};

/* ─── MAP ────────────────────────────────────── */
const MAP={
    init(){
        S.map=L.map('map',{zoomControl:false,attributionControl:false}).setView([-14.235,-51.925],5);
        S.layers.dark=L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20});
        S.layers.sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20});
        S.layers.street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20});
        S.layers.dark.addTo(S.map);
        L.control.zoom({position:'bottomright'}).addTo(S.map);
    },
    switchLayer(name){
        Object.values(S.layers).forEach(l=>{if(S.map.hasLayer(l))S.map.removeLayer(l)});
        S.layers[name]?.addTo(S.map);
        document.querySelectorAll('.mc').forEach(b=>b.classList.remove('on'));
        $(`mc-${name}`)?.classList.add('on');
    },
    mkIcon(dev,on){
        const c=on?'#667eea':'#fc5c65',c2=on?'#764ba2':'#e53e3e';
        return L.divIcon({className:'mk',html:`
            <div class="mk-pulse" style="background:${c}40"></div>
            <div class="mk-pin" style="background:linear-gradient(135deg,${c},${c2})"><i class="fas fa-mobile-screen"></i></div>`,
            iconSize:[40,40],iconAnchor:[20,40],popupAnchor:[0,-44]
        });
    },
    popup(d){
        const l=d.currentLocation||{},on=isOn(d.lastSeen),sc=on?'#48bb78':'#fc5c65',bat=l.battery;
        return `<div class="mpop">
            <div class="mpop-head"><span class="mpop-name">${d.info?.name||'Dispositivo'}</span><span class="mpop-badge" style="background:${sc}20;color:${sc}">● ${on?'Online':'Offline'}</span></div>
            <div class="mpop-row"><i class="fas fa-microchip"></i>${d.info?.os||'N/A'} • ${d.info?.browser||'N/A'}</div>
            <div class="mpop-row"><i class="fas fa-location-dot"></i>${l.latitude?.toFixed(6)||'--'}, ${l.longitude?.toFixed(6)||'--'}</div>
            <div class="mpop-row"><i class="fas fa-bullseye"></i>±${l.accuracy||'--'}m</div>
            ${l.speed>0?`<div class="mpop-row"><i class="fas fa-gauge-high"></i>${l.speed} km/h</div>`:''}
            ${bat?.level!=null?`<div class="mpop-row"><i class="fas ${bI(bat.level)}" style="color:${bC(bat.level)}"></i>${bat.level}%${bat.charging?' ⚡':''}</div>`:''}
            <div class="mpop-row"><i class="fas fa-clock"></i>${fmtDT(l.timestamp)}</div>
            <button class="mpop-btn" onclick="GPS.sel('${d.id}')"><i class="fas fa-info-circle"></i>Detalhes</button>
        </div>`;
    },
    update(devs){
        // Cleanup
        Object.keys(S.markers).forEach(id=>{
            if(!devs.find(d=>d.id===id)){
                S.map.removeLayer(S.markers[id]);delete S.markers[id];
                if(S.paths[id]){S.map.removeLayer(S.paths[id]);delete S.paths[id]}
                if(S.circles[id]){S.map.removeLayer(S.circles[id]);delete S.circles[id]}
            }
        });
        const bounds=[];
        devs.forEach(d=>{
            const l=d.currentLocation;if(!l?.latitude)return;
            const ll=[l.latitude,l.longitude],on=isOn(d.lastSeen);
            bounds.push(ll);
            // Marker
            if(S.markers[d.id]){
                S.markers[d.id].setLatLng(ll).setIcon(this.mkIcon(d,on));
                S.markers[d.id].setPopupContent(this.popup(d));
            }else{
                const m=L.marker(ll,{icon:this.mkIcon(d,on),riseOnHover:true}).addTo(S.map);
                m.bindPopup(this.popup(d),{maxWidth:280});
                m.on('click',()=>GPS.sel(d.id));
                S.markers[d.id]=m;
            }
            // Accuracy circle
            if(S.showAcc&&l.accuracy){
                const co=on?'#667eea':'#fc5c65';
                if(S.circles[d.id]){S.circles[d.id].setLatLng(ll).setRadius(l.accuracy);S.circles[d.id].setStyle({color:co})}
                else{S.circles[d.id]=L.circle(ll,{radius:l.accuracy,color:co,fillOpacity:.06,weight:1,dashArray:'5 5'}).addTo(S.map)}
            }else if(S.circles[d.id]){S.map.removeLayer(S.circles[d.id]);delete S.circles[d.id]}
            // Trail
            if(S.showTrails&&d.history?.length>1){
                const pts=d.history.filter(h=>h.lat&&h.lng).map(h=>[h.lat,h.lng]).reverse();
                const tc=on?'#667eea':'#fc5c65';
                if(S.paths[d.id]){S.paths[d.id].setLatLngs(pts);S.paths[d.id].setStyle({color:tc})}
                else{S.paths[d.id]=L.polyline(pts,{color:tc,weight:3,opacity:.5,dashArray:'8 6',lineJoin:'round'}).addTo(S.map)}
            }else if(S.paths[d.id]){S.map.removeLayer(S.paths[d.id]);delete S.paths[d.id]}
        });
        return bounds;
    },
    fitBounds(b){
        if(!b.length)return;
        if(b.length===1)S.map.flyTo(b[0],15,{animate:true,duration:1});
        else S.map.flyToBounds(b,{padding:[60,60],maxZoom:14,animate:true,duration:1});
    },
    flyTo(lat,lng,z=17){S.map.flyTo([lat,lng],z,{animate:true,duration:1.2})}
};

/* ─── DETAIL PANEL ───────────────────────────── */
const DP={
    show(d){
        const l=d.currentLocation||{},on=isOn(d.lastSeen),bat=l.battery;
        const av=$('dp-av');
        if(av)av.style.background=on?'linear-gradient(135deg,#667eea,#764ba2)':'linear-gradient(135deg,#fc5c65,#e53e3e)';
        setT('dp-name',d.info?.name||'Dispositivo');
        setT('dp-sub',`${d.info?.os||'N/A'} • ${d.info?.browser||'N/A'}`);
        const bdg=$('dp-badge');if(bdg){bdg.textContent=on?'Online':'Offline';bdg.className=`dp-status ${on?'on':'off'}`}
        setT('dp-lat',l.latitude?.toFixed(7)||'--');
        setT('dp-lng',l.longitude?.toFixed(7)||'--');
        setT('dp-spd',l.speed>0?l.speed+' km/h':'Parado');
        setT('dp-acc',l.accuracy?'±'+l.accuracy+'m':'--');
        setT('dp-alt',l.altitude?l.altitude+' m':'--');
        setT('dp-seen',tDiff(d.lastSeen));
        setT('dp-sends',d.sendCount||'--');
        if(bat?.level!=null){
            setT('dp-bat',bat.level+'%'+(bat.charging?' ⚡':''));
            const bi=$('dp-bati');if(bi){bi.className=`fas ${bI(bat.level)}`;bi.style.color=bC(bat.level)}
        }else{setT('dp-bat','--')}
        setT('dp-os',d.info?.os||'N/A');
        setT('dp-brow',d.info?.browser||'N/A');
        setT('dp-first',fmtDT(d.firstSeen));
        setT('dp-id',d.id);
        // History
        const h=$('dp-hist');
        if(h){
            if(!d.history?.length){h.innerHTML='<div style="text-align:center;padding:14px;color:#718096;font-size:12px">Sem histórico</div>'}
            else{h.innerHTML=d.history.slice(0,50).map((p,i)=>`
                <div class="dp-hpos" onclick="GPS.fly(${p.lat},${p.lng})">
                    <div class="dp-hnum">${i+1}</div>
                    <div class="dp-hinfo"><div class="dp-hcoord">${p.lat?.toFixed(6)}, ${p.lng?.toFixed(6)}</div><div class="dp-htime">${fmtDT(p.time)}</div></div>
                    <div class="dp-hacc">±${p.accuracy||'--'}m</div>
                </div>`).join('')}
        }
        // Buttons
        const lat=l.latitude,lng=l.longitude;
        $('dp-copy').onclick=()=>{navigator.clipboard?.writeText(`${lat}, ${lng}`);toast('Copiado!','s')};
        $('dp-gm').onclick=()=>window.open(`https://maps.google.com/?q=${lat},${lng}`,'_blank');
        $('dp-waze').onclick=()=>window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,'_blank');
        $('dp-sv').onclick=()=>window.open(`https://maps.google.com/?layer=c&cbll=${lat},${lng}`,'_blank');
        $('dp')?.classList.add('open');
    },
    hide(){$('dp')?.classList.remove('open');S.selId=null;renderDevList()}
};

/* ─── DEVICE LIST ────────────────────────────── */
function renderDevList(){
    const el=$('devlist');if(!el)return;
    let devs=[...S.devices];
    if(S.filterSt==='online')devs=devs.filter(d=>isOn(d.lastSeen));
    if(S.filterSt==='offline')devs=devs.filter(d=>!isOn(d.lastSeen));
    if(S.searchQ){const q=S.searchQ.toLowerCase();devs=devs.filter(d=>(d.info?.name||'').toLowerCase().includes(q)||(d.info?.os||'').toLowerCase().includes(q)||(d.id||'').toLowerCase().includes(q))}
    devs.sort((a,b)=>{const ao=isOn(a.lastSeen)?1:0,bo=isOn(b.lastSeen)?1:0;if(bo!==ao)return bo-ao;return new Date(b.lastSeen)-new Date(a.lastSeen)});
    setT('t-count',S.devices.length);
    if(!devs.length){el.innerHTML=`<div class="empty"><i class="fas fa-satellite-dish"></i><p>${S.searchQ?'Nenhum resultado.':'Aguardando dispositivos...'}</p></div>`;return}
    el.innerHTML=devs.map(d=>{
        const on=isOn(d.lastSeen),l=d.currentLocation||{},bat=l.battery,sel=S.selId===d.id;
        const gc=on?'#667eea,#764ba2':'#fc5c65,#e53e3e';
        return`<div class="dcard ${sel?'sel':''}" onclick="GPS.sel('${d.id}')">
            <div class="dcard-r1">
                <div class="dcard-av" style="background:linear-gradient(135deg,${gc})"><i class="fas fa-mobile-screen"></i></div>
                <div class="dcard-info"><div class="dcard-name">${d.info?.name||'Dispositivo'}</div><div class="dcard-os">${d.info?.os||'N/A'} • ${d.info?.browser||'N/A'}</div></div>
                <div class="dcard-badge ${on?'on':'off'}">● ${on?'Online':'Offline'}</div>
            </div>
            <div class="dcard-r2">
                <div class="dcard-meta"><i class="fas fa-location-dot"></i>${l.latitude?.toFixed(4)||'--'}, ${l.longitude?.toFixed(4)||'--'}</div>
                <div class="dcard-meta"><i class="fas fa-clock"></i>${tDiff(d.lastSeen)}</div>
                <div class="dcard-meta"><i class="fas fa-gauge-high"></i>${l.speed>0?l.speed+' km/h':'Parado'}</div>
                <div class="dcard-meta"><i class="fas fa-bullseye"></i>±${l.accuracy||'--'}m</div>
            </div>
            ${bat?.level!=null?`<div class="bat-row"><div class="bat-track"><div class="bat-fill" style="width:${bat.level}%;background:${bC(bat.level)}"></div></div><span class="bat-txt" style="color:${bC(bat.level)}"><i class="fas ${bI(bat.level)}"></i> ${bat.level}%${bat.charging?' ⚡':''}</span></div>`:''}
        </div>`
    }).join('');
}

/* ─── STATS ──────────────────────────────────── */
function updateStats(){
    const total=S.devices.length,on=S.devices.filter(d=>isOn(d.lastSeen)).length;
    setT('s-total',total);setT('s-on',on);setT('s-off',total-on);setT('t-count',total);
}

/* ─── CONNECTION ─────────────────────────────── */
function setConn(ok){
    [$('cdot'),$('mcdot')].forEach(d=>{if(d)d.className=`cdot ${ok?'on':'off'}`});
    setT('clabel',ok?'Conectado ao JSONBin':'Sem conexão');
    setT('mctxt',ok?'Conectado':'Desconectado');
    const lv=$('live');if(lv)lv.className=`live ${ok?'on':''}`;
}

/* ─── SOUND ──────────────────────────────────── */
function playSound(){
    try{const c=new(window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.setValueAtTime(880,c.currentTime);o.frequency.setValueAtTime(660,c.currentTime+.12);g.gain.setValueAtTime(.3,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.6);o.start();o.stop(c.currentTime+.6)}catch(e){}
}

/* ─── NEW DEVICE ALERT ───────────────────────── */
function ndAlert(d){
    setT('nd-info',`${d.info?.name||'Dispositivo'} — ${d.info?.os||'N/A'}`);
    $('ndalert')?.classList.add('show');
    if($('tog-sound')?.checked)playSound();
    setTimeout(()=>$('ndalert')?.classList.remove('show'),6000);
}

/* ─── FETCH DATA ─────────────────────────────── */
async function fetchData(){
    try{
        const res=await fetch(`${CFG.API}${CFG.BIN_ID}/latest`,{headers:{'X-Master-Key':CFG.API_KEY,'X-Bin-Meta':'false'}});
        if(!res.ok)throw new Error('HTTP '+res.status);
        const raw=await res.json();
        // JSONBin pode retornar o record diretamente ou em .record
        const record=raw.record||raw;
        const devs=record.devices||[];
        const isFirst=S.devices.length===0;

        // New devices
        devs.forEach(d=>{
            if(!S.knownIds.has(d.id)){
                S.knownIds.add(d.id);
                if(!isFirst){
                    if($('tog-newdev')?.checked)ndAlert(d);
                    NT.add('🆕 Novo Dispositivo',`${d.info?.name||'Dispositivo'} conectou`,'new_device');
                    HI.add('new',d,`Novo: ${d.info?.os||'N/A'} • ${d.info?.browser||'N/A'}`);
                }
            }
        });

        // Online/offline transitions
        if(!isFirst){
            S.devices.forEach(old=>{
                const cur=devs.find(d=>d.id===old.id);if(!cur)return;
                const was=isOn(old.lastSeen),now2=isOn(cur.lastSeen);
                if(!was&&now2)HI.add('connect',cur,'Reconectou');
                else if(was&&!now2){
                    if($('tog-offdev')?.checked){NT.add('⚠️ Offline',`${cur.info?.name||'Dispositivo'} desconectou`,'offline')}
                    HI.add('disconnect',cur,'Desconectou');
                }
            });
        }else{
            devs.forEach(d=>{S.knownIds.add(d.id);HI.add('update',d,'Carregado no painel')});
        }

        S.devices=devs;
        updateAll();
        setConn(true);
        const t=`Atualizado ${fmtT(new Date())}`;setT('last-u',t);setT('mutxt',t);
    }catch(err){
        console.error('[Dashboard]',err);
        setConn(false);
        toast('Erro ao buscar dados','e');
    }
}

/* ─── UPDATE ALL ─────────────────────────────── */
function updateAll(){
    renderDevList();updateStats();
    const bounds=MAP.update(S.devices);
    if(!S.selId&&bounds.length)MAP.fitBounds(bounds);
    if(S.selId){const d=S.devices.find(x=>x.id===S.selId);if(d)DP.show(d)}
    HI.render();
}

/* ─── REFRESH ────────────────────────────────── */
function startRef(ms){stopRef();if(!S.autoRefresh)return;S.refreshTimer=setInterval(fetchData,ms||S.refreshMs)}
function stopRef(){if(S.refreshTimer){clearInterval(S.refreshTimer);S.refreshTimer=null}}

/* ─── EXPORT ─────────────────────────────────── */
function expJSON(){
    const b=new Blob([JSON.stringify({devices:S.devices,exported:new Date().toISOString()},null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`gps-${N()}.json`;a.click();toast('JSON exportado!','s');
}
function expCSV(){
    const rows=[['ID','Nome','OS','Browser','Lat','Lng','Precisão','Velocidade','Bateria','Último Sinal']];
    S.devices.forEach(d=>{const l=d.currentLocation||{},bat=l.battery||{};rows.push([d.id,d.info?.name||'',d.info?.os||'',d.info?.browser||'',l.latitude||'',l.longitude||'',l.accuracy||'',l.speed||'',bat.level??'',d.lastSeen||''])});
    const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
    const b=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`gps-${N()}.csv`;a.click();toast('CSV exportado!','s');
}

/* ─── GLOBAL API ─────────────────────────────── */
window.GPS={
    sel(id){
        S.selId=id;const d=S.devices.find(x=>x.id===id);if(!d)return;
        const l=d.currentLocation;if(l?.latitude)MAP.flyTo(l.latitude,l.longitude);
        DP.show(d);renderDevList();
        if(S.markers[id])S.markers[id].openPopup();
    },
    fly(lat,lng){MAP.flyTo(lat,lng,18)}
};

/* ─── EVENTS ─────────────────────────────────── */
function bind(){
    // Sidebar
    $('btn-collapse')?.addEventListener('click',()=>$('sb')?.classList.toggle('hide'));
    $('btn-menu')?.addEventListener('click',()=>{
        const sb=$('sb');if(!sb)return;
        if(window.innerWidth<=768){sb.classList.toggle('mopen');$('overlay')?.classList.toggle('on')}
        else sb.classList.toggle('hide');
    });
    $('overlay')?.addEventListener('click',()=>{
        $('sb')?.classList.remove('mopen');$('npanel')?.classList.remove('open');$('overlay')?.classList.remove('on');
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(btn=>{
        btn.addEventListener('click',()=>{
            const t=btn.dataset.tab;
            document.querySelectorAll('.tab').forEach(b=>b.classList.remove('on'));
            document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
            btn.classList.add('on');$(`p-${t}`)?.classList.add('on');
        });
    });

    // Search
    $('inp-search')?.addEventListener('input',e=>{S.searchQ=e.target.value.trim();renderDevList()});

    // Filters
    document.querySelectorAll('[data-f]').forEach(btn=>{
        btn.addEventListener('click',()=>{
            document.querySelectorAll('[data-f]').forEach(b=>b.classList.remove('on'));
            btn.classList.add('on');S.filterSt=btn.dataset.f;renderDevList();
        });
    });
    document.querySelectorAll('[data-hf]').forEach(btn=>{
        btn.addEventListener('click',()=>{
            document.querySelectorAll('[data-hf]').forEach(b=>b.classList.remove('on'));
            btn.classList.add('on');S.histFilt=btn.dataset.hf;HI.render();
        });
    });

    // Topbar
    $('btn-ref')?.addEventListener('click',()=>{toast('Atualizando...','i',1500);fetchData()});
    $('btn-fit')?.addEventListener('click',()=>{
        const b=S.devices.filter(d=>d.currentLocation?.latitude).map(d=>[d.currentLocation.latitude,d.currentLocation.longitude]);
        if(b.length)MAP.fitBounds(b);else toast('Nenhum dispositivo','w');
    });
    $('dp-x')?.addEventListener('click',()=>DP.hide());

    // Notifications
    $('btn-notif')?.addEventListener('click',()=>{$('npanel')?.classList.add('open');$('overlay')?.classList.add('on');NT.markRead()});
    $('btn-closn')?.addEventListener('click',()=>{$('npanel')?.classList.remove('open');$('overlay')?.classList.remove('on')});
    $('btn-clrn')?.addEventListener('click',()=>NT.clear());
    $('nd-x')?.addEventListener('click',()=>$('ndalert')?.classList.remove('show'));

    // Settings
    $('tog-auto')?.addEventListener('change',e=>{S.autoRefresh=e.target.checked;S.autoRefresh?startRef():stopRef();toast(S.autoRefresh?'Auto-refresh ON':'Auto-refresh OFF',S.autoRefresh?'s':'w')});
    $('sel-int')?.addEventListener('change',e=>{S.refreshMs=parseInt(e.target.value);if(S.autoRefresh)startRef(S.refreshMs);toast(`Intervalo: ${S.refreshMs/1000}s`,'i')});
    $('tog-trails')?.addEventListener('change',e=>{
        S.showTrails=e.target.checked;
        if(!S.showTrails){Object.keys(S.paths).forEach(id=>{S.map.removeLayer(S.paths[id]);delete S.paths[id]})}
        MAP.update(S.devices);toast(`Trilhas ${S.showTrails?'ON':'OFF'}`,'i');
    });
    $('tog-acc')?.addEventListener('change',e=>{
        S.showAcc=e.target.checked;
        if(!S.showAcc){Object.keys(S.circles).forEach(id=>{S.map.removeLayer(S.circles[id]);delete S.circles[id]})}
        MAP.update(S.devices);toast(`Precisão ${S.showAcc?'ON':'OFF'}`,'i');
    });

    // Export
    $('btn-expjson')?.addEventListener('click',expJSON);
    $('btn-expcsv')?.addEventListener('click',expCSV);
    $('btn-clear')?.addEventListener('click',()=>{if(!confirm('Limpar histórico?'))return;S.histEvents=[];HI.render();toast('Limpo!','s')});

    // Map layers
    $('mc-dark')?.addEventListener('click',()=>MAP.switchLayer('dark'));
    $('mc-sat')?.addEventListener('click',()=>MAP.switchLayer('sat'));
    $('mc-street')?.addEventListener('click',()=>MAP.switchLayer('street'));
}

/* ─── INIT ───────────────────────────────────── */
function init(){
    console.log('[GPS Dashboard] 🚀 Iniciando...');
    MAP.init();
    bind();
    setConn(false);
    fetchData();
    startRef();
    S.showTrails=$('tog-trails')?.checked??true;
    S.showAcc=$('tog-acc')?.checked??true;
    console.log('[GPS Dashboard] ✅ Pronto! BIN:',CFG.BIN_ID);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();

})();