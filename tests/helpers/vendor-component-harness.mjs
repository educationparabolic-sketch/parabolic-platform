import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {root, ts} from "./vendor-action-inventory.mjs";

// Deterministic hook/component unit harness, not a DOM or browser proof. Effects
// run explicitly after render; stale requests deliberately ignore AbortSignal.
export function componentHarness() {
  const slots = [], effects = [];
  let index = 0, component, props = {}, tree, mounted = true, dirty = true;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = {value: typeof initial === "function" ? initial() : initial};
      return [slots[i].value, value => {
        if (!mounted) return;
        const next = typeof value === "function" ? value(slots[i].value) : value;
        if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; }
      }];
    },
    useRef(initial) { const i = index++; return slots[i] ??= {current: initial}; },
    useMemo(create, deps) {
      const i = index++;
      if (!same(slots[i]?.deps, deps)) slots[i] = {deps, value: create()};
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const i = index++;
      if (!same(slots[i]?.deps, deps)) {
        const previous = slots[i]; slots[i] = {deps};
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
  };
  const jsx = (type, props, key) => ({type, props: props ?? {}, key});
  const jsxRuntime = {jsx, jsxs: jsx, Fragment: "fragment"};
  const render = () => { assert.ok(mounted); index = 0; dirty = false; tree = component(props); return tree; };
  return {
    react,
    async load(path, dependencies = {}, exports = "") {
      const source = await readFile(`${root}/${path}`, "utf8");
      const output = ts.transpileModule(`${source}\n${exports}`, {fileName: path,
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText;
      const module = {exports: {}};
      new Function("module", "exports", "require", output)(module, module.exports, name => {
        if (name === "react") return react;
        if (name === "react/jsx-runtime") return jsxRuntime;
        assert.ok(name in dependencies, `Unregistered test dependency: ${name}`);
        return dependencies[name];
      });
      return module.exports;
    },
    mount(fn, initial = {}) { component = fn; props = initial; return render(); },
    render(next = props) { props = next; return render(); },
    async flush() {
      for (let turn = 0; turn < 12; turn++) {
        effects.splice(0).forEach(run => run());
        await Promise.resolve();
        if (mounted && dirty) render();
      }
      return tree;
    },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
    get tree() { return tree; },
  };
}
export function nodes(tree) {
  if (tree == null || typeof tree === "boolean") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== "object") return [tree];
  if (typeof tree.type === "function") return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props.children)];
}
export const text = tree => nodes(tree).filter(node => typeof node !== "object").join(" ").replace(/\s+/gu, " ").trim();
export function control(tree, tag, label) {
  const matches = nodes(tree).filter(node => node?.type === tag && text(node.props.children).includes(label));
  assert.equal(matches.length, 1, `${tag}: ${label}`);
  return matches[0];
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
