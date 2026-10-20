/* One-pane demo loop: plays clips back to back, preloads only the next clip. */
(function(){
  var fig=document.querySelector('[data-demo-loop]'),data=document.getElementById('demo-clips');
  if(!fig||!data)return;
  var clips;try{clips=JSON.parse(data.textContent)}catch(e){return}
  var stage=fig.querySelector('.m-stage'),cap=fig.querySelector('.m-cap'),dots=fig.querySelector('.m-dots'),next=fig.querySelector('.m-next');
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var base='/assets/demos/',ver=data.getAttribute('data-v'),q=ver?'?v='+ver:'',vids=[],cur=0;
  function make(i){
    var c=clips[i],v=document.createElement('video');
    v.muted=true;v.defaultMuted=true;v.setAttribute('muted','');v.setAttribute('playsinline','');v.playsInline=true;
    v.preload='none';v.poster=base+c.id+'.jpg'+q;v.width=1280;v.height=800;v.setAttribute('aria-label',c.label);
    v.dataset.i=i;return v;
  }
  function load(v){
    if(v.dataset.loaded)return;v.dataset.loaded='1';
    var c=clips[+v.dataset.i];
    [['webm','video/webm'],['mp4','video/mp4']].forEach(function(t){var s=document.createElement('source');s.src=base+c.id+'.'+t[0]+q;s.type=t[1];v.appendChild(s)});
    v.preload='auto';v.load();
  }
  // reuse the server-rendered first video
  var first=stage.querySelector('video');first.removeAttribute('loop');first.loop=false;first.dataset.i=0;first.dataset.loaded='1';
  vids[0]=first;
  for(var i=1;i<clips.length;i++){vids[i]=make(i);stage.appendChild(vids[i])}
  clips.forEach(function(c,i){
    var b=document.createElement('button');b.type='button';b.className='m-dot';b.setAttribute('role','tab');
    b.setAttribute('aria-label',(i+1)+' of '+clips.length+': '+c.label.replace(/^Real screen recording: /,''));
    b.addEventListener('click',function(){show(i,true)});dots.appendChild(b);
  });
  dots.hidden=false;
  function show(i,user){
    i=(i+clips.length)%clips.length;
    var old=vids[cur],v=vids[i];
    if(old!==v){old.pause();old.classList.remove('is-on')}
    cur=i;load(v);v.classList.add('is-on');
    cap.innerHTML=clips[i].cap;
    [].forEach.call(dots.children,function(d,k){d.setAttribute('aria-selected',k===i?'true':'false')});
    if(!reduce){try{v.currentTime=0}catch(e){}var p=v.play();if(p&&p.catch)p.catch(function(){})}
    if(!reduce)load(vids[(i+1)%clips.length]); // preload next only
  }
  vids.forEach(function(v,i){v.addEventListener('ended',function(){if(i===cur&&!reduce)show(cur+1)})});
  if(reduce){
    first.removeAttribute('autoplay');first.pause();
    next.hidden=false;next.addEventListener('click',function(){show(cur+1,true)});
    stage.addEventListener('click',function(){var v=vids[cur];if(v.paused){v.play()}else{v.pause()}});
  }else{
    // pause when offscreen
    if('IntersectionObserver'in window)new IntersectionObserver(function(es){es.forEach(function(e){var v=vids[cur];if(e.isIntersecting){var p=v.play();if(p&&p.catch)p.catch(function(){})}else v.pause()})}).observe(fig);
  }
  show(0);
})();
