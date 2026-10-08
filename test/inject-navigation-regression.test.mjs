import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { act, createContext, createElement } from "react";
import { createRoot } from "react-dom/client";

const source = await readFile(
  process.env.TASKBOARD_INJECTION_SOURCE_PATH || new URL("../inject/codex-panel.user.js", import.meta.url),
  "utf8",
);

async function withReactDom(run) {
  const dom = new JSDOM('<div id="root"></div>');
  const previousWindow = globalThis.window;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = dom.window;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await run({ root, document: dom.window.document, window: dom.window });
  } finally {
    await act(() => root.unmount());
    globalThis.window = previousWindow;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    dom.window.close();
  }
}

async function navigationHarness({ root, document, window }, { deferred = false } = {}) {
  const entries = [{ pathname: "/home", search: "", hash: "", state: null, key: "0" }];
  const subscribers = new Set();
  const cachedDestinations = new Map();
  const pending = [];
  let index = 0, nextKey = 1, pushes = 0;
  let historyAction = "POP";
  const router = {
    get state() { return { location: entries[index], historyAction }; },
    subscribe(notify) { subscribers.add(notify); return () => subscribers.delete(notify); },
    navigate(to, options) {
      if (typeof to !== "number") pushes++;
      const commit = () => {
        historyAction = typeof to === "number" ? "POP" : options?.replace ? "REPLACE" : "PUSH";
        if (typeof to === "number") index += to;
        else {
          const location = { ...to, state: options?.state, key: String(nextKey++) };
          if (options?.replace) entries[index] = location;
          else entries.splice(++index, entries.length, location);
        }
        // Native destination restoration preserves the cached location state.
        cachedDestinations.set(entries[index].pathname, { ...entries[index] });
        subscribers.forEach((notify) => notify());
      };
      if (!deferred) { commit(); return; }
      return new Promise((resolve) => pending.push(() => { commit(); resolve(); }));
    },
  };
  const NavigationContext = createContext(null);
  const render = () => act(() => root.render(createElement(
    NavigationContext.Provider,
    { value: { router } },
    createElement("aside", null, createElement("nav", { "data-app-navigation-rail": "" },
      ...["home", "plugins"].map((destination) => createElement("button", {
        key: destination,
        "data-sidebar-destination": destination,
        "aria-current": router.state.location.pathname === `/${destination}` ? "page" : undefined,
      }, destination)),
    )),
  )));
  await render();
  const start = source.indexOf("  function connectNativeNavigation()");
  const end = source.indexOf("  function scheduleRefresh()", start);
  const api = vm.runInNewContext(`(() => {
    let nativeNavigator = null, detachNativeNavigation = null, lastNativeLocation = null;
    let active = false, destroyed = false, lastNativeThreadId = "", pendingPanelNavigation = false;
    const panelLocationKeys = new Set();
    const PANEL_ROUTE_STATE = "__codexPanel";
    const normalizeThreadId = value => value;
    const publishPendingThreadAssociation = () => {};
    const showPanel = () => { active = true; };
    const closePanel = () => { active = false; };
    ${source.slice(start, end)}
    return { openPanel, leavePanel, onDocumentClick, active: () => active };
  })()`, { document });
  document.addEventListener("click", api.onDocumentClick, true);
  return {
    api, router, render, cachedDestinations,
    pushes: () => pushes,
    flush: async () => { pending.splice(0).forEach((commit) => commit()); await render(); },
    clickCurrent: () => document.querySelector('[aria-current="page"]').dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    ),
  };
}

test("restoring a native destination does not restore Panel, while Back and Forward do", async () => {
  await withReactDom(async (dom) => {
    const { api, router, render, cachedDestinations, clickCurrent } = await navigationHarness(dom);
    await api.openPanel();
    const panelKey = router.state.location.key;
    const cachedHome = cachedDestinations.get("/home");
    assert.equal(api.active(), true);
    router.navigate({ pathname: "/plugins", search: "", hash: "" });
    await render();
    assert.equal(api.active(), false);
    router.navigate({ pathname: cachedHome.pathname, search: "", hash: "" }, { state: cachedHome.state });
    await render();
    assert.notEqual(router.state.location.key, panelKey);
    assert.equal(api.active(), false, "a copied Panel marker on a new history entry is a native destination");
    clickCurrent();
    assert.equal(router.state.location.pathname, "/home");

    await api.openPanel();
    const secondPanelKey = router.state.location.key;
    clickCurrent();
    assert.equal(api.active(), false);
    assert.equal(router.state.location.pathname, "/home", "current Home must not navigate to a previous destination");
    router.navigate(-1);
    assert.equal(router.state.location.key, secondPanelKey);
    assert.equal(api.active(), true, "Back restores the actual Panel history entry");
    router.navigate(1);
    assert.equal(api.active(), false, "Forward restores the native destination");
  });
});

test("native same-route state replacement keeps Panel open without adopting copied pushes", async () => {
  await withReactDom(async (dom) => {
    const { api, router } = await navigationHarness(dom);
    await api.openPanel();
    const location = router.state.location;
    router.navigate(location, { state: { ...location.state, sidebarProductMode: "codex" }, replace: true });
    assert.notEqual(router.state.location.key, location.key);
    assert.equal(api.active(), true, "native state replacement must not immediately close Panel");
    router.navigate(router.state.location, { state: router.state.location.state });
    assert.equal(api.active(), false, "a new native destination must still close Panel");
  });
});

test("rapid Panel clicks issue only one pending asynchronous native navigation", async () => {
  await withReactDom(async (dom) => {
    const { api, pushes, flush, router } = await navigationHarness(dom, { deferred: true });
    const opening = [api.openPanel(), api.openPanel(), api.openPanel()];
    assert.equal(pushes(), 1);
    assert.equal(api.active(), false);
    await flush();
    await Promise.all(opening);
    assert.equal(api.active(), true);
    await api.openPanel();
    assert.equal(pushes(), 1);
    const back = router.navigate(-1);
    await flush();
    await back;
    assert.equal(api.active(), false);
  });
});

test("Panel icon overrides preserve React's sole SVG through selected component replacements", async () => {
  await withReactDom(async ({ root, document }) => {
    const start = source.indexOf("  function syncNativeRailIcons()");
    const end = source.indexOf("  function currentTheme()", start);
    const { syncNativeRailIcons, restoreNativeRailIcons } = vm.runInNewContext(`(() => {
      const OWNED_ATTRIBUTE = "data-codex-panel-owned";
      const NATIVE_ICON_ATTRIBUTE = "data-codex-panel-native-icon";
      const NATIVE_OUTLINE_ICONS = { "builtin:customize": '<path d="M1 1h18v18H1Z" fill="currentColor"/>' };
      ${source.slice(start, end)}
      return { syncNativeRailIcons, restoreNativeRailIcons };
    })()`, { document, encodeURIComponent });
    const Outline = () => createElement("svg", { "data-artwork": "outline" }, createElement("path", { d: "M1 1h18" }));
    const Filled = () => createElement("svg", { "data-artwork": "filled" }, createElement("path", { d: "M1 1h18v18H1Z" }));
    for (const selected of [false, true, false, true, false]) {
      await act(() => root.render(createElement("nav", { "data-app-navigation-rail": "" },
        createElement("button", { "data-sidebar-destination": "builtin:customize", "data-selected": selected ? "" : undefined },
          createElement(selected ? Filled : Outline),
        ),
      )));
      const button = document.querySelector("button");
      const reactSvg = button.querySelector("svg");
      syncNativeRailIcons();
      syncNativeRailIcons();
      assert.equal(button.querySelectorAll("svg").length, 1, "Panel must not add an SVG sibling to React-owned children");
      assert.equal(button.querySelector("svg"), reactSvg);
      assert.equal(reactSvg.dataset.artwork, selected ? "filled" : "outline");
      restoreNativeRailIcons();
      assert.equal(button.querySelector("svg"), reactSvg, "restoring the rail must not remove React's SVG");
      syncNativeRailIcons();
    }
    restoreNativeRailIcons();
  });
});

test("opening Panel reads compact profile identity without opening the native settings menu", async () => {
  await withReactDom(async ({ root, document, window }) => {
    const Profile = ({ sidebarFooter, label }) => createElement("button", {
      "aria-haspopup": "menu", "aria-label": "Open profile menu",
    }, createElement("svg"), label);
    let menuOpens = 0;
    document.addEventListener("keydown", () => menuOpens++);
    const start = source.indexOf("  async function readCodexUser(");
    const end = source.indexOf("  function readHostContext(", start);
    const readUser = vm.runInNewContext(`(() => {
      const normalizedLabel = value => value?.toLowerCase() || "";
      const normalizeCodexAvatar = async value => value;
      const userIdFromName = value => value;
      const readCodexProfileIdentity = () => null;
      const codexProfileMenu = () => null;
      ${source.slice(start, end)}
      return readCodexUser;
    })()`, { document, window, KeyboardEvent: window.KeyboardEvent });
    await act(() => root.render(createElement(Profile, { sidebarFooter: {
      profileIdentity: { displayName: "Fixture User", profileImageUrl: "https://example.com/avatar.png" },
    } })));
    const user = await readUser("fixture-id");
    assert.equal(menuOpens, 0, "identity capture must not synthesize a menu-opening key press");
    assert.equal(user.name, "Fixture User");
    assert.equal(user.id, "fixture-id");
    assert.equal(user.avatarUrl, "https://example.com/avatar.png");
    await act(() => root.render(createElement(Profile, { sidebarFooter: { profileIdentity: null } })));
    assert.equal(await readUser("fixture-id"), null);
    assert.equal(menuOpens, 0, "a profile still loading must not open settings either");
    await act(() => root.render(createElement(Profile, { label: "Legacy User" })));
    assert.equal((await readUser("fixture-id")).name, "Legacy User");
    await act(() => root.render(createElement(Profile)));
    assert.equal(await readUser("fixture-id"), null);
    assert.equal(menuOpens, 0, "an unavailable legacy identity must not open settings either");
  });
});
