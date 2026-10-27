import type {Job,Profile} from './types';
import {careerPreferences,type ExchangeRate} from './career-preferences';
export type SalaryAssessment={original:string;currency?:string;period?:'month'|'year'|'week'|'hour';monthlyMin?:number;monthlyMax?:number;ngnMin?:number;ngnMax?:number;status:'meets'|'below'|'needs_review'|'unknown';reason:string;rate?:ExchangeRate;estimated:boolean;conversionCurrent?:boolean};
export function rateFor(currency:string,profile:Pick<Profile,'career'>,now=Date.now()){if(currency==='NGN')return {currency:'NGN',ngnPerUnit:1,asOf:new Date(now).toISOString().slice(0,10),source:'Native NGN amount; no exchange conversion'};return careerPreferences(profile).exchangeRates.find(rate=>rate.currency===currency);}
export function minimumInNgn(amount:number,currency:string,profile:Pick<Profile,'career'>,now=Date.now()){if(amount===0)return 0;const rate=rateFor(currency,profile,now);if(!rate||now-Date.parse(rate.asOf)>30*86400000||Date.parse(rate.asOf)>now)return undefined;return amount*rate.ngnPerUnit;}
export function assessSalary(job:Pick<Job,'salary'|'description'|'salaryDetails'>,profile:Pick<Profile,'career'>,minimumNgn=0,now=Date.now()):SalaryAssessment {
 const original=job.salary||'',result:SalaryAssessment={original,status:'unknown',reason:'Salary is not disclosed.',estimated:false};
 if(/\bunpaid\b|no (?:pay|salary|stipend)/i.test(original+' '+job.description))return {...result,currency:'NGN',period:'month',monthlyMin:0,ngnMin:0,status:minimumNgn>0?'below':'meets',reason:'The posting explicitly advertises no pay. No currency rate is needed for zero compensation.'};
 const detail=job.salaryDetails;
 let text=original;
 if(!text){const fragment=job.description.match(/\b(?:salary|compensation|stipend)\s*[:–-]\s*[^\n]{1,160}/i)?.[0];if(fragment&&/\d/.test(fragment))text=fragment;}
 if(!text&&!detail)return result;
 const currency=detail?.currency || text.match(/\b(NGN|USD|EUR|GBP|CAD|AUD|ZAR|GHS|KES|INR|CHF|JPY|SGD|AED)\b/i)?.[1]?.toUpperCase() || (/₦/.test(text)?'NGN':/€/.test(text)?'EUR':/£/.test(text)?'GBP':/US\$/.test(text)?'USD':undefined);
 const period=detail?.period || (/annual|annum|year(?:ly)?|\bp\.?a\.?\b/i.test(text)?'year':/month(?:ly)?|\bmo\b/i.test(text)?'month':/week(?:ly)?|\bwk\b/i.test(text)?'week':/hour(?:ly)?|\bhr\b/i.test(text)?'hour':undefined);
 const numbers=[...text.matchAll(/(?<![\d])(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?(?![a-z\d])/gi)];
 const amount=(match:RegExpMatchArray|undefined)=>match?Number(match[1].replace(/,/g,''))*(match[2]?.toLowerCase()==='k'?1000:match[2]?.toLowerCase()==='m'?1e6:1):undefined;
 const amounts=numbers.map(amount).filter((n):n is number=>n!==undefined&&Number.isFinite(n)&&n>=0);
 const between=numbers[0]&&numbers[1]?text.slice(numbers[0].index!+numbers[0][0].length,numbers[1].index):'';
 const range=/^(?:\s*(?:[a-z]{3}|[$₦€£]))?\s*(?:[-–—]|to)\s*(?:[a-z]{3}|[$₦€£])?\s*$/i.test(between);
 let min:number|undefined=detail?.min ?? amounts[0],max:number|undefined=detail?.max ?? (range?amounts[1]:undefined);
 if(/up to|maximum|as much as/i.test(text)&&!detail){max=amounts[0];min=undefined;}
 if(min!==undefined&&max!==undefined&&max<min)[min,max]=[max,min];
 Object.assign(result,{currency,period});
 if(!currency){result.status='needs_review';result.reason='The salary currency is not explicit. A bare $ symbol does not establish USD.';return result;}
 if(min===undefined&&max===undefined){result.status='needs_review';result.reason='The advertised compensation does not establish a numerical salary range.';return result;}
 if(!period){result.status='needs_review';result.reason='Salary period is not supplied. No annual or monthly period was assumed.';return result;}
 let multiplier=period==='year'?1/12:period==='week'?52/12:1;
 if(period==='hour'){
  const hours=detail?.hoursPerWeek??Number(job.description.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:working )?hours?\s*(?:per|a|\/)\s*week\b/i)?.[1]);
  if(!hours||hours>84){result.status='needs_review';result.reason='Hourly pay needs advertised weekly working hours before monthly conversion.';return result;}multiplier=hours*52/12;result.estimated=true;
 }
 result.monthlyMin=min===undefined?undefined:Math.round((min*multiplier+Number.EPSILON)*100)/100;result.monthlyMax=max===undefined?undefined:Math.round((max*multiplier+Number.EPSILON)*100)/100;
 result.estimated ||=period!=='month';
 const rate=rateFor(currency,profile,now);
 if(!rate){result.status='needs_review';result.reason=`Monthly ${currency} amount identified. Add a dated manual ${currency} → NGN exchange rate in My Profile to assess the naira minimum.`;return result;}
 result.rate=rate;result.ngnMin=result.monthlyMin===undefined?undefined:Math.round((result.monthlyMin*rate.ngnPerUnit+Number.EPSILON)*100)/100;result.ngnMax=result.monthlyMax===undefined?undefined:Math.round((result.monthlyMax*rate.ngnPerUnit+Number.EPSILON)*100)/100;result.estimated ||=currency!=='NGN';
 if(currency!=='NGN'&&(now-Date.parse(rate.asOf)>30*86400000||Date.parse(rate.asOf)>now)){result.status='needs_review';result.reason='The manual exchange rate is older than 30 days or future-dated. Update it before treating the minimum as met.';return result;}
 result.conversionCurrent=true;
 if(/approximately|estimated|up to|potential|on target|OTE\b/i.test(text)||result.ngnMin===undefined){result.status='needs_review';result.reason='A guaranteed lower salary is not established.';return result;}
 if(result.ngnMin>=minimumNgn){result.status='meets';result.reason=minimumNgn?`The advertised lower monthly amount meets ₦${minimumNgn.toLocaleString('en-NG')}, using the shown conversion basis.`:'A monthly salary amount is established with the shown conversion basis.';}
 else if(result.ngnMax!==undefined&&result.ngnMax>=minimumNgn){result.status='needs_review';result.reason='Only the upper salary range meets your minimum; the guaranteed lower end does not.';}
 else {result.status='below';result.reason=`The advertised monthly range is below ₦${minimumNgn.toLocaleString('en-NG')}.`;}
 return result;
}
