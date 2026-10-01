async (page) => {
  const context = await page.context().browser().newContext({ permissions:['clipboard-read','clipboard-write'] });
  const p = await context.newPage();
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const ready = () => p.waitForFunction(() => document.querySelector('#saveState')?.textContent.includes('자동 저장'));
  const read = key => p.evaluate(async key => {
    const db = await new Promise((resolve,reject) => { const r=indexedDB.open('maemuljang',1); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
    return new Promise((resolve,reject) => { const r=db.transaction('kv').objectStore('kv').get(key); r.onsuccess=()=>{db.close();resolve(r.result);}; r.onerror=()=>reject(r.error); });
  }, key);
  try {
    await p.goto('http://127.0.0.1:8765/'); await ready();
    check((await read('items')).length===0, 'Fresh launch must be empty');
    await p.locator('#blankTemplateBtn').click();
    const copied=await p.evaluate(()=>navigator.clipboard.readText());
    const rows=copied.split('\n');
    check(rows.length===15 && rows.every(row=>!row.split(':').slice(1).join(':').trim()), 'Template must contain only 15 blank fields');
    await p.locator('#addBtn').click(); await p.locator('#insertTemplateBtn').click();
    check(await p.locator('#f_paste').inputValue()===copied, 'Inserted and copied template mismatch');
    await p.locator('#f_paste').fill('주소: 테스트구 검증동 1-1 검증건물 101호\n신축/구축: 구축\n종류(전세,월세,매매,상가,사무실): 월세\n금액: 21,000만원/13만원\n관리비: 95,000원\n타입(1룸,1.5룸,2룸,3룸): 1.5룸\n공시지가 126%: 250,861,968\n퇴실가능일: 2026-10-08\n만기일: 2027-09-28\n보증보험 가능여부: 가능\n주택임대사업자 가입여부: 주택임대사업자\n임대인 번호: 01012345678\n임차인 번호: 01098765432\n수수료: 양타\n특이사항: 임시 검증 매물');
    await p.locator('#pasteBtn').click();
    check(await p.locator('#f_dep').inputValue()==='21000', 'Deposit parse failed');
    check(await p.locator('#f_bldg').inputValue()==='검증건물', 'Building parse failed');
    const photos = await p.evaluate(async () => Promise.all(['qwerty-icon.png','qwerty-logo.png'].map(async name => ({name,bytes:[...new Uint8Array(await (await fetch('assets/'+name)).arrayBuffer())]}))));
    await p.locator('#f_photos').setInputFiles(photos.map(file=>({name:file.name,mimeType:'image/png',buffer:Buffer.from(file.bytes)})));
    await p.waitForFunction(()=>document.querySelectorAll('#pthumbs img').length===2);
    await p.locator('#mform button[type=submit]').click();
    await p.waitForFunction(()=>!document.querySelector('#mform'));
    await p.reload(); await ready();
    let items=await read('items');
    check(items.length===1 && items[0].photos.length===2, 'Listing/photos not persisted');
    check(items[0].photos.every(s=>s.startsWith('data:image/jpeg;base64,')), 'Photo compression failed');
    await p.locator('.card').click();
    const amount=await p.locator('dt').filter({hasText:'공시지가 126%'}).evaluate(n=>n.nextElementSibling.textContent);
    check(amount.startsWith('2억 5,086만원 (250,861,968원)'), 'Amount display order incorrect');
    await p.locator('#editBtn').click();
    check(await p.locator('#pthumbs img').count()===2, 'Photos missing in editor');
    await p.locator('#cancelBtn').click();
    await p.locator('.theme-switch [data-theme=light]').click();
    const light=await p.evaluate(()=>({bg:getComputedStyle(document.body).backgroundColor,fg:getComputedStyle(document.body).color}));
    check(light.bg==='rgb(255, 255, 255)' && light.fg==='rgb(17, 17, 17)', 'Light mode colors incorrect');
    await p.reload();await ready();
    check(await p.evaluate(()=>document.documentElement.dataset.theme)==='light', 'Light theme not remembered');
    await p.locator('[data-tab=cal]').click();
    for(const tag of ['계약','입주','매물소개','퇴실']){
      await p.locator('#evForm label').filter({hasText:tag}).click();
      await p.locator('#ev_title').fill('검증용 '+tag);await p.locator('#ev_time').fill('14:00');
      await p.locator('#ev_memo').fill('저장 검증');await p.locator('#evForm button[type=submit]').click();
      await p.waitForFunction(tag=>document.querySelector('#dayPanel').textContent.includes('검증용 '+tag),tag);
    }
    await p.reload();await ready();
    const events=await read('events');
    check(events.length===4 && new Set(events.map(e=>e.tag)).size===4, 'Calendar tags not persisted');
    const tagColors=await p.locator('#dayPanel .event-tag').evaluateAll(nodes=>nodes.map(n=>({tag:n.textContent,color:getComputedStyle(n).color})));
    check(new Set(tagColors.map(c=>c.color)).size===4, 'Tag colors must differ: '+JSON.stringify(tagColors)+' events: '+JSON.stringify(events));
    await p.screenshot({path:'/tmp/qwerty-calendar-light.png',fullPage:true});
    await p.locator('[data-tab=memo]').click();await p.locator('#memoNew').click();
    await p.locator('#memoBody').fill('검증용 메모\n입력 직후 새로고침');
    await p.reload();await ready();
    check((await read('memos'))[0]?.body==='검증용 메모\n입력 직후 새로고침', 'Memo lost on immediate reload');
    await p.locator('.theme-switch [data-theme=dark]').click();await p.reload();await ready();
    check(await p.evaluate(()=>document.documentElement.dataset.theme)==='dark', 'Dark theme not remembered');
    await p.setViewportSize({width:390,height:844});
    for(const tab of ['list','cal','memo']){
      await p.locator('[data-tab='+tab+']').click();
      await p.screenshot({path:'/tmp/qwerty-mobile-'+tab+'.png',fullPage:true});
      const overflow=await p.evaluate(()=>({width:window.innerWidth,scroll:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>window.innerWidth).map(n=>({tag:n.tagName,id:n.id,cls:n.className,right:n.getBoundingClientRect().right})).slice(0,12)}));
      check(overflow.scroll<=overflow.width, 'Mobile horizontal overflow: '+tab+' '+JSON.stringify(overflow));
    }
    await p.locator('[data-tab=cal]').click();
    await p.screenshot({path:'/tmp/qwerty-calendar-dark-mobile.png',fullPage:true});
    await p.locator('.theme-switch [data-theme=light]').click();
    await p.screenshot({path:'/tmp/qwerty-calendar-light-mobile.png',fullPage:true});
    // Deletions must also persist, using the same controls a user sees.
    const deleteEvent=p.locator('#dayPanel [data-del]').first();
    await deleteEvent.click();await deleteEvent.click();
    await p.waitForFunction(()=>document.querySelectorAll('#dayPanel [data-del]').length===3);
    await p.reload();await ready();check((await read('events')).length===3, 'Calendar deletion not persisted');
    await p.locator('[data-tab=memo]').click();await p.locator('[data-mid]').first().click();
    await p.locator('#memoDel').click();await p.locator('#memoDel').click();
    await p.waitForFunction(()=>!document.querySelector('#memoDel'));
    await p.reload();await ready();check((await read('memos')).length===0, 'Memo deletion not persisted');
    await p.locator('[data-tab=list]').click();await p.locator('.card').click();
    await p.locator('#delBtn').click();await p.locator('#delBtn').click();
    await p.waitForFunction(()=>!document.querySelector('#delBtn'));
    await p.reload();await ready();check((await read('items')).length===0, 'Listing deletion not persisted');
    return {blankTemplateFields:15,photosPersisted:2,amountDisplay:amount,tagColors,immediateMemoSave:true,themePersistence:true,mobileNoOverflow:true,deletionsPersisted:true};
  } finally { await context.close(); }
}
