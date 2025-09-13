// js/app.js - final version (v2, adjusted per last requests)
// - u1 and u4 connected also to c5
// - hover no-jitter, panel spacing respected, content nodes shifted left from right edge
// - stage 3 pre-highlighting + persistent compare modal
(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded', ()=>{

    // ---------- data: u1 & u2 similar; u3 & u4 disjoint; additionally u1 & u4 connect to c5 ----------
    const users = [
      {id:'u1', label:'آریا', img:'png/001-user.png'},
      {id:'u2', label:'بهار', img:'png/004-user.png'},
      {id:'u3', label:'کاوه', img:'png/002-user.png'},
      {id:'u4', label:'مینا', img:'png/003-user.png'}
    ];
    const contents = [
      {id:'c1', label:'دونات', img:'png/001-content.png'},
      {id:'c2', label:'ساندویچ', img:'png/002-content.png'},
      {id:'c3', label:'پیتــزا', img:'png/003-content.png'},
      {id:'c4', label:'برگر', img:'png/004-content.png'},
      {id:'c5', label:'کوکی', img:'png/005-content.png'}
    ];

    // edges:
    // u1,u2 share c1,c2 -> similar
    // u3 -> c3 only
    // u4 -> c4 only
    // additionally u1->c5 and u4->c5 (user requested)
    const edges = [
      ['u1','c1'], ['u1','c2'], ['u1','c5'],
      ['u2','c1'], ['u2','c2'],
      ['u3','c3'],
      ['u4','c4'], ['u4','c5']
    ];

    // adjacency maps
    const adjUser = new Map(); const adjContent = new Map();
    users.forEach(u=>adjUser.set(u.id,new Set()));
    contents.forEach(c=>adjContent.set(c.id,new Set()));
    edges.forEach(([u,c])=>{ if(adjUser.has(u)) adjUser.get(u).add(c); if(adjContent.has(c)) adjContent.get(c).add(u); });

    // DOM refs
    const svg = document.getElementById('svg');
    const statusEl = document.getElementById('status');
    const counterEl = document.getElementById('counter');
    const panelDetails = document.getElementById('panelDetails');
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const closeHelp = document.getElementById('closeHelp');
    const compareBtn = document.getElementById('compareBtn');
    const resetBtn = document.getElementById('resetBtn');
    const stageBtns = {1:document.getElementById('stage1'), 2:document.getElementById('stage2'), 3:document.getElementById('stage3')};
    const compareModal = document.getElementById('compareModal');
    const compareTitle = document.getElementById('compareTitle');
    const compareBody = document.getElementById('compareBody');
    const closeCompare = document.getElementById('closeCompare');

    // state
    let stage = 1;
    let selected = [];
    let edgesGroup = null, nodesGroup = null, markersGroup = null;
    let activeCompare = {pairA:null, pairB:null};

    const NS = 'http://www.w3.org/2000/svg';
    function create(tag){ return document.createElementNS(NS, tag); }
    function set(el, attrs){ for(const k in attrs) el.setAttribute(k, attrs[k]); }

    // layout: reserve more right space so content nodes are well left from the right edge (avoid panel overlap)
    function layout(){
      const WIDTH = svg.clientWidth || 1200;
      const HEIGHT = svg.clientHeight || 720;
      svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
      return {WIDTH, HEIGHT};
    }
    function computePositions(dim){
      const panel = document.querySelector('.panel');
      const panelWidth = panel ? (parseInt(getComputedStyle(panel).getPropertyValue('width')) || 260) : 260;
      const leftMargin = 140;
      // reserve more right space (panel + extra) so content nodes shift left
      const rightReserve = panelWidth + 140;
      const leftX = leftMargin;
      const rightX = Math.max(dim.WIDTH - rightReserve, dim.WIDTH - 240);
      const padding = 80;
      const uyStep = (dim.HEIGHT - 2*padding) / Math.max(1, users.length - 1);
      const cyStep = (dim.HEIGHT - 2*padding) / Math.max(1, contents.length - 1);
      users.forEach((u,i)=> u.pos = {x:leftX, y: padding + i*uyStep});
      contents.forEach((c,i)=> c.pos = {x:rightX, y: padding + i*cyStep});
    }

    // draw graph
    function draw(){
      svg.innerHTML = '';
      activeCompare = {pairA:null, pairB:null};
      const dim = layout(); computePositions(dim);

      edgesGroup = create('g'); nodesGroup = create('g'); markersGroup = create('g');

      // edges
      edges.forEach(([u,c])=>{
        const uu = users.find(x=>x.id===u);
        const cc = contents.find(x=>x.id===c);
        if(!uu || !cc) return;
        const line = create('line');
        set(line, {x1: uu.pos.x + 32, y1: uu.pos.y, x2: cc.pos.x - 32, y2: cc.pos.y});
        line.classList.add('edge'); line.dataset.u = u; line.dataset.c = c;
        edgesGroup.appendChild(line);
      });

      // users
      users.forEach(u=>{
        const g = create('g'); g.dataset.id = u.id; g.dataset.type = 'user'; g.classList.add('clickable');
        set(g, {transform:`translate(${u.pos.x},${u.pos.y})`});
        const rect = create('rect'); set(rect,{x:-28,y:-28,width:56,height:56,rx:12}); rect.classList.add('node-rect');
        const img = create('image'); img.setAttributeNS('http://www.w3.org/1999/xlink','href', u.img); set(img,{x:-24,y:-24,width:48,height:48});
        const label = create('text'); label.classList.add('node-label'); set(label,{x:0,y:44}); label.textContent = u.label;
        g.appendChild(rect); g.appendChild(img); g.appendChild(label);
        nodesGroup.appendChild(g);

        g.addEventListener('mouseenter', ()=> showConnectionsInPanel(u.id));
        g.addEventListener('mouseleave', ()=> clearPanelDetails());
      });

      // contents
      contents.forEach(c=>{
        const g = create('g'); g.dataset.id = c.id; g.dataset.type = 'content'; g.classList.add('clickable');
        set(g, {transform:`translate(${c.pos.x},${c.pos.y})`});
        const rect = create('rect'); set(rect,{x:-32,y:-24,width:64,height:48,rx:10}); rect.classList.add('node-rect');
        const img = create('image'); img.setAttributeNS('http://www.w3.org/1999/xlink','href', c.img); set(img,{x:-20,y:-20,width:40,height:40});
        const label = create('text'); label.classList.add('node-label'); set(label,{x:0,y:40}); label.textContent = c.label;
        g.appendChild(rect); g.appendChild(img); g.appendChild(label);
        nodesGroup.appendChild(g);

        g.addEventListener('mouseenter', ()=> showConnectionsInPanel(c.id));
        g.addEventListener('mouseleave', ()=> clearPanelDetails());
      });

      svg.appendChild(edgesGroup); svg.appendChild(nodesGroup); svg.appendChild(markersGroup);

      Array.from(nodesGroup.querySelectorAll('g.clickable')).forEach(g=> g.addEventListener('click', onNodeClick));
      svg.onclick = function(e){ if(e.target === svg){ resetSelectionVisuals(); selected = []; updateStatus(); counterEl.textContent = 'تعداد مشترک: -'; } };

      selected = []; refreshVisuals(); updateStatus('رسم کامل شد');
    }

    // interactions
    function onNodeClick(ev){
      ev.stopPropagation();
      const g = ev.currentTarget; const id = g.dataset.id; const type = g.dataset.type;
      if(stage === 1 && type !== 'user'){ pulse('مرحلهٔ ۱: فقط کاربران را انتخاب کن'); return; }
      if(stage === 2 && type !== 'content'){ pulse('مرحلهٔ ۲: فقط محتواها را انتخاب کن'); return; }

      if(selected.includes(id)) selected = selected.filter(x=>x!==id);
      else {
        const max = stage === 3 ? 4 : 2;
        if(selected.length >= max){ pulse('به حد مجاز انتخاب رسیدی'); return; }
        if(stage === 3){
          if(selected.length === 1 && getType(selected[0]) !== type){ pulse('دو نود اول باید یک نوع باشند'); return; }
          if(selected.length === 3 && getType(selected[2]) !== type){ pulse('دو نود دوم باید یک نوع باشند'); return; }
        }
        selected.push(id);
      }
      clearPairStrokeStyles(); activeCompare = {pairA:null, pairB:null};
      refreshVisuals(); updateStatus();
    }

    function getType(id){ return id && id.startsWith('u') ? 'user' : 'content'; }

    // refresh visuals (handles stage3 pre-highlighting)
    function refreshVisuals(){
      if(!nodesGroup || !edgesGroup || !markersGroup) return;
      nodesGroup.querySelectorAll('rect').forEach(r=> { r.classList.remove('node-selected','common-highlight'); r.style.stroke=''; r.style.strokeWidth=''; });
      edgesGroup.querySelectorAll('line').forEach(l=> l.classList.remove('edge-emph-a','edge-emph-b'));
      markersGroup.innerHTML = '';

      selected.forEach(id=>{
        const g = nodesGroup.querySelector(`g[data-id='${id}']`); if(!g) return; const rect = g.querySelector('rect'); if(rect) rect.classList.add('node-selected');
      });

      if((stage === 1 || stage === 2) && selected.length === 2){
        const commons = computeCommonNeighbors(selected[0], selected[1]);
        highlightCommonsAuto(commons);
      }

      if(stage === 3){
        if(selected.length >= 2){
          const a = selected[0], b = selected[1];
          const commonsA = computeCommonNeighbors(a,b);
          renderPairTemp({a,b,commons:commonsA},1);
          counterEl.textContent = `جفت اول: ${commonsA.length} مشترک`;
        }
        if(selected.length >= 4){
          const c = selected[2], d = selected[3];
          const commonsB = computeCommonNeighbors(c,d);
          renderPairTemp({a:c,b:d,commons:commonsB},2);
          const comA = computeCommonNeighbors(selected[0], selected[1]);
          counterEl.textContent = `جفت A: ${comA.length} — جفت B: ${commonsB.length}`;
        }
      }

      if(activeCompare.pairA) renderCompareHighlights(activeCompare.pairA,1);
      if(activeCompare.pairB) renderCompareHighlights(activeCompare.pairB,2);
    }

    // auto highlight for stage1/2
    function highlightCommonsAuto(list){
      list.forEach(id=>{
        const g = nodesGroup.querySelector(`g[data-id='${id}']`); if(!g) return;
        const rect = g.querySelector('rect'); if(rect) rect.classList.add('common-highlight');
        const pos = getNodePos(id); if(pos){ const star = create('text'); set(star,{x:pos.x+45, y: pos.y+5, 'text-anchor':'middle'}); star.textContent='★'; star.classList.add('star'); markersGroup.appendChild(star); }
        edgesGroup.querySelectorAll('line').forEach(l=>{
          if((selected.includes(l.dataset.u) && list.includes(l.dataset.c)) || (selected.includes(l.dataset.c) && list.includes(l.dataset.u))) l.classList.add('edge-emph-a');
        });
      });
      counterEl.textContent = `تعداد مشترک: ${list.length} → شباهت ${list.length}`;
    }

    // temp pre-highlight for pairs (before compare)
    function renderPairTemp(pairData, which){
      if(!pairData) return;
      const cls = which === 1 ? 'edge-emph-a' : 'edge-emph-b';
      [pairData.a, pairData.b].forEach(id=>{
        const g = nodesGroup.querySelector(`g[data-id='${id}']`); if(!g) return;
        const rect = g.querySelector('rect'); if(rect){ rect.style.stroke = which===1 ? 'var(--edge-a)' : 'var(--edge-b)'; rect.style.strokeWidth = '3'; }
      });
      pairData.commons.forEach(cid=>{
        const g = nodesGroup.querySelector(`g[data-id='${cid}']`); if(!g) return;
        const rect = g.querySelector('rect'); if(rect) rect.classList.add('common-highlight');
        const pos = getNodePos(cid); if(pos){ const star = create('text'); set(star,{x:pos.x, y: pos.y - 36, 'text-anchor':'middle'}); star.textContent='★'; star.classList.add('star'); markersGroup.appendChild(star); }
        edgesGroup.querySelectorAll('line').forEach(l=>{
          const connectsPair = (l.dataset.u === pairData.a || l.dataset.u === pairData.b) && l.dataset.c === cid;
          const reverse = (l.dataset.c === pairData.a || l.dataset.c === pairData.b) && l.dataset.u === cid;
          if(connectsPair || reverse) l.classList.add(cls);
        });
      });
    }

    // compute common neighbors
    function computeCommonNeighbors(a,b){
      const ta = getType(a), tb = getType(b); const commons = [];
      if(ta === 'user' && tb === 'user'){
        const sA = adjUser.get(a) || new Set(), sB = adjUser.get(b) || new Set();
        for(const x of sA) if(sB.has(x)) commons.push(x);
      } else if(ta === 'content' && tb === 'content'){
        const sA = adjContent.get(a) || new Set(), sB = adjContent.get(b) || new Set();
        for(const x of sA) if(sB.has(x)) commons.push(x);
      }
      return commons;
    }

    function getNodePos(id){
      if(!id) return null;
      if(id.startsWith('u')){ const u = users.find(x=>x.id===id); return u?u.pos:null; }
      const c = contents.find(x=>x.id===id); return c?c.pos:null;
    }

    // persistent compare highlights
    function renderCompareHighlights(pairData, which){
      if(!pairData) return;
      const cls = which===1 ? 'edge-emph-a' : 'edge-emph-b';
      [pairData.a, pairData.b].forEach(id=>{
        const g = nodesGroup.querySelector(`g[data-id='${id}']`); if(!g) return;
        const rect = g.querySelector('rect'); if(rect){ rect.style.stroke = which===1 ? 'var(--edge-a)' : 'var(--edge-b)'; rect.style.strokeWidth = '3'; }
      });
      pairData.commons.forEach(cid=>{
        const g = nodesGroup.querySelector(`g[data-id='${cid}']`); if(!g) return;
        const rect = g.querySelector('rect'); if(rect) rect.classList.add('common-highlight');
        const pos = getNodePos(cid); if(pos){ const star = create('text'); set(star,{x:pos.x, y: pos.y - 36, 'text-anchor':'middle'}); star.textContent='★'; star.classList.add('star'); markersGroup.appendChild(star); }
        edgesGroup.querySelectorAll('line').forEach(l=>{
          const connectsPair = (l.dataset.u === pairData.a || l.dataset.u === pairData.b) && l.dataset.c === cid;
          const reverse = (l.dataset.c === pairData.a || l.dataset.c === pairData.b) && l.dataset.u === cid;
          if(connectsPair || reverse) l.classList.add(cls);
        });
      });
    }

    // compare logic
    function doCompare(){
      if(stage !== 3){ openCompareModal('خطا', '<p>برای استفاده از مقایسهٔ دو جفت، ابتدا وارد <strong>مرحلهٔ ۳</strong> شو.</p>'); return; }
      if(selected.length !== 4){ openCompareModal('خطا', '<p>در مرحلهٔ ۳ باید دقیقاً دو جفت (۴ نود) انتخاب شده باشد.</p>'); return; }
      const a1 = selected[0], a2 = selected[1], b1 = selected[2], b2 = selected[3];
      if(getType(a1) !== getType(a2) || getType(b1) !== getType(b2)){ openCompareModal('خطا', '<p>هر جفت باید از یک نوع باشد (هر دو کاربر یا هر دو محتوا).</p>'); return; }

      const commonsA = computeCommonNeighbors(a1,a2);
      const commonsB = computeCommonNeighbors(b1,b2);

      activeCompare = { pairA:{a:a1,b:a2,commons:commonsA}, pairB:{a:b1,b:b2,commons:commonsB} };

      refreshVisuals();

      let title = 'نتیجهٔ مقایسه'; let body = '';
      if(commonsA.length === commonsB.length) body = `<p>هر دو جفت به یک اندازه شباهت دارند: ${commonsA.length} مشترک.</p>`;
      else if(commonsA.length > commonsB.length) body = `<p>جفت اول بیشتر است (${commonsA.length} در مقابل ${commonsB.length}).</p>` + explainWhy(a1,a2,commonsA,1);
      else body = `<p>جفت دوم بیشتر است (${commonsB.length} در مقابل ${commonsA.length}).</p>` + explainWhy(b1,b2,commonsB,2);
      openCompareModal(title, body);
    }

    function explainWhy(n1,n2,commons,which){
      const names = `${getLabel(n1)} و ${getLabel(n2)}`;
      if(commons.length === 0) return `<p>هیچ همسایهٔ مشترکی بین ${names} وجود ندارد.</p>`;
      const labels = commons.map(getLabel).slice(0,6).join(' ، ');
      return `<p>دلیل: ${names} هرکدام با این‌ها مشترک هستند: ${labels}.</p><p>لبه‌ها و قاب‌ها برای جفت ${which===1?'آبی':'نارنجی'} نمایش داده شدند.</p>`;
    }

    function getLabel(id){
      if(id.startsWith('u')){ const u = users.find(x=>x.id===id); return u?u.label:id; }
      const c = contents.find(x=>x.id===id); return c?c.label:id;
    }

    function openCompareModal(title, html){
      compareTitle.textContent = title;
      compareBody.innerHTML = html;
      compareModal.classList.add('show');
      compareModal.setAttribute('aria-hidden','false');
    }

    // panel hover details
    function showConnectionsInPanel(id){
      if(id.startsWith('u')){
        const conns = Array.from(adjUser.get(id) || []);
        if(conns.length === 0){ panelDetails.innerHTML = `<p>این کاربر هیچ محتوایی مشترک ندارد.</p>`; return; }
        const items = conns.map(cid=>{ const c = contents.find(x=>x.id===cid); const src = (c && c.img) ? c.img : ''; return `<div class="panel-item"><img src="${src}" alt="${c?c.label:''}"/><span>${c?c.label:cid}</span></div>`; }).join('');
        panelDetails.innerHTML = `<p>این کاربر به محتواهای زیر متصل است:</p>${items}`;
      } else {
        const conns = Array.from(adjContent.get(id) || []);
        if(conns.length === 0){ panelDetails.innerHTML = `<p>هیچ کاربری این محتوا را ندارد.</p>`; return; }
        const items = conns.map(uid=>{ const u = users.find(x=>x.id===uid); const src = (u && u.img) ? u.img : ''; return `<div class="panel-item"><img src="${src}" alt="${u?u.label:''}"/><span>${u?u.label:uid}</span></div>`; }).join('');
        panelDetails.innerHTML = `<p>این محتوا توسط:</p>${items}`;
      }
    }
    function clearPanelDetails(){ panelDetails.innerHTML = `<p></p>`; }

    // reset helpers
    function clearPairStrokeStyles(){ if(nodesGroup) nodesGroup.querySelectorAll('rect').forEach(r=>{ r.style.stroke=''; r.style.strokeWidth=''; }); if(edgesGroup) edgesGroup.querySelectorAll('line').forEach(l=> { l.classList.remove('edge-emph-a','edge-emph-b'); }); if(markersGroup) markersGroup.innerHTML = ''; }
    function resetSelectionVisuals(){ selected = []; activeCompare={pairA:null,pairB:null}; if(nodesGroup) nodesGroup.querySelectorAll('rect').forEach(r=> r.classList.remove('node-selected','common-highlight')); clearPairStrokeStyles(); if(markersGroup) markersGroup.innerHTML = ''; }

    // UI wiring
    helpBtn.addEventListener('click', ()=>{ helpModal.classList.add('show'); helpModal.setAttribute('aria-hidden','false'); });
    closeHelp.addEventListener('click', ()=>{ helpModal.classList.remove('show'); helpModal.setAttribute('aria-hidden','true'); });
    compareBtn.addEventListener('click', doCompare);
    resetBtn.addEventListener('click', ()=>{ resetSelectionVisuals(); refreshVisuals(); updateStatus('بازنشانی شد'); counterEl.textContent='تعداد مشترک: -'; clearPanelDetails(); });
    stageBtns[1].addEventListener('click', ()=> setStage(1));
    stageBtns[2].addEventListener('click', ()=> setStage(2));
    stageBtns[3].addEventListener('click', ()=> setStage(3));
    closeCompare.addEventListener('click', ()=> { compareModal.classList.remove('show'); compareModal.setAttribute('aria-hidden','true'); });

    function setStage(s){ stage = s; selected = []; activeCompare={pairA:null,pairB:null}; document.querySelectorAll('.btn').forEach(b=> b.classList.remove('primary')); stageBtns[s].classList.add('primary'); updateStatus(`مرحله ${s} انتخاب شد`); refreshVisuals(); counterEl.textContent='تعداد مشترک: -'; clearPanelDetails(); }
    function updateStatus(msg){ if(msg) statusEl.textContent = msg; else statusEl.textContent = `انتخاب: ${selected.length} / مجاز: ${stage===3?4:2}`; }
    function pulse(msg){ const prev = statusEl.textContent; statusEl.textContent = msg; setTimeout(()=> updateStatus(), 1400); }
    function debounce(fn, wait){ let t; return function(...args){ clearTimeout(t); t = setTimeout(()=> fn.apply(this,args), wait); }; }

    // initial
    draw();
    setStage(1);
    window.addEventListener('resize', debounce(()=>{ draw(); setStage(stage); }, 160));

  }); // DOMContentLoaded
})(); // IIFE
