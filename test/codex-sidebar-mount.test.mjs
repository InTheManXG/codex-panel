import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../inject/codex-panel.user.js", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("  function buttonMatches("), source.indexOf("  function findPageHost("));
function fixture(markup) {
  const dom = new JSDOM(markup);
  let opened = 0;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return {top:100,bottom:130,height:this.hidden?0:30};
  };
  const api = vm.runInNewContext(`let entry=null; const destroyed=false, active=false;
    const OWNED_ATTRIBUTE="data-codex-panel-owned",ENTRY_ID="codex-panel-entry",PLUGIN_LABELS=["plugins","插件"];
    const normalizedLabel=value=>value.trim().toLowerCase();
    ${functions}
    ({ensureEntry,findReferenceButton})`, {
    document:dom.window.document,installStyles(){},openPanel(){opened++;},
  });
  return {dom,api,get opened(){return opened;}};
}

test("new sidebar destinations outside the scroll area mount exactly one functional entry", () => {
  for (const tag of ["button","a","div"]) {
    const f=fixture(`<main><div data-slate-sidebar-content><nav><${tag} class="sidebar-item" role="button" data-sidebar-destination="customize" href="/skills" aria-labelledby="native"><span class="text-fade-truncate" id="native">Plugins</span></${tag}></nav><div data-app-action-sidebar-scroll><section data-app-action-sidebar-section></section></div></div></main>`);
    f.api.ensureEntry();f.api.ensureEntry();
    const entry=f.dom.window.document.getElementById("codex-panel-entry");
    assert.ok(entry);
    assert.equal(f.dom.window.document.querySelectorAll("#codex-panel-entry").length,1);
    assert.equal(entry.textContent.trim(),"任务面板");
    assert.equal(entry.hasAttribute("href"),false);
    assert.equal(entry.hasAttribute("data-sidebar-destination"),false);
    assert.equal(entry.hasAttribute("aria-labelledby"),false);
    entry.click();assert.equal(f.opened,1);
    if(tag!=="button") {
      entry.dispatchEvent(new f.dom.window.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
      assert.equal(f.opened,2);
    }
    const nav=entry.parentElement;
    const replacement=nav.cloneNode(true);
    replacement.querySelector("#codex-panel-entry").remove();
    nav.replaceWith(replacement);f.api.ensureEntry();
    assert.equal(entry.isConnected,true);
    assert.equal(entry.parentElement,replacement);
  }
});

test("legacy scroll area accepts native link and role-button rows", () => {
  for(const row of ['<a class="sidebar-item" href="/skills">Plugins</a>','<div class="sidebar-item" role="button">Plugins</div>']) {
    const f=fixture(`<div data-app-action-sidebar-scroll>${row}</div>`);
    f.api.ensureEntry();assert.ok(f.dom.window.document.getElementById("codex-panel-entry"));
  }
});

test("Free sidebar mounts after New chat without plugins, pets or destination attributes", () => {
  for (const container of ['aside', 'div data-slate-sidebar-content']) {
    for (const label of ['新聊天', 'New chat']) {
      const tag = container.split(' ')[0];
      const f = fixture(`<${container}><a id="new-chat" href="/" class="sidebar-item"><svg></svg>${label}</a><div data-app-action-sidebar-scroll><section data-app-action-sidebar-section>没有项目</section></div></${tag}>`);
      try {
        f.api.ensureEntry();
        f.api.ensureEntry();
        const { document, KeyboardEvent } = f.dom.window;
        const entry = document.getElementById('codex-panel-entry');
        assert.equal(document.querySelectorAll('#codex-panel-entry').length, 1);
        assert.equal(entry.previousElementSibling.id, 'new-chat');
        assert.equal(entry.textContent.trim(), '任务面板');
        assert.ok(entry.querySelector('svg rect'));
        assert.equal(entry.hasAttribute('href'), false);
        entry.click();
        entry.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        assert.equal(f.opened, 2);
        assert.equal(document.getElementById('new-chat').getAttribute('href'), '/');
        const oldRoot = entry.parentElement;
        const newRoot = oldRoot.cloneNode(true);
        newRoot.querySelector('#codex-panel-entry').remove();
        oldRoot.replaceWith(newRoot);
        f.api.ensureEntry();
        assert.equal(entry.parentElement, newRoot);
      } finally { f.dom.window.close(); }
    }
  }
});

test("Free fallback ignores chat-area controls and hidden or inert sidebar rows", () => {
  const f = fixture('<main><button>新聊天</button></main><aside><button hidden>新聊天</button><div inert><button>New chat</button></div></aside>');
  try {
    f.api.ensureEntry();
    assert.equal(f.dom.window.document.getElementById('codex-panel-entry'), null);
  } finally { f.dom.window.close(); }
});
