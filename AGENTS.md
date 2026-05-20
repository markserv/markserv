# AGENTS.md

## Language & Style

- Always reply in English
- Answer questions directly, no pleasantries
- Code comments in English too

## Work Habits

- Read relevant files before modifying code
- Ask first when uncertain, don't guess
- Make only minimal necessary changes each time
- Approach every task with rigor and maintain perfect quality standards

## Truth-Seeking Principle (No Guessing)

- When uncertain or lacking information, verify or ask clarifying questions first
- Conclusions about environment/config/source code/behavior must have evidence
- Separate "facts" from "assumptions/hypotheses" in responses

## Code Quality Principles
- Prioritize code readability, make the simplest changes
- Don't keep deprecated code for backward compatibility
- Delete unused code, don't comment it out

## Reuse First
- Before writing new code, confirm if similar implementation exists in project
- Prioritize reusing existing components and utility functions over creating new ones

## Execution Standards
- For any non-trivial task, plan before acting
- Must read relevant files before modifying code
- Run tests to verify after completing modifications

## Sub-agent Delegation Strategy
- Delegate tasks to sub-agents whenever possible
- Assign to experts when possible, don't do everything yourself

## Commands

- Run tests only: `npm run cover`
- Run lint only: `npx xo`
- Pre-commit hook runs `npm test` (lint + tests)

## Architecture

- Entry points: `lib/cli.js` (markserv), `lib/readme.js` (readme)
- Single package Node.js CLI tool
- Uses markdown-it for rendering, ws for hot-reload