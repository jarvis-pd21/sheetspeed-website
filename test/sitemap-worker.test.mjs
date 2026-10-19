import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../workers/sheetspeed-sitemap.js',import.meta.url),'utf8');
const xml=await readFile(new URL('../sitemap.xml',import.meta.url),'utf8');
async function request(path,fetch){
 let listener;const context=vm.createContext({fetch,Response,URL,addEventListener:(name,handler)=>{assert.equal(name,'fetch');listener=handler;}});
 vm.runInContext(source,context);let result;listener({request:new Request('https://sheetspeed.agi-jarvis.com'+path),respondWith:response=>{result=response;}});return result;
}
test('sitemap returns the exact current origin body, not a second URL inventory',async()=>{
 const r=await request('/sitemap.xml',async url=>{assert.match(url,/\/main\/sitemap\.xml$/);return new Response(xml);});
 assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\/xml/);assert.equal(await r.text(),xml);
});
for(const [name,fetch] of [['HTTP failure',async()=>new Response('unavailable',{status:503})],['network failure',async()=>{throw Error('offline');}],['HTML instead of XML',async()=>new Response('<html><body>origin error</body></html>')],['truncated XML',async()=>new Response(xml.slice(0,-50))]]){
 test(`sitemap ${name} is retryable, never obsolete 200 content`,async()=>{
  const r=await request('/sitemap.xml',fetch);assert.equal(r.status,503);assert.equal(r.headers.get('retry-after'),'60');assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(await r.text(),/<loc>/);
 });
}
test('robots retains its valid allow and official sitemap when origin unavailable',async()=>{
 const r=await request('/robots.txt',async()=>{throw Error('offline');});assert.equal(r.status,200);const body=await r.text();assert.match(body,/Allow: \//);assert.match(body,/Sitemap: https:\/\/sheetspeed\.agi-jarvis\.com\/sitemap\.xml/);
});
test('unrelated worker paths stay404',async()=>{
 const r=await request('/missing',async()=>{throw Error('must not fetch');});assert.equal(r.status,404);
});
