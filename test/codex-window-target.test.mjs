import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../scripts/codex-injector.mjs", import.meta.url), "utf8");
const select = vm.runInNewContext(`${source.slice(source.indexOf("function isCodexTarget("), source.indexOf("export async function waitForRendererReady("))}; isCodexTarget`, {URL});

test("detached ChatGPT windows cannot displace the main Codex renderer", () => {
  const target = url => ({type:"page",title:"ChatGPT",url});
  assert.equal(select(target("app://-/detached-window.html?initialRoute=%2Fdetached-window")), false);
  assert.equal(select(target("app://-/detached-window.html")), false);
  assert.equal(select(target("app://-/index.html?initialRoute=/detached-window")), false);
  assert.equal(select(target("app://-/index.html?initialRoute=%2Favatar-overlay")), false);
  assert.equal(select(target("app://-/index.html?initialRoute=%2Fglobal-dictation")), false);
  assert.equal(select(target("app://-/index.html")), true);
  assert.equal(select(target("app://-/index.html?initialRoute=%2Fthreads%2Ftest")), true);
});

test("unmounted entries never report successful injection", async () => {
  const start = source.indexOf("async function injectTarget(");
  const end = source.indexOf("async function injectAll(", start);
  for (const attachExisting of [true, false]) {
    let closed = false;
    const cdp = {send:async () => ({}),on(){},close(){closed=true;}};
    const inject = vm.runInNewContext(`${source.slice(start,end)}; injectTarget`, {
      installPanelHostBinding:()=>({install:async()=>{},publishHeartbeat:async()=>{}}),
      waitForRendererReady:async()=>{},prepareCodexProviderQuotaFix:async()=>"",panelEnvironment:()=>null,
      readInjectionStatus:async()=>({}),reconcileInjectionRuntime:async()=>({scriptIdentifier:"1",shouldRemainOpen:false}),
      waitForInjectionStatus:async()=>({entryMounted:false,sourceHash:"current",frameUrl:null}),
      registerInjectionSource:async()=>"1",reloadRenderer:async()=>{},evaluateInjectionSource:async()=>{},
      publishInjectionScriptIdentifier:async()=>{},unregisterQuotaPolicyCdp(){},
    });
    await assert.rejects(inject({connect:async()=>cdp},{},"source","current",false,null,true,{},attachExisting,"token",()=>{},()=>{},()=>{}), /入口尚未挂载/);
    assert.equal(closed,true);
  }
});
