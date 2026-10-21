// Playwright forces focus/visibility on its owning DevTools session. A second
// CDPSession cannot undo that override. Fail explicitly if the pinned local
// driver's bridge changes; never replace document.visibilityState in the app.
export async function openNativeForegroundTab(page) {
  const client = page._connection.toImpl(page).delegate._mainFrameSession._client;
  await client.send("Emulation.setFocusEmulationEnabled", {enabled: false});
  const {targetInfo} = await client.send("Target.getTargetInfo");
  const waiting = page.context().waitForEvent("page");
  await client.send("Target.createTarget", {url: "about:blank",
    browserContextId: targetInfo.browserContextId, newWindow: false, background: false});
  const foreground = await waiting;
  await foreground._connection.toImpl(foreground).delegate._mainFrameSession._client
    .send("Emulation.setFocusEmulationEnabled", {enabled: false});
  await foreground.bringToFront();
  return foreground;
}
