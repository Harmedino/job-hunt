"use client";
import Link from "next/link";
import SavedJobSearches from "@/components/saved-job-searches";
import {plainText} from "@/lib/job-text";
import {applicationStatusLabel} from "@/lib/application-updates";
import {matchesRole,sortJobResults,matchesKeywords,validateJobFilters,type JobFilters} from "@/lib/job-filter-state";
import { jobTypes, experienceLevels, eligibilityLabels, jobAvailable, assessStackFit, inferExperience } from "@/lib/job-intelligence";
import BountyWorkspace from "@/components/modules/bounty-workspace";
import YoutubeWorkspace from "@/components/modules/youtube-workspace";
import WorkspaceOverview from "@/components/modules/workspace-overview";
import { recentPosting, activeBoardPosting } from "@/lib/job-freshness";
import SocialIntake from "@/components/social-intake";
import CvUpload from "@/components/cv-upload";
import CvBuilder from "@/components/cv-builder";
import type { BuilderJob } from "@/lib/resume-types";
import DiscoveryReport from "@/components/discovery-report";
import type { DiscoveryResponse, SourceReport } from "@/lib/discovery-types";
import { missingProfileFields } from "@/lib/profile-import-fields";
import SourceDirectory from "@/components/source-directory";
import JobPlatformDirectory from "@/components/job-platform-directory";
import { jobPlatforms } from "@/lib/job-platforms";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  Clapperboard,
  ArrowUpRight,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  Globe2,
  FileText,
  LayoutGrid,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import {
  emptyProfile,
  statuses,
  type Application,
  type Job,
  type Profile,
} from "@/lib/types";
type Health = {
  database: boolean;
  ai: boolean;
  aiLabel?: string;
  aiModel?: string;
  aiConfigurationError?: string;
  scheduler: boolean;
  protected: boolean;
};
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
const ago = (value: string, now: number) => {
  const hours = Math.max(0, Math.floor((now - Date.parse(value)) / 3600000));
  return hours < 24
    ? `${hours || "<1"}h ago`
    : `${Math.floor(hours / 24)}d ago`;
};
export default function Home() {
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState("Job Finder");
  useEffect(() => {
    const update = () => {
      if (window.location.hash === "#youtube") setTab("YouTube Research");
    };
    const timer = window.setTimeout(update, 0);
    window.addEventListener("hashchange", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("hashchange", update);
    };
  }, []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [health, setHealth] = useState<Health>();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All opportunities");
  const [fresh, setFresh] = useState("3");
  const [jobPage, setJobPage] = useState(1);
  const [review, setReview] = useState(true);
  const [includeOtherStacks,setIncludeOtherStacks]=useState(false);
  const [jobType, setJobType] = useState("all");
  const [level, setLevel] = useState("all");
  const [opportunityView, setOpportunityView] = useState("all");
  const [sort,setSort]=useState("best");
  const [filtersReady,setFiltersReady]=useState(false);
  const filters=useMemo(()=>({query,category,jobType,level,fresh,review,includeOtherStacks,opportunityView,sort}),[query,category,jobType,level,fresh,review,includeOtherStacks,opportunityView,sort]);
  const applyFilters=useCallback((input:JobFilters)=>{const f=validateJobFilters(input);setQuery(f.query);setCategory(f.category);setJobType(f.jobType);setLevel(f.level);setFresh(f.fresh);setReview(f.review);setIncludeOtherStacks(f.includeOtherStacks);setOpportunityView(f.opportunityView);setSort(f.sort);setJobPage(1);},[]);
  useEffect(()=>{const timer=setTimeout(()=>{try{const value=localStorage.getItem("launchpad-job-filters");if(value)applyFilters(validateJobFilters(JSON.parse(value)));}catch{}setFiltersReady(true);},0);return()=>clearTimeout(timer);},[applyFilters]);
  useEffect(()=>{if(!filtersReady)return;const timer=setTimeout(()=>{try{localStorage.setItem("launchpad-job-filters",JSON.stringify(filters));}catch{}},250);return()=>clearTimeout(timer);},[filters,filtersReady]);
  const [selected, setSelected] = useState<Job>();
  const [notices, setNotices] = useState<{ id: string; title: string }[]>([]);
  const [showNotices, setShowNotices] = useState(false);
  const [viewApp, setViewApp] = useState<Application>();
  const [builderJob, setBuilderJob] = useState<BuilderJob>();
  const [checked, setChecked] = useState("");
  const [aiCheck, setAiCheck] = useState("");
  const [sourceReports, setSourceReports] = useState<SourceReport[]>([]);
  const [storageWarning, setStorageWarning] = useState("");
  const autoSearched = useRef(false);
  const receiveDiscovery = useCallback((data: DiscoveryResponse) => {
    setJobs(data.jobs);
    setChecked(data.checkedAt || "");
    setSourceReports(data.sources || []);
    setStorageWarning(data.storageWarning || "");
  }, []);
  const refreshApplications = useCallback(
    async () => setApplications(await api<Application[]>("applications")),
    [],
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const h = await api<Health>("status");
        if (!active) return;
        setHealth(h);
        const loads: Promise<void>[] = [api<DiscoveryResponse>("discover").then(async (data) => {
          if (!active) return;
          if (!autoSearched.current) receiveDiscovery(data);
        })];
        if (h.database) {
          loads.push(
            api<Profile>("profile").then((p) => { if (active) setProfile({ ...emptyProfile, ...p }); }),
            api<Application[]>("applications").then((a) => { if (active) setApplications(a); }),
            api<{ id: string; title: string }[]>("notifications").then((n) => { if (active) setNotices(n); }),
          );
        }
        const results = await Promise.allSettled(loads);
        const failed = results.find((r) => r.status === "rejected");
        if (active && failed?.status === "rejected") setMessage(failed.reason instanceof Error ? failed.reason.message : "Some dashboard data could not be loaded.");
      } catch (e) {
        if (active) setMessage((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [receiveDiscovery]);
  useEffect(()=>{const reload=()=>{setFresh('active');setReview(true);setJobPage(1);void api<DiscoveryResponse>('discover').then(receiveDiscovery).catch(e=>setMessage(e.message));};window.addEventListener('lead-promoted',reload);return ()=>window.removeEventListener('lead-promoted',reload);},[receiveDiscovery]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
  async function task(name: string, work: () => Promise<void>) {
    setBusy(name);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function findJobs() {
    autoSearched.current = true;
    await task("discovery", async () => {
      const previous = new Set(jobs.map((job) => job.id));
      const data = await api<DiscoveryResponse>("discover", "POST");
      receiveDiscovery(data);
      const added = data.jobs.filter((job) => !previous.has(job.id)).length;
      setMessage(
        data.failures?.length
          ? data.failures.join(" · ")
          : `Search checked: ${data.jobs.length} available openings checked across the last 30 days and active public boards. ${added ? `${added} added since the previous check.` : "No new listings since the previous check."}${data.persisted ? "" : " Connect MongoDB to save jobs."}`,
      );
      if (health?.database && data.persisted) setNotices(await api("notifications"));
    });
  }
  async function save(job: Job) {
    await task(job.id, async () => {
      await api("applications", "POST", { jobId: job.id });
      await refreshApplications();
      setMessage("Job saved to your applications.");
    });
  }
  function openBuilder(job: Job, application?: Application) {
    setBuilderJob({ ...job, applicationId: application?.id, draftId: application?.cvDraftId });
    setSelected(undefined); setViewApp(undefined); setTab("CV Builder");
  }
  const builderJobs = useMemo(() => [
    ...applications.map((a) => ({ ...a.job, applicationId: a.id, draftId: a.cvDraftId })),
    ...jobs.filter((j) => !applications.some((a) => a.job.id === j.id)),
  ], [applications, jobs]);
  const profileJobs=useMemo(()=>jobs.map(raw=>{const job={...raw,title:plainText(raw.title),company:plainText(raw.company),description:plainText(raw.description),source:plainText(raw.source)};const stack=assessStackFit(job.title,job.description,profile),profileLevel=inferExperience(profile.experience+' '+profile.roles),seniorMismatch=(job.experienceLevel||inferExperience(job.title))==='Senior'&&profileLevel&&profileLevel!=='Senior';return {...job,...stack,seniorityMismatch:!!seniorMismatch,score:Math.min(job.score,stack.stackFit==='incompatible'?20:100,seniorMismatch?59:100)};}),[jobs,profile]);
  const activeJobs=profileJobs.filter(j=>jobAvailable(j,now));
  const filtered = useMemo(
    () =>
      sortJobResults(profileJobs.filter(
        (j) =>
          matchesKeywords(j,query) &&
          jobAvailable(j,now) && j.eligibility !== "restricted" &&
          (includeOtherStacks || opportunityView === 'saved' || j.stackFit !== 'incompatible') &&
          (review || j.eligibility === "eligible") &&
          (jobType === 'all' || j.jobType === jobType) &&
          (level === 'all' || j.experienceLevel === level) &&
          (opportunityView === 'all' || (opportunityView === 'strong' && j.score >= 65) || (opportunityView === 'new' && recentPosting(j.postedAt,now,1)) || (opportunityView === 'eligible' && j.eligibility === 'eligible') || (opportunityView === 'review' && j.eligibility === 'review') || (opportunityView === 'saved' && applications.some(a=>a.job.id===j.id))) &&
          matchesRole(j,category) &&
          (fresh === "active" ? activeBoardPosting(j, now) : fresh === "available" ? (recentPosting(j.postedAt,now,30) || activeBoardPosting(j,now)) : recentPosting(j.postedAt, now, Number(fresh))),
      ),sort),
    [profileJobs, query, category, review, fresh, now, jobType, level, opportunityView, applications, includeOtherStacks, sort],
  );
  const activeOlderCount = jobs.filter(j => activeBoardPosting(j, now) && !recentPosting(j.postedAt, now)).length;
  const totalJobPages = Math.max(1, Math.ceil(filtered.length / 24));
  const currentJobPage = Math.min(jobPage, totalJobPages);
  const visibleJobs = filtered.slice((currentJobPage - 1) * 24, currentJobPage * 24);
  const currentOpportunities=profileJobs.filter(j=>j.stackFit !== 'incompatible' && jobAvailable(j,now) && j.eligibility !== 'restricted' && (recentPosting(j.postedAt,now,30)||activeBoardPosting(j,now)));
  const freshCount=currentOpportunities.filter(j=>recentPosting(j.postedAt,now,7)).length;
  const strongCount=currentOpportunities.filter(j=>j.score>=65).length;
  function showStatJobs(kind:'strong'|'fresh') {
    setQuery('');setCategory('All opportunities');setJobType('all');setLevel('all');setReview(true);setIncludeOtherStacks(false);setJobPage(1);
    setOpportunityView(kind==='strong'?'strong':'all');setFresh(kind==='strong'?'available':'7');
    requestAnimationFrame(()=>{const results=document.getElementById('job-results');results?.scrollIntoView({behavior:'smooth',block:'start'});results?.focus({preventScroll:true});});
  }
  const reviewCount = jobs.filter((j) => (fresh === "active" ? activeBoardPosting(j, now) : fresh === "available" ? (recentPosting(j.postedAt,now,30)||activeBoardPosting(j,now)) : recentPosting(j.postedAt, now,Number(fresh))) && jobAvailable(j,now) && j.eligibility === "review").length;
  const sourcesUnavailable = sourceReports.length > 0 && sourceReports.filter(s => s.status !== "not_configured").every((s) => s.status === "error");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Zap size={22} fill="currentColor" />
          </span>
          launchpad<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">YOUR PERSONAL WORKSPACE</div>
        <nav>
          {[
            { name: "Job Finder", icon: Search },
            { name: "Applications", icon: BriefcaseBusiness },
            { name: "CV Builder", icon: FileText },
            { name: "My Profile", icon: UserRound },
            { name: "Coding Bounties", icon: Code2 },
            { name: "YouTube Research", icon: Clapperboard },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              title={name}
              className={`nav-item ${tab === name ? "active" : ""}`}
              onClick={() => setTab(name)}
            >
              <Icon size={19} />
              {name}
              {name === "Applications" && applications.length > 0 && (
                <span className="nav-count">{applications.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private">
            <ShieldCheck size={16} />
            Private. Personal. Yours.
          </div>
          <button className="account" onClick={() => setTab("My Profile")}>
            <span className="avatar">
              {profile.name ? profile.name.slice(0, 2).toUpperCase() : "ME"}
            </span>
            <span>
              <b>{profile.name || "Your workspace"}</b>
              <small>Personal account</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{tab}</strong>
          </div>
          <div className="header-actions">
            <span className="local-time">
              <span className="status-dot" />
              Built for your next move
            </span>
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => setShowNotices(!showNotices)}
            >
              <Bell size={19} />
              {notices.length > 0 && <i />}
            </button>
            {health?.protected && (
              <button
                className="icon-button"
                aria-label="Sign out"
                disabled={busy === "logout"}
                onClick={() =>
                  void task("logout", async () => {
                    await api("auth/logout", "POST");
                    window.location.replace(
                      new URL("/login", window.location.origin).href,
                    );
                  })
                }
              >
                <LogOut size={18} />
              </button>
            )}
            <button
              className="avatar small"
              aria-label="Open profile"
              onClick={() => setTab("My Profile")}
            >
              {profile.name ? profile.name.slice(0, 2).toUpperCase() : "ME"}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CAREER, IN MOTION</div>
              <h1>
                {tab === "Job Finder"
                  ? "Find your next opportunity."
                  : tab === "Applications"
                    ? "Every application. One place."
                    : tab === "Coding Bounties" ? "Turn your skills into paid contributions."
                    : tab === "YouTube Research" ? "Research. Create. Plan your next video."
                    : tab === "CV Builder" ? "Your experience. Tailored to the role." : "Let your experience shine."}
              </h1>
              <p>
                {tab === "Job Finder"
                  ? "Remote-only roles from employers worldwide. Find your next move early."
                  : tab === "Applications"
                    ? "Keep your momentum, from the first save to the final offer."
                    : tab === "Coding Bounties" ? "Find real tasks, verify funding and track your work and receipts."
                    : tab === "YouTube Research" ? "Original concepts and content planning, supported by official YouTube data."
                    : tab === "CV Builder" ? "Build, edit and download a CV for any job description." : "Your real skills and experience power every match and application."}
              </p>
            </div>
            {tab === "Job Finder" && (
              <button className="primary" disabled={!!busy} onClick={findJobs}>
                <RefreshCw
                  size={16}
                  className={busy === "discovery" ? "spin" : ""}
                />
                {busy === "discovery"
                  ? "Finding opportunities…"
                  : "Find new jobs"}
              </button>
            )}
          </div>
          {message && (
            <div className="notice" role="status">
              <CircleHelp size={17} />
              <span>{message}</span>
              <button aria-label="Dismiss" onClick={() => setMessage("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {health && !health.database && (
            <div className="setup-banner">
              <div>
                <b>Make this workspace yours</b>
                <span>
                  {" "}
                  Connect MongoDB to save your profile, applications, and
                  notifications. Live discovery is available now.
                </span>
              </div>
              <button onClick={() => setTab("My Profile")}>
                Setup details <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          {tab === "Coding Bounties" && <BountyWorkspace openProfile={() => setTab("My Profile")} />}
          {tab === "YouTube Research" && <YoutubeWorkspace />}
          {tab === "Job Finder" && (
            <>
              <section className="stats-grid">
                <Stat
                  label="Location-supported jobs"
                  value={
                    activeJobs.filter((j) => j.eligibility === "eligible").length
                  }
                  hint="Worldwide employers · location checked"
                  icon={<BriefcaseBusiness size={19} />}
                />
                <Stat
                  label="Fresh this week"
                  value={freshCount}
                  hint="Posted in the last 7 days"
                  onClick={()=>showStatJobs('fresh')}
                  pressed={fresh==='7' && opportunityView==='all'}
                  icon={<Zap size={19} />}
                />
                <Stat
                  label="Strong matches"
                  value={strongCount}
                  onClick={()=>showStatJobs('strong')}
                  pressed={opportunityView==='strong'}
                  hint={
                    profile.skills
                      ? "Based on your saved skills"
                      : "Add your skills to see matches"
                  }
                  icon={<Sparkles size={19} />}
                />
                <Stat
                  label="Applications in motion"
                  value={
                    applications.filter(
                      (a) => !["Saved", "Rejected", "Offer"].includes(a.status),
                    ).length
                  }
                  hint="Your next step is waiting"
                  icon={<ArrowUpRight size={19} />}
                />
              </section>
              <section className="discovery-note">
                <div className="discovery-orb">
                  <Globe2 size={22} />
                </div>
                <div>
                  <b>A wider search. A clearer path.</b>
                  <p>
                    Discover fully remote development and cybersecurity roles
                    worldwide. Applicant-location restrictions still apply.
                  </p>
                </div>
                <span className="pill">
                  <span className="status-dot" />
                  {health?.scheduler
                    ? "Schedule configured"
                    : "On-demand discovery"}
                </span>
              </section>
              <div className="section-title">
                <div>
                  <h2 id="job-results" tabIndex={-1}>
                    Your opportunities <span>{filtered.length}</span>
                  </h2>
                  <p>
                    {checked
                      ? `Last checked ${new Date(checked).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" })} WAT`
                      : "Real listings only. No sample jobs."}
                  </p>
                </div>
                <span className="source-label">
                  {sourceReports.length ? `${sourceReports.filter(s => s.status === "ok" || s.status === "partial").length} sources checked` : `${jobPlatforms.filter(p => p.access !== "manual").length} search connectors`} <ExternalLink size={13} />
                </span>
              </div>
              <p className="result-summary">{jobs.length} loaded · {activeJobs.length} active · {activeJobs.filter(j=>j.eligibility==='eligible').length} location-supported · {activeJobs.filter(j=>j.eligibility==='review').length} need location review · {filtered.length} match your filters</p>
              <details className="count-definitions"><summary>What these counts mean</summary><p>Loaded means retained discovery results. Active excludes known closed or expired vacancies. Location-supported and location-review counts cover active listings. Location-supported means explicit Nigeria, worldwide or Africa coverage. A job may be active without matching your stack or filters; unknown eligibility stays available for review. Strong matches are profile scores of at least 65/100, not hiring probabilities. Fresh means posted within seven days.</p></details>
              <div className="filter-bar">
                <div className="search-input">
                  <Search size={17} />
                  <input
                    aria-label="Search jobs"
                    placeholder="Search titles, companies, or skills…"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setJobPage(1); }}
                  />
                </div>
                <select
                  aria-label="Posting age"
                  value={fresh}
                  onChange={(e) => { setFresh(e.target.value); setJobPage(1); }}
                >
                  <option value="available">All available postings</option>
                  <option value="3">Last 72 hours</option>
                  <option value="1">Last 24 hours</option>
                  <option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option>
                  <option value="active">Active public boards</option>
                </select>
                <label>Role type<select aria-label="Role type" value={category} onChange={e=>{setCategory(e.target.value);setJobPage(1);}}>{['All opportunities','Development','Frontend','Backend','Full-stack','Software engineering','Cybersecurity'].map(role=><option key={role}>{role}</option>)}</select></label>
                <label>Sort<select aria-label="Sort jobs" value={sort} onChange={e=>{setSort(e.target.value);setJobPage(1);}}><option value="best">Best Match</option><option value="newest">Newest</option><option value="company">Company</option><option value="experience">Experience Level</option></select></label>
                <label>Job type<select aria-label="Job type" value={jobType} onChange={e=>{setJobType(e.target.value);setJobPage(1);}}><option value="all">All job types</option>{jobTypes.map(t=><option key={t}>{t}</option>)}</select></label>
                <label>Experience level<select aria-label="Experience level" value={level} onChange={e=>{setLevel(e.target.value);setJobPage(1);}}><option value="all">All levels</option>{experienceLevels.map(t=><option key={t}>{t}</option>)}</select></label>
                <label>View<select aria-label="Opportunity view" value={opportunityView} onChange={e=>{setOpportunityView(e.target.value);setJobPage(1);}}><option value="all">All relevant jobs</option><option value="strong">Strong matches</option><option value="new">Newly posted</option><option value="eligible">Nigeria / Africa / worldwide eligible</option><option value="review">Eligibility needs checking</option><option value="saved">Saved jobs</option></select></label>
                <label className="review-toggle"><input type="checkbox" checked={includeOtherStacks} onChange={e=>{setIncludeOtherStacks(e.target.checked);setJobPage(1);}}/>Include jobs outside my stack</label>
                <label className="review-toggle">
                  <input
                    type="checkbox"
                    checked={review}
                    onChange={(e) => { setReview(e.target.checked); setJobPage(1); }}
                  />
                  Include location review{reviewCount ? ` (${reviewCount})` : ""}
                </label>
              </div>
              <SavedJobSearches filters={filters} connected={!!health?.database} onRun={async f=>{applyFilters(f);await findJobs();}} />
              <div className="module-actions"><button className="secondary" onClick={()=>{document.getElementById("manual-intake-panel")?.setAttribute("open","");window.dispatchEvent(new CustomEvent("open-social-inbox",{detail:{platform:"Manual job"}}));document.getElementById("manual-intake-panel")?.scrollIntoView({behavior:"smooth"});}}>Add job for review</button><button className="secondary" onClick={()=>setTab('Applications')}>Application history</button><button className="secondary" onClick={()=>{document.getElementById('manual-intake-panel')?.setAttribute('open','');document.getElementById('social-inbox')?.scrollIntoView();window.dispatchEvent(new Event('open-social-inbox'));}}>Social opportunities awaiting verification</button></div>
              <div className="category-tabs">
                {["All opportunities", "Development", "Cybersecurity"].map(
                  (c) => (
                    <button
                      key={c}
                      onClick={() => { setCategory(c); setJobPage(1); }}
                      className={category === c ? "selected" : ""}
                    >
                      {c}
                    </button>
                  ),
                )}
                <span>
                  <LayoutGrid size={16} />
                  {sort==='best'?'Best match first':sort==='newest'?'Newest first':sort==='company'?'Company name':'Experience level'}
                </span>
              </div>
              {!review && reviewCount > 0 && <div className="notice">
                <CircleHelp size={17} /><span>{reviewCount} remote {reviewCount === 1 ? "opening needs" : "openings need"} applicant-location confirmation and {reviewCount === 1 ? "is" : "are"} hidden. These are unverified candidates.</span>
                <button className="secondary" onClick={() => setReview(true)}>Review location requirements</button>
              </div>}
              {fresh !== "active" && activeOlderCount > 0 && <div className="notice">
                <CircleHelp size={17} /><span>{activeOlderCount} active employer listings have older or unavailable posting dates.</span>
                <button className="secondary" onClick={() => { setFresh("active"); setJobPage(1); }}>View active public board jobs</button>
              </div>}
              {fresh === "active" && <p className="notice">Public board listings checked within 24 hours. Some have older or unavailable posting dates; these are not labeled as new. Confirm applicant restrictions on the original posting.</p>}
              {filtered.length > 24 && <nav aria-label="Job result pages" className="module-actions">
                <button className="secondary" disabled={currentJobPage <= 1} onClick={() => setJobPage(currentJobPage - 1)}>Previous jobs</button>
                <span>Page {currentJobPage} of {totalJobPages} · {filtered.length} opportunities</span>
                <button className="secondary" disabled={currentJobPage >= totalJobPages} onClick={() => setJobPage(currentJobPage + 1)}>Next jobs</button>
              </nav>}
              {filtered.length ? (
                <div className="job-grid">
                  {visibleJobs.map((job) => (
                    <article className="job-card" key={job.id}>
                      <div className="job-top">
                        <span
                          className={`company-logo tone-${job.company.length % 4}`}
                        >
                          {job.company.slice(0, 1)}
                        </span>
                        <div className="company-name">
                          {job.company}
                          <small>{job.source}</small>
                        </div>
                      </div>
                      <button
                        className="job-title"
                        onClick={() => setSelected(job)}
                      >
                        {job.title}
                      </button>
                      <div className="job-location">
                        <MapPin size={14} />
                        {job.location || "Location not specified"}
                      </div>
                      <p>{eligibilityLabels[job.eligibilityClass || (job.eligibility==='eligible'?'worldwide':'review')]}</p>

                      {job.seniorityMismatch && <p className="location-warning">Seniority exceeds your stated level. Review the experience requirement.</p>}
                      {job.stackFit==='incompatible' && <p className="location-warning">Outside your saved stack · {job.stackReason}</p>}
                      {job.matchedSkills.length>0 && <p>Matching skills: {job.matchedSkills.slice(0,4).join(', ')}</p>}

                      <div className="job-tags">
                        <span>{job.jobType || "Type not supplied"}</span><span>{job.experienceLevel || "Level not supplied"}</span>
                        <span>
                          <Globe2 size={12} />
                          Remote
                        </span>
                        <span>
                          {/security|soc/i.test(job.title)
                            ? "Cybersecurity"
                            : "Development"}
                        </span>
                        {now - Date.parse(job.postedAt) < 72 * 3600000 && (
                          <span className="new-tag">New</span>
                        )}
                      </div>
                      <p className="job-excerpt">
                        {job.description.slice(0, 165)}…
                      </p>
                      <div className="salary">
                        {job.salary || "Salary not disclosed"}
                      </div>
                      <div className="job-card-bottom">
                        <span
                          className={job.score >= 65 ? "match strong" : "match"}
                        >
                          <Sparkles size={13} />
                          {profile.skills
                            ? `${job.score}/100 profile match`
                            : "Add skills to match"}
                        </span>
                        <span>
                          <Clock3 size={12} />
                          {job.postedAt ? ago(job.postedAt, now) : "Posting date unavailable"}
                        </span>
                      </div>
                      <details className="card-match"><summary>Why this match?</summary><p>Profile similarity, not a hiring probability.</p>{job.matchReasons?.map(reason=><p key={reason}>{reason}</p>) || <p>Save your qualifications in My Profile to compare this vacancy.</p>}</details>
                      <div className="job-card-actions">
                      <button className="secondary" aria-label={`Save ${job.title}`} disabled={!!busy||!health?.database} onClick={()=>save(job)}><Bookmark size={15}/>{applications.some(a=>a.job.id===job.id)?'Saved':'Save Job'}</button>
                      <button
                        className="secondary"
                        onClick={() => setSelected(job)}
                      >
                        View Details <ArrowUpRight size={15} />
                      </button>
                      <a className="primary" href={job.url} target="_blank" rel="noopener noreferrer">Apply <ExternalLink size={14}/></a></div>
                      {job.eligibility === "review" && (
                        <small className="location-warning">
                          Applicant location needs review
                        </small>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">
                    <Search size={29} />
                  </div>
                  <h3>
                    {busy === "discovery" ? "Searching live job sources…" : sourcesUnavailable && !jobs.length ? "Job sources could not be reached" : jobs.length
                      ? "No opportunities match these filters"
                      : checked ? "No matching jobs in this search" : "Your next opportunity is out there."}
                  </h3>
                  <p>
                    {busy === "discovery" ? "Checking new remote openings and applicant-location requirements." : sourcesUnavailable && !jobs.length ? "The search failed. Source errors are shown in Search activity above; retry when the sources are available." : jobs.length
                      ? "Try a wider date range or include jobs that need a location review."
                      : checked ? "The checked feeds did not return a current role that passed your filters. See Search activity for the counts; a missing AI key does not block discovery." : "Search real job boards for fresh remote roles. Your results will appear here—no made-up listings, ever."}
                  </p>
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={findJobs}
                  >
                    <Search size={16} />
                    Discover opportunities
                  </button>
                  <div className="empty-sources">
                    <Globe2 size={14} /> Remotive <span>·</span> Arbeitnow{" "}
                    <span>·</span> Remote OK <span>·</span> Himalayas <span>·</span> We Work Remotely
                  </div>
                </div>
              )}
              <footer>
                <ShieldCheck size={14} />
                Your career data stays in your private workspace.
                <span>One step closer to your next chapter.</span>
              </footer>
              <details className="panel advanced-job-sources"><summary>Job sources and connection diagnostics</summary><JobPlatformDirectory/><SourceDirectory/><DiscoveryReport sources={sourceReports} storageWarning={storageWarning}/><WorkspaceOverview jobs={jobs.length} navigate={setTab}/></details>
              <details className="panel" id="manual-intake-panel"><summary>Paste a job, social post or alert for review</summary><SocialIntake connected={!!health?.database}/></details>
            </>
          )}
          <div hidden={tab !== "CV Builder"}>
            <CvBuilder active={tab === "CV Builder"} connected={!!health?.database} ai={!!health?.ai} aiLabel={health?.aiLabel} jobs={builderJobs} initialJob={builderJob} onProfile={() => setTab("My Profile")} onAttached={refreshApplications} onTrack={()=>setTab("Applications")} />
          </div>
          {tab === "My Profile" && (
            <div className="profile-layout">
              <form
                className="panel profile-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void task("profile", async () => {
                    setProfile(await api<Profile>("profile", "PUT", profile));
                    setMessage(
                      "Profile saved. Refresh discovery to update your match scores.",
                    );
                  });
                }}
              >
                <div className="panel-heading">
                  <UserRound size={20} />
                  <div>
                    <h2>Your professional story</h2>
                    <p>Only add qualifications you actually have.</p>
                  </div>
                </div>
                <div className="form-grid">
                  {(
                    [
                      "name",
                      "email",
                      "phone",
                      "location",
                      "github",
                      "linkedin",
                      "portfolio",
                    ] as const
                  ).map((key) => (
                    <label key={key}>
                      {
                        {
                          name: "Full name",
                          email: "Email address",
                          phone: "Phone number",
                          location: "Based in",
                          github: "GitHub URL",
                          linkedin: "LinkedIn URL",
                          portfolio: "Portfolio URL",
                        }[key]
                      }
                      <input
                        required={key === "name" || key === "email"}
                        type={
                          key === "email"
                            ? "email"
                            : ["github", "linkedin", "portfolio"].includes(key)
                              ? "url"
                              : "text"
                        }
                        value={profile[key]}
                        onChange={(e) =>
                          setProfile({ ...profile, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>
                {(
                  [
                    "skills",
                    "experience",
                    "education",
                    "projects",
                    "roles",
                    "preferences",
                    "cvText",
                  ] as const
                ).map((key) => (
                  <label key={key}>
                    {
                      {
                        skills: "Skills (comma separated)",
                        experience: "Experience",
                        education: "Education",
                        projects: "Projects",
                        roles: "Preferred roles",
                        preferences: "Application preferences",
                        cvText: "Existing CV text · review extracted content",
                      }[key]
                    }
                    <textarea
                      rows={key === "cvText" ? 7 : 3}
                      value={profile[key]}
                      onChange={(e) =>
                        setProfile({ ...profile, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <button
                  className="primary"
                  disabled={!!busy || !health?.database}
                >
                  <Check size={16} />
                  Save profile
                </button>
              </form>
              <div className="profile-side">
                <CvUpload
                  disabled={!!busy}
                  cvText={profile.cvText}
                  onBusyChange={(uploading) =>
                    setBusy(uploading ? "upload" : "")
                  }
                  onImport={(result) => {
                    setProfile((p) => ({ ...p, ...missingProfileFields(p, result.fields || {}), cvText: result.text }));
                    setMessage(
                      result.persisted
                        ? "CV imported and saved. Review your profile details, save any edits, then build a tailored CV in CV Builder."
                        : result.warning ||
                            "CV imported, but not saved yet. Connect storage before leaving this page.",
                    );
                  }}
                />
                <section className="panel">
                  <h3>
                    <Settings2 size={18} />
                    Connections
                  </h3>
                  <Connection
                    name="MongoDB storage"
                    connected={!!health?.database}
                  />
                  <Connection
                    name={health?.ai ? `${health.aiLabel || "AI"} résumé assistant` : "AI résumé assistant"}
                    connected={!!health?.ai}
                  />
                  <Connection
                    name="Scheduler credential"
                    connected={!!health?.scheduler}
                  />
                  <Connection
                    name="Password protection"
                    connected={!!health?.protected}
                  />
                  <p>
                    On Vercel, set <code>MONGODB_URI</code> to your MongoDB
                    Atlas connection string in Project Settings → Environment
                    Variables, then redeploy. For local development, use{" "}
                    <code>.env.local</code>. Never enter credentials in this
                    form.
                  </p>
                  <p>
                    Choose <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google Gemini</a> or <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI</a> for CV and cover-letter writing.
                    Create a key in your provider account, add <code>GEMINI_API_KEY</code> or <code>OPENAI_API_KEY</code> in Vercel → Project Settings → Environment Variables for Production, then redeploy.
                    Keys stay on the server. Do not paste them into this page or chat.
                  </p>
                  <p>
                    With just a Gemini key, provider selection is automatic. To choose Gemini when both keys exist, set <code>AI_PROVIDER=gemini</code>. With <code>GEMINI_MODEL=auto</code>, temporary overloads can recover using another Gemini model. Saved CVs record the models used. An explicit <code>GEMINI_MODEL</code> pins that model and disables alternate-model recovery. Provider quotas, billing and data-use terms apply. A ChatGPT or Gemini app subscription does not supply an API key.
                  </p>
                  {health?.aiConfigurationError && <p role="alert">{health.aiConfigurationError}</p>}
                  <button className="secondary" type="button" disabled={!!busy || !health?.ai} onClick={() => void task("ai-check", async () => {
                    setAiCheck("");
                    try {
                      const result = await api<{ message: string }>("ai/check", "POST");
                      setAiCheck(result.message);
                    } catch (error) { setAiCheck((error as Error).message); }
                  })}>
                    {busy === "ai-check" ? "Checking AI…" : "Test AI connection"}
                  </button>
                  {aiCheck && <p role="status">{aiCheck}</p>}
                  <p>
                    When you use AI, CV text and relevant job descriptions are sent to your selected provider. Review its data-use terms before sending personal information, and check every imported field and tailored document.
                    “Configured” means a setting exists; use the test button to verify AI access.
                  </p>
                  <p>
                    Scheduling requires deploying the cron configuration or
                    installing the documented system cron. A credential alone
                    does not start a schedule.
                  </p>
                </section>
                <section className="honesty-card">
                  <ShieldCheck size={22} />
                  <h3>Your experience. Your words.</h3>
                  <p>
                    AI drafts use your saved qualifications and check the rewritten claims. Review the wording before applying.
                  </p>
                </section>
              </div>
            </div>
          )}
          {tab === "Applications" && (
            <>
              <div className="pipeline">
                {statuses.map((status) => (
                  <div key={status}>
                    <b>
                      {applications.filter((a) => a.status === status).length}
                    </b>
                    <span>{applicationStatusLabel(status)}</span>
                  </div>
                ))}
              </div>
              {applications.length ? (
                <div className="application-list">
                  {applications.map((app) => (
                    <article className="panel application" key={app.id}>
                      <div className="application-heading">
                        <span className="company-logo">
                          {app.job.company[0]}
                        </span>
                        <div>
                          <h3>{app.job.title}</h3>
                          <p>
                            {app.job.company} · Saved{" "}
                            {new Date(app.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <select
                          aria-label={`Status for ${app.job.title}`}
                          value={app.status}
                          disabled={!!busy}
                          onChange={(e) => {
                            const status = e.target.value;
                            if (
                              status === "Submitted" &&
                              !window.confirm(
                                "Have you submitted this application on the employer’s website? This only updates your tracker.",
                              )
                            )
                              return;
                            void task(app.id, async () => {
                              await api("applications", "PATCH", {
                                id: app.id,
                                status,
                                submissionConfirmed:status==='Submitted',
                              });
                              await refreshApplications();
                            });
                          }}
                        >
                          {statuses.map((s) => (
                            <option key={s} value={s}>{applicationStatusLabel(s)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="application-actions">
                        <a
                          className="secondary"
                          href={app.job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Original posting <ExternalLink size={14} />
                        </a>
                        <button
                          className="secondary"
                          disabled={!!busy}
                          onClick={() => openBuilder(app.job, app)}
                        >
                          <Sparkles size={14} />
                          {app.cvDraftId ? "Open CV builder" : "Build tailored CV"}
                        </button>
                        {(app.cvFacts || app.cvDraftId) && (
                          <>
                            <a
                              className="secondary"
                              href={`/api/documents/${app.id}`}
                            >
                              <Download size={14} />
                              Tailored PDF
                            </a>
                            <button
                              className="secondary"
                              onClick={() => setViewApp(app)}
                            >
                              Review package <ArrowUpRight size={14} />
                            </button>
                          </>
                        )}
                      </div>
                      <label className="follow-up">
                        Follow-up notes
                        <textarea
                          rows={2}
                          defaultValue={app.followUp}
                          placeholder="Next steps, interview dates, or questions to follow up…"
                          onBlur={(e) => {
                            if (e.target.value !== app.followUp)
                              void task(app.id, async () => {
                                await api("applications", "PATCH", {
                                  id: app.id,
                                  followUp: e.target.value,
                                });
                                await refreshApplications();
                              });
                          }}
                        />
                      </label>
                      <p className="application-package-info">CV version: {app.cvDraftId ? app.cvDraftId.slice(0,8) : 'Not prepared'} · Cover letter: {app.coverLetter ? 'Saved' : 'Not prepared'}{app.submittedAt?' · Submitted documents preserved':''}</p>
                      {app.followUpDate && <p className="follow-up-reminder" role="note">{app.followUpDate<=new Date(now).toLocaleDateString('en-CA')?'Follow-up due':'Follow-up planned'}: {app.followUpDate}</p>}
                      <details className="application-tracking"><summary>Application dates, notes and interview details</summary><div className="form-grid">{(['applicationDate','followUpDate'] as const).map(key=><label key={key}>{key==='applicationDate'?'Application date':'Follow-up date'}<input type="date" aria-label={`${key==='applicationDate'?'Application date':'Follow-up date'} for ${app.job.title}`} defaultValue={app[key]||''} disabled={!!busy} onBlur={e=>{if(e.target.value!==(app[key]||''))void task(app.id,async()=>{await api('applications','PATCH',{id:app.id,[key]:e.target.value});await refreshApplications();});}}/></label>)}</div>{(['notes','interviewInfo'] as const).map(key=><label key={key}>{key==='notes'?'Personal notes':'Interview information'}<textarea rows={3} maxLength={key==='notes'?8000:4000} aria-label={`${key==='notes'?'Personal notes':'Interview information'} for ${app.job.title}`} defaultValue={app[key]||''} disabled={!!busy} onBlur={e=>{if(e.target.value!==(app[key]||''))void task(app.id,async()=>{await api('applications','PATCH',{id:app.id,[key]:e.target.value});await refreshApplications();});}}/></label>)}<p>Dates are your own records. Setting an application date does not mark it submitted. Follow-up dates appear here as reminders.</p></details>
                      {app.submittedAt && (
                        <small>
                          Marked submitted{" "}
                          {new Date(app.submittedAt).toLocaleString()}
                        </small>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">
                    <Bookmark size={29} />
                  </div>
                  <h3>A little organization. A lot of momentum.</h3>
                  <p>
                    Save a job from the finder to start tracking it. Prepare
                    your CV, review your application, and keep every next step
                    here.
                  </p>
                  <button
                    className="primary"
                    onClick={() => setTab("Job Finder")}
                  >
                    Explore opportunities <ArrowUpRight size={16} />
                  </button>
                </div>
              )}
              <div className="disclaimer">
                <ShieldCheck size={17} />
                Applications open on the employer’s website for your review and
                submission. Automatic form filling is not enabled; no
                application is submitted by this app.
              </div>
            </>
          )}
        </main>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(undefined)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Job details"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close job details"
              onClick={() => setSelected(undefined)}
            >
              <X />
            </button>
            <span className="eyebrow">
              {selected.source} · {selected.postedAt ? ago(selected.postedAt, now) : "Posting date unavailable"}
            </span>
            <h2>{selected.title}</h2>
            <p>
              {selected.company} · {selected.location}
            </p>
            <div className="eligibility-note">
              <ShieldCheck size={17} />
              {selected.eligibilityReason}
            </div>
            <p><b>{selected.salary || "Salary not disclosed"}</b></p>
              <details><summary>Why this job matches</summary><p>Match scores compare profile evidence with the posting; they are not hiring probabilities.</p>{selected.matchReasons?.map(reason=><p key={reason}>{reason}</p>)}</details>
            <h3>Requirements & role description</h3>
            <p className="description">{selected.description}</p>
            {selected.matchedSkills.length > 0 && (
              <p>Matching skills: {selected.matchedSkills.join(", ")}</p>
            )}
            <div className="modal-actions">
              <button className="primary" onClick={() => openBuilder(selected)}><FileText size={16} /> Build tailored CV</button>
              <button
                className="secondary"
                disabled={!!busy || !health?.database}
                onClick={() => save(selected)}
              >
                <Bookmark size={16} />
                Save to applications
              </button>
              <a
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
                className="secondary"
              >
                Verify original posting <ExternalLink size={15} />
              </a>
            </div>
            <small>
              Listings may close between checks. Always verify the employer’s
              requirements before applying. Skill match is a heuristic, not an
              eligibility guarantee.
            </small>
          </section>
        </div>
      )}
      {viewApp && (
        <div className="modal-backdrop" onClick={() => setViewApp(undefined)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Application review"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close application review"
              onClick={() => setViewApp(undefined)}
            >
              <X />
            </button>
            <span className="eyebrow">REVIEW BEFORE APPLYING</span>
            <h2>{viewApp.job.title}</h2>
            <p>
              {viewApp.preparationMethod} · Snapshot saved{" "}
              {new Date(viewApp.updatedAt).toLocaleString()}
            </p>
            <h3>{viewApp.cvDraftId ? "Saved CV version" : "CV evidence"}</h3>
            {viewApp.cvDraftId && <button className="secondary" onClick={() => openBuilder(viewApp.job, viewApp)}>Open in CV Builder</button>}
            {viewApp.cvFacts?.map((fact, i) => (
              <p className="description" key={i}>
                {fact}
              </p>
            ))}
            <h3>Cover letter draft</h3>
            <pre className="cover-letter">{viewApp.coverLetter}</pre>
            <div className="modal-actions">
              <a className="primary" href={`/api/documents/${viewApp.id}`}>
                <Download size={16} />
                Download PDF
              </a>
              <a
                className="secondary"
                href={viewApp.job.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Review & apply on employer site <ExternalLink size={15} />
              </a>
            </div>
            <p>
              Unknown answers must be supplied by you. The PDF contains only
              evidence from your saved profile.
            </p>
          </section>
        </div>
      )}
      {showNotices && (
        <div className="notification-panel">
          <div>
            <h3>Your notifications</h3>
            <button
              aria-label="Close notifications"
              className="icon-button"
              onClick={() => setShowNotices(false)}
            >
              <X size={17} />
            </button>
          </div>
          {notices.length ? (
            notices.map((n) => (
              <p key={n.id}>
                <Sparkles size={15} />
                {n.title}
              </p>
            ))
          ) : (
            <p>
              No new strong-match alerts. Add your skills and run discovery to
              get started.
            </p>
          )}
          {notices.length > 0 && (
            <button
              className="secondary"
              onClick={() =>
                void task("notifications", async () => {
                  await api("notifications", "PATCH");
                  setNotices([]);
                })
              }
            >
              Mark all as read
            </button>
          )}
        </div>
      )}
    </div>
  );
}
function Stat({label,value,hint,icon,onClick,pressed}:{label:string;value:number;hint:string;icon:React.ReactNode;onClick?:()=>void;pressed?:boolean}) {
  const content=<><div><span>{label}</span><i>{icon}</i></div><b>{value.toString().padStart(2,'0')}</b><small>{hint}</small></>;
  return onClick ? <button type="button" className="stat stat-action" aria-label={`Show ${label.toLowerCase()}`} aria-pressed={pressed} onClick={onClick}>{content}</button> : <div className="stat">{content}</div>;
}
function Connection({ name, connected }: { name: string; connected: boolean }) {
  return (
    <div className="connection">
      <span>{name}</span>
      <b className={connected ? "connected" : ""}>
        {connected ? "Configured" : "Not connected"}
      </b>
    </div>
  );
}
