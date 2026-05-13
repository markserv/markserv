-  **Update AGENTS.md** to specify that the current git branch is ESM-migration
-  **Replace `implant` with Modern Alternative (Long-term)**:
   - Swap `implant` for a maintained library like `ejs` or `handlebars` (already in use), or a custom solution.
   - Requires refactoring `lib/server.js` (e.g., update implantHandlers and calls).
   - Pros: Eliminates warnings and improves maintainability.
   - Cons: Significant effort; risk of breaking features.
-  **Restablish Husky hooks**
   > Husky hooks are Git hooks managed by the Husky library, used to automate tasks during Git operations (e.g., commits, pushes). In the project:

   >- **Pre-commit Hook**: Runs `npm test` before each commit, ensuring linting and tests pass to prevent broken code from being committed.
   >- **Purpose**: Enforces code quality, catches issues early, and maintains CI-like checks locally.

   >In the ESM migration, the old Husky config was removed (as Husky v8 uses `.husky/` directory for hooks). If you want to re-enable, install Husky v8 and set up hooks manually. Would you like a plan to restore pre-commit testing?
-  **Add --browser in cli-defs.js**
-  **Update linter : xo**
-  **Remove unused packages**
-  **Remove deprecated package (request -> axios)**
-  **Update obsolete packages**
-  **patch package.json** for super-split and ...
-  