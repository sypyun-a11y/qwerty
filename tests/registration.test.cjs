const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const boot = html.slice(html.indexOf('/* ---------- boot ---------- */'), html.lastIndexOf('})();'));

async function load(saved) {
  const store = new Map(Object.entries(saved));
  const ctx = vm.createContext({
    items: [], events: [], memos: [], SEED_V: 3,
    DB: { ok: true, open: async () => {}, get: async k => store.get(k), set: async (k,v) => { store.set(k,v); return true; } },
    samples: () => [{ id:'sample', sample:true }],
    sampleEvents: () => [{ id:'sample-event', sample:true }],
    sampleMemos: () => [{ id:'sample-memo', sample:true }],
    migrate: x => x,
    $: () => ({}), localStorage: { getItem: () => null }, location: { hash:'' },
    TABS: ['list','cal','memo'], setTab: () => {},
  });
  ctx.persist = async () => ctx.DB.set('items', ctx.items);
  ctx.saveEvents = async () => ctx.DB.set('events', ctx.events);
  ctx.saveMemos = async () => ctx.DB.set('memos', ctx.memos);
  await vm.runInContext(boot, ctx);
  return { ctx, store };
}

test('first launch starts with no fake listings', async () => {
  const { ctx, store } = await load({});
  assert.equal(ctx.items.length, 0);
  assert.equal(store.get('items').length, 0);
});
test('existing fake listings are removed from storage without losing real listings or photos', async () => {
  const real = { id:'real', addr:'실제 주소', photos:['data:image/jpeg;base64,test'] };
  const { ctx, store } = await load({ items:[{id:'fake',sample:true},real], events:[], memos:[], seedv:3 });
  assert.deepEqual(Array.from(ctx.items), [real]);
  assert.deepEqual(Array.from(store.get('items')), [real]);
});
test('memo edits begin persistence immediately, before any render debounce', () => {
  const start = html.indexOf("$('#memoBody').addEventListener('input',");
  const end = html.indexOf("  $('#memoBack')", start);
  let handler;
  const m = { id:'memo', body:'' };
  const written = [];
  const nodes = { '#memoBody': { addEventListener: (_,fn) => { handler = fn; } }, '#memoSaved': { textContent:'' } };
  vm.runInNewContext(html.slice(start,end), {
    m, memoUI:{sel:'memo'}, memoTimer:null, Date,
    $: s=>nodes[s], clearTimeout:()=>{}, setTimeout:()=>1,
    saveMemos: async () => { written.push({...m}); return true; }, renderMemoList:()=>{},
  });
  handler({target:{value:'마지막 입력'}});
  assert.equal(written.length, 1, 'Persistence must not wait for a timer');
  assert.equal(written[0].body, '마지막 입력');
});
test('calendar saves selected contract, move-in and showing tags', async () => {
  const start = html.indexOf('function renderDay(){');
  const end = html.indexOf("$('#calPrev')", start);
  for (const tag of ['계약','입주','매물소개','퇴실']) {
    let submit;
    const events = [];
    const form = { querySelector: () => ({value:tag}), addEventListener:(_,fn)=>{submit=fn;} };
    const nodes = { '#dayPanel': { innerHTML:'', querySelectorAll:()=>[] }, '#evForm':form,
      '#ev_title':{value:'방문 일정'}, '#ev_memo':{value:'상담 메모'}, '#ev_time':{value:'14:00'} };
    const tagsDeclaration = html.match(/const EVENT_TAGS = .*?;/)[0];
    vm.runInNewContext(tagsDeclaration+'\n'+html.slice(start,end)+'\nrenderDay();', {
      cal:{sel:'2026-10-01'}, Date, dayItems:()=>[], events, esc:String, uid:()=>tag,
      EVENT_TAGS:['계약','입주','매물소개','퇴실'], $:s=>nodes[s],
      saveEvents:async()=>true, renderCal:()=>{}, toast:()=>{},
    });
    assert.ok(nodes['#dayPanel'].innerHTML.includes(`value="${tag}"`), `Missing selectable tag ${tag}`);
    await submit({preventDefault:()=>{}});
    assert.equal(events[0].tag, tag);
  }
});
test('calendar month entries include saved tag and preserve untagged older events', () => {
  const source = html.slice(html.indexOf('function dayItems('), html.indexOf('function renderCal('));
  const entries = vm.runInNewContext(source+"\ndayItems('2026-10-01');", {
    events:[{id:'a',date:'2026-10-01',title:'상담',tag:'매물소개',time:'14:00'}, {id:'b',date:'2026-10-01',title:'기존 일정'}], items:[],
  });
  assert.equal(entries[0].label, '[매물소개] 14:00 상담');
  assert.equal(entries[1].label, '기존 일정');
});
test('day/night switch updates buttons and remembers the selected theme', () => {
  const source = html.slice(html.indexOf('/* ---------- theme ---------- */'), html.indexOf('/* ---------- storage'));
  const root = { dataset:{} };
  const buttons = ['dark','light'].map(theme=>({dataset:{theme},classList:{toggle:()=>{}},setAttribute(k,v){this[k]=v},addEventListener(_,fn){this.click=fn}}));
  const store = new Map();
  vm.runInNewContext(source, {document:{documentElement:root,querySelectorAll:()=>buttons},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}});
  assert.equal(root.dataset.theme,'dark');
  buttons[1].click();
  assert.equal(root.dataset.theme,'light');
  assert.equal(store.get('qwerty_theme'),'light');
  assert.equal(buttons[1]['aria-pressed'],true);
  buttons[0].click();
  assert.equal(root.dataset.theme,'dark');
});
test('memo write-ahead backup survives navigation before IndexedDB commits', () => {
  const source = html.slice(html.indexOf('const saveMemos ='), html.indexOf('const memoTitle ='));
  const memos=[{id:'memo',body:'마지막 입력'}];
  const store=new Map();
  vm.runInNewContext(source+'\nsaveMemos();', {memos,JSON,
    localStorage:{setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k),removeItem:k=>store.delete(k)},
    DB:{set:()=>new Promise(()=>{})},
  });
  assert.deepEqual(JSON.parse(store.get('qwerty_memos_pending')||'null'),memos);
});
test('empty saved listings never regenerate fake listings', async () => {
  const { ctx } = await load({ items:[], events:[], memos:[], seedv:1 });
  assert.equal(ctx.items.length, 0);
});
