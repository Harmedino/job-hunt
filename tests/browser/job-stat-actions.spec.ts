import {test,expect} from '@playwright/test';
test('Strong matches and Fresh counters open their exact job sets and reset stale filters',async({page})=>{
 const now=Date.now();
 const base={salary:'NGN 400000 monthly',description:'React and TypeScript development.',url:'https://example.org/jobs/stat',source:'Stat action fixture',discoveredAt:new Date(now).toISOString(),eligibility:'eligible',eligibilityReason:'Source lists worldwide',matchedSkills:['React'],jobType:'Full-time',experienceLevel:'Junior'};
 const jobs=[
  {...base,id:'strong-unknown',title:'Recent Strong React Role',company:'Strong Review Fixture',location:'Remote',eligibility:'review',score:65,postedAt:new Date(now-86400000).toISOString()},
  {...base,id:'strong-old',title:'Older Strong React Role',company:'Older Strong Fixture',location:'Worldwide',score:90,postedAt:new Date(now-21*86400000).toISOString()},
  {...base,id:'fresh-weak',title:'Fresh React Role',company:'Fresh Fixture',location:'Worldwide',score:30,postedAt:new Date(now-5*86400000).toISOString()},
  {...base,id:'expired',title:'Expired React Role',company:'Expired Fixture',location:'Worldwide',score:99,postedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now-1000).toISOString()},
  {...base,id:'closed',title:'Closed React Role',company:'Closed Fixture',location:'Worldwide',score:99,postedAt:new Date(now-1000).toISOString(),closedAt:new Date(now-1000).toISOString()},
 ];
 await page.route('**/api/status',r=>r.fulfill({json:{database:true,ai:false,protected:false,scheduler:false}}));
 await page.route('**/api/discover',r=>r.fulfill({json:{jobs,checkedAt:new Date(now).toISOString(),persisted:false}}));
 await page.route('**/api/profile',r=>r.fulfill({json:{skills:'React, TypeScript',experience:'Junior developer'}}));await page.route('**/api/applications',r=>r.fulfill({json:[]}));await page.route('**/api/notifications',r=>r.fulfill({json:[]}));await page.goto('/');
 const strong=page.getByRole('button',{name:'Show strong matches',exact:true});const fresh=page.getByRole('button',{name:'Show fresh this week',exact:true});
 await expect(strong.locator('b')).toHaveText('02');await expect(fresh.locator('b')).toHaveText('02');
 await page.getByLabel('Search jobs').fill('no matching search');await page.getByLabel('Job type',{exact:true}).selectOption('Freelance');
 await strong.focus();await page.keyboard.press('Enter');
 await expect(page.getByLabel('Search jobs')).toHaveValue('');await expect(page.getByLabel('Job type',{exact:true})).toHaveValue('all');
 await expect(page.getByLabel('Opportunity view')).toHaveValue('strong');await expect(page.getByLabel('Posting age')).toHaveValue('available');
 await expect(page.getByRole('button',{name:'Older Strong React Role',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Recent Strong React Role',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Fresh React Role',exact:true})).not.toBeVisible();await expect(strong).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#job-results')).toBeFocused();
 await fresh.click();await expect(page.getByLabel('Posting age')).toHaveValue('7');await expect(page.getByLabel('Opportunity view')).toHaveValue('all');
 await expect(page.getByRole('button',{name:'Fresh React Role',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Recent Strong React Role',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Older Strong React Role',exact:true})).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Expired React Role',exact:true})).not.toBeVisible();await expect(page.getByRole('button',{name:'Closed React Role',exact:true})).not.toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('JavaScript recommendations exclude Java and C# until a broader search is explicitly requested',async({page})=>{
 const now=new Date().toISOString();const base={company:'Stack Fixture',location:'Worldwide',description:'Build backend services with frontend integrations.',salary:'NGN 400000 monthly',source:'Fixture',postedAt:now,discoveredAt:now,eligibility:'eligible',eligibilityReason:'Worldwide',score:90,matchedSkills:[]};
 const jobs=[{...base,id:'javascript-role',title:'Node.js Backend Developer',url:'https://example.org/js'},{...base,id:'dotnet-role',title:'Backend Developer (.NET - C#)',url:'https://example.org/dotnet'},{...base,id:'java-role',title:'Backend Engineer, Java - Web 3 Wallet',url:'https://example.org/java'}];
 await page.route('**/api/status',r=>r.fulfill({json:{database:true,ai:false}}));await page.route('**/api/profile',r=>r.fulfill({json:{skills:'React, Node.js, TypeScript',roles:'JavaScript Backend Developer'}}));await page.route('**/api/applications',r=>r.fulfill({json:[{id:'saved-java',job:jobs[2],status:'Saved'}]}));await page.route('**/api/notifications',r=>r.fulfill({json:[]}));await page.route('**/api/discover',r=>r.fulfill({json:{jobs,persisted:true,checkedAt:now}}));
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Node.js Backend Developer',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Backend Developer (.NET - C#)',exact:true})).not.toBeVisible();await expect(page.getByRole('button',{name:'Backend Engineer, Java - Web 3 Wallet',exact:true})).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Show strong matches'}).locator('b')).toHaveText('01');
 await page.getByLabel('Include jobs outside my stack').check();await expect(page.getByRole('button',{name:'Backend Engineer, Java - Web 3 Wallet',exact:true})).not.toBeVisible();await page.getByLabel('Show saved/applied jobs').check();await expect(page.getByRole('button',{name:'Backend Engineer, Java - Web 3 Wallet',exact:true})).toBeVisible();
 await expect(page.getByText('Outside your saved stack',{exact:false}).first()).toBeVisible();
 await page.getByRole('button',{name:'Show fresh this week'}).click();await expect(page.getByLabel('Include jobs outside my stack')).not.toBeChecked();await expect(page.getByRole('button',{name:'Backend Engineer, Java - Web 3 Wallet',exact:true})).not.toBeVisible();
 await page.getByLabel('Opportunity view').selectOption('saved');await expect(page.getByRole('button',{name:'Backend Engineer, Java - Web 3 Wallet',exact:true})).toBeVisible();
});
