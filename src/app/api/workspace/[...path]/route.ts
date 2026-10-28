import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  discoverBounties,
  fetchIssue,
  importBounty,
  persistBounty,
  verifySavedBounties,
} from "@/lib/modules/bounties";
import {
  approvedIdea,
  generateIdeas,
  generateMetadata,
  klingPrompt,
  learningRecommendations,
  researchVideo,
} from "@/lib/modules/creative";
import {
  beginOAuth,
  channelAnalytics,
  disconnectChannel,
  finishOAuth,
} from "@/lib/modules/oauth";
import { deleteRecord, profileById, saveRecord } from "@/lib/modules/records";
import {
  ensureModuleIndexes,
  get,
  json,
  moduleError,
  ownerFilter,
  put,
} from "@/lib/modules/store";
import type {
  Bounty,
  ContentEntry,
  ContentIdea,
  YoutubeVideo,
} from "@/lib/modules/types";
import {
  id,
  ModuleError,
  number,
  object,
  stringList,
  text,
  videoId,
} from "@/lib/modules/validation";
import { ownerSkills, snapshot } from "@/lib/modules/workspace";
import {
  inspectBountyRepository,
  inspectIssueActivity,
} from "@/lib/modules/bounty-repository";
import { taskAnalysis } from "@/lib/modules/task-analysis";
import {
  discoverVideos,
  fetchChannel,
  fetchVideo,
  savedYoutube,
  saveYoutube,
} from "@/lib/modules/youtube";
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
const OAUTH_COOKIE = "launchpad_youtube_state";
export async function GET(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    if (path.join("/") === "state") return json(await snapshot());
    if (path.join("/") === "oauth/start") {
      await ensureModuleIndexes();
      const result = await beginOAuth();
      const response = NextResponse.redirect(result.url, 303);
      response.cookies.set(OAUTH_COOKIE, result.state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600,
        path: "/api/workspace/oauth",
      });
      return response;
    }
    if (path.join("/") === "oauth/callback") {
      const params = new URL(request.url).searchParams;
      const cookie = (await cookies()).get(OAUTH_COOKIE)?.value || "";
      try {
        if (params.get("error"))
          throw new ModuleError(
            "Google authorization was declined. Reconnect to try again.",
          );
        await finishOAuth(
          params.get("code") || "",
          params.get("state") || "",
          cookie,
        );
      } finally {
        (await cookies()).delete({
          name: OAUTH_COOKIE,
          path: "/api/workspace/oauth",
        });
      }
      const target = new URL("/", process.env.YOUTUBE_REDIRECT_URI!);
      target.hash = "youtube";
      return NextResponse.redirect(target, 303);
    }
    throw new ModuleError("Unknown workspace endpoint.", 404);
  } catch (e) {
    return moduleError(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    if (!sameOrigin(request)) throw new ModuleError("Invalid origin.", 403);
    const raw = await request.text();
    if (raw.length > 100000) throw new ModuleError("Request too large.", 413);
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ModuleError("Invalid JSON request.");
    }
    const body = object(value);
    const { path } = await context.params;
    const action = path.join("/");
    await ensureModuleIndexes();
    if (path[0] === "records" && path.length === 2)
      return json(
        await saveRecord(
          path[1],
          body,
          path[1] === "reward" ? await ownerSkills() : "",
        ),
      );
    switch (action) {
      case "bounties/discover":
        return json(
          await discoverBounties(
            text(body.query || "", "query", 150),
            await ownerSkills(),
          ),
        );
      case "bounties/import":
        return json(await importBounty(body, await ownerSkills()));
      case "bounties/verify-saved":
        return json({
          failures: await verifySavedBounties(await ownerSkills()),
        });
      case "bounties/analyze": {
        let bounty = await get<Bounty>("bounties", id(body.id));
        const skills = await ownerSkills();
        if (bounty.issueUrl) {
          try {
            bounty = await persistBounty(
              await inspectIssueActivity(
                await fetchIssue(bounty.issueUrl, bounty.manual),
              ),
              skills,
            );
          } catch (error) {
            bounty = {
              ...bounty,
              repositoryEvidence: {
                checkedAt: new Date().toISOString(),
                scope: "Issue metadata only; live status check failed.",
                files: [],
                rootFiles: [],
                warnings: [
                  error instanceof Error
                    ? error.message
                    : "Source check failed.",
                ],
              },
            };
          }
        }
        if (body.inspectRepository === true)
          bounty = {
            ...bounty,
            repositoryEvidence: await inspectBountyRepository(bounty),
          };
        const analysis = await taskAnalysis(bounty, skills, body.ai === true);
        const result = { ...bounty, analysis };
        await put("bounties", result);
        return json(result);
      }
      case "youtube/search":
        return json(await discoverVideos(body));
      case "youtube/save-video":
        return json(
          await saveYoutube("video", await fetchVideo(videoId(body.url))),
        );
      case "youtube/save-channel":
        return json(
          await saveYoutube(
            "channel",
            await fetchChannel(text(body.id, "channel ID", 50, true)),
          ),
        );
      case "youtube/research": {
        const video = (await savedYoutube<YoutubeVideo>("video")).find(
          (v) => v.id === id(body.id),
        );
        if (!video)
          throw new ModuleError("Save or refresh this reference first.", 404);
        return json(await researchVideo(video));
      }
      case "ideas/generate": {
        const profile = await profileById(body.profileId);
        const referenceIds = stringList(body.referenceIds || [], 10);
        const references = (await savedYoutube<YoutubeVideo>("video")).filter(
          (v) => referenceIds.includes(v.id),
        );
        let pastContent:
          | {
              title: string;
              description: string;
              action: string;
              notes: string;
            }
          | undefined;
        if (body.pastEntryId) {
          const entry = await get<ContentEntry>(
            "entries",
            id(body.pastEntryId),
          );
          const idea = await get<ContentIdea>("ideas", entry.ideaId);
          pastContent = {
            title: idea.title,
            description: idea.description,
            action: idea.action,
            notes: entry.notes,
          };
        }
        return json({
          ideas: await generateIdeas(
            profile,
            text(body.topic, "topic", 2000, true),
            references,
            number(body.count ?? 3, 1, 5),
            body.regenerate ? randomUUID() : "initial",
            pastContent,
          ),
        });
      }
      case "ideas/prompt": {
        const idea = await approvedIdea(id(body.ideaId));
        const prompt = await klingPrompt(
          idea,
          await profileById(idea.profileId),
        );
        return json(prompt);
      }
      case "ideas/metadata":
        return json(
          await generateMetadata(
            await approvedIdea(id(body.ideaId)),
            text(body.platforms || "YouTube", "platforms", 300),
          ),
        );
      case "ideas/save-metadata": {
        const idea = await approvedIdea(id(body.ideaId));
        const metadata = object(body.metadata);
        const record = {
          id: randomUUID(),
          ideaId: idea.id,
          titles: stringList(metadata.titles, 5),
          descriptions: stringList(metadata.descriptions, 5),
          hashtags: stringList(metadata.hashtags, 12),
          hooks: stringList(metadata.hooks, 5),
          pinnedComments: stringList(metadata.pinnedComments, 5),
          captions: stringList(metadata.captions, 5),
          createdAt: new Date().toISOString(),
        };
        return json(await put("metadata", record));
      }
      case "youtube/analytics":
      case "youtube/learn": {
        const channelId = text(body.channelId, "connected channel", 50, true);
        const start = text(body.startDate, "start date", 10, true);
        const end = text(body.endDate, "end date", 10, true);
        if (
          ![start, end].every(
            (d) =>
              /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)),
          ) ||
          start > end ||
          end > new Date().toISOString().slice(0, 10) ||
          Date.parse(end) - Date.parse(start) > 366 * 86400000
        )
          throw new ModuleError("Choose a valid date range of up to one year.");
        let video: string | undefined;
        if (body.entryId) {
          const entry = await get<ContentEntry>("entries", id(body.entryId));
          video = videoId(entry.publishedUrl);
        } else if (body.videoUrl) video = videoId(body.videoUrl);
        const reports = await channelAnalytics(channelId, start, end, video);
        return json(
          action.endsWith("learn")
            ? await learningRecommendations(reports)
            : reports,
        );
      }
      case "youtube/disconnect":
        return json(await disconnectChannel(id(body.id)));
      default:
        throw new ModuleError("Unknown workspace action.", 404);
    }
  } catch (e) {
    return moduleError(e);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    if (!sameOrigin(request)) throw new ModuleError("Invalid origin.", 403);
    const { path } = await context.params;
    const recordId = id(new URL(request.url).searchParams.get("id"));
    if (path[0] === "records" && path.length === 2)
      await deleteRecord(path[1], recordId);
    else if (path.join("/") === "youtube/reference") {
      const kind = new URL(request.url).searchParams.get("kind");
      if (!["video", "channel"].includes(kind || ""))
        throw new ModuleError("Invalid reference type.");
      await (await db())
        .collection("workspace_youtube_cache")
        .deleteOne(ownerFilter({ id: recordId, kind }));
    } else throw new ModuleError("Unknown workspace endpoint.", 404);
    return json({ deleted: true });
  } catch (e) {
    return moduleError(e);
  }
}
