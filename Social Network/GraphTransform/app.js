const USERS = {
  a:{id:'a',coord:{x:-1,y:0}, avatar:'assets/001-user.png'},
  b:{id:'b',coord:{x:0,y:1}, avatar:'assets/002-user.png'},
  c:{id:'c',coord:{x:0,y:-1}, avatar:'assets/003-user.png'},
  d:{id:'d',coord:{x:1,y:0}, avatar:'assets/004-user.png'}
};

const USER_EDGES = [ ['a','c'], ['c','d'], ['a','d'], ['b','d'] ];

const FIXED_CONTENT_COORDS = [ {x:-0.5,y:2}, {x:0.5,y:-2}, {x:-1.5,y:-3} , {x:1.5,y:2},{x:-2,y:-0.5},{x:-1.4,y:1.1} ];
const CONTENT_EMOJIS = ['🍫','🎸','🎵', '🚬' , '💻' , '🕊']; // can extend

const REACTION_VALUES = [1,0.5,0,-0.5,-1];
const EMOJI_MAP = { '1':'😍', '0.5':'🙂', '0':'🙁', '-0.5':'🤢', '-1':'☠' };

function generateStages(){
  const stages = [];
  for(let i=0;i<CONTENT_EMOJIS.length;i++){
    const coord = FIXED_CONTENT_COORDS[i] || {x:-0.5, y:2 + i*0.5};
    const icon = CONTENT_EMOJIS[i % CONTENT_EMOJIS.length];
    const userIds = Object.keys(USERS);
    const suggested = userIds.filter(()=> Math.random() < 0.3);
    if(suggested.length === 0) suggested.push(userIds[Math.floor(Math.random()*userIds.length)]);
    stages.push({ content:{id:`C${i+1}`, coord, icon, zIndex:1}, suggested, reactions:{} });
  }
  return stages;
}

let STAGES = generateStages();
let stageIndex = 0;
let phase = 0; // 0 suggestion, 1 reaction

// DOM refs
const leftSvg = document.getElementById('leftSvg');
const rightSvg = document.getElementById('rightSvg');
const btnPlay = document.getElementById('btnPlay');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const stageTitle = document.getElementById('stageTitle');
const phaseTitle = document.getElementById('phaseTitle');
const picker = document.getElementById('picker');
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelp = document.getElementById('closeHelp');

function mapCoordToPx(coord, w=400, h=400){
  const cx = w/2, cy = h/2;
  const rx = Math.min(w,h)/2 - 60;
  const ry = Math.min(w,h)/2 - 80;
  return { x: cx + coord.x * rx * 0.55, y: cy - coord.y * ry * 0.55 };
}

function clearSvg(svg){ while(svg.firstChild) svg.removeChild(svg.firstChild); }
function createSvg(tag){ return document.createElementNS('http://www.w3.org/2000/svg', tag); }

// small curved path for better visual (very slight curvature)
function curvedPath(p1,p2, offset = 8){
  const mx = (p1.x + p2.x)/2; const my = (p1.y + p2.y)/2;
  const dx = p2.x - p1.x, dy = p2.y - p1.y; const len = Math.sqrt(dx*dx+dy*dy)||1;
  const nx = -dy/len, ny = dx/len;
  const cx = mx + nx*offset, cy = my + ny*offset;
  return `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`;
}

// render user-user edges (curved) - used in both graphs
function renderUserEdges(svg){
  USER_EDGES.forEach(e=>{
    const [u1,u2]=e;
    const p1=mapCoordToPx(USERS[u1].coord), p2=mapCoordToPx(USERS[u2].coord);
    const path=createSvg('path');
    path.setAttribute('d',curvedPath(p1,p2,10));
    path.setAttribute('fill','none');
    path.setAttribute('stroke',getComputedStyle(document.documentElement).getPropertyValue('--edge')||'#facc15');
    path.setAttribute('stroke-width','2.4');
    path.setAttribute('stroke-linecap','round');
    svg.appendChild(path);
  });
}

// render left graph: users + user-user edges + only current content icon near suggested users
function renderLeft(){
  clearSvg(leftSvg);
  const defs=createSvg('defs'); defs.innerHTML = `<clipPath id="clip-left"><circle cx="0" cy="0" r="26"></circle></clipPath>`; leftSvg.appendChild(defs);
  renderUserEdges(leftSvg);
  const cur=STAGES[stageIndex];
  Object.entries(USERS).forEach(([id,u])=>{
    const p=mapCoordToPx(u.coord);
    const g=createSvg('g'); g.setAttribute('transform',`translate(${p.x},${p.y})`);
    const ring=createSvg('circle'); ring.setAttribute('r',28); ring.setAttribute('fill','#0f2a31'); ring.setAttribute('stroke','#083b50'); ring.setAttribute('stroke-width','2'); g.appendChild(ring);
    const img=createSvg('image'); img.setAttribute('href',u.avatar); img.setAttribute('x',-20); img.setAttribute('y',-20); img.setAttribute('width',40); img.setAttribute('height',40); img.setAttribute('clip-path','url(#clip-left)'); g.appendChild(img);
    // only show content icon of current round for suggested users
    if(cur.suggested.includes(id)){
      const box=createSvg('rect'); box.setAttribute('x',-44); box.setAttribute('y',-40); box.setAttribute('width',22); box.setAttribute('height',22); box.setAttribute('rx',6); box.setAttribute('fill','#f3f5f6'); box.setAttribute('opacity','0.98'); g.appendChild(box);
      const icon=createSvg('text'); icon.setAttribute('x',-33); icon.setAttribute('y',-22); icon.setAttribute('class','content-emoji'); icon.setAttribute('text-anchor','middle'); icon.setAttribute('font-family','Segoe UI Emoji, Noto Color Emoji, Apple Color Emoji, Vazirmatn'); icon.textContent = cur.content.icon; g.appendChild(icon);
    }
    // show reaction emoji in reaction phase (if reacted)
    if(phase===1){
      const reactedVal = cur.reactions[id];
      if(reactedVal !== undefined){
        const em=createSvg('text'); em.setAttribute('x',12); em.setAttribute('y',-36); em.setAttribute('class','user-emoji'); em.setAttribute('font-family','Segoe UI Emoji, Noto Color Emoji, Apple Color Emoji, Vazirmatn'); em.textContent = EMOJI_MAP[String(reactedVal)]; g.appendChild(em);
      } else if(cur.suggested.includes(id)){
        const wait=createSvg('circle'); wait.setAttribute('cx',12); wait.setAttribute('cy',-36); wait.setAttribute('r',6); wait.setAttribute('fill',getComputedStyle(document.documentElement).getPropertyValue('--edge')||'#facc15'); g.appendChild(wait);
      }
    }
    leftSvg.appendChild(g);
  });
}

// render right: show users (small), user-user edges, and all content nodes up to current stage; avatar-content edges distinct color and slight curve
// جایگزین کردن تابع renderRight در app.js با این کد
function renderRight(){
  clearSvg(rightSvg);

  // defs (clipPath) را مثل قبل اضافه کن
  const defs = createSvg('defs');
  defs.innerHTML = `<clipPath id="clip-right"><circle cx="0" cy="0" r="18"></circle></clipPath>`;
  rightSvg.appendChild(defs);

  // گروه‌ها: اول گروه محتوا (nodes)، بعد گروه یال‌ها (edges)، در نهایت گروه آواتارها (avatars)
  const nodesGroup = createSvg('g');
  const edgesGroup = createSvg('g');
  const avatarsGroup = createSvg('g');

  // ابتدا یال‌های بین کاربران (user-user) را در nodesGroup (یا edgesGroup) اضافه نکنیم —
  // اگر می‌خواهی user-user edges زیر آواتار هم باشند، می‌توانیم آن‌ها را به edgesGroup اضافه کنیم.
  // (در این نسخه user-user edges کم‌رنگ در edgesGroup قرار می‌گیرند)
  USER_EDGES.forEach(e=>{
    const [u1,u2] = e;
    const p1 = mapCoordToPx(USERS[u1].coord);
    const p2 = mapCoordToPx(USERS[u2].coord);
    const path = createSvg('path');
    path.setAttribute('d', curvedPath(p1,p2,6));
    path.setAttribute('fill','none');
    path.setAttribute('stroke','rgba(250,200,21,0.12)');
    path.setAttribute('stroke-width','2');
    path.setAttribute('stroke-linecap','round');
    edgesGroup.appendChild(path);
  });

  // append groups into svg in this order:
  // nodes (content squares) -> edges (content-avatar edges + user-user) -> avatars (on top)
  rightSvg.appendChild(nodesGroup);
  rightSvg.appendChild(edgesGroup);
  rightSvg.appendChild(avatarsGroup);

  // ---------- render content nodes into nodesGroup ----------
  const nodes = STAGES.slice(0, stageIndex+1);
  const sqW = 56, sqH = 40;
  nodes.forEach((s)=>{
    const contentP = mapCoordToPx(s.content.coord);

    // draw small square into nodesGroup
    const sq = createSvg('rect');
    sq.setAttribute('x', contentP.x - sqW/2);
    sq.setAttribute('y', contentP.y - sqH/2);
    sq.setAttribute('width', sqW);
    sq.setAttribute('height', sqH);
    sq.setAttribute('rx', 10);
    sq.setAttribute('fill', '#f3f5f6');
    sq.setAttribute('opacity','0.98');
    nodesGroup.appendChild(sq);

    // emoji inside square
    const icon = createSvg('text');
    icon.setAttribute('x', contentP.x);
    icon.setAttribute('y', contentP.y + 6);
    icon.setAttribute('class','content-emoji');
    icon.setAttribute('text-anchor','middle');
    icon.setAttribute('font-family','Segoe UI Emoji, Noto Color Emoji, Apple Color Emoji, Vazirmatn');
    icon.textContent = s.content.icon;
    nodesGroup.appendChild(icon);

    // ---------- create avatar-content edges and append to edgesGroup ----------
    s.suggested.forEach(uid=>{
      const pU = mapCoordToPx(USERS[uid].coord);

      // compute direction vector from content -> avatar
      const dx = pU.x - contentP.x;
      const dy = pU.y - contentP.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      // shorten start so it begins at content square edge (half width + padding)
      const paddingFromContent = 6;
      const start = {
        x: contentP.x + nx * (sqW/2 + paddingFromContent),
        y: contentP.y + ny * (sqH/2 + paddingFromContent)
      };

      // shorten end so it stops at avatar edge (avatar radius approx 18)
      const avatarRadius = 18;
      const end = {
        x: pU.x - nx * (avatarRadius + 2), // +2 a small gap
        y: pU.y - ny * (avatarRadius + 2)
      };

      // draw a slightly curved path from start to end
      const path = createSvg('path');
      path.setAttribute('d', curvedPath(start, end, 6)); // offset small (6) for slight curvature

      // make edges thinner and colored distinct (avatar-edge)
      path.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--avatar-edge') || '#06b6d4');
      // set thinner stroke:
      path.setAttribute('stroke-width', '2');            // <<< make it thinner here
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap','round');
      // dashed if not reacted
      const reacted = s.reactions[uid] !== undefined;
      if(!reacted){
        path.setAttribute('stroke-dasharray','6 6');
      } else {
        path.setAttribute('stroke-dasharray',''); // solid
      }
      // add small transition class if you like
      path.classList.add('edge-anim');

      edgesGroup.appendChild(path);

      // if reacted, add numeric label on midpoint (same as before)
      if(reacted){
        const mid = { x:(start.x + end.x)/2, y:(start.y + end.y)/2 };
        const labBg = createSvg('rect'); labBg.setAttribute('x', mid.x - 18); labBg.setAttribute('y', mid.y - 12); labBg.setAttribute('width',36); labBg.setAttribute('height',20); labBg.setAttribute('rx',6); labBg.setAttribute('fill','#0b1722'); labBg.setAttribute('opacity','0.95'); edgesGroup.appendChild(labBg);
        const lab = createSvg('text'); lab.setAttribute('x', mid.x); lab.setAttribute('y', mid.y + 4); lab.setAttribute('text-anchor','middle'); lab.setAttribute('class','edge-label label-anim'); lab.textContent = s.reactions[uid]; edgesGroup.appendChild(lab);
        setTimeout(()=> lab.classList.add('show'), 20);
      }
    });
  });

  // ---------- avatars rendered last into avatarsGroup so they appear on top of edges ----------
  Object.entries(USERS).forEach(([id,u])=>{
    const p = mapCoordToPx(u.coord);
    const g = createSvg('g'); g.setAttribute('transform', `translate(${p.x},${p.y})`);
    const circ = createSvg('circle'); circ.setAttribute('r',18); circ.setAttribute('fill','#071826'); circ.setAttribute('stroke','rgba(255,255,255,0.02)'); circ.setAttribute('stroke-width',1.4);
    g.appendChild(circ);
    const img = createSvg('image'); img.setAttribute('href', u.avatar); img.setAttribute('x',-16); img.setAttribute('y',-16); img.setAttribute('width',32); img.setAttribute('height',32);
    img.setAttribute('clip-path','url(#clip-right)');
    g.appendChild(img);
    avatarsGroup.appendChild(g);
  });
}


// auto-assign random reactions when entering reaction phase for current stage (if not already assigned)
function autoAssignReactionsForStage(index){
  const s = STAGES[index];
  s.suggested.forEach(uid=>{
    if(s.reactions[uid] === undefined){
      const val = REACTION_VALUES[Math.floor(Math.random()*REACTION_VALUES.length)];
      s.reactions[uid] = val;
    }
  });
}

// render all and update UI buttons state
function renderAll(){ renderLeft(); renderRight(); updateUI(); updateButtons(); }

function updateUI(){ stageTitle.textContent = `مرحله ${stageIndex+1} / ${STAGES.length}`; phaseTitle.textContent = phase===0 ? 'فاز پیشنهاد' : 'فاز واکنش'; }

function updateButtons(){
  const atFirst = stageIndex===0 && phase===0;
  const atLast = stageIndex===STAGES.length-1 && phase===1;
  btnPrev.disabled = atFirst; btnNext.disabled = atLast;
}

// navigation logic
btnPrev.addEventListener('click', ()=>{
  if(phase===1){ phase=0; renderAll(); return; }
  if(stageIndex>0){ stageIndex--; phase=1; renderAll(); }
});

btnNext.addEventListener('click', ()=>{
  if(phase===0){
    // go to reaction phase and auto-assign reactions randomly
    autoAssignReactionsForStage(stageIndex);
    phase = 1; renderAll(); return;
  }
  // if reaction phase and not last stage, advance to next suggestion phase
  if(stageIndex < STAGES.length -1){
    stageIndex++; phase = 0; renderAll(); return;
  }
  // else at last stage reaction: do nothing (disabled)
});

// reset generates same fixed stages but clears reactions
btnPlay.addEventListener('click', ()=>{
  STAGES = generateStages();
  stageIndex = 0; phase = 0; renderAll();
  btnPlay.animate([{ transform:'scale(1.0)'},{ transform:'scale(0.98)'},{ transform:'scale(1.0)'}], { duration:200 });
});

// help modal
helpBtn.addEventListener('click', ()=> helpModal.style.display = 'flex');
closeHelp.addEventListener('click', ()=> helpModal.style.display = 'none');

// close picker clicking outside
document.addEventListener('click',(e)=>{ if(!picker.contains(e.target) && !e.target.closest('svg')) picker.style.display='none'; });

// keyboard
document.addEventListener('keydown',(e)=>{ if(e.key==='ArrowLeft') btnPrev.click(); if(e.key==='ArrowRight') btnNext.click(); if(e.key==='r'||e.key==='R') btnPlay.click(); });

window.addEventListener('resize', ()=> renderAll());

// initial render
renderAll();