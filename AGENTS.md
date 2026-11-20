# Commands

| Action    | Command          |
| :-------- | :--------------- |
| build     | `pnpm build`     |
| test      | `pnpm test`      |
| typecheck | `pnpm typecheck` |
| lint      | `pnpm lint`      |

# Code Conventions

- Use 2 spaces for indentation.
- Use single quotes for strings.

# Constraints

- DO NOT delete any lines from `.gitignore`.
- DO NOT modify `pnpm-lock.yaml` manually.
- DO NOT commit directly to `main`.
- Create a new branch using the format `<type>/<short-description>` (e.g., `feat/user-auth`, `fix/login-bug`).
- Write commit messages in English.
- Run `pnpm typecheck` and `pnpm lint` before finishing a task:
  - Ignore `lint` warnings (only fix errors).
  - Ignore any errors in `dowsing` or test files.
