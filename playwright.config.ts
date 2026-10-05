import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const browserCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter((candidate): candidate is string => Boolean(candidate));

const executablePath = browserCandidates.find((candidate) => existsSync(candidate));

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.smoke.spec.ts',
  outputDir: '../.artifacts/playwright',
  reporter: [['list']],
  timeout: 30_000,
  use: {
    headless: true,
    launchOptions: executablePath ? { executablePath } : undefined,
  },
});
