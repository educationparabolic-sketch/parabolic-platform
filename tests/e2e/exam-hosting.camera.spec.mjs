import {expect, test} from "playwright/test";

const expectedPermissionsPolicy =
  "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)";

test.use({
  permissions: ["camera"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

test("Exam Hosting allows its own camera flow while retaining the restricted policy", async ({page}) => {
  const response = await page.goto("/", {waitUntil: "domcontentloaded"});

  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toContain("text/html");
  expect(response?.headers()["permissions-policy"]).toBe(expectedPermissionsPolicy);

  const cameraResult = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    const videoTrackCount = stream.getVideoTracks().length;
    const audioTrackCount = stream.getAudioTracks().length;
    stream.getTracks().forEach((track) => track.stop());
    return {audioTrackCount, videoTrackCount};
  });

  expect(cameraResult).toEqual({audioTrackCount: 0, videoTrackCount: 1});
});
