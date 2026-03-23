# PostgreSQL MCP E2E Tests (Playwright)

**Agent & Token Optimized Context**
This directory contains end-to-end (E2E) tests verifying the full server lifecycle and client integrations using Playwright.

## 🔎 Key Architecture
- **Framework**: Playwright (`@playwright/test`)
- **Domain**: Testing the MCP server over standard input/output (stdio) or HTTP/SSE transports.
- **Dependencies**: Requires a running PostgreSQL instance on `localhost` (usually spun up via Docker).

## 🚀 Commands
- **Run all E2E**: `npm run test:e2e` (Ensure PostgreSQL is running locally)
- **Run specific file**: `npx playwright test e2e/filename.test.ts`
- **UI Mode**: `npx playwright test --ui`

## 🧠 Agent Guidelines
- **Focus**: Test full feature implementations, tool routing, format of tool responses, and full server lifecycle.
- **Mocks**: Avoid mocks here. The goal is to hit a real local PostgreSQL instance to ensure SQL validity and wire correctness.
- **Security Check**: E2E tests should verify that dangerous operations are rejected at the protocol layer and that the connection behaves properly under stress.

## 🏗️ Typical File Structure
- `e2e/test-file.test.ts` - Standard Playwright test. Uses `test`, `expect`, `beforeAll`, `afterAll`.
- Client and Server setup logic usually happens in `beforeAll` using the MCP SDK.
