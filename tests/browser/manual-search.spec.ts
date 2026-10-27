import {test,expect} from '@playwright/test';
test('remembered filters and named searches run only on demand; manual job intake is visible',async({page})=>{
 let searches=0;let saved:unknown[]=[];
 await page.route('**/api/status',r=>r.fulfill({json:{database:true,ai:false}}));await page.route('**/api/profile',r=>r.fulfill({json:{skills:'React, Node.js'}}));await page.route('**/api/applications',r=>r.fulfill({json:[]}));await page.route('**/api/notifications',r=>r.fulfill({json:[]}));await page.route('**/api/leads',r=>r.fulfill({json:[]}));
 await page.route('**/api/discover',r=>{if(r.request().method()==='POST')searches++;return r.fulfill({json:{jobs:[],persisted:true}});});
 await page.route('**/api/job-searches',r=>{if(r.request().method()==='POST'){saved=[{...r.request().postDataJSON(),id:'named-search'}];return r.fulfill({json:{ok:true}});}return r.fulfill({json:saved});});
 await page.goto('/');await expect(page.getByLabel('Search jobs')).toBeVisible();expect(searches).toBe(0);
 await page.getByLabel('Search jobs').fill('React');await page.getByLabel('Posting age').selectOption('14');await page.getByLabel('Sort jobs').selectOption('company');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('launchpad-job-filters')||'{}').query)).toBe('React');
 await page.reload();await expect(page.getByLabel('Search jobs')).toHaveValue('React');await expect(page.getByLabel('Posting age')).toHaveValue('14');await expect(page.getByLabel('Sort jobs')).toHaveValue('company');expect(searches).toBe(0);
 await page.getByText('Save or repeat a search',{exact:false}).click();await page.getByLabel('Search name').fill('React fortnight');await page.getByRole('button',{name:'Save current search'}).click();await expect(page.getByRole('button',{name:'Run React fortnight'})).toBeVisible();expect(searches).toBe(0);
 await page.getByLabel('Search jobs').fill('Angular');await page.getByRole('button',{name:'Run React fortnight'}).click();await expect(page.getByLabel('Search jobs')).toHaveValue('React');expect(searches).toBe(1);
 await page.getByRole('button',{name:'Add job for review',exact:true}).click();await expect(page.getByLabel('Import source')).toHaveValue('Manual job');await expect(page.getByLabel('Job post text',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
