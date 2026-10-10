import { chromium } from "/home/claude/subtrack/node_modules/playwright/index.mjs";
import fs from "fs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
await p.setContent(`<html><body style="margin:0;background:transparent">${fs.readFileSync("app-icon.svg","utf8")}</body></html>`);
await p.screenshot({ path: "app-icon.png", omitBackground: true });
await b.close();
