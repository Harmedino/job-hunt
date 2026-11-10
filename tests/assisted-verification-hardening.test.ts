import { test } from "node:test";
import assert from "node:assert/strict";
import {
  greenhouseTarget,
  confirmationTarget,
  confirmationMessage,
  employerPermissions,
  mapField,
  verifyForm,
  type AssistedPackage,
  type FormField,
} from "../src/lib/assisted-apply";
const target = greenhouseTarget(
  "https://job-boards.greenhouse.io/fictionalfixture/jobs/123",
);
const document = {
  kind: "cv" as const,
  name: "fixture.pdf",
  mime: "application/pdf",
  size: 200,
  sha256: "a".repeat(64),
  base64: "fixture",
};
const pack: AssistedPackage = {
  version: 1,
  id: "test",
  applicationId: "app",
  draftId: "cv",
  approvedAt: "2026-11-10",
  company: "Fictional fixture",
  title: "Developer",
  target,
  facts: {
    firstName: "Test",
    lastName: "Candidate",
    email: "test@example.org",
  },
  answers: [],
  files: [document],
};
function field(
  id: string,
  label: string,
  value: string,
  kind: FormField["kind"] = "text",
): FormField {
  return {
    id,
    label,
    value,
    kind,
    required: true,
    valid: true,
    disabled: false,
  };
}
function report(extra: FormField[] = []) {
  return {
    url: target.url,
    challenge: "",
    unsupported: "",
    fields: [
      field("first_name", "First Name", "Test"),
      field("last_name", "Last Name", "Candidate"),
      field("email", "Email", "test@example.org"),
      {
        ...field("resume", "Resume/CV", "", "file"),
        files: [
          {
            name: document.name,
            size: document.size,
            sha256: document.sha256,
            mime: document.mime,
          },
        ],
      },
      ...extra,
    ],
  };
}
test("manual review cannot certify an unsupported required custom control", () => {
  assert.equal(
    verifyForm(
      pack,
      report([
        field("custom", "Custom question", "Unaccepted text", "unsupported"),
      ]),
      ["custom"],
    ).ready,
    false,
  );
});
test("an aria-required checkbox must be checked even when native validity reports true", () => {
  assert.equal(
    verifyForm(
      pack,
      report([
        field("legal", "I agree to the privacy policy", "No", "checkbox"),
      ]),
      ["legal"],
    ).ready,
    false,
  );
});
test("a dropdown label without an accepted underlying option cannot pass manual review", () => {
  const select = {
    ...field("custom_select", "Custom question", "Yes", "select"),
    accepted: false,
  };
  assert.equal(verifyForm(pack, report([select]), [select.id]).ready, false);
});
test("a correct filename and hash with a conflicting file type blocks readiness", () => {
  const r = report();
  r.fields[3].files![0].mime = "text/html";
  assert.equal(verifyForm(pack, r).ready, false);
});
test("document controls must agree on their field identity and accessible label", () => {
  assert.equal(
    mapField(field("resume", "Cover letter", "", "file"), pack).file,
    undefined,
  );
});
test("duplicate identifiers and rejected native changes remain blockers", () => {
  const r = report([field("email", "Email", "wrong@example.org")]);
  assert.equal(verifyForm(pack, r, ["email"]).ready, false);
});
test("Greenhouse confirmation allows both official hosts but preserves board and vacancy identity", () => {
  for (const host of ["boards.greenhouse.io", "job-boards.greenhouse.io"])
    for (const suffix of ["", "/confirmation", "/thank-you"])
      assert.equal(
        confirmationTarget(
          `https://${host}/fictionalfixture/jobs/123${suffix}`,
          target,
        ),
        true,
      );
  for (const url of [
    "https://job-boards.greenhouse.io/fictionalfixture/jobs/124/confirmation",
    "https://boards.greenhouse.io/another/jobs/123",
    "https://job-boards.greenhouse.io/fictionalfixture/thanks",
    "https://boards.greenhouse.io.evil.example/fictionalfixture/jobs/123",
    "http://boards.greenhouse.io/fictionalfixture/jobs/123",
    "https://u:p@boards.greenhouse.io/fictionalfixture/jobs/123",
    "https://boards.greenhouse.io:444/fictionalfixture/jobs/123",
  ])
    assert.equal(confirmationTarget(url, target), false, url);
  assert.deepEqual(employerPermissions(target), [
    "https://boards.greenhouse.io/*",
    "https://job-boards.greenhouse.io/*",
  ]);
  assert.equal(
    confirmationMessage("Redirect complete. Submit application"),
    false,
  );
  assert.equal(
    confirmationMessage(
      "Thank you for applying. Your application has been received.",
    ),
    true,
  );
});
