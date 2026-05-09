import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";

const TEST_WORKSPACES = [
  {
    title: "Create Test",
    description: "Template authoring workspace for question selection, timing profiles, draft save, and publish flow.",
    to: "/admin/tests/create",
    meta: "Authoring and duplicate-check workflow",
  },
  {
    title: "Test Library",
    description: "Central library for saved templates, lifecycle review, detail drill-in, and edit-or-publish actions.",
    to: "/admin/tests/library",
    meta: "Primary template operations workspace",
  },
  {
    title: "Template Analytics",
    description: "Cross-template outcome review for effectiveness, average scores, and reusable template quality signals.",
    to: "/admin/tests/analytics",
    meta: "Analytics and performance visibility",
  },
  {
    title: "Distribution Review",
    description: "Structural review for difficulty balance, question composition, and timing-shape visibility.",
    to: "/admin/tests/distribution",
    meta: "Composition and balance checks",
  },
  {
    title: "Template Settings",
    description: "Lifecycle rules, capability ceilings, and immutable-structure guidance for templates after assignment.",
    to: "/admin/tests/settings",
    meta: "Governance and template guardrails",
  },
] as const;

function AdminTestsLandingPage() {
  return (
    <AdminWorkspaceLandingPage
      eyebrow="Tests Workspace"
      title="Dedicated Tests Landing Workspace"
      description={[
        "This route turns /admin/tests into a dedicated workspace index instead of redirecting directly into the template library.",
        "Template operations are grouped into focused destinations for authoring, library review, analytics, distribution checks, and settings guidance.",
      ]}
      stats={[
        {
          label: "Workspaces",
          value: String(TEST_WORKSPACES.length),
          detail: "Dedicated test management destinations",
        },
        {
          label: "Primary Flow",
          value: "Library",
          detail: "Most operators continue from the test library workspace",
        },
        {
          label: "Lifecycle",
          value: "Tracked",
          detail: "Create, review, publish, and lock stages stay separated",
        },
      ]}
      links={TEST_WORKSPACES.map((workspace) => ({ ...workspace }))}
    />
  );
}

export default AdminTestsLandingPage;
