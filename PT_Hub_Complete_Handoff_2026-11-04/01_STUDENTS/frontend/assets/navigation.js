// Shared phone navigation; initialize on fresh loads and restored pages.
(()=>{
 'use strict';
 function initialize(){
  const header=document.querySelector('body > header'),nav=document.querySelector('nav[aria-label="Main navigation"]');
  const button=header?.querySelector('.phone-menu-toggle');if(!nav||!button)return;
  nav.id='mainNavigation';document.body.classList.add('phone-menu-enabled');
  const setOpen=open=>{document.body.classList.toggle('phone-menu-open',open);button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close navigation':'Open navigation')};
  setOpen(false);
  if(button.dataset.menuBound)return;button.dataset.menuBound='true';
  const phone=matchMedia('(max-width:767px), (max-height:500px) and (pointer:coarse)');
  button.addEventListener('click',()=>setOpen(button.getAttribute('aria-expanded')!=='true'));
  nav.addEventListener('click',e=>{if(e.target.closest('a'))setOpen(false)});
  document.addEventListener('click',e=>{if(!nav.contains(e.target)&&!button.contains(e.target))setOpen(false)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&phone.matches&&button.getAttribute('aria-expanded')==='true'){setOpen(false);button.focus()}});
  phone.addEventListener('change',()=>setOpen(false));
  window.addEventListener('pagehide',()=>setOpen(false));
 }
 initialize();
 document.addEventListener('DOMContentLoaded',initialize,{once:true});
 window.addEventListener('pageshow',initialize);
})();
