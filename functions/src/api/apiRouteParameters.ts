// A decoded Firestore document ID must stay one segment beneath the authorized resource root.
export const safeApiRouteParameters = (parameters: Readonly<Record<string, string>>): boolean =>
  Object.values(parameters).every((value) => value.length > 0 && value !== "." && value !== ".." &&
    !value.includes("/") && !value.includes("\\") &&
    ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127));
