export interface TemplateAuthority {
  canonicalId: string;
  id: string;
  version: number;
}

export interface TemplateLifecycleAuthority extends TemplateAuthority {
  status: "draft" | "ready" | "assigned" | "archived" | "deprecated";
}

export function reconcileCreatedTemplate<T extends TemplateAuthority>(
  createdTemplate: TemplateAuthority,
  reloadedTemplates: readonly T[],
): T {
  const reloadedTemplate = reloadedTemplates.find((template) => template.id === createdTemplate.id);

  if (!reloadedTemplate) {
    throw new Error(
      `GET /admin/tests did not return newly created template ${createdTemplate.id}.`,
    );
  }

  if (reloadedTemplate.canonicalId !== createdTemplate.canonicalId) {
    throw new Error(
      `GET /admin/tests returned a different canonical ID for template ${createdTemplate.id}.`,
    );
  }

  if (reloadedTemplate.version !== createdTemplate.version) {
    throw new Error(
      `GET /admin/tests returned version ${reloadedTemplate.version} for template ${createdTemplate.id}; create returned version ${createdTemplate.version}.`,
    );
  }

  return reloadedTemplate;
}

export function reconcileUpdatedTemplate<T extends TemplateAuthority>(
  updatedTemplate: TemplateAuthority,
  reloadedTemplates: readonly T[],
  expectedPreviousVersion: number,
): T {
  if (updatedTemplate.version !== expectedPreviousVersion + 1) {
    throw new Error(
      `PATCH /admin/tests/{testId} returned version ${updatedTemplate.version}; expected ${expectedPreviousVersion + 1}.`,
    );
  }

  return reconcileCreatedTemplate(updatedTemplate, reloadedTemplates);
}

export function reconcileLifecycleTemplate<T extends TemplateLifecycleAuthority>(
  lifecycleTemplate: TemplateLifecycleAuthority,
  reloadedTemplates: readonly T[],
  expectedVersion: number,
  expectedStatus: "ready" | "archived",
): T {
  if (lifecycleTemplate.version !== expectedVersion) {
    throw new Error(
      `Template lifecycle returned version ${lifecycleTemplate.version}; expected unchanged version ${expectedVersion}.`,
    );
  }

  if (lifecycleTemplate.status !== expectedStatus) {
    throw new Error(
      `Template lifecycle returned status ${lifecycleTemplate.status}; expected ${expectedStatus}.`,
    );
  }

  const reloadedTemplate = reconcileCreatedTemplate(
    lifecycleTemplate,
    reloadedTemplates,
  );
  if (reloadedTemplate.status !== expectedStatus) {
    throw new Error(
      `GET /admin/tests returned status ${reloadedTemplate.status}; expected ${expectedStatus}.`,
    );
  }

  return reloadedTemplate;
}
