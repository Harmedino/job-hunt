import type {Job} from './types';
export type JobFilters={query:string;category:string;jobType:string;level:string;fresh:string;review:boolean;includeOtherStacks:boolean;opportunityView:string;sort:string};
export const defaultJobFilters:JobFilters={query:'',category:'All opportunities',jobType:'all',level:'all',fresh:'3',review:true,includeOtherStacks:false,opportunityView:'all',sort:'best'};
const choices={category:['All opportunities','Development','Cybersecurity','Frontend','Backend','Full-stack','Software engineering'],jobType:['all','Full-time','Part-time','Contract','Freelance','Internship'],level:['all','Internship','Entry-level','Junior','Mid-level','Senior'],fresh:['1','3','7','14','30','active','available'],opportunityView:['all','strong','new','eligible','review','saved'],sort:['best','newest','company','experience']} as const;
export function validateJobFilters(value:unknown):JobFilters {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Provide valid job filters.');
 const v=value as Record<string,unknown>,result={...defaultJobFilters};
 if(v.query!==undefined){if(typeof v.query!=='string'||v.query.length>200)throw new Error('Keep search keywords under 200 characters.');result.query=v.query;}
 for(const key of Object.keys(choices) as (keyof typeof choices)[]){const item=v[key];if(item===undefined)continue;if(typeof item!=='string'||!(choices[key] as readonly string[]).includes(item))throw new Error(`Invalid search filter: ${key}.`);result[key]=item;}
 for(const key of ['review','includeOtherStacks'] as const){if(v[key]!==undefined&&typeof v[key]!=='boolean')throw new Error('Invalid search preference.');if(typeof v[key]==='boolean')result[key]=v[key];}
 return result;
}
export function matchesRole(job:Pick<Job,'title'|'description'>,role:string){
 if(role==='All opportunities')return true;
 if(role==='Development')return !/security|\bsoc\b/i.test(job.title);
 if(role==='Cybersecurity')return /security|\bsoc\b/i.test(job.title);
 if(role==='Frontend')return /front[ -]?end|react|angular|next\.?js|\bui\b/i.test(job.title) || (/software engineer/i.test(job.title)&&/frontend|react|angular/i.test(job.description));
 if(role==='Backend')return /back[ -]?end|node\.?js|express|laravel|\bphp\b|\bapi\b/i.test(job.title) || (/software engineer/i.test(job.title)&&/backend|server.side|\bapi\b/i.test(job.description));
 if(role==='Full-stack')return /full[ -]?stack/i.test(job.title+' '+job.description);
 return /software|engineer|developer/i.test(job.title)&&!/security|\bsoc\b/i.test(job.title);
}
const levels=['Internship','Entry-level','Junior','Mid-level','Senior'];
export function sortJobResults(jobs:Job[],sort:string){return [...jobs].sort((a,b)=>{
 if(sort==='company')return a.company.localeCompare(b.company)||a.title.localeCompare(b.title);
 if(sort==='experience')return (levels.includes(a.experienceLevel||'')?levels.indexOf(a.experienceLevel!):9)-(levels.includes(b.experienceLevel||'')?levels.indexOf(b.experienceLevel!):9)||b.score-a.score;
 if(sort==='newest')return (Date.parse(b.postedAt)||0)-(Date.parse(a.postedAt)||0);
 return b.score-a.score || Number(b.eligibility==='eligible')-Number(a.eligibility==='eligible') || (Date.parse(b.postedAt)||0)-(Date.parse(a.postedAt)||0);
});}
