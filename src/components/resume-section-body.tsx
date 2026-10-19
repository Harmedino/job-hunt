import { resumeEntries, isEntrySection } from "@/lib/resume-layout";
import type { ResumeSection } from "@/lib/resume-types";
export default function ResumeSectionBody({
  section,
  text,
}: {
  section: ResumeSection;
  text: string;
}) {
  if (!isEntrySection(section)) return <div>{text}</div>;
  return (
    <div className="resume-entries">
      {resumeEntries(text).map((entry, index) => (
        <div className="resume-entry" key={index}>
          {entry.title && <h4>{entry.title}</h4>}
          {entry.parts.map((part, i) => {
            if (part.kind !== "bullet")
              return (
                <p
                  className={
                    part.kind === "meta"
                      ? "resume-technologies"
                      : "resume-description"
                  }
                  key={i}
                >
                  {part.text}
                </p>
              );
            if (entry.parts[i - 1]?.kind === "bullet") return null;
            let end = i + 1;
            while (entry.parts[end]?.kind === "bullet") end++;
            return (
              <ul key={i}>
                {entry.parts.slice(i, end).map((bullet, n) => (
                  <li key={n}>{bullet.text}</li>
                ))}
              </ul>
            );
          })}
        </div>
      ))}
    </div>
  );
}
