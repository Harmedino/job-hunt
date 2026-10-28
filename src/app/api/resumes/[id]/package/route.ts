import {ensureJobApplication} from "@/lib/application-store";
import {statusHistory} from "@/lib/application-history";
import {applicationWasApplied} from "@/lib/vacancy-groups";
import type {Job} from "@/lib/types";
import {createHash} from 'node:crypto';
import {db} from '@/lib/db';
import {jobAvailable} from '@/lib/job-intelligence';
import {loadResume,privateHeaders,resumeError} from '@/lib/resume-store';
import {ResumeInputError,profileCoverLetter} from '@/lib/resume-types';
export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const draft=await loadResume((await params).id),database=await db();
  const applications=database.collection('applications');
  let job;
  if(draft.target.applicationId){const app=await applications.findOne({id:draft.target.applicationId,'job.id':draft.target.jobId});if(!app)throw new ResumeInputError('The associated application was not found.',404);job=app.job;}
  else if(draft.target.jobId){job=await database.collection('jobs').findOne({id:draft.target.jobId});if(!job)throw new ResumeInputError('The source job was not found. Open its saved application instead.',404);}
  else {
   if(!draft.target.url)throw new ResumeInputError('Add the original HTTPS job link before saving a manual application package.');
   const parsed=new URL(draft.target.url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new ResumeInputError('Use a valid original HTTPS job link.');
   job={id:'manual-'+createHash('sha256').update(JSON.stringify([draft.target.url,draft.target.title,draft.target.company])).digest('hex').slice(0,32),title:draft.target.title,company:draft.target.company,url:draft.target.url,description:draft.target.description,location:'Not verified',salary:'',source:'Manual job',postedAt:'',discoveredAt:new Date().toISOString(),eligibility:'review',eligibilityClass:'review',eligibilityReason:'Manually pasted job. Confirm the employer, vacancy and applicant location on the original website.',score:0,matchedSkills:[]};
  }
  if(!jobAvailable(job)||job.eligibility==='restricted')throw new ResumeInputError('This posting is closed, expired or location-restricted. The CV remains saved.',409);
  const now=new Date().toISOString(),record=await ensureJobApplication(job as unknown as Job);
  if(applicationWasApplied(record))throw new ResumeInputError('This application has progressed. Its submitted documents are preserved.',409);
  const query={id:record.id,submittedAt:{$exists:false},status:{$in:['Saved','Preparing','Ready for review']}};
  const app=await applications.findOneAndUpdate(query,{$set:{cvDraftId:draft.id,profileSnapshot:draft.profileSnapshot,preparationMethod:'CV builder saved version',coverLetter:draft.coverLetter??profileCoverLetter(draft.content,draft.target),status:'Ready for review',statusHistory:statusHistory(record,'Ready for review',now),updatedAt:now}},{returnDocument:'after',projection:{_id:0,id:1}});
  if(!app)throw new ResumeInputError('This application has progressed. Its original CV and cover letter are preserved.',409);
  return Response.json({ok:true,applicationId:app.id},{headers:privateHeaders});
 }catch(e){return resumeError(e);}
}
