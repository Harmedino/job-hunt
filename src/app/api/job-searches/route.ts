import { validateJobFilters } from "@/lib/job-filter-state";
import { randomUUID } from "node:crypto";
import { db, errorResponse } from "@/lib/db";
import { searchLink } from "@/lib/job-search-links";
export async function GET() {
  try {
    const database=await db();
    const [links,filters]=await Promise.all([database.collection('job_search_links').find({},{projection:{_id:0}}).sort({createdAt:-1}).limit(100).toArray(),database.collection('job_filter_searches').find({},{projection:{_id:0}}).sort({createdAt:-1}).limit(100).toArray()]);
    return Response.json([...links,...filters],{headers:{'Cache-Control':'no-store'}});
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  let input;
  try {
    const body=await request.json();
    if(body?.kind==='filters') {
      if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100)throw new Error('Name your saved search.');
      const filters=validateJobFilters(body.filters);
      try{const c=(await db()).collection('job_filter_searches');
      await c.createIndex({name:1},{unique:true});
      await c.updateOne({name:body.name.trim()},{$set:{filters,kind:'filters',updatedAt:new Date().toISOString()},$setOnInsert:{id:randomUUID(),name:body.name.trim(),createdAt:new Date().toISOString()}},{upsert:true});
      return Response.json({ok:true});}catch(error){return errorResponse(error);}
    }
    input = searchLink(body);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  try {
    const c = (await db()).collection("job_search_links");
    await c.createIndex({ url: 1 }, { unique: true });
    await c.updateOne(
      { url: input.url },
      {
        $setOnInsert: {
          ...input,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(request: Request) {
  try {
    const { id,kind } = await request.json();
    if (typeof id !== "string" || id.length > 100)
      return Response.json({ error: "Invalid search" }, { status: 400 });
    await (await db()).collection(kind==='filters'?"job_filter_searches":"job_search_links").deleteOne({ id });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
