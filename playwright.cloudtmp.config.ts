import base from "./playwright.config";
export default { ...base, testDir: "/tmp/claude-0/-home-user-garage/1ee0bda9-a28b-5830-aab1-b4935fdd3fa3/scratchpad/shots", use: { ...base.use, channel: undefined, launchOptions: { executablePath: "/opt/pw-browsers/chromium" } } };
