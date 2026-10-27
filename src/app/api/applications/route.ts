import {sameVacancy,applicationWasApplied} from "@/lib/vacancy-groups";
import type {Application,Job} from "@/lib/types";
import { randomUUID } from "node:crypto";
import { db, errorResponse } from "@/lib/db";
import {applicationUpdate} from "@/lib/application-updates";
export async function GET() {
  try {
    return Response.json(
      await (
        await db()
      )
        .collection("applications")
        .find({})
        .sort({ updatedAt: -1 })
        .toArray(),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const { jobId } = await request.json();
    if (typeof jobId !== "string")
      return Response.json({ error: "Invalid job ID" }, { status: 400 });
    const database = await db();
    const job = await database.collection("jobs").findOne({ id: jobId }) || (await database.collection("applications").findOne({"job.id":jobId}))?.job;
    if (!job)
      return Response.json(
        { error: "Refresh discovery before saving this job." },
        { status: 400 },
      );
    await database
      .collection("applications")
      .createIndex({ "job.id": 1 }, { unique: true });
    const existing = (await database.collection('applications').find({}).toArray()).find(app=>sameVacancy(job as unknown as Job,app.job));
    if(existing){await database.collection('applications').updateOne({id:existing.id},{$set:{saved:true,updatedAt:new Date().toISOString()},$unset:{unsavedAt:''}});return Response.json({...existing,saved:true});}
    const now = new Date().toISOString();
    const application = {
      id: randomUUID(),
      job,
      status: "Saved",
      saved:true,
      createdAt: now,
      updatedAt: now,
      followUp: "",
    };
    await database.collection("applications").insertOne(application);
    return Response.json(application);
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    let parsed;try{parsed=applicationUpdate(await request.json());}catch(e){return Response.json({error:(e as Error).message},{status:400});}
    const {id,fields,saved}=parsed;const status=fields.status;
    const update={...fields,updatedAt:new Date().toISOString()};
    const database=await db();
    const application=await database.collection('applications').findOne({id});
    if(!application)return Response.json({error:'Application not found'},{status:404});
    if(saved===false&&applicationWasApplied(application as unknown as Application))return Response.json({error:'Applied jobs stay in application history and cannot be returned to new opportunities.'},{status:409});
    const changes:Record<string,unknown>={...update};
    if(saved!==undefined){changes.saved=saved;if(!saved)changes.unsavedAt=new Date().toISOString();}
    const query:Record<string,unknown>={id};if(saved===false){query.submittedAt={$exists:false};query.status={$nin:['Submitted','Interview','Rejected','Offer']};}
    if(status==='Submitted' && !application.submittedAt){
      query.submittedAt={$exists:false};
      changes.submittedAt=new Date().toISOString();
      const cv=application.cvDraftId?await database.collection('resumes').findOne({id:application.cvDraftId},{projection:{_id:0}}):null;
      changes.documentSnapshot={cv,coverLetter:application.coverLetter,profileSnapshot:application.profileSnapshot,cvFacts:application.cvFacts,capturedAt:changes.submittedAt};
    }
    const result=await database.collection('applications').updateOne(query,{$set:changes});
    if (!result.matchedCount)
      return Response.json({ error: "Application not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
