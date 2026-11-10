import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultAssistantPolicy, recommendedApplications, validateAssistantPolicy, withinOperatingHours, policyDay } from "../src/lib/assistant-policy";
import { applicationTarget, greenhouseTarget, mapField, type AssistedPackage } from "../src/lib/assisted-apply";
import { emptyProfile, type Job, type Application } from "../src/lib/types";
test("policy validates operating hours, budgets and supported boards without allowing unattended submission",()=>{
  for(const value of [{maxPerDay:0},{startHour:20,endHour:9},{allowedBoards:["Unknown"]},{aiMaxCallsPerDay:21},{timezone:"invalid/timezone"},{unattendedSubmission:true}])assert.throws(()=>validateAssistantPolicy(value));
  assert.equal(validateAssistantPolicy({aiMaxCallsPerDay:0}).unattendedSubmission,false);
  const p={...defaultAssistantPolicy,startHour:9,endHour:17};
  assert.equal(withinOperatingHours(p,new Date("2026-11-10T08:00:00Z")),true);assert.equal(withinOperatingHours(p,new Date("2026-11-10T16:00:00Z")),false);assert.equal(policyDay(new Date("2026-11-10T23:30:00Z"),p.timezone),"2026-11-11");
});
test("recommendation reuses career/stack/location evidence and excludes handled, senior, restricted and stale jobs",()=>{
  const now=Date.parse("2026-11-10T12:00:00Z"),profile={...emptyProfile,skills:"React, TypeScript, Node.js, Express",experience:"Built React and Node.js production web applications",projects:"TypeScript full-stack project"};
  const job:Job={id:"fixture-job",title:"Junior Full-Stack Developer",company:"Fictional Tech",description:"Fully remote worldwide junior role building React and TypeScript web applications and Node.js Express APIs.",url:"https://job-boards.greenhouse.io/fixture/jobs/123",location:"Worldwide",salary:"",postedAt:"2026-11-10T10:00:00Z",discoveredAt:"2026-11-10T10:00:00Z",source:"Greenhouse",eligibility:"eligible",eligibilityReason:"Worldwide fixture",score:80,matchedSkills:["React","TypeScript","Node.js"],stackFit:"match",experienceLevel:"Junior"};
  const variants:Job[]=[job,{...job,id:"senior",title:"Senior Full-Stack Developer"},{...job,id:"review",eligibility:"review"},{...job,id:"restricted",eligibility:"restricted"},{...job,id:"old",postedAt:"2026-09-01T00:00:00Z"},{...job,id:"closed",closedAt:"2026-11-09T00:00:00Z"}];
  assert.deepEqual(recommendedApplications(variants,[],profile,defaultAssistantPolicy,now).map(j=>j.id),[job.id]);
  const app:Application={id:"fixture-app",job,status:"Saved",createdAt:job.postedAt,updatedAt:job.postedAt,followUp:""};assert.equal(recommendedApplications([job],[app],profile,defaultAssistantPolicy,now).length,0);
  assert.equal(recommendedApplications([job],[],profile,{...defaultAssistantPolicy,excludedCompanies:["Fictional Tech"]},now).length,0);
});
test("Lever and Ashby original job identities normalize application paths and reject lookalike hosts",()=>{
  for(const host of ["jobs.lever.co","jobs.eu.lever.co","jobs.ashbyhq.com"]){const base=`https://${host}/fixture/11111111-2222-3333-4444-555555555555`;assert.equal(applicationTarget(base).key,applicationTarget(base+(host.includes("lever")?"/apply":"/application")).key);assert.throws(()=>applicationTarget(base.replace(host,host+".example.org")));}
});
test("legal agreement answers are never mapped automatically even from the confirmed private bank",()=>{
  const target=greenhouseTarget("https://job-boards.greenhouse.io/fixture/jobs/123"),pack:AssistedPackage={version:1,id:"fixture",applicationId:"app",draftId:"cv",approvedAt:"2026-11-10",company:"Fictional",title:"Developer",target,facts:{},files:[],answers:[{id:"a",question:"I agree to the privacy policy",answer:"Yes",vacancyKey:target.key,confirmedAt:"2026-11-10"}]};
  assert.equal(mapField({id:"legal",label:"I agree to the privacy policy",kind:"checkbox",required:true,value:"No",valid:false,disabled:false},pack).value,undefined);
});
