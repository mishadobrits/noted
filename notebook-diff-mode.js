/**
 * Diff display modes (full, filtered, additions, off) inlined into generated
 * notebook HTML when the page is a diff.
 * Edit this as normal JavaScript. The wrapper publishes the script text
 * and does not run it.
 */
(function (root, factory) {
  var source = "(" + factory.toString() + ")();";
  if (typeof module === "object" && module.exports) module.exports = source;
  else root.NotebookDiffModeSource = source;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-diff-mode]'));
  if(!buttons.length)return;
  var state=window.__IPYNB_TO_HTML__||{};
  var modeKey='ipynb_to_html_diff_mode::'+String(state.noteStorageKey||state.sourceName||'notebook');
  function validMode(value){return /^(full|filtered|additions|off)$/.test(value||'');}
  function readStack(){var value=null;try{value=localStorage.getItem(modeKey);}catch(e){}if(value==null){try{value=sessionStorage.getItem(modeKey);}catch(e){}}if(!value)return [];try{var parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.filter(validMode);}catch(e){}return validMode(value)?[value]:[];}
  function writeStack(value){var encoded=JSON.stringify(value);try{localStorage.setItem(modeKey,encoded);}catch(e){}try{sessionStorage.setItem(modeKey,encoded);}catch(e){}}
  var modeStack=readStack();if(!modeStack.length)modeStack=[state.diffInitialMode||'filtered'];
  var mode=modeStack[modeStack.length-1];
  var changed=Array.prototype.slice.call(document.querySelectorAll('section[data-diff-status]'));
  var decorated=Array.prototype.slice.call(document.querySelectorAll('section[data-diff-status],section[data-diff-decoration-status]'));
  decorated.forEach(function(section){var status=section.getAttribute('data-diff-status')||section.getAttribute('data-diff-decoration-status');if(status==='del'){var row=section.closest('.cell-row');if(row)row.classList.add('diff-removed-row');}});
  function apply(next){
    mode=next||mode;
    document.body.setAttribute('data-diff-mode',mode);
    ['full','filtered','additions','off'].forEach(function(name){document.body.classList.toggle('diff-mode-'+name,mode===name);});
    buttons.forEach(function(button){button.setAttribute('aria-pressed',button.getAttribute('data-diff-mode')===mode?'true':'false');});
    writeStack(modeStack);
    if(state.applyClientHighlights)state.applyClientHighlights();
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));
  }
  buttons.forEach(function(button){button.addEventListener('click',function(){var next=button.getAttribute('data-diff-mode');if(next===mode&&modeStack.length>1)modeStack.pop();else if(next!==mode)modeStack.push(next);apply(modeStack[modeStack.length-1]);});});
  var filtered=document.querySelector('[data-diff-mode=filtered]');
  if(filtered&&!state.diffHasFilteredVariant){filtered.disabled=true;filtered.title='No diff filters were embedded in this HTML';if(mode==='filtered'){modeStack=['full'];mode='full';}}
  if(filtered)filtered.addEventListener('contextmenu',function(event){event.preventDefault();if(window.parent!==window)window.parent.postMessage({type:'notebook-diff-open-regex'},'*');});
  apply(mode);
});
